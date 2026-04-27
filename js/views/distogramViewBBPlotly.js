/**
 * @fileoverview Histogram/distogram view (Plotly port).
 * Same behaviour as distogramViewBB.js but built on Plotly.js (basic-dist-min) instead of c3.js.
 * The class API, defaultOptions, Backbone listeners and toolbar wiring are kept identical to
 * the original so the two files can be diffed cleanly. The chart engine internals — c3.generate,
 * c3 internal API access, the redraw-shortcut hacks, the SVG <pattern> fill, and the manual
 * "make bars sit between ticks" shim — are replaced with Plotly.newPlot / Plotly.react and
 * built-in Plotly features (yaxis2, marker.pattern, plotly_click / plotly_hover events).
 */

import "../../css/distogram.css";

import $ from "jquery";
import * as _ from "underscore";
import Plotly from "plotly.js-basic-dist-min";

import {BaseFrameView} from "../ui-utils/base-frame-view";
import {attributeOptions} from "../clms-model/attribute-options";
import {
    addMultipleSelectControls,
    commonLabels,
    declutterAxis,
    makeBackboneButtons,
    niceRound,
    niceValueAxis
} from "../utils";
import {DropDownMenuViewBB} from "../ui-utils/ddMenuViewBB";
import {crosslinkerSpecificityPerLinker} from "../modelUtils";
import d3 from "d3";
import vent from "../vent";
import {linkColor} from "../backbone-models/color/setup-colors";

const SERIES_COLOURS = {
    "Crosslinks": "#44d",
    "Random": "#444",
    "Decoys (TD-DD)": "#d44",
};
const SELECTED_COLOUR = "#ff0";

/**
 * Backbone view for histogram/distogram visualization of crosslink attribute distributions.
 * Plotly-backed port of the original c3-based DistogramBB.
 * @class
 * @extends BaseFrameView
 * @property {HTMLElement} chartDivNode - Plotly-bound div
 * @property {Object} colourScaleModel - Color scale backbone-models for categorical series
 * @property {Array} currentBins - Array of current bin data for each series (for highlight/selection)
 * @property {Object} precalcedDistributions - Cache of precalculated distributions (e.g., Random)
 * @property {Object} attrExtraOptions - Extra options for specific attributes (e.g., Distance)
 * @property {number} y2Rescale - Scaling factor for secondary Y axis
 */
export class DistogramBB extends BaseFrameView {
    constructor(options) {
        super(options);
    }

    get events() {
        let parentEvents = BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "click .randomScope": "reRandom",
        });
    }

    get defaultOptions() {
        return {
            xlabel: "X Value",
            ylabel: "Count",
            y2label: "Random (absolute)",
            seriesNames: ["Crosslinks", "Decoys (TD-DD)", "Random", "Selected"],
            subSeriesNames: [],
            scaleOthersTo: {
                Random: "Crosslinks"
            },
            chartTitle: "DISTO",
            maxX: 90,
            attributeOptions: null,
            xStandardTickFormat: d3.format(","),
            randomScope: "All",
            selectedColour: SELECTED_COLOUR,
            exportKey: true,
            exportTitle: true,
            canHideToolbarArea: true,
            canTakeImage: true,
        };
    }

    /**
     * Initializes the distogram view.
     * Mirrors the original initialize(): toolbar, random-scope dropdown, max-X input, axis
     * select. Replaces the c3.generate(...) chart construction with a Plotly.newPlot call
     * that creates an empty bar chart; subsequent render() calls feed real data via Plotly.react.
     */
    initialize(viewOptions) {

        this.identifier = "Histogram View";

        super.initialize(...arguments);

        this.attrExtraOptions = {
            "Distance": {
                conditions: [{
                    includeUndefineds: true
                }, {
                    calcDecoyProteinDistances: true
                }, {
                    calcDecoyProteinDistances: true
                }], // TT, TD then DD
                showRandoms: true,
                showY2Axis: true,
                showDistMaxInput: true,
            }
        };

        this.options.attributeOptions = attributeOptions;

        this.precalcedDistributions = {
            Random: {
                data: [],
                origSize: 0
            }
        };

        const self = this;

        const mainDivSel = d3.select(this.el);

        mainDivSel.append("div")
            .attr("class", "verticalFlexContainer")
            .html("<DIV class='toolbar toolbarArea'></DIV><DIV class='panelInner distoDiv' flex-grow='1'></DIV>");
        const buttonData = [{
            class: "downloadButton",
            label: commonLabels.downloadImg + "SVG",
            type: "button",
            id: "download"
        },];
        const toolbar = mainDivSel.select("div.toolbar");
        makeBackboneButtons(toolbar, self.el.id, buttonData);

        const toggleButtonData = [{
            label: "All combinations (Between & Self)",
            id: "All",
            d3tooltip: "Calculate random links from within and between all proteins",
            value: "All"
        },
        {
            label: "Within proteins only (Self)",
            id: "Intra",
            d3tooltip: "Only calculate random links from within the same proteins",
            value: "Intra"
        },
        {
            label: "Within chains only (Self in same protein copy)",
            id: "Chain",
            d3tooltip: "Only calculate random links from within the same chain",
            value: "Chain"
        },
        ];
        toggleButtonData
            .forEach(function (d) {
                $.extend(d, {
                    inputFirst: true,
                    class: "randomScope",
                    group: "randomScope",
                    type: "radio"
                });
                if (d.initialState === undefined && d.group && d.value) {
                    d.initialState = (d.value === this.options[d.group]);
                }
            }, this);
        makeBackboneButtons(toolbar, self.el.id, toggleButtonData);

        const optid = this.el.id + "RandomOptions";
        toolbar.append("p").attr("id", optid);
        new DropDownMenuViewBB({
            el: "#" + optid,
            model: self.model.get("clmsModel"),
            myOptions: {
                title: "Random Scope ▼",
                menu: toggleButtonData.map(function (d) {
                    d.id = self.el.id + d.id;
                    d.tooltip = d.d3tooltip;
                    return d;
                }),
                closeOnClick: false,
                titleTooltip: {
                    header: "Random Scope",
                    contents: "Decide scope of random distances."
                },
                tooltipModel: self.model.get("tooltipModel"),
            }
        });

        const maxid = this.el.id + "MaxXValue";
        const maxElem = toolbar.append("p").attr("id", maxid);
        maxElem.append("span").text("Axis Extent (X)");
        maxElem.append("input").attr("type", "number").attr("class", "xAxisMax").attr("min", 40).attr("max", 500)
            .on("change", function () {
                self.getSelectedOption("X").maxVal = +d3.event.target.value;
                self.options.reRandom = true;
                self.render();
            });

        // Add a select widget for picking axis data type
        this.setMultipleSelectControls(toolbar, this.options.attributeOptions, false);

        const chartDiv = mainDivSel.select(".distoDiv")
            .attr("id", mainDivSel.attr("id") + "PlotlyChart");

        this.chartDivNode = chartDiv.node();
        // Track state previously read from c3.chart.internal — Plotly has no equivalent introspection
        this._currentXLabel = null;
        this._hiddenSeriesIds = new Set(["Crosslinks", "Decoys (TD-DD)"]); // hidden by default like the original
        this._inited = false;
        this._lastTraces = [];
        this._lastLayout = null;
        this.options.xCurrentTickFormat = this.options.xStandardTickFormat;

        function distancesAvailable() {
            this.options.reRandom = true;

            const distAttr = this.options.attributeOptions.filter(function (attr) {
                return attr.id === "Distance";
            });
            if (distAttr.length === 1) {
                const userMax = +mainDivSel.select(".xAxisMax").property("value");
                const distObj = this.model.get("distancesObj");
                if (!userMax) {
                    distAttr[0].maxVal = niceRound(distObj.maxDistance * 1.3) + 1;
                }
            }

            if (this.getSelectedOption("X").id === "Distance") {
                this.render();
            }
        }

        this.listenTo(this.model, "filteringDone", this.render);
        this.listenTo(this.model, "currentColourModelChanged", function () {
            this.render({
                noAxesRescale: true,
                recolourOnly: true
            });
        });
        this.listenTo(this.model, "change:linkColourAssignment", function () {
            this.render({
                newColourModel: true
            });
        });
        this.listenTo(this.model, "selectionMatchesLinksChanged", function () {
            this.render({
                noAxesRescale: true
            });
        });
        this.listenTo(this.model, "change:distancesObj", distancesAvailable);
        this.listenTo(vent, "PDBPermittedChainSetsUpdated changeAllowInterModelDistances", distancesAvailable);
        this.listenTo(vent, "linkMetadataUpdated", function (metaMetaData) {
            const columns = metaMetaData.columns;
            const newOptions = columns.map(function (column) {
                return {
                    id: column,
                    label: column,
                    decimalPlaces: 2,
                    matchLevel: false,
                    linkFunc: function (c) {
                        return c.getMeta() ? [c.getMeta(column)] : [];
                    },
                    unfilteredLinkFunc: function (c) {
                        return c.getMeta() ? [c.getMeta(column)] : [];
                    },
                };
            });

            self.setMultipleSelectControls(mainDivSel.select("div.toolbar"), newOptions, true);
        });

        if (this.model.get("distancesObj")) {
            distancesAvailable.call(this);
        }

        return this;
    }

    /**
     * Creates X axis dropdown control for attribute selection.
     */
    setMultipleSelectControls(elem, options, keepOld) {
        const self = this;
        addMultipleSelectControls({
            addToElem: elem,
            selectList: ["X"],
            optionList: options,
            keepOldOptions: keepOld || false,
            selectLabelFunc: function (d) {
                return "Plot This Data On The " + d + " Axis ►";
            },
            optionLabelFunc: function (d) {
                return d.label;
            },
            optionValueFunc: function (d) {
                return d.id;
            },
            changeFunc: function () {
                self.render();
            },
            idFunc: function (d) {
                return d.id;
            },
        });
        return this;
    }

    /**
     * Main render method. Plotly version: builds trace and layout objects from binned series
     * data and hands them to Plotly.newPlot (first call) or Plotly.react (subsequent calls).
     * The original's three render-paths (full / y-only rescale / colour-only) all funnel through
     * Plotly.react here — Plotly diffs the new payload against the existing graph and only
     * touches what changed, so the c3 redraw-shortcut hacks are no longer needed.
     */
    render(options) {

        options = options || {};

        if (this.isVisible()) {
            const funcMeta = this.getSelectedOption("X");
            const newX = (this._currentXLabel !== funcMeta.label);
            if (newX) {
                this.options.xCurrentTickFormat = funcMeta.valueFormat || this.options.xStandardTickFormat;
                this.options.absX = this.model.getAttributeRange(funcMeta)[1];
            }
            this._currentXLabel = funcMeta.label;
            this.handleExtraOptions();

            const TT = 0,
                TD = 1,
                DD = 2;
            const seriesData = this.getDataCount();

            // Get colour backbone-models. If chosen colour backbone-models is non-categorical, default to distance colours.
            let colModel = this.model.get("linkColourAssignment");
            if (!colModel.isCategorical()) {
                colModel = linkColor.defaultColoursBB;
            }
            this.colourScaleModel = colModel;

            // Add sub-series data — split TT list into sublists by colour-scheme category
            const labels = colModel.get("labels").range();
            const subSeries = [];
            for (let i = 0; i < labels.length; i++) {
                subSeries.push({
                    name: labels[i],
                    linkValues: [],
                    isSubSeries: true,
                });
            }
            subSeries.push({
                name: colModel.get("undefinedLabel"),
                linkValues: [],
                isSubSeries: true,
            });

            seriesData[TT].linkValues.forEach(function (linkDatum) {
                let cat = colModel.getDomainIndex(linkDatum[0]);
                if (cat === undefined) {
                    cat = subSeries.length - 1;
                }
                subSeries[cat].linkValues.push(linkDatum);
            });

            seriesData.push.apply(seriesData, subSeries);

            const removeCatchAllCategory = (funcMeta.maxVal !== undefined);
            const aggregates = this.aggregate(seriesData, this.precalcedDistributions, removeCatchAllCategory);
            const countArrays = aggregates.countArrays;
            const thresholds = aggregates.thresholds;

            // Adjust the TD count by subtracting the matching DD count, then discard the DD series
            countArrays[TD].forEach(function (v, i) {
                countArrays[TD][i] = Math.max(v - countArrays[DD][i], 0);
            });
            // remove DD (its purpose is done) and any empty sub-series
            const keep = seriesData.map(function (s, i) {
                if (s.name === "Decoys (DD)") return false;
                if ((s.name === colModel.get("undefinedLabel") || s.name === "Selected") && s.linkValues.length === 0) return false;
                return true;
            });
            const keptSeries = seriesData.filter(function (_, i) { return keep[i]; });
            const keptCounts = countArrays.filter(function (_, i) { return keep[i]; });

            const subSeriesNames = keptSeries.filter(function (s) { return s.isSubSeries; }).map(function (s) { return s.name; });
            this.options.subSeriesNames = subSeriesNames;
            const subSeriesLengths = keptSeries.filter(function (s) { return s.isSubSeries; }).map(function (s) { return s.linkValues.length; });

            // Cache bins for highlightOrSelect lookup (key by series name)
            this._binsByName = {};
            this.currentBins.forEach(function (entry) {
                this._binsByName[entry.id] = entry.bin;
            }, this);

            // Cache bin centres so optionsToString and tooltip helpers can read them
            const binCentres = thresholds.slice(0, -1);
            this._binCentres = binCentres;
            this._binWidth = thresholds.length > 1 ? (thresholds[1] - thresholds[0]) : 1;

            const traces = this.buildTraces(keptSeries, keptCounts, binCentres, colModel, options, funcMeta);
            const layout = this.buildLayout(funcMeta);

            this._lastTraces = traces;
            this._lastLayout = layout;

            if (!this._inited) {
                Plotly.newPlot(this.chartDivNode, traces, layout, {
                    responsive: true,
                    displayModeBar: false,
                    displaylogo: false,
                });
                this._wirePlotEvents();
                this._inited = true;
            } else {
                Plotly.react(this.chartDivNode, traces, layout);
            }

            // Update chart title (mirror the original's makeChartTitle call)
            const titleSel = d3.select(this.el).select(".distoChartTitle");
            if (titleSel.empty()) {
                d3.select(this.chartDivNode).insert("div", ":first-child").attr("class", "distoChartTitle");
            }
            this.makeChartTitle(subSeriesLengths, colModel, d3.select(this.el).select(".distoChartTitle"), this.getSelectedOption("X").matchLevel);
        }

        return this;
    }

    /**
     * Builds Plotly traces for all visible series.
     * Each kept series becomes one bar trace. Sub-series share offsetgroup "main" so they
     * stack into one column (replaces c3 chart.groups). "Decoys (TD-DD)" gets its own
     * offsetgroup so it sits beside (not stacked with) the sub-series — matches c3 default.
     * "Random" is bound to yaxis2.
     */
    buildTraces(keptSeries, keptCounts, binCentres, colModel, options, funcMeta) {
        const seriesColours = this.getSeriesColours(this.options.subSeriesNames);
        const fmt = this.options.xCurrentTickFormat;
        const binWidth = this._binWidth;
        // Smallest representable step for this attribute. For integer attributes
        // (decimalPlaces=0) invPow is 1; a unit-width bin then covers a single integer
        // value, so the tooltip should show that one value rather than a range.
        const decimalPlaces = (funcMeta && funcMeta.decimalPlaces) || 0;
        const invPow = Math.pow(10, -decimalPlaces);
        const traces = [];

        for (let i = 0; i < keptSeries.length; i++) {
            const series = keptSeries[i];
            const counts = keptCounts[i];
            const name = series.name;

            // Build hovertemplate title strings (range-aware), one per bin
            const customdata = binCentres.map(function (x) {
                const a = fmt(x);
                const endX = x + binWidth;
                const barIsRange = (endX - x) > invPow;
                if (!barIsRange) {
                    return a;
                }
                if (decimalPlaces === 0) {
                    // integer attribute: bin [x, x+binWidth) inclusive of integers up to endX-1
                    return a + " to " + fmt(endX - 1);
                }
                // continuous attribute: half-open range — render the upper edge as "<endX"
                return a + " to <" + fmt(endX);
            });

            let colour = SERIES_COLOURS[name];
            let pattern;
            let yaxis = "y";
            let offsetgroup = "main";

            if (series.isSubSeries) {
                colour = seriesColours[name] || colour || "#888";
            } else if (name === "Selected") {
                colour = this.options.selectedColour;
                pattern = {shape: "/", solidity: 0.5, fgcolor: "#000", bgcolor: this.options.selectedColour};
                offsetgroup = "selected"; // own offsetgroup so Selected sits beside the stacked sub-series, not under them
            } else if (name === "Decoys (TD-DD)") {
                offsetgroup = "decoys";
            } else if (name === "Random") {
                yaxis = "y2";
                offsetgroup = "random";
            }

            const trace = {
                type: "bar",
                name: name,
                x: binCentres.slice(),
                y: counts.slice(),
                customdata: customdata,
                marker: {
                    color: colour,
                    line: {width: 0},
                },
                yaxis: yaxis,
                offsetgroup: offsetgroup,
                hovertemplate: "<b>" + this.options.xlabel + " %{customdata}</b><br>" + name + " " + this.options.ylabel + ": %{y}<extra></extra>",
            };
            if (pattern) {
                trace.marker.pattern = pattern;
            }
            if (this._hiddenSeriesIds.has(name)) {
                trace.visible = "legendonly";
            }
            // If decoys are absent, hide that series in the legend (mirrors firstRun logic)
            if (name === "Decoys (TD-DD)" && !this.model.get("clmsModel").getDecoysPresent()) {
                trace.visible = "legendonly";
                this._hiddenSeriesIds.add(name);
            }
            traces.push(trace);
        }

        return traces;
    }

    /**
     * Builds the Plotly layout object.
     * yaxis2 is configured as an overlaying right-side axis for the Random series.
     * barmode "stack" plus per-trace offsetgroup gives sub-series stacking with decoys/random
     * sitting beside (not on top of) the stack — equivalent to c3's chart.groups behaviour.
     */
    buildLayout(funcMeta) {
        const fmt = this.options.xCurrentTickFormat;
        const tickvals = this._binCentres;
        const ticktext = tickvals.map(function (v) { return fmt(v); });

        return {
            title: {text: ""}, // we render our own title element in makeChartTitle
            barmode: "stack",
            bargap: 0.1,
            bargroupgap: 0,
            dragmode: false, // no drag-zoom, no drag-select — cursor stays default
            xaxis: {
                title: {text: this.options.xlabel + (funcMeta && funcMeta.label ? " (" + funcMeta.label + ")" : "")},
                tickvals: tickvals,
                ticktext: ticktext,
                tickmode: "auto",
                nticks: 12,
                automargin: true,
                fixedrange: true, // disable axis zoom on scroll / pinch
            },
            yaxis: {
                title: {text: this.options.ylabel},
                tickformat: ",d",
                automargin: true,
                rangemode: "tozero",
                fixedrange: true,
            },
            yaxis2: {
                title: {text: this.options.y2label},
                tickformat: ",d",
                overlaying: "y",
                side: "right",
                showgrid: false,
                visible: !!(this.attrExtraOptions[funcMeta.id] && this.attrExtraOptions[funcMeta.id].showY2Axis),
                rangemode: "tozero",
                fixedrange: true,
            },
            legend: {orientation: "h", y: -0.18},
            margin: {l: 56, r: 56, t: 6, b: 50},
            hovermode: "closest",
        };
    }

    /**
     * Wires Plotly's plotly_click / plotly_hover / plotly_unhover / plotly_legendclick events
     * to the existing highlightOrSelect / setMarkedCrossLinks plumbing and to the
     * _hiddenSeriesIds tracker (used for filtering bins during click/hover).
     */
    _wirePlotEvents() {
        const self = this;
        this.chartDivNode.on("plotly_click", function (ev) {
            if (!ev || !ev.points || !ev.points.length) return;
            const pt = ev.points[0];
            self.highlightOrSelect("selection", {
                name: pt.data.name,
                index: pt.pointIndex,
                originalEvent: ev.event
            });
        });
        this.chartDivNode.on("plotly_hover", function (ev) {
            if (!ev || !ev.points || !ev.points.length) return;
            const pt = ev.points[0];
            self.highlightOrSelect("highlights", {
                name: pt.data.name,
                index: pt.pointIndex,
                originalEvent: ev.event
            });
        });
        this.chartDivNode.on("plotly_unhover", function () {
            self.model.setMarkedCrossLinks("highlights", [], false, false);
        });
        this.chartDivNode.on("plotly_legendclick", function (ev) {
            if (!ev || ev.curveNumber === undefined) return true;
            const trace = self.chartDivNode.data[ev.curveNumber];
            if (trace && trace.name) {
                if (trace.visible === "legendonly") {
                    self._hiddenSeriesIds.delete(trace.name);
                } else {
                    self._hiddenSeriesIds.add(trace.name);
                }
            }
            return true; // let Plotly handle the toggle
        });
    }

    getAxisRange() {
        if (!this._binCentres || this._binCentres.length === 0) return 1;
        return this._binCentres[this._binCentres.length - 1] - this._binCentres[0];
    }

    /**
     * Gets filtered crosslinks organized by decoy status.
     */
    getFilteredLinksByDecoyStatus() {
        return {
            links: [
                this.model.getFilteredCrossLinks(),
                this.model.getFilteredCrossLinks("decoysTD"),
                this.model.getFilteredCrossLinks("decoysDD"),
                // this.model.getMarkedCrossLinks("selection"), // "Selected" series disabled
            ],
            seriesNames: ["Crosslinks", "Decoys (TD-DD)", "Decoys (DD)" /*, "Selected" */],
            matchFilters: [undefined, undefined, undefined /*, function (m) {
                return this.model.get("match_selection").has(m.match.id);
            } */]
        };
    }

    /**
     * Recalculates random distance binning.
     */
    recalcRandomBinning(linkCount) {
        const searchArray = Array.from(this.model.get("clmsModel").getSearches().values());
        const crosslinkerSpecificityMap = crosslinkerSpecificityPerLinker(this.model.get("clmsModel"), searchArray);
        const distObj = this.model.get("distancesObj");
        const rscope = this.options.randomScope;
        const randArr = distObj ? distObj.getSampleDistances(
            d3.median([10000, linkCount * 100, 100000]),
            d3.values(crosslinkerSpecificityMap), {
                withinProtein: rscope === "Intra" || rscope === "Chain",
                withinChain: rscope === "Chain",
                withinModel: !this.model.get("stageModel").get("allowInterModelDistances"),
            }
        ) : [];
        const thresholds = this.getBinThresholds([
            []
        ]);
        const binnedData = d3.layout.histogram()
            .bins(thresholds)(randArr);

        return {
            data: binnedData,
            origSize: randArr.length
        };
    }

    /**
     * Gets relevant attribute data for all series.
     */
    getRelevantAttributeData(attrMetaData) {
        const linkFunc = attrMetaData.linkFunc;
        const linkData = this.getFilteredLinksByDecoyStatus();
        const links = linkData.links;
        const matchFilters = linkData.matchFilters;

        const extras = this.attrExtraOptions[attrMetaData.id] || {
            conditions: []
        };
        const conditions = extras.conditions;

        const joinedCounts = links.map(function (linkArr, i) {
            const condition = conditions[i];
            const matchFilter = matchFilters[i];
            const vals = [];
            linkArr.forEach(function (link) {
                const res = linkFunc.call(this, link, condition);
                if (res != undefined) {
                    if (attrMetaData.matchLevel) {
                        const filteredMatches = link.filteredMatches_pp;
                        res.forEach(function (matchValue, i) {
                            const fm = filteredMatches[i];
                            if (!matchFilter || matchFilter.call(this, fm)) {
                                vals.push([link, matchValue, fm]);
                            }
                        }, this);
                    } else if (res[0]) {
                        vals.push([link, res[0]]);
                    }
                }
            }, this);
            return vals;
        }, this);

        const seriesNames = linkData.seriesNames;
        if (extras.showRandoms) {
            if (this.options.reRandom) {
                this.precalcedDistributions["Random"] = this.recalcRandomBinning.call(this, this.model.get("TTCrossLinkCount"));
                this.options.reRandom = false;
            }
            joinedCounts.push(this.getPrecalcedDistribution("Random"));
            seriesNames.push("Random");
        }

        const result = [];
        for (let i = 0; i < joinedCounts.length; i++) {
            result.push({
                linkValues: joinedCounts[i],
                name: seriesNames[i]
            });
        }
        return result;
    }

    /**
     * Gets currently selected attribute option for specified axis.
     */
    getSelectedOption(axisLetter) {
        let funcMeta;

        d3.select(this.el)
            .selectAll("select")
            .filter(function (d) {
                return d === axisLetter;
            })
            .selectAll("option")
            .filter(function () {
                return d3.select(this).property("selected");
            })
            .each(function (d) {
                funcMeta = d;
            });

        return funcMeta;
    }

    /**
     * Gets data counts for all series using selected X axis attribute.
     */
    getDataCount() {
        const funcMeta = this.getSelectedOption("X");
        this.options.maxX = funcMeta.maxVal || this.options.absX;
        return this.getRelevantAttributeData.call(this, funcMeta);
    }

    /**
     * Checks if all series are empty.
     */
    isEmpty(series) {
        return series.every(function (aSeries) {
            return !aSeries.linkValues.length;
        });
    }

    /**
     * Calculates bin thresholds for histogram.
     */
    getBinThresholds(seriesData, accessor) {
        accessor = accessor || function (d) {
            return d;
        };
        const allExtents = [];
        for (let i = 0; i < seriesData.length; i++) {
            const singleSeries = seriesData[i];
            if (singleSeries.linkValues) {
                const ext = d3.extent(singleSeries.linkValues, accessor);
                allExtents.push(ext[0], ext[1]);
            } else {
                allExtents.push(0, 1);
            }
        }
        const extent = d3.extent(allExtents);
        const min = d3.min([0, Math.floor(extent[0])]);
        const max = d3.max([1, this.options.maxX || Math.ceil(extent[1])]);
        const step = Math.max(1, niceRound((max - min) / 100));
        let thresholds = d3.range(min, max + (step * 2), step);

        if (thresholds.length === 0) {
            thresholds = [0, 1];
        }
        return thresholds;
    }

    /**
     * Gets precalculated distribution for a series (e.g., Random).
     */
    getPrecalcedDistribution(seriesName) {
        return this.precalcedDistributions[seriesName];
    }

    /**
     * Aggregates series data into histogram bins.
     */
    aggregate(seriesData, precalcedDistributions, removeLastEntry) {

        const thresholds = this.getBinThresholds(seriesData, function (d) {
            return d[1];
        });
        this.currentBins = [];
        this.y2Rescale = 1;

        const countArrays = seriesData.map(function (series, i) {
            const aseries = series.linkValues;
            const seriesName = series.name;
            const rescaleToSeries = this.options.scaleOthersTo[seriesName];
            let rescaleLength = 1;
            if (rescaleToSeries) {
                const rsIndex = _.findIndex(seriesData, function (s) {
                    return s.name === rescaleToSeries;
                });
                rescaleLength = rsIndex >= 0 ? seriesData[rsIndex].linkValues.length : 1;
            }

            const pcd = this.getPrecalcedDistribution(seriesName);
            const binnedData = pcd ? pcd.data :
                d3.layout
                    .histogram()
                    .value(function (d) {
                        return d[1];
                    })
                    .bins(thresholds)(aseries || []);
            const dataLength = pcd ? pcd.origSize : aseries.length;

            this.currentBins[i] = {
                bin: binnedData,
                id: seriesName
            };

            const scale = rescaleToSeries ? rescaleLength / (dataLength || rescaleLength) : 1;
            this.y2Rescale = Math.min(scale, this.y2Rescale);
            return binnedData.map(function (nestedArr) {
                return nestedArr.y * scale;
            });
        }, this);

        if (removeLastEntry) {
            countArrays.forEach(function (array) {
                array.pop();
            });
        }

        return {
            countArrays: countArrays,
            thresholds: thresholds
        };
    }

    /**
     * Re-randomizes distance distribution when random scope changes.
     */
    reRandom(evt) {
        this.options.randomScope = evt.target.value;
        this.options.reRandom = true;
        this.render();
        return this;
    }

    handleExtraOptions() {
        const funcMeta = this.getSelectedOption("X");
        const extras = this.attrExtraOptions[funcMeta.id] || {};
        const d3el = d3.select(this.el);
        d3el.select("#distoPanelRandomOptions")
            .style("display", extras.showRandoms ? null : "none");
        d3el.select("#distoPanelMaxXValue")
            .style("display", extras.showDistMaxInput ? null : "none");
        return this;
    }

    /**
     * Relayouts the distogram on view resize.
     * Plotly's responsive: true handles most resize automatically, but we still call
     * Plotly.Plots.resize so that explicit panel-show events trigger an immediate reflow.
     */
    relayout() {
        if (this._inited && this.chartDivNode) {
            Plotly.Plots.resize(this.chartDivNode);
        }
        return this;
    }

    /**
     * Gets color mapping for categorical sub-series.
     */
    getSeriesColours(seriesNames) {
        const colModel = this.colourScaleModel;
        const colRange = colModel.get("colScale").range();
        const colMap = _.object(_.zip(seriesNames, colRange));
        colMap[colModel.get("undefinedLabel")] = colModel.get("undefinedColour");
        return colMap;
    }

    /**
     * Highlights or selects crosslinks/matches in a histogram bin on click/hover.
     * c3MouseData here comes from our Plotly event wiring: {name, index, originalEvent}.
     * The original c3 version checked seriesIndex === 0 to ensure the routine ran once
     * per interaction; Plotly fires a single event per click/hover so that guard isn't
     * needed.
     */
    highlightOrSelect(type, c3MouseData) {
        const matchBasedSelection = this.getSelectedOption("X").matchLevel;
        const hidden = this._hiddenSeriesIds;
        const binIndex = c3MouseData.index;

        const bins = this.currentBins
            .filter(function (seriesBin) {
                const seriesID = seriesBin.id;
                const subSeries = this.options.subSeriesNames.indexOf(seriesID) >= 0;
                const curHidden = hidden.has(seriesID);
                return subSeries && !curHidden;
            }, this)
            .map(function (seriesBin) {
                return seriesBin.bin[binIndex];
            })
            .filter(function (bin) {
                return bin !== undefined;
            });
        const bin = d3.merge(bins);

        const ev = c3MouseData.originalEvent || {};
        if (matchBasedSelection) {
            const matches = _.pluck(bin, 2);
            this.model.setMarkedMatches(type, matches, false, ev.ctrlKey || ev.shiftKey);
        } else {
            const crosslinks = _.pluck(bin, 0);
            this.model.setMarkedCrossLinks(type, crosslinks, false, ev.ctrlKey || ev.shiftKey);
        }
        return this;
    }

    remove() {
        super.remove(...arguments);
        if (this.chartDivNode && this._inited) {
            Plotly.purge(this.chartDivNode);
        }
        this.chartDivNode = null;
        return this;
    }

    /**
     * Generates string representation of current distogram view options.
     */
    optionsToString() {
        const shown = (this._lastTraces || [])
            .filter(function (t) { return t.visible !== "legendonly" && t.visible !== false; })
            .map(function (t) { return t.name; });
        const funcMeta = this.getSelectedOption("X");
        return funcMeta.label + "-" + shown.join("-").toUpperCase();
    }
}

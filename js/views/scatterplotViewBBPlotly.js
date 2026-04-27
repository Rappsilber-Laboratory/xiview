/**
 * @fileoverview Scatterplot view (Plotly port).
 * Same behaviour as scatterplotViewBB.js but built on Plotly.js (basic-dist-min) instead of
 * the custom D3 v3 + dual-canvas implementation. Backbone wiring, the toolbar (jitter / log /
 * download), the X / Y axis-attribute dropdowns, the model event listeners and the public
 * methods (render, recolourCrossLinks, rehighlightCrossLinks, optionsToString, takeImage)
 * keep their original signatures so the two files diff cleanly. The four bespoke pieces —
 * canvas drawing, SVG axis rendering, the D3 brush, and the "nearest point in a 4 px box"
 * hover logic — are replaced with Plotly traces, Plotly's built-in select dragmode, and
 * plotly_hover / plotly_selected events.
 */

import "../../css/scatterplot.css";
import * as _ from "underscore";
import $ from "jquery";

import {BaseFrameView} from "../ui-utils/base-frame-view";
import {attributeOptions} from "../clms-model/attribute-options";
import {
    addMultipleSelectControls, ceil, commonLabels,
    crossBrowserElementX,
    crossBrowserElementY,
    declutterAxis, floor,
    makeBackboneButtons
} from "../utils";
import d3 from "d3";
import Plotly from "plotly.js-basic-dist-min";
import {makeTooltipContents} from "../ui-utils/make-tooltip";
import vent from "../vent";

/**
 * Backbone view for 2D scatterplot visualization of crosslink metrics.
 * Plotly-backed port of the original canvas-based ScatterplotViewBB. Splits filtered
 * crosslinks into trace categories (base / decoys / ambiguous / selected / highlighted)
 * so Plotly's natural trace draw order replaces the dual-canvas + radixSort scheme.
 */
export class ScatterplotViewBB extends BaseFrameView {
    constructor(options) {
        super(options);
    }

    get events() {
        let parentEvents = BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "click .jitter": "toggleJitter",
            "click .logX": "toggleLogX",
            "click .logY": "toggleLogY",
            "click .selectMode": "toggleSelectMode",
        });
    }

    get defaultOptions() {
        return {
            xlabel: "Axis 1",
            ylabel: "Axis 2",
            chartTitle: "Scatterplot",
            selectedColour: "#ff0",
            highlightedColour: "#f80",
            jitter: true,
            chartMargin: 10,
            pointSize: 4,
            attributeOptions: null,
            standardTickFormat: d3.format(",d"),
            logX: false,
            logY: false,
            selectMode: false,
            exportKey: true,
            exportTitle: true,
            canHideToolbarArea: true,
            canTakeImage: true,
        };
    }

    /**
     * Initializes the scatterplot view.
     * Builds the toolbar (download / X / Y dropdowns / jitter / logX / logY) just like the
     * original. Replaces the SVG / canvas / brush construction with a Plotly.newPlot call
     * that creates an empty scatter plot bound to a chartDivNode.
     */
    initialize(viewOptions) {
        super.initialize(...arguments);

        this.options.attributeOptions = attributeOptions;

        const self = this;

        const mainDivSel = d3.select(this.el).classed("scatterplotView", true);

        const flexWrapperPanel = mainDivSel.append("div")
            .attr("class", "verticalFlexContainer");

        this.controlDiv = flexWrapperPanel.append("div").attr("class", "toolbar toolbarArea");

        const buttonData = [{
            class: "downloadButton2",
            label: commonLabels.downloadImg + "SVG",
            type: "button",
            id: "download"
        },];
        makeBackboneButtons(this.controlDiv, self.el.id, buttonData);

        // Add two select widgets for picking axes data types
        this.setMultipleSelectControls(this.controlDiv, this.options.attributeOptions, false);

        const toggleButtonData = [{
            class: "jitter",
            label: "Add Jitter",
            id: "jitter",
            type: "checkbox",
            inputFirst: true,
            initialState: this.options.jitter
        },
        {
            class: "logX",
            label: "Log X Axis",
            id: "logx",
            type: "checkbox",
            inputFirst: true,
            initialState: this.options.logX
        },
        {
            class: "logY",
            label: "Log Y Axis",
            id: "logy",
            type: "checkbox",
            inputFirst: true,
            initialState: this.options.logY
        },
        {
            class: "selectMode",
            label: "Drag to Select",
            id: "selectmode",
            type: "checkbox",
            inputFirst: true,
            initialState: this.options.selectMode
        }
        ];
        makeBackboneButtons(this.controlDiv, self.el.id, toggleButtonData);

        const chartDiv = flexWrapperPanel.append("div")
            .attr("class", "panelInner")
            .attr("flex-grow", 1)
            .style("position", "relative");

        // Title element rendered by makeChartTitle (replaces in-svg <text class="chartHeader">)
        chartDiv.append("div").attr("class", "chartHeader scatterChartTitle");

        // The Plotly chart binds to this div
        const plotlyDiv = chartDiv.append("div").attr("class", "plotlyHost");
        this.chartDivNode = plotlyDiv.node();

        // Keep d3 scales around — they're still used for jitter range calculation
        // (pixels-per-data-unit) and for the optionsToString / brush-extent helpers.
        // Their domains are kept in sync with the Plotly axes via scaleAxes().
        this.x = d3.scale.linear();
        this.y = d3.scale.linear();

        // Backing state for what the chart is currently showing
        this._inited = false;
        this._currentBrushExtent = null; // [[xmin, ymin], [xmax, ymax]] or null
        this._currentNearest = {link: undefined, match: undefined, distance: Infinity};
        this.selectSize = 0;
        this.jitterRanges = {x: 0, y: 0};

        // Listen to these events (and generally re-render in some fashion)
        this.listenTo(this.model, "selectionMatchesLinksChanged change:linkColourAssignment currentColourModelChanged", this.recolourCrossLinks);
        this.listenTo(this.model, "highlightsMatchesLinksChanged", this.rehighlightCrossLinks);
        this.listenTo(this.model, "filteringDone", function () {
            this.renderCrossLinks({isFiltering: true});
        });
        this.listenTo(this.model, "change:distancesObj", this.ifADistanceAxisRerender);
        this.listenTo(vent, "PDBPermittedChainSetsUpdated changeAllowInterModelDistances", this.ifADistanceAxisRerender);
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

            const toolbar = mainDivSel.select("div.toolbar");
            self.setMultipleSelectControls(toolbar, newOptions, true);
        });

        this.axisChosen().render();
    }

    /**
     * Captures image export.
     * Plotly version uses Plotly.downloadImage to produce SVG output directly.
     */
    takeImage(event, thisSVG) {
        if (!this._inited || !this.chartDivNode) return;
        return Plotly.downloadImage(this.chartDivNode, {
            format: "svg",
            filename: this.identifier + "_" + this.optionsToString(),
            width: this.chartDivNode.clientWidth || 800,
            height: this.chartDivNode.clientHeight || 600,
        });
    }

    /**
     * Re-renders scatterplot if Distance is a selected axis and distances changed.
     */
    ifADistanceAxisRerender() {
        const distanceAxes = this.getBothAxesMetaData().filter(function (axis) {
            return axis.id === "Distance";
        });
        if (distanceAxes.length) {
            this.axisChosen().render();
        }
    }

    /**
     * Creates X/Y axis dropdown controls.
     */
    setMultipleSelectControls(elem, options, keepOld) {
        const self = this;
        addMultipleSelectControls({
            addToElem: elem,
            selectList: ["X", "Y"],
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
                self.axisChosen().render();
            },
            idFunc: function (d) {
                return d.id;
            },
        });
    }

    /**
     * Selects (or highlights) all points within a data-coordinate extent.
     * Same semantics as the original: identifies links/matches whose (x, y) data values
     * fall inside the rectangle and marks them on the model.
     * options.extent — [[xmin, ymin], [xmax, ymax]] (required)
     * options.add    — add to existing selections instead of replacing
     * options.select — true for selection, false for highlights
     * options.calcNearest / options.mousePosition — fill in this._currentNearest
     */
    selectPoints(options) {
        options = options || {};
        if (!options.extent) return;
        const xAxisData = this.getAxisData("X", true);
        const yAxisData = this.getAxisData("Y", true);
        const xData = xAxisData.data;
        const yData = yAxisData.data;
        const filteredCrossLinks = this.getFilteredCrossLinks();
        const extent = options.extent;
        const matchLevel = xAxisData.matchLevel || yAxisData.matchLevel;
        const exmin = extent[0][0],
            exmax = extent[1][0],
            eymin = extent[0][1],
            eymax = extent[1][1];

        const add = options.add || false;
        const type = options.select ? "selection" : "highlights";

        const nearest = {
            link: undefined,
            match: undefined,
            distance: Number.POSITIVE_INFINITY
        };
        const jitterOn = this.options.jitter;

        function testNearest(link, match, xd, yd) {
            const xjr = jitterOn ? this.getXJitter(link) : 0;
            const yjr = jitterOn ? this.getYJitter(link) : 0;
            const px = this.getXPosition(xd, xjr) - options.mousePosition.px;
            const py = this.getYPosition(yd, yjr) - options.mousePosition.py;
            const pd = (px * px) + (py * py);
            if (pd < nearest.distance) {
                nearest.distance = pd;
                nearest.match = match;
                nearest.link = link;
            }
        }

        if (matchLevel) {
            const matchingMatches = filteredCrossLinks.map(function (link, i) {
                const xDatum = xData[i];
                const yDatum = yData[i];
                const passMatches = (xDatum && yDatum) ? link.filteredMatches_pp.filter(function (match, ii) {
                    const xd = xDatum.length === 1 ? xDatum[0] : xDatum[ii];
                    const yd = yDatum.length === 1 ? yDatum[0] : yDatum[ii];
                    const within = (xd >= exmin && xd <= exmax && yd >= eymin && yd <= eymax);
                    if (within && options.calcNearest) {
                        testNearest.call(this, link, match, xd, yd);
                    }
                    return within;
                }, this) : [];
                return passMatches;
            }, this);
            const allMatchingMatches = d3.merge(matchingMatches);
            this.selectSize = allMatchingMatches.length;
            this.model.setMarkedMatches(type, allMatchingMatches, true, add);
        } else {
            const matchingLinks = filteredCrossLinks.filter(function (link, i) {
                const xDatum = xData[i];
                const yDatum = yData[i];
                let within = xDatum && xDatum.some(function (xd) {
                    return xd >= exmin && xd <= exmax;
                });
                within = within && yDatum && yDatum.some(function (yd) {
                    return yd >= eymin && yd <= eymax;
                });
                if (within && options.calcNearest) {
                    testNearest.call(this, link, undefined, xDatum[0], yDatum[0]);
                }
                return within;
            }, this);
            this.selectSize = matchingLinks.length;
            this.model.setMarkedCrossLinks(type, matchingLinks, true, add);
        }

        this.nearest = nearest;
    }

    /**
     * Relayouts the view on resize or visibility change.
     * Plotly.Plots.resize re-measures the container and rescales axes on every call —
     * cheap and idempotent. A full re-render only runs on drag-end so that jitter
     * ranges (which depend on pixels-per-data-unit) are recomputed for the new size.
     */
    relayout(descriptor) {
        if (this._inited && this.chartDivNode) {
            Plotly.Plots.resize(this.chartDivNode);
        }
        if (descriptor && descriptor.dragEnd) {
            this.render();
        }
        return this;
    }

    toggleJitter() {
        this.options.jitter = !this.options.jitter;
        this.render();
        return this;
    }

    toggleLogX(evt) {
        const checked = d3.select(evt.target).property("checked");
        this.options.logX = checked;
        return this
            .axisChosen()
            .render();
    }

    toggleLogY(evt) {
        const checked = d3.select(evt.target).property("checked");
        this.options.logY = checked;
        return this
            .axisChosen()
            .render();
    }

    /**
     * Toggles drag-to-select mode. When on, the cursor becomes a crosshair and dragging
     * draws a brush rectangle that fires plotly_selected; off, the cursor is default and
     * brush is disabled. Live-updated via Plotly.relayout — no full re-render needed.
     */
    toggleSelectMode(evt) {
        const checked = d3.select(evt.target).property("checked");
        this.options.selectMode = checked;
        if (this._inited && this.chartDivNode) {
            Plotly.relayout(this.chartDivNode, {dragmode: checked ? "select" : false});
        }
        return this;
    }

    /**
     * Gets data values for all crosslinks using specified attribute function.
     */
    getData(funcMeta, filteredFlag, optionalLinks) {
        const linkFunc = funcMeta ? (filteredFlag ? funcMeta.linkFunc : funcMeta.unfilteredLinkFunc) : undefined;
        const crosslinks = optionalLinks ||
            (filteredFlag ? this.getFilteredCrossLinks() : this.model.getAllCrossLinks());
        const data = crosslinks.map(function (c) {
            return linkFunc ? linkFunc.call(this, c) : [undefined];
        }, this);
        return data;
    }

    /**
     * Gets currently selected attribute option for specified axis.
     */
    getSelectedOption(axisLetter) {
        let funcMeta;

        this.controlDiv
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
     * Gets filtered crosslinks including decoys and linears.
     */
    getFilteredCrossLinks() {
        return this.model.getFilteredCrossLinks("all");
    }

    /**
     * Gets axis data including label, data values, and formatting info.
     */
    getAxisData(axisLetter, filteredFlag, optionalLinks) {
        const funcMeta = this.getSelectedOption(axisLetter);
        const data = this.getData(funcMeta, filteredFlag, optionalLinks);
        return {
            label: funcMeta ? funcMeta.label : "?",
            data: data,
            zeroBased: !funcMeta.nonZeroBased,
            matchLevel: funcMeta.matchLevel || false,
            tickFormat: funcMeta.valueFormat || this.options.standardTickFormat,
            canLogAxis: funcMeta.logAxis || false,
            logStart: funcMeta.logStart
        };
    }

    /**
     * Gets metadata for both X and Y axes.
     */
    getBothAxesMetaData() {
        return ["X", "Y"].map(this.getSelectedOption, this);
    }

    /**
     * Tests if a scale is linear (vs logarithmic). Kept as a parity helper for the
     * scaleAxes / makeXAxisType machinery; Plotly itself doesn't need it.
     */
    isLinearScale(scale) {
        const domain = scale.domain();
        const bottomVal = scale(domain[0]);
        const fullRange = Math.abs(scale(domain[1]) - bottomVal);
        const halfRange = Math.abs(scale(d3.mean(domain)) - bottomVal);
        return (fullRange / halfRange) >= (2 - 0.001);
    }

    /**
     * Sets brush extent to valid empty value.
     */
    setValidEmptyBrushExtent() {
        this._currentBrushExtent = null;
    }

    /**
     * Switches X axis between linear and logarithmic scale type.
     */
    makeXAxisType(setAsLogScale) {
        if (setAsLogScale === this.isLinearScale(this.x)) {
            this.x = setAsLogScale ? d3.scale.log() : d3.scale.linear();
        }
        return this;
    }

    /**
     * Switches Y axis between linear and logarithmic scale type.
     */
    makeYAxisType(setAsLogScale) {
        if (setAsLogScale === this.isLinearScale(this.y)) {
            this.y = setAsLogScale ? d3.scale.log() : d3.scale.linear();
        }
        return this;
    }

    /**
     * Called when user selects new axis attributes from dropdowns.
     * Updates internal d3 scales and toggles the log-X / log-Y checkboxes per attribute.
     * The actual axis update on the chart happens in render() via Plotly.relayout.
     */
    axisChosen() {
        const dataX = this.getAxisData("X", false);
        const dataY = this.getAxisData("Y", false);

        this.makeXAxisType(dataX.canLogAxis && this.options.logX);
        this.makeYAxisType(dataY.canLogAxis && this.options.logY);

        const rootid = "#" + d3.select(this.el).attr("id");
        d3.select(this.el).select(rootid + "logx").style("display", dataX.canLogAxis ? null : "none");
        d3.select(this.el).select(rootid + "logy").style("display", dataY.canLogAxis ? null : "none");

        this.setValidEmptyBrushExtent();

        this.scaleAxes(dataX, dataY);

        if (this._currentBrushExtent) {
            this.model.setMarkedCrossLinks("highlights", [], false, false);
        }
        this._currentBrushExtent = null;

        // Cache axis meta on the view so render() can build the layout
        this._dataX = dataX;
        this._dataY = dataY;

        return this;
    }

    /**
     * Sets axis scale domains based on data extents.
     */
    scaleAxes(datax, datay) {
        const directions = [{
            dataDetails: datax,
            scale: this.x
        },
        {
            dataDetails: datay,
            scale: this.y
        },
        ];

        directions.forEach(function (direction) {
            let dom = d3.extent(d3.merge(direction.dataDetails.data));
            if (dom[0] === undefined || !_.isNumber(dom[0])) {
                dom = [0, 0];
            }
            if (direction.dataDetails.zeroBased && _.isNumber(dom[0])) {
                dom[0] = d3.min([0, dom[0]]);
            }
            dom = dom.map(function (v, i) {
                return _.isNumber(v) ? Math[i === 0 ? "floor" : "ceil"](v) : v;
            });

            const log = direction.dataDetails.canLogAxis;
            if (log) {
                dom[0] = direction.dataDetails.logStart;
            }
            direction.scale.domain(dom);
        });

        // Make sure scale ranges have something so jitter math doesn't blow up before resize
        this.x.range([0, this.chartDivNode ? Math.max(this.chartDivNode.clientWidth - 80, 100) : 500]);
        this.y.range([this.chartDivNode ? Math.max(this.chartDivNode.clientHeight - 60, 100) : 500, 0]);

        this.calcJitterRanges();

        return this;
    }

    /**
     * Highlights points and shows tooltip on hover.
     * Called from the plotly_hover event handler with the hovered point's data coordinates.
     */
    doHighlightAndTooltip(evt) {
        return this.doHighlight(evt).doTooltip(evt);
    }

    /**
     * Calculates highlight extent range around mouse position.
     * Plotly version: instead of inverting pixel coords from the DOM, we receive the data
     * (x, y) of the hovered point directly from plotly_hover and grow a small extent
     * around it. The extent is sized by jitter range so points inside one jitter cell
     * read together — same intent as the original 4 px box.
     */
    getHighlightRange(evt, squarius) {
        // evt.dataX / dataY come from plotly_hover handler; fall back to DOM math otherwise
        const dx = evt.dataX !== undefined ? evt.dataX : this.x.invert(crossBrowserElementX(evt, this.chartDivNode));
        const dy = evt.dataY !== undefined ? evt.dataY : this.y.invert(crossBrowserElementY(evt, this.chartDivNode));
        const sortFunc = function (a, b) { return a - b; };
        // Grow by `squarius` pixels in each direction (converted to data units)
        const xUnit = Math.abs(this.x.invert(squarius) - this.x.invert(0));
        const yUnit = Math.abs(this.y.invert(squarius) - this.y.invert(0));
        const xrange = [dx - xUnit, dx + xUnit].sort(sortFunc);
        const yrange = [dy - yUnit, dy + yUnit].sort(sortFunc);
        return {
            xrange: xrange,
            yrange: yrange,
            mousePosition: {
                px: this.x(dx),
                py: this.y(dy)
            }
        };
    }

    /**
     * Displays tooltip showing highlighted crosslinks/matches and nearest point.
     */
    doTooltip(evt) {
        const axesMetaData = this.getBothAxesMetaData();
        const highlightRange = this.getHighlightRange(evt, 20);
        const vals = [highlightRange.xrange, highlightRange.yrange];
        let inBetweenValidValues = false;

        let tooltipData = axesMetaData.map(function (axisMetaData, i) {
            const commaFormat = d3.format(",." + axisMetaData.decimalPlaces + "f");

            const utils = {};
            utils["ceil"] = ceil;
            utils["floor"] = floor;

            const rvals = ["ceil", "floor"].map(function (func, ii) {
                let v = utils[func](vals[i][ii], axisMetaData.decimalPlaces);
                if (v === 0) { v = 0; }
                return v;
            });
            const fvals = rvals.map(commaFormat);
            inBetweenValidValues |= (rvals[0] > rvals[1]);
            return [axisMetaData.label, rvals[0] > rvals[1] ? "---" : fvals[0] + (fvals[0] === fvals[1] ? "" : " to " + fvals[1])];
        });

        if (inBetweenValidValues) {
            tooltipData = [];
        }

        const isMatchLevel = axesMetaData.some(function (axmd) { return axmd.matchLevel; });
        const size = this.selectSize;
        const levelText = isMatchLevel ? (size === 1 ? "Match" : "Matches") : (size === 1 ? "Crosslink" : "Crosslinks");

        if (this.nearest && this.nearest.link) {
            const tipExtra = isMatchLevel ? makeTooltipContents.match(this.nearest.match) :
                makeTooltipContents.link(this.nearest.link);
            tooltipData = tooltipData.concat([
                ["&nbsp;"],
                ["Nearest " + (isMatchLevel ? "Match" : "Crosslink")]
            ]).concat(tipExtra);
        }

        if (!this.nearest || !this.nearest.link) {
            tooltipData = null;
        }

        this.model.get("tooltipModel")
            .set("header", "Highlighting " + (d3.format(",")(size)) + " " + levelText)
            .set("contents", tooltipData)
            .set("location", evt);
        this.trigger("change:location", this.model, evt);
        return this;
    }

    /**
     * Highlights crosslinks near a hover position.
     */
    doHighlight(evt) {
        const highlightRange = this.getHighlightRange(evt, 20);
        const extent = [
            [highlightRange.xrange[0], highlightRange.yrange[0]],
            [highlightRange.xrange[1], highlightRange.yrange[1]],
        ];
        this.selectPoints({
            extent: extent,
            add: evt.shiftKey || evt.ctrlKey,
            calcNearest: true,
            mousePosition: highlightRange.mousePosition
        });
        return this;
    }

    clearHighlightAndTooltip() {
        return this.clearHighlight().clearTooltip();
    }

    clearTooltip() {
        this.model.get("tooltipModel").set("contents", null);
        return this;
    }

    clearHighlight() {
        this.model.setMarkedCrossLinks("highlights", [], false, false);
        return this;
    }

    /**
     * Main render method: builds Plotly traces and layout, then newPlot/react.
     */
    render() {
        if (this.isVisible()) {
            this.renderCrossLinks({isVisible: true});
        }
        return this;
    }

    /**
     * Re-renders crosslinks with updated colors only (no position changes).
     * Plotly.react diffs and only updates marker colours when only those changed.
     */
    recolourCrossLinks() {
        this.renderCrossLinks({recolourOnly: true});
        return this;
    }

    /**
     * Re-renders highlighted crosslinks only.
     */
    rehighlightCrossLinks() {
        this.renderCrossLinks({rehighlightOnly: true});
        return this;
    }

    /**
     * Builds Plotly traces from the filtered crosslinks. The original drew everything to
     * a canvas with a radix-sorted order; here we put each visual category in its own
     * trace, and Plotly draws traces in array order — so the on-top-ness is determined
     * by trace order: base / decoys / ambiguous / selected / highlighted.
     */
    renderCrossLinks(renderOptions) {
        renderOptions = renderOptions || {};

        if (!(renderOptions.isVisible || this.isVisible())) {
            return this;
        }

        const colourScheme = this.model.get("linkColourAssignment");
        const filteredCrossLinks = this.getFilteredCrossLinks();
        const highlightedCrossLinkIDs = d3.set(_.pluck(this.model.getMarkedCrossLinks("highlights"), "id"));
        const selectedCrossLinkIDs = d3.set(_.pluck(this.model.getMarkedCrossLinks("selection"), "id"));
        const selectedMatchMap = this.model.getMarkedMatches("selection");
        const highlightedMatchMap = this.model.getMarkedMatches("highlights");

        const datax = this.getAxisData("X", true, filteredCrossLinks);
        const datay = this.getAxisData("Y", true, filteredCrossLinks);
        const matchLevel = datax.matchLevel || datay.matchLevel;

        // Refresh d3 domains so jitter / brush math stays in sync
        this.scaleAxes(datax, datay);

        const jitterOn = this.options.jitter;
        const xJit = jitterOn ? this.jitterRanges.x : 0;
        const yJit = jitterOn ? this.jitterRanges.y : 0;

        // Buckets for the five trace categories
        const buckets = {
            base: {x: [], y: [], colour: [], custom: []},
            decoys: {x: [], y: [], colour: [], custom: []},
            ambiguous: {x: [], y: [], colour: [], custom: []},
            selected: {x: [], y: [], custom: []},
            highlighted: {x: [], y: [], custom: []},
        };

        const countable = colourScheme.isCategorical();
        const counts = countable ? Array(colourScheme.getDomainCount() + 1).fill(0) : [];

        const pushPoint = function (link, match, xd, yd) {
            // Deterministic jitter — link.fromResidue based, same as original
            const jx = jitterOn ? (((link.fromResidue % 10) / 10) - 0.45) * xJit : 0;
            const jy = jitterOn ? (((link.fromResidue % 10) / 10) - 0.45) * yJit : 0;
            // Convert pixel jitter back to data units. For linear scales: jit_data = jit_px / pxPerUnit.
            const xRange = this.x.range();
            const yRange = this.y.range();
            const xDom = this.x.domain();
            const yDom = this.y.domain();
            const xPxPerUnit = (xRange[1] - xRange[0]) / ((xDom[1] - xDom[0]) || 1);
            const yPxPerUnit = (yRange[0] - yRange[1]) / ((yDom[1] - yDom[0]) || 1);
            const xVal = xd + (xPxPerUnit ? jx / xPxPerUnit : 0);
            const yVal = yd + (yPxPerUnit ? jy / yPxPerUnit : 0);

            const linkValue = colourScheme.getValue(link);
            const colour = colourScheme.getColourByValue(linkValue);
            const decoy = link.isDecoyLink();

            const ambig = matchLevel ? (match && match.isAmbig()) : link.ambiguous;
            const high = matchLevel ? (match && highlightedMatchMap.has(match.id)) : highlightedCrossLinkIDs.has(link.id);
            const sel = matchLevel ? (match && selectedMatchMap.has(match.id)) : selectedCrossLinkIDs.has(link.id);

            const customRow = {linkId: link.id, matchId: match ? match.id : null};

            if (high) {
                buckets.highlighted.x.push(xVal);
                buckets.highlighted.y.push(yVal);
                buckets.highlighted.custom.push(customRow);
                return;
            }
            if (sel) {
                buckets.selected.x.push(xVal);
                buckets.selected.y.push(yVal);
                buckets.selected.custom.push(customRow);
                return;
            }
            if (decoy) {
                buckets.decoys.x.push(xVal);
                buckets.decoys.y.push(yVal);
                buckets.decoys.colour.push(colour);
                buckets.decoys.custom.push(customRow);
                return;
            }
            if (ambig) {
                buckets.ambiguous.x.push(xVal);
                buckets.ambiguous.y.push(yVal);
                buckets.ambiguous.colour.push(colour);
                buckets.ambiguous.custom.push(customRow);
                if (countable) {
                    let idx = colourScheme.getDomainIndex(link);
                    if (idx === undefined) idx = counts.length - 1;
                    counts[idx]++;
                }
                return;
            }
            buckets.base.x.push(xVal);
            buckets.base.y.push(yVal);
            buckets.base.colour.push(colour);
            buckets.base.custom.push(customRow);
            if (countable) {
                let idx = colourScheme.getDomainIndex(link);
                if (idx === undefined) idx = counts.length - 1;
                counts[idx]++;
            }
        }.bind(this);

        filteredCrossLinks.forEach(function (link, i) {
            const xDatum = datax.data[i];
            const yDatum = datay.data[i];
            if (!xDatum || !yDatum) return;

            if (matchLevel) {
                const matches = link.filteredMatches_pp;
                for (let ii = 0; ii < matches.length; ii++) {
                    const xd = xDatum.length === 1 ? xDatum[0] : xDatum[ii];
                    const yd = yDatum.length === 1 ? yDatum[0] : yDatum[ii];
                    if (xd !== undefined && yd !== undefined) {
                        pushPoint(link, matches[ii].match, xd, yd);
                    }
                }
            } else {
                // link-level: use the longer of the two (if either has multiple values)
                const len = Math.max(xDatum.length, yDatum.length);
                for (let ii = 0; ii < len; ii++) {
                    const xd = xDatum.length === 1 ? xDatum[0] : xDatum[ii];
                    const yd = yDatum.length === 1 ? yDatum[0] : yDatum[ii];
                    if (xd !== undefined && yd !== undefined) {
                        pushPoint(link, null, xd, yd);
                    }
                }
            }
        });

        const ps = this.options.pointSize;
        const traces = [];

        if (buckets.base.x.length) {
            traces.push({
                type: "scatter",
                mode: "markers",
                name: "Crosslinks",
                x: buckets.base.x,
                y: buckets.base.y,
                customdata: buckets.base.custom,
                marker: {color: buckets.base.colour, size: ps, symbol: "square", line: {width: 0}},
                hovertemplate: "%{x}, %{y}<extra></extra>",
                showlegend: false,
            });
        }
        if (buckets.decoys.x.length) {
            traces.push({
                type: "scatter",
                mode: "markers",
                name: "Decoys",
                x: buckets.decoys.x,
                y: buckets.decoys.y,
                customdata: buckets.decoys.custom,
                marker: {color: "rgba(0,0,0,0)", size: ps, symbol: "square", line: {color: buckets.decoys.colour, width: 1}},
                hovertemplate: "%{x}, %{y}<extra>decoy</extra>",
                showlegend: false,
            });
        }
        if (buckets.ambiguous.x.length) {
            traces.push({
                type: "scatter",
                mode: "markers",
                name: "Ambiguous",
                x: buckets.ambiguous.x,
                y: buckets.ambiguous.y,
                customdata: buckets.ambiguous.custom,
                marker: {color: buckets.ambiguous.colour, size: ps, symbol: "square", line: {color: buckets.ambiguous.colour, width: 1}, opacity: 0.7},
                hovertemplate: "%{x}, %{y}<extra>ambiguous</extra>",
                showlegend: false,
            });
        }
        if (buckets.selected.x.length) {
            traces.push({
                type: "scatter",
                mode: "markers",
                name: "Selected",
                x: buckets.selected.x,
                y: buckets.selected.y,
                customdata: buckets.selected.custom,
                marker: {color: this.options.selectedColour, size: ps + 1, symbol: "square", line: {color: "#000", width: 1}},
                hovertemplate: "%{x}, %{y}<extra>selected</extra>",
                showlegend: false,
            });
        }
        if (buckets.highlighted.x.length) {
            traces.push({
                type: "scatter",
                mode: "markers",
                name: "Highlighted",
                x: buckets.highlighted.x,
                y: buckets.highlighted.y,
                customdata: buckets.highlighted.custom,
                marker: {color: this.options.highlightedColour, size: ps + 1, symbol: "square", line: {color: "#000", width: 1}},
                hovertemplate: "%{x}, %{y}<extra>highlighted</extra>",
                showlegend: false,
            });
        }

        // Empty fallback so Plotly still has something to render
        if (traces.length === 0) {
            traces.push({type: "scatter", mode: "markers", x: [], y: [], showlegend: false});
        }

        const layout = this._buildLayout(datax, datay);

        // Plotly.react / newPlot can fire synthetic plotly_unhover and plotly_hover events
        // synchronously during the redraw. Without suppression those events drive the
        // highlight handlers, which in turn re-enter renderCrossLinks → infinite recursion.
        this._suppressEvents = true;
        const self = this;
        if (!this._inited) {
            Plotly.newPlot(this.chartDivNode, traces, layout, {
                responsive: true,
                displayModeBar: false,
                displaylogo: false,
                scrollZoom: false,
                doubleClick: "reset",
            });
            this._wirePlotEvents();
            this._inited = true;
            // The panel may have become visible only just before this newPlot ran, so the
            // browser may not have laid out the container at its final size yet. Queue a
            // resize on the next animation frame to catch up once layout settles.
            requestAnimationFrame(function () {
                if (self._inited && self.chartDivNode) {
                    Plotly.Plots.resize(self.chartDivNode);
                }
            });
        } else {
            Plotly.react(this.chartDivNode, traces, layout);
        }
        setTimeout(function () { self._suppressEvents = false; }, 0);

        if (!renderOptions.rehighlightOnly) {
            // Strip the trailing zero-count "undefined" entry if it's empty (mirrors original)
            if (countable && _.last(counts) === 0) {
                counts.pop();
            }
            this.makeChartTitle(counts, colourScheme, d3.select(this.el).select(".scatterChartTitle"), matchLevel);
        }

        return this;
    }

    /**
     * Builds the Plotly layout object using the current axis data and any active brush.
     */
    _buildLayout(datax, datay) {
        const xLabel = (datax.canLogAxis && this.options.logX ? "Log " : "") + datax.label;
        const yLabel = (datay.canLogAxis && this.options.logY ? "Log " : "") + datay.label;

        const xType = (datax.canLogAxis && this.options.logX) ? "log" : "linear";
        const yType = (datay.canLogAxis && this.options.logY) ? "log" : "linear";

        const xDom = this.x.domain();
        const yDom = this.y.domain();
        // Plotly log axes take log10 of the range bounds
        const xRange = xType === "log" ? [Math.log10(Math.max(xDom[0], datax.logStart || 1)), Math.log10(Math.max(xDom[1], 1))] : xDom;
        const yRange = yType === "log" ? [Math.log10(Math.max(yDom[0], datay.logStart || 1)), Math.log10(Math.max(yDom[1], 1))] : yDom;

        const layout = {
            dragmode: this.options.selectMode ? "select" : false, // toggled by the "Drag to Select" checkbox
            hovermode: "closest",
            showlegend: false,
            margin: {l: 70, r: 20, t: 10, b: 50},
            xaxis: {
                title: {text: xLabel},
                type: xType,
                range: xRange,
                automargin: true,
                fixedrange: true,
            },
            yaxis: {
                title: {text: yLabel},
                type: yType,
                range: yRange,
                automargin: true,
                fixedrange: true,
            },
            plot_bgcolor: "#ddd",
        };
        return layout;
    }

    /**
     * Wires Plotly's plotly_click, plotly_selected (brush), plotly_hover (highlight +
     * tooltip) and plotly_unhover (clear) events to the existing model-marking plumbing.
     */
    _wirePlotEvents() {
        const self = this;

        this.chartDivNode.on("plotly_click", function (ev) {
            if (self._suppressEvents) return;
            if (!ev || !ev.points || !ev.points.length) return;
            const pt = ev.points[0];
            const native = ev.event || {};
            const customRow = pt.customdata;
            if (!customRow || customRow.linkId == null) return;
            const filtered = self.getFilteredCrossLinks();
            const link = _.find(filtered, function (l) { return l.id === customRow.linkId; });
            if (!link) return;
            const add = native.ctrlKey || native.shiftKey;
            if (customRow.matchId != null) {
                const matchEntry = _.find(link.filteredMatches_pp, function (m) {
                    return m.match.id === customRow.matchId;
                });
                if (matchEntry) {
                    self.model.setMarkedMatches("selection", [matchEntry.match], true, add);
                }
            } else {
                self.model.setMarkedCrossLinks("selection", [link], true, add);
            }
        });

        this.chartDivNode.on("plotly_selected", function (ev) {
            if (!ev) {
                // Selection cleared (double-click etc.)
                self._currentBrushExtent = null;
                self.model.setMarkedCrossLinks("highlights", [], false, false);
                return;
            }
            if (!ev.range) return; // lasso etc. — only handle box select
            const xR = ev.range.x;
            const yR = ev.range.y;
            self._currentBrushExtent = [
                [Math.min(xR[0], xR[1]), Math.min(yR[0], yR[1])],
                [Math.max(xR[0], xR[1]), Math.max(yR[0], yR[1])]
            ];
            const orig = ev.event || {};
            self.selectPoints({
                extent: self._currentBrushExtent,
                add: orig.ctrlKey || orig.shiftKey,
                select: true,
            });
        });

        this.chartDivNode.on("plotly_hover", function (ev) {
            if (self._suppressEvents) return; // Plotly.react fires synthetic hover/unhover during redraw — must not re-enter
            if (!ev || !ev.points || !ev.points.length) return;
            const pt = ev.points[0];
            const native = ev.event || {};
            const synth = {
                dataX: pt.x,
                dataY: pt.y,
                shiftKey: native.shiftKey,
                ctrlKey: native.ctrlKey,
                pageX: native.pageX,
                pageY: native.pageY,
                clientX: native.clientX,
                clientY: native.clientY,
            };
            self.doHighlightAndTooltip(synth);
        });

        this.chartDivNode.on("plotly_unhover", function () {
            if (self._suppressEvents) return;
            self.clearHighlightAndTooltip();
        });
    }

    /**
     * Calculates X jitter offset for a crosslink.
     */
    getXJitter(link) {
        return (((link.fromResidue % 10) / 10) - 0.45) * this.jitterRanges.x;
    }

    /**
     * Calculates Y jitter offset for a crosslink.
     */
    getYJitter(link) {
        return (((link.fromResidue % 10) / 10) - 0.45) * this.jitterRanges.y;
    }

    /**
     * Converts X data coordinate to canvas pixel position with jitter.
     */
    getXPosition(xCoord, xJitter) {
        return this.x(xCoord) + xJitter;
    }

    /**
     * Converts Y data coordinate to canvas pixel position with jitter.
     */
    getYPosition(yCoord, yJitter) {
        return this.y(yCoord) + yJitter;
    }

    /**
     * Gets size data for the scatterplot viewport.
     */
    getSizeData() {
        const node = this.chartDivNode;
        const cx = node ? node.clientWidth : 0;
        const cy = node ? node.clientHeight : 0;
        const margin = {left: 70, right: 20, top: 10, bottom: 50};
        const width = Math.max(0, cx - margin.left - margin.right);
        const height = Math.max(0, cy - margin.top - margin.bottom);
        const minDim = Math.min(width, height);
        return {cx: cx, cy: cy, width: width, height: height, minDim: minDim};
    }

    /**
     * Calculates jitter ranges based on current axis scales.
     */
    calcJitterRanges() {
        this.jitterRanges = this.jitterRanges || {};
        const xunit = Math.abs(this.x(this.x.domain()[0]) - this.x(this.x.domain()[0] + 1));
        this.jitterRanges.x = Math.max(2, xunit / 3);
        const yunit = Math.abs(this.y(this.y.domain()[0]) - this.y(this.y.domain()[0] + 1));
        this.jitterRanges.y = Math.max(2, yunit / 3);
        return this;
    }

    // No explicit resize() needed — Plotly handles that via responsive: true.
    // We expose a stub so existing callers (ifADistanceAxisRerender etc.) compile.
    resize() {
        if (this._inited && this.chartDivNode) {
            Plotly.Plots.resize(this.chartDivNode);
        }
        return this;
    }

    /**
     * Generates string representation of current scatterplot view options.
     */
    optionsToString() {
        const meta = this.getBothAxesMetaData();
        let axisLabels = _.pluck(meta, "label");

        if (this._currentBrushExtent) {
            const ext = this._currentBrushExtent;
            const fmt = function (v, dp) {
                return (Math.round(v * Math.pow(10, dp)) / Math.pow(10, dp)).toString();
            };
            axisLabels = axisLabels.map(function (axisLabel, i) {
                const dp = meta[i].decimalPlaces || 0;
                return axisLabel + "_(" + fmt(ext[0][i], dp) + " to " + fmt(ext[1][i], dp) + ")";
            });
        }
        return (this.options.jitter ? "Jitter_" : "") + axisLabels.join("_by_");
    }

    remove() {
        super.remove(...arguments);
        if (this._inited && this.chartDivNode) {
            Plotly.purge(this.chartDivNode);
        }
        this.chartDivNode = null;
        return this;
    }
}

ScatterplotViewBB.prototype.identifier = "Scatterplot";
ScatterplotViewBB.prototype.canvasImageParent = "div.plotlyHost";

import "../../css/distogram.css";
import "../../vendor/c3.css";

import * as $ from "jquery";
import * as _ from "underscore";
import * as c3 from "../../vendor/c3";

import {BaseFrameView} from "../ui-utils/base-frame-view";
import {SearchResultsModel} from "../../../CLMS-model/src/search-results-model";
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

export const DistogramBB = BaseFrameView.extend({
    events: function () {
        let parentEvents = BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "click .randomScope": "reRandom",
        });
    },

    defaultOptions: {
        xlabel: "X Value",
        ylabel: "Count",
        y2label: "Random (absolute)",
        seriesNames: ["Cross-Links", "Decoys (TD-DD)", "Random", "Selected"],
        subSeriesNames: [],
        scaleOthersTo: {
            Random: "Cross-Links"
        },
        chartTitle: "DISTO",// this.identifier,
        maxX: 90,
        attributeOptions: null,
        xStandardTickFormat: d3.format(","),
        randomScope: "All",
        selectedColour: "#ff0",
        exportKey: true,
        exportTitle: true,
        canHideToolbarArea: true,
        canTakeImage: true,
    },

    // eslint-disable-next-line no-unused-vars
    initialize: function (viewOptions) {

        this.identifier = "Histogram View";

        //this.defaultOptions.chartTitle = this.identifier;
        DistogramBB.__super__.initialize.apply(this, arguments);

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

        this.options.attributeOptions = SearchResultsModel.attributeOptions;

        this.precalcedDistributions = {
            Random: {
                data: [],
                origSize: 0
            }
        };

        const self = this;

        // this.el is the dom element this should be getting added to, replaces targetDiv
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

        // Various view options set up, then put in a dropdown menu
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
                if (d.initialState === undefined && d.group && d.value) { // set initial values for radio button groups
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
            .attr("id", mainDivSel.attr("id") + "c3Chart");

        // make 'empty' columns for all series and sub-series
        const columnsAsNamesOnly = d3.merge([this.options.seriesNames, this.options.subSeriesNames]).map(function (sname) {
            return [sname];
        });

        const chartID = "#" + chartDiv.attr("id");
        let firstRun = true;
        // Generate the C3 Chart
        this.chart = c3.generate({
            bindto: chartID,
            transition: {
                duration: null, // no animations, causes bugs in c3 when actions performed rapidly
            },
            data: {
                x: "x",
                columns: columnsAsNamesOnly,
                type: "bar",
                colors: {
                    "Cross-Links": "#44d",
                    Random: "#444",
                    Selected: "url(#selectedStripe)",
                    "Decoys (TD-DD)": "#d44",
                },
                empty: {
                    label: {
                        text: "Currently No Data For This Attribute"
                    }
                },
                selection: {
                    enabled: false,
                    grouped: true,
                    multiple: true,
                    draggable: true,
                },
                onclick: function (d) {
                    self.highlightOrSelect("selection", this.data(), d);
                },
                onmouseover: function (d) {
                    self.highlightOrSelect("highlights", this.data(), d);
                },
                order: null,
            },
            bar: {
                width: {
                    ratio: 0.8 // this makes bar width 50% of length between ticks
                    // need to poke c3.js code to see why the bars are initally zero width (whatever it calculates from is zero too I suspect)
                }
                //width: 8 // this makes bar width 8px
            },
            axis: {
                x: {
                    label: {
                        text: this.options.xlabel,
                        position: "outer-right",
                    },
                    //max: this.options.maxX,
                    padding: { // padding of 1 ticks to right of chart to stop bars in last column getting clipped
                        left: 0, // 0.5,  // 0.5 used when we moved axis instead of bars to get alignments of bars between ticks
                        right: 1,
                    },
                    tick: {
                        format: function (val, returnUnformattedToo) {
                            const formattedVal = self.options.xCurrentTickFormat(val);
                            return returnUnformattedToo ? {
                                val: val,
                                formattedVal: formattedVal
                            } : formattedVal;
                        },
                    }
                },
                y: {
                    label: this.options.ylabel,
                    tick: { // blank non-whole numbers on y axis with this d3 format function
                        // except this does the same for tooltips, so non-whole numbers dont get shown in tooltips unless tooltip.value overridden below
                        format: d3.format(",d")
                    }
                },
                y2: {
                    label: this.options.y2label,
                    tick: { // blank non-whole numbers on y axis with this d3 format function
                        // except this does the same for tooltips, so non-whole numbers dont get shown in tooltips unless tooltip.value overridden below
                        format: d3.format(",d")
                    },
                    show: true
                }
            },
            grid: {
                lines: {
                    front: false, // stops overlong and short gridlines obscuring actual data
                },
                focus: {
                    show: false,
                },
            },
            padding: {
                left: 56, // need this fixed amount if y labels change magnitude i.e. single figures only to double figures causes a horizontal jump
                right: 56,
                top: 6
            },
            tooltip: {
                format: {
                    title: function (x) {
                        const tickFunc = self.chart.internal.config.axis_x_tick_format;
                        const realX = tickFunc(x, true);
                        const clSeries = self.chart.x()["Cross-Links"];
                        const gap = clSeries.length > 1 ? clSeries[1] - clSeries[0] : 1;
                        const nextX = tickFunc(x + gap, true);
                        const realXVal = realX.val;
                        const nextXVal = nextX.val;
                        const funcMeta = self.getSelectedOption("X");
                        const invPow = Math.pow(10, -(funcMeta.decimalPlaces || 0));
                        const barIsRange = (nextXVal - realXVal) > invPow;
                        const endOfRange = invPow === 1 ? self.options.xCurrentTickFormat(nextXVal - invPow) : "<" + self.options.xCurrentTickFormat(nextXVal);
                        const xlabel = self.chart.internal.config.axis_x_label;
                        return (xlabel.text || xlabel) + " " + realX.formattedVal + (barIsRange ? " to " + endOfRange : "");
                    },
                    name: function (name) {
                        return name + " " + self.options.ylabel;
                    },
                    value: function (count, ratio, id) {
                        let c = "";
                        if (count !== undefined) {
                            c = count.toFixed(id === "Random" ? 1 : 0);
                            if (id !== "Random") {
                                c += "<span style='visibility:hidden; margin: 0'>.0</span>";
                            }
                        }
                        return c;
                    },
                },
                contents: function (d, defaultTitleFormat, defaultValueFormat, color) {
                    const text = this.getTooltipContent(d, defaultTitleFormat, defaultValueFormat, color);
                    return _.unescape(text);
                },
            },
            subchart: {
                show: false,
                size: {
                    height: 0
                },
            },
            title: {
                text: this.options.chartTitle
            },
            onrendered: function () {
                if (firstRun) {
                    firstRun = false;
                    this.api.hide("Cross-Links", {
                        withLegend: true
                    }); // doesn't work properly if done in configuration above
                    if (!self.model.get("clmsModel").get("decoysPresent")) {
                        this.api.hide("Decoys (TD-DD)", {
                            withLegend: true
                        }); // if no decoys, hide the decoy total series
                    }
                }
                self.makeBarsSitBetweenTicks(this, "xAxis");
                if (!self.options.dodgeTidyXAxis) {
                    self.tidyXAxis.call(self);
                    self.options.dodgeTidyXXAxis = true;
                }
            },
            onmouseout: function () {
                self.model.setMarkedCrossLinks("highlights", [], false, false);
            },
        });

        // make pattern fill for selected bars
        const pattern = d3.select(chartID).select("defs")
            .append("pattern")
            .attr("id", "selectedStripe")
            .attr("patternUnits", "userSpaceOnUse")
            .attr("width", "10")
            .attr("height", "10")
            .attr("patternTransform", "rotate(45)");
        pattern.append("rect").attr("x", "0").attr("y", "0").attr("width", "10").attr("height", "10").style("fill", this.options.selectedColour);
        pattern.append("line").attr("x1", "0").attr("y1", "0").attr("x2", "0").attr("y2", "10");
        pattern.append("line").attr("x1", "5").attr("y1", "0").attr("x2", "5").attr("y2", "10");

        function distancesAvailable() {
            //console.log("DISTOGRAM RAND DISTANCES MARKED FOR RECALCULATION");
            this.options.reRandom = true;

            // Reset distance attribute max value according to max cross-link distance
            const distAttr = this.options.attributeOptions.filter(function (attr) {
                return attr.id === "Distance";
            });
            if (distAttr.length === 1) {
                const userMax = +mainDivSel.select(".xAxisMax").property("value");    // user defined value from widget
                const distObj = this.model.get("clmsModel").get("distancesObj");
                if (!userMax) {
                    distAttr[0].maxVal = niceRound(distObj.maxDistance * 1.3) + 1;
                }
            }

            if (this.getSelectedOption("X").id === "Distance") {
                //console.log ("DISTOGRAM RERENDERED DUE TO DISTANCE CHANGES");
                this.render();
            }
        }

        this.listenTo(this.model, "filteringDone", this.render); // listen for custom filteringDone event from model
        this.listenTo(this.model, "currentColourModelChanged", function () {
            this.render({
                noAxesRescale: true,
                recolourOnly: true
            });
        }); // have details (range, domain, colour) of current colour model changed?
        this.listenTo(this.model, "change:linkColourAssignment", function () {
            this.render({
                newColourModel: true
            });
        }); // listen for colour model getting swapped in and out
        this.listenTo(this.model, "selectionMatchesLinksChanged", function () {
            this.render({
                noAxesRescale: true
            });
        }); // update selection series
        this.listenTo(this.model.get("clmsModel"), "change:distancesObj", distancesAvailable); // new distanceObj for new pdb
        this.listenTo(window.vent, "PDBPermittedChainSetsUpdated changeAllowInterModelDistances", distancesAvailable); // changes to distancesObj with existing pdb (usually alignment change) or change in pdb assembly meaning certain chains can't be used
        this.listenTo(window.vent, "linkMetadataUpdated", function (metaMetaData) {
            const columns = metaMetaData.columns;
            //console.log ("HELLO", arguments);
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

        if (this.model.get("clmsModel").get("distancesObj")) {
            distancesAvailable();
        }

        return this;
    },

    setMultipleSelectControls: function (elem, options, keepOld) {
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
    },

    render: function (options) {

        options = options || {};

        if (this.isVisible()) {
            // Update X Label if necessary
            const funcMeta = this.getSelectedOption("X");
            const curXLabel = this.chart.internal.config.axis_x_label.text;
            const newX = (curXLabel !== funcMeta.label);
            if (newX) { // if a new attribute set on the x axis, change the x axis label and tick format if necessary
                this.options.xCurrentTickFormat = funcMeta.valueFormat || this.options.xStandardTickFormat;
                this.chart.axis.labels({x: funcMeta.label});
                this.options.absX = this.model.getAttributeRange(funcMeta)[1];
                //console.log ("ABSX", this.options.absX);
            }
            this.handleExtraOptions();

            const TT = 0,
                TD = 1,
                DD = 2;
            const seriesData = this.getDataCount(); // get series data, split into colour scheme sub-categories later

            // Get colour model. If chosen colour model is non-categorical, default to distance colours.
            let colModel = this.model.get("linkColourAssignment");
            if (!colModel.isCategorical()) {
                colModel = window.linkColor.defaultColoursBB; // make default colour choice for histogram if current colour model is continuous
            }
            this.colourScaleModel = colModel;

            // Add sub-series data
            // split TT list into sublists for length
            const subSeries = colModel.get("labels").range()    // get colour scale category names
                .concat([colModel.get("undefinedLabel")])       // add an 'undefined' label (returning as new array)
                .map(function (name) {                           // make into object with name and linkValues properties
                    return {
                        name: name,
                        linkValues: [],
                        isSubSeries: true,
                    };
                });

            //console.log ("measurements", measurements);
            seriesData[TT].linkValues.forEach(function (linkDatum) {
                let cat = colModel.getDomainIndex(linkDatum[0]);
                if (cat === undefined) {
                    cat = subSeries.length - 1;
                }
                subSeries[cat].linkValues.push(linkDatum);
            });

            // add sub-series data to main series array
            seriesData.push.apply(seriesData, subSeries);


            //console.log ("seriesLengths", seriesLengths);
            const removeCatchAllCategory = (funcMeta.maxVal !== undefined);
            const aggregates = this.aggregate(seriesData, this.precalcedDistributions, removeCatchAllCategory);
            let countArrays = aggregates.countArrays;


            function removeSeries(seriesID, onlyIfEmpty) {
                const seriesIndex = _.findIndex(seriesData, function (series) {
                    return series.name === seriesID;
                });
                if (seriesIndex >= 0) {
                    const hide = !onlyIfEmpty || seriesData[seriesIndex].linkValues.length === 0;
                    if (hide) {
                        seriesData.splice(seriesIndex, 1);
                        countArrays.splice(seriesIndex, 1);
                    }
                }
            }

            // Adjust the TD count by subtracting the matching DD count, to get TD-DD, then discard the DD series
            countArrays[TD].forEach(function (v, i) {
                countArrays[TD][i] = Math.max(v - countArrays[DD][i], 0); // subtract DD from TD counts
            });
            removeSeries("Decoys (DD)", false); // remove DD, its purpose is done

            //var maxY = d3.max(countArrays[0]);  // max calced on real data only
            // if max y needs to be calculated across all series
            let maxY = d3.max(countArrays, function (array) {
                return d3.max(removeCatchAllCategory ? array : array.slice(0, -1)); // ignore last element in array if not already removed as it's dumping ground for everything over last value
            });
            maxY = Math.max(maxY, 1);
            //console.log ("maxY", maxY);

            // add names to front of arrays as c3 demands (need to wait until after we calc max otherwise the string gets returned as max)
            countArrays.forEach(function (countArray, i) {
                countArray.unshift(seriesData[i].name);
            }, this);
            const thresholds = aggregates.thresholds;
            thresholds.unshift("x");    // add threshold x values as index data series
            countArrays.push(thresholds);
            //console.log ("thresholds", thresholds);
            //console.log ("countArrays", countArrays.slice(), seriesData.slice());

            if (this.isEmpty(seriesData)) {
                countArrays = [[]];
            }

            const redoChart = function () {
                const currentlyLoaded = _.pluck(this.chart.data(), "id");
                const toBeLoaded = _.pluck(countArrays, 0);  // number is index in subarray to be plucked
                const unload = _.difference(currentlyLoaded, toBeLoaded);
                const newloads = _.difference(toBeLoaded, currentlyLoaded);

                const subSeries = seriesData
                    .filter(function (d) {
                        return d.isSubSeries;
                    });
                this.options.subSeriesNames = _.pluck(subSeries, "name");

                const subSeriesLengths = subSeries
                    .map(function (d) {
                        return d.linkValues.length;
                    });
                const chartOptions = {
                    columns: countArrays,
                    colors: this.getSeriesColours(this.options.subSeriesNames),
                };
                if (unload.length) {
                    chartOptions.unload = unload;
                }

                this.chart.load(chartOptions);
                if (this.chart.groups().length === 0 || options.newColourModel) {
                    this.chart.groups([this.options.subSeriesNames]);
                }

                this
                    .makeChartTitle(subSeriesLengths, colModel, d3.select(this.el).select(".c3-title"), this.getSelectedOption("X").matchLevel);
                return {
                    unload: unload,
                    newloads: newloads
                };
            };

            // Jiggery-pokery to stop c3 doing total redraws on every single command (near enough)
            const tempHandle = c3.chart.internal.fn.redraw;
            c3.chart.internal.fn.redraw = function () {
            };
            const tempTitleHandle = c3.chart.internal.fn.redrawTitle;
            c3.chart.internal.fn.redrawTitle = function () {
            };
            const chartInternal = this.chart.internal;

            // Remove 'Undefined' and 'Selected' categories if empty
            // need to detect if these two get removed to do compareNewOldData
            removeSeries(colModel.get("undefinedLabel"), true);
            removeSeries("Selected", true);
            const shortcut = this.compareNewOldData(countArrays) && !newX;
            console.log("REDRAW TYPE", "noaxesrescale", options.noAxesRescale, "shortcut", shortcut);
            this.options.dodgeTidyXAxis &= (shortcut || options.noAxesRescale);

            if (options.noAxesRescale) { // doing something where we don't need to rescale x/y axes or relabel (change of colour in scheme or selection)
                const seriesChanges = redoChart.call(this);
                c3.chart.internal.fn.redraw = tempHandle;
                tempHandle.call(chartInternal, {
                    withTrimXDomain: false,
                    withDimension: false,
                    withEventRect: false,
                    withTheseAxes: [],
                    withLegend: !!seriesChanges.newloads.length
                });
                // Quicker way to just update c3 chart legend colours
                chartInternal.svg.selectAll("." + chartInternal.CLASS.legendItemTile).style("stroke", chartInternal.color);
                c3.chart.internal.fn.redrawTitle = tempTitleHandle;
            } else if (shortcut) { // doing something where we don't need to rescale x axes (filtering existing data usually)
                this.resetMaxY(maxY);
                redoChart.call(this);
                c3.chart.internal.fn.redraw = tempHandle;
                tempHandle.call(chartInternal, {
                    withTrimXDomain: false,
                    withDimension: false,
                    withEventRect: false,
                    withTheseAxes: ["axisY", "axisY2"]
                });
                c3.chart.internal.fn.redrawTitle = tempTitleHandle;
            } else { // normal
                this.resetMaxY(maxY);
                c3.chart.internal.fn.redrawTitle = tempTitleHandle;
                redoChart.call(this);
                c3.chart.internal.fn.redraw = tempHandle;
                tempHandle.call(chartInternal, {
                    withLegend: true,
                    withUpdateOrgXDomain: true,
                    withUpdateXDomain: true
                });
            }

            //console.log ("data", distArr, binnedData);
        }

        return this;
    },

    // only reset maxY (i.e. the chart scale) if necessary as it causes redundant repaint (given we load and repaint straight after)
    // so only reset scale if maxY is bigger than current chart value or maxY is less than half of current chart value
    resetMaxY: function (maxY) {
        //maxY = maxY || 1;
        const curMaxY = this.chart.axis.max().y;
        //console.log("curMaxY", curMaxY, "my", maxY);
        if (curMaxY === undefined || curMaxY < maxY || curMaxY / maxY >= 2) {
            console.log("resetting axis max from", curMaxY, "to", maxY);
            this.chart.axis.max({
                y: maxY,
                y2: maxY / this.y2Rescale,
            });
            this.chart.internal.y2.domain([0, maxY / this.y2Rescale]);
        }
        return this;
    },

    getAxisRange: function () {
        return this.chart.internal.orgXDomain[1] - this.chart.internal.orgXDomain[0];
    },

    // make x tick text values the rounder numbers, and remove any that overlap afterwards
    tidyXAxis: function () {
        const xaxis = d3.select(this.el).select(".c3-axis-x");
        if (this.chart) {
            niceValueAxis(xaxis, this.getAxisRange());
            declutterAxis(xaxis, true);
        }
        return this;
    },

    // Hack to move bars right by half a bar width so they sit between correct values rather than over the start of an interval
    makeBarsSitBetweenTicks: function (chartObj, whichXAxis) {  // can be xAxis or subXAxis
        const internal = chartObj || this.chart.internal;
        const halfBarW = internal.getBarW(internal[whichXAxis], 1) / 2 || 0;
        d3.select(this.el).selectAll(".c3-event-rects,.c3-chart-bars").attr("transform", "translate(" + halfBarW + ",0)");
        return this;
    },

    // See if new and old data are of the same series and of the same lengths
    // (we can then shortcut the c3 drawing code somewhat)
    compareNewOldData: function (newData) {
        const oldData = this.chart.data();
        //console.log ("oldData", this.chart, oldData, newData);
        if (oldData.length !== newData.length - 1) {    // 'x' isn't in old data
            return false;
        }
        const oldNewMatch = newData.every(function (newSeries) {
            const oldSeries = this.chart.data.values(newSeries[0]);
            return newSeries[0] === "x" || (oldSeries && oldSeries.length === newSeries.length - 1);
        }, this);

        //console.log ("match", oldNewMatch);
        return oldNewMatch;
    },

    getFilteredLinksByDecoyStatus: function () {
        return {
            links: [
                this.model.getFilteredCrossLinks(),
                this.model.getFilteredCrossLinks("decoysTD"),
                this.model.getFilteredCrossLinks("decoysDD"),
                this.model.getMarkedCrossLinks("selection"),
            ],
            seriesNames: ["Cross-Links", "Decoys (TD-DD)", "Decoys (DD)", "Selected"],
            matchFilters: [undefined, undefined, undefined, function (m) {
                return this.model.get("match_selection").has(m.match.id);
            }]
        };
    },

    recalcRandomBinning: function (linkCount) {
        const searchArray = Array.from(this.model.get("clmsModel").get("searches").values());
        const crosslinkerSpecificityMap = crosslinkerSpecificityPerLinker(searchArray);
        const distObj = this.model.get("clmsModel").get("distancesObj");
        const rscope = this.options.randomScope;
        const randArr = distObj ? distObj.getSampleDistances(
            d3.median([10000, linkCount * 100, 100000]),
            d3.values(crosslinkerSpecificityMap), {
                withinProtein: rscope === "Intra" || rscope === "Chain",
                withinChain: rscope === "Chain",
                withinModel: !this.model.get("stageModel").get("allowInterModelDistances"),
            }
        ) :
            [];
        const thresholds = this.getBinThresholds([
            []
        ]);
        const binnedData = d3.layout.histogram()
            .bins(thresholds)(randArr);
        console.log("RANDOM", binnedData, randArr.length);

        return {
            data: binnedData,
            origSize: randArr.length
        };
    },

    getRelevantAttributeData: function (attrMetaData) {
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
                    if (attrMetaData.matchLevel) { // if multiple values returned for a link (is match data)
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

        // Add Random series if plotting distance data
        const seriesNames = linkData.seriesNames;
        if (extras.showRandoms) {
            if (this.options.reRandom) {
                this.precalcedDistributions["Random"] = this.recalcRandomBinning.call(this, this.model.get("TTCrossLinkCount"));
                this.options.reRandom = false;
            }
            joinedCounts.push(this.getPrecalcedDistribution("Random"));
            seriesNames.push("Random");
        }

        return d3.zip(joinedCounts, seriesNames).map(function (pair) {
            return {
                linkValues: pair[0],
                name: pair[1]
            };
        });
    },

    getSelectedOption: function (axisLetter) {
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
    },

    getDataCount: function () {
        const funcMeta = this.getSelectedOption("X");
        this.options.maxX = funcMeta.maxVal || this.options.absX;
        return this.getRelevantAttributeData.call(this, funcMeta);
    },

    isEmpty: function (series) {
        return series.every(function (aSeries) {
            return !aSeries.linkValues.length;
        });
    },

    getBinThresholds: function (seriesData, accessor) {
        accessor = accessor || function (d) {
            return d;
        }; // return object/variable/number as is as standard accessor
        // get extents of all arrays, concatenate them, then get extent of that array
        const extent = d3.extent([].concat.apply([], seriesData.map(function (singleSeries) {
            return singleSeries.linkValues ? d3.extent(singleSeries.linkValues, accessor) : [0, 1];
        })));
        const min = d3.min([0, Math.floor(extent[0])]);
        const max = d3.max([1, this.options.maxX || Math.ceil(extent[1])]);
        const step = Math.max(1, niceRound((max - min) / 100));
        let thresholds = d3.range(min, max + (step * 2), step);
        //console.log ("thresholds", thresholds, extent, min, max, step, this.options.maxX, series);

        if (thresholds.length === 0) {
            thresholds = [0, 1]; // need at least 1 so empty data gets represented as 1 empty bin
        }
        return thresholds;
    },

    getPrecalcedDistribution: function (seriesName) {
        return this.precalcedDistributions[seriesName];
    },

    aggregate: function (seriesData, precalcedDistributions, removeLastEntry) {

        const thresholds = this.getBinThresholds(seriesData, function (d) {
            return d[1];
        });
        //console.log ("precalcs", precalcedDistributions, seriesNames);
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
                    }) // [1] is the actual value, [0] is the crosslink
                    .bins(thresholds)(aseries || []);
            const dataLength = pcd ? pcd.origSize : aseries.length;

            this.currentBins[i] = {
                bin: binnedData,
                id: seriesName
            }; // Keep a list of the bins for crosslinks for easy reference when highlighting / selecting
            //console.log ("CURRENT BINS", this.currentBins, i, aseries);
            //console.log (aseriesName, "binnedData", aseries, binnedData, rescaleToSeries, rescaleLength, dataLength);

            const scale = rescaleToSeries ? rescaleLength / (dataLength || rescaleLength) : 1;
            this.y2Rescale = Math.min(scale, this.y2Rescale);
            return binnedData.map(function (nestedArr) {
                return nestedArr.y * scale;
            });
        }, this);

        if (removeLastEntry) { // optionally remove the dumping ground entries for values bigger than max cutoff
            countArrays.forEach(function (array) {
                array.pop();
            });
        }

        return {
            countArrays: countArrays,
            thresholds: thresholds
        };
    },

    reRandom: function (evt) {
        this.options.randomScope = evt.target.value;
        this.options.reRandom = true;
        this.render();
        return this;
    },

    // handle extra options that can be attached to attribute being shown (usually distance)
    handleExtraOptions: function () {
        const funcMeta = this.getSelectedOption("X");
        const extras = this.attrExtraOptions[funcMeta.id] || {};
        const d3el = d3.select(this.el);
        d3el.select("#distoPanelRandomOptions")
            .style("display", /*self.model.get("clmsModel").targetProteinCount > 1 && */ extras.showRandoms ? null : "none");
        d3el.select("#distoPanelMaxXValue")
            .style("display", extras.showDistMaxInput ? null : "none");
        d3el.selectAll(".c3-axis-y2,c3-axis-y2-label").style("display", extras.showY2Axis ? null : "none");
        return this;
    },

    relayout: function () {
        // fix c3 setting max-height to current height so it never gets bigger y-wise
        // See https://github.com/masayuki0812/c3/issues/1450
        d3.select(this.el).select(".c3")
            .style("max-height", "none")
            .style("position", null);
        //console.log ("RESiZING DISTOGRAM");
        this.options.dodgeTidyXAxis = false;  // retidy x axis on resize
        this.chart.resize();
        return this;
    },

    getSeriesColours: function (seriesNames) {
        const colModel = this.colourScaleModel;
        const colRange = colModel.get("colScale").range();
        const colMap = _.object(_.zip(seriesNames, colRange));
        colMap[colModel.get("undefinedLabel")] = colModel.get("undefinedColour");
        return colMap;
    },

    highlightOrSelect: function (type, c3Data, c3MouseData) {
        const seriesIndex = _.indexOf(_.pluck(c3Data, "id"), c3MouseData.id); // get the series id associated with the c3 mouse data
        const matchBasedSelection = this.getSelectedOption("X").matchLevel;
        const hidden = this.chart.internal.hiddenTargetIds;
        //console.log ("this currentBins", this.currentBins, this.options.subSeriesNames);
        if (seriesIndex === 0) { // ...and then only run this routine for the first series in the c3 dataset (could be any, important thing is just do it once)
            const bins = this.currentBins
                .filter(function (seriesBin) {
                    const seriesID = seriesBin.id;
                    const subSeries = this.options.subSeriesNames.indexOf(seriesID) >= 0;
                    const curHidden = hidden.indexOf(seriesID) >= 0;
                    return subSeries && !curHidden;
                }, this)
                .map(function (seriesBin) {
                    return seriesBin.bin[c3MouseData.index];
                })
                .filter(function (bin) {
                    return bin !== undefined;
                });
            const bin = d3.merge(bins);


            const ev = d3.event || {};
            if (matchBasedSelection) {
                const matches = _.pluck(bin, 2); // get the link data from every bin
                this.model.setMarkedMatches(type, matches, false, ev.ctrlKey || ev.shiftKey); // set marked cross links according to type and modal keys
            } else {
                const crosslinks = _.pluck(bin, 0); // get the link data from every bin
                this.model.setMarkedCrossLinks(type, crosslinks, false, ev.ctrlKey || ev.shiftKey); // set marked cross links according to type and modal keys
            }
        }
        return this;
    },

    // removes view
    // not really needed unless we want to do something extra on top of the prototype remove function (like destroy c3 view just to be sure)
    remove: function () {
        DistogramBB.__super__.remove.apply(this, arguments);
        // this line destroys the c3 chart and it's events and points the this.chart reference to a dead end
        this.chart = this.chart.destroy();
        return this;
    },

    optionsToString: function () {
        const seriesIDs = _.pluck(this.chart.data.shown(), "id");
        const funcMeta = this.getSelectedOption("X");
        return funcMeta.label + "-" + seriesIDs.join("-").toUpperCase();
    },
});

import '../../css/scatterplot.css';
import * as _ from 'underscore';
import * as $ from 'jquery';

import {BaseFrameView} from "../ui-utils/base-frame-view";
import {SearchResultsModel} from "../../../CLMS-model/src/search-results-model";
import {
    addMultipleSelectControls, ceil, commonLabels,
    crossBrowserElementX,
    crossBrowserElementY,
    declutterAxis, floor,
    makeBackboneButtons
} from "../utils";
import {radixSort} from "../modelUtils";
import d3 from "d3";
import {makeTooltipContents} from "../make-tooltip";

export const ScatterplotViewBB = BaseFrameView.extend({

    events: function() {
        let parentEvents = BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "mousemove .scatterplotBackground": "doTooltip",
            "mousemove .background": "doHighlightAndTooltip",
            "mousemove .extent": "doHighlightAndTooltip",
            "mouseleave .background": "clearHighlightAndTooltip",
            "click .jitter": "toggleJitter",
            "click .logX": "toggleLogX",
            "click .logY": "toggleLogY",
        });
    },

    defaultOptions: {
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
        exportKey: true,
        exportTitle: true,
        canHideToolbarArea: true,
        canTakeImage: true,
    },

    initialize: function(viewOptions) {
        ScatterplotViewBB.__super__.initialize.apply(this, arguments);

        this.options.attributeOptions = SearchResultsModel.attributeOptions;

        const self = this;

        this.margin = {
            top: this.options.chartTitle ? 30 : 0,
            right: 20,
            bottom: this.options.xlabel ? 40 : 25,
            left: this.options.ylabel ? 70 : 50
        };

        // targetDiv could be div itself or id of div - lets deal with that
        // Backbone handles the above problem now - element is now found in this.el
        //avoids prob with 'save - web page complete'
        const mainDivSel = d3.select(this.el).classed("scatterplotView", true);

        const flexWrapperPanel = mainDivSel.append("div")
            .attr("class", "verticalFlexContainer");

        this.controlDiv = flexWrapperPanel.append("div").attr("class", "toolbar toolbarArea");

        // Add download button
        const buttonData = [{
            class: "downloadButton2",
            label: commonLabels.downloadImg + "SVG",
            type: "button",
            id: "download"
        },];
        makeBackboneButtons(this.controlDiv, self.el.id, buttonData);

        // Add two select widgets for picking axes data types
        this.setMultipleSelectControls(this.controlDiv, this.options.attributeOptions, false);

        // Add jitter toggle checkbox
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
            }
        ];
        makeBackboneButtons(this.controlDiv, self.el.id, toggleButtonData);


        // Add the scatterplot and axes
        const chartDiv = flexWrapperPanel.append("div")
            .attr("class", "panelInner")
            .attr("flex-grow", 1)
            .style("position", "relative");

        const viewDiv = chartDiv.append("div")
            .attr("class", "viewDiv");


        // Canvas
        const canvasDiv = viewDiv.append("div")
            .style("position", "absolute")
            .style("transform", "translate(" + this.margin.left + "px," + this.margin.top + "px)")
        ;

        // canvas for drawing the current filtered and selected node sets
        this.filteredCanvas = canvasDiv.append("canvas");
        // canvas for drawing the currently highlighted node set (should be faster than redrawing everything on one canvas)
        this.highlightedCanvas = canvasDiv.append("canvas");
        [this.filteredCanvas, this.highlightedCanvas].forEach (function (canvas) {
            canvas.attr("class", "toSvgImage").style("position", "absolute").style("transform", "translate(0px,0px)");
        });

        // Scales
        this.x = d3.scale.linear();
        this.y = d3.scale.linear();

        // SVG element
        this.svg = viewDiv.append("svg");

        this.vis = this.svg.append("g")
            .attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")");

        this.scatg = this.vis.append("g");
        //this.scatg.append("rect")
        //    .attr ("class", "scatterplotBackground")
        //;

        // Axes setup
        this.xAxis = d3.svg.axis().scale(this.x).orient("bottom").tickFormat(self.options.standardTickFormat);
        this.yAxis = d3.svg.axis().scale(this.y).orient("left").tickFormat(self.options.standardTickFormat);

        this.vis.append("g")
            .attr("class", "y axis");

        this.vis.append("g")
            .attr("class", "x axis");


        // Add labels
        const labelInfo = [{
            class: "axis",
            text: this.options.xlabel,
            dy: "0em"
        },
            {
                class: "axis",
                text: this.options.ylabel,
                dy: "1em"
            },
            {
                class: "chartHeader",
                text: this.options.chartTitle,
                dy: "-0.5em"
            },
        ];

        this.vis.selectAll("g.label")
            .data(labelInfo)
            .enter()
            .append("g")
            .attr("class", "label")
            .append("text")
            .attr("class", function(d) {
                return d.class;
            })
            .text(function(d) {
                return d.text;
            })
            .attr("dy", function(d) {
                return d.dy;
            });

        // Brush
        const brushEnded = function (options) {
            options = options || {};
            options.extent = self.brush.extent();
            options.add = d3.event.ctrlKey || d3.event.shiftKey || (d3.event.sourceEvent ? d3.event.sourceEvent.ctrlKey || d3.event.sourceEvent.shiftKey : false);
            self.selectPoints(options);
        };

        const brushSnap = function () {
            if (d3.event.sourceEvent.type === "brush") {
                return;
            }
            const meta = self.getBothAxesMetaData();
            const selection = self.brush.extent();

            const adjs = meta.map(function (m) {
                return Math.pow(10, -m.decimalPlaces) / 2;
            });

            const expandOrShrink = function (selection, shrink) {
                const sign = shrink ? 1 : -1;
                return selection.map(function (corner, i) {
                    const gCorner = corner.slice();
                    gCorner[0] -= (adjs[0] * sign * (i === 0 ? -1 : 1));
                    gCorner[1] -= (adjs[1] * sign * (i === 0 ? -1 : 1));
                    return gCorner;
                });
            };

            const shrunkSelection = expandOrShrink(selection, true);

            const newSelection = shrunkSelection.map(function (corner) {
                return corner.map(function (v, axisIndex) {
                    return d3.round(d3.round(v, 10), meta[axisIndex].decimalPlaces);
                });
                // sometimes numbers like 3.5 get rounded to 3.499999999999996 in javascript
                // then d3.round (3.49999999996, 0) returns 3, not what we want
                // so doing d3.round (3.49999999996, 10) return 3.5, then d3.round (3.5, 0) returns 4 which is what we want
            });

            const generousSelection = expandOrShrink(newSelection, false);

            //console.log ("d1", selection[0][0], selection[1][0], "old", shrunkSelection[0][0], shrunkSelection[1][0], "new", newSelection[0][0], newSelection[1][0], "generous", generousSelection[0][0], generousSelection[1][0], self.brush.extent(), d3.event);

            if (!_.isEqual(selection, generousSelection)) {
                self.brush.extent(generousSelection);
                self.scatg.select(".brush").call(self.brush); // recall brush binding so background rect is resized and brush redrawn
                ["n", "e"].forEach(function (orient, i) {
                    self.scatg.select(".resize." + orient + " text").text("[" + newSelection[0][i] + " to " + newSelection[1][i] + "]"); // for brush extent labelling
                });
            }
        };
        this.brush = d3.svg.brush()
            .x(self.x)
            .y(self.y)
            //.clamp ([false, false])
            .on("brush", brushSnap)
            .on("brushend", function() {
                brushEnded({
                    select: true
                });
            });

        // Restore when match selection is sorted out
        this.scatg.append("g")
            .attr("class", "brush")
            .call(self.brush);


        this.scatg.select(".resize.n").append("text");
        this.scatg.select(".resize.e").append("text");

        this.scatg.select(".brush")
            .on("mouseover", function() {
                self.scatg.select(".brush").selectAll("text").transition().duration(500).style("opacity", 1);
            })
            .on("mouseout", function() {
                self.scatg.select(".brush").selectAll("text").transition().duration(500).style("opacity", 0);
            });


        // Listen to these events (and generally re-render in some fashion)
        // if highlighted/selection matches change, or colour model change, then recolour cross links
        this.listenTo(this.model, "selectionMatchesLinksChanged change:linkColourAssignment currentColourModelChanged", this.recolourCrossLinks);
        this.listenTo(this.model, "highlightsMatchesLinksChanged", this.rehighlightCrossLinks);
        this.listenTo(this.model, "filteringDone", function() { this.renderCrossLinks({isFiltering: true}); });
        this.listenTo(this.model.get("clmsModel"), "change:distancesObj", this.ifADistanceAxisRerender);
        this.listenTo(vent, "PDBPermittedChainSetsUpdated changeAllowInterModelDistances", this.ifADistanceAxisRerender);
        this.listenTo(vent, "linkMetadataUpdated", function(metaMetaData) {
            //console.log ("HELLO", arguments);
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
            //console.log ("NEW OPTIONS", newOptions);

            const toolbar = mainDivSel.select("div.toolbar");
            self.setMultipleSelectControls(toolbar, newOptions, true);
        });

        this.axisChosen().render(); // initial render with defaults
    },

    takeImage: function(event, thisSVG) {
        return this.downloadSVGWithCanvas ();
    },

    ifADistanceAxisRerender: function () {
        const distanceAxes = this.getBothAxesMetaData().filter(function (axis) {
            return axis.id === "Distance";
        });
        if (distanceAxes.length) {
            console.log ("RERENDER SCATTERPLOT ON DISTANCE CHANGE");
            this.axisChosen().render();
        }
    },

    setMultipleSelectControls: function(elem, options, keepOld) {
        const self = this;
        addMultipleSelectControls({
            addToElem: elem,
            selectList: ["X", "Y"],
            optionList: options,
            keepOldOptions: keepOld || false,
            selectLabelFunc: function(d) {
                return "Plot This Data On The " + d + " Axis ►";
            },
            optionLabelFunc: function(d) {
                return d.label;
            },
            optionValueFunc: function(d) {
                return d.id;
            },
            changeFunc: function() {
                self.axisChosen().render();
            },
            idFunc: function(d) {
                return d.id;
            },
        });
    },

    // options.extent = area of selection in data coordinates if we're not picking it up from the brush
    // options.add = add to existing selections
    // options.select = true for selections, false for highlight
    selectPoints: function(options) {
        options = options || {};
        const xAxisData = this.getAxisData("X", true);
        const yAxisData = this.getAxisData("Y", true);
        const xData = xAxisData.data;
        const yData = yAxisData.data;
        const filteredCrossLinks = this.getFilteredCrossLinks();
        const extent = options.extent || this.brush.extent();
        const matchLevel = xAxisData.matchLevel || yAxisData.matchLevel;
        const exmin = extent[0][0],
            exmax = extent[1][0],
            eymin = extent[0][1],
            eymax = extent[1][1];

        const add = options.add || false;
        const type = options.select ? "selection" : "highlights";
        //console.log ("type", options, type, matchLevel, xAxisData);

        // set up for calculating nearest datum to mouse position
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

        //console.log ("nearest", nearest);
        this.nearest = nearest;
    },

    relayout: function(descriptor) {
        if (descriptor && descriptor.dragEnd) { // avoids doing two renders when view is being made visible
            this.render();
        }
        return this;
    },

    toggleJitter: function() {
        this.options.jitter = !this.options.jitter;
        this.render();
        return this;
    },

    toggleLogX: function(evt) {
        const checked = d3.select(evt.target).property("checked");
        this.options.logX = checked;
        return this
            .axisChosen() // redo all axis information
            .render();
    },

    toggleLogY: function(evt) {
        const checked = d3.select(evt.target).property("checked");
        this.options.logY = checked;
        return this
            .axisChosen() // redo all axis information
            .render();
    },

    getData: function(funcMeta, filteredFlag, optionalLinks) {
        const linkFunc = funcMeta ? (filteredFlag ? funcMeta.linkFunc : funcMeta.unfilteredLinkFunc) : undefined;
        const crosslinks = optionalLinks ||
            (filteredFlag ? this.getFilteredCrossLinks() : this.model.getAllCrossLinks());
        const data = crosslinks.map(function (c) {
            return linkFunc ? linkFunc.call(this, c) : [undefined];
        }, this);
        return data;
    },

    getSelectedOption: function(axisLetter) {
        let funcMeta;

        this.controlDiv
            .selectAll("select")
            .filter(function(d) {
                return d === axisLetter;
            })
            .selectAll("option")
            .filter(function() {
                return d3.select(this).property("selected");
            })
            .each(function(d) {
                funcMeta = d;
            })
        ;

        return funcMeta;
    },

    getFilteredCrossLinks: function() {
        return this.model.getFilteredCrossLinks("all"); // include decoys and linears for this view
    },

    getAxisData: function(axisLetter, filteredFlag, optionalLinks) {
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
    },

    getBothAxesMetaData: function() {
        return ["X", "Y"].map(this.getSelectedOption, this);
    },

    isLinearScale: function(scale) {
        const domain = scale.domain();
        const bottomVal = scale(domain[0]);
        const fullRange = Math.abs(scale(domain[1]) - bottomVal);
        const halfRange = Math.abs(scale(d3.mean(domain)) - bottomVal);
        return (fullRange / halfRange) >= (2 - 0.001); // -0.0001 for rounding
    },

    setValidEmptyBrushExtent: function() {
        this.brush.extent([
            [this.x.domain()[0], this.y.domain()[0]],
            [this.x.domain()[0], this.y.domain()[0]]
        ]);
    },

    makeXAxisType: function(setAsLogScale) {
        if (setAsLogScale === this.isLinearScale(this.x)) { // only if different scale type is required
            this.x = setAsLogScale ? d3.scale.log() : d3.scale.linear();
            this.xAxis.scale(this.x);
            this.brush.x(this.x);
        }
        return this;
    },

    makeYAxisType: function(setAsLogScale) {
        if (setAsLogScale === this.isLinearScale(this.y)) { // only if different scale type is required
            this.y = setAsLogScale ? d3.scale.log() : d3.scale.linear();
            this.yAxis.scale(this.y);
            this.brush.y(this.y);
        }
        return this;
    },

    axisChosen: function() {
        const dataX = this.getAxisData("X", false);
        const dataY = this.getAxisData("Y", false);

        this.xAxis.tickFormat(dataX.tickFormat);
        this.yAxis.tickFormat(dataY.tickFormat);

        // swap out log or linear scales if current scale is different to incoming scale type
        this.makeXAxisType(dataX.canLogAxis && this.options.logX);
        this.makeYAxisType(dataY.canLogAxis && this.options.logY);

        const rootid = "#" + d3.select(this.el).attr("id");
        d3.select(this.el).select(rootid + "logx").style("display", dataX.canLogAxis ? null : "none");
        d3.select(this.el).select(rootid + "logy").style("display", dataY.canLogAxis ? null : "none");

        // make brush extent empty when new axis chosen. Make sure it's a valid value i.e. no zeroes in a log scale
        this.setValidEmptyBrushExtent();

        this.scaleAxes(dataX, dataY);

        // Update x/y labels and axes tick formats
        const self = this;
        this.vis.selectAll("g.label text").data([dataX, dataY])
            .text(function(d, i) {
                return (d.canLogAxis && self.options[i === 0 ? "logX" : "logY"] ? "Log " : "") + d.label;
            });

        if (!this.brush.empty()) {
            this.model.setMarkedCrossLinks("highlights", [], false, false);
        }
        this.brush.clear();

        return this;
    },

    scaleAxes: function(datax, datay) {
        const directions = [{
            dataDetails: datax,
            scale: this.x
        },
            {
                dataDetails: datay,
                scale: this.y
            },
        ];

        directions.forEach(function(direction) {
            let dom = d3.extent(d3.merge(direction.dataDetails.data));
            if (dom[0] === undefined || !_.isNumber(dom[0])) {
                dom = [0, 0];
            }
            if (direction.dataDetails.zeroBased && _.isNumber(dom[0])) {
                dom[0] = d3.min([0, dom[0]]);
            }
            dom = dom.map(function(v, i) {
                return _.isNumber(v) ? Math[i === 0 ? "floor" : "ceil"](v) : v;
            });

            const log = direction.dataDetails.canLogAxis;
            if (log) {
                dom[0] = direction.dataDetails.logStart;
            }
            //var leeway = Math.ceil (Math.abs(dom[1] - dom[0]) / 10) / 2;
            //dom[0] -= xLeeway; // 0.5;
            //dom[1] += 0.5;
            direction.scale.domain(dom);
            //console.log ("DOM", dom, direction.scale, direction.scale.domain());
        });

        this.calcJitterRanges();

        return this;
    },

    doHighlightAndTooltip: function(evt) {
        return this.doHighlight(evt).doTooltip(evt);
    },

    getHighlightRange: function(evt, squarius) {
        const background = d3.select(this.el).select(".background").node();
        const margin = this.options.chartMargin;
        const x = crossBrowserElementX(evt, background) + margin;
        const y = crossBrowserElementY(evt, background) + margin;
        const sortFunc = function (a, b) {
            return a - b;
        };
        const xrange = [this.x.invert(x - squarius), this.x.invert(x + squarius)].sort(sortFunc);
        const yrange = [this.y.invert(y - squarius), this.y.invert(y + squarius)].sort(sortFunc);
        return {
            xrange: xrange,
            yrange: yrange,
            mousePosition: {
                px: x,
                py: y
            }
        };
    },

    doTooltip: function(evt) {
        const axesMetaData = this.getBothAxesMetaData();
        const highlightRange = this.getHighlightRange(evt, 20);
        const vals = [highlightRange.xrange, highlightRange.yrange];
        let inBetweenValidValues = false;

        let tooltipData = axesMetaData.map(function (axisMetaData, i) {
            const commaFormat = d3.format(",." + axisMetaData.decimalPlaces + "f");

            //hack
            const utils = {};
            utils["ceil"] = ceil;
            utils["floor"] = floor;

            const rvals = ["ceil", "floor"].map(function (func, ii) {
                let v = utils[func](vals[i][ii], axisMetaData.decimalPlaces);
                if (v === 0) {
                    v = 0;
                } // gets rid of negative zero
                return v;
            });
            const fvals = rvals.map(commaFormat);
            inBetweenValidValues |= (rvals[0] > rvals[1]);
            return [axisMetaData.label, rvals[0] > rvals[1] ? "---" : fvals[0] + (fvals[0] === fvals[1] ? "" : " to " + fvals[1])];
        });

        if (inBetweenValidValues) {
            tooltipData = [];
        }

        const isMatchLevel = axesMetaData.some(function (axmd) {
            return axmd.matchLevel;
        });
        const size = this.selectSize;
        const levelText = isMatchLevel ? (size === 1 ? "Match" : "Matches") : (size === 1 ? "Cross-Link" : "Cross-Links");

        if (this.nearest && this.nearest.link) {
            const tipExtra = isMatchLevel ? makeTooltipContents.match(this.nearest.match) :
                makeTooltipContents.link(this.nearest.link);
            tooltipData = tooltipData.concat([
                ["&nbsp;"],
                ["Nearest " + (isMatchLevel ? "Match" : "Cross-Link")]
            ]).concat(tipExtra);
        }

        if (!this.nearest.link) {
            tooltipData = null;
        }

        this.model.get("tooltipModel")
            .set("header", "Highlighting " + (d3.format(",")(size)) + " " + levelText)
            .set("contents", tooltipData)
            .set("location", evt);
        this.trigger("change:location", this.model, evt); // necessary to change position 'cos d3 event is a global property, it won't register as a change
        return this;
    },

    doHighlight: function(evt) {
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
    },

    clearHighlightAndTooltip: function() {
        return this.clearHighlight().clearTooltip();
    },

    clearTooltip: function() {
        this.model.get("tooltipModel").set("contents", null);
        return this;
    },

    clearHighlight: function() {
        this.model.setMarkedCrossLinks("highlights", [], false, false);
        return this;
    },

    render: function() {
        if (this.isVisible()) {
            console.log("SCATTERPLOT RENDER");
            this
                .resize()
                .renderCrossLinks({
                    isVisible: true
                });
        }
        return this;
    },


    recolourCrossLinks: function() {
        this.renderCrossLinks({recolourOnly: true});
        return this;
    },

    rehighlightCrossLinks: function() {
        this.renderCrossLinks({rehighlightOnly: true});
        return this;
    },

    renderCrossLinks: function (renderOptions) {
        renderOptions = renderOptions || {};

        if (renderOptions.isVisible || this.isVisible()) {

            //console.log ("renderOptions", renderOptions);

            const highlightsOnly = renderOptions.rehighlightOnly;
            const pointSize = this.options.pointSize;
            const halfPointSize = pointSize / 2;

            //var self = this;
            const colourScheme = this.model.get("linkColourAssignment");

            const filteredCrossLinks = this.getFilteredCrossLinks();
            const highlightedCrossLinkIDs = d3.set(_.pluck(this.model.getMarkedCrossLinks("highlights"), "id"));
            let selectedCrossLinkIDs = d3.set();

            const selectedMatchMap = this.model.getMarkedMatches("selection");
            const highlightedMatchMap = this.model.getMarkedMatches("highlights");

            let sortedFilteredCrossLinks;
            if (highlightsOnly) {
                sortedFilteredCrossLinks = filteredCrossLinks.filter (function (link) { return highlightedCrossLinkIDs.has(link.id); });
            } else {
                selectedCrossLinkIDs = d3.set(_.pluck(this.model.getMarkedCrossLinks("selection"), "id"));
                sortedFilteredCrossLinks = radixSort (4, filteredCrossLinks, function(link) {
                    return highlightedCrossLinkIDs.has(link.id) ? 3 : (selectedCrossLinkIDs.has(link.id) ? 2 : (link.isDecoyLink() ? 0 : 1));
                });
            }


            const makeCoords = function (datax, datay) {
                return datax.data.map(function (xd, i) {
                    const yd = datay.data[i];
                    let pairs;
                    if (xd.length === 1) {
                        pairs = yd.map(function (d) {
                            return [xd[0], d];
                        });
                    } else if (yd.length === 1) {
                        pairs = xd.map(function (d) {
                            return [d, yd[0]];
                        });
                    } else {
                        pairs = xd.map(function (d, i) {
                            return [d, yd[i]];
                        });
                    }

                    // get rid of pairings where one of the values is undefined
                    pairs = pairs.filter(function (pair) {
                        return pair[0] !== undefined && pair[1] !== undefined;
                    });

                    return pairs;
                });
            };

            const p = performance.now();

            const contexts = [
                {d3canvas: this.filteredCanvas, clear: !highlightsOnly},
                {d3canvas: this.highlightedCanvas, clear: true}
            ].map(function (canvasInfo) {
                const canvasNode = canvasInfo.d3canvas.node();
                const context = canvasNode.getContext("2d");
                //context.fillStyle = this.options.background;
                if (canvasInfo.clear) {
                    context.clearRect(0, 0, canvasNode.width, canvasNode.height);
                }
                context.imageSmoothingEnabled = false;
                return context;
            }, this);
            const ctx = contexts[0];
            const hctx = contexts[1];

            // set constant styles for highlighted canvas
            hctx.fillStyle = this.options.highlightedColour;
            hctx.strokeStyle = "black";

            const datax = this.getAxisData("X", true, sortedFilteredCrossLinks);
            const datay = this.getAxisData("Y", true, sortedFilteredCrossLinks);

            const matchLevel = datax.matchLevel || datay.matchLevel;
            const coords = makeCoords(datax, datay);
            const jitterOn = this.options.jitter;
            //console.log ("ddd", datax, datay, filteredCrossLinks, coords, colourScheme);

            const countable = colourScheme.isCategorical();
            const counts = countable ? d3.range(0, colourScheme.getDomainCount() + 1).map(function () {
                return 0;
            }) : [];

            sortedFilteredCrossLinks.forEach(function(link, i) {
                const decoy = link.isDecoyLink();
                const linkValue = colourScheme.getValue(link);
                let linkDomainInd = colourScheme.getDomainIndex(link);
                const colour = colourScheme.getColourByValue(linkValue);

                let high, selected, ambig;
                if (!matchLevel) {
                    high = highlightedCrossLinkIDs.has(link.id);
                    ambig = link.ambiguous;
                    if (!highlightsOnly) { // skip setting non-highlighted canvas styles if this is a highlighted link
                        selected = selectedCrossLinkIDs.has(link.id);
                        ctx.fillStyle = selected ? this.options.selectedColour : colour;
                        ctx.strokeStyle = selected ? "black" : (decoy || ambig ? ctx.fillStyle : null);
                    }
                }

                // try to make jitter deterministic so points don't jump on filtering, recolouring etc
                const xjr = jitterOn ? this.getXJitter(link) : 0;
                const yjr = jitterOn ? this.getYJitter(link) : 0;

                coords[i].forEach(function(coord, ii) {
                    //var xr = (Math.random() - 0.5);
                    //var yr = (Math.random() - 0.5);
                    if (matchLevel) {
                        const match = link.filteredMatches_pp[ii].match;
                        high = highlightedMatchMap.has(match.id);
                        ambig = match.isAmbig();
                        if (!highlightsOnly) {  // skip setting non-highlighted canvas styles if this is a highlighted match
                            selected = selectedMatchMap.has(match.id);
                            ctx.fillStyle = selected ? this.options.selectedColour : colour;
                            ctx.strokeStyle = selected ? "black" : (decoy || ambig ? ctx.fillStyle : null);
                        }
                    }

                    let x = this.x(coord[0]) + xjr - halfPointSize;
                    let y = this.y(coord[1]) + yjr - halfPointSize;
                    if (x === x && y === y) { // Quick test for either of x or y being a NaN

                        if (high || !highlightsOnly) {
                            const context = (high && highlightsOnly) ? hctx : ctx;
                            x = Math.round(x); // the rounding and 0.5s are to make fills and strokes crisp (i.e. not anti-aliasing)
                            y = Math.round(y);

                            if (decoy) {
                                //var offset = Math.floor (halfPointSize);
                                context.strokeRect(x - 0.5, y - 0.5, pointSize, pointSize);
                                //ctx.fillRect (x, y + offset, pointSize + 1, 1);
                                //ctx.fillRect (x + offset, y, 1, pointSize + 1);
                            } else {
                                if (ambig) {
                                    context.globalAlpha = 0.7;
                                }
                                context.fillRect (x, y, pointSize, pointSize);
                                if (ambig) {
                                    context.globalAlpha = 1;
                                    context.setLineDash([3]);
                                    context.strokeRect(x - 0.5, y - 0.5, pointSize, pointSize);
                                    context.setLineDash([]);
                                } else if (high || selected) {
                                    context.strokeRect(x - 0.5, y - 0.5, pointSize, pointSize);
                                }

                                if (countable) {
                                    if (linkDomainInd === undefined) {
                                        linkDomainInd = counts.length - 1;
                                    }
                                    counts[linkDomainInd]++;
                                }
                            }
                        }
                    }
                }, this);
            }, this);

            /*
            if (options.isFiltering) {
                this.redrawAxes (this.getSizeData());
            }
            */

            //console.log ("scatter render", renderOptions, (performance.now() - p)/1000, "s");

            // Remove unknown from appearing in title if no data falls into this category
            //console.log ("COUNTS", this.counts);
            if (!highlightsOnly) {
                if (_.last(counts) === 0) {
                    counts.pop();
                }
                this.makeChartTitle(counts, colourScheme, d3.select(this.el).select(".chartHeader"), matchLevel);
            }
        }
        return this;
    },

    getXJitter: function(link) {
        return (((link.fromResidue % 10) / 10) - 0.45) * this.jitterRanges.x;
    },

    getYJitter: function(link) {
        return (((link.fromResidue % 10) / 10) - 0.45) * this.jitterRanges.y;
    },

    getXPosition: function(xCoord, xJitter) {
        return this.x(xCoord) + xJitter;
    },

    getYPosition: function(yCoord, yJitter) {
        return this.y(yCoord) + yJitter;
    },

    getSizeData: function() {
        // Firefox returns 0 for an svg element's clientWidth/Height, so use zepto/jquery width function instead
        const jqElem = $(this.svg.node());
        const cx = jqElem.width(); //this.svg.node().clientWidth;
        const cy = jqElem.height(); //this.svg.node().clientHeight;
        const width = Math.max(0, cx - this.margin.left - this.margin.right);
        const height = Math.max(0, cy - this.margin.top - this.margin.bottom);
        // if it's going to be square and fit in containing div
        const minDim = Math.min(width, height);

        return {
            cx: cx,
            cy: cy,
            width: width,
            height: height,
            minDim: minDim,
        };
    },

    calcJitterRanges: function() {
        this.jitterRanges = this.jitterRanges || {};
        const xunit = Math.abs(this.x(this.x.domain()[0]) - this.x(this.x.domain()[0] + 1));
        this.jitterRanges.x = Math.max(2, xunit / 3);
        const yunit = Math.abs(this.y(this.y.domain()[0]) - this.y(this.y.domain()[0] + 1));
        this.jitterRanges.y = Math.max(2, yunit / 3);
        return this;
    },

    // called when things need repositioned, but not re-rendered from data
    resize: function() {

        const sizeData = this.getSizeData();

        this.vis
            .style("width", sizeData.width + "px")
            .style("height", sizeData.height + "px");

        this.scatg.select(".scatterplotBackground")
            .attr("width", sizeData.width)
            .attr("height", sizeData.height);

        this.filteredCanvas
            .attr("width", sizeData.width)
            .attr("height", sizeData.height)
            .classed ("backdrop", true)
        ;

        this.highlightedCanvas
            .attr("width", sizeData.width)
            .attr("height", sizeData.height)
        ;

        const extent = this.brush.extent(); // extent saved before x and y ranges updated
        const chartMargin = this.options.chartMargin;

        this.x.range([chartMargin, sizeData.width - chartMargin]);
        this.y.range([sizeData.height - chartMargin, chartMargin]); // y-scale (inverted domain)

        // https://stackoverflow.com/questions/32720469/d3-updating-brushs-scale-doesnt-update-brush

        this.brush.extent(extent); // old extent restored
        //console.log ("BRUISH EXTENT", extent);
        this.scatg.select(".brush").call(this.brush); // recall brush binding so background rect is resized and brush redrawn

        this.xAxis.ticks(Math.round((sizeData.width - (chartMargin * 2)) / 40)).outerTickSize(0);
        this.yAxis.ticks(Math.round((sizeData.height - (chartMargin * 2)) / 40)).outerTickSize(0);

        this
            .redrawAxes(sizeData)
            .repositionLabels(sizeData)
            .calcJitterRanges();

        return this;
    },

    redrawAxes: function(sizeData) {
        this.vis.select(".x")
            .attr("transform", "translate(0," + (sizeData.height) + ")")
            .call(this.xAxis)
        ;

        this.vis.select(".y")
            .attr("transform", "translate(-1,0)")
            .call(this.yAxis)
        ;

        declutterAxis(this.vis.select(".x"));
        declutterAxis(this.vis.select(".y"));

        return this;
    },

    // Used to do this just on resize, but rectangular areas mean labels often need re-centred on panning
    repositionLabels: function(sizeData) {
        // reposition labels
        const labelCoords = [{
            x: sizeData.width / 2,
            y: sizeData.height + this.margin.bottom - 5,
            rot: 0
        },
            {
                x: -this.margin.left,
                y: sizeData.height / 2,
                rot: -90
            },
            {
                x: sizeData.width / 2,
                y: 0,
                rot: 0
            }
        ];
        this.vis.selectAll("g.label text")
            .data(labelCoords)
            .attr("transform", function(d) {
                return "translate(" + d.x + " " + d.y + ") rotate(" + d.rot + ")";
            });
        return this;
    },

    canvasImageParent: "svg > g > g", // where to put image made from canvas for downloading svg file

    identifier: "Scatterplot",

    optionsToString: function() {
        const meta = this.getBothAxesMetaData();
        let axisLabels = _.pluck(meta, "label");

        if (!this.brush.empty()) {
            const axisExtents = [];
            d3.select(this.el).selectAll(".brush text")
                .each(function() {
                    axisExtents.push(d3.select(this).text());
                });
            axisLabels = axisLabels.map(function(axisLabel, i) {
                return axisLabel + "_(" + axisExtents[i] + ")";
            });
        }
        return (this.options.jitter ? "Jitter_" : "") + axisLabels.join("_by_");
    },
});

import * as _ from "underscore";
import * as d3 from "d3";
import {Peak} from "./Peak";
import {matchMassToAA} from "../matchMassToAA";

/**
 * Creates an interactive mass spectrum graph visualization using D3.js.
 * Handles rendering of peaks, annotations, zooming, panning, and interactive features.
 *
 * @class Graph
 * @param {d3.selection} targetSvg - D3 selection of the SVG element to render into
 * @param {AnnotatedSpectrumModel} model - The data model containing spectrum information
 * @param {Object} options - Configuration options for the graph
 * @param {string} [options.id] - Identifier for this graph instance
 * @param {string} [options.title] - Title to display above the graph
 * @param {string} [options.xlabel] - Label for x-axis
 * @param {string} [options.ylabelLeft] - Label for left y-axis
 * @param {string} [options.ylabelRight] - Label for right y-axis
 * @param {boolean} [options.butterfly=false] - Whether to render in butterfly mode
 * @param {boolean} [options.invert=false] - Whether to invert the graph orientation
 * @param {boolean} [options.hidden=false] - Whether the graph is initially hidden
 * @param {string} [options.measureTooltipSvgG] - Selector for measure tooltip container
 * @property {d3.scale.linear} xscale - D3 scale for x-axis (m/z values)
 * @property {d3.scale.linear} yscale - D3 scale for left y-axis (intensity)
 * @property {d3.scale.linear} yscale_right - D3 scale for right y-axis (% of base peak)
 * @property {AnnotatedSpectrumModel} model - Reference to the data model
 * @property {Object} options - Graph configuration options
 * @property {boolean} yZoomed - Whether y-axis has been zoomed by user
 * @property {Object} margin - Margins around the plot area
 * @property {Peak[]} peaks - Array of Peak objects representing spectrum peaks
 */
export const Graph = function (targetSvg, model, options) {
    this.xscale = d3.scale.linear();
    this.yscale = d3.scale.linear();
    this.yscale_right = d3.scale.linear();
    this.model = model;
    this.options = options;
    this.yZoomed = false;
    this.margin = {
        "top": options.title ? 130 : 110,
        "right": options.ylabelRight ? 60 : 45,
        "bottom": options.xlabel ? 50 : 20,
        "left": options.ylabelLeft ? 65 : 30
    };

    this.g = targetSvg.append("g").attr("class", "spectrum");

    this.plot = this.g.append("rect")
        .attr("class", "xispec_plotBackground")
        .style("fill", "white")
        .attr("pointer-events", "visible")
        .style("cursor", "e-resize");

    // create rect for yzoom on left and right y axis
    this.yZoomRectLeft = this.g.append("svg:rect")
        .attr("class", "zoom y box")
        .style("visibility", "hidden")
        .style("cursor", "s-resize")
        .attr("pointer-events", "all");
    this.yZoomRectRight = this.g.append("svg:rect")
        .attr("class", "zoom y box")
        .style("visibility", "hidden")
        .style("cursor", "s-resize")
        .attr("pointer-events", "all");
    this.plotBackgroundLabel = this.g.append("text")
        .attr("visibility", "hidden")
        .attr("opacity", "0.4")
        .attr("style", "text-anchor: middle; pointer-events: none; font-size: 2em;");
    if (this.options.id === "originalSpectrum") {
        this.plotBackgroundLabel.text("original").attr("fill", "grey");
    } else {
        this.plotBackgroundLabel.text("re-annotation").attr("fill", "rgb(53 117 255)");
    }

    this.measureBackground = this.g.append("rect")
        .attr("width", "0")
        .style("fill", "white")
        .style("cursor", "crosshair")
        .attr("pointer-events", "visible");

    this.innerSVG = this.g.append("g").attr("class", "innerSpectrum");

    this.xaxisSVG = this.g.append("g").attr("class", "x axis");

    //brush
    this.brush = d3.svg.brush().x(this.xscale);

    this.xaxisZoomRect = this.g.append("rect")
        .attr("height", "25")
        .attr("opacity", 0)
        .attr("pointer-events", "all")
        .style("cursor", "crosshair");
    this.xaxisZoomRect.call(this.brush);

    this.yAxisLeftSVG = this.g.append("g")
        .attr("class", "y axis")
        .attr("pointer-events", "none");
    this.yAxisRightSVG = this.g.append("g")
        .attr("class", "y axis")
        .attr("pointer-events", "none");
    this.dragZoomHighlight = this.innerSVG.append("rect").attr("y", 0).attr("width", 0).attr("fill", "#addd8e");

    this.plot.on("click", function () {
        this.model.clearStickyHighlights();
    }.bind(this));

    //Tooltip
    this.tooltipIsBBModel = options.compositeModelInst !== undefined;
    if (this.tooltipIsBBModel)
        this.tooltip = options.compositeModelInst.get("tooltipModel");
    else {
        // target = this.g.node().parentNode.parentNode; //this would get you #spectrumPanel
        this.tooltip = d3.select("body").append("span")
            .attr("class", "xispec_tooltip");
    }

    this.highlights = this.innerSVG.append("g").attr("class", "peakHighlights");
    this.peaksSVG = this.innerSVG.append("g").attr("class", "peaks");
    this.lossyAnnotations = this.innerSVG.append("g").attr("class", "lossyAnnotations");
    this.annotations = this.innerSVG.append("g").attr("class", "annotations");

    //MeasuringTool
    this.measuringTool = this.innerSVG.append("g").attr("class", "measuringTool");
    this.measuringToolVLineStart = this.measuringTool.append("line")
        .attr("stroke-width", 1)
        .attr("stroke", "Black");
    this.measuringToolVLineEnd = this.measuringTool.append("line")
        .attr("stroke-width", 1)
        .attr("stroke", "Black");
    this.measuringToolLine = this.measuringTool.append("line")
        .attr("y1", 50)
        .attr("y2", 50)
        .attr("stroke-width", 1)
        .attr("stroke", "Red");
    this.measureDistance = this.measuringTool.append("text")
        .attr("text-anchor", "middle")
        .attr("pointer-events", "none");

    this.measureTooltip = d3.select(this.options.measureTooltipSvgG).append("g")
        .attr("style", "text-anchor: middle;");
    this.measureTooltipBackground = this.measureTooltip.append("rect")
        .attr("x", 0)
        .attr("y", 0)
        .attr("fill", "rgb(200,200,200)")
        .attr("fill-opacity", "0.5")
        .attr("stroke-opacity", "0.5")
        .attr("stroke-width", "1px")
        .attr("stroke", "rgb(100,100,100)");
    this.measureTooltipText = [];
    this.measureTooltipText["from"] = this.measureTooltip.append("text");
    this.measureTooltipText["to"] = this.measureTooltip.append("text");
    this.measureTooltipText["match"] = this.measureTooltip.append("text");
    this.measureTooltipText["masses"] = this.measureTooltip.append("g")
        .attr("class", "xispec_measureMasses");

    // add Chart Title
    if (options.title) {
        this.title = this.g.append("text")
            .attr("class", "axis")
            .text(options.title)
            .attr("dy", "-0.8em")
            .style("text-anchor", "middle");
    }
    // add the x-axis label
    if (options.xlabel) {
        this.xlabel = this.g.append("text")
            .attr("class", "aWWWAAAAAxis")
            .text(options.xlabel)
            .attr("dy", "2.4em")
            .style("text-anchor", "middle").style("pointer-events", "none");
    }
    // add y-axis label
    if (options.ylabelLeft) {
        this.ylabelLeft = this.g.append("g").append("text")
            .attr("class", "axis")
            .text(options.ylabelLeft)
            .style("text-anchor", "middle").style("pointer-events", "none");
    }
    // add 2nd y-axis label
    if (options.ylabelRight) {
        this.ylabelRight = this.g.append("g").append("text")
            .attr("class", "axis")
            .text(options.ylabelRight)
            .style("text-anchor", "middle").style("pointer-events", "none");
    }

    this.zoom = d3.behavior.zoom().x(this.xscale).on("zoom", this.redraw());
    this.yzoom = d3.behavior.zoom().y(this.yscale).on("zoom", this.redraw());

};

/**
 * Initializes the graph with spectrum data from the model.
 * Creates Peak objects for each peak in the data and renders them.
 *
 * @method setData
 */
Graph.prototype.setData = function () {
    //create peaks array with Peaks
    this.peaks = [];
    if (this.model.get("JSONdata")) {
        for (let i = 0; i < this.model.get("JSONdata").peaks.length; i++) {
            this.peaks.push(new Peak(i, this));
        }

        // draw non_fragment_peaks first then add fragment_peaks on top
        // for correct z-layering
        this.non_fragment_peaks = this.peaks.filter(
            function (p) {
                if (p.fragments.length === 0) return true;
            });
        this.non_fragment_peaks.forEach(function (p) {
            p.draw();
        });

        this.fragment_peaks = this.peaks.filter(
            function (p) {
                if (p.fragments.length > 0) return true;
            });
        this.fragment_peaks.forEach(function (p) {
            p.draw();
        });

        this.updatePeakColors();

    }

    this.margin.top = this.model.isLinear ? 80 : 120;
    // if (this.options.butterfly)
    // 	this.margin.bottom += (this.model.isLinear) ? 20 : 45;

    this.g.attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")");

    if (this.model.get("zoomLocked")) {
        this.resize(this.model.get("mzRange")[0], this.model.get("mzRange")[1], this.model.ymin, this.model.ymax);
        this.disableZoom();
    } else {
        this.resize(this.model.xminPrimary, this.model.xmaxPrimary,
            this.model.ymin, this.model.ymaxPrimary);
        this.enableZoom();
    }
};

/**
 * Resizes and redraws the graph to fit the specified data range.
 * Updates scales, axes, and all visual elements.
 *
 * @method resize
 * @param {number} xmin - Minimum m/z value to display
 * @param {number} xmax - Maximum m/z value to display
 * @param {number} ymin - Minimum intensity value
 * @param {number} ymax - Maximum intensity value
 */
Graph.prototype.resize = function (xmin, xmax, ymin, ymax) {

    if (this.options.hidden) {
        this.xlabel.attr("visibility", "hidden");
        this.plotBackgroundLabel.attr("visibility", "hidden");
        return;
    }

    //reset measureTool
    if (this.model.get("measureMode"))
        this.measureClear();
    //see https://gist.github.com/mbostock/3019563
    const cx = this.g.node().parentNode.parentNode.parentNode.clientWidth;
    const cy = this.g.node().parentNode.parentNode.parentNode.clientHeight;

    const width = cx - this.margin.left - this.margin.right;

    let height = (this.options.butterfly) ? cy - this.margin.top * 2 - 25 : cy - this.margin.top - this.margin.bottom;

    if (this.options.butterfly) {
        height = (height / 2);
        if (this.options.invert) {
            const top = this.margin.top + height;
            this.g.attr("transform", "translate(" + this.margin.left + "," + top + ")");
        }
    }

    this.xscale.domain([xmin, xmax])
        .range([0, width]);

    // y-scale
    if (this.options.invert) {
        this.yscale.domain([0, ymax]).nice()
            .range([0, height]).nice();
        this.yscale_right.domain([0, ymax]).nice()
            .range([0, height]).nice();
    } else {
        this.yscale.domain([0, ymax]).nice()
            .range([height, 0]).nice();
        this.yscale_right.domain([0, ymax]).nice()
            .range([height, 0]).nice();
    }

    const yTicks = height / 40;
    let xTicks = 0;
    if (!this.options.butterfly || this.options.invert)
        xTicks = width / 100;

    this.yTicks = yTicks;

    this.yAxisLeft = d3.svg.axis()
        .scale(this.yscale)
        .ticks(yTicks)
        .orient("left")
        .tickFormat(d3.format("s"));
    this.yAxisRight = d3.svg.axis()
        .scale(this.yscale_right)
        .ticks(yTicks)
        .orient("right")
        .tickFormat(d3.format("s"));

    this.yAxisLeftSVG.call(this.yAxisLeft);
    this.yAxisRightSVG
        .attr("transform", "translate(" + width + " ,0)")
        .call(this.yAxisRight);
    this.xaxisZoomRect.attr("width", width);

    // var xAxisOrient = this.options.invert ? "top" : "bottom";
    // this.xAxis = d3.svg.axis().scale(this.xscale).ticks(xTicks).orient(xAxisOrient);
    this.xAxis = d3.svg.axis().scale(this.xscale).ticks(xTicks).orient("bottom");

    this.xaxisSVG
        .attr("transform", "translate(0," + height + ")")
        .call(this.xAxis);
    this.g.selectAll(".axis line, .axis path")
        .style({"stroke": "Black", "fill": "none", "stroke-width": "1.2px"});

    this.g.selectAll(".tick")
        .attr("pointer-events", "none");

    this.plot.attr("width", width)
        .attr("height", height);

    const xaxisZoomRectYpos = (this.options.butterfly && !this.options.invert) ? height * 2 : height;

    this.xaxisZoomRect.attr("width", width).attr("y", xaxisZoomRectYpos).attr("height", this.margin.bottom);

    this.dragZoomHighlight.attr("height", height);

    this.zoom = d3.behavior.zoom()
        .x(this.xscale).on("zoom", this.redraw())
        .scaleExtent([0, this.model.xmaxPrimary]);
    this.plot.call(this.zoom);

    this.yzoom = d3.behavior.zoom()
        .y(this.yscale).on("zoom", function () {
            this.yZoomed = true;
            this.redraw()();
        }.bind(this))
        .scaleExtent([0, this.model.ymaxPrimary]);

    this.yZoomRectLeft.attr("width", this.margin.left)
        .attr("height", cy - this.margin.top - this.margin.bottom)
        .attr("transform", "translate(" + -this.margin.left + "," + 0 + ")")
        .call(this.yzoom);
    this.yZoomRectRight.attr("width", this.margin.right)
        .attr("height", cy - this.margin.top - this.margin.bottom)
        .attr("transform", "translate(" + width + " ,0)")
        .call(this.yzoom);
    if (this.title) {
        this.title.attr("x", width / 2);
    }

    this.xlabel.attr("x", width / 2).attr("y", height);
    this.plotBackgroundLabel.attr("x", width / 2).attr("y", height / 2);
    if (this.options.butterfly && !this.options.invert) {
        this.xlabel.attr("visibility", "hidden");
    } else {
        this.xlabel.attr("visibility", "visible");
    }
    this.ylabelLeft.attr("transform", "translate(" + -50 + " " + height / 2 + ") rotate(-90)");
    this.ylabelRight.attr("transform", "translate(" + (width + 45) + " " + height / 2 + ") rotate(-90)");

    this.redraw()();
};

/**
 * Disables zoom and pan interactions on the graph.
 *
 * @method disableZoom
 */
Graph.prototype.disableZoom = function () {

    this.plot.attr("pointer-events", "none");
    this.xaxisZoomRect.style("cursor", "default");
    this.brush.on("brushstart", null)
        .on("brush", null)
        .on("brushend", null);
    this.plot.call(this.zoom)
        .on("zoom", null);
};

/**
 * Enables zoom and pan interactions on the graph.
 * Sets up brush handlers for drag-to-zoom functionality.
 *
 * @method enableZoom
 */
Graph.prototype.enableZoom = function () {
    this.plot.attr("pointer-events", "visible");
    this.plot.call(this.zoom);
    this.xaxisZoomRect.style("cursor", "crosshair");
    this.brush.on("brushstart", brushstart)
        .on("brush", brushmove)
        .on("brushend", brushend);
    const self = this;

    function brushstart() {
        self.dragZoomHighlight
            .attr("width", 0)
            .attr("display", "inline");
    }

    function brushmove() {
        const s = self.brush.extent();
        //var width = self.xscale(s[1] - s[0]) - self.xscale(0);
        const width = self.xscale(s[1]) - self.xscale(s[0]);
        self.dragZoomHighlight.attr("x", self.xscale(s[0])).attr("width", width);
    }

    function brushend() {
        self.dragZoomHighlight.attr("display", "none");
        const s = self.brush.extent();
        self.xscale.domain(s);
        self.brush.x(self.xscale);
        self.model.xmin = s[0];
        self.model.xmax = s[1];
        self.yZoomed = false;
        self.resize(self.model.xmin, self.model.xmax, self.model.ymin, self.model.ymax);
    }
};

/**
 * Activates or deactivates the measuring tool for calculating mass differences between peaks.
 *
 * @method measure
 * @param {boolean} on - Whether to turn the measuring tool on (true) or off (false)
 */
Graph.prototype.measure = function (on) {
    if (on === true) {
        const self = this;
        self.measureBackground
            .attr("width", self.plot[0][0].getAttribute("width"))
            .attr("height", self.plot[0][0].getAttribute("height"));

        self.peaksSVG.style("pointer-events", "none");		//disable peak highlighting

        self.disableZoom();

        function measureStart() {
            self.measureShow();

            const coords = d3.mouse(this);
            const mouseX = self.xscale.invert(coords[0]);
            let distance = 100;
            const highlighttrigger = 10;
            const peakCount = self.peaks.length;
            for (let p = 0; p < peakCount; p++) {
                const peak = self.peaks[p];
                if (_.intersection(self.model.highlights, peak.fragments).length !== 0 && Math.abs(peak.x - mouseX) < highlighttrigger) {
                    self.measureStartPeak = peak;
                    break;
                }

                if (Math.abs(peak.x - mouseX) < distance) {
                    distance = Math.abs(peak.x - mouseX);
                    self.measureStartPeak = peak;
                }
            }
            self.measuringToolVLineStart
                .attr("x1", self.xscale(self.measureStartPeak.x))
                .attr("x2", self.xscale(self.measureStartPeak.x))
                .attr("y1", self.yscale(self.model.ymaxPrimary))
                .attr("y2", self.yscale(self.measureStartPeak.y));
            self.measuringToolLine
                .attr("x1", self.xscale(self.measureStartPeak.x))
                .attr("x2", coords[0])
                .attr("y1", coords[1])
                .attr("y2", coords[1]);
            self.measuringToolVLineEnd
                .attr("x1", coords[0])
                .attr("x2", coords[0])
                .attr("y1", self.yscale(0))
                .attr("y2", self.yscale(self.model.ymaxPrimary));
        }

        function measureMove() {
            let endPeak;
            const coords = d3.mouse(this);
            const mouseX = self.xscale.invert(coords[0]);
            //find start and endPeak
            let distance = 4;
            const highlighttrigger = 15;	//triggerdistance to prioritize highlighted peaks as endpoint
            const peakCount = self.peaks.length;
            for (let p = 0; p < peakCount; p++) {
                const peak = self.peaks[p];
                if (peak != self.measureStartPeak) {
                    if (_.intersection(self.model.highlights, peak.fragments).length != 0 && Math.abs(peak.x - mouseX) < highlighttrigger) {
                        endPeak = peak;
                        break;
                    }
                    if (Math.abs(peak.x - mouseX) < distance) {
                        endPeak = peak;
                        distance = Math.abs(peak.x - mouseX);
                    }
                }
            }

            //draw vertical end Line
            if (endPeak) {
                //set end of the measuringTool to endPeak
                self.measuringToolVLineEnd
                    .attr("x1", self.xscale(endPeak.x))
                    .attr("x2", self.xscale(endPeak.x))
                    .attr("y1", self.yscale(endPeak.y))
                    .attr("y2", self.yscale(self.model.ymaxPrimary));
            } else {
                self.measuringToolVLineEnd
                    .attr("x1", coords[0])
                    .attr("x2", coords[0])
                    .attr("y1", self.yscale(0))
                    .attr("y2", self.yscale(self.model.ymaxPrimary));
            }

            //draw horizontal line
            const measureStartX = parseFloat(self.measuringToolVLineStart.attr("x1"));
            const measureEndX = parseFloat(self.measuringToolVLineEnd.attr("x1"));

            let y;
            if (self.options.invert) {
                if (coords[1] > self.yscale(self.model.ymaxPrimary))
                    y = self.yscale(self.model.ymaxPrimary);
                else if (coords[1] < self.yscale(0))
                    y = self.yscale(0);
                else
                    y = coords[1];
            } else {
                if (coords[1] < self.yscale(self.model.ymaxPrimary))
                    y = self.yscale(self.model.ymaxPrimary);
                else if (coords[1] > self.yscale(0))
                    y = self.yscale(0);
                else
                    y = coords[1];
            }

            self.measuringToolLine
                .attr("x2", measureEndX)
                .attr("y1", y)
                .attr("y2", y);

            //draw peak info
            // const deltaX = Math.abs(measureStartX - measureEndX);
            distance = Math.abs(self.xscale.invert(measureStartX) - self.xscale.invert(measureEndX));
            // let labelX;
            // if (measureStartX < measureEndX)
            //     labelX = measureStartX + deltaX / 2;
            // else
            //     labelX = measureEndX + deltaX / 2;

            self.measureDistance.text(distance.toFixed(self.model.get("showDecimals")) + " Th");

            // eslint-disable-next-line no-unused-vars
            const matrix = this.getScreenCTM()
                .translate(+this.getAttribute("cx"),
                    +this.getAttribute("cy"));

            let positionX;
            if (measureStartX < measureEndX)
                positionX = coords[0] - Math.abs(measureStartX - measureEndX) / 2;
            else
                positionX = coords[0] + Math.abs(measureStartX - measureEndX) / 2;

            // Because chrome is deprecating offset on svg elements
            // function getSVGOffset (svg) {
            // 	var pnode = svg;
            // 	var pBCR;
            // 	while (pnode && !pBCR) {
            // 		var posType = (pnode == document) ? "static" : d3.select(pnode).style("position");
            // 		if (posType !== "" && posType !== "static" && posType !== "inherit") {
            // 			pBCR = pnode.getBoundingClientRect();
            // 		}
            // 		pnode = pnode.parentNode;
            // 	}
            // 	var svgBCR = svg.getBoundingClientRect();
            // 	pBCR = pBCR || {top: 0, left: 0};
            // 	return {top: svgBCR.top - pBCR.top, left: svgBCR.left - pBCR.left};
            // }
            //
            // var svgNode = self.g.node().parentNode;
            // var rectBounds = this.getBoundingClientRect();
            // var svgBounds = svgNode.getBoundingClientRect();
            // var rectOffX = -8; //rectBounds.left - svgBounds.left;
            // var rectOffY = rectBounds.top - svgBounds.top;
            // var svgOffset = getSVGOffset (svgNode);
            // rectOffX += svgOffset.left; // add on offsets to svg's relative parent
            // rectOffY += svgOffset.top;
            // rectOffX += positionX;
            // rectOffY += y + 10; // the offset of the drag in the rect

            self.measureDistance.attr("x", positionX).attr("y", coords[1] - 10);

            const measureTooltipAbsOffsetY = self.options.invert ? 6 + self.margin.top * 2 : self.margin.top;

            //fromText
            let fromTextColor = self.measureStartPeak.colour;
            let fromText;
            if (self.measureStartPeak.fragments.length > 0)
                fromText = "From: " + self.measureStartPeak.fragments[0].name + " (" + self.measureStartPeak.x.toFixed(self.model.get("showDecimals")) + " m/z)";
            else if (self.measureStartPeak.isotopes.length > 0)
                fromText = "From: " + self.measureStartPeak.isotopes[0].name + "+" + self.measureStartPeak.isotopenumbers[0] + "(" + self.measureStartPeak.x.toFixed(self.model.get("showDecimals")) + " m/z)";
            else {
                fromText = "From: Peak (" + self.measureStartPeak.x.toFixed(self.model.get("showDecimals")) + " m/z)";
                fromTextColor = "black";
            }
            //toText
            let toText;
            if (endPeak) {
                var toTextColor = endPeak.colour;
                if (endPeak.fragments.length > 0)
                    toText = "To: " + endPeak.fragments[0].name + "(" + endPeak.x.toFixed(self.model.get("showDecimals")) + " m/z)";
                else if (endPeak.isotopes.length > 0)
                    toText = "To: " + endPeak.isotopes[0].name + "+" + endPeak.isotopenumbers[0] + "(" + endPeak.x.toFixed(self.model.get("showDecimals")) + " m/z)";
                else {
                    toText = "To: Peak (" + endPeak.x.toFixed(self.model.get("showDecimals")) + " m/z)";
                    toTextColor = "black";
                }
            } else {
                toText = "";
            }
            const massArr = [];
            for (let i = 1; i < 7; i++) {
                const massObj = {};
                massObj.mass = distance * i;
                massObj.matchAA = matchMassToAA(distance * i);
                massArr.push(massObj);
            }

            let yText = coords[1] + 25 + measureTooltipAbsOffsetY;
            self.measureTooltipText["from"]
                .attr("y", yText)
                .attr("fill", fromTextColor)
                .text(fromText);
            yText += 18;
            self.measureTooltipText["to"]
                .attr("y", yText)
                .attr("fill", toTextColor)
                .text(toText);
            yText += 6;
            self.measureTooltipText["masses"].selectAll("*").remove();
            self.measureTooltipText["masses"].selectAll("text")
                .data(massArr)
                .enter().append("text")
                .text(function (d, i) {
                    const z = i + 1;
                    let matchText = "";
                    if (d.matchAA.length > 0)
                        matchText = "(" + d.matchAA + ")";
                    return "z=" + z + ": " + d.mass.toFixed(self.model.get("showDecimals")) + " Da " + matchText;
                })
                // eslint-disable-next-line no-unused-vars
                .attr("y", function (d) {
                    return yText += 15;
                })
                .attr("class", function (d) {
                    if (d.matchAA.length > 0) return "matchedAA";
                });
            const maxTextWidth = Math.max.apply(Math, self.measureTooltip.selectAll("text")[0].map(function (t) {
                return d3.select(t).node().getComputedTextLength();
            }));
            const backgroundWidth = maxTextWidth + 20;
            const backgroundWidthX = positionX - backgroundWidth / 2;

            self.measureTooltipBackground
                .attr("x", backgroundWidthX + self.margin.left)
                .attr("y", coords[1] + 10 + measureTooltipAbsOffsetY)
                .attr("width", backgroundWidth)
                .attr("height", 140);
            self.measureTooltip.selectAll("text")
                .attr("x", positionX + self.margin.left);
            self.measureTooltipText["masses"].selectAll("text")
                .attr("fill", "#333");
            self.measureTooltipText["masses"].selectAll(".matchedAA")
                .attr("fill", "black");
        }

        this.measureBrush = d3.svg.brush()
            .x(this.xscale)
            .on("brushstart", measureStart)
            .on("brush", measureMove);

        this.measureBackground.call(this.measureBrush);

    } else {
        this.measureClear();
        this.peaksSVG.style("pointer-events", "visible");
        this.measureBackground.attr("height", 0);
        this.enableZoom();
    }
};

/**
 * Hides the measuring tool display elements.
 *
 * @method measureClear
 * @private
 */
Graph.prototype.measureClear = function () {
    this.measuringTool.attr("display", "none");
    this.measureDistance.attr("display", "none");
    this.measureTooltip.attr("display", "none");
};

/**
 * Shows the measuring tool display elements.
 *
 * @method measureShow
 * @private
 */
Graph.prototype.measureShow = function () {
    this.measuringTool.attr("display", "inline");
    this.measureDistance.attr("display", "inline");
    this.measureTooltip.attr("display", "inline");
};

/**
 * Returns a redraw function that updates the graph display.
 * Called during zoom/pan operations to refresh peak positions and scales.
 *
 * @method redraw
 * @returns {Function} Redraw callback function
 */
Graph.prototype.redraw = function () {
    let self = this;
    return function () {
        if (self.options.butterfly || self.model.get("changedAnnotation")) {
            self.plotBackgroundLabel.attr("visibility", "visible");
        } else {
            self.plotBackgroundLabel.attr("visibility", "hidden");
        }
        // get highest intensity from peaks in x range
        // adjust y scale to new highest intensity
        if (self.peaks.length > 0) {
            if (!self.yZoomed) {
                let xDomain = self.xscale.domain();
                let ymax = d3.max(self.peaks, function (p) {
                    if (p.x > xDomain[0] && p.x < xDomain[1])
                        return p.y;
                });
                self.yscale.domain([0, ymax / 0.95]);
                self.yscale_right.domain([0, (ymax / (self.model.ymaxPrimary * 0.95)) * 100]);
            } else {
                let yDomain = self.yscale.domain();
                let ymax = d3.min([yDomain[1], self.model.ymaxPrimary]);
                self.model.ymax = ymax;
                self.yscale.domain([0, ymax]);
                self.yscale_right.domain([0, (ymax / (self.model.ymaxPrimary)) * 100]);
            }

            self.yAxisLeftSVG.call(self.yAxisLeft);
            self.yAxisRightSVG.call(self.yAxisRight);

            for (let i = 0; i < self.peaks.length; i++) {
                self.peaks[i].update();
            }
        }
        self.xaxisSVG.call(self.xAxis);
        if (self.model.measureMode)
            self.disableZoom();
        self.model.setZoom(self.xscale.domain());
    };
};

/**
 * Clears all peaks and annotations from the graph.
 *
 * @method clear
 */
Graph.prototype.clear = function () {
    this.model.set("measureMode", false);
    this.peaks = [];
    this.highlights.selectAll("*").remove();
    this.peaksSVG.selectAll("*").remove();
    this.lossyAnnotations.selectAll("*").remove();
    this.annotations.selectAll("*").remove();
};

/**
 * Clears highlights from all peaks except sticky highlights.
 *
 * @method clearHighlights
 */
Graph.prototype.clearHighlights = function () {
    for (let p = 0; p < this.peaks.length; p++) {
        if (this.peaks[p].fragments.length > 0 && !_.contains(this.model.sticky, this.peaks[p].fragments[0])) {
            this.peaks[p].highlight(false);
        }
    }
};

/**
 * Updates the colors of all peaks based on current color scheme and highlight state.
 *
 * @method updatePeakColors
 */
Graph.prototype.updatePeakColors = function () {
    let model = this.model;

    // standard mode
    if (model.highlights.length === 0 || !this.model.get("hideNotSelectedFragments")) {

        // color all fragment peaks
        this.fragment_peaks.forEach(function (p) {
            p.line.attr("stroke", p.colour);
        });

        // let pepFragVis = model.get('pepFragmentVis');
        // if (pepFragVis === 'pep1'){
        // 	let p2FragPeaks = this.fragment_peaks.filter(function(p){
        // 		return p.fragments.filter(function(f){ return f.peptideId === 1}).length > 0;
        // 	})
        // 	p2FragPeaks.forEach(function(p){ p.line.attr("stroke", model.get('peakColor')); });
        // }
        // else if (pepFragVis === 'pep2'){
        // 	let p1FragPeaks = this.fragment_peaks.filter(function(p){
        // 		return p.fragments.filter(function(f){ return f.peptideId === 0}).length > 0;
        // 	})
        // 	p1FragPeaks.forEach(function(p){ p.line.attr("stroke", model.get('peakColor')); });
        // }
    } else { // only highlighted fragments are colored
        let self = this;
        let highlightClusterIds = [].concat.apply([], model.highlights.map(function (h) {
            return h.clusterIds;
        }));
        this.peaks.forEach(function (p) {
            if (_.intersection(self.model.highlights, p.fragments).length > 0 || _.intersection(highlightClusterIds, p.clusterIds).length > 0)
                p.line.attr("stroke", p.colour);
            else
                p.line.attr("stroke", model.get("peakColor"));
        });
    }
};

/**
 * Updates the visibility and display of peak annotation labels.
 *
 * @method updatePeakLabels
 */
Graph.prototype.updatePeakLabels = function () {
    let peakCount = this.peaks.length;

    if (this.model.highlights.length === 0) {
        for (let p = 0; p < peakCount; p++) {
            if (this.peaks[p].fragments.length > 0) {
                this.peaks[p].removeLabels();
                this.peaks[p].showLabels();
            }
        }
    } else {
        for (let p = 0; p < peakCount; p++) {
            // if it's not a fragment from the highlight selection
            if (_.intersection(this.model.highlights, this.peaks[p].fragments).length === 0) {
                // show it if allFragmentHighlights is true (dependent on lossyShown)
                if (!this.model.get("hideNotSelectedFragments")) {
                    this.peaks[p].removeLabels();
                    this.peaks[p].showLabels();
                } else {
                    this.peaks[p].removeLabels();
                }
            } else { // if it is from the highlight selection force show all Labels overriding lossyShown
                this.peaks[p].removeLabels();
                this.peaks[p].showLabels(true);
            }
        }
    }
};

/**
 * Applies the current color scheme to all peaks.
 *
 * @method setColors
 */
Graph.prototype.setColors = function () {
    for (let p = 0; p < this.peaks.length; p++) {
        this.peaks[p].setColor();
    }
};

/**
 * Updates the color of highlight elements on all peaks.
 *
 * @method updateHighlightColors
 */
Graph.prototype.updateHighlightColors = function () {
    for (let p = 0; p < this.peaks.length; p++) {
        if (this.peaks[p].highlightLine !== undefined) {
            this.peaks[p].highlightLine.attr("stroke", this.model.get("highlightColor"));
            this.peaks[p].labelHighlights.attr("stroke", this.model.get("highlightColor"));
        }
    }
};

/**
 * Shows the graph by making it visible.
 *
 * @method show
 */
Graph.prototype.show = function () {
    this.g.attr("visibility", "visible");
    this.enableZoom();
};

/**
 * Hides the graph by making it invisible.
 *
 * @method hide
 */
Graph.prototype.hide = function () {
    this.g.attr("visibility", "hidden");
    this.disableZoom();
    //this.xaxisZoomRect.attr("pointer-events", "none");
    //this.g.style("pointer-events", "none");
};
/*

Graph.prototype.resetScales = function(text) {
	  this.yscale = d3.scale.linear()
	  .domain([this.options.ymax, this.options.ymin])
	  .nice()
	  .range([0, this.size.height])
	  .nice();

	this.zoom.scale(1, 1);
	this.zoom.translate([0, 0]);
	this.redraw()();
};
*/

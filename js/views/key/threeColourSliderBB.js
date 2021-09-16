import '../../../css/threeColourSlider.css';

import * as _ from 'underscore';
import Backbone from "backbone";
import d3 from "d3";

export const ThreeColourSliderBB = Backbone.View.extend({
    events: {
        "change input.filterTypeNumber": "directInput",
        "keyup input.filterTypeNumber": "directInputIfReturn",
        //"mouseup input.filterTypeNumber": "directInput",
    },

    initialize: function (viewOptions) {

        const defaultOptions = {
            unitText: "",
            extent: this.model.get("colScale").domain() || [40, 60],
            domain: this.model.get("superDomain") || [0, 100],
            margin: {},
            orientation: "vertical",
            absolutePosition: true,
            sliderThickness: 50,
        };
        this.options = _.extend({}, defaultOptions, viewOptions);

        const self = this;
        const top = d3.select(this.el);

        const isVert = this.isVerticallyOriented();
        const orientCoord = isVert ? "y" : "x";
        const perpOrientCoord = isVert ? "x" : "y";
        const thicknessDim = isVert ? "width" : "height";

        top
            .classed(isVert ? "verticalFlexContainer" : "horizontalFlexContainer", true)
            .classed("absolutePosition", this.options.absolutePosition)
            .classed("threeColourSlider", true);

        $(window).on("resize", function () {
            self.resize().render();
        });

        this.options.margin = _.extend({
            top: 12,
            right: 12,
            bottom: 12,
            left: 12
        }, this.options.margin);
        //var m = this.options.margin;
        this.height = this.el.clientHeight; // - m.top - m.bottom;
        this.width = this.el.clientWidth; // - m.left - m.right;


        this.majorDim = d3.scale.linear()
            .domain(self.options.domain);
        this.setMajorDimRange(isVert);

        this.brush = d3.svg.brush()[orientCoord](this.majorDim)
            .extent(self.options.extent)
            .on("brushstart", function () {
                self.brushstart();
            })
            .on("brush", function () {
                self.brushmove();
            })
            .on("brushend", function () {
                self.brushend();
            });

        const cutoffs = [{
            class: "vmin"
        },
            {
                class: "vmax"
            },
        ];
        const numberInputs = top.selectAll("div.inputWrapper")
            .data(cutoffs)
            .enter()
            .append("div")
            .attr("class", function (d) {
                return "inputWrapper " + d.class;
            });
        numberInputs.append("input")
            .attr({
                class: function (d) {
                    return "filterTypeNumber " + d.class;
                },
                type: "number",
                min: self.options.domain[0],
                max: self.options.domain[1],
                step: 0.01,
            });
        numberInputs.append("span")
            .text(self.options.unitText);

        const topGroup = top.append("svg").append("g");

        // upper brush rectangles with colours from underlying scale
        this.upperRange = topGroup.append("rect").attr(perpOrientCoord, 0).attr(orientCoord, /*-10*/ 0).attr(thicknessDim, this.options.sliderThickness);
        this.lowerRange = topGroup.append("rect").attr(perpOrientCoord, 0).attr(thicknessDim, this.options.sliderThickness);
        this.textFormat = d3.format(".2f");

        const brushg = topGroup.append("g")
            .attr("class", "brush")
            .call(this.brush);

        // triangle handles
        brushg.selectAll(".resize")
            .append("g")
            .attr("class", "triangleHandle")
            .attr("transform", "translate(" + (isVert ? this.options.sliderThickness + ",0)" : "0, " + this.options.sliderThickness + ") rotate(90)"))
            .append("path")
            .attr("d", "M 0 0 l 10.5 10.5 l 8 0 l 0 -21 l -8 0 Z");

        // text values in bar
        brushg.selectAll(".resize")
            .append("text")
            .attr("transform", function (d, i) {
                return "translate(0," + (isVert ? (-2 + (i * 13)) : 11) + ")";
            })
            .attr("class", "brushValueText")
            .text("0");

        brushg.selectAll("rect")
            .attr(thicknessDim, this.options.sliderThickness);

        this.brushg = brushg;

        // this was causing problems. Basically when distance colour scheme is selected in the legend,
        // a change:linkColourAssignment event is fired. This is followed by initialising this slider, which in brushmove
        // sets the domain and fires a colourModelChanged event. Thanks to linkColourAssignment getting changed, further
        // on this is interpreted as a change to the current model, and a CurrentColourModelChanged event is fired
        // The LinkColourAssignment and CurrentColourModelChanged events arriving almost in tandem at the distogram
        // caused c3 to freak out with hiding / showing series (known c3 bugginess) and things went wrong.
        // Essentially though we don't need to run brushmove here, the rounding caused by running it doesn't change anything
        //this.brushmove();	


        topGroup.append("text")
            .attr("transform", isVert ? "rotate(90) translate(0,-" + (this.options.sliderThickness + 2) + ")" : "translate(0," + (this.options.sliderThickness + 12) + ")")
            .attr("class", "threeColourSliderTitle")
            .text(self.options.title);

        // move min box to bottom of slider
        top.append(function () {
            return top.select("div.vmin").remove().node();
        });

        this.listenTo(this.model, "colourModelChanged", this.render); // if range  (or domain) changes in current colour model

        return this;
    },

    setMajorDimRange: function (isVert) {
        const m = this.options.margin;
        this.majorDim.range(isVert ? [this.height - m.top, m.bottom] : [m.left, this.width - m.right]);
    },

    resetStretchDimension: function () {
        const d3el = d3.select(this.el);
        // Firefox returns 0 for an svg element's clientWidth/Height, so use zepto/jquery width function instead
        const jqElem = $(d3el.select("svg").node());
        const stretchDim = this.isVerticallyOriented() ? "height" : "width";
        this[stretchDim] = jqElem[stretchDim](); //this.svg.node().clientHeight;
        return this;
    },

    resize: function () {
        this.resetStretchDimension();

        // changing y range automatically adjusts the extent, but we want to keep the same extent
        const oldExtent = this.brush.extent();
        this.setMajorDimRange(this.isVerticallyOriented());
        this.brush.extent(oldExtent);
        this.brush(d3.select(this.el).select(".brush"));

        return this;
    },

    render: function (args) {
        // use brush extent or domain value (when render is called from backbone)
        // domain value here is not the domain of the slider, but the domain of the colour scale (should fit within the slider's domain)
        const s = (args && args.domain ? args.domain.slice() : undefined) || this.brush.extent();
        const d3el = d3.select(this.el);
        this.brush.extent(s);
        d3el.select("svg g.brush").call(this.brush); // recall brush binding so background rect is resized and brush redrawn

        this.resetStretchDimension();

        const colRange = this.model.get("colScale").range();
        const isVert = this.isVerticallyOriented();
        const orientDim1 = isVert ? "height" : "width";
        const orientDim2 = isVert ? "y" : "x";

        const majorDimRange = this.majorDim.range();
        this.upperRange
            .attr(orientDim1, Math.max(0, this.majorDim(s[1]) - majorDimRange[0]))
            .attr(orientDim2, majorDimRange[0])
            .style("fill", colRange[isVert ? 2 : 0]);
        this.brushg.select(".extent").style("fill", colRange[1]);
        this.lowerRange
            .attr(orientDim1, Math.max(0, _.last(majorDimRange) - this.majorDim(s[0])))
            .attr(orientDim2, this.majorDim(s[0]))
            .style("fill", colRange[isVert ? 0 : 2]);

        const self = this;
        d3el.selectAll(".brushValueText")
            .text(function (d, i) {
                return self.textFormat(s[s.length - i - 1]) + self.options.unitText;
            });

        const rounded = s.map(function (val) {
            return parseFloat(this.textFormat(val));
        }, this);

        d3el.select("div.vmin > input").property("value", rounded[0]);
        d3el.select("div.vmax > input").property("value", rounded[1]);
        return this;
    },

    show: function (show) {
        d3.select(this.el).style("display", show ? null : "none");
        if (show) {
            this.resize().render();
        }
        return this;
    },

    brushstart: function () {
        return this;
    },

    brushmove: function () {
        const s = this.brush.extent();
        // round so values in domain are the same that are shown in text labels and input controls
        const rounded = s.map(function (val) {
            return parseFloat(this.textFormat(val));
        }, this);
        this.model.setDomain(rounded); // this'll trigger a re-render due to the colourModelChanged listener above ^^^
        return this;
    },

    brushend: function () {
        return this;
    },


    directInput: function (evt) {
        const target = evt.target;
        const value = +target.value;
        const isMin = d3.select(target).classed("vmin");
        const bounds = this.majorDim.domain();

        const s = this.brush.extent();
        const correct = [bounds[0], isMin ? value : s[0], isMin ? s[1] : value, bounds[1]]
            .sort(function (a, b) {
                return a - b;
            })
            .slice(1, 3);

        this.brush.extent(correct);
        this.brush(d3.select(this.el).select(".brush"));
        this.brushmove();
    },

    directInputIfReturn: function (evt) {
        if (evt.keyCode === 13) {
            this.directInput(evt);
        }
    },

    isVerticallyOriented: function () {
        return this.options.orientation.toLowerCase() === "vertical";
    },
});

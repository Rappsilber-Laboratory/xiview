/**
 * @fileoverview Three-color threshold slider widget for adjusting color scheme cutoffs.
 * Interactive D3 brush-based slider showing three color regions (low/middle/high) separated by two draggable thresholds.
 * Used exclusively by KeyViewBB for threshold-based color schemes (e.g., score, distance, FDR).
 * Supports vertical or horizontal orientation, includes triangle drag handles and numeric input boxes for precise control.
 * Two-way binding: dragging thresholds updates inputs and backbone-models, typing values updates brush and backbone-models.
 */
import "../../../css/threeColourSlider.css";

import $ from "jquery";
import * as _ from "underscore";
import Backbone from "backbone";
import d3 from "d3";

/**
 * Three-color threshold slider widget with D3 brush interaction.
 * Creates an SVG slider with draggable threshold handles and numeric input boxes.
 * Shows three colored regions representing low/middle/high value ranges based on two threshold cutoffs.
 * Syncs with threshold-based color backbone-models - dragging or typing updates backbone-models domain which triggers
 * re-coloring of all visualizations using that scheme.
 * @class
 * @extends Backbone.View
 * @property {d3.scale.linear} majorDim - Linear scale mapping domain values to SVG coordinates
 * @property {d3.svg.brush} brush - D3 brush behavior for draggable threshold handles
 * @property {d3.selection} upperRange - SVG rect showing upper threshold color region
 * @property {d3.selection} lowerRange - SVG rect showing lower threshold color region
 * @property {d3.selection} brushg - SVG group containing brush elements
 * @property {Function} textFormat - D3 number formatter (2 decimal places)
 * @property {number} height - Current SVG height in pixels
 * @property {number} width - Current SVG width in pixels
 */
export class ThreeColourSliderBB extends Backbone.View {
    constructor(options) {
        super(options);
    }

    /**
     * Backbone.js event handler map.
     * Handles numeric input changes and Enter key presses for direct threshold value entry.
     * @returns {Object} Event map with jQuery selectors and handler methods
     */
    get events() {
        return {
            "change input.filterTypeNumber": "directInput",
            "keyup input.filterTypeNumber": "directInputIfReturn",
            //"mouseup input.filterTypeNumber": "directInput",
        };
    }

    /**
     * Initializes the slider with SVG structure, brush behavior, and event listeners.
     * Creates numeric input boxes (min/max), SVG with colored regions and draggable brush,
     * triangle handles, threshold value labels. Sets up window resize listener and
     * backbone-models change listener. Supports vertical or horizontal orientation.
     * @param {Object} viewOptions - Initialization options
     * @param {string} [viewOptions.unitText=""] - Unit suffix for displayed values (e.g., " Å", " %")
     * @param {number[]} [viewOptions.extent] - Initial threshold values [min, max], defaults to backbone-models domain
     * @param {number[]} [viewOptions.domain] - Full slider range [min, max], defaults to backbone-models superDomain
     * @param {Object} [viewOptions.margin] - SVG margins {top, right, bottom, left}
     * @param {string} [viewOptions.orientation="vertical"] - "vertical" or "horizontal"
     * @param {boolean} [viewOptions.absolutePosition=true] - Use absolute CSS positioning
     * @param {number} [viewOptions.sliderThickness=50] - Slider bar width/height in pixels
     * @param {string} [viewOptions.title] - Title text displayed alongside slider
     * @returns {ThreeColourSliderBB} This view instance for chaining
     */
    initialize(viewOptions) {

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
        // on this is interpreted as a change to the current backbone-models, and a CurrentColourModelChanged event is fired
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

        this.listenTo(this.model, "colourModelChanged", this.render); // if range  (or domain) changes in current colour backbone-models

        return this;
    }

    /**
     * Sets the range of the major dimension scale based on orientation and margins.
     * For vertical: maps domain to [height-top, bottom] (inverted y-axis).
     * For horizontal: maps domain to [left, width-right] (normal x-axis).
     * @param {boolean} isVert - True for vertical orientation, false for horizontal
     * @returns {undefined}
     */
    setMajorDimRange(isVert) {
        const m = this.options.margin;
        this.majorDim.range(isVert ? [this.height - m.top, m.bottom] : [m.left, this.width - m.right]);
    }

    /**
     * Updates the stretch dimension (height for vertical, width for horizontal) from DOM.
     * Uses jQuery dimensions instead of clientWidth/Height because Firefox returns 0 for SVG elements.
     * Called during resize and render to ensure scale range matches current SVG size.
     * @returns {ThreeColourSliderBB} This view instance for chaining
     */
    resetStretchDimension() {
        const d3el = d3.select(this.el);
        // Firefox returns 0 for an svg element's clientWidth/Height, so use zepto/jquery width function instead
        const jqElem = $(d3el.select("svg").node());
        const stretchDim = this.isVerticallyOriented() ? "height" : "width";
        this[stretchDim] = jqElem[stretchDim](); //this.svg.node().clientHeight;
        return this;
    }

    /**
     * Resizes the slider after window resize or panel size change.
     * Recalculates stretch dimension, updates major dimension range, preserves threshold extent,
     * and re-applies brush to update visual elements. Maintains threshold values during resize.
     * @returns {ThreeColourSliderBB} This view instance for chaining
     */
    resize() {
        this.resetStretchDimension();

        // changing y range automatically adjusts the extent, but we want to keep the same extent
        const oldExtent = this.brush.extent();
        this.setMajorDimRange(this.isVerticallyOriented());
        this.brush.extent(oldExtent);
        this.brush(d3.select(this.el).select(".brush"));

        return this;
    }

    /**
     * Renders the slider visual elements with current threshold values.
     * Updates brush extent from args.domain (if provided) or current brush state,
     * applies colors to three regions from color scale, updates threshold value labels and inputs.
     * Called automatically on backbone-models colourModelChanged event or manually after resize.
     * @param {Object} [args] - Optional arguments from backbone-models change event
     * @param {number[]} [args.domain] - New threshold domain [min, max] from color backbone-models
     * @returns {ThreeColourSliderBB} This view instance for chaining
     */
    render(args) {
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
    }

    /**
     * Shows or hides the slider.
     * When showing, resizes and re-renders to ensure correct dimensions.
     * @param {boolean} show - True to show slider, false to hide
     * @returns {ThreeColourSliderBB} This view instance for chaining
     */
    show(show) {
        d3.select(this.el).style("display", show ? null : "none");
        if (show) {
            this.resize().render();
        }
        return this;
    }

    /**
     * D3 brush "brushstart" event handler.
     * Currently no-op - placeholder for potential future use.
     * @returns {ThreeColourSliderBB} This view instance for chaining
     */
    brushstart() {
        return this;
    }

    /**
     * D3 brush "brush" event handler - called continuously during drag.
     * Rounds threshold values to 2 decimal places (matching display format) and updates
     * color backbone-models domain. Model change triggers re-render and cascades to all views using this scheme.
     * @returns {ThreeColourSliderBB} This view instance for chaining
     */
    brushmove() {
        const s = this.brush.extent();
        // round so values in domain are the same that are shown in text labels and input controls
        const rounded = s.map(function (val) {
            return parseFloat(this.textFormat(val));
        }, this);
        this.model.setDomain(rounded); // this'll trigger a re-render due to the colourModelChanged listener above ^^^
        return this;
    }

    /**
     * D3 brush "brushend" event handler - called when drag ends.
     * Currently no-op - all work done in brushmove. Placeholder for potential future use.
     * @returns {ThreeColourSliderBB} This view instance for chaining
     */
    brushend() {
        return this;
    }

    /**
     * Handles direct numeric input from text boxes.
     * Validates and clamps input value to slider domain, updates appropriate threshold
     * (min or max based on input box class), ensures thresholds don't cross, and updates brush.
     * Triggers brushmove to propagate change to backbone-models.
     * @param {Event} evt - Change event from numeric input
     * @returns {undefined}
     */
    directInput(evt) {
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
    }

    /**
     * Handles Enter key press in numeric input boxes.
     * Calls directInput if Enter (keyCode 13) pressed, allowing users to apply changes
     * without tabbing out or clicking away from input.
     * @param {Event} evt - Keyup event from numeric input
     * @returns {undefined}
     */
    directInputIfReturn(evt) {
        if (evt.keyCode === 13) {
            this.directInput(evt);
        }
    }

    /**
     * Returns whether slider is vertically oriented.
     * @returns {boolean} True if orientation is "vertical" (case-insensitive), false for "horizontal"
     */
    isVerticallyOriented() {
        return this.options.orientation.toLowerCase() === "vertical";
    }
}

import * as _ from "underscore";
import Backbone from "backbone";
import d3 from "d3";
import * as $ from "jquery";

export const PrecursorInfoView = Backbone.View.extend({

    events: {
        "click .toggle": "expandToggle",
    },

    initialize: function (viewOptions) {

        let defaultOptions = {
            invert: false,
            hidden: false,
        };
        this.options = _.extend(defaultOptions, viewOptions);

        // event listeners
        this.listenTo(this.model, "change:butterfly", this.butterflyToggle);
        this.listenTo(this.model, "butterflySwap", this.butterflySwap);
        this.listenTo(window.xiSPECUI.vent, "resize:spectrum", this.render);

        this.expand = true;

        // create svg text el
		this.svg = d3.select(this.el);
        this.wrapper = this.svg.append("text")
            .attr("class", "precursorInfo")
            .attr("x", 10)
            .attr("y", 13)
            .attr("font-size", 12);

        this.listenTo(this.model, "change", this.render);
    },

    clear: function () {
        this.wrapper.selectAll("*").remove();
    },

    render: function () {
        this.clear();

        if (this.options.hidden)
            return;

        this.toggle = this.wrapper.append("tspan")
            .text("[-]")
            .style("cursor", "pointer")
            .attr("font-family", "monospace")
            .attr("class", "toggle");

        this.wrapper.append("tspan")
            .text("  Precursor: ")
            .style("cursor", "pointer")
            .attr("class", "toggle");

        this.content = this.wrapper.append("tspan")
            .style("cursor", "default");

        if (this.options.invert) {
            const $el = $(this.el);
            const parentWidth = $el.width();
            const parentHeight = $el.height();
            var top = this.model.isLinear ? parentHeight - 65 : parentHeight - 115;
        } else {
            var top = 0;
        }
        this.wrapper.attr("transform", "translate(0," + top + ")");

        const precursor = this.model.precursor;
        let content = "";

        const dataArr = [];
        if (precursor.intensity !== undefined && precursor.intensity != -1)
            dataArr.push("Intensity=" + precursor.intensity);
        if (precursor.expMz !== undefined && precursor.expMz != -1)
            dataArr.push("exp m/z=" + precursor.expMz.toFixed(this.model.get("showDecimals")));
        if (precursor.calcMz !== undefined)
            dataArr.push("calc m/z=" + precursor.calcMz.toFixed(this.model.get("showDecimals")));
        if (precursor.charge !== undefined)
            dataArr.push("z=" + precursor.charge);
        if (precursor.error !== undefined && precursor.error.tolerance && precursor.error.unit)
            dataArr.push("error=" + precursor.error.tolerance.toFixed(this.model.get("showDecimals")) + " " + precursor.error.unit);

        content += dataArr.join("; ");
        this.content.text(content);

    },

    expandToggle: function () {
        this.expand = !this.expand;
        if (this.options.hidden)
            return;
        const newOpacity = this.expand ? 1 : 0;

        this.content.style("opacity", newOpacity);
        if (!this.expand)
            this.toggle.text("[+]");
        else
            this.toggle.text("[-]");
    },

    butterflyToggle: function () {
        let butterfly = this.model.get("butterfly");
        if (this.options.invert) {
            this.options.hidden = !butterfly;
            this.render();
        }
        this.render();
    },

    butterflySwap: function () {
        this.options.invert = !this.options.invert;
        this.render();
    },

});

import * as _ from "underscore";
import Backbone from "backbone";
import d3 from "d3";

// import {BaseFrameView} from "./base-frame-view";

export const RadioButtonFilterViewBB = Backbone.View.extend({
    tagName: "div",
    events: {
        "click .singleRadioButton": "changeFilter"
    },
    initialize: function (initData) {
        const defaultOptions = {
            states: [0, 1],
            labels: ["Option 1", "Option 2"],
            header: "A Filter",
            eventName: undefined,
            labelGroupFlow: "horizontalFlow"
        };
        this.options = _.extend(defaultOptions, initData.myOptions);
        if (this.options.eventName) {
            this.listenTo(window.vent, this.options.eventName, this.showState);
        }
        this.render();
    },

    render: function () {
        const self = this;
        const con = d3.select(this.el);
        con.append("p").attr("class", "headerLabel").text(this.options.header);

        const sel = con.selectAll("label.singleChoice").data(this.options.states);
        const labs = sel.enter()
            .append("label")
            .attr("class", "singleChoice " + self.options.labelGroupFlow);
        labs
            .append("input")
            .attr("type", "radio")
            .attr("name", self.el.id + "RBGroup")
            .attr("value", function (d) {
                return d;
            })
            .attr("class", "singleRadioButton");
        //.property("checked", function(d,i) { return i == self.options.presetIndex; })

        const labels = this.options.labels;
        labs.append("span").text(function (d, i) {
            return labels[i];
        });
    },

    showState: function (filterVal) {
        //console.log ("in show state rb", filterVal);
        const self = this;
        d3.select(this.el).selectAll("input.singleRadioButton")
            .property("checked", function (d, i) {
                return self.options.states[i] === filterVal;
            });
    },

    changeFilter: function (evt) {
        if (this.options.eventName) {
            window.vent.trigger(this.options.eventName, +evt.currentTarget.value);
        }
    }
});

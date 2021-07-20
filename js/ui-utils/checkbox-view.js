import Backbone from "backbone";
import * as _ from 'underscore';
import {utils} from '../utils';
import d3 from "d3";

export const checkBoxView = Backbone.View.extend({
    tagName: "span",
    className: "buttonPlaceholder",
    events: {
        "click input": "checkboxClicked"
    },

    initialize: function (viewOptions) {

        //console.log ("this", this.model);
        const defaultOptions = {
            labelFirst: true
        };
        this.options = _.extend(defaultOptions, viewOptions.myOptions);

        // this.el is the dom element this should be getting added to, replaces targetDiv
        const sel = d3.select(this.el);
        if (!sel.attr("id")) {
            sel.attr("id", utils.makeLegalDomID(this.options.id));
        }

        const labs = sel.append("label")
            .attr("class", "btn")
        ;
        labs.append("input")
            .attr("id", sel.attr("id") + "ChkBx")
            .attr("type", "checkbox")
        ;
        const labelText = this.options.labelFirst ? labs.insert("span", ":first-child") : labs.append("span");
        labelText.text(this.options.label);

        // Remember to listen to changes to model or global event state that come from outside the view (keeps it in sync with models)
        if (this.model && this.options.toggleAttribute) {
            this.showState(this.model.get(this.options.toggleAttribute)); // initial state
            this.listenTo(this.model, "change:" + this.options.toggleAttribute, this.showState);
        } else if (this.options.eventName) {
            this.listenTo(window.vent, this.options.eventName, this.showState);
        }
    },

    showState: function (args) {
        const boolVal = arguments.length > 1 ? arguments[1] : arguments[0];
        d3.select(this.el).select("input").property("checked", boolVal);
    },

    checkboxClicked: function () {
        const checked = d3.select(this.el).select("input").property("checked");
        if (this.model && this.options.toggleAttribute) {
            this.model.set(this.options.toggleAttribute, checked);
        } else if (this.options.eventName) {
            window.vent.trigger(this.options.eventName, checked);
        }
    }
});
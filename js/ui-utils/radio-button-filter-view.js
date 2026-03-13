/**
 * @fileoverview Radio button group filter control using Backbone.js and D3.js.
 * Creates labeled radio button groups for mutually exclusive filter options.
 * Used throughout xiVIEW for binary or multi-state filters (e.g., ambiguity level, link direction, match types).
 * Supports two-way binding with global events: radio selection triggers event, event changes update selection.
 */
import * as _ from "underscore";
import Backbone from "backbone";
import d3 from "d3";
import vent from "../vent";

// import {BaseFrameView} from "./base-frame-view";

/**
 * Radio button group filter control with event-based data binding.
 * Creates a <div> containing a header label and a radio button group with customizable options.
 * Each radio button has a state value and display label. Supports horizontal or vertical layout.
 * Selection changes trigger global events, and listens to events to update selection externally.
 * @class
 * @extends Backbone.View
 * @property {string} tagName - "div"
 * @property {*[]} options.states - Array of state values (numbers, strings, etc.)
 * @property {string[]} options.labels - Array of display labels (parallel to states)
 * @property {string} options.header - Header text above radio group
 * @property {string} [options.eventName] - Global event name for two-way binding
 * @property {string} [options.labelGroupFlow="horizontalFlow"] - Layout: "horizontalFlow" or "verticalFlow"
 */
export class RadioButtonFilterViewBB extends Backbone.View {
    constructor(options) {
        super(options);
    }

    /**
     * HTML tag name for the root element.
     * @returns {string} "div"
     */
    get tagName() {
        return "div";
    }

    /**
     * Backbone.js event handler map.
     * @returns {Object} Event map with jQuery selectors and handler methods
     */
    get events() {
        return {
            "click .singleRadioButton": "changeFilter"
        };
    }

    /**
     * Initializes the radio button group with options and event listeners.
     * Merges default options, sets up global event listener if eventName provided, and renders.
     * @param {Object} initData - Initialization options
     * @param {Object} initData.myOptions - Radio button configuration
     * @param {*[]} [initData.myOptions.states=[0, 1]] - Array of state values
     * @param {string[]} [initData.myOptions.labels=["Option 1", "Option 2"]] - Array of labels
     * @param {string} [initData.myOptions.header="A Filter"] - Header text
     * @param {string} [initData.myOptions.eventName] - Global event name for binding
     * @param {string} [initData.myOptions.labelGroupFlow="horizontalFlow"] - Layout direction
     * @returns {undefined}
     */
    initialize(initData) {
        const defaultOptions = {
            states: [0, 1],
            labels: ["Option 1", "Option 2"],
            header: "A Filter",
            eventName: undefined,
            labelGroupFlow: "horizontalFlow"
        };
        this.options = _.extend(defaultOptions, initData.myOptions);
        if (this.options.eventName) {
            this.listenTo(vent, this.options.eventName, this.showState);
        }
        this.render();
    }

    /**
     * Renders the radio button group HTML structure.
     * Creates header <p> element and <label> elements for each state with radio input and text span.
     * Applies labelGroupFlow class for layout (horizontalFlow or verticalFlow CSS).
     * Radio buttons share a common name attribute for mutual exclusion.
     * @returns {undefined}
     */
    render() {
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
    }

    /**
     * Updates radio button selection to match provided filter value.
     * Checks the radio button whose state value equals filterVal, unchecks all others.
     * Callback for global eventName event - keeps radio group in sync with external changes.
     * @param {*} filterVal - Filter state value to select (must match one of options.states)
     * @returns {undefined}
     */
    showState(filterVal) {
        //console.log ("in show state rb", filterVal);
        const self = this;
        d3.select(this.el).selectAll("input.singleRadioButton")
            .property("checked", function (d, i) {
                return self.options.states[i] === filterVal;
            });
    }

    /**
     * Handles radio button click events and triggers global event.
     * Converts clicked radio value to number (using unary +) and triggers eventName event.
     * Two-way binding: user interaction → global event (listened to by filter clms-backbone-models, etc.).
     * @param {Event} evt - Click event from radio button
     * @returns {undefined}
     */
    changeFilter(evt) {
        if (this.options.eventName) {
            vent.trigger(this.options.eventName, +evt.currentTarget.value);
        }
    }
}

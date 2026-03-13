/**
 * @fileoverview Simple checkbox control view using Backbone.js and D3.js.
 * Creates labeled checkbox inputs that sync with Backbone backbone-models attributes or global events.
 * Used extensively in dropdown menus for filter controls, annotation toggles, and feature visibility.
 * Supports two-way data binding: checkbox clicks update backbone-models/trigger events, backbone-models/event changes update checkbox.
 */
import Backbone from "backbone";
import * as _ from "underscore";
import {makeLegalDomID} from "../utils";
import d3 from "d3";
import vent from "../vent";

/**
 * Checkbox control view with two-way data binding to clms-backbone-models or events.
 * Creates a <span class="buttonPlaceholder"> containing a <label> with checkbox input and text label.
 * Supports label-before-checkbox or checkbox-before-label layout. Syncs checkbox state with
 * Backbone backbone-models attribute (via toggleAttribute option) or global event (via eventName option).
 * @class
 * @extends Backbone.View
 * @property {string} tagName - "span"
 * @property {string} className - "buttonPlaceholder"
 * @property {string} options.id - Unique identifier for the checkbox element
 * @property {string} options.label - Text label to display next to checkbox
 * @property {boolean} [options.labelFirst=true] - True to show label before checkbox, false for after
 * @property {string} [options.toggleAttribute] - Model attribute name to sync checkbox state with
 * @property {string} [options.eventName] - Global event name to sync checkbox state with
 * @property {boolean} [options.initialState=false] - Initial checked state if using backbone-models binding
 */
export class checkBoxView extends Backbone.View {
    constructor(options) {
        super(options);
    }

    /**
     * HTML tag name for the root element.
     * @returns {string} "span"
     */
    get tagName() {
        return "span";
    }

    /**
     * CSS class name for the root element.
     * @returns {string} "buttonPlaceholder"
     */
    get className() {
        return "buttonPlaceholder";
    }

    /**
     * Backbone.js event handler map.
     * @returns {Object} Event map with jQuery selectors and handler methods
     */
    get events() {
        return {
            "click input": "checkboxClicked"
        };
    }

    /**
     * Initializes the checkbox view with HTML structure and event listeners.
     * Creates label and input elements, sets up two-way binding with backbone-models attribute
     * or global event, and initializes checkbox to specified or default state.
     * @param {Object} viewOptions - Initialization options
     * @param {Object} viewOptions.myOptions - Checkbox configuration
     * @param {string} viewOptions.myOptions.id - Unique identifier
     * @param {string} viewOptions.myOptions.label - Text label
     * @param {boolean} [viewOptions.myOptions.labelFirst=true] - Show label before checkbox
     * @param {string} [viewOptions.myOptions.toggleAttribute] - Model attribute to sync with
     * @param {string} [viewOptions.myOptions.eventName] - Global event to sync with
     * @param {boolean} [viewOptions.myOptions.initialState=false] - Initial checked state
     * @returns {undefined}
     */
    initialize(viewOptions) {

        //console.log ("this", this.backbone-models);
        const defaultOptions = {
            labelFirst: true
        };
        this.options = _.extend(defaultOptions, viewOptions.myOptions);

        // this.el is the dom element this should be getting added to, replaces targetDiv
        const sel = d3.select(this.el);
        if (!sel.attr("id")) {
            sel.attr("id", makeLegalDomID(this.options.id));
        }

        const labs = sel.append("label")
            .attr("class", "btn");
        labs.append("input")
            .attr("id", sel.attr("id") + "ChkBx")
            .attr("type", "checkbox");
        const labelText = this.options.labelFirst ? labs.insert("span", ":first-child") : labs.append("span");
        labelText.text(this.options.label);

        // Remember to listen to changes to backbone-models or global event state that come from outside the view (keeps it in sync with clms-backbone-models)
        if (this.model && this.options.toggleAttribute) {
            const initialState = this.options.initialState? true : false;
            this.model.set(this.options.toggleAttribute, initialState);
            this.showState(this.model.get(this.options.toggleAttribute)); // initial state
            this.listenTo(this.model, "change:" + this.options.toggleAttribute, this.showState);
        } else if (this.options.eventName) {
            this.listenTo(vent, this.options.eventName, this.showState);
        }
    }

    /**
     * Updates checkbox checked state to reflect backbone-models or event change.
     * Handles both Backbone backbone-models change events (args = [backbone-models, value]) and
     * global vent events (args = [value]). Extracts boolean value and sets checkbox property.
     * Callback for "change:toggleAttribute" backbone-models event or global eventName event.
     * @param {...*} args - Variable arguments: either (backbone-models, newValue) or (newValue)
     * @returns {undefined}
     */
    // eslint-disable-next-line no-unused-vars
    showState(args) {
        const boolVal = arguments.length > 1 ? arguments[1] : arguments[0];
        d3.select(this.el).select("input").property("checked", boolVal);
    }

    /**
     * Handles checkbox click events and updates backbone-models or triggers event.
     * Gets current checkbox checked state, then either sets backbone-models attribute
     * (if toggleAttribute option provided) or triggers global event (if eventName provided).
     * Two-way binding: user interaction → backbone-models/event update.
     * @returns {undefined}
     */
    checkboxClicked() {
        const checked = d3.select(this.el).select("input").property("checked");
        if (this.model && this.options.toggleAttribute) {
            this.model.set(this.options.toggleAttribute, checked);
        } else if (this.options.eventName) {
            vent.trigger(this.options.eventName, checked);
        }
    }
}

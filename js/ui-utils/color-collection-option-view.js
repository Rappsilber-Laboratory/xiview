/**
 * @fileoverview Color scheme selector dropdown view using Backbone.js and D3.js.
 * Creates a <select> dropdown populated from a Backbone collection of color scheme models.
 * Used to switch between different crosslink coloring strategies (by score, by link type, by protein, etc.).
 * Supports two-way binding: dropdown selection updates model attribute, model changes update dropdown.
 */
// import * as _ from 'underscore';
import Backbone from "backbone";
import d3 from "d3";

/**
 * Color scheme selector dropdown view with two-way data binding.
 * Creates a labeled <select> element populated with color scheme options from a Backbone collection.
 * Each option displays a title and has a long description tooltip. Selection changes update a
 * specified model attribute with the selected color scheme model. Listens to model changes
 * to keep dropdown in sync. Auto-updates options when collection changes.
 * @class
 * @extends Backbone.View
 * @property {Backbone.Collection} model - Collection of color scheme models
 */
export class ColourCollectionOptionViewBB extends Backbone.View {
    constructor(options) {
        super(options);
    }

    /**
     * Initializes the color scheme selector with HTML structure and event listeners.
     * Creates label and <select> element, populates options from collection, sets up
     * two-way binding with specified model attribute, and listens to collection updates.
     * @param {Object} options - Initialization options
     * @param {string} [options.label="Crosslink Colour Scheme"] - Label text to display before dropdown
     * @param {Object} [options.storeSelectedAt] - Object specifying where to store selected color scheme
     * @param {Backbone.Model} options.storeSelectedAt.model - Model to update (e.g., compositeModelInst)
     * @param {string} options.storeSelectedAt.attr - Attribute name to set (e.g., "linkColourAssignment")
     * @returns {ColourCollectionOptionViewBB} This view instance for chaining
     * @example
     * // Create color scheme selector
     * new ColourCollectionOptionViewBB({
     *   model: linkColourCollectionInst,
     *   el: "#colorControls",
     *   label: "Link Color",
     *   storeSelectedAt: {
     *     model: compositeModelInst,
     *     attr: "linkColourAssignment"
     *   }
     * });
     */
    initialize(options) {
        const self = this;
        d3.select(this.el).attr("class", "btn selectHolder")
            .append("span")
            .attr("class", "noBreak")
            .html((options.label || "Crosslink Colour Scheme") + " ►");

        const addOptions = function (selectSel) {
            const optionSel = selectSel
                .selectAll("option")
                .data(self.model.toJSON());
            optionSel.exit().remove();
            optionSel.enter().append("option");
            optionSel
                .text(function (d) {
                    return d.title;
                })
                .property("value", function (d) {
                    return d.id;
                })
                .attr("title", function (d) {
                    return d.longDescription;
                })
                .order();
        };

        d3.select(this.el).select("span.noBreak")
            .append("select")
            .attr("id", "linkColourSelect")
            .on("change", function () {
                if (options.storeSelectedAt) {
                    const colourModel = self.model.at(d3.event.target.selectedIndex);
                    //window.compositeModelInst.set("linkColourAssignment", colourModel);
                    options.storeSelectedAt.model.set(options.storeSelectedAt.attr, colourModel);
                }
            })
            .call(addOptions);

        if (options.storeSelectedAt) {
            this.listenTo(options.storeSelectedAt.model, "change:" + options.storeSelectedAt.attr, function (compModel, newColourModel) {
                //console.log ("colourSelector listening to change Link Colour Assignment", this, arguments);
                this.setSelected(newColourModel);
            });
        }

        this.listenTo(this.model, "update", function () {
            d3.select(this.el).select("select#linkColourSelect").call(addOptions);
        });

        return this;
    }

    /**
     * Updates the dropdown to reflect currently selected color scheme model.
     * Sets "selected" property on option whose id matches the provided model's id.
     * Called when model attribute changes externally (e.g., from saved session state).
     * @param {Backbone.Model} model - Color scheme model to select in dropdown
     * @returns {ColourCollectionOptionViewBB} This view instance for chaining
     */
    setSelected(model) {
        d3.select(this.el)
            .selectAll("option")
            .property("selected", function (d) {
                return d.id === model.get("id");
            });

        return this;
    }
}

/**
 * @fileoverview Base color backbone-models classes for xiVIEW color schemes.
 * Provides ColourModel base class with domain/range management, categorical/threshold support,
 * and specialized subclasses for metadata-based coloring. All color schemes (links, proteins,
 * annotations) extend these classes. Integrates with D3 color scales (linear, ordinal, threshold).
 */
import Backbone from "backbone";
import d3 from "d3";

/**
 * Base color backbone-models class for all xiVIEW color schemes.
 * Wraps a D3 color scale (colScale) with additional metadata (title, labels, type, etc.).
 * Provides domain/range setters that trigger change events, categorical detection,
 * label-color pairing extraction for legends. Subclasses override getValue() to extract
 * numeric/categorical values from data objects (crosslinks, proteins, etc.).
 * @class
 * @extends Backbone.Model
 * @property {d3.scale} colScale - D3 color scale (linear, ordinal, or threshold)
 * @property {string} title - Display name for color scheme
 * @property {string} longDescription - Detailed description for tooltips
 * @property {string} type - Scale type: "linear", "ordinal", or "threshold"
 * @property {boolean} fixed - True if color scheme is not editable by user
 * @property {string} undefinedColour - Color for undefined/missing values (default: "#aaaaaaff")
 * @property {string} undefinedLabel - Label for undefined category (default: "Unknown")
 * @property {string} unit - Unit suffix for numeric values (e.g., "Å", "%")
 * @property {d3.scale} labels - Label scale parallel to colScale (for legends)
 */
export class ColourModel extends Backbone.Model {
    constructor(attributes, options) {
        super(attributes, options);
    }

    /**
     * Default attribute values for color clms-backbone-models.
     * @returns {Object} Default attributes object
     */
    defaults() {
        return {
            title: undefined,
            longDescription: undefined,
            type: "linear",
            fixed: false,
            undefinedColour: "#aaaaaaff",
            undefinedLabel: "Unknown",
            unit: "",
        };
    }

    /**
     * Sets the domain of the color scale (threshold values for threshold scales, range bounds for linear).
     * Used by threeColourSliderBB.js when user drags threshold handles. Triggers colourModelChanged event
     * which cascades to all views using this color scheme, causing them to re-render with new colors.
     * @param {number[]} newDomain - New domain array (e.g., [40, 60] for thresholds, [0, 100] for linear)
     * @returns {ColourModel} This backbone-models for chaining
     */
    setDomain(newDomain) {
        this.get("colScale").domain(newDomain);
        this.triggerColourModelChanged({
            domain: newDomain
        });
        return this;
    }

    /**
     * Sets the range of the color scale (actual color values).
     * Used by KeyViewBB.changeColour when user picks new colors via color picker controls.
     * Triggers colourModelChanged event which cascades to all views.
     * @param {string[]} newRange - New color array (e.g., ["#ff0000", "#00ff00", "#0000ff"])
     * @returns {ColourModel} This backbone-models for chaining
     */
    setRange(newRange) {
        this.get("colScale").range(newRange);
        this.triggerColourModelChanged({
            range: newRange
        });
        return this;
    }

    /**
     * Gets the domain index (category index) for a data object.
     * Used by distogram and scatterplot for categorical grouping.
     * For ordinal: returns indexOf value in domain. For threshold: returns bisect position.
     * @param {Object} obj - Data object (crosslink, protein, etc.)
     * @returns {number|undefined} Domain index, or undefined if value is undefined
     */
    getDomainIndex(obj) {    // obj is generally a crosslink, but is non-specific at this point
        const val = this.getValue(obj);
        const dom = this.get("colScale").domain();
        return val != undefined ? (this.get("type") !== "ordinal" ? d3.bisect(dom, val) : dom.indexOf(val)) : undefined;
    }

    /**
     * Gets the number of categories/buckets in the color scheme.
     * Used by scatterplot for categorical data counting.
     * For threshold: domain.length + 1 (n thresholds = n+1 regions).
     * For ordinal: domain.length. For linear: range span + 1.
     * @returns {number} Number of categories/buckets
     */
    getDomainCount() {
        const domain = this.get("colScale").domain();
        return this.isCategorical() ? (this.get("type") === "threshold" ? domain.length + 1 : domain.length) : domain[1] - domain[0] + 1;
    }

    /**
     * Main entry point for getting color of a data object.
     * Calls getValue() (implemented by subclasses) to extract value, then maps through color scale.
     * Returns undefinedColour if value is undefined.
     * @param {Object} obj - Data object (crosslink, protein, etc.)
     * @returns {string} Hex color string (e.g., "#ff0000" or "#aaaaaaff")
     */
    getColour(obj) {  // obj is generally a crosslink, but is non-specific at this point
        const val = this.getValue(obj);
        return val !== undefined ? this.get("colScale")(val) : this.get("undefinedColour");
    }

    /**
     * Gets color directly from a value (bypassing getValue() extraction).
     * @param {*} val - Value to map to color (number, string, etc.)
     * @returns {string} Hex color string (e.g., "#ff0000" or "#aaaaaaff")
     */
    getColourByValue(val) {
        return val !== undefined ? this.get("colScale")(val) : this.get("undefinedColour");
    }

    /**
     * Triggers the colourModelChanged event with changed attributes.
     * Called by setDomain and setRange. Views listen to this event to re-render with new colors.
     * @param {Object} changedAttrs - Object describing changes (e.g., {domain: [...]} or {range: [...]})
     * @returns {undefined}
     */
    triggerColourModelChanged(changedAttrs) {
        this.trigger("colourModelChanged", this, changedAttrs);
    }

    /**
     * Returns whether this is a categorical (non-linear) color scheme.
     * Used by BaseFrameView.makeChartTitle, scatterplot, and distogram.
     * @returns {boolean} True if type is "ordinal" or "threshold", false if "linear"
     */
    isCategorical() {
        return this.get("type") !== "linear";
    }

    /**
     * Returns label-color pairings for legend display.
     * Overridden by HighestScoreColourModel and ManualProteinColorModel.
     * Called by utils.updateColourKey and keyViewBB.render.
     * @returns {Array<[string, string]>} Array of [label, hexColor] pairs, includes undefined label/color
     */
    getLabelColourPairings() {
        const colScale = this.get("colScale");
        const labels = this.get("labels").range().concat(this.get("undefinedLabel"));
        const minLength = Math.min(colScale.range().length, this.get("labels").range().length);  // restrict range used when ordinal scale
        const colScaleRange = colScale.range().slice(0, minLength).concat(this.get("undefinedColour"));
        return d3.zip(labels, colScaleRange);
    }
}

/**
 * Collection of color clms-backbone-models.
 * Used to manage multiple color scheme options (e.g., all available crosslink color schemes).
 * @class
 * @extends Backbone.Collection
 * @property {typeof ColourModel} model - Model class for collection items
 */
export class ColourModelCollection extends Backbone.Collection {
    constructor(models, options) {
        super(models, options);
        this.model = ColourModel;
    }
}

/**
 * Color backbone-models for hexadecimal color values stored in metadata.
 * Uses object ID as the value to look up hex color from scale.
 * For aggregate links, uses first crosslink's ID.
 * @class
 * @extends ColourModel
 */
export class MetaDataHexValuesColourModel extends ColourModel {
    /**
     * Initializes by copying colScale to labels.
     * @returns {undefined}
     */
    initialize() {
        this.set("labels", this.get("colScale").copy());
    }

    /**
     * Extracts value for coloring from object ID.
     * For aggregate links, returns first crosslink's ID.
     * @param {Object} obj - Crosslink or aggregate link object
     * @param {boolean} [obj.isAggregateLink] - True if obj is aggregate link
     * @param {string} obj.id - Object identifier
     * @returns {string} Object ID for color lookup
     */
    getValue(obj) {
        if (obj.isAggregateLink) { //} obj.crosslinks) {
            return obj.getCrosslinks()[0].id;
        }
        return obj.id;
    }
}

/**
 * Color backbone-models based on metadata field values.
 * Extracts value from obj.getMeta(field) and maps to color.
 * Works with any object that has getMeta() method (crosslinks, proteins).
 * @class
 * @extends ColourModel
 * @property {string} field - Metadata field name to extract (e.g., "score", "fdr")
 */
export class MetaDataColourModel extends ColourModel {
    /**
     * Initializes by setting labels to match domain values.
     * @param {Object} properties - Model attributes
     * @param {Object} options - Model options
     * @returns {undefined}
     */
    // eslint-disable-next-line no-unused-vars
    initialize(properties, options) {
        const domain = this.get("colScale").domain();
        this.set("labels", this.get("colScale").copy().range(domain)); //
    }

    /**
     * Extracts metadata field value for coloring.
     * For aggregate links, returns first crosslink's metadata value.
     * @param {Object} obj - Object with getMeta method (crosslink or protein)
     * @param {boolean} [obj.isAggregateLink] - True if obj is aggregate link
     * @param {Function} obj.getMeta - Method to get metadata value
     * @returns {*} Metadata field value (number, string, etc.)
     */
    getValue(obj) {  // obj can be anything with a getMeta function - crosslink or, now, proteins
        if (obj.isAggregateLink) { //} obj.crosslinks) {
            return obj.getCrosslinks()[0].getMeta(this.get("field"));
        }
        return obj.getMeta(this.get("field"));
    }
}

/**
 * Threshold-based color backbone-models with Low/Mid/High categories.
 * Uses threshold scale with two cutoffs to create three colored regions.
 * For aggregate links, takes maximum value across all crosslinks.
 * Filters out non-finite values (NaN, Infinity). Commonly used for score, distance, FDR.
 * @class
 * @extends ColourModel
 * @property {string} field - Metadata field name to extract (e.g., "score", "distance")
 */
export class ThresholdColourModel extends ColourModel { // todo -code duplication with Highest score col backbone-models
    /**
     * Initializes as threshold type with Low/Mid/High labels.
     * @returns {undefined}
     */
    initialize() {
        this.set("type", "threshold")
            .set("labels", this.get("colScale").copy().range(["Low", "Mid", "High"]));
    }

    /**
     * Extracts maximum finite metadata value for coloring.
     * For aggregate links, finds max across all crosslinks. Filters out NaN and Infinity.
     * Returns undefined if no finite values found.
     * @param {Object} obj - Crosslink or aggregate link object
     * @param {boolean} [obj.isAggregateLink] - True if obj is aggregate link
     * @param {Function} obj.getMeta - Method to get metadata value
     * @returns {number|undefined} Maximum finite value, or undefined if all values invalid
     */
    getValue(obj) {
        // return obj.getMeta(this.get("field"));

        let scores = [];
        if (obj.isAggregateLink) {
            for (let crosslink of obj.getCrosslinks()) {
                const val = crosslink.getMeta(this.get("field"));
                if (isFinite(val) && !isNaN(parseFloat(val))) {
                    scores.push(val);
                }
            }
        } else {
            // scores.push(obj.getMeta(this.get("field")));
            const val = obj.getMeta(this.get("field"));
            if (isFinite(val) && !isNaN(parseFloat(val))) {
                scores.push(val);
            }
        }
        const max = Math.max.apply(Math, scores);
        if (isFinite(max)) {
            return max;
        } else {
            return undefined;
        }
    }

    /**
     * Returns label-color pairings for legend display.
     * Same implementation as base class - included for completeness.
     * @returns {Array<[string, string]>} Array of [label, hexColor] pairs, includes undefined label/color
     */
    getLabelColourPairings() {
        const colScale = this.get("colScale");
        const labels = this.get("labels").range().concat(this.get("undefinedLabel"));
        const minLength = Math.min(colScale.range().length, this.get("labels").range().length);  // restrict range used when ordinal scale
        const colScaleRange = colScale.range().slice(0, minLength).concat(this.get("undefinedColour"));
        return d3.zip(labels, colScaleRange);
    }
}

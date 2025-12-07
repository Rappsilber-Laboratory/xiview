/**
 * @fileoverview Annotation type model and collection for managing protein sequence annotations.
 * AnnotationType represents single annotation category/type (e.g., "AA-DIGESTIBLE", "Alignment-PDB aligned region").
 * AnnotationTypeCollection manages all annotation types with automatic color generation based on category and type hash.
 */
import * as _ from "underscore";
import Backbone from "backbone";
import d3 from "d3";
import colorbrewer from "colorbrewer";

/**
 * Annotation type model representing a category/type pair for protein annotations.
 * Each type has unique ID (category-type), display state (shown), and color.
 * Used to track available annotation types and their visibility/styling.
 * @class
 * @extends Backbone.Model
 * @property {string} id - Unique identifier "category-type" (lowercase)
 * @property {string} category - Annotation category (e.g., "AA", "Alignment", "Domains and Sites")
 * @property {string} type - Specific annotation type within category (e.g., "DIGESTIBLE", "PDB aligned region")
 * @property {boolean} shown - Whether this annotation type is currently displayed
 * @property {string} colour - Hex color string for rendering this annotation type
 */
export class AnnotationType extends Backbone.Model {
    constructor(attributes, options) {
        super(attributes, options);
    }

    /**
     * Default attribute values for new annotation type instances.
     * @returns {Object} Default attributes
     */
    defaults() {
        return {
            id: undefined,
            category: undefined,
            type: undefined,
            shown: false,
            colour: undefined,
        };
    }

    /**
     * Initializes annotation type with category and type, generating lowercase ID.
     * @param {Object} options - Options object with category and type properties
     * @returns {undefined}
     */
    initialize(options) {
        const defaultOptions = {};
        this.options = _.extend(defaultOptions, options);
        this
            .set("id", (options.category + "-" + options.type).toLocaleLowerCase())
            .set("category", options.category)
            .set("type", options.type);
    }

}

/**
 * Collection of annotation types with automatic color generation.
 * Manages all annotation types, assigns colors based on category (using ColorBrewer Set3)
 * with type-specific shade variations calculated from type name hash.
 * Listens for userAnnotationsUpdated events to add new types dynamically.
 * @class
 * @extends Backbone.Collection
 * @property {Function} model - AnnotationType constructor
 * @property {Object} dict - Category name normalization dictionary
 * @property {d3.scale.ordinal} baseScale - D3 ordinal scale mapping categories to base colors
 */
export class AnnotationTypeCollection extends Backbone.Collection {

    constructor(attributes, options) {
        super(attributes, options);
        this.model = AnnotationType;

        //todo - make these static?
        this.dict = {
            "domains and sites": "sites",
            "structural": "secondary structure",
            "variants": "natural variations",
            "ptm": "amino acid modifications",
            "mutagenesis": "experimental info",
            "sequence information": "experimental info",
        };

        this.baseScale = d3.scale.ordinal()
            .range(colorbrewer.Set3[11])
            .domain(["aa", "alignment", "molecule processing", "regions", "sites", "amino acid modifications", "natural variations", "experimental info", "secondary structure", "undefined"]);
    }

    /**
     * Initializes collection and sets up event listener for user annotation updates.
     * Automatically adds new annotation types when userAnnotationsUpdated event fired.
     * @param {Array} models - Initial models (unused)
     * @param {Object} options - Options object (unused)
     * @returns {undefined}
     */
    // eslint-disable-next-line no-unused-vars
    initialize(models, options) {
        this.listenTo(window.vent, "userAnnotationsUpdated", function (details) {
            if (details.types) {
                // modelId declaration below is needed to stop same ids getting added - https://github.com/jashkenas/backbone/issues/3533
                this.add(details.types);
            }
        });
    }

    /**
     * Generates unique model ID from category and type attributes.
     * Prevents duplicate IDs when adding models to collection.
     * @param {Object} attrs - Attributes object with category and type properties
     * @returns {string} Lowercase ID string "category-type"
     * @see https://github.com/jashkenas/backbone/issues/3533
     */
    modelId(attrs) {
        return (attrs.category + "-" + attrs.type).toLocaleLowerCase();
    }

    /**
     * Comparator function for sorting collection by model ID.
     * @param {AnnotationType} model - Annotation type model to extract sort key from
     * @returns {string} Model ID for sorting
     */
    comparator(model) {
        return model.get("id");
    }

    /**
     * Gets or generates color for annotation category/type combination.
     * Uses baseScale for category color, then varies shade based on type name hash (for consistency).
     * Caches result in annotation type model. Returns gray if annotation type not found.
     * @param {string} catName - Category name (normalized via dict lookup)
     * @param {string} typeName - Type name within category
     * @returns {string} Hex color string or "#888888" if not found
     */
    getColour(catName, typeName) {
        catName = catName || "undefined";
        typeName = typeName || "undefined";
        const id = this.modelId({category: catName, type: typeName});
        const annotTypeModel = this.get(id);

        if (annotTypeModel) {
            if (!annotTypeModel.get("colour")) {
                catName = this.dict[catName] || catName;
                const catColour = this.baseScale(catName);
                let hash = 0,
                    i, chr;
                if (typeName) {
                    for (i = 0; i < typeName.length; i++) {
                        chr = typeName.charCodeAt(i);
                        hash = ((hash << 5) - hash) + chr;
                        hash |= 0; // Convert to 32bit integer
                    }
                }

                let shade = (hash & 255) / 255;
                shade = (shade * 0.7) + 0.2;
                const hsl = d3.hsl(catColour);
                const newHsl = d3.hsl(hsl.h, shade, shade);
                annotTypeModel.set("colour", newHsl.toString());
            }
            return annotTypeModel.get("colour");
        }
        return "#888888";
    }

    /*
    window.domainColours.cols = {
        "aa-cross-linkable": "#a6cee3",
        "aa-digestible": "#1f78b4",
        "alignment-pdb aligned region": "#b2df8a",
    };
    */
}

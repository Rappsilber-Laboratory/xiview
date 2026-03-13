/**
 * @fileoverview Simple Backbone backbone-models classes for UI components.
 * Contains clms-backbone-models for minigram visualization state, tooltip display, and BLOSUM matrix collection.
 */

import "../../css/minigram.css";
import Backbone from "backbone";
import d3 from "d3";

// I want MinigramBB to be backbone-models agnostic so I can re-use it in other places

/**
 * Model representing the state and data for a minigram visualization.
 * Minigrams are small histogram-style visualizations showing data distribution.
 * Designed to be backbone-models-agnostic for reusability across different contexts.
 * @class
 * @extends Backbone.Model
 * @property {number[]} extent - The data extent/range [min, max] for the minigram
 */
export class MinigramModel extends Backbone.Model {
    /**
     * Returns default values for the backbone-models.
     * Currently returns empty object, with commented placeholder properties for domain range.
     * @returns {Object} Default backbone-models attributes
     */
    defaults() {
        return {
            //domainStart: 0,
            //domainEnd: 100,
        };
    }

    /**
     * Returns sample data for the minigram.
     * Placeholder method that returns example data array.
     * @returns {number[]} Array of data values
     */
    data() {
        return [1, 2, 3, 4];
    }
}

MinigramModel.prototype.extent = [0, 4];

/**
 * Model representing tooltip state and content.
 * Manages tooltip location, header, and content display for interactive UI elements.
 * @class
 * @extends Backbone.Model
 * @property {Object|null} location - Tooltip position (null when hidden)
 * @property {string} header - Tooltip header text
 * @property {Array} contents - Array of content items (strings, objects, or table data)
 */
export class TooltipModel extends Backbone.Model {
    /**
     * Returns default values for tooltip backbone-models.
     * @returns {Object} Default attributes with null location and default header
     */
    defaults() {
        return {
            location: null,
            header: "Tooltip",
        };
    }

    /**
     * Initializes the tooltip backbone-models.
     * Sets contents array in initialize (not defaults) to avoid sharing array references between instances.
     * @returns {void}
     */
    initialize() {
        // ^^^setting an array in defaults passes that same array reference to every instantiated backbone-models, so do it in initialize
        this.set("contents", ["Can show", "single items", "lists or", "tables"]);
    }
}

/**
 * Model representing a single BLOSUM substitution matrix.
 * BLOSUM matrices are used for amino acid similarity scoring in sequence analysis.
 * @class
 * @extends Backbone.Model
 * @private
 */
class BlosumModel extends Backbone.Model {
    /**
     * Initializes the BLOSUM backbone-models.
     * @returns {void}
     */
    initialize() {
        //console.log ("Blosum backbone-models initialised", this);
    }
}


// this is separate to get round the fact BlosumModel won't be available within the same declaration
/**
 * Collection of BLOSUM substitution matrices.
 * Loads BLOSUM matrices from JSON and provides them for sequence alignment scoring.
 * Declared separately from BlosumModel to avoid circular dependency issues.
 * @class
 * @extends Backbone.Collection
 * @property {typeof BlosumModel} model - The backbone-models class for collection items
 * @property {string} url - URL to fetch BLOSUM data from
 */
export class BlosumCollection extends Backbone.Collection {
    /**
     * Creates a new BlosumCollection instance.
     * Sets the backbone-models class and URL for fetching BLOSUM data.
     * @param {Array} models - Initial clms-backbone-models for the collection
     * @param {Object} options - Configuration options
     */
    constructor(models, options) {
        super(models, options);
        this.model = BlosumModel;
        this.url = "R/blosums.json";
    }

    /**
     * Parses the BLOSUM JSON response into collection clms-backbone-models.
     * Converts JSON object into array, adding keys as id and name properties to each entry.
     * @param {Object} response - Raw JSON response from server (object with BLOSUM matrix names as keys)
     * @returns {Array} Array of BLOSUM backbone-models data objects
     */
    parse(response) {
        // turn json object into array, add keys to value parts, then export just the values
        const entries = d3.entries(response);
        const values = entries.map(function (entry) {
            entry.value.id = entry.key;
            entry.value.name = entry.key;
            return entry.value;
        });
        return values;
    }
}

/**
 * ScoreExtents class for tracking min/max ranges of score values
 * Maintains running minimum and maximum values as scores are processed
 */
export class ScoreExtent {
    /**
     * Score type name/identifier
     * @type {string}
     * @private
     */
    #name;

    /**
     * Minimum value seen so far
     * @type {number|undefined}
     * @private
     */
    #min;

    /**
     * Maximum value seen so far
     * @type {number|undefined}
     * @private
     */
    #max;

    /**
     * Number of valid scores processed
     * @type {number}
     * @private
     */
    #count;

    /**
     * Create a ScoreExtents instance for tracking score value ranges
     * @param {string} name - Score type name/identifier (e.g., "score", "match_fdr")
     */
    constructor(name) {
        this.#name = name;
        this.#min = undefined;
        this.#max = undefined;
        this.#count = 0;
    }

    /**
     * Get score type name
     * @returns {string} Score type name
     */
    get name() {
        return this.#name;
    }

    /**
     * Get minimum value seen so far
     * @returns {number|undefined} Minimum value, or undefined if no values processed
     */
    get min() {
        return this.#min;
    }

    /**
     * Get maximum value seen so far
     * @returns {number|undefined} Maximum value, or undefined if no values processed
     */
    get max() {
        return this.#max;
    }

    /**
     * Get count of valid scores processed
     * @returns {number} Number of valid scores processed
     */
    get count() {
        return this.#count;
    }

    /**
     * Process a score value and update min/max extents
     * Ignores null, undefined, and NaN values
     * @param {number} value - Score value to process
     */
    processScore(value) {
        // Ignore invalid values
        if (value === null || value === undefined || Number.isNaN(value)) {
            return;
        }

        // First valid value sets both min and max
        if (this.#count === 0) {
            this.#min = value;
            this.#max = value;
        } else {
            // Update min if value is lower
            if (value < this.#min) {
                this.#min = value;
            }
            // Update max if value is higher
            if (value > this.#max) {
                this.#max = value;
            }
        }

        this.#count++;
    }
}

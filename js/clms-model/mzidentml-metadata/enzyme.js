export class Enzyme {
    /**
     * Private raw JSON data containing all enzyme properties
     * @type {Object}
     * @private
     */
    #json;

    /**
     * Create an Enzyme instance
     * @param {Object} json - Raw enzyme data object
     * @param {string} json.id - Enzyme identifier
     * @param {string} json.name - Enzyme name
     * @param {string} json.cleavage - Cleavage pattern
     * @param {string} json.specificity - Enzyme specificity
     * @param {string} json.nTermGain - N-terminal gain
     * @param {string} json.cTermGain - C-terminal gain
     * @param {string} json.upload_id - Upload identifier
     * @param {string} json.protocol_id - Protocol identifier
     * @param {string} json.site_regexp - Site regular expression pattern
     * @param {number} json.min_distance - Minimum distance for cleavage
     * @param {number} json.missed_cleavages - Number of allowed missed cleavages
     * @param {boolean} json.semi_specific - Whether enzyme is semi-specific
     * @param {string} json.accession - Enzyme accession
     * @param {string} json.n_term_gain - Corrected N-terminal gain
     * @param {string} json.c_term_gain - Corrected C-terminal gain
     */
    constructor(json) {
        this.#json = json;
    }

    /**
     * Get enzyme identifier
     * @returns {string} Enzyme identifier
     */
    get id() {
        return this.#json.id;
    }

    /**
     * Get enzyme name
     * @returns {string} Enzyme name
     */
    get name() {
        return this.#json.name;
    }

    /**
     * Get cleavage pattern
     * @returns {string} Cleavage pattern
     */
    get cleavage() {
        return this.#json.cleavage;
    }

    /**
     * Get enzyme specificity
     * @returns {string} Enzyme specificity
     */
    get specificity() {
        return this.#json.specificity;
    }

    /**
     * Get N-terminal gain
     * @returns {string} N-terminal gain
     */
    get nTermGain() {
        return this.#json.nTermGain;
    }

    /**
     * Get C-terminal gain
     * @returns {string} C-terminal gain
     */
    get cTermGain() {
        return this.#json.cTermGain;
    }

    /**
     * Get upload identifier
     * @returns {string} Upload identifier
     */
    get uploadId() {
        return this.#json.upload_id;
    }

    /**
     * Get protocol identifier
     * @returns {string} Protocol identifier
     */
    get protocolId() {
        return this.#json.protocol_id;
    }

    /**
     * Get site regular expression pattern
     * @returns {string} Site regexp
     */
    get siteRegexp() {
        return this.#json.site_regexp;
    }

    /**
     * Get minimum distance for cleavage
     * @returns {number} Minimum distance
     */
    get minDistance() {
        return this.#json.min_distance;
    }

    /**
     * Get number of allowed missed cleavages
     * @returns {number} Missed cleavages count
     */
    get missedCleavages() {
        return this.#json.missed_cleavages;
    }

    /**
     * Check if enzyme is semi-specific
     * @returns {boolean} True if semi-specific
     */
    get semiSpecific() {
        return this.#json.semi_specific;
    }

    /**
     * Get enzyme accession
     * @returns {string} Enzyme accession
     */
    get accession() {
        return this.#json.accession;
    }

    /**
     * Get corrected N-terminal gain
     * @returns {string} Corrected N-terminal gain
     */
    get nTermGainCorrected() {
        return this.#json.n_term_gain;
    }

    /**
     * Get corrected C-terminal gain
     * @returns {string} Corrected C-terminal gain
     */
    get cTermGainCorrected() {
        return this.#json.c_term_gain;
    }

    /**
     * Convert to JSON object for serialization
     * @returns {Object} Object with all getter values
     */
    toJSON() {
        return {
            // id: this.id,
            name: this.name,
            cleavage: this.cleavage,
            specificity: this.specificity,
            nTermGain: this.nTermGain,
            cTermGain: this.cTermGain,
            // uploadId: this.uploadId,
            // protocolId: this.protocolId,
            siteRegexp: this.siteRegexp,
            minDistance: this.minDistance,
            missedCleavages: this.missedCleavages,
            semiSpecific: this.semiSpecific,
            accession: this.accession,
            nTermGainCorrected: this.nTermGainCorrected,
            cTermGainCorrected: this.cTermGainCorrected
        };
    }
}

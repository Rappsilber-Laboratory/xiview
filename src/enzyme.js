export class Enzyme {
    /**
     * Create an Enzyme instance
     * @param {Object} json - Raw enzyme data object
     */
    constructor(json) {
        this._json = json;
    }

    /**
     * Get enzyme identifier
     * @returns {string} Enzyme identifier
     */
    get id() {
        return this._json.id;
    }

    /**
     * Get enzyme name
     * @returns {string} Enzyme name
     */
    get name() {
        return this._json.name;
    }

    /**
     * Get cleavage pattern
     * @returns {string} Cleavage pattern
     */
    get cleavage() {
        return this._json.cleavage;
    }

    /**
     * Get enzyme specificity
     * @returns {string} Enzyme specificity
     */
    get specificity() {
        return this._json.specificity;
    }

    /**
     * Get N-terminal gain
     * @returns {string} N-terminal gain
     */
    get nTermGain() {
        return this._json.nTermGain;
    }

    /**
     * Get C-terminal gain
     * @returns {string} C-terminal gain
     */
    get cTermGain() {
        return this._json.cTermGain;
    }

    /**
     * Get upload identifier
     * @returns {string} Upload identifier
     */
    get uploadId() {
        return this._json.upload_id;
    }

    /**
     * Get protocol identifier
     * @returns {string} Protocol identifier
     */
    get protocolId() {
        return this._json.protocol_id;
    }

    /**
     * Get site regular expression pattern
     * @returns {string} Site regexp
     */
    get siteRegexp() {
        return this._json.site_regexp;
    }

    /**
     * Get minimum distance for cleavage
     * @returns {number} Minimum distance
     */
    get minDistance() {
        return this._json.min_distance;
    }

    /**
     * Get number of allowed missed cleavages
     * @returns {number} Missed cleavages count
     */
    get missedCleavages() {
        return this._json.missed_cleavages;
    }

    /**
     * Check if enzyme is semi-specific
     * @returns {boolean} True if semi-specific
     */
    get semiSpecific() {
        return this._json.semi_specific;
    }

    /**
     * Get enzyme accession
     * @returns {string} Enzyme accession
     */
    get accession() {
        return this._json.accession;
    }

    /**
     * Get corrected N-terminal gain
     * @returns {string} Corrected N-terminal gain
     */
    get nTermGainCorrected() {
        return this._json.n_term_gain;
    }

    /**
     * Get corrected C-terminal gain
     * @returns {string} Corrected C-terminal gain
     */
    get cTermGainCorrected() {
        return this._json.c_term_gain;
    }
}

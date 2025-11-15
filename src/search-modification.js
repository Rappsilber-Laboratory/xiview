export class SearchModification {
    /**
     * Create a SearchModification instance
     * @param {Object} json - Raw modification data object
     */
    constructor(json) {
        this._json = json;
    }

    /**
     * Get modification identifier (compound key)
     * @returns {string} Modification identifier
     */
    get id() {
        return this._json.upload_id + "_" + this._json.protocol_id + "_" +  this._json.id;
    }

    /**
     * Get modification mass delta
     * @returns {number} Mass delta
     */
    get massDelta() {
        return this._json.massDelta;
    }

    /**
     * Get modification location
     * @returns {string} Modification location
     */
    get location() {
        return this._json.location;
    }

    /**
     * Get residue being modified
     * @returns {string} Residue
     */
    get residue() {
        return this._json.residue;
    }

    /**
     * Get search modification type
     * @returns {string} Modification type
     */
    get searchModificationType() {
        return this._json.searchModificationType;
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
     * Get modification mass
     * @returns {number} Modification mass
     */
    get mass() {
        return this._json.mass;
    }

    /**
     * Get residues that can be modified
     * @returns {Array<string>} Array of residues
     */
    get residues() {
        return this._json.residues;
    }

    /**
     * Check if modification is fixed
     * @returns {boolean} True if fixed modification
     */
    get fixedMod() {
        return this._json.fixed_mod;
    }

    /**
     * Get modification accessions
     * @returns {Array<string>} Array of accession identifiers
     */
    get accessions() {
        return this._json.accessions;
    }

    /**
     * Get crosslinker identifier
     * @returns {string} Crosslinker identifier
     */
    get crosslinkerId() {
        return this._json.crosslinker_id;
    }
}

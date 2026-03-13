export class SearchModification {
    /**
     * Private raw JSON data containing all modification properties
     * @type {Object}
     * @private
     */
    #json;

    /**
     * Create a SearchModification instance
     * @param {Object} json - Raw modification data object
     * @param {string} json.id - Modification identifier
     * @param {string} json.upload_id - Upload identifier
     * @param {string} json.protocol_id - Protocol identifier
     * @param {number} json.massDelta - Modification mass delta
     * @param {string} json.location - Modification location
     * @param {string} json.residue - Residue being modified
     * @param {string} json.searchModificationType - Search modification type
     * @param {number} json.mass - Modification mass
     * @param {Array<string>} json.residues - Array of residues that can be modified
     * @param {boolean} json.fixed_mod - Whether this is a fixed modification
     * @param {Array<string>} json.accessions - Array of modification accession identifiers
     * @param {string} json.crosslinker_id - Crosslinker identifier
     */
    constructor(json) {
        this.#json = json;
    }

    /**
     * Get modification identifier (compound key)
     * @returns {string} Modification identifier
     */
    get id() {
        return this.#json.upload_id + "_" + this.#json.protocol_id + "_" +  this.#json.id;
    }

    /**
     * Get modification mass delta
     * @returns {number} Mass delta
     */
    get massDelta() {
        return this.#json.massDelta;
    }

    /**
     * Get modification location
     * @returns {string} Modification location
     */
    get location() {
        return this.#json.location;
    }

    /**
     * Get residue being modified
     * @returns {string} Residue
     */
    get residue() {
        return this.#json.residue;
    }

    /**
     * Get search modification type
     * @returns {string} Modification type
     */
    get searchModificationType() {
        return this.#json.searchModificationType;
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
     * Get modification mass
     * @returns {number} Modification mass
     */
    get mass() {
        return this.#json.mass;
    }

    /**
     * Get residues that can be modified
     * @returns {Array<string>} Array of residues
     */
    get residues() {
        return this.#json.residues;
    }

    /**
     * Check if modification is fixed
     * @returns {boolean} True if fixed modification
     */
    get fixedMod() {
        return this.#json.fixed_mod;
    }

    /**
     * Get modification accessions
     * @returns {Array<string>} Array of accession identifiers
     */
    get accessions() {
        return this.#json.accessions;
    }

    /**
     * Get crosslinker identifier
     * @returns {string} Crosslinker identifier
     */
    get crosslinkerId() {
        return this.#json.crosslinker_id;
    }

    /**
     * Convert to JSON object for serialization
     * @returns {Object} Object with all getter values
     */
    toJSON() {
        return {
            // id: this.id,
            massDelta: this.massDelta,
            location: this.location,
            residue: this.residue,
            searchModificationType: this.searchModificationType,
            // uploadId: this.uploadId,
            // protocolId: this.protocolId,
            mass: this.mass,
            residues: this.residues,
            fixedMod: this.fixedMod,
            accessions: this.accessions,
            crosslinkerId: this.crosslinkerId
        };
    }
}

export class SpectrumIdentificationProtocol {
    /**
     * Private JSON data sent by crosslinking-API
     * @type {Object}
     * @private
     */
    #json;

    /**
     * Private array of Enzyme instances
     * @type {Array<Enzyme>}
     */
    #enzymes;

    /**
     * Private array of SearchModification instances
     */
    #searchModifications;

    /**
     * Create a SpectrumIdentificationProtocol instance
     * @param {Object} json - JSON data sent by crosslinking-API
     * @param {number} json.id - Protocol identifier
     * @param {string} json.sip_ref - Spectrum identification protocol reference
     * @param {number} json.upload_id - Upload identifier
     * @param {number} json.frag_tol - Fragment ion tolerance value
     * @param {string} json.frag_tol_unit - Fragment ion tolerance unit (e.g., "ppm", "Da")
     * @param {Object} json.additional_search_params - Additional search parameters object with CV term key-value pairs
     * @param {Object} json.analysis_software - Analysis software information object
     * @param {Object} json.threshold - Search threshold object
     * @param {Array<Enzyme>} enzymes - Array of Enzyme instances used in the search
     * @param {Array<SearchModification>} searchModifications - Array of Modification instances used in the search
     */
    constructor(json, enzymes, searchModifications) {
        this.#json = json;
        this.#enzymes = enzymes;
        this.#searchModifications = searchModifications;
    }

    // {
    //     "id": 0,
    //     "sip_ref": "SearchProtocol_1_0",
    //     "upload_id": 33,
    //     "frag_tol": 5,
    //     "frag_tol_unit": "ppm",
    //     "additional_search_params": {
    //         "MS:1001211": "parent mass type mono",
    //         "MS:1002494": "crosslinking search",
    //         "MS:1001256": "fragment mass type mono"
    //     },
    //     "analysis_software": {
    //         "version": "2.1.5.5",
    //         "id": "xiFDR_id",
    //         "name": "XiFDR",
    //         "SoftwareName": {
    //             "xiFDR": ""
    //         }
    //     },
    //     "threshold": {
    //         "no threshold": ""
    //     }
    // }

    /**
     * Get protocol identifier
     * @returns {number} Protocol identifier
     */
    get id()  {
        return this.#json.id;
    }
    /**
     * Get spectrum identification protocol reference
     * @returns {string} Protocol reference
     */
    get spectrumIdentificationProtocolRef() {
        return this.#json.sip_ref;
    }
    /**
     * Get upload identifier
     * @returns {number} Upload identifier
     */
    get uploadId() {
        return this.#json.upload_id;
    }
    /**
     * Get fragment ion tolerance value
     * @returns {number} Fragment tolerance
     */
    get fragmentTolerance() {
        return this.#json.frag_tol;
    }
    /**
     * Get fragment ion tolerance unit
     * @returns {string} Tolerance unit (e.g., "ppm", "Da")
     */
    get fragmentToleranceUnit() {
        return this.#json.frag_tol_unit;
    }
    /**
     * Get additional search parameters
     * @returns {Object} Object containing CV term key-value pairs
     */
    get additionalSearchParams() {
        return this.#json.additional_search_params;
    }
    /**
     * Get analysis software information
     * @returns {Object} Software information object
     */
    get analysisSoftware() {
        return this.#json.analysis_software;
    }
    /**
     * Get search threshold information
     * @returns {Object} Threshold object
     */
    get threshold() {
        return this.#json.threshold;
    }

    // /**
    //  * Get fragment tolerance settings
    //  * @returns {Object} Object with tolerance and unit properties
    //  */
    // fragmentTolerance() {
    //     const sip = this.spectrumIdentificationProtocol;
    //     return {
    //         "tolerance": sip.fragmentTolerance,
    //         "unit": sip.fragmentToleranceUnit
    //     };
    // }

    /**
     * Get fragment tolerance as formatted string
     * @returns {string|undefined} Fragment tolerance string or undefined
     */
    fragmentToleranceString() {
        let fragTol = this.fragmentTolerance();
        if (fragTol) {
            return fragTol.tolerance + " " + fragTol.unit;
        }
    }

    /**
     * Get ion types for this match
     * @returns {Array<Object>} Array of ion type objects
     */
    ionTypes() {
        // // Initialize ion types
        // // todo - get from SIP, also CV term issues to be addressed (needed CV terms were deprecated)
        // this.ions = [{type:"bIon"}, {type:"yIon"}];
        return this.ions;
    }

    // /**
    //  * Get ion types as JSON string
    //  * @returns {string} JSON string of ion types
    //  */
    // ionTypesString() {
    //     return JSON.stringify(this.ionTypes());
    // }
    /**
     * Convert to JSON object for serialization
     * @returns {Object} Object with all getter values
     */
    toJSON() {
        return {
            // id: this.id,
            spectrumIdentificationProtocolRef: this.spectrumIdentificationProtocolRef,
            // uploadId: this.uploadId,
            fragmentTolerance: this.fragmentTolerance,
            fragmentToleranceUnit: this.fragmentToleranceUnit,
            additionalSearchParams: this.additionalSearchParams,
            analysisSoftware: this.analysisSoftware,
            threshold: this.threshold
        };
    }
}

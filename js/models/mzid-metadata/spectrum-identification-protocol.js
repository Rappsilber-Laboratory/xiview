export class SpectrumIdentificationProtocol {
    /**
     * Create a SpectrumIdentificationProtocol instance
     * @param {Object} json - Raw protocol data object
     * @param {SearchResultsModel} searchResultModel - The containing search results model
     */
    constructor(json, searchResultModel) {
        this._json = json;
        this._searchResultModel = searchResultModel;
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
        return this._json.id;
    }
    /**
     * Get spectrum identification protocol reference
     * @returns {string} Protocol reference
     */
    get spectrumIdentificationProtocolRef() {
        return this._json.sip_ref;
    }
    /**
     * Get upload identifier
     * @returns {number} Upload identifier
     */
    get uploadId() {
        return this._json.upload_id;
    }
    /**
     * Get fragment ion tolerance value
     * @returns {number} Fragment tolerance
     */
    get fragmentTolerance() {
        return this._json.frag_tol;
    }
    /**
     * Get fragment ion tolerance unit
     * @returns {string} Tolerance unit (e.g., "ppm", "Da")
     */
    get fragmentToleranceUnit() {
        return this._json.frag_tol_unit;
    }
    /**
     * Get additional search parameters
     * @returns {Object} Object containing CV term key-value pairs
     */
    get additionalSearchParams() {
        return this._json.additional_search_params;
    }
    /**
     * Get analysis software information
     * @returns {Object} Software information object
     */
    get analysisSoftware() {
        return this._json.analysis_software;
    }
    /**
     * Get search threshold information
     * @returns {Object} Threshold object
     */
    get threshold() {
        return this._json.threshold;
    }

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

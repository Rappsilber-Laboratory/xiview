export class AnalysisCollectionSpectrumIdentification {

    #json;
    #mzidentmlFile;

    /**
     * Create an AnalysisCollectionSpectrumIdentification instance
     * @param {Object} json - Raw analysis collection data object
     * @param {MzIdentMLFile} mzidentmlFile - The containing mzIdentML file
     */
    constructor(json, mzidentmlFile) {
        this.#json = json;
        this.#mzidentmlFile = mzidentmlFile;
    }

    /**
     * Get upload identifier
     * @returns {int} Upload identifier
     */
    get uploadId() {
        return this.#json.upload_id;
    }

    /**
     * Get spectrum identification list reference
     * @returns {string} Spectrum identification list reference
     */
    get spectrumIdentificationListRef() {
        return this.#json.spectrum_identification_list_ref;
    }

    /**
     * Get spectrum identification protocol reference
     * @returns {string} Spectrum identification protocol reference
     */
    get spectrumIdentificationProtocolRef() {
        return this.#json.spectrum_identification_protocol_ref;
    }

    /**
     * Get spectra data references
     * @returns {Array<string>} Array of spectra data reference identifiers
     */
    get spectraDataRefs() {
        return this.#json.spectra_data_refs;
    }

    /**
     * Get search database references
     * @returns {Array<string>} Array of search database reference identifiers
     */
    get searchDatabaseRefs() {
        return this.#json.search_database_refs;
    }

    /**
     * Convert to JSON object for serialization
     * @returns {Object} Object with all getter values
     */
    toJSON() {
        return {
            uploadId: this.uploadId,
            spectrumIdentificationListRef: this.spectrumIdentificationListRef,
            spectrumIdentificationProtocolRef: this.spectrumIdentificationProtocolRef,
            spectraDataRefs: this.spectraDataRefs,
            searchDatabaseRefs: this.searchDatabaseRefs
        };
    }
}
//
// /**
//  * Get spectrum identification protocol by upload ID and protocol ID
//  * @param {string} uploadId - The upload identifier
//  * @param {string} id - The protocol identifier
//  * @returns {SpectrumIdentificationProtocol|null} The protocol object or null if not found
//  */
// getSpectrumIdentificationProtocol(uploadId, id) {
//     const spectrumIdentificationProtocols = this.#spectrumIdentificationProtocols;
//     if (spectrumIdentificationProtocols) {
//         return spectrumIdentificationProtocols.get(uploadId + "_" + id);
//     } else {
//         console.error("No spectrum identification protocol found for uploadId:", uploadId, "and id:", id);
//         return null;
//     }
// }

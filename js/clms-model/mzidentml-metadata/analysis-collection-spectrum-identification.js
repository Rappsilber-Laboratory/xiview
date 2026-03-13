/*
 * represents contents of <AnalysisCollection><SpectrumIdentification> element, hence confusing name
 */
export class AnalysisCollection_SpectrumIdentification {
    /**
     * Private JSON data sent by crosslinking-API
     * @type {Object}
     * @private
     */
    #json;

    /**
     * Create an AnalysisCollection_SpectrumIdentification instance
     * @param {Object} json - JSON data sent by crosslinking-API
     * @param {int} json.upload_id - Upload identifier
     * @param {string} json.spectrum_identification_list_ref - Spectrum identification list reference
     * @param {string} json.spectrum_identification_protocol_ref - Spectrum identification protocol reference
     * @param {Array<string>} json.spectra_data_refs - Array of spectra data reference identifiers
     * @param {Array<string>} json.search_database_refs - Array of search database reference identifiers
     * @param {MzidentmlFile} mzidentmlFile - The containing mzIdentML file
     */
    constructor(json, spectrumIdentifcationProtocols, spectraData) {
        this.#json = json;
    }

    // /**
    //  * Get upload identifier
    //  * @returns {int} Upload identifier
    //  */
    // get uploadId() {
    //     return this.#json.upload_id;
    // }
    //
    // /**
    //  * Get spectrum identification list reference
    //  * @returns {string} Spectrum identification list reference
    //  */
    // get spectrumIdentificationListRef() {
    //     return this.#json.spectrum_identification_list_ref;
    // }

    /**
     * Get spectrum identification protocol
     * @returns {SpectrumIdentificationProtocol} Spectrum identification protocol object
     */
    get spectrumIdentificationProtocol() {
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
            // uploadId: this.uploadId,
            spectrumIdentificationListRef: this.#json.spectrum_identification_list_ref,
            spectrumIdentificationProtocolRef: this.#json.spectrum_identification_protocol_ref,
            spectrumIdentificationProtocol: this.spectrumIdentifcationProtocol,
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

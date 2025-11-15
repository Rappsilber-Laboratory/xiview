export class AnalysisCollectionSpectrumIdentification {
    /**
     * Create an AnalysisCollectionSpectrumIdentification instance
     * @param {Object} json - Raw analysis collection data object
     * @param {SearchResultsModel} searchResultModel - The containing search results model
     */
    constructor(json, searchResultModel) {
        this._json = json;
        this._searchResultModel = searchResultModel;
    }

    // {
    //     "upload_id": 1,
    //     "spectrum_identification_list_ref": "sil_HCD",
    //     "spectrum_identification_protocol_ref": "SearchProtocol_HCD",
    //     "spectra_data_refs": ["peaklist_id"],
    //     "search_database_refs": ["database_id"]
    // }

    /**
     * Get upload identifier
     * @returns {number} Upload identifier
     */
    get uploadId() {
        return this._json.upload_id;
    }

    /**
     * Get spectrum identification list reference
     * @returns {string} Spectrum identification list reference
     */
    get spectrumIdentificationListRef() {
        return this._json.spectrum_identification_list_ref;
    }

    /**
     * Get spectrum identification protocol reference
     * @returns {string} Spectrum identification protocol reference
     */
    get spectrumIdentificationProtocolRef() {
        return this._json.spectrum_identification_protocol_ref;
    }

    /**
     * Get spectra data references
     * @returns {Array<string>} Array of spectra data reference identifiers
     */
    get spectraDataRefs() {
        return this._json.spectra_data_refs;
    }

    /**
     * Get search database references
     * @returns {Array<string>} Array of search database reference identifiers
     */
    get searchDatabaseRefs() {
        return this._json.search_database_refs;
    }
}

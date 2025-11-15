export class MzidentmlFile {
    /**
     * Create an MzidentmlFile instance
     * @param {Object} json - Raw mzIdentML file data
     * @param {SearchResultsModel} searchResultModel - The containing search results model
     */
    constructor(json, searchResultModel) {
        this._json = json;
        this._searchResultModel = searchResultModel;
    }

    /**
     * Get analysis collection spectrum identification
     * @returns {AnalysisCollectionSpectrumIdentification} Analysis collection
     */
    get analysisCollectionSpectrumIdentifcation (){
        return this._searchResultModel.analysisCollectionSpectrumIdentifcation.get(this.id);
    }

    /**
     * Get file identifier (upload_id)
     * @returns {string} File identifier
     */
    // Note: id is what is referred to as upload_id elsewhere
    get id() {
        return this._json.id;
    }

    /**
     * Get project identifier
     * @returns {string} Project identifier
     */
    get projectId() {
        return this._json.project_id;
    }

    /**
     * Get identification file name
     * @returns {string} Identification file name
     */
    get identificationFileName() {
        return this._json.identification_file_name;
    }

    /**
     * Get provider information
     * @returns {*} Provider data
     */
    get provider() {
        return this._json.provider;
    }

    /**
     * Get audit collection information
     * @returns {*} Audit collection data
     */
    get auditCollection() {
        return this._json.audit_collection;
    }

    /**
     * Get analysis sample collection
     * @returns {*} Analysis sample collection data
     */
    get analysisSampleCollection() {
        return this._json.analysis_sample_collection;
    }

    /**
     * Get bibliography information
     * @returns {*} Bibliography data
     */
    get bib() {
        return this._json.bib;
    }

    /**
     * Get spectra file formats
     * @returns {*} Spectra formats data
     */
    get spectraFormats() {
        return this._json.spectra_formats;
    }

    /**
     * Convert to JSON object for serialization
     * @returns {Object} Object with all getter values
     */
    toJSON() {
        // Return an object with all getter values for serialization
        // This allows customization of what gets displayed in JSON viewers
        return {
            id: this.id,
            projectId: this.projectId,
            identificationFileName: this.identificationFileName,
            provider: this.provider,
            auditCollection: this.auditCollection,
            analysisSampleCollection: this.analysisSampleCollection,
            bib: this.bib,
            spectraFormats: this.spectraFormats
        };
    }

}

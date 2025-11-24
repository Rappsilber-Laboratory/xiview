import {AnalysisCollectionSpectrumIdentification} from "./analysis-collection-spectrum-identification";

export class MzidentmlFile {

    #json;
    #analysisCollectionSpectrumIdentifications = [];
    #spectraDataById = new Map();
    #sipsById = new Map();
    
    /**
     * Create an MzidentmlFile instance
     * @param {Object} json - Raw mzIdentML file data
     * @param {SearchResultsModel} searchResultModel - The containing search results model
     */
    constructor(json,
        analysisCollectionSpectrumIdentificationsJson,
        spectraIdentificationProtocolsJson,
        searchModificationsJson,
        spectraDataJson,
    ) {
        this.#json = json;

        // Build analysisCollectionSpectrumIdentifications array
        for (const acsi of analysisCollectionSpectrumIdentificationsJson) {
            if (acsi.upload_id === this.id) {
                this.#analysisCollectionSpectrumIdentifications.push(
                    new AnalysisCollectionSpectrumIdentification(acsi, this)
                );
            }
        }
        // Build spectraDataById map
        // for (const sd of spectraDataJson) {
        //     if (sd.uploadId === this.id) {
        //         this.#spectraDataById.set(sd.id, sd);
        //     }
        // }

    }

    /**
     * Get file identifier (upload_id)
     * @returns {int} File identifier
     */
    get id() {
        return this.#json.id;
    }

    /**
     * Get project identifier
     * @returns {string} Project identifier
     */
    get projectId() {
        return this.#json.project_id;
    }

    /**
     * Get identification file name
     * @returns {string} Identification file name
     */
    get identificationFileName() {
        return this.#json.identification_file_name;
    }

    /**
     * Get analysis software
     * @returns [{*}] Analysis software data
     */
    get analysisSoftware() {
        return this.#json.analysis_software_list.AnalysisSoftware;
    }

    /**
     * Get provider information
     * @returns {*} Provider data
     */
    get provider() {
        return this.#json.provider;
    }

    /**
     * Get audit collection information
     * @returns {*} Audit collection data
     */
    get auditCollection() {
        return this.#json.audit_collection;
    }

    /**
     * Get analysis sample collection
     * @returns {*} Analysis sample collection data
     */
    get analysisSampleCollection() {
        return this.#json.analysis_sample_collection;
    }

    /**
     * Get <AnalysisCollection><SpectrumIdentification> data
     * @returns {Map<string, AnalysisCollectionSpectrumIdentification>} Map of spectrumIdentificationListRef to AnalysisCollectionSpectrumIdentification
     */
    get analysisCollection_SpectrumIdentifcations (){
        return this.#analysisCollectionSpectrumIdentifications;
    }


    // /**
    //  * Get spectrum identification protocol collection <AnalysisProtocolCollection><SpectrumIdentificationProtocol>
    //  * @returns [SpectrumIdentificationProtocol] Get spectrum identification protocol array
    //  */
    // get spectrumIdentificationProtocols() {
    //     return this.#searchResultModel.getSpectrumIdentificationProtocols().get(this.id);
    // }


    /**
     * Get spectra file formats
     * @returns [SpectraData] Spectra formats data
     */
    get spectraFormats() {
        return this.#json.spectra_formats;
    }

    /**
     * Get bibliography information
     * @returns {*} Bibliography data
     */
    get bib() {
        return this.#json.bib;
    }

    /**
     * Get spectra data by identifier
     * @param spectraDataId
     */
    getSpectraDataById(spectraDataId) {

    }

    /**
     * Get spectrum identification protocol by identifier
     * @param protocolId
     * @return {SpectrumIdentificationProtocol}
     */
    getSpectrumIdentificationProtocolById(protocolId) {
        return this.spectrumIdentificationProtocols.find(protocol => protocol.id === protocolId);
    }

    /**
     * Convert to JSON object for serialization
     * @returns {Object} Object with all getter values
     */
    toJSON() {
        // Return an object with all getter values for serialization
        // This allows customization of what gets displayed in JSON viewers

        const returnObj =  {
            // id: this.id,
            // projectId: this.projectId,
            // identificationFileName: this.identificationFileName,
            analysisSoftware: this.analysisSoftware,
            provider: this.provider,
            auditCollection: this.auditCollection,
            analysisSampleCollection: this.analysisSampleCollection,
            analysisCollectionSpectrumIdentifcations: this.#analysisCollectionSpectrumIdentifications,
            // analysisProtocolCollection: this.analysisCollectionProtocolCollection,
            bib: this.bib,
            spectraFormats: this.spectraFormats,
        };
        console.log("*", returnObj);
        return returnObj;
    }

}

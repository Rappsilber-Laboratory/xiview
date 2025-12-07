import {AnalysisCollection_SpectrumIdentification} from "./analysis-collection-spectrum-identification";

export class MzidentmlFile {
    /**
     * Private JSON data sent by crosslinking-API
     * @type {Object}
     * @private
     */
    #json;

    /**
     * Private array of AnalysisCollection_SpectrumIdentification instances for this file
     * @type {Array<AnalysisCollection_SpectrumIdentification>}
     * @private
     */
    #analysisCollection_spectrumIdentifications = [];

    /**
     * Private map of SpectraData objects keyed by spectra data ID
     * @type {Map<number, SpectraData>}
     * @private
     */
    #spectraDataById;

    /**
     * Private map of SpectrumIdentificationProtocol objects keyed by protocol ID
     * @type {Map<number, SpectrumIdentificationProtocol>}
     * @private
     */
    #sipsById = new Map();

    /**
     * Create an MzidentmlFile instance
     * @param {Object} json - Raw mzIdentML file data
     * @param {int} json.id - File identifier (upload_id)
     * @param {string} json.project_id - Project identifier
     * @param {string} json.identification_file_name - Identification file name
     * @param {Object} json.analysis_software_list - Analysis software list object
     * @param {Object} json.analysis_software_list.AnalysisSoftware
     * @param {Object} json.provider - Provider information
     * @param {Object} json.audit_collection - Audit collection data
     * @param {Object} json.analysis_sample_collection - Analysis sample collection data
     * @param {Object} json.spectra_formats - Spectra file formats data
     * @param {Object} json.bib - Bibliography information
     * @param {Array<Object>} analysisCollectionSpectrumIdentifications - Array of AnalysisCollection_SpectrumIdentification objects
     * @param {Array<Object>} spectraData - Array of SpectraData objects
     */
    constructor(json,
        analysisCollectionSpectrumIdentifications,
        spectraData,
        sipsbyIds
    ) {
        this.#json = json;
        this.#analysisCollection_spectrumIdentifications = analysisCollectionSpectrumIdentifications;
        this.#spectraDataById = spectraData;
        this.#sipsById = sipsbyIds;

        // Build analysisCollectionSpectrumIdentifications array
        // for (const acsi of analysisCollectionSpectrumIdentificationsJson) {
        //     if (acsi.upload_id === this.id) {
        //         this.#analysisCollection_spectrumIdentifications.push(
        //             new AnalysisCollection_SpectrumIdentification(acsi, this)
        //         );
        //     }
        // }
        // Build spectraDataById map
        // for (const sd of spectraData) {
        //     // if (sd.uploadId === this.id) {
        //     this.spectraDataById.set(sd.id, sd);
        //     // }
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
     * Get AnalysisCollection_SpectrumIdentification data
     * @returns {Array<AnalysisCollection_SpectrumIdentification>} AnalysisCollection_SpectrumIdentification array
     */
    get analysisCollection_SpectrumIdentifcations (){
        return this.#analysisCollection_spectrumIdentifications;
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
        return this.#spectraDataById.get(spectraDataId);
    }

    /**
     * Get spectrum identification protocol by identifier
     * @param protocolId
     * @return {SpectrumIdentificationProtocol}
     */
    getSpectrumIdentificationProtocolById(protocolId) {
        return this.#sipsById.get(protocolId);
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
            analysisSoftware: arrayToObjectById(this.analysisSoftware),
            provider: this.provider,
            auditCollection: this.auditCollection,
            analysisSampleCollection: this.analysisSampleCollection,
            analysisCollection_spectrumIdentifcations: arrayToObjectByProperty(this.#analysisCollection_spectrumIdentifications,
                'spectrumIdentificationListRef'),
            // analysisProtocolCollection: this.analysisCollectionProtocolCollection,
            bib: this.bib,
            spectraFormats: this.spectraFormats,
        };
        console.log("*", returnObj);
        return returnObj;
    }

}

//util func to copnvert array to map indexed by id
function arrayToMapById(array) {
    const map = new Map();
    for (const item of array) {
        map.set(item.id, item);
    }
    return map;
}

//util func to copnvert array to object indexed by id
function arrayToObjectById(array) {
    const obj = {};
    for (const item of array) {
        obj[item.id] = item;
    }
    return obj;
}

//util func to copnvert array to object indexed by given property
function arrayToObjectByProperty(array, property) {
    const obj = {};
    for (const item of array) {
        obj[item[property]] = item;
    }
    return obj;
}

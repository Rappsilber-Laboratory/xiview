import {AnalysisCollection_SpectrumIdentification} from "./analysis-collection-spectrum-identification";

export class MzidentmlFile {
    /**
     * Private JSON data sent by crosslinking-API
     * @type {Object}
     * @private
     */
    #json;

    /**
     * Private map of SpectraData objects keyed by spectra data ID
     * @type {Map<number, SpectraData>}
     * @private
     */
    #spectraDataById;

    /**
     * Private array of AnalysisCollection_SpectrumIdentification instances for this file
     * @type {Array<AnalysisCollection_SpectrumIdentification>}
     * @private
     */
    #analysisCollection_spectrumIdentifications = [];

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
     * @param {Object} json.provider.ContactRole - Provider Contact Role information
     * @param {Object} json.audit_collection - Audit collection data
     * @param {Object} json.audit_collection.Person - Audit collection Person data
     * @param {Object} json.audit_collection.Person.Affiliation - Audit collection Person data
     * @param {Object} json.audit_collection.Organization - Audit collection Organisation data
     * @param {Object} json.analysis_sample_collection - Analysis sample collection data
     * @param {Object} json.spectra_formats - Spectra file formats data
     * @param {Object} json.bib - Bibliography information
     * @param {Array<AnalysisCollection_SpectrumIdentification>} analysisCollectionSpectrumIdentifications - Array of AnalysisCollection_SpectrumIdentification objects
     * @param {Map<number, SpectraData>} spectraData - SpectraData instances keyed by spectra data ID
     * @param {Map<number, SpectrumIdentificationProtocol>} sipsByIds - SpectrumIdentificationProtocol instances keyed by protocol ID
     */
    constructor(json,
        analysisCollectionSpectrumIdentifications,
        spectraData,
        sipsByIds
    ) {
        this.#json = json;
        this.#analysisCollection_spectrumIdentifications = analysisCollectionSpectrumIdentifications;
        this.#spectraDataById = spectraData;
        this.#sipsById = sipsByIds;

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
            analysisSoftware: analysisSoftwareToObject(this.analysisSoftware),
            provider: arrayToObjectByKV(this.provider?.ContactRole, "Role", "contact_ref"),
            auditCollection: auditCollectionToObject(this.auditCollection),
            analysisSampleCollection: this.analysisSampleCollection,
            analysisCollection_spectrumIdentifcations: arrayToObjectByProperty(this.#analysisCollection_spectrumIdentifications,
                "spectrumIdentificationListRef"),
            // analysisProtocolCollection: this.analysisCollectionProtocolCollection,
            bib: this.bib,
            spectraFormats: this.spectraFormats,
        };
        console.log("*", returnObj);
        return returnObj;
    }

}

//util func to convert array to object indexed by given property
function arrayToObjectByProperty(array, property) {
    const obj = {};
    for (const item of array) {
        obj[item[property]] = item;
    }
    return obj;
}

//util func to convert auditCollection to { personName: { affiliation, address, email } } object
function auditCollectionToObject(auditCollection) {
    if (!auditCollection || Object.keys(auditCollection).length === 0) return {};

    const persons = Array.isArray(auditCollection.Person)
        ? auditCollection.Person
        : auditCollection.Person ? [auditCollection.Person] : [];
    const organizations = Array.isArray(auditCollection.Organization)
        ? auditCollection.Organization
        : auditCollection.Organization ? [auditCollection.Organization] : [];

    const orgById = {};
    for (const org of organizations) {
        orgById[org.id] = org.name ?? org["contact name"] ?? org.id;
    }

    const obj = {};
    for (const person of persons) {
        const name = [person.firstName, person.lastName].filter(Boolean).join(" ") || person.name || person.id;
        const affiliations = (person.Affiliation ?? [])
            .map(a => orgById[a.organization_ref] ?? a.organization_ref)
            .filter(Boolean);
        const personObj = {};
        if (affiliations.length === 1) personObj.affiliation = affiliations[0];
        else if (affiliations.length > 1) personObj.affiliation = affiliations;
        if (person["contact address"]) personObj.address = person["contact address"];
        if (person["contact email"]) personObj.email = person["contact email"];
        obj[name] = personObj;
    }
    return obj;
}

//util func to convert analysisSoftware array to { name: version } object
function analysisSoftwareToObject(array) {
    const obj = {};
    for (const item of (array ?? [])) {
        const name = item.name ?? Object.keys(item.SoftwareName)[0];
        obj[name] = item.version ?? "";
    }
    return obj;
}

//util func to convert array to object using one property as key, another as value
function arrayToObjectByKV(array, keyProp, valueProp) {
    const obj = {};
    for (const item of (array ?? [])) {
        obj[item[keyProp]] = item[valueProp];
    }
    return obj;
}

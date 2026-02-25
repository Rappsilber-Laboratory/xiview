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
     * Get spectra formats as object keyed by id
     * @returns {Object} Spectra formats object
     */
    get spectraFormats() {
        return spectraFormatsToObject(this.#json.spectra_formats);
    }

    /**
     * Convert to JSON object
     * Used to customize what gets displayed in searchSummaryViewBB2.js JSON viewer
     * @returns {Object} Object
     */
    toJSON() {
        return {
            // id: this.id,
            // projectId: this.projectId,
            // identificationFileName: this.identificationFileName,
            analysisSoftware: analysisSoftwareToObject(this.#json.analysis_software_list.AnalysisSoftware),
            provider: arrayToObjectByKV(this.#json.provider?.ContactRole, "Role", "contact_ref"),
            auditCollection: auditCollectionToObject(this.#json.audit_collection),
            analysisSampleCollection: this.#json.analysis_sample_collection,
            analysisCollection_spectrumIdentifcations: arrayToObjectByProperty(this.#analysisCollection_spectrumIdentifications,
                "spectrumIdentificationListRef"),
            // analysisProtocolCollection: this.analysisCollectionProtocolCollection,
            bib: bibToObject(this.#json.bib),
            spectraFormats: this.spectraFormats,
        };
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

//util func to convert spectra_formats array to { id: { location, FileFormat, SpectrumIDFormat } } object
function spectraFormatsToObject(spectraFormats) {
    const obj = {};
    for (const item of (spectraFormats ?? [])) {
        const entry = {};
        if (item.location) entry.location = item.location;
        if (item.FileFormat) entry.FileFormat = item.FileFormat;
        if (item.SpectrumIDFormat) entry.SpectrumIDFormat = item.SpectrumIDFormat;
        obj[item.id] = entry;
    }
    return obj;
}

//util func to convert bib array to { title: { authors, publication, doi } } object
function bibToObject(bib) {
    const obj = {};
    for (const item of (bib ?? [])) {
        const key = item.title || item.doi || item.id;
        const entry = {};
        if (item.authors) entry.authors = item.authors;
        if (item.publication) entry.publication = item.publication;
        if (item.doi) entry.doi = item.doi;
        obj[key] = entry;
    }
    return obj;
}

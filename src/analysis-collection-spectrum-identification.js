export class AnalysisCollectionSpectrumIdentification {
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

    get uploadId() {
        return this._json.upload_id;
    }

    get spectrumIdentificationListRef() {
        return this._json.spectrum_identification_list_ref;
    }

    get spectrumIdentificationProtocolRef() {
        return this._json.spectrum_identification_protocol_ref;
    }

    get spectraDataRefs() {
        return this._json.spectra_data_refs;
    }

    get searchDatabaseRefs() {
        return this._json.search_database_refs;
    }
}

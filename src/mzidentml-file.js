export class MzidentmlFile {
    constructor(json, searchResultModel) {
        this._json = json;
        this._searchResultModel = searchResultModel;
    }

    get analysisCollectionSpectrumIdentifcation (){
        return this._searchResultModel.analysisCollectionSpectrumIdentifcation.get(this.id);
    }

    // Note: id is what is referred to as upload_id elsewhere
    get id() {
        return this._json.id;
    }

    get projectId() {
        return this._json.project_id;
    }

    get identificationFileName() {
        return this._json.identification_file_name;
    }

    get provider() {
        return this._json.provider;
    }

    get auditCollection() {
        return this._json.audit_collection;
    }

    get analysisSampleCollection() {
        return this._json.analysis_sample_collection;
    }

    get bib() {
        return this._json.bib;
    }

    get spectraFormats() {
        return this._json.spectra_formats;
    }

    get containsCrosslinks() {
        return this._json.contains_crosslinks;
    }

}

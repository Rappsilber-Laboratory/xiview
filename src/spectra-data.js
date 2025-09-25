export class SpectraData {
    constructor(json) {
        // console.log("SpectraData constructor called with", json);
        this._json = json;
    }

    //example json
    // {external_format_documentation:null,
    // file_format:"MS:1001062",
    // id:6,
    // location:"recal_B190214_03_Lumos_TD_IN_120_Ecoli_photoAA_membrane_SCX16_SEC7.mgf",
    // name:null,
    // spectrum_id_format:"MS:1000774",
    // upload_id:33}

    get fileFormat() {
        return this._json.file_format;
    }
    get id() {
        return this._json.id;
    }
    get location() {
        return this._json.location;
    }
    get name() {
        return this._json.name;
    }
    get spectrumIdFormat() {
        return this._json.spectrum_id_format;
    }
    get uploadId() {
        return this._json.upload_id;
    }
}

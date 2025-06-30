export class AnalysisCollectionSpectrumIdentifcation {
    constructor(json) {
        // console.log("AnalysisCollectionSpectrumIdentifcation constructor called with", json);
        this._json = json;
    }

    get id() {
        return this._json.id;
    }

    get spectrumIdentification() {
        return this._json.spectrumIdentification;
    }

    get spectrumIdentificationProtocol() {
        return this._json.spectrumIdentificationProtocol;
    }

    get spectrumIdentificationList() {
        return this._json.spectrumIdentificationList;
    }
}
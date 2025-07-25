export class SpectrumIdentificationProtocol {
    constructor(json, searchResultModel) {
        console.log("SpectrumIdentificationProtocol constructor called with", json);
        this._json = json;
        this._searchResultModel = searchResultModel;
    }

// {
//     "id": 0,
//     "sip_ref": "SearchProtocol_1_0",
//     "upload_id": 33,
//     "frag_tol": 5,
//     "frag_tol_unit": "ppm",
//     "additional_search_params": {
//         "MS:1001211": "parent mass type mono",
//         "MS:1002494": "cross-linking search",
//         "MS:1001256": "fragment mass type mono"
//     },
//     "analysis_software": {
//         "version": "2.1.5.5",
//         "id": "xiFDR_id",
//         "name": "XiFDR",
//         "SoftwareName": {
//             "xiFDR": ""
//         }
//     },
//     "threshold": {
//         "no threshold": ""
//     }
// }

    get id()  {
        return this._json.id;
    }
    get spectrumIdentificationProtocolRef() {
        return this._json.sip_ref;
    }
    get spectrumIdentificationProtocol() {
        return this._searchResultModel.getSpectrumIdentificationProtocol(this.uploadId, this.spectrumIdentificationProtocolRef);
    }
    get uploadId() {
        return this._json.upload_id;
    }
    get fragmentTolerance() {
        return this._json.frag_tol;
    }
    get fragmentToleranceUnit() {
        return this._json.frag_tol_unit;
    }
    get additionalSearchParams() {
        return this._json.additional_search_params;
    }
    get analysisSoftware() {
        return this._json.analysis_software;
    }
    get threshold() {
        return this._json.threshold;
    }

}
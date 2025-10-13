export class Enzyme {
    constructor(json) {
        this._json = json;
    }

    get id() {
        return this._json.id;
    }

    get name() {
        return this._json.name;
    }

    get cleavage() {
        return this._json.cleavage;
    }

    get specificity() {
        return this._json.specificity;
    }

    get nTermGain() {
        return this._json.nTermGain;
    }

    get cTermGain() {
        return this._json.cTermGain;
    }

    get uploadId() {
        return this._json.upload_id;
    }

    get protocolId() {
        return this._json.protocol_id;
    }

    get siteRegexp() {
        return this._json.site_regexp;
    }

    get minDistance() {
        return this._json.min_distance;
    }

    get missedCleavages() {
        return this._json.missed_cleavages;
    }

    get semiSpecific() {
        return this._json.semi_specific;
    }

    get accession() {
        return this._json.accession;
    }

    get nTermGainCorrected() {
        return this._json.n_term_gain;
    }

    get cTermGainCorrected() {
        return this._json.c_term_gain;
    }
}

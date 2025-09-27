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
}

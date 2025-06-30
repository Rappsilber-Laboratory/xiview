export class SearchModification {
    constructor(json) {
        console.log("SearchModification constructor called with", json);
        this._json = json;
    }

    get id() {
        return this._json.id;
    }

    get massDelta() {
        return this._json.massDelta;
    }

    get location() {
        return this._json.location;
    }

    get residue() {
        return this._json.residue;
    }

    get searchModificationType() {
        return this._json.searchModificationType;
    }
}
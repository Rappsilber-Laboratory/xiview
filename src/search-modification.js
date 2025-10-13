export class SearchModification {
    constructor(json) {
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

    get uploadId() {
        return this._json.upload_id;
    }

    get protocolId() {
        return this._json.protocol_id;
    }

    get mass() {
        return this._json.mass;
    }

    get residues() {
        return this._json.residues;
    }

    get fixedMod() {
        return this._json.fixed_mod;
    }

    get accessions() {
        return this._json.accessions;
    }

    get crosslinkerId() {
        return this._json.crosslinker_id;
    }
}

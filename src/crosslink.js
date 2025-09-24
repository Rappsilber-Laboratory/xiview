export class Crosslink {
    constructor(id, fromProtein, fromResidue, toProtein, toResidue) {
        this.id = id;
        this.matches_pp = [];
        this.filteredMatches_pp = [];

        this.fromProtein = fromProtein;
        this.fromResidue = fromResidue;
        this.toProtein = toProtein;
        this.toResidue = toResidue;
    }

    isDecoyLink() {
        return (this.fromProtein.is_decoy === true ||
            (this.toProtein && this.toProtein.is_decoy === true));
    }

    isSelfLink() {
        return this.fromProtein && this.toProtein && (
            (this.fromProtein.targetProteinID === this.toProtein.targetProteinID)  // essentially, a hack for some csv files
            || (this.fromProtein.id === this.toProtein.id)
            || (this.fromProtein.accession === this.toProtein.accession)
        );
    }

    isLinearLink() {
        return this.matches_pp[0].match.isNotCrosslinked();
    }

    isMonoLink() {
        return this.matches_pp[0].match.isMonoLink();
    }

    isLoopLink() {
        return this.matches_pp[0].match.isLoopLink();
    }

    getMeta(metaField) {
        if (arguments.length === 0) {
            return this.meta;
        }
        return this.meta ? this.meta[metaField] : undefined;
    }

    setMeta(metaField, value) {
        if (arguments.length === 2) {
            this.meta = this.meta || {};
            this.meta[metaField] = value;
        }
    }
}

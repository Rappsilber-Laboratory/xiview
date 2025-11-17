export class Crosslink {
    /**
     * Create a Crosslink representing a crosslinked peptide pair
     * @param {string} id - Crosslink identifier
     * @param {Protein} fromProtein - First protein in the crosslink
     * @param {number} fromResidue - Residue position in first protein
     * @param {Protein|null} toProtein - Second protein in the crosslink (null for linear peptides)
     * @param {number|null} toResidue - Residue position in second protein (null for linear peptides)
     */
    constructor(id, fromProtein, fromResidue, toProtein, toResidue) {
        this.id = id;
        this.matches_pp = [];
        this.filteredMatches_pp = [];

        this.fromProtein = fromProtein;
        this.fromResidue = fromResidue;
        this.toProtein = toProtein;
        this.toResidue = toResidue;
    }

    /**
     * Check if this crosslink involves a decoy protein
     * @returns {boolean} True if involves decoy protein
     */
    isDecoyLink() {
        return (this.fromProtein.is_decoy === true ||
            (this.toProtein && this.toProtein.is_decoy === true));
    }

    /**
     * Check if this is a self-link (intra-protein crosslink)
     * @returns {boolean} True if self-link
     */
    isSelfLink() {
        return this.fromProtein && this.toProtein && (
            (this.fromProtein.targetProteinID === this.toProtein.targetProteinID)  // essentially, a hack for some csv files
            || (this.fromProtein.id === this.toProtein.id)
            || (this.fromProtein.accession === this.toProtein.accession)
        );
    }

    /**
     * Check if this is a linear peptide (not crosslinked)
     * @returns {boolean} True if linear peptide
     */
    isLinearLink() {
        return this.matches_pp[0].match.isNotCrosslinked();
    }

    /**
     * Check if this is a monolink
     * @returns {boolean} True if monolink
     */
    isMonoLink() {
        return this.matches_pp[0].match.isMonoLink();
    }

    /**
     * Check if this is a loop link (intra-peptide crosslink)
     * @returns {boolean} True if loop link
     */
    isLoopLink() {
        return this.matches_pp[0].match.isLoopLink();
    }

    /**
     * Get metadata field value or entire meta object
     * @param {string} [metaField] - Optional field name
     * @returns {*} Metadata value or entire meta object
     */
    getMeta(metaField) {
        if (arguments.length === 0) {
            return this.meta;
        }
        return this.meta ? this.meta[metaField] : undefined;
    }

    /**
     * Set metadata field value
     * @param {string} metaField - Field name to set
     * @param {*} value - Value to set
     * @returns {void}
     */
    setMeta(metaField, value) {
        if (arguments.length === 2) {
            this.meta = this.meta || {};
            this.meta[metaField] = value;
        }
    }
}

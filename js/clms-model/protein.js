/**
 * Protein class for CLMS-backbone-models
 * Represents a protein in crosslinking mass spectrometry data
 */
export class Protein {
    /**
     * Private immutable data object containing original protein properties from server
     * @type {Object}
     * @private
     */
    #data;

    /**
     * Unique protein identifier
     * @type {string}
     */
    id;

    /**
     * Protein name (from data or falls back to accession)
     * @type {string}
     */
    name;

    /**
     * Whether this protein is a decoy (false target)
     * @type {boolean}
     */
    is_decoy;

    /**
     * Array of crosslink objects involving this protein
     * @type {Array}
     */
    crosslinks;

    /**
     * Metadata object for storing additional protein information
     * @type {Object}
     */
    meta;

    /**
     * Whether this protein is hidden from visualization
     * @type {boolean}
     */
    hidden;

    /**
     * Whether this protein was manually hidden by user
     * @type {boolean}
     */
    manuallyHidden;

    /**
     * For decoy proteins, the ID of the corresponding target protein
     * @type {string|null}
     */
    targetProteinID;

    /**
     * UniProt annotation data when loaded from external source
     * @type {Object|null}
     */
    uniprot;

    /**
     * User-defined annotations for this protein
     * @type {Array}
     */
    userAnnotations;

    /**
     * @param {Object} data - Raw protein data from server or initialization
     * @param {string} data.id - Unique protein identifier
     * @param {string} data.name - Protein name (optional, falls back to accession)
     * @param {string} data.accession - Protein accession (e.g., UniProt ID)
     * @param {string} data.sequence - Amino acid sequence
     * @param {string|null} data.description - Protein description
     * @param {number} data.upload_id - Associated search/upload ID
     * @param {boolean} [data.is_decoy=false] - Whether this is a decoy protein
     */
    constructor(data) {
        // Store original data object for immutable properties
        this.#data = data;

        // Mutable core properties (mutated by search-results-backbone-models.js and modelUtils.js)
        this.id = data.id;
        this.name = data.name || data.accession;
        this.is_decoy = data.is_decoy || false;

        // Properties added during initialization
        this.crosslinks = [];
        this.meta = {};

        // Properties for application use (xiview) todo - should these really be here
        this.hidden = false;
        this.manuallyHidden = false;
        this.targetProteinID = null;  // For decoys, ID of corresponding target
        this.uniprot = null;           // UniProt annotation data when loaded
        this.userAnnotations = [];     // User-defined annotations
    }

    /**
     * Get protein accession (immutable)
     * @returns {string}
     */
    get accession() {
        return this.#data.accession;
    }

    /**
     * Get protein sequence (immutable)
     * @returns {string}
     */
    get sequence() {
        return this.#data.sequence || "";
    }

    /**
     * Get protein description (immutable)
     * @returns {string|null}
     */
    get description() {
        return this.#data.description || null;
    }

    /**
     * Get upload ID (immutable)
     * @returns {number}
     */
    get upload_id() {
        return this.#data.upload_id;
    }

    /**
     * Get protein sequence length
     * @returns {number}
     */
    get size() {
        return this.sequence.length;
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
     * @param {string} metaField - Field name
     * @param {*} value - Value to set
     */
    setMeta(metaField, value) {
        if (arguments.length === 2) {
            this.meta = this.meta || {};
            this.meta[metaField] = value;
        }
    }

    /**
     * Get amino acid at specific position (1-indexed)
     * @param {number} position - Position in sequence (1-indexed)
     * @returns {string|undefined} Amino acid character
     */
    // getResidueAt(position) {
    //     if (position < 1 || position > this.sequence.length) {
    //         return undefined;
    //     }
    //     return this.sequence[position - 1];
    // }
    //
    // /**
    //  * Check if this protein has a specific accession
    //  * Useful for comparing proteins across different datasets
    //  * @param {string} accession - Accession to check
    //  * @returns {boolean}
    //  */
    // hasAccession(accession) {
    //     return this.accession === accession;
    // }

    /**
     * Check if this protein is a decoy
     * @returns {boolean}
     */
    isDecoy() {
        return this.is_decoy;
    }

    /**
     * Check if this protein is visible (not hidden)
     * @returns {boolean}
     */
    isVisible() {
        return !this.hidden && !this.manuallyHidden;
    }

    /**
     * Get crosslinks involving this protein
     * @param {boolean} [selfLinksOnly=false] - Return only self-links
     * @returns {Array} Array of crosslink objects
     */
    // getCrosslinks(selfLinksOnly = false) {
    //     if (!selfLinksOnly) {
    //         return this.crosslinks;
    //     }
    //     return this.crosslinks.filter(xl =>
    //         xl.isSelfLink()
    //     );
    // }
    //
    // /**
    //  * Get number of crosslinks involving this protein
    //  * @returns {number}
    //  */
    // getCrosslinkCount() {
    //     return this.crosslinks.length;
    // }

    /**
     * Check if protein has UniProt annotations loaded
     * @returns {boolean}
     */
    hasUniProtData() {
        return this.uniprot !== null && this.uniprot !== undefined;
    }

    /**
     * Get UniProt features of a specific type
     * @param {string} [featureType] - Feature type to filter by
     * @returns {Array}
     */
    getUniProtFeatures(featureType) {
        if (!this.hasUniProtData() || !this.uniprot.features) {
            return [];
        }
        if (!featureType) {
            return this.uniprot.features;
        }
        return this.uniprot.features.filter(f => f.type === featureType);
    }

    /**
     * Get GO term IDs from UniProt data
     * @returns {Array}
     */
    getGOTerms() {
        if (!this.hasUniProtData() || !this.uniprot.go) {
            return [];
        }
        return this.uniprot.go;
    }

    /**
     * Add a user annotation
     * @param {Object} annotation - Annotation object
     */
    addUserAnnotation(annotation) {
        this.userAnnotations.push(annotation);
    }

    /**
     * Get user annotations
     * @returns {Array}
     */
    getUserAnnotations() {
        return this.userAnnotations;
    }

    /**
     * Create a plain object representation (for JSON serialization)
     * @returns {Object}
     */
    // toJSON() {
    //     return {
    //         id: this.id,
    //         name: this.name,
    //         accession: this.accession,  // Uses getter
    //         sequence: this.sequence,    // Uses getter
    //         description: this.description,  // Uses getter
    //         upload_id: this.upload_id,  // Uses getter
    //         is_decoy: this.is_decoy,
    //         meta: this.meta
    //     };
    // }
}

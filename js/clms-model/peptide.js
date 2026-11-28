export class Peptide {
    // The fields of the raw peptide JSON that are used, copied out of it at construction so the raw
    // object itself (and its m_ps / m_ms arrays, which #modifications duplicates) isn't kept.
    // prt, pos and m_as are the raw arrays themselves, not copies: parseJSON rewrites prt
    // entries in place after construction (aggregated / xi2 data), and the getters return them.
    // The per-position decoy flags (dec) aren't kept: parseJSON puts decoy status on the proteins,
    // and SpectrumMatch / Crosslink read it from there.

    /** @type {string|number} Upload id (mzIdentML) / search id (xi2) */
    #uploadId;
    /** @type {string|number} Peptide id within the upload / search */
    #peptideId;
    /** @type {string} Raw sequence (xi2: mods embedded lowercase) */
    #seq;
    /** @type {Array<string>} Protein ids, one per position */
    #prt;
    /** @type {Array<number>} Start positions in the proteins */
    #pos;
    /** @type {number} Link site 1 */
    #ls1;
    /** @type {number} Link site 2 */
    #ls2;
    /** @type {number} Crosslinker modification mass */
    #clModMass;
    /** @type {Array<Object|number>} Raw modification references (m_as) */
    #modAcc;

    /**
     * Base sequence (no modifications), worked out on first use and kept, as it's read for every match
     * on every filter pass. Relies on #seq never changing after construction (nothing does this).
     * @type {string}
     * @private
     */
    #sequence;

    /**
     * Canonical, source-agnostic modification list resolved once at
     * construction. Each entry: {pos, name, mass, isCrosslinker, searchModificationRef}.
     * All modification getters read from this so nothing downstream branches
     * on data source.
     * @type {Array<Object>}
     * @private
     */
    #modifications;

    /**
     * Create a Peptide instance
     * @param {Object} json - Raw peptide data object
     * @param {string} json.u_id - Upload identifier (mzIdentML) / search id (xi2)
     * @param {string} json.id - Peptide identifier
     * @param {number} json.ls1 - Link site 1 position
     * @param {number} json.ls2 - Link site 2 position (for loop links)
     * @param {Array<string>} json.prt - Array of protein IDs this peptide maps to
     * @param {Array<number>} json.pos - Array of positions in proteins where this peptide maps
     * @param {Array<boolean>} json.dec - Array of decoy flags for each protein mapping
     * @param {string} json.seq - Peptide sequence (mzIdentML: base; xi2: mods embedded lowercase, e.g. "Ccm")
     * @param {Array<number>} json.m_ps - Modification positions in the peptide
     * @param {Array<number>} json.m_ms - Modification masses (mzIdentML only)
     * @param {Array<Object|number>} json.m_as - Modifications: mzIdentML = CV-term objects; xi2 = 0-based indexes into searchModifications
     * @param {number} json.cl_m - Crosslinker modification mass
     * @param {Array<Object>} [searchModifications] - xi2 only: the protocol's ordered
     *        modification list (from s_config); when supplied, m_as entries are treated
     *        as 0-based indexes into it. Omit for mzIdentML (self-describing CV objects).
     */
    constructor(json, searchModifications){
        console.assert(json.m_ps.length == json.m_as.length &&  (!json.m_ms || json.m_ps.length == json.m_ms.length), "Inconsistent mod data on peptide", json);
        this.#uploadId = json.u_id;
        this.#peptideId = json.id;
        this.#seq = json.seq;
        this.#prt = json.prt;
        this.#pos = json.pos;
        this.#ls1 = json.ls1;
        this.#ls2 = json.ls2;
        this.#clModMass = json.cl_m;
        this.#modAcc = json.m_as;
        this.#modifications = this.#resolveModifications(json, searchModifications);
    }

    /**
     * Resolve the raw m_ps/m_as (and m_ms) into the canonical modification list.
     * @param {Object} json - Raw peptide data object
     * @param {Array<Object>} [searchModifications] - xi2 config mod list, or undefined for mzIdentML
     * @returns {Array<Object>} [{pos, name, mass, isCrosslinker, searchModificationRef}]
     * @private
     */
    #resolveModifications(json, searchModifications){
        const positions = json.m_ps ?? [];
        const refs = json.m_as ?? [];
        const masses = json.m_ms;
        // map rather than push onto [], so the array is allocated at its final size (one entry per position)
        return positions.map((pos, i) => {
            const ref = refs[i];
            if (searchModifications) {
                // xi2: ref is a 0-based index into the config modifications list.
                // mass may be undefined (some defs carry only `composition`) - by design.
                const def = searchModifications[ref];
                return {
                    pos,
                    name: def ? def.name : String(ref),
                    mass: def ? def.mass : undefined,
                    isCrosslinker: false,
                    searchModificationRef: undefined
                };
            } else {
                // mzIdentML: ref is a CV-term object {accession: name}.
                const keys = Object.keys(ref);
                const isCrosslinker = keys.includes("MS:1002509") || keys.includes("MS:1002510");
                const firstVal = Object.values(ref)[0];
                return {
                    pos,
                    name: firstVal != null ? String(firstVal).toLowerCase().replace(/ /g, "") : "",
                    mass: masses ? masses[i] : undefined,
                    isCrosslinker,
                    // MS:1003393 search modification id ref: the protocol's search modification
                    // (MS:1003392) this is, which holds e.g. the crosslinker's cleavage stubs
                    searchModificationRef: ref["MS:1003393"]
                };
            }
        });
    }

    /**
     * Get peptide identifier
     * @returns {string} Peptide identifier (upload_id + "_" + peptide_id)
     */
    get id(){
        return this.#uploadId + "_" + this.#peptideId;
    }

    /**
     * Get link site 1 position // *xi2 vrs pride difference*  - remove?
     * @returns {number} Link site 1 position
     */
    get linkSite1(){
        return this.#ls1;
    }

    /**
     * Get link site 2 position (for loop links) // *xi2 vrs pride difference* - remove?
     * @returns {number} Link site 2 position
     */
    get linkSite2(){
        return this.#ls2;
    }

    //todo - link site 2 for internally linked peptides

    /**
     * Get protein IDs this peptide maps to
     * @returns {Array<string>} Array of protein IDs
     */
    get prt(){
        return this.#prt;
    }

    /**
     * Get positions in proteins where this peptide maps
     * @returns {Array<number>} Array of protein positions
     */
    get pos(){
        return this.#pos;
    }

    /**
     * Get peptide base sequence (no modifications). xi2 sequences embed
     * modifications as lowercase suffixes (e.g. "Ccm"); strip them. mzIdentML
     * sequences are already the base sequence, so this is a no-op there.
     * @returns {string} Peptide base sequence
     */
    get sequence() {
        if (this.#sequence === undefined) {
            this.#sequence = this.#seq.replace(/[^A-Z]/g, "");
        }
        return this.#sequence;
    }

    /**
     * Get the canonical, source-agnostic modification list.
     * @returns {Array<Object>} [{pos, name, mass, isCrosslinker, searchModificationRef}]
     */
    get modifications() {
        return this.#modifications;
    }

    /**
     * Get peptide sequence with modification annotations, in the uniform
     * "BASE(name)BASE" format for both data sources. Crosslinker modifications
     * are excluded (they are represented via the crosslinker mass / link sites).
     * @returns {string} Sequence with modifications
     */
    get seq_mods() {
        return this.modifiedSequence(mod => mod.name);
    }

    /**
     * Peptide sequence in the "BASE(label)BASE" format of seq_mods, with each
     * (non-crosslinker) modification written as "(" + label(mod) + ")".
     * @param {function(Object): string} label - Label for a modification of this.modifications
     * @returns {string} Sequence with modifications
     */
    modifiedSequence(label) {
        const base = this.sequence;
        let seq_mods = "";
        let lastIndex = 0;
        for (const mod of this.#modifications) {
            if (mod.isCrosslinker) continue;
            seq_mods = seq_mods + base.slice(lastIndex, mod.pos);
            seq_mods = seq_mods + "(" + label(mod) + ")";
            lastIndex = mod.pos;
        }
        seq_mods = seq_mods + base.slice(lastIndex);
        return seq_mods;
    }

    /**
     * Get modification positions in the peptide (the raw m_ps values, in order)
     * @returns {Array<int>} Array of modification positions; a new array on every call
     */
    get mod_pos() {
        return this.#modifications.map(mod => mod.pos);
    }

    /**
     * Get modification masses (parallel to mod_pos). For xi2, entries whose
     * config definition carries only a composition (no mass) are undefined.
     * @returns {Array<number>} Array of modification masses
     */
    get mod_masses() {
        return this.#modifications.map(mod => mod.mass);
    }

    /**
     * Get the raw modification references as sent by the API. mzIdentML: array
     * of CV-term objects; xi2: array of 0-based indexes into searchModifications.
     * @returns {Array<Object|number>} Array of raw modification references
     */
    get mod_acc() {
        return this.#modAcc;
    }

    /**
     * Get crosslinker modification mass
     * @returns {number} Crosslinker modification mass
     */
    get cl_modmass(){
        return this.#clModMass;
    }

    /**
     * The crosslinker modifications of this peptide (two for a looplink)
     * @returns {Array<Object>} [{pos, name, mass, isCrosslinker, searchModificationRef}]
     */
    get crosslinkerModifications() {
        return this.#modifications.filter(mod => mod.isCrosslinker);
    }

    /**
     * Get formatted modification name from CV terms todo - make this static
     * @param {Object} allModCvs - Object containing CV term key-value pairs
     * @returns {string} Formatted modification name
     */
    getModName(allModCvs){
        return "("+(Object.values(allModCvs)[0]).toLowerCase().replace(/ /g, "") + ")";
    }

}

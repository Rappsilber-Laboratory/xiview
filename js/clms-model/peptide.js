export class Peptide {
    /**
     * Private raw peptide data object containing all peptide properties
     * @type {Object}
     * @private
     */
    #json;

    /**
     * Canonical, source-agnostic modification list resolved once at
     * construction. Each entry: {pos, name, mass, isCrosslinker, stub}.
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
        this.#json = json;
        this.#modifications = this.#resolveModifications(searchModifications);
    }

    /**
     * Resolve the raw m_ps/m_as (and m_ms) into the canonical modification list.
     * @param {Array<Object>} [searchModifications] - xi2 config mod list, or undefined for mzIdentML
     * @returns {Array<Object>} [{pos, name, mass, isCrosslinker, stub}]
     * @private
     */
    #resolveModifications(searchModifications){
        const mods = [];
        const positions = this.#json.m_ps ?? [];
        const refs = this.#json.m_as ?? [];
        const masses = this.#json.m_ms;
        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            const ref = refs[i];
            if (searchModifications) {
                // xi2: ref is a 0-based index into the config modifications list.
                // mass may be undefined (some defs carry only `composition`) - by design.
                const def = searchModifications[ref];
                mods.push({
                    pos,
                    name: def ? def.name : String(ref),
                    mass: def ? def.mass : undefined,
                    isCrosslinker: false,
                    stub: undefined
                });
            } else {
                // mzIdentML: ref is a CV-term object {accession: name}.
                const keys = Object.keys(ref);
                const isCrosslinker = keys.includes("MS:1002509") || keys.includes("MS:1002510");
                const firstVal = Object.values(ref)[0];
                mods.push({
                    pos,
                    name: firstVal != null ? String(firstVal).toLowerCase().replace(/ /g, "") : "",
                    mass: masses ? masses[i] : undefined,
                    isCrosslinker,
                    stub: isCrosslinker ? ref["MS:1003390"] : undefined
                });
            }
        }
        return mods;
    }

    /**
     * Get peptide identifier
     * @returns {string} Peptide identifier (upload_id + "_" + peptide_id)
     */
    get id(){
        return this.#json.u_id + "_" + this.#json.id;
    }

    /**
     * Get link site 1 position // *xi2 vrs pride difference*  - remove?
     * @returns {number} Link site 1 position
     */
    get linkSite1(){
        return this.#json.ls1;
    }

    /**
     * Get link site 2 position (for loop links) // *xi2 vrs pride difference* - remove?
     * @returns {number} Link site 2 position
     */
    get linkSite2(){
        return this.#json.ls2;
    }

    //todo - link site 2 for internally linked peptides

    /**
     * Get protein IDs this peptide maps to
     * @returns {Array<string>} Array of protein IDs
     */
    get prt(){
        return this.#json.prt;
    }

    /**
     * Get positions in proteins where this peptide maps
     * @returns {Array<number>} Array of protein positions
     */
    get pos(){
        return this.#json.pos;
    }

    /**
     * Get decoy status for each protein mapping
     * @returns {Array<boolean>} Array of decoy flags
     */
    get is_decoy(){
        return this.#json.dec;
    }

    /**
     * Get peptide base sequence (no modifications). xi2 sequences embed
     * modifications as lowercase suffixes (e.g. "Ccm"); strip them. mzIdentML
     * sequences are already the base sequence, so this is a no-op there.
     * @returns {string} Peptide base sequence
     */
    get sequence() {
        return this.#json.seq.replace(/[^A-Z]/g, "");
    }

    /**
     * Get the canonical, source-agnostic modification list.
     * @returns {Array<Object>} [{pos, name, mass, isCrosslinker, stub}]
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
        const base = this.sequence;
        let seq_mods = "";
        let lastIndex = 0;
        for (const mod of this.#modifications) {
            if (mod.isCrosslinker) continue;
            seq_mods = seq_mods + base.slice(lastIndex, mod.pos);
            seq_mods = seq_mods + "(" + mod.name + ")";
            lastIndex = mod.pos;
        }
        seq_mods = seq_mods + base.slice(lastIndex);
        return seq_mods;
    }

    /**
     * Get modification positions in the peptide
     * @returns {Array<int>} Array of modification positions
     */
    get mod_pos() {
        return this.#json.m_ps;
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
        return this.#json.m_as;
    }

    /**
     * Get crosslinker modification mass
     * @returns {number} Crosslinker modification mass
     */
    get cl_modmass(){
        return this.#json.cl_m;
    }

    /**
     * Get crosslink stubs (reporter ions)
     * @returns {*|undefined} Stub information or undefined
     */
    //todo - needs fixed for loop links
    get stubs() {
        for (const mod of this.#modifications) {
            if (mod.isCrosslinker) {
                return mod.stub;
            }
        }
        return undefined;
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

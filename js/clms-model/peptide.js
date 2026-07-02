export class Peptide {
    /**
     * Private raw peptide data object containing all peptide properties
     * @type {Object}
     * @private
     */
    #json;

    /**
     * Create a Peptide instance
     * @param {Object} json - Raw peptide data object
     * @param {string} json.u_id - Upload identifier
     * @param {string} json.id - Peptide identifier
     * @param {number} json.ls1 - Link site 1 position
     * @param {number} json.ls2 - Link site 2 position (for loop links)
     * @param {Array<string>} json.prt - Array of protein IDs this peptide maps to
     * @param {Array<number>} json.pos - Array of positions in proteins where this peptide maps
     * @param {Array<boolean>} json.dec - Array of decoy flags for each protein mapping
     * @param {string} json.seq - Peptide base sequence
     * @param {Array<number>} json.m_ps - Modification positions in the peptide
     * @param {Array<number>} json.m_ms - Modification masses
     * @param {Array<Object>} json.m_as - Modification accessions (CV term objects)
     * @param {number} json.cl_m - Crosslinker modification mass
     */
    constructor(json){ //}, containingModel) {
        console.assert(json.m_ps.length == json.m_as.length &&  (!json.m_ms || json.m_ps.length == json.m_ms.length), "Inconsistent mod data on peptide", json);
        this.#json = json;

        // this.modificationNames = containingModel.get("modificationNames");
        // SearchResultsModel.commonRegexes.notUpperCase.lastIndex = 0;
        // if (){
        //     peptide.sequence = peptide.seq_mods.replace(SearchResultsModel.commonRegexes.notUpperCase, "");
        // }

        // function peptideModCount(peptide) {
        //     let count = 0;
        //     const sequence = peptide.seq_mods;
        //     const pepLen = sequence.length;
        //     for (let i = 0; i < pepLen - 1; i++) {
        //         const a = sequence[i];
        //         const b = sequence[i + 1];
        //         if ((a >= "A" && a <= "Z") && (b < "A" || b > "Z")) count++;
        //     }
        //     return count;
        // }
        //
        // const modCount1 = peptideModCount(this.matchedPeptides[0]);
        // if (this.matchedPeptides[1]) {
        //     const modCount2 = peptideModCount(this.matchedPeptides[1]);
        //     if (modCount2 > modCount1) {
        //         return modCount2;
        //     }
        // }
        // return modCount1;
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
     * Get peptide base sequence
     * @returns {string} Peptide sequence
     */
    get sequence() {
        return this.#json.seq;
    }

    /**
     * Get peptide sequence with modification annotations
     * @returns {string} Sequence with modifications
     */
    get seq_mods() {
        let seq_mods = "";
        let lastIndex = 0;
        for (let i = 0; i < this.#json.m_ps.length; i++){
            const pos = this.#json.m_ps[i];
            const allModCvs = this.#json.m_as[i];
            const allModCvsKeys = Object.keys(allModCvs);
            if (!allModCvsKeys.includes("MS:1002509") && !allModCvsKeys.includes("MS:1002510")) {
                seq_mods = seq_mods + this.#json.seq.slice(lastIndex, pos);
                //     if (!mod_name){
                //         mod_name = this.#json.mod_mass[i];
                //     } else if (this.modificationNames.has(mod_name)) {
                //         mod_name = this.modificationNames.get(mod_name).toLowerCase().substring(0,4);
                //     }

                // const mod_name = (Object.values(allModCvs)[0]).toLowerCase();

                const mod_name = this.getModName(allModCvs);

                // const mod_name = "(" + this.mod_masses[i] + ")"; // annotator has some requirements for how mod names are formatted?
                seq_mods = seq_mods + mod_name;
                lastIndex = pos;
            }
        }
        seq_mods = seq_mods + this.#json.seq.slice(lastIndex);
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
     * Get modification masses
     * @returns {Array<number>} Array of modification masses
     */
    get mod_masses() {
        return this.#json.m_ms;
    }

    /**
     * Get modification accessions (CV terms)
     * @returns {Array<Object>} Array of modification CV term objects
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
        for (let i = 0; i < this.#json.m_as.length; i++) {
            if (Object.prototype.hasOwnProperty.call(this.#json.m_as[i], "MS:1002509") || Object.prototype.hasOwnProperty.call(this.#json.m_as[i], "MS:1002510")) {
                return this.#json.m_as[i]["MS:1003390"];
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

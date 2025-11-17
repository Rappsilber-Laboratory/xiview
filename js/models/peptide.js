export class Peptide {
    /**
     * Create a Peptide instance
     * @param {Object} pep - Raw peptide data object
     */
    constructor(pep){ //}, containingModel) {
        console.assert(pep.m_as.length == pep.m_ms.length &&  pep.m_ms.length == pep.m_as.length, "Inconsistent mod data on peptide", pep);
        this._pep = pep;
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
        return this._pep.u_id + "_" + this._pep.id;
    }

    /**
     * Get link site 1 position
     * @returns {number} Link site 1 position
     */
    get linkSite1(){
        return this._pep.ls1;
    }

    /**
     * Get link site 2 position (for loop links)
     * @returns {number} Link site 2 position
     */
    get linkSite2(){
        return this._pep.ls2;
    }

    //todo - link site 2 for internally linked peptides

    /**
     * Get protein IDs this peptide maps to
     * @returns {Array<string>} Array of protein IDs
     */
    get prt(){
        return this._pep.prt;
    }

    /**
     * Get positions in proteins where this peptide maps
     * @returns {Array<number>} Array of protein positions
     */
    get pos(){
        return this._pep.pos;
    }

    /**
     * Get decoy status for each protein mapping
     * @returns {Array<string>} Array of decoy flags
     */
    get is_decoy(){
        return this._pep.dec;
    }

    /**
     * Get peptide base sequence
     * @returns {string} Peptide sequence
     */
    get sequence() {
        return this._pep.seq;
    }

    /**
     * Get peptide sequence with modification annotations
     * @returns {string} Sequence with modifications
     */
    get seq_mods() {
        let seq_mods = "";
        let lastIndex = 0;
        for (let i = 0; i < this._pep.m_ps.length; i++){
            const pos = this._pep.m_ps[i];
            const allModCvs = this._pep.m_as[i];
            const allModCvsKeys = Object.keys(allModCvs);
            if (!allModCvsKeys.includes("MS:1002509") && !allModCvsKeys.includes("MS:1002510")) {
                seq_mods = seq_mods + this._pep.seq.slice(lastIndex, pos);
                //     if (!mod_name){
                //         mod_name = this._pep.mod_mass[i];
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
        seq_mods = seq_mods + this._pep.seq.slice(lastIndex);
        return seq_mods;
    }

    /**
     * Get modification positions in the peptide
     * @returns {Array<number>} Array of modification positions
     */
    get mod_pos() {
        return this._pep.m_ps;
    }

    /**
     * Get modification masses
     * @returns {Array<number>} Array of modification masses
     */
    get mod_masses() {
        return this._pep.m_ms;
    }

    /**
     * Get modification accessions (CV terms)
     * @returns {Array<Object>} Array of modification CV term objects
     */
    get mod_acc() {
        return this._pep.m_as;
    }

    /**
     * Get crosslinker modification mass
     * @returns {number} Crosslinker modification mass
     */
    get cl_modmass(){
        return this._pep.cl_m;
    }

    /**
     * Get crosslink stubs (reporter ions)
     * @returns {*|undefined} Stub information or undefined
     */
    //todo - needs fixed for loop links
    get stubs() {
        for (let i = 0; i < this._pep.m_as.length; i++) {
            if (Object.prototype.hasOwnProperty.call(this._pep.m_as[i], "MS:1002509") || Object.prototype.hasOwnProperty.call(this._pep.m_as[i], "MS:1002510")) {
                return this._pep.m_as[i]["MS:1003390"];
            }
        }
        return undefined;
    }

    /**
     * Get formatted modification name from CV terms
     * @param {Object} allModCvs - Object containing CV term key-value pairs
     * @returns {string} Formatted modification name
     */
    getModName(allModCvs){
        return "("+(Object.values(allModCvs)[0]).toLowerCase().replace(/ /g, "") + ")";
    }

}

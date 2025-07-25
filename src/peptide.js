import {SearchResultsModel} from "./search-results-model";

export class Peptide {
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

    get id(){
        return this._pep.u_id + "_" + this._pep.id;
    }

    get linkSite(){
        return this._pep.ls1;
    }

    //todo - link site 2 for internally linked peptides

    get prt(){
        return this._pep.prt;
    }

    get pos(){
        return this._pep.pos;
    }

    get is_decoy(){
        return this._pep.dec;
    }

    get sequence() {
        return this._pep.seq;
    }

    get seq_mods() {
        let seq_mods = "";
        let lastIndex = 0;
        for (let i = 0; i < this._pep.m_ps.length; i++){
            const pos = this._pep.m_ps[i];
            seq_mods = seq_mods + this._pep.seq.slice(lastIndex, pos);
            let mod_name = this._pep.m_as[i];
            //     if (!mod_name){
            //         mod_name = this._pep.mod_mass[i];
            //     } else if (this.modificationNames.has(mod_name)) {
            //         mod_name = this.modificationNames.get(mod_name).toLowerCase().substring(0,4);
            //     }
            mod_name = (Object.values(mod_name)[0]).toLowerCase();
            seq_mods = seq_mods + mod_name;
            lastIndex = pos;
        }
        seq_mods = seq_mods + this._pep.seq.slice(lastIndex);
        return seq_mods;
    }

    get mod_pos() {
        return this._pep.m_ps;
    }

    get mod_masses() {
        return this._pep.m_ms;
    }

    get mod_acc() {
        return this._pep.m_as;
    }

    get cl_modmass(){
        return this._pep.cl_m;
    }

}
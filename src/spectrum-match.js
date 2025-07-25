import {Crosslink} from "./crosslink";
import path from 'path-browserify';

export class SpectrumMatch {

    constructor(containingModel, participants, crosslinks, peptides, identification) {
        this.containingModel = containingModel; //containing BB model
        this._identification = identification;
        // this.precursor_intensity = null;
        // this.spectrumId = identification.sp;
        // this.searchId = identification.si.toString();
        // this.id = this.searchId + "_" + identification.id;
        // this.precursorMZ = +identification.pc_mz; // experimental MZ, accessor for this att is called expMZ()
        // this.calc_mz = +identification.c_mz;
        // this._scores = identification.sc;
        var scoreSets = Object.keys(this._scores);
        var scoreSetCount = scoreSets.length;
        for (var s = 0; s < scoreSetCount; s++) {
            var scoreSet = scoreSets[s];
            this.containingModel.get("scoreSets").add(scoreSet);
        }
        //
        // this.passThreshold = !!identification.pass;
        // if (identification.ions) {
        //     var ionTypes = identification.ions.split(";");
        //     var ionTypeCount = ionTypes.length;
        //     var ions = [];
        //     for (var it = 0; it < ionTypeCount; it++) {
        //         var ionType = ionTypes[it];
        //         ions.push({"type": (ionType.charAt(0).toUpperCase() + ionType.slice(1) + "Ion")});
        //     }
        //     this.ions = ions;
        // } else {
        //     this.ions = [{type:"bIon"}, {type:"yIon"}];
        // }
        //
        // this.spectrum = this.containingModel.get("spectrumSources").get(this.searchId + "_" + this.spectrumId);
        //
        // this.precursorCharge = +identification.pc_c;
        // if (this.precursorCharge === -1) {
        //     this.precursorCharge = undefined;
        // }

        this.matchedPeptides = [];
        this.matchedPeptides[0] = peptides.get(this.searchId + "_" + identification.pi1);
        if (!this.matchedPeptides[0]) {
            alert("peptide error (missing peptide evidence?) for:" + identification.pi1);
        } else {
            if (this.matchedPeptides[0].is_decoy.indexOf("1") != -1) {
                this.is_decoy = true;
                this.containingModel.set("decoysPresent", true);
            }
        }
        // following will be inadequate for trimeric and higher order cross-links
        if (identification.pi2 !== undefined) {
            this.matchedPeptides[1] = peptides.get(this.searchId + "_" + identification.pi2);
            if (!this.matchedPeptides[1]) {
                alert("peptide error (missing peptide evidence?) for:" + +identification.pi2);
            } else if (this.matchedPeptides[1].is_decoy.indexOf("1") != -1) {
                this.is_decoy = true;
                this.containingModel.set("decoysPresent", true);
            }
        }
        //if the match is ambiguous it will relate to many crosslinks
        this.crosslinks = [];
        this.linkPos1 = +this.matchedPeptides[0].linkSite;
        if (this.matchedPeptides[1]) {
            this.linkPos2 = this.matchedPeptides[1].linkSite;
        }

        // the protein IDs and residue numers we eventually want to get:-
        let p1ID, p2ID, res1, res2;

        if (this.isNotCrosslinked()) {
            //its a linear
            this.containingModel.set("linearsPresent", true);
            for (let i = 0; i < this.matchedPeptides[0].prt.length; i++) {
                p1ID = this.matchedPeptides[0].prt[i];
                this.associateWithLink(participants, crosslinks, p1ID);
            }
            if (this.matchedPeptides[1]) {
                for (let i = 0; i < this.matchedPeptides[1].prt.length; i++) {
                    p1ID = this.matchedPeptides[1].prt[i];
                    this.associateWithLink(participants, crosslinks, p1ID);
                }
            }
            return;
        }

        this.couldBelongToBetweenLink = false;
        this.couldBelongToSelfLink = false;

        //loop to produce all alternative linkage site combinations
        //(position1 count * position2 count alternative)
        for (let i = 0; i < this.matchedPeptides[0].pos.length; i++) {
            for (let j = 0; j < this.matchedPeptides[1].pos.length; j++) {

                if (i > 0 || j > 0) {
                    this.containingModel.set("ambiguousPresent", true);
                }

                //some files (must be csv) are not puting in duplicate protein ids in ambig links
                //in this case use last one
                if (i < this.matchedPeptides[0].prt.length) {
                    p1ID = this.matchedPeptides[0].prt[i];
                } else {
                    p1ID = this.matchedPeptides[0].prt[this.matchedPeptides[0].prt.length - 1];
                }
                if (j < this.matchedPeptides[1].prt.length) {
                    p2ID = this.matchedPeptides[1].prt[j];
                } else {
                    p2ID = this.matchedPeptides[1].prt[this.matchedPeptides[1].prt.length - 1];
                }

                // * residue numbering starts at 1 *
                res1 = +this.matchedPeptides[0].pos[i] - 1 + this.linkPos1;
                res2 = +this.matchedPeptides[1].pos[j] - 1 + this.linkPos2;

                this.associateWithLink(participants, crosslinks, p1ID, p2ID, res1, res2, this.matchedPeptides[0].pos[i] - 0, this.matchedPeptides[0].sequence.length, this.matchedPeptides[1].pos[j], this.matchedPeptides[1].sequence.length);
            }
        }

        //identify homodimers: if peptides overlap its a homodimer
        this.confirmedHomomultimer = false;
        this.overlap = [];
        if (this.isAmbig() === false && p1ID === p2ID) { //todo: potential problem re ambiguous homo-multimer link (compare current behaviour to xiNET paper product type fig)

            if (this.matchedPeptides[0].sequence && this.matchedPeptides[1].sequence) {

                const pep1length = this.matchedPeptides[0].sequence.length;
                const pep2length = this.matchedPeptides[1].sequence.length;
                const pep1_start = +this.matchedPeptides[0].pos[0];
                const pep2_start = +this.matchedPeptides[1].pos[0];
                const pep1_end = pep1_start + (pep1length - 1);
                const pep2_end = pep2_start + (pep2length - 1);
                if (pep1_start >= pep2_start && pep1_start <= pep2_end) {
                    this.confirmedHomomultimer = true;
                    this.overlap[0] = pep1_start - 1;
                    if (pep1_end < pep2_end) {
                        this.overlap[1] = pep1_end;
                    } else {
                        this.overlap[1] = pep2_end;
                    }
                } else if (pep2_start >= pep1_start && pep2_start <= pep1_end) {
                    this.confirmedHomomultimer = true;
                    this.overlap[0] = pep2_start - 1;
                    if (pep2_end < pep1_end) {
                        this.overlap[1] = pep2_end;
                    } else {
                        this.overlap[1] = pep1_end;
                    }
                }
            } else if (res1 === res2) {
                this.confirmedHomomultimer = true;
                this.overlap[0] = res1 - 1;
                this.overlap[1] = res2;
            }
        }
    }

    // get linkPos1() {
    //     return +this.matchedPeptides[0].linkSite;
    // }
    //
    // get linkPos2() {
    //     if (this.matchedPeptides[1]) {
    //         this.linkPos2 = this.matchedPeptides[1].linkSite;
    //     }
    //     return undefined;
    // }

    associateWithLink(proteins, crosslinks, p1ID, p2ID, res1, res2, //following params may be null :-
        pep1_start, pep1_length, pep2_start, pep2_length) {

        // we don't want two different ID's, e.g. one that's "33-66" and one that's "66-33"
        //following puts lower protein_ID first in link_ID

        //todo: this end swapping thing, its a possible source of confusion

        let fromProt, toProt;

        if (this.isNotCrosslinked()) {//!p2ID || p2ID === "" || p2ID === '-' || p2ID === 'n/a') { //its  a linear peptide (no crosslinker of any product type))
            this.containingModel.set("linearsPresent", true);
            fromProt = proteins.get(p1ID);
            if (!fromProt) {
                alert("FAIL: not protein with ID " + p1ID);
            }
        } else if (p1ID <= p2ID) {
            fromProt = proteins.get(p1ID);
            toProt = proteins.get(p2ID);
            if (!fromProt) {
                alert("FAIL: not protein with ID " + p1ID);
            }
            if (!toProt) {
                alert("FAIL: not protein with ID " + p2ID);
            }
        } else {
            fromProt = proteins.get(p2ID);
            toProt = proteins.get(p1ID);
            if (!fromProt) {
                alert("FAIL: not protein with ID " + p2ID);
            }
            if (!toProt) {
                alert("FAIL: not protein with ID " + p1ID);
            }
        }

        if (fromProt && toProt && // todo - see crosslink.js for similar code
            (fromProt.targetProteinID === toProt.targetProteinID)  // essentially, a hack for some csv files
            || (fromProt.id === toProt.id)
            || (fromProt.accession === toProt.accession)) {
            this.couldBelongToSelfLink = true;
        } else if (!this.isMonoLink()) {
            this.couldBelongToBetweenLink = true;
        }

        // again, order id string by prot id or by residue if self-link
        let endsReversedInResLinkId = false;
        let crosslinkID;
        if (this.isNotCrosslinked()) {
            crosslinkID = p1ID + "_linears";
        } else if (p1ID === p2ID || p2ID === null) {
            if ((res1 - 0) < (res2 - 0) || res2 === null) {
                crosslinkID = p1ID + "_" + res1 + "-" + p2ID + "_" + res2;
            } else {
                crosslinkID = p2ID + "_" + res2 + "-" + p1ID + "_" + res1;
                endsReversedInResLinkId = true;
            }
        } else if (p1ID < p2ID) {
            crosslinkID = p1ID + "_" + res1 + "-" + p2ID + "_" + res2;
        } else {
            crosslinkID = p2ID + "_" + res2 + "-" + p1ID + "_" + res1;
            endsReversedInResLinkId = true;
        }

        //get or create residue link
        let resLink = crosslinks.get(crosslinkID);
        if (typeof resLink == "undefined") {
            //to and from proteins were already swapped over above

            //WATCH OUT - residues need to be in correct order
            if (this.isNotCrosslinked()) {
                resLink = new Crosslink(crosslinkID, fromProt,
                    res1, null, null, this.containingModel);
            } else if (p1ID === p2ID) {
                if ((res1 - 0) < (res2 - 0)) {
                    resLink = new Crosslink(crosslinkID, fromProt, res1, toProt, res2, this.containingModel);
                } else {
                    resLink = new Crosslink(crosslinkID, fromProt, res2, toProt, res1, this.containingModel);
                }
            } else if (p1ID === fromProt.id) {
                resLink = new Crosslink(crosslinkID, fromProt, res1, toProt, res2, this.containingModel);
            } else {
                //WATCH OUT - residues need to be in correct oprder
                resLink = new Crosslink(crosslinkID, fromProt, res2, toProt, res1, this.containingModel);
            }
            crosslinks.set(crosslinkID, resLink);

            fromProt.crosslinks.push(resLink);
            if (toProt && (toProt !== fromProt)) {
                toProt.crosslinks.push(resLink);
            }
        }

        const peptidePositions = [];
        if (endsReversedInResLinkId === false) {
            peptidePositions.push({
                start: pep1_start,
                length: pep1_length
            });
            peptidePositions.push({
                start: pep2_start,
                length: pep2_length
            });
        } else {
            peptidePositions.push({
                start: pep2_start,
                length: pep2_length
            });
            peptidePositions.push({
                start: pep1_start,
                length: pep1_length
            });
        }
        resLink.matches_pp.push({
            match: this,
            pepPos: peptidePositions
        });
        this.crosslinks.push(resLink);
    }

    isAmbig() {
        return this.matchedPeptides[0].pos.length > 1 ||
            (this.matchedPeptides[1] && this.matchedPeptides[1].pos.length > 1);
    }

    isDecoy() {
        if (this.is_decoy) { //todo - looks bad
            return this.is_decoy;
        } else {
            //its from csv not database, for simplicity lets just look at first crosslink //todo - look at again
            return this.crosslinks[0].isDecoyLink();
        }
    }

    get id () {
        return this.psmId;
    }

    isNotCrosslinked() {
        return this.linkPos1 === -1;
    }

    isMonoLink() {
        return this.linkPos1 !== -1 && (this.matchedPeptides.length === 1 || this.linkPos2 == -1 || this.matchedPeptides[1].pos[0] == -1);
    }

    peaklistFileName() {
        const spectraDataId = this._identification.sd;
        const uploadId = this.searchId; // todo - might be good to rename this, its a bit confusing
        const spectraData = this.containingModel.getSpectraDataById(uploadId, spectraDataId);
        return path.basename(spectraData.location);
    }

    group() {
        return -1; // temp
        var group = this.containingModel.get("searches").get(this.searchId).group;
        return group;
    }

    expMZ() {
        return this.precursorMZ;
    }

    expMass() {
        return this.precursorMZ * this.precursorCharge - (this.precursorCharge * SpectrumMatch.protonMass);
    }

    calcMZ() {
        return this.calc_mz;// (this.calc_mass + (this.precursorCharge * SpectrumMatch.protonMass)) / this.precursorCharge;
    }

    calcMass() {
        return (this.precursorCharge * this.calc_mz) - (this.precursorCharge * SpectrumMatch.protonMass); //this.calc_mass;
    }

    missingPeaks() {
        const errorMZ = this.expMZ() - this.calcMZ();
        const errorM = errorMZ * this.precursorCharge;
        //how many peaks assumed missing/miss-assigned
        return Math.round(errorM / SpectrumMatch.C13_MASS_DIFFERENCE);
    }

    massError() {
        return ((this.expMass() - this.calcMass()) / this.calcMass()) * 1000000;
    }

    ionTypes() {
        return this.ions;
    }

    ionTypesString() {
        return JSON.stringify(this.ionTypes());
    }

    crosslinkerModMass() {
        var clModMass = +this.matchedPeptides[0].cl_modmass;
        if (this.matchedPeptides[1]) {
            clModMass = clModMass + (+this.matchedPeptides[1].cl_modmass);
        }
        return clModMass;
    }

    fragmentTolerance() {
        const sip = this.spectrumIdentificationProtocol;
        return {
            "tolerance": sip.fragmentTolerance,
            "unit": sip.fragmentToleranceUnit
        };
    }

    fragmentToleranceString() {
        var fragTol = this.fragmentTolerance();
        if (fragTol) {
            return fragTol.tolerance + " " + fragTol.unit;
        }
    }

    score() {
        //return this._scores.score;
        var scoreSets = this.containingModel.get("scoreSets");
        // console.log("*",scoreSets);
        if (scoreSets.has("Mascot:expectation value")) {
            // const s =
            return this._scores["Mascot:expectation value"];
        } else {
            //if (scoreSets.size == 1) {
            var scoreSet = scoreSets.keys().next().value;
            var s = this._scores[scoreSet];
            //console.log("!", s);
            return s;
            //}
        }
    }


    modificationCount() {
        return -1; //temp
        const modCount1 = this.matchedPeptides[0].mod_pos.length;
        if (this.matchedPeptides[1]) {
            const modCount2 = this.matchedPeptides[1].mod_pos.length;
            if (modCount2 > modCount1) {
                return modCount2;
            }
        }
        return modCount1;
    }

    get pepSeq1_base() {
        return this.matchedPeptides[0].sequence;
    }

    get pepSeq2_base() {
        if (this.matchedPeptides[1]) {
            return this.matchedPeptides[1].sequence;
        } else {
            return "";
        }
    }

    get pepSeq1_mods() {
        return this.matchedPeptides[0].seq_mods;
    }

    get pepSeq2_mods() {
        if (this.matchedPeptides[1]) {
            return this.matchedPeptides[1].seq_mods;
        } else {
            return "";
        }
    }

    get psmId() {
        return this._identification.id;
    }

    get datasetId() {
        return this.searchId;
    }

    get scanNumber() {
        // if (this.spectrum) {
        return this.spectrumId;
        // }
    }

    get spectrumId() {
        return this._identification.sp;
    }

    get searchId() {
        return this._identification.si.toString();
    }

    get precursor_intensity() {
        return null;
    }

    get elution_time_start() {
        return null;
    }

    get elution_time_end() {
        return null;
    }

    get _scores() {
        return this._identification.sc;
    }

    get precursorCharge() {
        const c = +this._identification.pc_c;
        return c === -1 ? undefined : c;
    }

    get precursorMZ() {
        return +this._identification.pc_mz;
    }

    get calc_mz() {
        return +this._identification.c_mz;
    }

    get passThreshold() {
        return !!this._identification.p;
    }

    get ions() {
        if (this._identification.ions) {
            var ionTypes = this._identification.ions.split(";");
            var ionTypeCount = ionTypes.length;
            var ions = [];
            for (var it = 0; it < ionTypeCount; it++) {
                var ionType = ionTypes[it];
                ions.push({"type": (ionType.charAt(0).toUpperCase() + ionType.slice(1) + "Ion")});
            }
            return ions;
        } else {
            return [{type: "bIon"}, {type: "yIon"}];
        }
    }

    get spectrumIdentificationProtocol() {
        return this.containingModel.getSpectrumIdentificationProtocol(this.searchId, this._identification.sip);
    }
}


SpectrumMatch.protonMass = 1.007276466879;
SpectrumMatch.C13_MASS_DIFFERENCE = 1.0033548;
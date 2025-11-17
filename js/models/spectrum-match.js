import {Crosslink} from "./crosslink";

export class SpectrumMatch {

    /**
     * Create a SpectrumMatch linking a mass spectrum to peptide identifications
     * @param {SearchResultsModel} containingModel - The containing search results model
     * @param {Map<string, Protein>} participants - Map of protein IDs to Protein objects
     * @param {Map<string, Crosslink>} crosslinks - Map of crosslink IDs to Crosslink objects
     * @param {Map<string, Peptide>} peptides - Map of peptide IDs to Peptide objects
     * @param {Object} identification - Raw identification data object
     */
    constructor(containingModel, participants, crosslinks, peptides, identification) {
        this.containingModel = containingModel; //containing BB model
        this._identification = identification;

        // Initialize ion types
        // todo - get from SIP, also CV term issues to be addressed (needed CV terms were deprecated)
        this.ions = [{type:"bIon"}, {type:"yIon"}];

        const scoreSets = Object.keys(this._scores);
        const scoreSetCount = scoreSets.length;
        for (let s = 0; s < scoreSetCount; s++) {
            this.containingModel._scoreSets.add(scoreSets[s]);
        }

        this.matchedPeptides = [];
        this.matchedPeptides[0] = peptides.get(this.uploadId + "_" + identification.pi1);
        if (!this.matchedPeptides[0]) {
            alert("peptide error (missing peptide evidence?) for:" + identification.pi1);
        } else {
            if (this.matchedPeptides[0].is_decoy.indexOf("1") != -1) {
                this.is_decoy = true;
                this.containingModel._decoysPresent = true;
            }
        }
        if (identification.pi2 !== undefined && identification.pi2 !== null) { //null if loop link
            this.matchedPeptides[1] = peptides.get(this.uploadId + "_" + identification.pi2);
            if (!this.matchedPeptides[1]) {
                alert("peptide error (missing peptide evidence?) for:" + +identification.pi2);
            } else if (this.matchedPeptides[1].is_decoy.indexOf("1") != -1) {
                this.is_decoy = true;
                this.containingModel._decoysPresent = true;
            }
        }
        //if the match is ambiguous it will relate to many crosslinks
        this.crosslinks = [];
        this.linkPos1 = +this.matchedPeptides[0].linkSite1;
        this.linkPos2 = undefined;
        if (this.matchedPeptides[1]) {
            this.linkPos2 = this.matchedPeptides[1].linkSite1;
        } else if (identification.pi2 === null) {
            this.linkPos2 = +this.matchedPeptides[0].linkSite2;
        }

        // the protein IDs and residue numers we eventually want to get:-
        let p1ID, p2ID, res1, res2;

        if (this.isNotCrosslinked()) {
            //its a linear
            this.containingModel._linearsPresent = true;
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
        this.confirmedHomomultimer = false;
        this.overlap = [];

        //looplinks
        if (!this.matchedPeptides[1]){
            this.couldBelongToSelfLink = true;
            for (let i = 0; i < this.matchedPeptides[0].prt.length; i++) {
                p1ID = this.matchedPeptides[0].prt[i];
                this.associateWithLink(participants, crosslinks, p1ID, p1ID, this.matchedPeptides[0].pos[i]  + this.linkPos1 - 1, this.matchedPeptides[0].pos[i] + this.linkPos2 - 1, this.matchedPeptides[0].pos[i] - 0, this.matchedPeptides[0].sequence.length);
            }
            return;
        }

        //loop to produce all alternative linkage site combinations
        //(position1 count * position2 count alternative)
        for (let i = 0; i < this.matchedPeptides[0].pos.length; i++) {
            for (let j = 0; j < this.matchedPeptides[1].pos.length; j++) {

                if (i > 0 || j > 0) {
                    this.containingModel._ambiguousPresent = true;
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

    /**
     * Associate this match with a crosslink
     * @param {Map<string, Protein>} proteins - Map of protein IDs to Protein objects
     * @param {Map<string, Crosslink>} crosslinks - Map of crosslink IDs to Crosslink objects
     * @param {string} p1ID - Protein 1 identifier
     * @param {string} [p2ID] - Protein 2 identifier (optional for linear peptides)
     * @param {number} [res1] - Residue position 1
     * @param {number} [res2] - Residue position 2
     * @param {number} [pep1_start] - Peptide 1 start position
     * @param {number} [pep1_length] - Peptide 1 length
     * @param {number} [pep2_start] - Peptide 2 start position
     * @param {number} [pep2_length] - Peptide 2 length
     * @returns {void}
     */
    associateWithLink(proteins, crosslinks, p1ID, p2ID, res1, res2, //following params may be null :-
        pep1_start, pep1_length, pep2_start, pep2_length) {

        // we don't want two different ID's, e.g. one that's "33-66" and one that's "66-33"
        //following puts lower protein_ID first in link_ID

        //todo: this end swapping thing, its a possible source of confusion

        let fromProt, toProt;

        if (this.isNotCrosslinked()) {//!p2ID || p2ID === "" || p2ID === '-' || p2ID === 'n/a') { //its  a linear peptide (no crosslinker of any product type))
            this.containingModel._linearsPresent = true;
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

    /**
     * Check if this match is ambiguous (multiple peptide positions)
     * @returns {boolean} True if match is ambiguous
     */
    isAmbig() {
        return this.matchedPeptides[0].pos.length > 1 ||
            (this.matchedPeptides[1] && this.matchedPeptides[1].pos.length > 1);
    }

    /**
     * Check if this match involves a decoy protein
     * @returns {boolean} True if match involves decoy
     */
    isDecoy() {
        if (this.is_decoy) { //todo - looks bad
            return this.is_decoy;
        } else {
            //its from csv not database, for simplicity lets just look at first crosslink //todo - look at again
            return this.crosslinks[0].isDecoyLink();
        }
    }

    /**
     * Get match identifier
     * @returns {string} The PSM identifier
     */
    get id () {
        return this.psmId;
    }

    /**
     * Check if peptides are not crosslinked (linear peptides)
     * @returns {boolean} True if not crosslinked
     */
    isNotCrosslinked() {
        return this.linkPos1 === null;
    }

    /**
     * Check if this is a monolink
     * @returns {boolean} Always returns false
     */
    isMonoLink() {
        return false; //this.linkPos1 !== null && this.matchedPeptides.length === 1;
    }

    /**
     * Check if this is a loop link (intra-peptide crosslink)
     * @returns {boolean} True if loop link
     */
    isLoopLink() {
        return this.linkPos1 !== null && this.matchedPeptides.length === 1;
    }

    /**
     * Get the peaklist file name
     * @returns {string} The peaklist file name
     */
    peaklistFileName() {
        const spectraData = this.containingModel.getSpectraDataById(this.uploadId, this._identification.sd);
        return spectraData.location.split("/").pop().split("\\").pop();
    }

    /**
     * Get the group this match belongs to
     * @returns {*} The group identifier
     */
    group() {
        return this.containingModel.getMzidentmlFiles().get(this.uploadId).group;
    }

    /**
     * Get experimental m/z value
     * @returns {number} Experimental m/z
     */
    expMZ() {
        return this.precursorMZ;
    }

    /**
     * Calculate experimental mass
     * @returns {number} Experimental mass
     */
    expMass() {
        return this.precursorMZ * this.precursorCharge - (this.precursorCharge * SpectrumMatch.protonMass);
    }

    /**
     * Get calculated m/z value
     * @returns {number} Calculated m/z
     */
    calcMZ() {
        return this.calc_mz;// (this.calc_mass + (this.precursorCharge * SpectrumMatch.protonMass)) / this.precursorCharge;
    }

    /**
     * Calculate theoretical mass
     * @returns {number} Calculated mass
     */
    calcMass() {
        return (this.precursorCharge * this.calc_mz) - (this.precursorCharge * SpectrumMatch.protonMass); //this.calc_mass;
    }

    /**
     * Calculate number of missing or misassigned peaks
     * @returns {number} Number of missing peaks
     */
    missingPeaks() {
        const errorMZ = this.expMZ() - this.calcMZ();
        const errorM = errorMZ * this.precursorCharge;
        //how many peaks assumed missing/miss-assigned
        return Math.round(errorM / SpectrumMatch.C13_MASS_DIFFERENCE);
    }

    /**
     * Calculate mass error in ppm
     * @returns {number} Mass error in parts per million
     */
    massError() {
        return ((this.expMass() - this.calcMass()) / this.calcMass()) * 1000000;
    }

    /**
     * Get ion types for this match
     * @returns {Array<Object>} Array of ion type objects
     */
    ionTypes() {
        return this.ions;
    }

    /**
     * Get ion types as JSON string
     * @returns {string} JSON string of ion types
     */
    ionTypesString() {
        return JSON.stringify(this.ionTypes());
    }

    /**
     * Calculate total crosslinker modification mass
     * @returns {number} Crosslinker modification mass
     */
    crosslinkerModMass() {
        var clModMass = +this.matchedPeptides[0].cl_modmass;
        if (this.matchedPeptides[1]) {
            clModMass = clModMass + (+this.matchedPeptides[1].cl_modmass);
        }
        return clModMass;
    }

    /**
     * Get fragment tolerance settings
     * @returns {Object} Object with tolerance and unit properties
     */
    fragmentTolerance() {
        const sip = this.spectrumIdentificationProtocol;
        return {
            "tolerance": sip.fragmentTolerance,
            "unit": sip.fragmentToleranceUnit
        };
    }

    /**
     * Get fragment tolerance as formatted string
     * @returns {string|undefined} Fragment tolerance string or undefined
     */
    fragmentToleranceString() {
        var fragTol = this.fragmentTolerance();
        if (fragTol) {
            return fragTol.tolerance + " " + fragTol.unit;
        }
    }

    /**
     * Get the score for this match
     * @returns {number} The match score
     */
    score() {
        //return this._scores.score;
        var scoreSets = this.containingModel.getScoreSets();
        // console.log("*",scoreSets);
        if (scoreSets.has("Mascot:expectation value")) {
            // const s =
            return this._scores["Mascot:expectation value"];
        } else {
            var scoreSet = scoreSets.keys().next().value;
            return this._scores[scoreSet];
        }
    }

    /**
     * Get the maximum modification count across peptides
     * @returns {number} Modification count
     */
    modificationCount() {
        const modCount1 = this.matchedPeptides[0].mod_pos.length;
        if (this.matchedPeptides[1]) {
            const modCount2 = this.matchedPeptides[1].mod_pos.length;
            if (modCount2 > modCount1) {
                return modCount2;
            }
        }
        return modCount1;
    }

    /**
     * Get peptide 1 base sequence
     * @returns {string} Peptide 1 base sequence
     */
    get pepSeq1_base() {
        return this.matchedPeptides[0].sequence;
    }

    /**
     * Get peptide 2 base sequence
     * @returns {string} Peptide 2 base sequence or empty string
     */
    get pepSeq2_base() {
        if (this.matchedPeptides[1]) {
            return this.matchedPeptides[1].sequence;
        } else {
            return "";
        }
    }

    /**
     * Get peptide 1 sequence with modifications
     * @returns {string} Peptide 1 sequence with modifications
     */
    get pepSeq1_mods() {
        return this.matchedPeptides[0].seq_mods;
    }

    /**
     * Get peptide 2 sequence with modifications
     * @returns {string} Peptide 2 sequence with modifications or empty string
     */
    get pepSeq2_mods() {
        if (this.matchedPeptides[1]) {
            return this.matchedPeptides[1].seq_mods;
        } else {
            return "";
        }
    }

    /**
     * Get peptide-spectrum match identifier
     * @returns {string} PSM identifier
     */
    get psmId() {
        return this._identification.id;
    }

    /**
     * Get spectrum identifier
     * @returns {string} Spectrum identifier
     */
    get spectrumId() {
        return this._identification.sp;
    }

    /**
     * Get upload identifier
     * @returns {string} Upload identifier
     */
    get uploadId() {
        return this._identification.si.toString();
    }

    /**
     * Get precursor intensity
     * @returns {null} Always returns null
     */
    get precursor_intensity() {
        return null;
    }

    /**
     * Get scores object
     * @returns {Object} Object containing score values
     */
    get _scores() {
        return this._identification.sc;
    }

    /**
     * Get precursor charge state
     * @returns {number|undefined} Precursor charge or undefined if -1
     */
    get precursorCharge() {
        const c = +this._identification.pc_c;
        return c === -1 ? undefined : c;
    }

    /**
     * Get precursor m/z value
     * @returns {number} Precursor m/z
     */
    get precursorMZ() {
        return +this._identification.pc_mz;
    }

    /**
     * Get calculated m/z value
     * @returns {number} Calculated m/z
     */
    get calc_mz() {
        return +this._identification.c_mz;
    }

    /**
     * Check if match passes threshold
     * @returns {boolean} True if passes threshold
     */
    get passThreshold() {
        return !!this._identification.p;
    }

    /**
     * Get dataset identifier
     * @returns {string} Dataset identifier
     */
    get datasetId() {
        return this.uploadId;
    }

    /**
     * Get scan number
     * @returns {string} Scan number
     */
    get scanNumber() {
        return this.spectrumId;
    }

    /**
     * Get elution time start
     * @returns {null} Always returns null
     */
    get elution_time_start() {
        return null;
    }

    /**
     * Get elution time end
     * @returns {null} Always returns null
     */
    get elution_time_end() {
        return null;
    }

    /**
     * Get spectrum identification protocol
     * @returns {SpectrumIdentificationProtocol} The spectrum identification protocol
     */
    get spectrumIdentificationProtocol() {
        return this.containingModel.getSpectrumIdentificationProtocol(this.uploadId, this._identification.sip);
    }
}


SpectrumMatch.protonMass = 1.007276466879;
SpectrumMatch.C13_MASS_DIFFERENCE = 1.0033548;

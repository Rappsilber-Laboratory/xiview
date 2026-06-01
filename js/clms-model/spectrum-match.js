import {Crosslink} from "./crosslink";
import {ScoreExtent} from "./score-extent";

export class SpectrumMatch {
    /**
     * Private identification data JSON from crosslinking-API
     * @type {Object}
     * @private
     */
    #json;

    /**
     * Get upload identifier
     * @returns {string} Upload identifier
     */
    get uploadId() {
        return this.#json.ui;
    }

    /**
     * Reference to the parent SearchResultsModel containing this match
     * @type {SearchResultsModel}
     * @private
     */
    #containingModel;

    /**
     * Array of crosslink objects this match is associated with
     * @type {Array<Crosslink>}
     */
    crosslinks;

    /**
     * Array of matched peptide objects (1 or 2 peptides depending on crosslink type)
     * @type {Array<Peptide>}
     */
    matchedPeptides = [];


    /**
     * Crosslink position in first peptide (1-indexed)
     * @type {number}
     */
    linkPos1;

    /**
     * Crosslink position in second peptide (1-indexed, undefined for linears)
     * @type {number|undefined}
     */
    linkPos2;

    /**
     * Whether this match involves a decoy peptide
     * @type {boolean}
     * @private
     */
    #is_decoy;

    /**
     * Whether this match could belong to a protein heteromeric crosslink ('between link')
     * @type {boolean}
     */
    couldBelongToBetweenLink;

    /**
     * Whether this match could belong to a self-link - todo -defintion
     * @type {boolean}
     */
    couldBelongToSelfLink;

    /**
     * Whether this match has been confirmed as a homomultimeric link (peptides overlap)
     * @type {boolean}
     */
    confirmedHomomultimer;

    /**
     * Array indicating overlapping peptide regions for homomultimers [start, end]
     * @type {Array<number>}
     */
    overlap;

    /**
     * Create a SpectrumMatch linking a mass spectrum to peptide identifications
     * @param {SearchResultsModel} containingModel - The containing search results backbone-models
     * @param {Map<string, Protein>} proteins - Map of protein IDs to Protein objects
     * @param {Map<string, Crosslink>} crosslinks - Map of crosslink IDs to Crosslink objects
     * @param {Map<string, Peptide>} peptides - Map of peptide IDs to Peptide objects
     * @param {Object} json - Raw identification data object
     * @param {string} json.ui - Spectrum identification/upload identifier
     * @param {string} json.pi1 - Peptide identifier 1
     * @param {string} [json.pi2] - Peptide identifier 2 (null for loop links, undefined for linear peptides)
     * @param {string} json.id - PSM (peptide-spectrum match) identifier
     * @param {string} json.sp - Spectrum identifier
     * @param {Object} json.sc - Scores object containing score name-value pairs
     * @param {number} json.pc_c - Precursor charge state
     * @param {number} json.pc_mz - Precursor m/z value
     * @param {number} json.c_mz - Calculated m/z value
     * @param {boolean} json.p - Pass threshold flag
     * @param {string} json.sd - Spectra data identifier
     * @param {string} json.sip - Spectrum identification protocol identifier
     */
    constructor(containingModel, proteins, crosslinks, peptides, json) {
        this.#containingModel = containingModel;
        this.#json = json;

        this.ions = [{type:"bIon"}, {type:"yIon"}]; //todo -remove

        //scores
        for (const [scoreType, scoreValue] of Object.entries(this.#json.sc)) {
            let scoreExtent = this.#containingModel.scoreExtents.get(scoreType);
            if (!scoreExtent) {
                scoreExtent = new ScoreExtent(scoreType);
                this.#containingModel.scoreExtents.set(scoreType, scoreExtent);
            }
            scoreExtent.processScore(scoreValue);
        }

        this.matchedPeptides[0] = peptides.get(this.uploadId + "_" + json.pi1);
        if (!this.matchedPeptides[0]) {
            alert("peptide error (missing peptide evidence?) for:" + json.pi1);
        } else {
            if (this.matchedPeptides[0].is_decoy.indexOf("1") != -1) {
                this.is_decoy = true;
                this.#containingModel.setDecoysPresent();
            }
        }
        if (json.pi2 !== undefined && json.pi2 !== null) { //null if loop link
            this.matchedPeptides[1] = peptides.get(this.uploadId + "_" + json.pi2);
            if (!this.matchedPeptides[1]) {
                alert("peptide error (missing peptide evidence?) for:" + +json.pi2);
            } else if (this.matchedPeptides[1].is_decoy.indexOf("1") != -1) {
                this.is_decoy = true;
                this.#containingModel.setDecoysPresent();
            }
        }
        //if the match is ambiguous it will relate to many crosslinks
        this.crosslinks = [];
        this.linkPos1 = +this.matchedPeptides[0].linkSite1;
        this.linkPos2 = undefined;
        if (this.matchedPeptides[1]) {
            this.linkPos2 = this.matchedPeptides[1].linkSite1;
        } else if (json.pi2 === null) {
            this.linkPos2 = +this.matchedPeptides[0].linkSite2;
        }

        // the protein IDs and residue numers we eventually want to get:-
        let p1ID, p2ID, res1, res2;

        if (this.isNotCrosslinked()) {
            //its a linear
            this.#containingModel.setLinearsPresent();
            for (let i = 0; i < this.matchedPeptides[0].prt.length; i++) {
                p1ID = this.matchedPeptides[0].prt[i];
                this.#associateWithLink(proteins, crosslinks, p1ID);
            }
            if (this.matchedPeptides[1]) {
                for (let i = 0; i < this.matchedPeptides[1].prt.length; i++) {
                    p1ID = this.matchedPeptides[1].prt[i];
                    this.#associateWithLink(proteins, crosslinks, p1ID);
                }
            }
            return;
        }

        this.couldBelongToBetweenLink = false;
        this.couldBelongToSelfLink = false;
        this.confirmedHomomultimer = false;
        this.overlap = [];

        //looplinks
        if (!this.matchedPeptides[1]) {
            this.couldBelongToSelfLink = true;
            for (let i = 0; i < this.matchedPeptides[0].prt.length; i++) {
                p1ID = this.matchedPeptides[0].prt[i];
                this.#associateWithLink(proteins, crosslinks, p1ID, p1ID, this.matchedPeptides[0].pos[i] + this.linkPos1 - 1, this.matchedPeptides[0].pos[i] + this.linkPos2 - 1, this.matchedPeptides[0].pos[i] - 0, this.matchedPeptides[0].sequence.length);
            }
            return;
        }

        //loop to produce all alternative linkage site combinations
        //(position1 count * position2 count alternative)
        for (let i = 0; i < this.matchedPeptides[0].pos.length; i++) {
            for (let j = 0; j < this.matchedPeptides[1].pos.length; j++) {

                if (i > 0 || j > 0) {
                    this.#containingModel.setAmbiguousPresent();
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

                this.#associateWithLink(proteins, crosslinks, p1ID, p2ID, res1, res2, this.matchedPeptides[0].pos[i] - 0, this.matchedPeptides[0].sequence.length, this.matchedPeptides[1].pos[j], this.matchedPeptides[1].sequence.length);
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
     * @private
     */
    #associateWithLink(proteins, crosslinks, p1ID, p2ID, res1, res2, //following params may be null :-
        pep1_start, pep1_length, pep2_start, pep2_length) {

        // we don't want two different ID's, e.g. one that's "33-66" and one that's "66-33"
        //following puts lower protein_ID first in link_ID

        //todo: this end swapping thing, its a possible source of confusion

        let fromProt, toProt;

        if (this.isNotCrosslinked()) {// !p2ID || p2ID === "" || p2ID === '-' || p2ID === 'n/a') { //its  a linear peptide (no crosslinker of any product type))
            this.#containingModel.setLinearsPresent();
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
                    resLink = new Crosslink(crosslinkID, fromProt, res1, toProt, res2);
                } else {
                    resLink = new Crosslink(crosslinkID, fromProt, res2, toProt, res1);
                }
            } else if (p1ID === fromProt.id) {
                resLink = new Crosslink(crosslinkID, fromProt, res1, toProt, res2);
            } else {
                //WATCH OUT - residues need to be in correct oprder
                resLink = new Crosslink(crosslinkID, fromProt, res2, toProt, res1);
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
        return this.#is_decoy;
    }

    /**
     * Get match identifier
     * @returns {string} The PSM identifier
     */
    get id() {
        return this.psmId;
    }

    /**
     * Check if peptides are not crosslinked (linear peptides) - todo - check warning
     * @returns {boolean} True if not crosslinked
     */
    isNotCrosslinked() {
        return this.linkPos1 === null;
    }

    /**
     * Check if this is a monolink - todo - whats going on here
     * @returns {boolean} Always returns false
     */
    isMonoLink() {
        return false; //this.linkPos1 !== null && this.matchedPeptides.length === 1;
    }

    /**
     * Check if this is a loop link (intra-peptide crosslink) - todo - check warning
     * @returns {boolean} True if loop link
     */
    isLoopLink() {
        return this.linkPos1 !== null && this.matchedPeptides.length === 1;
    }

    /**
     * Get the peaklist file name - todo - tidy up SpectraData stuff
     * @returns {string} The peaklist file name
     */
    peaklistFileName() {
        const spectraData = this.#containingModel.getMzidentmlFiles().get(this.uploadId).getSpectraDataById(this.#json.sd);
        return spectraData.location.split("/").pop().split("\\").pop();
    }

    /**
     * Get the group this match belongs to - todo
     * @returns {*} The group identifier
     */
    group() {
        return this.#containingModel.getMzidentmlFiles().get(this.uploadId).group;
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
        const errorMZ = this.precursorMZ - this.calcMZ();
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
     * Get ion types for this match - todo -remove
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
        let clModMass = +this.matchedPeptides[0].cl_modmass;
        if (this.matchedPeptides[1]) {
            clModMass = clModMass + (+this.matchedPeptides[1].cl_modmass);
        }
        return clModMass;
    }

    /**
     * Get fragment tolerance settings - todo - remove?
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
        return this.#json.sc[this.#containingModel.selectedScoreType];
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
        return this.#json.id;
    }

    /**
     * Get spectrum identifier
     * @returns {string} Spectrum identifier
     */
    get spectrumId() {
        return this.#json.sp;
    }

    /**
     * Get precursor charge state
     * @returns {number|undefined} Precursor charge or undefined if -1
     */
    get precursorCharge() {
        return this.#json.pc_c === -1 ? undefined : this.#json.pc_c;
    }

    /**
     * Get precursor m/z value
     * @returns {number} Precursor m/z
     */
    get precursorMZ() {
        return this.#json.pc_mz;
    }

    /**
     * Get calculated m/z value
     * @returns {number} Calculated m/z
     */
    get calc_mz() {
        return this.#json.c_mz;
    }

    /**
     * Check if match passes threshold
     * @returns {boolean} True if passes threshold
     */
    get passThreshold() {
        return this.#json.p;
    }

    /**
     * Get spectrum identification protocol
     * @returns {SpectrumIdentificationProtocol} The spectrum identification protocol
     */
    get spectrumIdentificationProtocol() {
        return this.#containingModel.getMzidentmlFiles().get(this.uploadId).getSpectrumIdentificationProtocolById(this.#json.sip);
    }

    get spectraDataId() {
        return this.#json.sd;
    }



    // /**
    //  * Get precursor intensity
    //  * @returns {null} Always returns null
    //  */
    // get precursor_intensity() {
    //     return null;
    // }

    // /**
    //  * Get dataset identifier
    //  * @returns {string} Dataset identifier
    //  */
    // get datasetId() {
    //     return this.uploadId;
    // }

    // /**
    //  * Get scan number
    //  * @returns {string} Scan number
    //  */
    // get scanNumber() {
    //     return this.spectrumId;
    // }

    // /**
    //  * Get elution time start
    //  * @returns {null} Always returns null
    //  */
    // get elution_time_start() {
    //     return null;
    // }
    //
    // /**
    //  * Get elution time end
    //  * @returns {null} Always returns null
    //  */
    // get elution_time_end() {
    //     return null;
    // }
}



/**
 * Mass of a proton in Daltons (used for m/z calculations)
 * @type {number}
 * @constant
 */
SpectrumMatch.protonMass = 1.007276466879;

/**
 * Mass difference between C12 and C13 isotopes in Daltons
 * @type {number}
 * @constant
 */
SpectrumMatch.C13_MASS_DIFFERENCE = 1.0033548;

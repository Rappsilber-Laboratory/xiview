import {Crosslink} from "./crosslink";
import {ScoreExtent} from "./score-extent";
import {DEFAULT_ION_SERIES, ionTypeObjects} from "./mzidentml-metadata/spectrum-identification-protocol";

/**
 * Whether a peptide maps to decoy proteins, target proteins, or both.
 * Uses the proteins' is_decoy, which parseJSON has set for every data source
 * (mzIdentML / CSV: from the per-position dec flags; xi2: from the protein).
 * A protein id with no protein counts as target (that error is reported when the link is made).
 * @param {Peptide} peptide - The peptide
 * @param {Map<string, Protein>} proteins - Map of protein IDs to Protein objects
 * @returns {{decoy: boolean, target: boolean}} Whether any position is on a decoy / on a target protein
 */
function peptideDecoyState(peptide, proteins) {
    let decoy = false;
    let target = false;
    for (const proteinId of peptide.prt) {
        if (proteins.get(proteinId)?.is_decoy === true) {
            decoy = true;
        } else {
            target = true;
        }
    }
    return {decoy, target};
}

/**
 * The overlap of a match that isn't a confirmed homomultimer: one shared, frozen empty array rather than
 * one per match. Reads give undefined as from any empty array; a write would throw, not change every match
 * (the constructor assigns a new array when there is an overlap).
 * @type {Array<number>}
 */
const NO_OVERLAP = Object.freeze([]);

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
     * Get search identifier - peptides are keyed by this concatenated with their id
     * complication whereby this behaves diff in xisearch2
     * in pride this is 'ui' (upload id) in xi2 it is 'si' (search id)
     * @returns {string} search identifier
     */
    get searchId() {
        if (this.#json.si) return this.#json.si;
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
     * Whether this match involves a decoy peptide (one with any position on a decoy protein)
     * @type {boolean}
     * @private
     */
    #is_decoy = false;

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
     * @param {PeptideLookup} peptides - Peptides by (search id, peptide id)
     * @param {Object} json - Raw identification data object
     * @param {string} json.ui - Spectrum identification/upload identifier
     * @param {string} json.pi1 - Peptide identifier 1
     * @param {string} [json.pi2] - Peptide identifier 2 (null for loop links, undefined for linear peptides)
     * @param {number} [json.s1] - Crosslink site position within peptide 1 (xi2; 1-based). Falls back to peptide.linkSite1 (ls1) for pride mzIdentML data.
     * @param {number} [json.s2] - Crosslink site position within peptide 2, or second site of a loop link (xi2; 1-based). Falls back to peptide.linkSite for pride data.
     * @param {string} json.id - PSM (peptide-spectrum match) identifier
     * @param {string} json.sp - Spectrum identifier
     * @param {Object} json.sc - Scores object containing score name-value pairs
     * @param {number} json.pc_c - Precursor charge state
     * @param {number} json.pc_mz - Precursor m/z value
     * @param {number} json.c_mz - Calculated m/z value
     * @param {boolean} json.p - Pass threshold flag
     * @param {string} json.sd - Spectra data identifier
     * @param {string} json.sip - Spectrum identification protocol identifier
     * @param {number} [json.sn] - Scan number (xi2 only)
     * @param {number} [json.sc_i] - Scan index (xi2 only)
     * @param {number} [json.rt] - Retention time (xi2 only)
     * @param {number} [json.pc_i] - Precursor intensity (xi2 only)
     */
    constructor(containingModel, proteins, crosslinks, peptides, json) {
        this.#containingModel = containingModel;
        this.#json = json;

        //scores
        const scores = json.sc;
        const scoreExtents = containingModel.scoreExtents;
        for (const scoreType of Object.keys(scores)) {
            let scoreExtent = scoreExtents.get(scoreType);
            if (!scoreExtent) {
                scoreExtent = new ScoreExtent(scoreType);
                scoreExtents.set(scoreType, scoreExtent);
            }
            scoreExtent.processScore(scores[scoreType]);
        }

        // *xi2 vrs pride difference* in id of dataset (xi2 has search sets and result sets) is handled by this.searchId
        // matchedPeptides is assigned as a whole (one element, or two for a second peptide) rather than
        // filled in by index; same contents, but the array is allocated at its final size.
        const searchId = this.searchId;
        const pep0 = peptides.get(searchId, json.pi1); // u r here

        if (!pep0) {
            alert("peptide error (missing peptide evidence?) for:" + json.pi1);
        }
        let pep1;
        if (json.pi2 !== undefined && json.pi2 !== null) { //null if loop link
            pep1 = peptides.get(searchId, json.pi2);// *xi2 vrs pride difference*
            this.matchedPeptides = [pep0, pep1];
            if (!pep1) {
                alert("peptide error (missing peptide evidence?) for:" + +json.pi2);
            }
        } else {
            this.matchedPeptides = [pep0];
        }

        // decoy: either peptide has a position on a decoy protein (TD or DD). A peptide on both target
        // and decoy proteins makes the match a decoy too; those matches are counted so the user can be told.
        let mixedDecoyPeptide = false;
        for (const pep of this.matchedPeptides) {
            if (pep) {
                const state = peptideDecoyState(pep, proteins);
                if (state.decoy) {
                    this.#is_decoy = true;
                    if (state.target) {
                        mixedDecoyPeptide = true;
                    }
                }
            }
        }
        if (this.#is_decoy) {
            containingModel.setDecoysPresent();
            if (mixedDecoyPeptide) {
                containingModel.noteMixedTargetDecoyMatch();
            }
        }
        //if the match is ambiguous it will relate to many crosslinks
        this.crosslinks = [];
        // xi2 carries crosslink sites on the match (s1/s2); mzIdentML
        // carries them on the peptide (ls1/ls2). Prefer the match when present.
        this.linkPos1 = (json.s1 !== undefined)
            ? +json.s1
            : +pep0.linkSite1;
        this.linkPos2 = undefined;
        if (pep1) {
            this.linkPos2 = (json.s2 !== undefined)
                ? +json.s2
                : pep1.linkSite1;
        } else if (json.pi2 === null) { // loop link: both sites on peptide 0
            this.linkPos2 = (json.s2 !== undefined)
                ? +json.s2
                : +pep0.linkSite2;
        }

        // the protein IDs and residue numers we eventually want to get:-
        let p1ID, p2ID, res1, res2;

        if (this.isNotCrosslinked()) {
            //its a linear
            containingModel.setLinearsPresent();
            const prt0 = pep0.prt;
            for (let i = 0; i < prt0.length; i++) {
                p1ID = prt0[i];
                this.#associateWithLink(proteins, crosslinks, p1ID);
            }
            if (pep1) {
                const prt1 = pep1.prt;
                for (let i = 0; i < prt1.length; i++) {
                    p1ID = prt1[i];
                    this.#associateWithLink(proteins, crosslinks, p1ID);
                }
            }
            return;
        }

        this.couldBelongToBetweenLink = false;
        this.couldBelongToSelfLink = false;
        this.confirmedHomomultimer = false;
        this.overlap = NO_OVERLAP;

        //looplinks
        if (!pep1) {
            this.couldBelongToSelfLink = true;
            const prt0 = pep0.prt;
            const pos0 = pep0.pos;
            for (let i = 0; i < prt0.length; i++) {
                p1ID = prt0[i];
                this.#associateWithLink(proteins, crosslinks, p1ID, p1ID, pos0[i] + this.linkPos1 - 1, pos0[i] + this.linkPos2 - 1, pos0[i] - 0, pep0.sequence.length);
            }
            return;
        }

        //loop to produce all alternative linkage site combinations
        //(position1 count * position2 count alternative)
        const prt0 = pep0.prt;
        const pos0 = pep0.pos;
        const prt1 = pep1.prt;
        const pos1 = pep1.pos;
        const linkPos1 = this.linkPos1;
        const linkPos2 = this.linkPos2;
        for (let i = 0; i < pos0.length; i++) {
            for (let j = 0; j < pos1.length; j++) {

                if (i > 0 || j > 0) {
                    containingModel.setAmbiguousPresent();
                }

                //some files (must be csv) are not puting in duplicate protein ids in ambig links
                //in this case use last one
                if (i < prt0.length) {
                    p1ID = prt0[i];
                } else {
                    p1ID = prt0[prt0.length - 1];
                }
                if (j < prt1.length) {
                    p2ID = prt1[j];
                } else {
                    p2ID = prt1[prt1.length - 1];
                }

                // * residue numbering starts at 1 *
                res1 = +pos0[i] - 1 + linkPos1;
                res2 = +pos1[j] - 1 + linkPos2;

                this.#associateWithLink(proteins, crosslinks, p1ID, p2ID, res1, res2, pos0[i] - 0, pep0.sequence.length, pos1[j], pep1.sequence.length);
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
                    this.overlap = [pep1_start - 1, (pep1_end < pep2_end) ? pep1_end : pep2_end];
                } else if (pep2_start >= pep1_start && pep2_start <= pep1_end) {
                    this.confirmedHomomultimer = true;
                    this.overlap = [pep2_start - 1, (pep2_end < pep1_end) ? pep2_end : pep1_end];
                }
            } else if (res1 === res2) {
                this.confirmedHomomultimer = true;
                this.overlap = [res1 - 1, res2];
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

        // array literals rather than push onto [], so each array is allocated at its final size
        const pepPos1 = {
            start: pep1_start,
            length: pep1_length
        };
        const pepPos2 = {
            start: pep2_start,
            length: pep2_length
        };
        const peptidePositions = (endsReversedInResLinkId === false) ? [pepPos1, pepPos2] : [pepPos2, pepPos1];
        resLink.matches_pp.push({
            match: this,
            pepPos: peptidePositions
        });
        // most matches have one crosslink: start the array with it rather than pushing onto []
        if (this.crosslinks.length === 0) {
            this.crosslinks = [resLink];
        } else {
            this.crosslinks.push(resLink);
        }
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
     * Check if this match involves a decoy protein: true if either peptide has any position on a
     * decoy protein (so also for a peptide on both target and decoy proteins)
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
        const spectraData = this.#containingModel.getMzidentmlFiles().get(this.uploadId)?.getSpectraDataById(this.spectraDataId);
        return spectraData ? spectraData.fileName() : "";
    }

    /**
     * Get the group this match belongs to
     * @returns {*} The group identifier
     */
    group() {
        return this.#containingModel.getSearches().get(this.uploadId)?.group;
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
     * Get the ion types searched for, from this match's spectrum identification protocol
     * (mzIdentML: AdditionalSearchParams; xi2: the search config). b and y ions if the match has no protocol
     * (e.g. CSV uploads).
     * @returns {Array<Object>} Array of ion type objects, e.g. [{type: "bIon"}, {type: "yIon"}]
     */
    ionTypes() {
        const sip = this.#containingModel.getMzidentmlFiles().get(this.uploadId)?.getSpectrumIdentificationProtocolById(this.#json.sip);
        return sip ? sip.ionTypes() : ionTypeObjects(DEFAULT_ION_SERIES);
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
        // modifications has one entry per mod_pos entry
        const modCount1 = this.matchedPeptides[0].modifications.length;
        if (this.matchedPeptides[1]) {
            const modCount2 = this.matchedPeptides[1].modifications.length;
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
        if (this.#json.p === undefined) return true;
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

    /**
     * Get scan number (xi2 only - pride/mzIdentML matches have no scan number field)
     * @returns {number|undefined} Scan number
     */
    get scanNumber() {
        return this.#json.sn;
    }

    /**
     * Get scan index (xi2 only)
     * @returns {number|undefined} Scan index
     */
    get scanIndex() {
        return this.#json.sc_i;
    }

    /**
     * Get retention time (xi2 only)
     * @returns {number|undefined} Retention time
     */
    get retentionTime() {
        return this.#json.rt;
    }

    /**
     * Get precursor intensity (xi2 only)
     * @returns {number|undefined} Precursor intensity
     */
    get precursor_intensity() {
        return this.#json.pc_i;
    }

    // /**
    //  * Get dataset identifier
    //  * @returns {string} Dataset identifier
    //  */
    // get datasetId() {
    //     return this.uploadId;
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

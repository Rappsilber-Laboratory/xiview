// Model of sequence alignment settings for a protein (including the above collection as an attribute)
import Backbone from "backbone";

import {filterOutDecoyInteractors} from "../modelUtils";
import {GotohAligner} from "./bioseq32";
import {SeqCollection} from "./sequence-model-collection";
import d3 from "d3";

/**
 * Model for one protein's alignment settings and aligned sequences.
 * Stores gap penalties (open, extend, start), BLOSUM matrix, reference sequence (from search),
 * SeqCollection (PDB/Uniprot sequences aligned to this protein). Triggers realignment when settings change.
 * Provides index mapping between PDB/Uniprot sequences and search sequence (1-indexed).
 * @class
 * @extends Backbone.Model
 * @property {string} displayLabel - Protein name for display
 * @property {Object} scoreMatrix - BLOSUM matrix model (e.g., BLOSUM62, BLOSUM80)
 * @property {number} matchScore - Match score for simple scoring (superceded by scoreMatrix)
 * @property {number} misScore - Mismatch penalty for simple scoring
 * @property {number} gapOpenScore - Gap open penalty
 * @property {number} gapExtendScore - Gap extension penalty
 * @property {number} gapAtStartScore - Fixed penalty for starting with gap (semi-global alignment)
 * @property {string} refSeq - Reference sequence from search
 * @property {string} refID - Reference sequence ID
 * @property {number} maxAlignWindow - Maximum alignment window size for long sequences
 * @property {Function} sequenceAligner - Alignment algorithm (GotohAligner)
 * @property {SeqCollection} seqCollection - Collection of aligned sequences (PDB, Uniprot)
 */
export class ProtAlignModel extends Backbone.Model {

    constructor(attributes, options) {
        super(attributes, options);
    }

    // return defaults as result of a function means arrays aren't shared between model instances
    // http://stackoverflow.com/questions/17318048/should-my-backbone-defaults-be-an-object-or-a-function
    defaults() {
        return {
            displayLabel: "A Protein",    // label to display in collection view for this model
            scoreMatrix: undefined,   // slot for a BLOSUM type matrix
            matchScore: 6,    // match and mis should be superceded by the score matrix if present
            misScore: -6,
            gapOpenScore: 10,
            gapExtendScore: 1,
            gapAtStartScore: 0,   // fixed penalty for starting with a gap (semi-global alignment)
            refSeq: "CHATTER",
            refID: "Example",
            maxAlignWindow: 1000,
            sequenceAligner: GotohAligner,
            seqCollection: new SeqCollection(),
        };
    }

    /**
     * Initializes protein alignment model.
     * Sets up bidirectional link with seqCollection, listens for setting changes to trigger realignment,
     * listens for alignStr changes in sequences to trigger nonTrivialAlignmentChange event,
     * updates displayLabel when protein metadata changes.
     * @returns {ProtAlignModel} This model for chaining
     */
    initialize() {
        //alert("!");
        // https://github.com/jashkenas/backbone/issues/56 - What is the best way to model a Collection inside of a Model?
        this.get("seqCollection").containingModel = this;  // Reference to parent model for this collection

        // this is where changes to gap scores and blosum choices are picked up
        this.listenTo(this, "change", function () {
            // console.log ("something in per protein align settings changed so realign all prot seqs", this.changed);
            // change to displayLabel doesn't affect alignment so ignore if just this has changed
            if (!(this.hasChanged("displayLabel") && d3.keys(this.changedAttributes()).length === 1)) {
                this.get("seqCollection").forEach(function (model) {
                    model.align();
                });
            }
        });

        // if the alignStr between a refAlignment and compAlignment has changed then declare a non-trivial change
        this.listenTo(this.get("seqCollection"), "change:alignStr", function (seqModel) {
            //console.log ("collection catching one of its model's alignStr changing", arguments);
            this.trigger("nonTrivialAlignmentChange", seqModel);
        });

        // redo sequence name labels if protein metadata updates names
        this.listenTo(window.vent, "proteinMetadataUpdated", function (metaMetaData) {
            const columns = metaMetaData.columns;
            const interactors = metaMetaData.items;
            if (!columns || columns.indexOf("name") >= 0) {
                const interactor = interactors.get(this.get("id"));
                if (interactor) {
                    this.set("displayLabel", interactor.name.replace("_", " "));
                }
            }
        });

        return this;
    }

    /**
     * Aligns sequences without storing results in SeqCollection.
     * Delegates to alignWithoutStoringWithSettings with current settings. Used for testing alignments.
     * @param {Array<string>} compSeqArray - Array of comparison sequences to align
     * @param {Object} [tempSemiLocal] - Temporary alignment mode: {local: boolean, semiLocal: boolean}
     * @returns {Array<Object>} Array of alignment results with bitScore, eScore, avgBitScore
     */
    alignWithoutStoring(compSeqArray, tempSemiLocal) {
        return this.alignWithoutStoringWithSettings(compSeqArray, tempSemiLocal, this.getSettings());
    }

    /**
     * Aligns sequences with specified settings without storing results.
     * Runs Gotoh algorithm for each sequence, calculates bit scores, E-scores, average bit scores.
     * Uses alignment window if reference sequence exceeds maxAlignWindow. Supports local/semi-local modes.
     * @param {Array<string>} compSeqArray - Array of comparison sequences
     * @param {Object} [tempSemiLocal] - {local: boolean, semiLocal: boolean}
     * @param {Object} settings - Alignment settings from getSettings()
     * @returns {Array<Object>} Alignment results with res (raw score, positions, CIGAR), bitScore, eScore, avgBitScore
     */
    alignWithoutStoringWithSettings(compSeqArray, tempSemiLocal, settings) {
        const alignWindowSize = (settings.refSeq.length > settings.maxAlignWindow ? settings.maxAlignWindow : undefined);
        const localAlign = (tempSemiLocal && tempSemiLocal.local);
        const semiLocalAlign = (tempSemiLocal && tempSemiLocal.semiLocal);

        const fullResults = compSeqArray.map(function (cSeq) {
            const bioseqResults = settings.aligner.align(cSeq, settings.refSeq, settings.scoringSystem, !!localAlign, !!semiLocalAlign, alignWindowSize);
            bioseqResults.bitScore = this.getBitScore(bioseqResults.res[0], settings.scoringSystem.matrix);
            bioseqResults.eScore = this.alignmentSignificancy(bioseqResults.bitScore, settings.totalRefSeqLength, cSeq.length);
            bioseqResults.avgBitScore = this.averageBitScorePerResidue(bioseqResults.bitScore, settings.totalRefSeqLength, cSeq.length);
            //console.log (this.id, bioseqResults.bitScore, settings.totalRefSeqLength, cSeq.length, bioseqResults.eScore, bioseqResults.avgBitScore);
            return bioseqResults;
        }, this);

        return fullResults;
    }

    /**
     * Converts raw alignment score to bit score using Karlin-Altschul statistics.
     * Formula: bitScore = (lambda * rawScore - ln(K)) / ln(2).
     * Uses lambda and K from BLOSUM matrix if available, otherwise defaults (lambda=0.254, K=0.225042).
     * @param {number} rawScore - Raw alignment score from Gotoh algorithm
     * @param {Object} [blosumData] - BLOSUM matrix data with lambda and K parameters
     * @returns {number} Bit score
     */
    getBitScore(rawScore, blosumData) {
        const lambda = (blosumData ? blosumData.lambda : 0.254) || 0.254;
        const K = (blosumData ? blosumData.K : 0.225042) || 0.225042;
        const bitScore = ((lambda * rawScore) - Math.log(K)) / Math.LN2;
        return bitScore;
    }

    /**
     * Calculates E-score (expected number of alignments with this score or better by chance).
     * Formula: E = dbLength * seqLength * 2^(-bitScore).
     * Lower E-scores indicate more significant alignments.
     * @param {number} bitScore - Bit score from getBitScore
     * @param {number} dbLength - Total length of all reference sequences (database size)
     * @param {number} seqLength - Length of comparison sequence
     * @returns {number} E-score (expectation value)
     */
    alignmentSignificancy(bitScore, dbLength, seqLength) {
        const exp = Math.pow(2, -bitScore);
        return (dbLength || 100) * seqLength * exp;	// escore
    }

    /**
     * Calculates average bit score per residue.
     * Normalizes bit score by sequence length for comparing alignments of different lengths.
     * @param {number} bitScore - Bit score
     * @param {number} dbLength - Database length (unused)
     * @param {number} seqLength - Sequence length
     * @returns {number} Average bit score per residue
     */
    averageBitScorePerResidue(bitScore, dbLength, seqLength) {
        return bitScore / seqLength;
    }

    /**
     * Gets current alignment settings as object for passing to alignment algorithm.
     * Extracts scoreMatrix attributes (if Backbone Model), builds scoringSystem object,
     * includes refSeq, aligner function, maxAlignWindow, totalRefSeqLength from collection.
     * @returns {Object} Settings object with scoringSystem, refSeq, aligner, maxAlignWindow, totalRefSeqLength
     */
    getSettings() {
        let matrix = this.get("scoreMatrix");
        if (matrix) {
            matrix = matrix.attributes;
        } // matrix will be a Backbone Model

        const scoringSystem = {
            matrix: matrix,
            match: this.get("matchScore"),
            mis: this.get("misScore"),
            gapOpen: this.get("gapOpenScore"),
            gapExt: this.get("gapExtendScore"),
            gapAtStart: this.get("gapAtStartScore")
        };

        const refSeq = this.get("refSeq");
        const aligner = this.get("sequenceAligner");

        return {
            scoringSystem: scoringSystem,
            refSeq: refSeq,
            aligner: aligner,
            maxAlignWindow: this.get("maxAlignWindow"),
            totalRefSeqLength: this.collection.totalRefSeqLength
        };
    }

    /**
     * Gets sequence model by name/ID from seqCollection.
     * @param {string} seqName - Sequence name/ID (e.g., PDB code, "Canonical")
     * @returns {SeqModel} Sequence model or undefined if not found
     */
    getSequenceModel(seqName) {
        return this.get("seqCollection").get(seqName);
    }

    /**
     * Gets array of sequence models matching predicate function.
     * @param {Function} predicateFunc - Predicate function (model) => boolean
     * @returns {Array<SeqModel>} Array of matching sequence models
     */
    getSequenceModelsByPredicate(predicateFunc) {
        return this.get("seqCollection").filter(function (m) {
            return predicateFunc(m);
        });
    }

    // These following routines assume that 'index' passed in is 1-indexed, and the return value wanted will be 1-indexed too
    // if no compSeq will return undefined
    // will return NaN for out of bound indices
    mapToSearch(seqName, index) {
        const seqModel = this.getSequenceModel(seqName);
        return seqModel ? seqModel.mapToSearch(index) : undefined;
    }

    mapFromSearch(seqName, index) {
        const seqModel = this.getSequenceModel(seqName);
        return seqModel ? seqModel.mapFromSearch(index) : undefined;
    }

    bulkMapToSearch(seqName, indices) {
        const seqModel = this.getSequenceModel(seqName);
        return seqModel ? seqModel.bulkMapToSearch(indices) : undefined;
    }

    bulkMapFromSearch(seqName, indices) {
        const seqModel = this.getSequenceModel(seqName);
        return seqModel ? seqModel.bulkMapFromSearch(indices) : undefined;
    }

    rangeToSearch(seqName, index1, index2) {
        const seqModel = this.getSequenceModel(seqName);
        return seqModel.rangeToSearch(index1, index2);
    }

    // find the first and last residues in a sequence that map to existing residues in the search sequence (i.e aren't
    // opening or trailing gaps), and return these coordinates in terms of the search sequence
    getRangeAsSearchSeq(seqName) {
        const seqModel = this.getSequenceModel(seqName);
        return seqModel.getRangeAsSearchSeq();
    }

    // For a given sequence return a list of the sequential indices
    // i.e. as above but split for gaps
    blockify(seqName) {
        const seqModel = this.getSequenceModel(seqName);
        return seqModel.blockify();
    }


    getAlignedIndex(seqIndex, toSearchSeq, sequenceID, keepNegativeValue) {
        const seqModel = this.getSequenceModel(sequenceID);
        return seqModel.getAlignedIndex(seqIndex, toSearchSeq, keepNegativeValue);
    }


    addSequence(seqID, seq, otherSettingsObj) {
        this.get("seqCollection").add(
            [{
                id: seqID,
                compID: seqID,
                compSeq: seq,
                semiLocal: !!otherSettingsObj.semiLocal,
                local: !!otherSettingsObj.lLocal
            }]
        );
    }

    PDBAlignmentsAsFeatures(includeCanonical) {
        // get array of arrays = each sequence in the model can have a number of blocks
        const featuresPerSeq = this.get("seqCollection")
            .map(function (seqModel) {
                return seqModel.PDBAlignmentAsFeatures();
            }, this);

        // flatten this array and remove canonical sequences if requested
        return d3.merge(featuresPerSeq)
            .filter(function (alignFeature) {
                return includeCanonical || alignFeature.name !== "Canonical";
            });
    }
}

/**
 * Collection of ProtAlignModel instances (one per protein in search).
 * Provides bulk operations (add sequences to all proteins, remove sequences, get by predicate),
 * index mapping across all proteins, alignment feature extraction for circular/annotation views,
 * bulk alignment change notification. Calculates totalRefSeqLength for E-score normalization.
 * @class
 * @extends Backbone.Collection
 * @property {Function} model - ProtAlignModel constructor
 * @property {string|Function} comparator - Sort function for proteins
 * @property {Array<Object>} possibleComparators - Sort options (Name, No. of Aligned Sequences, Total Alignment Score)
 * @property {boolean} nonTrivialChange - Flag tracking if bulk alignment changes occurred
 * @property {number} totalRefSeqLength - Sum of all reference sequence lengths (for E-score calculation)
 */
export class ProtAlignCollection extends Backbone.Collection {
    constructor(options) {
        super(options);
        this.model = ProtAlignModel;
        this.comparator = "displayLabel";

        this.possibleComparators = [{
            label: "Name",
            compFunc: "displayLabel"
        },
        {
            label: "No. of Aligned Sequences",
            compFunc: function (m) {
                return m.get("seqCollection").length;
            },
            reverse: true
        },
        {
            label: "Total Alignment Score",
            compFunc: function (m) {
                return d3.sum(m.get("seqCollection").pluck("compAlignment").map(function (ca) {
                    return ca.score;
                }));
            },
            reverse: true
        }
        ];

        this.nonTrivialChange = undefined;
    }


    initialize() {
        this.listenTo(this, "nonTrivialAlignmentChange", function () {
            this.nonTrivialChange = true;
        });
    }


    addSequence(proteinID, seqID, seq, otherSettingsObj) {
        const model = this.get(proteinID);
        if (model) {
            //console.log ("entry", modelId, seqId, seq, otherSettingsObj);
            model.addSequence(seqID, seq, otherSettingsObj || {});
        }
        return this;
    }

    addNewProteins(proteinArray) {
        const decoysOut = filterOutDecoyInteractors(proteinArray);

        decoysOut.forEach(function (prot) {
            //console.log ("entry", entry);
            this.add([{
                id: prot.id,
                displayLabel: prot.name,//.replace("_", " "),
                refID: "Search",
                refSeq: prot.sequence,
            }]);
            if (prot.uniprot) {
                this.addSequence(prot.id, "Canonical", prot.uniprot.sequence);
            }
        }, this);

        const pluckRefSeq = this.pluck("refSeq");

        this.totalRefSeqLength = d3.sum(pluckRefSeq.map(function (refSeq) {
            return refSeq.length;
        }));
    }

    // Remove passed in sequenceModels from their parent collections (use in tandem with next function)
    // Easier than going down the protAlignCollection -> protModel -> seqCollection -> seqModel route
    removeSequences(sequenceModels) {
        sequenceModels.forEach(function (seqMod) {
            if (seqMod.collection) {
                seqMod.collection.remove(seqMod);
            }
        });
        return this;
    }

    // get sequenceModels by predicate function
    getSequencesByPredicate(predicateFunc) {
        const seqModels = [];
        this.each(function (protAlignModel) {
            seqModels.push.apply(seqModels, protAlignModel.getSequenceModelsByPredicate(predicateFunc));
        });
        return seqModels;
    }

    bulkAlignChangeFinished() {
        if (this.nonTrivialChange !== false) {
            this.trigger("bulkAlignChange", true);
            console.log("BULK ALIGN CHANGE");
            this.nonTrivialChange = false;
        }
    }

    // Moved here from NGLViewBB.js, convenience function to convert an index in a given align sequence in a given align model to the search sequence
    // (or vice versa)
    // TODO, need to check for decoys (protein has no alignment)
    // conversion here works to and from the seqIndex local to a chain
    // IMPORTANT: The following routine assumes that 'index' passed in is 1-indexed, and the return value wanted will be 1-indexed too
    getAlignedIndex(seqIndex, proteinID, toSearchSeq, sequenceID, keepNegativeValue) {
        const protAlignModel = this.get(proteinID);
        return protAlignModel ? protAlignModel.getAlignedIndex(seqIndex, toSearchSeq, sequenceID, keepNegativeValue) : seqIndex;   // this will be 1-indexed or null
    }

    getRangeAsSearchSeq(proteinID, sequenceID) {
        const protAlignModel = this.get(proteinID);
        return protAlignModel ? protAlignModel.getRangeAsSearchSeq(sequenceID) : [undefined, undefined];
    }

    getAlignmentsAsFeatures(protID, includeCanonical) {
        const protAlignModel = this.get(protID);
        return protAlignModel ? protAlignModel.PDBAlignmentsAsFeatures(includeCanonical) : [];
    }
}

// Model of sequence alignment settings for a protein (including the above collection as an attribute)
import Backbone from "backbone";

import {filterOutDecoyInteractors} from "../modelUtils";
import {GotohAligner} from "./bioseq32";
import {SeqCollection} from "./sequence-model-collection";
import d3 from "d3";

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

    alignWithoutStoring(compSeqArray, tempSemiLocal) {
        return this.alignWithoutStoringWithSettings(compSeqArray, tempSemiLocal, this.getSettings());
    }

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

    getBitScore(rawScore, blosumData) {
        const lambda = (blosumData ? blosumData.lambda : 0.254) || 0.254;
        const K = (blosumData ? blosumData.K : 0.225042) || 0.225042;
        const bitScore = ((lambda * rawScore) - Math.log(K)) / Math.LN2;
        return bitScore;
    }

    // E-Score
    alignmentSignificancy(bitScore, dbLength, seqLength) {
        const exp = Math.pow(2, -bitScore);
        return (dbLength || 100) * seqLength * exp;	// escore
    }

    averageBitScorePerResidue(bitScore, dbLength, seqLength) {
        return bitScore / seqLength;
    }

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

    getSequenceModel(seqName) {
        return this.get("seqCollection").get(seqName);
    }

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
            }, this)
        ;

        // flatten this array and remove canonical sequences if requested
        return d3.merge(featuresPerSeq)
            .filter(function (alignFeature) {
                return includeCanonical || alignFeature.name !== "Canonical";
            })
            ;
    }
}


// A collection of the above protein level models
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
                displayLabel: prot.name.replace("_", " "),
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

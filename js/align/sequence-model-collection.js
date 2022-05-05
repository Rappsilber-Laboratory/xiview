import * as _ from "underscore";

// Model for one sequence pairing
import Backbone from "backbone";

import {mergeContiguousFeatures} from "../modelUtils";

class SeqModel extends Backbone.Model {
    constructor(attributes, options) {
        super(attributes, options);//{
        //     defaults: {
        //         local: false,
        //         semiLocal: false,
        //     }
        // });
    }

    defaults() {
        return {
            local: false,
            semiLocal: false,
        };
    }

    align() {
        const fullResult = this.collection.containingModel.alignWithoutStoring(
            [this.get("compSeq")], {local: this.get("local"), semiLocal: this.get("semiLocal")}
        )[0];

        const refResult = {str: fullResult.fmt[1], label: this.collection.containingModel.get("refID")};

        const compResult = {
            str: fullResult.fmt[0],
            refStr: fullResult.fmt[1],
            convertToRef: fullResult.indx.qToTarget,
            convertFromRef: fullResult.indx.tToQuery,
            cigar: fullResult.res[2],
            score: fullResult.res[0],
            bitScore: fullResult.bitScore,
            eScore: fullResult.eScore,
            avgBitScore: fullResult.avgBitScore,
            label: this.get("compID"),
        };

        //console.log ("align results", refResult, compResult);
        // redundant looking alignStr variable is used so we can directly monitor changes in it with backbone rather than dig through compAlignment object
        this.set({
            refAlignment: refResult,
            compAlignment: compResult,
            alignStr: fullResult.fmt[0],
        });

        this.dirtyBlocks = true;    // do blockify results need recalculated from scratch when called?

        return this;
    }


    // These following routines assume that 'index' passed in is 1-indexed, and the return value wanted will be 1-indexed too
    // if no compSeq will return undefined
    // will return NaN for out of bound indices
    mapToSearch(index) {
        const compSeq = this.get("compAlignment");
        return compSeq ? compSeq.convertToRef [index - 1] + 1 : undefined;
    }

    mapFromSearch(index) {
        const compSeq = this.get("compAlignment");
        return compSeq ? compSeq.convertFromRef [index - 1] + 1 : undefined;
    }

    bulkMapToSearch(indices) {
        const compSeq = this.get("compAlignment");
        return compSeq ? indices.map(function (i) {
            return compSeq.convertToRef [i - 1] + 1;
        }) : undefined;
    }

    bulkMapFromSearch(indices) {
        const compSeq = this.get("compAlignment");
        return compSeq ? indices.map(function (i) {
            return compSeq.convertFromRef [i - 1] + 1;
        }) : undefined;
    }

    rangeToSearch(index1, index2) {
        let i1 = this.mapToSearch(index1);
        let i2 = this.mapToSearch(index2);
        const seqLength = this.get("compAlignment").convertFromRef.length;

        if ((i1 === 0 && i2 === 0) || (i1 <= -seqLength && i2 <= -seqLength)) {
            return null;	// both points outside (and same side) of sequence we attempted to match to
        }

        if (i1 <= 0) {
            i1 = -i1;
        }   // <= 0 indicates no equal index match, do the - to find nearest index
        if (i2 <= 0) {
            i2 = -i2;
        }   // <= 0 indicates no equal index match, do the - to find nearest index

        return [i1, i2];
    }

    // find the first and last residues in a sequence that map to existing residues in the search sequence (i.e aren't
    // opening or trailing gaps), and return these coordinates in terms of the search sequence
    getRangeAsSearchSeq() {
        const compSeq = this.get("compAlignment");
        const nonNegative = function (num) {
            return num >= 0;
        };
        // _.find gets value of first nonNegative element, but _.findLastIndex gets the index, so we have to then get the value
        const first = compSeq ? _.find(compSeq.convertToRef, nonNegative) + 1 : undefined;
        const index = compSeq ? _.findLastIndex(compSeq.convertToRef, nonNegative) : -1;
        const last = index >= 0 ? compSeq.convertToRef[index] + 1 : undefined;
        const refSeq = this.collection.containingModel.get("refSeq");
        const subSeq = first && last ? refSeq.substring(first - 1, last) : "";
        return {first: first, last: last, subSeq: subSeq};
    }

    // For a given sequence return a list of the sequential indices (i.e. returned in terms of search sequence, not PDB, indices)
    // i.e. as above but split for gaps
    blockify() {
        if (this.dirtyBlocks || this.dirtyBlocks === undefined) { // realigning this sequence makes dirtyBlocks true, so recalculate
            const seq = this.get("compAlignment");
            const index = seq.convertToRef;
            const blocks = [];
            let start = index[0];
            for (let n = 0; n < index.length - 1; n++) {
                if (Math.abs(index[n + 1] - index[n]) > 1) {  // if non-contiguous numbers i.e. a break
                    if (index[n] >= 0) {
                        blocks.push({begin: start + 1, end: index[n] + 1});
                    }
                    start = index[n + 1];
                }
            }
            blocks.push({begin: start + 1, end: _.last(index) + 1});

            this.blocks = mergeContiguousFeatures(blocks);
            this.dirtyBlocks = false;
        }

        return this.blocks;
    }


    getAlignedIndex(seqIndex, toSearchSeq, keepNegativeValue) {
        // seqLength attribution NOT wrong way round.
        // we use seqLength to determine whether a negative (no direct match) index is somewhere within the matched-to sequence or outside of it altogether
        // e.g. pairing sequences, search = ABCDEFGHI, uniprot = CDFG
        // cfr = [-1, -1, 0, 1, -2, 2, 3, -5, -5]
        // ctr = [2, 3, 5, 6]
        // when say going from 'E' in search to uniprot (fromSearch, cfr to ctr) , value for cfr index is -2, which is bigger than -4 (neg length of ctr) so value is within
        // when say going from 'H' in search to uniprot (fromSearch, cfr to ctr) , value for cfr index is -5, which is smaller than/equal to -4 (neg length of ctr) so value is outside
        const seqLength = this.get("compAlignment")[toSearchSeq ? "convertFromRef" : "convertToRef"].length;
        let alignPos = toSearchSeq ? this.mapToSearch(seqIndex) : this.mapFromSearch(seqIndex);
        //console.log (seqIndex, "->", alignPos, "toSearch: ", toSearchSeq, seqLength);
        // if alignPos == 0 then before seq, if alignpos <== -seqlen then after seq
        //console.log (pdbChainSeqId, "seqlen", seqLength);
        if (alignPos === 0 || alignPos <= -seqLength) { // returned alignment is outside (before or after) the alignment target
            alignPos = null;    // null can be added / subtracted to without NaNs, which undefined causes
        } else if (alignPos < 0 && !keepNegativeValue) {
            alignPos = -alignPos;
        }   // otherwise < 0 indicates no equal index match, but is within the target, do the - to find nearest index
        return alignPos;
    }

    PDBAlignmentAsFeatures() {
        const alignment = this.get("compAlignment");
        const blocks = this.blockify();
        const blockFeatures = blocks.slice().map(function (block) {
            block.start = block.begin;
            block.name = alignment.label;
            block.protID = this.collection.containingModel.id;
            block.id = this.collection.containingModel.id + " " + alignment.label;
            block.category = "Alignment";
            block.type = "PDB aligned region";
            //block.alignmentID = this.get("compID")   // not needed if indices already in search index terms (which blockify results are)
            return block;
        }, this);

        //console.log ("BF", blockFeatures);
        return blockFeatures;
        /*
        return [{
            begin: 1,
            start: 1, //todo - why begin and start
            end: alignment.convertToRef.length,
            name: alignment.label,
            protID: this.collection.containingModel.id,
            id: this.collection.containingModel.id+" "+alignment.label,
            category: "Alignment",
            type: "PDB aligned region",
            alignmentID: this.get("compID")   // not needed if indices already in search index terms
        }];
        */
    }
}


// Collection of multiple single sequence pairing models from above
export class SeqCollection extends Backbone.Collection {
    constructor(attributes, options) {
        super(attributes, options);
        this.model = SeqModel;
    }


    initialize() {
        this.listenTo(this, "add", function (newSequenceModel) {
            //~ console.log ("new sequence added. align it.", arguments);
            //this.currentlyAddingModel = newSequenceModel;
            newSequenceModel.align();
            //this.currentlyAddingModel = null;
        });
        return this;
    }
}

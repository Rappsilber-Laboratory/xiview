/**
 * @fileoverview Model utility functions for xiVIEW application.
 * Contains helper functions for working with matches, crosslinks, proteins, sequences,
 * metadata, and various data transformations.
 */

import * as _ from "underscore";
import $ from "jquery";
import * as d3 from "d3";
import {octree as d3octree} from "../vendor/d3-octree";
import {commonRegexes, xilog} from "./utils";
import vent from "./vent";

/**
 * Separates match scores into arrays based on whether they are decoys or not.
 * Used by network frame for setting up minigram.
 * @param {Object[]} matchesArr - Array of match objects
 * @returns {Array[]} Array containing two arrays: [non-decoy scores, decoy scores]
 */
export function flattenMatches(matchesArr) {
    const arrs = [
        [],
        []
    ];
    const matchesLen = matchesArr.length;
    for (let m = 0; m < matchesLen; ++m) {
        const match = matchesArr[m];
        arrs[match.isDecoy() ? 1 : 0].push(match.score());
    }
    return arrs;
}

/**
 * Gets the min/max score range from an array of matches.
 * Optionally floors the minimum and ceils the maximum to integers.
 * Used by network frame.
 * @param {Object[]} matches - Array of match objects with score() method
 * @param {boolean} integerise - Whether to floor/ceil the extent to integers
 * @returns {number[]} [min, max] extent array
 */
export function matchScoreRange(matches, integerise) {
    let extent = d3.extent(matches, function (m) {
        return m.score();
    });
    if (integerise) {
        extent = extent.map(function (val, i) {
            return val !== undefined ? Math[i === 0 ? "floor" : "ceil"](val) : val;
            //return Math[i === 0 ? "ceil" : "floor"](val + (i === 0 ? -1 : 1));
        });
    }
    return extent;
}

/**
 * Gets the amino acid residue type at a given sequence index in a protein.
 * Optionally applies a sequence alignment function to transform the index.
 * Used here and in circle view.
 * @param {Object} protein - Protein object with sequence property
 * @param {number} seqIndex - 1-indexed position in the sequence
 * @param {Function} [seqAlignFunc] - Optional function to transform seqIndex
 * @returns {string} Single-letter amino acid code
 */
export function getResidueType(protein, seqIndex, seqAlignFunc) {
    // Some sequence alignment stuff can be done if you pass in a func
    seqIndex = seqAlignFunc ? seqAlignFunc(seqIndex) : seqIndex;
    // seq is 0-indexed, but seqIndex is 1-indexed so -1
    return protein.sequence[seqIndex - 1];
}

/**
 * Gets the residue type from either the 'from' or 'to' end of a crosslink.
 * @param {Object} xlink - Crosslink object with fromProtein, toProtein, fromResidue, toResidue
 * @param {boolean} getTo - If true, get 'to' residue; if false, get 'from' residue
 * @param {Function} [seqAlignFunc] - Optional sequence alignment function
 * @returns {string} Single-letter amino acid code
 */
export function getDirectionalResidueType(xlink, getTo, seqAlignFunc) {
    return getResidueType(getTo ? xlink.toProtein : xlink.fromProtein, getTo ? xlink.toResidue : xlink.fromResidue, seqAlignFunc);
}

/**
 * Filters out decoy proteins/interactors from an array.
 * Used widely throughout the application.
 * @param {Object[]} interactorArr - Array of interactor objects with is_decoy property
 * @returns {Object[]} Filtered array containing only non-decoy interactors
 */
export function filterOutDecoyInteractors(interactorArr) {
    return interactorArr.filter(function (i) {
        return !i.is_decoy;
    });
}

/**
 * Returns the highest score among a crosslink's filtered matches.
 * Used by make-tooltip.
 * @param {Object} crosslink - Crosslink object with filteredMatches_pp array
 * @returns {number} Highest match score
 */
export function highestScore(crosslink) {
    return d3.max(crosslink.filteredMatches_pp.map(function (m) {
        return +m.match.score();
    }));
}

/**
 * Finds all crosslinks with residues falling within a rectangular region.
 * Used by matrix view for selecting crosslinks in a drawn rectangle.
 * @param {Function} convFunc - Conversion function that maps coordinates to protein/residue pairs
 * @param {Map} crosslinkMap - Map of crosslinks keyed by protein_residue pairs
 * @param {number} x1 - First x coordinate of rectangle
 * @param {number} y1 - First y coordinate of rectangle
 * @param {number} x2 - Second x coordinate of rectangle
 * @param {number} y2 - Second y coordinate of rectangle
 * @param {boolean} asymmetric - Whether to exclude symmetric pairs (e.g., same protein homodimers)
 * @returns {Object[]} Array of objects with {crosslink, x, y} properties
 */
export function findResiduesInSquare(convFunc, crosslinkMap, x1, y1, x2, y2, asymmetric) {
    const a = [];
    const xmin = Math.max(0, Math.round(Math.min(x1, x2)));
    const xmax = Math.round(Math.max(x1, x2));
    const ymin = Math.max(0, Math.round(Math.min(y1, y2)));
    const ymax = Math.round(Math.max(y1, y2));
    //console.log ("x", xmin, xmax, "y", ymin, ymax);

    for (let n = xmin; n <= xmax; n++) {
        const convn = convFunc(n, 0).convX;
        if (!isNaN(convn) && convn > 0) {
            for (let m = ymin; m <= ymax; m++) {
                const conv = convFunc(n, m);
                const convm = conv.convY;
                const excludeasym = asymmetric && (conv.proteinX === conv.proteinY) && (convn > convm);

                if (!isNaN(convm) && convm > 0 && !excludeasym) {
                    let k = conv.proteinX + "_" + convn + "-" + conv.proteinY + "_" + convm;
                    let crosslink = crosslinkMap.get(k);
                    if (!crosslink && (conv.proteinX === conv.proteinY)) {
                        k = conv.proteinY + "_" + convm + "-" + conv.proteinX + "_" + convn;
                        crosslink = crosslinkMap.get(k);
                    }
                    if (crosslink) {
                        a.push({
                            crosslink: crosslink,
                            x: n,
                            y: m
                        });
                    }
                }
            }
        }
    }
    return a;
}

/**
 * Mapping from 3-letter amino acid codes to 1-letter codes.
 * @type {Object.<string, string>}
 */
export const amino3to1Map = {
    "Ala": "A",
    "Asx": "B",
    "Cys": "C",
    "Asp": "D",
    "Glu": "E",
    "Phe": "F",
    "Gly": "G",
    "His": "H",
    "Ile": "I",
    "Lys": "K",
    "Leu": "L",
    "Met": "M",
    "Asn": "N",
    "Pro": "P",
    "Gln": "Q",
    "Arg": "R",
    "Ser": "S",
    "Thr": "T",
    "Val": "V",
    "Trp": "W",
    "Tyr": "Y",
    "Glx": "Z",
    "*": "*",
};

const aminoNameto1Map = {
    Alanine: "A",
    Arginine: "R",
    Asparagine: "N",
    Aspartate: "D",
    Cysteine: "C",
    Glutamate: "E",
    Glutamine: "Q",
    Glycine: "G",
    Histidine: "H",
    Isoleucine: "I",
    Leucine: "L",
    Lysine: "K",
    Methionine: "M",
    Phenylalanine: "F",
    Proline: "P",
    Selenocysteine: "U",
    Serine: "S",
    Threonine: "T",
    Tryptophan: "W",
    Tyrosine: "Y",
    Valine: "V",
    All: "*",
    _All: "X",
    C_Terminal: "CTERM",
    N_Terminal: "NTERM"
};

/**
 * Mapping from 1-letter amino acid codes to their monoisotopic masses in Daltons.
 * Used by download.js/getSSL().
 * @type {Object.<string, number>}
 */
export const amino1toMass = {
    "A": 71.03711,
    "R": 156.10111,
    "N": 114.04293,
    "D": 115.02694,
    "C": 103.00919,
    "E": 129.04259,
    "Q": 128.05858,
    "G": 57.02146,
    "H": 137.05891,
    "I": 113.08406,
    "L": 113.08406,
    "K": 128.09496,
    "M": 131.04049,
    "F": 147.06841,
    "P": 97.05276,
    "S": 87.03203,
    "T": 101.04768,
    "W": 186.07931,
    "Y": 163.06333,
    "V": 99.06841,
};

/**
 * Returns array of indices pointing to first occurrence of each sequence when duplicates exist.
 * @param {string[]} sequences - Array of sequence strings
 * @returns {(number|undefined)[]} Array where duplicates point to first occurrence index, uniques are undefined
 * @example
 * indexSameSequencesToFirstOccurrence(["CAT", "DOG", "CAT", "DOG"]) // returns [undefined, undefined, 0, 1]
 */
export function indexSameSequencesToFirstOccurrence(sequences) {
    return sequences.map(function (seq, i) {
        let val = undefined;
        for (let j = 0; j < i; j++) {
            if (seq === sequences[j]) {
                val = j;
                break;
            }
        }
        return val;
    });
}

/**
 * Filters out repeated sequences to avoid costly realignment calculations.
 * Returns unique sequences plus mapping information to restore full sequence list later.
 * Used by NGL utils.
 * @param {string[]} sequences - Array of potentially duplicate sequences
 * @returns {Object} Object with sameSeqIndices, uniqSeqs, uniqSeqIndices, uniqSeqReverseIndex
 */
export function filterRepeatedSequences(sequences) {
    // Filter out repeated sequences to avoid costly realignment calculation of the same sequences
    const sameSeqIndices = indexSameSequencesToFirstOccurrence(sequences);
    const uniqSeqs = sequences.filter(function (seq, i) {
        return sameSeqIndices[i] === undefined;
    }); // get unique sequences...
    const uniqSeqIndices = d3.range(0, sequences.length).filter(function (i) {
        return sameSeqIndices[i] === undefined;
    }); // ...and their original indices in 'seqs'...
    const uniqSeqReverseIndex = _.invert(uniqSeqIndices); // ...and a reverse mapping of their index in 'seqs' to their place in 'uniqSeqs'
    return {
        sameSeqIndices: sameSeqIndices,
        uniqSeqs: uniqSeqs,
        uniqSeqIndices: uniqSeqIndices,
        uniqSeqReverseIndex: uniqSeqReverseIndex
    };
}

/**
 * Reinflates a collapsed sequence match matrix back to full size using filtered sequence info.
 * Used by NGL utils to restore matrices after filtering repeated sequences.
 * @param {Object} matchMatrix - Matrix keyed by protein ID
 * @param {string[]} sequences - Full sequence array including duplicates
 * @param {Object} filteredSeqInfo - Info object from filterRepeatedSequences
 * @returns {Object} Reinflated match matrix
 */
export function reinflateSequenceMap(matchMatrix, sequences, filteredSeqInfo) {
    d3.keys(matchMatrix).forEach(function (protID) {
        const matchMatrixProt = matchMatrix[protID];
        matchMatrix[protID] = d3.range(0, sequences.length).map(function (i) {
            const sameSeqIndex = filteredSeqInfo.sameSeqIndices[i];
            const seqIndex = sameSeqIndex === undefined ? i : sameSeqIndex;
            const uniqSeqIndex = +filteredSeqInfo.uniqSeqReverseIndex[seqIndex]; // + 'cos invert above turns numbers into strings
            return matchMatrixProt[uniqSeqIndex];
        });
    });

    return matchMatrix;
}

/**
 * Pairs sequence objects with protein IDs based on best alignment scores.
 * Used by NGL utils.
 * @param {Object} matrix - Match matrix with protein IDs as keys
 * @param {Object[]} sequenceObjs - Array of sequence objects to pair
 * @returns {Object[]} Array of {id, seqObj} pairing objects
 */
export function matrixPairings(matrix, sequenceObjs) {
    xilog("MATRIX PAIRINGS", matrix, sequenceObjs);
    const entries = d3.entries(matrix);
    xilog("D3 ENTRIES", entries);
    const pairings = [];

    for (let n = 0; n < sequenceObjs.length; n++) {
        const max = {
            key: undefined,
            seqObj: undefined,
            bestScore: 1 //1e-25
        };
        const seqObj = sequenceObjs[n];
        entries.forEach(function (entry) {
            //var eScore = entry.value[n];
            const avgBitScore = entry.value[n];

            //if (eScore < max.eScore) { // lower eScore is better
            if (avgBitScore > max.bestScore) { // higher avgBitScore is better
                max.key = entry.key;
                max.seqObj = seqObj;
                max.bestScore = avgBitScore;
            }
        });
        if (max.key) {
            pairings.push({
                id: max.key,
                seqObj: max.seqObj
            });
            //console.log ("MAX SCORE", max);
        }
    }

    xilog("PAIRINGS", pairings);
    return pairings;
}

/**
 * Finds intersection of two object arrays using a comparison function.
 * @param {Object[]} a - First array of objects
 * @param {Object[]} b - Second array of objects
 * @param {Function} compFunc - Comparison function that extracts comparable value from objects
 * @returns {Object[]} Array of elements from b that match elements in a
 */
export function intersectObjectArrays(a, b, compFunc) {
    if (!_.isEmpty(a) && !_.isEmpty(b) && compFunc) {
        const map = d3.map(a, compFunc);
        const result = b.filter(function (elem) {
            return map.has(compFunc(elem));
        });
        return result;
    }
    return [];
}

/**
 * Extracts valid UniProt accession IDs from an interactor collection.
 * Filters out decoys and validates accessions against UniProt regex pattern.
 * Used by PDB file chooser and NGL utils.
 * @param {Map|Array} interactorCollection - Map or array of interactor objects
 * @returns {string[]} Array of valid UniProt accession IDs
 */
export function getLegalAccessionIDs(interactorCollection) {
    let ids = [];
    if (interactorCollection) {
        if (interactorCollection.length === undefined) {    // obj to array if necessary
            interactorCollection = Array.from(interactorCollection.values());
        }
        ids = _.pluck(filterOutDecoyInteractors(interactorCollection), "accession")
            .filter(function (accession) {
                return accession.match(commonRegexes.uniprotAccession);
            });
    }
    return ids;
}

/**
 * Creates a nested map structure by sub-indexing values by a specified property.
 * Used by NGL utils and NGL wrapper model.
 * @param {Object} mmap - Map to be sub-indexed
 * @param {string} subIndexingProperty - Property name to use for sub-indexing
 * @returns {Object} Nested map with sub-indexed values
 */
export function makeSubIndexedMap(mmap, subIndexingProperty) {
    const subIndexedMap = {};
    d3.entries(mmap).forEach(function (entry) {
        subIndexedMap[entry.key] = d3.nest()
            .key(function (d) {
                return d[subIndexingProperty];
            })
            .entries(entry.value);
    });
    return subIndexedMap;
}

/**
 * Gets crosslinker specificity information per linker from the CLMS model.
 * Returns default specificity if none defined.
 * Used by distogram view and search summary view.
 * @param {Object[]} searchArray - Array of search objects
 * @returns {Object} Crosslinker specificity object with name, searches, and linkables
 */
export function crosslinkerSpecificityPerLinker(searchArray) {
    return window.compositeModelInst.get("clmsModel").getCrosslinkerSpecificity() || {
        default: {
            name: "all",
            searches: new Set(_.pluck(searchArray, "id")),
            linkables: [new Set(["*"])]
        }
    };
}

/**
 * Returns array indices of sequence positions where amino acids match those in the residue set.
 * Used by NGL utils and distances calculation.
 * @param {string} seq - Protein sequence string
 * @param {Set} residueSet - Set of amino acid letters to match
 * @param {boolean} all - If true, return all indices; if false, only matching ones
 * @returns {number[]} Array of indices (0-indexed to the sequence array)
 */
export function filterSequenceByResidueSet(seq, residueSet, all) {
    const resIndices = all ? d3.range(0, seq.length) : [];
    if (!all) {
        for (let m = 0; m < seq.length; m++) {
            if (residueSet.has(seq[m])) {
                resIndices.push(m);
            }
        }
    }
    return resIndices;
}


function makeMultiKeyProteinMap(clmsModel) {
    const protMap = d3.map();
    clmsModel.getProteinsMap().forEach(function (value, key) {
        if (!value.is_decoy) {
            protMap.set(value.accession, key);
            protMap.set(value.name, key);
            protMap.set(value.id, key);
        }
    });
    return protMap;
}

function parseProteinID(protMap, pid) {
    const parts = pid.split("|");
    let pkey;
    parts.forEach(function (part) {
        pkey = pkey || protMap.get(part);
    });
    return pkey;
}

//metadatafilechooser, STRINGfilechooser
/**
 * Updates crosslink metadata from a CSV/TSV file.
 * Parses metadata file and assigns metadata to matching crosslinks in the CLMS model.
 * @param {string} metaDataFileContents - CSV/TSV file contents with crosslink metadata
 * @param {Object} clmsModel - The CLMS model to update
 * @returns {void}
 */
export function updateLinkMetadata(metaDataFileContents, clmsModel) {
    const crosslinks = clmsModel.getCrosslinks();
    const crosslinksArr = Array.from(crosslinks.values());
    const protMap = makeMultiKeyProteinMap(clmsModel);
    const crosslinksByProteinPairing = crosslinkCountPerProteinPairing(crosslinksArr);

    let first = true;
    let columns = [];
    const columnTypes = {};
    const dontStoreArray = ["linkID", "LinkID", "Protein 1", "SeqPos 1", "Protein 2", "SeqPos 2", "Protein1", "Protein2", "SeqPos1", "SeqPos2"];
    const dontStoreSet = d3.set(dontStoreArray);

    function getValueN(ref, n, d) {
        return d[ref + " " + n] || d[ref + n];
    }

    function parseProteinID2(i, d) {
        const p = getValueN("Protein", i, d) || "";
        return parseProteinID(protMap, p);
    }

    const matchedCrossLinks = [];
    let ppiCount = 0;

    d3.csv.parse(metaDataFileContents, function (d) {
        const linkID = d.linkID || d.LinkID;
        let singleCrossLink = crosslinks.get(linkID);
        let rowCrossLinkArr;

        // Maybe need to generate key from several columns
        let pkey1, pkey2;
        if (!singleCrossLink) {
            pkey1 = parseProteinID2(1, d);
            pkey2 = parseProteinID2(2, d);
            const spos1 = getValueN("SeqPos", 1, d);
            const spos2 = getValueN("SeqPos", 2, d);
            const linkIDA = pkey1 + "_" + spos1 + "-" + pkey2 + "_" + spos2;
            const linkIDB = pkey2 + "_" + spos2 + "-" + pkey1 + "_" + spos1;
            singleCrossLink = crosslinks.get(linkIDA) || crosslinks.get(linkIDB);

            //console.log ("spos", spos1, spos2, pkey1, pkey2, spos1 == null, spos2 == null);  //  "" != null?
            if (singleCrossLink == null && ((spos1 == null && spos2 == null) || (spos1 == "" && spos2 == ""))) {   // PPI
                // get crosslinks for this protein pairing (if any)
                const proteinPair = [pkey1, pkey2].sort();
                const proteinPairing = crosslinksByProteinPairing[proteinPair.join("-")];
                if (proteinPairing) {
                    rowCrossLinkArr = proteinPairing.crosslinks;
                }
            }
        }

        if (singleCrossLink) {    // single identifiable crosslink
            rowCrossLinkArr = [singleCrossLink];
        }

        if (rowCrossLinkArr && rowCrossLinkArr.length > 0) {
            ppiCount++;
            matchedCrossLinks.push.apply(matchedCrossLinks, rowCrossLinkArr);
            const keys = d3.keys(d);

            if (first) {
                columns = _.difference(keys, dontStoreArray);
                columns.forEach(function (column) {
                    columnTypes[column] = "numeric";
                });
                first = false;
            }

            keys.forEach(function (key) {
                let val = d[key];
                if (val && !dontStoreSet.has(key)) {
                    if (!isNaN(val)) {
                        val = +val;
                    } else {
                        columnTypes[key] = "alpha"; // at least one entry in the column is non-numeric
                    }
                    rowCrossLinkArr.forEach(function (cl) {
                        cl.setMeta(key, val);
                    });
                }
            });
        }
    });

    const matchedCrossLinkCount = matchedCrossLinks.length;

    // If any data types have been detected as non-numeric, go through the links and maked sure they're all non-numeric
    // or sorting etc will throw errors
    d3.entries(columnTypes)
        .filter(function (entry) {
            return entry.value === "alpha";
        })
        .forEach(function (entry) {
            matchedCrossLinks.forEach(function (matchedCrossLink) {
                const val = matchedCrossLink.getMeta(entry.key);
                if (val !== undefined) {
                    matchedCrossLink.setMeta(entry.key, val.toString());
                }
            });
        });
    const registry = clmsModel._crosslinkMetaRegistry || d3.set();
    columns.forEach(registry.add, registry);
    clmsModel._crosslinkMetaRegistry = registry;

    const result = {
        columns: columns,
        columnTypes: columnTypes,
        items: crosslinks,
        matchedItemCount: matchedCrossLinkCount,
        ppiCount: ppiCount
    };

    if (columns) {
        vent.trigger("linkMetadataUpdated", result, {source: "file"});
    }

    return result;
}

//metadatafilechoosers
/**
 * Updates protein metadata from a CSV/TSV file.
 * Parses metadata file and assigns metadata to matching proteins in the CLMS model.
 * @param {string} metaDataFileContents - CSV/TSV file contents with protein metadata
 * @param {Object} clmsModel - The CLMS model to update
 * @returns {void}
 */
export function updateProteinMetadata(metaDataFileContents, clmsModel) {
    const proteins = clmsModel.getProteinsMap();
    let first = true;
    let columns = [];
    // var dontStoreArray = ["proteinID", "Accession"].map(function(str) {
    //     return str.toLocaleLowerCase();
    // });
    // var dontStoreSet = d3.set(dontStoreArray);
    let matchedProteinCount = 0;

    const protMap = makeMultiKeyProteinMap(clmsModel);
    let groupsFound = false;

    d3.csv.parse(metaDataFileContents, function (d) {
        if (first) {
            const keys = d3.keys(d).map(function (key) {
                return key.toLocaleLowerCase();
            });
            columns = keys;//_.difference(keys, dontStoreArray);
            first = false;
        }

        const proteinIDValue = d.proteinID || d.ProteinID || d.Accession || d.accession;
        const proteinID = protMap.get(parseProteinID(protMap, proteinIDValue));
        if (proteinID !== undefined) {
            const protein = proteins.get(proteinID);

            if (protein) {
                matchedProteinCount++;
                protein.name = d.name || d.Name || protein.name;

                //protein.meta = protein.meta || {};
                //var meta = protein.meta;
                d3.entries(d).forEach(function (entry) {
                    const key = entry.key;
                    let val = entry.value;
                    const column = key.toLocaleLowerCase();
                    // if (!dontStoreSet.has(column) && column !== "name") {
                    if (column == "complex") {
                        groupsFound = true;
                    }
                    if (!isNaN(val)) {
                        val = +val;
                    }
                    protein.setMeta(column, val);
                    // }
                });
            }
        }
    });

    if (columns) {
        vent.trigger("proteinMetadataUpdated", {
            columns: columns,//_.difference (columns, ["name", "Name"]),
            items: proteins,
            matchedItemCount: matchedProteinCount
        }, {
            source: "file"
        });
    }

    // update groups
    if (groupsFound) {
        const groupMap = new Map();
        for (let participant of proteins.values()) {
            if (participant.meta && participant.meta.complex) {
                const groupMeta = participant.meta.complex;
                const groups = groupMeta.split(",");
                for (let group of groups) {
                    if (groupMap.get(group)) {
                        groupMap.get(group).add(participant.id);
                    } else {
                        const groupParticipants = new Set();
                        groupParticipants.add(participant.id);
                        groupMap.set(group, groupParticipants);
                    }
                }
            }
        }
        window.compositeModelInst.set("groups", groupMap);
        window.compositeModelInst.trigger("change:groups");
    }

}

//used by fdr.js
// objectArr can be crosslinks or protein interactors (or a mix of)
/**
 * Clears specified metadata fields from an array of objects.
 * @param {Object[]} objectArr - Array of objects to clear metadata from
 * @param {string[]} metaFields - Array of metadata field names to clear
 * @returns {void}
 */
export function clearObjectMetaData(objectArr, metaFields) {
    objectArr.forEach(function (obj) {
        if (obj.getMeta()) {
            metaFields.forEach(function (metaField) {
                if (obj.getMeta(metaField) !== undefined) {
                    obj.setMeta(metaField, undefined);
                }
            });
        }
    });
}

//metadatafilechoosers
/**
 * Updates user annotations metadata from a CSV/TSV file.
 * Creates annotation objects and adds them to proteins in the CLMS model.
 * @param {string} userAnnotationsFileContents - CSV/TSV file contents with user annotations
 * @param {Object} clmsModel - The CLMS model to update
 * @returns {void}
 */
export function updateUserAnnotationsMetadata(userAnnotationsFileContents, clmsModel) {
    const proteins = clmsModel.getProteinsMap();
    let first = true;
    // eslint-disable-next-line no-unused-vars
    let columns = []; // TODO - check this

    const protMap = makeMultiKeyProteinMap(clmsModel);
    const newAnnotations = [];
    const annotationMap = d3.map();
    const proteinSet = d3.set();

    d3.csv.parse(userAnnotationsFileContents, function (d) {
        if (first) {
            const keys = d3.keys(d).map(function (key) {
                return key.toLocaleLowerCase();
            });
            first = false;
            columns = keys;
        }

        const dl = {};
        d3.keys(d).forEach(function (key) {
            dl[key.toLocaleLowerCase()] = d[key];
        });

        const proteinID = protMap.get(parseProteinID(protMap, dl.proteinid));
        if (proteinID !== undefined) {
            const protein = proteins.get(proteinID);

            if (protein) {
                protein.userAnnotations = protein.userAnnotations || [];
                const newAnno = {
                    type: dl.annotname,
                    description: dl.description,
                    category: "User Defined",
                    begin: dl.startres,
                    end: dl.endres,
                    colour: dl.color || dl.colour
                };
                newAnnotations.push(newAnno);
                protein.userAnnotations.push(newAnno);
                if (!annotationMap.has(dl.annotname)) {
                    annotationMap.set(dl.annotname, {
                        category: "User Defined",
                        type: dl.annotname,
                        source: "Search", // these will be matched to the search sequence,
                        colour: dl.color || dl.colour, // default colour for this type - undefined if not declared
                    });
                }
                proteinSet.add(proteinID);
            }
        }
    });

    vent.trigger("userAnnotationsUpdated", {
        types: annotationMap.values(),
        columns: annotationMap.values(),
        items: newAnnotations,
        matchedItemCount: newAnnotations.length
    }, {
        source: "file"
    });
}

//used here, matrixview
/**
 * Counts crosslinks per protein pairing.
 * Creates a map of protein pairs to crosslink counts, optionally including linear (self) links.
 * @param {Object[]} crosslinkArr - Array of crosslink objects
 * @param {boolean} includeLinears - Whether to include linear/self links
 * @returns {Map} Map with protein pair keys and count values
 */
export function crosslinkCountPerProteinPairing(crosslinkArr, includeLinears) {
    const obj = {};
    const linearShim = {id: "*linear", name: "linear"};
    crosslinkArr.forEach(function (crosslink) {
        if (crosslink.toProtein || includeLinears) {
            const fromProtein = crosslink.fromProtein;
            const toProtein = crosslink.toProtein || linearShim;
            const proteinA = fromProtein.id > toProtein.id ? toProtein : fromProtein;
            const proteinB = toProtein.id >= fromProtein.id ? toProtein : fromProtein;
            const key = proteinA.id + "-" + proteinB.id;
            let pairing = obj[key];
            if (!pairing) {
                pairing = {
                    crosslinks: [],
                    fromProtein: proteinA,
                    toProtein: proteinB,
                    label: proteinA.name.replace("_", " ") + " - " + proteinB.name.replace("_", " ")
                };
                obj[key] = pairing;
            }
            pairing.crosslinks.push(crosslink);
        }
    });
    return obj;
}

//used widely
// merges array of ranges
// features should be pre-filtered to an individual protein and to an individual type
// this can be reused for any array containing elements with properties 'begin' and 'end'
/**
 * Merges contiguous features (annotations) that share the same properties.
 * Adjacent features with identical category, type, and description are combined.
 * @param {Object[]} features - Array of feature objects with begin, end, category, type, description
 * @returns {Object[]} Array of merged features
 */
export function mergeContiguousFeatures(features) {
    features.sort(function (f1, f2) {
        return +f1.begin - +f2.begin;
    });
    const mergedRanges = [];
    let furthestEnd, mergeBegin;
    features.forEach(function (f) {
        const b = +f.begin;
        const e = +f.end;

        if (furthestEnd === undefined) { // first feature, initialise mergeBegin and furthestEnd
            mergeBegin = b;
            furthestEnd = e;
        } else { // otherwise look for overlap with previous
            if (b > furthestEnd + 1) { // if a gap between beginning of this range and the maximum end value found so far
                mergedRanges.push({
                    begin: mergeBegin,
                    end: furthestEnd
                }); // then add the now finished old merged range
                mergeBegin = b; // and then set the beginning of a new merged range
            }
            furthestEnd = Math.max(furthestEnd, e);
        }
    });
    if (furthestEnd) {
        mergedRanges.push({
            begin: mergeBegin,
            end: furthestEnd
        }); // add hanging range
    }

    const merged = mergedRanges.length < features.length ? // if merged ranges less than original feature count
        mergedRanges.map(function (coords) { // make new features based on the new merged ranges
            return $.extend({}, features[0], coords); // features[0] is used to get other fields
        }) :
        features; // otherwise just use originals
    //console.log ("mergedFeatures", features, merged);
    return merged;
}

//nglutils / ngl-model-wrapper
// merges array of single numbers
// assumes vals are already sorted numerically (though each val is a string)
/**
 * Converts an array of consecutive numbers into range strings.
 * @param {number[]} vals - Array of numbers
 * @param {string} joinString - String to join ranges with (e.g., "-" or "–")
 * @returns {string[]} Array of range strings (e.g., ["1-5", "7", "9-12"])
 */
export function joinConsecutiveNumbersIntoRanges(vals, joinString) {
    joinString = joinString || "-";

    if (vals && vals.length > 1) {
        const newVals = [];
        let last = +vals[0],
            start = +vals[0],
            run = 1; // initialise variables to first value

        for (let n = 1; n < vals.length + 1; n++) { // note + 1
            // add extra loop iteration using MAX_SAFE_INTEGER as last value.
            // loop will thus detect non-consecutive numbers on last iteration and output the last proper value in some form.
            const v = (n < vals.length ? +vals[n] : Number.MAX_SAFE_INTEGER);
            if (v - last === 1) { // if consecutive to last number just increase the run length
                run++;
            } else { // but if not consecutive to last number...
                // add the previous numbers either as a sequence (if run > 1) or as a single value (last value was not part of a sequence itself)
                newVals.push(run > 1 ? start + joinString + last : last.toString());
                run = 1; // then reset the run and start variables to begin at current value
                start = v;
            }
            last = v; // make last value the current value for next iteration of loop
        }

        //xilog ("vals", vals, "joinedVals", newVals);
        vals = newVals;
    }
    return vals;
}

//nglutils, matrixview
/**
 * Calculates squared Euclidean distance between two 3D coordinates.
 * Returns squared distance to avoid expensive sqrt operation.
 * @param {number[]} coords1 - First coordinate [x, y, z]
 * @param {number[]} coords2 - Second coordinate [x, y, z]
 * @returns {number} Squared distance between coordinates
 */
export function getDistanceSquared(coords1, coords2) {
    let d2 = 0;
    for (let n = 0; n < coords1.length; n++) {
        const diff = coords1[n] - coords2[n];
        d2 += diff * diff;
    }
    return d2;
}

// nglutils / nglmodelwrapper
/**
 * Finds minimum distance between two sets of 3D points using octree spatial indexing.
 * Efficiently searches for closest point pairs, optionally filtering with ignore function.
 * @param {Object[]} points1 - First set of points
 * @param {Object[]} points2 - Second set of points
 * @param {Object} accessorObj - Object with x, y, z accessor functions
 * @param {number} maxDistance - Maximum distance to search (optimization parameter)
 * @param {Function} [ignoreFunc] - Optional function to filter out point pairs
 * @returns {Object} Object with minDist (distance) and closest point pair info
 */
export function getMinimumDistance(points1, points2, accessorObj, maxDistance, ignoreFunc) {

    accessorObj = accessorObj || {};
    const points1Bigger = points1.length > points2.length;

    const bigPointArr = points1Bigger ? points1 : points2;
    const smallPointArr = points1Bigger ? points2 : points1;
    const octree = d3octree();
    octree
        .x(accessorObj.x || octree.x())
        .y(accessorObj.y || octree.y())
        .z(accessorObj.z || octree.z())
        .addAll(bigPointArr);
    maxDistance = maxDistance || 200;

    const nearest = smallPointArr.map(function (point) {
        return octree.find(octree.x()(point), octree.y()(point), octree.z()(point), maxDistance, point, ignoreFunc);
    });
    const dist = smallPointArr.map(function (point, i) {
        return nearest[i] ? getDistanceSquared(point.coords, nearest[i].coords) : undefined;
    });

    return d3.zip(points1Bigger ? nearest : smallPointArr, points1Bigger ? smallPointArr : nearest, dist);
}

// matrixview, scatterplotview
/**
 * Performs radix sort on data array using a bucket function.
 * Efficient O(n) sorting for data with limited number of categories.
 * @param {number} categoryCount - Number of distinct categories/buckets
 * @param {Array} data - Array of data to sort
 * @param {Function} bucketFunction - Function that returns bucket index for each element
 * @returns {Array} Sorted array
 */
export function radixSort(categoryCount, data, bucketFunction) {
    const radixSortBuckets = Array.apply(null, Array(categoryCount)).map(function () {
        return [];
    });
    data.forEach(function (d) {
        const bucketIndex = bucketFunction(d);
        radixSortBuckets[bucketIndex].push(d);
    });
    //console.log ("buckets", radixSortBuckets);
    return d3.merge(radixSortBuckets);
}

// https://stackoverflow.com/questions/3710204/how-to-check-if-a-string-is-a-valid-json-string-in-javascript-without-using-try
function tryParseJSON(jsonString) {
    try {
        const o = JSON.parse(decodeURI(jsonString)); // decodeURI in case square brackets have been escaped in url transmission

        // Handle non-exception-throwing cases:
        // Neither JSON.parse(false) or JSON.parse(1234) throw errors, hence the type-checking,
        // but... JSON.parse(null) returns null, and typeof null === "object",
        // so we must check for that, too. Thankfully, null is falsey, so this suffices:
        if (o && typeof o === "object") {
            return o;
        }
    } catch (e) {
        //console.log(e); //yes, its throws errors here
    }

    return false;
}

//networkframe
/**
 * Parses URL query string into an object.
 * Converts "?key1=val1&key2=val2" into {key1: "val1", key2: "val2"}.
 * @param {string} str - Query string to parse (with or without leading "?")
 * @returns {Object} Object with key-value pairs from query string
 */
export function parseURLQueryString(str) {
    const urlChunkMap = {};
    str.split("&").forEach(function (part) {
        const keyValuePair = part.split("=");
        const val = keyValuePair[1];
        //console.log ("kvp", keyValuePair);
        const jsonVal = tryParseJSON(val);
        urlChunkMap[keyValuePair[0]] = val !== "" ? (Number.isNaN(Number(val)) ? (val == "true" ? true : (val == "false" ? false : (jsonVal ? jsonVal : val))) : Number(val)) : val;
    });
    //console.log ("ucm", urlChunkMap);
    return urlChunkMap;
}

//filtermodel, compositemodel
/**
 * Converts an object into URL query string key-value pairs.
 * Optionally adds a common prefix to all keys.
 * @param {Object} obj - Object to convert to query pairs
 * @param {string} [commonKeyPrefix] - Optional prefix for all keys
 * @returns {string[]} Array of "key=value" strings
 */
export function makeURLQueryPairs(obj, commonKeyPrefix) {
    const attrEntries = d3.entries(obj);
    const parts = attrEntries.map(function (attrEntry) {
        let val = attrEntry.value;
        if (typeof val === "boolean") {
            val = +val; // turn true/false to 1/0
        } else if (typeof val === "string") {
            // val = val;
        } else if (val === undefined) {
            val = "";
        } else {
            val = encodeURI(JSON.stringify(val));
        }
        return (commonKeyPrefix || "") + attrEntry.key + "=" + val;
    });
    return parts;
}

//nglview
/**
 * Calculates total length of all protein sequences.
 * @param {Object[]} interactors - Array of protein/interactor objects with size property
 * @returns {number} Sum of all protein sequence lengths
 */
export function totalProteinLength(interactors) {
    return d3.sum(interactors, function (d) {
        return d.size;
    });
}

//networkframe
/**
 * Gets search groups from the CLMS model.
 * Returns array of search group objects with their associated searches.
 * @param {Object} clmsModel - The CLMS model
 * @returns {Object[]} Array of search group objects
 */
export function getSearchGroups(clmsModel) {
    const searchArr = Array.from(clmsModel.getSearches().values());
    const uniqueGroups = _.uniq(_.pluck(searchArr, "group"));
    //console.log ("SSS", searchArr, uniqueGroups);
    uniqueGroups.sort(function (a, b) {
        const an = Number.parseFloat(a);
        const bn = Number.parseFloat(b);
        return !Number.isNaN(an) && !Number.isNaN(bn) ? an - bn : a.localeCompare(b);
    });
    return uniqueGroups;
}

/**
 * Mapping from 1-letter amino acid codes to 3-letter codes (inverse of amino3to1Map).
 * @type {Object.<string, string>}
 */
export const amino1to3Map = _.invert(amino3to1Map);

/**
 * Mapping from 1-letter amino acid codes to full amino acid names (inverse of aminoNameto1Map).
 * @type {Object.<string, string>}
 */
export const amino1toNameMap = _.invert(aminoNameto1Map);

d3.entries(amino3to1Map).forEach(function (entry) {
    amino3to1Map[entry.key.toUpperCase()] = entry.value;
});

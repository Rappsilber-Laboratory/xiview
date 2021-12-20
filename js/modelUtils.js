import * as _ from "underscore";
import * as $ from "jquery";
import * as d3 from "d3";
import {octree as d3octree} from "../vendor/d3-octree";
import {commonRegexes} from "./utils";

//used by networkframe for setting up minigram
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

//used by networkframe
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

// used here and in circleview
export function getResidueType(protein, seqIndex, seqAlignFunc) {
    // Some sequence alignment stuff can be done if you pass in a func
    seqIndex = seqAlignFunc ? seqAlignFunc(seqIndex) : seqIndex;
    // seq is 0-indexed, but seqIndex is 1-indexed so -1
    return protein.sequence[seqIndex - 1];
}

//used here
export function getDirectionalResidueType(xlink, getTo, seqAlignFunc) {
    return getResidueType(getTo ? xlink.toProtein : xlink.fromProtein, getTo ? xlink.toResidue : xlink.fromResidue, seqAlignFunc);
}

//used widely
export function filterOutDecoyInteractors(interactorArr) {
    return interactorArr.filter(function (i) {
        return !i.is_decoy;
    });
}

//used by make-tooltip
export function highestScore(crosslink) {
    return d3.max(crosslink.filteredMatches_pp.map(function (m) {
        return +m.match.score();
    }));
}

//used by matrixview
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

//used by download.js/getSSL()
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

// return array of indices of first occurrence of a sequence when encountering a repetition
// e.g. ["CAT", "DOG", "CAT", "DOG"] -> [undefined, undefined, 0, 1];
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

//use here, nglutils
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

//used by nglutils
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

//used by nglutils
export function matrixPairings(matrix, sequenceObjs) {
    const entries = d3.entries(matrix);
    const pairings = [];

    for (let n = 0; n < sequenceObjs.length; n++) {
        const max = {
            key: undefined,
            seqObj: undefined,
            bestScore: 2 //1e-25
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

    return pairings;
}

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

//used by pdbfilechooser, nglutils
// interactorCollection can be map or array
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

//used by pdbfilechooser, metadatafilechooser
export function loadUserFile(fileObj, successFunc, associatedData) {
    if (window.File && window.FileReader && window.FileList && window.Blob) {
        const reader = new FileReader();

        // Closure to capture the file information.
        reader.onload = (function () {
            return function (e) {
                successFunc(e.target.result, associatedData);
                // hack for https://stackoverflow.com/a/28274454
                const fileChooserInputs = document.getElementsByClassName("selectMetaDataFileButton");
                for (let fci of fileChooserInputs) {
                    fci.value = null;
                }
            };
        })(fileObj);

        // Read in the image file as a data URL.
        reader.readAsText(fileObj);
    }
}

//nglutils, ngl-wrapper-model
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

//distogramview, searchsummaryview
export function crosslinkerSpecificityPerLinker(searchArray) {
    return window.compositeModelInst.get("clmsModel").get("crosslinkerSpecificity") || {
        default: {
            name: "all",
            searches: new Set(_.pluck(searchArray, "id")),
            linkables: [new Set(["*"])]
        }
    };
}

//nglutils, distances
// return indices of sequence where letters match ones in the residue set. Index is to the array, not to any external factor
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
    clmsModel.get("participants").forEach(function (value, key) {
        protMap.set(value.accession, key);
        protMap.set(value.name, key);
        protMap.set(value.id, key);
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
export function updateLinkMetadata(metaDataFileContents, clmsModel) {
    const crosslinks = clmsModel.get("crosslinks");
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
    const registry = clmsModel.get("crosslinkMetaRegistry") || d3.set();
    columns.forEach(registry.add, registry);
    clmsModel.set("crosslinkMetaRegistry", registry);

    const result = {
        columns: columns,
        columnTypes: columnTypes,
        items: crosslinks,
        matchedItemCount: matchedCrossLinkCount,
        ppiCount: ppiCount
    };

    if (columns) {
        window.vent.trigger("linkMetadataUpdated", result, {source: "file"});
    }

    return result;
}

//metadatafilechoosers
export function updateProteinMetadata(metaDataFileContents, clmsModel) {
    const proteins = clmsModel.get("participants");
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
        window.vent.trigger("proteinMetadataUpdated", {
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
                const groups = groupMeta.split(',');
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
export function updateUserAnnotationsMetadata(userAnnotationsFileContents, clmsModel) {
    const proteins = clmsModel.get("participants");
    let first = true;
    let columns = [];

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

    window.vent.trigger("userAnnotationsUpdated", {
        types: annotationMap.values(),
        columns: annotationMap.values(),
        items: newAnnotations,
        matchedItemCount: newAnnotations.length
    }, {
        source: "file"
    });
}

//used here, matrixview
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
export function getDistanceSquared(coords1, coords2) {
    let d2 = 0;
    for (let n = 0; n < coords1.length; n++) {
        const diff = coords1[n] - coords2[n];
        d2 += diff * diff;
    }
    return d2;
}

// nglutils / nglmodelwrapper
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
export function totalProteinLength(interactors) {
    return d3.sum(interactors, function (d) {
        return d.size;
    });
}

//networkframe
export function getSearchGroups(clmsModel) {
    const searchArr = Array.from(clmsModel.get("searches").values());
    const uniqueGroups = _.uniq(_.pluck(searchArr, "group"));
    //console.log ("SSS", searchArr, uniqueGroups);
    uniqueGroups.sort(function (a, b) {
        const an = Number.parseFloat(a);
        const bn = Number.parseFloat(b);
        return !Number.isNaN(an) && !Number.isNaN(bn) ? an - bn : a.localeCompare(b);
    });
    return uniqueGroups;
}

export const amino1to3Map = _.invert(amino3to1Map);
export const amino1toNameMap = _.invert(aminoNameto1Map);

d3.entries(amino3to1Map).forEach(function (entry) {
    amino3to1Map[entry.key.toUpperCase()] = entry.value;
});

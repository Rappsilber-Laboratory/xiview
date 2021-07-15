import * as _ from 'underscore';
// import * as $ from 'jquery';
// require('d3-octree');

import {utils} from "./utils";
import {GoTerm} from "./views/go/goTerm";

export const modelUtils = {
    flattenMatches: function(matchesArr) {
        var arrs = [
            [],
            []
        ];
        var matchesLen = matchesArr.length;
        for (var m = 0; m < matchesLen; ++m) {
            var match = matchesArr[m];
            arrs[match.isDecoy() ? 1 : 0].push(match.score());
        }
        return arrs;
    },

    matchScoreRange: function(matches, integerise) {
        var extent = d3.extent (matches, function(m) { return m.score(); });
        if (integerise) {
            extent = extent.map(function(val, i) {
                return val !== undefined ? Math[i === 0 ? "floor" : "ceil"](val) : val;
                //return Math[i === 0 ? "ceil" : "floor"](val + (i === 0 ? -1 : 1));
            });
        }
        return extent;
    },

    getResidueType: function(protein, seqIndex, seqAlignFunc) {
        // Some sequence alignment stuff can be done if you pass in a func
        seqIndex = seqAlignFunc ? seqAlignFunc(seqIndex) : seqIndex;
        // seq is 0-indexed, but seqIndex is 1-indexed so -1
        return protein.sequence[seqIndex - 1];
    },

    getDirectionalResidueType: function(xlink, getTo, seqAlignFunc) {
        return modelUtils.getResidueType(getTo ? xlink.toProtein : xlink.fromProtein, getTo ? xlink.toResidue : xlink.fromResidue, seqAlignFunc);
    },

    filterOutDecoyInteractors: function (interactorArr) {
        return interactorArr.filter (function(i) {
            return !i.is_decoy;
        });
    },

    makeTooltipContents: {
        maxRows: 25,

        residueString: function(singleLetterCode) {
            return singleLetterCode + " (" + modelUtils.amino1to3Map[singleLetterCode] + ")";
        },

        formatDictionary: {
            formats: {distance: d3.format(".2f")},
            units: {distance: " Å"},
            unknownText: {distance : "Unknown"}
        },

        niceFormat: function (key, value) {
            var fd = modelUtils.makeTooltipContents.formatDictionary;
            var noFormat = function (v) { return v; };

            var format = fd.formats[key] || noFormat;
            var unit = fd.units[key] || "";
            var unknown = fd.unknownText[key] || "";

            return value !== undefined ? (format (value) + (unit || "")) : unknown;
        },

        link: function(xlink, extras) {
            var linear = xlink.isLinearLink();
            var mono = xlink.isMonoLink();
            var info = [
                ["From", xlink.fromProtein.name, xlink.fromResidue, modelUtils.makeTooltipContents.residueString(modelUtils.getDirectionalResidueType(xlink, false))],
                linear ? ["To", "Linear", "---", "---"] : mono ? ["To", "Monolink", "---", "---"]
                    : ["To", xlink.toProtein.name, xlink.toResidue, modelUtils.makeTooltipContents.residueString(modelUtils.getDirectionalResidueType(xlink, true))],
                ["Matches", xlink.filteredMatches_pp.length],
                ["Highest Score", modelUtils.highestScore(xlink)]
            ];

            var extraEntries = _.pairs (extras);    // turn {a:1, b:2} into [["a",1],["b",2]]
            info.push.apply (info, extraEntries);

            d3.entries(xlink.getMeta()).forEach(function(entry) {
                var val = entry.value;
                var key = entry.key.toLocaleLowerCase();
                if (val !== undefined && !_.isObject(val)) {
                    info.push ([key, modelUtils.makeTooltipContents.niceFormat (key, val)]);
                }
            });
            return info;
        },

        interactor: function(interactor) {
            var contents = [
                ["ID", interactor.id],
                ["Accession", interactor.accession],
                ["Size", interactor.size],
                ["Desc.", interactor.description]
            ];

            if (interactor.uniprot) {
                contents.push(["Keywords", interactor.uniprot.keywords]);
            }

            d3.entries(interactor.getMeta()).forEach(function(entry) {
                var val = entry.value;
                var key = entry.key.toLocaleLowerCase();
                if (val !== undefined && !_.isObject(val)) {
                    contents.push ([key, modelUtils.makeTooltipContents.niceFormat (key, val)]);
                }
            });

            return contents;
        },

        multilinks: function(xlinks, interactorId, residueIndex, extras) {
            var ttinfo = xlinks.map(function(xlink) {
                var linear = xlink.isLinearLink();
                var startIsTo = !linear && (xlink.toProtein.id === interactorId && xlink.toResidue === residueIndex);
                var residueCode = linear ? "---" : modelUtils.makeTooltipContents.residueString(modelUtils.getDirectionalResidueType(xlink, !startIsTo));
                if (startIsTo) {
                    return [xlink.fromProtein.name, xlink.fromResidue, residueCode, xlink.filteredMatches_pp.length];
                } else {
                    return [linear ? "Linear" : xlink.toProtein.name, linear ? "---" : xlink.toResidue, residueCode, xlink.filteredMatches_pp.length];
                }
            });

            var extraEntries = d3.entries(extras);
            extraEntries.forEach(function(extraEntry) {
                var key = extraEntry.key.toLocaleLowerCase();

                extraEntry.value.forEach(function(val, i) {
                    ttinfo[i].push (modelUtils.makeTooltipContents.niceFormat (key, val));
                });
            });

            var sortFields = [3, 0, 1]; // sort by matches, then protein name, then res index
            var sortDirs = [1, -1, -1];
            ttinfo.sort(function(a, b) {
                var diff = 0;
                for (var s = 0; s < sortFields.length && diff === 0; s++) {
                    var field = sortFields[s];
                    diff = (b[field] - a[field]) * sortDirs[s];
                    if (isNaN(diff)) {
                        diff = b[field].localeCompare(a[field]) * sortDirs[s];
                    }
                }
                return diff;
            });


            var headers = ["Protein", "Pos", "Residue", "Matches"];
            extraEntries.forEach(function(extraEntry) {
                headers.push(extraEntry.key);
            });

            ttinfo.unshift(headers);
            ttinfo.tableHasHeaders = true;
            var length = ttinfo.length;
            var limit = modelUtils.makeTooltipContents.maxRows;
            if (length > limit) {
                ttinfo = ttinfo.slice(0, limit);
                ttinfo.push(["+ " + (length - limit) + " More"]);
            }
            return ttinfo;
        },

        feature: function(feature) {
            var possFields = [
                ["description"],
                ["type"],
                ["category"],
                ["fstart", "start"],
                ["fend", "end"]
            ];
            var data = possFields
                .filter(function(field) {
                    return feature[field[0]] != undefined;
                })
                .map(function(field) {
                    return [field.length > 1 ? field[1] : field[0], feature[field[0]]];
                });
            return data;
        },

        linkList: function(linkList, extras) {
            var extraEntries = d3.entries(extras);
            var fromProtein, toProtein;

            var details = linkList.map(function(crosslink, i) {
                var from3LetterCode = modelUtils.makeTooltipContents.residueString(modelUtils.getDirectionalResidueType(crosslink, false));
                var to3LetterCode = modelUtils.makeTooltipContents.residueString(modelUtils.getDirectionalResidueType(crosslink, true));
                fromProtein = crosslink.fromProtein.name;
                toProtein = crosslink.toProtein.name;
                var row = [crosslink.fromResidue + " " + from3LetterCode, crosslink.toResidue + " " + to3LetterCode];
                extraEntries.forEach(function(entry) {
                    var key = entry.key.toLocaleLowerCase();
                    var val = entry.value[i];
                    row.push (modelUtils.makeTooltipContents.niceFormat (key, val));
                });
                return row;
            });
            if (details.length) {
                var header = [fromProtein.replace("_", " "), toProtein.replace("_", " ")];
                extraEntries.forEach(function(entry) {
                    header.push(entry.key);
                });
                details.unshift(header);
                details.tableHasHeaders = true;
            } else {
                details = null;
            }
            return details;
        },

        match: function(match) {
            return [
                ["Match ID", match.match.id],
            ];
        },

        goTerm: function(goTerm) {
            return [
                //["ID", goTerm.id],
                ["Name", goTerm.name],
                //["Namespace", goTerm.namespace],
                ["Definition", goTerm.def],
                // ["Synonym", goTerm.synomym],
                // ["is_a", Array.from(goTerm.is_a.values()).join(", ")],
                // ["intersection_of", Array.from(goTerm.intersection_of.values()).join(", ")],
                // ["relationship", Array.from(goTerm.relationship.values()).join(", ")],
                // ["interactors", goTerm.getInteractors(false).size]
            ];
        },

        complex: function(interactor) {
            var contents = [
                ["Complex", interactor.id],
              //  ["Members", Array.from(goTerm.relationship.values()).join(", ")]
                // ["Accession", interactor.accession],
                // ["Size", interactor.size],
                // ["Desc.", interactor.description]
            ];

            // d3.entries(interactor.getMeta()).forEach(function(entry) {
            //     var val = entry.value;
            //     var key = entry.key.toLocaleLowerCase();
            //     if (val !== undefined && !_.isObject(val)) {
            //         contents.push ([key, modelUtils.makeTooltipContents.niceFormat (key, val)]);
            //     }
            // });
            //
            // if (interactor.go) {
            //     var goTermsMap = window.compositeModelInst.get("go");
            //     var goTermsText = "";
            //     for (var goId of interactor.go) {
            //         var goTerm = goTermsMap.get(goId);
            //         goTermsText += goTerm.name + "<br>";
            //     }
            //     contents.push(["GO", goTermsText]);
            // }
            return contents;
        },
    },

    highestScore: function(crosslink) {
        return d3.max(crosslink.filteredMatches_pp.map(function(m) {
            return +m.match.score();
        }));
    },

    makeTooltipTitle: {
        link: function(linkCount) {
            return "Linked Residue Pair" + (linkCount > 1 ? "s" : "");
        },
        interactor: function(interactor) {
            return interactor.name.replace("_", " ");
        },
        residue: function(interactor, residueIndex, residueExtraInfo) {
            return interactor.name + ":" + residueIndex + "" + (residueExtraInfo ? residueExtraInfo : "") + " " +
                modelUtils.makeTooltipContents.residueString(modelUtils.getResidueType(interactor, residueIndex));
        },
        feature: function() {
            return "Feature";
        },
        linkList: function(linkCount) {
            return "Linked Residue Pair" + (linkCount > 1 ? "s" : "");
        },
        complex: function(interactor) {
            return interactor.name.replace("_", " ");
        },
    },

    findResiduesInSquare: function(convFunc, crosslinkMap, x1, y1, x2, y2, asymmetric) {
        var a = [];
        var xmin = Math.max(0, Math.round(Math.min(x1, x2)));
        var xmax = Math.round(Math.max(x1, x2));
        var ymin = Math.max(0, Math.round(Math.min(y1, y2)));
        var ymax = Math.round(Math.max(y1, y2));
        //console.log ("x", xmin, xmax, "y", ymin, ymax);

        for (var n = xmin; n <= xmax; n++) {
            var convn = convFunc(n, 0).convX;
            if (!isNaN(convn) && convn > 0) {
                for (var m = ymin; m <= ymax; m++) {
                    var conv = convFunc(n, m);
                    var convm = conv.convY;
                    var excludeasym = asymmetric && (conv.proteinX === conv.proteinY) && (convn > convm);

                    if (!isNaN(convm) && convm > 0 && !excludeasym) {
                        var k = conv.proteinX + "_" + convn + "-" + conv.proteinY + "_" + convm;
                        var crosslink = crosslinkMap.get(k);
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
    },

    amino3to1Map: {
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
    },

    aminoNameto1Map: {
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
    },

    amino1toMass: {
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
    },

    // return array of indices of first occurrence of a sequence when encountering a repetition
    // e.g. ["CAT", "DOG", "CAT", "DOG"] -> [undefined, undefined, 0, 1];
    indexSameSequencesToFirstOccurrence: function(sequences) {
        return sequences.map (function(seq, i) {
            var val = undefined;
            for (var j = 0; j < i; j++) {
                if (seq === sequences[j]) {
                    val = j;
                    break;
                }
            }
            return val;
        });
    },

    filterRepeatedSequences: function(sequences) {
        // Filter out repeated sequences to avoid costly realignment calculation of the same sequences
        var sameSeqIndices = modelUtils.indexSameSequencesToFirstOccurrence(sequences);
        var uniqSeqs = sequences.filter(function(seq, i) {
            return sameSeqIndices[i] === undefined;
        }); // get unique sequences...
        var uniqSeqIndices = d3.range(0, sequences.length).filter(function(i) {
            return sameSeqIndices[i] === undefined;
        }); // ...and their original indices in 'seqs'...
        var uniqSeqReverseIndex = _.invert(uniqSeqIndices); // ...and a reverse mapping of their index in 'seqs' to their place in 'uniqSeqs'
        return {
            sameSeqIndices: sameSeqIndices,
            uniqSeqs: uniqSeqs,
            uniqSeqIndices: uniqSeqIndices,
            uniqSeqReverseIndex: uniqSeqReverseIndex
        };
    },

    reinflateSequenceMap: function(matchMatrix, sequences, filteredSeqInfo) {
        d3.keys(matchMatrix).forEach(function(protID) {
            var matchMatrixProt = matchMatrix[protID];
            matchMatrix[protID] = d3.range(0, sequences.length).map(function(i) {
                var sameSeqIndex = filteredSeqInfo.sameSeqIndices[i];
                var seqIndex = sameSeqIndex === undefined ? i : sameSeqIndex;
                var uniqSeqIndex = +filteredSeqInfo.uniqSeqReverseIndex[seqIndex]; // + 'cos invert above turns numbers into strings
                return matchMatrixProt[uniqSeqIndex];
            });
        });

        return matchMatrix;
    },

    matrixPairings: function(matrix, sequenceObjs) {
        var entries = d3.entries(matrix);
        var pairings = [];

        for (var n = 0; n < sequenceObjs.length; n++) {
            var max = {
                key: undefined,
                seqObj: undefined,
                bestScore: 2 //1e-25
            };
            var seqObj = sequenceObjs[n];
            entries.forEach(function(entry) {
                //var eScore = entry.value[n];
                var avgBitScore = entry.value[n];

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
    },

    intersectObjectArrays: function(a, b, compFunc) {
        if (!_.isEmpty(a) && !_.isEmpty(b) && compFunc) {
            var map = d3.map(a, compFunc);
            var result = b.filter(function(elem) {
                return map.has(compFunc(elem));
            });
            return result;
        }
        return [];
    },

    // interactorCollection can be map or array
    getLegalAccessionIDs: function(interactorCollection) {
        var ids = [];
        if (interactorCollection) {
            if (interactorCollection.length === undefined) {    // obj to array if necessary
                interactorCollection = Array.from(interactorCollection.values());
            }
            ids = _.pluck (modelUtils.filterOutDecoyInteractors(interactorCollection), "accession")
                .filter(function(accession) {
                    return accession.match(utils.commonRegexes.uniprotAccession);
                })
            ;
        }
        return ids;
    },

    loadUserFile: function (fileObj, successFunc, associatedData) {
        if (window.File && window.FileReader && window.FileList && window.Blob) {
            var reader = new FileReader();

            // Closure to capture the file information.
            reader.onload = (function() {
                return function(e) {
                    successFunc(e.target.result, associatedData);
                    // hack for https://stackoverflow.com/a/28274454
                    const fileChooserInputs = document.getElementsByClassName('selectMetaDataFileButton');
                    for (let fci of fileChooserInputs) {
                        fci.value = null;
                    }
                };
            })(fileObj);

            // Read in the image file as a data URL.
            reader.readAsText(fileObj);
        }
    },


    makeSubIndexedMap: function(mmap, subIndexingProperty) {
        var subIndexedMap = {};
        d3.entries(mmap).forEach(function(entry) {
            subIndexedMap[entry.key] = d3.nest()
                .key(function(d) {
                    return d[subIndexingProperty];
                })
                .entries(entry.value);
        });
        return subIndexedMap;
    },

    crosslinkerSpecificityPerLinker: function (searchArray) {
        return window.compositeModelInst.get("clmsModel").get("crosslinkerSpecificity") || {
            default: {
                name: "all",
                searches: new Set(_.pluck (searchArray, "id")),
                linkables: [new Set(["*"])]
            }
        };
    },

    // return indices of sequence where letters match ones in the residue set. Index is to the array, not to any external factor
    filterSequenceByResidueSet: function(seq, residueSet, all) {
        var resIndices = all ? d3.range(0, seq.length) : [];
        if (!all) {
            for (var m = 0; m < seq.length; m++) {
                if (residueSet.has(seq[m])) {
                    resIndices.push(m);
                }
            }
        }
        return resIndices;
    },

    makeMultiKeyProteinMap: function(clmsModel) {
        var protMap = d3.map();
        clmsModel.get("participants").forEach (function(value, key) {
            protMap.set(value.accession, key);
            protMap.set(value.name, key);
            protMap.set(value.id, key);
        });
        return protMap;
    },

    parseProteinID: function(protMap, pid) {
        var parts = pid.split("|");
        var pkey;
        parts.forEach (function (part) {
            pkey = pkey || protMap.get(part);
        });
        return pkey;
    },

    updateLinkMetadata: function (metaDataFileContents, clmsModel) {
        var crosslinks = clmsModel.get("crosslinks");
        var crosslinksArr = Array.from (crosslinks.values());
        var protMap = modelUtils.makeMultiKeyProteinMap(clmsModel);
        var crosslinksByProteinPairing = modelUtils.crosslinkCountPerProteinPairing (crosslinksArr);

        var first = true;
        var columns = [];
        var columnTypes = {};
        var dontStoreArray = ["linkID", "LinkID", "Protein 1", "SeqPos 1", "Protein 2", "SeqPos 2", "Protein1", "Protein2", "SeqPos1", "SeqPos2"];
        var dontStoreSet = d3.set(dontStoreArray);

        function getValueN(ref, n, d) {
            return d[ref + " " + n] || d[ref + n];
        }

        function parseProteinID2(i, d) {
            var p = getValueN("Protein", i, d) || "";
            return modelUtils.parseProteinID(protMap, p);
        }

        var matchedCrossLinks = [];
        var ppiCount = 0;

        d3.csv.parse(metaDataFileContents, function(d) {
            var linkID = d.linkID || d.LinkID;
            var singleCrossLink = crosslinks.get(linkID);
            var rowCrossLinkArr;

            // Maybe need to generate key from several columns
            var pkey1, pkey2;
            if (!singleCrossLink) {
                pkey1 = parseProteinID2(1, d);
                pkey2 = parseProteinID2(2, d);
                var spos1 = getValueN("SeqPos", 1, d);
                var spos2 = getValueN("SeqPos", 2, d);
                var linkIDA = pkey1 + "_" + spos1 + "-" + pkey2 + "_" + spos2;
                var linkIDB = pkey2 + "_" + spos2 + "-" + pkey1 + "_" + spos1;
                singleCrossLink = crosslinks.get(linkIDA) || crosslinks.get(linkIDB);

                //console.log ("spos", spos1, spos2, pkey1, pkey2, spos1 == null, spos2 == null);  //  "" != null?
                if (singleCrossLink == null && ((spos1 == null && spos2 == null) || (spos1 == "" && spos2 == ""))) {   // PPI
                    // get crosslinks for this protein pairing (if any)
                    var proteinPair = [pkey1, pkey2].sort();
                    var proteinPairing = crosslinksByProteinPairing[proteinPair.join("-")];
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
                matchedCrossLinks.push.apply (matchedCrossLinks, rowCrossLinkArr);
                var keys = d3.keys(d);

                if (first) {
                    columns = _.difference(keys, dontStoreArray);
                    columns.forEach(function(column) {
                        columnTypes[column] = "numeric";
                    });
                    first = false;
                }

                keys.forEach(function(key) {
                    var val = d[key];
                    if (val && !dontStoreSet.has(key)) {
                        if (!isNaN(val)) {
                            val = +val;
                        } else {
                            columnTypes[key] = "alpha"; // at least one entry in the column is non-numeric
                        }
                        rowCrossLinkArr.forEach (function (cl) {
                            cl.setMeta (key, val);
                        });
                    }
                });
            }
        });

        var matchedCrossLinkCount = matchedCrossLinks.length;

        // If any data types have been detected as non-numeric, go through the links and maked sure they're all non-numeric
        // or sorting etc will throw errors
        d3.entries(columnTypes)
            .filter(function(entry) {
                return entry.value === "alpha";
            })
            .forEach(function(entry) {
                matchedCrossLinks.forEach(function(matchedCrossLink) {
                    var val = matchedCrossLink.getMeta(entry.key);
                    if (val !== undefined) {
                        matchedCrossLink.setMeta(entry.key, val.toString());
                    }
                });
            })
        ;

        var registry = clmsModel.get("crosslinkMetaRegistry") || d3.set();
        columns.forEach (registry.add, registry);
        clmsModel.set("crosslinkMetaRegistry", registry);

        var result = {
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
    },

    updateProteinMetadata: function(metaDataFileContents, clmsModel) {
        var proteins = clmsModel.get("participants");
        var first = true;
        var columns = [];
        // var dontStoreArray = ["proteinID", "Accession"].map(function(str) {
        //     return str.toLocaleLowerCase();
        // });
        // var dontStoreSet = d3.set(dontStoreArray);
        var matchedProteinCount = 0;

        var protMap = modelUtils.makeMultiKeyProteinMap(clmsModel);
        let groupsFound = false;

        d3.csv.parse(metaDataFileContents, function(d) {
            if (first) {
                var keys = d3.keys(d).map(function(key) {
                    return key.toLocaleLowerCase();
                });
                columns = keys;//_.difference(keys, dontStoreArray);
                first = false;
            }

            var proteinIDValue = d.proteinID || d.ProteinID || d.Accession || d.accession;
            var proteinID = protMap.get(modelUtils.parseProteinID(protMap, proteinIDValue));
            if (proteinID !== undefined) {
                var protein = proteins.get(proteinID);

                if (protein) {
                    matchedProteinCount++;
                    protein.name = d.name || d.Name || protein.name;

                    //protein.meta = protein.meta || {};
                    //var meta = protein.meta;
                    d3.entries(d).forEach(function(entry) {
                        var key = entry.key;
                        var val = entry.value;
                        var column = key.toLocaleLowerCase();
                        // if (!dontStoreSet.has(column) && column !== "name") {
                            if (column == "complex") {
                                groupsFound = true;
                            }
                            if (!isNaN(val)) {
                                val = +val;
                            }
                            protein.setMeta (column, val);
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
                    let group = participant.meta.complex;
                    if (groupMap.get(group)) {
                        groupMap.get(group).add(participant.id);
                    } else {
                        const groupParticipants = new Set();
                        groupParticipants.add(participant.id);
                        groupMap.set(group, groupParticipants)
                    }
                }
            }
            window.compositeModelInst.set("groups", groupMap);
            window.compositeModelInst.trigger("change:groups");
        }

    },

    // objectArr can be crosslinks or protein interactors (or a mix of)
    clearObjectMetaData: function (objectArr, metaFields) {
        objectArr.forEach (function (obj) {
            if (obj.getMeta()) {
                metaFields.forEach(function(metaField) {
                    if (obj.getMeta(metaField) !== undefined) {
                        obj.setMeta(metaField, undefined);
                    }
                });
            }
        });
    },

    updateUserAnnotationsMetadata: function(userAnnotationsFileContents, clmsModel) {
        var proteins = clmsModel.get("participants");
        var first = true;
        var columns = [];

        var protMap = modelUtils.makeMultiKeyProteinMap(clmsModel);
        var newAnnotations = [];
        var annotationMap = d3.map();
        var proteinSet = d3.set();

        d3.csv.parse(userAnnotationsFileContents, function(d) {
            if (first) {
                var keys = d3.keys(d).map(function(key) {
                    return key.toLocaleLowerCase();
                });
                first = false;
                columns = keys;
            }

            var dl = {};
            d3.keys(d).forEach(function(key) {
                dl[key.toLocaleLowerCase()] = d[key];
            });

            var proteinID = protMap.get(modelUtils.parseProteinID(protMap, dl.proteinid));
            if (proteinID !== undefined) {
                var protein = proteins.get(proteinID);

                if (protein) {
                    protein.userAnnotations = protein.userAnnotations || [];
                    var newAnno = {
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
    },

/*
    convertGO_OBOtoJson: function (url) {
        d3.text (url, function(error, txt) {
            if (error) {
                console.log("error", error, "for", url, arguments);
            } else {
                go = modelUtils.loadGOAnnotations (txt);  // temp store until CLMS model is built
                jsongo = modelUtils.jsonifyGoMap (go);
            }
        });
    },
*/

    loadGOAnnotations: function (txt) {
        console.log ("parsing go obo");
        var z = performance.now();
        var go = new Map();
        //var lines = txt.split('\n');
        var term;
        var i = 0, l = 0;
        var first = true;

        //for (var l = 0; l < lines.length; l++) {
        while (i !== 0 || first) {
            first = false;
            var endi = txt.indexOf("\n", i);
            var line = txt.slice(i, endi !== -1 ? endi : undefined);
            //not having ':' in go ids, so valid html id later, maybe a mistake, (do trim here to get rid of '/r's too - mjg)
            line = line.trim().replace (/:/g, '');
            //var line = lines[l].trim().replace (/:/g, '');

            if (line) {
                if (line === "[Term]" || line === "[Typedef]") {
                    if (term) {
                        go.set(term.id, term);
                    }
                    term = new GoTerm();
                } else if (term) {
                    //var parts = line.split(" ");  // speed up by avoiding split if humanly possible as free text lines are space heavy
                    var tag = line.slice (0, line.indexOf(" "));
                    var value = line.slice (tag.length + 1);
                    if (tag === "is_a") {
                        var vi = value.indexOf(" ");
                        var valuewc = vi >= 0 ? value.slice(0, vi) : value; // remove comment portion
                        term.is_a = term.is_a || new Set();
                        term.is_a.add (valuewc);
                    } else if (tag === "intersection_of" || tag === "relationship") {
                        var parts = value.split(" ", 2);    // split to first 2 only, avoid parsing comments
                        if (parts[0] === "part_of") {
                            // console.log(term.namespace, line);
                            term.part_of = term.part_of || new Set();
                            term.part_of.add (parts[1]);
                        }
                    } else {
                        term[tag] = value;   // quicker in chrome at least
                    }
                }
            }
            i = endi + 1;
            l++;
        }
        go.set(term.id, term); // last one left over

        var zz = performance.now();
        //populate subclasses and parts
        for (term of go.values()) {
            if (term.is_a) {
                for (let superclassId of term.is_a){
                    //console.log ("go", go, superclassId, go.get(superclassId));
                    var other = go.get(superclassId);
                    other.subclasses = other.subclasses || new Set();
                    other.subclasses.add(term.id);
                }
            }
            if (term.part_of) {
                for (let partOfId of term.part_of){
                    var other = go.get(partOfId);
                    other.parts = other.parts || new Set();
                    other.parts.add(term.id);
                }
            }
        }
        console.log (zz-z, "ms. first pass (is_a, part_of)", performance.now() - zz, "ms. second pass (subclasses, parts)");
        console.log ("for obo parsing", l, "lines into map size", go.size);

        return go;
    },

    jsonifyGoMap (goMap) {
        var json = {};
        goMap.forEach (function (v, k) {
            var newv = $.extend({}, v);
            Object.keys(newv).forEach (function (key) {
                if (newv[key] instanceof Set) {
                    if (newv[key].size === 0) {
                        delete newv[key];
                    } else {
                        newv[key] = [...newv[key]];
                    }
                }
            });
            json[k] = JSON.parse(JSON.stringify(newv));
        });

        return json;
    },

    crosslinkCountPerProteinPairing: function (crosslinkArr, includeLinears) {
        var obj = {};
        var linearShim = {id: "*linear", name: "linear"};
        crosslinkArr.forEach(function(crosslink) {
            if (crosslink.toProtein || includeLinears) {
            var fromProtein = crosslink.fromProtein;
                var toProtein = crosslink.toProtein || linearShim;
                var proteinA = fromProtein.id > toProtein.id ? toProtein : fromProtein;
                var proteinB = toProtein.id >= fromProtein.id ? toProtein : fromProtein;
                var key = proteinA.id + "-" + proteinB.id;
                var pairing = obj[key];
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
    },

    // merges array of ranges
    // features should be pre-filtered to an individual protein and to an individual type
    // this can be reused for any array containing elements with properties 'begin' and 'end'
    mergeContiguousFeatures: function(features) {
        features.sort(function(f1, f2) {
            return +f1.begin - +f2.begin;
        });
        var mergedRanges = [],
            furthestEnd, mergeBegin;
        features.forEach(function(f) {
            var b = +f.begin;
            var e = +f.end;

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

        var merged = mergedRanges.length < features.length ? // if merged ranges less than original feature count
            mergedRanges.map(function(coords) { // make new features based on the new merged ranges
                return $.extend({}, features[0], coords); // features[0] is used to get other fields
            }) :
            features // otherwise just use originals
        ;
        //console.log ("mergedFeatures", features, merged);
        return merged;
    },


    // merges array of single numbers
    // assumes vals are already sorted numerically (though each val is a string)
    joinConsecutiveNumbersIntoRanges: function(vals, joinString) {
        joinString = joinString || "-";

        if (vals && vals.length > 1) {
            var newVals = [];
            var last = +vals[0],
                start = +vals[0],
                run = 1; // initialise variables to first value

            for (var n = 1; n < vals.length + 1; n++) { // note + 1
                // add extra loop iteration using MAX_SAFE_INTEGER as last value.
                // loop will thus detect non-consecutive numbers on last iteration and output the last proper value in some form.
                var v = (n < vals.length ? +vals[n] : Number.MAX_SAFE_INTEGER);
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

            //utils.xilog ("vals", vals, "joinedVals", newVals);
            vals = newVals;
        }
        return vals;
    },

    getDistanceSquared: function (coords1, coords2) {
        var d2 = 0;
        for (var n = 0; n < coords1.length; n++) {
            var diff = coords1[n] - coords2[n];
            d2 += diff * diff;
        }
        return d2;
    },

    getMinimumDistance: function(points1, points2, accessorObj, maxDistance, ignoreFunc) {

        accessorObj = accessorObj || {};
        var points1Bigger = points1.length > points2.length;

        var bigPointArr = points1Bigger ? points1 : points2;
        var smallPointArr = points1Bigger ? points2 : points1;
        var octree = d3.octree();
        octree
            .x(accessorObj.x || octree.x())
            .y(accessorObj.y || octree.y())
            .z(accessorObj.z || octree.z())
            .addAll(bigPointArr);

        maxDistance = maxDistance || 200;

        var nearest = smallPointArr.map(function(point) {
            return octree.find(octree.x()(point), octree.y()(point), octree.z()(point), maxDistance, point, ignoreFunc);
        });
        var dist = smallPointArr.map(function(point, i) {
            return nearest[i] ? modelUtils.getDistanceSquared(point.coords, nearest[i].coords) : undefined;
        });

        return d3.zip(points1Bigger ? nearest : smallPointArr, points1Bigger ? smallPointArr : nearest, dist);
    },


    radixSort: function(categoryCount, data, bucketFunction) {
        var radixSortBuckets = Array.apply(null, Array(categoryCount)).map(function() {
            return [];
        });
        data.forEach(function(d) {
            var bucketIndex = bucketFunction(d);
            radixSortBuckets[bucketIndex].push(d);
        });
        //console.log ("buckets", radixSortBuckets);
        return d3.merge(radixSortBuckets);
    },


    // https://stackoverflow.com/questions/3710204/how-to-check-if-a-string-is-a-valid-json-string-in-javascript-without-using-try
    tryParseJSON: function(jsonString) {
        try {
            var o = JSON.parse(decodeURI(jsonString)); // decodeURI in case square brackets have been escaped in url transmission

            // Handle non-exception-throwing cases:
            // Neither JSON.parse(false) or JSON.parse(1234) throw errors, hence the type-checking,
            // but... JSON.parse(null) returns null, and typeof null === "object",
            // so we must check for that, too. Thankfully, null is falsey, so this suffices:
            if (o && typeof o === "object") {
                return o;
            }
        } catch (e) {}

        return false;
    },

    parseURLQueryString: function(str) {
        var urlChunkMap = {};
        str.split("&").forEach(function(part) {
            var keyValuePair = part.split("=");
            var val = keyValuePair[1];
            //console.log ("kvp", keyValuePair);
            var jsonVal = modelUtils.tryParseJSON(val);
            urlChunkMap[keyValuePair[0]] = val !== "" ? (Number.isNaN(Number(val)) ? (val == "true" ? true : (val == "false" ? false : (jsonVal ? jsonVal : val))) : Number(val)) : val;
        });
        //console.log ("ucm", urlChunkMap);
        return urlChunkMap;
    },

    makeURLQueryPairs: function (obj, commonKeyPrefix) {
        var attrEntries = d3.entries(obj);
        var parts = attrEntries.map(function(attrEntry) {
            var val = attrEntry.value;
            if (typeof val === "boolean") {
                val = +val; // turn true/false to 1/0
            } else if (typeof val === "string") {
                val = val;
            } else if (val === undefined) {
                val = "";
            } else {
                val = encodeURI(JSON.stringify(val));
            }
            return (commonKeyPrefix || "") + attrEntry.key + "=" + val;
        });
        return parts;
    },

    totalProteinLength: function(interactors) {
        return d3.sum(interactors, function(d) {
            return d.size;
        });
    },

    getSearchGroups: function(clmsModel) {
        const searchArr = Array.from(clmsModel.get("searches").values());
        var uniqueGroups = _.uniq(_.pluck(searchArr, "group"));
        //console.log ("SSS", searchArr, uniqueGroups);
        uniqueGroups.sort(function(a, b) {
            var an = Number.parseFloat(a);
            var bn = Number.parseFloat(b);
            return !Number.isNaN(an) && !Number.isNaN(bn) ? an - bn : a.localeCompare(b);
        });
        return uniqueGroups;
    },
};

modelUtils.amino1to3Map = _.invert(modelUtils.amino3to1Map);
modelUtils.amino1toNameMap = _.invert(modelUtils.aminoNameto1Map);

d3.entries(modelUtils.amino3to1Map).forEach (function (entry) {
    modelUtils.amino3to1Map[entry.key.toUpperCase()] = entry.value;
});

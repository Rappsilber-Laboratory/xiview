var CLMSUI = CLMSUI || {};

CLMSUI.DistancesObj = function (matrices, chainMap, structureName, residueCoords) {
    this.matrices = matrices;
    this.chainMap = chainMap;
    this.structureName = structureName;
    this.residueCoords = residueCoords;
    this.setAllowedChainNameSet (undefined, true);
};

CLMSUI.DistancesObj.prototype = {

    constructor: CLMSUI.DistancesObj,

    tieBreaker: function (link1resA, link1resB, link2resA, link2resB) {
        var d;
        var mitotalDiff = (link1resA.modelIndex + link1resB.modelIndex) - (link2resA.modelIndex + link2resB.modelIndex);
        if (mitotalDiff) {
            d = mitotalDiff;
        } else {
            var citotalDiff = (link1resA.chainIndex + link1resB.chainIndex) - (link2resA.chainIndex + link2resB.chainIndex);
            if (citotalDiff) {
                d = citotalDiff;
            } else {
                var minDiff = Math.min(link1resA.chainIndex, link1resB.chainIndex) - Math.min(link2resA.chainIndex, link2resB.chainIndex);
                if (minDiff) {
                    d = minDiff;
                }
            }
        }
        return d;
    },

    getShortestLinkAlternatives: function (nglLinkWrappers, angstromAccuracy) {
        angstromAccuracy = angstromAccuracy || 1;
        var self = this;

        nglLinkWrappers.forEach (function (linkWrapper) {
            var distance = this.getXLinkDistanceFromPDBCoords (
                this.matrices, linkWrapper.residueA.seqIndex, linkWrapper.residueB.seqIndex, linkWrapper.residueA.chainIndex, linkWrapper.residueB.chainIndex
            );
            linkWrapper.distance = CLMSUI.utils.toNearest (distance, angstromAccuracy);
        }, this);

        nglLinkWrappers = nglLinkWrappers.filter (function (wrappedLink) { return !isNaN (wrappedLink.distance); });

        var nestedLinks = d3.nest()
            .key (function (linkWrapper) {
                return linkWrapper.origId;
            })
            .sortValues (function (linkWrapper1, linkWrapper2) {
                var d = linkWrapper1.distance - linkWrapper2.distance;
                return (d < 0 ? -1 : (d > 0 ? 1 : self.tieBreaker (linkWrapper1.residueA, linkWrapper1.residueB, linkWrapper2.residueA, linkWrapper2.residueB)));
            })
            .entries(nglLinkWrappers)
        ;

        var shortestLinks = nestedLinks.map(function(group) {
            return group.values[0];
        });

        CLMSUI.utils.xilog("nestedLinks", nglLinkWrappers, nestedLinks, shortestLinks);

        return shortestLinks;
    },


    getXLinkDistance: function(xlink, alignCollBB, options) {
        options = options || {};
        var average = options.average || false;
        var angstromAccuracy = options.angstromAccuracy || 1;
        var returnChainInfo = options.returnChainInfo || false;
        var chainInfo = returnChainInfo ? (average ? {
            from: [],
            to: [],
            fromRes: [],
            toRes: []
        } : {
            from: null,
            to: null,
            fromRes: null,
            toRes: null
        }) : null;
        var chainMap = this.chainMap;
        var matrices = this.matrices;
        var pid1 = options.realFromPid || xlink.fromProtein.id; // use pids if passed in by options as first choice
        var pid2 = options.realToPid || xlink.toProtein.id; // (intended as replacements for decoy protein ids)
        var chains1 = chainMap[pid1];
        var chains2 = chainMap[pid2];
        var minDist;
        var totalDist = 0;
        var distCount = 0;

        // only calc distance if seqIndex1 and seqIndex2 return non-negative values
        // might miss a few distances where the alignments could be matched quite closely i.e. for link A->C residue C could be matched to D here ABCD srch -> AB-D pdb
        // but this way dodges a lot of zero length distances when alignments have big gaps in them i.e. ABCDEFGHIJKLMNOP srch -> A------------P pdb
        // what positions would E and J be, what is the length between E and J?
        if (chains1 && chains2) {
            // No use looking at chain options currently barred by assembly type choice
            chains1 = chains1.filter (function (cid) { return this.permittedChainIndicesSet.has(cid.index); }, this);
            chains2 = chains2.filter (function (cid) { return this.permittedChainIndicesSet.has(cid.index); }, this);

            for (var n = 0; n < chains1.length; n++) {
                var chainIndex1 = chains1[n].index;
                var chainName1 = chains1[n].name;
                var alignId1 = CLMSUI.NGLUtils.make3DAlignID(this.structureName, chainName1, chainIndex1);
                var seqIndex1 = alignCollBB.getAlignedIndex(xlink.fromResidue, pid1, false, alignId1, true) - 1; // -1 for ZERO-INDEXED
                var modelIndex1 = chains1[n].modelIndex;

                if (seqIndex1 >= 0) {
                    for (var m = 0; m < chains2.length; m++) {
                        var modelIndex2 = chains2[m].modelIndex;
                        if (modelIndex1 === modelIndex2 || options.allowInterModelDistances) {  // bar distances between models
                            var chainIndex2 = chains2[m].index;
                            var chainName2 = chains2[m].name;
                            var alignId2 = CLMSUI.NGLUtils.make3DAlignID(this.structureName, chainName2, chainIndex2);
                            var seqIndex2 = alignCollBB.getAlignedIndex(xlink.toResidue, pid2, false, alignId2, true) - 1; // -1 for ZERO-INDEXED
                            // align from 3d to search index. seqindex is 0-indexed so -1 before querying
                            //CLMSUI.utils.xilog ("alignid", alignId1, alignId2, pid1, pid2);

                            if (seqIndex2 >= 0 && CLMSUI.NGLUtils.not3DHomomultimeric(xlink, chainIndex1, chainIndex2)) {
                                var dist = this.getXLinkDistanceFromPDBCoords (matrices, seqIndex1, seqIndex2, chainIndex1, chainIndex2);

                                if (dist !== undefined) {
                                    if (average) {
                                        totalDist += dist;
                                        distCount++;
                                        if (returnChainInfo) {
                                            chainInfo.from.push(chainName1);
                                            chainInfo.to.push(chainName2);
                                            chainInfo.fromRes.push(seqIndex1);
                                            chainInfo.toRes.push(seqIndex2);
                                        }
                                    } else if (minDist === undefined || dist < minDist) {
                                        //if (dist >= minDist && )
                                        minDist = dist;
                                        if (returnChainInfo) {
                                            chainInfo.from = chainName1;
                                            chainInfo.to = chainName2;
                                            chainInfo.fromRes = seqIndex1;
                                            chainInfo.toRes = seqIndex2;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // allocate distance variable to average or smallest distance depending on 'average' flag
        var distance = average ? (distCount ? totalDist / distCount : undefined) : minDist;

        // if chaininfo asked for then return an object else just return the distance
        return returnChainInfo ? {
            distance: distance,
            chainInfo: chainInfo
        } : distance;
    },

    // Get cross-link distance between two residues based on PDB-indexed positions
    // seqIndex1 and 2 are 0-based
    getXLinkDistanceFromPDBCoords: function(matrices, seqIndex1, seqIndex2, chainIndex1, chainIndex2) {
        var dist;
        if (this.permittedChainIndicesSet.has(chainIndex1) && this.permittedChainIndicesSet.has(chainIndex2)) {
            var distanceMatrix = matrices[chainIndex1 + "-" + chainIndex2].distanceMatrix;
            var minIndex = seqIndex1; // < seqIndex2 ? seqIndex1 : seqIndex2;
            if (distanceMatrix[minIndex] && distanceMatrix[minIndex][seqIndex2]) {
                var maxIndex = seqIndex2; // < seqIndex1 ? seqIndex1 : seqIndex2;
                dist = distanceMatrix[minIndex][maxIndex];
            } else {
                var sm = CLMSUI.compositeModelInst.get("stageModel");
                dist = sm ? sm.getSingleDistanceBetween2Residues(seqIndex1, seqIndex2, chainIndex1, chainIndex2) : 0;
            }
        } else {
            dist = undefined;//Number.POSITIVE_INFINITY;
        }

        //CLMSUI.utils.xilog ("dist", dist);
        return dist;
    },



    // options - withinProtein:true for no cross-protein sample links
    getSampleDistances: function (sampleLinkQuantity, crosslinkerSpecificityList, options) {
        options = options || {};
        var specificitySearchTotal = d3.sum(crosslinkerSpecificityList, function(rdata) {
            return rdata.searches.size;
        });
        CLMSUI.utils.xilog("------ RANDOM DISTRIBUTION CALCS ------", crosslinkerSpecificityList);
        CLMSUI.utils.xilog(crosslinkerSpecificityList, "STOTS", specificitySearchTotal, this, this.matrices);
        var sampleLinksPerSearch = Math.ceil(sampleLinkQuantity / specificitySearchTotal);

        var alignCollBB = CLMSUI.compositeModelInst.get("alignColl");
        var clmsModel = CLMSUI.compositeModelInst.get("clmsModel");

        var distanceableSequences = this.calcDistanceableSequenceData();
        var distanceableSequencesByProtein = d3.map(d3.nest().key(function(d) {
            return d.protID;
        }).entries(distanceableSequences), function(d) {
            return d.key;
        });
        CLMSUI.utils.xilog("dsp", distanceableSequencesByProtein);

        var alignedTerminalIndices = this.calcAlignedTerminalIndices(distanceableSequencesByProtein, clmsModel, alignCollBB);
        CLMSUI.utils.xilog("ati", alignedTerminalIndices);


        var sampleDists = []; // store for sample distances
        // For each crosslinker... (if no crosslinker specificities, then no random distribution can be or is calculated)
        crosslinkerSpecificityList.forEach (function (crosslinkerSpecificity) {

            var rmap = this.calcFilteredSequenceResidues(crosslinkerSpecificity, distanceableSequences, alignedTerminalIndices);

            // Now loop through the searches that use this crosslinker...
            crosslinkerSpecificity.searches.forEach(function(searchID) {
                var search = clmsModel.get("searches").get(searchID);
                var protIDs = search.participantIDSet;

                // Filter residue lists down to those that were in this search's proteins
                var srmap = rmap.map(function(dirMap) {
                    return (clmsModel.get("searches").size > 1) ? dirMap.filter(function(res) {
                        return protIDs.has(res.protID);
                    }) : dirMap;
                });

                // If crosslinker is homobifunctional then copy a second residue list same as the first
                if (!crosslinkerSpecificity.heterobi) {
                    srmap[1] = srmap[0];
                }
                CLMSUI.utils.xilog("rr", searchID, srmap);

                // Now pick lots of pairings from the remaining residues, one for each end of the crosslinker, so one from each residue list
                var searchMeta = {
                    heterobi: crosslinkerSpecificity.heterobi,
                    linksPerSearch: sampleLinksPerSearch,
                    restrictToProtein: options.withinProtein || false,
                    restrictToChain: options.withinChain || false,
                    restrictToModel: options.withinModel || false,
                };
                this.generateSubDividedSampleDistancesBySearch(srmap, sampleDists, searchMeta);
            }, this);
        }, this);

        CLMSUI.utils.xilog("RANDOM", sampleDists, "avg:", d3.sum(sampleDists) / (sampleDists.length || 1));
        CLMSUI.utils.xilog("------ RANDOM DISTRIBUTION END ------");
        return sampleDists;
    },

    // Collect together sequence data that is available to do sample 3d distances on, by
    // 1. Filtering out chains which aren't admissible to calculate distances on
    // 2. Mapping the remaining 3d chain sequences to the search sequences
    // 3. Then extracting those sub-portions of the search sequence that the 3d sequences cover
    calcDistanceableSequenceData: function() {
        var alignCollBB = CLMSUI.compositeModelInst.get("alignColl");

        var seqs = d3.entries(this.chainMap).map(function(chainEntry) {
            var protID = chainEntry.key;
            return chainEntry.value
                .filter(function(chain) {
                    return this.permittedChainIndicesSet.has(chain.index);
                }, this) // remove chains that are currently distance barred
                .map(function(chain) {
                    var alignID = CLMSUI.NGLUtils.make3DAlignID(this.structureName, chain.name, chain.index);
                    var range = alignCollBB.getRangeAsSearchSeq(protID, alignID);
                    $.extend(range, {
                        chainIndex: chain.index,
                        modelIndex: chain.modelIndex,
                        protID: protID,
                        alignID: alignID
                    });
                    return range;
                }, this);
        }, this);
        seqs = d3.merge(seqs); // collapse nested arrays
        CLMSUI.utils.xilog("seqs", seqs);

        return seqs;
    },

    // n-terms and c-terms occur at start/end of proteins not peptides (as proteins are digested/split after cross-linking). dur.
    // Add protein terminals if within pdb chain ranges to alignedTerminalIndices array
    calcAlignedTerminalIndices: function(seqsByProt, clmsModel, alignCollBB) {
        var alignedTerminalIndices = {
            ntermList: [],
            ctermList: []
        };

        seqsByProt.entries().forEach(function(protEntry) {
            var protKey = protEntry.key;
            var participant = clmsModel.get("participants").get(protKey);
            var seqValues = protEntry.value.values;
            var termTypes = ["ntermList", "ctermList"];

            [1, participant.size + 1].forEach(function(searchIndex, i) {
                var alignedTerminalIndex = alignedTerminalIndices[termTypes[i]];
                var alignedPos = undefined;
                seqValues.forEach(function(seqValue) {
                    if (searchIndex >= seqValue.first && searchIndex <= seqValue.last) {
                        alignedPos = {
                            searchIndex: searchIndex,
                            seqIndex: alignCollBB.getAlignedIndex(searchIndex, protKey, false, seqValue.alignID, false),
                            chainIndex: seqValue.chainIndex,
                            protID: seqValue.protID,
                            resType: termTypes[i],
                        };
                    }
                });
                if (alignedPos) {
                    alignedTerminalIndex.push(alignedPos);
                }
            });
        });

        return alignedTerminalIndices;
    },


    // Make one or two lists of residues from distanceableSequences that could map to each end of a crosslinker.
    // If the crosslinker is not heterobifunctional we only do one as it'll be the same at both ends.
    calcFilteredSequenceResidues: function (crosslinkerSpecificity, distanceableSequences, alignedTerminalIndices) {
        var linkableResidueSets = crosslinkerSpecificity.linkables;
        var alignCollBB = CLMSUI.compositeModelInst.get("alignColl");

        var rmaps = linkableResidueSets.map (function (linkableResSet) {  // might be >1 set, some linkers bind differently at each end (heterobifunctional)
            var all = linkableResSet.has("*") || linkableResSet.has("X") || linkableResSet.size === 0;
            var rmap = [];
            distanceableSequences.forEach (function (distSeq) {
                CLMSUI.utils.xilog("distSeq", distSeq);
                var protID = distSeq.protID;
                var alignID = distSeq.alignID;
                var filteredSubSeqIndices = CLMSUI.modelUtils.filterSequenceByResidueSet (distSeq.subSeq, linkableResSet, all);
                for (var m = 0; m < filteredSubSeqIndices.length; m++) {
                    var searchIndex = distSeq.first + filteredSubSeqIndices[m];
                    // assign if residue position has definite hit between search and pdb sequence, but not if it's a gap (even a single-letter gap).
                    // That's the same criteria we apply to saying a crosslink occurs in a pdb in the first place
                    // Justification: mapping hits between aaaa----------aaa and bbb-------bbb will map to nearest residue and give lots of zero
                    // length distances when both cross-link residues are '-'
                    var seqIndex = alignCollBB.getAlignedIndex(searchIndex, protID, false, alignID, true); // will be 1-indexed
                    if (seqIndex >= 0) {
                        var datum = {
                            searchIndex: searchIndex,
                            chainIndex: distSeq.chainIndex,
                            protID: protID,
                            seqIndex: seqIndex,
                        };
                        rmap.push(datum);
                    }
                }
            }, this);
            if (linkableResSet.has("CTERM")) {
                rmap.push.apply (rmap, alignedTerminalIndices.ctermList);
            }
            if (linkableResSet.has("NTERM")) {
                rmap.push.apply (rmap, alignedTerminalIndices.ntermList);
            }
            return rmap;
        }, this);

        if (rmaps.length === 1) { rmaps.push ([]); }    // add empty second array for non-heterobi crosslinkers

        CLMSUI.utils.xilog ("rmaps", rmaps, linkableResidueSets);
        return rmaps;
    },

    makeChainIndexToModelIndexMap: function() {
        var cimimap = d3.map();
        d3.values(this.chainMap).forEach(function(value) {
            value.forEach(function(chainInfo) {
                cimimap.set(chainInfo.index, chainInfo.modelIndex);
            });
        });
        return cimimap;
    },

    // metaData.restrictToChain == true for sample distances internal to same PDB chain only
    // metaData.restrictToModel == true for sample distances internal to same PDB model only
    // metaData.restrictToProtein == true for sample distances internal to same protein only
    // Note: same protein may be present in multiple models
    generateSubDividedSampleDistancesBySearch: function (srmap, randDists, metaData, chainToModelMap) {

        chainToModelMap = chainToModelMap || this.makeChainIndexToModelIndexMap();
        //console.log ("chainMap", this.chainMap, chainToModelMap, srmap);
        // if not dividing random generation by chain or protein or model (or all model indices are the same), shortcut with the following
        if (!metaData.restrictToChain && !metaData.restrictToProtein && (!metaData.restrictToModel || d3.set(chainToModelMap.values()).size() === 1)) {
            this.generateSampleDistancesBySearch(srmap[0], srmap[1], randDists, metaData);
        } else {
            // Convenience: Divide into list per protein / chain / model for selecting intra-protein or intra-chain samples only
            var srmapPerProtChain = [{}, {}];
            var protChainSet = d3.set();
            srmap.forEach (function (dirMap, i) {
                var perProtChainMap = srmapPerProtChain[i];

                dirMap.forEach(function(res) {
                    var protID = res.protID;
                    var chainID = res.chainIndex;
                    var protChainID = metaData.restrictToProtein ? protID : "";
                    protChainID += metaData.restrictToChain ? "|" + chainID : "";
                    protChainID += metaData.restrictToModel ? "|" + chainToModelMap.get(chainID) : "";

                    var perProtChainList = perProtChainMap[protChainID];
                    if (!perProtChainList) {
                        perProtChainMap[protChainID] = [res];
                        protChainSet.add(protChainID);
                    } else {
                        perProtChainList.push(res);
                    }
                });
                //console.log ("dirMap", dirMap, perProtMap, d3.nest().key(function(d) { return d.protID; }).entries(dirMap));
            });
            if (!metaData.heterobi) {
                srmapPerProtChain[1] = srmapPerProtChain[0];
            }

            CLMSUI.utils.xilog("intra spp", srmapPerProtChain);

            // Assign randoms to inter-protein links based on number of possible pairings
            // e.g. if proteinA-A is 100->100 residues and proteinB-B is 20->20 residues
            // then the possible pairings are 10,000 (100x100) and 400 (20x20) and the randoms are allocated in that proportion
            var proportions = d3.entries(srmapPerProtChain[0]).map(function(entry) {
                var key = entry.key;
                var quant1 = entry.value.length;
                var opp = srmapPerProtChain[1][key];
                return {
                    protChainID: entry.key,
                    possiblePairings: opp ? quant1 * opp.length : 0
                };
            });
            var total = d3.sum(proportions, function(d) {
                return d.possiblePairings;
            });
            var propMap = d3.map(proportions, function(d) {
                return d.protChainID;
            });

            //var samplesPerProtein = metaData.linksPerSearch / protSet.size();
            protChainSet.values().forEach(function(protChainID) {
                var samplesPerProtein = metaData.linksPerSearch / total * propMap.get(protChainID).possiblePairings;
                this.generateSampleDistancesBySearch(srmapPerProtChain[0][protChainID], srmapPerProtChain[1][protChainID], randDists, {
                    linksPerSearch: Math.floor(samplesPerProtein)
                });
            }, this);

            //console.log ("ppp", srmapPerProtChain, proportions, total, propMap);
        }
    },

    generateSampleDistancesBySearch: function(rowMap, columnMap, randDists, options) {
        var count = options.linksPerSearch;
        var rowCount = rowMap.length;
        var columnCount = columnMap.length;
        var possibleLinks = rowCount * columnCount;
        if (possibleLinks && count) { // can't do this if no actual residues pairings left, or no sample links requested (count == 0)
            var hop = Math.max(1, possibleLinks / count);
            var maxRuns = Math.min(possibleLinks, count);
            CLMSUI.utils.xilog("hop", hop, "possible link count", possibleLinks, maxRuns);

            var residuesPerSide = Math.max(1, Math.round(Math.sqrt(count)));
            var residueRowIndices = d3.range(0, Math.min(rowCount, residuesPerSide)).map(function(r) {
                return Math.floor(rowCount / residuesPerSide * r);
            });
            var residueColumnIndices = d3.range(0, Math.min(columnCount, residuesPerSide)).map(function(c) {
                return Math.floor(columnCount / residuesPerSide * c);
            });

            //console.log ("rro", residueRowIndices, residueColumnIndices, count)

            var self = this;
            residueRowIndices.forEach(function(rri) {
                var res1 = rowMap[rri];
                residueColumnIndices.forEach(function(rci) {
                    var res2 = columnMap[rci];
                    var dist = self.getXLinkDistanceFromPDBCoords(self.matrices, res1.seqIndex - 1, res2.seqIndex - 1, res1.chainIndex, res2.chainIndex);
                    if (!isNaN(dist) && dist > 0) {
                        randDists.push(dist);
                    }
                });
            });
        }
    },

    setAssemblyChains: function(nglPdbStructure, assemblyKey) {
        var dictEntry = nglPdbStructure.biomolDict[assemblyKey];
        var chainNames = dictEntry ? d3.merge(_.pluck (dictEntry.partList, "chainList")) : [];
        if (!chainNames.length) {   // default - if chainNames empty, make chainNames all chains
            nglPdbStructure.eachChain(function(cp) {
                chainNames.push(cp.chainname);
            });
        }
        var chainNameSet = d3.set(chainNames);
        this.setAllowedChainNameSet (chainNameSet, false);

        return this;
    },

    // set of chain names that are allowed to be in distance calculations
    // needed as others are restricted by the assembly in the ngl model
    // If chainNameSet is undefined all chain names are permitted
    setAllowedChainNameSet: function(chainNameSet, isNewObj) {
        this.permittedChainIndicesSet = d3.set();
        d3.values(this.chainMap).map(function(valueArr) {
            valueArr.map(function(d) {
                if (!chainNameSet || chainNameSet.has(d.name)) {
                    this.permittedChainIndicesSet.add(d.index);
                }
            }, this);
        }, this);

        console.log("PCIS", this.permittedChainIndicesSet);
        if (!isNewObj) {
            // if changing existing object fire an event, otherwise hold off. Fire an event once whole new distancesObj object is installed.
            CLMSUI.vent.trigger("recalcLinkDistances"); // this needs listened to and link distances updated before views listen to next trigger
            CLMSUI.vent.trigger("PDBPermittedChainSetsUpdated", this.permittedChainIndicesSet);
        }

        return this;
    }
};

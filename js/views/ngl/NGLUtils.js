import * as _ from 'underscore';
import * as $ from "jquery";
// const workerpool = require('workerpool');
import * as NGL from "../../../vendor/ngl.dev";
import {utils} from "../../utils";
import {modelUtils} from "../../modelUtils";
import Backbone from "backbone";
import d3 from "d3";
// import {DistancesObj} from "../../model/distances";//cyclic dependency, hack it into bottom of this file
// import {NGLModelWrapperBB} from "./ngl-wrapper-model"; // cyclic dependency, hack it into bottom of this file

export const NGLUtils = {
    repopulateNGL: function (pdbInfo) {
        //console.log ("pdbInfo", pdbInfo);
        this.pdbSettings = pdbInfo.pdbSettings;
        const stage = pdbInfo.stage;
        const compositeModel = pdbInfo.compositeModel;

        const self = this;

        console.log("CLEAR STAGE");
        stage.removeAllComponents(); // necessary to remove old stuff so old sequences don't pop up in sequence finding

        function returnFailure(reason) {
            const id = _.pluck(self.pdbSettings, "id").join(", ");
            const emptySequenceMap = [];
            emptySequenceMap.failureReason = "Error for " + id + ", " + reason;
            compositeModel.trigger("3dsync", emptySequenceMap);
        }

        Promise.all(
            self.pdbSettings.map(function (pdbSetting) {
                return stage.loadFile(pdbSetting.uri, pdbSetting.params);
            })
        )
            //stage.loadFile(uri, params)
            .catch(function (reason) {
                returnFailure(reason);
            })
            .then(function (structureCompArray) {

                structureCompArray = structureCompArray || [];  // set to empty array if undefined to avoid error in next bit
                //utils.xilog ("structureComp", structureCompArray);
                structureCompArray.forEach(function (scomp, i) {   // give structure a name if none present (usually because loaded as local file)
                    scomp.structure.name = scomp.structure.name || self.pdbSettings[i].id;
                });

                let structureComp;
                if (structureCompArray.length > 1) {
                    //structureCompArray
                    const oldStructures = _.pluck(structureCompArray, "structure");
                    const combinedStructure = NGL.concatStructures.apply(NGL, ["concat"].concat(oldStructures));
                    NGLUtils.copyEntities(combinedStructure, oldStructures);
                    NGLUtils.makeChainToOriginalStructureIDMap(combinedStructure, oldStructures);
                    //var cs = NGL.concatStructures ("concat", structureCompArray.map (function (sc) { return sc.structure; }));
                    const comp = stage.addComponentFromObject(combinedStructure);
                    comp.structure.title = _.pluck(oldStructures, "title").join(", ");
                    comp.structure.name = _.pluck(oldStructures, "name").join(", ");
                    structureComp = comp;
                } else {
                    structureComp = structureCompArray[0];
                }

                if (structureComp) {
                    // match by alignment func for searches where we don't know uniprot ids, don't have pdb codes, or when matching by uniprot ids returns no matches
                    function matchByXiAlignment(whichNGLSequences, pdbUniProtMap) {
                        const protAlignCollection = compositeModel.get("alignColl");
                        vent.listenToOnce(vent, "sequenceMatchingDone", function (matchMatrix) {
                            const pdbXiProtMap = modelUtils.matrixPairings(matchMatrix, whichNGLSequences);
                            utils.xilog("XI PAIRED", pdbXiProtMap);
                            sequenceMapsAvailable(pdbXiProtMap.concat(pdbUniProtMap));    // concat uniprot service and xi matched pdb-protein pairs
                        });
                        // the above sequenceMatchingDone event is triggered in matchSequencesToExistingProteins when these further alignments done, sync or async
                        NGLUtils.matchSequencesToExistingProteins(protAlignCollection, whichNGLSequences, interactorArr,
                            function (sObj) {
                                return sObj.data;
                            }
                        );
                    }

                    const nglSequences = NGLUtils.getChainSequencesFromNGLStructure(structureComp);
                    const interactorMap = compositeModel.get("clmsModel").get("participants");
                    var interactorArr = Array.from(interactorMap.values());

                    // If have a pdb code AND legal accession IDs use a web service in matchPDBChainsToUniprot to glean matches
                    // between ngl protein chains and clms proteins. This is asynchronous so we use a callback
                    // if (self.pdbSettings[0].pdbCode && modelUtils.getLegalAccessionIDs(interactorMap).length) {
                    //     console.log("WEB SERVICE CALLED");
                    //     NGLUtils.matchPDBChainsToUniprot(self.pdbSettings, nglSequences, interactorArr, function (uniprotMappingResults) {
                    //         utils.xilog ("UniprotMapRes", uniprotMappingResults, nglSequences);
                    //         if (uniprotMappingResults.remaining.length) { // Some PDB sequences don't have unicode protein matches in this search
                    //             var remainingSequences = _.pluck (uniprotMappingResults.remaining, "seqObj");   // strip the remaining ones back to just sequence objects
                    //             //console.log ("rem", remainingSequences, uniprotMappingResults);
                    //             matchByXiAlignment (remainingSequences, uniprotMappingResults.uniprotMapped);   // fire them into xi alignment routine
                    //             //returnFailure ("No valid uniprot data returned");
                    //         } else {
                    //             sequenceMapsAvailable (uniprotMappingResults.uniprotMapped);
                    //         }
                    //     });
                    // } else { // without access to pdb codes have to match comparing all proteins against all chains
                        matchByXiAlignment(nglSequences, []);
                    // }

                    // bit to continue onto after ngl protein chain to clms protein matching has been done
                    function sequenceMapsAvailable(sequenceMap) {

                        utils.xilog("seqmap", sequenceMap);
                        //if (!_.isEmpty(sequenceMap)) {
                        const chainMap = {};
                        sequenceMap.forEach(function (pMatch) {
                            pMatch.data = pMatch.seqObj.data;
                            pMatch.name = NGLUtils.make3DAlignID(structureComp.structure.name, pMatch.seqObj.chainName, pMatch.seqObj.chainIndex);
                            chainMap[pMatch.id] = chainMap[pMatch.id] || [];
                            chainMap[pMatch.id].push({
                                index: pMatch.seqObj.chainIndex,
                                name: pMatch.seqObj.chainName,
                                modelIndex: pMatch.seqObj.modelIndex
                            });
                            pMatch.otherAlignSettings = {
                                semiLocal: true
                            };
                        });
                        utils.xilog("chainmap", chainMap, "stage", stage, "\nhas sequences", sequenceMap);

                        if (compositeModel.get("stageModel")) {
                            compositeModel.get("stageModel").stopListening(); // Stop the following 3dsync event triggering stuff in the old stage model
                        }
                        const removeThese = compositeModel.get("stageModel") ? [compositeModel.get("stageModel").getStructureName()] : [];    // old alignments to remove
                        compositeModel.trigger("3dsync", sequenceMap, removeThese);
                        // Now 3d sequence is added we can make a new NGL Model wrapper (as it needs aligning)

                        // Make a new model and set of data ready for the ngl viewer
                        const newNGLModelWrapper = new NGLModelWrapperBB();
                        newNGLModelWrapper.set({
                            structureComp: structureComp,
                            chainMap: chainMap,
                            compositeModel: compositeModel,
                            name: "NGLModelWrapper " + structureComp.structure.name,
                        });
                        compositeModel.set("stageModel", newNGLModelWrapper);
                        // important that the new stagemodel is set first ^^^ before we setupLinks() on the model
                        // otherwise the listener in the 3d viewer is still pointing to the old stagemodel when the
                        // changed:linklist event is received. (i.e. it broke the other way round)
                        newNGLModelWrapper.setupLinks();
                    }
                }
            });
    },

    getChainSequencesFromNGLStructure: function (structureComponent) {
        const sequences = [];
        const structure = structureComponent.structure;
        const chainToOriginalStructureMap = structure.chainToOriginalStructureIDMap || {};
        //console.log ("comp", structureComponent);

        structure.eachChain(function (c) {
            //console.log ("chain", c, c.residueCount, c.residueOffset, c.chainname, c.qualifiedName());
            if (NGLUtils.isViableChain(c)) { // short chains are ions/water molecules, ignore
                const resList = [];
                c.eachResidue(function (r) {
                    resList.push(r.getResname1() || "X");
                });
                //esList = structure.getSequence (new NGL.Selection (c.qualifiedName()));
                const structureID = chainToOriginalStructureMap[c.index] || structure.name;

                sequences.push({
                    chainName: c.chainname,
                    chainIndex: c.index,
                    modelIndex: c.modelIndex,
                    residueOffset: c.residueOffset,
                    structureID: structureID.toLocaleLowerCase(),
                    data: resList.join("")
                });
                //console.log ("chain", c, c.residueCount, c.residueOffset, c.chainname, c.qualifiedName(), resList.join(""));
            }
        });

        utils.xilog("seq", sequences);
        return sequences;
    },

    getChainSequencesFromNGLStage: function (stage) {
        const sequences = [];
        //console.log ("stage", stage);

        stage.eachComponent(function (comp) {
            sequences.push.apply(sequences, NGLUtils.getChainSequencesFromNGLStructure(comp));
        });

        return sequences;
    },

    // Nice web-servicey way of doing ngl chain to clms protein matching (can be N-to-1)
    // Except it depends on having pdb codes, not a standalone file, and all the uniprot ids present too
    // Therefore, we need to return umatched sequences so we can fallback to using our own pairing algorithm if necessary
    matchPDBChainsToUniprot: function (pdbUris, nglSequences, interactorArr, callback) {

        let count = nglSequences.length;//pdbUris.length;
        const dataArr = [];
        let requireXiAlign = [];

        /*
        function handleError(data, status) {
            console.log("error", data, status);
            var emptySequenceMap = [];
            emptySequenceMap.fail = true;
            callback(emptySequenceMap);
        }
        */

        function dealWithReturnedData(data) {
            //todo get rid d3 Map
            // const map = d3.map();

            // $(data).find("block").each(function (i, b) {
            //     const segArr = $(this).find("segment[intObjectId]");
            //     for (let n = 0; n < segArr.length; n += 2) {
            //         const id1 = $(segArr[n]).attr("intObjectId");
            //         const id2 = $(segArr[n + 1]).attr("intObjectId");
            //         const pdbis1 = _.includes(id1, ".") || !id1.match(utils.commonRegexes.uniprotAccession);
            //         const unipdb = pdbis1 ? {
            //             pdb: id1,
            //             uniprot: id2
            //         } : {
            //             pdb: id2,
            //             uniprot: id1
            //         };
            //         map.set(unipdb.pdb + "-" + unipdb.uniprot, unipdb);
            //     }
            // });
            // sometimes there are several blocks for the same uniprot/pdb combination so had to map then take the values to remove duplicate pairings i.e. 3C2I
            // we calculate the alignment later on, this routine is purely to pair pdb chains to our proteins via uniprot accession numbers

            console.log("**", data);

            let mapArr = data;//Array.from(map.values());
            utils.xilog("PDB Service Map All", mapArr);

            if (callback) {
                const interactors = modelUtils.filterOutDecoyInteractors(interactorArr);

                mapArr.forEach(function (mapping) {
                    const dotIndex = mapping.pdb.indexOf(".");
                    const pdbName = (dotIndex >= 0 ? mapping.pdb.slice(0, dotIndex) : mapping.pdb.slice(-1)).toLocaleLowerCase();
                    const chainName = dotIndex >= 0 ? mapping.pdb.slice(dotIndex + 1) : mapping.pdb.slice(-1); // bug fix 27/01/17
                    const matchSeqs = nglSequences.filter(function (seqObj) {
                        return seqObj.chainName == chainName //&& seqObj.structureID === pdbName;
                    });
                    //console.log ("SEQOBJS", matchSeqs);
                    mapping.seqObj = matchSeqs[0];
                    const matchingInteractors = interactors.filter(function (i) {
                        const minLength = Math.min(i.accession.length, mapping.uniprot.length);
                        return i.accession.substr(0, minLength) === mapping.uniprot.substr(0, minLength);
                    });
                    mapping.id = _.isEmpty(matchingInteractors) ? "none" : matchingInteractors[0].id;
                });

                requireXiAlign = mapArr.filter(function (mapping) {
                    return mapping.id === "none" && mapping.seqObj;
                });
                mapArr = mapArr.filter(function (mapping) {
                    return mapping.id !== "none" && mapping.seqObj;
                });
                utils.xilog("PDB Service Map Matched", mapArr);
                callback({uniprotMapped: mapArr, remaining: requireXiAlign});
            }
        }


        // pdbUris.forEach(function (pdbUri) {
        for (let nglSequence of nglSequences) {
            // alert(pdbUri.id);
            const pdbId = nglSequence.structureID.toUpperCase() + '.' + nglSequence.chainName;
            const url = 'https://1d-coordinates.rcsb.org/graphql?query=' + encodeURI('{ alignment(from:PDB_INSTANCE, to:UNIPROT, queryId:"'
                + pdbId + '") { target_alignment { target_id } } }');
            $.get(url, //"https://www.rcsb.org/pdb/rest/das/pdb_uniprot_mapping/alignment?query=" + pdbUri.id,
                function (data, status, xhr) {
                    if (status === "success"){//} && (data.contentType === "text/xml" || data.contentType === "application/xml")) { // data is an xml fragment

                        // console.log("YO:", url, data,  nglSequence.structureId + '.' + nglSequence.chainName );

                        const target_alignment = data.data.alignment.target_alignment;
                        if (target_alignment) {
                            const target = target_alignment[0].target_id;
                            dataArr.push({
                                pdb: nglSequence.structureID.toUpperCase() + '.' + nglSequence.chainName,
                                uniprot: target
                            });
                        }

                        // dataArr.push(data);
                    } else { // usually some kind of error if reached here as we didn't detect xml
                        // requireXiAlign.push(pdbUri);
                    }

                    count--;
                    if (count === 0) {
                        dealWithReturnedData(dataArr);
                    }
                }
            ).fail(function (jqxhr, status, error) {
                // requireXiAlign.push(pdbUri);
                count--;
                if (count === 0) {
                    dealWithReturnedData(dataArr);
                }
            });
        }//);

    },

    // Fallback protein-to-pdb chain matching routines for when we don't have a pdbcode to query the pdb web services or it's offline or we still have sequences in the pdb unmatched to proteins
    matchSequencesToExistingProteins: function (protAlignCollection, sequenceObjs, proteins, extractFunc) {
        utils.xilog("SEQS TO PAIR INTERNALLY", sequenceObjs);

        proteins = modelUtils.filterOutDecoyInteractors(proteins)
            .filter(function (protein) {
                return protAlignCollection.get(protein.id);
            })
        ;
        const matchMatrix = {};
        const seqs = extractFunc ? sequenceObjs.map(extractFunc) : sequenceObjs;

        // Filter out repeated sequences to avoid costly realignment calculation of the same sequences
        const filteredSeqInfo = modelUtils.filterRepeatedSequences(seqs);

        function finished(matchMatrix) {
            // inflate score matrix to accommodate repeated sequences that were found and filtered out above
            vent.trigger("sequenceMatchingDone", modelUtils.reinflateSequenceMap(matchMatrix, seqs, filteredSeqInfo));
        }

        function updateMatchMatrix(protID, alignResults) {
            const uniqScores = _.pluck(alignResults, "avgBitScore");  //eScore;
            matchMatrix[protID] = uniqScores;
        }

        const totalAlignments = filteredSeqInfo.uniqSeqs.length * proteins.length;
        vent.trigger("alignmentProgress", "Attempting to match " + proteins.length + " proteins to " + seqs.length + " additional sequences.");

        const start = performance.now();
        // webworker way, only do if enough proteins and cores to make it worthwhile
        // if ((!window || !!window.Worker) && proteins.length > 20 && workerpool.cpus > 2) {
        //     let count = proteins.length;
        //     const pool = workerpool.pool("js/align/alignWorker.js");
        //
        //     proteins.forEach(function (prot, i) {
        //         const protAlignModel = protAlignCollection.get(prot.id);
        //         const settings = protAlignModel.getSettings();
        //         settings.aligner = undefined;
        //         pool.exec('protAlignPar', [prot.id, settings, filteredSeqInfo.uniqSeqs, {
        //             semiLocal: true
        //         }])
        //             .then(function (alignResultsObj) {
        //                 // be careful this is async, so protID better obtained from returned object - might not be prot.id
        //                 updateMatchMatrix(alignResultsObj.protID, alignResultsObj.fullResults)
        //             })
        //             .catch(function (err) {
        //                 console.log(err);
        //             })
        //             .then(function () {
        //                 count--;
        //                 if (count % 10 === 0) {
        //                     CLMSUI.vent.trigger("alignmentProgress", count + " proteins remaining to align.");
        //                     if (count === 0) {
        //                         pool.terminate(); // terminate all workers when done
        //                         console.log("tidy pool. TIME PAR", performance.now() - start);
        //                         finished(matchMatrix);
        //                     }
        //                 }
        //             });
        //     });
        // }
        // // else do it on main thread
        // else {
            // Do alignments
            proteins.forEach(function (prot) {
                const protAlignModel = protAlignCollection.get(prot.id);
                // Only calc alignments for unique sequences, we can copy values for repeated sequences in the next bit
                const alignResults = protAlignModel.alignWithoutStoring(filteredSeqInfo.uniqSeqs, {
                    semiLocal: true
                });
                console.log("alignResults", /*alignResults,*/ prot.id); // printing alignResults uses lots of memory in console (prevents garbage collection)
                updateMatchMatrix(prot.id, alignResults)
            });

            finished(matchMatrix);
        // }
    },

    make3DAlignID: function (baseID, chainName, chainIndex) {
        return baseID + ":" + chainName + ":" + chainIndex;
    },

    // this avoids going via the ngl functions using data in a chainMap
    getChainNameFromChainIndex: function (chainMap, chainIndex) {
        const chainsPerProt = d3.values(chainMap);
        const allChains = d3.merge(chainsPerProt);
        const matchChains = allChains.filter(function (entry) {
            return entry.index === chainIndex;
        });
        return matchChains[0] ? matchChains[0].name : undefined;
    },

    getRangedCAlphaResidueSelectionForChain: function (chainProxy) { // chainProxy is NGL Object
        let min, max;
        chainProxy.eachResidue(function (rp) {
            const rno = rp.resno;
            if (!min || rno < min) {
                min = rno;
            }
            if (!max || rno > max) {
                max = rno;
            }
        });

        // The New Way - 0.5s vs 21.88s OLD (individual resno's rather than min-max)
        const sel = ":" + chainProxy.chainname + "/" + chainProxy.modelIndex + " AND " + min + "-" + max + ".CA";
        return sel;
    },

    getReasonableDistanceLimit: function (nglStageModel) {
        //var showableChains = nglStageModel.getShowableChains (false);
        let chainSele;  // = nglStageModel.makeChainSelectionString(showableChains);
        const boundingBox = nglStageModel.get("structureComp").getBoxUntransformed(chainSele);

        function xyzToArray(xyz) {
            return [xyz.x, xyz.y, xyz.z];
        }

        const dist = modelUtils.getDistanceSquared(xyzToArray(boundingBox.min), xyzToArray(boundingBox.max));

        return Math.sqrt(dist);
    },

    // test to ignore short chains and those that aren't polymer chains (such as water molecules)
    isViableChain: function (chainProxy) {
        //console.log ("cp", chainProxy.entity, chainProxy.residueCount, chainProxy);
        // should be chainProxy.entity.isPolymer() but some hand-built ngl models muff these settings up
        return chainProxy.residueCount > 10 && (!chainProxy.entity || (!chainProxy.entity.isWater() && !chainProxy.entity.isMacrolide()));
    },

    copyEntities: function (combinedStructure, originalStructures) {
        let gci = 0;

        originalStructures.forEach(function (s) {
            s.eachChain(function (cp) {
                const entity = cp.entity;
                const targetEntityIndex = combinedStructure.entityList.length;
                //structure.entityList.push (new NGL.Entity (
                //    structure, targetEntityIndex, entity.description, entity.type, [gci]
                //));
                combinedStructure.entityList.push(entity);

                const targetcp = combinedStructure.getChainProxy(gci);
                targetcp.entityIndex = targetEntityIndex;
                gci++;
            });
        });

        //console.log (combinedStructure.entityList);
    },

    makeChainToOriginalStructureIDMap: function (combinedStructure, originalStructures) {
        let gci = 0;
        const chainToOriginalStructureIDMap = [];

        originalStructures.forEach(function (s) {
            s.eachChain(function () {
                chainToOriginalStructureIDMap[gci] = s.name;
                gci++;
            });
        });

        combinedStructure.chainToOriginalStructureIDMap = chainToOriginalStructureIDMap;

        return chainToOriginalStructureIDMap;
    },

    not3DHomomultimeric: function (crosslink, chain1ID, chain2ID) {
        return chain1ID !== chain2ID || !crosslink.confirmedHomomultimer;
    },
};






export class NGLModelWrapperBB extends Backbone.Model {
    constructor(attributes, options) {
        super(attributes, options);
    }
    defaults(){
        return {
            compositeModel: null,
            structureComp: null,
            chainMap: null,
            linkList: null,
            fullDistanceCalcCutoff: 1200,
            allowInterModelDistances: false,
            showShortestLinksOnly: true,
        }
    }

    // Most of the stuff in this file is dealing with the complications of a single protein possibly mapping to many different chains
    // in a PDB structure.

    initialize () {
        // When compositeModel is declared, hang a listener on it that listens to change in alignment model as this
        // possibly changes links and distances in 3d model
        // this is in case 3d stuff has been set up before main model (used to happen that pdb's were autoloaded for some searches)
        this.listenToOnce(this, "change:compositeModel", function () { // only do this once (should only happen once anyways but better safe than sorry)
            // alignment change may mean distances are different so recalc
            this.listenTo(this.getCompositeModel().get("alignColl"), "bulkAlignChange", function () {
                console.log("SET UP LINKS");
                this.setupLinks();
            });
        });

        this.listenTo(this, "change:allowInterModelDistances", function (model, val) {
            const compModel = this.get("compositeModel");
            compModel.getCrossLinkDistances(compModel.getAllCrossLinks());  // regenerate distances for all crosslinks
            vent.trigger("changeAllowInterModelDistances", model, val);
        });

        this.listenTo(this, "change:chainMap", function (model, val) {
            model.makeReverseChainMap(val);
        });

        this.makeReverseChainMap(this.get("chainMap"));
    }

    // make a map of chain indices to protein ids
    makeReverseChainMap (chainMap) {
        const reverseChainMap = d3.map();
        const entries = d3.entries(chainMap);
        entries.forEach(function (entry) {
            entry.value.forEach(function (valueItem) {
                reverseChainMap.set(valueItem.index, entry.key);
            });
        });
        this.set("reverseChainMap", reverseChainMap);
        return this;
    }

    getCompositeModel () {
        return this.get("compositeModel");
    }

    getStructureName () {
        return this.get("structureComp").structure.name;
    }

    /**
     *   Call when new PDB file loaded
     */
    setupLinks () {
        const chainInfo = this.getChainInfo();
        this.calculateAllCaAtomIndices(chainInfo.viableChainIndices);
        this.setFilteredLinkList();

        // The point of this is to build a cache for Ca-Ca distances so we don't have to keep asking the ngl components for them
        // For very large structures we just store the distances that map to crosslinks, so we have to get other distances by reverting to the ngl stuff
        const distances = this.getChainDistances(chainInfo.resCount > this.defaults.fullDistanceCalcCutoff);
        const distancesObj = new DistancesObj(distances, this.get("chainMap"), this.getStructureName());

        const clmsModel = this.getCompositeModel().get("clmsModel");
        // silent change and trigger, as loading in the same pdb file doesn't trigger the change automatically (as it generates an identical distance matrix)
        // Secondly, inserting a silent set to 'null' first stops backbone temporarily storing the previous distancesobj, as they could both be quite large
        // Also want to recalculate link distances with this object, before informing views the object is new (otherwise may draw with old data)
        clmsModel.set("distancesObj", null, {silent: true});
        clmsModel.set("distancesObj", distancesObj, {silent: true});
        distancesObj.maxDistance = d3.max(this.getCompositeModel().getHomomDistances(this.getCompositeModel().getAllCrossLinks()));
        clmsModel.trigger("change:distancesObj", clmsModel, clmsModel.get("distancesObj"));
        return this;
    }

    /**
     *   Call when set of filtered cross-links has changed
     */
    setFilteredLinkList () {
        this.setLinkList(this.getCompositeModel().getFilteredCrossLinks());
        return this;
    }

    setLinkList (crosslinkArr) {
        const linkDataObj = this.makeLinkList(crosslinkArr);
        const distanceObj = this.getCompositeModel().get("clmsModel").get("distancesObj");
        if (this.get("showShortestLinksOnly") && distanceObj) { // filter to shortest links if showShortestLinksOnly set
            linkDataObj.fullLinkList = distanceObj.getShortestLinkAlternatives(linkDataObj.fullLinkList);
        }
        this.setLinkListWrapped(linkDataObj);
        return this;
    }

    makeLinkList (crosslinkArr) {
        const structure = this.get("structureComp").structure;
        let nextResidueId = 0;
        const structureId = null;
        const structureName = this.getStructureName();
        const residueDict = {};
        const fullLinkList = [];  // links where both ends are in pdb
        const halfLinkList = [];  // links where one end is in the pdb
        const residueProxy1 = structure.getResidueProxy();
        const chainProxy = structure.getChainProxy();
        const atomProxy = structure.getAtomProxy();
        const alignColl = this.getCompositeModel().get("alignColl");

        function getResidueId(globalNGLResIndex) {
            // TODO add structureId to key
            // TODO in NMR structures there are multiple models // mjg - chainIndex is unique across models
            if (residueDict[globalNGLResIndex] === undefined) {
                residueDict[globalNGLResIndex] = nextResidueId;
                nextResidueId++;
            }
            return residueDict[globalNGLResIndex];
        }

        function addAtomPoints(pdbIndexedResidues) {
            pdbIndexedResidues.forEach(function (fat) {
                const atomIndex = this.getAtomIndex(fat.seqIndex, fat.chainIndex);
                fat.atomIndex = atomIndex;
                atomProxy.index = atomIndex;
                const coords = this.getAtomCoordinates(atomProxy);
                fat.coords = coords;
            }, this);
        }

        function makePDBIndexedResidues(perModelChainEntry, searchIndexResidue, protID) {
            if (perModelChainEntry) {
                return perModelChainEntry.values.map(function (chainValue) {
                    const chainIndex = chainValue.index;  // global NGL chain index
                    const alignID = NGLUtils.make3DAlignID(structureName, chainValue.name, chainIndex);
                    return {
                        chainIndex: chainIndex,
                        modelIndex: chainValue.modelIndex,
                        seqIndex: alignColl.getAlignedIndex(searchIndexResidue, protID, false, alignID, true) - 1,  // residues are 0-indexed in NGL so -1
                    };
                }).filter(function (datum) {   // remove residues with no aligned residue in ngl sequence
                    return datum.seqIndex >= 0;
                });
            }
            return [];
        }

        // add extra info to a residue object that's handy later on
        function addResidueExtraInfo(pdbIndexedResidue, residueProxy) {
            const ri = residueProxy.index;
            pdbIndexedResidue.NGLglobalIndex = ri;          // Why? A: used to get data via ResidueProxy. rp.index = value;
            //pdbIndexedResidue.resindex = pdbIndexedResidue.seqIndex;  // removed duplicate, seqIndex makes more sense as variable name anyways
            pdbIndexedResidue.residueId = getResidueId(ri);
            pdbIndexedResidue.resno = residueProxy.resno;   // Why? A: ngl residue index to resno conversion, as NGL.Selection() works with resno values
            pdbIndexedResidue.structureId = null;
        }

        // call the previous function with the contents of an array of arrays
        // usually the to and from residues object lists
        function addResidueListsExtraInfo(residueObjLists) {
            residueObjLists.forEach(function (residueObjList) {
                residueObjList.forEach(function (residueObj) {
                    chainProxy.index = residueObj.chainIndex;
                    residueProxy1.index = residueObj.seqIndex + chainProxy.residueOffset;
                    addResidueExtraInfo(residueObj, residueProxy1);
                }, this);
            });
        }

        function addToHalfLinkList(crosslink, residueObjList) {
            residueObjList.forEach(function (residueObj) {
                halfLinkList.push({
                    origId: crosslink.id,
                    linkId: halfLinkList.length,
                    residue: residueObj,
                });
            }, this);
        }

        const t = performance.now();

        // Make a copy of chainMap, and if distancesObj is initialised run through the proteins in chainMap
        // and remove the chains which are not permitted because of current assembly type choice.
        // Can save many calculations if assembly type is a smaller unit than the default pdb assembly type.
        // e.g. for assembly type BU1 or BU2 in 1AO6 only check chain combination A-A or B-B rather than all of A-A, A-B, B-A and B-B
        const chainMap = $.extend({}, this.get("chainMap"));
        const distObj = this.getCompositeModel().get("clmsModel").get("distancesObj");
        if (distObj) {
            const chainSet = distObj.permittedChainIndicesSet;
            d3.entries(chainMap).forEach(function (proteinEntry) {
                chainMap[proteinEntry.key] = proteinEntry.value.filter(function (chainEntry) {
                    return chainSet.has(chainEntry.index);
                });
            });
            //console.log ("chainMap", chainMap, chainSet);
        }

        // divide map of protein --> array of chains into two-deep map of protein --> model --> array of chains, in case we don't want to make links between different models
        const modelIndexedChainMap = modelUtils.makeSubIndexedMap(chainMap, "modelIndex");

        // d3.mapped and wrapped versions of chainMap and modelIndexedChainMap. Easier to use for some operations.
        const chainValueMap = d3.map();
        const modelIndexedChainValueMap = d3.map();
        d3.entries(chainMap).forEach(function (protEntry) {
            chainValueMap.set(protEntry.key, {values: protEntry.value});
        });
        d3.entries(modelIndexedChainMap).forEach(function (protEntry) {
            modelIndexedChainValueMap.set(protEntry.key, d3.map(protEntry.value, function (d) {
                return d.key;
            }));
        });

        console.log("CHAINS", chainMap, chainValueMap, modelIndexedChainMap, modelIndexedChainValueMap);
        const allowInterModelDistances = this.get("allowInterModelDistances");

        const octAccessorObj = {
            id: function (d) {
                return d;
            },
            x: function (d) {
                return d.coords[0];
            },
            y: function (d) {
                return d.coords[1];
            },
            z: function (d) {
                return d.coords[2];
            },
        };
        const tieBreakerFunc = DistancesObj.prototype.tieBreaker;

        crosslinkArr.forEach(function (xlink) {
            // Check from chain - to chain pairings for valid crosslink possibilities.
            // Where inter-model links barred, divide from and to chains into sets per model and
            // loop through the pairings in subsets.
            const fromProtID = xlink.fromProtein.id;
            const toProtID = xlink.toProtein.id;

            const fromPerModelChains = allowInterModelDistances ? [chainValueMap.get(fromProtID)] : modelIndexedChainMap[fromProtID];
            const toPerModelChains = modelIndexedChainMap[toProtID];

            const fromEmpty = _.isEmpty(fromPerModelChains);
            const toEmpty = _.isEmpty(toPerModelChains);
            // Don't continue if neither end of crosslink within pdb
            if (!fromEmpty && !toEmpty) {

                // get a map (key -> value) of the toPerModelChains entries
                const toPerModelChainMap = modelIndexedChainValueMap.get(toProtID);
                const toChainMap = chainValueMap.get(toProtID);

                const octreeIgnoreFunc = function (point1, point2) {
                    return NGLUtils.not3DHomomultimeric(xlink, point1.chainIndex, point2.chainIndex);
                };

                fromPerModelChains.forEach(function (fromPerModelChainEntry) {
                    // If inter-model links allowed, pick all toChains, else pick only toChains
                    // with same modelID as current set of fromModelChains
                    const toChains = allowInterModelDistances ? toChainMap : toPerModelChainMap.get(fromPerModelChainEntry.key);

                    //console.log ("XLINK CHAINS", xlink.id, fromPerModelChains, toPerModelChains);

                    if (toChains) { // don't proceed if inter model distances barred and no 'to' chains within current model

                        let fromPDBResidues = makePDBIndexedResidues(fromPerModelChainEntry, xlink.fromResidue, fromProtID);
                        let toPDBResidues = makePDBIndexedResidues(toChains, xlink.toResidue, toProtID);
                        let alternativeCount = fromPDBResidues.length * toPDBResidues.length;
                        //console.log ("FTpdbr", fromPDBResidues, toPDBResidues, alternativeCount);

                        if (alternativeCount > 4) { // if more than a certain number of possible pairings whittle it down to the closest one
                            addAtomPoints.call(this, fromPDBResidues);
                            addAtomPoints.call(this, toPDBResidues);
                            let results = modelUtils.getMinimumDistance(fromPDBResidues, toPDBResidues, octAccessorObj, 2000, octreeIgnoreFunc);
                            results = results.filter(function (res) {
                                return res[2] !== undefined;
                            });
                            if (results.length) {
                                results.forEach(function (r) {
                                    r[2] = utils.toNearest(Math.sqrt(r[2]), 1);
                                });
                                //console.log ("res", results);

                                let prime = results[0];
                                results.forEach(function (res, i) {
                                    if (i > 0) {
                                        let d = prime[2] - res[2];
                                        if (d === 0) {
                                            d = tieBreakerFunc(prime[0], prime[1], res[0], res[1]);
                                        }
                                        if (d > 0) {
                                            prime = res;
                                        }
                                    }
                                });

                                //console.log ("aa", alternativeCount, results, prime);
                                fromPDBResidues = [prime[0]];  // take top result for new fromPDBResidues array
                                toPDBResidues = [prime[1]];    // take top result for new toPDBResidues array
                            } else {
                                alternativeCount = 0;   // no valid distances found
                            }
                        }

                        addResidueListsExtraInfo([fromPDBResidues, toPDBResidues]);

                        if (alternativeCount > 0) {
                            fromPDBResidues.forEach(function (fromPDB) {
                                toPDBResidues.forEach(function (toPDB) {
                                    if (NGLUtils.not3DHomomultimeric(xlink, toPDB.chainIndex, fromPDB.chainIndex)) {
                                        fullLinkList.push({
                                            origId: xlink.id,
                                            linkId: fullLinkList.length,
                                            residueA: fromPDB,
                                            residueB: toPDB,
                                        });
                                    }
                                }, this);
                            }, this);
                        } else {
                            // one or more of the residues isn't within a pdb-indexed portion of the protein
                            addToHalfLinkList(xlink, fromPDBResidues);
                            addToHalfLinkList(xlink, toPDBResidues);
                        }
                    }
                }, this);
            } else if (!toEmpty || !fromEmpty) {    // only one end of link in a pdb-indexed protein
                var toChains = chainValueMap.get(toProtID);
                const fromChains = chainValueMap.get(fromProtID);

                // One of these residue lists will be empty
                var fromPDBResidues = makePDBIndexedResidues(fromChains, xlink.fromResidue, fromProtID);
                var toPDBResidues = makePDBIndexedResidues(toChains, xlink.toResidue, toProtID);
                addResidueListsExtraInfo([fromPDBResidues, toPDBResidues]);
                addToHalfLinkList(xlink, fromPDBResidues);
                addToHalfLinkList(xlink, toPDBResidues);
            }
        }, this);

        console.log("TIME", (performance.now() - t) / 1000, "seconds");
        //console.log ("fullLinklist", fullLinkList.length, fullLinkList);
        //console.log ("halfLinkList", halfLinkList);
        return {fullLinkList: fullLinkList, halfLinkList: halfLinkList};
    }

    setLinkListWrapped (linkDataObj) {
        const linkList = linkDataObj.fullLinkList;
        let halfLinkList = linkDataObj.halfLinkList;
        const residueIdToFullLinkIds = {};
        const residueIdToHalfLinkIds = {};
        const linkIdMap = {};
        const halfLinkIdMap = {};
        const residueIdMap = {};

        function insertResidue(residue, link, map) {
            const resID = residue.residueId;
            const list = map[resID];
            if (list === undefined) {
                map[resID] = [link.linkId];
            } else if (!_.includes(list, link.linkId)) {
                list.push(link.linkId);
            }
            residueIdMap[resID] = residue;
        }

        linkList.forEach(function (link) {
            linkIdMap[link.linkId] = link;
            insertResidue(link.residueA, link, residueIdToFullLinkIds);
            insertResidue(link.residueB, link, residueIdToFullLinkIds);
        });

        // remove half links that also have full link instances
        if (this.get("showShortestLinksOnly")) {
            const origFullLinkIDs = d3.set(_.pluck(linkList, "origId"));
            halfLinkList = halfLinkList.filter(function (halfLink) {
                return !origFullLinkIDs.has(halfLink.origId);
            });
        }

        halfLinkList.forEach(function (halfLink) {
            halfLinkIdMap[halfLink.linkId] = halfLink;
            insertResidue(halfLink.residue, halfLink, residueIdToHalfLinkIds);
        });

        // Useful maps for later work
        this._residueIdToFullLinkIds = residueIdToFullLinkIds;
        this._residueIdToHalfLinkIds = residueIdToHalfLinkIds;
        this._linkIdMap = linkIdMap;
        this._halfLinkIdMap = halfLinkIdMap;
        this._residueIdMap = residueIdMap;
        this._residueList = d3.values(residueIdMap);
        this._residueNGLIndexMap = _.indexBy(this._residueList, "NGLglobalIndex");
        this._fullLinkNGLIndexMap = {};
        linkList.forEach(function (link) {
            this._fullLinkNGLIndexMap[link.residueA.NGLglobalIndex + "-" + link.residueB.NGLglobalIndex] = link;
        }, this);

        this._halfLinkNGLIndexMap = {};
        halfLinkList.forEach(function (link) {
            this._halfLinkNGLIndexMap[link.residue.NGLglobalIndex] = link;
        }, this);


        this._origFullLinkCount = this.getOriginalCrossLinkCount(linkList);
        this._origHalfLinkCount = this.getOriginalCrossLinkCount(halfLinkList);

        //console.log ("setLinkList", residueIdMap, this._residueList, residueIdToFullLinkIds, linkIdMap);
        this.set("linkList", linkList);
        this.set("halfLinkList", halfLinkList);
    }

    getFullLinkCount () {
        return this._origFullLinkCount;
    }

    getFullLinks (residue) {
        return residue === undefined ? this.get("linkList") : this.getFullLinksByResidueID(residue.residueId);
    }

    getFullLinkCountByResidue (residue) {
        const linkIds = this._residueIdToFullLinkIds[residue.residueId];
        return linkIds ? linkIds.length : 0;
    }

    getFullLinksByResidueID (residueId) {
        const linkIds = this._residueIdToFullLinkIds[residueId];
        return linkIds ? linkIds.map(function (l) {
            return this._linkIdMap[l];
        }, this) : [];
    }

    getHalfLinkCount () {
        return this._origHalfLinkCount;
    }

    getHalfLinks (residue) {
        return residue === undefined ? this.get("halfLinkList") : this.getHalfLinksByResidueID(residue.residueId);
    }

    getHalfLinkCountByResidue (residue) {
        const linkIds = this._residueIdToHalfLinkIds[residue.residueId];
        return linkIds ? linkIds.length : 0;
    }

    getHalfLinksByResidueID (residueId) {
        const linkIds = this._residueIdToHalfLinkIds[residueId];
        return linkIds ? linkIds.map(function (l) {
            return this._halfLinkIdMap[l];
        }, this) : [];
    }

    getFullLinkByNGLResIndices (NGLGlobalResIndex1, NGLGlobalResIndex2) {
        return this._fullLinkNGLIndexMap[NGLGlobalResIndex1 + "-" + NGLGlobalResIndex2];
    }

    getHalfLinkByNGLResIndex (NGLGlobalResIndex1) {
        return this._halfLinkNGLIndexMap[NGLGlobalResIndex1];
    }

    getResidues (fullLink) {
        if (fullLink === undefined) {
            return this._residueList;
        } else if (Array.isArray(fullLink)) {
            const residues = [];
            fullLink.forEach(function (l) {
                residues.push(l.residueA, l.residueB); // push two values at once so don't use .map
            });
            return residues;
        } else {
            return [fullLink.residueA, fullLink.residueB];
        }
    }

    getHalfLinkResidues (halfLink) {
        if (halfLink === undefined) {
            const halfLink = this.getHalfLinks();
            var residues = [];
            halfLink.forEach(function (l) {
                residues.push(l.residue); // push two values at once so don't use .map
            });
            return residues;
        } else if (Array.isArray(halfLink)) {
            var residues = [];
            halfLink.forEach(function (l) {
                residues.push(l.residue); // push two values at once so don't use .map
            });
            return residues;
        } else {
            return [halfLink.residue];
        }
    }

    getSharedLinks (residueA, residueB) {
        const aLinks = this.getFullLinks(residueA);
        const bLinks = this.getFullLinks(residueB);
        const sharedLinks = modelUtils.intersectObjectArrays(aLinks, bLinks, function (l) {
            return l.linkId;
        });
        return sharedLinks.length ? sharedLinks : false;
    }

    getResidueByNGLGlobalIndex (nglGlobalResIndex) {
        return this._residueNGLIndexMap[nglGlobalResIndex];
    }

    hasResidue (residue) {
        return this._residueIdMap[residue.residueId] !== undefined;
    }

    hasLink (link) {
        return this._linkIdMap[link.linkId] !== undefined;
    }

    // Filter down a list of residue objects to those that are currently in the residueIdMap object
    getAvailableResidues (residues) {
        return residues.filter(function (r) {
            return this.hasResidue(r);
        }, this);
    }

    // Filter down a list of links to those that are currently in the linkIdMap object
    getAvailableLinks (linkObjs) {
        return linkObjs.filter(function (linkObj) {
            return this.hasLink(linkObj);
        }, this);
    }

    // Return original crosslinks from this model's link objects using origId property value
    getOriginalCrossLinks (linkObjs) {
        const xlinks = this.getCompositeModel().get("clmsModel").get("crosslinks");
        return linkObjs.map(function (linkObj) {
            return xlinks.get(linkObj.origId);
        });
    }

    getOriginalCrossLinkCount (linkObjs) {
        return d3.set(_.pluck(linkObjs, "origId")).size();
    }

    // Return an array of atom pair indices (along with original link id) for a given array of crosslink objects
    getAtomPairsFromLinkList (linkList) {
        const atomPairs = [];

        if (linkList) {
            if (linkList === "all") {
                linkList = this.getFullLinks();
            }

            linkList.forEach(function (link) {
                const atomA = this.getAtomIndexFromResidueObj(link.residueA);
                const atomB = this.getAtomIndexFromResidueObj(link.residueB);

                if (atomA !== undefined && atomB !== undefined) {
                    atomPairs.push([atomA, atomB, link.origId]);
                } else {
                    utils.xilog("dodgy pair", link);
                }
            }, this);
            //utils.xilog ("getAtomPairs", atomPairs);
        }

        return atomPairs;
    }

    getAtomPairsFromResidue (residue) {
        return this.getAtomPairsFromLinkList(this.getFullLinks(residue));
    }

    getChainInfo () {
        let resCount = 0;
        const viableChainIndices = [];
        const self = this;
        //console.log ("strcutcomp", this.get("structureComp").structure);
        this.get("structureComp").structure.eachChain(function (cp) {
            // Don't include chains which are tiny or ones we can't match to a protein
            if (NGLUtils.isViableChain(cp) && self.get("reverseChainMap").get(cp.index)) {
                resCount += cp.residueCount;
                viableChainIndices.push(cp.index);
            }
        });
        return {
            viableChainIndices: viableChainIndices,
            resCount: resCount
        };
    }

    calculateAllCaAtomIndices (chainIndices) {
        const structure = this.get("structureComp").structure;
        const chainProxy = structure.getChainProxy();
        const atomProxy = structure.getAtomProxy();
        const sele = new NGL.Selection();
        const chainCAtomIndices = {}; // keys on chain index, and within this keys on residue index

        if (chainIndices) {
            chainIndices.forEach(function (ci) {
                chainProxy.index = ci;
                const atomIndices = chainCAtomIndices[ci] = [];
                // 918 in 5taf matches to just one atom, which isn't a carbon, dodgy pdb?

                const sel = NGLUtils.getRangedCAlphaResidueSelectionForChain(chainProxy);
                sele.setString(sel, true); // true = doesn't fire unnecessary dispatch events in ngl
                const ai = structure.getAtomIndices(sele);

                // Building a resmap in one loop and then running through available residues in another loop because some (errored) residues don't have c-alpha atoms
                // This shouldn't happen, but it does i.e. 5taf, so a 1-to-1 loop between residues and atomIndices wouldn't work in all cases
                const resMap = [];
                ai.forEach(function (atomIndex) {
                    atomProxy.index = atomIndex;
                    resMap[atomProxy.resno] = atomIndex;
                }, this);

                // resno can run from N to M, but atomIndices will be ordered 0 to no. of residues
                chainProxy.eachResidue(function (rp) {
                    //console.log ("RP", rp.resno, rp.index);
                    const atomIndex = resMap[rp.resno];
                    atomIndices.push(atomIndex);
                });
            }, this);
        }

        this.set("chainCAtomIndices", chainCAtomIndices); // store for later
        return chainCAtomIndices;
    }

    getChainDistances (linksOnly) {
        const entries = d3.entries(this.get("chainCAtomIndices"));
        const matrixMap = {};
        const links = this.getFullLinks();

        entries.forEach(function (chain1Entry) {
            const chain1 = chain1Entry.key;
            const cindices1 = chain1Entry.value;

            entries.forEach(function (chain2Entry) {
                const chain2 = chain2Entry.key;
                const cindices2 = chain2Entry.value;

                matrixMap[chain1 + "-" + chain2] = {
                    chain1: chain1,
                    chain2: chain2,
                    isSymmetric: chain1 === chain2,
                    linksOnly: linksOnly,
                    size: [cindices1.length, cindices2.length],
                    distanceMatrix: linksOnly ?
                        this.getLinkDistancesBetween2Chains(cindices1, cindices2, +chain1, +chain2, links) :
                        this.getAllDistancesBetween2Chains(cindices1, cindices2, chain1, chain2)
                };
            }, this);
        }, this);

        return matrixMap;
    }

    getChainLength (chainIndex) {
        const chain = this.get("chainCAtomIndices")[chainIndex];
        return chain ? chain.length : undefined;
    }

    getLinkDistancesBetween2Chains (chainAtomIndices1, chainAtomIndices2, chainIndex1, chainIndex2, links) {

        const notHomomultimeric = function (xlinkID, c1, c2) {
            const xlink = this.getCompositeModel().get("clmsModel").get("crosslinks").get(xlinkID);
            return NGLUtils.not3DHomomultimeric(xlink, c1, c2);
        };

        links = links.filter(function (link) {
            return (link.residueA.chainIndex === chainIndex1 && link.residueB.chainIndex === chainIndex2 && notHomomultimeric.call(this, link.origId, chainIndex1, chainIndex2))
                /*||
                               (link.residueA.chainIndex === chainIndex2 && link.residueB.chainIndex === chainIndex1)*/
                ;
            // The reverse match condition produced erroneous links i.e. link chain3,49 to chain 2,56 also passed chain3,56 to chain2,49
        }, this);

        const matrix = [];
        const struc = this.get("structureComp").structure;
        const ap1 = struc.getAtomProxy();
        const ap2 = struc.getAtomProxy();

        links.forEach(function (link) {
            const idA = link.residueA.seqIndex;
            const idB = link.residueB.seqIndex;
            ap1.index = chainAtomIndices1[idA];
            ap2.index = chainAtomIndices2[idB];
            if (ap1.index !== undefined && ap2.index !== undefined) {
                const d = this.getAtomProxyDistance(ap1, ap2);
                //console.log ("link", link, chainIndex1, chainIndex2, idA, idB, ap1.index, ap2.index, d);
                matrix[idA] = matrix[idA] || [];
                matrix[idA][idB] = matrix[idA][idB] || [];
                matrix[idA][idB] = d;
            }
        }, this);

        return matrix;
    }

    getAllDistancesBetween2Chains (chainAtomIndices1, chainAtomIndices2, chainIndex1, chainIndex2) {
        const matrix = [];
        const struc = this.get("structureComp").structure;
        const ap1 = struc.getAtomProxy();
        const ap2 = struc.getAtomProxy();
        const cai2length = chainAtomIndices2.length;
        const diffChains = (chainIndex1 !== chainIndex2);

        for (let n = 0; n < chainAtomIndices1.length; n++) {
            ap1.index = chainAtomIndices1[n];
            const ap1undef = (ap1.index === undefined);
            const row = matrix[n] = [];
            for (let m = 0; m < cai2length; m++) {
                if (m !== n || diffChains) {
                    ap2.index = chainAtomIndices2[m];
                    row.push((ap1undef || ap2.index === undefined) ? undefined : this.getAtomProxyDistance(ap1, ap2));
                } else {
                    row.push(0);
                }
            }
        }

        return matrix;
    }

    getAtomCoordinates (atomProxy) {
        return [atomProxy.x, atomProxy.y, atomProxy.z];
    }

    getAtomProxyDistance (ap1, ap2) {
        return ap1.modelIndex === ap2.modelIndex || this.get("allowInterModelDistances") ? ap1.distanceTo(ap2) : undefined;
    }

    // Residue indexes for this function start from zero per chain i.e. not global NGL index for residues
    getAtomIndex (seqIndex, chainIndex, chainAtomIndices) {
        const cai = chainAtomIndices || this.get("chainCAtomIndices");
        const ci = cai[chainIndex];
        const ai = ci[seqIndex];
        return ai;
    }

    // seqIndex1 and 2 are 0-indexed, with zero being first residue in pdb chain
    getSingleDistanceBetween2Residues (seqIndex1, seqIndex2, chainIndex1, chainIndex2) {
        const struc = this.get("structureComp").structure;
        const ap1 = struc.getAtomProxy();
        const ap2 = struc.getAtomProxy();
        const cai = this.get("chainCAtomIndices");
        ap1.index = this.getAtomIndex(seqIndex1, chainIndex1, cai);
        ap2.index = this.getAtomIndex(seqIndex2, chainIndex2, cai);

        return this.getAtomProxyDistance(ap1, ap2);
    }

    // make an array of pdb file compatible link entries for the supplied crosslink objects
    getAtomPairsAndDistancesFromLinkList (links) {
        const struc = this.get("structureComp").structure;
        const ap1 = struc.getAtomProxy();
        const ap2 = struc.getAtomProxy();
        const atomPairs = this.getAtomPairsFromLinkList(links);

        atomPairs.forEach(function (pair) {
            ap1.index = pair[0];
            ap2.index = pair[1];
            if (ap1.index !== undefined && ap2.index !== undefined) {
                pair.push(this.getAtomProxyDistance(ap1, ap2));
            }
        }, this);

        return atomPairs;
    }

    getPDBLinkString (links) {
        const pdbLinks = [];
        const struc = this.get("structureComp").structure;
        const ap = struc.getAtomProxy();
        const linkFormat = 'LINK        %-4s %-3s %1s%4d                %-4s %-3s %1s%4d   %6s %6s %5.2f';

        links.forEach(function (link) {
            const res1 = link.residueA;
            const res2 = link.residueB;
            const atomIndex1 = this.getAtomIndexFromResidueObj(res1);
            const atomIndex2 = this.getAtomIndexFromResidueObj(res2);
            ap.index = atomIndex1;
            const atomName1 = ap.atomname;
            const resName1 = ap.resname;
            const resSeq1 = ap.resno;
            const chainID1 = ap.chainname;
            ap.index = atomIndex2;
            const atomName2 = ap.atomname;
            const resName2 = ap.resname;
            const resSeq2 = ap.resno;
            const chainID2 = ap.chainname;

            const sym1 = "      ";
            const sym2 = "      ";
            const distance = Math.min(99.99, this.getSingleDistanceBetween2Residues(res1.seqIndex, res2.seqIndex, res1.chainIndex, res2.chainIndex));

            pdbLinks.push(sprintf(linkFormat, atomName1, resName1, chainID1, resSeq1, atomName2, resName2, chainID2, resSeq2, sym1, sym2, distance));
        }, this);

        return pdbLinks.join("\n");
    }

    getPDBConectString (links) {  // Conect is spelt right
        const pdbConects = [];
        const atomPairs = this.getAtomPairsFromLinkList(links);
        const conectFormat = 'CONECT%5d%5d                                                                ';
        atomPairs.sort(function (a, b) {
            return a[0] - b[0];
        });   // order by ascending first atompair index

        atomPairs.forEach(function (atomPair) {
            pdbConects.push(sprintf(conectFormat, atomPair[0], atomPair[1]));
        }, this);

        return pdbConects.join("\n");
    }

    getSelectionFromResidueList (resnoList, options) { // set allAtoms to true to not restrict selection to alpha carbon atoms
        // options are
        // allAtoms:true to not add on the AND .CA qualifier
        // chainsOnly:true when the resnoList only has chainIndices defined and no res
        options = options || {};
        let sele;

        // If no resnoList or is empty array make selection 'none'
        if (!resnoList || (Array.isArray(resnoList) && !resnoList.length)) {
            sele = "none";
        } else {
            // if resnoList == 'all' replace it with array of all residues
            if (resnoList === "all") {
                resnoList = this.getResidues();
            }

            // if resnoList is single item, make it an array of the single item
            if (!Array.isArray(resnoList)) {
                resnoList = [resnoList];
            }

            const cp = this.get("structureComp").structure.getChainProxy();

            // new way (faster ngl interpretation for big selections!)
            const modelTree = d3.map();
            const tmp = resnoList.map(function (r) {
                cp.index = r.chainIndex;

                // Make a hierarchy of models --> chains --> residues to build a string from later
                let modelBranch = modelTree.get(cp.modelIndex);
                if (!modelBranch) {
                    var a = new d3.map();
                    modelTree.set(cp.modelIndex, a);
                    modelBranch = a;
                }

                let chainBranch = modelBranch.get(cp.chainname);
                if (!chainBranch) {
                    var a = new d3.set();
                    modelBranch.set(cp.chainname, a);
                    chainBranch = a;
                }

                chainBranch.add(r.resno);

                // randomiser
                /*
                var rsele = Math.ceil (Math.random() * cp.residueCount);    // random for testing
                chainBranch.add (rsele);
                if (cp.chainname) { rsele += ":" + cp.chainname; }
                if (cp.modelIndex !== undefined) { rsele += "/" + cp.modelIndex; }
                return rsele;
                */
            });

            //sele = "( " + tmp.join(" OR ") + " ) AND .CA";    // old way, much slower parsing by ngl -4500ms for 3jco
            //console.log ("sele", sele);
            //console.log ("MODELTREE", modelTree);

            // Build an efficient selection string out of this tree i.e. don't repeat model and chain values for
            // every residue, group the relevant residues together and surround with a bracket
            const modParts = modelTree.entries().map(function (modelEntry) {
                const modelBranch = modelEntry.value;
                const perChainResidues = modelBranch.entries().map(function (chainEntry) {
                    const chainBranch = chainEntry.value;
                    // selection syntax picks up ":123" as residue 123 in chain "empty name" (no, it doesn't - CC, 20/04/21), but ": AND 123" doesn't work.
                    // Similarly ":/0 " works but "/0 AND :" doesn't.
                    // Shouldn't have many pdbs with empty chain names though.
                    if (chainEntry.key) {
                        let vals = chainBranch.values();
                        if (options.chainsOnly) {
                            return ":" + chainEntry.key;
                        } else if (vals.length === 1) {
                            return "( " + vals[0] + ":" + chainEntry.key + " )"; // if single val, chain:resno is quicker
                        } else {
                            vals = modelUtils.joinConsecutiveNumbersIntoRanges(vals);
                            return "( :" + chainEntry.key + " AND (" + vals.join(" OR ") + ") )";
                        }
                    } else {
                        if (options.chainsOnly) {
                            return ":/" + modelEntry.key;
                        }
                        const emptyChainNameRes = chainBranch.values().map(function (resVal) {
                            return resVal + ":";
                        });
                        return "( " + emptyChainNameRes.join(" OR ") + " )";
                    }
                }, this);
                return "( /" + modelEntry.key + " AND (" + perChainResidues.join(" OR ") + ") )";
            }, this);

            sele = "(" + modParts.join(" OR ") + " )" + (options.allAtoms || options.chainsOnly ? "" : " AND .CA");
            if (NGL.Debug) {
                console.log("SELE", sele);
            }
        }

        return sele;
    }


    getAtomIndexFromResidueObj (resObj) {
        const resno = resObj.resno;
        return resno !== undefined ? this.getAtomIndex(resObj.seqIndex, resObj.chainIndex) : undefined;
    }

    makeFirstAtomPerChainSelectionString (chainIndexSet) {
        const comp = this.get("structureComp").structure;
        const sels = [];
        comp.eachChain(function (cp) {
            // if chain longer than 10 resiudes and (no chainindexset present or chain index is in chainindexset)
            if (NGLUtils.isViableChain(cp) && (!chainIndexSet || chainIndexSet.has(cp.index))) {
                sels.push(cp.atomOffset);
            }
        });
        return "@" + sels.join(",");
    }

    // Get a NGL selection for chains listing only the chainIndices passed in as a property of chainItems
    makeChainSelectionString (chainItems) {
        let selectionString = "all";
        const showAll = chainItems.showAll || false;
        const chainIndices = chainItems.chainIndices || [];

        if (!showAll) {
            const chainList = chainIndices.map(function (chainIndex) {
                return {
                    chainIndex: chainIndex
                };
            });
            selectionString = this.getSelectionFromResidueList(chainList, {
                chainsOnly: true
            });
        }

        //utils.xilog ("CHAIN SELE", selectionString);
        return selectionString;
    }

    // Return chain indices covered by currently visible proteins
    getShowableChains (showAll) {
        const protMap = Array.from(this.getCompositeModel().get("clmsModel").get("participants").values()); //todo -tidy
        const prots = Array.from(protMap).filter(function (prot) {
            return !prot.hidden;
        }).map(function (prot) {
            return prot.id;
        });

        let chainIndices;
        if (protMap.length !== prots.length && !showAll) {
            chainIndices = prots.map(function (prot) {
                const protChains = this.get("chainMap")[prot] || [];
                return _.pluck(protChains, "index");
            }, this);
        } else {
            chainIndices = d3.values(this.get("chainMap")).map(function (chainValue) {
                return _.pluck(chainValue, "index");
            });
        }
        chainIndices = d3.merge(chainIndices);
        utils.xilog("SHOW CHAINS", chainIndices);
        return {
            showAll: showAll,
            chainIndices: chainIndices
        };
    }

    getAllResidueCoordsForChain (chainIndex) {
        const structure = this.get("structureComp").structure;
        const atomProxy = structure.getAtomProxy();
        const nglAtomIndices = this.get("chainCAtomIndices")[chainIndex] || [];
        const atomCoords = nglAtomIndices.map(function (atomIndex) {
            atomProxy.index = atomIndex;
            const coords = this.getAtomCoordinates(atomProxy);
            return coords;
        }, this);
        return atomCoords;
    }
}




export class DistancesObj {
    constructor(matrices, chainMap, structureName, residueCoords) {
        this.matrices = matrices;
        this.chainMap = chainMap;
        this.structureName = structureName;
        this.residueCoords = residueCoords;
        this.setAllowedChainNameSet (undefined, true);
    }

    tieBreaker (link1resA, link1resB, link2resA, link2resB) {
        let d;
        const mitotalDiff = (link1resA.modelIndex + link1resB.modelIndex) - (link2resA.modelIndex + link2resB.modelIndex);
        if (mitotalDiff) {
            d = mitotalDiff;
        } else {
            const citotalDiff = (link1resA.chainIndex + link1resB.chainIndex) - (link2resA.chainIndex + link2resB.chainIndex);
            if (citotalDiff) {
                d = citotalDiff;
            } else {
                const minDiff = Math.min(link1resA.chainIndex, link1resB.chainIndex) - Math.min(link2resA.chainIndex, link2resB.chainIndex);
                if (minDiff) {
                    d = minDiff;
                }
            }
        }
        return d;
    }

    getShortestLinkAlternatives (nglLinkWrappers, angstromAccuracy) {
        angstromAccuracy = angstromAccuracy || 1;
        const self = this;

        nglLinkWrappers.forEach (function (linkWrapper) {
            const distance = this.getXLinkDistanceFromPDBCoords(
                this.matrices, linkWrapper.residueA.seqIndex, linkWrapper.residueB.seqIndex, linkWrapper.residueA.chainIndex, linkWrapper.residueB.chainIndex
            );
            linkWrapper.distance = utils.toNearest (distance, angstromAccuracy);
        }, this);

        nglLinkWrappers = nglLinkWrappers.filter (function (wrappedLink) { return !isNaN (wrappedLink.distance); });

        const nestedLinks = d3.nest()
            .key(function (linkWrapper) {
                return linkWrapper.origId;
            })
            .sortValues(function (linkWrapper1, linkWrapper2) {
                const d = linkWrapper1.distance - linkWrapper2.distance;
                return (d < 0 ? -1 : (d > 0 ? 1 : self.tieBreaker(linkWrapper1.residueA, linkWrapper1.residueB, linkWrapper2.residueA, linkWrapper2.residueB)));
            })
            .entries(nglLinkWrappers)
        ;

        const shortestLinks = nestedLinks.map(function (group) {
            return group.values[0];
        });

        utils.xilog("nestedLinks", nglLinkWrappers, nestedLinks, shortestLinks);

        return shortestLinks;
    }

    getXLinkDistance (xlink, alignCollBB, options) {
        options = options || {};
        const average = options.average || false;
        const angstromAccuracy = options.angstromAccuracy || 1;
        const returnChainInfo = options.returnChainInfo || false;
        const chainInfo = returnChainInfo ? (average ? {
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
        const chainMap = this.chainMap;
        const matrices = this.matrices;
        const pid1 = options.realFromPid || xlink.fromProtein.id; // use pids if passed in by options as first choice
        const pid2 = options.realToPid || xlink.toProtein.id; // (intended as replacements for decoy protein ids)
        let chains1 = chainMap[pid1];
        let chains2 = chainMap[pid2];
        let minDist;
        let totalDist = 0;
        let distCount = 0;

        // only calc distance if seqIndex1 and seqIndex2 return non-negative values
        // might miss a few distances where the alignments could be matched quite closely i.e. for link A->C residue C could be matched to D here ABCD srch -> AB-D pdb
        // but this way dodges a lot of zero length distances when alignments have big gaps in them i.e. ABCDEFGHIJKLMNOP srch -> A------------P pdb
        // what positions would E and J be, what is the length between E and J?
        if (chains1 && chains2) {
            // No use looking at chain options currently barred by assembly type choice
            chains1 = chains1.filter (function (cid) { return this.permittedChainIndicesSet.has(cid.index); }, this);
            chains2 = chains2.filter (function (cid) { return this.permittedChainIndicesSet.has(cid.index); }, this);

            for (let n = 0; n < chains1.length; n++) {
                const chainIndex1 = chains1[n].index;
                const chainName1 = chains1[n].name;
                const alignId1 = NGLUtils.make3DAlignID(this.structureName, chainName1, chainIndex1);
                const seqIndex1 = alignCollBB.getAlignedIndex(xlink.fromResidue, pid1, false, alignId1, true) - 1; // -1 for ZERO-INDEXED
                const modelIndex1 = chains1[n].modelIndex;

                if (seqIndex1 >= 0) {
                    for (let m = 0; m < chains2.length; m++) {
                        const modelIndex2 = chains2[m].modelIndex;
                        if (modelIndex1 === modelIndex2 || options.allowInterModelDistances) {  // bar distances between models
                            const chainIndex2 = chains2[m].index;
                            const chainName2 = chains2[m].name;
                            const alignId2 = NGLUtils.make3DAlignID(this.structureName, chainName2, chainIndex2);
                            const seqIndex2 = alignCollBB.getAlignedIndex(xlink.toResidue, pid2, false, alignId2, true) - 1; // -1 for ZERO-INDEXED
                            // align from 3d to search index. seqindex is 0-indexed so -1 before querying
                            //utils.xilog ("alignid", alignId1, alignId2, pid1, pid2);

                            if (seqIndex2 >= 0 && NGLUtils.not3DHomomultimeric(xlink, chainIndex1, chainIndex2)) {
                                const dist = this.getXLinkDistanceFromPDBCoords(matrices, seqIndex1, seqIndex2, chainIndex1, chainIndex2);

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
        const distance = average ? (distCount ? totalDist / distCount : undefined) : minDist;

        // if chaininfo asked for then return an object else just return the distance
        return returnChainInfo ? {
            distance: distance,
            chainInfo: chainInfo
        } : distance;
    }

    // Get cross-link distance between two residues based on PDB-indexed positions
    // seqIndex1 and 2 are 0-based
    getXLinkDistanceFromPDBCoords (matrices, seqIndex1, seqIndex2, chainIndex1, chainIndex2) {
        let dist;
        if (this.permittedChainIndicesSet.has(chainIndex1) && this.permittedChainIndicesSet.has(chainIndex2)) {
            const distanceMatrix = matrices[chainIndex1 + "-" + chainIndex2].distanceMatrix;
            const minIndex = seqIndex1; // < seqIndex2 ? seqIndex1 : seqIndex2;
            if (distanceMatrix[minIndex] && distanceMatrix[minIndex][seqIndex2]) {
                const maxIndex = seqIndex2; // < seqIndex1 ? seqIndex1 : seqIndex2;
                dist = distanceMatrix[minIndex][maxIndex];
            } else {
                const sm = window.compositeModelInst.get("stageModel");
                dist = sm ? sm.getSingleDistanceBetween2Residues(seqIndex1, seqIndex2, chainIndex1, chainIndex2) : 0;
            }
        } else {
            dist = undefined;//Number.POSITIVE_INFINITY;
        }

        //utils.xilog ("dist", dist);
        return dist;
    }

    // options - withinProtein:true for no cross-protein sample links
    getSampleDistances (sampleLinkQuantity, crosslinkerSpecificityList, options) {
        options = options || {};
        const specificitySearchTotal = d3.sum(crosslinkerSpecificityList, function (rdata) {
            return rdata.searches.size;
        });
        utils.xilog("------ RANDOM DISTRIBUTION CALCS ------", crosslinkerSpecificityList);
        utils.xilog(crosslinkerSpecificityList, "STOTS", specificitySearchTotal, this, this.matrices);
        const sampleLinksPerSearch = Math.ceil(sampleLinkQuantity / specificitySearchTotal);

        const alignCollBB = window.compositeModelInst.get("alignColl");
        const clmsModel = window.compositeModelInst.get("clmsModel");

        const distanceableSequences = this.calcDistanceableSequenceData();
        const distanceableSequencesByProtein = d3.map(d3.nest().key(function (d) {
            return d.protID;
        }).entries(distanceableSequences), function (d) {
            return d.key;
        });
        utils.xilog("dsp", distanceableSequencesByProtein);

        const alignedTerminalIndices = this.calcAlignedTerminalIndices(distanceableSequencesByProtein, clmsModel, alignCollBB);
        utils.xilog("ati", alignedTerminalIndices);


        const sampleDists = []; // store for sample distances
        // For each crosslinker... (if no crosslinker specificities, then no random distribution can be or is calculated)
        crosslinkerSpecificityList.forEach (function (crosslinkerSpecificity) {

            const rmap = this.calcFilteredSequenceResidues(crosslinkerSpecificity, distanceableSequences, alignedTerminalIndices);

            // Now loop through the searches that use this crosslinker...
            crosslinkerSpecificity.searches.forEach(function(searchID) {
                const search = clmsModel.get("searches").get(searchID);
                const protIDs = search.participantIDSet;

                // Filter residue lists down to those that were in this search's proteins
                const srmap = rmap.map(function (dirMap) {
                    return (clmsModel.get("searches").size > 1) ? dirMap.filter(function (res) {
                        return protIDs.has(res.protID);
                    }) : dirMap;
                });

                // If crosslinker is homobifunctional then copy a second residue list same as the first
                if (!crosslinkerSpecificity.heterobi) {
                    srmap[1] = srmap[0];
                }
                utils.xilog("rr", searchID, srmap);

                // Now pick lots of pairings from the remaining residues, one for each end of the crosslinker, so one from each residue list
                const searchMeta = {
                    heterobi: crosslinkerSpecificity.heterobi,
                    linksPerSearch: sampleLinksPerSearch,
                    restrictToProtein: options.withinProtein || false,
                    restrictToChain: options.withinChain || false,
                    restrictToModel: options.withinModel || false,
                };
                this.generateSubDividedSampleDistancesBySearch(srmap, sampleDists, searchMeta);
            }, this);
        }, this);

        utils.xilog("RANDOM", sampleDists, "avg:", d3.sum(sampleDists) / (sampleDists.length || 1));
        utils.xilog("------ RANDOM DISTRIBUTION END ------");
        return sampleDists;
    }

    // Collect together sequence data that is available to do sample 3d distances on, by
    // 1. Filtering out chains which aren't admissible to calculate distances on
    // 2. Mapping the remaining 3d chain sequences to the search sequences
    // 3. Then extracting those sub-portions of the search sequence that the 3d sequences cover
    calcDistanceableSequenceData () {
        const alignCollBB = window.compositeModelInst.get("alignColl");

        let seqs = d3.entries(this.chainMap).map(function (chainEntry) {
            const protID = chainEntry.key;
            return chainEntry.value
                .filter(function (chain) {
                    return this.permittedChainIndicesSet.has(chain.index);
                }, this) // remove chains that are currently distance barred
                .map(function (chain) {
                    const alignID = NGLUtils.make3DAlignID(this.structureName, chain.name, chain.index);
                    const range = alignCollBB.getRangeAsSearchSeq(protID, alignID);
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
        utils.xilog("seqs", seqs);

        return seqs;
    }

    // n-terms and c-terms occur at start/end of proteins not peptides (as proteins are digested/split after cross-linking). dur.
    // Add protein terminals if within pdb chain ranges to alignedTerminalIndices array
    calcAlignedTerminalIndices (seqsByProt, clmsModel, alignCollBB) {
        const alignedTerminalIndices = {
            ntermList: [],
            ctermList: []
        };

        seqsByProt.entries().forEach(function(protEntry) {
            const protKey = protEntry.key;
            const participant = clmsModel.get("participants").get(protKey);
            const seqValues = protEntry.value.values;
            const termTypes = ["ntermList", "ctermList"];

            [1, participant.size + 1].forEach(function(searchIndex, i) {
                const alignedTerminalIndex = alignedTerminalIndices[termTypes[i]];
                let alignedPos = undefined;
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
    }

    // Make one or two lists of residues from distanceableSequences that could map to each end of a crosslinker.
    // If the crosslinker is not heterobifunctional we only do one as it'll be the same at both ends.
    calcFilteredSequenceResidues (crosslinkerSpecificity, distanceableSequences, alignedTerminalIndices) {
        const linkableResidueSets = crosslinkerSpecificity.linkables;
        const alignCollBB = window.compositeModelInst.get("alignColl");

        const rmaps = linkableResidueSets.map(function (linkableResSet) {  // might be >1 set, some linkers bind differently at each end (heterobifunctional)
            const all = linkableResSet.has("*") || linkableResSet.has("X") || linkableResSet.size === 0;
            const rmap = [];
            distanceableSequences.forEach(function (distSeq) {
                utils.xilog("distSeq", distSeq);
                const protID = distSeq.protID;
                const alignID = distSeq.alignID;
                const filteredSubSeqIndices = modelUtils.filterSequenceByResidueSet(distSeq.subSeq, linkableResSet, all);
                for (let m = 0; m < filteredSubSeqIndices.length; m++) {
                    const searchIndex = distSeq.first + filteredSubSeqIndices[m];
                    // assign if residue position has definite hit between search and pdb sequence, but not if it's a gap (even a single-letter gap).
                    // That's the same criteria we apply to saying a crosslink occurs in a pdb in the first place
                    // Justification: mapping hits between aaaa----------aaa and bbb-------bbb will map to nearest residue and give lots of zero
                    // length distances when both cross-link residues are '-'
                    const seqIndex = alignCollBB.getAlignedIndex(searchIndex, protID, false, alignID, true); // will be 1-indexed
                    if (seqIndex >= 0) {
                        const datum = {
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
                rmap.push.apply(rmap, alignedTerminalIndices.ctermList);
            }
            if (linkableResSet.has("NTERM")) {
                rmap.push.apply(rmap, alignedTerminalIndices.ntermList);
            }
            return rmap;
        }, this);

        if (rmaps.length === 1) { rmaps.push ([]); }    // add empty second array for non-heterobi crosslinkers

        utils.xilog ("rmaps", rmaps, linkableResidueSets);
        return rmaps;
    }

    makeChainIndexToModelIndexMap () {
        const cimimap = d3.map();
        d3.values(this.chainMap).forEach(function(value) {
            value.forEach(function(chainInfo) {
                cimimap.set(chainInfo.index, chainInfo.modelIndex);
            });
        });
        return cimimap;
    }

    // metaData.restrictToChain == true for sample distances internal to same PDB chain only
    // metaData.restrictToModel == true for sample distances internal to same PDB model only
    // metaData.restrictToProtein == true for sample distances internal to same protein only
    // Note: same protein may be present in multiple models
    generateSubDividedSampleDistancesBySearch (srmap, randDists, metaData, chainToModelMap) {

        chainToModelMap = chainToModelMap || this.makeChainIndexToModelIndexMap();
        //console.log ("chainMap", this.chainMap, chainToModelMap, srmap);
        // if not dividing random generation by chain or protein or model (or all model indices are the same), shortcut with the following
        if (!metaData.restrictToChain && !metaData.restrictToProtein && (!metaData.restrictToModel || d3.set(chainToModelMap.values()).size() === 1)) {
            this.generateSampleDistancesBySearch(srmap[0], srmap[1], randDists, metaData);
        } else {
            // Convenience: Divide into list per protein / chain / model for selecting intra-protein or intra-chain samples only
            const srmapPerProtChain = [{}, {}];
            const protChainSet = d3.set();
            srmap.forEach (function (dirMap, i) {
                const perProtChainMap = srmapPerProtChain[i];

                dirMap.forEach(function(res) {
                    const protID = res.protID;
                    const chainID = res.chainIndex;
                    let protChainID = metaData.restrictToProtein ? protID : "";
                    protChainID += metaData.restrictToChain ? "|" + chainID : "";
                    protChainID += metaData.restrictToModel ? "|" + chainToModelMap.get(chainID) : "";

                    const perProtChainList = perProtChainMap[protChainID];
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

            utils.xilog("intra spp", srmapPerProtChain);

            // Assign randoms to inter-protein links based on number of possible pairings
            // e.g. if proteinA-A is 100->100 residues and proteinB-B is 20->20 residues
            // then the possible pairings are 10,000 (100x100) and 400 (20x20) and the randoms are allocated in that proportion
            const proportions = d3.entries(srmapPerProtChain[0]).map(function (entry) {
                const key = entry.key;
                const quant1 = entry.value.length;
                const opp = srmapPerProtChain[1][key];
                return {
                    protChainID: entry.key,
                    possiblePairings: opp ? quant1 * opp.length : 0
                };
            });
            const total = d3.sum(proportions, function (d) {
                return d.possiblePairings;
            });
            const propMap = d3.map(proportions, function (d) {
                return d.protChainID;
            });

            //var samplesPerProtein = metaData.linksPerSearch / protSet.size();
            protChainSet.values().forEach(function(protChainID) {
                const samplesPerProtein = metaData.linksPerSearch / total * propMap.get(protChainID).possiblePairings;
                this.generateSampleDistancesBySearch(srmapPerProtChain[0][protChainID], srmapPerProtChain[1][protChainID], randDists, {
                    linksPerSearch: Math.floor(samplesPerProtein)
                });
            }, this);

            //console.log ("ppp", srmapPerProtChain, proportions, total, propMap);
        }
    }

    generateSampleDistancesBySearch (rowMap, columnMap, randDists, options) {
        const count = options.linksPerSearch;
        const rowCount = rowMap.length;
        const columnCount = columnMap.length;
        const possibleLinks = rowCount * columnCount;
        if (possibleLinks && count) { // can't do this if no actual residues pairings left, or no sample links requested (count == 0)
            const hop = Math.max(1, possibleLinks / count);
            const maxRuns = Math.min(possibleLinks, count);
            utils.xilog("hop", hop, "possible link count", possibleLinks, maxRuns);

            const residuesPerSide = Math.max(1, Math.round(Math.sqrt(count)));
            const residueRowIndices = d3.range(0, Math.min(rowCount, residuesPerSide)).map(function (r) {
                return Math.floor(rowCount / residuesPerSide * r);
            });
            const residueColumnIndices = d3.range(0, Math.min(columnCount, residuesPerSide)).map(function (c) {
                return Math.floor(columnCount / residuesPerSide * c);
            });

            //console.log ("rro", residueRowIndices, residueColumnIndices, count)

            const self = this;
            residueRowIndices.forEach(function(rri) {
                const res1 = rowMap[rri];
                residueColumnIndices.forEach(function(rci) {
                    const res2 = columnMap[rci];
                    const dist = self.getXLinkDistanceFromPDBCoords(self.matrices, res1.seqIndex - 1, res2.seqIndex - 1, res1.chainIndex, res2.chainIndex);
                    if (!isNaN(dist) && dist > 0) {
                        randDists.push(dist);
                    }
                });
            });
        }
    }

    setAssemblyChains (nglPdbStructure, assemblyKey) {
        const dictEntry = nglPdbStructure.biomolDict[assemblyKey];
        const chainNames = dictEntry ? d3.merge(_.pluck(dictEntry.partList, "chainList")) : [];
        if (!chainNames.length) {   // default - if chainNames empty, make chainNames all chains
            nglPdbStructure.eachChain(function(cp) {
                chainNames.push(cp.chainname);
            });
        }
        const chainNameSet = d3.set(chainNames);
        this.setAllowedChainNameSet (chainNameSet, false);

        return this;
    }

    // set of chain names that are allowed to be in distance calculations
    // needed as others are restricted by the assembly in the ngl model
    // If chainNameSet is undefined all chain names are permitted
    setAllowedChainNameSet (chainNameSet, isNewObj) {
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
            vent.trigger("recalcLinkDistances"); // this needs listened to and link distances updated before views listen to next trigger
            vent.trigger("PDBPermittedChainSetsUpdated", this.permittedChainIndicesSet);
        }

        return this;
    }
}

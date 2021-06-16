var CLMSUI = CLMSUI || {};

CLMSUI.NGLUtils = {
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
                //CLMSUI.utils.xilog ("structureComp", structureCompArray);
                structureCompArray.forEach(function (scomp, i) {   // give structure a name if none present (usually because loaded as local file)
                    scomp.structure.name = scomp.structure.name || self.pdbSettings[i].id;
                });

                let structureComp;
                if (structureCompArray.length > 1) {
                    //structureCompArray
                    const oldStructures = _.pluck(structureCompArray, "structure");
                    const combinedStructure = NGL.concatStructures.apply(NGL, ["concat"].concat(oldStructures));
                    CLMSUI.NGLUtils.copyEntities(combinedStructure, oldStructures);
                    CLMSUI.NGLUtils.makeChainToOriginalStructureIDMap(combinedStructure, oldStructures);
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
                        CLMSUI.vent.listenToOnce(CLMSUI.vent, "sequenceMatchingDone", function (matchMatrix) {
                            const pdbXiProtMap = CLMSUI.modelUtils.matrixPairings(matchMatrix, whichNGLSequences);
                            CLMSUI.utils.xilog("XI PAIRED", pdbXiProtMap);
                            sequenceMapsAvailable(pdbXiProtMap.concat(pdbUniProtMap));    // concat uniprot service and xi matched pdb-protein pairs
                        });
                        // the above sequenceMatchingDone event is triggered in matchSequencesToExistingProteins when these further alignments done, sync or async
                        CLMSUI.NGLUtils.matchSequencesToExistingProteins(protAlignCollection, whichNGLSequences, interactorArr,
                            function (sObj) {
                                return sObj.data;
                            }
                        );
                    }

                    const nglSequences = CLMSUI.NGLUtils.getChainSequencesFromNGLStructure(structureComp);
                    const interactorMap = compositeModel.get("clmsModel").get("participants");
                    var interactorArr = Array.from(interactorMap.values());

                    // If have a pdb code AND legal accession IDs use a web service in matchPDBChainsToUniprot to glean matches
                    // between ngl protein chains and clms proteins. This is asynchronous so we use a callback
                    // if (self.pdbSettings[0].pdbCode && CLMSUI.modelUtils.getLegalAccessionIDs(interactorMap).length) {
                    //     console.log("WEB SERVICE CALLED");
                    //     CLMSUI.NGLUtils.matchPDBChainsToUniprot(self.pdbSettings, nglSequences, interactorArr, function (uniprotMappingResults) {
                    //         CLMSUI.utils.xilog ("UniprotMapRes", uniprotMappingResults, nglSequences);
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

                        CLMSUI.utils.xilog("seqmap", sequenceMap);
                        //if (!_.isEmpty(sequenceMap)) {
                        const chainMap = {};
                        sequenceMap.forEach(function (pMatch) {
                            pMatch.data = pMatch.seqObj.data;
                            pMatch.name = CLMSUI.NGLUtils.make3DAlignID(structureComp.structure.name, pMatch.seqObj.chainName, pMatch.seqObj.chainIndex);
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
                        CLMSUI.utils.xilog("chainmap", chainMap, "stage", stage, "\nhas sequences", sequenceMap);

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
            if (CLMSUI.NGLUtils.isViableChain(c)) { // short chains are ions/water molecules, ignore
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

        CLMSUI.utils.xilog("seq", sequences);
        return sequences;
    },

    getChainSequencesFromNGLStage: function (stage) {
        const sequences = [];
        //console.log ("stage", stage);

        stage.eachComponent(function (comp) {
            sequences.push.apply(sequences, CLMSUI.NGLUtils.getChainSequencesFromNGLStructure(comp));
        });

        return sequences;
    },

    // Nice web-servicey way of doing ngl chain to clms protein matching (can be N-to-1)
    // Except it depends on having pdb codes, not a standalone file, and all the uniprot ids present too
    // Therefore, we need to return umatched sequences so we can fallback to using our own pairing algorithm if necessary
    matchPDBChainsToUniprot: function (pdbUris, nglSequences, interactorArr, callback) {

        let count = pdbUris.length;
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
            const map = d3.map();

            $(data).find("block").each(function (i, b) {
                const segArr = $(this).find("segment[intObjectId]");
                for (let n = 0; n < segArr.length; n += 2) {
                    const id1 = $(segArr[n]).attr("intObjectId");
                    const id2 = $(segArr[n + 1]).attr("intObjectId");
                    const pdbis1 = _.includes(id1, ".") || !id1.match(CLMSUI.utils.commonRegexes.uniprotAccession);
                    const unipdb = pdbis1 ? {
                        pdb: id1,
                        uniprot: id2
                    } : {
                        pdb: id2,
                        uniprot: id1
                    };
                    map.set(unipdb.pdb + "-" + unipdb.uniprot, unipdb);
                }
            });
            // sometimes there are several blocks for the same uniprot/pdb combination so had to map then take the values to remove duplicate pairings i.e. 3C2I
            // we calculate the alignment later on, this routine is purely to pair pdb chains to our proteins via uniprot accession numbers
            let mapArr = Array.from(map.values());
            CLMSUI.utils.xilog("PDB Service Map All", mapArr);

            if (callback) {
                const interactors = CLMSUI.modelUtils.filterOutDecoyInteractors(interactorArr);

                mapArr.forEach(function (mapping) {
                    const dotIndex = mapping.pdb.indexOf(".");
                    const pdbName = (dotIndex >= 0 ? mapping.pdb.slice(0, dotIndex) : mapping.pdb.slice(-1)).toLocaleLowerCase();
                    const chainName = dotIndex >= 0 ? mapping.pdb.slice(dotIndex + 1) : mapping.pdb.slice(-1); // bug fix 27/01/17
                    const matchSeqs = nglSequences.filter(function (seqObj) {
                        return seqObj.chainName === chainName && seqObj.structureID === pdbName;
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
                CLMSUI.utils.xilog("PDB Service Map Matched", mapArr);
                callback({uniprotMapped: mapArr, remaining: requireXiAlign});
            }
        }


        pdbUris.forEach(function (pdbUri) {
            alert(pdbUri.id);
            // https://1d-coordinates.rcsb.org/#1d-coordinates-api
            const url = 'https://1d-coordinates.rcsb.org/graphql?query=' + encodeURI('{ alignment(from:PDB_ENTITY, to:UNIPROT, queryId:"' + pdbUri.id.toString().toUpperCase() + '_1") { target_alignment { target_id aligned_regions { query_begin query_end target_begin target_end } } } }');
            // const query = "{alignment(from:NCBI_PROTEIN,to:PDB_ENTITY,queryId:"XP_642496"){target_alignment{target_id}}}"
            https://1d-coordinates.rcsb.org/graphql?query=%7Balignment(from:PDB_ENTITY,to:UNIPROT,queryId:%225lzv%22)%7Btarget_alignment%7Btarget_id%20aligned_regions%7Bquery_begin%20query_end%20target_begin%20target_end%7D%7D%7D%7D
            $.get(url, //"https://www.rcsb.org/pdb/rest/das/pdb_uniprot_mapping/alignment?query=" + pdbUri.id,
                function (data, status, xhr) {
                    if (status === "success" && (data.contentType === "text/xml" || data.contentType === "application/xml")) { // data is an xml fragment
                        dataArr.push(data);
                    } else { // usually some kind of error if reached here as we didn't detect xml
                        requireXiAlign.push(pdbUri);
                    }

                    count--;
                    if (count === 0) {
                        dealWithReturnedData(dataArr);
                    }
                }
            ).fail(function (jqxhr, status, error) {
                requireXiAlign.push(pdbUri);
                count--;
                if (count === 0) {
                    dealWithReturnedData(dataArr);
                }
            });
        });

    },

    // Fallback protein-to-pdb chain matching routines for when we don't have a pdbcode to query the pdb web services or it's offline or we still have sequences in the pdb unmatched to proteins
    matchSequencesToExistingProteins: function (protAlignCollection, sequenceObjs, proteins, extractFunc) {
        CLMSUI.utils.xilog("SEQS TO PAIR INTERNALLY", sequenceObjs);

        proteins = CLMSUI.modelUtils.filterOutDecoyInteractors(proteins)
            .filter(function (protein) {
                return protAlignCollection.get(protein.id);
            })
        ;
        const matchMatrix = {};
        const seqs = extractFunc ? sequenceObjs.map(extractFunc) : sequenceObjs;

        // Filter out repeated sequences to avoid costly realignment calculation of the same sequences
        const filteredSeqInfo = CLMSUI.modelUtils.filterRepeatedSequences(seqs);

        function finished(matchMatrix) {
            // inflate score matrix to accommodate repeated sequences that were found and filtered out above
            CLMSUI.vent.trigger("sequenceMatchingDone", CLMSUI.modelUtils.reinflateSequenceMap(matchMatrix, seqs, filteredSeqInfo));
        }

        function updateMatchMatrix(protID, alignResults) {
            const uniqScores = _.pluck(alignResults, "avgBitScore");  //eScore;
            matchMatrix[protID] = uniqScores;
        }

        const totalAlignments = filteredSeqInfo.uniqSeqs.length * proteins.length;
        CLMSUI.vent.trigger("alignmentProgress", "Attempting to match " + proteins.length + " proteins to " + seqs.length + " additional sequences.");

        const start = performance.now();
        // webworker way, only do if enough proteins and cores to make it worthwhile
        if ((!window || !!window.Worker) && proteins.length > 20 && workerpool.cpus > 2) {
            let count = proteins.length;
            const pool = workerpool.pool("js/align/alignWorker.js");

            proteins.forEach(function (prot, i) {
                const protAlignModel = protAlignCollection.get(prot.id);
                const settings = protAlignModel.getSettings();
                settings.aligner = undefined;
                pool.exec('protAlignPar', [prot.id, settings, filteredSeqInfo.uniqSeqs, {
                    semiLocal: true
                }])
                    .then(function (alignResultsObj) {
                        // be careful this is async, so protID better obtained from returned object - might not be prot.id
                        updateMatchMatrix(alignResultsObj.protID, alignResultsObj.fullResults)
                    })
                    .catch(function (err) {
                        console.log(err);
                    })
                    .then(function () {
                        count--;
                        if (count % 10 === 0) {
                            CLMSUI.vent.trigger("alignmentProgress", count + " proteins remaining to align.");
                            if (count === 0) {
                                pool.terminate(); // terminate all workers when done
                                console.log("tidy pool. TIME PAR", performance.now() - start);
                                finished(matchMatrix);
                            }
                        }
                    });
            });
        }
        // else do it on main thread
        else {
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
        }
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

        const dist = CLMSUI.modelUtils.getDistanceSquared(xyzToArray(boundingBox.min), xyzToArray(boundingBox.max));

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

    not3DHomomultimeric: function (crossLink, chain1ID, chain2ID) {
        return chain1ID !== chain2ID || !crossLink.confirmedHomomultimer;
    },
};

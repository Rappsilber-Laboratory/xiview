var CLMSUI = CLMSUI || {};

CLMSUI.NGLUtils = {
    repopulateNGL: function (pdbInfo) {
        //console.log ("pdbInfo", pdbInfo);
        this.pdbSettings = pdbInfo.pdbSettings;
        var stage = pdbInfo.stage;
        var compositeModel = pdbInfo.compositeModel;

        const self = this;

        console.log ("CLEAR STAGE");
        stage.removeAllComponents(); // necessary to remove old stuff so old sequences don't pop up in sequence finding

        function returnFailure(reason) {
            var id = _.pluck(self.pdbSettings, "id").join(", ");
            var emptySequenceMap = [];
            emptySequenceMap.failureReason = "Error for " + id + ", " + reason;
            compositeModel.trigger("3dsync", emptySequenceMap);
        }

        Promise.all (
            self.pdbSettings.map (function (pdbSetting) {
                return stage.loadFile (pdbSetting.uri, pdbSetting.params);
            })
        )
        //stage.loadFile(uri, params)
            .catch (function (reason) {
                returnFailure(reason);
            })
            .then (function (structureCompArray) {

                structureCompArray = structureCompArray || [];  // set to empty array if undefined to avoid error in next bit
                //CLMSUI.utils.xilog ("structureComp", structureCompArray);
                structureCompArray.forEach (function (scomp, i) {   // give structure a name if none present (usually because loaded as local file)
                    scomp.structure.name = scomp.structure.name || self.pdbSettings[i].id;
                });

                var structureComp;
                if (structureCompArray.length > 1) {
                    //structureCompArray
                    var oldStructures = _.pluck (structureCompArray, "structure");
                    var combinedStructure = NGL.concatStructures.apply (NGL, ["concat"].concat(oldStructures));
                    CLMSUI.NGLUtils.copyEntities (combinedStructure, oldStructures);
                    CLMSUI.NGLUtils.makeChainToOriginalStructureIDMap (combinedStructure, oldStructures);
                    //var cs = NGL.concatStructures ("concat", structureCompArray.map (function (sc) { return sc.structure; }));
                    var comp = stage.addComponentFromObject (combinedStructure);
                    comp.structure.title = _.pluck(oldStructures, "title").join(", ");
                    comp.structure.name = _.pluck(oldStructures, "name").join(", ");
                    structureComp = comp;
                } else {
                    structureComp = structureCompArray[0];
                }

                if (structureComp) {
                    // match by alignment func for searches where we don't know uniprot ids, don't have pdb codes, or when matching by uniprot ids returns no matches
                    function matchByXiAlignment (whichNGLSequences, pdbUniProtMap) {
                        var protAlignCollection = compositeModel.get("alignColl");
                        CLMSUI.vent.listenToOnce (CLMSUI.vent, "sequenceMatchingDone", function (matchMatrix) {
                            var pdbXiProtMap = CLMSUI.modelUtils.matrixPairings (matchMatrix, whichNGLSequences);
                            CLMSUI.utils.xilog ("XI PAIRED", pdbXiProtMap);
                            sequenceMapsAvailable (pdbXiProtMap.concat (pdbUniProtMap));    // concat uniprot service and xi matched pdb-protein pairs
                        });
                        // the above sequenceMatchingDone event is triggered in matchSequencesToExistingProteins when these further alignments done, sync or async
                        CLMSUI.NGLUtils.matchSequencesToExistingProteins (protAlignCollection, whichNGLSequences, interactorArr,
                            function(sObj) {
                                return sObj.data;
                            }
                        );
                    }

                    var nglSequences = CLMSUI.NGLUtils.getChainSequencesFromNGLStructure (structureComp);
                    var interactorMap = compositeModel.get("clmsModel").get("participants");
                    var interactorArr = CLMS.arrayFromMapValues(interactorMap);

                    // If have a pdb code AND legal accession IDs use a web service in matchPDBChainsToUniprot to glean matches
                    // between ngl protein chains and clms proteins. This is asynchronous so we use a callback
                    // if (pdbSettings[0].pdbCode && CLMSUI.modelUtils.getLegalAccessionIDs(interactorMap).length) {
                    //     console.log("WEB SERVICE CALLED");
                    //     CLMSUI.NGLUtils.matchPDBChainsToUniprot(pdbSettings, nglSequences, interactorArr, function (uniprotMappingResults) {
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
                        matchByXiAlignment (nglSequences, []);
                    // }

                    // bit to continue onto after ngl protein chain to clms protein matching has been done
                    function sequenceMapsAvailable (sequenceMap) {

                        CLMSUI.utils.xilog ("seqmap", sequenceMap);
                        //if (!_.isEmpty(sequenceMap)) {
                        var chainMap = {};
                        sequenceMap.forEach (function (pMatch) {
                            pMatch.data = pMatch.seqObj.data;
                            pMatch.name = CLMSUI.NGLUtils.make3DAlignID (structureComp.structure.name, pMatch.seqObj.chainName, pMatch.seqObj.chainIndex);
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
                        CLMSUI.utils.xilog ("chainmap", chainMap, "stage", stage, "\nhas sequences", sequenceMap);

                        if (compositeModel.get("stageModel")) {
                            compositeModel.get("stageModel").stopListening(); // Stop the following 3dsync event triggering stuff in the old stage model
                        }
                        var removeThese = compositeModel.get("stageModel") ? [compositeModel.get("stageModel").getStructureName()] : [];    // old alignments to remove
                        compositeModel.trigger("3dsync", sequenceMap, removeThese);
                        // Now 3d sequence is added we can make a new NGL Model wrapper (as it needs aligning)

                        // Make a new model and set of data ready for the ngl viewer
                        var newNGLModelWrapper = new CLMSUI.BackboneModelTypes.NGLModelWrapperBB();
                        newNGLModelWrapper.set({
                            structureComp: structureComp,
                            chainMap: chainMap,
                            compositeModel: compositeModel,
                            name: "NGLModelWrapper "+structureComp.structure.name,
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
        var sequences = [];
        var structure = structureComponent.structure;
        var chainToOriginalStructureMap = structure.chainToOriginalStructureIDMap || {};
        //console.log ("comp", structureComponent);

        structure.eachChain(function(c) {
            //console.log ("chain", c, c.residueCount, c.residueOffset, c.chainname, c.qualifiedName());
            if (CLMSUI.NGLUtils.isViableChain(c)) { // short chains are ions/water molecules, ignore
                var resList = [];
                c.eachResidue(function(r) {
                    resList.push(r.getResname1() || "X");
                });
                //esList = structure.getSequence (new NGL.Selection (c.qualifiedName()));
                var structureID = chainToOriginalStructureMap[c.index] || structure.name;

                sequences.push ({
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

        CLMSUI.utils.xilog ("seq", sequences);
        return sequences;
    },

    getChainSequencesFromNGLStage: function (stage) {
        var sequences = [];
        //console.log ("stage", stage);

        stage.eachComponent (function (comp) {
            sequences.push.apply (sequences, CLMSUI.NGLUtils.getChainSequencesFromNGLStructure (comp));
        });

        return sequences;
    },

    // Nice web-servicey way of doing ngl chain to clms protein matching (can be N-to-1)
    // Except it depends on having pdb codes, not a standalone file, and all the uniprot ids present too
    // Therefore, we need to return umatched sequences so we can fallback to using our own pairing algorithm if necessary
    matchPDBChainsToUniprot: function (pdbUris, nglSequences, interactorArr, callback) {

        var count = pdbUris.length;
        var dataArr = [];
        var requireXiAlign = [];

        /*
        function handleError(data, status) {
            console.log("error", data, status);
            var emptySequenceMap = [];
            emptySequenceMap.fail = true;
            callback(emptySequenceMap);
        }
        */

        function dealWithReturnedData (data) {
            var map = d3.map();

            $(data).find("block").each(function(i, b) {
                var segArr = $(this).find("segment[intObjectId]");
                for (var n = 0; n < segArr.length; n += 2) {
                    var id1 = $(segArr[n]).attr("intObjectId");
                    var id2 = $(segArr[n + 1]).attr("intObjectId");
                    var pdbis1 = _.includes(id1, ".") || !id1.match(CLMSUI.utils.commonRegexes.uniprotAccession);
                    var unipdb = pdbis1 ? {
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
            var mapArr = CLMS.arrayFromMapValues(map);
            CLMSUI.utils.xilog ("PDB Service Map All", mapArr);

            if (callback) {
                var interactors = CLMSUI.modelUtils.filterOutDecoyInteractors (interactorArr);

                mapArr.forEach(function(mapping) {
                    var dotIndex = mapping.pdb.indexOf(".");
                    var pdbName = (dotIndex >= 0 ? mapping.pdb.slice(0, dotIndex) : mapping.pdb.slice(-1)).toLocaleLowerCase();
                    var chainName = dotIndex >= 0 ? mapping.pdb.slice(dotIndex + 1) : mapping.pdb.slice(-1); // bug fix 27/01/17
                    var matchSeqs = nglSequences.filter (function(seqObj) {
                        return seqObj.chainName === chainName && seqObj.structureID === pdbName;
                    });
                    //console.log ("SEQOBJS", matchSeqs);
                    mapping.seqObj = matchSeqs[0];
                    var matchingInteractors = interactors.filter (function (i) {
                        var minLength = Math.min(i.accession.length, mapping.uniprot.length);
                        return i.accession.substr(0, minLength) === mapping.uniprot.substr(0, minLength);
                    });
                    mapping.id = _.isEmpty(matchingInteractors) ? "none" : matchingInteractors[0].id;
                });

                requireXiAlign = mapArr.filter(function(mapping) {
                    return mapping.id === "none" && mapping.seqObj;
                });
                mapArr = mapArr.filter(function(mapping) {
                    return mapping.id !== "none" && mapping.seqObj;
                });
                CLMSUI.utils.xilog ("PDB Service Map Matched", mapArr);
                callback ({uniprotMapped: mapArr, remaining: requireXiAlign});
            }
        }

        pdbUris.forEach (function (pdbUri) {
            $.get("https://www.rcsb.org/pdb/rest/das/pdb_uniprot_mapping/alignment?query=" + pdbUri.id,
                function(data, status, xhr) {
                    if (status === "success" && (data.contentType === "text/xml" || data.contentType === "application/xml")) { // data is an xml fragment
                        dataArr.push (data);
                    } else { // usually some kind of error if reached here as we didn't detect xml
                        requireXiAlign.push (pdbUri);
                    }

                    count--;
                    if (count === 0) {
                        dealWithReturnedData (dataArr);
                    }
                }
            ).fail(function(jqxhr, status, error) {
                requireXiAlign.push (pdbUri);
                count--;
                if (count === 0) {
                    dealWithReturnedData (dataArr);
                }
            });
        });

        /*
        $.get("https://www.rcsb.org/pdb/rest/das/pdb_uniprot_mapping/alignment?query=" + pdbCode,
            function(data, status, xhr) {

                if (status === "success" && (data.contentType === "text/xml" || data.contentType === "application/xml")) { // data is an xml fragment
                    dealWithReturnedData (data);
                } else { // usually some kind of error if reached here as we didn't detect xml
                    handleError(data, status);
                }
            }
        )
        */
    },

    // Fallback protein-to-pdb chain matching routines for when we don't have a pdbcode to query the pdb web services or it's offline or we still have sequences in the pdb unmatched to proteins
    matchSequencesToExistingProteins: function (protAlignCollection, sequenceObjs, proteins, extractFunc) {
        CLMSUI.utils.xilog ("SEQS TO PAIR INTERNALLY", sequenceObjs);

        proteins = CLMSUI.modelUtils.filterOutDecoyInteractors (proteins)
            .filter(function(protein) {
                return protAlignCollection.get(protein.id);
            })
        ;
        var matchMatrix = {};
        var seqs = extractFunc ? sequenceObjs.map(extractFunc) : sequenceObjs;

        // Filter out repeated sequences to avoid costly realignment calculation of the same sequences
        var filteredSeqInfo = CLMSUI.modelUtils.filterRepeatedSequences(seqs);

        function finished (matchMatrix) {
            // inflate score matrix to accommodate repeated sequences that were found and filtered out above
            CLMSUI.vent.trigger("sequenceMatchingDone", CLMSUI.modelUtils.reinflateSequenceMap (matchMatrix, seqs, filteredSeqInfo));
        }

        function updateMatchMatrix(protID, alignResults) {
            var uniqScores = _.pluck (alignResults, "avgBitScore");  //eScore;
            matchMatrix[protID] = uniqScores;
        }

        var totalAlignments = filteredSeqInfo.uniqSeqs.length * proteins.length;
        CLMSUI.vent.trigger("alignmentProgress", "Attempting to match " + proteins.length + " proteins to " + seqs.length + " additional sequences.");

        var start = performance.now();
        // webworker way, only do if enough proteins and cores to make it worthwhile
        if ((!window || !!window.Worker) && proteins.length > 20 && workerpool.cpus > 2) {
            var count = proteins.length;
            var pool = workerpool.pool("js/alignWorker.js");

            proteins.forEach(function(prot, i) {
                var protAlignModel = protAlignCollection.get(prot.id);
                var settings = protAlignModel.getSettings();
                settings.aligner = undefined;
                pool.exec('protAlignPar', [prot.id, settings, filteredSeqInfo.uniqSeqs, {
                        semiLocal: true
                    }])
                    .then(function(alignResultsObj) {
                        // be careful this is async, so protID better obtained from returned object - might not be prot.id
                        updateMatchMatrix(alignResultsObj.protID, alignResultsObj.fullResults)
                    })
                    .catch(function(err) {
                        console.log(err);
                    })
                    .then(function() {
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
            proteins.forEach(function(prot) {
                var protAlignModel = protAlignCollection.get(prot.id);
                // Only calc alignments for unique sequences, we can copy values for repeated sequences in the next bit
                var alignResults = protAlignModel.alignWithoutStoring(filteredSeqInfo.uniqSeqs, {
                    semiLocal: true
                });
                console.log("alignResults", /*alignResults,*/ prot.id); // printing alignResults uses lots of memory in console (prevents garbage collection)
                updateMatchMatrix(prot.id, alignResults)
            });

            finished(matchMatrix);
        }
    },

    make3DAlignID: function(baseID, chainName, chainIndex) {
        return baseID + ":" + chainName + ":" + chainIndex;
    },

    // this avoids going via the ngl functions using data in a chainMap
    getChainNameFromChainIndex: function(chainMap, chainIndex) {
        var chainsPerProt = d3.values(chainMap);
        var allChains = d3.merge(chainsPerProt);
        var matchChains = allChains.filter(function(entry) {
            return entry.index === chainIndex;
        });
        return matchChains[0] ? matchChains[0].name : undefined;
    },

    getRangedCAlphaResidueSelectionForChain: function(chainProxy) { // chainProxy is NGL Object
        var min, max;
        chainProxy.eachResidue(function(rp) {
            var rno = rp.resno;
            if (!min || rno < min) {
                min = rno;
            }
            if (!max || rno > max) {
                max = rno;
            }
        });

        // The New Way - 0.5s vs 21.88s OLD (individual resno's rather than min-max)
        var sel = ":" + chainProxy.chainname + "/" + chainProxy.modelIndex + " AND " + min + "-" + max + ".CA";
        return sel;
    },

    getReasonableDistanceLimit: function (nglStageModel) {
        //var showableChains = nglStageModel.getShowableChains (false);
        var chainSele;  // = nglStageModel.makeChainSelectionString(showableChains);
        var boundingBox = nglStageModel.get("structureComp").getBoxUntransformed(chainSele);
        function xyzToArray (xyz) {
            return [xyz.x, xyz.y, xyz.z];
        }
        var dist = CLMSUI.modelUtils.getDistanceSquared (xyzToArray (boundingBox.min), xyzToArray (boundingBox.max));

        return Math.sqrt (dist);
    },

    // test to ignore short chains and those that aren't polymer chains (such as water molecules)
    isViableChain: function(chainProxy) {
        //console.log ("cp", chainProxy.entity, chainProxy.residueCount, chainProxy);
        // should be chainProxy.entity.isPolymer() but some hand-built ngl models muff these settings up
        return chainProxy.residueCount > 10 && (!chainProxy.entity || (!chainProxy.entity.isWater() && !chainProxy.entity.isMacrolide()));
    },

    exportPDB: function (structure, nglModelWrapper, name, remarks) {
        var PDBLinks = nglModelWrapper.getPDBLinkString (nglModelWrapper.getFullLinks());
        var PDBConects = nglModelWrapper.getPDBConectString (nglModelWrapper.getFullLinks());
        //console.log ("ATOMPAIRS", PDBLinks, PDBConects);
        var PDBRemarks = remarks.map (function (remark) { return remark.match(/.{1,69}/g); });  // chop remarks into strings of max-length 69
        PDBRemarks = d3.merge (PDBRemarks);
        PDBRemarks.unshift ("");
        PDBRemarks = PDBRemarks.map (function (remark) { return "  3 "+remark; });

        var writer = new NGL.PdbWriter (structure, {renumberSerial: false, remarks: PDBRemarks});
        writer.oldGetData = writer.getData;
        writer.getData = function () {
            var data = this.oldGetData();
            var linkInsert = data.indexOf("\nMODEL") + 1;
            var conectInsert = data.lastIndexOf("END");
            return data.substring(0, linkInsert) + PDBLinks + "\n" + data.slice (linkInsert, conectInsert) + PDBConects + "\n" + data.slice(conectInsert);
        };

        writer.download (name || structure.name+"-Crosslinked");
    },

    exportPymolCrossLinkSyntax: function (structure, nglModelWrapper, name, remarks) {
        const crossLinks = nglModelWrapper.getFullLinks();
        const pymolLinks =  CLMSUI.NGLUtils.makePymolCrossLinkSyntax (structure, crossLinks, remarks);
        const fileName = downloadFilename ("pymol", "pml");
        download (pymolLinks.join("\r\n"), "plain/text", fileName);
    },

    makePymolCrossLinkSyntax: function (structure, links, remarks) {
        const pdbids = structure.chainToOriginalStructureIDMap || {};
        const cp = structure.getChainProxy();
        const rp = structure.getResidueProxy();

        const remarkLines = (remarks || []).map (function (remark) {
            return "# "+remark;
        });

        let pdbs = d3.set(d3.values(pdbids)).values();
        if (_.isEmpty (pdbs)) { pdbs = [structure.name]; }

        const localFile = typeof(this.pdbSettings[0].pdbCode) === "undefined";
        const pdbLines = pdbs.map (function (pdb) { return (localFile? "load " : "fetch ") + pdb + (localFile? "" : ", async=0"); });

        const crossLinkLines = links.map (function (link) {
            cp.index = link.residueA.chainIndex;
            var chainA = cp.chainname;
            cp.index = link.residueB.chainIndex;
            var chainB = cp.chainname;
            rp.index = link.residueA.NGLglobalIndex;
            var name1 = rp.qualifiedName().replace("/", ":");
            rp.index = link.residueB.NGLglobalIndex;
            var name2 = rp.qualifiedName().replace("/", ":");

            let pdbIdA = (pdbids[link.residueA.chainIndex] || structure.name);
            let pdbIdB = (pdbids[link.residueB.chainIndex] || structure.name);

            if (localFile) {
                pdbIdA = pdbIdA.replace(".pdb", "");
                pdbIdB = pdbIdB.replace(".pdb", "");
            }

            return "distance "+name1+"-"+name2+
                ", resi "+link.residueA.resno+" and name CA and chain "+chainA+" and "+ pdbIdA+
                ", resi "+link.residueB.resno+" and name CA and chain "+chainB+" and "+ pdbIdB
            ;
        });

        const lines = remarkLines.concat(pdbLines, crossLinkLines);
        return lines;
    },

    export3dLinksCSV: function (structure, nglModelWrapper, name, selectedOnly) {
        const crosslinks = nglModelWrapper.getFullLinks();
        const linkExportArray =  CLMSUI.NGLUtils.make3dLinkSyntax (structure, crosslinks, nglModelWrapper, selectedOnly);
        const fileName = downloadFilename ("CSV_NGL", "csv");
        download (linkExportArray.join("\r\n"), "plain/text", fileName);
    },

    make3dLinkSyntax: function (structure, links, nglModelWrapper, selectedOnly) {
        const pdbIds = structure.chainToOriginalStructureIDMap || {};
        const chainProxy = structure.getChainProxy();
        const selectedLinkIds = nglModelWrapper.get("compositeModel").get("selection").map(l => l.id);
        const crosslinkMap = nglModelWrapper.get("compositeModel").get("clmsModel").get("crossLinks");

        const header = ["model,protein1,chain1,res1,protein2,chain2,res2,distance"];
        const crosslinkLines = [];
        for (let link of links){
            if (!selectedOnly || selectedLinkIds.indexOf(link.origId) !== -1) {
                chainProxy.index = link.residueA.chainIndex;
                const chainA = chainProxy.chainname;
                chainProxy.index = link.residueB.chainIndex;
                const chainB = chainProxy.chainname;
                // .getXLinkDistanceFromPDBCoords (matrices, seqIndex1, seqIndex2, chainIndex1, chainIndex2);
                const distObj = CLMSUI.compositeModelInst.get("clmsModel").get("distancesObj");

                const xiviewLink = crosslinkMap.get(link.origId);
                p1 = xiviewLink.fromProtein.accession;
                p2 = xiviewLink.toProtein.accession;

                crosslinkLines.push((pdbIds[link.residueA.chainIndex] || structure.name) + ","
                    + p1 + "," + chainA + "," + link.residueA.resno + ","
                    + p2 + "," + chainB + "," + link.residueB.resno + ","
                    + distObj.getXLinkDistanceFromPDBCoords(distObj.matrices, link.residueA.seqIndex, link.residueB.seqIndex, link.residueA.chainIndex, link.residueB.chainIndex));
            }
        }

        return header.concat(crosslinkLines);
    },

    exportChimeraPseudobonds: function (structure, nglModelWrapper, name, selectedOnly) {
        const chainProxy = structure.getChainProxy();
        const bondArray = [];
        const crosslinkMap = nglModelWrapper.get("compositeModel").get("clmsModel").get("crossLinks");
        const colorScheme = nglModelWrapper.get("compositeModel").get("linkColourAssignment");

        for (let link of nglModelWrapper.getFullLinks()){
            chainProxy.index = link.residueA.chainIndex;
            const chainA = chainProxy.chainname;
            chainProxy.index = link.residueB.chainIndex;
            const chainB = chainProxy.chainname;

            const xiviewLink = crosslinkMap.get(link.origId);
            const color = colorScheme.getColour(xiviewLink);

            bondArray.push("/" + chainA + ":" + link.residueA.resno + "@CA /"  + chainB + ":" + link.residueB.resno + "@CA " + color);
        }
        const fileName = downloadFilename ("ChimeraX", "pb");
        download (bondArray.join("\r\n"), "plain/text", fileName);
    },

    exportJWalk: function (structure, nglModelWrapper) {
        const chainProxy = structure.getChainProxy();
        const crosslinkLines = [];
        for (let link of nglModelWrapper.getFullLinks()){
            chainProxy.index = link.residueA.chainIndex;
            const chainA = chainProxy.chainname;
            chainProxy.index = link.residueB.chainIndex;
            const chainB = chainProxy.chainname;
            crosslinkLines.push(link.residueA.resno + "|" + chainA + "|"  + link.residueB.resno + "|" + chainB + "|" );
        }
        const fileName = downloadFilename ("jWalk", "txt");
        download (crosslinkLines.join("\r\n"), "plain/text", fileName);
    },


    exportXlinkAnalyzer: function (structure, nglModelWrapper, name, selectedOnly) {
        const csvFileName = downloadFilename ("xlinkAnalyzer_CSV", "csv");

        const json = {
            data:[{
                "fileGroup":{
                    "files":[
                        "./" + csvFileName
                    ]
                },
                "mapping":{
                },
                "name":"xiVIEW export",
                "type":"Xlink Analyzer"
            }],
            subcomplexes: [],
            subunits: [],
            xlinkanalyzerVersion:"1.1.1"
        };

        const xiViewProteins = nglModelWrapper.get("compositeModel").get("clmsModel").get("participants"); // ECMA map
        const mapping = json.data[0].mapping;

        for (let prot of xiViewProteins.values()) {
            if (!prot.is_decoy) {
                mapping[prot.id] = [prot.id];
            }
        }

        const chainProxy = structure.getChainProxy();
        const subunits = new Map();
        const crosslinkMap = nglModelWrapper.get("compositeModel").get("clmsModel").get("crossLinks");

        const header = ["Protein1,Protein2,AbsPos1,AbsPos2,score"];
        const crosslinkLines = [];
        for (let link of nglModelWrapper.getFullLinks()){
            chainProxy.index = link.residueA.chainIndex;
            const chainA = chainProxy.chainname;
            chainProxy.index = link.residueB.chainIndex;
            const chainB = chainProxy.chainname;

            const xiviewLink = crosslinkMap.get(link.origId);
            p1 = xiviewLink.fromProtein.id;
            p2 = xiviewLink.toProtein.id;

            crosslinkLines.push( p1 + "," + p2 + "," + link.residueA.resno + "," + link.residueB.resno + ",666");

            if (!subunits.has(chainA)){
                subunits.set(chainA, p1);
            }
            if (!subunits.has(chainB)){
                subunits.set(chainA, p2);
            }
        }

        //json.subunits = Array.from(subunits.keys());

        for (let subunit of subunits.entries()){
            const su = {
                "chainIds": [
                    subunit[0]
                ],
                "color": [
                    0.0,
                    0.0,
                    0.0,
                    1.0
                ],
                "domains": [],
                "info": {},
                "name": subunit[1],
                "selection": ":." + subunit[0]
            };
            json.subunits.push(su);
        }

        download (header.concat(crosslinkLines).join("\r\n"), "plain/text", csvFileName);
        const jsonFileName = downloadFilename ("xlinkAnalyzer", "json");
        download (JSON.stringify(json, null, 4), "json", jsonFileName);
    },

    exportHaddockCrossLinkSyntax: function (structure, nglModelWrapper, name, remarks, crossLinkerObj) {
        var crossLinks = nglModelWrapper.getFullLinks();
        var haddockLinks = CLMSUI.NGLUtils.makeHaddockCrossLinkSyntax (structure, crossLinks, remarks, crossLinkerObj);
        var fileName = downloadFilename ("haddock", "tbl");
        download (haddockLinks.join("\r\n"), "plain/text", fileName);
    },

    makeHaddockCrossLinkSyntax: function (structure, links, remarks, crossLinkerObj) {
        //console.log ("CLO", crossLinkerObj);
        var str = ["zeroth", "first", "second", "third", "fourth", "fifth", "next"];
        var pdbids = structure.chainToOriginalStructureIDMap || {};

        var remarkLines = (remarks || []).map (function (remark) {
            return "! "+remark;
        });

        var crossLinkers = d3.values(crossLinkerObj.crossLinkerInfo);
        crossLinkers.push ({id: "default", name: "default", restraints: "12.0 10.0 18.0"});
        var restraints = d3.map (crossLinkers, function(d) { return d.id; });

        var pdbs = d3.set(d3.values(pdbids)).values();
        if (_.isEmpty (pdbs)) { pdbs = [structure.name]; }
        var pdbLines = pdbs.map (function (pdb, i) { return "! upload "+pdb+" as "+str[Math.min(i+1, 6)]+" file"; });

        var interModelLinks = links.filter (function (link) {
            return link.residueA.modelIndex != link.residueB.modelIndex;
        });

        var crossLinkLines = {};
        crossLinkers.forEach (function (clinker) { crossLinkLines[clinker.id] = ["! "+clinker.name+" based length restraints"]; });
        var origCrossLinks = crossLinkerObj.crossLinks;
        interModelLinks.forEach (function (link) {
            var origLink = origCrossLinks.get(link.origId);
            // get crosslinkers used by this crosslink
            var crossLinkerIDs =
                (origLink ? d3.set (origLink.filteredMatches_pp.map (function (match) { return match.match.crosslinker_id; })).values() : [])
                .map (function (clid) { return clid === "undefined" ? "default" : clid; })
            ;
            if (_.isEmpty (crossLinkerIDs)) { crossLinkerIDs = ["default"]; }

            // add a restraint line for each different crosslinker
            crossLinkerIDs.forEach (function (clid) {
                //console.log ("clid", clid, restraints);
                var clRestraints = restraints.get(clid).restraints || restraints.get("default").restraints;
                var line = "assign"+
                    " (segid "+String.fromCharCode(65+link.residueA.modelIndex)+" and name CA and resi "+link.residueA.resno+")"+
                    " (segid "+String.fromCharCode(65+link.residueB.modelIndex)+" and name CA and resi "+link.residueB.resno+")"+
                    " "+clRestraints
                ;
                crossLinkLines[clid].push (line);
            });
        });

        // merge all the lines together (this keeps them grouped by crosslinker, rather than crosslink)
        var allCrossLinkLines = d3.merge (d3.values(crossLinkLines));

        var lines = remarkLines.concat(pdbLines, allCrossLinkLines);
        return lines;
    },

    copyEntities: function (combinedStructure, originalStructures) {
        var gci = 0;

        originalStructures.forEach (function (s) {
            s.eachChain (function (cp) {
                var entity = cp.entity;
                var targetEntityIndex = combinedStructure.entityList.length;
                //structure.entityList.push (new NGL.Entity (
                //    structure, targetEntityIndex, entity.description, entity.type, [gci]
                //));
                combinedStructure.entityList.push (entity);

                var targetcp = combinedStructure.getChainProxy (gci);
                targetcp.entityIndex = targetEntityIndex;
                gci++;
            });
        });

        //console.log (combinedStructure.entityList);
    },

    makeChainToOriginalStructureIDMap: function (combinedStructure, originalStructures) {
        var gci = 0;
        var chainToOriginalStructureIDMap = [];

        originalStructures.forEach (function (s) {
            s.eachChain (function () {
                chainToOriginalStructureIDMap[gci] = s.name;
                gci++;
            });
        });

        combinedStructure.chainToOriginalStructureIDMap = chainToOriginalStructureIDMap;

        return chainToOriginalStructureIDMap;
    },

    exportMMCIF: function (structure, nglModelWrapper, name, remarks) {

    },

    not3DHomomultimeric: function(crossLink, chain1ID, chain2ID) {
        return chain1ID !== chain2ID || !crossLink.confirmedHomomultimer;
    },
};

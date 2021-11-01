import * as _ from "underscore";
import * as $ from "jquery";
// const workerpool = require('workerpool');
import {xilog} from "../../utils";
import {filterOutDecoyInteractors, filterRepeatedSequences, reinflateSequenceMap} from "../../modelUtils";
import d3 from "d3";
// import {DistancesObj} from "../../model/distances";//cyclic dependency, hack it into bottom of this file
// import {NGLModelWrapperBB} from "./ngl-wrapper-model"; // cyclic dependency, hack it into bottom of this file

export function getChainSequencesFromNGLStructure(structureComponent) {
    const sequences = [];
    const structure = structureComponent.structure;
    const chainToOriginalStructureMap = structure.chainToOriginalStructureIDMap || {};
    //console.log ("comp", structureComponent);

    structure.eachChain(function (c) {
        //console.log ("chain", c, c.residueCount, c.residueOffset, c.chainname, c.qualifiedName());
        if (isViableChain(c)) { // short chains are ions/water molecules, ignore
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

    xilog("seq", sequences);
    return sequences;
}

//exported for tests
export function getChainSequencesFromNGLStage(stage) {
    const sequences = [];
    //console.log ("stage", stage);

    stage.eachComponent(function (comp) {
        sequences.push.apply(sequences, getChainSequencesFromNGLStructure(comp));
    });

    return sequences;
}


// Nice web-servicey way of doing ngl chain to clms protein matching (can be N-to-1)
// Except it depends on having pdb codes, not a standalone file, and all the uniprot ids present too
// Therefore, we need to return umatched sequences so we can fallback to using our own pairing algorithm if necessary
function matchPDBChainsToUniprot(pdbUris, nglSequences, interactorArr, callback) {

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
        //         const pdbis1 = _.includes(id1, ".") || !id1.match(commonRegexes.uniprotAccession);
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
        xilog("PDB Service Map All", mapArr);

        if (callback) {
            const interactors = filterOutDecoyInteractors(interactorArr);

            mapArr.forEach(function (mapping) {
                const dotIndex = mapping.pdb.indexOf(".");
                const pdbName = (dotIndex >= 0 ? mapping.pdb.slice(0, dotIndex) : mapping.pdb.slice(-1)).toLocaleLowerCase();
                const chainName = dotIndex >= 0 ? mapping.pdb.slice(dotIndex + 1) : mapping.pdb.slice(-1); // bug fix 27/01/17
                const matchSeqs = nglSequences.filter(function (seqObj) {
                    return seqObj.chainName == chainName; //&& seqObj.structureID === pdbName;
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
            xilog("PDB Service Map Matched", mapArr);
            callback({uniprotMapped: mapArr, remaining: requireXiAlign});
        }
    }


    // pdbUris.forEach(function (pdbUri) {
    for (let nglSequence of nglSequences) {
        // alert(pdbUri.id);
        const pdbId = nglSequence.structureID.toUpperCase() + "." + nglSequence.chainName;
        const url = "https://1d-coordinates.rcsb.org/graphql?query=" + encodeURI("{ alignment(from:PDB_INSTANCE, to:UNIPROT, queryId:\""
            + pdbId + "\") { target_alignment { target_id } } }");
        $.get(url, //"https://www.rcsb.org/pdb/rest/das/pdb_uniprot_mapping/alignment?query=" + pdbUri.id,
            function (data, status, xhr) {
                if (status === "success") {//} && (data.contentType === "text/xml" || data.contentType === "application/xml")) { // data is an xml fragment

                    // console.log("YO:", url, data,  nglSequence.structureId + '.' + nglSequence.chainName );

                    const target_alignment = data.data.alignment.target_alignment;
                    if (target_alignment) {
                        const target = target_alignment[0].target_id;
                        dataArr.push({
                            pdb: nglSequence.structureID.toUpperCase() + "." + nglSequence.chainName,
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

}

// Fallback protein-to-pdb chain matching routines for when we don't have a pdbcode to query the pdb web services or it's offline or we still have sequences in the pdb unmatched to proteins
export function matchSequencesToExistingProteins(protAlignCollection, sequenceObjs, proteins, extractFunc) {
    xilog("SEQS TO PAIR INTERNALLY", sequenceObjs);

    proteins = filterOutDecoyInteractors(proteins)
        .filter(function (protein) {
            return protAlignCollection.get(protein.id);
        });
    const matchMatrix = {};
    const seqs = extractFunc ? sequenceObjs.map(extractFunc) : sequenceObjs;

    // Filter out repeated sequences to avoid costly realignment calculation of the same sequences
    const filteredSeqInfo = filterRepeatedSequences(seqs);

    function finished(matchMatrix) {
        // inflate score matrix to accommodate repeated sequences that were found and filtered out above
        window.vent.trigger("sequenceMatchingDone", reinflateSequenceMap(matchMatrix, seqs, filteredSeqInfo));
    }

    function updateMatchMatrix(protID, alignResults) {
        const uniqScores = _.pluck(alignResults, "avgBitScore");  //eScore;
        matchMatrix[protID] = uniqScores;
    }

    const totalAlignments = filteredSeqInfo.uniqSeqs.length * proteins.length;
    window.vent.trigger("alignmentProgress", "Attempting to match " + proteins.length + " proteins to " + seqs.length + " additional sequences.");

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
        updateMatchMatrix(prot.id, alignResults);
    });

    finished(matchMatrix);
    // }
}

//used by crosslinikrepresentaion, matrixview,
export function make3DAlignID(baseID, chainName, chainIndex) {
    return baseID + ":" + chainName + ":" + chainIndex;
}


//matrixview
// this avoids going via the ngl functions using data in a chainMap
export function getChainNameFromChainIndex(chainMap, chainIndex) {
    const chainsPerProt = d3.values(chainMap);
    const allChains = d3.merge(chainsPerProt);
    const matchChains = allChains.filter(function (entry) {
        return entry.index === chainIndex;
    });
    return matchChains[0] ? matchChains[0].name : undefined;
}


export function getRangedCAlphaResidueSelectionForChain(chainProxy) { // chainProxy is NGL Object
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
}

/*
function getReasonableDistanceLimit (nglStageModel) {
    //var showableChains = nglStageModel.getShowableChains (false);
    let chainSele;  // = nglStageModel.makeChainSelectionString(showableChains);
    const boundingBox = nglStageModel.get("structureComp").getBoxUntransformed(chainSele);

    function xyzToArray(xyz) {
        return [xyz.x, xyz.y, xyz.z];
    }

    const dist = getDistanceSquared(xyzToArray(boundingBox.min), xyzToArray(boundingBox.max));

    return Math.sqrt(dist);
}
*/

// test to ignore short chains and those that aren't polymer chains (such as water molecules)
export function isViableChain(chainProxy) {
    //console.log ("cp", chainProxy.entity, chainProxy.residueCount, chainProxy);
    // should be chainProxy.entity.isPolymer() but some hand-built ngl models muff these settings up
    return chainProxy.residueCount > 10 && (!chainProxy.entity || (!chainProxy.entity.isWater() && !chainProxy.entity.isMacrolide()));
}

export function copyEntities(combinedStructure, originalStructures) {
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
}

export function makeChainToOriginalStructureIDMap(combinedStructure, originalStructures) {
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
}

export function not3DHomomultimeric(crosslink, chain1ID, chain2ID) {
    return chain1ID !== chain2ID || !crosslink.confirmedHomomultimer;
}
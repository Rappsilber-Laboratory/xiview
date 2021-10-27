//used by pdbfilechooser, main, nglview
import * as _ from "underscore";
import * as NGL from "../../../vendor/ngl.dev";
import {matrixPairings} from "../../modelUtils";
import {xilog} from "../../utils";
import {
    copyEntities,
    getChainSequencesFromNGLStructure,
    make3DAlignID, makeChainToOriginalStructureIDMap,
    matchSequencesToExistingProteins
} from "./NGLUtils";
import {NGLModelWrapperBB} from "./NGLModelWrapperBB";

export const NGLUtils = {};


export function repopulateNGL(pdbInfo) {
    //console.log ("pdbInfo", pdbInfo);
    NGLUtils.pdbSettings = pdbInfo.pdbSettings;
    const stage = pdbInfo.stage;
    const compositeModel = pdbInfo.compositeModel;

    const self = this;

    console.log("CLEAR STAGE");
    stage.removeAllComponents(); // necessary to remove old stuff so old sequences don't pop up in sequence finding

    function returnFailure(reason) {
        const id = _.pluck(NGLUtils.pdbSettings, "id").join(", ");
        const emptySequenceMap = [];
        emptySequenceMap.failureReason = "Error for " + id + ", " + reason;
        compositeModel.trigger("3dsync", emptySequenceMap);
    }

    Promise.all(
        NGLUtils.pdbSettings.map(function (pdbSetting) {
            return stage.loadFile(pdbSetting.uri, pdbSetting.params);
        })
    )
        //stage.loadFile(uri, params)
        .catch(function (reason) {
            returnFailure(reason);
        })
        .then(function (structureCompArray) {

            structureCompArray = structureCompArray || [];  // set to empty array if undefined to avoid error in next bit
            //xilog ("structureComp", structureCompArray);
            structureCompArray.forEach(function (scomp, i) {   // give structure a name if none present (usually because loaded as local file)
                scomp.structure.name = scomp.structure.name || NGLUtils.pdbSettings[i].id;
            });

            let structureComp;
            if (structureCompArray.length > 1) {
                //structureCompArray
                const oldStructures = _.pluck(structureCompArray, "structure");
                const combinedStructure = NGL.concatStructures.apply(NGL, ["concat"].concat(oldStructures));
                copyEntities(combinedStructure, oldStructures);
                makeChainToOriginalStructureIDMap(combinedStructure, oldStructures);
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
                        const pdbXiProtMap = matrixPairings(matchMatrix, whichNGLSequences);
                        xilog("XI PAIRED", pdbXiProtMap);
                        sequenceMapsAvailable(pdbXiProtMap.concat(pdbUniProtMap));    // concat uniprot service and xi matched pdb-protein pairs
                    });
                    // the above sequenceMatchingDone event is triggered in matchSequencesToExistingProteins when these further alignments done, sync or async
                    matchSequencesToExistingProteins(protAlignCollection, whichNGLSequences, interactorArr,
                        function (sObj) {
                            return sObj.data;
                        }
                    );
                }

                const nglSequences = getChainSequencesFromNGLStructure(structureComp);
                const interactorMap = compositeModel.get("clmsModel").get("participants");
                const interactorArr = Array.from(interactorMap.values());

                // If have a pdb code AND legal accession IDs use a web service in matchPDBChainsToUniprot to glean matches
                // between ngl protein chains and clms proteins. This is asynchronous so we use a callback
                // if (pdbSettings[0].pdbCode && getLegalAccessionIDs(interactorMap).length) {
                //     console.log("WEB SERVICE CALLED");
                //     NGLUtils.matchPDBChainsToUniprot(pdbSettings, nglSequences, interactorArr, function (uniprotMappingResults) {
                //         xilog ("UniprotMapRes", uniprotMappingResults, nglSequences);
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

                    xilog("seqmap", sequenceMap);
                    //if (!_.isEmpty(sequenceMap)) {
                    const chainMap = {};
                    sequenceMap.forEach(function (pMatch) {
                        pMatch.data = pMatch.seqObj.data;
                        pMatch.name = make3DAlignID(structureComp.structure.name, pMatch.seqObj.chainName, pMatch.seqObj.chainIndex);
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
                    xilog("chainmap", chainMap, "stage", stage, "\nhas sequences", sequenceMap);

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
}
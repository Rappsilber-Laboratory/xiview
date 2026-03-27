//used by pdbfilechooser, main, nglview
import * as _ from "underscore";
import * as NGL from "ngl";
import {matrixPairings} from "../../modelUtils";
import {xilog} from "../../utils";
import {
    copyEntities,
    getChainSequencesFromNGLStructure,
    make3DAlignID, makeChainToOriginalStructureIDMap,
    matchSequencesToExistingProteins
} from "./NGLUtils";
import {NGLModelWrapperBB} from "./NGLModelWrapperBB";
import vent from "../../vent";

/**
 * Namespace for NGL utilities, stores current PDB settings.
 * @namespace NGLUtils
 * @property {Array<Object>} pdbSettings - Current PDB load settings
 */
export const NGLUtils = {};

/**
 * Loads PDB files into NGL stage and populates 3D viewer with aligned sequences.
 * Clears existing stage, loads all PDB files via Promise.all, extracts chain sequences,
 * aligns to search proteins, creates NGLModelWrapperBB with chainMap and distance matrices,
 * triggers "3dsync" event on compositeModel with aligned sequences. Handles merging multiple PDBs,
 * structure copying across clms-backbone-models, chain mapping. Catches errors and triggers 3dsync with failureReason.
 * @param {Object} pdbInfo - PDB loading information
 * @param {Array<Object>} pdbInfo.pdbSettings - Array of PDB load settings {id, uri, params}
 * @param {NGL.Stage} pdbInfo.stage - NGL stage instance
 * @param {CompositeModel} pdbInfo.compositeModel - Main composite backbone-models
 * @returns {undefined}
 */
export function repopulateNGL(pdbInfo) {
    //console.log ("pdbInfo", pdbInfo);
    NGLUtils.pdbSettings = pdbInfo.pdbSettings;
    const stage = pdbInfo.stage;
    const compositeModel = pdbInfo.compositeModel;

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
                    matchSequencesToExistingProteins(protAlignCollection, whichNGLSequences, proteinArr,
                        function (sObj) {
                            return sObj.data;
                        }
                    );
                }

                const nglSequences = getChainSequencesFromNGLStructure(structureComp);
                const proteinArr = Array.from(compositeModel.get("clmsModel").getProteinsIterator());

                // If have a pdb code AND legal accession IDs use a web service in matchPDBChainsToUniprot to glean matches
                // between ngl protein chains and clms proteins. This is asynchronous so we use a callback
                // if (pdbSettings[0].pdbCode && getLegalAccessionIDs(proteinMap).length) {
                //     console.log("WEB SERVICE CALLED");
                //     NGLUtils.matchPDBChainsToUniprot(pdbSettings, nglSequences, proteinArr, function (uniprotMappingResults) {
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


                    // bug was introduced by commit 2d27785c, which added vent.trigger("nglViewShow", true) to pdb-file-chooser.js's 3dsync listener — the change that auto-shows the NGL panel when a PDB loads.
                    //
                    // Here's the exact crash sequence on the second PDB load:
                    //
                    // 1. compositeModel.trigger("3dsync", sequenceMap, removeThese) fires
                    // 2. networkFrame.js listener fires first — removes the OLD structure's alignment sequences from alignColl (e.g. "1ABC:A:0", "1ABC:B:1", …) and adds the new ones
                    // 3. pdb-file-chooser.js listener fires next — vent.trigger("nglViewShow", true) → NGLViewBB.setVisible(true) → render() → showFiltered()
                    // 4. showFiltered() sees this.xlRepr is still non-null (set from the first load; change:stageModel hasn't fired yet to clear it) → calls oldStageModel.setFilteredLinkList()
                    // 5. makeLinkList() on the OLD stageModel constructs alignID = "1ABC:A:0" etc. — but those sequences were already removed from alignColl in step 2
                    // 6. getSequenceModel("1ABC:A:0") → undefined → TypeError: Cannot read properties of undefined (reading 'getAlignedIndex')
                    //
                    // Why the null-guard-only fix didn't work: with the guard, makeLinkList returns an empty link list, which triggers change:linkList on the old stageModel. NGLViewBB's listener fires xlRepr._handleDataChange() — but the old NGL structure component was already destroyed by stage.removeAllComponents() at the
                    // top of repopulateNGL, so that crashes too.
                    //
                    //     The fix: Clear xlRepr before 3dsync fires. Setting compositeModel.set("stageModel", null) triggers change:stageModel → xlRepr = null. When nglViewShow then fires inside 3dsync, showFiltered() sees xlRepr === null and is a no-op. The null guard in change:stageModel handles the transient null case safely.
                    //

                    const oldStageModel = compositeModel.get("stageModel");
                    const removeThese = oldStageModel ? [oldStageModel.getStructureName()] : [];    // old alignments to remove
                    if (oldStageModel) {
                        oldStageModel.stopListening(); // Stop bulkAlignChange triggering setupLinks on the old stage model
                        compositeModel.set("stageModel", null); // Clear xlRepr in NGLViewBB before 3dsync fires nglViewShow
                    }
                    compositeModel.trigger("3dsync", sequenceMap, removeThese);
                    // Now 3d sequence is added we can make a new NGL Model wrapper (as it needs aligning)

                    // Make a new backbone-models and set of data ready for the ngl viewer
                    const newNGLModelWrapper = new NGLModelWrapperBB();
                    newNGLModelWrapper.set({
                        structureComp: structureComp,
                        chainMap: chainMap,
                        compositeModel: compositeModel,
                        name: "NGLModelWrapper " + structureComp.structure.name,
                    });
                    compositeModel.set("stageModel", newNGLModelWrapper);
                    // important that the new stagemodel is set first ^^^ before we setupLinks() on the backbone-models
                    // otherwise the listener in the 3d viewer is still pointing to the old stagemodel when the
                    // changed:linklist event is received. (i.e. it broke the other way round)
                    newNGLModelWrapper.setupLinks();
                }
            }
        });
}

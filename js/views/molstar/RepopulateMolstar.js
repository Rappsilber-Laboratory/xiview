/**
 * @fileoverview Loads PDB/CIF files via Molstar and populates 3D viewer with aligned sequences.
 * Mirrors RepopulateNGL.js: clears existing state, loads all files, extracts chain sequences,
 * aligns to search proteins, creates MolstarModelWrapperBB with chainMap, triggers "3dsync".
 */

import * as _ from "underscore";
import { matrixPairings } from "../../modelUtils";
import { xilog } from "../../utils";
import {
    getChainSequencesFromMolstarModel,
    make3DAlignID,
    matchSequencesToExistingProteins,
} from "./MolstarUtils";
import { MolstarModelWrapperBB } from "./MolstarModelWrapperBB";
import vent from "../../vent";

/**
 * Namespace for Molstar utilities, stores current PDB settings.
 */
export const MolstarUtils = {};

/**
 * Loads PDB/CIF files into the Molstar plugin and populates 3D viewer.
 * Mirrors repopulateNGL().
 * @param {Object} pdbInfo
 * @param {Array<Object>} pdbInfo.pdbSettings - Array of {id, uri, local, params} objects
 * @param {import("molstar/lib/mol-plugin/context").PluginContext} pdbInfo.plugin - Molstar plugin
 * @param {Object} pdbInfo.compositeModel - Main composite Backbone model
 */
export async function repopulateMolstar(pdbInfo) {
    MolstarUtils.pdbSettings = pdbInfo.pdbSettings;
    const plugin = pdbInfo.plugin;
    const compositeModel = pdbInfo.compositeModel;

    function returnFailure(reason) {
        const id = _.pluck(MolstarUtils.pdbSettings, "id").join(", ");
        const emptySequenceMap = [];
        emptySequenceMap.failureReason = "Error for " + id + ", " + reason;
        compositeModel.trigger("3dsync", emptySequenceMap);
    }

    console.log("CLEAR MOLSTAR STATE");
    await plugin.clear();

    try {
        // Load each PDB file and collect model info
        const modelInfoArr = await Promise.all(
            MolstarUtils.pdbSettings.map(async (pdbSetting) => {
                return loadSingleStructure(plugin, pdbSetting);
            })
        );

        // Build global chain index space: structure 0 starts at 0,
        // structure 1 at chainCount[0], structure 2 at chainCount[0]+chainCount[1], etc.
        const chainOffsets = [];
        const residueOffsets = [];
        let globalChainOffset = 0;
        let globalResidueOffset = 0;

        for (const info of modelInfoArr) {
            chainOffsets.push(globalChainOffset);
            residueOffsets.push(globalResidueOffset);
            const atomicChains = info.model.atomicHierarchy.chains._rowCount;
            const atomicResidues = info.model.atomicHierarchy.residues._rowCount;
            // For IHM coarse structures, count coarse spheres as the residue space
            const coarse = info.model.coarseHierarchy;
            const coarseChains = (coarse && coarse.isDefined) ? coarse.spheres.chainElementSegments.count : 0;
            const coarseResidues = (coarse && coarse.isDefined) ? coarse.spheres.count : 0;
            globalChainOffset += atomicChains || coarseChains;
            globalResidueOffset += atomicResidues || coarseResidues;
        }

        // Extract sequences from all models, adjusting chain indices
        const allSequences = [];
        for (let si = 0; si < modelInfoArr.length; si++) {
            const info = modelInfoArr[si];
            const seqs = getChainSequencesFromMolstarModel(info.model, info.id);
            seqs.forEach(seq => {
                seq.chainIndex += chainOffsets[si];      // global chain index
                seq.structureIndex = si;
            });
            allSequences.push(...seqs);
        }

        if (allSequences.length === 0) {
            returnFailure("No viable polymer chains found in structure");
            return;
        }

        const structureNames = modelInfoArr.map(info => info.id);
        const combinedStructureName = structureNames.join(", ");

        function matchByXiAlignment(whichSequences, pdbUniProtMap) {
            const protAlignCollection = compositeModel.get("alignColl");
            vent.listenToOnce(vent, "sequenceMatchingDone", function (matchMatrix) {
                const pdbXiProtMap = matrixPairings(matchMatrix, whichSequences);
                xilog("XI PAIRED MOLSTAR", pdbXiProtMap);
                sequenceMapsAvailable(pdbXiProtMap.concat(pdbUniProtMap));
            });
            matchSequencesToExistingProteins(
                protAlignCollection, whichSequences, proteinArr,
                function (sObj) { return sObj.data; }
            );
        }

        const proteinArr = Array.from(compositeModel.get("clmsModel").getProteinsIterator());
        matchByXiAlignment(allSequences, []);

        function sequenceMapsAvailable(sequenceMap) {
            xilog("seqmap molstar", sequenceMap);

            const chainMap = {};
            sequenceMap.forEach(function (pMatch) {
                pMatch.data = pMatch.seqObj.data;
                pMatch.name = make3DAlignID(combinedStructureName, pMatch.seqObj.chainName, pMatch.seqObj.chainIndex);
                chainMap[pMatch.id] = chainMap[pMatch.id] || [];
                chainMap[pMatch.id].push({
                    index: pMatch.seqObj.chainIndex,      // global chain index
                    name: pMatch.seqObj.chainName,
                    modelIndex: pMatch.seqObj.modelIndex,
                    structureIndex: pMatch.seqObj.structureIndex,
                });
                pMatch.otherAlignSettings = { semiLocal: true };
            });

            xilog("chainmap molstar", chainMap);

            if (compositeModel.get("stageModel")) {
                compositeModel.get("stageModel").stopListening();
            }
            const removeThese = compositeModel.get("stageModel")
                ? [compositeModel.get("stageModel").getStructureName()]
                : [];
            compositeModel.trigger("3dsync", sequenceMap, removeThese);

            const newWrapper = new MolstarModelWrapperBB();
            newWrapper.set({
                plugin,
                modelInfoArr,
                chainOffsets,
                residueOffsets,
                structureName: combinedStructureName,
                chainMap,
                compositeModel,
                name: "MolstarModelWrapper " + combinedStructureName,
            });
            compositeModel.set("stageModel", newWrapper);
            newWrapper.setupLinks();
        }

    } catch (e) {
        console.error("Molstar load error:", e);
        returnFailure(String(e));
    }
}

/**
 * Loads one PDB/CIF file into the Molstar plugin state.
 * @param {import("molstar/lib/mol-plugin/context").PluginContext} plugin
 * @param {Object} pdbSetting - {id, uri, local, params: {ext}}
 * @returns {Promise<{model, modelRef, structureRef, id}>}
 */
async function loadSingleStructure(plugin, pdbSetting) {
    let dataRef;
    let format;

    const isLocalFile = pdbSetting.local || (pdbSetting.uri instanceof Blob);

    if (isLocalFile) {
        const blob = pdbSetting.uri;
        const ext = (pdbSetting.params && pdbSetting.params.ext)
            || pdbSetting.id.split(".").pop()
            || "pdb";
        format = ext === "cif" ? "mmcif" : "pdb";

        const arrayBuffer = await blob.arrayBuffer();
        dataRef = await plugin.builders.data.rawData(
            { data: arrayBuffer, label: pdbSetting.id },
            { state: { isGhost: true } }
        );
    } else {
        // URL-based: NGL uses "rcsb://CODE.cif" — translate to HTTPS
        let url = pdbSetting.uri;
        if (url.startsWith("rcsb://")) {
            const cifName = url.replace("rcsb://", "");
            url = "https://files.rcsb.org/download/" + cifName;
        }
        format = url.endsWith(".cif") ? "mmcif" : "pdb";

        dataRef = await plugin.builders.data.download(
            { url, isBinary: false, label: pdbSetting.id },
            { state: { isGhost: true } }
        );
    }

    const trajectory = await plugin.builders.structure.parseTrajectory(dataRef, format);
    const modelRef = await plugin.builders.structure.createModel(trajectory, { modelIndex: 0 });
    const structureRef = await plugin.builders.structure.createStructure(modelRef, { type: "model" });

    // Extract the Molstar Model from the state tree
    const modelCell = plugin.state.data.cells.get(modelRef.ref);
    const model = modelCell && modelCell.obj ? modelCell.obj.data : null;

    if (!model) {
        throw new Error("Failed to obtain model data for " + pdbSetting.id);
    }

    return { model, modelRef, structureRef, id: pdbSetting.id };
}

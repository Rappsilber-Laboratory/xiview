/**
 * @fileoverview Molstar utility functions: sequence extraction, chain helpers.
 * Replaces NGLUtils.js for Molstar. Pure-JS functions that use atomicHierarchy API
 * instead of NGL proxies. matchSequencesToExistingProteins and make3DAlignID are
 * re-exported from NGLUtils since they are NGL-independent.
 */

import { AtomicHierarchy } from "molstar/lib/mol-model/structure/model/properties/atomic/hierarchy";
import { MmcifFormat } from "molstar/lib/mol-model-formats/structure/mmcif";
import { xilog } from "../../utils";

// Re-export NGL-independent utilities from NGLUtils
export { matchSequencesToExistingProteins, make3DAlignID } from "../ngl/NGLUtils";

const threeLetterToOneLetter = {
    ALA: "A", ARG: "R", ASN: "N", ASP: "D", CYS: "C",
    GLN: "Q", GLU: "E", GLY: "G", HIS: "H", ILE: "I",
    LEU: "L", LYS: "K", MET: "M", PHE: "F", PRO: "P",
    SER: "S", THR: "T", TRP: "W", TYR: "Y", VAL: "V",
    // Non-standard
    MSE: "M", SEC: "U", PYL: "O", ASX: "B", GLX: "Z", XLE: "J",
    TPO: "T", SEP: "S", PTR: "Y", HYP: "P", CSO: "C",
};

/**
 * Extracts chain sequences from a Molstar Model.
 * Filters to polymer chains with > 10 residues.
 * @param {import("molstar/lib/mol-model/structure/model/model").Model} model - Molstar Model
 * @param {string} structureName - Structure name / ID
 * @returns {Array<Object>} Array of {chainName, chainIndex, modelIndex, residueOffset, structureID, data}
 */
export function getChainSequencesFromMolstarModel(model, structureName) {
    const { atomicHierarchy, entities } = model;
    const { chains, residues, chainAtomSegments, residueAtomSegments } = atomicHierarchy;
    const index = atomicHierarchy.index;
    const segs = { chainAtomSegments, residueAtomSegments };
    const sequences = [];

    const chainCount = chains._rowCount;
    xilog("Molstar atomicHierarchy chain count:", chainCount, "structure:", structureName);

    for (let ci = 0; ci < chainCount; ci++) {
        const entityIdx = index.getEntityFromChain(ci);
        if (entityIdx < 0) continue;
        const entityType = entities.data.type.value(entityIdx);
        if (entityType !== "polymer") continue;

        const rStart = AtomicHierarchy.chainStartResidueIndex(segs, ci);
        const rEnd = AtomicHierarchy.chainEndResidueIndexExcl(segs, ci);
        const residueCount = rEnd - rStart;

        if (residueCount <= 10) continue;  // isViableChain equivalent

        const seq = [];
        for (let ri = rStart; ri < rEnd; ri++) {
            const compId = residues.label_comp_id.value(ri);
            seq.push(threeLetterToOneLetter[compId] || "X");
        }

        sequences.push({
            chainName: chains.auth_asym_id.value(ci),
            chainIndex: ci,
            modelIndex: 0,       // always 0 (firstModelOnly)
            residueOffset: rStart,
            structureID: structureName.toLowerCase(),
            data: seq.join(""),
        });
    }

    // Fallback for IHM coarse-grained structures where atomicHierarchy is empty
    if (sequences.length === 0 && model.coarseHierarchy && model.coarseHierarchy.isDefined) {
        xilog("Molstar: no atomic chains found, trying coarse hierarchy for", structureName);
        const coarseSeqs = getChainSequencesFromCoarseHierarchy(model, structureName);
        sequences.push(...coarseSeqs);
    }

    xilog("Molstar seq", sequences);
    return sequences;
}

/**
 * Extracts chain sequences from a Molstar Model's coarse (IHM) hierarchy.
 * Used as a fallback when atomicHierarchy has no chains (pure coarse-grained model).
 * Reads actual amino acid sequences from entity_poly.pdbx_seq_one_letter_code_can in source data.
 * @param {Object} model - Molstar Model
 * @param {string} structureName
 * @returns {Array<Object>}
 */
function getChainSequencesFromCoarseHierarchy(model, structureName) {
    const { coarseHierarchy, entities } = model;
    const spheres = coarseHierarchy.spheres;
    if (!spheres || !spheres.count) return [];

    // Build entityId (string) → one-letter-sequence map from mmCIF source data
    const entityIdToSeq = {};
    if (MmcifFormat.is(model.sourceData)) {
        const { entity_poly } = model.sourceData.data.db;
        if (entity_poly && entity_poly.entity_id) {
            const { entity_id, pdbx_seq_one_letter_code_can, pdbx_seq_one_letter_code } = entity_poly;
            for (let i = 0; i < entity_id.rowCount; i++) {
                const eid = entity_id.value(i);
                // Prefer canonical (standard AA only); fall back to modified-AA version
                let seq = (pdbx_seq_one_letter_code_can && pdbx_seq_one_letter_code_can.value(i))
                    || (pdbx_seq_one_letter_code && pdbx_seq_one_letter_code.value(i))
                    || "";
                // Strip whitespace/newlines that mmCIF multi-line strings may contain
                seq = seq.replace(/\s+/g, "").toUpperCase();
                if (seq) entityIdToSeq[eid] = seq;
            }
        }
    }

    const sequences = [];
    const { chainElementSegments, asym_id } = spheres;
    const chainCount = chainElementSegments.count;

    for (let ci = 0; ci < chainCount; ci++) {
        const entityIdx = spheres.getEntityFromChain(ci);
        if (entityIdx < 0) continue;

        const entityType = entities.data.type.value(entityIdx);
        if (entityType !== "polymer") continue;

        // Chain name = asym_id of the first sphere in this chain
        const firstElem = chainElementSegments.offsets[ci];
        const chainName = asym_id.value(firstElem);

        const entityId = entities.data.id.value(entityIdx);
        const seqStr = entityIdToSeq[entityId] || "";
        if (seqStr.length <= 10) continue;

        sequences.push({
            chainName,
            chainIndex: ci,
            modelIndex: 0,
            residueOffset: 0,       // coarse: no direct residue-to-atom mapping
            structureID: structureName.toLowerCase(),
            data: seqStr,
            isCoarse: true,         // flag for downstream consumers
        });
    }

    return sequences;
}

/**
 * Gets the auth_asym_id (chain name) for a given global chain index.
 * For multi-structure scenarios, uses the modelInfoArr and chainOffsets.
 * @param {Array} modelInfoArr - Array of {model, chainCount} objects
 * @param {Array<number>} chainOffsets - Cumulative chain count offsets
 * @param {number} globalChainIndex - Global chain index
 * @returns {string} Chain name (auth_asym_id)
 */
export function getChainNameFromGlobalIndex(modelInfoArr, chainOffsets, globalChainIndex) {
    for (let si = modelInfoArr.length - 1; si >= 0; si--) {
        if (globalChainIndex >= chainOffsets[si]) {
            const localCi = globalChainIndex - chainOffsets[si];
            return modelInfoArr[si].model.atomicHierarchy.chains.auth_asym_id.value(localCi);
        }
    }
    return "";
}

/**
 * Determines which model/local chain index corresponds to a global chain index.
 * @param {Array<number>} chainOffsets
 * @param {number} globalChainIndex
 * @returns {{structureIndex: number, localChainIndex: number}}
 */
export function resolveGlobalChainIndex(chainOffsets, globalChainIndex) {
    for (let si = chainOffsets.length - 1; si >= 0; si--) {
        if (globalChainIndex >= chainOffsets[si]) {
            return {
                structureIndex: si,
                localChainIndex: globalChainIndex - chainOffsets[si],
            };
        }
    }
    return { structureIndex: 0, localChainIndex: globalChainIndex };
}

/**
 * Determines which model/local residue index corresponds to a global residue index.
 * For multi-structure, the global residue index is encoded as
 * globalResidueIndex = residueOffset[si] + localResidueIndex.
 * @param {Array<number>} residueOffsets - Cumulative residue count offsets per structure
 * @param {number} globalResidueIndex
 * @returns {{structureIndex: number, localResidueIndex: number}}
 */
export function resolveGlobalResidueIndex(residueOffsets, globalResidueIndex) {
    for (let si = residueOffsets.length - 1; si >= 0; si--) {
        if (globalResidueIndex >= residueOffsets[si]) {
            return {
                structureIndex: si,
                localResidueIndex: globalResidueIndex - residueOffsets[si],
            };
        }
    }
    return { structureIndex: 0, localResidueIndex: globalResidueIndex };
}

/**
 * Gets the structure name from the pdbSettings list of loaded files.
 * @param {Array} modelInfoArr
 * @returns {string}
 */
export function getStructureNameFromModelInfoArr(modelInfoArr) {
    return modelInfoArr.map(info => info.id).join(", ");
}

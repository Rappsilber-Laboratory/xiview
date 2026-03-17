/**
 * @fileoverview Molstar equivalent of NGLModelWrapperBB. Bridges CLMS crosslink data with
 * Molstar 3D structure data. Uses atomicHierarchy / atomicConformation instead of NGL proxies.
 * All business logic (link building, distance calculation, sequence index mapping) is preserved;
 * only the structural data access layer is changed.
 */

import Backbone from "backbone";
import d3 from "d3";
import $ from "jquery";
import * as _ from "underscore";
import { sprintf } from "sprintf-js";
import { AtomicHierarchy } from "molstar/lib/mol-model/structure/model/properties/atomic/hierarchy";
import {
    intersectObjectArrays,
    joinConsecutiveNumbersIntoRanges,
    makeSubIndexedMap,
} from "../../modelUtils";
import { xilog } from "../../utils";
import {
    make3DAlignID,
    not3DHomomultimeric,
    getChainNameFromChainIndex,
} from "../ngl/NGLUtils";
import { resolveGlobalChainIndex, resolveGlobalResidueIndex } from "./MolstarUtils";
import { DistancesObj } from "../ngl/DistancesObj";
import vent from "../../vent";

/**
 * Backbone Model wrapping Molstar 3D structure data.
 * Mirrors NGLModelWrapperBB with Molstar-specific data access.
 */
export class MolstarModelWrapperBB extends Backbone.Model {
    constructor(attributes, options) {
        super(attributes, options);
    }

    defaults() {
        return {
            compositeModel: null,
            plugin: null,
            modelInfoArr: null,
            chainOffsets: null,
            residueOffsets: null,
            structureName: null,
            chainMap: null,
            linkList: null,
            fullDistanceCalcCutoff: 1200,
            allowInterModelDistances: false,
            showShortestLinksOnly: true,
        };
    }

    initialize() {
        this.listenToOnce(this, "change:compositeModel", function () {
            this.listenTo(this.getCompositeModel().get("alignColl"), "bulkAlignChange", function () {
                console.log("SET UP LINKS (Molstar)");
                this.setupLinks();
            });
        });

        this.listenTo(this, "change:allowInterModelDistances", function (model, val) {
            const compModel = this.get("compositeModel");
            compModel.getCrossLinkDistances(compModel.getAllCrossLinks());
            vent.trigger("changeAllowInterModelDistances", model, val);
        });

        this.listenTo(this, "change:chainMap", function (model, val) {
            model.makeReverseChainMap(val);
        });

        this.makeReverseChainMap(this.get("chainMap"));
    }

    // ─── Private helpers: resolve global chain/residue indices ─────────────────

    /**
     * Given a global chain index, returns {model, localChainIndex, segs}.
     */
    _resolveChain(globalChainIndex) {
        const chainOffsets = this.get("chainOffsets");
        const modelInfoArr = this.get("modelInfoArr");
        const { structureIndex, localChainIndex } = resolveGlobalChainIndex(chainOffsets, globalChainIndex);
        const model = modelInfoArr[structureIndex].model;
        const { chainAtomSegments, residueAtomSegments } = model.atomicHierarchy;
        return {
            model,
            structureIndex,
            localChainIndex,
            segs: { chainAtomSegments, residueAtomSegments },
        };
    }

    /**
     * Given a global residue index, returns {model, structureIndex, localResidueIndex}.
     */
    _resolveResidue(globalResidueIndex) {
        const residueOffsets = this.get("residueOffsets");
        const modelInfoArr = this.get("modelInfoArr");
        const { structureIndex, localResidueIndex } = resolveGlobalResidueIndex(residueOffsets, globalResidueIndex);
        const model = modelInfoArr[structureIndex].model;
        return { model, structureIndex, localResidueIndex };
    }

    // ─── Interface mirrors ─────────────────────────────────────────────────────

    makeReverseChainMap(chainMap) {
        const reverseChainMap = d3.map();
        const entries = d3.entries(chainMap || {});
        entries.forEach(function (entry) {
            entry.value.forEach(function (valueItem) {
                reverseChainMap.set(valueItem.index, entry.key);
            });
        });
        this.set("reverseChainMap", reverseChainMap);
        return this;
    }

    getCompositeModel() {
        return this.get("compositeModel");
    }

    getStructureName() {
        return this.get("structureName");
    }

    // ─── Setup ─────────────────────────────────────────────────────────────────

    setupLinks() {
        const chainInfo = this.getChainInfo();
        this.calculateAllCaAtomIndices(chainInfo.viableChainIndices);
        this.setFilteredLinkList();

        const distances = this.getChainDistances(chainInfo.resCount > this.defaults().fullDistanceCalcCutoff);
        const distancesObj = new DistancesObj(
            distances, this.get("chainMap"), this.getStructureName(), undefined,
            this.getCompositeModel()
        );

        const compositeModel = this.getCompositeModel();
        compositeModel.set("distancesObj", null, { silent: true });
        compositeModel.set("distancesObj", distancesObj, { silent: true });
        distancesObj.maxDistance = d3.max(
            this.getCompositeModel().getHomomDistances(this.getCompositeModel().getAllCrossLinks())
        );
        this.getCompositeModel().trigger("change:distancesObj", compositeModel, distancesObj);
        return this;
    }

    setFilteredLinkList() {
        this.setLinkList(this.getCompositeModel().getFilteredCrossLinks());
        return this;
    }

    setLinkList(crosslinkArr) {
        const linkDataObj = this.makeLinkList(crosslinkArr);
        const distanceObj = this.getCompositeModel().get("distancesObj");
        if (this.get("showShortestLinksOnly") && distanceObj) {
            linkDataObj.fullLinkList = distanceObj.getShortestLinkAlternatives(linkDataObj.fullLinkList);
        }
        this.setLinkListWrapped(linkDataObj);
        return this;
    }

    // ─── Chain info ───────────────────────────────────────────────────────────

    /**
     * Returns chain info using Molstar atomicHierarchy.
     * Equivalent to NGL's getChainInfo() using eachChain.
     */
    getChainInfo() {
        let resCount = 0;
        const viableChainIndices = [];
        const reverseChainMap = this.get("reverseChainMap");
        const chainOffsets = this.get("chainOffsets") || [0];
        const modelInfoArr = this.get("modelInfoArr") || [];

        for (let si = 0; si < modelInfoArr.length; si++) {
            const model = modelInfoArr[si].model;
            const { atomicHierarchy, entities } = model;
            const { chains, chainAtomSegments, residueAtomSegments } = atomicHierarchy;
            const index = atomicHierarchy.index;
            const segs = { chainAtomSegments, residueAtomSegments };
            const chainOffset = chainOffsets[si];

            for (let localCi = 0; localCi < chains._rowCount; localCi++) {
                const globalCi = localCi + chainOffset;
                const entityIdx = index.getEntityFromChain(localCi);
                if (entityIdx < 0) continue;
                const entityType = entities.data.type.value(entityIdx);
                if (entityType !== "polymer") continue;
                const rStart = AtomicHierarchy.chainStartResidueIndex(segs, localCi);
                const rEnd = AtomicHierarchy.chainEndResidueIndexExcl(segs, localCi);
                const residueCount = rEnd - rStart;
                if (residueCount <= 10) continue;
                if (!reverseChainMap.get(globalCi)) continue;  // only chains mapped to proteins

                resCount += residueCount;
                viableChainIndices.push(globalCi);
            }
        }

        return { viableChainIndices, resCount };
    }

    // ─── C-alpha indices ───────────────────────────────────────────────────────

    /**
     * Computes CA atom ElementIndex for every residue in the specified global chain indices.
     * Uses traceElementIndex (the CA atom or equivalent trace atom per residue).
     * @param {number[]} chainIndices - Global chain indices
     * @returns {Object} Map of globalChainIndex → [ElementIndex per residue]
     */
    calculateAllCaAtomIndices(chainIndices) {
        const chainCAtomIndices = {};
        const chainOffsets = this.get("chainOffsets") || [0];
        const residueOffsets = this.get("residueOffsets") || [0];
        const modelInfoArr = this.get("modelInfoArr") || [];

        if (!chainIndices) {
            this.set("chainCAtomIndices", chainCAtomIndices);
            return chainCAtomIndices;
        }

        chainIndices.forEach((globalCi) => {
            const { model, structureIndex, localChainIndex, segs } = this._resolveChain(globalCi);
            const { atomicHierarchy } = model;
            const { traceElementIndex } = atomicHierarchy.derived.residue;
            const residueOffset = residueOffsets[structureIndex];

            const rStart = AtomicHierarchy.chainStartResidueIndex(segs, localChainIndex);
            const rEnd = AtomicHierarchy.chainEndResidueIndexExcl(segs, localChainIndex);

            const atomIndices = chainCAtomIndices[globalCi] = [];
            for (let ri = rStart; ri < rEnd; ri++) {
                const traceAtom = traceElementIndex[ri];
                // Store (structureIndex, localAtomIndex) encoded as a compound key
                // For single-structure: just use the ElementIndex directly
                // For multi-structure: offset by structure's element count
                atomIndices.push(traceAtom >= 0 ? { si: structureIndex, ei: traceAtom, ri: ri + residueOffset } : undefined);
            }
        });

        this.set("chainCAtomIndices", chainCAtomIndices);
        return chainCAtomIndices;
    }

    // ─── Distance matrix ──────────────────────────────────────────────────────

    getChainDistances(linksOnly) {
        const entries = d3.entries(this.get("chainCAtomIndices"));
        const matrixMap = {};
        const links = this.getFullLinks();

        entries.forEach((chain1Entry) => {
            const chain1 = chain1Entry.key;
            const cindices1 = chain1Entry.value;
            entries.forEach((chain2Entry) => {
                const chain2 = chain2Entry.key;
                const cindices2 = chain2Entry.value;
                matrixMap[chain1 + "-" + chain2] = {
                    chain1,
                    chain2,
                    isSymmetric: chain1 === chain2,
                    linksOnly,
                    size: [cindices1.length, cindices2.length],
                    distanceMatrix: linksOnly
                        ? this.getLinkDistancesBetween2Chains(cindices1, cindices2, +chain1, +chain2, links)
                        : this.getAllDistancesBetween2Chains(cindices1, cindices2, chain1, chain2),
                };
            });
        });

        return matrixMap;
    }

    getChainLength(chainIndex) {
        const chain = this.get("chainCAtomIndices")[chainIndex];
        return chain ? chain.length : undefined;
    }

    /**
     * Computes Euclidean distance between two atom entries from chainCAtomIndices.
     * @param {Object|undefined} atomA - {si, ei, ri} or undefined
     * @param {Object|undefined} atomB - {si, ei, ri} or undefined
     * @returns {number|undefined}
     */
    _atomEntryDistance(atomA, atomB) {
        if (!atomA || !atomB || atomA.ei < 0 || atomB.ei < 0) return undefined;
        // Inter-structure distances: only if allowInterModelDistances
        if (atomA.si !== atomB.si && !this.get("allowInterModelDistances")) return undefined;
        const modelInfoArr = this.get("modelInfoArr");
        const confA = modelInfoArr[atomA.si].model.atomicConformation;
        const confB = modelInfoArr[atomB.si].model.atomicConformation;
        const dx = confA.x[atomA.ei] - confB.x[atomB.ei];
        const dy = confA.y[atomA.ei] - confB.y[atomB.ei];
        const dz = confA.z[atomA.ei] - confB.z[atomB.ei];
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    getLinkDistancesBetween2Chains(chainAtomIndices1, chainAtomIndices2, chainIndex1, chainIndex2, links) {
        const notHomomultimeric = (xlinkID, c1, c2) => {
            const xlink = this.getCompositeModel().get("clmsModel").getCrosslinks().get(xlinkID);
            return not3DHomomultimeric(xlink, c1, c2);
        };

        const filteredLinks = links.filter((link) => {
            return link.residueA.chainIndex === chainIndex1
                && link.residueB.chainIndex === chainIndex2
                && notHomomultimeric(link.origId, chainIndex1, chainIndex2);
        });

        const matrix = [];
        filteredLinks.forEach((link) => {
            const idA = link.residueA.seqIndex;
            const idB = link.residueB.seqIndex;
            const atomA = chainAtomIndices1[idA];
            const atomB = chainAtomIndices2[idB];
            const d = this._atomEntryDistance(atomA, atomB);
            if (d !== undefined) {
                matrix[idA] = matrix[idA] || [];
                matrix[idA][idB] = d;
            }
        });

        return matrix;
    }

    getAllDistancesBetween2Chains(chainAtomIndices1, chainAtomIndices2, chainIndex1, chainIndex2) {
        const matrix = [];
        const len2 = chainAtomIndices2.length;
        const diffChains = chainIndex1 !== chainIndex2;

        for (let n = 0; n < chainAtomIndices1.length; n++) {
            const atomA = chainAtomIndices1[n];
            const row = matrix[n] = [];
            for (let m = 0; m < len2; m++) {
                if (m !== n || diffChains) {
                    row.push(this._atomEntryDistance(atomA, chainAtomIndices2[m]));
                } else {
                    row.push(0);
                }
            }
        }
        return matrix;
    }

    getAtomCoordinates(atomEntry) {
        if (!atomEntry) return [undefined, undefined, undefined];
        const conf = this.get("modelInfoArr")[atomEntry.si].model.atomicConformation;
        return [conf.x[atomEntry.ei], conf.y[atomEntry.ei], conf.z[atomEntry.ei]];
    }

    /**
     * Used by distance calculations between two specific residues.
     */
    getSingleDistanceBetween2Residues(seqIndex1, seqIndex2, chainIndex1, chainIndex2) {
        const cai = this.get("chainCAtomIndices");
        return this._atomEntryDistance(cai[chainIndex1] && cai[chainIndex1][seqIndex1],
            cai[chainIndex2] && cai[chainIndex2][seqIndex2]);
    }

    getAtomIndex(seqIndex, chainIndex, chainAtomIndices) {
        const cai = chainAtomIndices || this.get("chainCAtomIndices");
        const ci = cai[chainIndex];
        return ci ? ci[seqIndex] : undefined;
    }

    // ─── Link list building ───────────────────────────────────────────────────

    makeLinkList(crosslinkArr) {
        const chainOffsets = this.get("chainOffsets") || [0];
        const residueOffsets = this.get("residueOffsets") || [0];
        const modelInfoArr = this.get("modelInfoArr") || [];
        const structureName = this.getStructureName();
        let nextResidueId = 0;
        const residueDict = {};
        const fullLinkList = [];
        const halfLinkList = [];
        const alignColl = this.getCompositeModel().get("alignColl");

        function getResidueId(globalResidueIndex) {
            if (residueDict[globalResidueIndex] === undefined) {
                residueDict[globalResidueIndex] = nextResidueId;
                nextResidueId++;
            }
            return residueDict[globalResidueIndex];
        }

        // Returns the global residue index and resno for a given chainIndex+seqIndex
        const getResidueInfo = (globalChainIndex, seqIndex) => {
            const { model, structureIndex, localChainIndex, segs } = this._resolveChain(globalChainIndex);
            const rStart = AtomicHierarchy.chainStartResidueIndex(segs, localChainIndex);
            const localRi = rStart + seqIndex;
            const globalRi = localRi + residueOffsets[structureIndex];
            const resno = model.atomicHierarchy.residues.auth_seq_id.value(localRi);
            return { globalRi, resno };
        };

        function makePDBIndexedResidues(perModelChainEntry, searchIndexResidue, protID) {
            if (perModelChainEntry) {
                return perModelChainEntry.values.map(function (chainValue) {
                    const chainIndex = chainValue.index;  // global chain index
                    const alignID = make3DAlignID(structureName, chainValue.name, chainIndex);
                    return {
                        chainIndex,
                        modelIndex: chainValue.modelIndex,
                        seqIndex: alignColl.getAlignedIndex(searchIndexResidue, protID, false, alignID, true) - 1,
                    };
                }).filter(function (datum) {
                    return datum.seqIndex >= 0;
                });
            }
            return [];
        }

        const addResidueExtraInfo = (pdbIndexedResidue) => {
            const { globalRi, resno } = getResidueInfo(pdbIndexedResidue.chainIndex, pdbIndexedResidue.seqIndex);
            pdbIndexedResidue.NGLglobalIndex = globalRi;  // used as unique residue key
            pdbIndexedResidue.residueId = getResidueId(globalRi);
            pdbIndexedResidue.resno = resno;
            pdbIndexedResidue.structureId = null;
        };

        function addResidueListsExtraInfo(residueObjLists) {
            residueObjLists.forEach(function (residueObjList) {
                residueObjList.forEach(function (residueObj) {
                    addResidueExtraInfo(residueObj);
                });
            });
        }

        function addToHalfLinkList(crosslink, residueObjList) {
            residueObjList.forEach(function (residueObj) {
                halfLinkList.push({
                    origId: crosslink.id,
                    linkId: halfLinkList.length,
                    residue: residueObj,
                });
            });
        }

        const t = performance.now();

        const chainMap = $.extend({}, this.get("chainMap"));
        const distObj = this.getCompositeModel().get("distancesObj");
        if (distObj) {
            const chainSet = distObj.permittedChainIndicesSet;
            d3.entries(chainMap).forEach(function (proteinEntry) {
                chainMap[proteinEntry.key] = proteinEntry.value.filter(function (chainEntry) {
                    return chainSet.has(chainEntry.index);
                });
            });
        }

        const modelIndexedChainMap = makeSubIndexedMap(chainMap, "modelIndex");

        const chainValueMap = d3.map();
        const modelIndexedChainValueMap = d3.map();
        d3.entries(chainMap).forEach(function (protEntry) {
            chainValueMap.set(protEntry.key, { values: protEntry.value });
        });
        d3.entries(modelIndexedChainMap).forEach(function (protEntry) {
            modelIndexedChainValueMap.set(protEntry.key, d3.map(protEntry.value, function (d) {
                return d.key;
            }));
        });

        const allowInterModelDistances = this.get("allowInterModelDistances");

        crosslinkArr.forEach((xlink) => {
            const fromProtID = xlink.fromProtein.id;
            const toProtID = xlink.toProtein.id;

            const fromPerModelChains = allowInterModelDistances
                ? [chainValueMap.get(fromProtID)]
                : modelIndexedChainMap[fromProtID];
            const toPerModelChains = modelIndexedChainMap[toProtID];

            const fromEmpty = _.isEmpty(fromPerModelChains);
            const toEmpty = _.isEmpty(toPerModelChains);

            if (!fromEmpty && !toEmpty) {
                const toPerModelChainMap = modelIndexedChainValueMap.get(toProtID);
                const toChainMap = chainValueMap.get(toProtID);

                fromPerModelChains.forEach((fromPerModelChainEntry) => {
                    const toChains = allowInterModelDistances
                        ? toChainMap
                        : toPerModelChainMap && toPerModelChainMap.get(fromPerModelChainEntry.key);

                    if (toChains) {
                        let fromPDBResidues = makePDBIndexedResidues(fromPerModelChainEntry, xlink.fromResidue, fromProtID);
                        let toPDBResidues = makePDBIndexedResidues(toChains, xlink.toResidue, toProtID);
                        const alternativeCount = fromPDBResidues.length * toPDBResidues.length;

                        addResidueListsExtraInfo([fromPDBResidues, toPDBResidues]);

                        if (alternativeCount > 0) {
                            fromPDBResidues.forEach((fromPDB) => {
                                toPDBResidues.forEach((toPDB) => {
                                    if (not3DHomomultimeric(xlink, toPDB.chainIndex, fromPDB.chainIndex)) {
                                        fullLinkList.push({
                                            origId: xlink.id,
                                            linkId: fullLinkList.length,
                                            residueA: fromPDB,
                                            residueB: toPDB,
                                        });
                                    }
                                });
                            });
                        } else {
                            addToHalfLinkList(xlink, fromPDBResidues);
                            addToHalfLinkList(xlink, toPDBResidues);
                        }
                    }
                });
            } else if (!toEmpty || !fromEmpty) {
                const toChains = chainValueMap.get(toProtID);
                const fromChains = chainValueMap.get(fromProtID);
                const fromPDBResidues = makePDBIndexedResidues(fromChains, xlink.fromResidue, fromProtID);
                const toPDBResidues = makePDBIndexedResidues(toChains, xlink.toResidue, toProtID);
                addResidueListsExtraInfo([fromPDBResidues, toPDBResidues]);
                addToHalfLinkList(xlink, fromPDBResidues);
                addToHalfLinkList(xlink, toPDBResidues);
            }
        });

        console.log("LINK LIST TIME", (performance.now() - t) / 1000, "seconds");
        return { fullLinkList, halfLinkList };
    }

    // ─── Link list wrapping (identical to NGLModelWrapperBB) ──────────────────

    setLinkListWrapped(linkDataObj) {
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

        this._residueIdToFullLinkIds = residueIdToFullLinkIds;
        this._residueIdToHalfLinkIds = residueIdToHalfLinkIds;
        this._linkIdMap = linkIdMap;
        this._halfLinkIdMap = halfLinkIdMap;
        this._residueIdMap = residueIdMap;
        this._residueList = d3.values(residueIdMap);
        this._residueNGLIndexMap = _.indexBy(this._residueList, "NGLglobalIndex");
        this._fullLinkNGLIndexMap = {};
        linkList.forEach((link) => {
            this._fullLinkNGLIndexMap[link.residueA.NGLglobalIndex + "-" + link.residueB.NGLglobalIndex] = link;
        });
        this._halfLinkNGLIndexMap = {};
        halfLinkList.forEach((link) => {
            this._halfLinkNGLIndexMap[link.residue.NGLglobalIndex] = link;
        });

        this._origFullLinkCount = this.getOriginalCrossLinkCount(linkList);
        this._origHalfLinkCount = this.getOriginalCrossLinkCount(halfLinkList);

        this.set("linkList", linkList);
        this.set("halfLinkList", halfLinkList);
    }

    // ─── Link accessors ───────────────────────────────────────────────────────

    getFullLinkCount() { return this._origFullLinkCount; }
    getHalfLinkCount() { return this._origHalfLinkCount; }

    getFullLinks(residue) {
        return residue === undefined ? this.get("linkList") : this.getFullLinksByResidueID(residue.residueId);
    }

    getFullLinkCountByResidue(residue) {
        const linkIds = this._residueIdToFullLinkIds[residue.residueId];
        return linkIds ? linkIds.length : 0;
    }

    getFullLinksByResidueID(residueId) {
        const linkIds = this._residueIdToFullLinkIds[residueId];
        return linkIds ? linkIds.map((l) => this._linkIdMap[l]) : [];
    }

    getHalfLinks(residue) {
        return residue === undefined ? this.get("halfLinkList") : this.getHalfLinksByResidueID(residue.residueId);
    }

    getHalfLinkCountByResidue(residue) {
        const linkIds = this._residueIdToHalfLinkIds[residue.residueId];
        return linkIds ? linkIds.length : 0;
    }

    getHalfLinksByResidueID(residueId) {
        const linkIds = this._residueIdToHalfLinkIds[residueId];
        return linkIds ? linkIds.map((l) => this._halfLinkIdMap[l]) : [];
    }

    getFullLinkByNGLResIndices(NGLGlobalResIndex1, NGLGlobalResIndex2) {
        return this._fullLinkNGLIndexMap[NGLGlobalResIndex1 + "-" + NGLGlobalResIndex2];
    }

    getHalfLinkByNGLResIndex(NGLGlobalResIndex1) {
        return this._halfLinkNGLIndexMap[NGLGlobalResIndex1];
    }

    getResidues(fullLink) {
        if (fullLink === undefined) return this._residueList;
        if (Array.isArray(fullLink)) {
            const residues = [];
            fullLink.forEach((l) => residues.push(l.residueA, l.residueB));
            return residues;
        }
        return [fullLink.residueA, fullLink.residueB];
    }

    getHalfLinkResidues(halfLink) {
        if (halfLink === undefined) {
            const hl = this.getHalfLinks();
            return hl.map((l) => l.residue);
        }
        if (Array.isArray(halfLink)) return halfLink.map((l) => l.residue);
        return [halfLink.residue];
    }

    getSharedLinks(residueA, residueB) {
        const aLinks = this.getFullLinks(residueA);
        const bLinks = this.getFullLinks(residueB);
        const sharedLinks = intersectObjectArrays(aLinks, bLinks, (l) => l.linkId);
        return sharedLinks.length ? sharedLinks : false;
    }

    getResidueByNGLGlobalIndex(nglGlobalResIndex) {
        return this._residueNGLIndexMap[nglGlobalResIndex];
    }

    hasResidue(residue) { return this._residueIdMap[residue.residueId] !== undefined; }
    hasLink(link) { return this._linkIdMap[link.linkId] !== undefined; }

    getAvailableResidues(residues) {
        return residues.filter((r) => this.hasResidue(r));
    }

    getAvailableLinks(linkObjs) {
        return linkObjs.filter((linkObj) => this.hasLink(linkObj));
    }

    getOriginalCrossLinks(linkObjs) {
        const xlinks = this.getCompositeModel().get("clmsModel").getCrosslinks();
        return linkObjs.map((linkObj) => xlinks.get(linkObj.origId));
    }

    getOriginalCrossLinkCount(linkObjs) {
        return d3.set(_.pluck(linkObjs, "origId")).size();
    }

    // ─── Coordinate access for atom entries ──────────────────────────────────

    getAtomIndexFromResidueObj(resObj) {
        const resno = resObj.resno;
        return resno !== undefined ? this.getAtomIndex(resObj.seqIndex, resObj.chainIndex) : undefined;
    }

    getAtomPairsFromLinkList(linkList) {
        const atomPairs = [];
        if (linkList) {
            if (linkList === "all") linkList = this.getFullLinks();
            linkList.forEach((link) => {
                const atomA = this.getAtomIndex(link.residueA.seqIndex, link.residueA.chainIndex);
                const atomB = this.getAtomIndex(link.residueB.seqIndex, link.residueB.chainIndex);
                if (atomA !== undefined && atomB !== undefined) {
                    atomPairs.push([atomA, atomB, link.origId]);
                }
            });
        }
        return atomPairs;
    }

    getAtomPairsAndDistancesFromLinkList(links) {
        const atomPairs = this.getAtomPairsFromLinkList(links);
        atomPairs.forEach((pair) => {
            const d = this._atomEntryDistance(pair[0], pair[1]);
            pair.push(d);
        });
        return atomPairs;
    }

    // ─── Chain selection / visibility ─────────────────────────────────────────

    getShowableChains(showAll) {
        const protMap = Array.from(this.getCompositeModel().get("clmsModel").getProteinsIterator());
        const prots = protMap.filter((prot) => !prot.hidden).map((prot) => prot.id);

        let chainIndices;
        if (protMap.length !== prots.length && !showAll) {
            chainIndices = prots.map((prot) => {
                const protChains = this.get("chainMap")[prot] || [];
                return _.pluck(protChains, "index");
            });
        } else {
            chainIndices = d3.values(this.get("chainMap")).map((chainValue) => _.pluck(chainValue, "index"));
        }
        chainIndices = d3.merge(chainIndices);
        return { showAll, chainIndices };
    }

    /**
     * Returns a chain name for a given global chain index.
     */
    getChainName(globalChainIndex) {
        const modelInfoArr = this.get("modelInfoArr") || [];
        const chainOffsets = this.get("chainOffsets") || [0];
        const { structureIndex, localChainIndex } = resolveGlobalChainIndex(chainOffsets, globalChainIndex);
        if (!modelInfoArr[structureIndex]) return "";
        return modelInfoArr[structureIndex].model.atomicHierarchy.chains.auth_asym_id.value(localChainIndex);
    }

    /**
     * Returns the structure ID (PDB code / filename) for a given global chain index.
     */
    getStructureIDForChain(globalChainIndex) {
        const chainOffsets = this.get("chainOffsets") || [0];
        const modelInfoArr = this.get("modelInfoArr") || [];
        for (let si = chainOffsets.length - 1; si >= 0; si--) {
            if (globalChainIndex >= chainOffsets[si]) {
                return modelInfoArr[si].id;
            }
        }
        return this.getStructureName();
    }

    // ─── NGL selection string stubs (needed by DistancesObj / other callers) ──

    // These are NGL-specific but DistancesObj uses chainMap / name-based methods.
    // We stub them out to avoid errors while keeping DistancesObj working.
    getSelectionFromResidueList() { return "all"; }
    makeChainSelectionString() { return "all"; }
    makeFirstAtomPerChainSelectionString() { return "@0"; }

    // ─── PDB export strings ──────────────────────────────────────────────────

    getPDBLinkString(links) {
        const pdbLinks = [];
        const linkFormat = "LINK        %-4s %-3s %1s%4d                %-4s %-3s %1s%4d   %6s %6s %5.2f";

        links.forEach((link) => {
            const res1 = link.residueA;
            const res2 = link.residueB;
            const chainName1 = this.getChainName(res1.chainIndex);
            const chainName2 = this.getChainName(res2.chainIndex);

            // Get residue name from local residue index
            const getResName = (globalChainIdx, seqIdx) => {
                const { model, localChainIndex, segs } = this._resolveChain(globalChainIdx);
                const rStart = AtomicHierarchy.chainStartResidueIndex(segs, localChainIndex);
                return model.atomicHierarchy.residues.label_comp_id.value(rStart + seqIdx);
            };

            const resName1 = getResName(res1.chainIndex, res1.seqIndex);
            const resName2 = getResName(res2.chainIndex, res2.seqIndex);
            const sym1 = "      ";
            const sym2 = "      ";
            const distance = Math.min(99.99,
                this.getSingleDistanceBetween2Residues(res1.seqIndex, res2.seqIndex, res1.chainIndex, res2.chainIndex) || 0
            );

            pdbLinks.push(sprintf(linkFormat, "CA", resName1, chainName1, res1.resno,
                "CA", resName2, chainName2, res2.resno, sym1, sym2, distance));
        });

        return pdbLinks.join("\n");
    }

    getPDBConectString(links) {
        const pdbConects = [];
        const conectFormat = "CONECT%5d%5d                                                                ";
        const atomPairs = this.getAtomPairsFromLinkList(links);
        atomPairs.sort((a, b) => {
            const ai = a[0] ? a[0].ei : 0;
            const bi = b[0] ? b[0].ei : 0;
            return ai - bi;
        });
        atomPairs.forEach((atomPair) => {
            const ai1 = atomPair[0] ? atomPair[0].ei : 0;
            const ai2 = atomPair[1] ? atomPair[1].ei : 0;
            pdbConects.push(sprintf(conectFormat, ai1, ai2));
        });
        return pdbConects.join("\n");
    }

    // ─── All residue coords for export ───────────────────────────────────────

    getAllResidueCoordsForChain(chainIndex) {
        const nglAtomIndices = this.get("chainCAtomIndices")[chainIndex] || [];
        return nglAtomIndices.map((atomEntry) => this.getAtomCoordinates(atomEntry));
    }
}

/**
 * @fileoverview Model wrapper that bridges CLMS crosslink data with NGL 3D viewer representations.
 * Handles complex mapping of proteins to PDB chains, converts crosslinks to 3D link objects,
 * calculates C-alpha distances, manages residue/link lookups via multiple indices, and generates
 * NGL selection strings for visualization. A single protein may map to multiple chains in a PDB structure,
 * and homomultimeric complexes require special handling.
 */

import Backbone from "backbone";
import d3 from "d3";
import * as $ from "jquery";
import * as _ from "underscore";
import * as NGL from "ngl";
import {sprintf} from "sprintf-js";
import {
    intersectObjectArrays,
    joinConsecutiveNumbersIntoRanges,
    makeSubIndexedMap
} from "../../modelUtils";
import {xilog} from "../../utils";
import {
    getRangedCAlphaResidueSelectionForChain,
    isViableChain,
    make3DAlignID,
    not3DHomomultimeric
} from "./NGLUtils";
import {DistancesObj} from "./DistancesObj";

/**
 * Backbone model that wraps NGL 3D structure data and bridges it with CLMS crosslink data.
 * Manages complex mapping of proteins to PDB chains, converts crosslinks into 3D link representations
 * (full links with both ends in structure, half links with one end), calculates distance matrices,
 * maintains multiple index structures for efficient lookups, and generates NGL selection strings.
 * @class
 * @extends Backbone.Model
 * @property {Object} compositeModel - Main application model
 * @property {Object} structureComp - NGL structure component
 * @property {Object} chainMap - Map of protein IDs to arrays of chain objects
 * @property {Object} reverseChainMap - Map of chain indices to protein IDs
 * @property {Array} linkList - Array of full link objects (both ends in PDB)
 * @property {Array} halfLinkList - Array of half link objects (one end in PDB)
 * @property {number} fullDistanceCalcCutoff - Residue count threshold for full vs partial distance calculation (default 1200)
 * @property {boolean} allowInterModelDistances - Whether to allow distance calculation between different NMR models (default false)
 * @property {boolean} showShortestLinksOnly - Whether to filter to shortest alternative links (default true)
 */
export class NGLModelWrapperBB extends Backbone.Model {
    constructor(attributes, options) {
        super(attributes, options);
    }

    /**
     * Returns default values for model attributes.
     * @returns {Object} Default attribute values
     */
    defaults() {
        return {
            compositeModel: null,
            structureComp: null,
            chainMap: null,
            linkList: null,
            fullDistanceCalcCutoff: 1200,
            allowInterModelDistances: false,
            showShortestLinksOnly: true,
        };
    }

    // Most of the stuff in this file is dealing with the complications of a single protein possibly mapping to many different chains
    // in a PDB structure.

    /**
     * Initializes the model and sets up event listeners.
     * Listens for alignment collection changes (triggers link recalculation),
     * allowInterModelDistances changes (triggers distance recalculation),
     * and chainMap changes (triggers reverse map generation).
     */
    initialize() {
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
            window.vent.trigger("changeAllowInterModelDistances", model, val);
        });

        this.listenTo(this, "change:chainMap", function (model, val) {
            model.makeReverseChainMap(val);
        });

        this.makeReverseChainMap(this.get("chainMap"));
    }

    // make a map of chain indices to protein ids
    makeReverseChainMap(chainMap) {
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

    /**
     * Gets the main application composite model.
     * @returns {Object} The composite model instance
     */
    getCompositeModel() {
        return this.get("compositeModel");
    }

    /**
     * Gets the name of the loaded PDB structure.
     * @returns {string} Structure name (PDB ID or filename)
     */
    getStructureName() {
        return this.get("structureComp").structure.name;
    }

    /**
     *   Call when new PDB file loaded
     */
    setupLinks() {
        const chainInfo = this.getChainInfo();
        this.calculateAllCaAtomIndices(chainInfo.viableChainIndices);
        this.setFilteredLinkList();

        // The point of this is to build a cache for Ca-Ca distances so we don't have to keep asking the ngl components for them
        // For very large structures we just store the distances that map to crosslinks, so we have to get other distances by reverting to the ngl stuff
        const distances = this.getChainDistances(chainInfo.resCount > this.defaults.fullDistanceCalcCutoff);
        const distancesObj = new DistancesObj(distances, this.get("chainMap"), this.getStructureName());

        const compositeModel = this.getCompositeModel();
        // silent change and trigger, as loading in the same pdb file doesn't trigger the change automatically (as it generates an identical distance matrix)
        // Secondly, inserting a silent set to 'null' first stops backbone temporarily storing the previous distancesobj, as they could both be quite large
        // Also want to recalculate link distances with this object, before informing views the object is new (otherwise may draw with old data)
        compositeModel.set("distancesObj", null, {silent: true});
        compositeModel.set("distancesObj", distancesObj, {silent: true});
        distancesObj.maxDistance = d3.max(this.getCompositeModel().getHomomDistances(this.getCompositeModel().getAllCrossLinks()));
        this.getCompositeModel().trigger("change:distancesObj", compositeModel, distancesObj);
        return this;
    }

    /**
     *   Call when set of filtered cross-links has changed
     */
    setFilteredLinkList() {
        this.setLinkList(this.getCompositeModel().getFilteredCrossLinks());
        return this;
    }

    /**
     * Sets link list from array of crosslink objects.
     * Converts crosslinks to link data objects, optionally filters to shortest alternatives,
     * and wraps with index structures for efficient lookups.
     * @param {Array} crosslinkArr - Array of crosslink objects to convert
     * @returns {NGLModelWrapperBB} This model instance for chaining
     */
    setLinkList(crosslinkArr) {
        const linkDataObj = this.makeLinkList(crosslinkArr);
        const distanceObj = this.getCompositeModel().get("distancesObj");
        if (this.get("showShortestLinksOnly") && distanceObj) { // filter to shortest links if showShortestLinksOnly set
            linkDataObj.fullLinkList = distanceObj.getShortestLinkAlternatives(linkDataObj.fullLinkList);
        }
        this.setLinkListWrapped(linkDataObj);
        return this;
    }

    /**
     * Converts array of crosslink objects to 3D link representations.
     * Core method that maps CLMS crosslinks to NGL 3D space by resolving protein-to-chain mappings,
     * handling sequence alignments, filtering homomultimeric links, and categorizing links into
     * full links (both ends in PDB) and half links (one end in PDB).
     * @param {Array} crosslinkArr - Array of crosslink objects from CLMS model
     * @returns {Object} Object with fullLinkList and halfLinkList arrays containing link objects
     */
    makeLinkList(crosslinkArr) {
        const structure = this.get("structureComp").structure;
        let nextResidueId = 0;
        // const structureId = null;
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

        // eslint-disable-next-line no-unused-vars
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
                    const alignID = make3DAlignID(structureName, chainValue.name, chainIndex);
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
        const distObj = this.getCompositeModel().get("distancesObj");
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
        const modelIndexedChainMap = makeSubIndexedMap(chainMap, "modelIndex");

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

        // eslint-disable-next-line no-unused-vars
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
        // eslint-disable-next-line no-unused-vars
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

                // eslint-disable-next-line no-unused-vars
                const octreeIgnoreFunc = function (point1, point2) {
                    return not3DHomomultimeric(xlink, point1.chainIndex, point2.chainIndex);
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

                        // if (alternativeCount > 4) { // if more than a certain number of possible pairings whittle it down to the closest one
                        //     addAtomPoints.call(this, fromPDBResidues);
                        //     addAtomPoints.call(this, toPDBResidues);
                        //     let results = getMinimumDistance(fromPDBResidues, toPDBResidues, octAccessorObj, 2000, octreeIgnoreFunc);
                        //     results = results.filter(function (res) {
                        //         return res[2] !== undefined;
                        //     });
                        //     if (results.length) {
                        //         results.forEach(function (r) {
                        //             r[2] = toNearest(Math.sqrt(r[2]), 1);
                        //         });
                        //         //console.log ("res", results);
                        //
                        //         let prime = results[0];
                        //         results.forEach(function (res, i) {
                        //             if (i > 0) {
                        //                 let d = prime[2] - res[2];
                        //                 if (d === 0) {
                        //                     d = tieBreakerFunc(prime[0], prime[1], res[0], res[1]);
                        //                 }
                        //                 if (d > 0) {
                        //                     prime = res;
                        //                 }
                        //             }
                        //         });
                        //
                        //         //console.log ("aa", alternativeCount, results, prime);
                        //         fromPDBResidues = [prime[0]];  // take top result for new fromPDBResidues array
                        //         toPDBResidues = [prime[1]];    // take top result for new toPDBResidues array
                        //     } else {
                        //         alternativeCount = 0;   // no valid distances found
                        //     }
                        // }

                        addResidueListsExtraInfo([fromPDBResidues, toPDBResidues]);

                        if (alternativeCount > 0) {
                            fromPDBResidues.forEach(function (fromPDB) {
                                toPDBResidues.forEach(function (toPDB) {
                                    if (not3DHomomultimeric(xlink, toPDB.chainIndex, fromPDB.chainIndex)) {
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
                const toChains = chainValueMap.get(toProtID);
                const fromChains = chainValueMap.get(fromProtID);

                // One of these residue lists will be empty
                const fromPDBResidues = makePDBIndexedResidues(fromChains, xlink.fromResidue, fromProtID);
                const toPDBResidues = makePDBIndexedResidues(toChains, xlink.toResidue, toProtID);
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

    /**
     * Wraps link lists with index structures for efficient lookups.
     * Creates multiple maps: residueId to linkIds, linkId to link objects,
     * residue objects by various indices (residueId, NGLglobalIndex).
     * Filters half links that also exist as full links when showShortestLinksOnly is true.
     * @param {Object} linkDataObj - Object with fullLinkList and halfLinkList arrays
     */
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

    /**
     * Gets count of unique original crosslinks represented by full links.
     * @returns {number} Count of unique original crosslink IDs
     */
    getFullLinkCount() {
        return this._origFullLinkCount;
    }

    /**
     * Gets all full links or full links for a specific residue.
     * @param {Object} [residue] - Optional residue object to filter links
     * @returns {Array} Array of full link objects
     */
    getFullLinks(residue) {
        return residue === undefined ? this.get("linkList") : this.getFullLinksByResidueID(residue.residueId);
    }

    /**
     * Gets count of full links involving a specific residue.
     * @param {Object} residue - Residue object with residueId property
     * @returns {number} Count of full links involving this residue
     */
    getFullLinkCountByResidue(residue) {
        const linkIds = this._residueIdToFullLinkIds[residue.residueId];
        return linkIds ? linkIds.length : 0;
    }

    /**
     * Gets full links for a specific residue by residue ID.
     * @param {number} residueId - Internal residue ID
     * @returns {Array} Array of full link objects involving this residue
     */
    getFullLinksByResidueID(residueId) {
        const linkIds = this._residueIdToFullLinkIds[residueId];
        return linkIds ? linkIds.map(function (l) {
            return this._linkIdMap[l];
        }, this) : [];
    }

    /**
     * Gets count of unique original crosslinks represented by half links.
     * @returns {number} Count of unique original crosslink IDs
     */
    getHalfLinkCount() {
        return this._origHalfLinkCount;
    }

    /**
     * Gets all half links or half links for a specific residue.
     * @param {Object} [residue] - Optional residue object to filter links
     * @returns {Array} Array of half link objects
     */
    getHalfLinks(residue) {
        return residue === undefined ? this.get("halfLinkList") : this.getHalfLinksByResidueID(residue.residueId);
    }

    /**
     * Gets count of half links involving a specific residue.
     * @param {Object} residue - Residue object with residueId property
     * @returns {number} Count of half links involving this residue
     */
    getHalfLinkCountByResidue(residue) {
        const linkIds = this._residueIdToHalfLinkIds[residue.residueId];
        return linkIds ? linkIds.length : 0;
    }

    /**
     * Gets half links for a specific residue by residue ID.
     * @param {number} residueId - Internal residue ID
     * @returns {Array} Array of half link objects involving this residue
     */
    getHalfLinksByResidueID(residueId) {
        const linkIds = this._residueIdToHalfLinkIds[residueId];
        return linkIds ? linkIds.map(function (l) {
            return this._halfLinkIdMap[l];
        }, this) : [];
    }

    /**
     * Gets full link by NGL global residue indices of both ends.
     * @param {number} NGLGlobalResIndex1 - NGL global residue index of first end
     * @param {number} NGLGlobalResIndex2 - NGL global residue index of second end
     * @returns {Object|undefined} Full link object or undefined if not found
     */
    getFullLinkByNGLResIndices(NGLGlobalResIndex1, NGLGlobalResIndex2) {
        return this._fullLinkNGLIndexMap[NGLGlobalResIndex1 + "-" + NGLGlobalResIndex2];
    }

    /**
     * Gets half link by NGL global residue index.
     * @param {number} NGLGlobalResIndex1 - NGL global residue index
     * @returns {Object|undefined} Half link object or undefined if not found
     */
    getHalfLinkByNGLResIndex(NGLGlobalResIndex1) {
        return this._halfLinkNGLIndexMap[NGLGlobalResIndex1];
    }

    /**
     * Gets residues from full links.
     * @param {Object|Array} [fullLink] - Optional full link object(s). If undefined, returns all residues
     * @returns {Array} Array of residue objects
     */
    getResidues(fullLink) {
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

    /**
     * Gets residues from half links.
     * @param {Object|Array} [halfLink] - Optional half link object(s). If undefined, returns all half link residues
     * @returns {Array} Array of residue objects
     */
    getHalfLinkResidues(halfLink) {
        if (halfLink === undefined) {
            const halfLink = this.getHalfLinks();
            let residues = [];
            halfLink.forEach(function (l) {
                residues.push(l.residue); // push two values at once so don't use .map
            });
            return residues;
        } else if (Array.isArray(halfLink)) {
            let residues = [];
            halfLink.forEach(function (l) {
                residues.push(l.residue); // push two values at once so don't use .map
            });
            return residues;
        } else {
            return [halfLink.residue];
        }
    }

    /**
     * Gets links shared between two residues.
     * @param {Object} residueA - First residue object
     * @param {Object} residueB - Second residue object
     * @returns {Array|boolean} Array of shared link objects, or false if none found
     */
    getSharedLinks(residueA, residueB) {
        const aLinks = this.getFullLinks(residueA);
        const bLinks = this.getFullLinks(residueB);
        const sharedLinks = intersectObjectArrays(aLinks, bLinks, function (l) {
            return l.linkId;
        });
        return sharedLinks.length ? sharedLinks : false;
    }

    /**
     * Gets residue object by NGL global residue index.
     * @param {number} nglGlobalResIndex - NGL global residue index
     * @returns {Object|undefined} Residue object or undefined if not found
     */
    getResidueByNGLGlobalIndex(nglGlobalResIndex) {
        return this._residueNGLIndexMap[nglGlobalResIndex];
    }

    /**
     * Checks if residue is present in current residue map.
     * @param {Object} residue - Residue object with residueId property
     * @returns {boolean} True if residue is present
     */
    hasResidue(residue) {
        return this._residueIdMap[residue.residueId] !== undefined;
    }

    /**
     * Checks if link is present in current link map.
     * @param {Object} link - Link object with linkId property
     * @returns {boolean} True if link is present
     */
    hasLink(link) {
        return this._linkIdMap[link.linkId] !== undefined;
    }

    // Filter down a list of residue objects to those that are currently in the residueIdMap object
    getAvailableResidues(residues) {
        return residues.filter(function (r) {
            return this.hasResidue(r);
        }, this);
    }

    // Filter down a list of links to those that are currently in the linkIdMap object
    getAvailableLinks(linkObjs) {
        return linkObjs.filter(function (linkObj) {
            return this.hasLink(linkObj);
        }, this);
    }

    // Return original crosslinks from this model's link objects using origId property value
    getOriginalCrossLinks(linkObjs) {
        const xlinks = this.getCompositeModel().get("clmsModel").getCrosslinks();
        return linkObjs.map(function (linkObj) {
            return xlinks.get(linkObj.origId);
        });
    }

    /**
     * Counts unique original crosslinks from link objects.
     * @param {Array} linkObjs - Array of link objects with origId properties
     * @returns {number} Count of unique original crosslink IDs
     */
    getOriginalCrossLinkCount(linkObjs) {
        return d3.set(_.pluck(linkObjs, "origId")).size();
    }

    // Return an array of atom pair indices (along with original link id) for a given array of crosslink objects
    getAtomPairsFromLinkList(linkList) {
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
                    xilog("dodgy pair", link);
                }
            }, this);
            //xilog ("getAtomPairs", atomPairs);
        }

        return atomPairs;
    }

    /**
     * Returns atom pairs for all full links involving a residue.
     * @param {Object} residue - Residue object
     * @returns {Array} Array of [atomIndexA, atomIndexB, origId] tuples
     */
    getAtomPairsFromResidue(residue) {
        return this.getAtomPairsFromLinkList(this.getFullLinks(residue));
    }

    /**
     * Gets information about viable chains in the structure.
     * Filters out tiny chains and chains not mapped to proteins.
     * @returns {Object} Object with viableChainIndices array and total resCount number
     */
    getChainInfo() {
        let resCount = 0;
        const viableChainIndices = [];
        const self = this;
        //console.log ("strcutcomp", this.get("structureComp").structure);
        this.get("structureComp").structure.eachChain(function (cp) {
            // Don't include chains which are tiny or ones we can't match to a protein
            if (isViableChain(cp) && self.get("reverseChainMap").get(cp.index)) {
                resCount += cp.residueCount;
                viableChainIndices.push(cp.index);
            }
        });
        return {
            viableChainIndices: viableChainIndices,
            resCount: resCount
        };
    }

    /**
     * Calculates C-alpha atom indices for all residues in specified chains.
     * Builds a map of chain index → array of C-alpha atom indices.
     * Handles cases where some residues don't have C-alpha atoms (e.g., 5TAF errors).
     * @param {Array} chainIndices - Array of chain indices to process
     * @returns {Object} Map of chain indices to arrays of C-alpha atom indices
     */
    calculateAllCaAtomIndices(chainIndices) {
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

                const sel = getRangedCAlphaResidueSelectionForChain(chainProxy);
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

    /**
     * Calculates distance matrices for all chain pairs.
     * For large structures (linksOnly=true), only calculates distances for actual crosslinks.
     * For smaller structures (linksOnly=false), calculates all Ca-Ca distances.
     * @param {boolean} linksOnly - Whether to calculate only link distances (true) or all distances (false)
     * @returns {Object} Map of "chain1-chain2" keys to distance matrix objects
     */
    getChainDistances(linksOnly) {
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

    /**
     * Gets the length (residue count) of a chain.
     * @param {number} chainIndex - Chain index
     * @returns {number|undefined} Number of residues in chain, or undefined if chain not found
     */
    getChainLength(chainIndex) {
        const chain = this.get("chainCAtomIndices")[chainIndex];
        return chain ? chain.length : undefined;
    }

    /**
     * Calculates distances only for actual crosslinks between two chains.
     * Filters links to those connecting the specified chains, filters homomultimeric links,
     * and builds a sparse distance matrix containing only crosslink distances.
     * @param {Array} chainAtomIndices1 - C-alpha atom indices for first chain
     * @param {Array} chainAtomIndices2 - C-alpha atom indices for second chain
     * @param {number} chainIndex1 - First chain index
     * @param {number} chainIndex2 - Second chain index
     * @param {Array} links - Array of link objects to process
     * @returns {Array} Sparse 2D array of distances (only populated for actual crosslinks)
     */
    getLinkDistancesBetween2Chains(chainAtomIndices1, chainAtomIndices2, chainIndex1, chainIndex2, links) {

        const notHomomultimeric = function (xlinkID, c1, c2) {
            const xlink = this.getCompositeModel().get("clmsModel").getCrosslinks().get(xlinkID);
            return not3DHomomultimeric(xlink, c1, c2);
        };

        links = links.filter(function (link) {
            return (link.residueA.chainIndex === chainIndex1 && link.residueB.chainIndex === chainIndex2 && notHomomultimeric.call(this, link.origId, chainIndex1, chainIndex2));
            /*||
                               (link.residueA.chainIndex === chainIndex2 && link.residueB.chainIndex === chainIndex1)*/

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

    /**
     * Calculates all Ca-Ca distances between two chains.
     * Builds a complete distance matrix for all residue pairs between chains.
     * For same-chain comparisons, diagonal is set to 0.
     * @param {Array} chainAtomIndices1 - C-alpha atom indices for first chain
     * @param {Array} chainAtomIndices2 - C-alpha atom indices for second chain
     * @param {number} chainIndex1 - First chain index
     * @param {number} chainIndex2 - Second chain index
     * @returns {Array} Complete 2D array of distances between all residue pairs
     */
    getAllDistancesBetween2Chains(chainAtomIndices1, chainAtomIndices2, chainIndex1, chainIndex2) {
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

    /**
     * Gets 3D coordinates of an atom.
     * @param {Object} atomProxy - NGL atom proxy object
     * @returns {Array} Array of [x, y, z] coordinates
     */
    getAtomCoordinates(atomProxy) {
        return [atomProxy.x, atomProxy.y, atomProxy.z];
    }

    /**
     * Calculates distance between two atoms via proxies.
     * Returns undefined if atoms are in different models and allowInterModelDistances is false.
     * @param {Object} ap1 - First atom proxy
     * @param {Object} ap2 - Second atom proxy
     * @returns {number|undefined} Distance in Angstroms, or undefined if inter-model distance not allowed
     */
    getAtomProxyDistance(ap1, ap2) {
        return ap1.modelIndex === ap2.modelIndex || this.get("allowInterModelDistances") ? ap1.distanceTo(ap2) : undefined;
    }

    // Residue indexes for this function start from zero per chain i.e. not global NGL index for residues
    getAtomIndex(seqIndex, chainIndex, chainAtomIndices) {
        const cai = chainAtomIndices || this.get("chainCAtomIndices");
        const ci = cai[chainIndex];
        const ai = ci[seqIndex];
        return ai;
    }

    // seqIndex1 and 2 are 0-indexed, with zero being first residue in pdb chain
    getSingleDistanceBetween2Residues(seqIndex1, seqIndex2, chainIndex1, chainIndex2) {
        const struc = this.get("structureComp").structure;
        const ap1 = struc.getAtomProxy();
        const ap2 = struc.getAtomProxy();
        const cai = this.get("chainCAtomIndices");
        ap1.index = this.getAtomIndex(seqIndex1, chainIndex1, cai);
        ap2.index = this.getAtomIndex(seqIndex2, chainIndex2, cai);

        return this.getAtomProxyDistance(ap1, ap2);
    }

    // make an array of pdb file compatible link entries for the supplied crosslink objects
    getAtomPairsAndDistancesFromLinkList(links) {
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

    /**
     * Generates PDB LINK records for crosslinks.
     * Creates properly formatted PDB LINK records with atom names, residue info, chain IDs, and distances.
     * @param {Array} links - Array of link objects
     * @returns {string} Newline-separated PDB LINK records
     */
    getPDBLinkString(links) {
        const pdbLinks = [];
        const struc = this.get("structureComp").structure;
        const ap = struc.getAtomProxy();
        const linkFormat = "LINK        %-4s %-3s %1s%4d                %-4s %-3s %1s%4d   %6s %6s %5.2f";

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

    /**
     * Generates PDB CONECT records for crosslinks.
     * CONECT is the correct PDB format spelling. Creates records linking atom pairs by index.
     * @param {Array} links - Array of link objects
     * @returns {string} Newline-separated PDB CONECT records sorted by first atom index
     */
    getPDBConectString(links) {  // Conect is spelt right
        const pdbConects = [];
        const atomPairs = this.getAtomPairsFromLinkList(links);
        const conectFormat = "CONECT%5d%5d                                                                ";
        atomPairs.sort(function (a, b) {
            return a[0] - b[0];
        });   // order by ascending first atompair index

        atomPairs.forEach(function (atomPair) {
            pdbConects.push(sprintf(conectFormat, atomPair[0], atomPair[1]));
        }, this);

        return pdbConects.join("\n");
    }

    /**
     * Generates efficient NGL selection string from residue list.
     * Builds hierarchical model→chain→residue selection with optimized syntax for fast NGL parsing.
     * Groups consecutive residues into ranges for efficiency.
     * @param {Array|string} resnoList - Array of residue objects, "all" for all residues, or null/empty for "none"
     * @param {Object} [options] - Options object
     * @param {boolean} [options.allAtoms] - If true, includes all atoms (not just C-alpha)
     * @param {boolean} [options.chainsOnly] - If true, selects entire chains (residue details ignored)
     * @returns {string} NGL selection string
     */
    getSelectionFromResidueList(resnoList, options) { // set allAtoms to true to not restrict selection to alpha carbon atoms
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
            // eslint-disable-next-line no-unused-vars
            const tmp = resnoList.map(function (r) {
                cp.index = r.chainIndex;

                // Make a hierarchy of models --> chains --> residues to build a string from later
                let modelBranch = modelTree.get(cp.modelIndex);
                if (!modelBranch) {
                    let a = new d3.map();
                    modelTree.set(cp.modelIndex, a);
                    modelBranch = a;
                }

                let chainBranch = modelBranch.get(cp.chainname);
                if (!chainBranch) {
                    let a = new d3.set();
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
                            vals = joinConsecutiveNumbersIntoRanges(vals);
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


    /**
     * Gets atom index from residue object.
     * @param {Object} resObj - Residue object with seqIndex, chainIndex, and resno properties
     * @returns {number|undefined} Atom index, or undefined if resno not set
     */
    getAtomIndexFromResidueObj(resObj) {
        const resno = resObj.resno;
        return resno !== undefined ? this.getAtomIndex(resObj.seqIndex, resObj.chainIndex) : undefined;
    }

    /**
     * Creates NGL selection string for first atom of each viable chain.
     * Used for chain labeling and visualization.
     * @param {Set} [chainIndexSet] - Optional set of chain indices to filter (if not provided, uses all viable chains)
     * @returns {string} NGL selection string in "@atomIndex1,atomIndex2,..." format
     */
    makeFirstAtomPerChainSelectionString(chainIndexSet) {
        const comp = this.get("structureComp").structure;
        const sels = [];
        comp.eachChain(function (cp) {
            // if chain longer than 10 resiudes and (no chainindexset present or chain index is in chainindexset)
            if (isViableChain(cp) && (!chainIndexSet || chainIndexSet.has(cp.index))) {
                sels.push(cp.atomOffset);
            }
        });
        return "@" + sels.join(",");
    }

    // Get a NGL selection for chains listing only the chainIndices passed in as a property of chainItems
    makeChainSelectionString(chainItems) {
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

        //xilog ("CHAIN SELE", selectionString);
        return selectionString;
    }

    // Return chain indices covered by currently visible proteins
    getShowableChains(showAll) {
        const protMap = Array.from(this.getCompositeModel().get("clmsModel").getProteinsIterator());
        const prots = protMap.filter(function (prot) {
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
        xilog("SHOW CHAINS", chainIndices);
        return {
            showAll: showAll,
            chainIndices: chainIndices
        };
    }

    /**
     * Gets 3D coordinates of all C-alpha atoms in a chain.
     * @param {number} chainIndex - Chain index
     * @returns {Array} Array of [x, y, z] coordinate arrays for each residue's C-alpha atom
     */
    getAllResidueCoordsForChain(chainIndex) {
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

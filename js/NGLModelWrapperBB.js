var CLMSUI = CLMSUI || {};
CLMSUI.BackboneModelTypes = CLMSUI.BackboneModelTypes || {};

CLMSUI.BackboneModelTypes.NGLModelWrapperBB = Backbone.Model.extend({
    defaults: {
        compositeModel: null,
        structureComp: null,
        chainMap: null,
        linkList: null,
        fullDistanceCalcCutoff: 1200,
        allowInterModelDistances: false,
        showShortestLinksOnly: true,
    },

    // Most of the stuff in this file is dealing with the complications of a single protein possibly mapping to many different chains
    // in a PDB structure.

    initialize: function() {
        // When compositeModel is declared, hang a listener on it that listens to change in alignment model as this
        // possibly changes links and distances in 3d model
        // this is in case 3d stuff has been set up before main model (used to happen that pdb's were autoloaded for some searches)
        this.listenToOnce (this, "change:compositeModel", function() { // only do this once (should only happen once anyways but better safe than sorry)
            // alignment change may mean distances are different so recalc
            this.listenTo(this.getCompositeModel().get("alignColl"), "bulkAlignChange", function() {
                console.log("SET UP LINKS");
                this.setupLinks();
            });
        });

        this.listenTo (this, "change:allowInterModelDistances", function (model, val) {
            var compModel = this.get("compositeModel");
            compModel.getCrossLinkDistances (compModel.getAllCrossLinks());  // regenerate distances for all crosslinks
            CLMSUI.vent.trigger ("changeAllowInterModelDistances", model, val);
        });

        this.listenTo (this, "change:chainMap", function (model, val) {
            model.makeReverseChainMap (val);
        });

        this.makeReverseChainMap (this.get("chainMap"));
    },

    // make a map of chain indices to protein ids
    makeReverseChainMap: function (chainMap) {
        var reverseChainMap = d3.map();
        var entries = d3.entries(chainMap);
        entries.forEach (function (entry) {
            entry.value.forEach (function (valueItem) {
                reverseChainMap.set (valueItem.index, entry.key);
            });
        });
        this.set ("reverseChainMap", reverseChainMap);
        return this;
    },

    getCompositeModel: function() {
        return this.get("compositeModel");
    },

    getStructureName: function () {
        return this.get("structureComp").structure.name;
    },

    /**
    *   Call when new PDB file loaded
    */
    setupLinks: function() {
        var chainInfo = this.getChainInfo();
        this.calculateAllCaAtomIndices (chainInfo.viableChainIndices);
        this.setFilteredLinkList ();

        // The point of this is to build a cache for Ca-Ca distances so we don't have to keep asking the ngl components for them
        // For very large structures we just store the distances that map to crosslinks, so we have to get other distances by reverting to the ngl stuff
        var distances = this.getChainDistances(chainInfo.resCount > this.defaults.fullDistanceCalcCutoff);
        var distancesObj = new CLMSUI.DistancesObj (distances, this.get("chainMap"), this.getStructureName());

        var clmsModel = this.getCompositeModel().get("clmsModel");
        // silent change and trigger, as loading in the same pdb file doesn't trigger the change automatically (as it generates an identical distance matrix)
        // Secondly, inserting a silent set to 'null' first stops backbone temporarily storing the previous distancesobj, as they could both be quite large
        // Also want to recalculate link distances with this object, before informing views the object is new (otherwise may draw with old data)
        clmsModel.set("distancesObj", null, {silent: true});
        clmsModel.set("distancesObj", distancesObj, {silent: true});
        distancesObj.maxDistance = d3.max (this.getCompositeModel().getHomomDistances (this.getCompositeModel().getAllCrossLinks()));
        clmsModel.trigger("change:distancesObj", clmsModel, clmsModel.get("distancesObj"));
        return this;
    },

    /**
    *   Call when set of filtered cross-links has changed
    */
    setFilteredLinkList: function () {
        this.setLinkList (this.getCompositeModel().getFilteredCrossLinks());
        return this;
    },

    setLinkList: function (crossLinkArr) {
        var linkDataObj = this.makeLinkList (crossLinkArr);
        var distanceObj = this.getCompositeModel().get("clmsModel").get("distancesObj");
        if (this.get("showShortestLinksOnly") && distanceObj) { // filter to shortest links if showShortestLinksOnly set
            linkDataObj.fullLinkList = distanceObj.getShortestLinkAlternatives(linkDataObj.fullLinkList);
        }
        this.setLinkListWrapped (linkDataObj);
        return this;
    },

    makeLinkList: function (crossLinkArr) {
        var structure = this.get("structureComp").structure;
        var nextResidueId = 0;
        var structureId = null;
        var structureName = this.getStructureName();
        var residueDict = {};
        var fullLinkList = [];  // links where both ends are in pdb
        var halfLinkList = [];  // links where one end is in the pdb
        var residueProxy1 = structure.getResidueProxy();
        var chainProxy = structure.getChainProxy();
        var atomProxy = structure.getAtomProxy();
        var alignColl = this.getCompositeModel().get("alignColl");

        function getResidueId (globalNGLResIndex) {
            // TODO add structureId to key
            // TODO in NMR structures there are multiple models // mjg - chainIndex is unique across models
            if (residueDict[globalNGLResIndex] === undefined) {
                residueDict[globalNGLResIndex] = nextResidueId;
                nextResidueId++;
            }
            return residueDict[globalNGLResIndex];
        }

        function addAtomPoints (pdbIndexedResidues) {
            pdbIndexedResidues.forEach (function (fat) {
                var atomIndex = this.getAtomIndex (fat.seqIndex, fat.chainIndex);
                fat.atomIndex = atomIndex;
                atomProxy.index = atomIndex;
                var coords = this.getAtomCoordinates (atomProxy);
                fat.coords = coords;
            }, this);
        }

        function makePDBIndexedResidues (perModelChainEntry, searchIndexResidue, protID) {
            if (perModelChainEntry) {
                return perModelChainEntry.values.map (function (chainValue) {
                    var chainIndex = chainValue.index;  // global NGL chain index
                    var alignID = CLMSUI.NGLUtils.make3DAlignID (structureName, chainValue.name, chainIndex);
                    return {
                        chainIndex: chainIndex,
                        modelIndex: chainValue.modelIndex,
                        seqIndex: alignColl.getAlignedIndex (searchIndexResidue, protID, false, alignID, true) - 1,  // residues are 0-indexed in NGL so -1
                    };
                }).filter (function (datum) {   // remove residues with no aligned residue in ngl sequence
                   return datum.seqIndex >= 0;
                });
            }
            return [];
        }

        // add extra info to a residue object that's handy later on
        function addResidueExtraInfo (pdbIndexedResidue, residueProxy) {
            var ri = residueProxy.index;
            pdbIndexedResidue.NGLglobalIndex = ri;          // Why? A: used to get data via ResidueProxy. rp.index = value;
            //pdbIndexedResidue.resindex = pdbIndexedResidue.seqIndex;  // removed duplicate, seqIndex makes more sense as variable name anyways
            pdbIndexedResidue.residueId = getResidueId (ri);
            pdbIndexedResidue.resno = residueProxy.resno;   // Why? A: ngl residue index to resno conversion, as NGL.Selection() works with resno values
            pdbIndexedResidue.structureId = null;
        }

        // call the previous function with the contents of an array of arrays
        // usually the to and from residues object lists
        function addResidueListsExtraInfo (residueObjLists) {
            residueObjLists.forEach (function (residueObjList) {
                residueObjList.forEach (function (residueObj) {
                    chainProxy.index = residueObj.chainIndex;
                    residueProxy1.index = residueObj.seqIndex + chainProxy.residueOffset;
                    addResidueExtraInfo (residueObj, residueProxy1);
                }, this);
            });
        }

        function addToHalfLinkList (crossLink, residueObjList) {
            residueObjList.forEach (function (residueObj) {
                halfLinkList.push ({
                    origId: crossLink.id,
                    linkId: halfLinkList.length,
                    residue: residueObj,
                });
            }, this);
        }

        var t = performance.now();

        // Make a copy of chainMap, and if distancesObj is initialised run through the proteins in chainMap
        // and remove the chains which are not permitted because of current assembly type choice.
        // Can save many calculations if assembly type is a smaller unit than the default pdb assembly type.
        // e.g. for assembly type BU1 or BU2 in 1AO6 only check chain combination A-A or B-B rather than all of A-A, A-B, B-A and B-B
        var chainMap = $.extend ({}, this.get("chainMap"));
        var distObj = this.getCompositeModel().get("clmsModel").get("distancesObj");
        if (distObj) {
            var chainSet = distObj.permittedChainIndicesSet;
            d3.entries(chainMap).forEach (function (proteinEntry) {
                chainMap[proteinEntry.key] = proteinEntry.value.filter (function (chainEntry) { return chainSet.has (chainEntry.index); });
            });
            //console.log ("chainMap", chainMap, chainSet);
        }

        // divide map of protein --> array of chains into two-deep map of protein --> model --> array of chains, in case we don't want to make links between different models
        var modelIndexedChainMap = CLMSUI.modelUtils.makeSubIndexedMap(chainMap, "modelIndex");

        // d3.mapped and wrapped versions of chainMap and modelIndexedChainMap. Easier to use for some operations.
        var chainValueMap = d3.map();
        var modelIndexedChainValueMap = d3.map();
        d3.entries(chainMap).forEach (function (protEntry) {
            chainValueMap.set (protEntry.key, {values: protEntry.value});
        });
        d3.entries(modelIndexedChainMap).forEach (function (protEntry) {
            modelIndexedChainValueMap.set (protEntry.key, d3.map (protEntry.value, function(d) { return d.key; }));
        });

        console.log ("CHAINS", chainMap, chainValueMap, modelIndexedChainMap, modelIndexedChainValueMap);
        var allowInterModelDistances = this.get("allowInterModelDistances");

        var octAccessorObj = {
            id: function (d) { return d; },
            x: function (d) { return d.coords[0]; },
            y: function (d) { return d.coords[1]; },
            z: function (d) { return d.coords[2]; },
        };
        var tieBreakerFunc = CLMSUI.DistancesObj.prototype.tieBreaker;

        crossLinkArr.forEach (function (xlink) {
            // Check from chain - to chain pairings for valid crosslink possibilities.
            // Where inter-model links barred, divide from and to chains into sets per model and
            // loop through the pairings in subsets.
            var fromProtID = xlink.fromProtein.id;
            var toProtID = xlink.toProtein.id;

            var fromPerModelChains = allowInterModelDistances ? [chainValueMap.get(fromProtID)] : modelIndexedChainMap[fromProtID];
            var toPerModelChains = modelIndexedChainMap[toProtID];

            var fromEmpty = _.isEmpty(fromPerModelChains);
            var toEmpty = _.isEmpty(toPerModelChains);
            // Don't continue if neither end of crosslink within pdb
            if (!fromEmpty && !toEmpty) {

                // get a map (key -> value) of the toPerModelChains entries
                var toPerModelChainMap = modelIndexedChainValueMap.get (toProtID);
                var toChainMap = chainValueMap.get (toProtID);

                var octreeIgnoreFunc = function (point1, point2) {
                    return CLMSUI.NGLUtils.not3DHomomultimeric (xlink, point1.chainIndex, point2.chainIndex);
                };

                fromPerModelChains.forEach (function (fromPerModelChainEntry) {
                    // If inter-model links allowed, pick all toChains, else pick only toChains
                    // with same modelID as current set of fromModelChains
                    var toChains = allowInterModelDistances ? toChainMap : toPerModelChainMap.get (fromPerModelChainEntry.key);

                    //console.log ("XLINK CHAINS", xlink.id, fromPerModelChains, toPerModelChains);

                    if (toChains) { // don't proceed if inter model distances barred and no 'to' chains within current model

                        var fromPDBResidues = makePDBIndexedResidues (fromPerModelChainEntry, xlink.fromResidue, fromProtID);
                        var toPDBResidues = makePDBIndexedResidues (toChains, xlink.toResidue, toProtID);
                        var alternativeCount = fromPDBResidues.length * toPDBResidues.length;
                        //console.log ("FTpdbr", fromPDBResidues, toPDBResidues, alternativeCount);

                        if (alternativeCount > 4) { // if more than a certain number of possible pairings whittle it down to the closest one
                            addAtomPoints.call (this, fromPDBResidues);
                            addAtomPoints.call (this, toPDBResidues);
                            var results = CLMSUI.modelUtils.getMinimumDistance (fromPDBResidues, toPDBResidues, octAccessorObj, 2000, octreeIgnoreFunc);
                            results = results.filter (function (res) { return res[2] !== undefined; });
                            if (results.length) {
                                results.forEach (function (r) { r[2] = CLMSUI.utils.toNearest (Math.sqrt(r[2]), 1); });
                                //console.log ("res", results);

                                var prime = results[0];
                                results.forEach (function (res, i) {
                                    if (i > 0) {
                                        var d = prime[2] - res[2];
                                        if (d === 0) {
                                            d = tieBreakerFunc (prime[0], prime[1], res[0], res[1]);
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

                        addResidueListsExtraInfo ([fromPDBResidues, toPDBResidues]);

                        if (alternativeCount > 0) {
                            fromPDBResidues.forEach (function (fromPDB) {
                                toPDBResidues.forEach (function (toPDB) {
                                    if (CLMSUI.NGLUtils.not3DHomomultimeric (xlink, toPDB.chainIndex, fromPDB.chainIndex)) {
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
                            addToHalfLinkList (xlink, fromPDBResidues);
                            addToHalfLinkList (xlink, toPDBResidues);
                        }
                    }
                }, this);
            } else if (!toEmpty || !fromEmpty) {    // only one end of link in a pdb-indexed protein
                var toChains = chainValueMap.get (toProtID);
                var fromChains = chainValueMap.get (fromProtID);

                // One of these residue lists will be empty
                var fromPDBResidues = makePDBIndexedResidues (fromChains, xlink.fromResidue, fromProtID);
                var toPDBResidues = makePDBIndexedResidues (toChains, xlink.toResidue, toProtID);
                addResidueListsExtraInfo ([fromPDBResidues, toPDBResidues]);
                addToHalfLinkList (xlink, fromPDBResidues);
                addToHalfLinkList (xlink, toPDBResidues);
            }
        }, this);

        console.log ("TIME", (performance.now() - t) / 1000, "seconds");
        //console.log ("fullLinklist", fullLinkList.length, fullLinkList);
        //console.log ("halfLinkList", halfLinkList);
        return {fullLinkList: fullLinkList, halfLinkList: halfLinkList};
    },

    setLinkListWrapped: function (linkDataObj) {
        var linkList = linkDataObj.fullLinkList;
        var halfLinkList = linkDataObj.halfLinkList;
        var residueIdToFullLinkIds = {};
        var residueIdToHalfLinkIds = {};
        var linkIdMap = {};
        var halfLinkIdMap = {};
        var residueIdMap = {};

        function insertResidue (residue, link, map) {
            var resID = residue.residueId;
            var list = map[resID];
            if (list === undefined) {
                map[resID] = [link.linkId];
            } else if (!_.includes(list, link.linkId)) {
                list.push(link.linkId);
            }
            residueIdMap[resID] = residue;
        }

        linkList.forEach(function(link) {
            linkIdMap[link.linkId] = link;
            insertResidue(link.residueA, link, residueIdToFullLinkIds);
            insertResidue(link.residueB, link, residueIdToFullLinkIds);
        });

        // remove half links that also have full link instances
        if (this.get("showShortestLinksOnly")) {
            var origFullLinkIDs = d3.set (_.pluck (linkList, "origId"));
            halfLinkList = halfLinkList.filter (function (halfLink) {
                return !origFullLinkIDs.has (halfLink.origId);
            });
        }

        halfLinkList.forEach (function (halfLink) {
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
        this._residueNGLIndexMap = _.indexBy (this._residueList, "NGLglobalIndex");
        this._fullLinkNGLIndexMap = {};
        linkList.forEach (function (link) {
            this._fullLinkNGLIndexMap[link.residueA.NGLglobalIndex+"-"+link.residueB.NGLglobalIndex] = link;
        }, this);
        this._origFullLinkCount = this.getOriginalCrossLinkCount (linkList);
        this._origHalfLinkCount = this.getOriginalCrossLinkCount (halfLinkList);

        //console.log ("setLinkList", residueIdMap, this._residueList, residueIdToFullLinkIds, linkIdMap);
        this.set("linkList", linkList);
        this.set("halfLinkList", halfLinkList);
    },

    getFullLinkCount: function () {
        return this._origFullLinkCount;
    },

    getFullLinks: function (residue) {
        return residue === undefined ? this.get("linkList") : this.getFullLinksByResidueID (residue.residueId);
    },

    getFullLinkCountByResidue: function (residue) {
        var linkIds = this._residueIdToFullLinkIds[residue.residueId];
        return linkIds ? linkIds.length : 0;
    },

    getFullLinksByResidueID: function (residueId) {
        var linkIds = this._residueIdToFullLinkIds[residueId];
        return linkIds ? linkIds.map(function(l) {
            return this._linkIdMap[l];
        }, this) : [];
    },

    getHalfLinkCount: function () {
        return this._origHalfLinkCount;
    },

    getHalfLinks: function (residue) {
        return residue === undefined ? this.get("halfLinkList") : this.getHalfLinksByResidueID (residue.residueId);
    },

    getHalfLinkCountByResidue: function (residue) {
        var linkIds = this._residueIdToHalfLinkIds[residue.residueId];
        return linkIds ? linkIds.length : 0;
    },

    getHalfLinksByResidueID: function (residueId) {
        var linkIds = this._residueIdToHalfLinkIds[residueId];
        return linkIds ? linkIds.map(function(l) {
            return this._halfLinkIdMap[l];
        }, this) : [];
    },

    getFullLinkByNGLResIndices: function (NGLGlobalResIndex1, NGLGlobalResIndex2) {
        return this._fullLinkNGLIndexMap[NGLGlobalResIndex1 + "-" + NGLGlobalResIndex2];
    },

    getResidues: function (fullLink) {
        if (fullLink === undefined) {
            return this._residueList;
        } else if (Array.isArray(fullLink)) {
            var residues = [];
            fullLink.forEach(function(l) {
                residues.push(l.residueA, l.residueB); // push two values at once so don't use .map
            });
            return residues;
        } else {
            return [fullLink.residueA, fullLink.residueB];
        }
    },

    getSharedLinks: function(residueA, residueB) {
        var aLinks = this.getFullLinks (residueA);
        var bLinks = this.getFullLinks (residueB);
        var sharedLinks = CLMSUI.modelUtils.intersectObjectArrays (aLinks, bLinks, function(l) {
            return l.linkId;
        });
        return sharedLinks.length ? sharedLinks : false;
    },

    getResidueByNGLGlobalIndex: function (nglGlobalResIndex) {
        return this._residueNGLIndexMap[nglGlobalResIndex];
    },

    hasResidue: function (residue) {
        return this._residueIdMap[residue.residueId] !== undefined;
    },

    hasLink: function (link) {
        return this._linkIdMap[link.linkId] !== undefined;
    },

    // Filter down a list of residue objects to those that are currently in the residueIdMap object
    getAvailableResidues: function (residues) {
        return residues.filter(function(r) {
            return this.hasResidue(r);
        }, this);
    },

    // Filter down a list of links to those that are currently in the linkIdMap object
    getAvailableLinks: function (linkObjs) {
        return linkObjs.filter(function(linkObj) {
            return this.hasLink(linkObj);
        }, this);
    },

    // Return original crosslinks from this model's link objects using origId property value
    getOriginalCrossLinks: function(linkObjs) {
        var xlinks = this.getCompositeModel().get("clmsModel").get("crossLinks");
        return linkObjs.map(function(linkObj) {
            return xlinks.get(linkObj.origId);
        });
    },

    getOriginalCrossLinkCount: function (linkObjs) {
        return d3.set(_.pluck (linkObjs, "origId")).size();
    },

    // Return an array of atom pair indices (along with original link id) for a given array of crosslink objects
    getAtomPairsFromLinkList: function (linkList) {
        var atomPairs = [];

        if (linkList) {
            if (linkList === "all") {
                linkList = this.getFullLinks();
            }

            linkList.forEach(function(link) {
                var atomA = this.getAtomIndexFromResidueObj (link.residueA);
                var atomB = this.getAtomIndexFromResidueObj (link.residueB);

                if (atomA !== undefined && atomB !== undefined) {
                    atomPairs.push([atomA, atomB, link.origId]);
                } else {
                    CLMSUI.utils.xilog("dodgy pair", link);
                }
            }, this);
            //CLMSUI.utils.xilog ("getAtomPairs", atomPairs);
        }

        return atomPairs;
    },

    getAtomPairsFromResidue: function (residue) {
        return this.getAtomPairsFromLinkList (this.getFullLinks (residue));
    },

    getChainInfo: function() {
        var resCount = 0;
        var viableChainIndices = [];
        var self = this;
        //console.log ("strcutcomp", this.get("structureComp").structure);
        this.get("structureComp").structure.eachChain(function(cp) {
            // Don't include chains which are tiny or ones we can't match to a protein
            if (CLMSUI.NGLUtils.isViableChain(cp) && self.get("reverseChainMap").get(cp.index)) {
                resCount += cp.residueCount;
                viableChainIndices.push(cp.index);
            }
        });
        return {
            viableChainIndices: viableChainIndices,
            resCount: resCount
        };
    },

    calculateAllCaAtomIndices: function(chainIndices) {
        var structure = this.get("structureComp").structure;
        var chainProxy = structure.getChainProxy();
        var atomProxy = structure.getAtomProxy();
        var sele = new NGL.Selection();
        var chainCAtomIndices = {}; // keys on chain index, and within this keys on residue index

        if (chainIndices) {
            chainIndices.forEach(function(ci) {
                chainProxy.index = ci;
                var atomIndices = chainCAtomIndices[ci] = [];
                // 918 in 5taf matches to just one atom, which isn't a carbon, dodgy pdb?

                var sel = CLMSUI.NGLUtils.getRangedCAlphaResidueSelectionForChain(chainProxy);
                sele.setString(sel, true); // true = doesn't fire unnecessary dispatch events in ngl
                var ai = structure.getAtomIndices(sele);

                // Building a resmap in one loop and then running through available residues in another loop because some (errored) residues don't have c-alpha atoms
                // This shouldn't happen, but it does i.e. 5taf, so a 1-to-1 loop between residues and atomIndices wouldn't work in all cases
                var resMap = [];
                ai.forEach(function(atomIndex) {
                    atomProxy.index = atomIndex;
                    resMap[atomProxy.resno] = atomIndex;
                }, this);

                // resno can run from N to M, but atomIndices will be ordered 0 to no. of residues
                chainProxy.eachResidue(function(rp) {
                    //console.log ("RP", rp.resno, rp.index);
                    var atomIndex = resMap[rp.resno];
                    atomIndices.push(atomIndex);
                });
            }, this);
        }

        this.set("chainCAtomIndices", chainCAtomIndices); // store for later
        return chainCAtomIndices;
    },

    getChainDistances: function (linksOnly) {
        var entries = d3.entries(this.get("chainCAtomIndices"));
        var matrixMap = {};
        var links = this.getFullLinks();

        entries.forEach (function (chain1Entry) {
            var chain1 = chain1Entry.key;
            var cindices1 = chain1Entry.value;

            entries.forEach (function (chain2Entry) {
                var chain2 = chain2Entry.key;
                var cindices2 = chain2Entry.value;

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
    },

    getChainLength: function(chainIndex) {
        var chain = this.get("chainCAtomIndices")[chainIndex];
        return chain ? chain.length : undefined;
    },


    getLinkDistancesBetween2Chains: function(chainAtomIndices1, chainAtomIndices2, chainIndex1, chainIndex2, links) {

        var notHomomultimeric = function (xlinkID, c1, c2) {
            var xlink = this.getCompositeModel().get("clmsModel").get("crossLinks").get(xlinkID);
            return CLMSUI.NGLUtils.not3DHomomultimeric(xlink, c1, c2);
        };

        links = links.filter(function(link) {
            return (link.residueA.chainIndex === chainIndex1 && link.residueB.chainIndex === chainIndex2 && notHomomultimeric.call (this, link.origId, chainIndex1, chainIndex2))
            /*||
                           (link.residueA.chainIndex === chainIndex2 && link.residueB.chainIndex === chainIndex1)*/
            ;
            // The reverse match condition produced erroneous links i.e. link chain3,49 to chain 2,56 also passed chain3,56 to chain2,49
        }, this);

        var matrix = [];
        var struc = this.get("structureComp").structure;
        var ap1 = struc.getAtomProxy();
        var ap2 = struc.getAtomProxy();

        links.forEach(function(link) {
            var idA = link.residueA.seqIndex;
            var idB = link.residueB.seqIndex;
            ap1.index = chainAtomIndices1[idA];
            ap2.index = chainAtomIndices2[idB];
            if (ap1.index !== undefined && ap2.index !== undefined) {
                var d = this.getAtomProxyDistance(ap1, ap2);
                //console.log ("link", link, chainIndex1, chainIndex2, idA, idB, ap1.index, ap2.index, d);
                matrix[idA] = matrix[idA] || [];
                matrix[idA][idB] = matrix[idA][idB] || [];
                matrix[idA][idB] = d;
            }
        }, this);

        return matrix;
    },

    getAllDistancesBetween2Chains: function(chainAtomIndices1, chainAtomIndices2, chainIndex1, chainIndex2) {
        var matrix = [];
        var struc = this.get("structureComp").structure;
        var ap1 = struc.getAtomProxy();
        var ap2 = struc.getAtomProxy();
        var cai2length = chainAtomIndices2.length;
        var diffChains = (chainIndex1 !== chainIndex2);

        for (var n = 0; n < chainAtomIndices1.length; n++) {
            ap1.index = chainAtomIndices1[n];
            var ap1undef = (ap1.index === undefined);
            var row = matrix[n] = [];
            for (var m = 0; m < cai2length; m++) {
                if (m !== n || diffChains) {
                    ap2.index = chainAtomIndices2[m];
                    row.push((ap1undef || ap2.index === undefined) ? undefined : this.getAtomProxyDistance(ap1, ap2));
                } else {
                    row.push(0);
                }
            }
        }

        return matrix;
    },

    getAtomCoordinates: function (atomProxy) {
        return [atomProxy.x, atomProxy.y, atomProxy.z];
    },

    getAtomProxyDistance: function (ap1, ap2) {
        return ap1.modelIndex === ap2.modelIndex || this.get("allowInterModelDistances") ? ap1.distanceTo(ap2) : undefined;
    },

    // Residue indexes for this function start from zero per chain i.e. not global NGL index for residues
    getAtomIndex: function (seqIndex, chainIndex, chainAtomIndices) {
        var cai = chainAtomIndices || this.get("chainCAtomIndices");
        var ci = cai[chainIndex];
        var ai = ci[seqIndex];
        return ai;
    },

    // seqIndex1 and 2 are 0-indexed, with zero being first residue in pdb chain
    getSingleDistanceBetween2Residues: function(seqIndex1, seqIndex2, chainIndex1, chainIndex2) {
        var struc = this.get("structureComp").structure;
        var ap1 = struc.getAtomProxy();
        var ap2 = struc.getAtomProxy();
        var cai = this.get("chainCAtomIndices");
        ap1.index = this.getAtomIndex (seqIndex1, chainIndex1, cai);
        ap2.index = this.getAtomIndex (seqIndex2, chainIndex2, cai);

        return this.getAtomProxyDistance(ap1, ap2);
    },

    // make an array of pdb file compatible link entries for the supplied crosslink objects
    getAtomPairsAndDistancesFromLinkList: function (links) {
        var struc = this.get("structureComp").structure;
        var ap1 = struc.getAtomProxy();
        var ap2 = struc.getAtomProxy();
        var atomPairs = this.getAtomPairsFromLinkList (links);

        atomPairs.forEach (function (pair) {
            ap1.index = pair[0];
            ap2.index = pair[1];
            if (ap1.index !== undefined && ap2.index !== undefined) {
                pair.push (this.getAtomProxyDistance (ap1, ap2));
            }
        }, this);

        return atomPairs;
    },

    getPDBLinkString: function (links) {
        var pdbLinks = [];
        var struc = this.get("structureComp").structure;
        var ap = struc.getAtomProxy();
        var linkFormat = 'LINK        %-4s %-3s %1s%4d                %-4s %-3s %1s%4d   %6s %6s %5.2f';

        links.forEach (function (link) {
            var res1 = link.residueA;
            var res2 = link.residueB;
            var atomIndex1 = this.getAtomIndexFromResidueObj (res1);
            var atomIndex2 = this.getAtomIndexFromResidueObj (res2);
            ap.index = atomIndex1;
            var atomName1 = ap.atomname;
            var resName1 = ap.resname;
            var resSeq1 = ap.resno;
            var chainID1 = ap.chainname;
            ap.index = atomIndex2;
            var atomName2 = ap.atomname;
            var resName2 = ap.resname;
            var resSeq2 = ap.resno;
            var chainID2 = ap.chainname;

            var sym1 = "      ";
            var sym2 = "      ";
            var distance = Math.min (99.99, this.getSingleDistanceBetween2Residues (res1.seqIndex, res2.seqIndex, res1.chainIndex, res2.chainIndex));

            pdbLinks.push (sprintf (linkFormat, atomName1, resName1, chainID1, resSeq1, atomName2, resName2, chainID2, resSeq2, sym1, sym2, distance));
        }, this);

        return pdbLinks.join("\n");
    },


    getPDBConectString: function (links) {  // Conect is spelt right
        var pdbConects = [];
        var atomPairs = this.getAtomPairsFromLinkList (links);
        var conectFormat = 'CONECT%5d%5d                                                                ';
        atomPairs.sort (function (a, b) { return a[0] - b[0]; });   // order by ascending first atompair index

        atomPairs.forEach (function (atomPair) {
            pdbConects.push (sprintf (conectFormat, atomPair[0], atomPair[1]));
        }, this);

        return pdbConects.join("\n");
    },


    getSelectionFromResidueList: function(resnoList, options) { // set allAtoms to true to not restrict selection to alpha carbon atoms
        // options are
        // allAtoms:true to not add on the AND .CA qualifier
        // chainsOnly:true when the resnoList only has chainIndices defined and no res
        options = options || {};
        var sele;

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

            var cp = this.get("structureComp").structure.getChainProxy();

            // new way (faster ngl interpretation for big selections!)
            var modelTree = d3.map();
            var tmp = resnoList.map(function(r) {
                cp.index = r.chainIndex;

                // Make a hierarchy of models --> chains --> residues to build a string from later
                var modelBranch = modelTree.get(cp.modelIndex);
                if (!modelBranch) {
                    var a = new d3.map();
                    modelTree.set(cp.modelIndex, a);
                    modelBranch = a;
                }

                var chainBranch = modelBranch.get(cp.chainname);
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
            var modParts = modelTree.entries().map(function(modelEntry) {
                var modelBranch = modelEntry.value;
                var perChainResidues = modelBranch.entries().map(function(chainEntry) {
                    var chainBranch = chainEntry.value;
                    // selection syntax picks up ":123" as residue 123 in chain "empty name", but ": AND 123" doesn't work.
                    // Similarly ":/0 " works but "/0 AND :" doesn't.
                    // Shouldn't have many pdbs with empty chain names though.
                    if (typeof chainEntry.key != "undefined") {

                        let key = chainEntry.key;
                        if (key === "") {
                            // key = "''";
                            alert("ERROR: blank chain ID in PDB - crosslinks in wrong place on structure");
                        }
                        var vals = chainBranch.values();
                        if (options.chainsOnly) {
                            return ":" + key;
                        } else if (vals.length === 1) {
                            return "( " + vals[0] + ":" + key + " )"; // if single val, chain:resno is quicker
                        } else {
                            vals = CLMSUI.modelUtils.joinConsecutiveNumbersIntoRanges(vals);
                            return "( :" + key + " AND (" + vals.join(" OR ") + ") )";
                        }
                    } else {
                        if (options.chainsOnly) {
                            return ":/" + modelEntry.key;
                        }
                        var emptyChainNameRes = chainBranch.values().map(function(resVal) {
                            return resVal + ":";
                        });
                        return "( " + emptyChainNameRes.join(" OR ") + " )";
                    }
                }, this);
                return "( /" + modelEntry.key + " AND (" + perChainResidues.join(" OR ") + ") )";
            }, this);

            sele = "(" + modParts.join(" OR ") + " )" + (options.allAtoms || options.chainsOnly ? "" : " AND .CA");
            // if (NGL.Debug) {
                console.log("SELE", sele);
            // }
        }

        return sele;
    },


    getAtomIndexFromResidueObj: function (resObj) {
        var resno = resObj.resno;
        return resno !== undefined ? this.getAtomIndex (resObj.seqIndex, resObj.chainIndex) : undefined;
    },

    makeFirstAtomPerChainSelectionString: function(chainIndexSet) {
        var comp = this.get("structureComp").structure;
        var sels = [];
        comp.eachChain(function(cp) {
            // if chain longer than 10 resiudes and (no chainindexset present or chain index is in chainindexset)
            if (CLMSUI.NGLUtils.isViableChain(cp) && (!chainIndexSet || chainIndexSet.has(cp.index))) {
                sels.push(cp.atomOffset);
            }
        });
        return "@" + sels.join(",");
    },

    // Get a NGL selection for chains listing only the chainIndices passed in as a property of chainItems
    makeChainSelectionString: function(chainItems) {
        var selectionString = "all";
        var showAll = chainItems.showAll || false;
        var chainIndices = chainItems.chainIndices || [];

        if (!showAll) {
            var chainList = chainIndices.map(function(chainIndex) {
                return {
                    chainIndex: chainIndex
                };
            });
            selectionString = this.getSelectionFromResidueList(chainList, {
                chainsOnly: true
            });
        }

        //CLMSUI.utils.xilog ("CHAIN SELE", selectionString);
        return selectionString;
    },

    // Return chain indices covered by currently visible proteins
    getShowableChains: function(showAll) {
        var protMap = CLMS.arrayFromMapValues(this.getCompositeModel().get("clmsModel").get("participants"));
        var prots = Array.from(protMap).filter(function(prot) {
            return !prot.hidden;
        }).map(function(prot) {
            return prot.id;
        });

        var chainIndices;
        if (protMap.length !== prots.length && !showAll) {
            chainIndices = prots.map(function(prot) {
                var protChains = this.get("chainMap")[prot] || [];
                return _.pluck(protChains, "index");
            }, this);
        } else {
            chainIndices = d3.values(this.get("chainMap")).map(function(chainValue) {
                return _.pluck(chainValue, "index");
            });
        }
        chainIndices = d3.merge(chainIndices);
        CLMSUI.utils.xilog("SHOW CHAINS", chainIndices);
        return {
            showAll: showAll,
            chainIndices: chainIndices
        };
    },

    getAllResidueCoordsForChain: function (chainIndex) {
        var structure = this.get("structureComp").structure;
        var atomProxy = structure.getAtomProxy();
        var nglAtomIndices = this.get("chainCAtomIndices")[chainIndex] || [];
        var atomCoords = nglAtomIndices.map (function (atomIndex) {
            atomProxy.index = atomIndex;
            var coords = this.getAtomCoordinates (atomProxy);
            return coords;
        }, this);
        return atomCoords;
    },
});

/**
 * @fileoverview Main application model that coordinates filtering, selection, and data management.
 * CompositeModel integrates the core CLMS data model with filtering, UI state, and view coordination.
 * Handles crosslink filtering (including FDR), protein selection/hiding, grouping, distance calculations,
 * and synchronization of selection state across matches and crosslinks.
 */

import * as _ from "underscore";

import Backbone from "backbone";

import {fdr, clearFdr} from "../filter/fdr";
import {jqdialogs} from "../dialogs";
import {makeURLQueryPairs, mergeContiguousFeatures} from "../modelUtils";
import d3 from "d3";
import {xilog} from "../utils";
import {ManualColourModel} from "./color/protein-color-model";
import {getCrosslinkableResiduesAsFeatures, getDigestibleResiduesAsFeatures} from "./get-as-features";

/**
 * Main application model coordinating CLMS data, filtering, and UI state.
 * Acts as the central hub connecting clmsModel (core data), filterModel (filtering logic),
 * and various views. Manages selection/highlights, protein grouping, distance calculations,
 * and crosslink filtering with FDR support.
 * @class
 * @extends Backbone.Model
 * @property {Array} highlights - Array of highlighted crosslinks
 * @property {Array} selection - Array of selected crosslinks
 * @property {d3.Map} match_highlights - Map of highlighted matches (fine-grained)
 * @property {d3.Map} match_selection - Map of selected matches (fine-grained)
 * @property {Array} selectedProteins - Currently selected protein interactors
 * @property {Array} highlightedProteins - Currently highlighted protein interactors
 * @property {Map} groups - Protein groups (group name => Set of protein IDs)
 * @property {number} TTCrossLinkCount - Count of target-target crosslinks (non-decoy, non-linear)
 * @property {Object} filteredXLinks - Categorized filtered crosslinks (all, targets, linears, decoys, etc.)
 */
export class CompositeModel extends Backbone.Model {
    /**
     * Creates a new CompositeModel instance.
     * @param {Object} attributes - Initial model attributes
     * @param {Object} options - Configuration options
     */
    constructor(attributes, options) {
        super(attributes, options);
    }

    /**
     * Initializes the composite model with default properties and event listeners.
     * Sets up selection/highlight arrays, UI state flags, protein groups, and listeners for
     * FDR mode changes and distance recalculation events.
     * @returns {void}
     */
    initialize() {
        this.set({
            highlights: [], // listen to these two for differences in highlighted selected links
            selection: [],
            //todo get rid d3 Map
            match_highlights: d3.map(), // listen to these two for differences in highlighted selects matches (more fine grained)
            match_selection: d3.map(), // listen to event selection/highlights+"MatchesLinksChanged" to run when both have been fully updated
            annotationTypes: null,
            selectedProteins: [],
            highlightedProteins: [],
            TTCrossLinkCount: 0,
            xinetShowLabels: true,
            xinetShowExpandedGroupLabels: true,
            xinetFixedSize: true,
            xinetCropLabels: true,
            xinetThickLinks: true,
            xinetPpiSteps: [2, 3],
            groups: new Map(),
        });

        // this.listenTo(this.get("clmsModel"), "change:matches", function () {
        //     this.calcAndStoreTTCrossLinkCount();
        // });

        // Clear fdr information from crosslinks when switching out of fdr mode
        this.listenTo(this.get("filterModel"), "change:fdrMode", function (filterModel) {
            if (!filterModel.get("fdrMode")) {
                // Need to clear all crosslinks as they all get valued
                clearFdr(this.getAllCrossLinks());
            }
        });


        this.listenTo(window.vent, "recalcLinkDistances", function () {
            if (this.get("clmsModel")) { //how does this work? may be mistake. // bar the alternative model from doing this because it has no crosslinks and will crash
                this.getCrossLinkDistances(this.getAllCrossLinks());
            }
        });

        this.calcAndStoreTTCrossLinkCount();
    }

    /**
     * Sets crosslink homomultimer states to true if any constituent matches are homomultimeric.
     * This enables calculation of worst-case distances (useful for setting distance ranges).
     * Another call to applyFilter() will reset states to normal values.
     * @returns {CompositeModel} This model instance for chaining
     */
    calcWorstCaseHomomultimerStates() {
        const crosslinksArr = this.getAllCrossLinks();
        crosslinksArr.forEach(function (clink) {
            clink.confirmedHomomultimer = false;
            if (clink.isSelfLink()) {
                clink.confirmedHomomultimer = _.any(clink.matches_pp, function (m) {
                    return m.match.confirmedHomomultimer;
                });
            }
        });
        return this;
    }

    /**
     * Calculates crosslink distances with worst-case homomultimer states.
     * Temporarily sets homomultimer states to worst-case, calculates distances, then restores original states.
     * Used to generate initial distance ranges that encompass all possible homomultimer configurations.
     * @param {Array} crosslinkArr - Array of crosslink objects
     * @returns {Array} Array of calculated distances
     */
    getHomomDistances(crosslinkArr) {
        // Store current homo states
        const oldHom = _.pluck(crosslinkArr, "confirmedHomomultimer");

        // Calculate
        this.calcWorstCaseHomomultimerStates();
        const dists = this.getCrossLinkDistances(crosslinkArr);  // regenerate distances for all crosslinks

        // Restore original homom states and distances
        crosslinkArr.forEach(function (clink, i) {
            clink.confirmedHomomultimer = oldHom[i];
        });
        this.getCrossLinkDistances(crosslinkArr);

        return dists;
    }

    /**
     * Applies all active filters to crosslinks and updates filtered results.
     * Main filtering pipeline that handles FDR-based and standard filtering, protein hiding,
     * unique residue pair constraints, and decoy categorization. Updates filteredXLinks cache
     * with categorized results (targets, linears, decoys) and triggers filtering events.
     * @returns {CompositeModel} This model instance for chaining
     */
    applyFilter() {
        const filterModel = this.get("filterModel");
        const clmsModel = this.get("clmsModel");
        const crosslinksArr = this.getAllCrossLinks();
        const searches = Array.from(clmsModel.getSearches().values());
        let result;

        if (filterModel) {
            filterModel.preprocessFilterInputValues(searches); // saves doing stuff later on for every match
        }
        // if its FDR based filtering,
        // set all matches fdrPass att to false, then calc
        if (filterModel && filterModel.get("fdrMode")) {
            const matches = clmsModel.getMatches();
            for (let match of matches) {
                match.fdrPass = false;
            }
            result = fdr(crosslinksArr, {
                filterModel: filterModel,
                CLMSModel: clmsModel,
                threshold: filterModel.get("fdrThreshold"),
                filterLinears: true,
            });

            filterModel.set({
                "interFdrCut": result[0].thresholdMet ? result[0].fdr : undefined, // undefined what threshold score should be if all links fail fdr
                "intraFdrCut": result[1].thresholdMet ? result[1].fdr : undefined
            }, {
                silent: true
            });
        }

        function filterCrossLink(crosslink) {
            crosslink.filteredMatches_pp = [];
            const isSelf = crosslink.isSelfLink();

            if (filterModel.get("fdrMode")) {
                // FDR mode
                crosslink.confirmedHomomultimer = false;

                let linkPass = false;
                const mms = crosslink.getMeta("linkScore");
                if (mms !== undefined) {
                    const cut = isSelf ? result[1].fdr : result[0].fdr;
                    linkPass = mms >= cut;
                }

                if (linkPass) {
                    const filteredMatches_pp = crosslink.matches_pp.filter(
                        function (value) {
                            return filterModel.subsetFilter(value.match);
                        }
                    );

                    crosslink.ambiguous = !filteredMatches_pp.some(function (matchAndPepPos) {
                        return matchAndPepPos.match.crosslinks.length === 1;
                    });
                    //~ var filteredMatches_pp = crosslink.filteredMatches_pp;
                    crosslink.filteredMatches_pp = [];
                    const filteredMatchCount = filteredMatches_pp.length;

                    for (let fm_pp = 0; fm_pp < filteredMatchCount; fm_pp++) {
                        //var fm_pp = filteredMatches_pp[fm_pp];
                        const fm = filteredMatches_pp[fm_pp];
                        const match = fm.match;
                        //set its fdr pass att to true even though it may not be in final results
                        match.fdrPass = true;
                        const pass = crosslink.fromProtein.manuallyHidden != true &&
                            (!crosslink.toProtein || crosslink.toProtein.manuallyHidden != true) &&
                            filterModel.navigationFilter(match) &&
                            filterModel.groupFilter(match);

                        if (pass) {
                            crosslink.filteredMatches_pp.push(fm);
                            // TODO: match reporting as homomultimer if ambiguous and one associated crosslink is homomultimeric
                            if (match.confirmedHomomultimer && isSelf) {
                                crosslink.confirmedHomomultimer = true;
                            }
                        }
                    }

                    if (!filterModel.distanceFilter(crosslink)) {
                        crosslink.filteredMatches_pp = [];
                    }
                }
                //~ else {
                //~ alert("i just failed fdr check");
                //~ }
            } else {
                //not FDR mode
                if (crosslink.fromProtein.manuallyHidden != true && (!crosslink.toProtein || crosslink.toProtein.manuallyHidden != true)) {
                    crosslink.ambiguous = true;
                    crosslink.confirmedHomomultimer = false;

                    //if (filterModel.distanceFilter (crosslink)) {
                    const matches_pp = crosslink.matches_pp;
                    const matchCount = matches_pp.length;
                    for (let m = 0; m < matchCount; m++) {
                        const matchAndPepPos = matches_pp[m];
                        const match = matchAndPepPos.match;
                        let pass = filterModel.subsetFilter(match) &&
                            filterModel.validationStatusFilter(match) &&
                            filterModel.scoreFilter(match) &&
                            filterModel.decoyFilter(match);

                        // Either 1.
                        // this beforehand means navigation filters do affect ambiguous state of crosslinks
                        // pass = pass && filterModel.navigationFilter(match);

                        if (pass && match.crosslinks.length === 1) {
                            crosslink.ambiguous = false;
                        }

                        // Or 2.
                        // this afterwards means navigation filters don't affect ambiguous state of crosslinks
                        pass = pass && filterModel.navigationFilter(match) && filterModel.groupFilter(match);

                        if (pass) {
                            crosslink.filteredMatches_pp.push(matchAndPepPos);
                            // TODO: match reporting as homomultimer if ambiguous and one associated crosslink is homomultimeric
                            if (match.confirmedHomomultimer && isSelf) {
                                crosslink.confirmedHomomultimer = true;
                            }
                        }
                    }
                    //}

                    if (!filterModel.distanceFilter(crosslink)) {
                        crosslink.filteredMatches_pp = [];
                    }
                }
            }
        }


        // const a = performance.now();

        const homomultiSwitchers = [];
        for (let crosslink of crosslinksArr){//var i = 0; i < clCount; ++i) {
            // var crosslink = crosslinksArr[i];
            const oldHM = crosslink.confirmedHomomultimer;
            if (filterModel) {
                filterCrossLink(crosslink);
            } else { // no filter model, let everything thru
                crosslink.filteredMatches_pp = crosslink.matches_pp;
            }

            // If homomultimer state changes, then sensible minimum distance will generally change
            if (oldHM !== crosslink.confirmedHomomultimer) {
                homomultiSwitchers.push(crosslink);
            }
        }
        this.getCrossLinkDistances(homomultiSwitchers);    // recalculate distances for crosslinks whose homomultimer status has changed

        // Filters after this point are those that depend on results of previous filtering

        // Remove crosslinks with matches in multiple groups if filterModel's multipleGroup setting set to false
        if (filterModel && !filterModel.get("multipleGroup")) {
            for (let crosslink of crosslinksArr) {
                if (!filterModel.groupFilter2(crosslink.filteredMatches_pp)) {
                    crosslink.filteredMatches_pp = [];
                }
            }
        }

        // var b = performance.now();
        // console.log("ser filtering time", (b - a), "ms");


        if (filterModel) {
            const uniqueResiduePairsPerPPI = filterModel.get("urpPpi");
            if (uniqueResiduePairsPerPPI > 1) {
                let value;
                const ppiMap = new Map();
                for (let crosslink of crosslinksArr) {
                    if (crosslink.filteredMatches_pp.length) {
                        let key;
                        if (crosslink.toProtein) {
                            key = crosslink.fromProtein.id + " - " + crosslink.toProtein.id;
                        } else {
                            key = crosslink.fromProtein.id + " - linear";
                        }
                        value = ppiMap.get(key);
                        if (typeof value == "undefined") {
                            value = 1;
                        } else {
                            value++;
                        }
                        ppiMap.set(key, value);
                    }
                }
                for (let crosslink of this.getAllCrossLinks()) {
                    let key;
                    if (crosslink.toProtein) {
                        key = crosslink.fromProtein.id + " - " + crosslink.toProtein.id;
                    } else {
                        key = crosslink.fromProtein.id + " - linear";
                    }
                    value = ppiMap.get(key);
                    if (value < uniqueResiduePairsPerPPI) {
                        crosslink.filteredMatches_pp = [];
                    }
                }
            }
        }

        this.filteredXLinks = {
            all: [], // all filtered crosslinks
            targets: [], // non-decoy non-linear links
            linears: [], // all linear links
            linearTargets: [], // non-decoy linear links
            decoysTD: [], // links with a decoy protein at one end (will include any decoy linears)
            decoysDD: [], // links with decoy proteins at both ends
        };

        // all = targets + linearTargets + decoysTD + decoysDD
        // count of decoy linears = linears - linearTargets

        for (let crosslink of crosslinksArr) {
            if (crosslink.filteredMatches_pp.length) {
                this.filteredXLinks.all.push(crosslink);
                const linear = crosslink.isLinearLink();
                if (linear) {
                    this.filteredXLinks.linears.push(crosslink);
                }
                if (!crosslink.isDecoyLink()) {
                    // is it a linear or normal target, stick it in the right sub-cache
                    this.filteredXLinks[linear ? "linearTargets" : "targets"].push(crosslink);
                } else {
                    // is it a TD or DD decoy, stick it in the right sub-cache
                    const decoyLinkCache = crosslink.fromProtein.is_decoy && !linear && crosslink.toProtein.is_decoy ? "decoysDD" : "decoysTD";
                    this.filteredXLinks[decoyLinkCache].push(crosslink);
                }
            }
        }
        //console.log ("xlinks", this.filteredXLinks);

        let visibleProteinCount = 0;
        //hiding linkless participants
        for (let participant of clmsModel.getProteinsIterator()) {
            participant.hidden = true;
            for (let pCrossLink of participant.crosslinks) {
                if (pCrossLink.filteredMatches_pp.length &&
                    !pCrossLink.isDecoyLink() &&
                    !pCrossLink.isLinearLink()) {
                    participant.hidden = false;
                    visibleProteinCount++;
                    break;
                }
            }
        }

        const ppiSet = new Set();
        let heteromericLinks = 0, selfLinks = 0;//, homomultimericLinks = 0, ambiguous = 0;
        for (let crosslink of this.getFilteredCrossLinks()){ // will return non-decoy non-linear links
            if (crosslink.isSelfLink()){
                selfLinks++;
            } else {
                heteromericLinks++;
                ppiSet.add(crosslink.fromProtein.id + "-" + crosslink.toProtein.id);
            }
        }

        this.set("proteinCount", visibleProteinCount);
        this.set("ppiCount", ppiSet.size);
        this.set("hetLinkCount", heteromericLinks);
        this.set("selfLinkCount", selfLinks);

        this.trigger("hiddenChanged");
        this.trigger("filteringDone");

        return this;
    }

    /**
     * Retrieves filtered crosslinks of a specific type.
     * @param {string} [type="targets"] - Type of crosslinks to retrieve: "all", "targets" (default),
     *   "linears", "linearTargets", "decoysTD", or "decoysDD"
     * @returns {Array} Array of filtered crosslinks of the specified type
     */
    getFilteredCrossLinks(type) { // if type of crosslinks not declared, make it 'targets' by default
        return this.filteredXLinks[type || "targets"];
    }

    /**
     * Retrieves all crosslinks from the CLMS model.
     * @returns {Array} Array of all crosslink objects
     */
    getAllCrossLinks() {
        return Array.from(this.get("clmsModel").getCrosslinks().values());
    }

    /**
     * Retrieves all target-target (non-decoy, non-linear, non-monolink) crosslinks.
     * @returns {Array|null} Array of TT crosslinks, or null if no CLMS model is available
     */
    getAllTTCrossLinks() {
        const clmsModel = this.get("clmsModel");
        if (clmsModel) {
            const ttCrossLinks = this.getAllCrossLinks().filter(function (link) {
                return !link.isDecoyLink() && !link.isLinearLink() && !link.isMonoLink();
            });
            return ttCrossLinks;
        }
        return null;
    }

    /**
     * Calculates and stores the count of target-target crosslinks.
     * Updates the TTCrossLinkCount model property with the count.
     * @returns {void}
     */
    calcAndStoreTTCrossLinkCount() {
        const ttCrossLinks = this.getAllTTCrossLinks();
        if (ttCrossLinks !== null) {
            this.set("TTCrossLinkCount", ttCrossLinks.length);
        }
    }

    /**
     * Retrieves the map of marked (selected/highlighted) matches.
     * @param {string} modelProperty - Property name ("selection" or "highlights")
     * @returns {d3.Map} Map of marked matches
     */
    getMarkedMatches(modelProperty) {
        return this.get("match_" + modelProperty);
    }

    /**
     * Retrieves the array of marked (selected/highlighted) crosslinks.
     * @param {string} modelProperty - Property name ("selection" or "highlights")
     * @returns {Array} Array of marked crosslinks
     */
    getMarkedCrossLinks(modelProperty) {
        return this.get(modelProperty);
    }

    /**
     * Sets marked matches and propagates changes to associated crosslinks.
     * Handles toggling for selection, deduplication, and bidirectional sync with crosslinks.
     * @param {string} modelProperty - Property name ("selection" or "highlights")
     * @param {Array} matches - Array of match objects to mark
     * @param {boolean} andAlternatives - Whether to include alternative/ambiguous matches
     * @param {boolean} add - Whether to add to existing marks (true) or replace (false)
     * @param {boolean} dontForward - If true, don't propagate changes to crosslinks
     * @returns {void}
     */
    setMarkedMatches(modelProperty, matches, andAlternatives, add, dontForward) {
        if (matches) { // if undefined nothing happens, to clear selection pass an empty array - []
            const type = "match_" + modelProperty;
            const map = add ? d3.map(this.get(type).values(), function (d) {
                return d.id;
            }) : d3.map();
            //console.log ("MAP", map.values());
            const potentialToggle = (modelProperty === "selection");
            matches.forEach(function (match) {
                if (match.match) match = match.match;
                const id = match.id;
                // can't delete individual matches as existing/new matches are mixed in already
                // add new matches. If adding to pre-selected matches, toggle new matches depending on whether the match is already selected or not

                if (potentialToggle && add && map.has(id)) {
                    map.remove(id);
                } else {
                    map.set(id, match);
                }
            });
            this.set(type, map);

            if (!dontForward) {
                // calculate crosslinks from selected matches
                const clinkMap = d3.map();
                const dedupedMatches = map.values();
                dedupedMatches.forEach(function (match) {
                    const clinks = match.crosslinks;
                    for (let c = 0; c < clinks.length; c++) {
                        const clink = clinks[c];
                        clinkMap.set(clink.id, clink);
                    }
                });
                const crosslinks = clinkMap.values();

                const matchesChanged = this.changedAttributes();
                // add = false on this call, 'cos crosslinks from existing marked matches will already be picked up in this routine if add is true
                this.setMarkedCrossLinks(modelProperty, crosslinks, andAlternatives, false, true);
                this.triggerFinalMatchLinksChange(modelProperty, matchesChanged);
            }
        }
    }

    /**
     * Sets marked crosslinks and propagates changes to associated matches.
     * Handles toggling for selection, deduplication, alternative/ambiguous link inclusion,
     * and bidirectional sync with matches. modelProperty can be "highlights" or "selection".
     * @param {string} modelProperty - Property name ("selection" or "highlights")
     * @param {Array} crosslinks - Array of crosslink objects to mark
     * @param {boolean} andAlternatives - Whether to include alternative/ambiguous crosslinks
     * @param {boolean} add - Whether to add to existing marks (true) or replace (false)
     * @param {boolean} dontForward - If true, don't propagate changes to matches
     * @returns {void}
     */
    setMarkedCrossLinks(modelProperty, crosslinks, andAlternatives, add, dontForward) {
        if (crosslinks) { // if undefined nothing happens, to clear selection pass an empty array - []
            const removedLinks = d3.map();
            const newlyAddedLinks = d3.map();

            // If adding to existing crosslinks, make crosslinkMap from the existing crosslinks and add or remove the new array of crosslinks from it.
            // Otherwise just make crosslinkMap from the new array of crosslinks
            const crosslinkMap = d3.map(add ? this.get(modelProperty) : crosslinks, function (d) {
                return d.id;
            });
            if (add) {
                const potentialToggle = (modelProperty === "selection");

                // add new cross-links. If adding to pre-selected cross-links, toggle new cross-links depending on whether the cross-link is already selected or not
                crosslinks.forEach(function (xlink) {
                    const id = xlink.id;
                    if (potentialToggle && crosslinkMap.has(id)) {
                        crosslinkMap.remove(id);
                        removedLinks.set(id, xlink);
                    } else {
                        crosslinkMap.set(id, xlink);
                        newlyAddedLinks.set(id, xlink);
                    }
                });
                crosslinks = crosslinkMap.values();
            }

            if (andAlternatives) {
                crosslinks.forEach(function (crosslink) {
                    if (crosslink.ambiguous) {
                        //this.recurseAmbiguity (crosslink, crosslinkMap);
                        const filteredMatchesAndPeptidePositions = crosslink.filteredMatches_pp;
                        const fm_ppCount = filteredMatchesAndPeptidePositions.length;
                        for (let fm_pp = 0; fm_pp < fm_ppCount; fm_pp++) {
                            const crosslinks = filteredMatchesAndPeptidePositions[fm_pp].match.crosslinks;
                            const clCount = crosslinks.length;

                            for (let cl = 0; cl < clCount; cl++) {
                                const mCrossLink = crosslinks[cl];
                                crosslinkMap.set(mCrossLink.id, mCrossLink);
                            }
                        }
                    }
                }, this);
            }

            // is d3 map, so .values always works, don't need to worry about whether ie11 supports Array.from (in fact ie11 gets keys/values wrong way round if we call CLMS.array...)
            const dedupedCrossLinks = crosslinkMap.values(); // CLMS.arrayFromMapValues(crosslinkMap);
            this.set(modelProperty, dedupedCrossLinks);

            if (!dontForward) {
                // calculate matches from existing and newly selected crosslinks
                const existingMatches = add ? this.get("match_" + modelProperty).values() : [];
                const newMatchesFromTheseLinks = add ? newlyAddedLinks.values() : dedupedCrossLinks;
                const newMatchArray = newMatchesFromTheseLinks.map(function (clink) {
                    return _.pluck(clink.filteredMatches_pp, "match");
                });
                newMatchArray.push(existingMatches);
                let allMatches = d3.merge(newMatchArray);

                if (add) {
                    const removedMatches = d3.merge(removedLinks.values().map(function (clink) {
                        return _.pluck(clink.filteredMatches_pp, "match");
                    }));
                    allMatches = _.difference(allMatches, removedMatches);
                }

                //console.log ("matches", allMatches);
                const linksChanged = this.changedAttributes(); // did setting links property prompt changes in backbone?
                this.setMarkedMatches(modelProperty, allMatches, andAlternatives, false, true);
                this.triggerFinalMatchLinksChange(modelProperty, linksChanged);
            }
        }
    }

    /**
     * Triggers final event after both matches and crosslinks have been updated.
     * Views waiting for synchronized updates to both matches and crosslinks can listen to this event.
     * @param {string} modelProperty - Property name ("selection" or "highlights")
     * @param {Object|false} penultimateSetOfChanges - Changed attributes from previous set operation
     * @returns {void}
     */
    triggerFinalMatchLinksChange(modelProperty, penultimateSetOfChanges) {
        // if either of the last two backbone set operations did cause a change then trigger an event
        // so views waiting for both links and matches to finish updating can act
        const lastSetOfChanges = this.changedAttributes();
        if (penultimateSetOfChanges || lastSetOfChanges) {
            this.trigger(modelProperty + "MatchesLinksChanged", this);
        }
    }

    /**
     * Sets highlighted proteins, optionally adding to existing highlights.
     * Removes duplicates before setting.
     * @param {Array} pArr - Array of protein interactor objects to highlight
     * @param {boolean} add - If true, add to existing highlights; if false, replace
     * @returns {void}
     */
    setHighlightedProteins(pArr, add) {
        let toHighlight = add ? pArr.concat(this.get("highlightedProteins")) : pArr;
        toHighlight = d3.map(toHighlight, function (d) {
            return d.id;
        }).values(); // remove any duplicates and returns a new array, so setting fires a change
        this.set("highlightedProteins", toHighlight);
    }

    /**
     * Sets selected proteins, optionally toggling with existing selection.
     * Removes duplicates before setting. For toggle mode (add=true), proteins already selected are removed.
     * @param {Array} pArr - Array of protein interactor objects to select
     * @param {boolean} add - If true, toggle proteins in selection; if false, replace
     * @returns {void}
     */
    setSelectedProteins(pArr, add) {
        let toSelect;
        if (!add){
            toSelect = [...new Set(pArr)];
        } else{
            const alreadySelected = this.get("selectedProteins");
            toSelect = [];
            for (let a = 0; a < alreadySelected.length; a++){
                if (pArr.indexOf(alreadySelected[a]) == -1) {
                    toSelect.push(alreadySelected[a]);
                }
            }
            for (let p = 0; p < pArr.length; p++) {
                const protein = pArr[p];
                if (alreadySelected.indexOf(protein) == -1) {
                    toSelect.push(protein);
                }
            }
        }
        this.set("selectedProteins", toSelect); //the array.slice() clones the array so this triggers a change
    }

    /**
     * Hides currently selected proteins and clears the selection.
     * Triggers filter model change to reapply filtering.
     * @returns {void}
     */
    hideSelectedProteins() {
        const selectedArr = this.get("selectedProteins");
        const selectedCount = selectedArr.length;
        for (let s = 0; s < selectedCount; s++) {
            const participant = selectedArr[s];
            participant.manuallyHidden = true;
        }
        this.setSelectedProteins([]);
        this.get("filterModel").trigger("change", this.get("filterModel"));

    }

    /**
     * Hides all proteins except currently selected ones.
     * Triggers filter model change to reapply filtering.
     * @returns {void}
     */
    hideUnselectedProteins() {
        const selected = this.get("selectedProteins");
        for (let participant of this.get("clmsModel").getProteinsIterator()) {
            if (selected.indexOf(participant) == -1) {
                participant.manuallyHidden = true;
            }
        }
        this.get("filterModel").trigger("change", this.get("filterModel"));
    }

    /**
     * Shows all manually hidden proteins.
     * Triggers filter model change to reapply filtering.
     * @returns {void}
     */
    showHiddenProteins() {
        for (let participant of this.get("clmsModel").getProteinsIterator()) {
            participant.manuallyHidden = false;
        }
        this.get("filterModel").trigger("change");
    }

    /**
     * Expands selection to include all proteins connected to currently selected proteins.
     * Follows crosslinks from selected proteins and adds their interaction partners (non-decoy only).
     * @returns {void}
     */
    stepOutSelectedProteins() {
        const selectedArr = this.get("selectedProteins");
        const selectedCount = selectedArr.length;
        const toSelect = new Set();
        for (let s = 0; s < selectedCount; s++) {
            const participant = selectedArr[s];
            const crosslinks = participant.crosslinks;
            const clCount = crosslinks.length;
            for (let cl = 0; cl < clCount; cl++) {
                const crosslink = crosslinks[cl];
                const fromProtein = crosslink.fromProtein;
                if (fromProtein.is_decoy != true) {
                    fromProtein.manuallyHidden = false;
                    toSelect.add(fromProtein);
                }
                if (crosslink.toProtein && crosslink.toProtein.is_decoy != true) {
                    const toProtein = crosslink.toProtein;
                    toProtein.manuallyHidden = false;
                    toSelect.add(toProtein);
                }
            }
        }

        this.get("filterModel").trigger("change");
        this.setSelectedProteins(Array.from(toSelect));

    }

    /**
     * Filters protein selection based on text input from #proteinSelectionFilter element.
     * Searches protein names and descriptions (case-insensitive) for matches.
     * @returns {void}
     */
    proteinSelectionTextFilter() {
        const filterText = d3.select("#proteinSelectionFilter").property("value").trim().toLowerCase();
        const participantsArr = Array.from(this.get("clmsModel").getProteinsIterator());

        const toSelect = participantsArr.filter(function (p) {
            if (p.description) {
                return (p.name.toLowerCase().indexOf(filterText) != -1 || p.description.toLowerCase().indexOf(filterText) != -1);
            }
            return p.name.toLowerCase().indexOf(filterText) != -1;
        });
        this.setSelectedProteins(toSelect);
    }

    /**
     * Opens color picker dialog for choosing a protein interactor color.
     * Updates dialog UI with interactor ID and displays modal.
     * @param {string} interactorId - Protein interactor ID to color
     * @returns {void}
     */
    chooseInteractorColor(interactorId) {
        const dialog = document.getElementById("colorDialog"); //todo : make spelling of colour consistent
        dialog.interactorId = interactorId;
        const chooseColorLabel = document.getElementById("chooseColorLabel");
        chooseColorLabel.innerHTML = "Select Colour for " + interactorId;
        dialog.showModal();
        const cancelChooseColorButton = document.getElementById("colorCancel");
        cancelChooseColorButton.focus();
    }

    /**
     * Sets a custom color for a specific protein interactor.
     * Switches to manual protein color model if not already active.
     * @param {string} interactorId - Protein interactor ID to color
     * @param {string} color - Color value (hex, rgb, or named color)
     * @returns {void}
     */
    setInteractorColor(interactorId, color) {
        const proteinColourModel = window.compositeModelInst.get("proteinColourAssignment");
        if (!(proteinColourModel instanceof ManualColourModel)) {
            this.set("proteinColourAssignment", window.linkColor.manualProteinColoursBB);
        }
        window.linkColor.manualProteinColoursBB.setInteractorColour(interactorId, color);
        this.trigger("currentProteinColourModelChanged", window.linkColor.manualProteinColoursBB);
    }

    /**
     * Creates a new protein group from currently selected proteins.
     * Triggered by Enter key press. Alerts if group name already exists.
     * @param {Object} d3target - D3 selection of target element
     * @param {Object} evt - jQuery event object
     * @returns {void}
     */
    groupSelectedProteins(d3target, evt) {
        const self = this;
        evt = evt.originalEvent;
        if (evt.key == "Enter") {
            const groups = self.get("groups");
            const groupName = d3.select("#groupSelected").property("value").trim();
            if (groupName) {
                if (groups.has(groupName)) {
                    alert("Cannot group - duplicate group name");
                } else {
                    const participantIds = new Set();
                    for (let p of self.get("selectedProteins")) {
                        participantIds.add(p.id);
                    }
                    groups.set(groupName, participantIds);
                    self.trigger("change:groups");
                    d3.select("#groupSelected").property("value", "");
                }
            }
        }
    }

    /**
     * Removes a protein from a specified group. Deletes group if it becomes empty.
     * @param {string} groupName - Name of the group
     * @param {string} participantId - Protein participant ID to remove
     * @returns {void}
     */
    removeProteinFromGroup (groupName, participantId) { // todo: sort out inconsistent use of "participant"/"protein"/"interactor", its an historical artefact
        const groups = this.get("groups");
        const group = groups.get(groupName);
        group.delete(participantId);
        if (group.size === 0) {
            groups.delete(groupName);
        }
        this.trigger("change:groups");
    }

    /**
     * Adds a protein to a specified group.
     * @param {string} groupName - Name of the group
     * @param {string} participantId - Protein participant ID to add
     * @returns {void}
     */
    addProteinToGroup (groupName, participantId) {
        const groups = this.get("groups");
        const group = groups.get(groupName);
        group.add(participantId);
        this.trigger("change:groups");
    }

    /**
     * Clears all protein groups after user confirmation.
     * Shows confirmation dialog before clearing.
     * @returns {void}
     */
    clearGroups() {
        const self = this;
        jqdialogs.areYouSureDialog("ClearGroupsDialog", "Clear all groups?", "Clear Groups", "Yes", "No", function () {
            self.set("groups", new Map());
            self.trigger("change:groups");
        });
    }

    /**
     * Automatically creates protein groups based on GO term annotations.
     * Groups proteins by GO terms that are descendants of "protein complex" (GO0032991).
     * Clears existing groups after user confirmation.
     * @returns {void}
     */
    autoGroup() {
        const self = this;
        jqdialogs.areYouSureDialog("ClearGroupsDialog", "Auto group always clears existing groups - proceed?", "Clear Groups", "Yes", "No", function () {
            const groupMap = new Map();
            const go = self.get("go");
            for (let goTerm of go.values()) {
                if (!goTerm.subclasses && !goTerm.parts) {
                    const interactors = goTerm.getInteractors();
                    if (interactors && interactors.size > 1) {
                        // console.log("*"+ goTerm.name);
                        if (goTerm.isDescendantOf("GO0032991")) {
                            console.log(">" + goTerm.name);

                            const participantIds = new Set();
                            for (let p of interactors) {
                                participantIds.add(p.id);
                            }
                            groupMap.set(goTerm.name, participantIds);

                        } else {
                            // console.log("!" + goTerm.name);
                        }

                    }
                }
            }

            self.set("groups", groupMap);
            self.trigger("change:groups");
        });
    }

    /**
     * Automatically creates protein groups based on cellular compartment GO annotations.
     * Groups proteins by specified compartment GO terms (currently configured for nucleus GO0005634).
     * Contains commented-out code for other compartments (mitochondria, ER, cytosol, etc.).
     * @returns {void}
     */
    autoGroupCompartments() {
        // const self = this;
        // jqdialogs.areYouSureDialog("ClearGroupsDialog", "Auto group always clears existing groups - proceed?", "Clear Groups", "Yes", "No", function () {
        //     const groupMap = new Map();
        const go = this.get("go");
        //     for (let goTerm of go.values()) {
        //         if (!goTerm.subclasses && !goTerm.parts) {
        //             const interactors = goTerm.getInteractors();
        //             if (interactors && interactors.size > 1) {
        //                 // console.log("*"+ goTerm.name);
        //                 if (goTerm.isDescendantOf("GO0032991")) {
        //                     console.log(">" + goTerm.name);
        //
        //                     const participantIds = new Set();
        //                     for (let p of interactors) {
        //                         participantIds.add(p.id);
        //                     }
        //                     groupMap.set(goTerm.name, participantIds);
        //
        //                 } else {
        //                     // console.log("!" + goTerm.name);
        //                 }
        //
        //             }
        //         }
        //     }
        //
        //     self.set("groups", groupMap);
        //     self.trigger("change:groups");


        // plasma membrane 0005886 n
        // peroxysomes 0005777
        // lysomes 0005764
        // golgi 0005794 y
        // cytosol 5829
        // cytoskeleton 5856
        // er 0005783 ?
        // mitochondria 0005739
        // nucleus 0005634
        const groupMap = this.get("groups");
        const termOfInterest = ["0005634"];//, "0005886", "0005783", "0005737", "0005634", "0005829", "0005739", "0005634"];
        for (let term of termOfInterest) {
            const goTerm = this.get("go").get("GO"+term);
            const interactors = goTerm.getInteractors();
            if (interactors && interactors.size > 1) {
                console.log("Compartment>" + goTerm.name);
                const participantIds = new Set();
                // for (let p of interactors) {
                //     participantIds.add(p.id);
                // }
                groupMap.set(goTerm.name, participantIds);
            }
        }

        const proteins = this.get("clmsModel").getProteinsIterator();
        for (let protein of proteins) {

            if (protein.uniprot) {
                // var peri = false;
                // var intr = false;
                for (let goId of protein.uniprot.go) {
                    const goTerm = go.get(goId);
                    if (goTerm) {
                        for (let term of termOfInterest) {
                            const termOfInterest = this.get("go").get("GO"+term);
                            if (goTerm.isDescendantOf(termOfInterest.id)) {
                                // console.log(">" + goTerm.name);
                                groupMap.get(termOfInterest.name).add(protein.id);
                            }
                        }
                    // if (goTerm.isDescendantOf("GO0071944") == true) {
                    //     peri = true;
                    // }
                    // if (goTerm.isDescendantOf("GO0005622") == true) {
                    //     intr = true;
                    // }
                    }
                }

                //GO0071944
                //GO0005622
                // if (peri == true && intr == true) {
                //     both.add(protein.id);
                // } else if (peri == true) {
                //     periphery.add(protein.id);
                // } else if (intr == true) {
                //     intracellular.add(protein.id);
                // } else {
                //     uncharacterised.add(protein.id);
                // }
            }

        }
        this.set("groups", groupMap);
        this.trigger("change:groups");
    }

    /**
     * Triggers group collapse in visualization views.
     * @returns {void}
     */
    collapseGroups() {
        window.vent.trigger("collapseGroups", true);
    }

    /**
     * Triggers group expansion in visualization views.
     * @returns {void}
     */
    expandGroups() {
        window.vent.trigger("expandGroups", true);
    }

    /**
     * Calculates the minimum distance for a single crosslink from 3D structural data.
     * Things that can cause a crosslink's minimum distance to change:
     * 1. New PDB file loaded, 2. Change in alignment, 3. Change in PDB assembly,
     * 4. Change in interModelDistances allowed flag, 5. Change in link's homomultimer status.
     * @param {Object} xlink - Crosslink object
     * @param {Object} distancesObj - Distances object for calculating 3D distances
     * @param {Object} protAlignCollection - Protein alignment collection
     * @param {Object} [options] - Calculation options (average, allowInterModel, calcDecoyProteinDistances)
     * @returns {number|Object|undefined} Calculated distance or distance object with metadata
     */
    getSingleCrosslinkDistance(xlink, distancesObj, protAlignCollection, options) {
        if (xlink.toProtein) {
            // distancesObj and alignCollection can be supplied to function or, if not present, taken from model
            distancesObj = distancesObj || this.get("distancesObj");
            protAlignCollection = protAlignCollection || this.get("alignColl");
            options = options || {
                average: false
            };
            options.allowInterModelDistances = options.allowInterModel || (this.get("stageModel") ? this.get("stageModel").get("allowInterModelDistances") : false);
            if (options.calcDecoyProteinDistances) {
                options.realFromPid = xlink.fromProtein.is_decoy ? xlink.fromProtein.targetProteinID : undefined;
                options.realToPid = xlink.toProtein.is_decoy ? xlink.toProtein.targetProteinID : undefined;
            }

            const distance = distancesObj ? distancesObj.getXLinkDistance(xlink, protAlignCollection, options) : undefined;
            xlink.setMeta("distance", distance ? distance.distance || distance : distance);

            return distance;
        }
    }

    /**
     * Calculates distances for multiple crosslinks from 3D structural data.
     * By default filters out undefined distances; set includeUndefineds option to preserve indexing.
     * @param {Array} crosslinks - Array of crosslink objects
     * @param {Object} [options] - Calculation options (includeUndefineds, average, allowInterModel, returnChainInfo)
     * @returns {Array} Array of distances (or distance objects if returnChainInfo is true)
     */
    getCrossLinkDistances(crosslinks, options) {
        options = options || {};
        const includeUndefineds = options.includeUndefineds || false;

        const distModel = this.get("distancesObj");
        const protAlignCollection = this.get("alignColl");
        let distArr = crosslinks.map(function (cl) {
            const dist = this.getSingleCrosslinkDistance(cl, distModel, protAlignCollection, options);
            return options.returnChainInfo || dist == undefined ? dist : +dist; // + is to stop it being a string
        }, this);
        if (!includeUndefineds) {
            distArr = distArr.filter(function (d) {
                return d != undefined;
            });
        }
        //console.log ("distArr", distArr);

        return distArr;
    }

    /**
     * Retrieves all features for a protein participant.
     * Merges UniProt features, alignment features, and user annotations.
     * @param {Object} participant - Protein participant object
     * @returns {Array} Array of feature objects
     */
    getParticipantFeatures(participant) {
        const alignColl = this.get("alignColl");
        const featuresArray = [
            participant.uniprot ? participant.uniprot.features : [],
            alignColl.getAlignmentsAsFeatures(participant.id),
            participant.userAnnotations || [],
        ];
        return d3.merge(featuresArray.filter(function (arr) {
            return arr !== undefined;
        }));
    }

    /**
     * Retrieves features for a protein participant filtered by active annotation types.
     * Only returns features whose type matches currently shown annotation types.
     * Optionally includes dynamically generated features (Digestible, Crosslinkable-1, Crosslinkable-2).
     * @param {Object} participant - Protein participant object
     * @returns {Array} Array of filtered feature objects
     */
    getFilteredFeatures(participant) {

        let features = this.getParticipantFeatures(participant);

        const annots = this.get("annotationTypes").where({
            shown: true
        });
        const featureFilterSet = d3.set(annots.map(function (annot) {
            return annot.get("type");
        }));
        // 'cos some features report as upper case
        featureFilterSet.values().forEach(function (value) {
            featureFilterSet.add(value.toUpperCase());
        });

        const clmsModel = this.get("clmsModel");
        if (featureFilterSet.has("Digestible")) {
            const digestFeatures = getDigestibleResiduesAsFeatures(clmsModel, participant);
            const mergedFeatures = mergeContiguousFeatures(digestFeatures);
            features = d3.merge([mergedFeatures, features]);
        }

        if (featureFilterSet.has("Crosslinkable-1")) {
            const crosslinkableFeatures = getCrosslinkableResiduesAsFeatures(clmsModel, participant, 1);
            const mergedFeatures = mergeContiguousFeatures(crosslinkableFeatures);
            features = d3.merge([mergedFeatures, features]);
        }

        if (featureFilterSet.has("Crosslinkable-2")) {
            const crosslinkableFeatures = getCrosslinkableResiduesAsFeatures(clmsModel, participant, 2);
            const mergedFeatures = mergeContiguousFeatures(crosslinkableFeatures);
            features = d3.merge([mergedFeatures, features]);
        }

        xilog("annots", annots, "f", features);
        return features ? features.filter(function (f) {
            return featureFilterSet.has(f.type);
        }, this) : [];
    }

    /**
     * Calculates the value range (extent) for a crosslink attribute across all crosslinks.
     * Uses the attribute metadata's unfilteredLinkFunc to extract values from each link.
     * @param {Object} attrMetaData - Attribute metadata object containing unfilteredLinkFunc
     * @returns {Array} Two-element array [min, max] representing the attribute's range
     */
    getAttributeRange(attrMetaData) {
        const allCrossLinks = this.getAllCrossLinks();
        const func = attrMetaData.unfilteredLinkFunc;
        const vals = allCrossLinks.map(function (link) {
            let attrVals = func(link);
            if (attrVals.length > 1) {
                attrVals = d3.extent(attrVals);
            }
            return attrVals;
        });
        const extent = d3.extent(d3.merge(vals));
        //console.log (vals, extent);
        return extent;
    }

    /**
     * Generates a URL query string representing current application state.
     * Combines filter model parameters with PDB code and preserves non-filter URL parameters
     * (sid, upload, decoys, unval, lowestScore, anon).
     * @returns {string} Complete URL with query parameters reflecting current state
     */
    generateUrlString() {
        // make url parts from current filter attributes
        let parts = this.get("filterModel").getURLQueryPairs();
        if (this.get("pdbCode")) {
            const pdbParts = makeURLQueryPairs({pdb: this.get("pdbCode")});
            parts = pdbParts.concat(parts);
        }

        // return parts of current url query string that aren't filter flags or values
        const search = window.location.search.slice(1);
        const nonFilterKeys = d3.set(["sid", "upload", "decoys", "unval", "lowestScore", "anon"]);
        const nonFilterParts = search.split("&").filter(function (nfpart) {
            return nonFilterKeys.has(nfpart.split("=", 1)[0]);
        });
        // and queue them to be at the start of new url query string (before filter attributes)
        parts = nonFilterParts.concat(parts);

        return window.location.origin + window.location.pathname + "?" + parts.join("&");
    }
}

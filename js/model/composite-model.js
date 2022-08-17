import * as _ from "underscore";

import Backbone from "backbone";

import {fdr, clearFdr} from "../filter/fdr";
import {jqdialogs} from "../dialogs";
import {makeURLQueryPairs, mergeContiguousFeatures} from "../modelUtils";
import d3 from "d3";
import {xilog} from "../utils";

export class CompositeModel extends Backbone.Model {
    constructor(attributes, options) {
        super(attributes, options);
    }

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
            if (this.get("clmsModel")) {    // bar the alternative model from doing this because it has no crosslinks and will crash
                this.getCrossLinkDistances(this.getAllCrossLinks());
            }
        });

        this.calcAndStoreTTCrossLinkCount();
    }

    // Set cross-link homomultimer states to true if any constituent matches are homomultimer
    // This means when we grab distances we get the worst-case distance (useful for setting ranges)
    // Another call to applyFilter will set them back to normal
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

    // Get distances if links are made homomultimer if possible, needed to generate initial distance range
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

    applyFilter() {
        const filterModel = this.get("filterModel");
        const clmsModel = this.get("clmsModel");
        const crosslinksArr = this.getAllCrossLinks();
        const searches = Array.from(clmsModel.get("searches").values());
        let result;

        if (filterModel) {
            filterModel.preprocessFilterInputValues(searches); // saves doing stuff later on for every match
        }
        // if its FDR based filtering,
        // set all matches fdrPass att to false, then calc
        if (filterModel && filterModel.get("fdrMode")) {
            const matches = clmsModel.get("matches");
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
                let key;
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
        for (let participant of clmsModel.get("participants").values()) {
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

    getFilteredCrossLinks(type) { // if type of crosslinks not declared, make it 'targets' by default
        return this.filteredXLinks[type || "targets"];
    }

    getAllCrossLinks() {
        return Array.from(this.get("clmsModel").get("crosslinks").values());
    }

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

    calcAndStoreTTCrossLinkCount() {
        const ttCrossLinks = this.getAllTTCrossLinks();
        if (ttCrossLinks !== null) {
            this.set("TTCrossLinkCount", ttCrossLinks.length);
        }
    }

    getMarkedMatches(modelProperty) {
        return this.get("match_" + modelProperty);
    }

    getMarkedCrossLinks(modelProperty) {
        return this.get(modelProperty);
    }

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

    // modelProperty can be "highlights" or "selection" (or a new one) depending on what array you want
    // to fill in the model
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

    triggerFinalMatchLinksChange(modelProperty, penultimateSetOfChanges) {
        // if either of the last two backbone set operations did cause a change then trigger an event
        // so views waiting for both links and matches to finish updating can act
        const lastSetOfChanges = this.changedAttributes();
        if (penultimateSetOfChanges || lastSetOfChanges) {
            this.trigger(modelProperty + "MatchesLinksChanged", this);
        }
    }

    setHighlightedProteins(pArr, add) {
        let toHighlight = add ? pArr.concat(this.get("highlightedProteins")) : pArr;
        toHighlight = d3.map(toHighlight, function (d) {
            return d.id;
        }).values(); // remove any duplicates and returns a new array, so setting fires a change
        this.set("highlightedProteins", toHighlight);
    }

    setSelectedProteins(pArr, add) {
        let toSelect = add ? this.get("selectedProteins").slice() : []; //see note below
        if (add && pArr.length == 1 && toSelect.indexOf(pArr[0]) > -1) { // if ctrl/shift click and already selected the remove
            toSelect = toSelect.filter(function (el) {
                return el !== pArr[0];
            });
        } else {
            for (let p = 0; p < pArr.length; p++) {
                const protein = pArr[p];
                if (toSelect.indexOf(protein) == -1) {
                    toSelect.push(protein);
                }
            }
        }
        this.set("selectedProteins", toSelect); //the array.slice() clones the array so this triggers a change
    }

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

    hideUnselectedProteins() {
        const selected = this.get("selectedProteins");
        for (let participant of this.get("clmsModel").get("participants").values()) {
            if (selected.indexOf(participant) == -1) {
                participant.manuallyHidden = true;
            }
        }
        this.get("filterModel").trigger("change", this.get("filterModel"));
    }

    showHiddenProteins() {
        for (let participant of this.get("clmsModel").get("participants").values()) {
            participant.manuallyHidden = false;
        }
        this.get("filterModel").trigger("change");
    }

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

    proteinSelectionTextFilter() {
        const filterText = d3.select("#proteinSelectionFilter").property("value").trim().toLowerCase();
        const participantsArr = Array.from(this.get("clmsModel").get("participants").values());

        const toSelect = participantsArr.filter(function (p) {
            return (p.name.toLowerCase().indexOf(filterText) != -1 || p.description.toLowerCase().indexOf(filterText) != -1);
        });
        this.setSelectedProteins(toSelect);
    }

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

    clearGroups() {
        const self = this;
        jqdialogs.areYouSureDialog("ClearGroupsDialog", "Clear all groups?", "Clear Groups", "Yes", "No", function () {
            self.set("groups", new Map());
            self.trigger("change:groups");
        });
    }

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


            // var proteins = this.model.get("clmsModel").get("participants").values();
            // for (var protein of proteins) {
            //
            //     if (protein.uniprot) {
            //         var peri = false;
            //         var intr = false;
            //         for (var goId of protein.uniprot.go) {
            //             var goTerm = go.get(goId);
            //             if (goTerm) {
            //                 //GO0071944
            //                 if (goTerm.isDescendantOf("GO0071944") == true) {
            //                     peri = true;
            //                 } //GO0071944
            //                 if (goTerm.isDescendantOf("GO0005622") == true) {
            //                     intr = true;
            //                 }
            //             }
            //
            //         }
            //
            //         if (peri == true && intr == true) {
            //             both.add(protein.id);
            //         } else if (peri == true) {
            //             periphery.add(protein.id);
            //         } else if (intr == true) {
            //             intracellular.add(protein.id);
            //         } else {
            //             uncharacterised.add(protein.id);
            //         }
            //     }
            //
            // }
            // this.model.set("groups", groupMap);


        });
    }


    collapseGroups() {
        window.vent.trigger("collapseGroups", true);
    }

    expandGroups() {
        window.vent.trigger("expandGroups", true);
    }


    // Things that can cause a cross-link's minimum distance to change:
    // 1. New PDB File loaded
    // 2. Change in alignment
    // 3. Change in PDB assembly
    // 4. Change in interModelDistances allowed flag
    // 5. Change in link's homomultimer status - due to match filtering
    getSingleCrosslinkDistance(xlink, distancesObj, protAlignCollection, options) {
        if (xlink.toProtein) {
            // distancesObj and alignCollection can be supplied to function or, if not present, taken from model
            distancesObj = distancesObj || this.get("clmsModel").get("distancesObj");
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

    // set includeUndefineds to true to preserve indexing of returned distances to input crosslinks
    getCrossLinkDistances(crosslinks, options) {
        options = options || {};
        const includeUndefineds = options.includeUndefineds || false;

        const distModel = this.get("clmsModel").get("distancesObj");
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

        if (featureFilterSet.has("Digestible")) {
            const digestFeatures = this.get("clmsModel").getDigestibleResiduesAsFeatures(participant);
            const mergedFeatures = mergeContiguousFeatures(digestFeatures);
            features = d3.merge([mergedFeatures, features]);
        }

        if (featureFilterSet.has("Crosslinkable-1")) {
            const crosslinkableFeatures = this.get("clmsModel").getCrosslinkableResiduesAsFeatures(participant, 1);
            const mergedFeatures = mergeContiguousFeatures(crosslinkableFeatures);
            features = d3.merge([mergedFeatures, features]);
        }

        if (featureFilterSet.has("Crosslinkable-2")) {
            const crosslinkableFeatures = this.get("clmsModel").getCrosslinkableResiduesAsFeatures(participant, 2);
            const mergedFeatures = mergeContiguousFeatures(crosslinkableFeatures);
            features = d3.merge([mergedFeatures, features]);
        }

        xilog("annots", annots, "f", features);
        return features ? features.filter(function (f) {
            return featureFilterSet.has(f.type);
        }, this) : [];
    }

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

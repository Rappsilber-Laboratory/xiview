/**
 * @fileoverview Mixin for the main crosslink filtering pipeline on CompositeModel.
 * Mixed into CompositeModel.prototype via Object.assign so `this` is always the CompositeModel instance.
 *
 * Pipeline stages (in order):
 *   1. FDR pre-processing — clear fdrPass flags, run FDR algorithm, set threshold attributes
 *   2. Per-crosslink filtering — FDR mode or standard mode, with protein hiding and distance checks
 *   3. Multi-group filter — remove crosslinks spanning too many groups (if enabled)
 *   4. Unique residue pairs per PPI filter
 *   5. Categorisation — populate filteredXLinks cache (all, targets, linears, decoys)
 *   6. Protein hidden-state update — hide proteins with no visible non-decoy non-linear links
 *   7. Stats update — proteinCount, ppiCount, hetLinkCount, selfLinkCount
 *   8. Events — trigger hiddenChanged then filteringDone
 */

import {fdr} from "../../filter/fdr";

export const FilteringPipelineMixin = {
    /**
     * Applies all active filters to crosslinks and updates the filteredXLinks cache.
     * @returns {CompositeModel} this, for chaining
     */
    applyFilter() {
        const filterModel = this.get("filterModel");
        const clmsModel = this.get("clmsModel");
        const crosslinksArr = this.getAllCrossLinks();
        const searches = Array.from(clmsModel.getSearches().values());
        let result;

        // Stage 1: FDR pre-processing
        if (filterModel) {
            filterModel.preprocessFilterInputValues(searches);
        }

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
                "interFdrCut": result[0].thresholdMet ? result[0].fdr : undefined,
                "intraFdrCut": result[1].thresholdMet ? result[1].fdr : undefined
            }, {
                silent: true
            });
        }

        // Stage 2: Per-crosslink filtering
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
                    crosslink.filteredMatches_pp = [];
                    const filteredMatchCount = filteredMatches_pp.length;

                    for (let fm_pp = 0; fm_pp < filteredMatchCount; fm_pp++) {
                        const fm = filteredMatches_pp[fm_pp];
                        const match = fm.match;
                        match.fdrPass = true;
                        const pass = crosslink.fromProtein.manuallyHidden != true &&
                            (!crosslink.toProtein || crosslink.toProtein.manuallyHidden != true) &&
                            filterModel.navigationFilter(match) &&
                            filterModel.groupFilter(match);

                        if (pass) {
                            crosslink.filteredMatches_pp.push(fm);
                            if (match.confirmedHomomultimer && isSelf) {
                                crosslink.confirmedHomomultimer = true;
                            }
                        }
                    }

                    if (!filterModel.distanceFilter(crosslink)) {
                        crosslink.filteredMatches_pp = [];
                    }
                }
            } else {
                // Standard (non-FDR) mode
                if (crosslink.fromProtein.manuallyHidden != true && (!crosslink.toProtein || crosslink.toProtein.manuallyHidden != true)) {
                    crosslink.ambiguous = true;
                    crosslink.confirmedHomomultimer = false;

                    const matches_pp = crosslink.matches_pp;
                    const matchCount = matches_pp.length;
                    for (let m = 0; m < matchCount; m++) {
                        const matchAndPepPos = matches_pp[m];
                        const match = matchAndPepPos.match;
                        let pass = filterModel.subsetFilter(match) &&
                            filterModel.validationStatusFilter(match) &&
                            filterModel.scoreFilter(match) &&
                            filterModel.decoyFilter(match);

                        // navigation filters don't affect ambiguous state (calculated before nav filter)
                        if (pass && match.crosslinks.length === 1) {
                            crosslink.ambiguous = false;
                        }

                        pass = pass && filterModel.navigationFilter(match) && filterModel.groupFilter(match);

                        if (pass) {
                            crosslink.filteredMatches_pp.push(matchAndPepPos);
                            if (match.confirmedHomomultimer && isSelf) {
                                crosslink.confirmedHomomultimer = true;
                            }
                        }
                    }

                    if (!filterModel.distanceFilter(crosslink)) {
                        crosslink.filteredMatches_pp = [];
                    }
                }
            }
        }

        const homomultiSwitchers = [];
        for (let crosslink of crosslinksArr) {
            const oldHM = crosslink.confirmedHomomultimer;
            if (filterModel) {
                filterCrossLink(crosslink);
            } else {
                crosslink.filteredMatches_pp = crosslink.matches_pp;
            }
            if (oldHM !== crosslink.confirmedHomomultimer) {
                homomultiSwitchers.push(crosslink);
            }
        }
        this.getCrossLinkDistances(homomultiSwitchers);

        // Stage 3: Multi-group filter
        if (filterModel && !filterModel.get("multipleGroup")) {
            for (let crosslink of crosslinksArr) {
                if (!filterModel.groupFilter2(crosslink.filteredMatches_pp)) {
                    crosslink.filteredMatches_pp = [];
                }
            }
        }

        // Stage 4: Unique residue pairs per PPI
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

        // Stage 5: Categorise into filteredXLinks cache
        this.filteredXLinks = {
            all: [],
            targets: [],
            linears: [],
            linearTargets: [],
            decoysTD: [],
            decoysDD: [],
        };

        for (let crosslink of crosslinksArr) {
            if (crosslink.filteredMatches_pp.length) {
                this.filteredXLinks.all.push(crosslink);
                const linear = crosslink.isLinearLink();
                if (linear) {
                    this.filteredXLinks.linears.push(crosslink);
                }
                if (!crosslink.isDecoyLink()) {
                    this.filteredXLinks[linear ? "linearTargets" : "targets"].push(crosslink);
                } else {
                    const decoyLinkCache = crosslink.fromProtein.is_decoy && !linear && crosslink.toProtein.is_decoy ? "decoysDD" : "decoysTD";
                    this.filteredXLinks[decoyLinkCache].push(crosslink);
                }
            }
        }

        // Stage 6: Hide proteins with no visible non-decoy non-linear links
        let visibleProteinCount = 0;
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

        // Stage 7: Update stats
        const ppiSet = new Set();
        let heteromericLinks = 0, selfLinks = 0;
        for (let crosslink of this.getFilteredCrossLinks()) {
            if (crosslink.isSelfLink()) {
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

        // Stage 8: Events
        this.trigger("hiddenChanged");
        this.trigger("filteringDone");

        return this;
    },
};

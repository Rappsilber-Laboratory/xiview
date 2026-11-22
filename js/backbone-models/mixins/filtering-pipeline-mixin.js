/**
 * @fileoverview Mixin for the main crosslink filtering pipeline on CompositeModel.
 * Mixed into CompositeModel.prototype via Object.assign so `this` is always the CompositeModel instance.
 *
 * Pipeline stages (in order):
 *   1. FDR pre-processing — clear fdrPass flags, run FDR algorithm, set threshold attributes
 *   2. Per-crosslink filtering — FDR mode or standard mode, with protein hiding, then distance
 *      recalculation for crosslinks whose homomultimer state changed, then distance filtering
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
        // Protein name / description search text, worked out once per protein for this call (standard mode only).
        // Exact because protein names, descriptions, accessions and keywords don't change during applyFilter(),
        // and the cache is local to this call, so it's never reused after anything changes.
        const proteinSearchTextCache = new Map();

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

                        pass = pass && filterModel.navigationFilter(match, proteinSearchTextCache) && filterModel.groupFilter(match);

                        if (pass) {
                            crosslink.filteredMatches_pp.push(matchAndPepPos);
                            if (match.confirmedHomomultimer && isSelf) {
                                crosslink.confirmedHomomultimer = true;
                            }
                        }
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
        // A crosslink's distance depends on its confirmedHomomultimer state, which the loop above has just
        // worked out, so recalculate distances for crosslinks whose state changed before distance filtering
        this.getCrossLinkDistances(homomultiSwitchers);

        // Distance filter (both modes), on up-to-date distances
        if (filterModel) {
            for (let crosslink of crosslinksArr) {
                if (crosslink.filteredMatches_pp.length && !filterModel.distanceFilter(crosslink)) {
                    crosslink.filteredMatches_pp = [];
                }
            }
        }

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
                const ppiKey = function (crosslink) {
                    return crosslink.toProtein ?
                        crosslink.fromProtein.id + " - " + crosslink.toProtein.id :
                        crosslink.fromProtein.id + " - linear";
                };
                let value;
                const ppiMap = new Map();
                for (let crosslink of crosslinksArr) {
                    if (crosslink.filteredMatches_pp.length) {
                        const key = ppiKey(crosslink);
                        value = ppiMap.get(key);
                        if (typeof value == "undefined") {
                            value = 1;
                        } else {
                            value++;
                        }
                        ppiMap.set(key, value);
                    }
                }
                // crosslinksArr holds the same crosslinks as getAllCrossLinks() (an array copy of the same map)
                for (let crosslink of crosslinksArr) {
                    value = ppiMap.get(ppiKey(crosslink));
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
        for (let protein of clmsModel.getProteinsIterator()) {
            protein.hidden = true;
            for (let pCrossLink of protein.crosslinks) {
                if (pCrossLink.filteredMatches_pp.length &&
                    !pCrossLink.isDecoyLink() &&
                    !pCrossLink.isLinearLink()) {
                    protein.hidden = false;
                    visibleProteinCount++;
                    break;
                }
            }
        }

        // Stage 7: Update stats
        // Distinct (from, to) protein id pairs first, then one "from-to" string per pair: the same set of
        // strings as building one per crosslink, without building and hashing a string for every crosslink.
        const toIdsByFromId = new Map();
        let heteromericLinks = 0, selfLinks = 0;
        for (let crosslink of this.getFilteredCrossLinks()) {
            if (crosslink.isSelfLink()) {
                selfLinks++;
            } else {
                heteromericLinks++;
                const fromId = crosslink.fromProtein.id;
                let toIds = toIdsByFromId.get(fromId);
                if (!toIds) {
                    toIds = new Set();
                    toIdsByFromId.set(fromId, toIds);
                }
                toIds.add(crosslink.toProtein.id);
            }
        }
        const ppiSet = new Set();
        for (const [fromId, toIds] of toIdsByFromId) {
            for (const toId of toIds) {
                ppiSet.add(fromId + "-" + toId);
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

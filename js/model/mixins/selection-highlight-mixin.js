/**
 * @fileoverview Mixin for selection and highlight state management on CompositeModel.
 * Mixed into CompositeModel.prototype via Object.assign so `this` is always the CompositeModel instance.
 *
 * Co-recursion invariant (dontForward):
 *   setMarkedMatches and setMarkedCrossLinks call each other to keep matches and crosslinks in sync.
 *   The `dontForward` flag breaks the mutual recursion: when A calls B, it passes dontForward=true
 *   so B updates its own state but does NOT call A again. Each pair of calls ends with a single
 *   triggerFinalMatchLinksChange, fired by whichever function started the chain.
 */

import d3 from "d3";
import * as _ from "underscore";

export const SelectionHighlightMixin = {
    /**
     * Retrieves the map of marked (selected/highlighted) matches.
     * @param {string} modelProperty - "selection" or "highlights"
     * @returns {d3.Map} Map of marked matches
     */
    getMarkedMatches(modelProperty) {
        return this.get("match_" + modelProperty);
    },

    /**
     * Retrieves the array of marked (selected/highlighted) crosslinks.
     * @param {string} modelProperty - "selection" or "highlights"
     * @returns {Array} Array of marked crosslinks
     */
    getMarkedCrossLinks(modelProperty) {
        return this.get(modelProperty);
    },

    /**
     * Sets marked matches and propagates changes to associated crosslinks.
     * Handles toggling for selection, deduplication, and bidirectional sync with crosslinks.
     * @param {string} modelProperty - "selection" or "highlights"
     * @param {Array} matches - Array of match objects to mark
     * @param {boolean} andAlternatives - Whether to include alternative/ambiguous matches
     * @param {boolean} add - Whether to add to existing marks (true) or replace (false)
     * @param {boolean} dontForward - If true, don't propagate changes to crosslinks (breaks co-recursion)
     */
    setMarkedMatches(modelProperty, matches, andAlternatives, add, dontForward) {
        if (matches) {
            const type = "match_" + modelProperty;
            const map = add ? d3.map(this.get(type).values(), function (d) {
                return d.id;
            }) : d3.map();
            const potentialToggle = (modelProperty === "selection");
            matches.forEach(function (match) {
                if (match.match) match = match.match;
                const id = match.id;
                if (potentialToggle && add && map.has(id)) {
                    map.remove(id);
                } else {
                    map.set(id, match);
                }
            });
            this.set(type, map);

            if (!dontForward) {
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
                this.setMarkedCrossLinks(modelProperty, crosslinks, andAlternatives, false, true);
                this.triggerFinalMatchLinksChange(modelProperty, matchesChanged);
            }
        }
    },

    /**
     * Sets marked crosslinks and propagates changes to associated matches.
     * Handles toggling for selection, deduplication, alternative link inclusion,
     * and bidirectional sync with matches.
     * @param {string} modelProperty - "selection" or "highlights"
     * @param {Array} crosslinks - Array of crosslink objects to mark
     * @param {boolean} andAlternatives - Whether to include alternative/ambiguous crosslinks
     * @param {boolean} add - Whether to add to existing marks (true) or replace (false)
     * @param {boolean} dontForward - If true, don't propagate changes to matches (breaks co-recursion)
     */
    setMarkedCrossLinks(modelProperty, crosslinks, andAlternatives, add, dontForward) {
        if (crosslinks) {
            const removedLinks = d3.map();
            const newlyAddedLinks = d3.map();

            const crosslinkMap = d3.map(add ? this.get(modelProperty) : crosslinks, function (d) {
                return d.id;
            });
            if (add) {
                const potentialToggle = (modelProperty === "selection");
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
                        const filteredMatchesAndPeptidePositions = crosslink.filteredMatches_pp;
                        const fm_ppCount = filteredMatchesAndPeptidePositions.length;
                        for (let fm_pp = 0; fm_pp < fm_ppCount; fm_pp++) {
                            const clinks = filteredMatchesAndPeptidePositions[fm_pp].match.crosslinks;
                            const clCount = clinks.length;
                            for (let cl = 0; cl < clCount; cl++) {
                                const mCrossLink = clinks[cl];
                                crosslinkMap.set(mCrossLink.id, mCrossLink);
                            }
                        }
                    }
                }, this);
            }

            const dedupedCrossLinks = crosslinkMap.values();
            this.set(modelProperty, dedupedCrossLinks);

            if (!dontForward) {
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

                const linksChanged = this.changedAttributes();
                this.setMarkedMatches(modelProperty, allMatches, andAlternatives, false, true);
                this.triggerFinalMatchLinksChange(modelProperty, linksChanged);
            }
        }
    },

    /**
     * Triggers the final synchronized event after both matches and crosslinks have been updated.
     * Views waiting for both updates to complete listen to the selectionMatchesLinksChanged /
     * highlightsMatchesLinksChanged events fired here.
     * @param {string} modelProperty - "selection" or "highlights"
     * @param {Object|false} penultimateSetOfChanges - changedAttributes() from the previous set call
     */
    triggerFinalMatchLinksChange(modelProperty, penultimateSetOfChanges) {
        const lastSetOfChanges = this.changedAttributes();
        if (penultimateSetOfChanges || lastSetOfChanges) {
            this.trigger(modelProperty + "MatchesLinksChanged", this);
        }
    },
};

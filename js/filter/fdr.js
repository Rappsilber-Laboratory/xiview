/**
 * @fileoverview False Discovery Rate (FDR) calculation for crosslinking mass spectrometry data.
 * Implements target-decoy approach to estimate proportion of false positives in crosslink identifications.
 * Separates inter/intra-protein links, calculates link scores from match scores, applies FDR threshold.
 * Formula: FDR = (TD - DD) / TT where TD=target-decoy, DD=decoy-decoy, TT=target-target links.
 */
import * as _ from "underscore";
import d3 from "d3";
import {clearObjectMetaData} from "../modelUtils";

/**
 * Clears FDR-related metadata from crosslinks.
 * Removes "fdr" and "linkScore" metadata fields (used when switching out of FDR mode).
 * @param {Array<Object>} crosslinksArr - Array of crosslink objects
 * @returns {undefined}
 */
export const clearFdr = function (crosslinksArr) {
    // clear fdr information from crosslinks (usually because we've gone into none-fdr mode and don't want it showing in tooltips)
    clearObjectMetaData(crosslinksArr, ["fdr", "linkScore"]);
};

/**
 * Calculates False Discovery Rate (FDR) for crosslinks using target-decoy approach.
 * Algorithm: 1) Calculate link scores (default: RMS of match scores), 2) Separate inter/intra-protein,
 * 3) Sort by score, 4) Calculate running FDR = (TD - DD) / TT with monotonicity constraint,
 * 5) Find cutoff where FDR ≤ threshold. Sets "fdr" and "linkScore" metadata on each crosslink.
 * @param {Array<Object>} crosslinksArr - Array of crosslink objects to calculate FDR for
 * @param {Object} options - Configuration options
 * @param {Function} [options.scoreCalcFunc] - Custom scoring function (default: quadratic mean of match scores)
 * @param {number} [options.threshold] - FDR threshold (e.g., 0.05 for 5% FDR), undefined for no FDR filtering
 * @param {boolean} [options.filterLinears=false] - If true, exclude linear links from FDR calculation
 * @param {Object} options.filterModel - Filter backbone-models instance for subset filtering
 * @param {Object} options.CLMSModel - CLMS backbone-models instance
 * @returns {Array<Object>|null} Array with 2 objects (Inter, Intra) containing cutoff info, or null if required clms-backbone-models missing
 */
export const fdr = function (crosslinksArr, options) {

    /**
     * Default link score calculation: quadratic mean (RMS) of filtered match scores.
     * Filters matches by subset filter, then calculates sqrt(sum of squared scores).
     * @param {Object} crosslink - Crosslink object with matches_pp array
     * @returns {number} Quadratic mean of match scores
     */
    const defaultScoreCalcFunc = function (crosslink) { // default function is based on quadratic mean (rms)
        const filtered = crosslink.matches_pp
            .filter(function (match_pp) {
                // filter out matches which don't pass current subset filter (used to be just peptide length we considered here)
                return filterModel.subsetFilter(match_pp.match);
            });
        return Math.sqrt(d3.sum(filtered, function (match_pp) {
            return match_pp.match.score() * match_pp.match.score();
        }) || 0);
    };

    // 'threshold' can be legitimately undefined to have no fdr
    options = _.extend({}, {
        scoreCalcFunc: defaultScoreCalcFunc,
        threshold: undefined,
        filterLinears: false
    }, options);

    const filterModel = options.filterModel;
    const clmsModel = options.CLMSModel;
    if (!filterModel || !clmsModel) {
        return null;
    }

    // Work out link score based on a function of the related match scores
    const clCount = crosslinksArr.length;
    for (let i = 0; i < clCount; ++i) {
        const crosslink = crosslinksArr[i];
        crosslink.setMeta("linkScore", options.scoreCalcFunc(crosslink));
    }

    // filter out linears
    if (options.filterLinears) {
        crosslinksArr = crosslinksArr.filter(function (link) {
            return !link.isLinearLink();
        });
    }

    // Divide crosslinks into inter and intra-protein groups, and sort them by the scores just calculated
    const arrLabels = ["Inter", "Intra"];
    const linkArrs = _.partition(crosslinksArr, function (xLink) {
        return !xLink.isSelfLink();
    });
    linkArrs.forEach(function (linkArr) {
        linkArr.sort(function (a, b) {
            return a.getMeta("linkScore") - b.getMeta("linkScore");
        });
    }); // in ascending order (lowest first)
    //console.log ("linkArrs", linkArrs);

    // What kind of link is this, TT, DT or DD? (0, 1 or 2)
    function decoyClass(link) {
        return (link.fromProtein.is_decoy ? 1 : 0) + ((!link.toProtein || link.toProtein.is_decoy) ? 1 : 0);
    }

    // Loop through both groups and work out the fdr
    const fdrResult = linkArrs.map(function (linkArr, index) {

        let fdr = 1;
        const t = [0, 0, 0, 0]; // Counters: [TT, TD, DD, zero-score links]
        let cutoffIndex = 0;
        const runningFdr = [];
        let fdrScoreCutoff;

        if (linkArr.length && options.threshold !== undefined) {
            // first run, count tt, td, and dd
            linkArr.forEach(function (link) {
                if (link.getMeta("linkScore") > 0) {
                    t[decoyClass(link)]++;
                } else {
                    t[3]++;
                }
            });

            //console.log ("totals tt td dd", t, linkArr);
            const nonzero = d3.sum(t) > 0;
            let runningMin = Number.POSITIVE_INFINITY;

            // decrement the counters on second run
            linkArr.forEach(function (link, i) {
                // A. Apply score first
                fdr = (t[1] - t[2]) / (t[0] || 1);
                runningMin = Math.min(fdr, runningMin);
                fdr = runningMin;
                runningFdr.push(fdr);
                link.setMeta("fdr", fdr);
                //console.log ("fdr", arrLabels[index], fdr, t, link.getMeta("linkScore"));

                // B. then change running totals
                if (link.getMeta("linkScore") > 0) {
                    t[decoyClass(link)]--;
                }
                i++;
                // Record first index where FDR meets threshold
                if (fdr <= options.threshold && cutoffIndex === 0) {
                    cutoffIndex = i;
                    //console.log ("cutoff totals tt td dd", t, link, cutoffIndex);
                }
            });

            if (cutoffIndex === 0) { // if cutoff was never met
                cutoffIndex = linkArr.length; // then set cutoffindex to last index in array
            }

            // Adjust cutoff index and determine score cutoff
            cutoffIndex = Math.max(cutoffIndex - 1, 0);
            const lastLink = linkArr[cutoffIndex];
            fdrScoreCutoff = nonzero ? lastLink.getMeta("linkScore") : 0.001;

            /*if (false) {
                console.log(arrLabels[index] + " post totals tt td dd (should be zero)", t);
                console.log("runningFdr", runningFdr, "final fdr", fdr);
                console.log(fdr, "fdr of", options.threshold, "met or lower at index", cutoffIndex, "link", lastLink, "and fdr score", fdrScoreCutoff);
            }*/
        }

        return {
            label: arrLabels[index],
            index: cutoffIndex,
            fdr: fdrScoreCutoff,
            totals: t,
            thresholdMet: fdr !== undefined && !(fdr > options.threshold)
        };
    });

    /*
    var fcl = linkArrs.map (function (larr, i) {
    	return larr.slice(fdrResult[i].index, larr.length);
    });

    var cids = fcl.map (function (farr) {
    	return farr.filter(function(link) { return !link.isDecoyLink(); }).map (function (link) { return link.id; });
    })

    console.log ("fcl", fcl, cids);
    */

    return fdrResult;
};

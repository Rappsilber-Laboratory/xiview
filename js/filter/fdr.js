import * as _ from "underscore";
import d3 from "d3";
import {clearObjectMetaData} from "../modelUtils";

export const clearFdr = function (crosslinksArr) {
    // clear fdr information from crosslinks (usually because we've gone into none-fdr mode and don't want it showing in tooltips)
    clearObjectMetaData(crosslinksArr, ["fdr", "linkScore"]);
};

export const fdr = function (crosslinksArr, options) {

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
        const t = [0, 0, 0, 0];
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
                if (fdr <= options.threshold && cutoffIndex === 0) {
                    cutoffIndex = i;
                    //console.log ("cutoff totals tt td dd", t, link, cutoffIndex);
                }
            });

            if (cutoffIndex === 0) { // if cutoff was never met
                cutoffIndex = linkArr.length; // then set cutoffindex to last index in array
            }

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
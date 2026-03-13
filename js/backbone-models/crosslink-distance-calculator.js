/**
 * @fileoverview Delegate class for computing crosslink distances from 3D structural data.
 * Pure computation; fires no Backbone events.
 */

import * as _ from "underscore";

/**
 * Calculates 3D distances for crosslinks using structural data.
 * CompositeModel creates one instance and calls update() when distancesObj,
 * alignColl, or stageModel change.
 */
export class CrosslinkDistanceCalculator {
    /**
     * @param {Object} opts
     * @param {Object} opts.distancesObj - Distances object with getXLinkDistance()
     * @param {Object} opts.alignColl - Protein alignment collection
     * @param {Object} opts.stageModel - NGL stage backbone-models (may be null)
     */
    constructor({ distancesObj, alignColl, stageModel }) {
        this.distancesObj = distancesObj;
        this.alignColl = alignColl;
        this.stageModel = stageModel;
    }

    update({ distancesObj, alignColl, stageModel }) {
        if (distancesObj !== undefined) this.distancesObj = distancesObj;
        if (alignColl !== undefined) this.alignColl = alignColl;
        if (stageModel !== undefined) this.stageModel = stageModel;
    }

    /**
     * Calculates the minimum distance for a single crosslink from 3D structural data.
     * @param {Object} xlink - Crosslink object
     * @param {Object} [distancesObj] - Override distances object
     * @param {Object} [protAlignCollection] - Override alignment collection
     * @param {Object} [options] - Calculation options
     * @returns {number|Object|undefined} Calculated distance or distance object
     */
    getSingleCrosslinkDistance(xlink, distancesObj, protAlignCollection, options) {
        if (xlink.toProtein) {
            distancesObj = distancesObj || this.distancesObj;
            protAlignCollection = protAlignCollection || this.alignColl;
            options = options || { average: false };
            options.allowInterModelDistances = options.allowInterModel ||
                (this.stageModel ? this.stageModel.get("allowInterModelDistances") : false);
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
     * Calculates distances for multiple crosslinks.
     * @param {Array} crosslinks - Array of crosslink objects
     * @param {Object} [options] - Calculation options (includeUndefineds, average, allowInterModel, returnChainInfo)
     * @returns {Array} Array of distances
     */
    getCrossLinkDistances(crosslinks, options) {
        options = options || {};
        const includeUndefineds = options.includeUndefineds || false;

        const distModel = this.distancesObj;
        const protAlignCollection = this.alignColl;
        let distArr = crosslinks.map((cl) => {
            const dist = this.getSingleCrosslinkDistance(cl, distModel, protAlignCollection, options);
            return options.returnChainInfo || dist == undefined ? dist : +dist;
        });
        if (!includeUndefineds) {
            distArr = distArr.filter(function (d) {
                return d != undefined;
            });
        }
        return distArr;
    }

    /**
     * Sets all self-link crosslinks to worst-case homomultimer state.
     * Enables calculation of the widest possible distance range.
     * @param {Array} crosslinksArr - All crosslinks
     */
    calcWorstCaseHomomultimerStates(crosslinksArr) {
        crosslinksArr.forEach(function (clink) {
            clink.confirmedHomomultimer = false;
            if (clink.isSelfLink()) {
                clink.confirmedHomomultimer = _.any(clink.matches_pp, function (m) {
                    return m.match.confirmedHomomultimer;
                });
            }
        });
    }

    /**
     * Calculates crosslink distances with worst-case homomultimer states then restores originals.
     * @param {Array} crosslinkArr - Array of crosslink objects
     * @returns {Array} Array of calculated distances
     */
    getHomomDistances(crosslinkArr) {
        const oldHom = _.pluck(crosslinkArr, "confirmedHomomultimer");

        this.calcWorstCaseHomomultimerStates(crosslinkArr);
        const dists = this.getCrossLinkDistances(crosslinkArr);

        crosslinkArr.forEach(function (clink, i) {
            clink.confirmedHomomultimer = oldHom[i];
        });
        this.getCrossLinkDistances(crosslinkArr);

        return dists;
    }
}

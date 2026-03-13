/**
 * @fileoverview Pure function for serializing current application state to a URL string.
 */

import {makeURLQueryPairs} from "../modelUtils";
import d3 from "d3";

/**
 * Generates a URL query string representing the current application state.
 * Combines filter backbone-models parameters with PDB code and preserves non-filter URL parameters
 * (sid, upload, decoys, unval, lowestScore, anon).
 * @param {Object} filterModel - Backbone filter backbone-models with getURLQueryPairs()
 * @param {string|undefined} pdbCode - Optional PDB code to include
 * @returns {string} Complete URL with query parameters reflecting current state
 */
export function generateUrlString(filterModel, pdbCode) {
    let parts = filterModel.getURLQueryPairs();
    if (pdbCode) {
        const pdbParts = makeURLQueryPairs({pdb: pdbCode});
        parts = pdbParts.concat(parts);
    }

    const search = window.location.search.slice(1);
    const nonFilterKeys = d3.set(["sid", "upload", "decoys", "unval", "lowestScore", "anon"]);
    const nonFilterParts = search.split("&").filter(function (nfpart) {
        return nonFilterKeys.has(nfpart.split("=", 1)[0]);
    });
    parts = nonFilterParts.concat(parts);

    return window.location.origin + window.location.pathname + "?" + parts.join("&");
}

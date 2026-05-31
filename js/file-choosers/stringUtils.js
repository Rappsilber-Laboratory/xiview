/**
 * @fileoverview STRING database utility functions for protein ID resolution and network queries.
 * Provides API integration with STRING for protein-protein interaction scores.
 * Features: protein ID resolution (UniProt → STRING IDs), network query (fetch interaction scores),
 * CSV translation (TSV network → CSV metadata format), localStorage caching (IDs + networks),
 * LZW compression (reduce cache size). Handles large protein sets (max 2000) with error messaging.
 * Uses Promises with jQuery AJAX for async API calls.
 */

import * as _ from "underscore";
import $ from "jquery";
import d3 from "d3";
import {getLocalStorage, setLocalStorage} from "../utils";
import {filterOutDecoyProteins} from "../modelUtils";

/**
 * STRING database utilities namespace with API integration functions.
 * All methods handle localStorage caching, Promise-based async flow, error reporting.
 * @namespace STRINGUtils
 */
export const STRINGUtils = {

    // Maximum number of proteins we can POST to STRING's network interaction API (found by trial and error)
    stringAPIMaxProteins: 2000,

    // Filter the CLMS backbone-models's proteins down to just those that have non-decoy inter-protein links
    filterProteinsToPPISet: function (clmsModel) {
        const realProteins = filterOutDecoyProteins(Array.from(clmsModel.getProteinsIterator()));
        const ppiProteins = realProteins.filter(function (prot) {
            return prot.crosslinks.some(function (clink) {
                // is there a real crosslink going to another protein?
                return !clink.isDecoyLink() && !clink.isSelfLink();
            });
        });
        return ppiProteins;
    },

    // Take a map of protein IDs (uniprot) --> taxon specific string IDs + a tsv format string network
    // and turn it into a csv string usable by the cross-link metadata parser.
    // Filter to appropriate protein IDs for brevity
    translateToCSV: function (uniprotToStringIDMap, networkTsvString) {
        const stringToUniprotIDMap = _.invert(uniprotToStringIDMap);
        networkTsvString = networkTsvString.replace(/^.*/, function (m) {
            return m.replace(/\tscore/g, "\tSTRING Score");
        });
        let rows = d3.tsv.parse(networkTsvString, function (d) {
            d.SeqPos1 = null;
            d.SeqPos2 = null;
            d.Protein1 = stringToUniprotIDMap[d.stringId_A];
            d.Protein2 = stringToUniprotIDMap[d.stringId_B];
            // return empty string if protein ids not in current id map
            return (d.Protein1 && d.Protein2 ? _.omit(d, ["ncbiTaxonId", "stringId_A", "stringId_B", "preferredName_A", "preferredName_B"]) : null);
        });
        rows = rows.filter(function (row) {
            return row != null;
        });
        return d3.csv.format(rows);
    },

    /**
     * Resolves UniProt protein IDs to STRING taxon-specific IDs with localStorage caching.
     * Checks cache for already-resolved IDs, queries STRING API for new IDs, updates cache,
     * returns Promise resolving to ID map. Handles local storage full errors with alert.
     * Uses STRING get_string_ids API endpoint with species, limit=1, format=only-ids.
     * @param {Array<string>} proteinIDs - Array of UniProt protein IDs
     * @param {string} taxonID - NCBI Taxon ID (e.g., "9606" for human)
     * @returns {Promise<Object>} Promise resolving to map of UniProt ID → STRING ID
     */
    getStringIdentifiers: function (proteinIDs, taxonID) {
        const stringIDCache = getLocalStorage("StringIds");
        const identifiersBySpecies = stringIDCache[taxonID] || {};
        const split = _.partition(proteinIDs, function (pid) {
            return identifiersBySpecies[pid];
        }); // which IDs are cached?
        const alreadyKnown = split[0];
        const todo = split[1];
        const echo = 1;
        console.log(stringIDCache, identifiersBySpecies, todo);

        if (todo.length) {
            const pidString = todo.join("\r");
            const promiseObj = new Promise(function (resolve, reject) {
                $.ajax({
                    type: "post",
                    url: "https://string-db.org/api/json/get_string_ids",
                    data: {
                        identifiers: pidString,
                        species: taxonID,
                        limit: 1,
                        caller_identity: "xiview",
                        format: "only-ids",
                        echo_query: echo ? 1 : 0
                    }
                })
                    // eslint-disable-next-line no-unused-vars
                    .done(function (data, textStatus, xhr) {
                        const stringCache = getLocalStorage("StringIds");   // get stored data
                        const identifiersBySpecies = stringCache[taxonID] || {};  // get or make object for species
                        data.forEach(function (record) {   // add new data to this species object
                            identifiersBySpecies[record.queryItem] = record.stringId;
                        });
                        stringCache[taxonID] = identifiersBySpecies;    // (re)attach species object to stored data
                        try {
                            setLocalStorage(stringCache, "StringIds");    // re-store the data
                        } catch (err) {
                            alert("Local Storage Full. Cannot Cache STRING IDs.");
                        }

                        const idMap = _.pick(identifiersBySpecies, proteinIDs);
                        console.log("IDMAP FROM STRING", idMap, identifiersBySpecies, proteinIDs);
                        resolve(idMap);
                    })
                    // eslint-disable-next-line no-unused-vars
                    .fail(function (xhr) {
                        reject("Error returned from STRING id resolution service");
                    });
            });
            return promiseObj;
        } else {
            const idMap = _.pick(identifiersBySpecies, alreadyKnown);
            console.log("IDMAP CACHED", idMap);
            return Promise.resolve(idMap);
        }
    },

    /**
     * Queries STRING for protein-protein interaction network with localStorage caching and LZW compression.
     * Takes STRING ID map, sorts IDs, creates network key, checks cache (exact match and subnetwork match via regex),
     * if cached returns decompressed network, otherwise queries STRING network API, compresses and caches result,
     * returns Promise resolving to {idMap, networkTsv}. Rejects if protein count exceeds stringAPIMaxProteins.
     * Uses STRING network API endpoint with identifiers, species, caller_identity=xiview.
     * @param {Object} idMap - Map of UniProt ID → STRING ID
     * @param {string} taxonID - NCBI Taxon ID
     * @returns {Promise<Object>} Promise resolving to {idMap: Object, networkTsv: string} or rejecting with error message
     */
    queryStringInteractions: function (idMap, taxonID) {
        const stringIDs = d3.values(idMap);
        if (stringIDs.length > 1) {
            stringIDs.sort(); // sort string ids
            const networkKey = stringIDs.join("\r");     // id/key made of string IDs joined together

            const stringNetworkScoreCache = getLocalStorage("StringNetworkScores");
            const idBySpecies = stringNetworkScoreCache[taxonID] || {};
            let cachedNetwork = idBySpecies[networkKey];    // exact key match in cache?

            if (!cachedNetwork) {  // match in cache where network is subnetwork of larger network?
                const allSpeciesNetworkKeys = d3.keys(idBySpecies);
                // since stringIds were sorted, and stored network keys generated from them, this regex will find the first stored network key that contains all current stringIDs
                const idKeyRegex = new RegExp(".*" + stringIDs.join(".*") + ".*");
                const matchingKeyIndex = _.findIndex(allSpeciesNetworkKeys, function (key) {
                    return idKeyRegex.test(key);
                });
                cachedNetwork = matchingKeyIndex >= 0 ? idBySpecies[allSpeciesNetworkKeys[matchingKeyIndex]] : null;
            }

            // If no cached network, go to STRING
            if (!cachedNetwork) {
                if (stringIDs.length >= STRINGUtils.stringAPIMaxProteins) {
                    return Promise.reject("Too Large. More than " + d3.format(",")(STRINGUtils.stringAPIMaxProteins) + " proteins in requested network. Consider filtering first.");
                }
                const promiseObj = new Promise(function (resolve, reject) {
                    $.ajax({
                        type: "post",
                        url: "https://string-db.org/api/tsv/network",
                        data: {
                            identifiers: networkKey,
                            species: taxonID,
                            caller_identity: "xiview"
                        },
                    })
                        // eslint-disable-next-line no-unused-vars
                        .done(function (retrievedNetwork, textStatus, xhr) {
                            stringNetworkScoreCache[taxonID] = idBySpecies;
                            idBySpecies[networkKey] = STRINGUtils.lzw_encode(retrievedNetwork);
                            try {
                                setLocalStorage(stringNetworkScoreCache, "StringNetworkScores");
                            } catch (err) {
                                alert("Local Storage Full. Cannot cache returned STRING network.");
                            }
                            resolve({idMap: idMap, networkTsv: retrievedNetwork});
                        })
                        // eslint-disable-next-line no-unused-vars
                        .fail(function (xhr) {
                            reject("Error returned from STRING network interaction service.");
                        });
                });
                return promiseObj;
            } else {
                console.log("Using cached network");
                return Promise.resolve({idMap: idMap, networkTsv: STRINGUtils.lzw_decode(cachedNetwork)});
            }
        }
        return Promise.resolve({idMap: idMap, networkTsv: ""});    // empty network for 1 protein
    },

    // from https://gist.github.com/revolunet/843889
    lzw_encode: function (s) {
        if (!s) return s;
        const dict = new Map(); // Use a Map!
        const data = (s + "").split("");
        const out = [];
        let currChar;
        let phrase = data[0];
        let code = 256;
        for (let i = 1; i < data.length; i++) {
            currChar = data[i];
            if (dict.has(phrase + currChar)) {
                phrase += currChar;
            } else {
                out.push(phrase.length > 1 ? dict.get(phrase) : phrase.codePointAt(0));
                dict.set(phrase + currChar, code);
                code++;
                if (code === 0xd800) {
                    code = 0xe000;
                }
                phrase = currChar;
            }
        }
        out.push(phrase.length > 1 ? dict.get(phrase) : phrase.codePointAt(0));
        for (let i = 0; i < out.length; i++) {
            out[i] = String.fromCodePoint(out[i]);
        }
        //console.log ("LZW MAP SIZE", dict.size, out.slice (-50), out.length, out.join("").length);
        return out.join("");
    },

    /**
     * LZW decompression algorithm for string data.
     * Decompresses LZW-encoded strings from localStorage. Handles unicode correctly with
     * Array.from (splits by codepoint) and codePointAt/fromCodePoint. Skips surrogate pair range.
     * @param {string} s - Compressed string
     * @returns {string} Decompressed original string
     */
    lzw_decode: function (s) {
        const dict = new Map(); // Use a Map!
        const data = Array.from(s + "");  // conveniently splits by codepoint rather than 16-bit chars
        //var data = (s + "").split("");
        let currChar = data[0];
        let oldPhrase = currChar;
        const out = [currChar];
        let code = 256;
        let phrase;
        for (let i = 1; i < data.length; i++) {
            const currCode = data[i].codePointAt(0);
            if (currCode < 256) {
                phrase = data[i];
            } else {
                phrase = dict.has(currCode) ? dict.get(currCode) : (oldPhrase + currChar);
            }
            out.push(phrase);
            const cp = phrase.codePointAt(0);
            currChar = String.fromCodePoint(cp); //phrase.charAt(0);
            dict.set(code, oldPhrase + currChar);
            code++;
            if (code === 0xd800) {
                code = 0xe000;
            }
            oldPhrase = phrase;
        }
        return out.join("");
    },

    /**
     * Main entry point for loading STRING data from CLMS backbone-models.
     * Filters proteins to PPI set (non-decoy inter-protein links), further filters to non-hidden if needed
     * to stay under stringAPIMaxProteins limit, delegates to loadStringData with protein IDs.
     * @param {SearchResultsModel} clmsModel - CLMS backbone-models with proteins
     * @param {string} taxonID - NCBI Taxon ID
     * @param {Function} callback - Callback(csv, errorReason) called with CSV string or error
     * @returns {undefined}
     */
    loadStringDataFromModel: function (clmsModel, taxonID, callback) {
        let viableProteinIDs = _.pluck(STRINGUtils.filterProteinsToPPISet(clmsModel), "id");
        console.log("vids", viableProteinIDs.length);

        if (viableProteinIDs.length >= STRINGUtils.stringAPIMaxProteins) {
            const proteins = clmsModel.getProteinsMap();
            viableProteinIDs = viableProteinIDs.filter(function (pid) {
                return !proteins.get(pid).hidden;
            });
            console.log("vids2", viableProteinIDs.length);
        }

        STRINGUtils.loadStringData(viableProteinIDs, taxonID, callback);
    },

    /**
     * Loads STRING data via Promise chain: resolve IDs → query network → translate to CSV.
     * Chains getStringIdentifiers and queryStringInteractions Promises, translates TSV to CSV,
     * calls callback(csv) on success or callback(null, errorReason) on failure.
     * Handles empty/null network as error ("No meaningful STRING interactions found").
     * @param {Array<string>} pids - Array of UniProt protein IDs
     * @param {string} taxonID - NCBI Taxon ID
     * @param {Function} callback - Callback(csv, errorReason) called with CSV string or error
     * @returns {undefined}
     */
    loadStringData: function (pids, taxonID, callback) {
        function chainError(err) {
            return Promise.reject(err);
        }

        STRINGUtils.getStringIdentifiers(pids, taxonID)
            .then(function (identifiersBySpecies) {
                return STRINGUtils.queryStringInteractions(identifiersBySpecies, taxonID);
            }, chainError)
            .then(function (networkAndIDObj) {
                const csv = networkAndIDObj && networkAndIDObj.networkTsv ? STRINGUtils.translateToCSV(networkAndIDObj.idMap, networkAndIDObj.networkTsv) : null;
                if (!csv || csv.length === 0) {
                    return chainError("No meaningful STRING interactions found for protein set.");
                }
                console.log("CSV", csv);
                callback(csv);
            }, chainError)
            .catch(function (errorReason) {
                callback(null, errorReason);
            });
    },

    /**
     * Calculates total size of STRING localStorage cache (IDs + network scores).
     * Sums lengths of "StringIds" and "StringNetworkScores" localStorage entries.
     * @returns {number} Total cache size in characters (0 if localStorage unavailable)
     */
    getCacheSize: function () {
        if (localStorage) {
            return ["StringIds", "StringNetworkScores"].reduce(function (a, b) {
                return a + (localStorage[b] ? localStorage[b].length : 0);
            }, 0);
        }
        return 0;
    },

    /**
     * Purges all STRING localStorage cache (IDs + network scores).
     * Deletes "StringIds" and "StringNetworkScores" from localStorage.
     * Called by "Purge cache" button when localStorage reports full.
     * @returns {undefined}
     */
    purgeCache: function () {
        if (localStorage) {
            delete localStorage.StringIds;
            delete localStorage.StringNetworkScores;
        }
    }
};

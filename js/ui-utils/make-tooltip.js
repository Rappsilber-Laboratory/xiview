/**
 * @fileoverview Tooltip content generation utilities for xiVIEW.
 * Provides two main exports: makeTooltipContents (formats data into tooltip body arrays) and makeTooltipTitle (generates tooltip titles).
 * Supports multiple data types: crosslinks, proteins, residues, features, GO terms, matches, and complexes.
 * Outputs are arrays of [label, value] pairs suitable for tooltip rendering, with optional table formatting.
 */
import * as d3 from "d3";
import * as _ from "underscore";
import {amino1to3Map, getDirectionalResidueType, getResidueType, highestScore} from "../modelUtils";

/**
 * Tooltip content formatters for various xiVIEW data types.
 * Each method returns array of [label, value] pairs or table-like 2D arrays with optional tableHasHeaders flag.
 * Includes formatting dictionaries for units and unknown values (e.g., distance in Angstroms).
 * @namespace
 * @property {number} maxRows - Maximum rows to display in multi-row tooltips (25)
 */
export const makeTooltipContents = {
    maxRows: 25,

    /**
     * Formats single-letter amino acid code to display format with 3-letter code.
     * @param {string} singleLetterCode - Single letter amino acid code (e.g., "K")
     * @returns {string} Formatted string "K (Lys)"
     */
    residueString: function (singleLetterCode) {
        return singleLetterCode + " (" + amino1to3Map[singleLetterCode] + ")";
    },

    /**
     * Format configuration for special fields.
     * @property {Object} formats - D3 format functions by key (distance: 2 decimal places)
     * @property {Object} units - Unit suffixes by key (distance: Angstroms symbol)
     * @property {Object} unknownText - Text to display for undefined values by key
     */
    formatDictionary: {
        formats: {distance: d3.format(".2f")},
        units: {distance: " Å"},
        unknownText: {distance: "Unknown"}
    },

    /**
     * Formats value with appropriate format, unit, and unknown text based on key.
     * Uses formatDictionary to look up formatting rules. Falls back to raw value if no rules defined.
     * @param {string} key - Field name (e.g., "distance")
     * @param {*} value - Value to format
     * @returns {string} Formatted string with unit, or unknown text if value undefined
     */
    niceFormat: function (key, value) {
        const fd = makeTooltipContents.formatDictionary;
        const noFormat = function (v) {
            return v;
        };

        const format = fd.formats[key] || noFormat;
        const unit = fd.units[key] || "";
        const unknown = fd.unknownText[key] || "";

        return value !== undefined ? (format(value) + (unit || "")) : unknown;
    },

    /**
     * Generates tooltip content array for a single crosslink.
     * Returns [label, value] pairs: From/To proteins and residues, match count, highest score, plus metadata fields.
     * Handles linear links (no "to" protein) and monolinks appropriately.
     * @param {Object} xlink - Crosslink object
     * @param {Object} [extras] - Additional key-value pairs to include in tooltip
     * @returns {Array<Array>} Array of [label, value] pairs
     */
    link: function (xlink, extras) {
        const linear = xlink.isLinearLink();
        const mono = xlink.isMonoLink();
        const info = [
            ["From", xlink.fromProtein.name, xlink.fromResidue, makeTooltipContents.residueString(getDirectionalResidueType(xlink, false))],
            linear ? ["To", "Linear", "---", "---"] : mono ? ["To", "Monolink", "---", "---"]
                : ["To", xlink.toProtein.name, xlink.toResidue, makeTooltipContents.residueString(getDirectionalResidueType(xlink, true))],
            ["Matches", xlink.filteredMatches_pp.length],
            ["Highest Score", highestScore(xlink)]
        ];

        const extraEntries = _.pairs(extras);    // turn {a:1, b:2} into [["a",1],["b",2]]
        info.push.apply(info, extraEntries);

        d3.entries(xlink.getMeta()).forEach(function (entry) {
            const val = entry.value;
            const key = entry.key.toLocaleLowerCase();
            if (val !== undefined && !_.isObject(val)) {
                info.push([key, makeTooltipContents.niceFormat(key, val)]);
            }
        });
        return info;
    },

    /**
     * Generates tooltip content array for a protein.
     * Returns [label, value] pairs: ID, Accession, Size, Description, Keywords (if UniProt data available), plus metadata.
     * @param {Object} protein - Protein object
     * @returns {Array<Array>} Array of [label, value] pairs
     */
    protein: function (protein) {
        const contents = [
            ["ID", protein.id],
            ["Accession", protein.accession],
            ["Size", protein.size],
            ["Desc.", protein.description]
        ];

        if (protein.uniprot) {
            contents.push(["Keywords", protein.uniprot.keywords]);
        }

        d3.entries(protein.getMeta()).forEach(function (entry) {
            const val = entry.value;
            const key = entry.key.toLocaleLowerCase();
            if (val !== undefined && !_.isObject(val)) {
                contents.push([key, makeTooltipContents.niceFormat(key, val)]);
            }
        });

        return contents;
    },

    /**
     * Generates tooltip table for multiple crosslinks at a single residue.
     * Returns 2D array with headers: Protein, Pos, Residue, Matches (plus extras).
     * Sorted by match count (descending), then protein name, then position.
     * Limited to maxRows (25) with "+ N More" footer if truncated.
     * @param {Array<Object>} xlinks - Array of crosslink objects
     * @param {string} interactorId - ID of protein containing the residue
     * @param {number} residueIndex - Residue position index
     * @param {Object} [extras] - Additional columns to include (key: column name, value: array of values)
     * @returns {Array<Array>} 2D table array with tableHasHeaders flag set to true
     */
    multilinks: function (xlinks, interactorId, residueIndex, extras) {
        let ttinfo = xlinks.map(function (xlink) {
            const linear = xlink.isLinearLink();
            const startIsTo = !linear && (xlink.toProtein.id === interactorId && xlink.toResidue === residueIndex);
            const residueCode = linear ? "---" : makeTooltipContents.residueString(getDirectionalResidueType(xlink, !startIsTo));
            if (startIsTo) {
                return [xlink.fromProtein.name, xlink.fromResidue, residueCode, xlink.filteredMatches_pp.length];
            } else {
                return [linear ? "Linear" : xlink.toProtein.name, linear ? "---" : xlink.toResidue, residueCode, xlink.filteredMatches_pp.length];
            }
        });

        const extraEntries = d3.entries(extras);
        extraEntries.forEach(function (extraEntry) {
            const key = extraEntry.key.toLocaleLowerCase();

            extraEntry.value.forEach(function (val, i) {
                ttinfo[i].push(makeTooltipContents.niceFormat(key, val));
            });
        });

        const sortFields = [3, 0, 1]; // sort by matches, then protein name, then res index
        const sortDirs = [1, -1, -1];
        ttinfo.sort(function (a, b) {
            let diff = 0;
            for (let s = 0; s < sortFields.length && diff === 0; s++) {
                const field = sortFields[s];
                diff = (b[field] - a[field]) * sortDirs[s];
                if (isNaN(diff)) {
                    diff = b[field].localeCompare(a[field]) * sortDirs[s];
                }
            }
            return diff;
        });


        const headers = ["Protein", "Pos", "Residue", "Matches"];
        extraEntries.forEach(function (extraEntry) {
            headers.push(extraEntry.key);
        });

        ttinfo.unshift(headers);
        ttinfo.tableHasHeaders = true;
        const length = ttinfo.length;
        const limit = makeTooltipContents.maxRows;
        if (length > limit) {
            ttinfo = ttinfo.slice(0, limit);
            ttinfo.push(["+ " + (length - limit) + " More"]);
        }
        return ttinfo;
    },

    feature: function (feature) {
        const possFields = [
            ["description"],
            ["type"],
            ["category"],
            ["fstart", "start"],
            ["fend", "end"]
        ];
        const data = possFields
            .filter(function (field) {
                return feature[field[0]] != undefined;
            })
            .map(function (field) {
                return [field.length > 1 ? field[1] : field[0], feature[field[0]]];
            });
        return data;
    },

    linkList: function (linkList, extras) {
        const extraEntries = d3.entries(extras);
        let fromProtein, toProtein;

        let details = linkList.map(function (crosslink, i) {
            const from3LetterCode = makeTooltipContents.residueString(getDirectionalResidueType(crosslink, false));
            const to3LetterCode = makeTooltipContents.residueString(getDirectionalResidueType(crosslink, true));
            fromProtein = crosslink.fromProtein.name;
            toProtein = crosslink.toProtein.name;
            const row = [crosslink.fromResidue + " " + from3LetterCode, crosslink.toResidue + " " + to3LetterCode];
            extraEntries.forEach(function (entry) {
                const key = entry.key.toLocaleLowerCase();
                const val = entry.value[i];
                row.push(makeTooltipContents.niceFormat(key, val));
            });
            return row;
        });
        if (details.length) {
            const header = [fromProtein.replace("_", " "), toProtein.replace("_", " ")];
            extraEntries.forEach(function (entry) {
                header.push(entry.key);
            });
            details.unshift(header);
            details.tableHasHeaders = true;
        } else {
            details = null;
        }
        return details;
    },

    match: function (match) {
        return [
            ["Match ID", match.match.id],
        ];
    },

    goTerm: function (goTerm) {
        return [
            //["ID", goTerm.id],
            ["Name", goTerm.name],
            //["Namespace", goTerm.namespace],
            ["Definition", goTerm.def],
            // ["Synonym", goTerm.synomym],
            // ["is_a", Array.from(goTerm.is_a.values()).join(", ")],
            // ["intersection_of", Array.from(goTerm.intersection_of.values()).join(", ")],
            // ["relationship", Array.from(goTerm.relationship.values()).join(", ")],
            // ["proteins", goTerm.getProteins(false).size]
        ];
    },

    complex: function (protein) {
        const contents = [
            ["Complex", protein.id],
            //  ["Members", Array.from(goTerm.relationship.values()).join(", ")]
            // ["Accession", interactor.accession],
            // ["Size", interactor.size],
            // ["Desc.", interactor.description]
        ];

        // d3.entries(interactor.getMeta()).forEach(function(entry) {
        //     var val = entry.value;
        //     var key = entry.key.toLocaleLowerCase();
        //     if (val !== undefined && !_.isObject(val)) {
        //         contents.push ([key, makeTooltipContents.niceFormat (key, val)]);
        //     }
        // });
        //
        // if (interactor.go) {
        //     var goTermsMap = window.compositeModelInst.get("go");
        //     var goTermsText = "";
        //     for (var goId of interactor.go) {
        //         var goTerm = goTermsMap.get(goId);
        //         goTermsText += goTerm.name + "<br>";
        //     }
        //     contents.push(["GO", goTermsText]);
        // }
        return contents;
    },
};

/**
 * Tooltip title generators for various xiVIEW data types.
 * Each method returns a string title for the tooltip based on the data being displayed.
 * Handles singular/plural forms and formats protein/residue names appropriately.
 * @namespace
 */
export const makeTooltipTitle = {
    /**
     * Generates title for crosslink tooltip.
     * @param {number} linkCount - Number of links
     * @returns {string} "Linked Residue Pair" or "Linked Residue Pairs"
     */
    link: function (linkCount) {
        return "Linked Residue Pair" + (linkCount > 1 ? "s" : "");
    },
    protein: function (protein) {
        return protein.name.replace("_", " ");
    },
    residue: function (protein, residueIndex, residueExtraInfo) {
        return protein.name + ":" + residueIndex + "" + (residueExtraInfo ? residueExtraInfo : "") + " " +
            makeTooltipContents.residueString(getResidueType(protein, residueIndex));
    },
    feature: function () {
        return "Feature";
    },
    linkList: function (linkCount) {
        return "Linked Residue Pair" + (linkCount > 1 ? "s" : "");
    },
    complex: function (protein) {
        return protein.name.replace("_", " ");
    },
};

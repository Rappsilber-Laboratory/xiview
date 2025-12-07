//has to be loaded after utils.js
//only used by KeyViewBB.js
import {makeLegalDomID} from "../utils";
import d3 from "d3";

/**
 * Creates or updates collapsible sections containing data tables using D3.js data binding.
 * Each section has a header with triangle arrow indicator and a table with key-value rows.
 * Clicking the header toggles table visibility. Handles dynamic data updates through D3 join pattern.
 * Used by KeyViewBB to display categorical color legends and filter information.
 *
 * @param {d3.selection} domid - D3 selection of parent element to append sections to
 * @param {Object[]} data - Array of section data objects, each containing rows to display
 * @param {string} data[].id - Unique identifier for the section (used for table id and data key)
 * @param {Object[]} [data[].columnHeaders] - Optional column headers for this specific table
 * @param {string} idPrefix - Prefix for table element IDs (e.g., "keyTable-")
 * @param {string[]} columnHeaders - Default column headers (typically ["Key", "Value"])
 * @param {Function} headerFunc - Function to generate header text from section data: (d) => string
 * @param {Function} rowFilterFunc - Function to extract/filter rows from section data: (d) => [{key, value}, ...]
 * @param {Function} cellFunc - Function called for each cell to populate content: function(d) { d3.select(this).html(...) }
 * @param {number[]} [openSectionIndices] - Array of section indices to show initially (default: all open)
 * @param {Function} [clickFunc] - Optional callback when header clicked: (tableIsNowShown, d, i) => void
 * @returns {undefined}
 *
 * @example
 * // Create color legend sections
 * sectionTable(
 *   d3.select("#legend"),
 *   [{id: "confident", rows: [{key: "TT", value: "Target-Target"}]}],
 *   "color-",
 *   ["Type", "Description"],
 *   d => d.id.toUpperCase(),
 *   d => d.rows,
 *   function(d) { d3.select(this).text(d.value); },
 *   [0], // only first section open
 *   (shown, d) => console.log(`${d.id} ${shown ? "shown" : "hidden"}`)
 * );
 */
export const sectionTable = function (domid, data, idPrefix, columnHeaders, headerFunc, rowFilterFunc, cellFunc, openSectionIndices, clickFunc) {
    const self = this;
    const legalDom = makeLegalDomID;

    /**
     * Updates arrow indicator to reflect table visibility state.
     * Adds "tableShown" class when table is visible (rotates arrow via CSS).
     * @param {Object} d - Section data object
     * @returns {undefined}
     * @inner
     */
    const setArrow = function (d) {
        const assocTable = d3.select("#" + idPrefix + legalDom(d.id));
        d3.select(this).classed("tableShown", assocTable.style("display") !== "none");
    };
    const dataJoin = domid.selectAll("section").data(data, function (d) {
        return legalDom(d.id);
    });
    dataJoin.exit().remove();

    const newElems = dataJoin.enter().append("section").attr("class", "sectionTable");
    const newHeaders = newElems.append("h2")
        .on("click", function (d, i) {
            const assocTable = d3.select("#" + idPrefix + legalDom(d.id));
            const tableIsHidden = (assocTable.style("display") === "none");
            assocTable.style("display", tableIsHidden ? "table" : "none");
            if (clickFunc) {
                clickFunc(tableIsHidden, d, i);
            }
            setArrow.call(this, d);
        });
    newHeaders.append("svg")
        .append("polygon")
        .attr("points", "2,1 16,8 2,15");
    newHeaders.append("span");
    dataJoin.selectAll("h2 > span").text(headerFunc); // name may have changed for existing tables too

    const newTables = newElems.append("table")
        .html("<caption></caption><thead><tr><th></th><th></th></tr></thead><tbody></tbody>")
        .attr("id", function (d) {
            return idPrefix + legalDom(d.id);
        })
        .style("display", function (d, i) {
            return !openSectionIndices || openSectionIndices.indexOf(i) >= 0 ? "table" : "none";
        });
    newTables.selectAll("thead th").data(function (d) {
        return d.columnHeaders || columnHeaders;
    })
        .text(function (d) {
            return d;
        });
    const tables = dataJoin.selectAll("table");

    /**
     * Expands array of entries for table rows.
     * Currently a pass-through function - historically supported expandTheseKeys option
     * to expand nested arrays. Kept for potential future expansion needs.
     * @param {Object} d - Section data object
     * @param {Object[]} entries - Array of {key, value} objects for table rows
     * @returns {Object[]} Same array of entries (identity function)
     * @inner
     */
    const arrayExpandFunc = function (d, entries) {
        // const expandKeys = self.options.expandTheseKeys;
        return entries.map(function (entry) {
            return entry;
        });
    };

    const tBodies = tables.select("tbody"); // pushes table's 'd' (data)  down to the tbody child
    const rowJoin = tBodies.selectAll("tr")
        .data(function (d) {
            return arrayExpandFunc(d, rowFilterFunc(d));
        }, function (d) {
            return d.key;
        });
    rowJoin.exit().remove();
    rowJoin.enter().append("tr");

    const cells = rowJoin.selectAll("td")
        .data(function (d) {
            return [{
                key: d.key,
                value: d.key
            }, {
                key: d.key,
                value: d.value
            }];
        });
    cells
        .enter()
        .append("td")
        .classed("fixedSizeFont", function (d, i) {
            return self.options.fixedFontKeys && self.options.fixedFontKeys.has(d.key) && i;
        });
    rowJoin.selectAll("td").each(cellFunc); // existing rows in existing tables may have seen data change

    dataJoin.selectAll("h2").each(setArrow);
};

//has to be loaded after utils.js
//only used by KeyViewBB.js
import {makeLegalDomID} from "../utils";
import d3 from "d3";

export const sectionTable = function (domid, data, idPrefix, columnHeaders, headerFunc, rowFilterFunc, cellFunc, openSectionIndices, clickFunc) {
    const self = this;
    const legalDom = makeLegalDomID;
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

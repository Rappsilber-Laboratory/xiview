//has to be loaded after Utils.js
//only used by KeyViewBB.js
CLMSUI.utils.sectionTable = function (domid, data, idPrefix, columnHeaders, headerFunc, rowFilterFunc, cellFunc, openSectionIndices, clickFunc) {
    const self = this;
    const legalDom = CLMSUI.utils.makeLegalDomID;
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
            })
        //.on ("mouseover", function(d) {
        // eventually backbone shared highlighting code to go here?
        // except it's data specific, one table may show per protein, another links, another something else, so not doable here
        //})
    ;
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
        })
    ;
    newTables.selectAll("thead th").data(function (d) {
        return d.columnHeaders || columnHeaders
        })
        .text(function (d) {
            return d;
        })
    ;

    const tables = dataJoin.selectAll("table");

    // yet another cobble a table together function, but as a string
    var makeTable237 = function(arrOfObjs) {
        var t = "<table>";//<tr>";
        // var headers = d3.keys(arrOfObjs[0]);
        // headers.forEach(function(h) {
        //     t += "<TH>" + h + "</TH>";
        // });
        // t += "</TR>";
        // arrOfObjs.forEach(function(obj) {
        //     t += "<TR>";
        //     d3.values(obj).forEach(function(h) {
        //         t += "<TD>" + h + "</TD>";
        //     });
        //     t += "</TR>";
        // });
        t += "</TABLE>";
        return t;
    };

    // yet another cobble a table together function, but as a string
    /*const makeTable237 = function (arrOfObjs) {
        if (arrOfObjs) {
            let t = "<table>";//<tr>";
            // const headers = d3.keys(arrOfObjs[0]);
            // headers.forEach(function (h) {
            //     t += "<TH>" + h + "</TH>";
            // });
            // t += "</TR>";
            const goTermsMap = CLMSUI.compositeModelInst.get("go");
            arrOfObjs.forEach(function (obj) {
                // if (obj.key !== "features") { //todo -hack for UniprotKB object
                //     t += "<TR>";
                //     d3.values(obj).forEach(function (h) {
                //         if (typeof (h) == "string") {
                //             t += "<TD>" + h + "</TD>";
                //         } else {
                //             t += "<TD>";
                //             for (let i of h) {
                //                 if (obj.key !== "go") {
                //                     t += i + "</BR>";
                //                 } else {
                //                     t += i + " : " + goTermsMap.get(i).name + "</BR>";
                //                 }
                //             }
                //             t += "</TD>";
                //         }
                //     });
                //     t += "</TR>";
                // }
                //
                //not this
                // if (obj.key == "go") {
                //     t += "<TR>";
                //     d3.values(obj).forEach(function (h) {
                //         const isArray = typeof (h);
                //         t += "<TD>" + isArray + h + "</TD>";
                //     });
                //     t += "</TR>";
                //     //  return makeTable237(obj.value);
                //     // var goTermsMap = CLMSUI.compositeModelInst.get("go");
                //     // var goTermsText = "";
                //     // // for (var goId of interactor.uniprot.go) {
                //     // //     var goTerm = goTermsMap.get(goId);
                //     // //     goTermsText += goTerm.name + "<br>";
                //     // // }
                //     // // contents.push(["GO", goTermsText]);
                //     // d3.values(obj).forEach(function (h) {
                //     //     goTermsText += h + ":" + goTermsMap.get(h) + "; ";
                //     // });
                //     // t += "<TR>";
                //     // d3.values(obj).forEach(function (h) {
                //     //     t += "<TD>" + goTermsText + "</TD>";
                //     // });
                //     // t += "</TR>";
                // }



            });
            t += "</TABLE>";
            return t;
        } else {
            return "";
        }
    };*/

    const arrayExpandFunc = function (d, entries) {
        const expandKeys = self.options.expandTheseKeys;
        return entries.map(function (entry) {
            let subTableValues = d[entry.key];
            //if (typeof(subTableValues) === "object") { // convert object into array of objects that'll have Key/Value as headings
            if ($.isPlainObject(subTableValues)) { // convert object into array of objects that'll have Key/Value as headings
                subTableValues = d3.entries(subTableValues);
            }
            return (expandKeys && expandKeys.has(entry.key)) ? {
                key: entry.key,
                value: makeTable237(subTableValues)
            } : entry;
        });
    };

    const tBodies = tables.select("tbody"); // pushes table's 'd' (data)  down to the tbody child
    const rowJoin = tBodies.selectAll("tr")
        .data(function (d) {
            return arrayExpandFunc(d, rowFilterFunc(d));
        }, function (d) {
            return d.key;
        })
    ;
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
        })
    ;
    cells
        .enter()
        .append("td")
        .classed("fixedSizeFont", function (d, i) {
            return self.options.fixedFontKeys && self.options.fixedFontKeys.has(d.key) && i;
        })
    ;
    rowJoin.selectAll("td").each(cellFunc); // existing rows in existing tables may have seen data change

    dataJoin.selectAll("h2").each(setArrow);
};
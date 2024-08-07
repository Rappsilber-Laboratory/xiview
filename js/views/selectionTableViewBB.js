import "../../css/selectionViewBB.css";
import * as _ from "underscore";
import Backbone from "backbone";
import d3 from "d3";

import {checkBoxView} from "../ui-utils/checkbox-view";
import {fullPosConcat, pepPosConcat, proteinConcat} from "../utils";

export const SelectionTableViewBB = Backbone.View.extend({
    events: {
        "mouseenter tr.matchRow": "highlight",
        "mouseleave table": "highlight",
        "mouseenter table": "focusTable",
        "keydown table": "selectByKey",
    },

    initialize: function (options) {
        this.options = options || {};

        const d3el = d3.select(this.el);

        const holdingDiv = d3el.append("DIV").attr("class", "selectView verticalFlexContainer");
        holdingDiv.html("<div class='controlBar'><span class='pager'></span><span class='crosslinkTotal'></span><span class='rightSpan'></span><span class='rightSpan'></span></DIV><DIV class='scrollHolder'><TABLE><THEAD><TR></TR></THEAD></TABLE></DIV>");

        // redraw table on filter change if any of 1) filtering done, 2) match validation state updated, or 3) crosslinks selected (matches may have changed)
        this.listenTo(this.model, "filteringDone matchValidationStateUpdated selectionMatchesLinksChanged", function () {
            this.render();
            if (window.location.pathname.indexOf("spectra.php") === -1) { //nice //TODO - wtf, fix
                if (this.model.get("selection").length > 0) {
                    if (!window.oldSplitterProportions || window.oldSplitterProportions[1] === 0) { //TODO
                        window.oldSplitterProportions = [80, 20];
                    }
                    d3.select(".gutter").style("display", null);
                    window.split.setSizes(window.oldSplitterProportions);
                } else {
                    d3.select(".gutter").style("display", "none");
                    window.split.setSizes([100, 0]);
                }
            }
        });
        this.listenTo(this.model, "change:linkColourAssignment currentColourModelChanged", this.updateSwatchesOnly);
        // redraw datable on protein metadata change (possible protein name change)
        this.listenTo(window.vent, "proteinMetadataUpdated", this.render);

        // emphasise selected match table row (or not if nothing selected)
        this.listenTo(this.model, "change:lastSelectedMatch", function (model) {
            const selMatch = model.get("lastSelectedMatch");
            this.clearCurrentRowHighlight();
            if (selMatch && selMatch.match) {
                d3.select(this.el).select("tr#match" + selMatch.match.id).classed("spectrumShown2", true);
            }
        });

        // emphasise highlighted (brushed) match table rows
        this.listenTo(this.model, "change:match_highlights", function (model, highlightedMatches) {
            this.setTableHighlights(highlightedMatches.values());
        });


        const tableDataPropOrder = [
            "id", "ambiguity", "protein1", /*"pos1",*/ "pepPos1", "pepSeq1raw", "linkPos1",
            "protein2", /*"pos2",*/ "pepPos2", "pepSeq2raw", "linkPos2", "score",
            "autovalidated", "validated", "homom", "group", "searchId", "runName", "scanNumber",
            "precursorCharge", "expMZ", "expMass", "calcMZ", "calcMass", "massError",
            "precursorIntensity", "elutionStart", "elutionEnd", "expMissedCleavages",
            "searchMissedCleavages", "missingPeaks", "modificationCount",
        ];

        this.headerLabels = {
            id: "PSM ID",
            ambiguity: "Ambiguity",
            protein1: "Protein 1",
            pos1: "Pos",
            pepPos1: "Pep Pos",
            pepSeq1raw: "Pep 1 Sequence",
            linkPos1: "Link Pos",
            protein2: "Protein 2",
            pos2: "Pos",
            pepPos2: "Pep Pos",
            pepSeq2raw: "Pep 2 Sequence",
            linkPos2: "Link Pos",
            score: "Score",
            autovalidated: "Auto",
            validated: "Manual",
            homom: "Homom",
            group: "Group",
            searchId: "Search Id",
            runName: "Run Name",
            scanNumber: "Scan Number",
            precursorCharge: "Charge (Z)",
            expMZ: "Exp M/Z",
            expMass: "Exp Mass",
            calcMZ: "Calc M/Z",
            calcMass: "Calc Mass",
            massError: "Mass Error (ppm)",
            missingPeaks: "Missing Peaks",
            precursorIntensity: "PC Intensity",
            elutionStart: "Elut. Start",
            elutionEnd: "Elut. End",
            expMissedCleavages: "Experimental Max. Missed Cleavages",
            searchMissedCleavages: "Search Max. Missed Cleavages",
            modificationCount: "Max. Mod. Count"
        };

        this.numberColumns = d3.set(["ambiguity", "score", "linkPos1", "linkPos2", "pepPos1", "pepPos2", "precursorCharge", "expMZ", "expMass", "calcMZ", "calcMass", "massError", "missingPeaks", "precursorIntensity", "expMissedCleavages", "searchMissedCleavages", "elutionStart", "elutionEnd", "modificationCount"]);
        this.colSectionStarts = d3.set(["protein1", "protein2", "score"]); //i added protein1 also - cc
        this.monospacedColumns = d3.set(["pepSeq1raw", "pepSeq2raw"]);
        this.maxWidthColumns = d3.set(["protein1", "protein2"]);
        this.minWidthColumns = d3.set(["massError", "searchMissedCleavages"]);
        this.emphasiseColumns = d3.set(["pos1", "pos2"]);
        this.changeableColumns = d3.set(["ambiguity", "autovalidated", "validated", "homom"]);   // values that can change in situ i.e. aren't fixed

        const self = this;

        // entries commented out until a replacement is found for xlv
        const headerFilterFuncs = {
            ambiguity: function () {
                return false;
            },
            autovalidated: function () {
                return window.compositeModelInst.get("clmsModel").get("autoValidatedPresent");
            },
            "validated": function() {
                return !window.compositeModelInst.get("serverFlavour") === "XI2";
            }, //CLMS.model.manualValidatedFound; },
            homom: function () {
                return false;
            },
            group: function () {
                return window.compositeModelInst.get("serverFlavour") !== "PRIDE";
            },
            "precursorIntensity": function() {
                return window.compositeModelInst.get("serverFlavour") === "XI2";
            },
            "elutionStart": function() {
                return window.compositeModelInst.get("serverFlavour") === "XI2";
            },
            "elutionEnd": function() {
                return false;
            },
            "missingPeaks": function() {
                return window.compositeModelInst.get("serverFlavour") === "XI2";
            },
            "modificationCount": function() {
                return window.compositeModelInst.get("serverFlavour") === "XI2";
            },
            "expMissedCleavages": function() {
                return false;
            },
            "searchMissedCleavages": function() {
                return false;
            }
        };

        this.filteredProps = tableDataPropOrder.filter(
            function (prop) {
                const f = headerFilterFuncs[prop];
                return f ? f() : true;
            }
        );

        const integerNumberFormat = d3.format(".0f");
        const twoZeroPadder = d3.format(".2f");
        const massZeroPadder = d3.format(".6f");
        const scientific = d3.format(".4e");
        const findIndexofNthUpperCaseLetter = function (str, n) { // n is 1-indexed here
            str = str || "";
            let i = -1;
            while (n > 0 && i < str.length) {
                i++;
                const c = str[i];
                if (c >= "A" && c <= "Z") n--;
            }
            return i === str.length ? undefined : i;
        };
        const emphasiseLinkedResidue = function (str, linkPos) {
            const i = findIndexofNthUpperCaseLetter(str, linkPos);
            return i !== undefined && i !== -1 ? str.substr(0, i) + "<span class='linkedResidue'>" + str[i] + "</span>" + str.substr(i + 1) : str;
            //return i !== undefined ? str.substr(0,i+1) + "&#829;" + str.substr(i+1) : str;
        };
        this.cellFuncs = {
            id: function (d) {
                return d.psmId;
            },
            ambiguity: function (d) {
                return d.matchedPeptides[0].prt.length *
                    ((d.matchedPeptides[1].prt.length !== 0) ? d.matchedPeptides[1].prt.length : 1);
            },
            protein1: function (d) {
                return proteinConcat(d, 0, self.model.get("clmsModel"));
            },
            protein2: function (d) {
                return proteinConcat(d, 1, self.model.get("clmsModel"));
            },
            runName: function (d) {
                return d.runName();
            },
            group: function (d) {
                return d.group();
            },
            homom: function (d) {
                return d.confirmedHomomultimer === undefined ? "?" : d.confirmedHomomultimer;
            },
            searchId: function (d) {
                return d.searchId;
            },
            pos1: function (d) {
                return fullPosConcat(d, 0);
            },
            pos2: function (d) {
                return fullPosConcat(d, 1);
            },
            pepPos1: function (d) {
                return pepPosConcat(d, 0);
            },
            pepPos2: function (d) {
                return pepPosConcat(d, 1);
            },
            pepSeq1raw: function (d) {
                const seqMods = d.pepSeq1_mods;
                return emphasiseLinkedResidue(seqMods, d.linkPos1);
            },
            pepSeq2raw: function (d) {
                const dmp1 = d.pepSeq2_mods;
                return dmp1 ? emphasiseLinkedResidue(dmp1 ? dmp1 : "", d.linkPos2) : "";
            },
            linkPos1: function (d) {
                return d.linkPos1;
            },
            linkPos2: function (d) {
                return d.linkPos2;
            },
            score: function (d) {
                return "" + d.score();//twoZeroPadder(d.score());
            },
            expMZ: function (d) {
                return massZeroPadder(d.expMZ());
            },
            expMass: function (d) {
                return massZeroPadder(d.expMass());
            },
            calcMZ: function (d) {
                return massZeroPadder(d.calcMZ());
            },
            calcMass: function (d) {
                return massZeroPadder(d.calcMass());
            },
            massError: function (d) {
                return massZeroPadder(d.massError());
            },
            missingPeaks: function (d) {
                return integerNumberFormat(d.missingPeaks());
            },
            precursorIntensity: function (d) {
                return scientific(d.precursor_intensity);
            },
            elutionStart: function (d) {
                return massZeroPadder(d.elution_time_start);
            },
            elutionEnd: function (d) {
                return massZeroPadder(d.elution_time_end);
            },
            expMissedCleavages: function (d) {
                return d.experimentalMissedCleavageCount();
            },
            searchMissedCleavages: function (d) {
                return d.searchMissedCleavageCount();
            },
            modificationCount: function (d) {
                return d.modificationCount();
            },
            scanNumber: function (d) {
                return d.scanNumber;
            }
        };

        this.page = 1;
        this.pageSize = this.options.pageSize || 20;
        const pager = d3el.select(".pager");
        if (!self.options.mainModel) {

            pager.append("input")
                .attr("class", "selectionTablePageInput withSideMargins")
                .attr("type", "number")
                .attr("min", "1")
                .attr("max", "999")
                .style("display", "inline-block")
                .on("input", function () {
                    // this check stops deleting final character resetting page to 1 all the time
                    if (d3.event.inputType !== "deleteContentBackward" && this.value) { // "deleteContentBackward" is chrome specific
                        self.setPage(this.value);
                    }
                });
            let timer, interval;
            pager.append("span").selectAll(".btn")
                .data([{text: "<", incr: -1, tooltip: "Higher scoring crosslinks"}, {
                    text: ">",
                    incr: 1,
                    tooltip: "Lower scoring crosslinks"
                }])
                .enter()
                .append("button")
                .attr("class", "btn btn-1 btn-1a btnIncr")
                .attr("title", function (d) {
                    return d.tooltip;
                })
                .text(function (d) {
                    return d.text;
                })
                .on("mousedown", function (d) {
                    self.pageIncrement(d.incr);
                    timer = setTimeout(function () {
                        interval = setInterval(function () {
                            self.pageIncrement(d.incr);
                        }, 50);
                    }, 500);
                })
                .on("mouseup", function () {
                    clearTimeout(timer);
                    clearInterval(interval);
                })
                .on("mouseleave", function () {
                    clearTimeout(timer);
                    clearInterval(interval);
                });
        } else {
            pager.append("span").text("Alternative Explanations");
        }

        d3el.select(".controlBar").insert("span", ":first-child").text(this.identifier);

        d3el.select("table").attr("tabindex", 0); // so table can capture key events

        // Internal view state. Can use backbone events to listen to and trigger changes within view.
        this.viewStateModel = new (Backbone.Model.extend({
            initialize: function () {
                this.listenTo(this, "change:topOnly", function () {
                    self.render.call(self);
                });
                this.listenTo(this, "change:hidden", function (model, val) {
                    d3.select(self.el).selectAll("table").style("display", val ? "none" : null);
                    if (self.options.mainModel) {
                        window.vent.trigger("resizeSpectrumSubViews", true);
                    }
                });
            },
        }))({
            topOnly: false,
            topCount: 2,
            hidden: false
        });

        new checkBoxView({
            el: d3el.select(".rightSpan:last-child").node(),
            model: this.viewStateModel,
            myOptions: {
                toggleAttribute: "topOnly",
                id: self.el.id + "TopOnly",
                label: "Only Show " + this.viewStateModel.get("topCount") + " Top-Scoring Matches per Link"
            },
        });

        d3el.select(".rightSpan").classed("selectionTableHideToggle", true);
        new checkBoxView({
            el: d3el.select(".rightSpan").node(),
            model: this.viewStateModel,
            myOptions: {
                toggleAttribute: "hidden",
                id: self.el.id + "HideToggle",
                label: "Hide",
            }
        });

    },

    render: function () {
        this.updateTable({
            topMatchesOnly: this.viewStateModel.get("topOnly"),
            topCount: this.viewStateModel.get("topCount")
        });
    },

    getMatches: function (xlink) {
        const selectedMatches = this.model.getMarkedMatches("selection");
        return _.pluck(xlink.filteredMatches_pp, "match")
            .filter(function (m) {
                return selectedMatches.has(m.id);
            }); // selection now done on a per-match basis
    },

    updateTable: function (options) {
        options = options || {};

        this.matchCountIndices = this.model.getMarkedCrossLinks("selection")
            // map to reduce filtered matches to selected matches only
            .map(function (xlink) {
                const selectedMatches = this.getMatches(xlink);
                return {
                    id: xlink.id,
                    link: xlink,
                    matches: selectedMatches
                };
            }, this)
            // Then get rid of links with no selected and filtered matches
            .filter(function (selLinkMatchData) {
                return selLinkMatchData.matches.length;
            })
            // Then sort links by top remaining match score for each link
            .sort(function (a, b) {
                return b.matches[0].score() - a.matches[0].score();
            });

        // filter to top match per link if requested
        if (options.topMatchesOnly) {
            this.matchCountIndices.forEach(function (mci) {
                mci.matches = mci.matches.slice(0, options.topCount || 1);
            });
        }

        let count = 0;
        // add count metadata to matchCountIndices
        this.matchCountIndices.forEach(function (selLinkMatchData) {
            selLinkMatchData.runningTotalStart = count;
            count += selLinkMatchData.matches.length;
            selLinkMatchData.runningTotalEnd = count;
        });

        const selectedXLinkCount = this.matchCountIndices.length;

        const self = this;

        // draw if selected crosslink count > 0 or is 'freshly' zero
        if (selectedXLinkCount > 0 || this.lastCount > 0) {
            this.lastCount = selectedXLinkCount;
            //console.log("rendering table view of selected crosslinks", this, this.model);

            const headerRow = d3.select(this.el).select("THEAD TR");
            const headerJoin = headerRow.selectAll("TH").data(this.filteredProps, function (d) {
                return d;
            });

            headerJoin.exit().remove();
            // See https://github.com/mbostock/d3/issues/2722 as I kick off about case sensitivity
            headerJoin.enter().append("th")
                .html(function (d) {
                    return self.headerLabels[d];
                })
                .classed("colSectionStart", function (d) {
                    return self.colSectionStarts.has(d);
                })
                .classed("minWidth", function (d) {
                    return self.minWidthColumns.has(d);
                });
            this.setPage(this.page);
        }

        d3.select(this.el).select("table").style("display", this.matchCountIndices.length && !this.viewStateModel.get("hidden") ? null : "none");
    },

    pageIncrement: function (incr) {
        const newPage = this.page + incr;
        if (newPage >= 1 && newPage <= this.getPageCount()) {
            this.setPage(newPage);
        }
        return this;
    },

    setPage: function (pg) {
        // limit page number and set text elements
        const mci = this.matchCountIndices;
        const totalSelectedFilteredMatches = mci.length ? _.last(mci).runningTotalEnd : 0;

        const pageCount = this.getPageCount();
        pg = Math.max(Math.min(pg, pageCount), 1);
        this.page = pg;
        d3.select(this.el).select(".pager>input").property("value", pg);
        //d3.select("#page").text(pg);

        const limit = totalSelectedFilteredMatches; // selectedXLinkCount;
        const lower = (limit === 0) ? 0 : ((pg - 1) * this.pageSize) + 1;
        const upper = Math.min(pg * this.pageSize, limit);

        const lowerPageCount = (this.page - 1) * this.pageSize;
        const upperPageCount = lowerPageCount + this.pageSize;
        const bisect = d3.bisector(function (d) {
            return d.runningTotalEnd;
        });
        const lowerLink = bisect.right(mci, lowerPageCount);
        let upperLink = bisect.left(mci, upperPageCount);
        upperLink = Math.min(upperLink, mci.length - 1);
        const matchBounds = {};
        if (mci.length) {
            // set bounds for start and end matches
            matchBounds.startMatch = lowerPageCount - mci[lowerLink].runningTotalStart;
            matchBounds.endMatch = upperPageCount - mci[upperLink].runningTotalStart;
        }
        //console.log ("bisect", mci, lowerLink, upperLink, matchBounds);

        const panelHeading = d3.select(this.el).select(".crosslinkTotal");
        const commaFormat = d3.format(",");
        const selectedXLinkCount = this.matchCountIndices.length;
        const repeats = this.countRepeatedAmbiguousMatches(this.matchCountIndices);
        const TSFUniqueMatches = totalSelectedFilteredMatches - repeats;

        if (selectedXLinkCount === 0) {
            panelHeading.html("Currently empty<sup>?</sup>").attr("title", "Select Crosslinks / Matches in other views to populate this table");
        } else {
            panelHeading.text(
                commaFormat(lower) + " - " + commaFormat(upper) + " of " +
                (repeats > 0 ? commaFormat(totalSelectedFilteredMatches) + " combinations of " : "") +
                commaFormat(TSFUniqueMatches) + " Selected Match" + ((TSFUniqueMatches !== 1) ? "es" : "") +
                " shared across " +
                commaFormat(selectedXLinkCount) + " Crosslink" + ((selectedXLinkCount !== 1) ? "s" : "")
            );
            panelHeading.attr("title", "Combinations? Some matches may be ambiguous and associated with multiple Crosslinks");
        }

        const tablePage = this.matchCountIndices.slice(lowerLink, upperLink + 1);
        this.addRows(tablePage, this.filteredProps, matchBounds);
    },

    countRepeatedAmbiguousMatches: function (arrayOfMatchLists) {
        const ambigSet = d3.set();
        let repeatedAmbigCount = 0;

        arrayOfMatchLists.forEach(function (mci) {
            mci.matches.forEach(function (match) {
                const crosslinks = match.crosslinks;
                if (crosslinks.length > 1) {
                    const mid = match.id;
                    if (ambigSet.has(mid)) {
                        repeatedAmbigCount++;
                    } else {
                        ambigSet.add(mid);
                    }
                }
            });
        });

        return repeatedAmbigCount;
    },

    getPageCount: function () {
        const mci = this.matchCountIndices;
        const totalSelectedFilteredMatches = mci.length ? _.last(mci).runningTotalEnd : 0;
        return Math.floor(totalSelectedFilteredMatches / this.pageSize) + 1;
    },

    makeColourSwatch: function (elem, colourScheme) {
        elem.attr("class", "colourSwatchSquare")
            .style("background", function (d) {
                return colourScheme ? colourScheme.getColour(d.link) : "transparent";
            });
    },

    // code that maintains the rows in the table
    addRows: function (selectedLinkArray, filteredProps, firstLastLinkMatchBounds) {

        filteredProps = filteredProps || this.filteredProps;
        const self = this;
        //var proteinMap = this.model.get("clmsModel").get("participants");
        const identityFunc = function (d) {
            return d.id;
        };

        const colspan = d3.select(this.el).select("THEAD").selectAll("TH").size(); // get number of TH elements in header for colspan purposes

        // helper function
        // make nice id string from cross link object
        const niceCrossLinkName = function (crosslink /*, i */) {
            const matchCount = crosslink.runningTotalEnd - crosslink.runningTotalStart;
            crosslink = crosslink.link;
            return /*(i+1)+". "+*/ matchCount + " Selected Match" + (matchCount > 1 ? "es" : "") + " for " + crosslink.fromProtein.name + ", " +
                (crosslink.isLinearLink() ? "linear peptides" : (crosslink.isMonoLink() ? "monolink @ " + crosslink.fromResidue : (crosslink.fromResidue + " - " +
                    crosslink.toProtein.name + ", " + crosslink.toResidue)));
        };

        // table building starts here
        // match crosslinks up to tbody sections
        const xlinkTBodyJoin = d3.select(this.el).select("TABLE").selectAll("TBODY")
            .data(selectedLinkArray, identityFunc);

        xlinkTBodyJoin.exit().remove();
        const newLinks = xlinkTBodyJoin.enter()
            .append("TBODY")
            .append("TR")
            .append("TD")
            .attr("colspan", colspan);
        newLinks.append("span").attr("class", "colourSwatchSquare");
        newLinks.append("span").attr("class", "niceCrossLinkName");
        xlinkTBodyJoin.order(); // reorder existing dom elements so they are in same order as data (selectedLinkArray)

        // all tbody
        const allLinks = xlinkTBodyJoin.select("TR>TD");
        allLinks.select(".niceCrossLinkName").text(niceCrossLinkName);
        const colourScheme = this.model.get("linkColourAssignment");
        allLinks.each(function () {
            self.makeColourSwatch(d3.select(this).select(".colourSwatchSquare"), colourScheme);
        });


        // Within each tbody section, match table rows up to matches within each crosslink
        const tjoin = xlinkTBodyJoin.selectAll("TR.matchRow").data(function (d, i) {
            let md = d.matches.sort(function (a, b) {
                return b.score() - a.score();
            }); //self.getMatches (d.link);
            // paging by matches means we may begin part way through a link's matches and end partway through a link's matches
            if (i === 0 || i === selectedLinkArray.length - 1) {
                md = md.slice(
                    i === 0 ? firstLastLinkMatchBounds.startMatch || 0 : 0,
                    i === selectedLinkArray.length - 1 ? firstLastLinkMatchBounds.endMatch || md.length : md.length
                );
            }
            return md;
        }, identityFunc);
        tjoin.exit().remove();
        tjoin.enter().append("tr")
            .attr("class", "matchRow")
            .attr("id", function (d) {
                return "match" + d.id;
            }) // since we key the rows on d.id this won't change, so we can set it for all time in enter()
            .on("click", function (d) {
                self.select(d);
            });
        //tjoin.order();
        tjoin.sort(function (a, b) {
            return b.score() - a.score();
        });
        tjoin
            .classed("spectrumShown2", function (d) {
                const lsm = self.model.get("lastSelectedMatch");
                return lsm && lsm.match ? lsm.match.id === d.id : false;
            });
        const getText = function (d) {
            const link = d3.select(this.parentNode).datum();
            const cellFunc = self.cellFuncs[d];
            return cellFunc ? cellFunc(link) : (link[d] || "");
        };

        const deemphasiseFraction = function (text) {
            const str = text ? text.toString() : "";
            const dpoint = str.indexOf(".");
            if (dpoint < 0) return text;
            const sci = str.indexOf("+", dpoint + 1);
            return text.slice(0, dpoint) + "<span class='smallText'>" + (sci >= 0 ? text.slice(dpoint, sci) + "</span>" + text.slice(sci) : text.slice(dpoint) + "</span>");
        };

        // function that sets contents of individual cell
        const setCell = function (d) {
            const d3this = d3.select(this);
            if (self.numberColumns.has(d)) {
                d3this.html(deemphasiseFraction(getText.call(this, d)));
            } else if (self.monospacedColumns.has(d)) {
                d3this.html(getText);
            } else {
                d3this.text(getText);
            }

            if (self.maxWidthColumns.has(d)) {
                d3this.attr("title", getText.call(this, d));
            }
        };


        // Within each row, match cells up to individual pieces of match information
        const possClasses = ["number", "colSectionStart", "monospaced", "maxWidth", "minWidth", "emphasise"];
        const cellJoin = tjoin.selectAll("TD").data(filteredProps /*, function(d) { return d; }*/);
        cellJoin.exit().remove();
        cellJoin.enter()
            .append("td")
            // this is quicker than doing individual .classed (or an aggregated .classed even)
            // but only safe to use if confident these are the only possible classes applicable to these elements
            // individual .classed = ~37.5% of addRows time, .attr("class") = ~11% of addRows time
            .attr("class", function (d) {
                const states = [
                    self.numberColumns.has(d),
                    self.colSectionStarts.has(d),
                    self.monospacedColumns.has(d),
                    self.maxWidthColumns.has(d),
                    self.minWidthColumns.has(d),
                    self.emphasiseColumns.has(d),
                ];
                const classes = possClasses.filter(function (cd, ci) {
                    return states[ci];
                });
                return classes.join(" ");
            })
            .each(function (d) {
                if (!self.changeableColumns.has(d)) {
                    setCell.call(this, d);
                }
            });
        // The above states shouldn't change over the cells lifetime, so do it once in enter rather than repeatedly in the update() selection below


        cellJoin
            .each(function (d) {
                /*
                d3.select(this).classed ({
                    number: self.numberColumns.has(d),
                    colSectionStart: self.colSectionStarts.has(d),
                    monospaced: self.monospacedColumns.has(d),
                    maxWidth: self.maxWidthColumns.has (d),
                });
                */
                if (self.changeableColumns.has(d)) {
                    setCell.call(this, d);
                }
            });
    },

    updateSwatchesOnly: function () {
        const colourScheme = this.model.get("linkColourAssignment");
        const self = this;
        d3.select(this.el).selectAll(".colourSwatchSquare")
            .each(function () {
                self.makeColourSwatch(d3.select(this), colourScheme);
            });
    },

    setVisible: function (show) {
        d3.select(this.el).style("display", show ? "block" : "none");
        if (show) {
            this.render();
        }
    },

    clearCurrentRowHighlight: function () {
        d3.select(this.el).selectAll("tr").classed("spectrumShown2", false);
        return this;
    },

    setTableHighlights: function (highlightedMatches) {
        const highlightedMatchIDs = d3.set(_.pluck(highlightedMatches, "id"));
        d3.select(this.el).selectAll("tr.matchRow").classed("highlighted", function (d) {
            return highlightedMatchIDs.has(d.id);
        });
        return this;
    },

    // this is called when mouse moved over a row
    // and should via the backbone models and events eventually call setTableHighlights above too
    highlight: function (evt) {
        const datum = d3.select(evt.currentTarget).datum();
        return this.highlightFromDatum(datum, evt);
    },

    highlightFromDatum: function (datum, evt) {
        this.model.setMarkedMatches("highlights", datum ? [{
            match: datum
        }] : [], true, evt.ctrlKey || evt.shiftKey);
        return this;
    },

    focusTable: function () {
        this.el.focus();
    },

    selectByKey: function (evt) {
        const kcode = evt.keyCode;

        if (kcode === 38 || kcode === 40 || kcode === 13) {
            let currentWithinPageIndex = -1;

            d3.select(this.el).selectAll("tr.matchRow")
                .each(function (d, i) {
                    if ((d3.select(this).classed("spectrumShown2") && currentWithinPageIndex === -1) || d3.select(this).classed("highlighted")) {
                        currentWithinPageIndex = i;
                    }
                });

            //console.log ("cwpi", currentWithinPageIndex);

            if (currentWithinPageIndex >= 0) {
                let newIndex = currentWithinPageIndex + (kcode === 40 ? 1 : 0) + (kcode === 38 ? -1 : 0);
                //console.log ("NI", newIndex, this.page, this.getPageCount());
                let isNew = true;
                if (newIndex < 0) {
                    if (this.page > 1) {
                        this.page--;
                        this.render();
                        newIndex = this.pageSize - 1;
                    } else {
                        isNew = false;
                    }
                } else if (newIndex >= this.pageSize) {
                    if (this.getPageCount() > this.page) {
                        this.page++;
                        console.log("next page", this.page, this);
                        this.render();
                        newIndex = 0;
                    } else {
                        isNew = false;
                    }
                }


                if (isNew) {
                    const self = this;
                    d3.select(this.el).selectAll("tr.matchRow")
                        .filter(function (d, i) {
                            return i === newIndex;
                        })
                        .each(function (d) {
                            if (kcode === 13) {
                                self.select(d);
                            } else {
                                self.highlightFromDatum(d, evt);
                            }
                        });
                }
            }

            //console.log ("CI", currentWithinPageIndex);
        }
    },

    select: function (d) {
        const mainModel = this.options.mainModel;
        if (mainModel) {
            //TODO: fix?
            //~ if (mainModel.get("clmsModel").get("matches").has(d.id) == true) {
            //~ d3.select(".validationControls").style("display", "block");
            //~ } else {
            //~ d3.select(".validationControls").style("display", "none");
            //~ }
            mainModel.set("lastSelectedMatch", {
                match: d,
                directSelection: true
            });
        } else {
            //d3.select(".validationControls").style("display", "block");
        }
        //if (d.src) { // if the src att is missing its from a csv file
        // always trigger change event even if same (in some situations we redisplay spectrum viewer through this event)
        this.model
            .set("lastSelectedMatch", {
                match: d,
                directSelection: true
            }, {
                silent: true
            })
            .trigger("change:lastSelectedMatch", this.model, this.model.get("selectedMatch"));
        //}
    },

    identifier: "Selected Match Table",
});

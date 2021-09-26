import '../../css/proteinInfoViewBB.css';
import * as _ from 'underscore';
import d3 from "d3";

import {BaseFrameView} from "../ui-utils/base-frame-view";
import {makeLegalDomID} from "../utils";

export const ProteinInfoViewBB = BaseFrameView.extend({
    events: function () {
        let parentEvents = BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({
            "mouseenter .proteinTabs span": "highlightProteins",
            "mouseleave .proteinTabs span": "unhighlightProteins",
        }, parentEvents, {});
    },

    defaultOptions: {
        removeTheseKeys: new Set(["canonicalSeq", "seq_mods", "filteredNotDecoyNotLinearCrossLinks", "hidden", "targetProteinID", "form", "is_decoy", "manuallyHidden"]),
        expandTheseKeys: new Set(["uniprot", "meta"]),
        orderedKeys: ["name", "id", "accession", "description", "size", "sequence"],
    },

    initialize: function (viewOptions) {
        ProteinInfoViewBB.__super__.initialize.apply(this, arguments);

        const flexContainer = d3.select(this.el)
            .append("div")
            .classed("verticalFlexContainer", true);

        const toolBarArea = flexContainer.append("div")
            .classed("toolbarArea", true);
        toolBarArea.append("h1")
            .classed("infoHeader", true)
            .text("0 Selected Proteins");
        toolBarArea.append("div")
            .classed("proteinTabs", true);

        flexContainer.append("div")
            .classed("proteinInfoPanel sectionTable panelInner", true); //todo tidy css

        this.listenTo(this.model, "change:selectedProteins proteinMetadataUpdated", this.render);
        this.listenTo(this.model, "filteringDone change:selection change:highlights", this.showCrossLinksState);
        this.listenTo(this.model, "change:highlightedProteins", this.showProteinHighlightsState);

        return this;
    },

    render: function () {
        if (this.isVisible()) {
            const prots = this.model.get("selectedProteins");
            prots.sort(function (a, b) {
                return a.name.localeCompare(b.name);
            });

            if (prots.length === 1 || prots.indexOf(this.displayedProt) === -1) {
                this.displayedProt = prots[0];
            } else if (prots.length === 0) {
                this.displayedProt = null;
            }

            d3.select(this.el).select(".infoHeader")
                .text(prots.length + " Selected Protein" + (prots.length !== 1 ? "s" : ""));

            // d3 data bind
            const protJoin = d3.select(this.el).select("div.proteinTabs").selectAll(".protTab").data(prots,
                function (d) {
                    return makeLegalDomID(d.id);
                });
            const self = this;
            protJoin.enter().append("span")
                .classed("protTab", true)
                .text(
                    function (d) {
                        return d.name + " ; ";
                    }
                )
                .on("click", function (d) {
                    self.displayedProt = d;
                    self.updateTabs();
                    self.updateTable(d);
                })
            ;
            protJoin.exit().remove();
            protJoin.order();

            this.updateTabs();
            // this.showProteinHighlightsState();
            this.updateTable(this.displayedProt);
        }
        return this;
    },

    updateTabs: function () {
        const self = this;
        d3.select(this.el).select("div.proteinTabs").selectAll(".protTab").classed("selectedTab",
            function (d) {
                //console.log(d, self.displayedProt, d === self.displayedProt);
                return d === self.displayedProt;
            });

    },

    updateTable: function (protein) {
        const divSel = d3.select(this.el).select("div.proteinInfoPanel");
        //deliberately doesn't use d3 from here on
        const div = divSel[0][0];
        div.textContent = "";
        if (protein) {
            console.log("update protein info table", protein.id, protein.name);
            const table = document.createElement("table");
            let tBody = table.createTBody();

            const self = this;
            const goTermsMap = window.compositeModelInst.get("go");

            for (let key of this.options.orderedKeys) {
                addRow(key);
            }

            for (let key in protein) {
                if (this.options.orderedKeys.indexOf(key) === -1 && typeof protein[key] !== "function"
                        && !this.options.removeTheseKeys.has(key)) {
                    if (this.options.expandTheseKeys.has(key)) {
                        addMetaRows(key);
                    } else {
                        addRow(key);
                    }
                }
            }

            function addRow(key) {
                let row = tBody.insertRow();
                let cell1 = row.insertCell();
                cell1.textContent = key;
                let cell2 = row.insertCell();
                const value = protein[key];
                if (Array.isArray(value)) {
                    cell2.textContent = value.length;
                } else if (key === "sequence") {
                    cell2.innerHTML = self.makeInteractiveSeqString(protein, protein.sequence, protein.crosslinks, true);
                } else {
                    cell2.textContent = value;
                }
                if (key.indexOf("seq") !== -1) {
                    cell2.classList.add('fixedSizeFont');
                }
            }

            function addMetaRows(key) {
                const metaObj = protein[key];
                let row = tBody.insertRow();
                let cell1 = row.insertCell();
                cell1.textContent = key;
                cell1.colSpan = 1;
                let cell2 = row.insertCell();
                const innerTable = document.createElement("table");
                let innerTBody = innerTable.createTBody();
                for (let subkey in metaObj) {
                    if (subkey !== "sequence" && subkey !== "features") {
                        let innerRow = innerTBody.insertRow();
                        let subCell1 = innerRow.insertCell();
                        subCell1.textContent = subkey;
                        let subCell2 = innerRow.insertCell();
                        const value = metaObj[subkey];
                        if (Array.isArray(value)) {
                            const innerInnerTable = document.createElement("table");
                            let innerInnerTBody = innerInnerTable.createTBody();
                            for (let subValue of value) {
                                let row = innerInnerTBody.insertRow();
                                let cell1 = row.insertCell();
                                if (subkey === "go"){
                                    cell1.textContent = subValue + " : " + goTermsMap.get(subValue).name;
                                }
                                else {
                                    cell1.textContent = subValue.toString();
                                }
                            }
                            subCell2.append(innerInnerTable);
                        } else {
                            subCell2.textContent = value;
                        }
                        if (subkey.indexOf("seq") !== -1) {
                            subCell2.classList.add('fixedSizeFont');
                        }
                    }
                }
                cell2.append(innerTable);
            }

            div.appendChild(table);

            const tabs = d3.select(this.el).select("div.panelInner");

            tabs.selectAll("span.hit")
                .on("click", function () {
                    const idArray = self.splitDataAttr(d3.select(this), "data-linkids");
                    const crosslinks = self.getCrossLinksFromIDs(idArray, true);
                    self.model.setMarkedCrossLinks("selection", crosslinks, true, d3.event.ctrlKey);
                })
                .on("mouseover", function () {
                    //console.log ("model", self.model);
                    const d3sel = d3.select(this);
                    const idArray = self.splitDataAttr(d3sel, "data-linkids");
                    const crosslinks = self.getCrossLinksFromIDs(idArray, true);
                    // following breaks things if proteins have underscores in name
                    // var posData = self.splitDataAttr(d3sel, "data-pos", "_");
                    // var interactor = self.model.get("clmsModel").get("participants").get(posData[0]);
                    //
                    // self.model.get("tooltipModel")
                    //     .set("header", "Cross-Linked with " + makeTooltipTitle.residue(interactor, +posData[1]))
                    //     .set("contents", makeTooltipContents.multilinks(crosslinks, posData[0], +posData[1]))
                    //     .set("location", {
                    //         pageX: d3.event.pageX,
                    //         pageY: d3.event.pageY
                    //     });
                    self.model.setMarkedCrossLinks("highlights", crosslinks, true, false);
                })
                .on("mouseout", function () {
                    self.model.get("tooltipModel").set("contents", null);
                    self.model.setMarkedCrossLinks("highlights", [], false, false);
                });

            this.showCrossLinksState();

        }
    },

    showCrossLinksState: function () {
        const self = this;
        //console.log ("in prot info filter");
        if (this.isVisible()) {
            const selectedLinks = self.model.getMarkedCrossLinks("selection");
            const selidset = d3.set(_.pluck(selectedLinks, "id"));
            const highlightedLinks = self.model.getMarkedCrossLinks("highlights");
            const highidset = d3.set(_.pluck(highlightedLinks, "id"));

            d3.select(this.el).selectAll("span.hit")
                .each(function () {
                    const d3sel = d3.select(this);
                    const idArray = self.splitDataAttr(d3sel, "data-linkids");
                    const crosslinks = self.getCrossLinksFromIDs(idArray, true);
                    //d3sel.classed ("filteredOutResidue", crosslinks.length === 0);
                    const selYes = crosslinks.some(function (xlink) {
                        return selidset.has(xlink.id);
                    });
                    //d3sel.classed ("selected", selYes);
                    const highYes = crosslinks.some(function (xlink) {
                        return highidset.has(xlink.id);
                    });
                    //d3sel.classed ("highlighted", highYes);

                    // setting attr("class") once as a string is multiple times quicker than 3x .classed calls (roughly 5-6x quicker)
                    const classStr = ["hit"]; // maintain the span element's hit class state
                    if (crosslinks.length === 0) {
                        classStr.push("filteredOutResidue");
                    }
                    if (selYes) {
                        classStr.push("selected");
                    }
                    if (highYes) {
                        classStr.push("highlighted");
                    }
                    d3sel.attr("class", classStr.join(" "));
                });
        }
        return this;
    },

    showProteinHighlightsState: function () {
        const highlightSet = d3.set(_.pluck(this.model.get("highlightedProteins"), "id"));
        //d3.select(this.el).selectAll(".sectionTable h2")
        d3.select(this.el).selectAll(".protTab")
            .classed("highlighted", function (d) {
                return highlightSet.has(d.id);
            });
        return this;
    },

    highlightProteins: function (evt) {
        this.model.setHighlightedProteins([d3.select(evt.target).datum()]);
        return this;
    },

    unhighlightProteins: function () {
        this.model.setHighlightedProteins([]);
        return this;
    },

    splitDataAttr: function (d3sel, dataAttrName, splitChar) {
        const ids = d3sel.attr(dataAttrName);
        return ids ? ids.split(splitChar || ",") : [];
    },

    getCrossLinksFromIDs: function (linkIDs, filter) {
        linkIDs = d3.set(linkIDs).values(); // strips out duplicates

        const allLinks = this.model.get("clmsModel").get("crosslinks");
        let crosslinks = linkIDs.map(function (linkId) {
            return allLinks.get(linkId);
        });

        if (filter) {
            crosslinks = crosslinks.filter(function (xlink) {
                return xlink.filteredMatches_pp.length > 0;
            });
        }
        return crosslinks;
    },

    makeInteractiveSeqString: function (protein, seq, xlinks, filterDecoys) {
        const proteinId = protein.id;
        if (filterDecoys) {
            xlinks = xlinks.filter(function (xlink) {
                return !xlink.isDecoyLink();
            });
        }
        const map = d3.map(xlinks, function (d) {
            return d.id;
        });
        const endPoints = {};
        map.forEach(function (id, xlink) { // saves calculating values() - map.values().forEach (function (xlink)
            if (proteinId === xlink.fromProtein.id) {
                const fromRes = xlink.fromResidue;
                endPoints[fromRes] = endPoints[fromRes] || [];
                endPoints[fromRes].push(xlink);
            }
            //added check for no toProtein (for linears)
            //if ( /*!xlink.isLinearLink() &&*/ xlink.isSelfLink()) { // if linear then will fail for selflink anyways
            if (!xlink.isLinearLink() && proteinId === xlink.toProtein.id) { // if linear then will fail for selflink anyways
                const toRes = xlink.toResidue;
                // In cases of homomultimers linking same residue indices, don't add twice
                if (toRes !== xlink.fromResidue || proteinId !== xlink.fromProtein.id) {
                    endPoints[toRes] = endPoints[toRes] || [];
                    endPoints[toRes].push(xlink);
                }
            }
        });
        const endPointEntries = d3.entries(endPoints);
        endPointEntries.sort(function (a, b) {
            return a.key - b.key;
        });

        const strSegs = [];
        let last = 0;
        endPointEntries.forEach(function (ep) {
            const pos = +ep.key;
            const linkIds = _.pluck(ep.value, "id");
            strSegs.push(seq.slice(last, pos - 1));
            strSegs.push("<span class='hit' data-pos='" + (proteinId + "_" + pos) + "' data-linkids='" + linkIds.join(",") + "'>" + seq.charAt(pos - 1) + "</span>");
            last = pos;
        });
        strSegs.push(seq.slice(last, seq.length));
        const iStr = strSegs.join("");
        //console.log("iStr", iStr);

        return iStr;
    },

    identifier: "Selected Protein Info",
});

import * as _ from 'underscore';
import Backbone from "backbone";

import {ThreeColourSliderBB} from "./threeColourSliderBB";
import {BaseFrameView} from "../../ui-utils/base-frame-view";
import {sectionTable} from "../../ui-utils/section-table";
import {utils} from "../../utils";

export const KeyViewBB = BaseFrameView.extend({
    events: function () {
        let parentEvents = BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "change input[type='color']": "changeColour",
            "click .downloadButton3": "downloadKey",
        });
    },

    defaultOptions: {
        colourConfigs: [
            {
                id: "cross-link",
                modelID: "linkColourAssignment",
                collectionID: "Collection",
                placeholderID: "linkColourDropdownPlaceholder",
            }, {
                id: "protein",
                modelID: "proteinColourAssignment",
                collectionID: "ProteinCollection",
                placeholderID: "proteinColourDropdownPlaceholder",
            }
        ],
    },

    initialize: function (viewOptions) {
        KeyViewBB.__super__.initialize.apply(this, arguments);

        const topDiv = d3.select(this.el).append("div")
            .attr("class", "verticalFlexContainer keyPanel")
        ;

        const chartDiv = topDiv.append("div")
            .attr("class", "panelInner")
            .attr("flex-grow", "1")
        ;

        this.setupColourSection(chartDiv);
        this.setupLegendSection(chartDiv);
        this.sliderSubViews = [];

        // re-render if colour models changed outside of here
        const changeString = this.options.colourConfigs.map(function (config) {
            return "change:" + config.modelID;
        }).join(" ");
        this.listenTo(this.model, changeString, this.render);

        // update is only triggered once when adding/removing multiple models to/from a collection
        this.options.colourConfigs.forEach(function (config) {
            this.listenTo(window.linkColor[config.collectionID], "update", this.render);
        }, this);

        return this;
    },

    setupColourSection: function (chartDiv) {
        const sectionDiv = chartDiv.append("div");
        //sectionDiv.append("h3").text("Chosen Colour Scheme Legend").attr("class", "groupHeader");

        const sectionData = this.options.colourConfigs.map(function (config) {
            return {
                id: config.id + "colourKey",
                header: "Current " + config.id + " Colour Scheme",
                controlPlaceholderID: config.placeholderID,
                colourModelKey: config.modelID,
                rows: [],
                sectionType: "colourModel"
            };
        });

        const headerFunc = function (d) {
            return d.header.replace("_", " ");
        };
        const rowFilterFunc = function (d) {
            return d.rows.map(function (row) {
                return {
                    key: row[0],
                    value: row[1]
                };
            });
        };
        const cellFunc = function (d) {
            d3.select(this).text(d.value);
        };
        const self = this;
        const clickFunc = function (showSection, d, i) {
            if (showSection && (d.sectionType === "colourModel") && self.sliderSubViews[i]) {
                self.sliderSubViews[i].show(true);
            }
        };

        sectionTable.call(this, sectionDiv, sectionData, "colourInfo", ["Colour (Editable)", "Meaning"], headerFunc, rowFilterFunc, cellFunc, [0], clickFunc);

        // add colour scheme selection placeholders (added in networkFrame.js)
        sectionDiv.selectAll("section")
            .classed("colourKeyBottomGap", true)
            .insert("label", ":first-child").attr("id", function (d) {
            return d.controlPlaceholderID;
        })
        ;

        // add download colour scheme svg button
        sectionDiv.selectAll("section")
            .append("button")
            .attr("class", "downloadButton3 btn btn-1 btn-1a")
            .text("Download This Colour Scheme as SVG")
        ;
    },

    setupLegendSection: function (chartDiv) {
        const sectionDiv = chartDiv.append("div");
        sectionDiv.append("h3").text("View Legends").attr("class", "groupHeader");

        const svgs = {
            clinkp: "<line x1='0' y1='15' x2='50' y2='15' class='monochrome'/>",
            ambigp: "<line x1='0' y1='15' x2='50' y2='15' class='monochrome ambiguous'/>",
            multip: "<line x1='0' y1='15' x2='50' y2='15' class='multiLinkStroke'/><line x1='0' y1='15' x2='50' y2='15' class='monochrome'/>",
            selflinkp: "<path d='m 3,15 q 1.5,-10 9,-10 a 15,15 0 0 1 10,10 q 0,6 -10,9' class='monochrome antialias'/>",
            // selflinkpc: "<path d='m 3,15 q 1.5,-10 9,-10 a 15,15 0 0 1 10,10 q 0,6 -10,9' class='monochrome selfLink antialias homomultimer dynColour'/>",
            annotp: "<g class='antialias'><circle cx='25' cy='15' r='10' class='monochrome'></circle><path d='M 25 5 a 9 9 0 0 1 9 7 L 25 15 Z' class='annotationLegend'></path></g>",
            clinkr: "<line x1='0' y1='15' x2='50' y2='15' class='monochrome'/>",
            ambigr: "<line x1='0' y1='15' x2='50' y2='15' class='monochrome ambiguous'/>",
            selflinkr: "<path d='m 3,28 v -10 a 15,10 0 0 1 44,0 v 10' class='monochrome antialias'/>",
            homom: "<path d='m 25,2 q -9,25, 0,27 q 9,-2 0,-27' class='monochrome antialias'/>",
            //selflinkinter: "<path d='m 3,28 l 14,-20 l 14,20' class='monochrome selfLink dynColour'/>",
            linkmodpep: "<path d='m 12,2 v 25 l -8,-5 l 8,-5' class='monochrome selfLink dynColour filled'/><path d='m 30,2 v 25 l -8,-5 l 8,-5' class='monochrome ambiguous selfLink dynColour'/>",
            highlight: "<rect x='0' y='8' width='50' height ='15' class='highlighted'/><text x='24' y='18' class='peptideAAText'>LIEKFLR<text>",
            annotr: "<rect x='3' y='10' width='44' height='10' class='monochrome'></rect><rect x='5' y='10' width='12' height='10' class='annotationLegend'></rect>",
            circleCrossLink: "<path d='m 3 15 q 22 -10, 44 0' class='monochrome antialias'></path>",
            circleAnnot: "<g class='antialias'><path d='m 3 10 a 50 50 0 0 0 44 0 l 3 10 a 50 50 0 0 1 -50 0 Z' class='circleNode'></path><path d='m 3 10 a 50 50 0 0 0 15 5 l -1 10 a 50 50 0 0 1 -17 -5 Z' class='annotationLegend' style='stroke:none;'></path></g>",
            scatterNormal: "<rect x='10' y='14' width='5' height='5' class='scatterNormal'></rect>",
            scatterDecoy: "<rect x='10' y='14' width='5' height='5' class='scatterDecoy'></rect>",
            scatterAmbig: "<rect x='10' y='14' width='5' height='5' class='scatterAmbig'></rect>",
            scatterHighlighted: "<rect x='10' y='14' width='5' height='5' class='scatterNormal highlighted'></rect>",
            scatterSelected: "<rect x='10' y='14' width='5' height='5' class='scatterNormal selected'></rect>",
            alignMatch: "<text x='24' y='18' class='peptideAAText'>LIEKFLR<text>",
            alignMissing: "<rect x='0' y='8' width='50' height ='15' class='seqDelete'/><text x='24' y='18' class='peptideAAText'>-------<text>",
            alignExtra: "<rect x='0' y='8' width='50' height ='15' class='seqInsert'/><text x='24' y='18' class='peptideAAText'>LIEKFLR<text>",
            alignVariation: "<rect x='0' y='8' width='50' height ='15' class='seqVar'/><text x='24' y='18' class='peptideAAText'>LIEKFLR<text>",
        };

        const texts = {
            clinkp: "Crosslink(s) between different proteins.",
            ambigp: "Ambiguous Crosslink(s).",
            multip: "Multiple Linkage Sites.",
            selflinkp: "Self Crosslink(s)",
            // selflinkpc: "Self Crosslink(s); definitely includes Cross-Links not between the same molecule of same protein.",
            annotp: "Annotation range in contracted protein",
            clinkr: "Cross Link between different proteins.",
            ambigr: "Ambiguous Crosslink.",
            selflinkr: "Self Crosslink in same protein.",
            homom: "Self Crosslink with Overlapping Peptides. Cannot be the same molecule, so it's either between two different molecules of the same protein (Homomultimeric) or a mis-identification.",
            // selflinkinter: "Intra-molecular Self Link (definitely links same molecule e.g. from internally linked peptide).",
            linkmodpep: "Linker modified peptide (unfilled = ambiguous).",
            highlight: "Highlighted linked peptide (XiNet only).",
            annotr: "Annotation range in expanded protein",
            circleCrossLink: "Crosslink",
            circleAnnot: "Annotation region in protein",
            scatterNormal: "Crosslink or Match.",
            scatterDecoy: "Decoy Crosslink or Match.",
            scatterAmbig: "Ambiguous Crosslink or Match.",
            scatterHighlighted: "Highlighted Crosslink or Match.",
            scatterSelected: "Selected Crosslink or Match.",
            alignMatch: "Matching residues between sequences.",
            alignMissing: "Deleted/missing residues when compared to search sequence.",
            alignExtra: "Inserted/extra residues when compared to search sequence.",
            alignVariation: "Residue variations when compared to search sequence.",
        };


        const viewLegendSectionData = [{
            id: "proteinKey",
            header: "XiNet Protein-Protein Level Legend",
            rows: ["clinkp", "multip", "selflinkp", "selflinkpc", "ambigp", "annotp"].map(function (row) {
                return [row, texts[row]];
            })
        },
            {
                id: "residueKey",
                header: "XiNet Residue Level Legend",
                rows: ["clinkr", "selflinkr", "homom", "ambigr", "highlight", "annotr"].map(function (row) {
                    return [row, texts[row]];
                })
            },
            {
                id: "circularKey",
                header: "Circular View Legend",
                rows: ["circleCrossLink", "homom", "ambigr", "circleAnnot"].map(function (row) {
                    return [row, texts[row]];
                })
            },
            {
                id: "matrixKey",
                header: "Matrix View Legend",
                rows: ["scatterNormal", "scatterAmbig", "scatterHighlighted", "scatterSelected"].map(function (row) {
                    return [row, texts[row]];
                })
            },
            {
                id: "scatterplotKey",
                header: "Scatterplot Legend",
                rows: ["scatterNormal", "scatterDecoy", "scatterAmbig", "scatterHighlighted", "scatterSelected"].map(function (row) {
                    return [row, texts[row]];
                })
            },
            {
                id: "alignmentKey",
                header: "Alignment Legend",
                rows: ["alignMatch", "alignMissing", "alignExtra", "alignVariation"].map(function (row) {
                    return [row, texts[row]];
                })
            },
        ];

        const headerFunc = function (d) {
            return d.header.replace("_", " ");
        };
        const rowFilterFunc = function (d) {
            return d.rows.map(function (row) {
                return {
                    key: row[0],
                    value: row[1]
                };
            });
        };
        const cellFunc = function (d, i) {
            const sel = d3.select(this);
            if (i === 0) {
                sel.append("svg")
                    .attr("class", "miniKey")
                    .html(svgs[d.value]);
            } else {
                sel.text(d.value);
            }
        };


        sectionTable.call(this, sectionDiv, viewLegendSectionData, "keyInfo", ["Mark", "Meaning"], headerFunc, rowFilterFunc, cellFunc, [0], null);

        const colScheme = window.linkColor.defaultColoursBB;
        const notLinear = function () {
            return false;
        };
        const cols = {
            intra: {
                isSelfLink: function () {
                    return true;
                },
                isLinearLink: notLinear,
                filteredMatches_pp: [],
            },
            homom: {
                isSelfLink: function () {
                    return true;
                },
                isLinearLink: notLinear,
                confirmedHomomultimer: true,
                filteredMatches_pp: [{
                    match: {
                        confirmedHomomultimer: true
                    }
                }],
            },
            inter: {
                isSelfLink: function () {
                    return false;
                },
                isLinearLink: notLinear,
                filteredMatches_pp: [],
            }
        };
        d3.keys(cols).forEach(function (key) {
            cols[key].colour = colScheme.getColour(cols[key]);
            //console.log ("key", key, cols[key]);
        } /*, colScheme*/);

        sectionDiv.selectAll("table").selectAll("path.dynColour,line.dynColour")
            .each(function () {
                const d3Sel = d3.select(this);
                const colType = d3Sel.classed("selfLink") ? (d3Sel.classed("homomultimer") ? "homom" : "intra") : "inter";
                const colour = cols[colType].colour;
                d3Sel.style("stroke", colour);
                if (d3Sel.classed("filled")) {
                    d3Sel.style("fill", colour);
                }
            });
    },

    changeColour: function (evt) {
        const parentDatum = d3.select(evt.target.parentNode.parentNode.parentNode).datum();
        const colourModelKey = parentDatum.colourModelKey;
        const colourAssign = this.model.get(colourModelKey);

        if (colourAssign) {
            const newValue = evt.target.value;
            const rowData = d3.select(evt.target.parentNode.parentNode).datum();
            const i = _.last(rowData);

            const colScale = colourAssign.get("colScale");
            const colScaleRange = colScale.range();
            if (rowData[1] === colourAssign.get("undefinedLabel")) {
                colourAssign.set("undefinedColour", newValue);
            } else {
                colScaleRange[i] = newValue;
            }
            // this will fire a change event for this colour model
            colourAssign.setRange(colScale.range());
        }
    },

    relayout: function () {
        //console.log ("dragend fired");
        const colourAssigns = _.pluck(this.options.colourConfigs, "modelID").map(this.model.get, this.model);
        colourAssigns.forEach(function (colourAssign, i) {
            if (colourAssign && colourAssign.get("type") === "threshold" && this.sliderSubViews[i]) {
                this.sliderSubViews[i].resize().render();
            }
        }, this);
        return this;
    },

    render: function () {
        const self = this;
        const colourSections = this.options.colourConfigs.map(function (config) {
            return {
                id: config.id,
                header: "Current " + config.id + " Colour Scheme",
                rows: [],
                colourModelKey: config.modelID
            };
        });

        // Update colour key sections
        colourSections.forEach(function (colourSection) {

            const colourAssign = this.model.get(colourSection.colourModelKey);
            if (colourAssign) {
                const labelColourPairings = colourAssign.getLabelColourPairings();

                colourSection.rows = labelColourPairings.map(function (val, i) {
                    const rgbCol = val[1];
                    const rgbHex = d3.rgb(rgbCol).toString();
                    const span = "<input type='color' value='" + rgbHex + "' title='Press to change colour for " + val[0] + "'/>";
                    return [span, val[0], i];
                });
            }
        }, this);

        const updateSection = d3.select(this.el).selectAll("section").data(colourSections, function (d) {
            return d.header;
        });
        updateSection.select("h2 span").text(function (d) {
            const colourAssign = self.model.get(d.colourModelKey);
            return d.header + ": " + colourAssign.get("title");
        });

        const rowSel = updateSection.select("tbody").selectAll("tr")
            .data(function (d) {
                return d.rows;
            }, function (d) {
                return !d.rows ? d.join(",") : "";
            }) // key function = all fields joined
        ;
        rowSel.exit().remove();
        rowSel.enter().append("tr");
        rowSel.sort(function (a, b) {
            return a[2] - b[2];
        });   // sort so rows are in same order as colourSection[0].rows

        const cellSel = rowSel.selectAll("td").data(function (d) {
            return d.slice(0, 2);
        });
        cellSel.enter().append("td");
        cellSel.html(function (d) {
            return d;
        });

        // hide / disable various pieces of the tables if color schemes are uneditable
        updateSection.each(function (d) {
            const colourAssign = self.model.get(d.colourModelKey);
            const isFixed = colourAssign.get("fixed");
            const section = d3.select(this);
            if (isFixed) {
                section.selectAll("input[type='color']").attr("title", "Not editable.");
            }
            section.select("tbody").selectAll("input").property("disabled", isFixed);
            section.select("caption").text(isFixed ? "Colour scheme is active, but not editable." : "");
        });

        // always remove old sliderSubViews if present
        if (this.sliderSubViews) {
            this.sliderSubViews.forEach(function (slider) {
                slider.remove();
            });
            this.sliderSubViews = [];
        }

        // add in new sliderview if appropriate
        colourSections.forEach(function (colourSection, i) {
            const colourAssign = self.model.get(colourSection.colourModelKey);
            if (colourAssign) {
                if (colourAssign.get("type") === "threshold") {
                    const pid = this.el.id;
                    const tcs = updateSection.select("table#colourInfo" + colourSection.id + "colourKey > .threecs");
                    if (tcs.empty()) {
                        updateSection.select("table#colourInfo" + colourSection.id + "colourKey tbody").append("tr").append("td")
                            .attr("colspan", 2)
                            .append("div")
                            .attr("id", pid + "3cs" + i)
                            .attr("class", "threecs");
                    }

                    this.sliderSubViews[i] = new ThreeColourSliderBB({
                        el: "#" + pid + "3cs" + i,
                        model: colourAssign,
                        unitText: " " + colourAssign.get("unit"),
                        title: colourAssign.get("title") + " Cutoffs",
                        orientation: "horizontal",
                        absolutePosition: false,
                        sliderThickness: 25,
                    })
                        .show(true)
                    ;

                    d3.select("#" + pid).selectAll(".brushValueText").style("display", "none");
                }
            }
        }, this);

        return this;
    },

    downloadKey: function (evt) {
        const d = d3.select(evt.target).datum();  // d3 datum for this button
        const tempSVG = d3.select(this.el).append("svg").attr("class", "tempKey");
        utils.updateColourKey(this.model.get(d.colourModelKey), tempSVG);
        this.downloadSVG(null, tempSVG);
        tempSVG.remove();
    },

    identifier: "Legend",
});
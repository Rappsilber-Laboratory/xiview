import "../../css/filter.css";
import Backbone from "backbone";
import * as _ from "underscore";
import {checkBoxView} from "../ui-utils/checkbox-view";
import d3 from "d3";

export const FilterViewBB = Backbone.View.extend({
    tagName: "span",
    className: "filterGroup",
    events: {
        "change input.modeToggle": "processModeChanged",
        "input input.filterTypeText": "processTextFilter",
        "keyup input.filterTypeNumber": "processNumberFilter",
        "mouseup input.filterTypeNumber": "processNumberFilter",
        "click input.filterTypeToggle": "processBooleanFilter",
        "click input.groupToggleFilter": "processGroupToggleFilter",
    },

    initialize: function (viewOptions) {
        const defaultOptions = {
            config: [
                {
                    label: "Stored validation",
                    id: "manualMode",
                    tooltip: "Filter using stored metadata",
                },
                {
                    label: "In-browser FDR",
                    id: "fdrMode",
                    tooltip: "Filter using False Discovery Rate cutoff calculated in browser.",
                },
                {
                    label: "Linear",
                    id: "linears",
                    tooltip: "Show matches to linear (uncrosslinked) peptides",
                },
                {
                    label: "Monolinks",
                    id: "monolinks",
                    tooltip: "Show matches to linker modified peptides (monolinks)",
                },
                {
                    label: "Crosslink",
                    id: "crosslinks",
                    tooltip: "Show matches to crosslinked peptides",
                },
                {
                    label: "Ambig.",
                    id: "ambig",
                    tooltip: "Show matches to peptides with ambiguous position",
                },
                {
                    label: "Heteromeric",
                    id: "betweenLinks",
                    tooltip: "Show crosslinks between different proteins",
                },
                {
                    label: "Self",
                    id: "selfLinks",
                    tooltip: "Show crosslinks with both ends in the same type of protein",
                },
                {
                    label: "Overlap",
                    id: "homomultimericLinks",
                    tooltip: "Show matches with overlapping linked peptides",
                },
                {
                    label: "Don't Overlap",
                    id: "notHomomult",
                    tooltip: "Show matches for self links without overlapping peptides",
                },
                {
                    label: "AA apart",
                    id: "aaApart",
                    tooltip: "Only show self links separated by at least N amino acids e.g. 10",
                    inequality: "&ge;",
                },
                {
                    label: "Length",
                    id: "pepLength",
                    tooltip: "Only show matches where both linked peptides are at least N amino acids long e.g. 4",
                    inequality: "&ge;",
                },
                {
                    label: "A",
                    id: "A"
                },
                {
                    label: "B",
                    id: "B"
                },
                {
                    label: "C",
                    id: "C"
                },
                {
                    label: "Auto",
                    id: "AUTO",
                    tooltip: "Show autovalidated matches"
                },
                {
                    label: "Unval.",
                    id: "unval",
                    tooltip: "Show unvalidated matches"
                },
                {
                    label: "Decoy",
                    id: "decoys",
                    tooltip: "Show decoy matches"
                },
                {
                    label: "Target",
                    id: "targets",
                    tooltip: "Show target matches"
                },
                {
                    label: "Sequence",
                    id: "pepSeq",
                    chars: 7,
                    tooltip: "Filter to matches whose linked peptides include this AA sequence at either end e.g. FAKR, or define both ends e.g. FAKR-KKE",
                },
                {
                    label: "Name / Acc.",
                    id: "protNames",
                    chars: 7,
                    tooltip: "Filter to crosslinks involving a protein name/accession number including this text. Separate with commas, specify both linked proteins with hyphens e.g. RAT3, RAT1-RAT2"
                },
                {
                    label: "Description",
                    id: "protDesc",
                    chars: 7,
                    tooltip: "Filter to crosslinks involving a protein with a description including this text. Separate with commas, specify both linked proteins with hyphens e.g. RAT3, RAT1-RAT2"
                },
                {
                    label: "PDB?",
                    id: "protPDB",
                    tooltip: "Filter to crosslinks where the proteins at both ends are in the current PDB file (if one chosen)"
                },
                {
                    label: "Run",
                    id: "runName",
                    chars: 5,
                    tooltip: "Filter to matches whose run name includes this text e.g. 07_Lumos"
                },
                {
                    label: "Scan",
                    id: "scanNumber",
                    chars: 5,
                    tooltip: "Filter to matches with this scan number e.g. 44565",
                },
                {
                    label: "Multi",
                    id: "multipleGroup",
                    tooltip: "Pass crosslinks with matches from more than one group"
                },
                {
                    label: "Residue Pairs per PPI",
                    id: "urpPpi",
                    inequality: "&ge;",
                    tooltip: "Filter out protein-protein interactions with less than * supporting unique residue pairs"
                }
            ]
        };
        defaultOptions.searchGroupToggles = this.model.possibleSearchGroups.map(function (group) {
            return {
                id: group,
                label: group,
                tooltip: "Pass matches from Group " + group,
                inputClass: "groupToggleFilter",
                type: "boolean",
            };
        });
        defaultOptions.config.push.apply(defaultOptions.config, defaultOptions.searchGroupToggles);

        // Make options into a map referenced by filter attribute id
        //todo get rid d3 Map
        this.configMap = d3.map(defaultOptions.config, function (d) {
            return d.id;
        });

        ["manualMode", "fdrMode"].forEach(function (item) {
            const entry = this.configMap.get(item);
            entry.overrideType = "radio";
            entry.inputClass = "modeToggle";
            entry.name = "modeSelect";
        }, this);

        this.options = _.extend(defaultOptions, viewOptions.myOptions || {});

        const self = this;

        // this.el is the dom element this should be getting added to, replaces targetDiv
        const mainDivSel = d3.select(this.el);


        function makeFilterControlDiv(options) {
            options = options || {};
            const div = mainDivSel.append("div").attr("class", "filterControlGroup").style("display", options.hide ? "none" : null);
            if (options.id) {
                div.attr("id", options.id);
            }

            if (options.expandable !== false) {
                const setPanelState = function (divSel, collapsed) {
                    divSel.select(".filterControlSpan").style("display", collapsed ? "none" : null);
                    divSel
                        .select(".verticalTextContainer")
                        .attr("title", (collapsed ? "Expand" : "Collapse") + " this filter section")
                        .select(".verticalText")
                        .text((collapsed ? "+ " : "- ") + options.groupName);
                };

                div.append("div")
                    .attr("class", "verticalTextContainer btn-1a")
                    .on("click", function () {
                        const div = d3.select(this.parentNode);
                        const panel = div.select(".filterControlSpan");
                        const collapse = panel.style("display") !== "none";
                        div.call(setPanelState, collapse);
                    })
                    .append("div")
                    .attr("class", "verticalText");
                div.call(setPanelState, false);
            }

            const nestedDiv = div.append("div").attr("class", "filterControlSpan");
            if (options.class) {
                nestedDiv.classed(options.class, true);
            }
            return nestedDiv;
        }

        function addFilterGroup(config, filterIDs) {
            const divSel = makeFilterControlDiv(config);
            const filters = filterIDs.map(function (id) {
                return this.configMap.get(id);
            }, this);
            const self = this;
            divSel.selectAll("div.filterItem")
                .data(filters, function (d) {
                    return d.id;
                })
                .enter()
                .append("div")
                .attr("class", "filterItem")
                .each(function (d) {
                    const type = d.type || self.model.types[d.id];
                    if (type === "boolean") {
                        self.addBooleanFilter(d3.select(this));
                    } else if (type === "number") {
                        self.addNumberFilter(d3.select(this));
                    } else {
                        self.addTextFilter(d3.select(this));
                    }
                });
        }

        function initMinigramFilterGroup(config) {
            if (config && config.attr) {
                const cutoffDivSel = makeFilterControlDiv(config);

                const sliderSection = cutoffDivSel.append("div").attr("class", "scoreSlider");
                // Can validate template output at http://validator.w3.org/#validate_by_input+with_options
                const tpl = _.template("<div><p>" + config.label + "</p><P class='vmin cutoffLabel'><span>&gt;</span></P><P>Min</P></div><div id='<%= eid %>'></div><div><p>" + config.label + "</p><P class='cutoffLabel vmax'><span>&lt;</span></P><P>Max</P></div><div class='undef'></div>");
                sliderSection.html(tpl({
                    eid: self.el.id + config.id + "SliderHolder"
                }));
                // sliderSection.style('display', (self.model.get("scores") === null) ? 'none' : null);
                sliderSection.selectAll("p.cutoffLabel")
                    .attr("title", function () {
                        const isMinInput = d3.select(this).classed("vmin");
                        return config.tooltipIntro + " " + (isMinInput ? "less than" : "greater than") + " X e.g. " + (isMinInput ? "8.0" : "20.0");
                    })
                    .append("input")
                    .attr({
                        type: "number",
                        step: config.step || 0.1,
                        //min: 0,
                    })
                    .property("value", function () {
                        const isMinInput = d3.select(this.parentNode).classed("vmin");
                        const cutoff = self.model.get(config.attr);
                        const val = cutoff[isMinInput ? 0 : 1];
                        return val !== undefined ? val : "";
                    })
                    .on("change", function () { // "input" activates per keypress which knackers typing in anything >1 digit
                        //console.log ("model", self.model);
                        const val = +this.value;
                        const isMinInput = d3.select(this.parentNode).classed("vmin");
                        const cutoff = self.model.get(config.attr);
                        const extent = self.model[config.extentProperty];
                        // take new values, along with score extents, sort them and discard extremes for new cutoff settings
                        let newVals = [isMinInput ? val : (cutoff[0] !== undefined ? cutoff[0] : extent[0]),
                            isMinInput ? (cutoff[1] !== undefined ? cutoff[1] : extent[1]) : val,
                            extent[0], extent[1]
                        ]
                            .filter(function (v) {
                                return v !== undefined;
                            })
                            .sort(function (a, b) {
                                return a - b;
                            });
                        //console.log ("newVals", newVals);
                        newVals = newVals.slice((newVals.length / 2) - 1, (newVals.length / 2) + 1);

                        self.model.set(config.attr, newVals);
                    });
                if (config.undefAttr) {
                    const cbox = new checkBoxView({
                        el: sliderSection.select("div.undef").node(),
                        model: self.model,
                        myOptions: {
                            toggleAttribute: config.undefAttr,
                            id: self.el.id + config.undefAttr,
                            label: "Ø"
                        },
                    });
                    d3.select(cbox.$el[0])
                        .attr("title", "Show Cross-Links of Unknown " + config.label)
                        .select("label").classed("btn", false);
                }

                this.listenTo(this.model, "change:" + config.attr, function (model, val) {
                    sliderSection.select(".vmin input").property("value", val[0]); // min label
                    sliderSection.select(".vmax input").property("value", val[1]); // max label
                });
            }
        }


        function initFDRPlaceholder() {
            //following may not be best practice, its here to get the placeholder divs in the right place in the filter div (the grey bar at bottom)
            const fdrPanel = makeFilterControlDiv({id: "fdrPanelHolder", groupName: "FDR"});
            fdrPanel.attr("id", "fdrPanel");
        }


        function addScrollRightButton() {
            const fixedBox = mainDivSel
                .append("div")
                .attr("class", "fixedBottomRight");

            const button = fixedBox
                .append("button")
                .attr("class", "tallButton btn btn-1a btn-tight")
                .attr("title", "Press to show currently off-screen filter controls")
                .on("click", function () {
                    const right = mainDivSel.style("right");
                    const rightSet = right === "20px";
                    mainDivSel.style("right", rightSet ? "auto" : "20px");

                    d3.select(this).select("i").attr("class", rightSet ? "fa fa-angle-double-right" : "fa fa-angle-double-left");
                });
            button.append("i")
                .attr("class", "fa fa-angle-double-right");
        }

        const groupIDs = _.pluck(defaultOptions.searchGroupToggles, "id");
        groupIDs.push("multipleGroup");

        addFilterGroup.call(this, {id: "filterModeDiv", groupName: "Mode"}, ["manualMode", "fdrMode"]);

        addFilterGroup.call(this, {
            id: "validationStatus",
            groupName: "Validation"
        }, ["A", "B", "C", "AUTO", "unval"]);

        addFilterGroup.call(this, {
            id: "targetDecoy",
            groupName: "TD"
        }, ["decoys", "targets"]);

        addFilterGroup.call(this, {
            id: "peptide",
            groupName: "Peptide"
        }, ["pepSeq", "pepLength", "ambig"]);

        addFilterGroup.call(this, {
            id: "navFilters",
            groupName: "Protein"
        }, ["protNames", "protDesc", "protPDB"]);

        addFilterGroup.call(this, {
            id: "product",
            groupName: "Product"
        }, ["linears", "monolinks", "crosslinks"]);

        addFilterGroup.call(this, {groupName: "Crosslink", id:"crosslinkGroup"}, ["betweenLinks", "selfLinks"]);

        addFilterGroup.call(this, {id:"self", groupName: "Self Links"}, ["aaApart", "notHomomult", "homomultimericLinks"]);

        initMinigramFilterGroup.call(this, {
            attr: "distanceCutoff",
            extentProperty: "distanceExtent",
            undefAttr: "distanceUndef",
            label: "Distance",
            id: "distanceFilter",
            groupName: "Distances",
            tooltipIntro: "Filter out crosslinks with distance"
        });

        initMinigramFilterGroup.call(this, {
            attr: "matchScoreCutoff",
            extentProperty: "scoreExtent",
            label: "Match Score",
            id: "matchScore",
            groupName: "Scores",
            tooltipIntro: "Filter out matches with scores"
        });

        initFDRPlaceholder.call(this);

        addFilterGroup.call(this, {id: "navNumberFilters", groupName: "PPI"}, ["urpPpi"]);
        addFilterGroup.call(this, {id: "groupFilters", groupName: "Groups"}, groupIDs);
        addFilterGroup.call(this, {id: "navMassSpecFilters", groupName: "Mass Spec"}, ["runName", "scanNumber"]);
        addScrollRightButton.call(this);


        // hide toggle options if no point in them being there (i.e. no between / self link toggle if only 1 protein)
        if (this.options.hide) {
            const entries = d3.entries(this.options.hide);
            const hideEntries = entries.filter(function (entry) {
                return entry.value;
            });
            const hideEntrySet = d3.set(_.pluck(hideEntries, "key"));
            mainDivSel.selectAll(".filterItem")
                .filter(function (d) {
                    return hideEntrySet.has(d.id);
                })
                .style("display", "none");
        }

        this.displayEventName = viewOptions.displayEventName;

        this.listenTo(this.model, "change", this.setInputValuesFromModel);

        mainDivSel.selectAll(".filterControlGroup").classed("noBreak", true);

        this.model.trigger("change", this.model, {
            showHide: true
        }); // Forces first call of setInputValuesFromModel
        this.processModeChanged();
    },

    // Add a text-based filter widget to a d3 selection, using the attached data
    addTextFilter: function (d3sel) {
        const textFilter = d3sel
            .attr("title", function (d) {
                return d.tooltip ? d.tooltip : undefined;
            })
            .append("label");
        textFilter.append("span")
            .text(function (d) {
                return d.label;
            });
        const tfilters = textFilter.append("input")
            .attr("class", "filterTypeText")
            .attr("type", function (d) {
                return d.overrideType || "text";
            })
            .attr("size", function (d) {
                return d.chars;
            });

        // add patterns to inputs that have them
        const patterns = this.model.patterns;
        tfilters.filter(function (d) {
            return patterns[d.id];
        })
            .attr("pattern", function (d) {
                return patterns[d.id];
            });
    },

    addNumberFilter: function (d3sel) {
        const numberFilter = d3sel
            .attr("title", function (d) {
                return d.tooltip ? d.tooltip : undefined;
            })
            .append("label");
        numberFilter.append("span")
            .text(function (d) {
                return d.label;
            });
        numberFilter.append("p").classed("cutoffLabel", true).append("span").html(function (d) {
            return d.inequality;
        });

        const self = this;
        numberFilter.append("input")
            .attr({
                class: "filterTypeNumber",
                type: "number",
                min: function (d) {
                    return self.model.getMinExtent(d.id);
                },
                max: function (d) {
                    return self.model.getMaxExtent(d.id);
                },
            })
            .filter(function (d) {
                return d.chars !== undefined;
            })
            .style("width", function (d) {
                return d.chars + "em";
            });
    },


    // toggle filter
    addBooleanFilter: function (d3sel) {
        const toggle = d3sel
            .attr("id", function (d) {
                return "toggles_" + d.id;
            })
            .attr("title", function (d) {
                return d.tooltip ? d.tooltip : undefined;
            })
            .append("label");
        toggle.append("span")
            .text(function (d) {
                return d.label;
            });
        toggle.append("input")
            .attr("class", function (d) {
                return d.inputClass || "filterTypeToggle";
            })
            .attr("type", function (d) {
                return d.overrideType || "checkbox";
            })
            .filter(function (d) {
                return d.name;
            })
            .attr("name", function (d) {
                return d.name;
            });
    },

    datumFromTarget: function (target) {
        return d3.select(target).datum() || {};
    },

    processBooleanFilter: function (evt) {
        // alert("hello?");
        const target = evt.target;
        const data = this.datumFromTarget(target);
        const id = data.id;
        if (id == "crosslinks") {
            d3.select("#crosslinkGroup").style("display", target.checked ? "flex" : "none");
            const selfLinksShown = this.model.get("selfLinks");
            d3.select("#self").style("display", target.checked && selfLinksShown? "flex" : "none");
        }
        if (id == "selfLinks") {
            d3.select("#self").style("display", target.checked ? "flex" : "none");
        }
        this.model.set(id, target.checked);
    },

    processTextFilter: function (evt) {
        const target = evt.target;
        if (evt.target.checkValidity()) {
            const data = this.datumFromTarget(target);
            this.model.set(data.id, target.value);
        }
    },

    processGroupToggleFilter: function (evt) {
        const target = evt.target;
        const data = this.datumFromTarget(target);

        if (data) {
            const current = d3.set(this.model.get("searchGroups"));
            current[target.checked ? "add" : "remove"](data.id);
            this.model.set("searchGroups", current.values());
        }
    },

    processNumberFilter: function (evt) {
        const target = evt.target;
        const data = this.datumFromTarget(target);
        const id = data.id;
        const value = target.value;
        if (this.model.get(id) != value) {
            this.model.set(id, value);
        }
    },

    processModeChanged: function () {
        const checked = d3.select(this.el).selectAll("input[name='modeSelect']").filter(":checked");
        if (checked.size() === 1) {
            const fdrMode = checked.datum().id === "fdrMode";
            this.model.set({
                fdrMode: fdrMode,
                manualMode: !fdrMode
            });
        }
    },

    setInputValuesFromModel: function (model, options) {
        options = options || {};
        model = model || this.model;

        const mainDiv = d3.select(this.el);

        mainDiv.selectAll("input.filterTypeText, input.filterTypeNumber")
            .property("value", function (d) {
                return model.get(d.id);
            });
        mainDiv.selectAll("input.modeToggle, input.filterTypeToggle")
            .property("checked", function (d) {
                return Boolean(model.get(d.id));
            });
        const groupSet = d3.set(model.get("searchGroups"));
        mainDiv.selectAll("input.groupToggleFilter")
            .property("checked", function (d) {
                return Boolean(groupSet.has(d.id));
            });

        // hide parts of the filter panel if mode (manual/fdr) setting has changed, or if setInputValuesFromModelcalled directly (change is empty)
        if (options.showHide || model.changed.manualMode !== undefined || model.changed.fdrMode !== undefined) {
            const fdrMode = model.get("fdrMode");
            const d3el = d3.select(this.el);
            d3el.selectAll("#validationStatus, #matchScore").style("display", fdrMode ? "none" : null);
            d3el.selectAll("#fdrPanelHolder").style("display", fdrMode ? null : "none");
            if (fdrMode == true) {
                this.model.set("ambig", false);
            }
            d3el.select("#toggles_ambig").property("disabled", fdrMode == true);

            // hide groups control if only 1 group
            d3el.select("#groupFilters").style("display", this.model.possibleSearchGroups && this.model.possibleSearchGroups.length < 2 ? "none" : null);
            d3el.select("#distanceFilter").style("display", this.model.distanceExtent[0] == undefined ? "none" : null);    // == matches null as well
        }
    },

    render: function () {
        return this;
    }
});

//todo - move to separate file?
export const FDRViewBB = Backbone.View.extend({
    initialize: function () {

        const chartDiv = d3.select(this.el);
        chartDiv.html("<div class='fdrCalculation'><p>Basic link-level FDR calculation</p><span></span></div>");
        const self = this;
        const options = [0.01, 0.05, 0.1, 0.2, 0.5 /*, undefined*/];
        const labelFunc = function (d) {
            return d === undefined ? "Off" : d3.format("%")(d);
        };

        chartDiv.select("span").selectAll("label.fixed").data(options)
            .enter()
            .append("label")
            .classed("horizontalFlow fixed", true)
            .append("span")
            .attr("class", "noBreak")
            .text(labelFunc)
            .append("input")
            .attr("type", "radio")
            .attr("value", function (d) {
                return d;
            })
            .attr("name", "fdrPercent")
            .on("click", function (d) {
                self.model.set("fdrThreshold", d);
            });
        chartDiv.select("span")
            .append("label")
            .attr("class", "horizontalFlow noBreak2")
            .append("span")
            .attr("class", "noBreak")
            .text("Other %")
            .append("input")
            .attr("type", "number")
            .attr("min", this.model.getMinExtent("fdrThreshold"))
            .attr("max", this.model.getMaxExtent("fdrThreshold"))
            .attr("step", 1)
            .attr("class", "fdrValue")
            .on("change", function () { // "input" activates per keypress which knackers typing in anything >1 digit
                self.model.set("fdrThreshold", (+this.value) / 100);
            });
        this.listenTo(this.model, "change:fdrThreshold", this.setInputValuesFromModel);
        this.model.trigger("change:fdrThreshold", this.model);

        return this;
    },

    setInputValuesFromModel: function (model) {
        model = model || this.model;
        const fdrThreshold = model.get("fdrThreshold");
        const d3el = d3.select(this.el);
        //d3el.style("display", model.get("fdrMode") ? null : "none");
        d3el.selectAll("input[name='fdrPercent']").property("checked", function (d) {
            return d === fdrThreshold;
        });
        d3el.selectAll(".fdrValue").property("value", function () {
            return fdrThreshold * 100;
        });
    }
});


export const ProteinSummaryViewBB = Backbone.View.extend({
    events: {},

    initialize: function () {
        this.listenTo(this.model, "filteringDone", this.render)
            .render();
    },

    render: function () {
        const model = this.model;
        let summaryHtmlString = "Proteins: " + model.get("proteinCount") + "<br/>";
        summaryHtmlString += "PPIs: " + model.get("ppiCount") + "<br/>";
        summaryHtmlString += "Het. links: " + model.get("hetLinkCount") + "<br/>";
        summaryHtmlString += "Self links: " + model.get("selfLinkCount");
        const pSel = d3.select(this.el);
        pSel.html(summaryHtmlString);
        return this;
    },
});


export const FilterSummaryViewBB = Backbone.View.extend({
    events: {},

    initialize: function () {
        const targetTemplateString = "Post-Filter: <strong><%= targets %></strong> of <%= possible %> TT Cross-Links";
        this.targetTemplate = _.template(targetTemplateString);
        this.allTemplate = _.template(targetTemplateString + " ( + <%= decoysTD %> TD; <%= decoysDD %> DD Decoys)");

        this.listenTo(this.model, "filteringDone", this.render)
            .render();
    },

    render: function () {
        const commaFormat = d3.format(",");
        const model = this.model;
        const decoysPresent = model.get("clmsModel").get("decoysPresent");
        const variables = {
            targets: commaFormat(model.getFilteredCrossLinks().length),
            decoysTD: commaFormat(model.getFilteredCrossLinks("decoysTD").length),
            decoysDD: commaFormat(model.getFilteredCrossLinks("decoysDD").length),
            possible: commaFormat(model.get("TTCrossLinkCount"))
        };

        d3.select(this.el).html((decoysPresent ? this.allTemplate : this.targetTemplate)(variables));
        return this;
    },
});

export const FDRSummaryViewBB = Backbone.View.extend({
    events: {},

    initialize: function () {
        const fdrTypes = ["interFdrCut", "intraFdrCut"];
        d3.select(this.el).selectAll("p").data(fdrTypes)
            .enter()
            .append("p")
            .attr("class", function (d) {
                return d + "Elem";
            });

        this.pctFormat = d3.format("%");

        this.listenTo(this.model, "filteringDone", this.render)
            .render();
    },

    render: function () {
        const fdrTypes = {
            "interFdrCut": "Between",
            "intraFdrCut": "Within"
        };

        const filterModel = this.model.get("filterModel");
        const threshold = filterModel.get("fdrThreshold");
        const fdrMode = filterModel.get("fdrMode");

        const clmsModel = this.model.get("clmsModel");
        const singleTargetProtein = clmsModel.targetProteinCount < 2;
        const decoysPresent = clmsModel.get("decoysPresent");

        const self = this;

        d3.select(this.el).selectAll("p")
            .text(function (d, i) {
                if (fdrMode) {
                    const cut = filterModel.get(d);
                    return "• " + fdrTypes[d] + " score cutoff for " + self.pctFormat(threshold) + " is " + (cut ? cut.toFixed(2) : cut);
                } else {
                    if (i === 0 && decoysPresent) {
                        const roughFDR = (self.model.getFilteredCrossLinks("decoysTD").length - self.model.getFilteredCrossLinks("decoysDD").length) / (self.model.getFilteredCrossLinks().length || 1);
                        return "• Apparent link-level FDR: " + self.pctFormat(roughFDR);
                    }
                    return "";
                }
            })
            // Hide between protein score if only 1 real protein (will always be an undefined score)
            .style("display", function (d) {
                return fdrMode && decoysPresent && d === "interFdrCut" && singleTargetProtein ? "none" : null;
            });

        return this;
    },
});

//      a view of the filter model state
//
//      Martin Graham, Colin Combe, Rappsilber Laboratory, 2015
//
//      js/filterViewBB.js

var CLMSUI = CLMSUI || {};

CLMSUI.FilterViewBB = Backbone.View.extend({
    tagName: "span",
    className: "filterGroup",
    events: {
        "change input.modeToggle": "processModeChanged",
        "input input.filterTypeText": "processTextFilter",
        "keyup input.filterTypeNumber": "processNumberFilter",
        "mouseup input.filterTypeNumber": "processNumberFilter",
        "click input.filterTypeToggle": "processBooleanFilter",
        "click input.groupToggleFilter": "processGroupToggleFilter",
        "dblclick button.filterReset": function() {
            this.model.resetFilter();
        },
    },

    initialize: function(viewOptions) {
        var defaultOptions = {
            config: [
                {
                    label: "Manual",
                    id: "manualMode",
                    tooltip: "Filter using crosslink metadata",
                },
                {
                    label: "FDR",
                    id: "fdrMode",
                    tooltip: "Filter using a False Discovery Rate cutoff",
                },
                {
                    label: "Linear",
                    id: "linears",
                    tooltip: "Show linear peptides",
                },
                {
                    label: "Monolinks",
                    id: "monolinks",
                    tooltip: "Show monolinks",
                },
                {
                    label: "Crosslinks",
                    id: "crosslinks",
                    tooltip: "Show crosslinks",
                },
                {
                    label: "Ambig.",
                    id: "ambig",
                    tooltip: "Show ambiguous crosslinks",
                },
                {
                    label: "Heteromeric",
                    id: "betweenLinks",
                    tooltip: "Show crosslinks between different proteins",
                },
                {
                    label: "Self",
                    id: "selfLinks",
                    tooltip: "Show crosslinks between the same protein",
                },
                {
                    label: "Homomultimeric",
                    id: "homomultimericLinks",
                    tooltip: "Show crosslinks with overlapping linked peptides",
                },
                {
                    label: "AA apart",
                    id: "aaApart",
                    tooltip: "Only show crosslinks separated by at least N amino acids e.g. 10",
                    inequality: "&ge;",
                },
                {
                    label: "Pep. length",
                    id: "pepLength",
                    tooltip: "Only show crosslinks where both linked peptides are at least N amino acids long e.g. 4",
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
                    label: "?",
                    id: "Q"
                },
                {
                    label: "Auto",
                    id: "AUTO",
                    tooltip: "Show autovalidated crosslinks"
                },
                {
                    label: "Unval.",
                    id: "unval",
                    tooltip: "Show unvalidated crosslinks"
                },
                {
                    label: "Decoy",
                    id: "decoys",
                    tooltip: "Show passing decoy crosslinks"
                },
                {
                    label: "Pep Seq",
                    id: "pepSeq",
                    chars: 7,
                    tooltip: "Filter to crosslinks with matches whose linked peptides include this AA sequence at either end e.g. FAKR, or define both ends e.g. FAKR-KKE",
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
                    tooltip: "Filter to crosslinks with matches whose run name includes this text e.g. 07_Lumos"
                },
                {
                    label: "Scan",
                    id: "scanNumber",
                    chars: 5,
                    tooltip: "Filter to crosslinks with matches with this scan number e.g. 44565",
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
        defaultOptions.searchGroupToggles = this.model.possibleSearchGroups.map (function (group) {
            return {
                id: group,
                label: group,
                tooltip: "Pass matches from Group "+group,
                inputClass: "groupToggleFilter",
                type: "boolean",
            };
        });
        defaultOptions.config.push.apply (defaultOptions.config, defaultOptions.searchGroupToggles);

        // Make options into a map referenced by filter attribute id
        this.configMap = d3.map (defaultOptions.config, function(d) { return d.id; });

        ["manualMode", "fdrMode"].forEach (function (item) {
            var entry = this.configMap.get(item);
            entry.overrideType = "radio";
            entry.inputClass = "modeToggle";
            entry.name = "modeSelect";
        }, this);

        this.options = _.extend(defaultOptions, viewOptions.myOptions || {});

        var self = this;

        // this.el is the dom element this should be getting added to, replaces targetDiv
        var mainDivSel = d3.select(this.el);


        function makeFilterControlDiv (options) {
            options = options || {};
            var div = mainDivSel.append("div").attr("class", "filterControlGroup").style("display", options.hide ? "none" : null);
            if (options.id) { div.attr("id", options.id); }

            if (options.expandable !== false) {
                var setPanelState = function (divSel, collapsed) {
                    divSel.select(".filterControlSpan").style ("display", collapsed ? "none" : null);
                    divSel
                        .select(".verticalTextContainer")
                        .attr("title", (collapsed ? "Expand" : "Collapse") + " this filter section")
                        .select(".verticalText")
                        .text ((collapsed ? "+ " : "- ") + options.groupName)
                    ;
                };

                div.append("div")
                    .attr ("class", "verticalTextContainer btn-1a")
                    .on("click", function() {
                        var div = d3.select(this.parentNode);
                        var panel = div.select(".filterControlSpan");
                        var collapse = panel.style("display") !== "none";
                        div.call (setPanelState, collapse);
                    })
                    .append ("div")
                        .attr ("class", "verticalText")
                ;

                div.call (setPanelState, false);
            }

            var nestedDiv = div.append ("div").attr("class", "filterControlSpan");
            if (options.class) { nestedDiv.classed (options.class, true); }
            return nestedDiv;
        }



        function initResetGroup() {
            var resetDivSel = makeFilterControlDiv ({class: "verticalFlexContainer", expandable: false});
            resetDivSel.append("p").attr("class", "smallHeading").text("Filter Bar");
            resetDivSel.append("button")
                .attr("class", "filterReset btn btn-1a btn-tight")
                .attr("title", "Double-click to reset filter to originally set values")
                .text("Reset")
            ;
        }


        function addFilterGroup (config, filterIDs) {
            var divSel = makeFilterControlDiv (config);
            var filters = filterIDs.map (function (id) { return this.configMap.get(id); }, this);
            var self = this;
            divSel.selectAll("div.filterItem")
                .data(filters, function(d) {
                    return d.id;
                })
                .enter()
                .append("div")
                .attr ("class", "filterItem")
                .each (function (d) {
                    var type = d.type || self.model.types[d.id];
                    if (type === "boolean") {
                        self.addBooleanFilter (d3.select(this));
                    }
                    else if (type === "number") {
                        self.addNumberFilter (d3.select(this));
                    }
                    else {
                        self.addTextFilter (d3.select(this));
                    }
                })
            ;
        }


        function initMinigramFilterGroup (config) {
            if (config && config.attr) {
                var cutoffDivSel = makeFilterControlDiv (config);

                var sliderSection = cutoffDivSel.append("div").attr("class", "scoreSlider");
                // Can validate template output at http://validator.w3.org/#validate_by_input+with_options
                var tpl = _.template("<div><p>"+config.label+"</p><P class='vmin cutoffLabel'><span>&gt;</span></P><P>Min</P></div><div id='<%= eid %>'></div><div><p>"+config.label+"</p><P class='cutoffLabel vmax'><span>&lt;</span></P><P>Max</P></div><div class='undef'></div>");
                sliderSection.html(tpl({
                    eid: self.el.id + config.id + "SliderHolder"
            }));
            // sliderSection.style('display', (self.model.get("scores") === null) ? 'none' : null);
            sliderSection.selectAll("p.cutoffLabel")
                .attr("title", function() {
                    var isMinInput = d3.select(this).classed("vmin");
                        return config.tooltipIntro+" " + (isMinInput ? "less than" : "greater than") + " X e.g. " + (isMinInput ? "8.0" : "20.0");
                })
                .append("input")
                .attr({
                    type: "number",
                        step: config.step || 0.1,
                    //min: 0,
                })
                .property("value", function() {
                    var isMinInput = d3.select(this.parentNode).classed("vmin");
                        var cutoff = self.model.get(config.attr);
                    var val = cutoff[isMinInput ? 0 : 1];
                    return val !== undefined ? val : "";
                })
                .on("change", function() { // "input" activates per keypress which knackers typing in anything >1 digit
                    //console.log ("model", self.model);
                    var val = +this.value;
                    var isMinInput = d3.select(this.parentNode).classed("vmin");
                        var cutoff = self.model.get(config.attr);
                        var extent = self.model[config.extentProperty];
                    // take new values, along with score extents, sort them and discard extremes for new cutoff settings
                        var newVals = [isMinInput ? val : (cutoff[0] !== undefined ? cutoff[0] : extent[0]),
                                isMinInput ? (cutoff[1] !== undefined ? cutoff[1] : extent[1]) : val,
                                extent[0], extent[1]
                        ]
                        .filter(function(v) {
                            return v !== undefined;
                        })
                        .sort(function(a, b) {
                            return a - b;
                        });
                    //console.log ("newVals", newVals);
                    newVals = newVals.slice((newVals.length / 2) - 1, (newVals.length / 2) + 1);

                        self.model.set (config.attr, newVals);
                    })
                ;

                if (config.undefAttr) {
                    var cbox = new CLMSUI.utils.checkBoxView({
                        el: sliderSection.select("div.undef").node(),
                        model: self.model,
                        myOptions: {
                            toggleAttribute: config.undefAttr,
                            id: self.el.id + config.undefAttr,
                            label: "Ø"
                        },
                    });
                    d3.select(cbox.$el[0])
                        .attr("title", "Show Cross-Links of Unknown "+config.label)
                        .select("label").classed("btn", false)
                    ;
                }

                this.listenTo (this.model, "change:"+config.attr, function (model, val) {
                    sliderSection.select(".vmin input").property("value", val[0]); // min label
                    sliderSection.select(".vmax input").property("value", val[1]); // max label
                });
                    }
        }


        function initFDRPlaceholder() {
            //following may not be best practice, its here to get the placeholder divs in the right place in the filter div (the grey bar at bottom)
            var fdrPanel = makeFilterControlDiv ({id: "fdrPanelHolder", groupName: "FDR"});
            fdrPanel.attr("id", "fdrPanel");
        }


        function addScrollRightButton() {
            var fixedBox = mainDivSel
                .append("div")
                .attr("class", "fixedBottomRight");

            var button = fixedBox
                .append("button")
                .attr("class", "tallButton btn btn-1a btn-tight")
                .attr("title", "Press to show currently off-screen filter controls")
                .on("click", function() {
                    var right = mainDivSel.style("right");
                    var rightSet = right === "20px";
                    mainDivSel.style("right", rightSet ? "auto" : "20px");

                    d3.select(this).select("i").attr("class", rightSet ? "fa fa-angle-double-right" : "fa fa-angle-double-left");
                })
            ;

            button.append("i")
                .attr("class", "fa fa-angle-double-right");
        }

        var groupIDs = _.pluck(defaultOptions.searchGroupToggles, "id");
        groupIDs.push ("multipleGroup");

        initResetGroup.call(this);
        addFilterGroup.call (this, {id: "filterModeDiv", groupName: "Mode"}, ["manualMode", "fdrMode"]);
        addFilterGroup.call (this, {groupName: "Crosslinks"}, ["linears", "crosslinks", "ambig", "betweenLinks", "selfLinks", "homomultimericLinks", "aaApart", "pepLength"]);
        initMinigramFilterGroup.call(this, {attr: "distanceCutoff", extentProperty: "distanceExtent", undefAttr: "distanceUndef", label: "Distance", id: "distanceFilter", groupName: "Distances", tooltipIntro: "Filter out crosslinks with distance"});
        addFilterGroup.call (this, {id: "validationStatus", groupName: "Auto Val"}, ["A", "B", "C", "Q", "AUTO", "unval", "decoys"]);
        initMinigramFilterGroup.call(this, {attr: "matchScoreCutoff", extentProperty: "scoreExtent", label: "Match Score", id: "matchScore", groupName: "Scores", tooltipIntro: "Filter out matches with scores"});
        initFDRPlaceholder.call(this);
        addFilterGroup.call (this, {id: "navFilters", groupName: "Protein"}, ["pepSeq", "protNames", "protDesc", "protPDB"]);
        addFilterGroup.call (this, {id: "navMassSpecFilters", groupName: "Mass Spec"}, ["runName", "scanNumber"]);
        addFilterGroup.call (this, {id: "groupFilters", groupName: "Groups"}, groupIDs);
        addFilterGroup.call (this, {id: "navNumberFilters", groupName: "PPI"}, ["urpPpi"]);
        addScrollRightButton.call(this);


        // hide toggle options if no point in them being there (i.e. no between / self link toggle if only 1 protein)
        if (this.options.hide) {
            var entries = d3.entries(this.options.hide);
            var hideEntries = entries.filter(function(entry) {
                return entry.value;
            });
            var hideEntrySet = d3.set(_.pluck(hideEntries, "key"));
            mainDivSel.selectAll(".filterItem")
                .filter(function(d) {
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
        var textFilter = d3sel
            .attr("title", function(d) {
                return d.tooltip ? d.tooltip : undefined;
            })
            .append("label")
        ;
        textFilter.append("span")
            .text(function(d) {
                return d.label;
            })
        ;
        var tfilters = textFilter.append("input")
            .attr("class", "filterTypeText")
            .attr("type", function (d) { return d.overrideType || "text"; })
            .attr("size", function(d) {
                return d.chars;
            })
        ;

        // add patterns to inputs that have them
        var patterns = this.model.patterns;
        tfilters.filter(function(d) {
                return patterns[d.id];
            })
            .attr("pattern", function(d) {
                return patterns[d.id];
            })
        ;
    },

    addNumberFilter: function (d3sel) {
        var numberFilter = d3sel
            .attr("title", function(d) {
                return d.tooltip ? d.tooltip : undefined;
            })
            .append("label")
        ;
        numberFilter.append("span")
            .text(function(d) {
                return d.label;
            })
        ;

        numberFilter.append("p").classed("cutoffLabel", true).append("span").html(function(d) { return d.inequality; });

        var self = this;
        numberFilter.append("input")
            .attr({
                class: "filterTypeNumber",
                type: "number",
                min: function(d) { return self.model.getMinExtent (d.id); },
                max: function(d) { return self.model.getMaxExtent (d.id); },
            })
            .filter(function(d) { return d.chars !== undefined; })
            .style ("width", function (d) {
                return d.chars + "em";
            })
        ;
    },


    // toggle filter
    addBooleanFilter: function (d3sel) {
        var toggle = d3sel
            .attr("id", function(d) {
                return "toggles_" + d.id;
            })
            .attr("title", function(d) {
                return d.tooltip ? d.tooltip : undefined;
            })
            .append("label")
        ;
        toggle.append("span")
            .text(function(d) {
                return d.label;
            })
        ;
        toggle.append("input")
            .attr("class", function(d) {
                return d.inputClass || "filterTypeToggle";
            })
            .attr("type", function(d) { return d.overrideType || "checkbox"; })
            .filter(function (d) { return d.name; })
            .attr("name", function (d) { return d.name; })
        ;
    },

    datumFromTarget: function (target) {
        return d3.select(target).datum() || {};
    },

    processBooleanFilter: function (evt) {
        var target = evt.target;
        var data = this.datumFromTarget (target);
        var id = data.id;
        if (id == "selfLinks") {
            d3.select("#aaApart").attr("disabled", target.checked ? null : "disabled");
        }
        this.model.set(id, target.checked);
    },

    processTextFilter: function (evt) {
        var target = evt.target;
        if (evt.target.checkValidity()) {
            var data = this.datumFromTarget (target);
            this.model.set (data.id, target.value);
        }
    },

    processGroupToggleFilter: function (evt) {
        var target = evt.target;
        var data = this.datumFromTarget (target);

        if (data) {
            var current = d3.set(this.model.get("searchGroups"));
            current[target.checked ? "add" : "remove"](data.id);
            this.model.set("searchGroups", current.values());
        }
    },

    processNumberFilter: function (evt) {
        var target = evt.target;
        var data = this.datumFromTarget (target);
        var id = data.id;
        var value = target.value;
        if (this.model.get(id) != value) {
            this.model.set(id, value);
        }
    },

    processModeChanged: function() {
        var checked = d3.select(this.el).selectAll("input[name='modeSelect']").filter(":checked");
        if (checked.size() === 1) {
            var fdrMode = checked.datum().id ===  "fdrMode";
            this.model.set({
                fdrMode: fdrMode,
                manualMode: !fdrMode
            });
        }
    },

    setInputValuesFromModel: function (model, options) {
        options = options || {};
        model = model || this.model;

        var mainDiv = d3.select(this.el);

        mainDiv.selectAll("input.filterTypeText, input.filterTypeNumber")
            .property("value", function(d) {
                return model.get(d.id);
            })
        ;

        mainDiv.selectAll("input.modeToggle, input.filterTypeToggle")
            .property("checked", function(d) {
                return Boolean(model.get(d.id));
            })
        ;

        var groupSet = d3.set (model.get("searchGroups"));
        mainDiv.selectAll("input.groupToggleFilter")
            .property("checked", function(d) {
                return Boolean(groupSet.has(d.id));
            })
        ;

        // hide parts of the filter panel if mode (manual/fdr) setting has changed, or if setInputValuesFromModelcalled directly (change is empty)
        if (options.showHide || model.changed.manualMode !== undefined || model.changed.fdrMode !== undefined) {
            var fdrMode = model.get("fdrMode");
            var d3el = d3.select(this.el);
            d3el.selectAll("#validationStatus, #matchScore").style("display", fdrMode ? "none" : null);
            d3el.selectAll("#fdrPanelHolder").style("display", fdrMode ? null : "none");
            if (fdrMode == true) {
                this.model.set("ambig", false);
            }
            d3el.select("#toggles_ambig").property("disabled", fdrMode == true);

            // hide groups control if only 1 group
            d3el.select("#groupFilters").style ("display", this.model.possibleSearchGroups && this.model.possibleSearchGroups.length < 2 ? "none" : null);
            d3el.select("#distanceFilter").style ("display", this.model.distanceExtent[0] == undefined ? "none" : null);    // == matches null as well
        }
    },

    render: function() {
        return this;
    }
});


CLMSUI.FDRViewBB = Backbone.View.extend({
    initialize: function() {

        var chartDiv = d3.select(this.el);
        chartDiv.html("<div class='fdrCalculation'><p>Basic link-level FDR calculation</p><span></span></div>");
        var self = this;
        var options = [0.01, 0.05, 0.1, 0.2, 0.5 /*, undefined*/ ];
        var labelFunc = function(d) {
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
            .attr("value", function(d) {
                return d;
            })
            .attr("name", "fdrPercent")
            .on("click", function(d) {
                self.model.set("fdrThreshold", d);
            })
        ;

        chartDiv.select("span")
            .append("label")
            .attr("class", "horizontalFlow noBreak2")
            .append("span")
            .attr("class", "noBreak")
            .text("Other %")
            .append("input")
            .attr("type", "number")
            .attr("min", this.model.getMinExtent ("fdrThreshold"))
            .attr("max", this.model.getMaxExtent ("fdrThreshold"))
            .attr("step", 1)
            .attr("class", "fdrValue")
            .on("change", function() { // "input" activates per keypress which knackers typing in anything >1 digit
                self.model.set("fdrThreshold", (+this.value) / 100);
            })
        ;

        this.listenTo(this.model, "change:fdrThreshold", this.setInputValuesFromModel);
        this.model.trigger("change:fdrThreshold", this.model);

        return this;
    },

    setInputValuesFromModel: function(model) {
        model = model || this.model;
        var fdrThreshold = model.get("fdrThreshold");
        var d3el = d3.select(this.el);
        //d3el.style("display", model.get("fdrMode") ? null : "none");
        d3el.selectAll("input[name='fdrPercent']").property("checked", function(d) {
            return d === fdrThreshold;
        });
        d3el.selectAll(".fdrValue").property("value", function() {
            return fdrThreshold * 100;
        });
    }
});

CLMSUI.FilterSummaryViewBB = Backbone.View.extend({
    events: {},

    initialize: function() {
        var targetTemplateString = "Post-Filter: <strong><%= targets %></strong> of <%= possible %> TT Cross-Links";
        this.targetTemplate = _.template(targetTemplateString);
        this.allTemplate = _.template(targetTemplateString + " ( + <%= decoysTD %> TD; <%= decoysDD %> DD Decoys)");

        this.listenTo(this.model, "filteringDone", this.render)
            .render()
        ;
    },

    render: function() {
        var commaFormat = d3.format(",");
        var model = this.model;
        var decoysPresent = model.get("clmsModel").get("decoysPresent");
        var variables = {
            targets: commaFormat(model.getFilteredCrossLinks().length),
            decoysTD: commaFormat(model.getFilteredCrossLinks("decoysTD").length),
            decoysDD: commaFormat(model.getFilteredCrossLinks("decoysDD").length),
            possible: commaFormat(model.get("TTCrossLinkCount"))
        };

        d3.select(this.el).html((decoysPresent ? this.allTemplate : this.targetTemplate)(variables));
        return this;
    },
});

CLMSUI.FDRSummaryViewBB = Backbone.View.extend({
    events: {},

    initialize: function() {
        var fdrTypes = ["interFdrCut", "intraFdrCut"];
        d3.select(this.el).selectAll("p").data(fdrTypes)
            .enter()
            .append("p")
            .attr("class", function(d) {
                return d + "Elem";
            });

        this.pctFormat = d3.format("%");

        this.listenTo(this.model, "filteringDone", this.render)
            .render()
        ;
    },

    render: function() {
        var fdrTypes = {
            "interFdrCut": "Between",
            "intraFdrCut": "Within"
        };

        var filterModel = this.model.get("filterModel");
        var threshold = filterModel.get("fdrThreshold");
        var fdrMode = filterModel.get("fdrMode");

        var clmsModel = this.model.get("clmsModel");
        var singleTargetProtein = clmsModel.targetProteinCount < 2;
        var decoysPresent = clmsModel.get("decoysPresent");

        var self = this;

        d3.select(this.el).selectAll("p")
            .text(function(d, i) {
                if (fdrMode) {
                    var cut = filterModel.get(d);
                    return "• " + fdrTypes[d] + " score cutoff for " + self.pctFormat(threshold) + " is " + (cut ? cut.toFixed(2) : cut);
                } else {
                    if (i === 0 && decoysPresent) {
                        var roughFDR = (self.model.getFilteredCrossLinks("decoysTD").length - self.model.getFilteredCrossLinks("decoysDD").length) / (self.model.getFilteredCrossLinks().length || 1);
                        return "• Apparent link-level FDR: " + self.pctFormat(roughFDR);
                    }
                    return "";
                }
            })
            // Hide between protein score if only 1 real protein (will always be an undefined score)
            .style("display", function(d) {
                return fdrMode && decoysPresent && d === "interFdrCut" && singleTargetProtein ? "none" : null;
            });

        return this;
    },
});

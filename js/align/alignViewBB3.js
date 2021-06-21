import * as _ from 'underscore';
import Backbone from "backbone";

import {BaseFrameView} from "../ui-utils/base-frame-view";
import {utils} from "../utils";
import {AlignSettingsViewBB, CollectionAsSelectViewBB} from "./alignSettingsViewBB";

export const AlignCollectionViewBB = BaseFrameView.extend({

        events: function() {
            var parentEvents = BaseFrameView.prototype.events;
            if (_.isFunction(parentEvents)) {
                parentEvents = parentEvents();
            }
            return _.extend({
                "change input.alignRadio": "radioClicked",
                "mouseleave label": "clearTooltip",
            }, parentEvents, {});
        },

        initialize: function(viewOptions) {
            AlignCollectionViewBB.__super__.initialize.apply(this, arguments);

            var topElem = d3.select(this.el);
            var modelViewID = topElem.attr("id") + "IndView";
            var holdingDiv = topElem.append("DIV").attr("class", "alignView");
            var template = _.template("<P><span><%= headerText %></span><span class='alignSortWidget'></span></P><DIV class='checkHolder'></DIV><DIV id='<%= alignModelViewID %>'></DIV><DIV><P class='smallHeading'>Per Protein Settings</P><DIV id='<%= alignControlID %>'></DIV></DIV><DIV><DIV id='<%= alignControlID2 %>'></DIV></DIV>");
            holdingDiv.html(template({
                headerText: "Select Protein Name in Tab for Details",
                alignModelViewID: modelViewID,
                alignControlID: modelViewID + "Controls",
                alignControlID2: modelViewID + "Controls2",
            }));

            // Sort dropdown
            var self = this;
            utils.addMultipleSelectControls({
                addToElem: topElem.select(".alignSortWidget"),
                selectList: ["Sort Tabs By"],
                optionList: this.collection.possibleComparators,
                optionLabelFunc: function(d) {
                    return d.label;
                },
                optionValueFunc: function(d) {
                    return d.compFunc;
                },
                changeFunc: function() {
                    var compFunc, reverse;
                    // cant rely on event.target.value as it returns functions as a string
                    d3.select(d3.event.target)
                        .selectAll("option")
                        .filter(function() {
                            return d3.select(this).property("selected");
                        })
                        .each(function(d) {
                            compFunc = d.compFunc;
                        });
                    self.collection.comparator = compFunc;
                    self.collection.sort();
                    self.render();
                },
                initialSelectionFunc: function(d) {
                    return d.compFunc === self.collection.comparator;
                },
            });

            holdingDiv.selectAll("DIV:not(.checkHolder)").attr("class", "alignSettings");

            this.tooltipModel = viewOptions.tooltipModel;

            this.alignViewBlosumSelector = new CollectionAsSelectViewBB({
                el: "#" + modelViewID + "Controls2",
                collection: window.blosumCollInst,
                label: "Set <a href='https://en.wikipedia.org/wiki/BLOSUM' target='_blank'>BLOSUM</a> Matrix",
                name: "BlosumSelector",
                optionLabelField: "id",
            });

            var firstModel = this.collection.models[0];
            this.setFocusModel(firstModel);

            this.listenTo(this.collection, "bulkAlignChange", function() {
                this.render();
            });
            this.listenTo(this.collection, "change:displayLabel", function(indAlignModel) {
                this.renderTab(indAlignModel);
            });
            return this;
        },

        hollowElement: function(view) {
            view.stopListening(); // remove backbone events bound with listenTo etc 
            $(view.el).off(); // remove dom events
            var a = d3.select(view.el);
            a.selectAll("*").remove(); // remove all elements underneath el
        },

        clearTooltip: function() {
            if (this.tooltipModel) {
                this.tooltipModel.set("contents", null);
            }
            return this;
        },

        setTabContents: function(d) {
            var seqCount = d.get("seqCollection") ? d.get("seqCollection").length : 0;
            return d.get("displayLabel") + (seqCount ? "<span class='alignSeqCount'>" + seqCount + "</span>" : "");
        },

        renderTab: function(indAlignModel) {
            var list = d3.select(this.el).select("DIV.checkHolder");
            var indTab = list.selectAll("span.alignTab").filter(function(d) {
                return (d.id = indAlignModel.get("id"));
            });
            var self = this;
            indTab.select("label").html(self.setTabContents);
        },

        render: function() {
            var models = this.collection.models;

            var topElem = d3.select(this.el);
            var list = topElem.select("DIV.checkHolder");
            var proteins = list.selectAll("span.alignTab").data(models, function(d) {
                return d.id;
            });
            var self = this;

            proteins.exit().remove();

            var pspans = proteins.enter().append("span").attr("class", "alignTab");

            pspans.append("input")
                .attr("class", "alignRadio")
                .attr("type", "radio")
                .attr("name", topElem.attr("id") + "pgroup")
                .attr("id", function(d, i) {
                    return topElem.attr("id") + "pgroup" + i;
                })
                .attr("value", function(d) {
                    return d.id;
                })
                .property("checked", function(d, i) {
                    return i === 0;
                })
            ;

            pspans.append("label")
                .attr("for", function(d, i) {
                    return topElem.attr("id") + "pgroup" + i;
                })
                .on("mouseenter", function(d) {
                    var nformat = d3.format(",d");
                    self.tooltipModel
                        .set("header", d.get("displayLabel"))
                        .set("contents",
                            self.collection.possibleComparators.slice(1).map(function(comp) {
                                return [comp.label, d.get("seqCollection") ? nformat(comp.compFunc(d)) : 0];
                            })
                        )
                        .set("location", d3.event);
                    self.tooltipModel.trigger("change:location");
                });

            // label count can change for existing protein
            proteins.select("label")
                .html(self.setTabContents);

            proteins.order();

            // Hide sort widget if only 1 protein
            topElem.select(".alignSortWidget").style("display", models.length > 1 ? null : "none");

            return this;
        },

        radioClicked: function(evt) {
            var model = this.collection.get(evt.target.value);
            this.setFocusModel(model);
        },

        setFocusModel: function(model) {
            var prevModel = this.modelView ? this.modelView.model : undefined;
            if (prevModel) {
                console.log("old modelView", this.modelView);
                this.alignViewBlosumSelector.stopListening(prevModel);
                this.hollowElement(this.modelView);
                this.hollowElement(this.alignViewSettings);
                //this.modelView.remove();
                //this.alignViewSettings.remove();
            }

            // Safely swap these models in/out, maybe by generating new views altogether
            // http://stackoverflow.com/questions/9271507/how-to-render-and-append-sub-views-in-backbone-js
            // http://stackoverflow.com/questions/8591992/backbone-change-model-of-view
            // http://stackoverflow.com/questions/21411059/backbone-reusable-view-set-new-model-to-existing-view?lq=1

            if (model) {
                //console.log("model", model);
                var modelViewID = d3.select(this.el).attr("id") + "IndView";

                this.modelView = new ProtAlignViewBB({
                    el: "#" + modelViewID,
                    model: model,
                    tooltipModel: this.tooltipModel,
                });

                this.alignViewSettings = new AlignSettingsViewBB({
                    el: "#" + modelViewID + "Controls",
                    model: model,
                });

                console.log("new modelView", this.modelView);

                this.alignViewBlosumSelector
                    .setSelected(model.get("scoreMatrix"))
                    .listenTo(model, "change:scoreMatrix", function(protAlignModel, scoreMatrix) { // and then make it track it thereafter
                        this.setSelected(scoreMatrix);
                    });

                this.modelView.render();
            }
            return this;
        },

        identifier: "Alignment View",
    });

export const ProtAlignViewBB = Backbone.View.extend({
        defaults: {
            defaultSeqShowSetting: 3,
        },

        events: {
            "mouseleave td.seq>span": "clearTooltip",
            "change input.diff": "render",
            "mouseleave th": "clearTooltip",
        },

        initialize: function(viewOptions) {
            this.tooltipModel = viewOptions.tooltipModel;

            var topElem = d3.select(this.el);
            var holdingDiv = topElem.append("DIV").attr("class", "alignView");
            var template = _.template("<P class='proteinName'><%= proteinDescriptor %></P><DIV class='tableWrapper'><TABLE><THEAD><TR><TH><%= firstColHeader %></TH><TH><%= secondColHeader %></TH></TR></THEAD></TABLE><DIV class='seqDiv'><TABLE class='seqTable'></TABLE></DIV></DIV><div class='alignChoiceGroup'></div>");
            holdingDiv.html(template({
                proteinDescriptor: this.model.get("displayLabel"),
                firstColHeader: "Name",
                secondColHeader: "Sequence",
            }));
            var labelData = [{
                    label: "Show differences only",
                    value: 1
                },
                {
                    label: "Show all",
                    value: 3
                },
                {
                    label: "Show similarities only",
                    value: 2
                },
            ];
            d3.select(this.el).select(".alignChoiceGroup").selectAll("label").data(labelData)
                .enter()
                .append("label")
                .text(function(d) {
                    return d.label;
                })
                .append("input")
                .attr("type", "radio")
                .attr("class", "diff")
                .attr("name", "alignChoice")
                .attr("value", function(d) {
                    return d.value;
                });

            d3.select(this.el).select(".alignChoiceGroup input[type=radio][value='" + this.defaults.defaultSeqShowSetting + "']").property("checked", true);
            this.listenTo(this.model.get("seqCollection"), "change:compAlignment", function(affectedSeqModel) {
                this.render({affectedSeqModel: affectedSeqModel});
            });
            this.listenTo(this.model.get("seqCollection"), "remove", function(affectedSeqModel) {
                this.render({affectedSeqModel: affectedSeqModel, affectedAction: "remove"});
            });

            // Listen for change in blosum selection and pass it to model
            this.listenTo(window.blosumCollInst, "blosumModelSelected", function(blosumMatrix) {
                console.log("BLOSUM", this, arguments);
                this.model.set("scoreMatrix", blosumMatrix);
                this.model.collection.bulkAlignChangeFinished();
            });

            this.ellipStr = new Array(10).join("\"");
            //this.ellipStr = new Array(10).join("\u2026");

            return this;
        },

        ellipFill: function(length) {
            var sigfigs = length ? Math.floor(Math.log(length) / Math.LN10) + 1 : 0; // cos Math.log10 non-existent in IE11
            return this.ellipStr.substring(0, sigfigs);
        },

        makeIndexString: function(length, unit) {
            unit = unit || 10;

            var iFillStr = new Array(unit).join(" ");
            iFillStr += "\u2022";
            var segs = [iFillStr];

            for (var n = 1; n < length / unit; n++) {
                var iStr = ((n * unit)).toString();
                var gStr = iFillStr.substr(-(unit - iStr.length));
                segs.push(iStr);
                segs.push(gStr);
            }
            return segs.join("");
        },
        
        // generate other sequence strings from comp object
        stringGeneration: function (seq, showSimilar, showDiff) {
            
            var ellipsisInsert = this.ellipFill.bind(this);

            var MATCH = 0,
                DELETE = 1,
                INSERT = 2,
                VARIATION = 3;
            var classes = ["seqMatch", "seqDelete", "seqInsert", "seqVar"];
            
            var rstr = seq.refStr;
            var str = seq.str;
            //var rstr = "ABC----HIJKLMNOPQR-TUVWXYZABC";
            //var str =  "ABCDEFGHIAKLM-OPQRS-UV----ABC";
            var segments = [];
            var rf = [];
            var streak = MATCH;
            var i = 0,
                ri = 0,
                ci = 0;

            function addSequenceSegment(streakType) {
                if (n) { // don't add zero-length match at start of sequence
                    var oldri = ri;
                    var insert = streakType === INSERT;
                    ri += (insert ? 0 : n - i);

                    var oldci = ci;
                    var deleted = streakType === DELETE;
                    ci += (deleted ? 0 : n - i);

                    var newSegment = {
                        klass: classes[streakType],
                        rstart: oldri,
                        rend: ri + (insert ? 1 : 0),
                        cstart: oldci,
                        cend: ci + (deleted ? 1 : 0),
                        segment: str.substring(i, n)
                    };

                    if ((showDiff && streakType !== MATCH) || (showSimilar && streakType == MATCH)) { // add sequence part
                        rf.push(rstr.substring(i, n));
                        newSegment.segment = str.substring(i, n);
                    } else if (n > i) { // or add ellipses as showDiff / showSimilar flags dictate
                        var ellip = ellipsisInsert(n - i);
                        rf.push(ellip);
                        newSegment.segment = ellip;
                    }

                    segments.push(newSegment);
                    i = n;
                }
            };

            for (var n = 0; n < str.length; n++) {
                var c = str[n];
                var r = rstr[n];
                var rhyphen = (r === "-");
                var chyphen = (c === "-");

                // if AA's are the same, but not currently on a match streak
                if (c === r && streak !== MATCH) {
                    // add previous characters as current streak type
                    addSequenceSegment(streak);
                    streak = MATCH; // set new streak type
                }
                // if AA missing in c, but not currently on a delete streak
                else if (chyphen && streak !== DELETE) {
                    // add previous characters as current streak type
                    addSequenceSegment(streak);
                    streak = DELETE; // set new streak type
                }
                // else if AA missing in ref, but not currently on an insert streak
                else if (rhyphen && streak !== INSERT) {
                    // add previous characters as current streak type
                    addSequenceSegment(streak);
                    streak = INSERT; // set new streak type
                }
                // else if AAs in c and ref different, but not currently on a variation streak
                else if (!chyphen && !rhyphen && c !== r && streak !== VARIATION) {
                    // add previous characters as current streak type
                    addSequenceSegment(streak);
                    streak = VARIATION; // set new streak type
                }
            }

            // deal with remaining sequence when end reached
            addSequenceSegment(streak);
            streak = MATCH;

            seq.decoratedRStr = showSimilar && showDiff ? rstr : rf.join('');
            seq.segments = segments;
            var max = Math.max(seq.str.length, seq.refStr.length);
            seq.indexStr = this.makeIndexString(max, 20).substring(0, max);
        },

        render: function(obj) {
            //console.log ("ALIGNVIEWMODEL RENDER", obj);
            var affectedSeqModel = obj ? obj.affectedSeqModel : undefined;
            var affectedAction = obj ? obj.affectedAction : undefined;  // set to 'remove' if you want to remove this particular sequence from the view
            
            var place = d3.select(this.el).select("table.seqTable"); //.select("tbody");
            var self = this;

            var selectedRadioValue = d3.select(this.el).select("input[name='alignChoice']:checked").property("value");
            // keep this value and set it as a default for this view. Seems OK as this only affects visual output, not the model
            // that is supplying the information. Plus there is only 1 of these views at a time, so changing the defaults doesn't bother any other views.
            this.defaults.defaultSeqShowSetting = +selectedRadioValue;
            var showSimilar = (selectedRadioValue & 2) > 0;
            var showDiff = (selectedRadioValue & 1) > 0;

            // I suppose I could do a view per model rather than this, but it fits the d3 way of doing things
            // remove treated special, because it will be missing from the collection by this point
            var seqModels = (affectedAction === "remove") ? [affectedSeqModel] : this.model.get("seqCollection").filter(function(m) {
                return !affectedSeqModel || (affectedSeqModel.id === m.id);
            });
            //var seqModels = affectedSeqModel ? [affectedSeqModel] : this.model.get("seqCollection").models;
            var comps = seqModels.map (function(seqModel) { return seqModel.get("compAlignment"); });

            var nformat = d3.format(",d");
            var rformat = d3.format(",.2f");
            var scoreFormat = function(val) {
                return val === Number.MAX_VALUE ? "Exact" : nformat(val);
            };

            // add one tbody per alignment
            var tbodybind = place.selectAll("tbody").data(comps, function(d) {
                return d.label;
            });
            if (!affectedSeqModel) { tbodybind.exit().remove(); }   // don't remove other tbodies if only 1 affectedSeqModel passed in.
            else if (affectedAction === "remove") { tbodybind.remove(); return this; }   // but do remove matched tbodies if action is to remove 
            
            tbodybind.enter().append("tbody");
            tbodybind.each (function (d) { 
                self.stringGeneration (d, showSimilar, showDiff);   // calculate sequence strings per comparator sequence model
            });

            // add 2 rows to each tbody
            var rowBind = tbodybind.selectAll("tr")
                .data(function(d) {
                    return [{
                            seqInfo: d,
                            str: d.decoratedRStr,
                            rowLabel: self.model.get("refID"),
                            segments: [{
                                klass: undefined,
                                segment: d.decoratedRStr
                            }]
                        },
                        {
                            seqInfo: d,
                            str: d.decoratedStr,
                            rowLabel: d.label === "Canonical" ? "Uniprot" : d.label,
                            segments: d.segments
                        }
                    ];
                });

            var newRows = rowBind.enter()
                .append("tr");

            // add a th element to each of these rows with sequence name and a tooltip
            newRows.append("th")
                .attr("class", "seqLabel")
                .on("mouseenter", function(d) {
                    var seqInfo = d.seqInfo;
                    self.tooltipModel
                        .set("header", self.model.get("displayLabel"))
                        .set("contents", [
                            ["Align Sequence", d.rowLabel],
                            ["Search Length", nformat(seqInfo.convertFromRef.length)],
                            ["Align Sequence Length", nformat(seqInfo.convertToRef.length)],
                            ["Align Raw Score", scoreFormat(seqInfo.score)],
                            ["Align Bit Score", rformat(seqInfo.bitScore)],
                            ["Align E Score", seqInfo.eScore],
                            ["Align Avg Bit Score", seqInfo.avgBitScore],
                        ])
                        .set("location", d3.event);
                    self.tooltipModel.trigger("change:location");
                });

            // add a td element and a child span element to each row
            newRows.append("td")
                .attr("class", "seq")
                .append("span");

            // update th element with row label
            rowBind.select("th") // .select rather than .selectAll pushes changes in datum on existing rows in rowBind down to the th element
                .html(function(d) {
                    return d.rowLabel;
                });

            var seqTypeLabelMap = {
                "seqMatch": "Matching",
                "seqDelete": "Missing",
                "seqInsert": "Extra",
                "seqVar": "Different"
            };

            // add number of segment spans to each td element according to d.segments
            var segmentSpans = rowBind.select("td > span")
                .selectAll("span")
                .data(function(d) {
                    return d.segments;
                });
            segmentSpans.exit().remove();
            // add tooltip to each segment span
            segmentSpans.enter()
                .append("span")
                .on("mouseenter", function(d) {
                    if (self.tooltipModel && d.klass) {
                        var parent = d3.select(this.parentNode);
                        var parentDatum = parent.datum();
                        var rds = +d.rstart;
                        var rde = +d.rend;
                        var cds = +d.cstart;
                        var cde = +d.cend;
                        var refID = self.model.get("refID");
                        self.tooltipModel
                            .set("header", "Alignment to " + refID)
                            .set("contents", [
                                ["AAs are...", seqTypeLabelMap[d.klass]],
                                [refID + " AA Range", rds >= rde ? "Would be after " + rds : (rds + 1) + " - " + rde], // + 1 for 1-based index	
                                ["This AA Range", cds >= cde ? "Would be after " + cds : (cds + 1) + " - " + cde], // + 1 for 1-based index
                                ["Align Sequence", parentDatum.rowLabel],

                            ])
                            .set("location", d3.event);
                        self.tooltipModel.trigger("change:location");
                    }
                });

            // update segment spans with current data (from d.segments)
            segmentSpans
                .attr("class", function(d) {
                    return d.klass;
                })
                .text(function(d) {
                    return d.segment;
                });

            return this;
        },

        clearTooltip: function() {
            if (this.tooltipModel) {
                this.tooltipModel.set("contents", null);
            }
            return this;
        },
    });
import * as _ from 'underscore';
import Backbone from "backbone";
import * as $ from "jquery";

import {BaseFrameView} from "../ui-utils/base-frame-view";

export const AlignSettingsViewBB = Backbone.View.extend({
        events: {
            "change input": "inputChanged",
            "keyup input": "inputKeyed",
            "change select": "selectChanged",
            "input input": "inputChanged",
        },

        initialize: function(viewOptions) {
            var controls = d3.select(this.el);
            var inputArray = [{
                    label: "Set Gap Open Penalty",
                    prop: "gapOpenScore",
                    type: "number",
                    min: 0,
                    max: 20
                },
                {
                    label: "Set Gap Extend Penalty",
                    prop: "gapExtendScore",
                    type: "number",
                    min: 0,
                    max: 10
                },
                //{label: "Score Matrix", prop:"scoreMatrix", type:"select", options: this.model.scoreMatrices },
            ];
            var inputSel = controls.selectAll("div.controlBlock")
                .data(inputArray, function(d) {
                    return d.prop;
                });
            var inputElems = inputSel.enter()
                .append("div")
                .attr("class", "controlBlock");
            inputElems.append("label").text(function(d) {
                return d.label;
            });
            //inputElems.append("input").attr("type",function(d) { return d.type; });

            inputElems.each(function(datum) {
                if (datum.type !== "select") {
                    d3.select(this).append("input")
                        .attr("type", datum.type)
                        .attr("min", datum.min)
                        .attr("max", datum.max)
                        .attr("title", "Permitted values: " + datum.min + " to " + datum.max);;
                } else {
                    var seli = d3.select(this).append("select").attr("name", datum.prop);
                    seli.selectAll("option").data(datum.options)
                        .enter()
                        .append("option")
                        .attr("value", function(d) {
                            return d.key;
                        })
                        .text(function(d) {
                            return d.key;
                        });
                }
            });

            this
                .listenTo(this.model, "change:compAlignment", this.render)
                .render();

            return this;
        },

        render: function() {
            var self = this;
            d3.select(this.el)
                .selectAll("div.controlBlock input")
                .attr("value", function(d) {
                    return self.model.get(d.prop);
                });
            return this;
        },

        inputChanged: function(evt) {
            if (evt.target.checkValidity()) {
                var control = d3.select(evt.target);
                var controlDatum = control.datum();
                this.model.set(controlDatum.prop, controlDatum.type === "number" ? +control.property("value") : control.property("value"));
                // previous set will cause all sequences in this model to recalc
                // this line inform views that wish to know of such events at a bulk level, rather than individually
                this.model.collection.bulkAlignChangeFinished();
            }
        },

        inputKeyed: function(evt) {
            var key = evt.which || evt.keyCode || 0;
            if (key === 13) {
                this.inputChanged(evt);
            }
        },

        selectChanged: function(evt) {
            var control = d3.select(evt.target);
            var controlDatum = control.datum();
            var selectedOption = control.selectAll("option")
                .filter(function(d, i) {
                    return i == control.property("selectedIndex");
                });
            this.model.set(controlDatum.prop, selectedOption.datum().value); // actual matrix dataset is stored in d3 data, not in html option attributes
            // previous set will cause all sequences in this model to recalc
            // this line inform views that wish to know of such events at a bulk level, rather than individually
            this.model.collection.bulkAlignChangeFinished();
        }
    });

export const CollectionAsSelectViewBB = Backbone.View.extend({
        events: {
            "change select": "selectChanged",
        },
        
        initialize: function (viewOptions) {
            this.options = $.extend ({optionLabelField: "name", label: "label", name: "name"}, viewOptions);
            var topElem = d3.select(this.el).append("DIV").attr("class", "controlBlock");
            var tpl = _.template ("<LABEL><%= label %></LABEL><SELECT name='<%= name %>'></SELECT>");
            topElem.html (tpl ({label: viewOptions.label, name: viewOptions.name})); 
            
            this
                .listenTo(this.collection, "sync", function() {
                    console.log("Collection fetched and synced for view", this);
                    this.render();
                })
                // If collection has fetched quickly then the sync event maybe fired before we registered the listener
                // above, thus we add an immediate this.render() afterwards as a safety net
                .render();
            return this;
        },

        render: function() {
            console.log("blosum select control rerendering");
            var self = this;

            var options = d3.select(this.el).select("select").selectAll("option")
                .data(this.collection.models, function(d) {
                    return d.cid;
                });

            options
                .enter()
                .append("option")
                .attr("value", function(d) { return d.cid; })  
                // because d will be a Backbone Model we use the .get notation to get attribute values
                .text (function(d) { return d.get(self.options.optionLabelField); })
            ;
            
            options.property ("selected", function(d) { return d.cid == self.lastSelected; });
            
            options.exit().remove();

            return this;
        },

        // In case the selected score matrix is set from another view or model, we should reflect that choice here
        setSelected: function(aModel) {
            console.log("aModel", aModel);
            if (aModel && aModel.cid !== this.lastSelected) {
                this.lastSelected = aModel.cid;
                this.render();
            }
            return this;
        },

        selectChanged: function(evt) {
            var control = d3.select(evt.target);
            var selectedOption = control.selectAll("option").filter(function() {
                return this.selected;
            });
            this.collection.trigger("blosumModelSelected", selectedOption.datum());
        }
    });

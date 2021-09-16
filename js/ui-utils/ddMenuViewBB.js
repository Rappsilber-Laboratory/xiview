// eslint-disable-next-line no-unused-vars
import * as css from "../../css/ddMenuViewBB.css";
import * as _ from 'underscore';
import Backbone from "backbone";
import * as $ from "jquery";

import {makeLegalFileName, searchesToString, updateAnnotationColourKey, utils} from "../utils";
import {checkBoxView} from "./checkbox-view";
import {svgUtils} from "../svgexp";
import d3 from "d3";
import {download} from "../downloads";

export const DropDownMenuViewBB = Backbone.View.extend({
    events: {
        "mouseenter .menuTitle": "switchVis",
        "click .menuTitle": "toggleVis",
        "click li": "menuSelection",
        // martin - i had to add another event here to listen to key presses in the text input,
        // or we do without refreshes on key presses, or maybe theres a better way you know of...
        "keyup li > input": "menuSelection",
    },

    initialize: function(viewOptions) {
        const emptyFunc = function () {
        };
        const defaultOptions = {
            title: "A DD Menu",
            closeOnClick: true,
            menu: [ // emptying this coz you may now breifly see it in load layout menu
                //   {
                //     name: "Wazzup",
                //     func: emptyFunc
                // }, {
                //     name: "Buddy",
                //     func: emptyFunc
                // }
            ],
            groupByAttribute: "group",
            labelByAttribute: "name",
            toggleAttribute: "state",
            sectionHeader: function () {
                return "";
            },
        };
        this.options = _.extend(defaultOptions, viewOptions.myOptions);
        const self = this;

        // this.el is the dom element this should be getting added to, replaces targetDiv
        d3.select(this.el)
            .attr("class", "btn dropdown")
            .call(function(sel) {
                if (self.options.classed) {
                    sel.classed(self.options.classed, true);
                }
            })
            .append("span")
            .attr("class", "menuTitle");

        d3.select(this.el).append("div").append("ul");

        this
            .updateTitle(this.options.title)
            .updateTooltip(this.options.titleTooltip)
            .update()
            .render();
        return this;
    },

    updateTitle: function(newTitle) {
        this.options.title = newTitle;
        d3.select(this.el).select("span.menuTitle").text(this.options.title);
        return this;
    },

    updateTooltip: function(tooltipObj) {
        if (tooltipObj && this.options.tooltipModel) {
            const self = this;
            d3.select(this.el).select("span.menuTitle")
                .on("mouseenter", function() {
                    self.options.tooltipModel
                        .set("header", tooltipObj.header)
                        .set("contents", tooltipObj.contents)
                        .set("location", d3.event);
                    self.options.tooltipModel.trigger("change:location");
                })
                .on("mouseleave", function() {
                    self.options.tooltipModel.set("contents", null);
                });
        }
        return this;
    },

    update: function() {
        const self = this;
        if (this.collection) {
            let lastCat = null;
            const adata = [];
            this.collection.each(function(model) {
                const cbdata = model.toJSON(); // doesn't actually make json, just copies model attributes to object that can then be jsonified (or overwritten safely)
                $.extend(cbdata, {
                    id: model.get("id") || (model.get(self.options.labelByAttribute) + "Placeholder"), // ids may not contain spaces
                    label: model.get(self.options.labelByAttribute),
                    tooltip: model.get("tooltip"),
                });

                const cat = model.get(self.options.groupByAttribute);
                if (lastCat !== cat) { // have to access last datum to say it's the last in its category
                    if (adata.length) { // ignore sectionEnd for first item
                        _.last(adata).sectionEnd = true;
                    }
                    cbdata.sectionBegin = true;
                }
                adata.push(cbdata);
                lastCat = cat;

                 if (d3.select("#"+utils.makeLegalDomID(cbdata.id)).empty()) {
                     const options = $.extend({
                         toggleAttribute: self.options.toggleAttribute,
                         labelFirst: self.options.labelFirst
                     }, cbdata);
                     if (self.options.tooltipModel) {
                        options.tooltipModel = self.options.tooltipModel;
                    }

                     const cbView = new checkBoxView({
                         model: model,
                         myOptions: options,
                     });
                     self.$el.append(cbView.$el);
                }
            });

            this.options.menu = adata;
        }
        return this;
    },

    render: function() {
        const listHolder = d3.select(this.el).select("div ul");
        const choices = listHolder.selectAll("li")
            .data(this.options.menu, function (d) {
                return d.name || d.id;
            })
        ;

        choices.exit().remove();

        const ttm = this.options.tooltipModel;
        const self = this;

        /*
        choices.each (function (d) {
            if (d.id) {
                var targetSel = d3.select("#" + utils.makeLegalDomID(d.id));
                if (!targetSel.empty()) {
                    targetSel.remove();
                }
            }
        });
        */

        const items = choices.enter().append("li").each(function (d) {
            const ind = d3.select(this);
            if (d.name) {
                ind.append("span").text(d.name);
                if (d.class) {
                    ind.classed(d.class, true);
                }
            } else if (d.id) {
                const targetSel = d3.select("#" + utils.makeLegalDomID(d.id));
                if (!targetSel.empty()) {
                    const targetNode = targetSel.node();
                    if (targetNode.parentElement) {
                        targetNode.parentElement.removeChild(targetNode);
                    }
                    ind.node().appendChild(targetNode);

                    if (targetSel.datum() == undefined) {
                        ind.select("#" + utils.makeLegalDomID(d.id)); // this pushes parent d3 datum onto this element
                    }
                }
            }

            // if tooltip data provided, add either as title attribute or if the tooltipmodel passed as an option, use that
            if (d.tooltip) {
                if (ttm) {
                    ind.on("mouseenter", function () {
                        ttm
                            .set("header", d.name || d.label)
                            .set("contents", d.tooltip + ".")
                            .set("location", d3.event);
                        ttm.trigger("change:location");
                    }).on("mouseleave", function () {
                        ttm.set("contents", null);
                    });
                } else {
                    ind.attr("title", d.tooltip || d.title);
                }
            }
        }, this);

        items
            .filter(function(d) {
                return d.sectionBegin;
            })
            .insert("span", ":first-child").attr("class", "ddSectionHeader").text(self.options.sectionHeader)
        ;



        choices.classed("sectionEnd", function(d) {
            return d.sectionEnd;
        });

        /*
        choices
            .filter(function(d) {
                return d.sectionBegin;
            })
            .insert("span", ":first-child").attr("class", "ddSectionHeader").text(self.options.sectionHeader)
        ;
        */

        return this;
    },

    // hide/show or disable menu items by id array ["#myid", "#id2", etc]
    filter: function (idArr, show) {
        return this.enableItemsByID (idArr, show);
    },

    enableItemsByID: function (idArr, enable) {
        const selection = d3.select(this.el).selectAll("li").selectAll(idArr.join(","));
        selection.forEach (function (nestedSel) {
            if (nestedSel.length) {
                const li = d3.select(nestedSel.parentNode);
                li.classed ("disabledItem", !enable)
                    .selectAll("input")
                    .property("disabled", !enable)
                ;
            }
        });
        return this;
    },

    enableItemsByIndex: function (indices, enable) {
        const indexSet = d3.set(indices);

        d3.select(this.el).selectAll("li")
            .each (function (d,i) {
                if (indexSet.has(i)) {
                    const li = d3.select(this);
                    li.classed ("disabledItem", !enable)
                        .selectAll("input")
                        .property("disabled", !enable)
                    ;
                }
            })
        ;
        return this;
    },

    wholeMenuEnabled: function (enabled) {
        d3.select(this.el).classed ("disabledMenu", !enabled);

        if (this.isShown() && !enabled) {
            this.hideVis();
        }
        return this;
    },

    isShown: function() {
        return d3.select(this.el).select("div").style("display") !== "none";
    },

    toggleVis: function() {
        const show = this.isShown();
        // if showing then hide all other menus, really should do it via an event but...
        if (!show) {
            d3.selectAll(".dropdown div").style("display", "none");
        }
        this.setVis(!show);
        return this;
    },

    hideVis: function() {
        return this.setVis(false);
    },

    setVis: function(show) {
        if (!show || !d3.select(this.el).classed ("disabledMenu")) {
            DropDownMenuViewBB.anyOpen = show; // static var. Set to true if any menu clicked open.
            d3.select(this.el).select("div")
                .style("display", show ? "block" : "none");
        }
        return this;
    },

    switchVis: function() {
        if (DropDownMenuViewBB.anyOpen && !this.isShown()) {
            this.toggleVis();
        }
        return this;
    },

    menuSelection: function(evt) {
        const d3target = d3.select(evt.target);
        if (d3target && !d3target.classed("disabledItem")) {    // if enabled item
            const datum = d3target.datum();
            if (datum && datum.func) {
                const context = datum.context || this;
                (datum.func).call(context, d3target, evt); // as value holds function reference
            }

            if (this.options.closeOnClick) {
                const definitelyClose = datum && datum.closeOnClick !== false;
                if (definitelyClose) {
                    this.hideVis();
                }
            }
        }
    }
});


export const AnnotationDropDownMenuViewBB = DropDownMenuViewBB.extend({
    events: function() {
        let parentEvents = DropDownMenuViewBB.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "click button.downloadAnnotationKey": "downloadKey",
        });
    },

    initialize: function() {
        AnnotationDropDownMenuViewBB.__super__.initialize.apply(this, arguments);

        d3.select(this.el).select("div")
            .append("button")
            .text("Download Selected Annotation Key as SVG")
            .classed("btn btn-1 btn-1a downloadAnnotationKey", true);

        this.decideSVGButtonEnabled();

        // listen to a checkbox on one of this collection's models getting clicked and firing a change in the model
        this.listenTo(this.collection, "change:shown", function(featureTypeModel, shown) {
            this.setColour(featureTypeModel, shown);
        });

        // new annotation types added (usually user defined)
        this.listenTo (this.collection, "update", function () {
            this.update().render();
        });
    },

    render: function () {
        AnnotationDropDownMenuViewBB.__super__.render.apply(this, arguments);

        const self = this;
        const items = d3.select(this.el).selectAll("li");

        console.log ("render hello", items);

        function colourChange(d) {
            const value = d3.select(this).property("value");
            const model = self.collection.get(d.id); // d3 id's are same as model id's ('cos ddmenu generates the d3 elements using the collection)
            model.set ("colour", value);
            self.collection.trigger("change:shown", model, model.get("shown"));
        }

        items.each (function (d, i) {
            const d3this = d3.select(this);

            if (d3this.select(".colourSwatchLabel").empty()) {
                const colourControl = d3this
                    .insert("label", ":nth-last-child(1)") // insert pushes data to label
                    .attr("class", "colourSwatchLabel")
                    .style("visibility", function (d) {
                        return self.collection.get(d.id).get("shown") ? null : "hidden";
                    })
                ;

                colourControl
                    .append("span")
                    .attr("class", "colourSwatchSquare")
                    .attr("title", "Click to change colour")
                ;

                // add colour input widgets, but hide them and call them when pressing the colour swatch
                colourControl
                    .append("input")
                    .attr("type", "color")
                    .attr("class", "hiddenColourInput")
                    .property("value", function(d) {
                        return self.collection.getColour (d.category, d.type);
                    })
                    .on("change", colourChange)
                    .on("input", colourChange)
                ;
            }
        });

        items.select(".buttonPlaceholder").classed("aaButtonPlaceholder", true).select("label"); // .select pushes data to label

        return this;
    },

    decideSVGButtonEnabled: function() {
        const shownCount = this.collection.where({
            shown: true
        }).length;
        d3.select(this.el).select("Button.downloadAnnotationKey").property("disabled", shownCount === 0);
        return this;
    },

    setColour: function(featureTypeModel, shown) {
        const self = this;
        d3.select(this.el).selectAll("li")
            .filter(function(d) {
                return d.id === featureTypeModel.id;
            })
            .select(".colourSwatchLabel")
            .style("visibility", shown ? null : "hidden")
            .select(".colourSwatchSquare")
            .style("background", function(d) {
                const col = self.collection.getColour(d.category, d.type);
                const scale = d3.scale.linear().domain([0, 1]).range(["white", col]);
                return shown ? scale(0.5) : "none";
            });

        this.decideSVGButtonEnabled();
        return this;
    },

    downloadKey: function() {
        const tempSVG = d3.select(this.el).append("svg").attr("class", "tempKey").style("text-transform", "capitalize");
        const self = this;
        updateAnnotationColourKey(
            this.collection.where({
                shown: true
            }),
            tempSVG,
            {
                colour: function(d) {
                    return self.collection.getColour(d.category, d.type);
                },
                label: function(d) {
                    return (d.category ? d.category.replace(/_/g, " ") + ": " : "") + d.type;
                },
                title: this.identifier,
            }
        );
        const contentsSize = tempSVG.select("g").node().getBoundingClientRect();
        tempSVG.attr("width", contentsSize.width).attr("height", contentsSize.height); // make svg adjust to contents
        this.downloadSVG(null, tempSVG);
        tempSVG.remove();
        return this;
    },

    // use thisSVG d3 selection to set a specific svg element to download, otherwise take first in the view
    downloadSVG: function(event, thisSVG) {
        const svgSel = thisSVG || d3.select(this.el).selectAll("svg");
        const svgArr = [svgSel.node()];
        const svgStrings = svgUtils.capture(svgArr);
        const svgXML = svgUtils.makeXMLStr(new XMLSerializer(), svgStrings[0]);

        const fileName = this.filenameStateString().substring(0, 240);
        download(svgXML, 'application/svg', fileName + ".svg");
        return this;
    },

    // return any relevant view states that can be used to label a screenshot etc
    optionsToString: function() {
        return "";
    },

    identifier: "Sequence Annotations",

    filenameStateString: function() {
        return makeLegalFileName(searchesToString() + "--" + this.identifier);
    },
});

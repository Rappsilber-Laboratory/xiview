/**
 * @fileoverview Dropdown menu components using Backbone.js and D3.js.
 * Provides DropDownMenuViewBB base class for generic dropdown menus with dynamic content,
 * and AnnotationDropDownMenuViewBB subclass for annotation filtering with color swatches and SVG export.
 * Used throughout xiVIEW for filter controls, layout selection, color scheme selection, and annotation management.
 */
import "../../css/ddMenuViewBB.css";
import * as _ from "underscore";
import Backbone from "backbone";
import * as $ from "jquery";

import {makeLegalDomID, makeLegalFileName, searchesToString, updateAnnotationColourKey} from "../utils";
import {checkBoxView} from "./checkbox-view";
import {capture, makeXMLStr} from "../svgexp";
import d3 from "d3";
import {download} from "../downloads";

/**
 * Generic dropdown menu view with dynamic content and grouping support.
 * Creates dropdown menus with clickable items, supports menu items as simple text/functions
 * or embedded checkbox views. Handles item grouping with section headers, tooltips,
 * enable/disable individual items, and show/hide menu on hover/click.
 * @class
 * @extends Backbone.View
 * @property {Object[]} options.menu - Array of menu item data objects
 * @property {string} options.title - Menu button title text
 * @property {boolean} options.closeOnClick - Auto-close menu after item click (default: true)
 * @property {string} options.groupByAttribute - Model attribute for grouping items (default: "group")
 * @property {string} options.labelByAttribute - Model attribute for item labels (default: "name")
 * @property {string} options.toggleAttribute - Model attribute for checkbox state (default: "state")
 * @property {Function} options.sectionHeader - Function to generate section header text
 * @property {Object} options.tooltipModel - Optional tooltip model for hover tooltips
 */
export class DropDownMenuViewBB extends Backbone.View {
    constructor(options) {
        super(options);
    }

    /**
     * Backbone.js event handler map for dropdown menu interactions.
     * @returns {Object} Event map with jQuery selectors and handler methods
     */
    get events() {
        return {
            "mouseenter .menuTitle": "switchVis",
            "click .menuTitle": "toggleVis",
            "click li": "menuSelection",
            // martin - i had to add another event here to listen to key presses in the text input,
            // or we do without refreshes on key presses, or maybe theres a better way you know of...
            "keyup li > input": "menuSelection",
        };
    }

    /**
     * Initializes the dropdown menu with HTML structure and event listeners.
     * Creates menu button with title, dropdown container with list, applies options,
     * and triggers initial update and render.
     * @param {Object} viewOptions - Initialization options
     * @param {Object} viewOptions.myOptions - Menu configuration options
     * @param {string} [viewOptions.myOptions.title="A DD Menu"] - Menu button title
     * @param {boolean} [viewOptions.myOptions.closeOnClick=true] - Auto-close after item click
     * @param {Object[]} [viewOptions.myOptions.menu=[]] - Initial menu items
     * @param {string} [viewOptions.myOptions.groupByAttribute="group"] - Model attribute for grouping
     * @param {string} [viewOptions.myOptions.labelByAttribute="name"] - Model attribute for labels
     * @param {string} [viewOptions.myOptions.toggleAttribute="state"] - Model attribute for checkbox state
     * @param {Function} [viewOptions.myOptions.sectionHeader] - Function to generate section headers
     * @param {string} [viewOptions.myOptions.classed] - Additional CSS class to apply
     * @param {Object} [viewOptions.myOptions.titleTooltip] - Tooltip for menu button
     * @param {Object} [viewOptions.myOptions.tooltipModel] - Tooltip model for item tooltips
     * @returns {DropDownMenuViewBB} This view instance for chaining
     */
    initialize(viewOptions) {
        // const emptyFunc = function () {
        // };
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
            .call(function (sel) {
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
    }

    /**
     * Updates the menu button title text.
     * @param {string} newTitle - New title to display on menu button
     * @returns {DropDownMenuViewBB} This view instance for chaining
     */
    updateTitle(newTitle) {
        this.options.title = newTitle;
        d3.select(this.el).select("span.menuTitle").text(this.options.title);
        return this;
    }

    /**
     * Updates the menu button hover tooltip.
     * Sets up tooltip model event listeners to show/hide tooltip on mouse enter/leave.
     * @param {Object} tooltipObj - Tooltip configuration object
     * @param {string} tooltipObj.header - Tooltip header text
     * @param {string|string[]} tooltipObj.contents - Tooltip content text or array of lines
     * @returns {DropDownMenuViewBB} This view instance for chaining
     */
    updateTooltip(tooltipObj) {
        if (tooltipObj && this.options.tooltipModel) {
            const self = this;
            d3.select(this.el).select("span.menuTitle")
                .on("mouseenter", function () {
                    self.options.tooltipModel
                        .set("header", tooltipObj.header)
                        .set("contents", tooltipObj.contents)
                        .set("location", d3.event);
                    self.options.tooltipModel.trigger("change:location");
                })
                .on("mouseleave", function () {
                    self.options.tooltipModel.set("contents", null);
                });
        }
        return this;
    }

    /**
     * Updates menu items from the Backbone collection.
     * Iterates collection models, creates data objects with id/label/tooltip, handles section grouping,
     * and creates checkBoxView instances for each item if not already present.
     * Sets "User Defined" category items to initially checked state.
     * @returns {DropDownMenuViewBB} This view instance for chaining
     */
    update() {
        const self = this;
        if (this.collection) {
            let lastCat = null;
            const adata = [];
            this.collection.each(function (model) {
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

                if (d3.select("#" + makeLegalDomID(cbdata.id)).empty()) {
                    const options = $.extend({
                        toggleAttribute: self.options.toggleAttribute,
                        labelFirst: self.options.labelFirst
                    }, cbdata);
                    if (self.options.tooltipModel) {
                        options.tooltipModel = self.options.tooltipModel;
                    }

                    if (cbdata.category == "User Defined"){
                        options.initialState = true;
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
    }

    /**
     * Renders menu items using D3.js data binding.
     * Creates <li> elements for each menu item, either as simple text spans or containers
     * for checkbox views. Adds section headers for grouped items, applies tooltips,
     * and handles enter/update/exit pattern for dynamic data.
     * @returns {DropDownMenuViewBB} This view instance for chaining
     */
    render() {
        const listHolder = d3.select(this.el).select("div ul");
        const choices = listHolder.selectAll("li")
            .data(this.options.menu, function (d) {
                return d.name || d.id;
            });
        choices.exit().remove();

        const ttm = this.options.tooltipModel;
        const self = this;

        /*
        choices.each (function (d) {
            if (d.id) {
                var targetSel = d3.select("#" + makeLegalDomID(d.id));
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
                const targetSel = d3.select("#" + makeLegalDomID(d.id));
                if (!targetSel.empty()) {
                    const targetNode = targetSel.node();
                    if (targetNode.parentElement) {
                        targetNode.parentElement.removeChild(targetNode);
                    }
                    ind.node().appendChild(targetNode);

                    if (targetSel.datum() == undefined) {
                        ind.select("#" + makeLegalDomID(d.id)); // this pushes parent d3 datum onto this element
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
            .filter(function (d) {
                return d.sectionBegin;
            })
            .insert("span", ":first-child").attr("class", "ddSectionHeader").text(self.options.sectionHeader);
        choices.classed("sectionEnd", function (d) {
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
    }

    // hide/show or disable menu items by id array ["#myid", "#id2", etc]
    filter(idArr, show) {
        return this.enableItemsByID(idArr, show);
    }

    /**
     * Enables or disables menu items by CSS selector array.
     * Finds nested elements matching selectors within <li> elements, adds/removes
     * "disabledItem" class on parent <li>, and enables/disables input elements.
     * @param {string[]} idArr - Array of CSS selectors (e.g., ["#checkbox1", ".filterGroup"])
     * @param {boolean} enable - True to enable items, false to disable
     * @returns {DropDownMenuViewBB} This view instance for chaining
     */
    enableItemsByID(idArr, enable) {
        const selection = d3.select(this.el).selectAll("li").selectAll(idArr.join(","));
        selection.forEach(function (nestedSel) {
            if (nestedSel.length) {
                const li = d3.select(nestedSel.parentNode);
                li.classed("disabledItem", !enable)
                    .selectAll("input")
                    .property("disabled", !enable);
            }
        });
        return this;
    }

    /**
     * Enables or disables menu items by zero-based index array.
     * Adds/removes "disabledItem" class on <li> elements at specified indices
     * and enables/disables their input elements.
     * @param {number[]} indices - Array of zero-based menu item indices
     * @param {boolean} enable - True to enable items, false to disable
     * @returns {DropDownMenuViewBB} This view instance for chaining
     */
    enableItemsByIndex(indices, enable) {
        const indexSet = d3.set(indices);

        d3.select(this.el).selectAll("li")
            .each(function (d, i) {
                if (indexSet.has(i)) {
                    const li = d3.select(this);
                    li.classed("disabledItem", !enable)
                        .selectAll("input")
                        .property("disabled", !enable);
                }
            });
        return this;
    }

    /**
     * Enables or disables the entire menu.
     * Adds/removes "disabledMenu" class. If disabling while menu is open, auto-hides it.
     * @param {boolean} enabled - True to enable menu, false to disable
     * @returns {DropDownMenuViewBB} This view instance for chaining
     */
    wholeMenuEnabled(enabled) {
        d3.select(this.el).classed("disabledMenu", !enabled);

        if (this.isShown() && !enabled) {
            this.hideVis();
        }
        return this;
    }

    /**
     * Returns whether the dropdown menu is currently shown.
     * @returns {boolean} True if menu dropdown is visible, false if hidden
     */
    isShown() {
        return d3.select(this.el).select("div").style("display") !== "none";
    }

    /**
     * Toggles menu dropdown visibility.
     * If showing, hides all other dropdown menus first (only one menu open at a time).
     * Calls setVis with opposite of current state.
     * @returns {DropDownMenuViewBB} This view instance for chaining
     */
    toggleVis() {
        const show = this.isShown();
        // if showing then hide all other menus, really should do it via an event but...
        if (!show) {
            d3.selectAll(".dropdown div").style("display", "none");
        }
        this.setVis(!show);
        return this;
    }

    /**
     * Hides the dropdown menu.
     * Convenience method that calls setVis(false).
     * @returns {DropDownMenuViewBB} This view instance for chaining
     */
    hideVis() {
        return this.setVis(false);
    }

    /**
     * Shows or hides the dropdown menu.
     * Sets CSS display property and updates static anyOpen flag (tracks if any menu is open).
     * Respects "disabledMenu" class - won't show if menu is disabled.
     * @param {boolean} show - True to show dropdown, false to hide
     * @returns {DropDownMenuViewBB} This view instance for chaining
     */
    setVis(show) {
        if (!show || !d3.select(this.el).classed("disabledMenu")) {
            DropDownMenuViewBB.anyOpen = show; // static var. Set to true if any menu clicked open.
            d3.select(this.el).select("div")
                .style("display", show ? "block" : "none");
        }
        return this;
    }

    /**
     * Shows this menu if another menu is already open and this one is hidden.
     * Implements "hover to switch between open menus" behavior - if user has a menu
     * open and hovers over another menu button, switches to that menu.
     * @returns {DropDownMenuViewBB} This view instance for chaining
     */
    switchVis() {
        if (DropDownMenuViewBB.anyOpen && !this.isShown()) {
            this.toggleVis();
        }
        return this;
    }

    /**
     * Handles menu item selection clicks and keyboard events.
     * Calls menu item's func callback if provided and item is enabled.
     * Auto-closes menu after selection if closeOnClick option is true (unless item.closeOnClick === false).
     * @param {Event} evt - Click or keyup event from menu item
     * @returns {undefined}
     */
    menuSelection(evt) {
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
}


/**
 * Specialized dropdown menu for annotation type filtering with color swatches and SVG export.
 * Extends DropDownMenuViewBB to add color picker controls for each annotation type,
 * show/hide color swatches based on checkbox state, SVG legend export functionality,
 * and automatic re-rendering when collection changes. Used for protein sequence annotations
 * (phosphorylation sites, binding domains, user-defined annotations, etc.).
 * @class
 * @extends DropDownMenuViewBB
 * @property {string} identifier - View type name ("Sequence Annotations")
 */
export class AnnotationDropDownMenuViewBB extends DropDownMenuViewBB {
    constructor(options) {
        super(options);
    }

    /**
     * Backbone.js event handler map.
     * Extends parent events with annotation-specific download button handler.
     * @returns {Object} Event map with jQuery selectors and handler methods
     */
    get events() {
        let parentEvents = super.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "click button.downloadAnnotationKey": "downloadKey",
        });
    }

    /**
     * Initializes the annotation dropdown menu with color controls and event listeners.
     * Calls parent initialize, adds "Download Annotation Key as SVG" button,
     * listens to collection changes (shown state, color changes, new annotations added).
     * @returns {AnnotationDropDownMenuViewBB} This view instance for chaining
     */
    initialize() {
        super.initialize(...arguments);

        d3.select(this.el).select("div")
            .append("button")
            .text("Download Selected Annotation Key as SVG")
            .classed("btn btn-1 btn-1a downloadAnnotationKey", true);

        this.decideSVGButtonEnabled();

        // listen to a checkbox on one of this collection's models getting clicked and firing a change in the model
        this.listenTo(this.collection, "change:shown", function (featureTypeModel, shown) {
            this.setColour(featureTypeModel, shown);
        });

        // new annotation types added (usually user defined)
        this.listenTo(this.collection, "update", function () {
            this.update().render();
        });
    }

    /**
     * Renders annotation menu items with color picker controls.
     * Calls parent render, then adds color swatch labels and hidden color inputs
     * for each menu item. Color swatches are visible only when annotation type is shown.
     * Applies "aaButtonPlaceholder" class for annotation-specific styling.
     * @returns {AnnotationDropDownMenuViewBB} This view instance for chaining
     */
    render() {
        super.render(...arguments);

        const self = this;
        const items = d3.select(this.el).selectAll("li");

        function colourChange(d) {
            const value = d3.select(this).property("value");
            const model = self.collection.get(d.id); // d3 id's are same as model id's ('cos ddmenu generates the d3 elements using the collection)
            model.set("colour", value);
            self.collection.trigger("change:shown", model, model.get("shown"));
        }

        items.each(function () {
            const d3this = d3.select(this);

            if (d3this.select(".colourSwatchLabel").empty()) {
                const colourControl = d3this
                    .insert("label", ":nth-last-child(1)") // insert pushes data to label
                    .attr("class", "colourSwatchLabel")
                    .style("visibility", function (d) {
                        return self.collection.get(d.id).get("shown") ? null : "hidden";
                    });
                colourControl
                    .append("span")
                    .attr("class", "colourSwatchSquare")
                    .attr("title", "Click to change colour");

                // add colour input widgets, but hide them and call them when pressing the colour swatch
                colourControl
                    .append("input")
                    .attr("type", "color")
                    .attr("class", "hiddenColourInput")
                    .property("value", function (d) {
                        return self.collection.getColour(d.category, d.type);
                    })
                    .on("change", colourChange)
                    .on("input", colourChange);
            }
        });

        items.select(".buttonPlaceholder").classed("aaButtonPlaceholder", true).select("label"); // .select pushes data to label

        return this;
    }

    /**
     * Enables or disables the SVG download button based on visible annotations.
     * Button is disabled when no annotation types are currently shown.
     * @returns {AnnotationDropDownMenuViewBB} This view instance for chaining
     */
    decideSVGButtonEnabled() {
        const shownCount = this.collection.where({
            shown: true
        }).length;
        d3.select(this.el).select("Button.downloadAnnotationKey").property("disabled", shownCount === 0);
        return this;
    }

    /**
     * Updates color swatch visibility and color when annotation shown state changes.
     * Shows/hides color swatch label, updates swatch background color (50% tint of annotation color),
     * and re-evaluates SVG button enabled state.
     * @param {Backbone.Model} featureTypeModel - Annotation type model that changed
     * @param {boolean} shown - New shown state (true if annotation type should be visible)
     * @returns {AnnotationDropDownMenuViewBB} This view instance for chaining
     */
    setColour(featureTypeModel, shown) {
        const self = this;
        d3.select(this.el).selectAll("li")
            .filter(function (d) {
                return d.id === featureTypeModel.id;
            })
            .select(".colourSwatchLabel")
            .style("visibility", shown ? null : "hidden")
            .select(".colourSwatchSquare")
            .style("background", function (d) {
                const col = self.collection.getColour(d.category, d.type);
                const scale = d3.scale.linear().domain([0, 1]).range(["white", col]);
                return shown ? scale(0.5) : "none";
            });

        this.decideSVGButtonEnabled();
        return this;
    }

    /**
     * Creates and downloads an SVG legend for currently shown annotation types.
     * Creates temporary SVG element, populates with annotation color key using updateAnnotationColourKey,
     * sizes SVG to fit contents, downloads as SVG file, and removes temporary element.
     * @returns {AnnotationDropDownMenuViewBB} This view instance for chaining
     */
    downloadKey() {
        const tempSVG = d3.select(this.el).append("svg").attr("class", "tempKey").style("text-transform", "capitalize");
        const self = this;
        updateAnnotationColourKey(
            this.collection.where({
                shown: true
            }),
            tempSVG,
            {
                colour: function (d) {
                    return self.collection.getColour(d.category, d.type);
                },
                label: function (d) {
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
    }

    // use thisSVG d3 selection to set a specific svg element to download, otherwise take first in the view
    downloadSVG(event, thisSVG) {
        const svgSel = thisSVG || d3.select(this.el).selectAll("svg");
        const svgArr = [svgSel.node()];
        const svgStrings = capture(svgArr);
        const svgXML = makeXMLStr(new XMLSerializer(), svgStrings[0]);

        const fileName = this.filenameStateString().substring(0, 240);
        download(svgXML, "application/svg", fileName + ".svg");
        return this;
    }

    // return any relevant view states that can be used to label a screenshot etc
    optionsToString() {
        return "";
    }

    /**
     * Generates filename for annotation legend SVG exports.
     * Combines search names with view identifier ("Sequence Annotations").
     * Format: "search1-search2--Sequence Annotations.svg"
     * @returns {string} Legal filename string without extension
     */
    filenameStateString() {
        return makeLegalFileName(searchesToString() + "--" + this.identifier);
    }
}

AnnotationDropDownMenuViewBB.prototype.identifier = "Sequence Annotations";

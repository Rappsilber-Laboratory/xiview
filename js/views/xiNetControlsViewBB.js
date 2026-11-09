/**
 * @fileoverview xiNET network visualization controls view.
 * Provides UI controls for xiNET circular protein network: auto layout (force-directed),
 * auto grouping (by complex), save layout, show labels, fixed node size, crop labels,
 * thick links, PPI step controls, SVG download. Triggers events on vent for xiNET listener.
 * Creates dropdown menu with buttons, checkboxes, PPI step slider.
 */

import * as _ from "underscore";
import Backbone from "backbone";

import {DropDownMenuViewBB} from "../ui-utils/ddMenuViewBB";
import {BaseFrameView} from "../ui-utils/base-frame-view";
import {commonLabels, makeBackboneButtons} from "../utils";
import d3 from "d3";
import vent from "../vent";
import {showMessage} from "../ui-utils/message-popup";

/**
 * xiNET controls view with layout/display options.
 * Creates dropdown menu with buttons (auto layout, auto group, save layout, SVG download),
 * checkboxes (show labels, fixed size, crop labels, thick links, fix selected proteins),
 * PPI steps slider. Triggers events on vent for xiNET to consume. Reads/updates xiNET settings.
 * @class
 * @extends Backbone.View
 */
export class xiNetControlsViewBB extends Backbone.View {
    constructor(options) {
        super(options);
    }

    /**
     * Event handlers for buttons, checkboxes, sliders.
     * @returns {Object} Event map
     */
    get events() {
        let parentEvents = BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "click .xinetSvgDownload": function () {
                vent.trigger("xinetSvgDownload", true);
            },
            "click .autoLayoutButton": function () {
                const fixSelected = d3.select("input.fixSelected").property("checked");
                vent.trigger("xinetAutoLayout", fixSelected ? this.model.get("selectedProteins") : []);
            },
            "click .saveLayoutButton": "saveLayout",
            "change .showLabels": "setShowLabels",
            "change .fixedSize": "setFixedSize",
            "change .cropLabels": "setCropLabels",
            "change .thickLinks": "setThickLinksShown",
            "change .xinetPpiStep": "updatePpiSteps",
        });
    }

    /**
     * Saves the current config (xiNET layout + filter settings) under the name in the name box.
     * Each save is stored as a new entry; the most recent is loaded by default when the page opens.
     * @returns {undefined}
     */
    saveLayout() {
        const name = d3.select(this.el).select(".savedLayoutName").property("value");
        const filterModel = this.model.get("filterModel");
        const self = this;
        vent.trigger("xinetSaveLayout", function (layout) {
            const config = {version: 1, layout: layout, filter: filterModel.getSavedSettings()};
            fetch(configUrl(self.model, "config"), {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({name: name, config: config}),
            })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(() => showMessage("Layout and filter settings saved" + (name ? " as \"" + _.escape(name) + "\"" : ""), "info"))
                .catch(error => showMessage("Couldn't save layout: " + error.message, "error"));
        });
    }

    initialize(viewOptions) {

        this.options = _.extend(this.defaultOptions, viewOptions.myOptions);
        super.initialize(...arguments);

        const mainDivSel = d3.select(this.el);

        const buttonHtml = "<p id='displayOptionsPlaceholder' class='btn btn-1 btn-1a'></p>" +
            // "<span class='layoutLabel noBreak sectionDividerLeft' >Layout:</span>" +
            "<button class='btn btn-1 btn-1a autoLayoutButton'>Auto Layout</button>" +
            "<p id='loadLayoutButton' class='btn btn-1 btn-1a'></p>" +
            "<input type='text' name='name' id='name' class='savedLayoutName' value='' placeholder='Enter Save Layout Name'>" +
            "<button class='btn btn-1 btn-1a saveLayoutButton'>Save</button>" +
            // "<span class='noBreak sectionDividerLeft' ></span>" +
            "<button class='btn btn-1 btn-1a xinetSvgDownload sectionDividerLeft'>" + commonLabels.downloadImg + "SVG" + "</button>";

        mainDivSel.html(
            buttonHtml
        );

        // saved configs only available for xi2 datasets
        if (!this.model.get("configSaving")) {
            mainDivSel.selectAll(".savedLayoutName, .saveLayoutButton, #loadLayoutButton").style("display", "none");
        }

        const savedConfig = this.model.get("savedConfig");
        if (savedConfig) {
            mainDivSel.select(".savedLayoutName").property("value", savedConfig.name);
        }

        const tooltips = {
            autoLayoutButton: "Automatically relayout network of displayed proteins",
            saveLayoutButton: "Save the current layout for later",
            loadLayoutButton: "Load a previously saved layout",
        };
        d3.entries(tooltips).forEach(function (entry) {
            let elem = d3.select(this.el).select("." + entry.key);
            if (!elem.empty()) {
                elem.attr("title", entry.value);
            } else {
                elem = d3.select(this.el).select("#" + entry.key);
                elem.attr("title", entry.value);
            }
        }, this);

        // Generate load layout drop down
        if (this.model.get("configSaving")) {
            new xiNetLayoutListViewBB({
                el: "#loadLayoutButton",
                model: this.model,
                myOptions: {
                    title: "Load ▼",
                }
            });
        }

        // Various view options set up...
        const toggleButtonData = [
            {
                initialState: this.model.get("xinetFixSelected"),
                class: "fixSelected",
                label: "Fix Selected",
                id: "fixSelected",
                tooltip: "Fix selected nodes in place during auto-layout.",
                header: "Auto Layout",
                sectionEnd: true,
            },
            {
                initialState: this.model.get("xinetShowLabels"),
                class: "showLabels",
                label: "Show Labels",
                id: "showLabels",
                tooltip: "Show labels in xiNET",
                header: "Nodes",
                sectionBegin: true,
            },
            {
                initialState: this.model.get("xinetFixedSize"),
                class: "fixedSize",
                label: "Fixed Size",
                id: "fixedSize",
                tooltip: "Make nodes fixed size (don't vary size by sequence length)",
                sectionEnd: true,
            },
            {
                initialState: this.model.get("xinetCropLabels"),
                class: "cropLabels",
                label: "Crop at _",
                id: "cropLabels",
                tooltip: "Crop node labels at first underscore",
                header: "Labels",
                sectionBegin: true,
                sectionEnd: true,
            },
            {
                initialState: this.model.get("xinetShowExpandedGroupLabels"),
                class: "showExpandedGroupLabels",
                label: "Label Expanded Groups",
                id: "showExpandedGroupLabels",
                tooltip: "Show labels on expanded groups in xiNET",
                header: "Groups",
                sectionBegin: true,
            },
            {
                initialState: this.model.get("xinetThickLinks"),
                class: "thickLinks",
                label: "Background PPI Links",
                id: "thickLinks",
                tooltip: "Show thicker background links representing count of unique distance restraints per PPI",
                header: "Links"
            },
        ];

        toggleButtonData
            .forEach(function (d) {
                d.type = d.type || "checkbox";
                d.value = d.value || d.label;
                d.inputFirst = true;
                if (d.initialState === undefined && d.group && d.value) { // set initial values for radio button groups
                    d.initialState = (d.value === this.options[d.group]);
                }
            }, this);

        d3.select("body")
            .append("label")
            .text("Step 1 ")
            .append("input")
            .attr("type", "number")
            .attr("step", 1)
            .attr("max", 10)
            .attr("value", 2)
            .attr("id", "xiNetButtonBarppiStep1")
            // .attr("disabled", self.backbone-models.get("xinetThickLinks")) // todo - not working right? but currently enabled by default so doesn't matter
            .classed("xinetPpiStep", true);

        d3.select("body")
            .append("label")
            .text("Step 2 ")
            .append("input")
            .attr("type", "number")
            .attr("step", 1)
            .attr("max", 100)
            .attr("value", 3)
            .attr("id", "xiNetButtonBarppiStep2")
            // .attr("disabled", self.backbone-models.get("xinetThickLinks")) // todo - not working right? but currently enabled by default so doesn't matter
            .classed("xinetPpiStep", true);

        const self = this;

        makeBackboneButtons(mainDivSel, self.el.id, toggleButtonData);
        // toggleButtonData.splice(0, 0, {
        //     name: commonLabels.downloadImg + "SVG",
        //     tooltip: "Download image from xiNET as SVG; a vector format that can be edited in InkScape or Illustrator",
        //     class: "xinetSvgDownload",
        //     sectionEnd: true,
        // });
        toggleButtonData.push({
            class: "xinetPpiStep",
            id: "ppiStep1",
        });
        toggleButtonData.push({
            class: "xinetPpiStep",
            id: "ppiStep2",
        });
        // ...then moved to a dropdown menu
        new DropDownMenuViewBB({
            el: "#displayOptionsPlaceholder",
            model: this.model,
            myOptions: {
                title: "Display ▼",
                menu: toggleButtonData.map(function (d) {
                    d.id = self.el.id + d.id;
                    //d.tooltip = d.d3tooltip;
                    return d;
                }),
                closeOnClick: false,
                tooltip: "Display options for xiNET (centre view)"
                // tooltipModel: self.backbone-models.get("tooltipModel"),
            }
        });
    }

    setShowLabels() {
        this.model.set("xinetShowLabels", d3.select("input.showLabels").property("checked"));
    }

    setFixedSize() {
        this.model.set("xinetFixedSize", d3.select("input.fixedSize").property("checked"));
    }

    setCropLabels() {
        this.model.set("xinetCropLabels", d3.select("input.cropLabels").property("checked"));
    }

    setThickLinksShown() {
        const checkbox = d3.select("input.thickLinks");
        const checked = checkbox.property("checked");
        // console.log("!" + checked);
        d3.select("input#xiNetButtonBarppiStep1").property("disabled", !checked);
        d3.select("input#xiNetButtonBarppiStep2").property("disabled", !checked);
        this.model.set("xinetThickLinks", checked);
    }

    updatePpiSteps() {
        const steps = [];
        steps[0] = d3.select("input#xiNetButtonBarppiStep1").property("value");
        steps[1] = d3.select("input#xiNetButtonBarppiStep2").property("value");
        this.model.set("xinetPpiSteps", steps);
    }
}

xiNetControlsViewBB.prototype.identifier = "xiNET Controls";


/**
 * Makes the URL for a saved config API endpoint, passing on the page's query params (the dataset uuids).
 * @param {Backbone.Model} model - Composite model, holds apiBase
 * @param {string} endpoint - "config" or "configs"
 * @returns {string} URL
 */
function configUrl(model, endpoint) {
    return `${model.get("apiBase")}${endpoint}${window.location.search}`;
}

/**
 * Dropdown listing previously saved configs (newest first). The list is fetched each time it's opened.
 * Choosing one applies its xiNET layout and filter settings.
 * @class
 * @extends DropDownMenuViewBB
 */
class xiNetLayoutListViewBB extends DropDownMenuViewBB {
    setVis(show) {
        super.setVis(show);
        if (show) {
            fetch(configUrl(this.model, "configs"), {cache: "no-store"})
                .then(response => response.json())
                .then(configs => {
                    this.options.menu = configs.length ? configs.map(c => this.menuItem(c)) : [{name: "No saved layouts"}];
                    this.render();
                })
                .catch(error => console.error("Couldn't list saved layouts", error));
        }
        return this;
    }

    menuItem(configInfo) {
        const model = this.model;
        const date = new Date(configInfo.created).toLocaleString();
        return {
            name: (configInfo.name || "(unnamed)") + " — " + date,
            func: function () {
                fetch(configUrl(model, "config") + "&config_id=" + configInfo.id, {cache: "no-store"})
                    .then(response => response.json())
                    .then(savedConfig => {
                        d3.select(".savedLayoutName").property("value", savedConfig.name);
                        if (savedConfig.config.layout) {
                            vent.trigger("xinetLoadLayout", savedConfig.config.layout);
                        }
                        if (savedConfig.config.filter) {
                            model.get("filterModel").applySavedSettings(savedConfig.config.filter);
                        }
                    })
                    .catch(error => showMessage("Couldn't load layout: " + error.message, "error"));
            },
        };
    }
}

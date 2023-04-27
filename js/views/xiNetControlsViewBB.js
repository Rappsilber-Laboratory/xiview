import * as _ from "underscore";
import Backbone from "backbone";

import {DropDownMenuViewBB} from "../ui-utils/ddMenuViewBB";
import {BaseFrameView} from "../ui-utils/base-frame-view";
import {commonLabels, makeBackboneButtons} from "../utils";
import d3 from "d3";

export const xiNetControlsViewBB = Backbone.View.extend({

    events: function () {
        let parentEvents = BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "click .xinetSvgDownload": function () {
                window.vent.trigger("xinetSvgDownload", true);
            },
            "click .autoLayoutButton": function () {
                const fixSelected = d3.select("input.fixSelected").property("checked");
                window.vent.trigger("xinetAutoLayout", fixSelected ? this.model.get("selectedProteins") : []);
            },
            "click .autoGroupButton": "autoGroup",
            "click .saveLayoutButton": "saveLayout",
            "change .showLabels": "setShowLabels",
            "change .fixedSize": "setFixedSize",
            "change .cropLabels": "setCropLabels",
            "change .thickLinks": "setThickLinksShown",
            "change .xinetPpiStep": "updatePpiSteps",
        });
    },

    saveLayout: function () {
        const xmlhttp = new XMLHttpRequest();
        const url = "./php/isLoggedIn.php";
        xmlhttp.open("POST", url, true);
        //Send the proper header information along with the request
        xmlhttp.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
        xmlhttp.onreadystatechange = function () { //Call a function when the state changes.
            if (xmlhttp.readyState === 4 && xmlhttp.status === 200) {
                if (xmlhttp.responseText === "false") {
                    alert("You must be logged in to save layout. A new tab will open for you to log in, you can then return here and Save.");
                    window.open("../userGUI/userLogin.html", "_blank");
                } else {
                    const callback = function (layoutJson) {
                        const xmlhttp = new XMLHttpRequest();
                        const url = "./php/saveLayout.php";
                        xmlhttp.open("POST", url, true);
                        //Send the proper header information along with the request
                        xmlhttp.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
                        xmlhttp.onreadystatechange = function () { //Call a function when the state changes.
                            if (xmlhttp.readyState === 4 && xmlhttp.status === 200) {
                                console.log("Saved layout " + xmlhttp.responseText, true);
                                alert("Layout Saved");
                            }
                        };
                        const sid = window.compositeModelInst.get("clmsModel").get("sid");
                        const params = "sid=" + sid +
                            "&layout=" + encodeURIComponent(layoutJson.replace(/[\t\r\n']+/g, "")) +
                            "&name=" + encodeURIComponent(d3.select(".savedLayoutName").property("value"));
                        xmlhttp.send(params);
                    };

                    window.vent.trigger("xinetSaveLayout", callback);
                }
            }
        };
        xmlhttp.send();
    },

    initialize: function (viewOptions) {

        this.options = _.extend(this.defaultOptions, viewOptions.myOptions);
        xiNetControlsViewBB.__super__.initialize.apply(this, arguments);

        const mainDivSel = d3.select(this.el);

        const buttonHtml = "<p id='displayOptionsPlaceholder' class='btn btn-1 btn-1a'></p>" +
            "<span class='layoutLabel noBreak sectionDividerLeft' >Layout:</span>" +
            "<button class='btn btn-1 btn-1a autoLayoutButton'>Auto</button>" +
            "<p id='loadLayoutButton' class='btn btn-1 btn-1a'></p>" +
            "<input type='text' name='name' id='name' class='savedLayoutName' value='' placeholder='Enter Save Layout Name'>" +
            "<button class='btn btn-1 btn-1a saveLayoutButton'>Save</button>" +
            "<span class='noBreak sectionDividerLeft' ></span>" +
            "<button class='btn btn-1 btn-1a xinetSvgDownload sectionDividerLeft'>" + commonLabels.downloadImg + "SVG" + "</button>";

        mainDivSel.html(
            buttonHtml
        );

        if (this.model.get("clmsModel").get("xiNETLayout")) {
            d3.select(".savedLayoutName").property("value", this.model.get("clmsModel").get("xiNETLayout").name);
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
        new xiNetLayoutListViewBB({
            el: "#loadLayoutButton",
            model: window.compositeModelInst,
            myOptions: {
                title: "Load ▼",
            }
        });

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
            // .attr("disabled", self.model.get("xinetThickLinks")) // todo - not working right? but currently enabled by default so doesn't matter
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
            // .attr("disabled", self.model.get("xinetThickLinks")) // todo - not working right? but currently enabled by default so doesn't matter
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
                // tooltipModel: self.model.get("tooltipModel"),
            }
        });
    },

    setShowLabels: function () {
        this.model.set("xinetShowLabels", d3.select("input.showLabels").property("checked"));
    },

    setFixedSize: function () {
        this.model.set("xinetFixedSize", d3.select("input.fixedSize").property("checked"));
    },

    setCropLabels: function () {
        this.model.set("xinetCropLabels", d3.select("input.cropLabels").property("checked"));
    },

    setThickLinksShown: function () {
        const checkbox = d3.select("input.thickLinks");
        const checked = checkbox.property("checked");
        // console.log("!" + checked);
        d3.select("input#xiNetButtonBarppiStep1").property("disabled", !checked);
        d3.select("input#xiNetButtonBarppiStep2").property("disabled", !checked);
        this.model.set("xinetThickLinks", checked);
    },

    updatePpiSteps: function () {
        const steps = [];
        steps[0] = d3.select("input#xiNetButtonBarppiStep1").property("value");
        steps[1] = d3.select("input#xiNetButtonBarppiStep2").property("value");
        this.model.set("xinetPpiSteps", steps);
    },

    identifier: "xiNET Controls",
});


const xiNetLayoutListViewBB = DropDownMenuViewBB.extend({
    events: function () {
        let parentEvents = DropDownMenuViewBB.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {});
    },

    initialize: function () {
        xiNetLayoutListViewBB.__super__.initialize.apply(this, arguments);
    },

    setVis: function (show) {
        const self = this;
        xiNetLayoutListViewBB.__super__.setVis.call(self, show);
        if (show) {
            const xmlhttp = new XMLHttpRequest();
            const url = "./php/loadLayout.php";
            xmlhttp.open("POST", url, true);
            //Send the proper header information along with the request
            xmlhttp.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
            xmlhttp.onreadystatechange = function () { //Call a function when the state changes.
                if (xmlhttp.readyState === 4 && xmlhttp.status === 200) {
                    const layouts = JSON.parse(xmlhttp.responseText);
                    const menu = [];
                    for (let key in layouts) {
                        menu.push(menuItem(layouts, key));
                    }
                    self.options.menu = menu;
                    xiNetLayoutListViewBB.__super__.render.call(self);
                }
                // xiNetLayoutListViewBB.__super__.setVis.call(self, show);
            };
            const sid = window.compositeModelInst.get("clmsModel").get("sid");
            const params = "sid=" + sid;
            xmlhttp.send(params);
            return this;
        }
        // else {
        //     xiNetLayoutListViewBB.__super__.setVis.call(this, show);
        // }

        function menuItem(layouts, selectedKey) {
            return {
                name: selectedKey,
                func: function () {
                    d3.select(".savedLayoutName").property("value", selectedKey);
                    // window.compositeModelInst.clearGroups();
                    // const self = this;
                    // jqdialogs.areYouSureDialog("ClearGroupsDialog", "Clear current groups before adding groups from saved layout?", "Clear Groups", "Combine current and saved", "Clear current, only groups from saved layout", function () {
                    //     self.set("groups", new Map());
                    //     self.trigger("change:groups");
                    // });
                    window.vent.trigger("xinetLoadLayout", layouts[selectedKey]);
                },
                context: window.compositeModelInst
            };
        }
    },

});

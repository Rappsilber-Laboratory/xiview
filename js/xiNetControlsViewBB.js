//		xiNET controls
//
//		Martin Graham, Colin Combe, Rappsilber Laboratory
//
//		js/xiNetControlsViewBB.js

var CLMSUI = CLMSUI || {};

CLMSUI.xiNetControlsViewBB = Backbone.View.extend({

    events: function() {

        var parentEvents = CLMSUI.utils.BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "click .xinetSvgDownload": function() {
                CLMSUI.vent.trigger("xinetSvgDownload", true);
            },
            "click .autoLayoutButton": function() {
                const fixSelected = d3.select("input.fixSelected").property("checked");
                CLMSUI.vent.trigger("xinetAutoLayout", fixSelected? this.model.get("selectedProteins") : [])
            },
            "click .autoGroupButton": "autoGroup",
            "click .saveLayoutButton": "saveLayout",
            "change .showExpandedGroupLabels": "setShowExpandedGroupLabels",
            "change .showLabels": "setShowLabels",
            "change .fixedSize": "setFixedSize",
            "change .thickLinks": "setThickLinksShown",
            "change .xinetPpiStep": "updatePpiSteps",
        });

    },

    saveLayout: function() {
                    var callback = function(layoutJson) {
                        var xmlhttp = new XMLHttpRequest();
                        var url = "./php/saveLayout.php";
                        xmlhttp.open("POST", url, true);
                        //Send the proper header information along with the request
                        xmlhttp.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
                        xmlhttp.onreadystatechange = function() { //Call a function when the state changes.
                            if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
                                console.log("Saved layout " + xmlhttp.responseText, true);
                                alert("Layout Saved");
                            }
                        };
                        var sid = CLMSUI.compositeModelInst.get("clmsModel").get("sid");
                        var params = "sid=" + sid +
                            "&layout=" + encodeURIComponent(layoutJson.replace(/[\t\r\n']+/g, "")) +
                            "&name=" + encodeURIComponent(d3.select(".savedLayoutName").property("value"));
                        xmlhttp.send(params);
                    };

                    CLMSUI.vent.trigger("xinetSaveLayout", callback);
    },

    initialize: function(viewOptions) {

        this.options = _.extend(this.defaultOptions, viewOptions.myOptions);
        CLMSUI.xiNetControlsViewBB.__super__.initialize.apply(this, arguments);

        var self = this;

        var mainDivSel = d3.select(this.el);

        var buttonHtml = "<p id='displayOptionsPlaceholder' class='btn btn-1 btn-1a'></p>" +
            "<span class='layoutLabel noBreak sectionDividerLeft' >Layout:</span>" +
            "<button class='btn btn-1 btn-1a autoLayoutButton'>Auto</button>" +
            "<p id='loadLayoutButton' class='btn btn-1 btn-1a'></p>" +
            "<input type='text' name='name' id='name' class='savedLayoutName' value='' placeholder='Enter Save Layout Name'>" +
            "<button class='btn btn-1 btn-1a saveLayoutButton'>Save</button>" +
            "<span class='noBreak sectionDividerLeft' ></span>" +
            "<button class='btn btn-1 btn-1a xinetSvgDownload sectionDividerLeft'>" + CLMSUI.utils.commonLabels.downloadImg + "SVG"+"</button>";

        mainDivSel.html(
            buttonHtml
        );

        if (!CLMSUI.loggedIn){
            d3.select(".savedLayoutName").style("display", "none");
            d3.select(".saveLayoutButton").style("display", "none");
        }

        if (this.model.get("clmsModel").get("xiNETLayout")) {
            d3.select(".savedLayoutName").property("value", this.model.get("clmsModel").get("xiNETLayout").name);
        }

        var tooltips = {
            autoLayoutButton: 'Automatically relayout network of displayed proteins',
            saveLayoutButton: 'Save the current layout for later',
            loadLayoutButton: 'Load a previously saved layout',
        };
        d3.entries(tooltips).forEach(function(entry) {
            var elem = d3.select(this.el).select("." + entry.key);
            if (!elem.empty()) {
                elem.attr("title", entry.value);
            } else {
                elem = d3.select(this.el).select("#" + entry.key);
                elem.attr("title", entry.value);
            }
        }, this);

        // Generate load layout drop down
        new CLMSUI.xiNetLayoutListViewBB({
            el: "#loadLayoutButton",
            model: CLMSUI.compositeModelInst,
            myOptions: {
                title: "Load ▼",
            }
        });

        // Various view options set up...
        var toggleButtonData = [
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
                label: "Fized Size",
                id: "fixedSize",
                tooltip: "Make nodes fixed size (don't vary size by sequence length)",
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
                tooltip: "Show thicker background links representing count of unique distance restaints per PPI",
                header: "Links"
            },
        ];

        var self = this;
        toggleButtonData
            .forEach(function(d) {
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
            .classed('xinetPpiStep', true);

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
            .classed('xinetPpiStep', true);

        CLMSUI.utils.makeBackboneButtons(mainDivSel, self.el.id, toggleButtonData);
        // toggleButtonData.splice(0, 0, {
        //     name: CLMSUI.utils.commonLabels.downloadImg + "SVG",
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
        new CLMSUI.DropDownMenuViewBB({
            el: "#displayOptionsPlaceholder",
            model: this.model,
            myOptions: {
                title: "Display ▼",
                menu: toggleButtonData.map(function(d) {
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

    setShowLabels: function() {
        this.model.set("xinetShowLabels", d3.select("input.showLabels").property("checked"));
    },

    setShowExpandedGroupLabels: function() {
        this.model.set("xinetShowExpandedGroupLabels", d3.select("input.showExpandedGroupLabels").property("checked"));
    },

    setFixedSize: function() {
        this.model.set("xinetFixedSize", d3.select("input.fixedSize").property("checked"));
    },

    setThickLinksShown: function() {
        var checkbox = d3.select("input.thickLinks");
        var checked = checkbox.property("checked");
        // console.log("!" + checked);
        d3.select("input#xiNetButtonBarppiStep1").property("disabled", !checked);
        d3.select("input#xiNetButtonBarppiStep2").property("disabled", !checked);
        this.model.set("xinetThickLinks", checked);
    },

    updatePpiSteps: function() {
        var steps = [];
        steps[0] = d3.select("input#xiNetButtonBarppiStep1").property("value");
        steps[1] = d3.select("input#xiNetButtonBarppiStep2").property("value");
        this.model.set("xinetPpiSteps", steps);
    },

    // autoGroup: function() {
    //     var groupMap = new Map();
    //     var uncharacterised = new Set();
    //     var periphery = new Set();
    //     //groupMap.set("uncharacterised", uncharacterised);
    //
    //     var periphery = new Set();
    //     groupMap.set("periphery", periphery);
    //
    //     var intracellular = new Set();
    //     groupMap.set("intracellular", intracellular);
    //
    //     var both = new Set();
    //     groupMap.set("periphery_intracellular", both);
    //
    //     /* // not gonna work
    //     var characterised = new Set();
    //     groupMap.set("characterised", characterised);
    //     characterised.add("periphery");
    //     characterised.add("intracellular");
    //     characterised.add("periphery_intracellular");
    //     */
    //
    //     var go = this.model.get("go");
    //     var proteins = this.model.get("clmsModel").get("participants").values();
    //     for (var protein of proteins) {
    //
    //         if (protein.uniprot) {
    //             var peri = false;
    //             var intr = false;
    //             for (var goId of protein.uniprot.go) {
    //                 var goTerm = go.get(goId);
    //                 if (goTerm) {
    //                     //GO0071944
    //                     if (goTerm.isDescendantOf("GO0071944") == true) {
    //                         peri = true;
    //                     } //GO0071944
    //                     if (goTerm.isDescendantOf("GO0005622") == true) {
    //                         intr = true;
    //                     }
    //                 }
    //
    //             }
    //
    //             if (peri == true && intr == true) {
    //                 both.add(protein.id);
    //             } else if (peri == true) {
    //                 periphery.add(protein.id);
    //             } else if (intr == true) {
    //                 intracellular.add(protein.id);
    //             } else {
    //                 uncharacterised.add(protein.id);
    //             }
    //         }
    //
    //     }
    //     this.model.set("groups", groupMap);
    // },

    identifier: "xiNET Controls",
});


CLMSUI.xiNetLayoutListViewBB = CLMSUI.DropDownMenuViewBB.extend({
    events: function() {
        var parentEvents = CLMSUI.DropDownMenuViewBB.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
        });
    },

    initialize: function() {
        CLMSUI.xiNetLayoutListViewBB.__super__.initialize.apply(this, arguments);
    },

    setVis: function(show) {
        var self = this;
        CLMSUI.xiNetLayoutListViewBB.__super__.setVis.call(self, show);
        if (show) {
            var xmlhttp = new XMLHttpRequest();
            var url = "./php/loadLayout.php";
            xmlhttp.open("POST", url, true);
            //Send the proper header information along with the request
            xmlhttp.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
            xmlhttp.onreadystatechange = function() { //Call a function when the state changes.
                if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
                    var layouts = JSON.parse(xmlhttp.responseText);
                    var menu = [];
                    for (var key in layouts) {
                        menu.push(menuItem(layouts, key));
                    }
                    self.options.menu = menu;
                    CLMSUI.xiNetLayoutListViewBB.__super__.render.call(self);
                }
                // CLMSUI.xiNetLayoutListViewBB.__super__.setVis.call(self, show);
            };
            var sid = CLMSUI.compositeModelInst.get("clmsModel").get("sid");
            var params = "sid=" + sid;
            xmlhttp.send(params);
            return this;
        }
        // else {
        //     CLMSUI.xiNetLayoutListViewBB.__super__.setVis.call(this, show);
        // }

        function menuItem(layouts, selectedKey) {
            return {
                name: selectedKey,
                func: function() {
                    d3.select(".savedLayoutName").property("value", selectedKey);
                    // CLMSUI.compositeModelInst.clearGroups();
                    // const self = this;
                    // CLMSUI.jqdialogs.areYouSureDialog("ClearGroupsDialog", "Clear current groups before adding groups from saved layout?", "Clear Groups", "Combine current and saved", "Clear current, only groups from saved layout", function () {
                    //     self.set("groups", new Map());
                    //     self.trigger("change:groups");
                    // });
                    CLMSUI.vent.trigger("xinetLoadLayout", layouts[selectedKey]);
                },
                context: CLMSUI.compositeModelInst
            };
        }
    },

});

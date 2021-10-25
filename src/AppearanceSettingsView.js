import "../css/settings.css";
// import "../../xi3/css/xispecAdjust.css";
import * as _ from "underscore";
import * as $ from "jquery";
import * as jscolor from "@eastdesire/jscolor";
import {SettingsView} from "./SettingsView";
import * as d3 from "d3";

export const AppearanceSettingsView = SettingsView.extend({

    events: function () {
        return _.extend({}, SettingsView.prototype.events, {
            "click #xispec_lossyChkBx": "showLossy",
            "click #xispec_absErrChkBx": "absErrToggle",
            "click #xispec_accentuateCLcontainingChkBx": "accentuateCLcontainingToggle",
            "click #xispec_labelFragmentCharge": "chargeLabelToggle",
            "change #xispec_settingsLabelingCutoff": "setLabelCutoff",
            "change #xispec_settingsLabelFontSize": "setLabelFontSize",
            "change #xispec_colorSelector": "changeColorScheme",
            "change #xispec_settingsDecimals": "changeDecimals",
            "change #xispec_highlightColor": "changeHighlightColor",
            "change #xispec_hideNotSelectedFragments": "changePeakHighlightMode",
            "change #xispec_pepFragSelector": "changePepFragmentsVis",
        });
    },

    identifier: "Appearance Settings",

    initialize: function (options) {
        // load default options and super initialize the parent view
        const defaultOptions = {
            tabs: ["general", "labels", "fragments"]
        };
        this.options = _.extend(defaultOptions, options);
        arguments[0] = this.options;
        AppearanceSettingsView.__super__.initialize.apply(this, arguments);

        this.displayModel = this.options.displayModel;
        // event listeners
        this.listenTo(window.xiSPECUI.vent, "appearanceSettingsToggle", this.toggleView);

        // HTML elements
        //
        // general tab
        let generalTab = this.mainDiv.append("div")
            .attr("class", "xispec_settings-tab xispec_flex-column")
            .attr("id", "xispec_general_tab");
        generalTab.append("label").text("Color: ")
            .append("select").attr("id", "xispec_pepFragSelector").attr("class", "xispec_form-control pointer");
        let pepFragOptions = [
            {value: "both", text: "both peptides"},
            {value: "pep1", text: "only peptide 1"},
            {value: "pep2", text: "only peptide 2"}
        ];
        d3.select("#xispec_pepFragSelector").selectAll("option").data(pepFragOptions)
            .enter()
            .append("option")
            .attr("value", function (d) {
                return d.value;
            })
            .text(function (d) {
                return d.text;
            })
        ;

        // color selector
        generalTab.append("label").text("Color scheme: ")
            .append("select").attr("id", "xispec_colorSelector").attr("class", "xispec_form-control pointer");
        let colOptions = [
            {value: "RdBu", text: "Red (& Blue)"},
            {value: "BrBG", text: "Brown (& Teal)"},
            {value: "PiYG", text: "Pink (& Green)"},
            {value: "PRGn", text: "Purple (& Green)"},
            {value: "PuOr", text: "Orange (& Purple)"},
        ];
        d3.select("#xispec_colorSelector").selectAll("option").data(colOptions)
            .enter()
            .append("option")
            .attr("value", function (d) {
                return d.value;
            })
            .text(function (d) {
                return d.text;
            });
        this.highlightColorSelector = generalTab.append("label").text("Highlight Color: ")
            .append("input")
            .attr("class", "jscolor pointer")
            .attr("id", "xispec_highlightColor")
            .attr("value", this.model.get("highlightColor"))
            .attr("type", "text")
            .attr("style", "width: 103px;")
            .attr("data-jscolor", "{}");
        jscolor.install();

        this.decimals = generalTab.append("label").text("Number of decimals to display: ")
            .append("input").attr("type", "number").attr("id", "xispec_settingsDecimals")
            .attr("min", "1").attr("max", "10").attr("autocomplete", "off");
        generalTab.append("label").text("Absolute error values (QC): ")
            .append("input").attr("type", "checkbox").attr("id", "xispec_absErrChkBx")
        ;

        // labels tab
        let labelsTab = this.mainDiv.append("div")
            .attr("class", "xispec_settings-tab xispec_flex-column")
            .attr("id", "xispec_labels_tab")
            .style("display", "none");
        labelsTab.append("label").text("Show neutral loss labels: ")
            .append("input").attr("type", "checkbox").attr("id", "xispec_lossyChkBx");
        labelsTab.append("label").text("label fragment charge: ")
            .append("input").attr("type", "checkbox").attr("id", "xispec_labelFragmentCharge");
        labelsTab.append("label").text("labeling cutoff (% base peak): ")
            .append("input").attr("type", "number").attr("id", "xispec_settingsLabelingCutoff")
            .attr("min", "0").attr("max", "100").attr("autocomplete", "off")
            .attr("value", 0);
        this.labelFontSize = labelsTab.append("label").text("label font size (px): ")
            .append("input").attr("type", "number").attr("id", "xispec_settingsLabelFontSize")
            .attr("min", "1").attr("max", "50").attr("autocomplete", "off")
            .attr("value", this.model.get("labelFontSize"))
        ;

        // fragments tab
        let fragmentsTab = this.mainDiv.append("div")
            .attr("class", "xispec_settings-tab xispec_flex-column")
            .attr("id", "xispec_fragments_tab")
            .style("display", "none");
        fragmentsTab.append("label").text("accentuate crosslink containing fragments: ")
            .append("input").attr("type", "checkbox").attr("id", "xispec_accentuateCLcontainingChkBx");
        fragmentsTab.append("label").text("Hide not selected fragments: ")
            .append("input").attr("type", "checkbox").attr("id", "xispec_hideNotSelectedFragments")
        ;

        // end Tabs

        let d3el = d3.select(this.el);
        d3el.selectAll("label").classed("xispec_label", true);
        d3el.selectAll("input[type=text]").classed("xispec_form-control", true);
        d3el.selectAll("input[type=number]").classed("xispec_form-control", true);
        d3el.selectAll("input[type=textarea]").classed("xispec_form-control", true);
        d3el.selectAll("select").style("cursor", "pointer");

    },

    changeDecimals: function () {
        let showDecimals = parseInt(this.decimals[0][0].value);
        this.displayModel.set("showDecimals", showDecimals);
    },

    render: function () {
        if (!this.isVisible) return;
        this.decimals[0][0].value = this.model.get("showDecimals");
        $("#xispec_colorSelector").val(this.displayModel.get("colorScheme"));
        $("#xispec_pepFragSelector").val(this.displayModel.get("visFragments"));
        $("#xispec_lossyChkBx").prop("checked", this.displayModel.get("showLossLabels"));
        $("#xispec_labelFragmentCharge").prop("checked", this.displayModel.get("labelFragmentCharge"));
        $("#xispec_settingsLabelingCutoff").val(this.displayModel.get("labelCutoff"));
        $("#xispec_settingsLabelFontSize").val(this.displayModel.get("labelFontSize"));
        $("#xispec_accentuateCLcontainingChkBx").prop("checked", this.displayModel.get("accentuateCrossLinkContainingFragments"));
        $("#xispec_hideNotSelectedFragments").prop("checked", this.displayModel.get("hideNotSelectedFragments"));
        $("#xispec_absErrChkBx").prop("checked", this.displayModel.get("QCabsErr"));
        document.getElementById("xispec_highlightColor").jscolor.fromString(this.displayModel.get("highlightColor"));
    },

    cancel: function () {
        document.getElementById("xispec_highlightColor").jscolor.hide();
        AppearanceSettingsView.__super__.cancel.apply(this);
    },

    changeHighlightColor: function (e) {
        let color = e.target.value;//'#' + e.originalEvent.srcElement.value;
        //for now change color of model directly
        this.displayModel.set("highlightColor", color);
    },

    changePeakHighlightMode: function (e) {
        let selected = $(e.target).is(":checked");
        this.displayModel.set("hideNotSelectedFragments", selected);
    },

    showLossy: function (e) {
        let selected = $(e.target).is(":checked");
        this.displayModel.set("showLossLabels", selected);
    },

    absErrToggle: function (e) {
        let selected = $(e.target).is(":checked");
        this.displayModel.set("QCabsErr", selected);
        // window.xiSPECUI.vent.trigger('QCabsErr', selected);
    },

    accentuateCLcontainingToggle: function (e) {
        let selected = $(e.target).is(":checked");
        this.displayModel.set("accentuateCrossLinkContainingFragments", selected);
        // window.xiSPECUI.vent.trigger('accentuateCrossLinkContainingFragments', selected);
    },

    changePepFragmentsVis: function (e) {
        this.displayModel.set("visFragments", e.target.value);
        this.displayModel.updateColors();
    },

    chargeLabelToggle: function (e) {
        let selected = $(e.target).is(":checked");
        this.displayModel.set("labelFragmentCharge", selected);
        // window.xiSPECUI.vent.trigger('labelFragmentCharge', selected);
    },

    changeColorScheme: function (e) {
        let model = this.displayModel; //apply changes directly for now
        model.changeColorScheme(e.target.value);
    },

    setLabelCutoff: function (e) {
        this.displayModel.set("labelCutoff", parseInt(e.target.value));
    },

    setLabelFontSize: function (e) {
        this.displayModel.set("labelFontSize", parseInt(e.target.value));
    },
});

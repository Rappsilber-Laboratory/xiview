// import * as _ from 'underscore';
import Backbone from "backbone";
import d3 from "d3";
import * as $ from "jquery";

export const SpectrumControlsView = Backbone.View.extend({

    events: {
        "click #xispec_reset": "resetZoom",
        "submit #xispec_setrange": "setRange",
        "click #xispec_lockZoom": "toggleLockZoom",
        "click #xispec_clearHighlights": "clearHighlights",
        "click #xispec_measuringTool": "toggleMeasuringMode",
        "click #xispec_moveLabels": "toggleMoveLabels",
        "click #xispec_dl_spectrum_SVG": "downloadSpectrumSVG",
        "click #xispec_toggleDataSettings": "toggleDataSettings",
        "click #xispec_toggleAppearanceSettings": "toggleAppearanceSettings",
        "click #xispec_revertAnnotation": "revertAnnotation",
        "click #xispec_toggleSpecList": "toggleSpecList",
        "click #xispec_butterflyChkbx": "toggleButterfly",
        "click #xispec_butterflySwap": "butterflySwap",
        "click #xispec_butterflyHighlightBtn": "butterflyHighlight",
        "click #xispec_addSpectrum": "addSpectrum",
    },

    initialize: function () {

    	// event listeners
        this.listenTo(this.model, "change:mzRange", this.renderMzRange);
        this.listenTo(this.model, "change:changedAnnotation", this.changedAnnotation);
        this.listenTo(this.model, "change:butterfly", this.renderButterflyChkbox);
        this.listenTo(window.xiSPECUI.vent, "activeSpecPanel:changed", this.changedModel);

        // create HTML elements
        this.wrapper = d3.select(this.el);

        // spectrum controls before
        this.wrapper.append("span")
            .attr("id", "xispec_extra_spectrumControls_before")
        ;
        // downloadSVG
        this.wrapper.append("i")
            .attr("class", "xispec_btn xispec_btn-1a xispec_btn-topNav fa fa-download")
            .attr("aria-hidden", "true")
            .attr("id", "xispec_dl_spectrum_SVG")
            .attr("title", "download SVG")
            .attr("style", "cursor: pointer;")
        ;
        // moveLabelsLabel
        let moveLabelsLabel = this.wrapper.append("label")
            .attr("class", "xispec_btn")
            .text("Move Labels")
        ;
        // moveLabelCheckbox
		this.moveLabelsChkbox = moveLabelsLabel.append("input")
            .attr("id", "xispec_moveLabels")
            .attr("type", "checkbox")
        ;
		// toggleMeasureLabel
        let toggleMeasureLabel = this.wrapper.append("label")
            .attr("class", "xispec_btn")
            .attr("title", "measure mode on/off")
            .text("Measure")
        ;
        // toggleMeasureCheckbox
		this.measureModeChkbox = toggleMeasureLabel.append("input")
            .attr("class", "pointer")
            .attr("id", "xispec_measuringTool")
            .attr("type", "checkbox")
        ;
		// setRangeForm
        let setRangeForm = this.wrapper.append("form")
            .attr("id", "xispec_setrange")
        ;
        // mzRangeLabel
		setRangeForm.append("label")
            .attr("class", "xispec_btn")
            .attr("title", "m/z range")
            .attr("style", "cursor: default;")
            .text("m/z:")
        ;
        // lockZoomLabel
		setRangeForm.append("label")
            .attr("class", "xispec_btn")
            .attr("id", "xispec_lock")
            .attr("for", "xispec_lockZoom")
            .attr("title", "Lock current zoom level")
            .text("🔓")
        ;
        // lockZoomCheckbox
		setRangeForm.append("input")
            .attr("id", "xispec_lockZoom")
            .attr("type", "checkbox")
            .attr("style", "display: none;")
        ;
        // mzRangeFrom
		setRangeForm.append("input")
            .attr("id", "xispec_xleft")
            .attr("class", "xispec_form-control")
            .attr("type", "text")
            .attr("size", "5")
            .attr("title", "m/z range from:");
setRangeForm.append("span").text("-");
        // mzRangeTo
		setRangeForm.append("input")
            .attr("id", "xispec_xright")
            .attr("class", "xispec_form-control")
            .attr("type", "text")
            .attr("size", "5")
            .attr("title", "m/z range to:")
        ;
        // mzRangeSubmit
		setRangeForm.append("input")
            .attr("id", "xispec_mzRangeSubmit")
            .attr("type", "submit")
            .attr("style", "display:none;")
        ;
        // mzRangeError
		setRangeForm.append("span").attr("id", "xispec_range-error");
        // resetZoomButton
		setRangeForm.append("button")
            .attr("id", "xispec_reset")
            .attr("class", "xispec_btn xispec_btn-1 xispec_btn-1a")
            .text("Reset Zoom")
            .attr("title", "Reset to initial zoom level")
        ;
        // toggleDataSettingsButton
		this.wrapper.append("i")
            .attr("class", "xispec_btn xispec_btn-1a xispec_btn-topNav fa fa-cog")
            .attr("aria-hidden", "true")
            .attr("id", "xispec_toggleDataSettings")
            .attr("title", "show/hide data settings")
        ;
        // toggleAppearanceSettingsButton
        this.wrapper.append("i")
            .attr("class", "xispec_btn xispec_btn-1a xispec_btn-topNav fa fa-eye")
            .attr("aria-hidden", "true")
            .attr("id", "xispec_toggleAppearanceSettings")
            .attr("title", "show/hide appearance settings")
        ;
        // revertAnnotationButton
		this.wrapper.append("i")
            .attr("class", "xispec_btn xispec_btn-topNav fa fa-undo xispec_disabled")
            .attr("aria-hidden", "true")
            .attr("id", "xispec_revertAnnotation")
            .attr("title", "revert to original annotation")
        ;
        // addSpectrumBtn
        this.wrapper.append("i")
            .attr("id", "xispec_addSpectrum")
            .attr("title", "Add another spectrum panel")
            .attr("class", "xispec_btn xispec_btn-1a xispec_btn-topNav fa fa-plus")
            .attr("aria-hidden", "true")
        ;
		// butterflyControls
        this.butterflyControls = this.wrapper.append("div")
            .attr("id", "xispec_butterflyControls")
            // .attr('class', )
            .attr("style", "display:none;");
let butterflyMenu = this.butterflyControls.append("div")
            .attr("class", "xispec_multiSelect_dropdown");
        let butterflyToggleLabel = butterflyMenu.append("label").text("Butterly").attr("class", "xispec_btn");

        // butterflyCheckbox
        butterflyToggleLabel.append("input")
            .attr("class", "pointer")
            .attr("id", "xispec_butterflyChkbx")
            .attr("type", "checkbox");
this.butterflyMenuIcon = butterflyToggleLabel.append("i")
            .attr("class", "fa fa-chevron-down")
            .attr("aria-hidden", "true")
            .style("display", "none");
this.butterflyMenuContent = butterflyMenu.append("div");
        this.butterflyMenuContentList = this.butterflyMenuContent.append("ul").style("display", "none");
        let butterflySwap = this.butterflyMenuContentList.append("li")
            .text("Swap spectra")
            .attr("title", "swap position of original and re-annotated spectrum")
            .attr("id", "xispec_butterflySwap");
let butterflyHighlight = this.butterflyMenuContentList.append("li")
            .text("Highlight differences")
            .attr("title", "Highlight fragments that are in one annotation but not the other")
            .attr("id", "xispec_butterflyHighlightBtn");
this.butterflyMenuContentList.selectAll("li").classed ("xispec_btn xispec_btn-1a", true);


		// extra_controls_after
        this.wrapper.append("span")
            .attr("id", "xispec_extra_spectrumControls_after")
        ;
		// helpLink
        let helpLink = this.wrapper.append("a")
            .attr("href", "http://spectrumviewer.org/help.php")
            .attr("target", "_blank")
        ;
		// helpButton
        helpLink.append("i")
            .attr("class", "xispec_btn xispec_btn-1a xispec_btn-topNav fa fa-question")
            .attr("aria-hidden", "true")
            .attr("title", "Help");
},

    render: function () {
        this.renderMzRange();
        this.changedAnnotation();
        this.renderLockZoom();
        this.renderButterflyChkbox();
        this.moveLabelsChkbox.property("checked", this.model.get("moveLabels"));
        this.measureModeChkbox.property("checked", this.model.get("measureMode"));
    },

    renderLockZoom: function () {
        if (this.model.get("zoomLocked")) {
            $("#xispec_lock")[0].innerHTML = "&#128274";
            $("#xispec_mzRangeSubmit").prop("disabled", true);
            $("#xispec_xleft").prop("disabled", true);
            $("#xispec_xright").prop("disabled", true);
        } else {
            $("#xispec_lock")[0].innerHTML = "&#128275";
            $("#xispec_mzRangeSubmit").prop("disabled", false);
            $("#xispec_xleft").prop("disabled", false);
            $("#xispec_xright").prop("disabled", false);
        }
    },

    renderMzRange: function () {
        let mzRange = this.model.get("mzRange");
        $("#xispec_xleft").val(mzRange[0].toFixed(0));
        $("#xispec_xright").val(mzRange[1].toFixed(0));
    },

    renderButterflyChkbox: function () {
        let checked = this.model.get("butterfly");
        $("#xispec_butterflyChkbx").prop("checked", checked);
        if (checked) {
            this.butterflyMenuContent.classed("xispec_multiSelect_dropdown-content", true);
            this.butterflyMenuContentList.style("display", "inherit");
            this.butterflyMenuIcon.style("display", "inherit");
        } else {
            this.butterflyMenuContent.classed("xispec_multiSelect_dropdown-content", false);
            this.butterflyMenuIcon.style("display", "none");
            this.butterflyMenuContentList.style("display", "none");
        }
    },

    toggleDataSettings: function () {
        window.xiSPECUI.vent.trigger("dataSettingsToggle");
    },

    toggleAppearanceSettings: function () {
        window.xiSPECUI.vent.trigger("appearanceSettingsToggle");
    },

    toggleLockZoom: function (e) {
        let selected = $(e.target).is(":checked");
        this.model.set("zoomLocked", selected);
        this.renderLockZoom();
    },

    toggleMeasuringMode: function (e) {
        let selected = $(e.target).is(":checked");
        this.model.set("measureMode", selected);
    },

    toggleMoveLabels: function (e) {
        let selected = $(e.target).is(":checked");
        this.model.set("moveLabels", selected);
    },

    toggleButterfly: function (e) {
        let selected = $(e.target).is(":checked");
        this.model.set("butterfly", selected);
        this.renderButterflyChkbox();
    },

    butterflySwap: function () {
        if ($("#xispec_butterflyChkbx").is(":checked")){
            this.model.trigger("butterflySwap");
        }
    },

    butterflyHighlight: function () {
        window.xiSPECUI.vent.trigger("butterflyHighlight");
    },

    setRange: function (e) {
        e.preventDefault();
        let xl = xispec_xleft.value - 0;
        let xr = xispec_xright.value - 0;
        if (xl > xr) {
            $("#xispec_range-error")
				.show()
				.html("Error: " + xl + " is larger than " + xr);
} else {
            $("#xispec_range-error").hide();
            this.model.set("mzRange", [xl, xr]);
        }
    },

    resetZoom: function () {
        this.model.resetZoom();
    },

    downloadSpectrumSVG: function () {
        window.xiSPECUI.vent.trigger("downloadSpectrumSVG");
    },

    toggleSpecList: function () {
        window.xiSPECUI.vent.trigger("toggleTableView");
    },

    revertAnnotation: function () {
        if (this.model.get("changedAnnotation")) {
            window.xiSPECUI.vent.trigger("revertAnnotation");
            this.model.set("butterfly", false);
            $("#xispec_butterflyChkbx").prop("checked", false);
        }
    },

    changedAnnotation: function () {
        if (this.model.get("changedAnnotation")) {
            this.butterflyControls.attr("style", "display:-webkit-inline-box;");
            $("#xispec_revertAnnotation")
                .addClass("xispec_btn-1a")
                .removeClass("xispec_disabled");
        } else {
            this.butterflyControls.attr("style", "display:none;");
            $("#xispec_revertAnnotation")
                .addClass("xispec_disabled")
                .removeClass("xispec_btn-1a");
        }
    },

    addSpectrum: function () {
        window.xiSPECUI.vent.trigger("addSpectrum");
    },

    changedModel: function () {
        // update event listeners to changed model
        this.listenTo(this.model, "change:mzRange", this.renderMzRange);
        this.listenTo(this.model, "change:changedAnnotation", this.changedAnnotation);

        // update the View
        this.render();
    }

});

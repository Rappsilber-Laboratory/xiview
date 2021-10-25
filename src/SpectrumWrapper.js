import * as _ from "underscore";
import Backbone from "backbone";
import * as $ from "jquery";

import {AnnotatedSpectrumModel} from "./AnnotatedSpectrumModel";
import {SpectrumView} from "./SpectrumView2";
import {FragmentationKeyView} from "./FragmentationKeyView";
import {PrecursorInfoView} from "./PrecursorInfoView";
import {QCwrapperView} from "./QCwrapperView";
import {ErrorPlotView} from "./ErrorPlotView";
import d3 from "d3";

export const SpectrumWrapper = Backbone.View.extend({
    events: {
        "click .xispec_toggleActiveSpecPanel": "toggleActive",
        "click .xispec_closeSpecPanel": "close",
    },

    initialize: function (options) {

        const defaultOptions = {
            title: "",
        };
        this.options = _.extend(defaultOptions, options);
        this.title = this.options.title;

        // remove non-model options
        let model_options = $.extend({}, options.opt);
        delete model_options.targetDiv;
        delete model_options.showCustomConfig;
        delete model_options.showQualityControl;
        delete model_options.xiAnnotatorBaseURL;

        this.xiAnnotatorBaseURL = options.opt.xiAnnotatorBaseURL;
        this.id = options.id;

        // init models
        let SpectrumModel = new AnnotatedSpectrumModel(model_options);
        let SettingsSpectrumModel = new AnnotatedSpectrumModel(model_options);
        let originalSpectrumModel = new AnnotatedSpectrumModel(model_options);
        this.models = {
            "Spectrum": SpectrumModel,
            "SettingsSpectrum": SettingsSpectrumModel,
            "originalSpectrum": originalSpectrumModel,
        };

        // event listeners
        this.listenTo(window.xiSPECUI.vent, "activateSpecPanel", this.updateHeader);
        this.listenTo(SpectrumModel, "activate", this.toggleActive);

        // ToDo: create SpectrumPanel model to have these synced
        // sync model event listeners between original and spectrumModel
        originalSpectrumModel.listenTo(SpectrumModel, "change:moveLabels",
            function (spectrumModel) {
                this.set("moveLabels", spectrumModel.get("moveLabels"));
            }
        );
        // sync measureMode
        originalSpectrumModel.listenTo(SpectrumModel, "change:measureMode",
            function (spectrumModel) {
                this.set("measureMode", spectrumModel.get("measureMode"));
            }
        );
        // sync zoomLock
        originalSpectrumModel.listenTo(SpectrumModel, "change:zoomLocked",
            function (spectrumModel) {
                this.set("zoomLocked", spectrumModel.get("zoomLocked"));
            }
        );
        // sync butterfly
        originalSpectrumModel.listenTo(SpectrumModel, "change:butterfly",
            function (spectrumModel) {
                this.set("butterfly", spectrumModel.get("butterfly"));
            }
        );
        originalSpectrumModel.listenTo(SpectrumModel, "butterflySwap",
            function () {
                this.trigger("butterflySwap");
            }
        );
        // sync mzRange
        originalSpectrumModel.listenTo(SpectrumModel, "change:mzRange",
            function (spectrumModel) {
                this.setZoom(spectrumModel.get("mzRange"));
            }
        );
        SpectrumModel.listenTo(originalSpectrumModel, "change:mzRange",
            function (spectrumModel) {
                this.setZoom(spectrumModel.get("mzRange"));
            }
        );
        // sync appearanceSettings
        originalSpectrumModel.listenTo(SpectrumModel, "change:showDecimals",
            function (spectrumModel) {
                this.set("showDecimals", spectrumModel.get("showDecimals"));
            }
        );
        originalSpectrumModel.listenTo(SpectrumModel, "change:visFragments",
            function (spectrumModel) {
                this.set("visFragments", spectrumModel.get("visFragments"));
                this.updateColors();
            }
        );
        originalSpectrumModel.listenTo(SpectrumModel, "change:colorScheme",
            function (spectrumModel) {
                this.changeColorScheme(spectrumModel.get("colorScheme"));
            }
        );
        originalSpectrumModel.listenTo(SpectrumModel, "change:highlightColor",
            function (spectrumModel) {
                this.set("highlightColor", spectrumModel.get("highlightColor"));
            }
        );
        originalSpectrumModel.listenTo(SpectrumModel, "change:hideNotSelectedFragments",
            function (spectrumModel) {
                this.set("hideNotSelectedFragments", spectrumModel.get("hideNotSelectedFragments"));
            }
        );
        originalSpectrumModel.listenTo(SpectrumModel, "change:accentuateCrossLinkContainingFragments",
            function (spectrumModel) {
                this.set("accentuateCrossLinkContainingFragments", spectrumModel.get("accentuateCrossLinkContainingFragments"));
            }
        );
        originalSpectrumModel.listenTo(SpectrumModel, "change:showLossLabels",
            function (spectrumModel) {
                this.set("showLossLabels", spectrumModel.get("showLossLabels"));
            }
        );
        originalSpectrumModel.listenTo(SpectrumModel, "change:labelFragmentCharge",
            function (spectrumModel) {
                this.set("labelFragmentCharge", spectrumModel.get("labelFragmentCharge"));
            }
        );
        originalSpectrumModel.listenTo(SpectrumModel, "change:labelCutoff",
            function (spectrumModel) {
                this.set("labelCutoff", spectrumModel.get("labelCutoff"));
            }
        );
        originalSpectrumModel.listenTo(SpectrumModel, "change:labelFontSize",
            function (spectrumModel) {
                this.set("labelFontSize", spectrumModel.get("labelFontSize"));
            }
        );


        // empty the el
        d3.select(this.el).selectAll("*").remove();

        // create HTML elements
        let d3el = d3.select(this.el);
        // header
        let headerClass = (this.id === 0) ? "xispec_activeSpecHeader" : "xispec_inactiveSpecHeader";
        let headerTitle = "Spectrum " + (this.id + 1) + this.options.title;
        this.headerDiv = d3el.append("div")
            .attr("class", headerClass)
            .attr("id", "xispec_specHeader" + this.id);
        this.headerTitle = this.headerDiv.append("span").html(headerTitle);
        // spectrum panel controls
        let specPanelControls = this.headerDiv.append("span")
            .attr("class", "xispec_specPanelControls");
        this.thumbTackIcon = specPanelControls.append("i")
            .attr("class", "fa fa-thumb-tack xispec_toggleActiveSpecPanel")
            .attr("id", "xispec_toggleActiveSpecPanel" + this.id)
            .attr("aria-hidden", "true")
        // .style('opacity', 0)
        ;
        if (this.id !== 0) {
            let closeIcon = specPanelControls.append("i")
                .attr("class", "fa fa-times xispec_closeSpecPanel")
                .attr("id", "xispec_closeSpecPanel" + this.id)
                .attr("aria-hidden", "true")
                .attr("title", "Close this spectrum panel.");
        }
        // spectrum panel div
        let specPanelDiv = d3el.append("div").attr("class", "xispec_plotsDiv");
        // Main plot div
        let plotDiv = specPanelDiv.append("div")
            .attr("class", "xispec_spectrumMainPlotDiv")
            .attr("id", "xispec_spectrumMainPlotDiv" + this.id)
        ;
        // svg elements
        let specSVG = plotDiv.append("svg")
            .attr("class", "xispec_Svg")
            .attr("id", "xispec_Svg" + this.id);
        specSVG.append("g")
            .attr("id", "xispec_spectrumSvgGroup" + this.id);
        specSVG.append("g")
            .attr("id", "xispec_measureTooltipSvgGroup" + this.id)
        ;
        // QC elements
        let _QC_html = "" +
            "<div class='xispec_subViewHeader'></div>" +
            " <div class='xispec_subViewContent'>" +
            "  <div class='xispec_subViewContent-plot' id='xispec_subViewContent-left" + this.id + "'>" +
            "   <svg id='xispec_errIntSVG" + this.id + "' class='xispec_errSVG'></svg>" +
            "  </div>" +
            "  <div class='xispec_subViewContent-plot' id='xispec_subViewContent-right" + this.id + "'>" +
            "   <svg id='xispec_errMzSVG" + this.id + "' class='xispec_errSVG'></svg>" +
            " </div>" +
            "</div>";
        let qcDiv = specPanelDiv.append("div")
            .attr("class", "xispec_QCdiv")
            .attr("id", "xispec_QCdiv" + this.id)
            .html(_QC_html)
        ;

        // create Views
        let Spectrum = new SpectrumView({
            model: SpectrumModel,
            el: "#xispec_spectrumSvgGroup" + this.id,
            measureTooltipSvgG: "#xispec_measureTooltipSvgGroup" + this.id,
            id: "curSpectrum",
        });
        let originalSpectrum = new SpectrumView({
            model: originalSpectrumModel,
            el: "#xispec_spectrumSvgGroup" + this.id,
            measureTooltipSvgG: "#xispec_measureTooltipSvgGroup" + this.id,
            invert: true,
            hidden: true,
            id: "originalSpectrum",
        });
        let FragmentationKey = new FragmentationKeyView({
            model: SpectrumModel,
            el: "#xispec_Svg" + this.id,
            id: "curFragmentationKey",
        });
        let originalFragmentationKey = new FragmentationKeyView({
            model: originalSpectrumModel,
            el: "#xispec_Svg" + this.id,
            invert: true,
            hidden: true,
            disabled: true,
            id: "originalFragmentationKey",
        });
        let PrecursorInfo = new PrecursorInfoView({
            model: SpectrumModel,
            el: "#xispec_Svg" + this.id,
            id: "curPrecursorInfo",
        });
        let originalPrecursorInfo = new PrecursorInfoView({
            model: originalSpectrumModel,
            el: "#xispec_Svg" + this.id,
            invert: true,
            hidden: true,
            id: "originalPrecursorInfo",
        });
        let QCWrapper = new QCwrapperView({
            el: "#xispec_QCdiv" + this.id,
            splitIds: ["#xispec_spectrumMainPlotDiv" + this.id, "#xispec_QCdiv" + this.id],
            showQualityControl: options.showQualityControl,
            specPanelId: this.id,
        });
        let ErrorIntensityPlot = new ErrorPlotView({
            model: SpectrumModel,
            el: "#xispec_subViewContent-left" + this.id,
            xData: "Intensity",
            margin: {top: 10, right: 30, bottom: 20, left: 65},
            svg: "#xispec_errIntSVG" + this.id,
            specPanelId: this.id,
        });
        let ErrorMzPlot = new ErrorPlotView({
            model: SpectrumModel,
            el: "#xispec_subViewContent-right" + this.id,
            xData: "m/z",
            margin: {top: 10, right: 30, bottom: 20, left: 65},
            svg: "#xispec_errMzSVG" + this.id,
            specPanelId: this.id,
        });

        this.views = {
            "Spectrum": Spectrum,
            "originalSpectrum": originalSpectrum,
            "FragmentationKey": FragmentationKey,
            "originalFragmentationKey": originalFragmentationKey,
            "PrecursorInfo": PrecursorInfo,
            "originalPrecursorInfo": originalPrecursorInfo,
            "QCWrapper": QCWrapper,
            "ErrorIntensityPlot": ErrorIntensityPlot,
            "ErrorMzPlot": ErrorMzPlot,

        };
        if (options.showQualityControl !== "min")
            window.xiSPECUI.vent.trigger("QCWrapperShow", this.id);
    },

    requestAnnotation: function (json_request, annotatorURL, isOriginalMatchRequest,) {
        if (json_request.annotation.requestID)
            window.xiSPECUI.lastRequestedID = json_request.annotation.requestID;

        this.models["Spectrum"].trigger("requestAnnotation:pending");
        console.log("annotation request:", json_request);
        let self = this;
        $.ajax({
            type: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            data: JSON.stringify(json_request),
            url: this.xiAnnotatorBaseURL + annotatorURL,
            success: function (data) {
                if (data && data.annotation && data.annotation.requestID &&
                    data.annotation.requestID === window.xiSPECUI.lastRequestedID) {
                    //ToDo: Error handling -> https://github.com/Rappsilber-Laboratory/xi3-issue-tracker/issues/330
                    console.log("annotation response:", data);

                    if (isOriginalMatchRequest) {
                        self.models["originalSpectrum"].set({"JSONdata": data, "JSONrequest": json_request});
                        self.originalMatchRequest = $.extend(true, {}, json_request);
                        self.originalAnnotator = annotatorURL;
                    }

                    self.models["Spectrum"].set({"JSONdata": data, "JSONrequest": json_request});
                    self.models["SettingsSpectrum"].set({"JSONdata": data, "JSONrequest": json_request});
                    self.models["SettingsSpectrum"].trigger("change:JSONdata");
                    self.models["Spectrum"].trigger("requestAnnotation:done");
                }

            }
        });
    },

    revertAnnotation: function () {
        if (this.models["Spectrum"].get("changedAnnotation")) {
            this.models["Spectrum"].reset_all_modifications();
            this.models["SettingsSpectrum"].reset_all_modifications();
            this.models["Spectrum"].set("annotatorURL", this.originalAnnotator);
            this.requestAnnotation(this.originalMatchRequest, this.models["Spectrum"].get("annotatorURL"));
            this.models["Spectrum"].set("changedAnnotation", false);
        }
    },

    toggleActive: function () {
        window.xiSPECUI.vent.trigger("activateSpecPanel", this.id);
    },

    close: function () {
        this.destroy();
        window.xiSPECUI.vent.trigger("closeSpecPanel", this.id);
    },

    // clear: function () {
    // 	this.SpectrumModel.clear();
    // 	this.SettingsSpectrumModel.clear();
    // },

    destroy: function () {
        for (let key in this.views) {
            this.views[key].remove();
        }
        d3.select(this.el).remove();
    },

    updateHeader: function (activeId) {
        if (activeId !== this.id) {
            this.headerDiv.attr("class", "xispec_inactiveSpecHeader");
            this.thumbTackIcon.attr("title", "Activate this spectrum panel.");
        } else {
            this.headerDiv.attr("class", "xispec_activeSpecHeader");
            this.thumbTackIcon.attr("title", "This is the active spectrum panel.");
        }
    },

    setHeaderVis: function (visible) {
        if (visible)
            this.headerDiv.style("display", "block");
        else
            this.headerDiv.style("display", "none");
    },

    setTitle: function (title) {
        if (title) {
            this.title = title;
            this.headerTitle.html(this.title);
        }
    },

    butterflyHighlight: function () {
        // get fragments from original and re-annotated spectrum and highlight non-overlap
        let spec_frags = this.models["Spectrum"].fragments;
        let orig_frags = this.models["originalSpectrum"].fragments;
        let spec_fragIdStrs = _.pluck(spec_frags, "idStr");
        let orig_fragIdStrs = _.pluck(orig_frags, "idStr");

        let spec_highlightFrags = spec_frags.filter(function (f) {
            return orig_fragIdStrs.indexOf(f.idStr) === -1;
        });
        let orig_highlightFrags = orig_frags.filter(function (f) {
            return spec_fragIdStrs.indexOf(f.idStr) === -1;
        });

        this.models["Spectrum"].addHighlight(spec_highlightFrags);
        this.models["Spectrum"].updateStickyHighlight(spec_highlightFrags, false);
        this.models["originalSpectrum"].addHighlight(orig_highlightFrags);
        this.models["originalSpectrum"].updateStickyHighlight(orig_highlightFrags, false);
    }
});

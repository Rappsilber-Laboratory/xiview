import * as _ from "underscore";
import Backbone from "backbone";
import $ from "jquery";

import {AnnotatedSpectrumModel} from "./annotated-spectrum-model";
import {xiSPECUI} from "./xispecui";
import {SpectrumView} from "./SpectrumView2";
import {FragmentationKeyView} from "./FragmentationKeyView";
import {PrecursorInfoView} from "./PrecursorInfoView";
import {QCwrapperView} from "./QCwrapperView";
import {ErrorPlotView} from "./ErrorPlotView";
import d3 from "d3";
import {showMessage} from "../../ui-utils/message-popup";

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

        // remove non-backbone-models options
        let model_options = $.extend({}, options.opt);
        delete model_options.targetDiv;
        delete model_options.showCustomConfig;
        delete model_options.showQualityControl;
        delete model_options.apiBase;

        // annotation requests go to the API's get_annotated_peaklist, which adds the spectrum's peaks from the DB
        this.apiBase = options.opt.apiBase;
        // {id, sd_ref, upload_id} of the spectrum this panel shows; null while none is shown or a new one is loading
        this.spectrumRef = null;
        // number of the latest annotation request; responses to earlier requests are dropped
        this.annotationRequestCount = 0;
        this.id = options.id;

        // init clms-backbone-models
        this.spectrumModel = new AnnotatedSpectrumModel(model_options);
        this.settingsSpectrumModel = new AnnotatedSpectrumModel(model_options);
        this.originalSpectrumModel = new AnnotatedSpectrumModel(model_options);

        // event listeners
        this.listenTo(xiSPECUI.vent, "activateSpecPanel", this.updateHeader);
        this.listenTo(this.spectrumModel, "activate", this.toggleActive);

        // ToDo: create SpectrumPanel backbone-models to have these synced
        // sync backbone-models event listeners between original and spectrumModel
        this.originalSpectrumModel.listenTo(this.spectrumModel, "change:moveLabels",
            function (spectrumModel) {
                this.set("moveLabels", spectrumModel.get("moveLabels"));
            }
        );
        // sync measureMode
        this.originalSpectrumModel.listenTo(this.spectrumModel, "change:measureMode",
            function (spectrumModel) {
                this.set("measureMode", spectrumModel.get("measureMode"));
            }
        );
        // sync zoomLock
        this.originalSpectrumModel.listenTo(this.spectrumModel, "change:zoomLocked",
            function (spectrumModel) {
                this.set("zoomLocked", spectrumModel.get("zoomLocked"));
            }
        );
        // sync butterfly
        this.originalSpectrumModel.listenTo(this.spectrumModel, "change:butterfly",
            function (spectrumModel) {
                this.set("butterfly", spectrumModel.get("butterfly"));
            }
        );
        this.originalSpectrumModel.listenTo(this.spectrumModel, "butterflySwap",
            function () {
                this.trigger("butterflySwap");
            }
        );
        // sync mzRange
        this.originalSpectrumModel.listenTo(this.spectrumModel, "change:mzRange",
            function (spectrumModel) {
                this.setZoom(spectrumModel.get("mzRange"));
            }
        );
        this.spectrumModel.listenTo(this.originalSpectrumModel, "change:mzRange",
            function (spectrumModel) {
                this.setZoom(spectrumModel.get("mzRange"));
            }
        );
        // sync appearanceSettings
        this.originalSpectrumModel.listenTo(this.spectrumModel, "change:showDecimals",
            function (spectrumModel) {
                this.set("showDecimals", spectrumModel.get("showDecimals"));
            }
        );
        this.originalSpectrumModel.listenTo(this.spectrumModel, "change:visFragments",
            function (spectrumModel) {
                this.set("visFragments", spectrumModel.get("visFragments"));
                this.updateColors();
            }
        );
        this.originalSpectrumModel.listenTo(this.spectrumModel, "change:colorScheme",
            function (spectrumModel) {
                this.changeColorScheme(spectrumModel.get("colorScheme"));
            }
        );
        this.originalSpectrumModel.listenTo(this.spectrumModel, "change:highlightColor",
            function (spectrumModel) {
                this.set("highlightColor", spectrumModel.get("highlightColor"));
            }
        );
        this.originalSpectrumModel.listenTo(this.spectrumModel, "change:hideNotSelectedFragments",
            function (spectrumModel) {
                this.set("hideNotSelectedFragments", spectrumModel.get("hideNotSelectedFragments"));
            }
        );
        this.originalSpectrumModel.listenTo(this.spectrumModel, "change:accentuateCrossLinkContainingFragments",
            function (spectrumModel) {
                this.set("accentuateCrossLinkContainingFragments", spectrumModel.get("accentuateCrossLinkContainingFragments"));
            }
        );
        this.originalSpectrumModel.listenTo(this.spectrumModel, "change:showLossLabels",
            function (spectrumModel) {
                this.set("showLossLabels", spectrumModel.get("showLossLabels"));
            }
        );
        this.originalSpectrumModel.listenTo(this.spectrumModel, "change:labelFragmentCharge",
            function (spectrumModel) {
                this.set("labelFragmentCharge", spectrumModel.get("labelFragmentCharge"));
            }
        );
        this.originalSpectrumModel.listenTo(this.spectrumModel, "change:labelCutoff",
            function (spectrumModel) {
                this.set("labelCutoff", spectrumModel.get("labelCutoff"));
            }
        );
        this.originalSpectrumModel.listenTo(this.spectrumModel, "change:labelFontSize",
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
            .attr("aria-hidden", "true");
        // .style('opacity', 0);
        if (this.id !== 0) {
            // eslint-disable-next-line no-unused-vars
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
            .attr("id", "xispec_spectrumMainPlotDiv" + this.id);
        // svg elements
        let specSVG = plotDiv.append("svg")
            .attr("class", "xispec_Svg")
            .attr("id", "xispec_Svg" + this.id);
        specSVG.append("g")
            .attr("id", "xispec_spectrumSvgGroup" + this.id);
        specSVG.append("g")
            .attr("id", "xispec_measureTooltipSvgGroup" + this.id);
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
        // eslint-disable-next-line no-unused-vars
        let qcDiv = specPanelDiv.append("div")
            .attr("class", "xispec_QCdiv")
            .attr("id", "xispec_QCdiv" + this.id)
            .html(_QC_html);

        // create Views
        let Spectrum = new SpectrumView({
            model: this.spectrumModel,
            el: "#xispec_spectrumSvgGroup" + this.id,
            measureTooltipSvgG: "#xispec_measureTooltipSvgGroup" + this.id,
            id: "curSpectrum",
            compositeModelInst: options.opt.compositeModelInst,
        });
        let originalSpectrum = new SpectrumView({
            model: this.originalSpectrumModel,
            el: "#xispec_spectrumSvgGroup" + this.id,
            measureTooltipSvgG: "#xispec_measureTooltipSvgGroup" + this.id,
            invert: true,
            hidden: true,
            id: "originalSpectrum",
            compositeModelInst: options.opt.compositeModelInst,
        });
        let FragmentationKey = new FragmentationKeyView({
            model: this.spectrumModel,
            el: "#xispec_Svg" + this.id,
            id: "curFragmentationKey",
        });
        let originalFragmentationKey = new FragmentationKeyView({
            model: this.originalSpectrumModel,
            el: "#xispec_Svg" + this.id,
            invert: true,
            hidden: true,
            disabled: true,
            id: "originalFragmentationKey",
        });
        let PrecursorInfo = new PrecursorInfoView({
            model: this.spectrumModel,
            el: "#xispec_Svg" + this.id,
            id: "curPrecursorInfo",
        });
        let originalPrecursorInfo = new PrecursorInfoView({
            model: this.originalSpectrumModel,
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
            model: this.spectrumModel,
            el: "#xispec_subViewContent-left" + this.id,
            xData: "Intensity",
            margin: {top: 10, right: 30, bottom: 20, left: 65},
            svg: "#xispec_errIntSVG" + this.id,
            specPanelId: this.id,
            compositeModelInst: options.opt.compositeModelInst,
        });
        let ErrorMzPlot = new ErrorPlotView({
            model: this.spectrumModel,
            el: "#xispec_subViewContent-right" + this.id,
            xData: "m/z",
            margin: {top: 10, right: 30, bottom: 20, left: 65},
            svg: "#xispec_errMzSVG" + this.id,
            specPanelId: this.id,
            compositeModelInst: options.opt.compositeModelInst,
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
            xiSPECUI.vent.trigger("QCWrapperShow", this.id);
    },

    /**
     * Load and annotate a newly selected spectrum in this panel.
     * @param {{id: string, sd_ref: string|number, upload_id: string|number}} spectrumRef - where the API finds the peaks
     * @param {Object} json_request - annotation request (without peaks, the API adds them)
     * @returns {void}
     */
    loadSpectrum: function (spectrumRef, json_request) {
        // until the new spectrum arrives there is no shown spectrum to re-annotate
        this.spectrumRef = null;
        this.fetchAnnotation(spectrumRef, json_request, true);
    },

    /**
     * Re-annotate the spectrum this panel shows with a changed request.
     * @param {Object} json_request - annotation request; its peaks are ignored, the API adds the stored ones
     * @returns {void}
     */
    requestAnnotation: function (json_request) {
        if (!this.spectrumRef) {
            showMessage("Can't re-annotate: no spectrum is loaded (or the selected one is still loading).", "error");
            return;
        }
        this.fetchAnnotation(this.spectrumRef, json_request, false);
    },

    /**
     * POST an annotation request for a stored spectrum and show the result.
     * Only the response to the latest request is shown, so a slow earlier response can't replace a later one.
     * @param {{id: string, sd_ref: string|number, upload_id: string|number}} spectrumRef - where the API finds the peaks
     * @param {Object} json_request - annotation request
     * @param {boolean} isNewSpectrum - true when loading a newly selected spectrum, false when re-annotating
     * @returns {void}
     */
    fetchAnnotation: function (spectrumRef, json_request, isNewSpectrum) {
        const requestNumber = ++this.annotationRequestCount;
        this.spectrumModel.trigger("requestAnnotation:pending");

        const url = this.apiBase + "get_annotated_peaklist"
            + "?id=" + encodeURIComponent(spectrumRef.id)
            + "&sd_ref=" + encodeURIComponent(spectrumRef.sd_ref)
            + "&upload_id=" + encodeURIComponent(spectrumRef.upload_id);

        fetch(url, {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(json_request),
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (requestNumber !== this.annotationRequestCount) {
                    return; // superseded by a later request
                }
                if (isNewSpectrum) {
                    this.showNewSpectrum(spectrumRef, data, json_request);
                } else {
                    this.showAnnotation(data, json_request);
                }
                this.spectrumModel.trigger("requestAnnotation:done");
            })
            .catch(error => {
                if (requestNumber !== this.annotationRequestCount) {
                    return;
                }
                console.error("Error during annotation request:", error);
                this.spectrumModel.trigger("requestAnnotation:done");
                if (isNewSpectrum) {
                    // the spectrum view stays empty: the previous spectrum is not the selected one
                    showMessage("Couldn't load the spectrum for the selected match (" + _.escape(String(error.message)) + ").", "error");
                } else {
                    // redraw the last annotation that succeeded; the models still hold it
                    this.spectrumModel.trigger("change:JSONdata");
                    showMessage("Re-annotation failed (" + _.escape(String(error.message)) + "). The previous annotation is shown.", "error");
                }
            });
    },

    /**
     * Show a newly loaded spectrum: reset per-spectrum state and keep its request for revert.
     * @param {Object} spectrumRef - where the API finds the peaks
     * @param {Object} data - annotation response
     * @param {Object} json_request - the request it answers
     * @returns {void}
     */
    showNewSpectrum: function (spectrumRef, data, json_request) {
        const specModel = this.spectrumModel;
        specModel.set("butterfly", false);
        specModel.set("changedAnnotation", false);
        specModel.reset_all_modifications();
        specModel.set("spectrum_id", data.spectrum_id);
        specModel.set("spectrum_title", data.spectrum_title);
        this.originalMatchRequest = $.extend(true, {}, json_request);

        this.showAnnotation(data, json_request);
        this.originalSpectrumModel.set({"JSONdata": data, "JSONrequest": json_request});
        this.originalSpectrumModel.updateKnownModifications();
        specModel.updateKnownModifications();
        // set last, with the data it belongs to, so a re-annotation always pairs this spectrum with its own request
        this.spectrumRef = spectrumRef;
    },

    /**
     * @param {Object} data - annotation response
     * @param {Object} json_request - the request it answers
     * @returns {void}
     */
    showAnnotation: function (data, json_request) {
        this.spectrumModel.set({"JSONdata": data, "JSONrequest": json_request});
        this.settingsSpectrumModel.set({"JSONdata": data, "JSONrequest": json_request});
        this.settingsSpectrumModel.trigger("change:JSONdata");
    },

    revertAnnotation: function () {
        if (this.spectrumModel.get("changedAnnotation")) {
            this.spectrumModel.reset_all_modifications();
            this.settingsSpectrumModel.reset_all_modifications();
            this.requestAnnotation($.extend(true, {}, this.originalMatchRequest));
            this.spectrumModel.set("changedAnnotation", false);
        }
    },

    toggleActive: function () {
        xiSPECUI.vent.trigger("activateSpecPanel", this.id);
    },

    close: function () {
        this.destroy();
        xiSPECUI.vent.trigger("closeSpecPanel", this.id);
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
        let spec_frags = this.spectrumModel.fragments;
        let orig_frags = this.this.originalSpectrumModel.fragments;
        let spec_fragIdStrs = _.pluck(spec_frags, "idStr");
        let orig_fragIdStrs = _.pluck(orig_frags, "idStr");

        let spec_highlightFrags = spec_frags.filter(function (f) {
            return orig_fragIdStrs.indexOf(f.idStr) === -1;
        });
        let orig_highlightFrags = orig_frags.filter(function (f) {
            return spec_fragIdStrs.indexOf(f.idStr) === -1;
        });

        this.spectrumModel.addHighlight(spec_highlightFrags);
        this.spectrumModel.updateStickyHighlight(spec_highlightFrags, false);
        this.this.originalSpectrumModel.addHighlight(orig_highlightFrags);
        this.this.originalSpectrumModel.updateStickyHighlight(orig_highlightFrags, false);
    }
});

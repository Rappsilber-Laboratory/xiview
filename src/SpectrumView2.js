import "../css/spectrum.css";
import "../css/dropdown.css";
import "../css/font-awesome.min.css";
import * as $ from "jquery";
import * as _ from "underscore";
import Backbone from "backbone";
import * as d3 from "d3";
import * as Spinner from "spin";
import {xiSPECUI} from "./xispecui";

import {Graph} from "./graph/Graph";
import {svgUtils} from "../vendor/svgexp";
import {download} from "./download";

/**
 * Backbone view for rendering and managing a spectrum visualization.
 * Handles user interactions, model updates, and coordinates with the Graph component.
 *
 * @class SpectrumView
 * @extends Backbone.View
 * @property {Graph} graph - The Graph instance for rendering the spectrum
 * @property {Object} options - View configuration options
 * @property {Spinner} spinner - Loading spinner instance
 * @property {d3.selection} svg - D3 selection of the SVG element
 */
export const SpectrumView = Backbone.View.extend({

    events: {},

    /**
     * Initializes the spectrum view.
     * Sets up the graph, event listeners, and spinner.
     *
     * @method initialize
     * @param {Object} viewOptions - Configuration options for this view
     * @param {boolean} [viewOptions.invert=false] - Whether to invert graph orientation
     * @param {boolean} [viewOptions.hidden=false] - Whether to hide the graph initially
     * @param {string} [viewOptions.xlabel="m/z"] - Label for x-axis
     * @param {string} [viewOptions.ylabelLeft="Intensity"] - Label for left y-axis
     * @param {string} [viewOptions.ylabelRight="% of base Peak"] - Label for right y-axis
     * @param {boolean} [viewOptions.butterfly=false] - Whether to use butterfly mode
     */
    initialize: function (viewOptions) {

        const defaultOptions = {
            invert: false,
            hidden: false,
            xlabel: "m/z",
            ylabelLeft: "Intensity",
            ylabelRight: "% of base Peak",
            butterfly: false,
        };

        this.options = _.extend(defaultOptions, viewOptions);
        this.initialOrientation = this.options.invert;

        this.spinner = new Spinner({scale: 5});
        this.svg = d3.select(this.el);

        // create graph
        this.graph = new Graph(this.svg, this.model, this.options);

        $(this.el).css("background-color", "#fff");

        this.listenTo(xiSPECUI.vent, "resize", _.debounce(this.resize));

        this.listenTo(this.model, "change:JSONdata", this.render);
        this.listenTo(this.model, "change:measureMode", this.measuringTool);
        this.listenTo(this.model, "change:moveLabels", this.moveLabels);
        this.listenTo(this.model, "change:zoomLocked", this.lockZoomToggle);
        this.listenTo(this.model, "change:butterfly", this.butterflyToggle);
        this.listenTo(this.model, "change:highlightColor", this.updateHighlightColors);
        this.listenTo(this.model, "change:colors", this.setColors);
        this.listenTo(this.model, "change:mzRange", this.updateMzRange);
        this.listenTo(this.model, "butterflySwap", this.butterflySwap);
        this.listenTo(this.model, "change:labelFragmentCharge", this.render);
        this.listenTo(this.model, "change:labelCutoff", this.labelCutoff);
        this.listenTo(this.model, "change:labelFontSize", this.changeLabelFontSize);
        this.listenTo(this.model, "change:accentuateCrossLinkContainingFragments", this.render);
        this.listenTo(this.model, "change:hideNotSelectedFragments", this.updatePeakHighlighting);
        this.listenTo(this.model, "change:showLossLabels", this.showLossy);

        this.listenTo(xiSPECUI.vent, "downloadSpectrumSVG", this.downloadSVG);
        this.listenTo(xiSPECUI.vent, "resize:spectrum", this.resize);
        this.listenTo(xiSPECUI.vent, "clearSpectrumHighlights", this.clearHighlights);

        this.listenTo(this.model, "resetZoom", this.resetZoom);
        this.listenTo(this.model, "changed:Highlights", this.updateHighlights);

        this.listenTo(this.model, "requestAnnotation:pending", this.showSpinner);
        this.listenTo(this.model, "requestAnnotation:done", this.hideSpinner);

        //this.listenTo(this.model, 'destroy', this.remove);
    },

    /**
     * Renders the spectrum view.
     * Clears the current graph and redraws with current model data.
     *
     * @method render
     * @returns {SpectrumView} Returns this for chaining
     */
    render: function () {
        this.graph.clear();
        if (this.options.hidden) {
            this.graph.hide();
            return this;
        } else {
            this.graph.show();
        }
        if (!this.model.get("zoomLocked")) {
            this.graph.resize(this.model.xminPrimary, this.model.xmaxPrimary, this.model.ymin, this.model.ymaxPrimary);
        }
        if (this.model.get("JSONdata")) {
            this.graph.setData();
        }
        return this;
    },

    /**
     * Resets the zoom to show the full spectrum range.
     *
     * @method resetZoom
     */
    resetZoom: function () {
        this.graph.yZoomed = false;
        this.graph.resize(this.model.xminPrimary, this.model.xmaxPrimary, this.model.ymin, this.model.ymaxPrimary);
    },

    /**
     * Updates the displayed m/z range when the model's mzRange changes.
     *
     * @method updateMzRange
     * @private
     */
    updateMzRange: function () {
        //resize if the mzRange is not up to date
        let mzRange = this.model.get("mzRange");
        if (mzRange === undefined)
            return;
        if (mzRange[0] == this.graph.xscale.domain()[0] && mzRange[1] == this.graph.xscale.domain()[1])
            return;
        this.resize();
    },

    /**
     * Resizes the graph to fit the current container and m/z range.
     *
     * @method resize
     */
    resize: function () {
        let mzRange = this.model.get("mzRange");
        if (mzRange === undefined)
            return;
        this.graph.resize(mzRange[0], mzRange[1], this.model.ymin, this.model.ymax);
    },

    /**
     * Shows or hides lossy fragment labels based on model setting.
     *
     * @method showLossy
     */
    showLossy: function () {
        this.graph.lossyShown = this.model.get("showLossLabels");
        this.graph.updatePeakLabels();
    },

    /**
     * Toggles zoom locking on/off based on model setting.
     *
     * @method lockZoomToggle
     */
    lockZoomToggle: function () {
        if (this.model.get("zoomLocked")) {
            this.graph.disableZoom();
        } else {
            this.graph.enableZoom();
        }
    },

    /**
     * Clears all sticky highlights from the spectrum.
     *
     * @method clearHighlights
     */
    clearHighlights: function () {
        this.model.clearStickyHighlights();
    },

    /**
     * Applies the current color scheme to all peaks.
     *
     * @method setColors
     */
    setColors: function () {
        this.graph.setColors();
    },

    /**
     * Updates peak highlighting visibility and colors.
     *
     * @method updatePeakHighlighting
     */
    updatePeakHighlighting: function () {
        this.graph.updatePeakLabels();
        this.graph.updatePeakColors();
    },

    /**
     * Updates the color of highlight elements.
     *
     * @method updateHighlightColors
     */
    updateHighlightColors: function () {
        this.graph.updateHighlightColors();
    },

    /**
     * Updates which peaks are highlighted based on the model's highlight state.
     *
     * @method updateHighlights
     */
    updateHighlights: function () {
        let peaks = this.graph.peaks;
        for (let p = 0; p < peaks.length; p++) {
            if (peaks[p].fragments.length > 0)
                peaks[p].highlight(false);

            let highlightFragments = _.intersection(peaks[p].fragments, this.model.highlights);
            if (highlightFragments.length !== 0) {
                peaks[p].highlight(true, highlightFragments);
            }
        }
        this.graph.updatePeakColors();
        this.graph.updatePeakLabels();
    },

    /**
     * Toggles the measuring tool on/off.
     *
     * @method measuringTool
     */
    measuringTool: function () {
        this.graph.measure(this.model.get("measureMode"));
    },

    /**
     * Toggles butterfly mode (comparing two spectra) on/off.
     *
     * @method butterflyToggle
     */
    butterflyToggle: function () {
        let butterfly = this.model.get("butterfly");
        this.graph.options.butterfly = butterfly;
        this.options.invert = this.initialOrientation;
        if (this.options.invert) {
            this.model.clearStickyHighlights();
            this.options.hidden = !butterfly;
        }
        this.render();
        this.resize();
    },

    /**
     * Swaps the top and bottom spectra in butterfly mode.
     *
     * @method butterflySwap
     */
    butterflySwap: function () {
        this.options.invert = !this.options.invert;
        this.render();
        this.updateHighlights();
    },

    /**
     * Enables or disables draggable labels for manual positioning.
     *
     * @method moveLabels
     */
    moveLabels: function () {

        let peaks = this.graph.peaks;

        if (this.model.get("moveLabels")) {
            // for(p = 0; p < peaks.length; p++){
            // 	if(peaks[p].labels){
            // 		for(l = 0; l < peaks[p].labels.length; l++){
            // 			peaks[p].labels[l].call(peaks[p].labelDrag);
            // 			peaks[p].labels[l].style("cursor", "pointer");
            // 		}
            // 	}
            // }
            for (let p = 0; p < peaks.length; p++) {
                if (peaks[p].labels.length) {
                    peaks[p].labels
                        .call(peaks[p].labelDrag);
                    //.style("cursor", "pointer");
                }
            }
        } else {
            for (let p = 0; p < peaks.length; p++) {
                if (peaks[p].labels.length) {
                    peaks[p].labels
                        .on(".drag", null);
                    //.style("cursor", "default")
                }
            }
        }

    },

    /**
     * Downloads the current spectrum view as an SVG file.
     * Filename includes peptide sequences and charge state.
     *
     * @method downloadSVG
     */
    downloadSVG: function () {
        let svgSel = d3.select(this.el.parentNode);
        let svgArr = svgSel[0];
        let svgStrings = svgUtils.capture(svgArr);
        let svgXML = svgUtils.makeXMLStr(new XMLSerializer(), svgStrings[0]);

        let charge = this.model.get("JSONdata").annotation.precursorCharge;
        let pepStrs = this.model.pepStrsMods;
        let linkSites = Array(this.model.get("JSONdata").LinkSite.length);

        this.model.get("JSONdata").LinkSite.forEach(function (ls) {
            linkSites[ls.peptideId] = ls.linkSite;
        });

        //insert CL sites with #
        if (linkSites.length > 0) {
            pepStrs.forEach(function (pepStr, index) {
                let positions = [];
                for (let i = 0; i < pepStr.length; i++) {
                    if (pepStr[i].match(/[A-Z]/) != null) {
                        positions.push(i);
                    }
                }
                let clAA_index = positions[linkSites[index]] + 1;
                pepStrs[index] = pepStr.slice(0, clAA_index) + "#" + pepStr.slice(clAA_index, pepStr.length);
            });
        }

        let svg_name = pepStrs.join("-") + "_z=" + charge;
        svg_name += svgSel.node().id;
        svg_name += ".svg";
        download(svgXML, "application/svg", svg_name);
    },

    /**
     * Shows a loading spinner while annotation is pending.
     *
     * @method showSpinner
     */
    showSpinner: function () {
        this.graph.clear();
        this.spinner.spin(d3.select(this.el.parentNode).node());
    },

    /**
     * Hides the loading spinner when annotation is complete.
     *
     * @method hideSpinner
     */
    hideSpinner: function () {
        this.spinner.stop();
    },

    /**
     * Updates peak labels when the label cutoff threshold changes.
     *
     * @method labelCutoff
     */
    labelCutoff: function () {
        this.graph.updatePeakLabels();
    },

    /**
     * Changes the font size of all peak annotation labels.
     *
     * @method changeLabelFontSize
     */
    changeLabelFontSize: function () {
        this.graph.peaksSVG.selectAll("g.xispec_label text").style("font-size", this.model.get("labelFontSize"));
    },
});

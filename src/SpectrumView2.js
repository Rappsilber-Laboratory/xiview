import "../css/spectrum.css";
import "../css/dropdown.css";
import "../css/font-awesome.min.css";
import * as $ from "jquery";
import * as _ from "underscore";
import Backbone from "backbone";
import * as d3 from "d3";
import * as Spinner from "spin";

import {Graph} from "./graph/Graph";
import {svgUtils} from "../vendor/svgexp";
import {download} from "./download";

export const SpectrumView = Backbone.View.extend({

    events: {},

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

        this.listenTo(window, "resize", _.debounce(this.resize));

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

        this.listenTo(window.xiSPECUI.vent, "downloadSpectrumSVG", this.downloadSVG);
        this.listenTo(window.xiSPECUI.vent, "resize:spectrum", this.resize);
        this.listenTo(window.xiSPECUI.vent, "clearSpectrumHighlights", this.clearHighlights);

        this.listenTo(this.model, "resetZoom", this.resetZoom);
        this.listenTo(this.model, "changed:Highlights", this.updateHighlights);

        this.listenTo(this.model, "requestAnnotation:pending", this.showSpinner);
        this.listenTo(this.model, "requestAnnotation:done", this.hideSpinner);

        //this.listenTo(this.model, 'destroy', this.remove);
    },

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

    resetZoom: function () {
        this.graph.yZoomed = false;
        this.graph.resize(this.model.xminPrimary, this.model.xmaxPrimary, this.model.ymin, this.model.ymaxPrimary);
    },

    updateMzRange: function () {
        //resize if the mzRange is not up to date
        let mzRange = this.model.get("mzRange");
        if (mzRange === undefined)
            return;
        if (mzRange[0] == this.graph.xscale.domain()[0] && mzRange[1] == this.graph.xscale.domain()[1])
            return;
        this.resize();
    },

    resize: function () {
        let mzRange = this.model.get("mzRange");
        if (mzRange === undefined)
            return;
        this.graph.resize(mzRange[0], mzRange[1], this.model.ymin, this.model.ymax);
    },

    showLossy: function () {
        this.graph.lossyShown = this.model.get("showLossLabels");
        this.graph.updatePeakLabels();
    },

    lockZoomToggle: function () {
        if (this.model.get("zoomLocked")) {
            this.graph.disableZoom();
        } else {
            this.graph.enableZoom();
        }
    },

    clearHighlights: function () {
        this.model.clearStickyHighlights();
    },

    setColors: function () {
        this.graph.setColors();
    },

    updatePeakHighlighting: function () {
        this.graph.updatePeakLabels();
        this.graph.updatePeakColors();
    },

    updateHighlightColors: function () {
        this.graph.updateHighlightColors();
    },

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

    measuringTool: function () {
        this.graph.measure(this.model.get("measureMode"));
    },

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

    butterflySwap: function () {
        this.options.invert = !this.options.invert;
        this.render();
        this.updateHighlights();
    },

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

    showSpinner: function () {
        this.graph.clear();
        this.spinner.spin(d3.select(this.el.parentNode).node());
    },

    hideSpinner: function () {
        this.spinner.stop();
    },

    labelCutoff: function () {
        this.graph.updatePeakLabels();
    },

    changeLabelFontSize: function () {
        this.graph.peaksSVG.selectAll("g.xispec_label text").style("font-size", this.model.get("labelFontSize"));
    },
});

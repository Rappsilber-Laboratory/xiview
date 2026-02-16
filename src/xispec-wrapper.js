import * as _ from "underscore";
import Backbone from "backbone";
import * as $ from "jquery";
import Split from "split.js";
import d3 from "d3";
import {ByRei_dynDiv} from "../vendor/byrei-dyndiv_1.0rc1-src";

import {SpectrumWrapper} from "./spectrum-wrapper";
import {SpectrumControlsView} from "./SpectrumControlsView";
import {DataSettingsView} from "./DataSettingsView";
import {AppearanceSettingsView} from "./AppearanceSettingsView";

// http://stackoverflow.com/questions/11609825/backbone-js-how-to-communicate-between-views
window.xiSPECUI.vent = {};
_.extend(window.xiSPECUI.vent, Backbone.Events);

_.extend(window, Backbone.Events);// what's this for - cc
window.onresize = function () {
    window.trigger("resize");
};

export const XispecWrapper = Backbone.View.extend({

    initialize: function (options) {

        const defaultOptions = {
            targetDiv: "xispec_wrapper",
            showCustomConfig: false,
            showQualityControl: "bottom",
            baseDir: "./",
            xiAnnotatorBaseURL: "https://spectrumviewer.org/xiAnnotator/",
            knownModifications: [],
            labelFragmentCharge: false,
            labelCutoff: 0,
            labelFontSize: 10,
            accentuateCrossLinkContainingFragments: true,
            hideNotSelectedFragments: false,
            showLossLabels: false,
            QCabsErr: false,
        };
        this.options = _.extend(defaultOptions, options);

        // options.targetDiv could be div itself or id of div - lets deal with that
        if (typeof this.options.targetDiv === "string") {
            if (this.options.targetDiv.charAt(0) === "#") this.options.targetDiv = this.options.targetDiv.substr(1);
            this.options.targetDiv = document.getElementById(this.options.targetDiv);
        }

        // event listeners
        this.listenTo(window.xiSPECUI.vent, "requestAnnotation", this.requestAnnotation);
        this.listenTo(window.xiSPECUI.vent, "revertAnnotation", this.revertAnnotation);
        this.listenTo(window.xiSPECUI.vent, "setCustomConfigOverwrite", this.setCustomConfigOverwrite);
        this.listenTo(window.xiSPECUI.vent, "addSpectrum", this.addSpectrum);
        this.listenTo(window.xiSPECUI.vent, "closeSpecPanel", this.closeSpectrum);
        this.listenTo(window.xiSPECUI.vent, "activateSpecPanel", this.activateSpectrum);
        this.listenTo(window.xiSPECUI.vent, "butterflyHighlight", this.butterflyHighlight);
        // HTML elements
        let d3el = d3.select(this.options.targetDiv);
        // empty the targetDiv
        d3el.selectAll("*").remove();
        // create elements
        let spectrumPanelDiv = d3el.append("div")
            .attr("id", "xispec_spectrumPanel");
        spectrumPanelDiv.append("div")
            .attr("class", "xispec_dynDiv")
            .attr("id", "xispec_dataSettingsWrapper");
        spectrumPanelDiv.append("div")
            .attr("class", "xispec_dynDiv")
            .attr("id", "xispec_appearanceSettingsWrapper");
        spectrumPanelDiv.append("div")
            .attr("id", "xispec_spectrumControls");
        this.spectraWrapperDiv = spectrumPanelDiv
            .append("div")
            .attr("class", "xispec_spectra")
            .attr("id", "xispec_spectra");

        // create the initial spectrum
        this.spectra = [];
        this.specIds = [];
        this.activeSpectrum = this.addSpectrum();

        // create the SpectrumControls and Settings views
        this.spectrumControlsView = new SpectrumControlsView({
            model: this.activeSpectrum.spectrumModel,
            el: "#xispec_spectrumControls",
        });
        this.dataSettingsView = new DataSettingsView({
            model: this.activeSpectrum.settingsSpectrumModel,
            displayModel: this.activeSpectrum.spectrumModel,
            el: "#xispec_dataSettingsWrapper",
            showCustomCfg: this.options.showCustomConfig,
            title: "Data Settings"
        });
        this.appearanceSettingsView = new AppearanceSettingsView({
            model: this.activeSpectrum.settingsSpectrumModel,
            displayModel: this.activeSpectrum.spectrumModel,
            el: "#xispec_appearanceSettingsWrapper",
            showCustomCfg: this.options.showCustomConfig,
            title: "Appearance Settings"
        });

        ByRei_dynDiv.init.main();
    },

    setData: function (data) {
        // EXAMPLE:
        // xiSPEC.setData({
        // sequence1: "KQTALVELVK",
        // sequence2: "QNCcarbamidomethylELFEQLGEYKFQNALLVR",
        // linkPos1: 1,
        // linkPos2: 13,
        // crossLinkerModMass: 0,
        // modifications: [{id: 'carbamidomethyl', mass: 57.021464, aminoAcids: ['C']}],
        // losses: [{ id: 'H2O', specificity: ['D', 'S', 'T', 'E', 'CTerm'], mass: 18.01056027}],
        // precursorCharge: 3,
        // fragmentTolerance: {"tolerance": '20.0', 'unit': 'ppm'},
        // ionTypes: "peptide;b;y",
        // precursorMz: 1012.1,
        // peakList: [[mz, int], [mz, int], ...],
        // requestId: 1,
        // }
        let json_request = this.convert_to_json_request(data);

        let activeSpecModel = this.activeSpectrum.spectrumModel;
        activeSpecModel.set("butterfly", false);
        activeSpecModel.set("changedAnnotation", false);
        activeSpecModel.reset_all_modifications();
        activeSpecModel.set("spectrum_id", data.spectrum_id);
        activeSpecModel.set("spectrum_title", data.spectrum_title);
        this.activeSpectrum.originalMatchRequest = $.extend(true, {}, json_request);
        let originalAnnotator = this.activeSpectrum.originalSpectrumModel.get("annotatorURL");
        activeSpecModel.set("annotatorURL", originalAnnotator);
        this.activeSpectrum.requestAnnotation(json_request, activeSpecModel.get("annotatorURL"), true);
        this.activeSpectrum.setTitle(data.spectrum_title);
    },

    requestAnnotation: function (...args) {
        this.activeSpectrum.requestAnnotation(...args);
    },

    revertAnnotation: function (...args) {
        this.activeSpectrum.revertAnnotation(...args);
    },

    // eslint-disable-next-line no-unused-vars
    sanityChecks: function (data) {

        // ToDo: create sanityChecks
        // if(data.sequence2 !== undefined){
        // 	if(data.linkPos1 === undefined || data.linkPos2 === undefined){
        // 		alert('sequence')
        // 		return false;
        // 	}
        // }

        return true;
    },

    arrayifyPeptide: function (seq_mods) {
        let peptide = {};
        peptide.sequence = [];

        const seq_AAonly = seq_mods.replace(/[^A-Z]/g, "");
        let seq_length = seq_AAonly.length;

        for (let i = 0; i < seq_length; i++) {
            peptide.sequence[i] = {"aminoAcid": seq_AAonly[i], "Modification": ""};
        }

        const re = /[^A-Z]+/g;
        let offset = 1;
        let result;
        // eslint-disable-next-line no-cond-assign
        while (result = re.exec(seq_mods)) {
            peptide.sequence[result.index - offset]["Modification"] = result[0];
            offset += result[0].length;
        }
        return peptide;
    },

    convert_to_json_request: function (data) {

        if (!this.sanityChecks(data)) return false;

        // defaults
        if (data.ionTypes === undefined) {
            data.ionTypes = "peptide;b;y";
        }
        if (data.crossLinkerModMass === undefined) {
            data.crossLinkerModMass = 0;
        }
        if (data.modifications === undefined) {
            data.modifications = [];
        }
        if (data.fragmentTolerance === undefined) {
            data.fragmentTolerance = {"tolerance": "10.0", "unit": "ppm"};
        }
        if (data.requestID === undefined) {
            data.requestID = -1;
        }
        // if (data.crosslinkerID === undefined) {
        //     data.crosslinkerID = -1;
        // }

        let annotationRequest = {};
        let peptides = [];
        let linkSites = [];
        // xi1annotator style modified peptides
        peptides[0] = this.arrayifyPeptide(data.sequence1);
        if (data.sequence2 !== undefined) {
            peptides[1] = this.arrayifyPeptide(data.sequence2);
            linkSites[1] = {"id": 0, "peptideId": 1, "linkSite": data.linkPos2};
        }
        // xi2annotator style modified peptides
        if (data.base_sequence1 !== undefined){
            peptides[0]["base_sequence"] = data.base_sequence1;
        }
        if (data.base_sequence2 !== undefined){
            peptides[1]["base_sequence"] = data.base_sequence2;
        }
        if (data.mod_pos1 !== undefined) {
            peptides[0]["modification_positions"] = data.mod_pos1;
        }
        if (data.mod_pos2 !== undefined) {
            peptides[1]["modification_positions"] = data.mod_pos2;
        }
        if (data.mod_ids1 !== undefined) {
            peptides[0]["modification_ids"] = data.mod_ids1;
        }
        if (data.mod_ids2 !== undefined) {
            peptides[1]["modification_ids"] = data.mod_ids2;
        }

        if (data.linkPos1 !== undefined) {
            linkSites[0] = {"id": 0, "peptideId": 0, "linkSite": data.linkPos1};
        }

        let peaks = [];
        for (let i = 0; i < data.peakList.length; i++) {
            peaks.push(
                {"intensity": data.peakList[i][1], "mz": data.peakList[i][0]}
            );
        }

        annotationRequest.Peptides = peptides;
        annotationRequest.LinkSite = linkSites;
        annotationRequest.peaks = peaks;
        annotationRequest.annotation = {};
        annotationRequest.annotation.requestID = data.requestID.toString();
        annotationRequest.annotation.crosslinkerID = data.crosslinkerID;
        annotationRequest.annotation.precursorCharge = +data.precursorCharge;
        annotationRequest.annotation.modifications = data.modifications;
        annotationRequest.annotation.precursorMZ = +data.precursorMZ;
        annotationRequest.annotation.returnModSyntax = "Xmod";
        annotationRequest.annotation.crosslinker = {};
        annotationRequest.annotation.crosslinker.stubs1 = data.stubs1 || []; //['A:82.041864:S']; // crosslink acceptor stubs
        annotationRequest.annotation.crosslinker.stubs2 = data.stubs2 || []; //['S:0.0:A']; // crosslink donor stubs


        // check if it's xi1 or xi2 style annotation
        if(data.config !== undefined){
            annotationRequest.annotation.config = data.config;
            if (annotationRequest.annotation.crosslinkerID === undefined){
                annotationRequest.annotation.config.crosslinker = [];
            }
        } else {

            let ionTypes = data.ionTypes.split(";");
            //remove empty strings from list
            ionTypes = ionTypes.filter(Boolean);
            let ions = [];
            for (let it = 0; it < ionTypes.length; it++) {
                let ionType = ionTypes[it];
                ions.push({"type": (ionType.charAt(0).toUpperCase() + ionType.slice(1) + "Ion")});
            }
            annotationRequest.annotation.fragmentTolerance = data.fragmentTolerance;
            annotationRequest.annotation.ions = ions;
            annotationRequest.annotation.crosslinker.modMass = data.crossLinkerModMass;
            annotationRequest.annotation.losses = data.losses;
        }

        console.log("request", annotationRequest);
        return annotationRequest;
    },

    updatePlotSplit: function () {
        //  destroy the plotSplit if it exists
        try {
            this.plotSplit.destroy();
        } catch (e) {
            //do nothing
        }

        // stop if there is only a single spectrum
        let numSpec = this.spectra.length;

        // prepare Split options
        let splitSizes = [];
        let splitIds = [];
        let minSizes = [];
        for (let i = 0; i < numSpec; i++) {
            splitIds.push("#xispec_spec" + this.specIds[i]);
            splitSizes.push(100.0 / numSpec);
            minSizes.push(250);
        }

        // create Split
        this.plotSplit = Split(splitIds, {
            sizes: splitSizes,
            minSize: minSizes,
            gutterSize: 5,
            direction: "horizontal",
            onDragEnd: function () {
                window.xiSPECUI.vent.trigger("resize:spectrum");
            }
        });
    },

    /**
     * Adds a new SpectrumWrapper to this.spectra and its it to this.specIds.
     * @returns {*} the new SpectrumWrapper
     */
    addSpectrum: function () {

        // create an unused id and append it to the plotIds arr
        let specId = (this.specIds.length === 0) ? 0 : this.specIds[this.specIds.length - 1] + 1;
        this.specIds.push(specId);

        // append a div for the new spectrum
        this.spectraWrapperDiv.append("div")
            .attr("class", "xispec_plotsDiv")
            .attr("id", "xispec_spec" + specId);

        // create new SpectrumWrapper
        let newSpec = new SpectrumWrapper({
            el: "#xispec_spec" + specId,
            opt: this.options,
            id: specId,
        });
        this.spectra.push(newSpec);

        // if there is already an activeSpectrum copy it's originalMatchRequest
        if (this.activeSpectrum) {
            newSpec.requestAnnotation(this.activeSpectrum.originalMatchRequest,
                this.activeSpectrum.originalAnnotator, true);
            newSpec.setTitle(this.activeSpectrum.title);
        }

        // hide spectrumHeader if there's only one spectrumPanel visible
        if (this.spectra.length === 1) {
            this.spectra[0].setHeaderVis(false);
        } else {
            this.spectra[0].setHeaderVis(true);
        }

        // update the div splitting
        this.updatePlotSplit();

        // trigger resizing
        window.xiSPECUI.vent.trigger("resize:spectrum");

        return newSpec;
    },

    closeSpectrum: function (id) {
        if (id === this.activeSpectrum.id) {
            window.xiSPECUI.vent.trigger("activateSpecPanel", 0);
        }
        let specIndex = this.spectra.map(function (x) {
            return x.id;
        }).indexOf(id);
        this.spectra.splice(specIndex, 1);
        this.specIds.splice(specIndex, 1);
        this.updatePlotSplit();
        window.xiSPECUI.vent.trigger("resize:spectrum");
    },

    activateSpectrum: function (id) {
        let specIndex = this.spectra.map(function (x) {
            return x.id;
        }).indexOf(id);
        this.activeSpectrum = this.spectra[specIndex];
        this.spectrumControlsView.model = this.activeSpectrum.spectrumModel;
        this.dataSettingsView.model = this.activeSpectrum.settingsSpectrumModel;
        this.dataSettingsView.displayModel = this.activeSpectrum.spectrumModel;
        this.appearanceSettingsView.model = this.activeSpectrum.settingsSpectrumModel;
        this.appearanceSettingsView.displayModel = this.activeSpectrum.spectrumModel;
        window.xiSPECUI.vent.trigger("activeSpecPanel:changed");
    },

    butterflyHighlight: function () {
        this.activeSpectrum.butterflyHighlight();
    },

});

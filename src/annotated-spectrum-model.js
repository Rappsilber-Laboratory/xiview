import * as _ from "underscore";
import Backbone from "backbone";
import * as $ from "jquery";
import {Fragment} from "./graph/Fragment";

import * as colorbrewer from "colorbrewer";

/**
 * Backbone model for storing and managing annotated mass spectrum data.
 * Handles spectrum peaks, fragment annotations, modifications, and visualization settings.
 *
 * @class AnnotatedSpectrumModel
 * @extends Backbone.Model
 * @property {Object} JSONdata - Raw spectrum data including peaks and annotations
 * @property {Fragment[]} fragments - Array of fragment ion objects
 * @property {Array} peakList - List of peaks with m/z and intensity values
 * @property {Object} precursor - Precursor ion information (charge, m/z, mass, error)
 * @property {Array} peptides - Peptide sequences with modifications
 * @property {string[]} pepStrs - Plain peptide sequence strings
 * @property {string[]} pepStrsMods - Peptide sequences with modification IDs
 * @property {Array} knownModifications - List of known post-translational modifications
 * @property {Array} sticky - Array of persistently highlighted fragments
 * @property {Array} highlights - Array of currently highlighted fragments
 * @property {boolean} isLinear - Whether this is a linear (true) or crosslinked (false) peptide
 */
export const AnnotatedSpectrumModel = Backbone.Model.extend({

    /**
     * Default model attributes and visualization settings.
     *
     * @returns {Object} Default attribute values
     */
    defaults: function () {
        return {
            baseDir: "./",
            knownModifications: [],
            highlightColor: "#FFFF00",
            highlightWidth: 8,
            peakColor: "#a6a6a6",
            colorScheme: "RdBu",
            annotatorURL: "annotate/FULL",
            labelFragmentCharge: false,
            labelCutoff: 0,
            labelFontSize: 10,
            accentuateCrossLinkContainingFragments: false,
            hideNotSelectedFragments: false,
            showLossLabels: false,
            QCabsErr: false,
        };
    },

    initialize: function () {
        this.set("showDecimals", 2);
        this.set("moveLabels", false);
        this.set("measureMode", false);
        this.set("zoomLocked", false);
        this.set("butterfly", false);
        this.set("changedAnnotation", false);

        this.set("visFragments", "both");
        this.changeColorScheme(this.get("colorScheme"));

        this.labelFontSize = 10;

        this.pepStrs = [];
        this.pepStrsMods = [];
        this.fragmentIons = [];
        this.peakList = [];
        this.precursor = {};
        this.precursor.charge = null;
        this.sticky = [];
        this.annotationModifications = [];
        this.knownModifications = [];

        this.on("change:JSONdata", function () {
            let json = this.get("JSONdata");
            if (typeof json !== "undefined") {
                this.setData();
            } else
                this.trigger("cleared");
        });

    },

    /**
     * Processes and sets spectrum data from JSONdata attribute.
     * Parses peaks, fragments, peptides, and annotation information.
     * Triggers 'changed:data' event when complete.
     *
     * @method setData
     */
    setData: function () {

        if (this.get("JSONdata") == null) {
            this.trigger("changed:data");
            return;
        }

        $("#xispec_measuringTool").prop("checked", false);
        $("#xispec_moveLabels").prop("checked", false);
        this.sticky = Array();
        this.highlights = Array();
        let JSONdata = this.get("JSONdata");

        // read annotation information from JSON
        // ToDo: currently converts xi2 into xi1 annotator style. Could change to using own format
        if (JSONdata.annotation) {

            if (JSONdata.annotation.crosslinker) {
                this.crossLinkerModMass = JSONdata.annotation.crosslinker.modMass;
                this.crosslinker = JSONdata.annotation.crosslinker;
            }

            if (JSONdata.annotation.config){
                let config = JSONdata.annotation.config;
                // MsnTolerance
                let ms2tolRegexp = RegExp(/([\d.]+)\s?(ppm|Da)/);
                let ms2tolMatch = config.ms2_tol.match(ms2tolRegexp);
                this.MSnTolerance = {
                    "tolerance": ms2tolMatch[1],
                    "unit": ms2tolMatch[2]
                };
                // fragmentIons
                let ionTypes = config.fragmentation.cterm_ions.concat(config.fragmentation.nterm_ions);
                if (config.fragmentation.add_precursor !== false){
                    ionTypes.push("peptide");
                }
                let ions = [];
                for (let it = 0; it < ionTypes.length; it++) {
                    let ionType = ionTypes[it];
                    ions.push({"type": (ionType.charAt(0).toUpperCase() + ionType.slice(1) + "Ion")});
                }
                this.fragmentIons = ions;

            } else { // xi1 style annotator
                this.MSnTolerance = JSONdata.annotation.fragmentTolerance;
                this.fragmentIons = JSONdata.annotation.ions;
            }
        }

        this.peakList = JSONdata.peaks || [];

        this.pepStrs = [];
        this.pepStrsMods = [];
        this.peptides = JSONdata.Peptides;
        this.isLinear = this.peptides.length === 1;
        for (let i = 0; i < this.peptides.length; i++) {
            this.pepStrs[i] = "";
            this.pepStrsMods[i] = "";
            for (let j = 0; j < this.peptides[i].sequence.length; j++) {
                this.pepStrs[i] += this.peptides[i].sequence[j].aminoAcid;
                this.pepStrsMods[i] += this.peptides[i].sequence[j].aminoAcid + this.peptides[i].sequence[j].Modification;
            }
        }

        this.fragments = [];
        if (JSONdata.fragments !== undefined) {
            for (let i = 0; i < JSONdata.fragments.length; i++) {
                this.fragments[i] = new Fragment(JSONdata.fragments[i], JSONdata.clusters);
                this.fragments[i].id = i;
            }
        }

        if (JSONdata.annotation) {
            this.precursor.charge = JSONdata.annotation.precursorCharge;
            this.precursor.expMz = JSONdata.annotation.precursorMZ;
            this.precursor.error = JSONdata.annotation.precursorError;
            this.precursor.calcMz = JSONdata.annotation.calculatedMZ;
            // this.calcPrecursorMass();
            this.losses = (JSONdata.annotation.losses) ? JSONdata.annotation.losses : [];
        }

        this.trigger("changed:data");

        if (JSONdata.peaks !== undefined)
            this.setGraphData();

    },

    /**
     * Converts peak list to MGF (Mascot Generic Format) text format.
     *
     * @method peaksToMGF
     * @returns {string} Peak list in MGF format (m/z and intensity pairs)
     */
    peaksToMGF: function () {
        let output = "";
        for (let i = 0; i < this.peakList.length; i++) {
            output += this.peakList[i].mz + "	";
            output += this.peakList[i].intensity + "\n";
        }
        return output.trim();
    },

    /**
     * Clears all spectrum data and resets the model to empty state.
     *
     * @method clear
     */
    clear: function () {
        this.sticky = Array();
        this.precursor = {};
        this.crossLinkerModMass = null;
        this.crosslinker = null;
        this.fragmentIons = Array();
        this.fragments = Array();

        this.pepStrs = [];
        this.pepStrsMods = [];
        this.fragmentIons = [];
        this.peakList = [];
        this.precursor = {};
        this.precursor.charge = null;
        this.MSnTolerance = {};

        this.set("JSONdata", null);
        // Backbone.Model.prototype.clear.call(this);
    },

    /**
     * Calculates and sets the m/z and intensity ranges for the graph from peak data.
     *
     * @method setGraphData
     * @private
     */
    setGraphData: function () {

        let peaks = this.get("JSONdata").peaks;

        let xDataArr = peaks.map(function (p) {
            return p.mz;
        });
        let xmax = Math.max.apply(Math, xDataArr);
        let xmin = Math.min.apply(Math, xDataArr);
        this.xmaxPrimary = parseInt((xmax + 50).toFixed(0));
        this.xminPrimary = parseInt((xmin - 50).toFixed(0));

        let yDataArr = peaks.map(function (p) {
            return p.intensity;
        });
        this.ymaxPrimary = Math.max.apply(Math, yDataArr);

        if (!this.get("zoomLocked")) {
            this.set("mzRange", [this.xminPrimary, this.xmaxPrimary]);
            this.ymax = this.ymaxPrimary;
            this.ymin = 0;
        }
    },

    /**
     * Sets the current zoom range for the m/z axis.
     *
     * @method setZoom
     * @param {number[]} arr - Array with [min, max] m/z values
     */
    setZoom: function (arr) {
        this.set("mzRange", [arr[0], arr[1]]);
    },

    /**
     * Resets the zoom to show the full m/z range.
     * Triggers 'resetZoom' event.
     *
     * @method resetZoom
     */
    resetZoom: function () {
        this.set("mzRange", [this.xminPrimary, this.xmaxPrimary]);
        this.trigger("resetZoom");
    },

    /**
     * Adds fragments to the highlight list.
     * Triggers 'changed:Highlights' event.
     *
     * @method addHighlight
     * @param {Fragment[]} fragments - Array of fragments to highlight
     */
    addHighlight: function (fragments) {
        for (let f = 0; f < fragments.length; f++) {
            if (this.highlights.indexOf(fragments[f]) === -1)
                this.highlights.push(fragments[f]);
        }
        this.trigger("changed:Highlights");
    },

    /**
     * Removes fragments from the highlight list (unless they are sticky).
     * Triggers 'changed:Highlights' event.
     *
     * @method clearHighlight
     * @param {Fragment[]} fragments - Array of fragments to un-highlight
     */
    clearHighlight: function (fragments) {
        for (let f = 0; f < fragments.length; f++) {
            let index = this.highlights.indexOf(fragments[f]);
            if (index !== -1 && !_.contains(this.sticky, fragments[f])) {
                this.highlights.splice(index, 1);
            }
        }
        this.trigger("changed:Highlights");
    },

    /**
     * Clears all sticky (persistent) highlights.
     *
     * @method clearStickyHighlights
     */
    clearStickyHighlights: function () {
        if (this.sticky.length !== 0) {
            let oldsticky = this.sticky;
            this.sticky = Array();
            this.clearHighlight(oldsticky);
        }
    },

    /**
     * Updates the sticky highlight list (persistent highlights that remain on click).
     *
     * @method updateStickyHighlight
     * @param {Fragment[]} fragments - Fragments to add or set as sticky
     * @param {boolean} add - If true, adds to existing sticky highlights; if false, replaces them
     */
    updateStickyHighlight: function (fragments, add) {
        if (add === true) {
            for (let f = 0; f < fragments.length; f++) {
                if (this.sticky.indexOf(fragments[f]) === -1)
                    this.sticky.push(fragments[f]);
            }
        } else {
            let clearHighlights = [];
            if (this.sticky.length !== 0) {
                for (let f = 0; f < this.sticky.length; f++) {
                    if (fragments.indexOf(this.sticky[f]) == -1)
                        clearHighlights.push(this.sticky[f]);
                }
                this.sticky = [];
            }
            for (let f = 0; f < fragments.length; f++)
                this.sticky.push(fragments[f]);

            this.clearHighlight(clearHighlights);
        }
    },

    /**
     * Changes the color scheme for fragment visualization.
     * Uses ColorBrewer diverging color palettes.
     *
     * @method changeColorScheme
     * @param {string} schemeStr - Color scheme name ("RdBu", "BrBG", "PiYG", "PRGn", "PuOr")
     */
    changeColorScheme: function (schemeStr) {
        this.set("colorScheme", schemeStr);
        this.colorPalette = colorbrewer.RdBu[8]; // default
        switch (schemeStr) {
        case "RdBu":
            this.colorPalette = colorbrewer.RdBu[8];
            break;
        case "BrBG":
            this.colorPalette = colorbrewer.BrBG[8];
            break;
        case "PiYG":
            this.colorPalette = colorbrewer.PiYG[8];
            break;
        case "PRGn":
            this.colorPalette = colorbrewer.PRGn[8];
            break;
        case "PuOr":
            this.colorPalette = colorbrewer.PuOr[8];
            break;
        }

        this.updateColors();
        // this.trigger("changed:ColorScheme");
    },

    /**
     * Updates fragment colors based on current visibility and color scheme settings.
     * Triggers 'change:colors' event.
     *
     * @method updateColors
     * @private
     */
    updateColors: function () {
        switch (this.get("visFragments")) {
        case "both":
            this.p1color = this.colorPalette[0];
            this.p1color_cluster = this.colorPalette[2];
            this.p1color_loss = this.colorPalette[1];
            this.p2color = this.colorPalette[7];
            this.p2color_cluster = this.colorPalette[5];
            this.p2color_loss = this.colorPalette[6];
            break;
        case "pep1":
            this.p1color = this.colorPalette[0];
            this.p1color_cluster = this.colorPalette[2];
            this.p1color_loss = this.colorPalette[1];
            this.p2color = this.get("peakColor");
            this.p2color_cluster = this.get("peakColor");
            this.p2color_loss = this.get("peakColor");
            break;
        case "pep2":
            this.p1color = this.get("peakColor");
            this.p1color_cluster = this.get("peakColor");
            this.p1color_loss = this.get("peakColor");
            this.p2color = this.colorPalette[7];
            this.p2color_cluster = this.colorPalette[5];
            this.p2color_loss = this.colorPalette[6];
            break;
        }
        this.trigger("change:colors");
    },

    /**
     * Changes the crosslink positions and requests re-annotation.
     * Used for exploring alternative crosslink site assignments.
     *
     * @method changeLinkPos
     * @param {Array} newLinkSites - New crosslink site positions
     */
    changeLinkPos: function (newLinkSites) {

        // make sure this model is in the activated SpectrumWrapper
        this.trigger("activate");

        if (this.get("JSONrequest") !== undefined) {
            let json_req = $.extend(true, {}, this.get("JSONrequest"));
            json_req.LinkSite = newLinkSites;
            window.xiSPECUI.vent.trigger("requestAnnotation", json_req, this.get("annotatorURL"));
        } else {
            this.get("JSONdata").LinkSite = newLinkSites;
            this.setData();
        }

        this.set("changedAnnotation", true);
    },

    /**
     * Moves a modification from one position to another and requests re-annotation.
     * Used for exploring alternative modification placements.
     *
     * @method changeMod
     * @param {number} oldPos - Original amino acid position
     * @param {number} newPos - New amino acid position
     * @param {number} oldPepIndex - Original peptide index (0 or 1)
     * @param {number} newPepIndex - New peptide index (0 or 1)
     */
    changeMod: function (oldPos, newPos, oldPepIndex, newPepIndex) {

        // make sure this model is in the activated SpectrumWrapper
        this.trigger("activate");

        if (this.get("JSONrequest") !== undefined) {
            let json_req = $.extend(true, {}, this.get("JSONrequest"));
            //standalone
            let myNew = json_req.Peptides[newPepIndex].sequence[newPos];
            let myOld = this.get("JSONdata").Peptides[oldPepIndex].sequence[oldPos];

            myNew.Modification = myOld.Modification;
            json_req.Peptides[oldPepIndex].sequence[oldPos].Modification = "";

            if (myNew.aminoAcid !== myOld.aminoAcid) {
                let annotationMod = $.grep(json_req.annotation.modifications, function (e) {
                    return e.id == myNew.Modification;
                });
                if (annotationMod[0].aminoAcids.indexOf(myNew.aminoAcid) === -1)
                    annotationMod[0].aminoAcids.push(myNew.aminoAcid);
            }
            window.xiSPECUI.vent.trigger("requestAnnotation", json_req, this.get("annotatorURL"));
        } else {
            //Preview
            this.get("JSONdata").Peptides[newPepIndex].sequence[newPos].Modification = this.get("JSONdata").Peptides[oldPepIndex].sequence[oldPos].Modification;
            this.get("JSONdata").Peptides[oldPepIndex].sequence[oldPos].Modification = "";
            this.setData();
        }

        this.set("changedAnnotation", true);
    },

    /**
     * Checks if a modification is valid for a specific amino acid.
     *
     * @method checkForValidModification
     * @param {string} mod - Modification ID
     * @param {string} aminoAcid - Single letter amino acid code
     * @returns {boolean} True if modification is valid for this amino acid
     */
    checkForValidModification: function (mod, aminoAcid) {
        for (let i = 0; i < this.knownModifications.length; i++) {
            if (this.knownModifications[i].id === mod) {
                let knownMod_aminoAcids = this.knownModifications[i].aminoAcids;
                return knownMod_aminoAcids.indexOf("*") !== -1 || knownMod_aminoAcids.indexOf(aminoAcid) !== -1;
            }
        }
    },

    /**
     * Calculates the precursor mass and m/z from peptide sequences and modifications.
     * Updates precursor.calcMass and precursor.calcMz properties.
     * Triggers 'changed:mass' event.
     *
     * @method calcPrecursorMass
     */
    calcPrecursorMass: function () {

        let JSONdata = this.get("JSONdata");
        let modifications = JSONdata.annotation.modifications;
        let aastr = "ARNDCEQGHILKMFPSTWYV";
        let mA = [];
        mA[aastr.indexOf("A")] = 71.03711;
        mA[aastr.indexOf("R")] = 156.10111;
        mA[aastr.indexOf("N")] = 114.04293;
        mA[aastr.indexOf("D")] = 115.02694;
        mA[aastr.indexOf("C")] = 103.00919;
        mA[aastr.indexOf("E")] = 129.04259;
        mA[aastr.indexOf("Q")] = 128.05858;
        mA[aastr.indexOf("G")] = 57.02146;
        mA[aastr.indexOf("H")] = 137.05891;
        mA[aastr.indexOf("I")] = 113.08406;
        mA[aastr.indexOf("L")] = 113.08406;
        mA[aastr.indexOf("K")] = 128.09496;
        mA[aastr.indexOf("M")] = 131.04049;
        mA[aastr.indexOf("F")] = 147.06841;
        mA[aastr.indexOf("P")] = 97.05276;
        mA[aastr.indexOf("S")] = 87.03203;
        mA[aastr.indexOf("T")] = 101.04768;
        mA[aastr.indexOf("W")] = 186.07931;
        mA[aastr.indexOf("Y")] = 163.06333;
        mA[aastr.indexOf("V")] = 99.06841;

        let massArr = [];
        const h2o = 18.010565;
        const proton_mass = 1.007276466879;
        for (let i = 0; i < this.peptides.length; i++) {
            massArr[i] = h2o;
            for (let j = 0; j < this.peptides[i].sequence.length; j++) {
                let AA = this.peptides[i].sequence[j];
                massArr[i] += mA[aastr.indexOf(AA.aminoAcid)];
                // mod
                let mod = AA.Modification;
                if (mod !== "") {
                    for (let k = 0; k < modifications.length; k++) {
                        if (modifications[k].id == mod && modifications[k].aminoacid == AA.aminoAcid)
                            massArr[i] += modifications[k].massDifference;
                    }
                }
            }
        }

        let totalMass = 0;
        let clModMass = 0;
        if (this.get("clModMass") !== undefined)
            clModMass = parseInt(this.get("clModMass"));
        else if (JSONdata.annotation.crosslinker !== undefined)
            clModMass = JSONdata.annotation.crosslinker.modMass;

        for (let i = 0; i < massArr.length; i++) {
            totalMass += massArr[i];
        }

        if (totalMass === h2o) {
            this.precursor.calcMass = 0;
            this.precursor.calcMz = 0;
            return;
        }

        // NOT Multilink future proof
        if (JSONdata.LinkSite.length > 1) {
            if (JSONdata.LinkSite[0].linkSite !== -1 && JSONdata.LinkSite[1].linkSite !== -1)
                totalMass += clModMass;
        }
        this.precursor.calcMass = totalMass;
        this.precursor.calcMz = (totalMass / this.precursor.charge) + proton_mass;
        this.trigger("changed:mass");
    },

    /**
     * Updates the list of known modifications by merging annotation modifications
     * with previously known modifications.
     *
     * @method updateKnownModifications
     */
    updateKnownModifications: function () {
        this.annotationModifications = this.get("JSONdata").annotation.modifications.map(function(m){
            m["userMod"] = false;
            m["changed"] = false;
            return m;
        });
        // concat the knownModifications and annotationModifications (overwrite known on same id)
        let annModIds = this.annotationModifications.map(function(m){
            return m.id;
        });
        // filter out those that are also in annotationModifications
        let filtered_knownMods = this.knownModifications.filter(function(kMod){
            return annModIds.indexOf(kMod.id);
        });
        this.knownModifications = this.annotationModifications.concat(filtered_knownMods);
    },

    /**
     * Updates or adds a modification definition.
     * Preserves original values if modification is changed.
     *
     * @method updateModification
     * @param {Object} update_mod - Modification object with id, mass, and aminoAcids
     * @returns {Object} The updated or added modification object
     */
    updateModification: function (update_mod) {
        let found = false;
        for (let i = 0; i < this.knownModifications.length; i++) {
            if (this.knownModifications[i].id === update_mod.id) {
                found = true;
                // if it's not a changed mod save before overwriting
                if (!this.knownModifications[i].changed && !this.knownModifications[i].userMod) {
                    this.knownModifications[i].changed = true;
                    this.knownModifications[i].original = {
                        mass: this.knownModifications[i].mass,
                        aminoAcids: this.knownModifications[i].aminoAcids
                    };
                }
                this.knownModifications[i].mass = update_mod.mass;
                this.knownModifications[i].aminoAcids = update_mod.aminoAcids;
                return this.knownModifications[i];
            }
        }

        if (!found) {
            update_mod.userMod = true;
            this.knownModifications.push(update_mod);
            return update_mod;
        }
    },

    /**
     * Resets a modification to its original values (if it was changed).
     *
     * @method resetModification
     * @param {string} updateModId - ID of the modification to reset
     */
    resetModification: function (updateModId) {
        for (let i = 0; i < this.knownModifications.length; i++) {
            if (this.knownModifications[i].id === updateModId) {
                if (this.knownModifications[i].changed) {
                    this.knownModifications[i].changed = false;
                    this.knownModifications[i].mass = this.knownModifications[i].original.mass;
                    this.knownModifications[i].aminoAcids = this.knownModifications[i].original.aminoAcids;
                    this.knownModifications[i].original = undefined;
                }
                break;
            }
        }

    },

    /**
     * Resets all modifications to their original values.
     *
     * @method reset_all_modifications
     */
    reset_all_modifications: function () {
        for (let i = 0; i < this.knownModifications.length; i++) {
            this.resetModification(this.knownModifications[i].id);
        }
    },

    // saveUserModificationsToCookie: function(){
    // 	var cookie = JSON.stringify(this.userModifications);
    // 	Cookies.set('customMods', cookie);
    // },

    // delUserModification: function(modId, saveToCookie){	// IE 11 borks at new es5/6 syntax, saveCookie=true
    //
    // 	if (saveToCookie === undefined) {
    // 		saveToCookie = true;
    // 	}
    // 	var userModIndex = this.userModifications.findIndex(function(m){ return modId == m.id;});
    // 	if (userModIndex != -1){
    // 		this.userModifications.splice(userModIndex, 1);
    // 	}
    // 	else
    // 	if (saveToCookie)
    // 		this.saveUserModificationsToCookie();
    // },

});

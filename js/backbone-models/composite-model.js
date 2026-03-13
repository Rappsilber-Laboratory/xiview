/**
 * @fileoverview Main application backbone-models that coordinates filtering, selection, and data management.
 * CompositeModel is a thin hub: behaviour lives in mixins and delegate objects.
 *
 * Mixins (applied below via Object.assign):
 *   - FilteringPipelineMixin   — applyFilter() and its pipeline stages
 *   - SelectionHighlightMixin  — setMarkedCrossLinks/Matches, getMarked*, triggerFinalMatchLinksChange
 *   - ProteinVisibilityMixin   — hide/show/select/highlight protein methods
 *   - ProteinGroupManagerMixin — group CRUD, autoGroup, collapse/expandGroups
 *
 * Delegate objects (created in initialize(), kept up-to-date via listenTo):
 *   - _distanceCalc  (CrosslinkDistanceCalculator) — 3D distance computation
 *   - _featureService (ProteinFeatureService)  — feature retrieval and filtering
 *
 * Events fired on this backbone-models (must not change — 19+ view files listen to them):
 *   filteringDone, hiddenChanged,
 *   selectionMatchesLinksChanged, highlightsMatchesLinksChanged,
 *   change:groups, change:selection, change:highlights,
 *   change:selectedProteins, change:highlightedProteins,
 *   currentProteinColourModelChanged
 */

import Backbone from "backbone";

import {clearFdr} from "../filter/fdr";
import d3 from "d3";
import {ManualColourModel} from "./color/protein-color-model";
import {linkColor} from "./color/setup-colors";
import vent from "../vent";

import {generateUrlString} from "./url-state-serializer";
import {CrosslinkDistanceCalculator} from "./crosslink-distance-calculator";
import {ProteinFeatureService} from "./protein-feature-service";

import {FilteringPipelineMixin} from "./mixins/filtering-pipeline-mixin";
import {SelectionHighlightMixin} from "./mixins/selection-highlight-mixin";
import {ProteinVisibilityMixin} from "./mixins/protein-visibility-mixin";
import {ProteinGroupManagerMixin} from "./mixins/protein-group-manager-mixin";

/**
 * Main application backbone-models coordinating CLMS data, filtering, and UI state.
 * @class
 * @extends Backbone.Model
 */
export class CompositeModel extends Backbone.Model {
    constructor(attributes, options) {
        super(attributes, options);
    }

    initialize() {
        this.set({
            highlights: [],
            selection: [],
            //todo get rid d3 Map
            match_highlights: d3.map(),
            match_selection: d3.map(),
            annotationTypes: null,
            selectedProteins: [],
            highlightedProteins: [],
            TTCrossLinkCount: 0,
            xinetShowLabels: true,
            xinetShowExpandedGroupLabels: true,
            xinetFixedSize: true,
            xinetCropLabels: true,
            xinetThickLinks: true,
            xinetPpiSteps: [2, 3],
            groups: new Map(),
        });

        // Delegate: 3D distance calculation
        this._distanceCalc = new CrosslinkDistanceCalculator({
            distancesObj: this.get("distancesObj"),
            alignColl: this.get("alignColl"),
            stageModel: this.get("stageModel"),
        });

        this.listenTo(this, "change:distancesObj change:alignColl change:stageModel", function () {
            this._distanceCalc.update({
                distancesObj: this.get("distancesObj"),
                alignColl: this.get("alignColl"),
                stageModel: this.get("stageModel"),
            });
        });

        // Delegate: protein feature retrieval
        this._featureService = new ProteinFeatureService({
            clmsModel: this.get("clmsModel"),
            alignColl: this.get("alignColl"),
            annotationTypes: this.get("annotationTypes"),
        });

        this.listenTo(this, "change:clmsModel change:alignColl change:annotationTypes", function () {
            this._featureService.update({
                clmsModel: this.get("clmsModel"),
                alignColl: this.get("alignColl"),
                annotationTypes: this.get("annotationTypes"),
            });
        });

        // Clear fdr information from crosslinks when switching out of fdr mode
        this.listenTo(this.get("filterModel"), "change:fdrMode", function (filterModel) {
            if (!filterModel.get("fdrMode")) {
                clearFdr(this.getAllCrossLinks());
            }
        });

        this.listenTo(vent, "recalcLinkDistances", function () {
            if (this.get("clmsModel")) {
                this.getCrossLinkDistances(this.getAllCrossLinks());
            }
        });

        this.calcAndStoreTTCrossLinkCount();
    }

    // ─── Core crosslink retrieval ────────────────────────────────────────────

    /**
     * Retrieves filtered crosslinks of a specific type.
     * @param {string} [type="targets"] — "all", "targets", "linears", "linearTargets", "decoysTD", "decoysDD"
     * @returns {Array}
     */
    getFilteredCrossLinks(type) {
        return this.filteredXLinks[type || "targets"];
    }

    /**
     * Retrieves all crosslinks from the CLMS backbone-models.
     * @returns {Array}
     */
    getAllCrossLinks() {
        return Array.from(this.get("clmsModel").getCrosslinks().values());
    }

    /**
     * Retrieves all target-target (non-decoy, non-linear, non-monolink) crosslinks.
     * @returns {Array|null}
     */
    getAllTTCrossLinks() {
        const clmsModel = this.get("clmsModel");
        if (clmsModel) {
            return this.getAllCrossLinks().filter(function (link) {
                return !link.isDecoyLink() && !link.isLinearLink() && !link.isMonoLink();
            });
        }
        return null;
    }

    /**
     * Calculates and stores the count of target-target crosslinks.
     */
    calcAndStoreTTCrossLinkCount() {
        const ttCrossLinks = this.getAllTTCrossLinks();
        if (ttCrossLinks !== null) {
            this.set("TTCrossLinkCount", ttCrossLinks.length);
        }
    }

    // ─── Color ──────────────────────────────────────────────────────────────

    /**
     * Opens color picker dialog for choosing a protein color.
     * @param {string} proteinId
     */
    chooseProteinColor(proteinId) {
        const dialog = document.getElementById("colorDialog");
        dialog.proteinId = proteinId;
        const chooseColorLabel = document.getElementById("chooseColorLabel");
        chooseColorLabel.textContent = "Select Colour for " + proteinId;
        dialog.showModal();
        const cancelChooseColorButton = document.getElementById("colorCancel");
        cancelChooseColorButton.focus();
    }

    /**
     * Sets a custom color for a specific protein.
     * @param {string} proteinId
     * @param {string} color
     */
    setProteinColor(proteinId, color) {
        const proteinColourModel = this.get("proteinColourAssignment");
        if (!(proteinColourModel instanceof ManualColourModel)) {
            this.set("proteinColourAssignment", linkColor.manualProteinColoursBB);
        }
        linkColor.manualProteinColoursBB.setProteinColour(proteinId, color);
        this.trigger("currentProteinColourModelChanged", linkColor.manualProteinColoursBB);
    }

    // ─── Distance delegate stubs ─────────────────────────────────────────────

    /** @see CrosslinkDistanceCalculator#getSingleCrosslinkDistance */
    getSingleCrosslinkDistance(xlink, distancesObj, protAlignCollection, options) {
        return this._distanceCalc.getSingleCrosslinkDistance(xlink, distancesObj, protAlignCollection, options);
    }

    /** @see CrosslinkDistanceCalculator#getCrossLinkDistances */
    getCrossLinkDistances(crosslinks, options) {
        return this._distanceCalc.getCrossLinkDistances(crosslinks, options);
    }

    /** @see CrosslinkDistanceCalculator#getHomomDistances */
    getHomomDistances(crosslinkArr) {
        return this._distanceCalc.getHomomDistances(crosslinkArr);
    }

    /** @see CrosslinkDistanceCalculator#calcWorstCaseHomomultimerStates */
    calcWorstCaseHomomultimerStates() {
        return this._distanceCalc.calcWorstCaseHomomultimerStates(this.getAllCrossLinks());
    }

    // ─── Feature delegate stubs ──────────────────────────────────────────────

    /** @see ProteinFeatureService#getProteinFeatures */
    getProteinFeatures(protein) {
        return this._featureService.getProteinFeatures(protein);
    }

    /** @see ProteinFeatureService#getFilteredFeatures */
    getFilteredFeatures(protein) {
        return this._featureService.getFilteredFeatures(protein);
    }

    /** @see ProteinFeatureService#getAttributeRange */
    getAttributeRange(attrMetaData) {
        return this._featureService.getAttributeRange(attrMetaData, this.getAllCrossLinks());
    }

    // ─── URL serialization stub ──────────────────────────────────────────────

    /** @see generateUrlString */
    generateUrlString() {
        return generateUrlString(this.get("filterModel"), this.get("pdbCode"));
    }
}

// Apply mixins — order matters only if two mixins share a method name (they don't here)
Object.assign(CompositeModel.prototype,
    FilteringPipelineMixin,
    SelectionHighlightMixin,
    ProteinVisibilityMixin,
    ProteinGroupManagerMixin,
);

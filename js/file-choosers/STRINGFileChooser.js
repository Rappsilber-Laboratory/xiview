/**
 * @fileoverview STRING database integration for loading protein-protein interaction scores.
 * Provides UI for querying STRING database with NCBI Taxon ID to retrieve interaction scores
 * for protein pairs. Caches STRING IDs and network scores in localStorage. Updates crosslink
 * metadata with STRING scores and subscores (experimental, database, coexpression, etc.).
 * Automatically switches to STRING Score color scheme when scores loaded.
 */

import * as _ from "underscore";
import d3 from "d3";

import {BaseFrameView} from "../ui-utils/base-frame-view";
import {STRINGUtils} from "./stringUtils";
import {commonRegexes} from "../utils";
import {updateLinkMetadata} from "../modelUtils";
import {linkColor} from "../model/color/setup-colors";

/**
 * STRING database chooser view for loading protein interaction scores.
 * Creates UI with organism dropdown (Human, E. Coli, B. Subtilis), NCBI Taxon ID input,
 * cache purge button. Queries STRING API to resolve protein IDs and fetch interaction networks.
 * Updates crosslink metadata with STRING scores, switches color scheme to STRING Score.
 * Displays success/failure messages with PPI match counts.
 * @class
 * @extends BaseFrameView
 */
export class STRINGFileChooserBB extends BaseFrameView {
    constructor(options) {
        super(options);
    }

    /**
     * Event handlers for STRING chooser interactions.
     * @returns {Object} Event map with selectors and handler method names
     */
    get events() {
        let parentEvents = BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "keyup .inputTaxonID": "enteringTaxonID",
        });
    }

    /**
     * Initializes STRING chooser view with UI elements.
     * Creates organism dropdown (Human, E. Coli, B. Subtilis) with Taxon ID values,
     * NCBI Taxon ID text input (digits only), cache purge button for localStorage,
     * results message bar. Pre-loads STRING data if initPDBs option provided (reused option name).
     * @param {Object} viewOptions - Options including initPDBs (Taxon ID to load on init)
     * @returns {undefined}
     */
    initialize(viewOptions) {
        super.initialize(...arguments);

        // this.el is the dom element this should be getting added to, replaces targetDiv
        const mainDivSel = d3.select(this.el).classed("metaLoadPanel", true);
        const self = this;

        const wrapperPanel = mainDivSel.append("div").attr("class", "panelInner");

        const box = wrapperPanel.append("div").attr("class", "columnbar");

        box.append("p").attr("class", "smallHeading").text("Set NCBI Taxon ID");

        const common = [
            {name: "No Selection", value: "-"},
            {name: "Human", value: 9606},
            {name: "E. Coli str. K-12 / MG1655", value: 511145},
            {name: "B. Subtilis str. 168", value: 224308},
        ];

        box.append("label")
            .text("Either Choose Organism")
            .attr("class", "btn nopadLeft")
            .attr("title", "Select an organism to search STRING scores on")
            .append("select").attr("class", "selectTaxonID withSideMargins")
            .on("change", function () {
                // const optionSelected = $("option:selected", this);
                const valueSelected = this.value;
                d3.select(self.el).select(".inputTaxonID").property("value", valueSelected);
                self.enteringTaxonID({keyCode: 13});
            })
            .selectAll("option")
            .data(common)
            .enter()
            .append("option")
            .attr("value", function (d) {
                return d.value;
            })
            .text(function (d) {
                return d.name + " (" + d.value + ")";
            });
        const taxonSpan = box.append("div")
            .attr("class", "btn nopadLeft")
            .html("or Enter <a href='https://www.ncbi.nlm.nih.gov/taxonomy' target='_blank'>NCBI Taxon ID</a>");
        taxonSpan.append("input")
            .attr({
                type: "text",
                class: "inputTaxonID withSideMargins",
                maxlength: 16,
                pattern: commonRegexes.digitsOnly,
                size: 16,
                title: "Enter NCBI Taxon ID here for use in STRING search",
                //placeholder: "eg 1AO6"
            })
            .property("required", true);
        taxonSpan.append("span").text("& Press Enter");


        box.append("p").attr("class", "smallHeading").text("Other Actions");

        box.append("button")
            .attr("class", "btn btn-1 btn-1a irreversible")
            .text("Purge cache")
            .attr("title", "If local storage reports as full, you can purge cached STRING interactions by pressing this button.")
            .on("click", function () {
                if (localStorage) {
                    STRINGUtils.purgeCache();
                }
            });
        wrapperPanel.append("p").attr("class", "smallHeading").text("Results");
        wrapperPanel.append("div").attr("class", "messagebar").html("&nbsp;"); //.style("display", "none");

        d3.select(this.el).selectAll(".smallHeading").classed("smallHeadingBar", true);

        // Pre-load pdb if requested
        if (viewOptions.initPDBs) {
            this.setVisible(true);
            d3.select(this.el).select(".inputPDBCode").property("value", viewOptions.initPDBs);
            this.loadPDBCode();
        }
    }

    /**
     * Handles keyup events on Taxon ID input field.
     * If Enter key pressed and input valid, loads STRING data for entered Taxon ID.
     * @param {Event} evt - Keyup event with evt.keyCode
     * @returns {undefined}
     */
    enteringTaxonID(evt) {
        if (this.isTaxaIDValid() && evt.keyCode === 13) { // if return key pressed do same as pressing 'Enter' button
            this.loadSTRINGData();
        }
    }

    /**
     * Loads STRING interaction data for current protein set and Taxon ID.
     * Gets Taxon ID from input, calls STRINGUtils.loadStringDataFromModel to query STRING API
     * (resolves protein IDs, fetches network, translates to CSV), updates crosslink metadata,
     * switches color scheme to STRING Score if any scores matched, displays success/failure message.
     * @returns {undefined}
     */
    loadSTRINGData() {
        const taxonID = d3.select(this.el).select(".inputTaxonID").property("value");

        this.setWaitingEffect();
        const self = this;
        const callback = function (csv, errorReason) {
            self.setCompletedEffect();
            let statusText = "";
            if (!errorReason) {
                //var t = performance.now();
                const result = updateLinkMetadata(csv, self.model.get("clmsModel"));
                //t = performance.now() - t;
                //console.log ("assignt to links took", t/1000, "s");
                statusText = result.ppiCount + " STRING interactions matched to protein set.<br>";
                if (result.ppiCount > 0) {
                    self.model.set("linkColourAssignment", linkColor.Collection.get("STRING Score"));  // Switch to STRING colouring if any STRING scores available
                    statusText += "Colour Scheme switched to STRING Score - subscores via Legend View.";
                }
            }
            self.setStatusText(errorReason || statusText, !errorReason);
        };
        STRINGUtils.loadStringDataFromModel(this.model.get("clmsModel"), taxonID, callback);
    }

    /**
     * Checks if Taxon ID input is valid using HTML5 validation.
     * Uses pattern attribute (digitsOnly) to validate format.
     * @returns {boolean} True if input passes HTML5 validation
     */
    isTaxaIDValid() {
        const elem = d3.select(this.el).select(".inputTaxonID");
        return elem.node().checkValidity();
    }
}

STRINGFileChooserBB.prototype.identifier = "STRING Data Loader";

/**
 * @fileoverview File chooser view for loading 3D structural data.
 * Provides UI for loading structure files from local filesystem or RCSB PDB database via 4-character codes.
 * Integrates with NGL viewer for 3D molecular visualization. Supports PDB query services (RCSB, SWISS-MODEL).
 * Parses PDB/CIF files, aligns sequences with search data, triggers 3dsync event with aligned sequences.
 * Displays success/failure messages with sequence match counts. Caches NGL Stage for rendering.
 */

import * as _ from "underscore";
import d3 from "d3";
import * as NGL from "ngl";

import {BaseFrameView} from "../ui-utils/base-frame-view";
import {getLegalAccessionIDs, filterOutDecoyProteins} from "../modelUtils";
import {commonRegexes} from "../utils";
import {repopulateNGL} from "../views/ngl/RepopulateNGL";
import {loadUserFile} from "./load-user-file";
import vent from "../vent";

/**
 * File chooser view for loading 3D structural data into xiVIEW.
 * Creates UI with file selector (local PDB/CIF files), text input (PDB codes), query service buttons
 * (RCSB UniProt search, AlphaFold lookup). Maintains NGL Stage instance. Listens to 3dsync event
 * to display success/failure messages with sequence alignment counts. Supports multiple PDB files/codes (kind of).
 * @class
 * @extends BaseFrameView
 * @property {NGL.Stage} stage - NGL Stage instance for 3D rendering
 * @property {boolean} cAlphaOnly - Load only C-alpha atoms (currently disabled feature)
 * @property {string} loadRoute - Source of PDB data: "file" or "pdb" (code)
 */
export class PDBFileChooserBB extends BaseFrameView {
    constructor(options) {
        super(options);
    }

    /**
     * Event handlers for 3D file chooser interactions.
     * @returns {Object} Event map with selectors and handler method names
     */
    get events() {
        let parentEvents = BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "click .pdbWindowButton": "launchExternalPDBWindow",
            "click .alphafoldButton": "loadAlphaFoldStructure",
            "change .selectPdbButton": "selectPDBFile",
            "keyup .inputPDBCode": "enteringPDBCode",
            "click button.PDBSubmit": "loadPDBCode",
        });
    }

    /**
     * Initializes 3D file chooser view with UI elements and NGL Stage.
     * Creates file selector (multiple .txt/.cif/.pdb files), PDB code input (accepts multiple space-separated codes),
     * query service buttons (RCSB, AlphaFold), results message bar. Creates NGL Stage for 3D rendering.
     * Sets up 3dsync listener to display load success/failure with sequence counts. Pre-loads PDBs if initPDBs option provided.
     * @param {Object} viewOptions - Options including initPDBs (space-separated PDB codes to load on init)
     * @returns {undefined}
     */
    initialize(viewOptions) {
        super.initialize(...arguments);
        this.cAlphaOnly = false;

        const mainDivSel = d3.select(this.el);
        mainDivSel.classed("metaLoadPanel", true);

        const wrapperPanel = mainDivSel.append("div")
            .attr("class", "panelInner");

        const box = wrapperPanel.append("div").attr("class", "columnbar");

        box.append("p").attr("class", "smallHeading").text("Local Filesystem");

        box.append("label")
            .attr("class", "btn btn-1 btn-1a fakeButton")
            .text("Select PDB or mmCIF Files")
            .append("input")
            .attr({
                type: "file",
                accept: ".txt,.cif,.pdb",
                class: "selectPdbButton"
            })
            .property("multiple", true);

        box.append("p").attr("class", "smallHeading").text("By Accession");

        const pdbCodeSpan = box.append("span")
            .attr("class", "btn nopadLeft")
            .text("Enter 4-character PDB IDs");

        pdbCodeSpan.append("input")
            .attr({
                type: "text",
                class: "inputPDBCode withSideMargins",
                //maxlength: 4,
                //pattern: commonRegexes.pdbPattern,
                maxlength: 100,
                pattern: commonRegexes.multiPdbPattern,
                size: 8,
                title: "Enter PDB ID here e.g. 1AO6",
                //placeholder: "eg 1AO6"
            })
            .property("required", true);
        pdbCodeSpan.append("span").text("& Press Enter");

        box.append("p").attr("class", "smallHeading").text("AlphaFold");

        box.append("button")
            .attr("class", "alphafoldButton btn btn-1 btn-1a")
            .text("AlphaFold Model (SELECT ONE PROTEIN)")
            .attr("title", "Searches AlphaFold by protein sequence and loads predicted structure into the 3D viewer - select exactly one protein (min 20 amino acids)")
            .append("i").attr("class", "fa fa-xi fa-external-link");

        const queryBox = box.append("div").attr("class", "verticalFlexContainer queryBox");

        queryBox.append("p").attr("class", "smallHeading").text("PDB Query Service");

        const qButtonData = [
            {
                class: "pdbWindowButton btn btn-1 btn-1a",
                text: "Show PDBs Matching UniProt Accessions @ RCSB.org",
                tooltip: "Queries RCSB with Uniprot accession numbers of selected proteins (all if none selected)"
            },
        ];
        queryBox.selectAll("button").data(qButtonData, function (d) {
            return d.text;
        })
            .enter()
            .append("button")
            .attr("class", function (d) {
                return d.class;
            })
            .text(function (d) {
                return d.text;
            })
            .attr("title", function (d) {
                return d.tooltip;
            })
            .append("i").attr("class", "fa fa-xi fa-external-link");

        wrapperPanel.append("p").attr("class", "smallHeading").text("Results:");
        wrapperPanel.append("div").attr("class", "messagebar").html("&nbsp;");

        d3.select(this.el).selectAll(".smallHeading").classed("smallHeadingBar", true);

        this.stage = new NGL.Stage("ngl", {
            backgroundColor: "white",
            tooltip: false
        });

        function sanitise(str) {
            return str.replace(/[^a-z0-9 ,.?!]/ig, "");
        }

        this.listenTo(this.model, "3dsync", function (newSequences) {
            const count = _.isEmpty(newSequences) ? 0 : newSequences.length;
            const success = count > 0;
            this.setCompletedEffect();
            const nameArr = _.pluck(newSequences, "name");
            // list pdb's these sequences derive from
            //console.log ("seq", newSequences);
            const pdbString = nameArr ?
                d3.set(nameArr.map(function (name) {
                    return name.substr(0, _./*last*/indexOf(name, ":"));
                })).values().join(", ") : "?";
            let msg = newSequences.failureReason ? "" : "Completed Loading " + sanitise(pdbString) + ".<br>";
            msg += success ? "✓ Success! " + count + " sequence" + (count > 1 ? "s" : "") + " mapped between this search and the PDB file." :
                sanitise((newSequences.failureReason || "No sequence matches found between this search and the PDB file") +
                    ". Please check the PDB file or code is correct.");
            if (success) {
                this.model.set("pdbCode", this.loadRoute === "pdb" ? sanitise(pdbString) : undefined);
                vent.trigger("nglViewShow", true);
            }
            this.setStatusText(msg, success);
        });

        this.listenTo(vent, "alignmentProgress", this.setStatusText);

        // Pre-load pdb if requested
        if (viewOptions.initPDBs) {
            this.setVisible(true);
            d3.select(this.el).select(".inputPDBCode").property("value", viewOptions.initPDBs);
            this.loadPDBCode();
        }
    }

    // Return selected proteins, or all proteins if nothing selected
    getSelectedProteins() {
        const selectedProteins = this.model.get("selectedProteins");
        return _.isEmpty(selectedProteins) ? Array.from(this.model.get("clmsModel").getProteinsIterator()) : selectedProteins;
    }

    /**
     * Opens RCSB PDB search in new tab querying for structures matching selected proteins' UniProt accessions.
     * Constructs complex JSON query for RCSB API v2 search. Opens blank window immediately (to avoid popup blocker),
     * then sets location to RCSB search URL with encoded query. Displays error if no legal accession IDs available.
     * @returns {undefined}
     */
    launchExternalPDBWindow() {
        // http://stackoverflow.com/questions/15818892/chrome-javascript-window-open-in-new-tab
        // annoying workaround whereby we need to open a blank window here and set the location later
        // otherwise chrome/pop-up blockers think it is some spammy popup rather than something the user wants.
        // Basically chrome has this point in this function as being traceable back to a user click event but the
        // callback from the ajax isn't.
        const newtab = window.open("", "_blank");
        const accessionIDs = getLegalAccessionIDs(this.getSelectedProteins());
        if (accessionIDs.length) {
            // https://search.rcsb.org/#search-example-8
            const query = {
                "query": {
                    "type": "group",
                    "logical_operator": "and",
                    "nodes": [
                        {
                            "type": "group",
                            "logical_operator": "and",
                            "nodes": [
                                {
                                    "type": "group",
                                    "logical_operator": "and",
                                    "nodes": [
                                        {
                                            "type": "group",
                                            "logical_operator": "and",
                                            "nodes": [
                                                {
                                                    "type": "terminal",
                                                    "service": "text",
                                                    "parameters": {
                                                        "attribute": "rcsb_polymer_entity_container_identifiers.reference_sequence_identifiers.database_accession",
                                                        "negation": false,
                                                        "operator": "in",
                                                        "value": accessionIDs
                                                    },
                                                    "node_id": 0
                                                },
                                                {
                                                    "type": "terminal",
                                                    "service": "text",
                                                    "parameters": {
                                                        "attribute": "rcsb_polymer_entity_container_identifiers.reference_sequence_identifiers.database_name",
                                                        "operator": "exact_match",
                                                        "value": "UniProt"
                                                    },
                                                    "node_id": 1
                                                }
                                            ],
                                            "label": "nested-attribute"
                                        }
                                    ]
                                }
                            ],
                            "label": "text"
                        }
                    ],
                    "label": "query-builder"
                },
                "return_type": "entry",
                "request_options": {
                    "scoring_strategy": "combined",
                    "sort": [
                        {
                            "sort_by": "score",
                            "direction": "desc"
                        }
                    ]
                }
            };
            newtab.location = "https://www.rcsb.org/search?request=" + encodeURI(JSON.stringify(query));
        } else {
            newtab.document.body.textContent = "No legal Accession IDs are in the current dataset. These are required to query the PDB service.";
        }
    }

    /**
     * Searches AlphaFold for a predicted structure using the selected protein's sequence and loads it into the NGL viewer.
     * Requires exactly one non-decoy protein selected with a sequence of at least 20 amino acids.
     * Uses the AlphaFold sequence search API, picks the best MMCIF hit by sequence identity, and loads via repopulateNGL.
     * @returns {undefined}
     */
    loadAlphaFoldStructure() {
        const proteins = filterOutDecoyProteins(this.getSelectedProteins());
        if (proteins.length !== 1) {
            this.setStatusText("Select exactly one protein for AlphaFold sequence search.", false);
            return;
        }
        const sequence = proteins[0].sequence;
        if (!sequence || sequence.length < 20) {
            this.setStatusText("Selected protein has no sequence or is too short (AlphaFold requires \u2265 20 amino acids).", false);
            return;
        }
        this.setWaitingEffect();
        this.loadRoute = "file";
        const self = this;
        fetch("https://alphafold.ebi.ac.uk/api/sequence/summary?id=" + encodeURIComponent(sequence))
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("AlphaFold sequence search returned status " + response.status);
                }
                return response.json();
            })
            .then(function (data) {
                const structures = data.structures;
                if (!structures || structures.length === 0) {
                    throw new Error("No AlphaFold entry found for this protein sequence.");
                }
                // Pick best MMCIF hit sorted by sequence_identity descending
                const hits = structures
                    .map(function (s) { return s.summary; })
                    .filter(function (s) { return s && s.model_url && s.model_format === "MMCIF"; })
                    .sort(function (a, b) { return (b.sequence_identity || 0) - (a.sequence_identity || 0); });
                if (hits.length === 0) {
                    throw new Error("No AlphaFold MMCIF structure found for this sequence.");
                }
                const hit = hits[0];
                repopulateNGL({
                    pdbSettings: [{
                        id: hit.model_identifier || "AlphaFold",
                        uri: hit.model_url,
                        local: false,
                        params: {firstModelOnly: true}
                    }],
                    stage: self.stage,
                    compositeModel: self.model
                });
            })
            .catch(function (err) {
                self.setCompletedEffect();
                self.setStatusText("AlphaFold lookup failed: " + err.message, false);
            });
    }

    /**
     * Handles local PDB file selection event.
     * Sets waiting effect, reads all selected files via loadUserFile, creates Blob for each,
     * calls repopulateNGL with pdbSettings array after all files loaded. Supports multiple files.
     * Resets input value to allow re-selecting same file.
     * @param {Event} evt - File input change event with evt.target.files
     * @returns {undefined}
     */
    selectPDBFile(evt) {
        this.setWaitingEffect();
        this.loadRoute = "file";
        const self = this;
        //console.log ("target files", evt.target.files, evt.target.value);
        const pdbSettings = [];
        const fileCount = evt.target.files.length;

        const onLastLoad = _.after(fileCount, function () {
            repopulateNGL({
                pdbSettings: pdbSettings,
                stage: self.stage,
                compositeModel: self.model
            });
        }
        );

        for (let n = 0; n < fileCount; n++) {
            const fileObj = evt.target.files[n];

            loadUserFile(
                fileObj,
                function (fileContents, associatedData) {
                    const blob = new Blob([fileContents], {
                        type: "application/text"
                    });
                    const name = associatedData.name;
                    pdbSettings.push({
                        id: name,
                        uri: blob,
                        local: true,
                        params: {
                            ext: name.substr(name.lastIndexOf(".") + 1),
                            cAlphaOnly: self.cAlphaOnly,
                            firstModelOnly: true
                        }
                    });
                    onLastLoad();
                },
                {name: fileObj.name}    // pass this associatedData in, so async loading doesn't break things i.e. if load A, B, and return order B, A
            );
        }

        evt.target.value = null;    // reset value so same file can be chosen twice in succession
    }

    /**
     * Handles keyup events on PDB code input field.
     * Validates input, enables/disables submit button based on validity. If Enter key pressed and valid, loads PDB codes.
     * @param {Event} evt - Keyup event with evt.keyCode
     * @returns {undefined}
     */
    enteringPDBCode(evt) {
        const valid = this.isPDBCodeValid();
        d3.select(this.el).select(".PDBSubmit").property("disabled", !valid);
        if (valid && evt.keyCode === 13) { // if return key pressed do same as pressing 'Enter' button
            this.loadPDBCode();
        }
    }

    /**
     * Loads PDB structure(s) from RCSB database via 4-character code(s).
     * Parses input for multiple space-separated codes, creates pdbSettings array with rcsb:// URIs,
     * calls repopulateNGL to fetch and load structures. Sets waiting effect during load.
     * @returns {undefined}
     */
    loadPDBCode() {
        const pdbCode = d3.select(this.el).select(".inputPDBCode").property("value");
        this.loadRoute = "pdb";
        this.setWaitingEffect();

        const pdbSettings = pdbCode.match(commonRegexes.multiPdbSplitter).map(function (code) {
            return {
                id: code,
                pdbCode: code,
                uri: "rcsb://" + code.toLowerCase() + ".cif",
                local: false,
                params: {calphaOnly: this.cAlphaOnly, firstModelOnly: true}
            };
        }, this);

        repopulateNGL({
            pdbSettings: pdbSettings,
            stage: this.stage,
            compositeModel: this.model
        });
    }

    /**
     * Checks if PDB code input is valid using HTML5 validation.
     * Uses pattern attribute (multiPdbPattern) to validate format.
     * @returns {boolean} True if input passes HTML5 validation
     */
    isPDBCodeValid() {
        const elem = d3.select(this.el).select(".inputPDBCode");
        return elem.node().checkValidity();
    }

}

PDBFileChooserBB.prototype.identifier = "3D Model Chooser";

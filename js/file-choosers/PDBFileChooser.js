/**
 * @fileoverview PDB file chooser view for loading 3D structural data.
 * Provides UI for loading PDB files from local filesystem or RCSB PDB database via 4-character codes.
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
 * PDB file chooser view for loading 3D structural data into xiVIEW.
 * Creates UI with file selector (local PDB/CIF files), text input (PDB codes), query service buttons
 * (RCSB UniProt search, SWISS-MODEL lookup). Maintains NGL Stage instance. Listens to 3dsync event
 * to display success/failure messages with sequence alignment counts. Supports multiple PDB files/codes.
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
     * Event handlers for PDB chooser interactions.
     * @returns {Object} Event map with selectors and handler method names
     */
    get events() {
        let parentEvents = BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "click .pdbWindowButton": "launchExternalPDBWindow",
            "click .swissmodelWindowButton": "launchExternalSwissmodelWindow",
            // "click .ebiPdbWindowButton": "launchExternalEBIPDBWindow",
            "change .selectPdbButton": "selectPDBFile",
            "keyup .inputPDBCode": "enteringPDBCode",
            "click button.PDBSubmit": "loadPDBCode",
            // "click .cAlphaOnly": "toggleCAlphaSetting",
        });
    }

    /**
     * Initializes PDB chooser view with UI elements and NGL Stage.
     * Creates file selector (multiple .txt/.cif/.pdb files), PDB code input (accepts multiple space-separated codes),
     * query service buttons (RCSB, SWISS-MODEL), results message bar. Creates NGL Stage for 3D rendering.
     * Sets up 3dsync listener to display load success/failure with sequence counts. Pre-loads PDBs if initPDBs option provided.
     * @param {Object} viewOptions - Options including initPDBs (space-separated PDB codes to load on init)
     * @returns {undefined}
     */
    initialize(viewOptions) {
        super.initialize(...arguments);
        this.cAlphaOnly = false;

        // this.el is the dom element this should be getting added to, replaces targetDiv
        const mainDivSel = d3.select(this.el);
        mainDivSel.classed("metaLoadPanel", true);

        const wrapperPanel = mainDivSel.append("div")
            .attr("class", "panelInner");

        const box = wrapperPanel.append("div").attr("class", "columnbar");

        /*
        box.append("p").attr("class", "smallHeading").text("Pre-Load Options");
        var buttonData = [{
                label: "Load C-Alpha Atoms Only",
                class: "cAlphaOnly",
                type: "checkbox",
                id: "cAlphaOnly",
                tooltip: "Faster & Less Cluttered 3D Rendering on Large PDBs",
                inputFirst: true,
                value: this.cAlphaOnly,
            },
        ];
        makeBackboneButtons (box.append("div"), this.el.id, buttonData);
        */


        const prideBox = box.append("div")
            .attr("class", "verticalFlexContainer prideStructuresBox")
            .style("display", "none");
        prideBox.append("p").attr("class", "smallHeading").text("Structures from PRIDE dataset");
        prideBox.append("div").attr("class", "prideStructuresList");

        box.append("p").attr("class", "smallHeading").text("PDB Source");

        box.append("div")
            .attr("class", "btn nopadLeft nopadRight")
            .text("Either")
            .append("span")
            .append("label")
            .attr("class", "btn btn-1 btn-1a fakeButton")
            .append("span")
            //.attr("class", "noBreak")
            .text("Select Local PDB Files")
            .append("input")
            .attr({
                type: "file",
                accept: ".txt,.cif,.pdb",
                class: "selectPdbButton"
            })
            .property("multiple", true);
        const pdbCodeSpan = box.append("span")
            .attr("class", "btn nopadLeft")
            .text("or Enter 4-character PDB IDs");

        pdbCodeSpan.append("input")
            .attr({
                type: "text",
                class: "inputPDBCode withSideMargins",
                //maxlength: 4,
                //pattern: commonRegexes.pdbPattern,
                maxlength: 100,
                pattern: commonRegexes.multiPdbPattern,
                size: 8,
                title: "Enter PDB IDs here e.g. 1AO6 for one structure, 1YSX 1BKE to merge two",
                //placeholder: "eg 1AO6"
            })
            .property("required", true);
        pdbCodeSpan.append("span").text("& Press Enter");

        const queryBox = box.append("div").attr("class", "verticalFlexContainer queryBox");

        queryBox.append("p").attr("class", "smallHeading").text("PDB Query Services");

        const qButtonData = [
            {
                class: "pdbWindowButton",
                text: "Show PDBs Matching UniProt Accessions @ RCSB.org",
                tooltip: "Queries RCSB with Uniprot accession numbers of selected proteins (all if none selected)"
            },
            {
                class: "swissmodelWindowButton",
                text: "SWISS-MODEL lookup (SELECT ONE PROTEIN) ",
                tooltip: "Queries SWISS-MODEL with Uniprot accession number - select exactly one protein"
            },
            // {
            //     class: "ebiPdbWindowButton",
            //     text: "Show PDBs Matching a Protein Sequence @ EBI",
            //     tooltip: "Queries EBI with an individual protein sequence to find relevant PDBs"
            // }
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
            });
        queryBox.selectAll("button")
            .classed("btn btn-1 btn-1a", true)
            .append("i").attr("class", "fa fa-xi fa-external-link");
        //
        // this.updateProteinDropdown(queryBox);

        wrapperPanel.append("p").attr("class", "smallHeading").text("Results:");
        wrapperPanel.append("div").attr("class", "messagebar").html("&nbsp;"); //.style("display", "none");

        d3.select(this.el).selectAll(".smallHeading").classed("smallHeadingBar", true);

        this.stage = new NGL.Stage("ngl", { /*fogNear: 20, fogFar: 100,*/
            backgroundColor: "white",
            tooltip: false
        });

        //console.log("STAGE", this.stage);

        function sanitise(str) {
            return str.replace(/[^a-z0-9 ,.?!]/ig, "");
        }

        // function updatePD() {
        //     this.updateProteinDropdown(d3.select(this.el).select(".queryBox"));
        // }
        //
        // // this.listenTo (this.model.get("clmsModel"), "change:matches", updatePD);
        // this.listenTo(this.model, "change:selectedProteins", updatePD);
        // this.listenTo(vent, "proteinMetadataUpdated", updatePD);

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

        this.lookupPRIDEPDBs();
    }

    // Return selected proteins, or all proteins if nothing selected
    getSelectedProteins() {
        const selectedProteins = this.model.get("selectedProteins");
        return _.isEmpty(selectedProteins) ? Array.from(this.model.get("clmsModel").getProteinsIterator()) : selectedProteins;
    }
    /*
    updateProteinDropdown: function (parentElem) {
        const proteins = this.getSelectedProteins();

        addMultipleSelectControls({
            addToElem: parentElem,
            selectList: ["Proteins"],
            optionList: filterOutDecoyProteins(proteins),
            keepOldOptions: false,
            selectLabelFunc: function () {
                return "Select Protein for EBI Sequence Search ►";
            },
            optionLabelFunc: function (d) {
                return d.name;
            },
            optionValueFunc: function (d) {
                return d.id;
            },
            optionSortFunc: function (a, b) {
                return a.name.localeCompare(b.name);
            },
            idFunc: function (d) {
                return d.id;
            },
        });

    }
*/
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
     * Opens SWISS-MODEL repository in new tab for selected protein's UniProt accession.
     * Requires exactly one protein selected with legal accession ID. Opens SWISS-MODEL repository page
     * showing homology models for that protein. Displays error if zero or multiple proteins selected.
     * @returns {undefined}
     */
    launchExternalSwissmodelWindow() {
        const newtab = window.open("", "_blank");
        const accessionIDs = getLegalAccessionIDs(this.getSelectedProteins());
        if (accessionIDs.length === 1) {
            newtab.location = "https://swissmodel.expasy.org/repository/uniprot/" + accessionIDs[0];
        } else {
            newtab.document.body.textContent = "Select exactly one protein with legal Accession ID in the current dataset. SWISS-MODEL service can only query single protein.";
        }
    }

    /**
     * Helper to get selected option data from dropdown select element.
     * Filters selects by name, finds selected option, returns its bound data.
     * @param {d3.selection} higherElem - Parent D3 selection containing select elements
     * @param {string} selectName - Name of select element to query
     * @returns {*} Data bound to selected option
     */
    getSelectedOption(higherElem, selectName) {
        let funcMeta;

        //this.controlDiv
        higherElem
            .selectAll("select")
            .filter(function (d) {
                return d === selectName;
            })
            .selectAll("option")
            .filter(function () {
                return d3.select(this).property("selected");
            })
            .each(function (d) {
                funcMeta = d;
            });
        return funcMeta;
    }

    /*
    launchExternalEBIPDBWindow: function () {
        const chosenSeq = (this.getSelectedOption(d3.select(this.el).select(".columnbar"), "Proteins") || {
            sequence: ""
        }).sequence;
        window.open("http://www.ebi.ac.uk/pdbe-srv/PDBeXplore/sequence/?seq=" + chosenSeq + "&tab=PDB%20entries", "_blank");
    }*/

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

    /**
     * Extracts unique PRIDE PXD accessions from the loaded mzIdentML files.
     * @returns {string[]} Array of unique PXD accession strings (uppercased)
     */
    getPRIDEAccessions() {
        const pxdPattern = /^PXD\d+$/i;
        const candidates = new Set();
        for (const mzidFile of this.model.get("clmsModel").getMzidentmlFiles().values()) {
            const pid = mzidFile.projectId;
            if (pid && pxdPattern.test(pid)) {
                candidates.add(pid.toUpperCase());
            }
        }
        return Array.from(candidates);
    }

    /**
     * Queries RCSB Search API for IHM structures linked to PRIDE accessions found in the current dataset.
     * Shows a "Structures from PRIDE dataset" section with clickable PDB ID buttons if any are found.
     * Silently hides the section if no PRIDE accessions exist or no structures are found.
     * @returns {undefined}
     */
    lookupPRIDEPDBs() {
        const accessions = this.getPRIDEAccessions();
        if (accessions.length === 0) return;

        const prideBox = d3.select(this.el).select(".prideStructuresBox");
        prideBox.style("display", null);
        const listDiv = prideBox.select(".prideStructuresList");
        listDiv.text("Checking RCSB...");

        const self = this;
        const queries = accessions.map(accession => {
            const payload = {
                query: {
                    type: "group", logical_operator: "and", label: "text",
                    nodes: [{
                        type: "group", logical_operator: "and", label: "nested-attribute",
                        nodes: [
                            { type: "terminal", service: "text", parameters: {
                                attribute: "rcsb_ihm_dataset_source_db_reference.accession_code",
                                operator: "exact_match", negation: false, value: accession
                            }},
                            { type: "terminal", service: "text", parameters: {
                                attribute: "rcsb_ihm_dataset_source_db_reference.db_name",
                                operator: "exact_match", negation: false, value: "PRIDE"
                            }}
                        ]
                    }]
                },
                return_type: "entry",
                request_options: {
                    paginate: { start: 0, rows: 100 },
                    results_content_type: ["experimental"],
                    sort: [{ sort_by: "score", direction: "desc" }]
                }
            };
            return fetch("https://search.rcsb.org/rcsbsearch/v2/query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            })
                .then(r => r.ok ? r.json() : { result_set: [] })
                .then(data => ({ accession, ids: (data.result_set || []).map(r => r.identifier) }))
                .catch(() => ({ accession, ids: [] }));
        });

        Promise.all(queries).then(results => {
            listDiv.html("");
            let anyFound = false;
            for (const { accession, ids } of results) {
                if (ids.length === 0) continue;
                anyFound = true;
                listDiv.append("span").attr("class", "prideAccessionLabel").text(accession + ": ");
                for (const pdbId of ids) {
                    listDiv.append("button")
                        .attr("class", "btn btn-1 btn-1a pridePdbButton")
                        .attr("title", "Load " + pdbId + " from RCSB")
                        .text(pdbId)
                        .on("click", function() {
                            d3.select(self.el).select(".inputPDBCode").property("value", pdbId);
                            self.loadPDBCode();
                        });
                }
            }
            if (!anyFound) {
                prideBox.style("display", "none");
            }
        });
    }

    // toggleCAlphaSetting(evt) {
    //     var val = evt.target.checked;
    //     this.cAlphaOnly = val;
    //     return this;
    // }
}

PDBFileChooserBB.prototype.identifier = "PDB File Chooser";

import * as _ from 'underscore';
// import Backbone from "backbone";
import * as NGL from "../../vendor/ngl.dev";

import {BaseFrameView} from "../ui-utils/base-frame-view";
import {modelUtils} from "../modelUtils";
import {addMultipleSelectControls, utils} from "../utils";
import {NGLUtils} from "../views/ngl/NGLUtils";
import d3 from "d3";

export const PDBFileChooserBB = BaseFrameView.extend({

    events: function () {
        let parentEvents = BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "click .pdbWindowButton": "launchExternalPDBWindow",
            "click .ebiPdbWindowButton": "launchExternalEBIPDBWindow",
            "change .selectPdbButton": "selectPDBFile",
            "keyup .inputPDBCode": "enteringPDBCode",
            "click button.PDBSubmit": "loadPDBCode",
            // "click .cAlphaOnly": "toggleCAlphaSetting",
        });
    },

    initialize: function (viewOptions) {
        PDBFileChooserBB.__super__.initialize.apply(this, arguments);
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
        utils.makeBackboneButtons (box.append("div"), this.el.id, buttonData);
        */


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
            .property("multiple", true)
        ;

        const pdbCodeSpan = box.append("span")
                .attr("class", "btn nopadLeft")
                .text("or Enter 4-character PDB IDs")
            //.append("div")
        ;

        pdbCodeSpan.append("input")
            .attr({
                type: "text",
                class: "inputPDBCode withSideMargins",
                //maxlength: 4,
                //pattern: utils.commonRegexes.pdbPattern,
                maxlength: 100,
                pattern: utils.commonRegexes.multiPdbPattern,
                size: 8,
                title: "Enter PDB IDs here e.g. 1AO6 for one structure, 1YSX 1BKE to merge two",
                //placeholder: "eg 1AO6"
            })
            .property("required", true)
        ;

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
                class: "ebiPdbWindowButton",
                text: "Show PDBs Matching a Protein Sequence @ EBI",
                tooltip: "Queries EBI with an individual protein sequence to find relevant PDBs"
            }
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
        ;

        queryBox.selectAll("button")
            .classed("btn btn-1 btn-1a", true)
            .append("i").attr("class", "fa fa-xi fa-external-link")
        ;

        this.updateProteinDropdown(queryBox);

        wrapperPanel.append("p").attr("class", "smallHeading").text("Load Results");
        wrapperPanel.append("div").attr("class", "messagebar").html("&nbsp;"); //.style("display", "none");

        d3.select(this.el).selectAll(".smallHeading").classed("smallHeadingBar", true);

        this.stage = new NGL.Stage("ngl", { /*fogNear: 20, fogFar: 100,*/
            backgroundColor: "white",
            tooltip: false
        });

        //console.log("STAGE", this.stage);

        function sanitise(str) {
            return str.replace(/[^a-z0-9 ,.?!]/ig, '');
        }

        function updatePD() {
            this.updateProteinDropdown(d3.select(this.el).select(".queryBox"));
        }

        // this.listenTo (this.model.get("clmsModel"), "change:matches", updatePD);
        this.listenTo(this.model, "change:selectedProteins", updatePD);
        this.listenTo(vent, "proteinMetadataUpdated", updatePD);

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
                })).values().join(", ") : "?"
            ;

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
    },

    // Return selected proteins, or all proteins if nothing selected
    getSelectedProteins: function () {
        const selectedProteins = this.model.get("selectedProteins");
        return _.isEmpty(selectedProteins) ? Array.from(this.model.get("clmsModel").get("participants").values()) : selectedProteins;
    },

    updateProteinDropdown: function (parentElem) {
        const proteins = this.getSelectedProteins();

        addMultipleSelectControls({
            addToElem: parentElem,
            selectList: ["Proteins"],
            optionList: modelUtils.filterOutDecoyInteractors(proteins),
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

    },

    launchExternalPDBWindow: function () {
        // http://stackoverflow.com/questions/15818892/chrome-javascript-window-open-in-new-tab
        // annoying workaround whereby we need to open a blank window here and set the location later
        // otherwise chrome/pop-up blockers think it is some spammy popup rather than something the user wants.
        // Basically chrome has this point in this function as being traceable back to a user click event but the
        // callback from the ajax isn't.
        const newtab = window.open("", "_blank");
        const accessionIDs = modelUtils.getLegalAccessionIDs(this.getSelectedProteins());
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
            newtab.document.body.innerHTML = "No legal Accession IDs are in the current dataset. These are required to query the PDB service.";
        }
    },

    getSelectedOption: function (higherElem, selectName) {
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
            })
        ;

        return funcMeta;
    },

    launchExternalEBIPDBWindow: function () {
        const chosenSeq = (this.getSelectedOption(d3.select(this.el).select(".columnbar"), "Proteins") || {
            sequence: ""
        }).sequence;
        window.open("http://www.ebi.ac.uk/pdbe-srv/PDBeXplore/sequence/?seq=" + chosenSeq + "&tab=PDB%20entries", "_blank");
    },

    selectPDBFile: function (evt) {
        this.setWaitingEffect();
        this.loadRoute = "file";
        const self = this;
        //console.log ("target files", evt.target.files, evt.target.value);
        const pdbSettings = [];
        const fileCount = evt.target.files.length;

        const onLastLoad = _.after(fileCount, function () {
                NGLUtils.repopulateNGL({
                    pdbSettings: pdbSettings,
                    stage: self.stage,
                    compositeModel: self.model
                });
            }
        );

        for (let n = 0; n < fileCount; n++) {
            const fileObj = evt.target.files[n];

            modelUtils.loadUserFile(
                fileObj,
                function (fileContents, associatedData) {
                    const blob = new Blob([fileContents], {
                        type: 'application/text'
                    });
                    const name = associatedData.name;
                    pdbSettings.push({
                        id: name,
                        uri: blob,
                        local: true,
                        params: {
                            ext: name.substr(name.lastIndexOf('.') + 1),
                            cAlphaOnly: self.cAlphaOnly,
                        }
                    });
                    onLastLoad();
                },
                {name: fileObj.name}    // pass this associatedData in, so async loading doesn't break things i.e. if load A, B, and return order B, A
            );
        }

        evt.target.value = null;    // reset value so same file can be chosen twice in succession
    },

    enteringPDBCode: function (evt) {
        const valid = this.isPDBCodeValid();
        d3.select(this.el).select(".PDBSubmit").property("disabled", !valid);
        if (valid && evt.keyCode === 13) { // if return key pressed do same as pressing 'Enter' button
            this.loadPDBCode();
        }
    },

    loadPDBCode: function () {
        const pdbCode = d3.select(this.el).select(".inputPDBCode").property("value");
        this.loadRoute = "pdb";
        this.setWaitingEffect();

        const pdbSettings = pdbCode.match(utils.commonRegexes.multiPdbSplitter).map(function (code) {
            return {
                id: code,
                pdbCode: code,
                uri: "rcsb://" + code,
                local: false,
                params: {calphaOnly: this.cAlphaOnly}
            };
        }, this);

        NGLUtils.repopulateNGL({
            pdbSettings: pdbSettings,
            stage: this.stage,
            compositeModel: this.model
        });
    },

    isPDBCodeValid: function () {
        const elem = d3.select(this.el).select(".inputPDBCode");
        return elem.node().checkValidity();
    },

    // toggleCAlphaSetting: function (evt) {
    //     var val = evt.target.checked;
    //     this.cAlphaOnly = val;
    //     return this;
    // },

    identifier: "PDB File Chooser",
});

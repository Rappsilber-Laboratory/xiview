/**
 * @fileoverview 3D molecular visualization view using Molstar.
 * Replaces NGLViewBB.js. All toolbar/event wiring is preserved; NGL-specific calls
 * are replaced with Molstar equivalents (plugin.handleResize, PluginCommands.Camera.Reset,
 * plugin.helpers.viewportScreenshot, MolstarRepresentation, MolstarExportUtils).
 */

import "../../../css/nglViewBB.css";

import * as _ from "underscore";
import $ from "jquery";
import { PluginCommands } from "molstar/lib/mol-plugin/commands";

import { BaseFrameView } from "../../ui-utils/base-frame-view";
import {
    addMultipleSelectControls,
    filterStateToString, makeBackboneButtons, makeCanvas,
    makeLegalFileName, nullCanvasObj,
    objectStateToAbbvString,
    searchesToString, xilog
} from "../../utils";
import { DropDownMenuViewBB } from "../../ui-utils/ddMenuViewBB";
import { filterOutDecoyProteins, mergeContiguousFeatures, totalProteinLength } from "../../modelUtils";
import { MolstarExportUtils } from "./MolstarExportUtils";
import { MolstarRepresentation } from "./MolstarRepresentation";
import d3 from "d3";
import vent from "../../vent";

/**
 * Backbone view for 3D molecular structure visualization using Molstar.
 * @class
 * @extends BaseFrameView
 */
export class MolstarViewBB extends BaseFrameView {
    constructor(options) {
        super(options);
    }

    get events() {
        let parentEvents = BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "click .centreButton": "centerView",
            "click .downloadButton": "downloadImage",
            "click #nglPanelsavePDB": "savePDB",
            "click #nglPanelpymolExport": "exportPymol",
            "click #nglPanellinksCSVExport": "export3dLinksCSV",
            "click #nglPanellinksCSVExportSelected": "export3dLinksCSVSelected",
            "click #nglPanellinksHalfInCSVExport": "exportHalfInLinksCSV",
            "click #nglPanelhaddockExport": "exportHaddock",
            "click #nglPanelexportChimeraPB": "exportChimeraPB",
            "click #nglPanelexportJWalk": "exportJWalk",
            "click #nglPanelexportXlinkAnalyzer": "exportXlinkAnalyzer",
            "click .distanceLabelCB": "toggleLabels",
            "click .selectedOnlyCB": "toggleNonSelectedLinks",
            "click .showResiduesCB": "toggleResidues",
            "click .shortestLinkCB": "toggleShortestLinksOnly",
            "click .allowInterModelDistancesCB": "toggleAllowInterModelDistances",
            "change .showAllProteinsCB": "toggleShowAllProteins",
            "change .showCrosslinkedProteinsCB": "toggleShowAllProteins",
            "click .chainLabelLengthRB": "setChainLabelLength",
            "click .chainLabelFixedSizeCB": "setChainLabelFixedSize",
            "mouseleave canvas": "clearHighlighted",
        });
    }

    get defaultOptions() {
        return {
            labelVisible: false,
            selectedOnly: false,
            showResidues: true,
            shortestLinksOnly: true,
            chainRep: "cartoon",
            initialColourScheme: "uniform",
            greyOut: false,
            showAllProteins: false,
            chainLabelSetting: "Short",
            fixedLabelSize: false,
            defaultAssembly: "default",
            allowInterModelDistances: false,
            exportKey: true,
            exportTitle: true,
            canHideToolbarArea: true,
            canTakeImage: true,
        };
    }

    // eslint-disable-next-line no-unused-vars
    initialize(viewOptions) {
        super.initialize(...arguments);
        const self = this;
        this.colourScheme = this.options.initialColourScheme;
        const mainDivSel = d3.select(this.el);

        const flexWrapperPanel = mainDivSel.append("div")
            .attr("class", "verticalFlexContainer");

        const buttonData = [
            {
                initialState: this.options.showAllProteins,
                class: "showCrosslinkedProteinsCB",
                label: "ALL PROTEINS",
                type: "radio",
                group: "allProteins",
                id: "showCrosslinkedProteins",
                tooltip: "Keep showing proteins with no current crosslinks (within available PDB structure)"
            },
            {
                initialState: !this.options.showAllProteins,
                class: "showAllProteinsCB",
                label: "CROSSLINKED ONLY",
                type: "radio",
                group: "allProteins",
                id: "showAllProteins",
                tooltip: "Keep showing proteins with no current crosslinks (within available PDB structure)"
            },
            {
                label: "Re-Centre",
                class: "centreButton",
                type: "button",
                id: "recentre",
                tooltip: "Automatically pans and zooms so all visible structure is within window"
            },
        ];

        const toolbar = flexWrapperPanel.append("div").attr("class", "toolbar toolbarArea");
        makeBackboneButtons(toolbar, self.el.id, buttonData);

        const saveExportButtonData = [
            { class: "savePDBButton", label: "PDB & Crosslinks", id: "savePDB", d3tooltip: "Saves a copy of the PDB with complete filtered crosslinks" },
            { class: "exportPymolButton", label: "Pymol Command File", id: "pymolExport", d3tooltip: "Export a Pymol command script" },
            { class: "export3dLinksCSV", label: "3D Links CSV", id: "linksCSVExport", d3tooltip: "Export a CSV file of the links currently displayed" },
            { class: "export3dLinksCSVSelected", label: "3D Links CSV - Selected Only", id: "linksCSVExportSelected", d3tooltip: "Export a CSV file of the links currently selected" },
            { class: "exportHalfInLinksCSV", label: "Half-in Links CSV", id: "linksHalfInCSVExport", d3tooltip: "Export a CSV file of the links with one end in the 3d structure" },
            { class: "exportHaddockButton", label: "Haddock Distance Restraints File", id: "haddockExport", d3tooltip: "Export Haddock distance restraints" },
            { class: "exportChimeraPB", label: "ChimeraX Pseudobonds", id: "exportChimeraPB", d3tooltip: "Export Chimera Pseudobonds" },
            { class: "exportJWalk", label: "JWalk", id: "exportJWalk", d3tooltip: "Export a jWalk text file" },
            { class: "exportXlinkAnalyzer", label: "XlinkAnalyzer", id: "exportXlinkAnalyzer", d3tooltip: "Exports XlinkAnalyzer json and CSV files" },
        ];
        saveExportButtonData.forEach(function (d) {
            d.type = d.type || "button";
            d.value = d.value || d.label;
        });
        makeBackboneButtons(toolbar, self.el.id, saveExportButtonData);

        const optid = this.el.id + "Exports";
        toolbar.append("p").attr("id", optid);
        new DropDownMenuViewBB({
            el: "#" + optid,
            model: self.model.get("clmsModel"),
            myOptions: {
                title: "3D Export ▼",
                menu: saveExportButtonData.map(function (d) {
                    d.id = self.el.id + d.id;
                    d.tooltip = d.d3tooltip;
                    return d;
                }),
                closeOnClick: true,
                tooltipModel: self.model.get("tooltipModel"),
            }
        });

        // Assembly selector (simplified - only Default supported for now)
        const buildAssemblySelector = function () {
            const assemblys = ["Default"];
            const labelPairs = assemblys.map((ass) => ({ label: ass, key: ass }));
            addMultipleSelectControls({
                addToElem: toolbar,
                selectList: ["Assembly"],
                optionList: labelPairs,
                optionLabelFunc: (d) => d.label,
                optionValueFunc: (d) => d.key,
                idFunc: (d) => d.key,
                changeFunc: function () {
                    if (self.xlRepr) {
                        self.options.defaultAssembly = d3.event.target.value;
                        self.xlRepr.updateOptions(self.options, ["defaultAssembly"])
                            .updateAssemblyType();
                        self.setAssemblyChains();
                    }
                },
                initialSelectionFunc: (d) => d.key === self.options.defaultAssembly
            });
        };
        buildAssemblySelector.call(this);

        const toggleButtonData = [
            { initialState: this.options.selectedOnly, class: "selectedOnlyCB", label: "Selected Crosslinks Only", id: "selectedOnly", d3tooltip: "Only show selected crosslinks" },
            { initialState: this.options.shortestLinksOnly, class: "shortestLinkCB", label: "Shortest Possible Crosslinks Only", id: "shortestOnly", d3tooltip: "Only show shortest possible crosslinks" },
            { initialState: this.options.allowInterModelDistances, class: "allowInterModelDistancesCB", label: "Inter-Model Distances", id: "allowInterModelDistances", d3tooltip: "Allow Inter-Model Distances" },
            { initialState: this.options.showResidues, class: "showResiduesCB", label: "Crosslinked Residues", id: "showResidues", d3tooltip: "Show crosslinked residues on protein representations" },
            { initialState: this.options.labelVisible, class: "distanceLabelCB", label: "Distance Labels", id: "visLabel", d3tooltip: "Show distance labels on displayed crosslinks" },
            { class: "chainLabelLengthRB", label: "Long", id: "showLongChainLabels", tooltip: "Verbose chain labels", group: "chainLabelSetting", type: "radio", value: "Verbose", header: "Protein Chain Label Style" },
            { class: "chainLabelLengthRB", label: "Short", id: "showShortChainLabels", tooltip: "Short chain labels", group: "chainLabelSetting", type: "radio", value: "Short" },
            { class: "chainLabelLengthRB", label: "None", id: "showNoChainLabels", tooltip: "No chain labels", group: "chainLabelSetting", type: "radio", value: "None" },
            { initialState: this.options.fixedLabelSize, class: "chainLabelFixedSizeCB", label: "Fixed Size", id: "showFixedSizeChainLabels", d3tooltip: "Show fixed size chain labels" },
        ];
        toggleButtonData.forEach(function (d) {
            d.type = d.type || "checkbox";
            d.value = d.value || d.label;
            d.inputFirst = true;
            if (d.initialState === undefined && d.group && d.value) {
                d.initialState = (d.value === this.options[d.group]);
            }
        }, this);
        makeBackboneButtons(toolbar, self.el.id, toggleButtonData);

        const optid2 = this.el.id + "Options";
        toolbar.append("p").attr("id", optid2);
        new DropDownMenuViewBB({
            el: "#" + optid2,
            model: self.model.get("clmsModel"),
            myOptions: {
                title: "Show ▼",
                menu: toggleButtonData.map(function (d) {
                    d.id = self.el.id + d.id;
                    d.tooltip = d.d3tooltip;
                    return d;
                }),
                closeOnClick: false,
                tooltipModel: self.model.get("tooltipModel"),
            }
        });

        // Colour proteins dropdown (simplified schemes)
        const mainColourSchemes = ["uniform", "chain-id", "secondary-structure", "entity-id"];
        const aliases = {
            "uniform": "No Colouring",
            "chain-id": "Chain Name",
            "secondary-structure": "Secondary Structure",
            "entity-id": "Entity Index",
        };
        addMultipleSelectControls({
            addToElem: toolbar,
            selectList: ["Colour Proteins By"],
            optionList: mainColourSchemes,
            optionLabelFunc: (d) => aliases[d] || d,
            changeFunc: function () {
                if (self.xlRepr) {
                    self.colourScheme = d3.event.target.value;
                    self.colorChange();
                }
            },
            initialSelectionFunc: (d) => d === self.options.initialColourScheme
        });

        this.chartDiv = flexWrapperPanel.append("div")
            .attr({
                class: "panelInner",
                "flex-grow": 1,
                id: "ngl"
            });

        this.chartDiv.append("div").attr("class", "overlayInfo").html("No PDB File Loaded");
        this.chartDiv.append("div").attr("class", "linkInfo").html("...");

        this
            .listenTo(this.model.get("filterModel"), "change", this.showFiltered)
            .listenTo(this.model, "change:linkColourAssignment currentColourModelChanged", function () {
                if (this.xlRepr) {
                    this.xlRepr.rerenderColourSchemes([]);
                }
            })
            .listenTo(this.model, "change:proteinColourAssignment currentProteinColourModelChanged", function () {
                if (this.xlRepr) {
                    this.xlRepr.rerenderColourSchemes([]);
                }
            })
            .listenTo(this.model, "change:selection", this.showSelectedLinks)
            .listenTo(this.model, "change:highlights", this.showHighlightedLinks);

        const disableHaddock = function (stageModel) {
            const modelInfoArr = stageModel.get("modelInfoArr") || [];
            mainDivSel.select(".exportHaddockButton").property("disabled",
                !stageModel.get("allowInterModelDistances") || modelInfoArr.length <= 1);
        };

        this.listenTo(vent, "changeAllowInterModelDistances", function (stageModel, value) {
            this.options.allowInterModelDistances = value;
            d3.select(this.el).selectAll(".allowInterModelDistancesCB input").property("checked", value);
            if (this.xlRepr) {
                this.showFiltered();
            }
            disableHaddock(stageModel);
        });

        this.listenTo(this.model, "change:stageModel", function (model, newStageModel) {
            const prevStageModel = model.previous("stageModel");
            xilog("STAGE MODEL CHANGED", arguments, this, prevStageModel);
            if (prevStageModel) {
                this.stopListening(prevStageModel);
            }
            if (this.xlRepr) {
                this.xlRepr.dispose();
                this.xlRepr = null;
            }

            this
                .listenTo(newStageModel, "change:linkList", function () {
                    if (this.xlRepr) {
                        this.xlRepr._handleDataChange();
                        this.reportLinks();
                    }
                })
                .listenTo(newStageModel, "change:showShortestLinksOnly", function (stageModel, value) {
                    this.options.shortestLinksOnly = value;
                    d3.select(this.el).selectAll(".shortestLinkCB input").property("checked", value);
                    if (this.xlRepr) {
                        this.showFiltered();
                    }
                });

            newStageModel
                .set("allowInterModelDistances", this.options.allowInterModelDistances, { silent: true })
                .set("showShortestLinksOnly", this.options.shortestLinksOnly);

            this.listenToOnce(this.model, "change:distancesObj", function () {
                buildAssemblySelector.call(this);
                this
                    .setAssemblyChains()
                    .repopulate()
                    .colorChange();
            });

            disableHaddock(newStageModel);
        });

        this.listenTo(vent, "proteinMetadataUpdated", function () {
            if (this.xlRepr) {
                this.xlRepr.redisplayChainLabels();
            }
        });

        this.listenTo(vent, "PDBPermittedChainSetsUpdated", function () {
            if (this.xlRepr) {
                this.showFiltered().centerView();
            }
        });
    }

    setAssemblyChains() {
        const distObj = this.model.get("distancesObj");
        if (distObj) {
            // Molstar has no biomolDict — allow all chains (undefined = no filter).
            distObj.setAllowedChainNameSet(undefined, false);
        }
        return this;
    }

    reportLinks() {
        if (!this.xlRepr) return this;
        const stageModel = this.model.get("stageModel");
        const fullLinkCount = stageModel.getFullLinkCount();
        const halfLinkCount = stageModel.getHalfLinkCount();
        const currentFilteredLinkCount = this.model.getFilteredCrossLinks().length;
        const missingLinkCount = currentFilteredLinkCount - fullLinkCount - halfLinkCount;
        const commaFormat = d3.format(",");
        const linkText = "Currently showing " + commaFormat(fullLinkCount) + " in full " +
            (halfLinkCount ? "and " + commaFormat(halfLinkCount) + " in part " : "") +
            "of " + commaFormat(currentFilteredLinkCount) + " filtered TT crosslinks" +
            (missingLinkCount ? " (" + commaFormat(missingLinkCount) + " others outside of structure scope)" : "");
        this.chartDiv.select("div.linkInfo").html(linkText);
        return this;
    }

    repopulate() {
        const stageModel = this.model.get("stageModel");
        xilog("REPOPULATE (Molstar)", this.model, stageModel);
        const sname = stageModel.getStructureName();
        let overText = "PDB File: " + (sname.length === 4 ?
            "<A class='outsideLink' target='_blank' href='https://www.rcsb.org/pdb/explore.do?structureId=" + sname + "'>" + sname + "</A>" : sname);

        const proteins = filterOutDecoyProteins(Array.from(this.model.get("clmsModel").getProteinsIterator()));
        const alignColl = this.model.get("alignColl");
        const pdbLengthsPerProtein = proteins.map(function (inter) {
            const pdbFeatures = alignColl.getAlignmentsAsFeatures(inter.id);
            const contigPDBFeatures = mergeContiguousFeatures(pdbFeatures);
            return d3.sum(contigPDBFeatures, (d) => d.end - d.begin + 1);
        }, this);
        const totalPDBLength = d3.sum(pdbLengthsPerProtein);
        const totalLength = totalProteinLength(proteins);
        const pcent = d3.format(".0%")(totalPDBLength / totalLength);
        const commaFormat = d3.format(",");

        overText += " - covers approx " + commaFormat(totalPDBLength) + " of " + commaFormat(totalLength) + " AAs (" + pcent + ")";
        this.chartDiv.select("div.overlayInfo").html(overText);

        this.xlRepr = new MolstarRepresentation(stageModel, {
            chainRep: this.options.chainRep,
            defaultAssembly: this.options.defaultAssembly,
            showAllProteins: this.options.showAllProteins,
            displayedLabelVisible: this.options.labelVisible,
        });

        this.showFiltered();
        return this;
    }

    render() {
        if (this.isVisible()) {
            this.showFiltered();
        }
        return this;
    }

    relayout() {
        const stageModel = this.model.get("stageModel");
        if (stageModel) {
            const plugin = stageModel.get("plugin");
            if (plugin) {
                plugin.handleResize();
            }
        }
        return this;
    }

    takeImage() {
        return this.downloadImage();
    }

    async downloadImage() {
        const stageModel = this.model.get("stageModel");
        if (stageModel) {
            const plugin = stageModel.get("plugin");
            if (!plugin) return this;

            const self = this;
            const scale = 4;

            try {
                const dataUri = await plugin.helpers.viewportScreenshot.getImageDataUri();

                if (self.options.exportKey) {
                    const gap = 50;
                    const w = plugin.canvas3d ? plugin.canvas3d.width * scale : 800;
                    const h = plugin.canvas3d ? plugin.canvas3d.height * scale : 600;
                    const canvasObj = makeCanvas(w, h + gap);

                    // eslint-disable-next-line no-undef
                    const DOMURL = URL || webkitURL || window;
                    const img = new Image();
                    img.onload = function () {
                        canvasObj.context.drawImage(img, 0, gap);
                        const tempSVG = self.addKey({
                            addToSelection: d3.select(self.el),
                            addOrigin: self.options.exportTitle
                        });
                        const svgString = new XMLSerializer().serializeToString(tempSVG.node());
                        const keyblob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
                        const keyurl = DOMURL.createObjectURL(keyblob);
                        const keyimg = new Image();
                        keyimg.onload = function () {
                            canvasObj.context.drawImage(keyimg, 0, 0);
                            DOMURL.revokeObjectURL(keyurl);
                            self.removeKey();
                            canvasObj.canvas.toBlob(function (newBlob) {
                                if (newBlob) {
                                    nullCanvasObj(canvasObj);
                                    const a = document.createElement("a");
                                    a.download = self.filenameStateString() + ".png";
                                    a.href = URL.createObjectURL(newBlob);
                                    a.click();
                                }
                            }, "image/png");
                        };
                        keyimg.src = keyurl;
                    };
                    img.src = dataUri;
                } else {
                    const a = document.createElement("a");
                    a.download = self.filenameStateString() + ".png";
                    a.href = dataUri;
                    a.click();
                }
            } catch (e) {
                console.error("Screenshot failed:", e);
            }
        }
        return this;
    }

    colorChange() {
        // Molstar doesn't use a separate colour registry. We'd need to rebuild
        // structure representations with a new color theme. For now, this is a no-op.
        return this;
    }

    centerView() {
        const stageModel = this.model.get("stageModel");
        if (stageModel) {
            const plugin = stageModel.get("plugin");
            if (plugin) {
                PluginCommands.Camera.Reset(plugin, {});
            }
        }
        return this;
    }

    savePDB() {
        const stageModel = this.model.get("stageModel");
        MolstarExportUtils.exportPDB(
            stageModel,
            this.pdbFilenameStateString(),
            [
                "PDB ID: " + stageModel.getStructureName(),
                "Exported by " + this.identifier + " and XiView",
                "Xi Crosslinks in CONECT and LINK records",
                "Search ID: " + searchesToString(this.model),
                "Filter: " + filterStateToString(this.model)
            ]
        );
        return this;
    }

    exportPymol() {
        const stageModel = this.model.get("stageModel");
        MolstarExportUtils.exportPymolCrossLinkSyntax(
            stageModel, this.pdbFilenameStateString(),
            [
                "PDB ID: " + stageModel.getStructureName(),
                "Exported by " + this.identifier + " and XiView",
                "Search ID: " + searchesToString(this.model),
                "Filter: " + filterStateToString(this.model)
            ]
        );
        return this;
    }

    export3dLinksCSV() {
        const stageModel = this.model.get("stageModel");
        MolstarExportUtils.export3dLinksCSV(stageModel, this.pdbFilenameStateString(), false);
        return this;
    }

    export3dLinksCSVSelected() {
        const stageModel = this.model.get("stageModel");
        MolstarExportUtils.export3dLinksCSV(stageModel, this.pdbFilenameStateString(), true);
        return this;
    }

    exportHalfInLinksCSV() {
        const stageModel = this.model.get("stageModel");
        MolstarExportUtils.exportHalfInLinksCSV(stageModel, this.pdbFilenameStateString(), false);
        return this;
    }

    exportChimeraPB() {
        const stageModel = this.model.get("stageModel");
        MolstarExportUtils.exportChimeraPseudobonds(stageModel, this.pdbFilenameStateString(), false);
        return this;
    }

    exportJWalk() {
        const stageModel = this.model.get("stageModel");
        MolstarExportUtils.exportJWalk(stageModel, this.pdbFilenameStateString(), false);
        return this;
    }

    exportXlinkAnalyzer() {
        const stageModel = this.model.get("stageModel");
        MolstarExportUtils.exportXlinkAnalyzer(stageModel, this.pdbFilenameStateString(), false);
        return this;
    }

    exportHaddock() {
        const stageModel = this.model.get("stageModel");
        MolstarExportUtils.exportHaddockCrossLinkSyntax(
            stageModel, this.pdbFilenameStateString(),
            [
                "PDB ID: " + stageModel.getStructureName(),
                "Exported by " + this.identifier + " and XiView",
                "Search ID: " + searchesToString(this.model),
                "Filter: " + filterStateToString(this.model)
            ],
            {
                crosslinkerInfo: this.model.get("clmsModel").getCrosslinkerSpecificity(),
                crosslinks: this.model.get("clmsModel").getCrosslinks()
            }
        );
        return this;
    }

    toggleLabels(event) {
        this.options.labelVisible = event.target.checked;
        return this;
    }

    toggleResidues(event) {
        this.options.showResidues = event.target.checked;
        return this;
    }

    toggleNonSelectedLinks(event) {
        this.options.selectedOnly = event.target.checked;
        return this;
    }

    toggleShortestLinksOnly(event) {
        this.model.get("stageModel").set("showShortestLinksOnly", event.target.checked);
        return this;
    }

    toggleAllowInterModelDistances(event) {
        this.model.get("stageModel").set("allowInterModelDistances", event.target.checked);
        return this;
    }

    toggleShowAllProteins() {
        const showAllCB = d3.select(".showAllProteinsCB");
        const bool = !showAllCB.node().checked;
        this.options.showAllProteins = bool;
        if (this.xlRepr) {
            this.xlRepr.options.showAllProteins = bool;
            this.xlRepr.redisplayProteins();
        }
        return this;
    }

    setChainLabelLength() {
        const checkedElem = d3.select(this.el).select("input.chainLabelLengthRB:checked");
        if (!checkedElem.empty()) {
            const value = checkedElem.property("value");
            this.options.chainLabelSetting = value;
            if (this.xlRepr) {
                this.xlRepr.updateOptions(this.options, ["chainLabelSetting"]);
                this.xlRepr.redisplayChainLabels();
            }
        }
        return this;
    }

    setChainLabelFixedSize(event) {
        this.options.fixedLabelSize = event.target.checked;
        return this;
    }

    rerenderColourSchemes(repSchemePairs) {
        if (this.xlRepr && this.isVisible()) {
            this.xlRepr.rerenderColourSchemes(repSchemePairs);
        }
        return this;
    }

    showHighlightedLinks() {
        if (this.xlRepr && this.isVisible()) {
            this.xlRepr.setHighlightedLinks(this.xlRepr.nglModelWrapper.getFullLinks());
        }
        return this;
    }

    showSelectedLinks() {
        if (this.xlRepr && this.isVisible()) {
            this.xlRepr.setSelectedLinks(this.xlRepr.nglModelWrapper.getFullLinks());
        }
        return this;
    }

    showFiltered() {
        if (this.xlRepr && this.isVisible()) {
            this.model.get("stageModel").setFilteredLinkList();
        }
        return this;
    }

    clearHighlighted() {
        if (this.xlRepr && this.isVisible()) {
            this.model.setMarkedCrossLinks("highlights", [], false, false);
            this.model.get("tooltipModel").set("contents", null);
        }
        return this;
    }

    optionsToString() {
        const abbvMap = {
            labelVisible: "LBLSVIS",
            selectedOnly: "SELONLY",
            showResidues: "RES",
            shortestLinksOnly: "SHORTONLY",
            allowInterModelDistances: "INTRMOD"
        };
        const fields = ["rep", "labelVisible", "selectedOnly", "showResidues", "shortestLinksOnly", "allowInterModelDistances"];
        const optionsPlus = $.extend({}, this.options);
        optionsPlus.rep = this.xlRepr ? this.xlRepr.options.chainRep : "cartoon";
        return objectStateToAbbvString(optionsPlus, fields, d3.set(), abbvMap);
    }

    pdbFilenameStateString() {
        const stageModel = this.model.get("stageModel");
        return makeLegalFileName(stageModel.getStructureName() + "-CrossLinks-" + searchesToString(this.model) + "-" + filterStateToString(this.model));
    }

    filenameStateString() {
        const stageModel = this.model.get("stageModel");
        return makeLegalFileName(searchesToString(this.model) + "--" + this.identifier + "-" + this.optionsToString() + "-PDB=" + stageModel.getStructureName() + "--" + filterStateToString(this.model));
    }
}

MolstarViewBB.prototype.identifier = "Molstar Viewer - PDB Structure";

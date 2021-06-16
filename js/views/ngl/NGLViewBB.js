var CLMSUI = CLMSUI || {};

CLMSUI.NGLViewBB = CLMSUI.utils.BaseFrameView.extend({

    events: function () {
        let parentEvents = CLMSUI.utils.BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "click .centreButton": "centerView",
            "click .downloadButton": "downloadImage",
            "click #nglPanelsavePDB": "savePDB", // hacked to stop it firing twice (when it was on class)
            "click #nglPanelpymolExport": "exportPymol",
            "click #nglPanellinksCSVExport": "export3dLinksCSV",
            "click #nglPanellinksCSVExportSelected": "export3dLinksCSVSelected",
            "click #nglPanelhaddockExport": "exportHaddock",
            "click #nglPanelexportChimeraPB": "exportChimeraPB",
            "click #nglPanelexportJWalk": "exportJWalk",
            "click #nglPanelexportXlinkAnalyzer": "exportXlinkAnalyzer",
            "click .distanceLabelCB": "toggleLabels",
            "click .selectedOnlyCB": "toggleNonSelectedLinks",
            "click .showResiduesCB": "toggleResidues",
            "click .shortestLinkCB": "toggleShortestLinksOnly",
            "click .allowInterModelDistancesCB": "toggleAllowInterModelDistances",
            "click .showAllProteinsCB": "toggleShowAllProteins",
            "click .chainLabelLengthRB": "setChainLabelLength",
            "click .chainLabelFixedSizeCB": "setChainLabelFixedSize",
            "mouseleave canvas": "clearHighlighted",
            "click .greyer": "colorChange"
        });
    },

    defaultOptions: {
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
    },

    initialize: function (viewOptions) {
        CLMSUI.NGLViewBB.__super__.initialize.apply(this, arguments);
        const self = this;

        // this.el is the dom element this should be getting added to, replaces targetDiv
        const mainDivSel = d3.select(this.el);

        const flexWrapperPanel = mainDivSel.append("div")
            .attr("class", "verticalFlexContainer");

        const buttonData = [{
            label: CLMSUI.utils.commonLabels.downloadImg + "PNG",
            class: "downloadButton",
            type: "button",
            id: "download",
            tooltip: "Save a PNG image of the view"
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
        CLMSUI.utils.makeBackboneButtons(toolbar, self.el.id, buttonData);

        // Generate Export/Save cross-link data dropdown
        const saveExportButtonData = [{
            class: "savePDBButton",
            label: "PDB & Crosslinks",
            id: "savePDB",
            d3tooltip: "Saves a copy of the PDB with complete filtered crosslinks"
        },
            {
                class: "exportPymolButton",
                label: "Pymol Command File",
                id: "pymolExport",
                d3tooltip: "Export a Pymol command script for recreating this pdb and complete filtered crosslinks"
            },
            {
                class: "export3dLinksCSV",
                label: "3D Links CSV",
                id: "linksCSVExport",
                d3tooltip: "Export a CSV file of the links currently displayed in NGL"
            },
            {
                class: "export3dLinksCSVSelected",
                label: "3D Links CSV - Selected Only",
                id: "linksCSVExportSelected",
                d3tooltip: "Export a CSV file of the links currently selected in NGL"
            },
            {
                class: "exportHaddockButton",
                label: "Haddock Distance Restraints File",
                id: "haddockExport",
                d3tooltip: "Export a Haddock command script containing the complete filtered inter-pdb(model) crosslinks. Requires 'Show > Inter-Model Distances' to be set"
            },
            {
                class: "exportChimeraPB",
                label: "ChimeraX Pseudobonds",
                id: "exportChimeraPB",
                d3tooltip: "Export Chimera Pseudobonds of the links currently displayed in NGL"
            },
            {
                class: "exportJWalk",
                label: "JWalk",
                id: "exportJWalk",
                d3tooltip: "Export a jWalk text file of the links currently displayed in NGL"
            },
            {
                class: "exportXlinkAnalyzer",
                label: "XlinkAnalyzer",
                id: "exportXlinkAnalyzer",
                d3tooltip: "Exports two files: XlinkAnalyzer json (recording the mapping from search seq's to PDB seq's) and XlinkAnalyzer CSV (of the links currently displayed in NGL)"
            },
        ];
        saveExportButtonData
            .forEach(function (d) {
                d.type = d.type || "button";
                d.value = d.value || d.label;
            }, this)
        ;
        CLMSUI.utils.makeBackboneButtons(toolbar, self.el.id, saveExportButtonData);

        // ...then moved to a dropdown menu
        const optid = this.el.id + "Exports";
        toolbar.append("p").attr("id", optid);
        new CLMSUI.DropDownMenuViewBB({
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


        // Assembly choice dropdown
        const buildAssemblySelector = function () {
            const stageModel = this.model.get("stageModel");
            const assemblys = stageModel ? d3.keys(stageModel.get("structureComp").structure.biomolDict) : ["BU1", "AU"];
            assemblys.unshift("Default");
            const labelPairs = assemblys.map(function (ass) {
                return {
                    label: ass.replace("AU", "Asymmetric Unit").replace("BU", "Biological Unit "),
                    key: ass
                };
            });
            CLMSUI.utils.addMultipleSelectControls({
                addToElem: toolbar,
                selectList: ["Assembly"],
                optionList: labelPairs,
                optionLabelFunc: function (d) {
                    return d.label;
                },
                optionValueFunc: function (d) {
                    return d.key;
                },
                idFunc: function (d) {
                    return d.key;
                },
                changeFunc: function () {
                    if (self.xlRepr) {
                        self.options.defaultAssembly = d3.event.target.value;
                        self.xlRepr
                            .updateOptions(self.options, ["defaultAssembly"])
                            .updateAssemblyType()
                        ;
                        self.setAssemblyChains();
                    }
                },
                initialSelectionFunc: function (d) {
                    return d.key === self.options.defaultAssembly;
                }
            });
        };
        buildAssemblySelector.call(this);


        // Various view options set up...
        const toggleButtonData = [{
            initialState: this.options.selectedOnly,
            class: "selectedOnlyCB",
            label: "Selected Crosslinks Only",
            id: "selectedOnly",
            d3tooltip: "Only show selected crosslinks"
        },
            {
                initialState: this.options.shortestLinksOnly,
                class: "shortestLinkCB",
                label: "Shortest Possible Crosslinks Only",
                id: "shortestOnly",
                d3tooltip: "Only show shortest possible crosslinks: complexes with multiple (N) copies of a protein can have multiple possible alternatives for crosslinks - N x N for self links, N x M for between links"
            },
            {
                initialState: this.options.allowInterModelDistances,
                class: "allowInterModelDistancesCB",
                label: "Inter-Model Distances",
                id: "allowInterModelDistances",
                d3tooltip: "Allow Inter-Model Distances - Warning: Different Models may not be correctly spatially aligned"
            },
            {
                initialState: this.options.showResidues,
                class: "showResiduesCB",
                label: "Cross-Linked Residues",
                id: "showResidues",
                d3tooltip: "Show crosslinked residues on protein representations"
            },
            {
                initialState: this.options.showAllProteins,
                class: "showAllProteinsCB",
                label: "All Proteins",
                id: "showAllProteins",
                d3tooltip: "Keep showing proteins with no current crosslinks (within available PDB structure)"
            },
            {
                initialState: this.options.labelVisible,
                class: "distanceLabelCB",
                label: "Distance Labels",
                id: "visLabel",
                d3tooltip: "Show distance labels on displayed crosslinks"
            },
            {
                class: "chainLabelLengthRB",
                label: "Long",
                id: "showLongChainLabels",
                tooltip: "Show protein chain labels with more verbose content if available",
                group: "chainLabelSetting",
                type: "radio",
                value: "Verbose",
                header: "Protein Chain Label Style"
            },
            {
                class: "chainLabelLengthRB",
                label: "Short",
                id: "showShortChainLabels",
                tooltip: "Show protein chain labels with shorter content",
                group: "chainLabelSetting",
                type: "radio",
                value: "Short"
            },
            {
                class: "chainLabelLengthRB",
                label: "None",
                id: "showNoChainLabels",
                tooltip: "Show no protein chain labels",
                group: "chainLabelSetting",
                type: "radio",
                value: "None"
            },
            {
                initialState: this.options.fixedLabelSize,
                class: "chainLabelFixedSizeCB",
                label: "Fixed Size",
                id: "showFixedSizeChainLabels",
                d3tooltip: "Show fixed size protein chain labels",
            },
        ];
        toggleButtonData
            .forEach(function (d) {
                d.type = d.type || "checkbox";
                d.value = d.value || d.label;
                d.inputFirst = true;
                if (d.initialState === undefined && d.group && d.value) { // set initial values for radio button groups
                    d.initialState = (d.value === this.options[d.group]);
                }
            }, this);
        CLMSUI.utils.makeBackboneButtons(toolbar, self.el.id, toggleButtonData);

        // ...then moved to a dropdown menu
        const optid2 = this.el.id + "Options";
        toolbar.append("p").attr("id", optid2);
        new CLMSUI.DropDownMenuViewBB({
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

        // Protein view type dropdown
        const allReps = NGL.RepresentationRegistry.names.slice().sort();
        const ignoreReps = ["axes", "base", "contact", "distance", "helixorient", "hyperball", "label", "rocket", "trace", "unitcell", "validation", "angle", "dihedral"];
        const mainReps = _.difference(allReps, ignoreReps);
        CLMSUI.utils.addMultipleSelectControls({
            addToElem: toolbar,
            selectList: ["Draw Proteins As"],
            optionList: mainReps,
            changeFunc: function () {
                if (self.xlRepr) {
                    self.options.chainRep = d3.event.target.value;
                    self.xlRepr
                        .updateOptions(self.options, ["chainRep"])
                        .replaceChainRepresentation(self.options.chainRep);
                }
            },
            initialSelectionFunc: function (d) {
                return d === self.options.chainRep;
            }
        });


        // Residue colour scheme
        NGL.ColormakerRegistry.add("external", function () {
            this.lastResidueIndex = null;
            this.lastColour = null;
            this.dontGrey = true;
            this.atomColor = function (atom) {
                var arindex = atom.residueIndex;
                if (this.lastResidueIndex === arindex) {    // saves recalculating, as colour is per residue
                    return this.lastColour;
                }
                this.lastResidueIndex = arindex;

                var residue = self.model.get("stageModel").getResidueByNGLGlobalIndex(arindex);

                if (residue !== undefined) {
                    var linkCount = self.xlRepr ? self.xlRepr.nglModelWrapper.getHalfLinkCountByResidue(residue) : 0;
                    this.lastColour = (linkCount > 0 ? 0x000077 : 0xcccccc);
                } else {
                    this.lastColour = 0xcccccc;
                }
                //console.log ("rid", arindex, this.lastColour);
                return this.lastColour;
            };
            this.filterSensitive = true;
        });


        // Current cross-view protein colour scheme
        NGL.ColormakerRegistry.add("external2", function () {
            this.lastChainIndex = null;
            this.lastColour = null;
            this.dontGrey = true;
            this.atomColor = function (atom) {
                const acindex = atom.chainIndex;
                if (this.lastChainIndex === acindex) {    // saves recalculating, as colour is per residue
                    return this.lastColour;
                }
                this.lastChainIndex = acindex;

                const proteinID = self.model.get("stageModel").get("reverseChainMap").get(acindex);
                const protein = self.model.get("clmsModel").get("participants").get(proteinID);

                if (protein !== undefined) {
                    const rgb = d3.rgb(self.model.get("proteinColourAssignment").getColour(protein));
                    this.lastColour = (rgb.r << 16) + (rgb.g << 8) + rgb.b;
                } else {
                    this.lastColour = 0xcccccc;
                }
                //console.log ("rid", arindex, this.lastColour);
                return this.lastColour;
            };
            this.filterSensitive = true;
        });

        const allColourSchemes = d3.values(NGL.ColormakerRegistry.getSchemes());
        const ignoreColourSchemes = ["electrostatic", "volume", "geoquality", "moleculetype", "occupancy", "random", "value", "densityfit", "chainid", "randomcoilindex"];
        const aliases = {
            bfactor: "B Factor",
            uniform: "No Colouring",
            atomindex: "Atom Index",
            residueindex: "Residue Index",
            chainindex: "Chain Index",
            modelindex: "Model Index",
            resname: "Residue Name",
            chainname: "Chain Name",
            sstruc: "Secondary Structure",
            entityindex: "Entity Index",
            entitytype: "Entity Type",
            partialcharge: "Partial Charge",
            external: "Residues with Half-Links",
            external2: "Xi Legend Protein Scheme",
        };
        //var labellabel = d3.set(["uniform", "chainindex", "chainname", "modelindex"]);
        const mainColourSchemes = _.difference(allColourSchemes, ignoreColourSchemes);

        const colourChangeFunc = function () {
            if (self.xlRepr) {
                const value = d3.event.target.value;
                self.colourScheme = value;
                const structure = self.model.get("stageModel").get("structureComp").structure;
                self.xlRepr.colorOptions.residueSubScheme = NGL.ColormakerRegistry.getScheme({
                    scheme: value || "uniform",
                    structure: structure
                });
                //console.log ("SUBSCHEME", self.xlRepr.colorOptions.residueSubScheme);

                self.rerenderColourSchemes([
                    {
                        nglRep: self.xlRepr.resRepr,
                        colourScheme: self.xlRepr.colorOptions.residueColourScheme,
                        immediateUpdate: false
                    }
                    ,
                    // {
                    //     nglRep: self.xlRepr.halfLinkResRepr,
                    //     colourScheme: self.xlRepr.colorOptions.halfLinkResidueColourScheme,
                    //     immediateUpdate: false
                    // },
                    {nglRep: self.xlRepr.sstrucRepr, colourScheme: self.xlRepr.colorOptions.residueColourScheme},
                ]);
            }
        };

        CLMSUI.utils.addMultipleSelectControls({
            addToElem: toolbar,
            selectList: ["Colour Proteins By"],
            optionList: mainColourSchemes,
            optionLabelFunc: function (d) {
                return aliases[d] || d;
            },
            changeFunc: colourChangeFunc,
            initialSelectionFunc: function (d) {
                return d === self.options.initialColourScheme;
            }
        });

        // toolbar.append('label')
        //     .text("GREYER")
        //     .append("input")
        //     .attr("checked", true)
        //     .attr("type", "checkbox")
        //     .classed("greyer", true);

        this.chartDiv = flexWrapperPanel.append("div")
            .attr({
                class: "panelInner",
                "flex-grow": 1,
                id: "ngl"
            });

        this.chartDiv.append("div").attr("class", "overlayInfo").html("No PDB File Loaded");
        this.chartDiv.append("div").attr("class", "linkInfo").html("...");

        this
            //.listenTo (this.model, "filteringDone", this.showFiltered) // any property changing in the filter model means rerendering this view
            .listenTo(this.model.get("filterModel"), "change", this.showFiltered) // any property changing in the filter model means rerendering this view
            .listenTo(this.model, "change:linkColourAssignment currentColourModelChanged", function () {
                if (this.xlRepr){
                    this.rerenderColourSchemes([{
                        nglRep: this.xlRepr.linkRepr,
                        colourScheme: this.xlRepr.colorOptions.linkColourScheme
                    }
                //    , {
                //        nglRep: this.xlRepr.halfLinkResRepr,
                //        colourScheme: this.xlRepr.colorOptions.halfLinkResidueColourScheme
                //   }
                    ]);
                }
                else {
                    this.rerenderColourSchemes([{nglRep: null, colourScheme: null}]);
                }
            })  // if crosslink colour model changes internally, or is swapped for new one
            .listenTo(this.model, "change:proteinColourAssignment currentProteinColourModelChanged", function () {
                this.rerenderColourSchemes([this.xlRepr ? {
                    nglRep: this.xlRepr.sstrucRepr,
                    colourScheme: this.xlRepr.colorOptions.residueColourScheme
                } : {nglRep: null, colourScheme: null}]);
            })  // if cross-view protein colour model changes, or is swapped for new one
            .listenTo(this.model, "change:selection", this.showSelectedLinks)
            .listenTo(this.model, "change:highlights", this.showHighlightedLinks)
        ;

        const disableHaddock = function (stageModel) {
            mainDivSel.select(".exportHaddockButton").property("disabled", !stageModel.get("allowInterModelDistances") || stageModel.get("structureComp").structure.modelStore.count == 1);
        };
        // listen to CLMSUI.vent rather than directly to newStageModel's change:allowInterModelDistances as we needed to recalc distances before informing views
        this.listenTo(CLMSUI.vent, "changeAllowInterModelDistances", function (stageModel, value) {
            this.options.allowInterModelDistances = value;
            d3.select(this.el).selectAll(".allowInterModelDistancesCB input").property("checked", value);
            if (this.xlRepr) {
                this.showFiltered();
            }
            disableHaddock(stageModel);
        });


        this.listenTo(this.model, "change:stageModel", function (model, newStageModel) {
            // swap out stage models and listeners
            const prevStageModel = model.previous("stageModel");
            CLMSUI.utils.xilog("STAGE MODEL CHANGED", arguments, this, prevStageModel);
            if (prevStageModel) {
                this.stopListening(prevStageModel); // remove old stagemodel linklist change listener;
            }
            // set xlRepr to null on stage model change as it's now an overview of old data
            // (it gets reset to a correct new value in repopulate() when distancesObj changes - eventlistener above)
            // Plus keeping a value there would mean the listener below using it when a new linklist
            // was generated for the first time (causing error)
            //
            // Sequence starting from NGLUtils.repopulateNGL is
            // 1. New NGLModelWrapper made, proteins-chains matched and aligned, and set via compositeModel.set("stageModel")
            // 2. compositeModel change:stageModel event caught here (this listener function) - xlRepr set to null
            // 3. new NGLModelWrapper.setUpLinks() is called in NGLUtils.repopulateNGL, generating and setting new linklist data
            // 4. new NGLModelWrapper change:linklist event caught here (see below) - but no-op as xlRepr currently null
            // 5. NGLModelWrapper.setUpLinks() also generates a new distanceObj
            // 6. distanceObj change event caught here (see below), causing a new xlRepr to be made via .repopulate()
            if (this.xlRepr) {
                this.xlRepr.dispose(); // remove old mouse handlers or they keep firing and cause errors
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
                })
            ;

            // Copy view state settings to new model
            newStageModel
                .set("allowInterModelDistances", this.options.allowInterModelDistances, {silent: true})    // firing change at this point causes error
                .set("showShortestLinksOnly", this.options.shortestLinksOnly)
            ;

            // First time distancesObj fires we should setup the display for a new data set
            this.listenToOnce(this.model.get("clmsModel"), "change:distancesObj", function () {
                buildAssemblySelector.call(this);
                this
                    .setAssemblyChains()
                    .repopulate();
            });

            // can't save pdb files with 100,000 or more atoms
            d3.select(this.el).select(".savePDBButton").property("disabled", newStageModel.get("structureComp").structure.atomCount > 99999);

            // can't do haddocky stuff if only 1 model
            disableHaddock(newStageModel);
        });

        this.listenTo(CLMSUI.vent, "proteinMetadataUpdated", function () {
            if (this.xlRepr) {
                this.xlRepr.redisplayChainLabels();
            }
        });

        // if the assembly structure has changed the chain sets that can be used in distance calculations, recalc and redraw distances
        this.listenTo(CLMSUI.vent, "PDBPermittedChainSetsUpdated", function () {
            if (this.xlRepr) {
                this.showFiltered().centerView();
            }
        });
    },

    setAssemblyChains: function () {
        this.model.get("clmsModel").get("distancesObj").setAssemblyChains(this.model.get("stageModel").get("structureComp").structure, this.options.defaultAssembly);
        return this;
    },

    reportLinks: function () {
        const fullLinkCount = this.xlRepr.nglModelWrapper.getFullLinkCount();
        const halfLinkCount = this.xlRepr.nglModelWrapper.getHalfLinkCount();
        const currentFilteredLinkCount = this.model.getFilteredCrossLinks().length;
        const missingLinkCount = currentFilteredLinkCount - fullLinkCount - halfLinkCount;
        const commaFormat = d3.format(",");
        const linkText = "Currently showing " + commaFormat(fullLinkCount) + " in full " +
            (halfLinkCount ? "and " + commaFormat(halfLinkCount) + " in part " : "") +
            "of " + commaFormat(currentFilteredLinkCount) + " filtered TT crosslinks" +
            (missingLinkCount ? " (" + commaFormat(missingLinkCount) + " others outside of structure scope)" : "")
        ;
        this.chartDiv.select("div.linkInfo").html(linkText);
        return this;
    },

    repopulate: function () {
        const stageModel = this.model.get("stageModel");
        CLMSUI.utils.xilog("REPOPULATE", this.model, stageModel);
        const sname = stageModel.getStructureName();
        let overText = "PDB File: " + (sname.length === 4 ?
            "<A class='outsideLink' target='_blank' href='https://www.rcsb.org/pdb/explore.do?structureId=" + sname + "'>" + sname + "</A>" : sname) +
            " - " + stageModel.get("structureComp").structure.title;

        const interactors = CLMSUI.modelUtils.filterOutDecoyInteractors(Array.from(this.model.get("clmsModel").get("participants").values()));
        const alignColl = this.model.get("alignColl");
        const pdbLengthsPerProtein = interactors.map(function (inter) {
            const pdbFeatures = alignColl.getAlignmentsAsFeatures(inter.id);
            const contigPDBFeatures = CLMSUI.modelUtils.mergeContiguousFeatures(pdbFeatures);

            const totalLength = d3.sum(contigPDBFeatures, function (d) {
                return d.end - d.begin + 1;
            });
            //console.log ("pppp", inter, pdbFeatures, contigPDBFeatures, totalLength);
            return totalLength;
        }, this);
        const totalPDBLength = d3.sum(pdbLengthsPerProtein);
        const totalProteinLength = CLMSUI.modelUtils.totalProteinLength(interactors);
        const pcent = d3.format(".0%")(totalPDBLength / totalProteinLength);
        const commaFormat = d3.format(",");

        overText += " - covers approx " + commaFormat(totalPDBLength) + " of " + commaFormat(totalProteinLength) + " AAs (" + pcent + ")";
        this.chartDiv.select("div.overlayInfo").html(overText);

        this.xlRepr = new CrosslinkRepresentation(stageModel,
            {
                chainRep: this.options.chainRep,
                defaultAssembly: this.options.defaultAssembly,
                selectedColor: "yellow",
                selectedLinksColor: "yellow",
                sstrucColourScheme: this.colourScheme,
                displayedLabelVisible: this.options.labelVisible,
                showAllProteins: this.options.showAllProteins,
            }
        );

        this.showFiltered();
        return this;
    },

    render: function () {
        if (this.isVisible()) {
            this.showFiltered();
            CLMSUI.utils.xilog("re rendering NGL view");
        }
        return this;
    },

    relayout: function () {
        const stageModel = this.model.get("stageModel");
        if (stageModel) {
            const stage = stageModel.get("structureComp").stage;
            if (stage) {
                stage.handleResize();
            }
        }
        return this;
    },

    takeImage: function (event, thisSVG) {
        return this.downloadImage();
    },

    downloadImage: function () {
        // https://github.com/arose/ngl/issues/33
        const stageModel = this.model.get("stageModel");
        if (stageModel) {
            const stage = stageModel.get("structureComp").stage;
            const self = this;
            const scale = 4;

            stage.makeImage({
                factor: scale, // make it big so it can be used for piccy
                antialias: true,
                trim: true, // https://github.com/arose/ngl/issues/188
                transparent: true
            }).then(function (blob) {
                // All following to take NGL generated canvas blob and add a key to it...
                // make fresh canvas
                if (self.options.exportKey) {
                    const gap = 50;
                    const canvasObj = CLMSUI.utils.makeCanvas(stage.viewer.width * scale, (stage.viewer.height * scale) + gap);

                    // draw blob as image to this canvas
                    const DOMURL = URL || webkitURL || window;
                    const url = DOMURL.createObjectURL(blob);
                    const img = new Image();
                    img.onload = function () {
                        canvasObj.context.drawImage(img, 0, gap);

                        // make key svg and turn it into a blob
                        const tempSVG = self.addKey({
                            addToSelection: d3.select(self.el),
                            addOrigin: self.options.exportTitle
                        });
                        const svgString = new XMLSerializer().serializeToString(tempSVG.node());
                        const keyblob = new Blob([svgString], {type: "image/svg+xml;charset=utf-8"});

                        // add the key blob as an image to canvas
                        const keyurl = DOMURL.createObjectURL(keyblob);
                        const keyimg = new Image();
                        keyimg.onload = function () {
                            canvasObj.context.drawImage(keyimg, 0, 0);

                            // remove / revoke all the intermediate stuff
                            DOMURL.revokeObjectURL(url);
                            DOMURL.revokeObjectURL(keyurl);
                            self.removeKey();

                            // turn canvas to blob and download it as a png file
                            canvasObj.canvas.toBlob(function (newBlob) {
                                if (newBlob) {
                                    CLMSUI.utils.nullCanvasObj(canvasObj);
                                    NGL.download(newBlob, self.filenameStateString() + ".png");
                                }
                            }, 'image/png');
                        };
                        keyimg.src = keyurl;
                    };
                    img.src = url;
                } else {
                    NGL.download(blob, self.filenameStateString() + ".png");
                }
            });
        }
        return this;
    },

    colorChange: function () {
        const val = d3.select(".greyer").property("checked");
        console.log("GREYNESS", val)
        NGL.ColormakerRegistry.removeScheme(this.xlRepr.colorOptions.residueColourScheme);
        // NGL.ColormakerRegistry.removeScheme (this.colorOptions.linkColourScheme);

        const self = this;
        self.xlRepr._initColourSchemes(val);
        if (self.xlRepr) {
            // var value = d3.event.target.value;
            // self.colourScheme = value;
            const structure = self.model.get("stageModel").get("structureComp").structure;
            self.xlRepr.colorOptions.residueSubScheme = NGL.ColormakerRegistry.getScheme({
                scheme: self.colourScheme,//value || "uniform",
                structure: structure
            });
            //console.log ("SUBSCHEME", self.xlRepr.colorOptions.residueSubScheme);

            self.rerenderColourSchemes([
                {
                    nglRep: self.xlRepr.resRepr,
                    colourScheme: self.xlRepr.colorOptions.residueColourScheme,
                    immediateUpdate: false
                },
                // {
                //     nglRep: self.xlRepr.halfLinkResRepr,
                //     colourScheme: self.xlRepr.colorOptions.halfLinkResidueColourScheme,
                //     immediateUpdate: false
                // },
                {nglRep: self.xlRepr.sstrucRepr, colourScheme: self.xlRepr.colorOptions.residueColourScheme},
            ]);
        }
    },

    centerView: function () {
        const stageModel = this.model.get("stageModel");
        if (stageModel) {
            stageModel.get("structureComp").stage.autoView(1000);
        }
        return this;
    },

    savePDB: function () {
        const stageModel = this.model.get("stageModel");
        CLMSUI.NGLExportUtils.exportPDB(
            stageModel.get("structureComp").structure, stageModel, this.pdbFilenameStateString(),
            ["PDB ID: " + stageModel.getStructureName(),
                "Exported by " + this.identifier + " and XiView",
                "Xi Crosslinks in CONECT and LINK records",
                "Search ID: " + CLMSUI.utils.searchesToString(),
                "Filter: " + CLMSUI.utils.filterStateToString()
            ]
        );
        return this;
    },

    exportPymol: function () {
        const stageModel = this.model.get("stageModel");
        CLMSUI.NGLExportUtils.exportPymolCrossLinkSyntax(
            stageModel.get("structureComp").structure, stageModel, this.pdbFilenameStateString(),
            ["PDB ID: " + stageModel.getStructureName(),
                "Exported by " + this.identifier + " and XiView",
                "Search ID: " + CLMSUI.utils.searchesToString(),
                "Filter: " + CLMSUI.utils.filterStateToString()
            ]
        );
        return this;
    },

    export3dLinksCSV: function () {
        const stageModel = this.model.get("stageModel");
        CLMSUI.NGLExportUtils.export3dLinksCSV(
            stageModel.get("structureComp").structure, stageModel, this.pdbFilenameStateString(), false
        );
        return this;
    },

    //todo - unnecessary duplication
    export3dLinksCSVSelected: function () {
        const stageModel = this.model.get("stageModel");
        CLMSUI.NGLExportUtils.export3dLinksCSV(
            stageModel.get("structureComp").structure, stageModel, this.pdbFilenameStateString(), true
        );
        return this;
    },

    exportChimeraPB: function () {
        const stageModel = this.model.get("stageModel");
        CLMSUI.NGLExportUtils.exportChimeraPseudobonds(
            stageModel.get("structureComp").structure, stageModel, this.pdbFilenameStateString(), false
        );
        return this;
    },

    exportJWalk: function () {
        const stageModel = this.model.get("stageModel");
        CLMSUI.NGLExportUtils.exportJWalk(
            stageModel.get("structureComp").structure, stageModel, this.pdbFilenameStateString(), false
        );
        return this;
    },

    exportXlinkAnalyzer: function () {
        const stageModel = this.model.get("stageModel");
        CLMSUI.NGLExportUtils.exportXlinkAnalyzer(
            stageModel.get("structureComp").structure, stageModel, this.pdbFilenameStateString(), false
        );
        return this;
    },

    exportHaddock: function () {
        const stageModel = this.model.get("stageModel");
        CLMSUI.NGLExportUtils.exportHaddockCrossLinkSyntax(
            stageModel.get("structureComp").structure, stageModel, this.pdbFilenameStateString(),
            ["PDB ID: " + stageModel.getStructureName(),
                "Exported by " + this.identifier + " and XiView",
                "Search ID: " + CLMSUI.utils.searchesToString(),
                "Filter: " + CLMSUI.utils.filterStateToString()
            ],
            {
                crossLinkerInfo: this.model.get("clmsModel").get("crosslinkerSpecificity"),
                crossLinks: this.model.get("clmsModel").get("crossLinks")
            }
        );
        return this;
    },

    toggleLabels: function (event) {
        const bool = event.target.checked;
        this.options.labelVisible = bool;
        if (this.xlRepr) {
            this.xlRepr.options.displayedLabelVisible = bool;
            this.xlRepr.linkRepr.setParameters({
                labelVisible: bool
            });
        }
        return this;
    },

    toggleResidues: function (event) {
        const bool = event.target.checked;
        this.options.showResidues = bool;
        if (this.xlRepr) {
            this.xlRepr.resRepr.setVisibility(bool);
            // this.xlRepr.halfLinkResRepr.setVisibility(bool);
        }
        return this;
    },

    toggleNonSelectedLinks: function (event) {
        const bool = event.target.checked;
        this.options.selectedOnly = bool;
        if (this.xlRepr) {
            this.xlRepr.linkRepr.setVisibility(!bool);
        }
        return this;
    },

    toggleShortestLinksOnly: function (event) {
        const bool = event.target.checked;
        this.model.get("stageModel").set("showShortestLinksOnly", bool);
        return this;
    },

    toggleAllowInterModelDistances: function (event) {
        const bool = event.target.checked;
        this.model.get("stageModel").set("allowInterModelDistances", bool);
        return this;
    },

    toggleShowAllProteins: function (event) {
        const bool = event.target.checked;
        this.options.showAllProteins = bool;
        if (this.xlRepr) {
            this.xlRepr.options.showAllProteins = bool;
            this.xlRepr.redisplayProteins();
        }
        return this;
    },

    setChainLabelLength: function () {
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
    },

    setChainLabelFixedSize: function (event) {
        const bool = event.target.checked;
        this.options.fixedLabelSize = bool;
        if (this.xlRepr) {
            this.xlRepr.updateOptions(this.options, ["fixedLabelSize"]);
            this.xlRepr.labelRepr.setParameters({fixedSize: bool, radiusScale: bool ? 1 : 3});
        }
        return this;
    },

    rerenderColourSchemes: function (repSchemePairs) {
        if (this.xlRepr && this.isVisible()) {
            CLMSUI.utils.xilog("rerendering ngl");
            this.xlRepr.rerenderColourSchemes(repSchemePairs);
        }
        return this;
    },

    showHighlightedLinks: function () {
        if (this.xlRepr && this.isVisible()) {
            this.xlRepr.setHighlightedLinks(this.xlRepr.nglModelWrapper.getFullLinks());
            // this.xlRepr.setHighlightedRes (this.xlRepr.nglModelWrapper.getFullLinks());
        }
        return this;
    },

    showSelectedLinks: function () {
        if (this.xlRepr && this.isVisible()) {
            this.xlRepr.setSelectedLinks(this.xlRepr.nglModelWrapper.getFullLinks());
            this.xlRepr.setSelectedRes(this.xlRepr.nglModelWrapper.getHalfLinks());
        }
        return this;
    },

    showFiltered: function () {
        if (this.xlRepr && this.isVisible()) {
            this.model.get("stageModel").setFilteredLinkList();
        }
        return this;
    },

    clearHighlighted: function () {
        if (this.xlRepr && this.isVisible()) {
            // next line eventually fires through an empty selection to showHighlighted above
            this.model.setMarkedCrossLinks("highlights", [], false, false);
            this.model.get("tooltipModel").set("contents", null);
        }
        return this;
    },

    identifier: "NGL Viewer - PDB Structure",

    optionsToString: function () {
        const abbvMap = {
            labelVisible: "LBLSVIS",
            selectedOnly: "SELONLY",
            showResidues: "RES",
            shortestLinksOnly: "SHORTONLY",
            allowInterModelDistances: "INTRMOD"
        };
        const fields = ["rep", "labelVisible", "selectedOnly", "showResidues", "shortestLinksOnly", "allowInterModelDistances"];
        const optionsPlus = $.extend({}, this.options);
        optionsPlus.rep = this.xlRepr.options.chainRep;

        return CLMSUI.utils.objectStateToAbbvString(optionsPlus, fields, d3.set(), abbvMap);
    },

    pdbFilenameStateString: function () {
        const stageModel = this.model.get("stageModel");
        return CLMSUI.utils.makeLegalFileName(stageModel.getStructureName() + "-CrossLinks-" + CLMSUI.utils.searchesToString() + "-" + CLMSUI.utils.filterStateToString());
    },

    // Returns a useful filename given the view and filters current states
    filenameStateString: function () {
        const stageModel = this.model.get("stageModel");
        return CLMSUI.utils.makeLegalFileName(CLMSUI.utils.searchesToString() + "--" + this.identifier + "-" + this.optionsToString() + "-PDB=" + stageModel.getStructureName() + "--" + CLMSUI.utils.filterStateToString());
    },
});

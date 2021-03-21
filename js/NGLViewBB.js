//		Backbone view and controller for NGL 3D viewer
//
//		Martin Graham, Colin Combe, Rappsilber Laboratory, Alex Rose, PDB
//
//		js/NGLViewBB.js

var CLMSUI = CLMSUI || {};

CLMSUI.NGLViewBB = CLMSUI.utils.BaseFrameView.extend({

    events: function () {
        var parentEvents = CLMSUI.utils.BaseFrameView.prototype.events;
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
        var self = this;

        // this.el is the dom element this should be getting added to, replaces targetDiv
        var mainDivSel = d3.select(this.el);

        var flexWrapperPanel = mainDivSel.append("div")
            .attr("class", "verticalFlexContainer");

        var buttonData = [{
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

        var toolbar = flexWrapperPanel.append("div").attr("class", "toolbar toolbarArea");
        CLMSUI.utils.makeBackboneButtons(toolbar, self.el.id, buttonData);

        // Generate Export/Save cross-link data dropdown
        var saveExportButtonData = [{
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
        ];
        saveExportButtonData
            .forEach(function (d) {
                d.type = d.type || "button";
                d.value = d.value || d.label;
            }, this)
        ;
        CLMSUI.utils.makeBackboneButtons(toolbar, self.el.id, saveExportButtonData);

        // ...then moved to a dropdown menu
        var optid = this.el.id + "Exports";
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
        var buildAssemblySelector = function () {
            var stageModel = this.model.get("stageModel");
            var assemblys = stageModel ? d3.keys(stageModel.get("structureComp").structure.biomolDict) : ["BU1", "AU"];
            assemblys.unshift("Default");
            var labelPairs = assemblys.map(function (ass) {
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
        var toggleButtonData = [{
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
        var optid = this.el.id + "Options";
        toolbar.append("p").attr("id", optid);
        new CLMSUI.DropDownMenuViewBB({
            el: "#" + optid,
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
        var allReps = NGL.RepresentationRegistry.names.slice().sort();
        var ignoreReps = ["axes", "base", "contact", "distance", "helixorient", "hyperball", "label", "rocket", "trace", "unitcell", "validation", "angle", "dihedral"];
        var mainReps = _.difference(allReps, ignoreReps);
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
                var acindex = atom.chainIndex;
                if (this.lastChainIndex === acindex) {    // saves recalculating, as colour is per residue
                    return this.lastColour;
                }
                this.lastChainIndex = acindex;

                var proteinID = self.model.get("stageModel").get("reverseChainMap").get(acindex);
                var protein = self.model.get("clmsModel").get("participants").get(proteinID);

                if (protein !== undefined) {
                    var rgb = d3.rgb(self.model.get("proteinColourAssignment").getColour(protein));
                    this.lastColour = (rgb.r << 16) + (rgb.g << 8) + rgb.b;
                } else {
                    this.lastColour = 0xcccccc;
                }
                //console.log ("rid", arindex, this.lastColour);
                return this.lastColour;
            };
            this.filterSensitive = true;
        });

        var allColourSchemes = d3.values(NGL.ColormakerRegistry.getSchemes());
        var ignoreColourSchemes = ["electrostatic", "volume", "geoquality", "moleculetype", "occupancy", "random", "value", "densityfit", "chainid", "randomcoilindex"];
        var aliases = {
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
        var mainColourSchemes = _.difference(allColourSchemes, ignoreColourSchemes);

        var colourChangeFunc = function () {
            if (self.xlRepr) {
                var value = d3.event.target.value;
                self.colourScheme = value;
                var structure = self.model.get("stageModel").get("structureComp").structure;
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
                    },
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
                this.rerenderColourSchemes([this.xlRepr ? {
                    nglRep: this.xlRepr.linkRepr,
                    colourScheme: this.xlRepr.colorOptions.linkColourScheme
                } : {nglRep: null, colourScheme: null}]);
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

        var disableHaddock = function (stageModel) {
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
            var prevStageModel = model.previous("stageModel");
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
        var fullLinkCount = this.xlRepr.nglModelWrapper.getFullLinkCount();
        var halfLinkCount = this.xlRepr.nglModelWrapper.getHalfLinkCount();
        var currentFilteredLinkCount = this.model.getFilteredCrossLinks().length;
        var missingLinkCount = currentFilteredLinkCount - fullLinkCount - halfLinkCount;
        var commaFormat = d3.format(",");
        var linkText = "Currently showing " + commaFormat(fullLinkCount) + " in full " +
            (halfLinkCount ? "and " + commaFormat(halfLinkCount) + " in part " : "") +
            "of " + commaFormat(currentFilteredLinkCount) + " filtered TT crosslinks" +
            (missingLinkCount ? " (" + commaFormat(missingLinkCount) + " others outside of structure scope)" : "")
        ;
        this.chartDiv.select("div.linkInfo").html(linkText);
        return this;
    },

    repopulate: function () {
        var stageModel = this.model.get("stageModel");
        CLMSUI.utils.xilog("REPOPULATE", this.model, stageModel);
        var sname = stageModel.getStructureName();
        var overText = "PDB File: " + (sname.length === 4 ?
            "<A class='outsideLink' target='_blank' href='https://www.rcsb.org/pdb/explore.do?structureId=" + sname + "'>" + sname + "</A>" : sname) +
            " - " + stageModel.get("structureComp").structure.title;

        var interactors = CLMSUI.modelUtils.filterOutDecoyInteractors(Array.from(this.model.get("clmsModel").get("participants").values()));
        var alignColl = this.model.get("alignColl");
        var pdbLengthsPerProtein = interactors.map(function (inter) {
            var pdbFeatures = alignColl.getAlignmentsAsFeatures(inter.id);
            var contigPDBFeatures = CLMSUI.modelUtils.mergeContiguousFeatures(pdbFeatures);

            var totalLength = d3.sum(contigPDBFeatures, function (d) {
                return d.end - d.begin + 1;
            });
            //console.log ("pppp", inter, pdbFeatures, contigPDBFeatures, totalLength);
            return totalLength;
        }, this);
        var totalPDBLength = d3.sum(pdbLengthsPerProtein);
        var totalProteinLength = CLMSUI.modelUtils.totalProteinLength(interactors);
        var pcent = d3.format(".0%")(totalPDBLength / totalProteinLength);
        var commaFormat = d3.format(",");

        overText += " - covers approx " + commaFormat(totalPDBLength) + " of " + commaFormat(totalProteinLength) + " AAs (" + pcent + ")";
        this.chartDiv.select("div.overlayInfo").html(overText);

        this.xlRepr = new CLMSUI.CrosslinkRepresentation(stageModel,
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
        var stageModel = this.model.get("stageModel");
        if (stageModel) {
            var stage = stageModel.get("structureComp").stage;
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
        var stageModel = this.model.get("stageModel");
        if (stageModel) {
            var stage = stageModel.get("structureComp").stage;
            var self = this;
            var scale = 4;

            stage.makeImage({
                factor: scale, // make it big so it can be used for piccy
                antialias: true,
                trim: true, // https://github.com/arose/ngl/issues/188
                transparent: true
            }).then(function (blob) {
                // All following to take NGL generated canvas blob and add a key to it...
                // make fresh canvas
                if (self.options.exportKey) {
                    var gap = 50;
                    var canvasObj = CLMSUI.utils.makeCanvas(stage.viewer.width * scale, (stage.viewer.height * scale) + gap);

                    // draw blob as image to this canvas
                    var DOMURL = URL || webkitURL || window;
                    var url = DOMURL.createObjectURL(blob);
                    var img = new Image();
                    img.onload = function () {
                        canvasObj.context.drawImage(img, 0, gap);

                        // make key svg and turn it into a blob
                        var tempSVG = self.addKey({
                            addToSelection: d3.select(self.el),
                            addOrigin: self.options.exportTitle
                        });
                        var svgString = new XMLSerializer().serializeToString(tempSVG.node());
                        var keyblob = new Blob([svgString], {type: "image/svg+xml;charset=utf-8"});

                        // add the key blob as an image to canvas
                        var keyurl = DOMURL.createObjectURL(keyblob);
                        var keyimg = new Image();
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
        NGL.ColormakerRegistry.removeScheme (this.xlRepr.colorOptions.residueColourScheme);
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
                {nglRep: self.xlRepr.sstrucRepr, colourScheme: self.xlRepr.colorOptions.residueColourScheme},
            ]);
        }
    },

    centerView: function() {
        const stageModel = this.model.get("stageModel");
        if (stageModel) {
            stageModel.get("structureComp").stage.autoView(1000);
        }
        return this;
    },

    savePDB: function () {
        const stageModel = this.model.get("stageModel");
        CLMSUI.NGLUtils.exportPDB (
            stageModel.get("structureComp").structure, stageModel, this.pdbFilenameStateString(),
                ["PDB ID: "+stageModel.getStructureName(),
                "Exported by "+this.identifier+" and XiView",
                 "Xi Crosslinks in CONECT and LINK records",
                 "Search ID: "+CLMSUI.utils.searchesToString(),
                 "Filter: "+CLMSUI.utils.filterStateToString()
                ]
        );
        return this;
    },

    exportPymol: function () {
        const stageModel = this.model.get("stageModel");
        CLMSUI.NGLUtils.exportPymolCrossLinkSyntax (
            stageModel.get("structureComp").structure, stageModel, this.pdbFilenameStateString(),
                ["PDB ID: "+stageModel.getStructureName(),
                "Exported by "+this.identifier+" and XiView",
                 "Search ID: "+CLMSUI.utils.searchesToString(),
                 "Filter: "+CLMSUI.utils.filterStateToString()
                ]
        );
        return this;
    },

    export3dLinksCSV: function () {
        const stageModel = this.model.get("stageModel");
        CLMSUI.NGLUtils.export3dLinksCSV (
            stageModel.get("structureComp").structure, stageModel, this.pdbFilenameStateString(), false
        );
        return this;
    },

    //todo - unnecessary duplication
    export3dLinksCSVSelected: function () {
        const stageModel = this.model.get("stageModel");
        CLMSUI.NGLUtils.export3dLinksCSV (
            stageModel.get("structureComp").structure, stageModel, this.pdbFilenameStateString(), true
        );
        return this;
    },

    exportChimeraPB: function () {
        const stageModel = this.model.get("stageModel");
        CLMSUI.NGLUtils.exportChimeraPseudobonds(
            stageModel.get("structureComp").structure, stageModel, this.pdbFilenameStateString(), false
        );
        return this;
    },

    exportJWalk: function () {
        const stageModel = this.model.get("stageModel");
        CLMSUI.NGLUtils.exportJWalk(
            stageModel.get("structureComp").structure, stageModel, this.pdbFilenameStateString(), false
        );
        return this;
    },

    exportHaddock: function () {
        const stageModel = this.model.get("stageModel");
        CLMSUI.NGLUtils.exportHaddockCrossLinkSyntax (
            stageModel.get("structureComp").structure, stageModel, this.pdbFilenameStateString(),
                ["PDB ID: "+stageModel.getStructureName(),
                "Exported by "+this.identifier+" and XiView",
                 "Search ID: "+CLMSUI.utils.searchesToString(),
                 "Filter: "+CLMSUI.utils.filterStateToString()
                ],
                {crossLinkerInfo: this.model.get("clmsModel").get("crosslinkerSpecificity"), crossLinks: this.model.get("clmsModel").get("crossLinks")}
        );
        return this;
    },

    toggleLabels: function(event) {
        var bool = event.target.checked;
        this.options.labelVisible = bool;
        if (this.xlRepr) {
            this.xlRepr.options.displayedLabelVisible = bool;
            this.xlRepr.linkRepr.setParameters({
                labelVisible: bool
            });
        }
        return this;
    },

    toggleResidues: function(event) {
        var bool = event.target.checked;
        this.options.showResidues = bool;
        if (this.xlRepr) {
            this.xlRepr.resRepr.setVisibility(bool);
        }
        return this;
    },

    toggleNonSelectedLinks: function(event) {
        var bool = event.target.checked;
        this.options.selectedOnly = bool;
        if (this.xlRepr) {
            this.xlRepr.linkRepr.setVisibility(!bool);
        }
        return this;
    },

    toggleShortestLinksOnly: function(event) {
        var bool = event.target.checked;
        this.model.get("stageModel").set("showShortestLinksOnly", bool);
        return this;
    },

    toggleAllowInterModelDistances: function (event) {
        var bool = event.target.checked;
        this.model.get("stageModel").set("allowInterModelDistances", bool);
        return this;
    },

    toggleShowAllProteins: function(event) {
        var bool = event.target.checked;
        this.options.showAllProteins = bool;
        if (this.xlRepr) {
            this.xlRepr.options.showAllProteins = bool;
            this.xlRepr.redisplayProteins();
        }
        return this;
    },

    setChainLabelLength: function() {
        var checkedElem = d3.select(this.el).select("input.chainLabelLengthRB:checked");
        if (!checkedElem.empty()) {
            var value = checkedElem.property("value");
            this.options.chainLabelSetting = value;
            if (this.xlRepr) {
                this.xlRepr.updateOptions (this.options, ["chainLabelSetting"]);
                this.xlRepr.redisplayChainLabels ();
            }
        }
        return this;
    },

    setChainLabelFixedSize: function (event) {
        var bool = event.target.checked;
        this.options.fixedLabelSize = bool;
        if (this.xlRepr) {
            this.xlRepr.updateOptions (this.options, ["fixedLabelSize"]);
            this.xlRepr.labelRepr.setParameters({fixedSize: bool, radiusScale: bool ? 1 : 3});
        }
        return this;
    },

    rerenderColourSchemes: function (repSchemePairs) {
        if (this.xlRepr && this.isVisible()) {
            CLMSUI.utils.xilog("rerendering ngl");
            this.xlRepr.rerenderColourSchemes (repSchemePairs);
        }
        return this;
    },

    showHighlightedLinks: function() {
        if (this.xlRepr && this.isVisible()) {
            this.xlRepr.setHighlightedLinks (this.xlRepr.nglModelWrapper.getFullLinks());
        }
        return this;
    },

    showSelectedLinks: function() {
        if (this.xlRepr && this.isVisible()) {
            this.xlRepr.setSelectedLinks (this.xlRepr.nglModelWrapper.getFullLinks());
        }
        return this;
    },

    showFiltered: function() {
        if (this.xlRepr && this.isVisible()) {
            this.model.get("stageModel").setFilteredLinkList ();
        }
        return this;
    },

    clearHighlighted: function() {
        if (this.xlRepr && this.isVisible()) {
            // next line eventually fires through an empty selection to showHighlighted above
            this.model.setMarkedCrossLinks("highlights", [], false, false);
            this.model.get("tooltipModel").set("contents", null);
        }
        return this;
    },

    identifier: "NGL Viewer - PDB Structure",

    optionsToString: function() {
        var abbvMap = {
            labelVisible: "LBLSVIS",
            selectedOnly: "SELONLY",
            showResidues: "RES",
            shortestLinksOnly: "SHORTONLY",
            allowInterModelDistances: "INTRMOD"
        };
        var fields = ["rep", "labelVisible", "selectedOnly", "showResidues", "shortestLinksOnly", "allowInterModelDistances"];
        var optionsPlus = $.extend({}, this.options);
        optionsPlus.rep = this.xlRepr.options.chainRep;

        return CLMSUI.utils.objectStateToAbbvString(optionsPlus, fields, d3.set(), abbvMap);
    },

    pdbFilenameStateString: function () {
        var stageModel = this.model.get("stageModel");
        return CLMSUI.utils.makeLegalFileName (stageModel.getStructureName() + "-CrossLinks-"+CLMSUI.utils.searchesToString() + "-" + CLMSUI.utils.filterStateToString());
    },

    // Returns a useful filename given the view and filters current states
    filenameStateString: function() {
        var stageModel = this.model.get("stageModel");
        return CLMSUI.utils.makeLegalFileName(CLMSUI.utils.searchesToString() + "--" + this.identifier + "-" + this.optionsToString() + "-PDB=" + stageModel.getStructureName() + "--" + CLMSUI.utils.filterStateToString());
    },
});



CLMSUI.CrosslinkRepresentation = function(newNGLModelWrapper, params) {

    var defaults = {
        sstrucColourScheme: "uniform",
        chainRep: "cartoon",
        displayedLabelColor: "black",
        selectedLabelColor: "black",
        highlightedLabelColor: "black",
        displayedLabelVisible: false,
        selectedLabelVisible: true,
        highlightedLabelVisible: true,
        labelSize: 6.0,
        selectedResiduesColor: params.selectedColor || "lightgreen",
        selectedLinksColor: "lightgreen",
        highlightedLinksColor: params.highlightedColor || "orange",
    };
    this.options = _.extend({}, defaults, params);
    //this.options = p;
    //this.setParameters (p, true);

    this.setup(newNGLModelWrapper);

    this.stage.signals.clicked.add(this._selectionPicking, this);
    this.stage.signals.hovered.add(this._highlightPicking, this);
    this.stage.mouseControls.add('clickPick-left', function(stage, pickingProxy) {
        // so calls that reach here are those left clicks without ctrl
        if (!pickingProxy) { // and if no pickingProxy i.e. nothing was clicked on
            // then blank the current selection
            newNGLModelWrapper.getCompositeModel().setMarkedCrossLinks("selection", [], false, false);
        }
        return false;
    });
};

CLMSUI.CrosslinkRepresentation.prototype = {

    constructor: CLMSUI.CrosslinkRepresentation,

    // just a way of accessing the main modelly bits more succintly
    setup: function(newNGLModelWrapper) {
        this.stage = newNGLModelWrapper.get("structureComp").stage;
        this.chainMap = newNGLModelWrapper.get("chainMap");
        this.structureComp = newNGLModelWrapper.get("structureComp");
        this.nglModelWrapper = newNGLModelWrapper;

        this.colorOptions = {};
        this
            ._initColourSchemes(true)// todo -hack re greyness
            ._initStructureRepr()
            ._initLinkRepr()
            ._initLabelRepr()
            .updateAssemblyType()
        ;
        this.stage.autoView();
    },

    updateAssemblyType: function(assemblyType) {
        this.structureComp.setDefaultAssembly (assemblyType || this.options.defaultAssembly);
        return this;
    },

    replaceChainRepresentation: function(newType) {
        if (this.sstrucRepr) {
            this.structureComp.removeRepresentation(this.sstrucRepr);
        }

        this.options.chainRep = newType;

        var chainSelector = this.makeVisibleChainsSelectionString();

        this.sstrucRepr = this.structureComp.addRepresentation(newType, {
            colorScheme: this.colorOptions.residueColourScheme,
            colorScale: null,
            name: "sstruc",
            opacity: 0.67,
            side: "front",
            sele: chainSelector,
        });

        return this;
    },

    _initStructureRepr: function() {

        var comp = this.structureComp;
        var resSele = this.nglModelWrapper.getSelectionFromResidueList(this.nglModelWrapper.getResidues());
        var resEmphSele = this.nglModelWrapper.getSelectionFromResidueList([]);

        this.replaceChainRepresentation(this.options.chainRep);

        this.resRepr = comp.addRepresentation("spacefill", {
            sele: resSele,
            colorScheme: this.colorOptions.residueColourScheme,
            radiusScale: 0.6,
            name: "res"
        });

        this.resEmphRepr = comp.addRepresentation("spacefill", {
            sele: resEmphSele,
            color: this.options.selectedResiduesColor,
            radiusScale: 0.9,
            opacity: 0.7,
            name: "resEmph"
        });

        return this;
    },

    _initLinkRepr: function() {

        var comp = this.structureComp;
        var links = this.nglModelWrapper.getFullLinks();

        var xlPair = this.nglModelWrapper.getAtomPairsFromLinkList (links);
        var xlPairEmph = this.nglModelWrapper.getAtomPairsFromLinkList (this.filterByLinkState(links, "selection"));
        var xlPairHigh = this.nglModelWrapper.getAtomPairsFromLinkList (this.filterByLinkState(links, "highlights"));
        var baseLinkScale = 3;

        this.linkRepr = comp.addRepresentation("distance", {
            atomPair: xlPair,
            colorScheme: this.colorOptions.linkColourScheme,
            labelSize: this.options.labelSize,
            labelColor: this.options.displayedLabelColor,
            labelVisible: this.options.displayedLabelVisible,
            labelUnit: "angstrom",
            labelZOffset: baseLinkScale * 2 / 3,
            radiusScale: baseLinkScale,
            opacity: 1,
            name: "link",
            side: "front",
            useCylinder: true,
        });

        this.linkEmphRepr = comp.addRepresentation("distance", {
            atomPair: xlPairEmph,
            colorValue: this.options.selectedLinksColor,
            labelSize: this.options.labelSize,
            labelColor: this.options.selectedLabelColor,
            labelVisible: this.options.selectedLabelVisible,
            labelBackground: true,
            labelBackgroundColor: this.options.selectedLinksColor,
            labelBackgroundOpacity: 0.6,
            labelUnit: "angstrom",
            labelZOffset: baseLinkScale * 2 / 3,
            radiusScale: baseLinkScale * 1.5,
            opacity: 0.6,
            name: "linkEmph",
            side: "front",
            useCylinder: true,
        });

        this.linkHighRepr = comp.addRepresentation("distance", {
            atomPair: xlPairHigh,
            colorValue: this.options.highlightedLinksColor,
            labelSize: this.options.labelSize,
            labelColor: this.options.highlightedLabelColor,
            labelVisible: this.options.highlightedLabelVisible,
            labelBackground: true,
            labelBackgroundColor: this.options.highlightedLinksColor,
            labelBackgroundOpacity: 0.6,
            labelUnit: "angstrom",
            labelZOffset: baseLinkScale * 2 / 3,
            radiusScale: baseLinkScale * 1.8,
            opacity: 0.4,
            name: "linkHigh",
            useCylinder: true,
        });

        return this;
    },

    getLabelTexts: function() {
        var comp = this.structureComp;
        var customText = {};
        var self = this;
        var verboseSetting = this.options.chainLabelSetting;

        var chainIndexToProteinMap = d3.map();
        d3.entries(self.nglModelWrapper.get("chainMap")).forEach(function(cmapEntry) {
            cmapEntry.value.forEach(function(chainData) {
                chainIndexToProteinMap.set(chainData.index, cmapEntry.key);
            });
        });
        //console.log ("PIM", chainIndexToProteinMap);
        comp.structure.eachChain(function(chainProxy) {
            var description = chainProxy.entity ? chainProxy.entity.description : "";
            var pid = chainIndexToProteinMap.get(chainProxy.index);
            //console.log ("chain label", chainProxy.index, chainProxy.chainname, chainProxy.residueCount, chainProxy.entity.description, pid);
            if (pid && CLMSUI.NGLUtils.isViableChain(chainProxy)) {
                var protein = self.nglModelWrapper.getCompositeModel().get("clmsModel").get("participants").get(pid);
                var pname = protein ? protein.name : "none";
                customText[chainProxy.atomOffset] = (verboseSetting === "None" ? "" : (pname + ":" + chainProxy.chainname + "(" + chainProxy.index + ")" + (verboseSetting === "Verbose" ? " " + description : "")));
            }
        });

        return customText;
    },

    _initLabelRepr: function() {
        var customText = this.getLabelTexts();

        var atomSelection = this.nglModelWrapper.makeFirstAtomPerChainSelectionString();
        //CLMSUI.utils.xilog ("LABEL SELE", atomSelection);
        this.labelRepr = this.structureComp.addRepresentation("label", {
            radiusScale: 3,
            color: "#222",
            sele: atomSelection,
            labelType: "text",
            labelText: customText,
            showBackground: true,
            backgroundColor: "#ccc",
            backgroundMargin: 1,
            backgroundOpacity: 0.6,
            name: "chainText",
            fontFamily: "sans-serif",
            fontWeight: "bold",
            fixedSize: this.options.fixedLabelSize,
        });

        return this;
    },

    _initColourSchemes: function(greyness) {
        var self = this;

        var linkColourScheme = function() {
            var colCache = {};
            //var first = true;
            this.bondColor = function(b) {
                var linkObj = self.nglModelWrapper.getFullLinkByNGLResIndices (b.atom1.residueIndex, b.atom2.residueIndex) || self.nglModelWrapper.getFullLinkByNGLResIndices (b.atom2.residueIndex, b.atom1.residueIndex);
                if (!linkObj) {
                    return 0x808080;
                }
                var origLinkID = linkObj.origId;
                var model = self.nglModelWrapper.getCompositeModel();
                var link = model.get("clmsModel").get("crossLinks").get(origLinkID);
                var colRGBString = model.get("linkColourAssignment").getColour(link); // returns an 'rgb(r,g,b)' string
                var col24bit = colCache[colRGBString];
                if (col24bit === undefined) {
                    var col3 = d3.rgb(colRGBString);
                    col24bit = colRGBString ? (col3.r << 16) + (col3.g << 8) + col3.b : 255;
                    colCache[colRGBString] = col24bit;
                }
                return col24bit;
            };
        };

        var residueColourScheme = function() {
            this.greyness = 0.2;

            this.atomColor = function(a) {
                 //console.log ("SUBCOL 2", self.colorOptions.residueSubScheme);
                var subScheme = self.colorOptions.residueSubScheme;
                var c = subScheme.atomColor ? subScheme.atomColor (a) : self.colorOptions.residueSubScheme.value;
                if (!greyness || subScheme.dontGrey) {
                    return c;
                }
                var notGrey = 1 - this.greyness;
                var greyComp = 176 * this.greyness;

                var cR = (((c & 0xff0000) >> 16) * notGrey) + greyComp;
                var cG = (((c & 0xff00) >> 8) * notGrey) + greyComp;
                var cB = ((c & 0xff) * notGrey) + greyComp;

                return (cR << 16 | cG << 8 | cB);
            };
        };

        var structure = this.structureComp.structure;
        this.colorOptions.residueSubScheme = NGL.ColormakerRegistry.getScheme ({scheme: this.options.sstrucColourScheme, structure: structure});
        this.colorOptions.residueColourScheme = NGL.ColormakerRegistry.addScheme(residueColourScheme, "custom");
        this.colorOptions.linkColourScheme = NGL.ColormakerRegistry.addScheme(linkColourScheme, "xlink");

        return this;
    },

    rerenderColourSchemes: function (repSchemePairs) {
        repSchemePairs.forEach (function (repSchemePair) {
            // using update dodges setParameters not firing a redraw if param is the same (i.e. a colour entry has changed in the existing scheme)
            //console.log ("lssss", this.xlRepr.colorOptions.linkColourScheme);
            var nglRep = repSchemePair.nglRep;
            nglRep.update ({color: repSchemePair.colourScheme});
            if (repSchemePair.immediateUpdate !== false) {
                nglRep.repr.viewer.requestRender();
            }
        });
    },

    _highlightPicking: function(pickingData) {
        this._handlePicking(pickingData, "highlights", true);
    },

    _selectionPicking: function(pickingData) {
        this._handlePicking(pickingData, "selection");
    },

    makeTooltipCoords: function(nglMouseCoord) {
        var canv = $("#nglPanel canvas");
        var coff = canv.offset();
        return {
            pageX: coff.left + nglMouseCoord.x,
            pageY: coff.top + (canv.height() - nglMouseCoord.y)
        }; // y is inverted in canvas
    },

    _handlePicking: function(pickingData, pickType, doEmpty) {
        var nglModelWrapper = this.nglModelWrapper;
        //CLMSUI.utils.xilog ("Picking Data", pickingData);
        var pdtrans = {
            residue: undefined,
            links: undefined,
            xlinks: undefined
        };
        var add = (false || (pickingData && (pickingData.ctrlKey || pickingData.shiftKey))) && (pickType === 'selection'); // should selection add to current selection?

        /*
        console.log("pickingData", pickingData, pickType, add);
        ["atom", "bond", "distance"].forEach (function (v) {
            if (pickingData && pickingData[v]) {
                console.log (v, pickingData[v].index);
            }
        });
        */

        if (pickingData) {
            var atom = pickingData.atom;
            var link3d = pickingData.distance; // pickingData.distance is now where picks are returned for crosslinks

            if (atom !== undefined && link3d === undefined) {
                //console.log (atom.atomname);
                CLMSUI.utils.xilog("picked atom", atom, atom.residueIndex, atom.resno, atom.chainIndex);
                var residue = nglModelWrapper.getResidueByNGLGlobalIndex (atom.residueIndex);
                if (residue) {
                    // this is to find the index of the residue in searchindex (crosslink) terms
                    // thought I could rely on residue.seqIndex + chain.residueOffset but nooooo.....
                    var proteinId = nglModelWrapper.get("reverseChainMap").get(residue.chainIndex);
                    var alignId = CLMSUI.NGLUtils.make3DAlignID (nglModelWrapper.getStructureName(), atom.chainname, atom.chainIndex);
                    // align from 3d to search index. seqIndex is 0-indexed so +1 before querying
                    //CLMSUI.utils.xilog ("alignid", alignId, proteinId);
                    var srindex = nglModelWrapper.getCompositeModel().get("alignColl").getAlignedIndex(residue.seqIndex + 1, proteinId, true, alignId);

                    pdtrans.links = nglModelWrapper.getFullLinksByResidueID (residue.residueId);
                    var origFullLinks = nglModelWrapper.getOriginalCrossLinks (pdtrans.links);
                    var halfLinks = nglModelWrapper.getHalfLinksByResidueID (residue.residueId);
                    var origHalfLinks = nglModelWrapper.getOriginalCrossLinks (halfLinks);
                    var distances = origFullLinks.map (function (xlink) { return xlink.getMeta("distance"); });

                    pdtrans.xlinks = origFullLinks.concat (origHalfLinks);

                    var cp = this.structureComp.structure.getChainProxy (residue.chainIndex);
                    var protein = nglModelWrapper.getCompositeModel().get("clmsModel").get("participants").get(proteinId);
                    //console.log ("cp", cp, pdtrans, this, this.structureComp);
                    nglModelWrapper.getCompositeModel().get("tooltipModel")
                        .set("header", "Cross-Linked with " + CLMSUI.modelUtils.makeTooltipTitle.residue(protein, srindex, ":" + cp.chainname+"/"+cp.modelIndex))
                        .set("contents", CLMSUI.modelUtils.makeTooltipContents.multilinks(pdtrans.xlinks, protein.id, srindex, {"Distance": distances}))
                        .set("location", this.makeTooltipCoords(pickingData.canvasPosition))
                    ;
                }
            } else if (link3d !== undefined) {
                // atomIndex / resno’s output here are wrong, usually sequential (indices) or the same (resno’s)
                CLMSUI.utils.xilog("picked bond", link3d, link3d.index, link3d.atom1.resno, link3d.atom2.resno, link3d.atomIndex1, link3d.atomIndex2);

                var residueA = nglModelWrapper.getResidueByNGLGlobalIndex (link3d.atom1.residueIndex);
                var residueB = nglModelWrapper.getResidueByNGLGlobalIndex (link3d.atom2.residueIndex);
                CLMSUI.utils.xilog("res", link3d.atom1.residueIndex, link3d.atom2.residueIndex);
                if (pickType === "selection") {
                    var selectionSelection = this.nglModelWrapper.getSelectionFromResidueList([residueA, residueB]);
                    CLMSUI.utils.xilog("seleSele", selectionSelection);
                    this.structureComp.autoView(selectionSelection, 1000);
                }

                if (residueA && residueB) {
                    pdtrans.links = nglModelWrapper.getSharedLinks(residueA, residueB);

                    if (pdtrans.links) {
                        pdtrans.xlinks = nglModelWrapper.getOriginalCrossLinks(pdtrans.links);

                        nglModelWrapper.getCompositeModel().get("tooltipModel")
                            .set("header", CLMSUI.modelUtils.makeTooltipTitle.link())
                            .set("contents", CLMSUI.modelUtils.makeTooltipContents.link(pdtrans.xlinks[0]))
                            .set("location", this.makeTooltipCoords(pickingData.canvasPosition))
                        ;
                    }
                }
            }
        }

        if (!pdtrans.links && doEmpty) {
            pdtrans.xlinks = [];
            nglModelWrapper.getCompositeModel().get("tooltipModel").set("contents", null); // Clear tooltip
        }
        //CLMSUI.utils.xilog ("pd and pdtrans", pickingData, pdtrans.xlinks);

        nglModelWrapper.getCompositeModel().setMarkedCrossLinks(pickType, pdtrans.xlinks, false, add);
    },

    // fired when setLinkList called on representation's associated nglModelWrapper object
    _handleDataChange: function() {
        CLMSUI.utils.xilog("HANDLE DATA CHANGE 3D");
        this.redisplayProteins();

        var links = this.nglModelWrapper.getFullLinks();
        this
            .setDisplayedResidues(this.nglModelWrapper.getResidues())
            .setSelectedResidues([])
            .setDisplayedLinks(links)
            .setSelectedLinks(links)
        ;

        var subScheme = this.colorOptions.residueSubScheme || {};
        if (subScheme.filterSensitive) {
            console.log ("recolour structure");
            this.rerenderColourSchemes ([
                {nglRep: this.sstrucRepr, colourScheme: this.colorOptions.residueColourScheme, immediateUpdate: false},
                {nglRep: this.resRepr, colourScheme: this.colorOptions.residueColourScheme, immediateUpdate: false},
            ]);
        }

    },

    makeVisibleChainsSelectionString: function (precalcedShowableChains) {  // precalced - if we already know which chains to show, so don't calculate twice
        var showableChains = precalcedShowableChains || this.nglModelWrapper.getShowableChains(this.options.showAllProteins);
        var chainSele = this.nglModelWrapper.makeChainSelectionString (showableChains);
        CLMSUI.utils.xilog("showable chains", showableChains, chainSele);
        return chainSele;
    },

    redisplayProteins: function () {
        var showableChains = this.nglModelWrapper.getShowableChains(this.options.showAllProteins);
        var chainSele = this.makeVisibleChainsSelectionString (showableChains);
        CLMSUI.utils.xilog("showable chains", showableChains, chainSele);
        this.sstrucRepr.setSelection(chainSele);
        if (this.labelRepr) {
            var labelSele = this.nglModelWrapper.makeFirstAtomPerChainSelectionString(d3.set(showableChains.chainIndices));
            //CLMSUI.utils.xilog ("LABEL SELE", labelSele);
            this.labelRepr.setSelection(labelSele);
        }
        return this;
    },

    redisplayChainLabels: function() {
        this.labelRepr.setParameters({
            labelText: this.getLabelTexts()
        });
        return this;
    },


    // Populate NGL representations with residues

    // Repopulate a residue representation with a set of residues
    setResidues: function(residues, residueRepr) {
        var availableResidues = this.nglModelWrapper.getAvailableResidues(residues);
        residueRepr.setSelection (
            this.nglModelWrapper.getSelectionFromResidueList(availableResidues)
        );
        return this;
    },

    // Shortcut functions for setting representations for currently filtered and selected residues
    setDisplayedResidues: function(residues) {
        var a = performance.now();
        this.setResidues(residues, this.resRepr);
        CLMSUI.utils.xilog("set displayed residues, time", performance.now() - a);
        return this;
    },

    setSelectedResidues: function(residues) {
        this.setResidues(residues, this.resEmphRepr);
        CLMSUI.utils.xilog("set selected residues");
        return this;
    },


    // Populate NGL distance representations with crosslinks

    // Filter a link array by a link marking state e.g. highlighted / selected / none
    filterByLinkState: function(links, linkState) {
        if (linkState === undefined) {  // return every current link if no linkState defined
            return links;
        }
        var selectedSet = d3.set(_.pluck(this.nglModelWrapper.getCompositeModel().getMarkedCrossLinks(linkState), "id"));
        return links.filter (function(l) {
            return selectedSet.has(l.origId);
        });
    },

    // Filter a link array by a link state and then set the atoms at each link end as pairs for a given distance representation
    setLinkRep: function(links, aLinkRepr, linkState) {
        var availableLinks = this.nglModelWrapper.getAvailableLinks (this.filterByLinkState(links, linkState));
        var availableAtomPairs = this.nglModelWrapper.getAtomPairsFromLinkList(availableLinks);
        aLinkRepr.setParameters ({atomPair: availableAtomPairs});
        return this;
    },

    // Shortcut functions for setting the distance representations for all / selected / highlighted links
    setDisplayedLinks: function(links) {
        return this.setLinkRep (links, this.linkRepr, undefined);
    },

    setSelectedLinks: function(links) {
        return this.setLinkRep (links, this.linkEmphRepr, "selection");
    },

    setHighlightedLinks: function(links) {
        return this.setLinkRep (links, this.linkHighRepr, "highlights");
    },

    // Miscellaneous
    dispose: function() {
        this.stage.signals.clicked.remove(this._selectionPicking, this);
        this.stage.signals.hovered.remove(this._highlightPicking, this);
        this.stage.mouseControls.remove ('clickPick-left'); // added 14/01/2020 MJG to stop crosslinkrep object lingering in memory via mouseControl-NGL persistence
        // console.log ("dispose called");
        // this.stage.removeAllComponents(); // calls dispose on each component, which calls dispose on each representation

        // Remove NGL Registered Colour Schemes - 14/01/2020 - MJG
        // The colour schemes contain references to the CrosslinkRepresentation object that set it up, so unless we do this, the CrosslinkRepresentations
        // keep hanging around in memory.
        NGL.ColormakerRegistry.removeScheme (this.colorOptions.residueColourScheme);
        NGL.ColormakerRegistry.removeScheme (this.colorOptions.linkColourScheme);

        this.structureComp.structure.spatialHash = null;
        this.structureComp.structure.bondHash = null;
        this.structureComp.viewer.dispose();

        return this;
    },

    updateOptions: function(options, changeThese) {
        changeThese.forEach(function(changeThis) {
            this.options[changeThis] = options[changeThis];
        }, this);
        return this;
    }
};

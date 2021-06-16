class CrosslinkRepresentation {

    constructor(newNGLModelWrapper, params) {


        const defaults = {
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
        this.stage.mouseControls.add('clickPick-left', function (stage, pickingProxy) {
            // so calls that reach here are those left clicks without ctrl
            if (!pickingProxy) { // and if no pickingProxy i.e. nothing was clicked on
                // then blank the current selection
                newNGLModelWrapper.getCompositeModel().setMarkedCrossLinks("selection", [], false, false);
            }
            return false;
        });
    }

    // just a way of accessing the main modelly bits more succintly
    setup (newNGLModelWrapper) {
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
    }

    updateAssemblyType (assemblyType) {
        this.structureComp.setDefaultAssembly(assemblyType || this.options.defaultAssembly);
        return this;
    }

    replaceChainRepresentation (newType) {
        if (this.sstrucRepr) {
            this.structureComp.removeRepresentation(this.sstrucRepr);
        }

        this.options.chainRep = newType;

        const chainSelector = this.makeVisibleChainsSelectionString();

        this.sstrucRepr = this.structureComp.addRepresentation(newType, {
            colorScheme: this.colorOptions.residueColourScheme,
            colorScale: null,
            name: "sstruc",
            opacity: 0.67,
            side: "front",
            sele: chainSelector,
        });

        return this;
    }

    _initStructureRepr () {

        const comp = this.structureComp;
        const resSele = this.nglModelWrapper.getSelectionFromResidueList(this.nglModelWrapper.getResidues());
        const halfLinkResSele = this.nglModelWrapper.getSelectionFromResidueList(this.nglModelWrapper.getHalfLinkResidues());

        this.replaceChainRepresentation(this.options.chainRep);

        this.resRepr = comp.addRepresentation("spacefill", {
            sele: resSele,
            colorScheme: this.colorOptions.residueColourScheme,
            radiusScale: 0.6,
            name: "res"
        });

        // this.halfLinkResRepr = comp.addRepresentation("spacefill", {
        //     sele: halfLinkResSele,
        //     color: this.colorOptions.halfLinkResidueColourScheme,
        //     radiusScale: 0.9,
        //     name: "halfLinkRes"
        // });
        //
        // this.halfLinkResEmphRepr = comp.addRepresentation("spacefill", {
        //     sele: halfLinkResSele,
        //     color: this.options.selectedLinksColor,
        //     radiusScale: 1,
        //     opacity: 0.7,
        //     name: "halfLinkResEmph"
        // });

        // this.halfLinkResHighRepr = comp.addRepresentation("spacefill", {
        //     sele: halfLinkResSele,
        //     color:  this.options.highlightedLinksColor,
        //     radiusScale: 1,
        //     opacity: 0.7,
        //     name: "halfLinkResHigh"
        // });

        return this;
    }

    _initLinkRepr () {

        const comp = this.structureComp;
        const links = this.nglModelWrapper.getFullLinks();

        const xlPair = this.nglModelWrapper.getAtomPairsFromLinkList(links);
        const xlPairEmph = this.nglModelWrapper.getAtomPairsFromLinkList(this.filterByLinkState(links, "selection"));
        const xlPairHigh = this.nglModelWrapper.getAtomPairsFromLinkList(this.filterByLinkState(links, "highlights"));
        const baseLinkScale = 3;

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
    }

    getLabelTexts () {
        const comp = this.structureComp;
        const customText = {};
        const self = this;
        const verboseSetting = this.options.chainLabelSetting;

        const chainIndexToProteinMap = d3.map();
        d3.entries(self.nglModelWrapper.get("chainMap")).forEach(function (cmapEntry) {
            cmapEntry.value.forEach(function (chainData) {
                chainIndexToProteinMap.set(chainData.index, cmapEntry.key);
            });
        });
        //console.log ("PIM", chainIndexToProteinMap);
        comp.structure.eachChain(function (chainProxy) {
            const description = chainProxy.entity ? chainProxy.entity.description : "";
            const pid = chainIndexToProteinMap.get(chainProxy.index);
            //console.log ("chain label", chainProxy.index, chainProxy.chainname, chainProxy.residueCount, chainProxy.entity.description, pid);
            if (pid && CLMSUI.NGLUtils.isViableChain(chainProxy)) {
                const protein = self.nglModelWrapper.getCompositeModel().get("clmsModel").get("participants").get(pid);
                const pname = protein ? protein.name : "none";
                customText[chainProxy.atomOffset] = (verboseSetting === "None" ? "" : (pname + ":" + chainProxy.chainname + "(" + chainProxy.index + ")" + (verboseSetting === "Verbose" ? " " + description : "")));
            }
        });

        return customText;
    }

    _initLabelRepr () {
        const customText = this.getLabelTexts();

        const atomSelection = this.nglModelWrapper.makeFirstAtomPerChainSelectionString();
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
    }

    _initColourSchemes (greyness) {
        const self = this;

        const linkColourScheme = function () {
            const colCache = {};
            //var first = true;
            this.bondColor = function (b) {
                const linkObj = self.nglModelWrapper.getFullLinkByNGLResIndices(b.atom1.residueIndex, b.atom2.residueIndex) || self.nglModelWrapper.getFullLinkByNGLResIndices(b.atom2.residueIndex, b.atom1.residueIndex);
                if (!linkObj) {
                    return 0x808080;
                }
                const origLinkID = linkObj.origId;
                const model = self.nglModelWrapper.getCompositeModel();
                const link = model.get("clmsModel").get("crosslinks").get(origLinkID);
                const colRGBString = model.get("linkColourAssignment").getColour(link); // returns an 'rgb(r,g,b)' string
                let col24bit = colCache[colRGBString];
                if (col24bit === undefined) {
                    const col3 = d3.rgb(colRGBString);
                    col24bit = colRGBString ? (col3.r << 16) + (col3.g << 8) + col3.b : 255;
                    colCache[colRGBString] = col24bit;
                }
                return col24bit;
            };
        };

        const residueColourScheme = function () {
            this.greyness = 0.2;

            this.atomColor = function (a) {
                //console.log ("SUBCOL 2", self.colorOptions.residueSubScheme);
                const subScheme = self.colorOptions.residueSubScheme;
                const c = subScheme.atomColor ? subScheme.atomColor(a) : self.colorOptions.residueSubScheme.value;
                if (!greyness || subScheme.dontGrey) {
                    return c;
                }
                const notGrey = 1 - this.greyness;
                const greyComp = 176 * this.greyness;

                const cR = (((c & 0xff0000) >> 16) * notGrey) + greyComp;
                const cG = (((c & 0xff00) >> 8) * notGrey) + greyComp;
                const cB = ((c & 0xff) * notGrey) + greyComp;

                return (cR << 16 | cG << 8 | cB);
            };
        };

        const halfLinkResidueColourScheme = function () {
            const colCache = {};

            this.atomColor = function (a) {
                const linkObj = self.nglModelWrapper.getHalfLinkByNGLResIndex(a.residueIndex);
                if (!linkObj) {
                    return 0x808080;
                }
                const origLinkID = linkObj.origId;
                const model = self.nglModelWrapper.getCompositeModel();
                const link = model.get("clmsModel").get("crosslinks").get(origLinkID);
                const colRGBString = model.get("linkColourAssignment").getColour(link); // returns an 'rgb(r,g,b)' string
                let col24bit = colCache[colRGBString];
                if (col24bit === undefined) {
                    const col3 = d3.rgb(colRGBString);
                    col24bit = colRGBString ? (col3.r << 16) + (col3.g << 8) + col3.b : 255;
                    colCache[colRGBString] = col24bit;
                }
                return col24bit;
            };
        };

        const structure = this.structureComp.structure;
        this.colorOptions.residueSubScheme = NGL.ColormakerRegistry.getScheme({
            scheme: this.options.sstrucColourScheme,
            structure: structure
        });
        this.colorOptions.residueColourScheme = NGL.ColormakerRegistry.addScheme(residueColourScheme, "custom");
        this.colorOptions.halfLinkResidueColourScheme = NGL.ColormakerRegistry.addScheme(halfLinkResidueColourScheme, "custom");
        this.colorOptions.linkColourScheme = NGL.ColormakerRegistry.addScheme(linkColourScheme, "xlink");

        return this;
    }

    rerenderColourSchemes (repSchemePairs) {
        repSchemePairs.forEach(function (repSchemePair) {
            // using update dodges setParameters not firing a redraw if param is the same (i.e. a colour entry has changed in the existing scheme)
            //console.log ("lssss", this.xlRepr.colorOptions.linkColourScheme);
            const nglRep = repSchemePair.nglRep;
            nglRep.update({color: repSchemePair.colourScheme});
            if (repSchemePair.immediateUpdate !== false) {
                nglRep.repr.viewer.requestRender();
            }
        });
    }

    _highlightPicking (pickingData) {
        this._handlePicking(pickingData, "highlights", true);
    }

    _selectionPicking (pickingData) {
        this._handlePicking(pickingData, "selection");
    }

    makeTooltipCoords (nglMouseCoord) {
        const canv = $("#nglPanel canvas");
        const coff = canv.offset();
        return {
            pageX: coff.left + nglMouseCoord.x,
            pageY: coff.top + (canv.height() - nglMouseCoord.y)
        }; // y is inverted in canvas
    }

    _handlePicking (pickingData, pickType, doEmpty) {
        const nglModelWrapper = this.nglModelWrapper;
        //CLMSUI.utils.xilog ("Picking Data", pickingData);
        const pdtrans = {
            residue: undefined,
            links: undefined,
            xlinks: undefined
        };
        const add = ((pickingData && (pickingData.ctrlKey || pickingData.shiftKey))) && (pickType === 'selection'); // should selection add to current selection?

        /*
        console.log("pickingData", pickingData, pickType, add);
        ["atom", "bond", "distance"].forEach (function (v) {
            if (pickingData && pickingData[v]) {
                console.log (v, pickingData[v].index);
            }
        });
        */

        if (pickingData) {
            const atom = pickingData.atom;
            const link3d = pickingData.distance; // pickingData.distance is now where picks are returned for crosslinks

            if (atom !== undefined && link3d === undefined) {
                //console.log (atom.atomname);
                CLMSUI.utils.xilog("picked atom", atom, atom.residueIndex, atom.resno, atom.chainIndex);
                const residue = nglModelWrapper.getResidueByNGLGlobalIndex(atom.residueIndex);
                if (residue) {
                    // this is to find the index of the residue in searchindex (crosslink) terms
                    // thought I could rely on residue.seqIndex + chain.residueOffset but nooooo.....
                    const proteinId = nglModelWrapper.get("reverseChainMap").get(residue.chainIndex);
                    const alignId = CLMSUI.NGLUtils.make3DAlignID(nglModelWrapper.getStructureName(), atom.chainname, atom.chainIndex);
                    // align from 3d to search index. seqIndex is 0-indexed so +1 before querying
                    //CLMSUI.utils.xilog ("alignid", alignId, proteinId);
                    const srindex = nglModelWrapper.getCompositeModel().get("alignColl").getAlignedIndex(residue.seqIndex + 1, proteinId, true, alignId);

                    pdtrans.links = nglModelWrapper.getFullLinksByResidueID(residue.residueId);
                    const origFullLinks = nglModelWrapper.getOriginalCrossLinks(pdtrans.links);
                    const halfLinks = nglModelWrapper.getHalfLinksByResidueID(residue.residueId);
                    const origHalfLinks = nglModelWrapper.getOriginalCrossLinks(halfLinks);
                    const distances = origFullLinks.map(function (xlink) {
                        return xlink.getMeta("distance");
                    });

                    pdtrans.xlinks = origFullLinks.concat(origHalfLinks);

                    const cp = this.structureComp.structure.getChainProxy(residue.chainIndex);
                    const protein = nglModelWrapper.getCompositeModel().get("clmsModel").get("participants").get(proteinId);
                    //console.log ("cp", cp, pdtrans, this, this.structureComp);
                    nglModelWrapper.getCompositeModel().get("tooltipModel")
                        .set("header", "Cross-Linked with " + CLMSUI.modelUtils.makeTooltipTitle.residue(protein, srindex, ":" + cp.chainname + "/" + cp.modelIndex))
                        .set("contents", CLMSUI.modelUtils.makeTooltipContents.multilinks(pdtrans.xlinks, protein.id, srindex, {"Distance": distances}))
                        .set("location", this.makeTooltipCoords(pickingData.canvasPosition))
                    ;
                }
            } else if (link3d !== undefined) {
                // atomIndex / resno’s output here are wrong, usually sequential (indices) or the same (resno’s)
                CLMSUI.utils.xilog("picked bond", link3d, link3d.index, link3d.atom1.resno, link3d.atom2.resno, link3d.atomIndex1, link3d.atomIndex2);

                const residueA = nglModelWrapper.getResidueByNGLGlobalIndex(link3d.atom1.residueIndex);
                const residueB = nglModelWrapper.getResidueByNGLGlobalIndex(link3d.atom2.residueIndex);
                CLMSUI.utils.xilog("res", link3d.atom1.residueIndex, link3d.atom2.residueIndex);
                if (pickType === "selection") {
                    const selectionSelection = this.nglModelWrapper.getSelectionFromResidueList([residueA, residueB]);
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
    }

    // fired when setLinkList called on representation's associated nglModelWrapper object
    _handleDataChange () {
        CLMSUI.utils.xilog("HANDLE DATA CHANGE 3D");
        this.redisplayProteins();

        const links = this.nglModelWrapper.getFullLinks();
        this
            .setDisplayedResidues(this.nglModelWrapper.getResidues(), this.nglModelWrapper.getHalfLinkResidues())
            // .setSelectedRes(this.nglModelWrapper.getHalfLinks())
            .setDisplayedLinks(links)
            .setSelectedLinks(links)
        ;

        const subScheme = this.colorOptions.residueSubScheme || {};
        if (subScheme.filterSensitive) {
            console.log("recolour structure");
            this.rerenderColourSchemes([
                {nglRep: this.sstrucRepr, colourScheme: this.colorOptions.residueColourScheme, immediateUpdate: false},
                {nglRep: this.resRepr, colourScheme: this.colorOptions.residueColourScheme, immediateUpdate: false},
                // {nglRep: this.halfLinkResRepr, colourScheme: this.colorOptions.halfLinkResidueColourScheme, immediateUpdate: false},
            ]);
        }

    }

    makeVisibleChainsSelectionString (precalcedShowableChains) {  // precalced - if we already know which chains to show, so don't calculate twice
        const showableChains = precalcedShowableChains || this.nglModelWrapper.getShowableChains(this.options.showAllProteins);
        const chainSele = this.nglModelWrapper.makeChainSelectionString(showableChains);
        CLMSUI.utils.xilog("showable chains", showableChains, chainSele);
        return chainSele;
    }

    redisplayProteins () {
        const showableChains = this.nglModelWrapper.getShowableChains(this.options.showAllProteins);
        const chainSele = this.makeVisibleChainsSelectionString(showableChains);
        CLMSUI.utils.xilog("showable chains", showableChains, chainSele);
        this.sstrucRepr.setSelection(chainSele);
        if (this.labelRepr) {
            const labelSele = this.nglModelWrapper.makeFirstAtomPerChainSelectionString(d3.set(showableChains.chainIndices));
            //CLMSUI.utils.xilog ("LABEL SELE", labelSele);
            this.labelRepr.setSelection(labelSele);
        }
        return this;
    }

    redisplayChainLabels () {
        this.labelRepr.setParameters({
            labelText: this.getLabelTexts()
        });
        return this;
    }

    // Populate NGL representations with residues

    // Repopulate a residue representation with a set of residues
    setResidues (residues, residueRepr) {
        const availableResidues = this.nglModelWrapper.getAvailableResidues(residues);
        residueRepr.setSelection(
            this.nglModelWrapper.getSelectionFromResidueList(availableResidues)
        );
        return this;
    }

    // Shortcut functions for setting representations for currently filtered and selected residues
    setDisplayedResidues (residues, halfLinkResidues) {
        const a = performance.now();
        this.setResidues(residues, this.resRepr);
        // this.setResidues(halfLinkResidues, this.halfLinkResRepr);
        CLMSUI.utils.xilog("set displayed residues, time", performance.now() - a);
        return this;
    }

    setSelectedResidues (residues) {
        this.setResidues(residues, this.halfLinkResEmphRepr);
        CLMSUI.utils.xilog("set selected residues");
        return this;
    }

    setSelectedRes (halfLinks) {
        // const filteredHalfLinks = this.filterByLinkState(halfLinks, "selection")
        // return this.setSelectedResidues(this.nglModelWrapper.getHalfLinkResidues(filteredHalfLinks));
        return this;
    }

    // Populate NGL distance representations with crosslinks

    // Filter a link array by a link marking state e.g. highlighted / selected / none
    filterByLinkState (links, linkState) {
        if (linkState === undefined) {  // return every current link if no linkState defined
            return links;
        }
        const selectedSet = d3.set(_.pluck(this.nglModelWrapper.getCompositeModel().getMarkedCrossLinks(linkState), "id"));
        return links.filter(function (l) {
            return selectedSet.has(l.origId);
        });
    }

    // Filter a link array by a link state and then set the atoms at each link end as pairs for a given distance representation
    setLinkRep (links, aLinkRepr, linkState) {
        const availableLinks = this.nglModelWrapper.getAvailableLinks(this.filterByLinkState(links, linkState));
        const availableAtomPairs = this.nglModelWrapper.getAtomPairsFromLinkList(availableLinks);
        aLinkRepr.setParameters({atomPair: availableAtomPairs});
        return this;
    }

    // Shortcut functions for setting the distance representations for all / selected / highlighted links
    setDisplayedLinks (links) {
        return this.setLinkRep(links, this.linkRepr, undefined);
    }

    setSelectedLinks (links) {
        return this.setLinkRep(links, this.linkEmphRepr, "selection");
    }

    setHighlightedLinks (links) {
        return this.setLinkRep(links, this.linkHighRepr, "highlights");
    }

    // Miscellaneous
    dispose () {
        this.stage.signals.clicked.remove(this._selectionPicking, this);
        this.stage.signals.hovered.remove(this._highlightPicking, this);
        this.stage.mouseControls.remove('clickPick-left'); // added 14/01/2020 MJG to stop crosslinkrep object lingering in memory via mouseControl-NGL persistence
        // console.log ("dispose called");
        // this.stage.removeAllComponents(); // calls dispose on each component, which calls dispose on each representation

        // Remove NGL Registered Colour Schemes - 14/01/2020 - MJG
        // The colour schemes contain references to the CrosslinkRepresentation object that set it up, so unless we do this, the CrosslinkRepresentations
        // keep hanging around in memory.
        NGL.ColormakerRegistry.removeScheme(this.colorOptions.residueColourScheme);
        NGL.ColormakerRegistry.removeScheme(this.colorOptions.halfLinkResidueColourScheme);
        NGL.ColormakerRegistry.removeScheme(this.colorOptions.linkColourScheme);

        this.structureComp.structure.spatialHash = null;
        this.structureComp.structure.bondHash = null;
        this.structureComp.viewer.dispose();

        return this;
    }

    updateOptions (options, changeThese) {
        changeThese.forEach(function (changeThis) {
            this.options[changeThis] = options[changeThis];
        }, this);
        return this;
    }
}

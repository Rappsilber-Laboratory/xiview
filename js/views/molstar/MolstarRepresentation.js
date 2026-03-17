/**
 * @fileoverview Crosslink representation manager for Molstar 3D viewer.
 * Replaces CrosslinkRepresentation (crosslink-representation.js).
 * Creates cartoon polymer representations and crosslink cylinder shapes.
 * Handles click/hover picking to select/highlight crosslinks.
 */

import * as _ from "underscore";
import $ from "jquery";
import d3 from "d3";
import { OrderedSet } from "molstar/lib/mol-data/int";
import { PluginStateObject as SO, PluginStateTransform } from "molstar/lib/mol-plugin-state/objects";
import { StateTransforms } from "molstar/lib/mol-plugin-state/transforms";
import { StateTransformer } from "molstar/lib/mol-state";
import { Task } from "molstar/lib/mol-task";
import { ParamDefinition as PD } from "molstar/lib/mol-util/param-definition";
import { ShapeGroup } from "molstar/lib/mol-model/shape";
import { StructureElement } from "molstar/lib/mol-model/structure";
import { Loci } from "molstar/lib/mol-model/loci";
import { Cylinders } from "molstar/lib/mol-geo/geometry/cylinders/cylinders";
import { Color } from "molstar/lib/mol-util/color";
import { make3DAlignID } from "../ngl/NGLUtils";
import { makeTooltipContents, makeTooltipTitle } from "../../ui-utils/make-tooltip";
import { buildCrosslinkShape } from "./CrosslinkShape";
import { xilog } from "../../utils";

// ──────────────────────────────────────────────────────────────────────────────
// Custom Molstar StateTransformer: CrosslinkShapeProvider
// Converts arbitrary shape data into a SO.Shape.Provider state object.
// canAutoUpdate: true — when params change, Molstar re-applies update() without
// tearing down the state tree, which re-runs getShape and triggers a re-render.
// ──────────────────────────────────────────────────────────────────────────────
const CrosslinkShapeProvider = PluginStateTransform.BuiltIn({
    name: "crosslink-shape-provider",
    display: "Crosslink Shape",
    from: SO.Root,
    to: SO.Shape.Provider,
    params: {
        shapeData: PD.Value(null, { isEssential: true }),
    },
})({
    canAutoUpdate() { return true; },
    apply({ params }) {
        return Task.create("Crosslink Shape", async () => {
            const { shape } = params.shapeData;
            // getShape is an identity function: ShapeRepresentation3D passes data back to it.
            // Updating .data to a new Shape causes ShapeRepresentation3D.update to re-render.
            return new SO.Shape.Provider(
                {
                    label: "Crosslinks",
                    data: shape,
                    params: Cylinders.Params,
                    getShape: (_, s) => s,
                    geometryUtils: Cylinders.Utils,
                },
                { label: "Crosslinks" }
            );
        });
    },
    update({ b, newParams }) {
        // Update the ShapeProvider's data to the new Shape object.
        // ShapeRepresentation3D.update will call repr.createOrUpdate(props, b.data.data)
        // which calls getShape(ctx, newShape) = newShape. Re-render triggered automatically.
        b.data.data = newParams.shapeData.shape;
        return StateTransformer.UpdateResult.Updated;
    },
});

// ──────────────────────────────────────────────────────────────────────────────

const BASE_RADIUS = 0.5;
const EMPH_RADIUS = 0.75;
const HIGH_RADIUS = 0.9;
const SELECTED_COLOR = Color.fromRgb(255, 255, 0);   // yellow
const HIGHLIGHTED_COLOR = Color.fromRgb(255, 165, 0); // orange

/**
 * Manages all Molstar representations for one loaded structure set.
 * Mirrors CrosslinkRepresentation from crosslink-representation.js.
 */
export class MolstarRepresentation {

    constructor(molstarModelWrapper, params) {
        const defaults = {
            chainRep: "cartoon",
            showAllProteins: false,
            displayedLabelVisible: false,
        };
        this.options = Object.assign({}, defaults, params);
        this.molstarModelWrapper = molstarModelWrapper;
        this.nglModelWrapper = molstarModelWrapper; // alias used in calling code
        this.plugin = molstarModelWrapper.get("plugin");

        // State tree node selectors for crosslink shapes
        this._shapeRef = null;
        this._shapeEmphRef = null;
        this._shapeHighRef = null;

        // Structure representation state node selectors (per structure)
        this._polymerCompRefs = [];
        this._reprRefs = [];

        this._setupStructureReprs();
        this._setupCrosslinkReprs();

        // Subscribe to pick events
        this._clickSub = this.plugin.behaviors.interaction.click.subscribe(
            (evt) => this._selectionPicking(evt)
        );
        this._hoverSub = this.plugin.behaviors.interaction.hover.subscribe(
            (evt) => this._highlightPicking(evt)
        );
    }

    // ── Structure representations ───────────────────────────────────────────

    async _setupStructureReprs() {
        const modelInfoArr = this.molstarModelWrapper.get("modelInfoArr") || [];
        for (const info of modelInfoArr) {
            if (!info.structureRef) continue;
            try {
                const polymerComp = await this.plugin.builders.structure.tryCreateComponentStatic(
                    info.structureRef, "polymer"
                );
                if (!polymerComp) continue;
                this._polymerCompRefs.push(polymerComp);
                const reprRef = await this.plugin.builders.structure.representation.addRepresentation(
                    polymerComp,
                    { type: "cartoon", color: "chain-id" }
                );
                this._reprRefs.push(reprRef);
            } catch (e) {
                console.error("Failed to create polymer repr for", info.id, e);
            }
        }
    }

    // ── Crosslink shape layers ───────────────────────────────────────────────

    _makeLinkColorFn() {
        const compositeModel = this.molstarModelWrapper.getCompositeModel();
        const colorAssignment = compositeModel.get("linkColourAssignment");
        const crosslinks = compositeModel.get("clmsModel").getCrosslinks();
        return (link) => {
            const xlink = crosslinks.get(link.origId);
            if (!xlink) return null;
            return colorAssignment.getColour(xlink);
        };
    }

    _filterByLinkState(links, linkState) {
        if (!linkState) return links;
        const compositeModel = this.molstarModelWrapper.getCompositeModel();
        const selectedSet = d3.set(
            _.pluck(compositeModel.getMarkedCrossLinks(linkState), "id")
        );
        return links.filter((l) => selectedSet.has(l.origId));
    }

    async _setupCrosslinkReprs() {
        // Initialize with empty shapes; _handleDataChange populates them once refs are ready.
        const emptyShape = buildCrosslinkShape([], this.molstarModelWrapper, null, BASE_RADIUS);

        this._shapeRef = await this._addShapeToState(emptyShape, "crosslink-all");
        this._shapeEmphRef = await this._addShapeToState(emptyShape, "crosslink-emph");
        this._shapeHighRef = await this._addShapeToState(emptyShape, "crosslink-high");

        // Now that refs are set, render any links already available
        await this._handleDataChange();
    }

    async _addShapeToState(shape, tag) {
        try {
            const providerRef = await this.plugin.build()
                .toRoot()
                .apply(CrosslinkShapeProvider, { shapeData: { shape } }, { ref: tag + "-provider", tags: ["crosslink"] })
                .commit();

            await this.plugin.build()
                .to(providerRef)
                .apply(StateTransforms.Representation.ShapeRepresentation3D, {}, { ref: tag + "-repr", tags: ["crosslink"] })
                .commit();

            return providerRef;
        } catch (e) {
            console.error("Failed to add crosslink shape to state:", e);
            return null;
        }
    }

    async _updateShapeInState(ref, shape) {
        if (!ref) return;
        try {
            await this.plugin.build()
                .to(ref)
                .update(CrosslinkShapeProvider, () => ({ shapeData: { shape } }))
                .commit();
        } catch (e) {
            console.error("Failed to update crosslink shape:", e);
        }
    }

    // ── Public API: matches CrosslinkRepresentation interface ────────────────

    async setDisplayedLinks(links) {
        const colorFn = this._makeLinkColorFn();
        const shape = buildCrosslinkShape(links, this.molstarModelWrapper, colorFn, BASE_RADIUS);
        await this._updateShapeInState(this._shapeRef, shape);
        return this;
    }

    async setSelectedLinks(links) {
        const emphLinks = this._filterByLinkState(links, "selection");
        const shape = buildCrosslinkShape(emphLinks, this.molstarModelWrapper, null, EMPH_RADIUS, SELECTED_COLOR);
        await this._updateShapeInState(this._shapeEmphRef, shape);
        return this;
    }

    async setHighlightedLinks(links) {
        const highLinks = this._filterByLinkState(links, "highlights");
        const shape = buildCrosslinkShape(highLinks, this.molstarModelWrapper, null, HIGH_RADIUS, HIGHLIGHTED_COLOR);
        await this._updateShapeInState(this._shapeHighRef, shape);
        return this;
    }

    async _handleDataChange() {
        xilog("HANDLE DATA CHANGE 3D (Molstar)");
        const links = this.molstarModelWrapper.getFullLinks() || [];
        await this.setDisplayedLinks(links);
        await this.setSelectedLinks(links);
        return this;
    }

    reportLinks() {
        return this;
    }

    redisplayProteins() {
        // Chain visibility in Molstar is handled via component visibility.
        // For now, we keep all chains visible.
        return this;
    }

    redisplayChainLabels() {
        return this;
    }

    updateAssemblyType() {
        return this;
    }

    updateOptions(options, keys) {
        keys.forEach((k) => { this.options[k] = options[k]; });
        return this;
    }

    rerenderColourSchemes() {
        // Color updates are applied via shape rebuild; no-op for now.
        return this;
    }

    replaceChainRepresentation() {
        return this;
    }

    setDisplayedResidues() {
        return this;
    }

    setSelectedResidues() {
        return this;
    }

    dispose() {
        if (this._clickSub) { this._clickSub.unsubscribe(); this._clickSub = null; }
        if (this._hoverSub) { this._hoverSub.unsubscribe(); this._hoverSub = null; }

        // Remove crosslink shape provider nodes from state tree (also removes child repr nodes)
        try {
            const refs = [this._shapeRef, this._shapeEmphRef, this._shapeHighRef].filter(Boolean);
            if (refs.length) {
                const b = this.plugin.build();
                refs.forEach(r => b.delete(r));
                b.commit();
            }
        } catch (e) {
            // ignore errors on dispose
        }
        this._shapeRef = null;
        this._shapeEmphRef = null;
        this._shapeHighRef = null;
        return this;
    }

    // ── Picking ─────────────────────────────────────────────────────────────

    makeTooltipCoords(evt) {
        const canv = $("#nglPanel canvas, #molstar canvas").first();
        if (!canv.length) return { pageX: 0, pageY: 0 };
        const off = canv.offset();
        const page = evt.page;
        if (!page) return { pageX: off.left, pageY: off.top };
        return { pageX: off.left + page[0], pageY: off.top + page[1] };
    }

    _selectionPicking(evt) {
        this._handlePicking(evt, "selection");
    }

    _highlightPicking(evt) {
        this._handlePicking(evt, "highlights", true);
    }

    _handlePicking(evt, pickType, doEmpty) {
        const modelWrapper = this.molstarModelWrapper;
        const compositeModel = modelWrapper.getCompositeModel();

        const add = evt && (evt.modifiers && (evt.modifiers.shift || evt.modifiers.control)) && (pickType === "selection");
        const loci = evt && evt.current ? evt.current.loci : null;

        const pdtrans = { links: undefined, xlinks: undefined };

        if (loci && !Loci.isEmpty(loci)) {
            if (ShapeGroup.isLoci(loci)) {
                // Clicked a crosslink cylinder
                const shape = loci.shape;
                if (shape && shape.name === "crosslinks") {
                    // Get the groupId from the first group in the loci
                    const firstGroup = loci.groups[0];
                    if (firstGroup) {
                        const groupId = OrderedSet.start(firstGroup.ids);
                        const link3d = shape.sourceData && shape.sourceData[groupId];
                        if (link3d) {
                            pdtrans.links = [link3d];
                            pdtrans.xlinks = modelWrapper.getOriginalCrossLinks([link3d]);

                            if (pickType === "selection") {
                                // Auto-zoom to the selected link
                            }

                            compositeModel.get("tooltipModel")
                                .set("header", makeTooltipTitle.link())
                                .set("contents", makeTooltipContents.link(pdtrans.xlinks[0]))
                                .set("location", this.makeTooltipCoords(evt));
                        }
                    }
                }
            } else if (StructureElement.Loci.is(loci)) {
                // Clicked a protein residue
                const loc = StructureElement.Loci.getFirstLocation(loci);
                if (loc) {
                    // Resolve the clicked residue to a crosslink residue
                    const structure = loc.structure;
                    const unit = loc.unit;
                    const element = loc.element;

                    // Get residue index from the structure element
                    const residueIndex = unit.model.atomicHierarchy.residueAtomSegments.index[element];

                    // Find the global residue index
                    const modelInfoArr = modelWrapper.get("modelInfoArr") || [];
                    const residueOffsets = modelWrapper.get("residueOffsets") || [0];

                    let globalRi = -1;
                    for (let si = 0; si < modelInfoArr.length; si++) {
                        if (modelInfoArr[si].model === unit.model) {
                            globalRi = residueOffsets[si] + residueIndex;
                            break;
                        }
                    }

                    if (globalRi >= 0) {
                        const residue = modelWrapper.getResidueByNGLGlobalIndex(globalRi);
                        if (residue) {
                            const proteinId = modelWrapper.get("reverseChainMap").get(residue.chainIndex);
                            const alignId = make3DAlignID(
                                modelWrapper.getStructureName(),
                                modelWrapper.getChainName(residue.chainIndex),
                                residue.chainIndex
                            );
                            const srindex = compositeModel.get("alignColl").getAlignedIndex(
                                residue.seqIndex + 1, proteinId, true, alignId
                            );

                            pdtrans.links = modelWrapper.getFullLinksByResidueID(residue.residueId);
                            const origFullLinks = modelWrapper.getOriginalCrossLinks(pdtrans.links);
                            const halfLinks = modelWrapper.getHalfLinksByResidueID(residue.residueId);
                            const origHalfLinks = modelWrapper.getOriginalCrossLinks(halfLinks);
                            const distances = origFullLinks.map((xl) => xl.getMeta("distance"));

                            pdtrans.xlinks = origFullLinks.concat(origHalfLinks);

                            const protein = compositeModel.get("clmsModel").getProtein(proteinId);
                            const chainName = modelWrapper.getChainName(residue.chainIndex);
                            compositeModel.get("tooltipModel")
                                .set("header", "Crosslinked with " + makeTooltipTitle.residue(protein, srindex, ":" + chainName))
                                .set("contents", makeTooltipContents.multilinks(pdtrans.xlinks, proteinId, srindex, { "Distance": distances }))
                                .set("location", this.makeTooltipCoords(evt));
                        }
                    }
                }
            }
        }

        if (pickType === "selection" && !loci) {
            // Click on empty space → clear selection
            compositeModel.setMarkedCrossLinks("selection", [], false, false);
            return;
        }

        if (!pdtrans.links && doEmpty) {
            pdtrans.xlinks = [];
            compositeModel.get("tooltipModel").set("contents", null);
        }

        if (pdtrans.xlinks !== undefined) {
            compositeModel.setMarkedCrossLinks(pickType, pdtrans.xlinks, false, add);
        }
    }
}

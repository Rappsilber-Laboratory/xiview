import d3 from "d3";
import {Interactor} from "./interactor";
import {CrosslinkViewer} from "../crosslink-viewer-BB";
import {makeTooltipContents, makeTooltipTitle} from "../../../ui-utils/make-tooltip";
import {RenderedProtein} from "./rendered-protein";

/**
 * Represents a group of proteins in the xiNET visualization.
 * Groups can be expanded to show member proteins or collapsed to a single symbol.
 * Supports nested groups (subgroups) and complex hierarchies.
 */
export class Group extends Interactor {
    /**
     * Creates a new Group instance.
     *
     * @param {string} id - Unique identifier for this group
     * @param {string[]} proteinIds - Array of protein IDs to include in this group
     * @param {CrosslinkViewer} controller - The parent crosslink viewer controller
     */
    constructor(id, proteinIds, controller) {
        super(controller);

        this._id = id;
        this.name = id;

        this.renderedProteins = [];
        for (let pId of proteinIds) {
            const p = this.controller.renderedProteins.get(pId);
            if (p) { // no decoys in this.controller.renderedProteins
                this.renderedProteins.push(p);
            }
        }
        this.parentGroups = new Set();
        this.subgroups = [];

        this.expanded = true;
        this.hidden = false;
        this.type = "group";

        this.padding = 45; // used by cola.js

        this.upperGroup = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.upperGroup.setAttribute("class", "protein upperGroup");

        //make highlight
        this.highlight = document.createElementNS(CrosslinkViewer.svgns, "rect");
        this.highlight.setAttribute("class", "highlightedProtein");
        this.highlight.setAttribute("stroke-width", "3");
        this.highlight.setAttribute("fill", "none");
        this.highlight.setAttribute("stroke-opacity", "0");

        //create label - we will move this svg element around when expand / collapse
        this.labelSVG = document.createElementNS(CrosslinkViewer.svgns, "text");
        this.labelSVG.setAttribute("fill", "black");
        this.labelSVG.setAttribute("x", "0");
        this.labelSVG.setAttribute("y", "0");
        this.labelSVG.setAttribute("class", "xlv_text proteinLabel");
        this.labelSVG.setAttribute("text-decoration", "underline");
        this.labelText = this.name;
        this.labelTextNode = document.createTextNode(this.labelText);
        this.labelSVG.appendChild(this.labelTextNode);

        //make blob
        this.outline = document.createElementNS(CrosslinkViewer.svgns, "rect");
        this.outline.setAttribute("stroke", "white");
        this.outline.setAttribute("stroke-width", "3");
        this.outline.setAttribute("stroke-opacity", "1");
        this.outline.setAttribute("fill-opacity", "0.5");
        this.outline.setAttribute("fill", "#cccccc");

        this.upperGroup.appendChild(this.outline);
        this.upperGroup.appendChild(this.highlight);
        this.upperGroup.appendChild(this.labelSVG);

        //need to change this if default is unexpanded
        this.controller.groupsSVG.appendChild(this.upperGroup);

        const self = this;
        //    this.upperGroup.setAttribute('pointer-events','all');
        this.upperGroup.onmousedown = function (evt) {
            self.mouseDown(evt);
        };
        this.upperGroup.onmouseover = function (evt) {
            self.mouseOver(evt);
        };
        this.upperGroup.onmouseout = function (evt) {
            self.mouseOut(evt);
        };
    }

    get id () {
        return this._id;
    }

    set id (id){
        this._id = id;
    }

    get proteins () {
        const proteins = [];
        for (let renderedProtein of this.renderedProteins) {
            proteins.push(renderedProtein.protein);
        }
        return proteins;
    }

    get width() {
        // return 60;
        const approxLabelWidth = 10 * (this.labelText.length + 2);
        return (approxLabelWidth > this.symbolRadius) ? approxLabelWidth : this.symbolRadius + 20;
    }

    get height () {
        return 60;
    }

    get bBox () {
        return this.upperGroup.getBBox();
        // let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
        // const z = this.controller.z;//, pad = 5 * z;
        //
        // for (let rp of this.renderedProteins) {
        //     if (!rp.hidden && !this.containsInSubgroup(rp)) {
        //         const rpBbox = rp.bBox;
        //         if (!x1 || (rpBbox.x * z) + rp.ix < x1) {
        //             x1 = (rpBbox.x * z) + rp.ix;
        //         }
        //         if (!y1 || (rpBbox.y * z) + rp.iy < y1) {
        //             y1 = (rpBbox.y * z) + rp.iy;
        //         }
        //         if (!x2 || ((rpBbox.x + rpBbox.width) * z) + rp.ix > x2) {
        //             x2 = ((rpBbox.x + rpBbox.width) * z) + rp.ix;
        //         }
        //         if (!y2 || ((rpBbox.y + rpBbox.height) * z) + rp.iy > y2) {
        //             y2 = ((rpBbox.y + rpBbox.height) * z) + rp.iy;
        //         }
        //     }
        // }
        //
        // const w = x2 - x1, h = y2 -y1;
        //
        // return {
        //     x: x1,
        //     y: y1,
        //     width: w,
        //     height: h
        // };
    }

    //only output the info needed to reproduce the layout, used by save layout function
    toJSON() {
        const proteinIds = [];
        for (let rp of this.renderedProteins) {
            proteinIds.push(rp.protein.id);
        }
        return {
            id: this.id,
            x: this.ix,
            y: this.iy,
            expanded: this.expanded,
            proteinIds: proteinIds
        };
    }

    get unhiddenProteinCount () {
        let count = 0;
        for (let renderedProtein of this.renderedProteins) {
            if (!renderedProtein.protein.hidden) {
                count++;
            }
        }
        return count;
    }

    get selected () {
        const selectedProteins = this.controller.model.get("selectedProteins");
        for (let rp of this.renderedProteins) {
            if (selectedProteins.indexOf(rp.protein) === -1) {
                return false;
            }
        }
        return true;
    }

    set selected (selected) {
        super.selected = selected;
        if (selected) {
            this.outline.setAttribute("stroke", "none");
        } else {
            this.outline.setAttribute("stroke", "white");
        }
    }

    set highlighted (highlight) {
        super.highlighted = highlight;
        if (highlight) {
            this.outline.setAttribute("stroke", "none");
        } else {
            this.outline.setAttribute("stroke", "white");
        }
    }

    // result depends on whats hidden
    isSubsetOf(anotherGroup) {
        for (let renderedProtein of this.renderedProteins) {
            if (!renderedProtein.protein.hidden && anotherGroup.renderedProteins.indexOf(renderedProtein) === -1) {
                return false;
            }
        }
        return true;
    }

    contains(renderedProtein) {
        for (let rp of this.renderedProteins) {
            if (rp === renderedProtein) {
                return true;
            }
        }
        return false;
    }

    containsInSubgroup(renderedProtein) {
        for (let subgroup of this.subgroups) {
            if (subgroup.contains(renderedProtein)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Checks if this group overlaps with other groups.
     * An overlapping group shares members with another group but neither is a subset of the other.
     *
     * @returns {boolean} True if this group overlaps with other groups
     */
    isOverlappingGroup() {
        for (let renderedProtein of this.renderedProteins) {
            if (!renderedProtein.protein.hidden && renderedProtein.parentGroups.size > 1) {
                for (let parentGroup of renderedProtein.parentGroups) {
                    if (!parentGroup.isSubsetOf(this) && !this.isSubsetOf(parentGroup)) {
                        return true;
                    }
                }
            }
        }
        for (let subgroup of this.subgroups) {
            if (!subgroup.hidden && subgroup.parentGroups.size > 1) {
                for (let subgroupParentGroup of subgroup.parentGroups) {
                    if (!subgroupParentGroup.isSubsetOf(this) && !this.isSubsetOf(subgroupParentGroup)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    init() {
        this.controller.groupsSVG.appendChild(this.upperGroup);
        this.setExpanded(this.expanded);
    }

    mouseDown(evt) {
        this.controller.d3cola.stop();
        this.controller.dragElement = this;
        this.controller.dragStart = evt;
        this.controller.mouseMoved = false;
        return false;
    }

    mouseOver(evt) {
        // this.showHighlight(true);
        const toHighlight = [];
        for (let rp of this.renderedProteins) {
            toHighlight.push(rp.protein);
        }
        this.controller.model.setHighlightedProteins(toHighlight);
        //call in super?
        const p = this.controller.getEventPoint(evt);
        this.controller.model.get("tooltipModel")
            .set("header", makeTooltipTitle.complex(this))
            .set("contents", makeTooltipContents.complex(this))
            .set("location", {
                pageX: p.x,
                pageY: p.y
            });
    }

    // mouseOut(evt) {
    //     this.highlighted = false;
    //     Interactor.prototype.mouseOut.call(this, evt);
    // }

    getAverageParticipantPosition() {
        let xSum = 0,
            ySum = 0;
        const rpCount = this.renderedProteins.length;
        for (let rp of this.renderedProteins) {
            xSum += rp.ix;
            ySum += rp.iy;
        }
        return [xSum / rpCount, ySum / rpCount];
    }

    /* leave this.x and this.y as they were set by cola,
        calculate centre of interactor's glyph,
        call setPosition with those
    */
    setPositionFromCola(ix, iy) {
        this.px = this.x;
        this.py = this.y;
        // leave this.x/this.y as cola set them (cola recomputes from them each tick);
        // render at the scaled coords passed in.
        this.setPosition(ix, iy);
    }

    /* calculate top left of interactor's glyph,
    set this.x and this.y as cola would have them,
        call setPosition with same params this received
    */
    setPositionFromXinet(ix, iy) {
        this.px = this.x;
        this.py = this.y;
        let xOffset = 0;
        if (!this.hidden) { // todo - hacky
            xOffset = (this.width / 2); // - (this.getBlobRadius()) + 5)
            // if (this.expanded) {
            //   xOffset = xOffset + (this.participant.size / 2 * this.stickZoom );
            // }
        }
        this.x = ix - xOffset;
        this.y = iy;
        this.setPosition(ix, iy);
    }

    //also setting size of collapsed group symbol; scaling line widths, corner radii
    setPosition(ix, iy) { //todo - array for coordinate param?
        if (!this.expanded) {
            this.ix = ix;
            this.iy = iy;
            const symbolWidth = 20;
            const x = this.ix - (symbolWidth * this.controller.z);
            const y = this.iy - (symbolWidth * this.controller.z);
            const scaledWidth = 2 * (symbolWidth * this.controller.z);
            const cornerRadii = 5 * this.controller.z;

            const updateOutline = function (svgElement) {
                if (!x){
                    console.log("!x");
                }

                svgElement.setAttribute("x", x);
                svgElement.setAttribute("y", y);
                svgElement.setAttribute("width", scaledWidth);
                svgElement.setAttribute("height", scaledWidth);
                svgElement.setAttribute("rx", cornerRadii);
                svgElement.setAttribute("ry", cornerRadii);
            };

            updateOutline(this.outline);
            // noinspection JSCheckFunctionSignatures
            this.outline.setAttribute("stroke-width", 3 * this.controller.z);

            updateOutline(this.highlight);
            this.highlight.setAttribute("stroke-width", 9 * this.controller.z);

            this.labelSVG.setAttribute("transform", "translate(" + this.ix + " " + this.iy + ")" +
                " scale(" + (this.controller.z) + ")");

            for (let group of this.parentGroups) {
                if (group.expanded && !this.hidden) {
                    group.updateExpandedGroup();
                }
            }
            for (let ggLink of this.controller.g_gLinks.values()) {
                ggLink.setLineCoordinates();
            }
            if (this.selfLink != null) {
                if (typeof this.selfLink.thickLine !== "undefined") {
                    this.selfLink.thickLine.setAttribute("transform", "translate(" + this.ix +
                        " " + this.iy + ")" + " scale(" + (this.controller.z) + ")");
                }
                this.selfLink.line.setAttribute("transform", "translate(" + this.ix +
                    " " + this.iy + ")" + " scale(" + (this.controller.z) + ")");
                this.selfLink.highlightLine.setAttribute("transform", "translate(" + this.ix +
                    " " + this.iy + ")" + " scale(" + (this.controller.z) + ")");
            }

        } else {
            console.log("error - calling setPosition on unexpanded Group");
        }
    }

    /**
     * Updates the bounding box and visual representation of an expanded group.
     * Calculates the minimum rectangle containing all member proteins and subgroups.
     * Updates the group outline, highlight, and label positions.
     */
    updateExpandedGroup() {
        let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
        const z = this.controller.z, pad = 5 * z;

        for (let rp of this.renderedProteins) {
            if (!rp.hidden && !this.containsInSubgroup(rp)) {
                const rpBbox = rp.bBox;
                if (!x1 || (rpBbox.x * z) + rp.ix < x1) {
                    x1 = (rpBbox.x * z) + rp.ix;
                }
                if (!y1 || (rpBbox.y * z) + rp.iy < y1) {
                    y1 = (rpBbox.y * z) + rp.iy;
                }
                if (!x2 || ((rpBbox.x + rpBbox.width) * z) + rp.ix > x2) {
                    x2 = ((rpBbox.x + rpBbox.width) * z) + rp.ix;
                }
                if (!y2 || ((rpBbox.y + rpBbox.height) * z) + rp.iy > y2) {
                    y2 = ((rpBbox.y + rpBbox.height) * z) + rp.iy;
                }
            }
        }

        for (let sg of this.subgroups) {
            if (!sg.hidden) {
                const sgBbox = sg.bBox;
                if (!x1 || (sgBbox.x) < x1) {
                    x1 = (sgBbox.x);
                }
                if (!y1 || (sgBbox.y) < y1) {
                    y1 = (sgBbox.y);
                }
                if (!x2 || ((sgBbox.x + sgBbox.width)) > x2) {
                    x2 = ((sgBbox.x + sgBbox.width));
                }
                if (!y2 || ((sgBbox.y + sgBbox.height)) > y2) {
                    y2 = ((sgBbox.y + sgBbox.height));
                }
            }
        }

        const updateOutline = function (svgElement) {
            svgElement.setAttribute("x", x1 - pad);
            svgElement.setAttribute("y", y1 - pad);
            svgElement.setAttribute("width", x2 - x1 + (2 * pad));
            svgElement.setAttribute("height", y2 - y1 + (2 * pad));
            svgElement.setAttribute("rx", pad);
            svgElement.setAttribute("ry", pad);
        };

        updateOutline(this.outline);
        // noinspection JSCheckFunctionSignatures
        this.outline.setAttribute("stroke-width", 3 * this.controller.z);

        updateOutline(this.highlight);
        this.highlight.setAttribute("stroke-width", 9 * this.controller.z);

        //move label
        this.labelSVG.setAttribute("transform", "translate(" + (x1 - pad) + " " + (y1 - pad) + ")" +
            " scale(" + (this.controller.z) + ")");

        for (let group of this.parentGroups) {
            if (group.expanded && !this.hidden) {
                group.updateExpandedGroup();
            }
        }
    }

    setColour(colour) {
        if (colour === "#FFFFFF") colour = "#CCCCCC";
        this.outline.setAttribute("fill", colour);
    }

    setHidden(bool) {  // todo: make this a property?
        d3.select(this.upperGroup).style("display", bool ? "none" : null);
        d3.select(this.labelSVG).style("display", bool ? "none" : null);
        this.hidden = !!bool;
    }

    // updateHighlight() {
    //     if (this.expanded) {
    //         let someHighlighted = false, allHighlighted = true;
    //         for (let rp of this.renderedProteins) {
    //             if (!rp.hidden) {
    //                 if (rp.isHighlighted) {
    //                     someHighlighted = true;
    //                 } else {
    //                     allHighlighted = false;
    //                 }
    //             }
    //         }
    //         if (someHighlighted) {
    //             if (!allHighlighted) {
    //                 this.dashedOutline(true);
    //             } else {
    //                 this.dashedOutline(false);
    //             }
    //             this.showHighlight(true);
    //         } else {
    //             this.dashedOutline(false);
    //             this.showHighlight(false);
    //             this.updateSelected();
    //         }
    //     }
    // }

    updateSelected() {
        let someSelected = false, allSelected = true;
        for (let rp of this.renderedProteins) {
            if (rp.selected) {
                someSelected = true;
            } else {
                allSelected = false;
            }
        }
        if (someSelected) {
            this.dashed = !allSelected;
            this.selected = true;
        } else {
            this.selected = false;
        }
    }

    set dashed(dash) {
        if (dash){// && !this._dashed) {
            this.highlight.setAttribute("stroke-dasharray", (8 * this.controller.z) + ", " + (8 * this.controller.z));
        } else if (!dash){//} && this._dashed) {
            this.highlight.removeAttribute("stroke-dasharray");
        }
        this._dashed = !!dash;
    }

    updateCountLabel() {
        this.labelSVG.textContent = this.labelText + " (" + this.unhiddenProteinCount + ")";
    }

    setExpanded(expanded, svgP) {
        this.controller.model.get("tooltipModel").set("contents", null);
        if (this.busy !== true) {
            if (this.isOverlappingGroup()) {
                console.error("overlapping group", this.id);
                expanded = true;
            }
            if (expanded) {
                if (this.expanded !== expanded) {
                    this.expand();
                }
            } else {
                if (this.expanded !== expanded) {
                    this.collapse(svgP);
                }
            }
        }
    }

    /**
     * Collapses this group to a single symbol.
     * Animates member proteins moving to the collapse point and hides them.
     *
     * @param {Object} svgP - Optional SVG point to collapse towards {x, y}
     * @param {boolean} [transition=true] - Whether to animate the transition
     */
    collapse(svgP, transition = true) {
        // transition = false;
        if (this.isOverlappingGroup()) {
            console.error("overlapping group", this.id);
            this.expand(false);
            return;
        }
        let newX, newY;
        if (svgP) {
            newX = svgP.x;
            newY = svgP.y;
        } else {
            const avPos = this.getAverageParticipantPosition();
            newX = avPos[0];
            newY = avPos[1];
        }

        const originalProteinPositions = []; // will reset positions after transition
        const originalCollapsedSubgroupPositions = []; // will reset positions after transition
        const proteinXPositionInterpolations = [];
        const proteinYPositionInterpolations = [];
        const collapsedSubgroupXPositionInterpolations = [];
        const collapsedSubgroupYPositionInterpolations = [];
        const cubicInOut = d3.ease("cubic-in-out");
        this.busy = true;
        const self = this;

        if (transition) {
            for (let rp of this.renderedProteins) {
                originalProteinPositions.push([rp.ix, rp.iy]);
                proteinXPositionInterpolations.push(d3.interpolate(rp.ix, newX));
                proteinYPositionInterpolations.push(d3.interpolate(rp.iy, newY));
            }

            for (let sg of this.subgroups) {
                // if (!sg.expanded) {
                originalCollapsedSubgroupPositions.push([sg.ix, sg.iy]);
                collapsedSubgroupXPositionInterpolations.push(d3.interpolate(sg.ix, newX));
                collapsedSubgroupYPositionInterpolations.push(d3.interpolate(sg.iy, newY));
                // }
            }

            d3.timer(function (elapsed) {
                return updateCollapsing(elapsed / (RenderedProtein.transitionTime * 2));
            });

        } else {
            updateCollapsing(1);
        }

        function updateCollapsing(interp) {
            if (interp === 1) { // finished - tidy up
                self.expanded = false;
                self.setPositionFromXinet(newX, newY);

                for (let i = 0; i < self.renderedProteins.length; i++) {
                    const rp = self.renderedProteins[i];
                    rp.setHidden(true);
                    if (transition){
                        rp.setPositionFromXinet(originalProteinPositions[i][0], originalProteinPositions[i][1]);
                    }
                    // rp.setAllLinkCoordinates();
                }

                for (let i = 0; i < self.subgroups.length; i++) {
                    const sg = self.subgroups[i];
                    // if (!sg.expanded) {
                    if (transition){
                        sg.setPositionFromXinet(originalCollapsedSubgroupPositions[i][0], originalCollapsedSubgroupPositions[i][1]);
                    }
                    // }
                }
                self.labelSVG.setAttribute("dominant-baseline", "central");
                self.labelSVG.setAttribute("text-anchor", "middle");
                self.hideSubgroups();
                self.controller.proteinUpper.appendChild(self.upperGroup);
                self.outline.setAttribute("fill-opacity", "1");
                if (transition) {
                    self.controller.hiddenProteinsChanged();
                    self.controller.render();
                }
                self.busy = false;
                return true;
            } else if (interp > 1 || isNaN(interp)) {
                return updateCollapsing(1);
            } else {
                for (let i = 0; i < self.renderedProteins.length; i++) {
                    const rp = self.renderedProteins[i];
                    const x = proteinXPositionInterpolations[i](cubicInOut(interp));
                    const y = proteinYPositionInterpolations[i](cubicInOut(interp));
                    rp.setPositionFromXinet(x, y);
                    rp.setAllLinkCoordinates();
                }

                for (let i = 0; i < self.subgroups.length; i++) {
                    const sg = self.subgroups[i];
                    if (!sg.expanded) {
                        const x = collapsedSubgroupXPositionInterpolations[i](cubicInOut(interp));
                        const y = collapsedSubgroupYPositionInterpolations[i](cubicInOut(interp));
                        sg.setPositionFromXinet(x, y);
                    }
                }
                self.updateExpandedGroup();
                return false;
            }
        }
    }

    /**
     * Expands this group to show all member proteins.
     * Animates member proteins spreading out from the group symbol.
     * Attempts to keep proteins on screen by scaling and translating as needed.
     *
     * @param {boolean} [transition=true] - Whether to animate the transition
     */
    expand(transition = true) {
        // transition = false;
        this.busy = true;
        const self = this;

        this.expanded = true;
        // if (transition) { // yucky, transition is being used to indicate whether this is one interactor collapsing or from 'Collapse All'
        //     this.controller.render();
        // }

        const proteinXPositionInterpolations = [];
        const proteinYPositionInterpolations = [];
        const collapsedSubgroupXPositionInterpolations = [];
        const collapsedSubgroupYPositionInterpolations = [];

        const cubicInOut = d3.ease("cubic-out");

        // this.labelSVG.setAttribute("dominant-baseline", null);
        // this.labelSVG.setAttribute("text-anchor", null);
        // this.showSubgroups();
        // this.controller.groupsSVG.appendChild(this.upperGroup);
        // this.outline.setAttribute("fill-opacity", "0.5");
        //
        // for (let rp of this.renderedProteins) {
        //     rp.setHidden(rp.participant.hidden || rp.inCollapsedGroup());
        // }

        const tl = this.controller.svgElement.createSVGPoint();
        tl.x = 0;
        tl.y =0;
        const br = this.controller.svgElement.createSVGPoint();
        const width = this.controller.svgElement.parentNode.clientWidth;
        const height = this.controller.svgElement.parentNode.clientHeight;
        br.x = width;
        br.y = height;
        const topLeft = tl.matrixTransform(this.controller.container.getCTM().inverse());
        const bottomRight = br.matrixTransform(this.controller.container.getCTM().inverse());

        //bbox of the expanded group (before moving it on screen if necessary)
        let bboxTL = this.controller.svgElement.createSVGPoint();
        let bboxBR = this.controller.svgElement.createSVGPoint();

        //  decide on new positions for proteins and collapsed subgroups
        if (transition) { // only if transition (not if no position, i.e. from saved layout)
            let ix = this.ix, iy = this.iy;
            if (!ix) { // todo? um, check why this can be undefined (is it when loading from saved layout)
                const pPos = this.getAverageParticipantPosition();
                ix = pPos[0];
                iy = pPos[1];
            }

            this.controller.hiddenProteinsChanged(); //needed for isOnScreen() to work

            let allOnScreen = true;
            for (let rp of this.renderedProteins) {
                if (!isOnScreen(rp)) {
                    allOnScreen = false;
                    // can't break here because we need to get the bbox of the expanded group
                }
            }

            for (let sg of this.subgroups) {
                if (!sg.expanded) {
                    if (!isOnScreen(sg)) {
                        allOnScreen = false;
                        // can't break here because we need to get the bbox of the expanded group
                    }
                }
            }

            if (allOnScreen) {
                for (let rp of this.renderedProteins) {
                    proteinXPositionInterpolations.push(d3.interpolate(ix, rp.ix));
                    proteinYPositionInterpolations.push(d3.interpolate(iy, rp.iy));
                }
                for (let sg of this.subgroups) {
                    // if (!sg.expanded) {
                    collapsedSubgroupXPositionInterpolations.push(d3.interpolate(ix, sg.ix));
                    collapsedSubgroupYPositionInterpolations.push(d3.interpolate(iy, sg.iy));
                    // }
                }
            } else {
                // alert("not all on screen");
                console.log("not all on screen", bboxTL, bboxBR);


                //scale?
                const bboxWidth = (bboxBR.x - bboxTL.x);
                const bboxHeight = bboxBR.y - bboxTL.y;
                const preferredWidth = (width / 2) * this.controller.z;
                const preferredHeight = (height / 2) * this.controller.z;
                let xScale, yScale, scale = 1;
                if (bboxWidth > (width * this.controller.z) || bboxHeight > (height * this.controller.z)) {
                    if (bboxWidth > preferredWidth) {
                        xScale = preferredWidth / bboxWidth;
                    }
                    if (bboxHeight > preferredHeight) {
                        yScale = preferredHeight / bboxHeight;
                    }
                    scale = Math.min(xScale, yScale);
                    console.log("SCALE!!", scale);
                    //bbox is that of the expanded group

                    const bboxMidPoint = {};//= this.controller.svgElement.createSVGPoint();

                    bboxMidPoint.x = (bboxTL.x + bboxBR.x) / 2;
                    bboxMidPoint.y = (bboxTL.y + bboxBR.y) / 2;

                    const xTrans = ix - bboxMidPoint.x;
                    const yTrans = iy - bboxMidPoint.y;

                    for (let rp of this.renderedProteins) {
                        const dx = rp.ix + xTrans - bboxMidPoint.x;
                        const dy = rp.iy + yTrans - bboxMidPoint.y;
                        // const dx = rp.ix + (ix - bboxMidPoint.x) - bboxMidPoint.x;
                        // = rp.ix + ix - 2 * bboxMidPoint.x;
                        proteinXPositionInterpolations.push(d3.interpolate(ix, ix + (dx * scale)));
                        proteinYPositionInterpolations.push(d3.interpolate(iy, iy + (dy * scale)));
                    }
                    for (let sg of this.subgroups) {
                        // if (!sg.expanded) {
                        const dx = sg.ix + xTrans - bboxMidPoint.x;
                        const dy = sg.iy + yTrans - bboxMidPoint.y;

                        collapsedSubgroupXPositionInterpolations.push(d3.interpolate(ix, ix + (dx * scale)));
                        collapsedSubgroupYPositionInterpolations.push(d3.interpolate(iy, iy + (dy * scale)));
                        // }
                    }
                } else {
                    //bbox is that of the expanded group

                    const bboxMidPoint = {};//= this.controller.svgElement.createSVGPoint();

                    bboxMidPoint.x = (bboxTL.x + bboxBR.x) / 2;
                    bboxMidPoint.y = (bboxTL.y + bboxBR.y) / 2;

                    const xTrans = ix - bboxMidPoint.x;
                    const yTrans = iy - bboxMidPoint.y;

                    for (let rp of this.renderedProteins) {
                        proteinXPositionInterpolations.push(d3.interpolate(ix, rp.ix + xTrans));
                        proteinYPositionInterpolations.push(d3.interpolate(iy, rp.iy + yTrans));
                    }
                    for (let sg of this.subgroups) {
                        // if (!sg.expanded) {
                        collapsedSubgroupXPositionInterpolations.push(d3.interpolate(ix, sg.ix + xTrans));
                        collapsedSubgroupYPositionInterpolations.push(d3.interpolate(iy, sg.iy + yTrans));
                        // }
                    }
                }
            }

            //move all prots / subgroups to
            for (let rp of this.renderedProteins) {
                if (!rp.hidden){
                    rp.setPositionFromXinet(ix, iy);
                }
            }
            for (let sg of this.subgroups) {
                if (!sg.hidden) {
                    sg.setPositionFromXinet(ix, iy);
                }
            }

            // this.expanded = true;
            this.labelSVG.setAttribute("dominant-baseline", null);
            this.labelSVG.setAttribute("text-anchor", null);

            this.showSubgroups();

            this.controller.groupsSVG.appendChild(this.upperGroup);
            this.outline.setAttribute("fill-opacity", "0.5");

            for (let rp of this.renderedProteins) {
                rp.setHidden(rp.protein.hidden || rp.inCollapsedGroup());
            }

            if (transition) { // yucky, transition is being used to indicate whether this is one interactor collapsing or from 'Collapse All'
                this.controller.render();
            }

            d3.timer(function (elapsed) {
                return updateExpanding(elapsed / (RenderedProtein.transitionTime * 2));
            });
        } else {
            updateExpanding(1);
        }

        function isOnScreen(interactor){
            if (!interactor.hidden) {
                // console.log("TESTING", interactor);
                if (!bboxTL.x || interactor.ix < bboxTL.x) {
                    bboxTL.x = interactor.ix;
                    // console.log("SETTING BBOX TL X", bboxTL.x);
                }
                if (!bboxTL.y || interactor.iy < bboxTL.y) {
                    bboxTL.y = interactor.iy;
                    // console.log("SETTING BBOX TL Y", bboxTL.y);
                }
                if (!bboxBR.x || interactor.ix > bboxBR.x) {
                    bboxBR.x = interactor.ix;
                    // console.log("SETTING BBOX BR X", bboxBR.x);
                }
                if (!bboxBR.y || interactor.iy > bboxBR.y) {
                    bboxBR.y = interactor.iy;
                    // console.log("SETTING BBOX BR Y", bboxBR.y);
                }
            }
            return interactor.ix > topLeft.x && interactor.ix < bottomRight.x && interactor.iy > topLeft.y && interactor.iy < bottomRight.y;
        }

        function updateExpanding(interp) {
            if (interp === 1) { // finished - tidy up
                self.updateExpandedGroup();
                if (transition) { // yucky, transition is being used to indicate whether this is one interactor collapsing or from 'Collapse All'
                    self.controller.hiddenProteinsChanged();
                    self.controller.render();
                }
                self.busy = false;
                return true;
            } else if (interp > 1 || isNaN(interp)) {
                return updateExpanding(1);
            } else {
                for (let i = 0; i < self.renderedProteins.length; i++) {
                    const rp = self.renderedProteins[i];
                    const x = proteinXPositionInterpolations[i](cubicInOut(interp));
                    const y = proteinYPositionInterpolations[i](cubicInOut(interp));
                    rp.setPosition(x, y);
                    rp.setAllLinkCoordinates();
                }

                for (let i = 0; i < self.subgroups.length; i++) {
                    const sg = self.subgroups[i];
                    if (!sg.expanded) {
                        const x = collapsedSubgroupXPositionInterpolations[i](cubicInOut(interp));
                        const y = collapsedSubgroupYPositionInterpolations[i](cubicInOut(interp));
                        sg.setPosition(x, y);
                    } else {
                        sg.updateExpandedGroup();
                    }
                }

                self.updateExpandedGroup();
                return false;
            }
        }
    }

    hideSubgroups() {
        for (let subgroup of this.subgroups) {
            subgroup.setHidden(true);
        }
    }

    showSubgroups() {
        for (let subgroup of this.subgroups) {
            if (!subgroup.inCollapsedGroup()) {
                subgroup.setHidden(false);
            }
        }
    }

    // update all lines (e.g after a move)
    setAllLinkCoordinates() {
        for (let rp of this.renderedProteins) {
            rp.setAllLinkCoordinates();
        }
    }

    addConnectedNodes (subgraph) {
        for (let p of this.renderedProteins) {
            for (let link of p.renderedP_PLinks.values()) {
                //visible, non-self links only
                if (link.renderedFromProtein !== link.renderedToProtein && link.isPassingFilter()) {
                    if (!subgraph.links.has(link.id)) {
                        subgraph.links.set(link.id, link);
                        let otherEnd;
                        if (link.renderedFromProtein === this) {
                            otherEnd = link.renderedToProtein;
                        } else {
                            otherEnd = link.renderedFromProtein;
                        }
                        // if (otherEnd !== null) {
                        const renderedOtherEnd = otherEnd.getRenderedInteractor();
                        renderedOtherEnd.subgraph = subgraph;
                        //if (!subgraph.nodes.has(renderedOtherEnd.id)) {
                        subgraph.nodes.set(renderedOtherEnd.id, renderedOtherEnd);
                        otherEnd.subgraph = subgraph;
                        otherEnd.addConnectedNodes(subgraph);
                        //}
                        // }
                    }
                }
            }
        }
        return subgraph;
    }

    countExternalLinks () {
        // return this.renderedP_PLinks.length;
        const renderedParticipantsLinkedTo = new Set();

        for (let link of this.subgraph.links.values()) {
            const rp = link.getOtherEnd(this);
            renderedParticipantsLinkedTo.add(rp);
        }



        // //let countExternal = 0;
        // for (let link of this.renderedP_PLinks) {
        //     if (link.crosslinks[0].isSelfLink() === false)
        //     {
        //         if (link.isPassingFilter()) {
        //             //countExternal++;
        //             renderedParticipantsLinkedTo.add(link.getOtherEnd(this).getRenderedInteractor());
        //         }
        //     }
        // }
        return renderedParticipantsLinkedTo.size;

    }
}

import * as _ from "underscore";

import {Interactor} from "./interactor";
import {Rotator} from "./rotator";
import {CrosslinkViewer} from "../crosslink-viewer-BB";
import d3 from "d3";
import {makeTooltipContents, makeTooltipTitle} from "../../../ui-utils/make-tooltip";
import {rotatePointAboutPoint, trig} from "../trig";

/**
 * Represents a rendered protein in the xiNET visualization.
 * Handles protein visualization in both collapsed (circle) and expanded (stick) forms.
 * Supports rotation, scaling, annotations, and interaction with crosslinks.
 */
export class RenderedProtein extends Interactor {

    /**
     * Creates a new RenderedProtein instance.
     *
     * @param {Object} protein - The protein data backbone-models object
     * @param {CrosslinkViewer} controller - The parent crosslink viewer controller
     */
    constructor(protein, controller) {
        super(controller);
        this.protein = protein;
        this.busy = false;
        this.renderedP_PLinks = [];
        this.renderedCrosslinks = [];
        this.parentGroups = new Set();
        // layout info
        this.ix = 300;
        this.iy = 40;
        this.rotation = 0;
        this.expanded = false;
        this.hidden = false;
        this.isFlipped = false;
        // this.isSelected = false;
        // this.isHighlighted = false;
        this.createElements();
    }

    createElements() {
        //'rotators'
        this.lowerRotator = new Rotator(this, 0, this.controller);
        this.upperRotator = new Rotator(this, 1, this.controller);

        /*
         * Lower group
         * svg group for elements that appear underneath links
         */
        this.lowerGroup = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.lowerGroup.setAttribute("class", "protein lowerGroup");
        //make highlight
        this.highlight = document.createElementNS(CrosslinkViewer.svgns, "rect");
        d3.select(this.highlight).attr("fill-opacity", "0").attr("stroke-width", "5");
        this.lowerGroup.appendChild(this.highlight);
        //make background
        this.background = document.createElementNS(CrosslinkViewer.svgns, "rect");
        this.lowerGroup.appendChild(this.background);
        //domains in rectangle form (shown underneath links)
        this.rectDomains = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.rectDomains.setAttribute("opacity", "0");
        this.lowerGroup.appendChild(this.rectDomains);
        this.peptides = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.lowerGroup.appendChild(this.peptides);

        /*
         * Upper group
         * svg group for elements that appear above links
         */
        this.upperGroup = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.upperGroup.setAttribute("class", "protein upperGroup");
        //svg groups for self links
        this.selfLinksHighlights = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.selfLinks = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.upperGroup.appendChild(this.selfLinksHighlights);
        this.upperGroup.appendChild(this.selfLinks);

        //create label - we will move this svg element around when protein form changes
        this.labelSVG = document.createElementNS(CrosslinkViewer.svgns, "text");
        d3.select(this.labelSVG).attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .attr("fill", this.protein.is_decoy ? "#FB8072" : "black")
            .attr("x", 0)
            .attr("y", 0)
            .classed("protein xlv_text proteinLabel", true);
        this.labelTextNode = document.createTextNode(this.protein.name);
        this.updateName();
        this.labelSVG.appendChild(this.labelTextNode);

        //ticks (and animo acid letters)
        this.ticks = document.createElementNS(CrosslinkViewer.svgns, "g");

        //make outline
        //http://stackoverflow.com/questions/17437408/how-do-i-change-a-circle-to-a-square-using-d3
        this.outline = document.createElementNS(CrosslinkViewer.svgns, "rect");
        d3.select(this.outline).attr("stroke", "black")
            .attr("stroke-width", "1")
            .attr("fill", "#EEEEEE");
        this.upperGroup.appendChild(this.outline);
        this.upperGroup.appendChild(this.ticks);
        //domains as pie slices - shown on top of everything
        this.circDomains = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.circDomains.setAttribute("opacity", "1");
        this.upperGroup.appendChild(this.circDomains);
        this.upperGroup.appendChild(this.labelSVG);

        this.scaleLabels = [];

        this.toCircle(null, false);

        // events
        const self = this;
        this.upperGroup.onmousedown = function (evt) {
            self.mouseDown(evt);
        };
        this.upperGroup.onmouseover = function (evt) {
            self.mouseOver(evt);
        };
        this.upperGroup.onmouseout = function (evt) {
            self.mouseOut(evt);
        };

        //going to use right click ourselves
        this.upperGroup.oncontextmenu = function (evt) {
            // if (evt.preventDefault) {
            evt.preventDefault();
            // }
            return false;
        };
    }

    get proteins() {
        return [this.protein];
    }

    get bBox() {
        return this.upperGroup.getBBox();
        // return {
        //     x:this.ix - 30,
        //     y: this.iy - 30,
        //     width: this.width,
        //     height: this.height
        // };
    }

    get width() {
        const approxLabelWidth = 10 * (this.labelText.length + 2);
        if (!this.expanded) {
            return (approxLabelWidth > this.symbolRadius) ? approxLabelWidth : this.symbolRadius + 20;//this.upperGroup.getBBox().width + 10;
        } else {
            return (this.protein.size * this.stickZoom) + approxLabelWidth;
        }
    }

    get height() {
        return 50;
    }

    get symbolRadius() {
        if (this.controller.fixedSize) {
            return 10;
        } else {
            return Math.sqrt(this.protein.size / Math.PI) * 0.6;
        }
    }

    //when we get here all prot's have been created and defaultBarScale will have value
    //this is called by loadLayout function
    setEverything() {
        this.busy = false;
        if (!this.stickZoom) {
            this.stickZoom = this.controller.defaultBarScale;
        }
        // this.showHighlight(this.isHighlighted);
        // this.setSelected(this.isSelected);
        this.setPositionFromXinet(this.ix, this.iy);
        this.scale();
        this.setAllLinkCoordinates();
        if (this.newForm === true) { //hacky?
            this.toStickNoTransition();
        }
    }

    updateName() {
        //choose label text
        if (!this.controller.cropLabels) {
            this.labelText = this.protein.name;
        } else {
            this.labelText = this.protein.name.split("_")[0];
        }
        if (this.labelText.length > 25) {
            this.labelText = this.labelText.substr(0, 16) + "...";
        }
        this.labelTextNode.textContent = this.labelText;
    }

    mouseOver(evt) {
        this.controller.model.setHighlightedProteins([this.protein]);
        if (!this.controller.dragElement) {
            const p = this.controller.getEventPoint(evt);
            this.controller.model.get("tooltipModel")
                .set("header", makeTooltipTitle.protein(this.protein))
                .set("contents", makeTooltipContents.protein(this.protein))
                .set("location", {
                    pageX: p.x,
                    pageY: p.y
                });
        }
    }

    resize() {
        if (!this.expanded) {
            const r = this.symbolRadius;
            d3.select(this.outline)
                .attr("x", -r).attr("y", -r)
                .attr("width", r * 2).attr("height", r * 2)
                .attr("rx", r).attr("ry", r);
            d3.select(this.background)
                .attr("x", -r).attr("y", -r)
                .attr("width", r * 2).attr("height", r * 2)
                .attr("rx", r).attr("ry", r);
            d3.select(this.highlight)
                .attr("width", (r * 2) + 5).attr("height", (r * 2) + 5)
                .attr("x", -r - 2.5).attr("y", -r - 2.5)
                .attr("rx", r + 2.5).attr("ry", r + 2.5);
            this.labelSVG.setAttribute("transform", "translate(" + (-(r + 5)) + "," + "-5)");
            for (let ppLink of this.renderedP_PLinks) {
                if (ppLink.crosslinks[0].isSelfLink() && ppLink.shown) {
                    ppLink.initSelfLinkSVG();
                }
            }
        }
    }

    //only output the info needed to reproduce the layout, used by save layout function
    toJSON() {
        return {
            id: this.protein.id,
            x: this.ix,
            y: this.iy,
            rot: this.rotation,
            expanded: this.expanded,
            stickZoom: this.stickZoom,
            flipped: this.isFlipped,
            manuallyHidden: this.protein.manuallyHidden,
            name: this.protein.name // having this here is bit of hack
        };
    }

    /**
     * Sets the rotation angle of the protein.
     * Updates SVG transforms and adjusts label orientation to keep it readable.
     *
     * @param {number} angle - The rotation angle in degrees
     */
    setRotation(angle) {
        this.rotation = angle % 360;
        if (this.rotation < 0) {
            this.rotation += 360;
        }
        this.upperGroup.setAttribute("transform", "translate(" + this.ix + " " + this.iy + ")" +
            " scale(" + (this.controller.z) + ") " + "rotate(" + this.rotation + ")");
        this.lowerGroup.setAttribute("transform", "translate(" + this.ix + " " + this.iy + ")" +
            " scale(" + (this.controller.z) + ") " + "rotate(" + this.rotation + ")");

        const svg = this.controller.svgElement;
        const transformToContainingGroup = this.labelSVG.getAttribute("transform");
        const labelTransform = d3.transform(transformToContainingGroup);
        const sll = this.scaleLabels.length;
        if (this.rotation >= 90 && this.rotation < 270) {
            const k = svg.createSVGMatrix()
                .translate(Math.abs(labelTransform.translate[0]), 0)
                .rotate(180, 0, 0);
            this.labelSVG.transform.baseVal.initialize(svg.createSVGTransformFromMatrix(k));
            if (this.expanded) {
                for (let i = 0; i < sll; i++) {
                    this.scaleLabels[i].setAttribute("transform", "scale(-1,1)");
                }
                this.ticks.setAttribute("transform", "scale(1,-1)");
            }
        } else {
            const k = svg.createSVGMatrix()
                .translate(-(Math.abs(labelTransform.translate[0])), 0);
            this.labelSVG.transform.baseVal.initialize(svg.createSVGTransformFromMatrix(k));
            if (this.expanded) {
                for (let j = 0; j < sll; j++) {
                    this.scaleLabels[j].setAttribute("transform", "scale(1,1)");
                }
                this.ticks.setAttribute("transform", "scale(1,1)");
            }
        }
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
        this.updateExpandedGroup();
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
            xOffset = (this.width / 2 - (this.symbolRadius) + 5);
            //     // if (this.expanded) {
            //     //   xOffset = xOffset + (this.protein.size / 2 * this.stickZoom );
            //     // }
        }
        this.x = ix - xOffset;
        this.y = iy;
        this.setPosition(ix, iy);
        this.updateExpandedGroup();
    }

    // more accurately described as setting transform for top svg elements (sets scale also)
    setPosition(ix, iy) {
        this.ix = ix;
        this.iy = iy;
        if (this.expanded) {
            this.upperGroup.setAttribute("transform", "translate(" + this.ix + " " + this.iy + ")" +
                " scale(" + (this.controller.z) + ") " + "rotate(" + this.rotation + ")");
            this.lowerGroup.setAttribute("transform", "translate(" + this.ix + " " + this.iy + ")" +
                " scale(" + (this.controller.z) + ") " + "rotate(" + this.rotation + ")");
        } else {
            this.upperGroup.setAttribute("transform", "translate(" + this.ix + " " + this.iy + ")" +
                " scale(" + (this.controller.z) + ") ");
            this.lowerGroup.setAttribute("transform", "translate(" + this.ix + " " + this.iy + ")" +
                " scale(" + (this.controller.z) + ") ");
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
        }
    }

    updateExpandedGroup() {
        for (let group of this.parentGroups) {
            if (group.expanded && !this.hidden) {
                group.updateExpandedGroup();
            }
        }
    }

    setStickScale(scale, svgP) {
        const oldScale = this.stickZoom;

        //dist from centre
        const dx = (this.ix - svgP.x);
        const dy = (this.iy - svgP.y);

        // new dist from centre
        const nx = dx * scale / oldScale;
        const ny = dy * scale / oldScale;

        //required change
        const rx = nx - dx;
        let ry = ny - dy;

        if (this.rotation === 0 || this.rotation === 180) {
            ry = 0;
        }

        //new pos
        const x = this.ix + rx;
        const y = this.iy + ry;

        this.stickZoom = scale;
        this.scale();
        this.setPositionFromXinet(x, y);
        this.setAllLinkCoordinates();
    }

    scale() {
        d3.select(this.peptides).attr("transform", "scale(" + (this.stickZoom) + ", 1)");
        const protLength = (this.protein.size) * this.stickZoom;
        if (this.expanded) {
            const labelWidth = this.labelSVG.getBBox().width;
            const labelTransform = d3.transform(this.labelSVG.getAttribute("transform"));
            const k = this.controller.svgElement.createSVGMatrix().rotate(labelTransform.rotate)
                .translate((-(((this.protein.size / 2) * this.stickZoom) + +(labelWidth / 2) + 10)), 0);
            this.labelSVG.transform.baseVal.initialize(this.controller.svgElement.createSVGTransformFromMatrix(k));
            if (this.annotations) {
                for (let anno of this.annotations.values()) {
                    const feature = anno.feature;
                    anno.pieSlice.setAttribute("d", this.getAnnotationRectPath(feature));
                    anno.colouredRect.setAttribute("d", this.getAnnotationRectPath(feature));
                }
            }

            d3.select(this.outline)
                .attr("width", protLength)
                .attr("x", this.getResXwithStickZoom(0.5));
            d3.select(this.background)
                .attr("width", protLength)
                .attr("x", this.getResXwithStickZoom(0.5));

            d3.select(this.highlight)
                .attr("width", protLength + 5)
                .attr("x", this.getResXwithStickZoom(0.5) - 2.5);

            this.placeRotators();

            for (let residueLink of this.renderedCrosslinks) {
                if (residueLink.crosslink.isSelfLink() || residueLink.crosslink.isMonoLink()) {
                    const path = this.getCrossLinkPath(residueLink);
                    d3.select(residueLink.line).attr("d", path);
                    d3.select(residueLink.highlightLine).attr("d", path);
                }
            }

            this.setScaleGroup();
            this.setRotation(this.rotation); // places ticks and rotators
        }
    }

    placeRotators() {
        //place rotators
        this.lowerRotator.svg.setAttribute("transform",
            "translate(" + (this.getResXwithStickZoom(0.5) - RenderedProtein.rotOffset) + " 0)");
        this.upperRotator.svg.setAttribute("transform",
            "translate(" + (this.getResXwithStickZoom(this.protein.size - 0 + 0.5) + RenderedProtein.rotOffset) + " 0)");
    }

    setScaleGroup() {
        d3.select(this.ticks).selectAll("*").remove();

        this.scaleLabels = [];
        // const ScaleMajTick = 100;
        const ScaleTicksPerLabel = 2; // varies with scale?
        let tick = -1;
        const lastTickX = this.getResXwithStickZoom(this.protein.size);

        for (let res = 1; res <= this.protein.size; res++) {
            if (res === 1 ||
                ((res % 100 === 0) && (200 * this.stickZoom > RenderedProtein.minXDist)) ||
                ((res % 10 === 0) && (20 * this.stickZoom > RenderedProtein.minXDist))
            ) {
                const tx = this.getResXwithStickZoom(res);
                if (this.stickZoom >= 8 || res !== 1) {
                    tickAt(this, tx);
                }
                tick = (tick + 1) % ScaleTicksPerLabel;
                // does this one get a label?
                if (tick === 0) { // && tx > 20) {
                    if ((tx + RenderedProtein.minXDist) < lastTickX) {
                        scaleLabelAt(this, res, tx);
                    }
                }
            }
            if (this.stickZoom >= 8 && this.protein.sequence) {
                const seqLabelGroup = document.createElementNS(CrosslinkViewer.svgns, "g");
                seqLabelGroup.setAttribute("transform", "translate(" + this.getResXwithStickZoom(res) + " " + 0 + ")");
                const seqLabel = document.createElementNS(CrosslinkViewer.svgns, "text");
                seqLabel.setAttribute("font-family", "monospace");
                seqLabel.setAttribute("font-size", "10px");
                seqLabel.setAttribute("text-anchor", "middle");
                seqLabel.setAttribute("x", "0");
                seqLabel.setAttribute("y", "3");
                seqLabel.appendChild(document.createTextNode(this.protein.sequence[res - 1]));
                seqLabelGroup.appendChild(seqLabel);
                this.scaleLabels.push(seqLabel);
                this.ticks.appendChild(seqLabelGroup);
            }
        }
        scaleLabelAt(this, this.protein.size, lastTickX);
        if (this.stickZoom >= 8) {
            tickAt(this, lastTickX);
        }

        function scaleLabelAt(self, text, tickX) {
            const scaleLabelGroup = document.createElementNS(CrosslinkViewer.svgns, "g");
            scaleLabelGroup.setAttribute("transform", "translate(" + tickX + " " + 0 + ")");
            const scaleLabel = document.createElementNS(CrosslinkViewer.svgns, "text");
            scaleLabel.setAttribute("class", "xinetAxisLabel");
            scaleLabel.setAttribute("font-family", "monospace");
            scaleLabel.setAttribute("font-size", "14");
            scaleLabel.setAttribute("text-anchor", "middle");
            scaleLabel.setAttribute("x", "0");
            scaleLabel.setAttribute("y", (RenderedProtein.STICKHEIGHT + 4).toString());
            scaleLabel.appendChild(document.createTextNode(text));
            scaleLabelGroup.appendChild(scaleLabel);
            self.scaleLabels.push(scaleLabel);
            self.ticks.appendChild(scaleLabelGroup);
        }

        function tickAt(self, tickX) {
            const tick = document.createElementNS(CrosslinkViewer.svgns, "line");
            tick.setAttribute("x1", tickX);
            tick.setAttribute("y1", "5");
            tick.setAttribute("x2", tickX);
            tick.setAttribute("y2", "10");
            tick.setAttribute("stroke", "black");
            self.ticks.appendChild(tick);
        }
    }

    toggleFlipped() {
        this.isFlipped = !this.isFlipped;
        if (this.isFlipped) {
            this.selfLinks.setAttribute("transform", "scale (1 -1)");
            this.selfLinksHighlights.setAttribute("transform", "scale (1 -1)");
        } else {
            this.selfLinks.setAttribute("transform", "scale (1 1)");
            this.selfLinksHighlights.setAttribute("transform", "scale (1 1)");
        }
    }

    setHidden(bool) {
        // MJG
        d3.select(this.upperGroup).style("display", bool ? "none" : null);
        d3.select(this.lowerGroup).style("display", bool ? "none" : null);
        this.hidden = !!bool;
    }

    setExpanded(expanded, svgP) {
        this.controller.model.get("tooltipModel").set("contents", null);
        if (this.busy !== true) {
            if (expanded) {
                if (this.expanded !== expanded) {
                    this.toStick();
                }
            } else {
                if (this.expanded !== expanded) {
                    this.toCircle(svgP);
                }
            }
        }
    }

    /**
     * Transitions the protein from stick (expanded) to circle (collapsed) form.
     *
     * @param {Object} svgP - Optional SVG point to collapse towards {x, y}
     * @param {boolean} [transition=true] - Whether to animate the transition
     */
    toCircle(svgP, transition = true) {
        const transitionTime = transition ? RenderedProtein.transitionTime : 0; //this maybe isn't so good

        this.busy = true;
        CrosslinkViewer.removeDomElement(this.lowerRotator.svg);
        CrosslinkViewer.removeDomElement(this.upperRotator.svg);

        // const protLength = this.protein.size * this.stickZoom;
        const r = this.symbolRadius;
        const protColourModel = this.controller.model.get("proteinColourAssignment");

        if (transition) {
            d3.select(this.outline).transition()
                .attr("fill-opacity", 1)
                .attr("fill", protColourModel.getColour(this.protein))
                .attr("x", -r).attr("y", -r)
                .attr("width", r * 2).attr("height", r * 2)
                .attr("rx", r).attr("ry", r)
                .duration(transitionTime);

            d3.select(this.background).transition()
                .attr("fill-opacity", 1)
                .attr("fill", protColourModel.getColour(this.protein))
                .attr("x", -r).attr("y", -r)
                .attr("width", r * 2).attr("height", r * 2)
                .attr("rx", r).attr("ry", r)
                .duration(transitionTime);

            d3.select(this.rectDomains).transition().attr("opacity", 0)
                .attr("transform", "scale(1, 1)")
                .duration(transitionTime);

            d3.select(this.circDomains).transition().attr("opacity", 1)
                .attr("transform", "scale(1, 1)")
                .duration(transitionTime);
        } else {
            d3.select(this.outline)
                .attr("fill-opacity", 1)
                .attr("fill", protColourModel.getColour(this.protein))
                .attr("x", -r).attr("y", -r)
                .attr("width", r * 2).attr("height", r * 2)
                .attr("rx", r).attr("ry", r);

            d3.select(this.background)
                .attr("fill-opacity", 1)
                .attr("fill", protColourModel.getColour(this.protein))
                .attr("x", -r).attr("y", -r)
                .attr("width", r * 2).attr("height", r * 2)
                .attr("rx", r).attr("ry", r);

            d3.select(this.rectDomains).attr("opacity", 0)
                .attr("transform", "scale(1, 1)");

            d3.select(this.circDomains).attr("opacity", 1)
                .attr("transform", "scale(1, 1)");
        }


        const stickZoomInterpol = d3.interpolate(this.stickZoom, 0);
        const rotationInterpol = d3.interpolate((this.rotation > 180) ? this.rotation - 360 : this.rotation, 0);
        //todo: should take current transform of label as start
        const labelTransform = d3.transform(this.labelSVG.getAttribute("transform"));
        const labelStartPoint = labelTransform.translate[0]; //-(((this.protein.size / 2) * this.stickZoom) + 10);
        const labelTranslateInterpol = d3.interpolate(labelStartPoint, 0); //-(r + 5));

        let xInterpol = null,
            yInterpol = null;
        if (typeof svgP !== "undefined" && svgP !== null) {
            xInterpol = d3.interpolate(this.ix, svgP.x);
            yInterpol = d3.interpolate(this.iy, svgP.y);
        }

        const self = this;
        if (transition) {
            d3.select(this.ticks).transition().attr("opacity", 0).duration(transitionTime / 4)
                .each("end",
                    function () {
                        d3.select(this).selectAll("*").remove();
                    }
                );
            d3.select(this.highlight).transition()
                .attr("width", (r * 2) + 5).attr("height", (r * 2) + 5)
                .attr("x", -r - 2.5).attr("y", -r - 2.5)
                .attr("rx", r + 2.5).attr("ry", r + 2.5)
                .duration(transitionTime);
            const aggSelfLinkPath = this.getAggregateSelfLinkPath();
            for (let residueLink of this.renderedCrosslinks) {
                const crosslinkPath = this.getCrossLinkPath(residueLink);
                const lineSel = d3.select(residueLink.line);
                if (residueLink.crosslink.isSelfLink()) {
                    lineSel.attr("d", crosslinkPath);
                    lineSel.transition().attr("d", aggSelfLinkPath)
                        .duration(transitionTime);
                    const highlightLineSel = d3.select(residueLink.highlightLine);
                    highlightLineSel.attr("d", crosslinkPath);
                    highlightLineSel.transition().attr("d", aggSelfLinkPath)
                        .duration(transitionTime);
                } else if (residueLink.crosslink.isMonoLink()) {
                    lineSel.attr("d", crosslinkPath);
                    lineSel.transition().attr("d", "M 0,0 L 0,0 L 0,0 L 0,0")
                        .duration(transitionTime);
                    const highlightLineSel = d3.select(residueLink.highlightLine);
                    highlightLineSel.attr("d", crosslinkPath);
                    highlightLineSel.transition().attr("d", "M 0,0 L 0,0 L 0,0 L 0,0")
                        .duration(transitionTime);
                }
            }

            if (this.annotations) {
                const annotArr = Array.from(this.annotations.values());
                const annotationCount = annotArr.length;
                for (let a = 0; a < annotationCount; a++) {
                    const anno = annotArr[a],
                        feature = anno.feature,
                        pieSlice = anno.pieSlice,
                        rectDomain = anno.colouredRect;
                    if (feature.type !== RenderedProtein.disulfide) {
                        if (transition) {
                            d3.select(pieSlice).transition().attr("d", this.getAnnotationPieSliceApproximatePath(feature))
                                .duration(transitionTime).each("end",
                                    function () {
                                        for (let b = 0; b < annotationCount; b++) {
                                            const annoB = annotArr[b];
                                            if (this === annoB.pieSlice) {
                                                d3.select(this).attr("d", self.getAnnotationPieSliceArcPath(annoB.feature));
                                            }
                                        }
                                    }
                                );

                            d3.select(rectDomain).transition().attr("d", self.getAnnotationPieSliceApproximatePath(feature))
                                .duration(transitionTime);
                        } else {
                            for (let b = 0; b < annotationCount; b++) {
                                const annoB = annotArr[b];
                                if (this === annoB.pieSlice) {
                                    d3.select(this).attr("d", self.getAnnotationPieSliceArcPath(annoB.feature));
                                }
                            }
                        }
                    } else {
                        d3.select(pieSlice).transition().attr("d", this.getDisulfidAnnotationCircPath(feature))
                            .duration(transitionTime);
                        d3.select(rectDomain).transition().attr("d", self.getDisulfidAnnotationRectPath(feature))
                            .duration(transitionTime);
                    }
                }
            }
        } else {
            d3.select(this.ticks).selectAll("*").remove();
            d3.select(this.highlight)
                .attr("width", (r * 2) + 5).attr("height", (r * 2) + 5)
                .attr("x", -r - 2.5).attr("y", -r - 2.5)
                .attr("rx", r + 2.5).attr("ry", r + 2.5);
        }

        const originalStickZoom = this.stickZoom;
        const originalRotation = this.rotation;
        const cubicInOut = d3.ease("cubic-in-out");
        if (transition) {
            d3.timer(function (elapsed) {
                return update(elapsed / transitionTime);
            });
        } else {
            update(1);
        }

        function update(interp) {
            const labelTransform = d3.transform(self.labelSVG.getAttribute("transform"));
            const k = self.controller.svgElement.createSVGMatrix().rotate(labelTransform.rotate).translate(labelTranslateInterpol(cubicInOut(interp)), 0);
            if (self.labelSVG.transform) self.labelSVG.transform.baseVal.initialize(self.controller.svgElement.createSVGTransformFromMatrix(k));
            if (xInterpol !== null) {
                // noinspection JSValidateTypes
                self.setPositionFromXinet(xInterpol(cubicInOut(interp)), yInterpol(cubicInOut(interp)));
            }
            const rot = rotationInterpol(cubicInOut(interp));
            self.stickZoom = stickZoomInterpol(cubicInOut(interp));
            self.setRotation(rot);

            self.setAllLinkCoordinates();

            if (interp === 1) { // finished - tidy up
                //bring in new
                self.expanded = false;
                for (let rcl of self.renderedCrosslinks) {
                    rcl.check();
                }
                for (let pl of self.renderedP_PLinks) {
                    pl.update();
                }
                self.stickZoom = originalStickZoom;
                self.rotation = originalRotation;
                self.busy = false;

                // not needed coz setPosition gets called above
                // if (this.complex) {
                //     this.complex.updateExpandedGroup();
                // }

                return true;
            } else if (interp > 1 || isNaN(interp)) {
                return update(1);
            } else {
                return false;
            }
        }
    }

    /**
     * Transitions the protein from circle (collapsed) to stick (expanded) form.
     *
     * @param {boolean} [transition=true] - Whether to animate the transition
     */
    toStick(transition = true) {
        const transitionTime = transition ? RenderedProtein.transitionTime : 0;

        this.busy = true;
        this.expanded = true;

        //place rotators
        this.upperGroup.appendChild(this.lowerRotator.svg);
        this.upperGroup.appendChild(this.upperRotator.svg);
        this.placeRotators();

        const protLength = this.protein.size * this.stickZoom;
        const r = this.symbolRadius;

        const lengthInterpol = d3.interpolate((2 * r), protLength);
        const stickZoomInterpol = d3.interpolate(0, this.stickZoom);
        const rotationInterpol = d3.interpolate(0, (this.rotation > 180) ? this.rotation - 360 : this.rotation);
        const labelWidth = this.labelSVG.getBBox().width;
        const labelTranslateInterpol = d3.interpolate(0 /*-(r + 5)*/, -(((this.protein.size / 2) * this.stickZoom) + (labelWidth / 2) + 10));

        const origStickZoom = this.stickZoom;
        this.stickZoom = 0;
        this.checkLinks();
        this.stickZoom = origStickZoom;

        const protColourModel = this.controller.model.get("proteinColourAssignment");

        d3.select(this.circDomains).transition().attr("opacity", 0).duration(transitionTime);
        d3.select(this.rectDomains).transition().attr("opacity", 1).duration(transitionTime);

        d3.select(this.outline).transition().attr("stroke-opacity", 1)
            .attr("fill-opacity", 0)
            .attr("fill", protColourModel.getColour(this.protein))
            .attr("height", RenderedProtein.STICKHEIGHT)
            .attr("y", -RenderedProtein.STICKHEIGHT / 2)
            .attr("rx", 0).attr("ry", 0)
            .duration(transitionTime);

        d3.select(this.background).transition().attr("stroke-opacity", 1)
            .attr("fill", protColourModel.getColour(this.protein))
            .attr("height", RenderedProtein.STICKHEIGHT)
            .attr("y", -RenderedProtein.STICKHEIGHT / 2)
            .attr("rx", 0).attr("ry", 0)
            .duration(transitionTime);

        d3.select(this.highlight).transition()
            .attr("width", protLength + 5).attr("height", RenderedProtein.STICKHEIGHT + 5)
            .attr("x", this.getResXwithStickZoom(0.5) - 2.5).attr("y", (-RenderedProtein.STICKHEIGHT / 2) - 2.5)
            .attr("rx", 0).attr("ry", 0)
            .duration(transitionTime);

        const aggSelfLinkPath = this.getAggregateSelfLinkPath();
        for (let residueLink of this.renderedCrosslinks) {
            const crosslinkPath = this.getCrossLinkPath(residueLink);
            const lineSel = d3.select(residueLink.line);
            const highlightLineSel = d3.select(residueLink.highlightLine);
            if (residueLink.crosslink.isSelfLink()) {
                lineSel.attr("d", aggSelfLinkPath);
                lineSel.transition().attr("d", crosslinkPath)
                    .duration(transitionTime);
                highlightLineSel.attr("d", aggSelfLinkPath);
                highlightLineSel.transition().attr("d", crosslinkPath)
                    .duration(transitionTime);
            } else if (residueLink.crosslink.isMonoLink()) {
                lineSel.attr("d", "M 0,0 L 0,0 L 0,0 L 0,0");
                lineSel.transition().attr("d", crosslinkPath)
                    .duration(RenderedProtein.transitionTime);
                highlightLineSel.attr("d", "M 0,0 L 0,0 L 0,0 L 0,0");
                highlightLineSel.transition().attr("d", crosslinkPath)
                    .duration(transitionTime);
            }
        }

        if (this.annotations) {
            for (let anno of this.annotations.values()) {
                const feature = anno.feature,
                    pieSlice = anno.pieSlice,
                    rectDomain = anno.colouredRect;

                if (feature.type !== RenderedProtein.disulfide) {
                    pieSlice.setAttribute("d", this.getAnnotationPieSliceApproximatePath(feature));
                    d3.select(pieSlice).transition().attr("d", this.getAnnotationRectPath(feature))
                        .duration(transitionTime);
                    d3.select(rectDomain).transition().attr("d", this.getAnnotationRectPath(feature))
                        .duration(RenderedProtein.transitionTime);
                } else {
                    d3.select(pieSlice).transition().attr("d", this.getDisulfidAnnotationRectPath(feature))
                        .duration(transitionTime);
                    d3.select(rectDomain).transition().attr("d", this.getDisulfidAnnotationRectPath(feature))
                        .duration(transitionTime);

                }
            }
        }

        const self = this;
        const cubicInOut = d3.ease("cubic-in-out");
        if (transition) {
            d3.timer(function (elapsed) {
                return update(elapsed / transitionTime);
            });
        } else {
            update(1);
        }

        //~ update(1);

        function update(interp) {
            const labelTransform = d3.transform(self.labelSVG.getAttribute("transform"));
            const k = self.controller.svgElement.createSVGMatrix().rotate(labelTransform.rotate).translate(labelTranslateInterpol(cubicInOut(interp)), 0);
            self.labelSVG.transform.baseVal.initialize(self.controller.svgElement.createSVGTransformFromMatrix(k));

            const rot = rotationInterpol(cubicInOut(interp));
            self.setRotation(rot);

            const currentLength = lengthInterpol(cubicInOut(interp));
            d3.select(self.outline).attr("width", currentLength).attr("x", -(currentLength / 2) + (0.5 * self.stickZoom));
            d3.select(self.background).attr("width", currentLength).attr("x", -(currentLength / 2) + (0.5 * self.stickZoom));
            self.stickZoom = stickZoomInterpol(cubicInOut(interp));
            self.setAllLinkCoordinates();

            for (let group of self.parentGroups) {
                group.updateExpandedGroup();
            }

            if (interp === 1) { // finished - tidy up
                self.busy = false;
                return true;
            } else if (interp > 1 || isNaN(interp)) {
                return update(1);
            } else {
                return false;
            }
        }

        d3.select(this.ticks).attr("opacity", 0);
        this.setScaleGroup();
        d3.select(this.ticks).transition().attr("opacity", 1)
            .delay(transitionTime * 0.8).duration(transitionTime / 2);
    }

    toStickNoTransition() {
        this.toStick(false);
    }

    /**
     * Generates the SVG path for a crosslink in stick form.
     * Creates different path types for mono-links, loop-links, and regular crosslinks.
     *
     * @param {RenderedCrosslink} renderedCrossLink - The crosslink to generate path for
     * @returns {string} SVG path data string
     */
    getCrossLinkPath(renderedCrossLink) {
        const x1 = this.getResXwithStickZoom(renderedCrossLink.crosslink.fromResidue);
        let baseLine = 0;
        if (this.stickZoom >= 8) {
            baseLine = -5;
        }

        // following draws little flags
        if (renderedCrossLink.crosslink.isMonoLink()) { //linker modified peptide
            // if (renderedCrossLink.ambig === false) {
            //     renderedCrossLink.line.setAttribute("fill", "red"); //xiNET.defaultSelfLinkColour.toRGB());
            // }
            const p1 = [x1, 26];
            const p3 = [x1, 18];
            const p2 = rotatePointAboutPoint(p1, p3, 60);
            baseLine = baseLine * -1;
            return "M " + x1 + "," + baseLine +
                " L " + p1[0] + "," + p1[1] +
                " L " + p2[0] + "," + p2[1] +
                " L " + p3[0] + "," + p3[1];
        } else {

            const x2 = this.getResXwithStickZoom(renderedCrossLink.crosslink.toResidue);
            let height, cp1, cp2, arcStart, arcEnd, arcRadius;
            arcRadius = (Math.abs(x2 - x1)) / 2;
            height = -((RenderedProtein.STICKHEIGHT / 2) + 3);
            if (arcRadius < 15) {
                height = -28 + arcRadius;
            }

            const start = [x1, baseLine];
            const end = [x2, baseLine];

            //~ // draws a a little triangle for *truly* intraMolecular - e.g. internally linked peptides
            //~ // not in use
            if (renderedCrossLink.crosslink.isLoopLink() === true) {
                var curveMidX = x1 + ((x2 - x1) / 2);
                arcStart = [curveMidX, height - arcRadius];
                arcEnd = [curveMidX, height - arcRadius];
                cp1 = [curveMidX, height - arcRadius];
                cp2 = [curveMidX, height - arcRadius];
            } else if (renderedCrossLink.crosslink.confirmedHomomultimer) {
                const curveMidX = x1 + ((x2 - x1) / 2);
                arcStart = [curveMidX, height - arcRadius];
                arcEnd = [curveMidX, height - arcRadius];
                cp1 = rotatePointAboutPoint([x1, height - arcRadius], start, -20);
                cp2 = rotatePointAboutPoint([x2, height - arcRadius], end, 20);

                //flip
                start[1] = start[1] * -1;
                cp1[1] = cp1[1] * -1;
                arcStart[1] = arcStart[1] * -1;
                arcEnd[1] = arcEnd[1] * -1;
                cp2[1] = cp2[1] * -1;
                end[1] = end[1] * -1;

            } else {
                cp1 = [x1, height];
                cp2 = [x2, baseLine];
                arcStart = [x1, height];
                arcEnd = [x2, height];
            }

            return " M " + start[0] + "," + start[1] +
                " Q " + cp1[0] + "," + cp1[1] + " " + arcStart[0] + "," + arcStart[1] +
                " A " + arcRadius + "," + arcRadius + "  0 0 1 " + arcEnd[0] + "," + arcEnd[1] +
                " Q " + cp2[0] + "," + cp2[1] + " " + end[0] + "," + end[1];

        }
    }

    /**
     * Calculates the x-coordinate of a residue in the stick representation.
     * Coordinates are relative to the center of the protein.
     *
     * @param {number} r - The residue number
     * @returns {number} The x-coordinate scaled by stickZoom
     */
    getResXwithStickZoom(r) {
        return (r - (this.protein.size / 2)) * this.stickZoom;
    }

    /**
     * Updates all links connected to this protein.
     * Calls update/check on all protein-protein links and rendered crosslinks.
     */
    checkLinks() {
        for (let p_pLink of this.renderedP_PLinks) {
            //p_pLink.check();
            p_pLink.update();
        }
        for (let renderedCrosslink of this.renderedCrosslinks) {
            renderedCrosslink.check();
        }
    }

    clearPositionalFeatures() {
        this.annotations = new Map();
        if (this.circDomains) d3.select(this.circDomains).selectAll("*").remove();
        if (this.rectDomains) d3.select(this.rectDomains).selectAll("*").remove();
    }

    /**
     * Creates and displays positional features (domains, annotations) for this protein.
     * Clears existing features first, then creates new SVG elements for each annotation.
     * Handles alignment between different coordinate systems (e.g., PDB to sequence).
     */
    setPositionalFeatures() {
        this.clearPositionalFeatures();
        const annotationTypes = this.controller.model.get("annotationTypes");
        //create new annotations

        // does all of the commented out above, and picks up user-defined annotations
        let featuresShown = this.controller.model.getFilteredFeatures(this.protein);
        const split = _.partition(featuresShown, function (f) {
            return f.type === RenderedProtein.disulfide;
        });
        const disulfidBonds = split[0];
        featuresShown = split[1];

        if (featuresShown || disulfidBonds) {
            //draw longest regions first
            featuresShown.sort(function (a, b) {
                return (b.end - b.begin) - (a.end - a.begin);
            });

            //~ disulfidBonds.sort(function(a, b) {
            //~ return b.begin - a.begin;
            //~ });

            featuresShown = featuresShown.concat(disulfidBonds);

            const fsLen = featuresShown.length;
            for (let f = 0; f < fsLen; f++) {

                const anno = featuresShown[f];

                let convStart = anno.begin;
                let convEnd = anno.end;
                const alignModel = this.controller.model.get("alignColl").get(this.protein.id);
                let withinAlignedRange = true;

                // mjg next 5 lines
                const annotationTypeModel = annotationTypes.get(annotationTypes.modelId(anno));
                const annotationTypeModelAlignmentID = annotationTypeModel ? annotationTypeModel.get("typeAlignmentID") : undefined;
                const alignmentID = anno.alignmentID || annotationTypeModelAlignmentID; // individual feature alignment ids trump feature type alignment ids (needed for multiple pdb chain alignments)
                // it will be undefined for annotations/annotaion types aligned to search sequence so skips the next bit

                if ( //anno.category != "AA" // this handles not aligning certain features, todo; check for tidier way
                    alignmentID && alignModel) {
                    //var alignmentID = anno.alignmentID || "Canonical";
                    const conv = alignModel.rangeToSearch(alignmentID, anno.begin, anno.end);
                    if (conv) {
                        convStart = conv[0];
                        convEnd = conv[1];
                    } else {
                        withinAlignedRange = false; // when conv returns null
                    }
                }
                //TODO: tooltip requring these to be written into feature object, seems wrong?
                anno.fstart = +convStart; // + to convert to number
                anno.fend = +convEnd;

                const fid = anno.category + "-" + anno.type + "-" + anno.alignmentID + "[" + convStart + " - " + convEnd + "]";

                if (withinAlignedRange) {
                    const pieSlice = document.createElementNS(CrosslinkViewer.svgns, "path");
                    const colouredRect = document.createElementNS(CrosslinkViewer.svgns, "path");
                    if (anno.type !== RenderedProtein.disulfide) {
                        //if (anno.type != "disulfide bond") {
                        if (!this.expanded) {
                            pieSlice.setAttribute("d", this.getAnnotationPieSliceArcPath(anno));
                            colouredRect.setAttribute("d", this.getAnnotationPieSliceApproximatePath(anno));
                        } else {
                            pieSlice.setAttribute("d", this.getAnnotationRectPath(anno));
                            colouredRect.setAttribute("d", this.getAnnotationRectPath(anno));
                        }
                        pieSlice.setAttribute("stroke-width", "1");
                        pieSlice.setAttribute("fill-opacity", "0.5");
                        colouredRect.setAttribute("stroke-width", "1");
                        colouredRect.setAttribute("fill-opacity", "0.5");

                        const c = annotationTypes.getColour(anno.category, anno.type); // domainColours(anno.category, anno.type);
                        pieSlice.setAttribute("fill", c);
                        pieSlice.setAttribute("stroke", c);
                        colouredRect.setAttribute("fill", c);
                        colouredRect.setAttribute("stroke", c);
                    } else {

                        if (!this.expanded) {
                            pieSlice.setAttribute("d", this.getDisulfidAnnotationCircPath(anno));
                            colouredRect.setAttribute("d", this.getDisulfidAnnotationCircPath(anno));
                        } else {
                            pieSlice.setAttribute("d", this.getDisulfidAnnotationRectPath(anno, f));
                            colouredRect.setAttribute("d", this.getDisulfidAnnotationRectPath(anno, f));
                        }
                        pieSlice.setAttribute("stroke-width", "1");
                        colouredRect.setAttribute("stroke-width", "1");

                        const c = annotationTypes.getColour(anno.category, anno.type); // domainColours(anno.category, anno.type);
                        pieSlice.setAttribute("fill", "none");
                        pieSlice.setAttribute("stroke", c);
                        colouredRect.setAttribute("fill", "none");
                        colouredRect.setAttribute("stroke", c);
                    }

                    pieSlice.setAttribute("data-feature", fid);

                    const self = this;

                    //only needs tooltip on pie slice, its always on top even if transparent
                    pieSlice.onmouseover = function (evt) {
                        self.controller.preventDefaultsAndStopPropagation(evt);
                        const feature = self.annotations.get(evt.target.getAttribute("data-feature")).feature;
                        self.controller.model.get("tooltipModel")
                            //.set("header", d.id.replace("_", " "))
                            .set("header", makeTooltipTitle.feature())
                            .set("contents",
                                makeTooltipContents.feature(feature)
                            )
                            .set("location", {
                                pageX: evt.pageX,
                                pageY: evt.pageY
                            });
                    };

                    this.annotations.set(fid, {
                        feature: anno,
                        pieSlice: pieSlice,
                        colouredRect: colouredRect
                    });
                    this.circDomains.appendChild(pieSlice);
                    this.rectDomains.appendChild(colouredRect);
                }
            }
        }
    }

    getAnnotationPieSliceArcPath(annotation) {
        let startAngle = ((annotation.fstart - 1) / this.protein.size) * 360;
        let endAngle = (annotation.fend / this.protein.size) * 360;
        //just in case
        if (startAngle > endAngle) {
            const temp = startAngle;
            startAngle = endAngle;
            endAngle = temp;
        }
        let largeArcFlag = 0,
            sweepFlag = 1;
        if ((endAngle - startAngle) > 180) { //|| (endAngle - startAngle) == 0) {
            largeArcFlag = 1;
        }
        //hacky
        //actually its not clear there is better solution -
        // https://stackoverflow.com/questions/5737975/circle-drawing-with-svgs-arc-path
        if (annotation.fstart === 1 && annotation.fend === this.protein.size) {
            startAngle = 0.1;
            endAngle = 359.9;
            sweepFlag = 1;
        }

        const radius = this.symbolRadius - 2;
        const arcStart = trig(radius, startAngle - 90);
        const arcEnd = trig(radius, endAngle - 90);
        return "M0,0 L" + arcStart.x + "," + arcStart.y + " A" + radius + "," +
            radius + " 0 " + largeArcFlag + " " + sweepFlag + " " + arcEnd.x + "," + arcEnd.y + " Z";
    }

    getAnnotationPieSliceApproximatePath(annotation) {
        //approximate pie slice
        const startAngle = ((annotation.fstart - 1) / this.protein.size) * 360;
        const endAngle = ((annotation.fend) / this.protein.size) * 360;
        const pieRadius = this.symbolRadius - 2;
        let approximatePiePath = "M 0,0";
        const stepsInArc = 5;
        for (let sia = 0; sia <= RenderedProtein.stepsInArc; sia++) {
            const angle = startAngle + ((endAngle - startAngle) * (sia / stepsInArc));
            const siaCoord = trig(pieRadius, angle - 90);
            approximatePiePath += " L " + siaCoord.x + "," + siaCoord.y;
        }
        approximatePiePath += " L " + 0 + "," + 0;
        approximatePiePath += "  Z";
        return approximatePiePath;
    }

    getAnnotationRectPath(annotation) {
        //domain as rectangular path
        const bottom = RenderedProtein.STICKHEIGHT / 2,
            top = -RenderedProtein.STICKHEIGHT / 2;
        const annotX = this.getResXwithStickZoom(annotation.fstart - 0.5);
        const annotSize = (1 + (annotation.fend - annotation.fstart));
        const annotLength = annotSize * this.stickZoom;
        let rectPath = "M " + annotX + "," + bottom;
        for (let sia = 0; sia <= RenderedProtein.stepsInArc; sia++) {
            const step = annotX + (annotLength * (sia / RenderedProtein.stepsInArc));
            rectPath += " L " + step + "," + top;
        }
        rectPath += " L " + (annotX + annotLength) + "," + bottom +
            " Z";
        return rectPath;
    }

    getDisulfidAnnotationRectPath(annotation/*, index*/) {
        let bottom = RenderedProtein.STICKHEIGHT / 2,
            top = 1.5 * bottom;
        bottom = bottom - 5;

        const annotX = this.getResXwithStickZoom(annotation.fstart - 0.5);
        const annotSize = (1 + (annotation.fend - annotation.fstart));

        // const level = annotSize / 20;
        top += annotSize * bottom / 30;


        const annotLength = annotSize * this.stickZoom;
        let rectPath = "M " + annotX + "," + bottom;
        rectPath += " L " + annotX + "," + top;
        rectPath += " L " + (annotX + annotLength) + "," + top;
        rectPath += " L " + (annotX + annotLength) + "," + bottom;
        return rectPath;
    }

    getDisulfidAnnotationCircPath(/*annotation*/) {
        return "M 0,0 L 0,0 L 0,0 L 0,0 ";
    }

    get id() {
        return this.protein.id;
    }

    addConnectedNodes (subgraph) {
        for (let link of this.renderedP_PLinks.values()) {
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
        return subgraph;
    }


    countExternalLinks () {
        // return this.renderedP_PLinks.length;
        const renderedParticipantsLinkedTo = new Set();
        //let countExternal = 0;
        for (let link of this.renderedP_PLinks) {
            // a p-p link is a self-link iff both ends are the same protein; don't rely on
            // crosslinks[0].isSelfLink() — an ambiguous link bundles several crosslinks and
            // its first one may be a self-link even when the link spans two proteins.
            if (link.renderedFromProtein !== link.renderedToProtein) {
                if (link.isPassingFilter()) {
                    //countExternal++;
                    renderedParticipantsLinkedTo.add(link.getOtherEnd(this).getRenderedInteractor());
                }
            }
        }
        return renderedParticipantsLinkedTo.size;

    }

}

RenderedProtein.STICKHEIGHT = 20; // height of stick in pixels
RenderedProtein.LABELMAXLENGTH = 60; // maximal width reserved for protein-labels
RenderedProtein.transitionTime = 650;
RenderedProtein.stepsInArc = 5;
RenderedProtein.rotOffset = 25 * 0.7; // see xiNET.Rotator.js
RenderedProtein.minXDist = 30;
RenderedProtein.disulfide = "disulfide bond";

import {Link} from "./link";
import {CrosslinkViewer} from "../crosslink-viewer-BB";
import {RenderedProtein} from "../interactor/rendered-protein";
import d3 from "d3";
import {makeTooltipContents, makeTooltipTitle} from "../../../ui-utils/make-tooltip";
import {rotatePointAboutPoint} from "../trig";

/**
 * Represents a rendered crosslink between protein residues.
 * Extends Link to provide visualization for individual crosslinks at residue resolution.
 */
export class RenderedCrosslink extends Link {
    /**
     * Creates a new RenderedCrosslink instance.
     *
     * @param {Object} crosslink - The crosslink data backbone-models object
     * @param {CrosslinkViewer} crosslinkViewer - The parent crosslink viewer controller
     */
    constructor(crosslink, crosslinkViewer) {
        super(crosslinkViewer);
        this.isAggregateLink = false;
        this.crosslink = crosslink;

        this.renderedFromProtein = this.controller.renderedProteins.get(this.crosslink.fromProtein.id);
        this.renderedFromProtein.renderedCrosslinks.push(this);
        if (this.crosslink.toProtein) {
            this.renderedToProtein = this.controller.renderedProteins.get(this.crosslink.toProtein.id);
            this.renderedToProtein.renderedCrosslinks.push(this);
        }

        this.pepSvgArr = [];
    }

    /**
     * Initializes the SVG elements for this crosslink.
     * Creates line or path elements depending on link type (self-link, mono-link, or inter-protein).
     */
    initSVG() {
        if (this.crosslink.isSelfLink() || this.crosslink.isMonoLink()) {
            this.line = document.createElementNS(CrosslinkViewer.svgns, "path");
            this.line.setAttribute("stroke-width", CrosslinkViewer.linkWidth);
            this.highlightLine = document.createElementNS(CrosslinkViewer.svgns, "path");
            this.renderedFromProtein.selfLinksHighlights.appendChild(this.highlightLine);
            this.renderedFromProtein.selfLinks.appendChild(this.line);
        } else {
            this.line = document.createElementNS(CrosslinkViewer.svgns, "line");
            this.line.setAttribute("stroke-linecap", "round");
            this.highlightLine = document.createElementNS(CrosslinkViewer.svgns, "line");
            this.highlightLine.setAttribute("stroke-linecap", "round");
            this.controller.highlights.appendChild(this.highlightLine);
            this.controller.res_resLinks.appendChild(this.line);
        }
        this.line.setAttribute("class", "link");
        this.line.setAttribute("fill", "none");
        this.highlightLine.setAttribute("class", "link highlightedLink");
        this.highlightLine.setAttribute("fill", "none");
        //this.highlightLine.setAttribute("stroke", CLMS.xiNET.highlightColour.toRGB());
        this.highlightLine.setAttribute("stroke-width", "10");
        this.highlightLine.setAttribute("stroke-opacity", "0");
        //set the events for it
        const self = this;
        const setMouseEvents = function (svgElement) {
            svgElement.onmousedown = function (evt) {
                self.mouseDown(evt);
            };
            svgElement.onmouseover = function (evt) {
                self.mouseOver(evt);
            };
            svgElement.onmouseout = function (evt) {
                self.mouseOut(evt);
            };
            // this.line.ontouchstart = function(evt) {
            //     self.touchStart(evt);
            // };
            svgElement.oncontextmenu = function () {
                return false;
            };
        };
        setMouseEvents(this.line);
        setMouseEvents(this.highlightLine);
    }

    mouseOver(evt) {
        this.controller.preventDefaultsAndStopPropagation(evt);
        if (this.renderedFromProtein.busy === false && (!this.renderedToProtein || this.renderedToProtein.busy === false)) {
            const p = this.controller.getEventPoint(evt);

            const toHighlight = [this.crosslink];

            this.controller.model.setMarkedCrossLinks("highlights", toHighlight, true, false);

            this.controller.model.get("tooltipModel")
                .set("header", makeTooltipTitle.link())
                .set("contents", makeTooltipContents.link(this.crosslink))
                .set("location", {
                    pageX: p.x,
                    pageY: p.y
                });
        }
    }

    mouseDown(evt) {
        this.controller.preventDefaultsAndStopPropagation(evt);
        this.controller.d3cola.stop();
        this.controller.dragElement = this;

        let rightClick = (evt.button === 2);

        if (rightClick && this.crosslink.isSelfLink()) {
            this.renderedFromProtein.toggleFlipped();
        } else {
            const add = evt.shiftKey || evt.ctrlKey;
            this.controller.model.setMarkedCrossLinks("selection", [this.crosslink], false, add);
        }
        //store start location
        this.controller.dragStart = evt;

        d3.select(".custom-menu-margin").style("display", "none");
        d3.select(".group-custom-menu-margin").style("display", "none");
    }

    /*xiNET.RenderedCrosslink.prototype.touchStart = function(evt) {
        this.controller.d3cola.stop();
        this.controller.dragElement = this;
        var add = evt.shiftKey || evt.ctrlKey;
        this.controller.backbone-models.setMarkedCrossLinks("selection", [this.crosslink], false, add);
        //store start location
        //var p = this.controller.getTouchEventPoint(evt);// broke
        this.controller.dragStart = evt; //this.controller.mouseToSVG(p.x, p.y);
    }*/

    // andAlternatives means highlight alternative links in case of site ambiguity,
    // need to be able to switch this on and off to avoid infinite loop
    showHighlight(show) {
        //~ if (!this.renderedFromProtein.busy && (!this.renderedToProtein || !this.renderedToProtein.busy)) {
        if (this.shown) {
            if (show) {
                //this.highlightLine.setAttribute("stroke", CLMS.xiNET.highlightColour.toRGB());
                d3.select(this.highlightLine).classed("selectedLink", false);
                d3.select(this.highlightLine).classed("highlightedLink", true);
                this.highlightLine.setAttribute("stroke-opacity", "0.7");
                if (this.crosslink.filteredMatches_pp[0].match.matchedPeptides[0].seq_mods) {
                    const fromPeptides = [],
                        toPeptides = [];
                    //this is where we need the peptide positions
                    const filteredMatchesAndPeptidePositions = this.crosslink.filteredMatches_pp;
                    const fm_ppCount = filteredMatchesAndPeptidePositions.length;
                    for (let fm_pp = 0; fm_pp < fm_ppCount; fm_pp++) {
                        const matchAndPepPos = filteredMatchesAndPeptidePositions[fm_pp];
                        const match = matchAndPepPos.match;

                        const fromPepStart = matchAndPepPos.pepPos[0].start - 1;
                        const fromPepLength = matchAndPepPos.pepPos[0].length;
                        fromPeptides.push([fromPepStart, fromPepLength, match.overlap[0], match.overlap[1]]);
                        //loop link defenses - todo - revisit
                        if (matchAndPepPos.pepPos[1].start) {
                            const toPepStart = matchAndPepPos.pepPos[1].start - 1;
                            const toPepLength = matchAndPepPos.pepPos[1].length;
                            toPeptides.push([toPepStart, toPepLength, match.overlap[0], match.overlap[1]]);
                        }
                    }
                    if (this.renderedFromProtein.expanded) {
                        this.showPeptides(fromPeptides, this.renderedFromProtein);
                    }
                    if (this.renderedToProtein && this.renderedToProtein.expanded) {
                        this.showPeptides(toPeptides, this.renderedToProtein);
                    }
                }
            } else {
                d3.select(this.highlightLine).classed("selectedLink", true);
                d3.select(this.highlightLine).classed("highlightedLink", false);
                if (this.isSelected === false) {
                    this.highlightLine.setAttribute("stroke-opacity", "0");
                }
                this.removePeptides();
            }
        }
    }

    showPeptides(pepBounds, renderedProtein) {
        let y = -RenderedProtein.STICKHEIGHT / 2;
        const count = pepBounds.length;
        const yIncrement = RenderedProtein.STICKHEIGHT / count;
        for (let i = 0; i < count; i++) {
            const pep = pepBounds[i];
            let annoColouredRect = document.createElementNS(CrosslinkViewer.svgns, "rect");
            annoColouredRect.setAttribute("class", "protein");

            //make domain rectangles
            const annoSize = pep[1] - 0.2;
            let annoX = ((pep[0] + 0.6) - (renderedProtein.protein.size / 2));
            let annoLength = annoSize;
            annoColouredRect.setAttribute("x", annoX.toString());
            annoColouredRect.setAttribute("y", y.toString());
            annoColouredRect.setAttribute("width", annoLength.toString());
            annoColouredRect.setAttribute("height", yIncrement.toString());
            //style 'em
            d3.select(annoColouredRect).classed("highlightedPeptide", true);
            //annotColouredRect.setAttribute("fill-opacity", "0.7");
            renderedProtein.peptides.appendChild(annoColouredRect);
            this.pepSvgArr.push(annoColouredRect);

            if (typeof pep[2] != "undefined") { //homomultimer like
                annoColouredRect = document.createElementNS(CrosslinkViewer.svgns, "rect");
                annoColouredRect.setAttribute("class", "protein");
                annoX = ((pep[2] + 0.5) - (renderedProtein.protein.size / 2));
                annoLength = (pep[3] - pep[2]);
                annoColouredRect.setAttribute("x", annoX.toString());
                annoColouredRect.setAttribute("y", y.toString());
                annoColouredRect.setAttribute("width", annoLength.toString());
                annoColouredRect.setAttribute("height", yIncrement.toString());

                //style 'em
                d3.select(annoColouredRect).classed("peptideOverlap", true);
                annoColouredRect.setAttribute("fill-opacity", "0.5");

                renderedProtein.peptides.appendChild(annoColouredRect);
                this.pepSvgArr.push(annoColouredRect);
            }
            y += yIncrement;
        }
    }

    removePeptides() {
        const pepSvgArrCount = this.pepSvgArr.length;
        for (let p = 0; p < pepSvgArrCount; p++) {
            CrosslinkViewer.removeDomElement(this.pepSvgArr[p]);
        }
    }

    setSelected(select) {
        if (this.shown) {
            if (select === true) {
                d3.select(this.highlightLine).classed("selectedLink", true);
                d3.select(this.highlightLine).classed("highlightedLink", false);
                this.highlightLine.setAttribute("stroke-opacity", "0.7");
            } else {
                this.highlightLine.setAttribute("stroke-opacity", "0");
                d3.select(this.highlightLine).classed("selectedLink", false);
                d3.select(this.highlightLine).classed("highlightedLink", true);
            }
        }
        this.isSelected = select;
    }


    /**
     * Checks if this crosslink should be displayed based on current filter and visibility settings.
     * Hides the link if proteins are hidden, collapsed, or if no matches pass the filter.
     *
     * @returns {boolean} True if link should be shown, false otherwise
     */
    check() {
        // neither end is a bar which isn't in a collapsed group? then hide
        if ((!this.renderedFromProtein.expanded || (this.renderedFromProtein.inCollapsedGroup())) &&
            (this.renderedToProtein ? (!this.renderedToProtein.expanded || this.renderedToProtein.inCollapsedGroup()) : false)) {
            this.hide();
            return false;
        }

        // either end manually hidden? then hide
        if (this.renderedFromProtein.protein.hidden === true ||
            (this.renderedToProtein && this.renderedToProtein.protein.hidden === true)) {
            this.hide();
            return false;
        }

        // no crosslinks passed filter? then hide
        if (this.crosslink.filteredMatches_pp.length > 0) {
            this.show();
            return true;
        } else {
            this.hide();
            return false;
        }
    }

    show() {
        if (!this.shown) {
            this.shown = true;
            if (typeof this.line === "undefined") {
                this.initSVG();
            }
            if (!this.renderedToProtein) {
                let path;
                if (this.renderedFromProtein.expanded) {
                    path = this.renderedFromProtein.getCrossLinkPath(this);
                } else {
                    path = this.crosslink.isMonoLink() ? "M 0,0 L 0,0 L 0,0 L 0,0" : this.renderedFromProtein.getAggregateSelfLinkPath();
                }
                this.highlightLine.setAttribute("d", path);
                this.line.setAttribute("d", path);
            } else {
                if (!this.crosslink.isSelfLink()) {
                    this.line.setAttribute("stroke-width", (this.controller.z * CrosslinkViewer.linkWidth).toString());
                    this.highlightLine.setAttribute("stroke-width", (this.controller.z * 10).toString());
                    this.setLineCoordinates(this.renderedFromProtein);
                    this.setLineCoordinates(this.renderedToProtein);
                }
            }
            d3.select(this.highlightLine).style("display", null);
            d3.select(this.line).style("display", null);
        }

        if (this.crosslink.isSelfLink() && this.renderedToProtein) {
            if (this.homomultimer !== this.crosslink.confirmedHomomultimer) {
                let path;
                if (this.renderedFromProtein.expanded) {
                    path = this.renderedFromProtein.getCrossLinkPath(this);
                } else {
                    path = this.renderedFromProtein.getAggregateSelfLinkPath();
                }
                this.highlightLine.setAttribute("d", path);
                this.line.setAttribute("d", path);
                this.homomultimer = this.crosslink.confirmedHomomultimer;
            }
        }

        this.dashedLine(this.crosslink.ambiguous && this.crosslink.isMonoLink() === false);

        if (this.crosslink.isMonoLink()) {
            this.line.setAttribute("fill", this.crosslink.ambiguous ? "none" : this.controller.model.get("linkColourAssignment").getColour(this.crosslink));
        }

        this.line.setAttribute("stroke",
            this.controller.model.get("linkColourAssignment").getColour(this.crosslink));

        this.setSelected(this.isSelected);
    }

    hide() {
        if (this.shown) {
            this.shown = false;
            d3.select(this.highlightLine).style("display", "none");
            d3.select(this.line).style("display", "none");
            this.removePeptides();
        }
    }

    // there's an efficiency saving possible by passing in the renderedInteractor that's moved,
    // then only need to change that end
    setLineCoordinates() {
        if (this.shown) {
            //if not self link && not linker modified pep
            if (!this.crosslink.isSelfLink() && this.crosslink.toProtein) {
                let x, y;
                const source = this.renderedFromProtein.getRenderedInteractor();
                const target = this.renderedToProtein.getRenderedInteractor();
                if (!source.ix || !source.iy) {
                    console.log("NOT");
                }
                // from end
                if (source.type === "group" || !source.expanded) {
                    x = source.ix;
                    y = source.iy;
                } else {
                    const coord = this.getResidueCoordinates(this.crosslink.fromResidue, this.renderedFromProtein);
                    x = coord[0];
                    y = coord[1];
                }
                this.line.setAttribute("x1", x);
                this.line.setAttribute("y1", y);
                this.highlightLine.setAttribute("x1", x);
                this.highlightLine.setAttribute("y1", y);

                // to end
                if (target.type === "group" || !target.expanded) {
                    x = target.ix;
                    y = target.iy;
                } else {
                    const coord = this.getResidueCoordinates(this.crosslink.toResidue, this.renderedToProtein);
                    x = coord[0];
                    y = coord[1];
                }
                this.line.setAttribute("x2", x);
                this.line.setAttribute("y2", y);
                this.highlightLine.setAttribute("x2", x);
                this.highlightLine.setAttribute("y2", y);

            }
        }
    }

    /**
     * Calculates the screen coordinates of a residue.
     * Accounts for protein rotation and zoom level.
     * Coordinates are relative to the controller.container coordinate system.
     *
     * @param {number} r - The residue number
     * @param {RenderedProtein} renderedInteractor - The protein containing the residue
     * @returns {number[]} Array containing [x, y] coordinates
     */
    getResidueCoordinates(r, renderedInteractor) {
        let x = renderedInteractor.getResXwithStickZoom(r) * this.controller.z;
        let y = 0;
        if (renderedInteractor.stickZoom >= 8) { //if sequence shown
            const from = this.renderedFromProtein,
                to = this.renderedToProtein;
            const deltaX = from.ix - to.ix;
            const deltaY = from.iy - to.iy;
            const angleBetweenMidPoints = Math.atan2(deltaY, deltaX);
            //todo: tidy up trig code so everything is always in radians?
            let abmpDeg = angleBetweenMidPoints / (2 * Math.PI) * 360;
            if (abmpDeg < 0) {
                abmpDeg += 360;
            }

            let out; //'out' is value we use to decide which side of letter the line is drawn
            if (renderedInteractor === from) {
                out = (abmpDeg - from.rotation);
                if (out < 0) {
                    out += 360;
                }
                let fyOffset = 5;
                if (out < 180) {
                    fyOffset = -5;
                }

                y = fyOffset * this.controller.z;
            } else { // renderedInteractor === to
                out = (abmpDeg - to.rotation);
                if (out < 0) {
                    out += 360;
                }
                let tyOffset = 5;
                if (out > 180) {
                    tyOffset = -5;
                }
                y = tyOffset * this.controller.z;
            }
        }

        const rotated = rotatePointAboutPoint([x, y], [0, 0], renderedInteractor.rotation);

        x = rotated[0] + renderedInteractor.ix;
        y = rotated[1] + renderedInteractor.iy;
        return [x, y];
    }
}

import * as _ from "underscore";

import {Link} from "./link";
import {CrosslinkViewer} from "../crosslink-viewer-BB";
import {G_GLink} from "./g_g-link";
import d3 from "d3";

/**
 * Represents an aggregate protein-to-protein link.
 * Aggregates multiple crosslinks between two proteins into a single visual element.
 */
export class P_PLink extends Link {

    /**
     * Creates a new P_PLink instance.
     *
     * @param {string} p_pId - Unique identifier for this protein-protein link
     * @param {Object} crosslink - Initial crosslink to include in this aggregate
     * @param {CrosslinkViewer} crosslinkViewer - The parent crosslink viewer controller
     */
    constructor(p_pId, crosslink, crosslinkViewer) {
        super(crosslinkViewer);
        this.isAggregateLink = true;
        this.id = p_pId;
        this.crosslinks = [];
        this.renderedFromProtein = this.controller.renderedProteins.get(crosslink.fromProtein.id);
        this.renderedFromProtein.renderedP_PLinks.push(this);
        if (crosslink.toProtein) {
            this.renderedToProtein = this.controller.renderedProteins.get(crosslink.toProtein.id);
            this.renderedToProtein.renderedP_PLinks.push(this);
        }
    }

    /**
     * Gets all crosslinks aggregated in this protein-protein link.
     *
     * @returns {Array} Array of crosslink objects
     */
    getCrosslinks() {
        return this.crosslinks;
    }

    /**
     * Initializes the SVG elements for this protein-protein link.
     * Creates line or path elements depending on whether it's a self-link.
     */
    initSVG() {
        if (this.crosslinks[0].isSelfLink() === false) {
            this.line = document.createElementNS(CrosslinkViewer.svgns, "line");
            this.highlightLine = document.createElementNS(CrosslinkViewer.svgns, "line");
            this.thickLine = document.createElementNS(CrosslinkViewer.svgns, "line");
        } else {
            this.renderedFromProtein.selfLink = this;

            this.line = document.createElementNS(CrosslinkViewer.svgns, "path");
            this.highlightLine = document.createElementNS(CrosslinkViewer.svgns, "path");
            this.thickLine = document.createElementNS(CrosslinkViewer.svgns, "path");

            this.initSelfLinkSVG();
        }

        this.line.setAttribute("class", "link");
        this.line.setAttribute("fill", "none");
        this.line.setAttribute("stroke-width", CrosslinkViewer.linkWidth);
        this.line.setAttribute("stroke-linecap", "round");

        this.highlightLine.setAttribute("class", "link highlightedLink");
        this.highlightLine.setAttribute("fill", "none");
        this.highlightLine.setAttribute("stroke-width", "10");
        this.highlightLine.setAttribute("stroke-linecap", "round");
        this.highlightLine.setAttribute("stroke-opacity", "0");

        this.thickLine.setAttribute("class", "link");
        this.thickLine.setAttribute("fill", "none");
        this.thickLine.setAttribute("stroke", "#ddd");
        this.thickLine.setAttribute("stroke-linecap", "round");
        this.thickLine.setAttribute("stroke-linejoin", "round");

        this.controller.p_pLinksWide.appendChild(this.thickLine);
        this.controller.highlights.appendChild(this.highlightLine);
        this.controller.p_pLinks.appendChild(this.line);

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
        setMouseEvents(this.thickLine);
    }

    mouseOver(evt) {
        const p = this.controller.getEventPoint(evt);
        const toHighlight = this.crosslinks.slice(0);
        this.controller.model.setMarkedCrossLinks("highlights", toHighlight, true, false);
        this.controller.model.get("tooltipModel")
            .set("header", "Linked Protein Pair")
            .set("contents", [
                ["From", this.renderedFromProtein.protein.name],
                ["To", this.renderedToProtein.protein.name],
                ["Unique Linked Residue Pairs", this.filteredCrossLinkCount ? this.filteredCrossLinkCount : "filter not yet applied"],
                ["Matches", this.filteredMatchCount ? this.filteredMatchCount : "filter not yet applied"]
                //highest score
            ])
            .set("location", {
                pageX: p.x,
                pageY: p.y
            });
    }

    // event handler for starting dragging or rotation (or flipping internal links)
    mouseDown(evt) {
        //stop layout
        this.controller.d3cola.stop();

        this.controller.dragElement = this;
        if (evt.shiftKey || evt.ctrlKey) {
            let selection = this.controller.model.get("selection");
            if (this.isSelected) {
                const self = this;
                selection = selection.filter(function (d) {
                    return self.crosslinks.indexOf(d) === -1;
                });
            } else {
                selection = selection.concat(this.crosslinks);
            }
            this.controller.model.setMarkedCrossLinks("selection", selection);
        } else {
            this.controller.model.setMarkedCrossLinks("selection", _.clone(this.crosslinks));
        }

        //store start location
        this.controller.dragStart = evt;

        d3.select(".custom-menu-margin").style("display", "none");
        d3.select(".group-custom-menu-margin").style("display", "none");
    }

    /*xiNET.P_PLink.prototype.touchStart = function(evt) {
        this.controller.d3cola.stop();
        this.controller.dragElement = this;
        this.controller.backbone-models.setMarkedCrossLinks("selection", this.crosslinks);
        //store start location
        //var p = this.controller.getTouchEventPoint(evt);// oh dear, now broken
        this.controller.dragStart = evt;
    }*/

    initSelfLinkSVG() {
        const path = this.renderedFromProtein.getAggregateSelfLinkPath();
        this.line.setAttribute("d", path);
        this.highlightLine.setAttribute("d", path);
        this.thickLine.setAttribute("d", path);
    }

    showHighlight(show) {
        if (this.shown) {
            if (show) {
                d3.select(this.highlightLine).classed("selectedLink", false);
                d3.select(this.highlightLine).classed("highlightedLink", true);
                this.highlightLine.setAttribute("stroke-opacity", "1");
            } else {
                d3.select(this.highlightLine).classed("selectedLink", true);
                d3.select(this.highlightLine).classed("highlightedLink", false);
                if (this.isSelected === false) {
                    this.highlightLine.setAttribute("stroke-opacity", "0");
                }
            }
        }
        this.isHighlighted = show;
    }

    setSelected(select) {
        if (this.shown) {
            if (select === true) {
                d3.select(this.highlightLine).classed("selectedLink", true);
                d3.select(this.highlightLine).classed("highlightedLink", false);
                this.highlightLine.setAttribute("stroke-opacity", "1");
            } else {
                this.highlightLine.setAttribute("stroke-opacity", "0");
                d3.select(this.highlightLine).classed("selectedLink", false);
                d3.select(this.highlightLine).classed("highlightedLink", true);
            }
        }
        this.isSelected = select;
    }

    update() {
        if (!this.renderedToProtein || // not linear
            //or either end hidden hidden
            this.renderedFromProtein.protein.hidden ||
            this.renderedToProtein.protein.hidden ||
            // or is self link in collapsed group
            (this.crosslinks[0].isSelfLink() && this.renderedFromProtein.inCollapsedGroup()) ||
            // or either end is expanded to bar and not in collapsed group
            (this.renderedFromProtein.expanded && !this.renderedFromProtein.inCollapsedGroup()) ||
            (this.renderedToProtein.expanded && !this.renderedToProtein.inCollapsedGroup()) // ||
        ) {
            this.hide();
        } else {
            this.hd = false;
            const filteredCrossLinks = new Set();
            const filteredMatches = new Set();
            // const altP_PLinks = new Set();
            this.ambiguous = true;
            for (let crosslink of this.crosslinks) {
                if (crosslink.filteredMatches_pp.length > 0) {
                    filteredCrossLinks.add(crosslink.id);
                    for (let m of crosslink.filteredMatches_pp) {
                        const match = m.match; // oh dear, this...
                        filteredMatches.add(match.id);
                        //todo check this - what if mix of hd and not hd
                        if (match.hd === true) {
                            this.hd = true;
                        }
                        // if (match.crosslinks.length > 1) {
                        //     for (let matchCrossLink of match.crosslinks) {
                        //         if (!matchCrossLink.isDecoyLink()) {
                        //             altP_PLinks.add(matchCrossLink.p_pLink.id);
                        //         }
                        //     }
                        // }
                        console.log("yo");
                        if (match.crosslinks.length == 1) {
                            this.ambiguous = false;
                        }
                    }
                }

                this.filteredMatchCount = filteredMatches.size;
                this.filteredCrossLinkCount = filteredCrossLinks.size;

                if (this.filteredCrossLinkCount === 0) {
                    this.hide();
                } else {
                    //  this.ambiguous = altP_PLinks.size > 1;

                    if (this.renderedFromProtein.inCollapsedGroup() && this.renderedToProtein.inCollapsedGroup()) {
                        const source = this.renderedFromProtein.getRenderedInteractor();
                        const target = this.renderedToProtein.getRenderedInteractor();
                        let ggId;
                        if (source.id < target.id) {
                            ggId = source.id + "_" + target.id;
                        } else {
                            ggId = target.id + "_" + source.id;
                        }
                        let ggLink = this.controller.g_gLinks.get(ggId);
                        if (!ggLink) {
                            if (source.id < target.id) {
                                ggLink = new G_GLink(ggId, source, target, this.controller);
                            } else {
                                ggLink = new G_GLink(ggId, target, source, this.controller);
                            }
                            this.controller.g_gLinks.set(ggId, ggLink);
                        }
                        ggLink.p_pLinks.set(this.id, this);
                        this.hide();
                        //                ggLink.show();
                    } else {
                        this.show();
                    }

                }
            }
        }
    }

    show() {
        //if (!this.shown) { - causing problems with load layout, TODO - look at again
        if (typeof this.line === "undefined") {
            this.initSVG();
        }
        this.shown = true;
        if (this.renderedFromProtein === this.renderedToProtein) {
            this.thickLine.setAttribute("transform", "translate(" +
                this.renderedFromProtein.ix + " " + this.renderedFromProtein.iy + ")" // possibly not necessary
                +
                " scale(" + (this.controller.z) + ")");
            this.line.setAttribute("transform", "translate(" + this.renderedFromProtein.ix +
                " " + this.renderedFromProtein.iy + ")" + " scale(" + (this.controller.z) + ")");
            this.highlightLine.setAttribute("transform", "translate(" + this.renderedFromProtein.ix +
                " " + this.renderedFromProtein.iy + ")" + " scale(" + (this.controller.z) + ")");

        } else {
            this.line.setAttribute("stroke-width", (this.controller.z * CrosslinkViewer.linkWidth).toString());
            this.highlightLine.setAttribute("stroke-width", (this.controller.z * 10).toString());
            this.setLineCoordinates(this.renderedFromProtein);
            this.setLineCoordinates(this.renderedToProtein);
        }
        d3.select(this.thickLine).style("display", null);
        d3.select(this.line).style("display", null);
        d3.select(this.highlightLine).style("display", null);
        //}

        if (this.controller.model.get("xinetThickLinks") === false) {
            d3.select(this.thickLine).style("display", "none");
        } else {
            d3.select(this.thickLine).style("display", null);
            this.updateThickLineWidth();
        }

        this.dashedLine(this.ambiguous);
        this.line.setAttribute("stroke", this.controller.model.get("linkColourAssignment").getColour(this));
        this.setSelected(this.isSelected);
    }

    isPassingFilter() {
        for (let crosslink of this.crosslinks) {
            if (crosslink.filteredMatches_pp.length > 0) {
                return true;
            }
        }
        return false;
    }

    /**
     * Updates the width of the thick line based on the number of filtered crosslinks.
     * Uses stepped widths defined in xinetPpiSteps backbone-models property.
     */
    updateThickLineWidth() {
        const steps = this.controller.model.get("xinetPpiSteps");

        let thickLineWidth;
        if (this.filteredCrossLinkCount < steps[0]) {
            thickLineWidth = 1;
        } else if (this.filteredCrossLinkCount < steps[1]) {
            thickLineWidth = 5;
        } else {
            thickLineWidth = 10;
        }
        if (this.renderedFromProtein === this.renderedToProtein) {
            this.thickLine.setAttribute("stroke-width", thickLineWidth);
        } else {
            this.thickLine.setAttribute("stroke-width", (this.controller.z * thickLineWidth).toString());
        }
    }

    hide() {
        if (this.shown) {
            this.shown = false;
            d3.select(this.thickLine).style("display", "none");
            d3.select(this.highlightLine).style("display", "none");
            d3.select(this.line).style("display", "none");
        }
    }

    setLineCoordinates() {
        if (this.renderedToProtein && this.renderedFromProtein !== this.renderedToProtein) {
            if (this.shown) {
                const source = this.renderedFromProtein.getRenderedInteractor();
                const target = this.renderedToProtein.getRenderedInteractor();
                if (isNaN(source.ix) || isNaN(source.iy)) {
                    console.log("prot coords are NaN");
                }

                //     if (this.renderedFromProtein === participant) {
                this.line.setAttribute("x1", source.ix);
                this.line.setAttribute("y1", source.iy);
                this.highlightLine.setAttribute("x1", source.ix);
                this.highlightLine.setAttribute("y1", source.iy);
                this.thickLine.setAttribute("x1", source.ix);
                this.thickLine.setAttribute("y1", source.iy);
                // } else if (this.renderedToProtein === participant) {
                this.line.setAttribute("x2", target.ix);
                this.line.setAttribute("y2", target.iy);
                this.highlightLine.setAttribute("x2", target.ix);
                this.highlightLine.setAttribute("y2", target.iy);
                this.thickLine.setAttribute("x2", target.ix);
                this.thickLine.setAttribute("y2", target.iy);
                // }
            }
        }
    }

    getOtherEnd (protein) {
        if (this.renderedFromProtein === protein) {
            return this.renderedToProtein;
        } else {
            return this.renderedFromProtein;
        }
    }
    //
    // getFromProtein(){
    //     return this.fromProtein;
    // }
    //
    // getToProtein(){
    //     return this.fromProtein;
    // }
}

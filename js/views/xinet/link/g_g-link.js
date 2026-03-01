import * as _ from "underscore";
import {Link} from "./link";
import {CrosslinkViewer} from "../crosslink-viewer-BB";
import d3 from "d3";

/**
 * Represents an aggregate group-to-group link.
 * Aggregates multiple protein-protein links when proteins are in collapsed groups.
 */
export class G_GLink extends Link {

    /**
     * Creates a new G_GLink instance.
     *
     * @param {string} id - Unique identifier for this group-group link
     * @param {Group} group1 - The first group
     * @param {Group} group2 - The second group
     * @param {CrosslinkViewer} crosslinkViewer - The parent crosslink viewer controller
     */
    constructor(id, group1, group2, crosslinkViewer) {
        super(crosslinkViewer);

        this.id = id;
        this.isAggregateLink = true;

        this.p_pLinks = new Map();
        this.group1 = group1;
        this.group2 = group2;
    }

    /**
     * Gets all crosslinks aggregated in this group-group link.
     * Collects crosslinks from all constituent protein-protein links.
     *
     * @returns {Array} Array of all crosslink objects
     */
    getCrosslinks() {
        let allCrosslinks = [];
        for (let pp of this.p_pLinks.values()) {
            allCrosslinks = allCrosslinks.concat(pp.crosslinks);
        }
        return allCrosslinks;
    }

    initSVG() {
        if (this.group1 !== this.group2) {
            this.line = document.createElementNS(CrosslinkViewer.svgns, "line");
            this.highlightLine = document.createElementNS(CrosslinkViewer.svgns, "line");
            this.thickLine = document.createElementNS(CrosslinkViewer.svgns, "line");
        } else {
            this.group1.selfLink = this;

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
        let allCrosslinks = [];
        this.filteredCrosslinkCount = 0;
        let filteredMatchCount = 0;
        let ppiCount = 0;
        for (let pp of this.p_pLinks.values()) {
            if (pp.filteredCrossLinkCount > 0) {
                allCrosslinks = allCrosslinks.concat(pp.crosslinks);
                ppiCount++;
                this.filteredCrosslinkCount += pp.filteredCrossLinkCount;
                filteredMatchCount += pp.filteredMatchCount;
            }
        }
        this.controller.model.setMarkedCrossLinks("highlights", allCrosslinks, true, false);
        this.controller.model.get("tooltipModel")
            //TODO - reuse other multiLink tooltips in CLM-UI?
            .set("header", "Group to Group Links")
            .set("contents", [
                ["From", this.group1.name],
                ["To", this.group2.name],
                ["PPI count", ppiCount],
                ["Unique Linked Residue Pairs", this.filteredCrosslinkCount],
                ["Matches", filteredMatchCount ? filteredMatchCount : "filter not yet applied"]
                //highest score
            ])
            .set("location", {
                pageX: p.x,
                pageY: p.y
            });
    }

    // event handler for starting dragging or rotation (or flipping internal links)
    mouseDown(evt) {
        this.controller.d3cola.stop();
        let allCrosslinks = [];
        for (let pp of this.p_pLinks.values()) {
            allCrosslinks = allCrosslinks.concat(pp.crosslinks);
        }
        this.controller.dragElement = this;
        if (evt.shiftKey || evt.ctrlKey) {
            let selection = this.controller.model.get("selection");
            if (this.isSelected) {
                selection = selection.filter(function (d) {
                    return allCrosslinks.indexOf(d) === -1;
                });
            } else {
                selection = selection.concat(allCrosslinks);
            }
            this.controller.model.setMarkedCrossLinks("selection", selection);
        } else {
            this.controller.model.setMarkedCrossLinks("selection", _.clone(allCrosslinks));
        }
        //store start location
        this.controller.dragStart = evt;
        d3.select(".custom-menu-margin").style("display", "none");
        d3.select(".group-custom-menu-margin").style("display", "none");
    }

    /*xiNET.P_PLink.prototype.touchStart = function(evt) {
        this.controller.d3cola.stop();
        this.controller.dragElement = this;
        this.controller.model.setMarkedCrossLinks("selection", this.crosslinks);
        //store start location
        //var p = this.controller.getTouchEventPoint(evt);// oh dear, now broken
        this.controller.dragStart = evt;
    }*/

    initSelfLinkSVG() {
        const path = this.group1.getAggregateSelfLinkPath();
        this.line.setAttribute("d", path);
        this.highlightLine.setAttribute("d", path);
        this.thickLine.setAttribute("d", path);
    }

    checkHighlight() {
        for (let pp of this.p_pLinks.values()) {
            // if (pp.filteredCrossLinkCount > 0) { ? // shouldn't be needed
            if (pp.isHighlighted) {
                this.showHighlight(true);
                return;
            }
        }
        this.showHighlight(false);
    }

    checkSelected() {
        for (let pp of this.p_pLinks.values()) {
            // if (pp.filteredCrossLinkCount > 0) { ? // shouldn't be needed
            if (pp.isSelected) {
                this.setSelected(true);
                return;
            }
        }
        this.setSelected(false);
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

    /**
     * Checks if this group-group link has any filtered crosslinks.
     * Returns true if any constituent protein-protein link has filtered crosslinks.
     *
     * @returns {boolean} True if link should be shown
     */
    check() {
        for (let pp of this.p_pLinks.values()) {
            if (pp.filteredCrossLinkCount > 0) {
                return true;
            }
        }
        return false;
    }

    // xiNET.P_PLink.prototype.check = function () {
    //     // this.ambiguous = true; // todo - looks like this could be removed
    //     this.hd = false;
    //
    //     const filteredCrossLinks = new Set();
    //     const filteredMatches = new Set();
    //     const altP_PLinks = new Set();
    //
    //     // this.colours.clear();
    //
    //     for (let crosslink of this.crosslinks) {
    //
    //         if (crosslink.filteredMatches_pp.length > 0) {
    //             filteredCrossLinks.add(crosslink.id);
    //             // this.colours.add(window.compositeModelInst.get("linkColourAssignment").getColour(crosslink));
    //         }
    //
    //         for (let m of crosslink.filteredMatches_pp) {
    //             // i think there's a performance improvement to be had here
    //             const match = m.match; // oh dear, this...
    //             filteredMatches.add(match.id);
    //             if (match.hd === true) {
    //                 this.hd = true;
    //             }
    //             if (match.crosslinks.length === 1) {
    //                 // this.ambiguous = false; //yeah... whats this doing when this.ambiguous gets set later, just before end of function
    //             } else {
    //                 for (let matchCrossLink of match.crosslinks) {
    //                     if (!matchCrossLink.isDecoyLink()) {
    //                         altP_PLinks.add(matchCrossLink.p_pLink.id);
    //                     }
    //                 }
    //             }
    //         }
    //     }
    //
    //     this.filteredMatchCount = filteredMatches.size;
    //     this.filteredCrossLinkCount = filteredCrossLinks.size;
    //     if (this.filteredCrossLinkCount > 0) {
    //         this.ambiguous = altP_PLinks.size > 1;
    //     }
    //     return this.filteredCrossLinkCount;
    // };

    // xiNET.P_PLink.prototype.update = function () {
    //     if (!this.renderedToProtein || // todo - ok... check why this is here
    //         //hide if prot either end is hidden
    //         this.renderedFromProtein.participant.hidden ||
    //         this.renderedToProtein.participant.hidden ||
    //         // or either end is expanded to bar and not in collapsed group
    //         (this.renderedFromProtein.expanded && !this.renderedFromProtein.inCollapsedGroup()) ||
    //         (this.renderedToProtein.expanded && !this.renderedToProtein.inCollapsedGroup()) ||
    //         // or no matches pass filter
    //         this.filteredCrossLinkCount === 0 ||
    //         // or is self link in collapsed group
    //         (this.crosslinks[0].isSelfLink() && this.renderedFromProtein.inCollapsedGroup())) {
    //         this.hide();
    //     } else {
    //
    //         // if (both ends in collapsed groups) {
    //         //
    //         // }
    //         //
    //         this.show();
    //     }
    // }

    show() {
        //if (!this.shown) { - causing problems with load layout, TODO - look at again
        if (typeof this.line === "undefined") {
            this.initSVG();
        }
        this.shown = true;
        if (this.group1 === this.group2) {
            this.thickLine.setAttribute("transform", "translate(" +
                this.group1.ix + " " + this.group2.iy + ")" // possibly not neccessary
                +
                " scale(" + (this.controller.z) + ")");
            this.line.setAttribute("transform", "translate(" + this.group1.ix +
                " " + this.group1.iy + ")" + " scale(" + (this.controller.z) + ")");
            this.highlightLine.setAttribute("transform", "translate(" + this.group1.ix +
                " " + this.group1.iy + ")" + " scale(" + (this.controller.z) + ")");

        } else {
            this.line.setAttribute("stroke-width", (this.controller.z * CrosslinkViewer.linkWidth).toString());
            this.highlightLine.setAttribute("stroke-width", (this.controller.z * 10).toString());
            this.setLineCoordinates();
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

        // this.dashedLine(this.ambiguous);

        this.line.setAttribute("stroke", this.controller.model.get("linkColourAssignment").getColour(this));

        this.setSelected(this.isSelected);
    }

    updateThickLineWidth() {
        const steps = this.controller.model.get("xinetPpiSteps");

        let thickLineWidth;
        if (this.filteredCrosslinkCount < steps[0]) {
            thickLineWidth = 1;
        } else if (this.filteredCrosslinkCount < steps[1]) {
            thickLineWidth = 5;
        } else {
            thickLineWidth = 10;
        }
        if (this.group1 === this.group2) {
            this.thickLine.setAttribute("stroke-width", thickLineWidth);
        } else {
            this.thickLine.setAttribute("stroke-width", (this.controller.z * thickLineWidth).toString());
        }
    }

    hide() {
        // if (this.shown) {
        //     this.shown = false;
        d3.select(this.thickLine).style("display", "none");
        d3.select(this.highlightLine).style("display", "none");
        d3.select(this.line).style("display", "none");
        // }
    }

    setLineCoordinates() {
        if (this.group1 !== this.group2) {
            if (this.shown) {
                const source = this.group1;//.getRenderedInteractor();
                const target = this.group2;//renderedToProtein.getRenderedInteractor();
                if (!source.ix || !source.iy) {
                    console.log("NOT");
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
}

/*
xiNET.P_PLink.prototype.getOtherEnd = function(protein) {
    if (this.fromProtein === protein) {
        return this.toProtein;
    } else {
        return this.fromProtein;
    }
};*/

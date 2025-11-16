import d3 from "d3";
import {trig} from "../trig";

/**
 * Base class for interacting elements in the xiNET visualization.
 * Represents proteins and groups that can be selected, highlighted, and manipulated.
 */
export class Interactor {

    /**
     * Creates a new Interactor instance.
     *
     * @param {CrosslinkViewer} controller - The parent crosslink viewer controller
     */
    constructor(controller) {
        this.controller = controller;
        this.selfLink = null;
        this.parentGroups = new Set();

        this._selected = false;
        this._highlight = false;
    }

    /**
     * Gets the symbol radius for this interactor.
     *
     * @returns {number} The radius in pixels
     */
    get symbolRadius() {
        return 25;
    }

    /**
     * Handles mouse down events.
     *
     * @param {MouseEvent} evt - The mouse event
     * @returns {boolean} False to prevent default behavior
     */
    mouseDown(evt) {
        this.controller.preventDefaultsAndStopPropagation(evt);
        this.controller.d3cola.stop();
        this.controller.dragElement = this;
        this.controller.dragStart = evt;
        this.controller.mouseMoved = false;
        return false;
    }

    /**
     * Handles mouse out events by clearing highlights and tooltips.
     */
    mouseOut() {
        //this.controller.preventDefaultsAndStopPropagation(evt); // isn't stopping mouseOut in controller getting called
        this.controller.model.setHighlightedProteins([]);
        this.controller.model.get("tooltipModel").set("contents", null);
    }

    /**
     * Sets the highlighted state of this interactor.
     *
     * @param {boolean} show - True to highlight, false to unhighlight
     */
    set highlighted(show) {
        if (show === true && !this._highlight) {
            const d3HighSel = d3.select(this.highlight);
            d3HighSel
                .classed("selectedProtein", false)
                .classed("highlightedProtein", true)
                .attr("stroke-opacity", "1");
        } else if (show === false && this._highlight) {
            const d3HighSel = d3.select(this.highlight);
            if (!this._selected) {
                d3HighSel.attr("stroke-opacity", "0");
            }
            d3HighSel
                .classed("selectedProtein", true)
                .classed("highlightedProtein", false);
        }
        this._highlight = !!show;
    }

    /**
     * Gets the highlighted state of this interactor.
     *
     * @returns {boolean} True if highlighted
     */
    get highlighted() {
        return this._highlight;
    }

    /**
     * Sets the selected state of this interactor.
     *
     * @param {boolean} select - True to select, false to deselect
     */
    set selected(select) {
        const d3HighSel = d3.select(this.highlight);
        if (select === true && !this._selected) {
            d3HighSel
                .classed("selectedProtein", true)
                .classed("highlightedProtein", false)
                .attr("stroke-opacity", "1");
        } else if (select === false && this._selected) {
            d3HighSel
                .attr("stroke-opacity", "0")
                .classed("selectedProtein", false)
                .classed("highlightedProtein", true);
        }
        this._selected = !!select;
    }

    /**
     * Gets the selected state of this interactor.
     *
     * @returns {boolean} True if selected
     */
    get selected() {
        return this._selected;
    }

    /**
     * Generates the SVG path for an aggregate self-link visualization.
     * Creates a curved path representing links from a protein to itself.
     *
     * @returns {string} SVG path data string
     */
    getAggregateSelfLinkPath() {
        const intraR = this.symbolRadius + 7;
        const sectorSize = 45;
        const arcStart = trig(intraR, 25 + sectorSize);
        const arcEnd = trig(intraR, -25 + sectorSize);
        const cp1 = trig(intraR, 40 + sectorSize);
        const cp2 = trig(intraR, -40 + sectorSize);
        return "M 0,0 " +
            "Q " + cp1.x + "," + -cp1.y + " " + arcStart.x + "," + -arcStart.y +
            " A " + intraR + " " + intraR + " 0 0 1 " + arcEnd.x + "," + -arcEnd.y +
            " Q " + cp2.x + "," + -cp2.y + " 0,0";
    }

    /**
     * Updates all link coordinates connected to this interactor.
     * Should be called after moving or transforming the interactor.
     * Note: Group-to-group links are updated separately.
     */
    setAllLinkCoordinates() {
        for (let pl of this.renderedP_PLinks) {
            pl.setLineCoordinates(this);
        }
        for (let rcl of this.renderedCrosslinks) {
            rcl.setLineCoordinates(this);
        }
        // yes... the group-to-group links are updated separately
    }

    /**
     * Shows or hides the label for this interactor.
     *
     * @param {boolean} show - True to show label, false to hide
     */
    showLabel(show) {
        d3.select(this.labelSVG).attr("display", show ? null : "none");
    }

    /**
     * Gets the rendered interactor, accounting for group hierarchy.
     * Returns the highest collapsed group if this interactor is in one,
     * otherwise returns itself.
     *
     * @returns {Interactor} The rendered interactor or parent group
     */
    getRenderedInteractor() {
        // get highest collapsed group
        for (let pg of this.parentGroups.values()) {
            if (!pg.expanded) {
                return pg.getRenderedInteractor();
            }
        }
        return this;
    }

    /**
     * Checks if this interactor is contained in a collapsed group.
     *
     * @returns {boolean} True if in a collapsed group
     */
    inCollapsedGroup() {
        // noinspection LoopStatementThatDoesntLoopJS
        for (let pg of this.parentGroups.values()) {
            if (!pg.expanded) {
                return true;
            }
        }
        return false;
    }

    // getSubgraph () {
    //     if (this.subgraph == null) {
    //         const subgraph = {
    //             nodes: new Map(),
    //             links: new Map()
    //         };
    //         const thisNode = this.getRenderedInteractor();
    //         subgraph.nodes.set(thisNode.id, thisNode);
    //         this.subgraph = this.addConnectedNodes(subgraph);
    //         thisNode.subgraph = subgraph;
    //         this.controller.subgraphs.push(subgraph);
    //     }
    //     return this.subgraph;
    // }
}

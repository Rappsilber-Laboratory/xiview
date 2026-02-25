/**
 * Base class for links in the crosslink visualization.
 * Represents connections between proteins or residues.
 */
export class Link {

    /**
     * Creates a new Link instance.
     *
     * @param {CrosslinkViewer} crosslinkViewer - The parent crosslink viewer controller
     */
    constructor(crosslinkViewer) {
        this.controller = crosslinkViewer;
        this.shown = false; //used to avoid some unnecessary manipulation of DOM
        this.isSelected = false;
    }

    /**
     * Handles mouse out events by clearing highlights and tooltips.
     */
    mouseOut() {
        this.controller.model.setMarkedCrossLinks("highlights", []); // which pokes highlighted matches into changing too
        this.controller.model.get("tooltipModel").set("contents", null);
    }

    /**
     * Sets or removes dashed line styling for the link.
     *
     * @param {boolean} dash - True to apply dashed styling, false to remove it
     */
    dashedLine(dash) {
        if (this.shown) {
            if (dash) {
                if (this.renderedFromProtein === this.renderedToProtein) {
                    this.line.setAttribute("stroke-dasharray", (4) + ", " + (4));
                } else {
                    this.line.setAttribute("stroke-dasharray", (4 * this.controller.z) + ", " + (4 * this.controller.z));
                }
            } else {
                this.line.removeAttribute("stroke-dasharray");
            }
        }
    }
}

/**
 * Lazy SVG - the convention xiNET's proteins, protein-protein links, residue links and group-group links follow,
 * so that elements that aren't displayed (e.g. proteins inside collapsed groups, and their links) have no DOM:
 *
 *  - An element builds its SVG in initSVG() the first time it has to be displayed: show() / setHidden(false)
 *    call ensureSVG(), which builds it once and returns whether the element has SVG (svgCreated).
 *  - Its SVG is in the DOM only while it's displayed: show() / setHidden(false) attachSVG(), hide() /
 *    setHidden(true) detachSVG(). The element keeps its SVG objects meanwhile, so showing it again is cheap.
 *    (Measured on 6.7k proteins: thousands of display:none elements left in place made zooming, panning and
 *    layout ticks several times slower than with them removed.)
 *  - svgLayers() says which viewer layer (or, for a residue self link, which group of its protein) each top level
 *    element goes in, and whether at the start of it, so z-order doesn't depend on when an element is built or
 *    shown: links stay between proteinLower and proteinUpper, highlights in their own layer, and so on (see the
 *    layers made in CrosslinkViewer.initialize).
 *  - Nothing gets built while the viewer holds SVG back (controller.svgOnHold: until the first render, and while
 *    the first layout of a large network is deferred, waiting to group and collapse it). Elements keep their state
 *    meanwhile (links stay not shown, proteins keep their hidden flag) and the viewer builds what's visible when the
 *    hold ends.
 *  - initSVG() draws the element in its current state (form, position, zoom, colour, label, annotations,
 *    highlight / selection), so update paths skip elements without SVG - links check `shown`, which a link only
 *    is with SVG; proteins check `svgCreated`.
 */
export const LazySVG = {
    /**
     * Builds this element's SVG (initSVG()) if it hasn't been yet, unless the viewer is holding SVG back.
     * @returns {boolean} true if the element has SVG
     */
    ensureSVG() {
        if (!this.svgCreated) {
            if (this.controller.svgOnHold) {
                return false;
            }
            this.svgCreated = true; // before initSVG(), which can come back here (e.g. a protein's self links)
            this.initSVG();
        }
        return true;
    },

    /**
     * Puts this element's SVG (which must exist) in its layers, if it isn't there.
     */
    attachSVG() {
        for (const [element, layer, atStart] of this.svgLayers()) {
            if (element.parentNode !== layer) {
                layer.insertBefore(element, atStart ? layer.firstChild : null);
            }
        }
    },

    /**
     * Takes this element's SVG, if any, out of the DOM.
     */
    detachSVG() {
        if (this.svgCreated) {
            for (const [element] of this.svgLayers()) {
                if (element.parentNode) {
                    element.parentNode.removeChild(element);
                }
            }
        }
    }
};

/**
 * Adds LazySVG's methods to a class.
 * @param {Function} cls - class with initSVG() and svgLayers() methods and a controller property
 */
export function applyLazySVG(cls) {
    Object.assign(cls.prototype, LazySVG);
}

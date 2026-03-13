import "../../css/searchSummary.css";

import JSONFormatter from "json-formatter-js";
import d3 from "d3";

import {BaseFrameView} from "../ui-utils/base-frame-view";

/**
 * SearchSummaryViewBB displays a formatted JSON tree view of search metadata
 * from mzIdentML files loaded in the crosslinking mass spectrometry session.
 *
 * @class SearchSummaryViewBB
 * @extends BaseFrameView
 */
export class SearchSummaryViewBB extends BaseFrameView {
    constructor(options) {
        super(options);
    }

    /**
     * Default depth level for initially expanded JSON tree nodes
     * @type {number}
     * @constant
     */
    get DEFAULT_OPEN_DEPTH() {
        return 1;
    }

    get events() {
        let parentEvents = BaseFrameView.prototype.events;
        if (typeof parentEvents === "function") {
            parentEvents = parentEvents();
        }
        return {...parentEvents};
    }

    /**
     * Initializes the view and creates the DOM structure for displaying search summaries.
     *
     * @param {Object} viewOptions - Configuration options for the view
     * @returns {SearchSummaryViewBB} This view instance for chaining
     */
    initialize(viewOptions) {
        super.initialize(viewOptions);

        const mainPanel = d3.select(this.el)
            .append("div").attr("class", "panelInner")
            .append("div").attr("class", "verticalFlexContainer");

        // Cache the search summary div element for use in render()
        this.searchSummaryDiv = mainPanel.append("div")
            .attr("class", "searchSummaryDiv")
            .node();

        return this;
    }

    /**
     * Renders the search summary data as an interactive JSON tree.
     * Retrieves mzIdentML file metadata from the backbone-models and displays it
     * using the JSONFormatter library.
     *
     * @returns {SearchSummaryViewBB} This view instance for chaining
     */
    render() {
        try {
            const searches = this.model.getMzidentmlFiles();

            // Validate that we have search data to display
            if (!searches || searches.size === 0) {
                this.searchSummaryDiv.innerHTML = "<p>No search data available.</p>";
                return this;
            }

            // Build object for JSON tree view with GROUP prefix for each search
            const objForJsonView = {};
            for (let search of searches.values()) {
                const keyString = search.identificationFileName;
                objForJsonView[keyString] = search;
            }

            // Pre-process through JSON.stringify to invoke toJSON() methods
            const processedData = JSON.parse(JSON.stringify(objForJsonView));

            // Clear the existing content
            this.searchSummaryDiv.innerHTML = "";

            // Create formatter with configurable open depth
            const formatter = new JSONFormatter(
                processedData,
                this.DEFAULT_OPEN_DEPTH,
                {
                    hoverPreviewEnabled: false,
                    animateOpen: true,
                    animateClose: true
                }
            );

            // Append the rendered JSON to the div
            this.searchSummaryDiv.appendChild(formatter.render());

        } catch (error) {
            console.error("Error rendering search summary:", error);
            this.searchSummaryDiv.innerHTML = "<p>Error displaying search data. Check console for details.</p>";
        }

        return this;
    }

    /**
     * Cleans up cached references when the view is removed.
     * Overrides Backbone.View.remove() to prevent memory leaks.
     */
    remove() {
        this.searchSummaryDiv = null;
        super.remove();
    }

    get identifier() {
        return "mzIdentML Metadata";
    }
}

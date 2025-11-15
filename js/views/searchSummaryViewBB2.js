// eslint-disable-next-line no-unused-vars
import "../../css/searchSummary.css";

import * as $ from "jquery";
import JSONFormatter from "json-formatter-js";
import d3 from "d3";

import {BaseFrameView} from "../ui-utils/base-frame-view";

export class SearchSummaryViewBB extends BaseFrameView {
    constructor(options) {
        super(options);
    }

    get events() {
        let parentEvents = BaseFrameView.prototype.events;
        if (typeof parentEvents === "function") {
            parentEvents = parentEvents();
        }
        return {...parentEvents};
    }

    // eslint-disable-next-line no-unused-vars
    initialize(viewOptions) {
        super.initialize(viewOptions);

        const mainPanel = d3.select(this.el)
            .append("div").attr("class", "panelInner")
            .append("div").attr("class", "verticalFlexContainer");

        mainPanel.append("div").attr("class", "searchSummaryDiv");

        return this;
    }

    render() {
        const searches = this.model.getMzidentmlFiles();
        const objForJsonView = {};
        for (let search of searches.values()) {
            const keyString = "GROUP " + search.id;
            objForJsonView[keyString] = search;
        }

        // Pre-process through JSON.stringify to invoke toJSON() methods
        const processedData = JSON.parse(JSON.stringify(objForJsonView));

        // Clear the existing content
        const div = $(".searchSummaryDiv")[0];
        div.innerHTML = "";

        // Create formatter with openDepth set to 2 (same as old collapse behavior)
        const formatter = new JSONFormatter(processedData, 2, {
            hoverPreviewEnabled: false,
            animateOpen: true,
            animateClose: true
        });

        // Append the rendered JSON to the div
        div.appendChild(formatter.render());

        return this;
    }

    get identifier() {
        return "Search Summaries";
    }
}

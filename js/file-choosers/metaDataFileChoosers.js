import "../../css/csvUpload.css";

import * as _ from "underscore";
import d3 from "d3";

import {BaseFrameView} from "../ui-utils/base-frame-view";
import {
    updateLinkMetadata,
    updateProteinMetadata,
    updateUserAnnotationsMetadata
} from "../modelUtils";
import {loadUserFile} from "./load-user-file";

class AbstractMetaDataFileChooserBB extends BaseFrameView {
    constructor(options) {
        super(options);
    }

    get events() {
        let parentEvents = BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "change .selectMetaDataFileButton": "selectMetaDataFile",
        });
    }

    get defaultOptions() {
        return {
            expandTheseKeys: d3.set(["example"]),
            removeTheseKeys: d3.set(["sectionName", "id"]),
        };
    }

    // eslint-disable-next-line no-unused-vars
    initialize(viewOptions) {
        super.initialize(...arguments);

        const self = this;

        // this.el is the dom element this should be getting added to, replaces targetDiv
        const mainDivSel = d3.select(this.el);

        mainDivSel.classed("metaLoadPanel", true);

        const wrapperPanel = mainDivSel.append("div")
            .attr("class", "panelInner");

        const toolbar = wrapperPanel.append("div").attr("class", "toolbar");

        toolbar.append("label")
            .attr("class", "btn btn-1 btn-1a fakeButton")
            .append("span")
            .text(self.options.buttonText)
            .append("input")
            .attr({
                type: "file",
                accept: "text/csv,.csv,.gaf",
                class: "selectMetaDataFileButton"
            });

        wrapperPanel.append("div").attr("class", "messagebar").style("display", "none");

        const formatPanel = wrapperPanel.append("div").attr("class", "expectedFormatPanel");

        formatPanel.append("a")
            .text("Click to open XiDocs for CSV format details")
            .attr("href", self.options.docUrl)
            .attr("target", "_blank");
    }

    setUpCompletionListener() {
        const self = this;
        this.listenToOnce(window.vent, self.options.loadedEventName, function (metaMetaData, sourceData) {
            if (sourceData && sourceData.source === "file") {
                const columns = metaMetaData.columns;
                const matchedItemCount = metaMetaData.matchedItemCount;
                const success = !!(!_.isEmpty(columns) && matchedItemCount);
                const msg1 = _.template(this.options.parseMsgTemplate)({
                    attrCount: columns ? columns.length : 0,
                    itemCount: matchedItemCount
                });
                self.setStatusText("File " + this.lastFileName + ":<br>" + (success ? "" : "Error! ") + msg1, success);
            }
        });
    }

    setStatusText(msg, success) {
        const mbar = d3.select(this.el).select(".messagebar").style("display", null);
        const t = mbar.html(msg).transition().delay(0).duration(1000).style("color", (success === false ? "red" : (success ? "blue" : null)));
        if (success !== undefined) {
            t.transition().duration(5000).style("color", "var(--main-color)");
        }
    }

    selectMetaDataFile(evt) {
        const fileObj = evt.target.files[0];
        this.setStatusText("Please Wait...");
        this.lastFileName = fileObj.name;
        const onLoadFunc = this.onLoadFunction.bind(this);
        loadUserFile(fileObj, onLoadFunc);
    }
}

AbstractMetaDataFileChooserBB.prototype.identifier = "An Abstract MetaData File Chooser";

export class ProteinMetaDataFileChooserBB extends AbstractMetaDataFileChooserBB {
    constructor(options) {
        super(options);
    }

    initialize(viewOptions) {
        const myDefaults = {
            buttonText: "Select Protein MetaData CSV File",
            loadedEventName: "proteinMetadataUpdated",
            parseMsgTemplate: "Parsed <%= attrCount %> MetaData Attributes across <%= itemCount %> Identified Proteins",
            docUrl: "./docs/html/import/proteinmeta.html",
        };
        viewOptions.myOptions = _.extend(myDefaults, viewOptions.myOptions);
        super.initialize(...arguments);
    }

    onLoadFunction(fileContents) {
        this.setUpCompletionListener();
        updateProteinMetadata(fileContents, this.model.get("clmsModel"));
    }
}

ProteinMetaDataFileChooserBB.prototype.identifier = "Protein MetaData File Chooser";


export class LinkMetaDataFileChooserBB extends AbstractMetaDataFileChooserBB {
    constructor(options) {
        super(options);
    }

    initialize(viewOptions) {
        const myDefaults = {
            buttonText: "Select Crosslink or PPI MetaData CSV File",
            loadedEventName: "linkMetadataUpdated",
            parseMsgTemplate: "Parsed <%= attrCount %> MetaData Attributes across <%= itemCount %> Identified Crosslinks",
            docUrl: "./docs/html/import/crossmeta.html"
        };
        viewOptions.myOptions = _.extend(myDefaults, viewOptions.myOptions);
        super.initialize(...arguments);
    }

    onLoadFunction(fileContents) {
        this.setUpCompletionListener();
        updateLinkMetadata(fileContents, this.model.get("clmsModel"));
    }
}

LinkMetaDataFileChooserBB.prototype.identifier = "Crosslink MetaData File Chooser";


export class UserAnnotationsMetaDataFileChooserBB extends AbstractMetaDataFileChooserBB {
    constructor(options) {
        super(options);
    }

    initialize(viewOptions) {
        const myDefaults = {
            buttonText: "Select User-Defined Annotations CSV File",
            loadedEventName: "userAnnotationsUpdated",
            parseMsgTemplate: "Parsed <%= attrCount %> Annotation Types across <%= itemCount %> Annotations, these have been added to the 'ANNOTATIONS' menu and can be enabled there.",
            docUrl: "./docs/html/import/userannotations.html"
        };
        viewOptions.myOptions = _.extend(myDefaults, viewOptions.myOptions);
        super.initialize(...arguments);
    }

    onLoadFunction(fileContents) {
        this.setUpCompletionListener();
        updateUserAnnotationsMetadata(fileContents, this.model.get("clmsModel"));
    }
}

UserAnnotationsMetaDataFileChooserBB.prototype.identifier = "User Annotations File Chooser";

// const MetaLoaderViewRegistry = [ProteinMetaDataFileChooserBB, LinkMetaDataFileChooserBB, UserAnnotationsMetaDataFileChooserBB];

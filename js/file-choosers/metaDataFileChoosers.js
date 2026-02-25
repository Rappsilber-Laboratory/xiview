/**
 * @fileoverview Metadata file choosers for importing CSV data into xiVIEW.
 * Three concrete implementations: ProteinMetaDataFileChooserBB (protein metadata CSV),
 * LinkMetaDataFileChooserBB (crosslink/PPI metadata CSV), UserAnnotationsMetaDataFileChooserBB
 * (user-defined annotations CSV/GAF). All extend AbstractMetaDataFileChooserBB with shared UI
 * (file selector, message bar, format help link) and completion listener for parsing feedback.
 * Updates CLMS model with parsed metadata, triggers appropriate events for view updates.
 */

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
import vent from "../vent";

/**
 * Abstract base class for metadata file chooser views.
 * Creates file selector button, message bar for status feedback, format help link.
 * Subclasses must provide: buttonText, loadedEventName, parseMsgTemplate, docUrl, onLoadFunction.
 * Sets up completion listener to display parse results (attribute count, matched item count).
 * @class
 * @extends BaseFrameView
 * @property {string} lastFileName - Name of last selected file
 */
class AbstractMetaDataFileChooserBB extends BaseFrameView {
    constructor(options) {
        super(options);
    }

    /**
     * Event handlers for metadata file selection.
     * @returns {Object} Event map with selectors and handler method names
     */
    get events() {
        let parentEvents = BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "change .selectMetaDataFileButton": "selectMetaDataFile",
        });
    }

    /**
     * Default options for metadata parsing (unused).
     * @returns {Object} Default options with expandTheseKeys and removeTheseKeys sets
     */
    get defaultOptions() {
        return {
            expandTheseKeys: d3.set(["example"]),
            removeTheseKeys: d3.set(["sectionName", "id"]),
        };
    }

    /**
     * Initializes abstract metadata chooser view with shared UI elements.
     * Creates file selector button (accepts .csv/.gaf), hidden message bar, format panel with
     * link to XiDocs for CSV format details. Subclasses should call super.initialize() and provide
     * myOptions with buttonText, loadedEventName, parseMsgTemplate, docUrl.
     * @param {Object} viewOptions - Options with myOptions containing buttonText, docUrl, etc.
     * @returns {undefined}
     */
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

    /**
     * Sets up one-time listener for metadata load completion event.
     * Listens to vent for loadedEventName (e.g., "proteinMetadataUpdated"), receives metaMetaData
     * (columns, matchedItemCount), formats success/failure message using parseMsgTemplate,
     * displays message with color (blue=success, red=error). Called by onLoadFunction in subclasses.
     * @returns {undefined}
     */
    setUpCompletionListener() {
        const self = this;
        this.listenToOnce(vent, self.options.loadedEventName, function (metaMetaData, sourceData) {
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

    /**
     * Displays status message in message bar with color transition.
     * Shows message immediately, transitions to blue (success) or red (error) after 1s,
     * then fades to default color after 5s. Handles "Please Wait..." initial state (no color).
     * @param {string} msg - Message HTML to display
     * @param {boolean} [success] - True=blue, false=red, undefined=no color
     * @returns {undefined}
     */
    setStatusText(msg, success) {
        const mbar = d3.select(this.el).select(".messagebar").style("display", null);
        const t = mbar.html(msg).transition().delay(0).duration(1000).style("color", (success === false ? "red" : (success ? "blue" : null)));
        if (success !== undefined) {
            t.transition().duration(5000).style("color", "var(--main-color)");
        }
    }

    /**
     * Handles metadata file selection event.
     * Displays "Please Wait..." message, reads file via loadUserFile, calls subclass's onLoadFunction
     * with file contents. Stores filename for status message.
     * @param {Event} evt - File input change event with evt.target.files
     * @returns {undefined}
     */
    selectMetaDataFile(evt) {
        const fileObj = evt.target.files[0];
        this.setStatusText("Please Wait...");
        this.lastFileName = fileObj.name;
        const onLoadFunc = this.onLoadFunction.bind(this);
        loadUserFile(fileObj, onLoadFunc);
    }
}

AbstractMetaDataFileChooserBB.prototype.identifier = "An Abstract MetaData File Chooser";

/**
 * Protein metadata file chooser for importing protein-level CSV data.
 * Accepts CSV with Protein1 column and arbitrary metadata columns. Updates protein objects
 * with custom metadata attributes. Triggers "proteinMetadataUpdated" event. Links to proteinmeta.html docs.
 * @class
 * @extends AbstractMetaDataFileChooserBB
 */
export class ProteinMetaDataFileChooserBB extends AbstractMetaDataFileChooserBB {
    constructor(options) {
        super(options);
    }

    /**
     * Initializes protein metadata chooser with specific button text, event name, message template, docs URL.
     * Merges defaults with provided options, calls super.initialize().
     * @param {Object} viewOptions - Options extended with myOptions defaults
     * @returns {undefined}
     */
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

    /**
     * Parses protein metadata CSV and updates CLMS model.
     * Sets up completion listener, calls updateProteinMetadata to parse CSV and update protein objects.
     * @param {string} fileContents - CSV file contents as string
     * @returns {undefined}
     */
    onLoadFunction(fileContents) {
        this.setUpCompletionListener();
        updateProteinMetadata(fileContents, this.model.get("clmsModel"));
    }
}

ProteinMetaDataFileChooserBB.prototype.identifier = "Protein MetaData File Chooser";

/**
 * Crosslink/PPI metadata file chooser for importing link-level CSV data.
 * Accepts CSV with Protein1, SeqPos1, Protein2, SeqPos2 columns and arbitrary metadata columns.
 * Updates crosslink objects with custom metadata attributes (e.g., STRING scores, manual annotations).
 * Triggers "linkMetadataUpdated" event. Links to crossmeta.html docs.
 * @class
 * @extends AbstractMetaDataFileChooserBB
 */
export class LinkMetaDataFileChooserBB extends AbstractMetaDataFileChooserBB {
    constructor(options) {
        super(options);
    }

    /**
     * Initializes link metadata chooser with specific button text, event name, message template, docs URL.
     * Merges defaults with provided options, calls super.initialize().
     * @param {Object} viewOptions - Options extended with myOptions defaults
     * @returns {undefined}
     */
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

    /**
     * Parses link metadata CSV and updates CLMS model.
     * Sets up completion listener, calls updateLinkMetadata to parse CSV and update crosslink objects.
     * @param {string} fileContents - CSV file contents as string
     * @returns {undefined}
     */
    onLoadFunction(fileContents) {
        this.setUpCompletionListener();
        updateLinkMetadata(fileContents, this.model.get("clmsModel"));
    }
}

LinkMetaDataFileChooserBB.prototype.identifier = "Crosslink MetaData File Chooser";

/**
 * User-defined annotations file chooser for importing custom annotation types.
 * Accepts CSV or GAF format with ProteinID, Begin, End, Name, Category, Description columns.
 * Creates new AnnotationType objects and adds to annotation type collection. Annotations appear
 * in ANNOTATIONS dropdown menu. Triggers "userAnnotationsUpdated" event. Links to userannotations.html docs.
 * @class
 * @extends AbstractMetaDataFileChooserBB
 */
export class UserAnnotationsMetaDataFileChooserBB extends AbstractMetaDataFileChooserBB {
    constructor(options) {
        super(options);
    }

    /**
     * Initializes user annotations chooser with specific button text, event name, message template, docs URL.
     * Merges defaults with provided options, calls super.initialize().
     * @param {Object} viewOptions - Options extended with myOptions defaults
     * @returns {undefined}
     */
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

    /**
     * Parses user annotations CSV/GAF and updates CLMS model.
     * Sets up completion listener, calls updateUserAnnotationsMetadata to parse file and create annotation types.
     * @param {string} fileContents - CSV or GAF file contents as string
     * @returns {undefined}
     */
    onLoadFunction(fileContents) {
        this.setUpCompletionListener();
        updateUserAnnotationsMetadata(fileContents, this.model.get("clmsModel"));
    }
}

UserAnnotationsMetaDataFileChooserBB.prototype.identifier = "User Annotations File Chooser";

// const MetaLoaderViewRegistry = [ProteinMetaDataFileChooserBB, LinkMetaDataFileChooserBB, UserAnnotationsMetaDataFileChooserBB];

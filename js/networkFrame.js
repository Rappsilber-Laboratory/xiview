import "../css/networkPage.css";
import "../css/xispecAdjust.css";

import * as _ from "underscore";
import Backbone from "backbone";
import * as $ from "jquery";
import d3 from "d3";
import {ByRei_dynDiv} from "../vendor/byrei-dyndiv_1.0rc1-src";

import {BlosumCollection} from "./model/models";
import {ProtAlignCollection} from "./align/protein-alignment-model-collection";
import {displayError, getLocalStorage, setLocalStorage} from "./utils";
import {SearchResultsModel} from "../../CLMS-model/src/search-results-model";
import {flattenMatches, getSearchGroups, matchScoreRange, parseURLQueryString} from "./modelUtils";
import {FilterModel} from "./filter/filter-model";
import {TooltipModel} from "./model/models";
import {MinigramModel} from "./model/models";
import {CompositeModel} from "./model/composite-model";
import {FDRSummaryViewBB, FDRViewBB, FilterViewBB} from "./filter/filterViewBB";
import {FilterSummaryViewBB} from "./filter/filterViewBB";
import {MinigramViewBB} from "./filter/minigramViewBB";
import {SelectionTableViewBB} from "./views/selectionTableViewBB";
import {SpectrumViewWrapper} from "./views/spectrumViewWrapper";

import {xiSPEC_wrapper} from "../../spectrum/src/Wrapper";
import {DropDownMenuViewBB} from "./ui-utils/ddMenuViewBB";
import {
    downloadMatches, downloadSSL, downloadLinks, downloadResidueCount,
    downloadGroups, downloadPPIs, downloadModificationCount, downloadProteinAccessions
} from "./downloads";
import {TooltipViewBB} from "./views/tooltipViewBB";
import {checkBoxView} from "./ui-utils/checkbox-view";
import {xiNetControlsViewBB} from "./views/xiNetControlsViewBB";
import {CrosslinkViewer} from "../../crosslink-viewer/src/crosslink-viewer-BB";
import {AnnotationType} from "./model/annotation-model-collection";
import {AnnotationTypeCollection} from "./model/annotation-model-collection";
import {KeyViewBB} from "./views/key/keyViewBB";
import {SearchSummaryViewBB} from "./views/searchSummaryViewBB";
import {CircularViewBB} from "./views/circle/circularViewBB";
import {AnnotationDropDownMenuViewBB} from "./ui-utils/ddMenuViewBB";
import {ColourCollectionOptionViewBB} from "./ui-utils/color-collection-option-view";
import {AlignCollectionViewBB} from "./align/alignViewBB3";
import {DistogramBB} from "./views/distogramViewBB";
import {NGLViewBB} from "./views/ngl/NGLViewBB";
import {PDBFileChooserBB} from "./file-choosers/PDBFileChooser";
import {STRINGFileChooserBB} from "./file-choosers/STRINGFileChooser";
import {ScatterplotViewBB} from "./views/scatterplotViewBB";
import {
    LinkMetaDataFileChooserBB,
    ProteinMetaDataFileChooserBB,
    UserAnnotationsMetaDataFileChooserBB
} from "./file-choosers/metaDataFileChoosers";
import {GoTermsViewBB} from "./views/go/goTermsSankeyViewBB";
import {ProteinInfoViewBB} from "./views/proteinInfoViewBB";

import {setupColourModels} from "./model/color/setup-colors";
import {DistanceMatrixViewBB} from "./views/matrixViewBB";
import {loadSpectrum} from "./loadSpectrum";

// http://stackoverflow.com/questions/11609825/backbone-js-how-to-communicate-between-views
window.vent = {};
_.extend(window.vent, Backbone.Events);

export const init = {};

// only when sequences and blosums have been loaded, if only one or other either no align models = crash, or no blosum matrices = null
init.postDataLoaded = function () {
    console.log("DATA LOADED AND WINDOW LOADED");

    window.compositeModelInst.set("go", window.go); // add pre-parsed go terms to compositeModel from placeholder
    window.go = null;//todo - get rid of use of window.*

    // Now we have blosum models and sequences, we can set blosum defaults for alignment models
    window.compositeModelInst.get("alignColl").models.forEach(function (protAlignModel) {
        protAlignModel.set("scoreMatrix", window.blosumCollInst.get("Blosum100"));
    });

    //init annotation types
    let annotationTypes = [
        new AnnotationType({
            category: "AA",
            type: "Digestible",
            tooltip: "Mark Digestible Residues",
            source: "Search",
            colour: "#1f78b4",
        }),
        new AnnotationType({
            category: "AA",
            type: "Crosslinkable-1",
            tooltip: "Mark CrossLinkable residues (first or only reactive group)",
            source: "Search",
            colour: "#a6cee3",
        }),
        new AnnotationType({
            category: "AA",
            type: "Cross-linkable-2",
            tooltip: "Mark CrossLinkable residues (second reactive group if heterobifunctional cross-linker)",
            source: "Search",
            colour: "#a6cee3",
        }),
        new AnnotationType({
            category: "Alignment",
            type: "PDB aligned region",
            tooltip: "Show regions that align to currently loaded PDB Data",
            source: "PDB",
            colour: "#b2df8a",
        })
    ];

    //  make uniprot feature types - done here as need proteins parsed and ready from xi
    const uniprotFeatureTypes = new Map();
    for (let participant of window.compositeModelInst.get("clmsModel").get("participants").values()) { //todo - remove static ref?
        if (participant.uniprot) {
            const featureArray = Array.from(participant.uniprot.features);
            featureArray.forEach(function (feature) {
                const key = feature.category + "-" + feature.type;
                if (!uniprotFeatureTypes.has(key)) {
                    const annotationType = new AnnotationType(feature);
                    annotationType
                        .set("source", "Uniprot")
                        .set("typeAlignmentID", "Canonical");
                    uniprotFeatureTypes.set(key, annotationType);
                }
            });
        }
    }

    // add uniprot feature types
    annotationTypes = annotationTypes.concat(Array.from(uniprotFeatureTypes.values()));
    const annotationTypeCollection = new AnnotationTypeCollection(annotationTypes);
    window.compositeModelInst.set("annotationTypes", annotationTypeCollection);

    window.vent.trigger("buildAsyncViews");
    //init.viewsThatNeedAsyncData();

    window.compositeModelInst.applyFilter(); // do it first time so filtered sets aren't empty

    window.vent.trigger("initialSetupDone"); //	Message that models and views are ready for action, with filter set initially

    //todo - bit hacky having this here, but it works here and not elsewhere (for reasons unknown)
    if (window.compositeModelInst.get("clmsModel").get("searches").size > 1) {
        d3.select("#linkColourSelect").property("value", "Group");
    }

};

// This bar function calls postDataLoaded on the 4th go, ensuring all data is in place from various data loading ops
export const allDataLoaded = _.after(4, init.postDataLoaded);

// for qunit testing
init.pretendLoad = function () {
    allDataLoaded();
    allDataLoaded();
};

init.blosumLoading = function (options) {
    options = options || {};

    // Collection of blosum matrices that will be fetched from a json file
    window.blosumCollInst = new BlosumCollection(options); // options if we want to override defaults

    // when the blosum Collection is fetched (an async process), we select one of its models as being selected
    window.blosumCollInst.listenToOnce(window.blosumCollInst, "sync", function () {
        console.log("ASYNC. blosum models loaded");
        allDataLoaded();
    });

    // Start the asynchronous blosum fetching after the above events have been set up
    window.blosumCollInst.fetch(options);
};

init.models = function (options) {

    // define alignment model and listeners first, so they're ready to pick up events from other models
    const alignmentCollectionInst = new ProtAlignCollection();
    options.alignmentCollectionInst = alignmentCollectionInst;

    // HACK - does nothing at moment anyway because uniprot annotations aren't available //todo - this comment is wrong, right
    alignmentCollectionInst.listenToOnce(window.vent, "uniprotDataParsed", function (clmsModel) {
        this.addNewProteins(Array.from(clmsModel.get("participants").values()));
        // console.log("ASYNC. uniprot sequences poked to collection", this);
        allDataLoaded();
    });

    this.modelsEssential(options);

    // following listeners require window.compositeModelInst etc to be set up in modelsEssential() so placed afterwards

    // this listener adds new sequences obtained from pdb files to existing alignment sequence models
    alignmentCollectionInst.listenTo(window.compositeModelInst, "3dsync", function (sequences, removeThese) {
        if (!_.isEmpty(sequences)) { // if sequences passed and it has a non-zero length...
            console.log("3dsync", arguments);
            // remove before add so if someone decides to reload the same file/code (why, but possible) we don't end up removing what we've just added
            if (removeThese && removeThese.length) {
                removeThese.forEach(function (structureName) {
                    const seqModels = this.getSequencesByPredicate(function (seq) {
                        return structureName + ":" === seq.get("id").substring(0, structureName.length + 1);
                    });
                    this.removeSequences(seqModels);
                }, this);
            }
            sequences.forEach(function (entry) {
                this.addSequence(entry.id, entry.name, entry.data, entry.otherAlignSettings);
            }, this);
            // this triggers an event to say loads has changed in the alignment collection
            // more efficient to listen to that then redraw/recalc for every seq addition

            this.bulkAlignChangeFinished();

            console.log("3D sequences poked to collection", this);
        }
    });


    // this listener makes new alignment sequence models based on the current participant set (this usually gets called after a csv file is loaded)
    // it uses the same code as that used when a xi search is the source of data, see earlier in this code (roughly line 96'ish)
    alignmentCollectionInst.listenTo(window.compositeModelInst.get("clmsModel"), "change:matches", function () {
        this.addNewProteins(Array.from(window.compositeModelInst.get("clmsModel").get("participants").values()));
        // this triggers an event to say loads has changed in the alignment collection
        // more efficient to listen to that then redraw/recalc for every seq addition
        this.bulkAlignChangeFinished();

        console.log("CSV sequences poked to collection", this);
    });

    // Set up colour models, some (most) of which depend on data properties
    const crosslinkerKeys = d3.keys(window.compositeModelInst.get("clmsModel").get("crosslinkerSpecificity"));
    const storedDistanceColourSettings = crosslinkerKeys.length === 1 ? _.propertyOf(getLocalStorage())(["distanceColours", crosslinkerKeys[0]]) : undefined;
    setupColourModels({distance: storedDistanceColourSettings});

    if (crosslinkerKeys.length === 1) {
        window.compositeModelInst.listenTo(window.linkColor.Collection.get("Distance"), "colourModelChanged", function (colourModel, attr) {
            const obj = {distanceColours: {}};
            obj.distanceColours[crosslinkerKeys[0]] = attr;
            setLocalStorage(obj);
        });
    }

    // A colour model's attributes have changed - is it the currently used model? If so, fire the currentColourModelChanged event
    window.compositeModelInst.listenTo(window.linkColor.Collection, "colourModelChanged", function (colourModel, changedAttrs) {
        if (this.get("linkColourAssignment").id === colourModel.id) {
            this.trigger("currentColourModelChanged", colourModel, changedAttrs);
        }
    });

    // same for protein colour models
    window.compositeModelInst.listenTo(window.linkColor.ProteinCollection, "colourModelChanged", function (colourModel, changedAttrs) {
        if (this.get("proteinColourAssignment").id === colourModel.id) {
            this.trigger("currentProteinColourModelChanged", colourModel, changedAttrs);
        }
    });

    // Set initial colour scheme choices
    // If more than one search, set group colour scheme to be default. https://github.com/Rappsilber-Laboratory/xi3-issue-tracker/issues/72
    window.compositeModelInst
        .set("linkColourAssignment",
            window.compositeModelInst.get("clmsModel").get("searches").size > 1 ? window.linkColor.groupColoursBB : window.linkColor.defaultColoursBB
        )
        .set("proteinColourAssignment", window.linkColor.defaultProteinColoursBB);
};

//only inits stuff required by validation page
init.modelsEssential = function (options) {
    const hasMissing = !_.isEmpty(options.missingSearchIDs);
    const hasIncorrect = !_.isEmpty(options.incorrectSearchIDs);
    const hasNoMatches = _.isEmpty(options.rawMatches);

    displayError(function () {
        return hasMissing || hasIncorrect || hasNoMatches;
    },
    (hasMissing ? "Cannot find Search ID" + (options.missingSearchIDs.length > 1 ? "s " : " ") + options.missingSearchIDs.join(", ") + ".<br>" : "") +
        (hasIncorrect ? "Wrong ID Key for Search ID" + (options.incorrectSearchIDs.length > 1 ? "s " : " ") + options.incorrectSearchIDs.join(", ") + ".<br>" : "") +
        (!hasMissing && !hasIncorrect && hasNoMatches ? "No cross-links detected for this search.<br>" : "")
    );

    // This SearchResultsModel is what fires (sync or async) the uniprotDataParsed event we've set up a listener for above ^^^
    const clmsModelInst = new SearchResultsModel();
    //console.log ("options", options, JSON.stringify(options));
    clmsModelInst.parseJSON(options);

    const scoreExtentInstance = matchScoreRange(clmsModelInst.get("matches"), true);
    if (scoreExtentInstance[0]) {
        scoreExtentInstance[0] = Math.min(0, scoreExtentInstance[0]); // make scoreExtent min zero, if existing min isn't negative
    }
    let filterSettings = {
        decoys: clmsModelInst.get("decoysPresent"),
        betweenLinks: true, //clmsModelInst.targetProteinCount > 1,
        A: clmsModelInst.get("manualValidatedPresent"),
        B: clmsModelInst.get("manualValidatedPresent"),
        C: clmsModelInst.get("manualValidatedPresent"),
        Q: clmsModelInst.get("manualValidatedPresent"),
        // AUTO: !clmsModelInst.get("manualValidatedPresent"),
        ambig: clmsModelInst.get("ambiguousPresent"),
        linears: clmsModelInst.get("linearsPresent"),
        //matchScoreCutoff: [undefined, undefined],
        matchScoreCutoff: scoreExtentInstance.slice(),
        //distanceCutoff: [0, 250],
        searchGroups: getSearchGroups(clmsModelInst),
    };
    // const urlFilterSettings = FilterModel.prototype.getFilterUrlSettings(urlChunkMap);
    // filterSettings = _.extend(filterSettings, urlFilterSettings); // overwrite default settings with url settings
    // console.log("urlFilterSettings", urlFilterSettings, "progFilterSettings", filterSettings);
    const filterModelInst = new FilterModel(filterSettings, {
        scoreExtent: scoreExtentInstance,
        //distanceExtent: [0, 250],
        possibleSearchGroups: getSearchGroups(clmsModelInst),
    });

    const tooltipModelInst = new TooltipModel();


    // Make score and distance minigram models, and add listeners to make sure they synchronise to attributes in filter model
    const minigramModels = ["matchScoreCutoff", "distanceCutoff"].map(function (filterAttrName) {
        const filterAttr = filterModelInst.get(filterAttrName);
        const miniModel = new MinigramModel({
            domainStart: filterAttr[0],// || 0,
            domainEnd: filterAttr[1],// || 1,
        });
        miniModel
            .listenTo(filterModelInst, "change:" + filterAttrName, function (filterModel, newCutoff) {
                this.set({
                    domainStart: newCutoff[0],
                    domainEnd: newCutoff[1]
                });
            });

        // When the range changes on these models pass the values onto the appropriate value in the filter model
        filterModelInst.listenTo(miniModel, "change", function (model) {
            this.set(filterAttrName, [model.get("domainStart"), model.get("domainEnd")]);
        }, this);

        return miniModel;
    });

    // Data generation routines for minigram models
    minigramModels[0].data = function () {
        return flattenMatches(clmsModelInst.get("matches")); // matches is now an array of arrays - [matches, []];
    };
    minigramModels[1].data = function () {
        const crosslinks = window.compositeModelInst.getAllCrossLinks();
        const distances = crosslinks
            .map(function (clink) {
                return clink.getMeta("distance");
            })
            .filter(function (dist) {
                return dist !== undefined;
            });
        return [distances];
    };

    // change in distanceObj changes the distanceExtent in filter model and should trigger a re-filter for distance minigram model as dists may have changed
    minigramModels[1]
        .listenTo(clmsModelInst, "change:distancesObj", function (clmsModel, distObj) {
            //console.log ("minigram arguments", arguments, this);
            const max = Math.ceil(distObj.maxDistance);
            this.set("extent", [0, max + 1]);
            filterModelInst.distanceExtent = [0, max];
            filterModelInst
                .trigger("change:distanceCutoff", filterModelInst, [this.get("domainStart"), this.get("domainEnd")])
                .trigger("change", filterModelInst, {showHide: true});
        });

    // overarching model
    window.compositeModelInst = new CompositeModel({
        clmsModel: clmsModelInst,
        filterModel: filterModelInst,
        tooltipModel: tooltipModelInst,
        alignColl: options.alignmentCollectionInst,
        minigramModels: {distance: minigramModels[1], score: minigramModels[0]},
    });

    //moving this to end of allDataLoaded - think validation page needs this, TODO, check
    window.compositeModelInst.applyFilter(); // do it first time so filtered sets aren't empty

    // instead of views listening to changes in filter directly, we listen to any changes here, update filtered stuff
    // and then tell the views that filtering has occurred via a custom event ("filtering Done") in applyFilter().
    // This ordering means the views are only notified once the changed data is ready.
    window.compositeModelInst.listenTo(filterModelInst, "change", function () {
        // console.log("filterChange");
        this.applyFilter();
    });

};

init.views = function () {

    const compModel = window.compositeModelInst;
    const matchesFound = !_.isEmpty(compModel.get("clmsModel").get("matches"));
    //console.log("MODEL", compModel);

    //todo: only if there is validated {
    // compModel.get("filterModel").set("unval", false); // set to false in filter model defaults

    const windowIds = ["spectrumPanelWrapper", "spectrumSettingsWrapper", "keyPanel", "nglPanel", "distoPanel", "matrixPanel", "alignPanel", "circularPanel", "proteinInfoPanel", "pdbPanel", "stringPanel", "csvPanel", "searchSummaryPanel", "linkMetaLoadPanel", "proteinMetaLoadPanel", "userAnnotationsMetaLoadPanel", "gafAnnotationsMetaLoadPanel", "scatterplotPanel", "urlSearchBox", "listPanel", "goTermsPanel"];
    // something funny happens if I do a data join and enter with d3 instead
    // ('distoPanel' datum trickles down into chart axes due to unintended d3 select.select inheritance)
    // http://stackoverflow.com/questions/18831949/d3js-make-new-parent-data-descend-into-child-nodes
    windowIds.forEach(function (winid) {
        d3.select("body").append("div")
            .attr("id", winid)
            .attr("class", "dynDiv dynDiv_bodyLimit");
    });

    init.viewsEssential({
        "specWrapperDiv": "#spectrumPanelWrapper"
    });

    // Generate checkboxes for view dropdown
    const checkBoxData = [
        {
            id: "keyChkBxPlaceholder",
            label: "Legend & Colours",
            eventName: "keyViewShow",
            tooltip: "Explains and allows changing of current colour scheme",
            sectionEnd: true
        },
        {
            id: "circularChkBxPlaceholder",
            label: "Circular",
            eventName: "circularViewShow",
            tooltip: "Proteins are arranged in a circle, with crosslinks drawn in-between",
        },
        {
            id: "nglChkBxPlaceholder",
            label: "3D (NGL)",
            eventName: "nglViewShow",
            tooltip: "Spatial view of protein complexes and crosslinks. Requires a relevant PDB File to be loaded [Load > PDB Data]"
        },
        {
            id: "matrixChkBxPlaceholder",
            label: "Matrix",
            eventName: "matrixViewShow",
            tooltip: "AKA Contact Map. Relevant PDB File required for distance background"
        },
        {
            id: "proteinInfoChkBxPlaceholder",
            label: "Protein Info",
            eventName: "proteinInfoViewShow",
            tooltip: "Shows metadata and crosslink annotated sequences for currently selected proteins"
        },
        {
            id: "spectrumChkBxPlaceholder",
            label: "Spectrum",
            eventName: "spectrumShow",
            tooltip: "View the spectrum for a selected match (selection made through Selected Match Table after selecting Crosslinks)",
            sectionEnd: true
        },
        {
            id: "distoChkBxPlaceholder",
            label: "Histogram",
            eventName: "distoViewShow",
            tooltip: "Configurable view for showing distribution of one crosslink/match property"
        },
        {
            id: "scatterplotChkBxPlaceholder",
            label: "Scatterplot",
            eventName: "scatterplotViewShow",
            tooltip: "Configurable view for comparing two crosslink/match properties",
        },
        {
            id: "alignChkBxPlaceholder",
            label: "Alignment",
            eventName: "alignViewShow",
            tooltip: "Shows alignments between Search/PDB/Uniprot sequences per protein"
        },
        {
            id: "searchSummaryChkBxPlaceholder",
            label: "Search Summaries",
            eventName: "searchesViewShow",
            tooltip: "Shows metadata for current searches",
            sectionEnd: false
        },
        {
            id: "goTermsChkBxPlaceholder",
            label: "GO Terms",
            eventName: "goTermsViewShow",
            tooltip: "Browse Gene Ontology terms"
        },
    ];
    checkBoxData.forEach(function (cbdata) {
        const options = $.extend({
            labelFirst: false
        }, cbdata);
        const cbView = new checkBoxView({
            myOptions: options
        });
        $("#viewDropdownPlaceholder").append(cbView.$el);
    }, this);

    // Add them to a drop-down menu (this rips them away from where they currently are - document)
    const maybeViews = ["#nglChkBxPlaceholder" /*, "#distoChkBxPlaceholder"*/];
    const mostViews = checkBoxData.map(function (d) {
        return "#" + d.id;
    }).filter(function (id) {
        return id !== "#keyChkBxPlaceholder" && id !== "#nglChkBxPlaceholder";
    });
    new DropDownMenuViewBB({
        el: "#viewDropdownPlaceholder",
        model: compModel.get("clmsModel"),
        myOptions: {
            title: "Views",
            menu: checkBoxData,
            //tooltipModel: compModel.get("tooltipModel")
        }
    })
        // hide/disable view choices that depend on certain data being present until that data arrives
        .enableItemsByID(maybeViews, false)
        .enableItemsByID(mostViews, matchesFound)
        .listenTo(compModel.get("clmsModel"), "change:distancesObj", function (model, newDistancesObj) {
            this.enableItemsByID(maybeViews, !!newDistancesObj);
        })
        .listenTo(compModel.get("clmsModel"), "change:matches", function () {
            this.enableItemsByID(mostViews, true);
        });


    // Generate protein selection drop down
    d3.select("body").append("input")
        .attr("type", "text")
        .attr("id", "proteinSelectionFilter");
    d3.select("body").append("input")
        .attr("type", "text")
        .attr("id", "groupSelected");

    new DropDownMenuViewBB({
        el: "#proteinSelectionDropdownPlaceholder",
        model: compModel.get("clmsModel"),
        myOptions: {
            title: "Protein-Selection",
            menu: [{
                name: "Hide Selected",
                func: compModel.hideSelectedProteins,
                context: compModel,
                tooltip: "Hide selected proteins",
            },
            {
                name: "Hide Unselected",
                func: compModel.hideUnselectedProteins,
                context: compModel,
                tooltip: "Hide unselected proteins",
                sectionEnd: true
            },
            {
                name: "+Neighbours",
                func: compModel.stepOutSelectedProteins,
                context: compModel,
                tooltip: "Select proteins which are crosslinked to already selected proteins",
                categoryTitle: "Change Selection",
                sectionBegin: true
            },
            {
                sectionBegin: true,
                id: "proteinSelectionFilter",
                func: compModel.proteinSelectionTextFilter,
                closeOnClick: false,
                context: compModel,
                tooltip: "Select proteins whose descriptions include input text",
                categoryTitle: "Select by text filter:",
                sectionEnd: true
            }
            ],
            //tooltipModel: compModel.get("tooltipModel")
            sectionHeader: function (d) {
                return (d.categoryTitle ? d.categoryTitle.replace(/_/g, " ") : "");
            },
        }
    })
        .wholeMenuEnabled(matchesFound)
        .listenTo(compModel.get("clmsModel"), "change:matches", function () {
            this.wholeMenuEnabled(true);
        });


    new DropDownMenuViewBB({
        el: "#groupsDropdownPlaceholder",
        model: compModel.get("clmsModel"),
        myOptions: {
            title: "Groups",
            menu: [
                {
                    sectionBegin: true,
                    categoryTitle: "Group Selected - enter name:",
                    id: "groupSelected",
                    func: compModel.groupSelectedProteins,
                    closeOnClick: false,
                    context: compModel,
                    tooltip: "Enter group name",
                },
                {
                    name: "Clear Groups",
                    func: compModel.clearGroups,
                    context: compModel,
                    tooltip: "Clears all groups"
                },
                {
                    name: "Auto Group",
                    func: compModel.autoGroup,
                    context: compModel,
                    tooltip: "Group protein complexes based on GO terms. (Will clear old groups.)",
                    sectionEnd: true
                },
                {
                    name: "Collapse All",
                    func: compModel.collapseGroups,
                    context: compModel,
                    tooltip: "Collapse all groups",
                },
                {
                    name: "Expand All",
                    func: compModel.expandGroups,
                    context: compModel,
                    tooltip: "Expand all groups",
                }
            ],
            //tooltipModel: compModel.get("tooltipModel")
            sectionHeader: function (d) {
                return (d.categoryTitle ? d.categoryTitle.replace(/_/g, " ") : "");
            },
        }
    })
        .wholeMenuEnabled(matchesFound)
        .listenTo(compModel.get("clmsModel"), "change:matches", function () {
            this.wholeMenuEnabled(true);
        });

    // Generate buttons for load dropdown
    const loadButtonData = [{
        name: "PDB",
        eventName: "pdbFileChooserShow",
        tooltip: "Load a PDB File from local disk or by PDB ID code from RCSB.org. Allows viewing of 3D Structure and of distance background in Matrix View"
    },
    {
        name: "STRING",
        eventName: "stringDataChooserShow",
        tooltip: "Load STRING data from the STRING server. Note: limited to <2,000 proteins, for more generate a CSV file for import as PPI Metadata"
    },
    {
        name: "Edge Metadata",
        eventName: "linkMetaDataFileChooserShow",
        tooltip: "Load edge (crosslink or PPI) meta-data from a local CSV file"
    },
    {
        name: "Node Metadata",
        eventName: "proteinMetaDataFileChooserShow",
        tooltip: "Load node (protein) meta-data from a local CSV file"
    },
    {
        name: "Sequence Annotations",
        eventName: "userAnnotationsMetaDataFileChooserShow",
        tooltip: "Load custom domain annotations (or other sequence annotations) from a local CSV file"
    },
    ];
    loadButtonData.forEach(function (bdata) {
        bdata.func = function () {
            window.vent.trigger(bdata.eventName, true);
        };
    });
    new DropDownMenuViewBB({
        el: "#loadDropdownPlaceholder",
        model: compModel.get("clmsModel"),
        myOptions: {
            title: "Import",
            menu: loadButtonData,
            //tooltipModel: compModel.get("tooltipModel"),
        }
    }) // hide/disable view choices that depend on certain data being present until that data arrives
        .enableItemsByIndex([0, 2, 3], matchesFound)
        .listenTo(compModel.get("clmsModel"), "change:matches", function () {
            this.enableItemsByIndex([0, 2, 3], true);
        })
        .setVis(!matchesFound); // open as default if empty search

    // new URLSearchBoxViewBB({
    //     el: "#urlSearchBox",
    //     model: compModel,
    //     displayEventName: "shareURLViewShow",
    //     myOptions: {}
    // });

    new xiNetControlsViewBB({
        el: "#xiNetButtonBar",
        model: compModel
    });

    // Set up a one-time event listener that is then called from allDataLoaded
    // Once this is done, the views depending on async loading data (blosum, uniprot) can be set up
    // Doing it here also means that we don't have to set up these views at all if these views aren't needed (e.g. for some testing or validation pages)
    compModel.listenToOnce(window.vent, "buildAsyncViews", function () {
        init.viewsThatNeedAsyncData();
    });
};

init.viewsEssential = function (options) {

    const compModel = window.compositeModelInst;
    const filterModel = compModel.get("filterModel");

    // var singleTargetProtein = compModel.get("clmsModel").targetProteinCount < 2;
    new FilterViewBB({
        el: "#filterPlaceholder",
        model: filterModel,
        myOptions: {
            hide: {
                "AUTO": !compModel.get("clmsModel").get("autoValidatedPresent"),
                "ambig": !compModel.get("clmsModel").get("ambiguousPresent"),
                "unval": !compModel.get("clmsModel").get("unvalidatedPresent"),
                "linears": !compModel.get("clmsModel").get("linearsPresent"),
            }
        }
    });

    new FilterSummaryViewBB({
        el: "#filterReportPlaceholder",
        model: compModel,
    });

    const unvalidatedPresent = compModel.get("clmsModel").get("unvalidatedPresent");
    if (unvalidatedPresent !== true) {
        d3.select("#filterModeDiv").style("display", "none");
    }
    const linearsPresent = compModel.get("clmsModel").get("linearsPresent");
    if (linearsPresent !== true) {
        d3.select("#product").style("display", "none");
    }


    // Generate minigram views
    const minigramViewConfig = [
        {
            id: "score",
            el: "#filterPlaceholdermatchScoreSliderHolder",
            seriesNames: ["Targets", "Decoys"],
            colours: ["blue", "red"],
            label: "Score"
        },
        {
            id: "distance",
            el: "#filterPlaceholderdistanceFilterSliderHolder",
            seriesNames: ["Distances"],
            colours: ["blue"],
            label: "Distance"
        },
    ];
    const minigramViews = minigramViewConfig.map(function (config) {
        return new MinigramViewBB({
            el: config.el,
            model: compModel.get("minigramModels")[config.id],
            myOptions: {
                maxX: 0, // let data decide
                seriesNames: config.seriesNames,
                //scaleOthersTo: "Matches",
                xlabel: config.label,
                ylabel: "Count",
                height: 65,
                colours: _.object(_.zip(config.seriesNames, config.colours)), // [a,b],[c,d] -> [a,c],[b,d] -> {a:c, b:d}
            }
        })
            // If the clmsModel matches attribute changes then tell the mini histogram view
            .listenTo(compModel.get("clmsModel"), "change:matches", function () {
                this.render().redrawBrush();
            }); // if the matches change (likely?) need to re-render the view too
    });

    // redraw brush when distancesObj is changed, extent is likely to be different
    minigramViews[1]
        .listenTo(compModel.get("clmsModel"), "change:distancesObj", function (clmsModel, distObj) {
            this.render().redrawBrush();
        }); // if the distances change (likely?) need to re-render the view too


    // World of code smells vol.1
    // selectionViewer declared before spectrumWrapper because...
    // 1. Both listen to event A, selectionViewer to build table, spectrumWrapper to do other stuff
    // 2. Event A in spectrumWrapper fires event B
    // 3. selectionViewer listens for event B to highlight row in table - which means it must have built the table
    // 4. Thus selectionViewer must do its routine for event A before spectrumWrapper, so we initialise it first
    const selectionViewer = new SelectionTableViewBB({
        el: "#bottomDiv",
        model: compModel,
    });

    selectionViewer.lastCount = 1;
    selectionViewer.render();

    new SpectrumViewWrapper({
        el: options.specWrapperDiv,
        model: compModel,
        displayEventName: "spectrumShow",
        myOptions: {
            wrapperID: "spectrumPanel",
            canBringToTop: options.spectrumToTop
        }
    })
        .listenTo(window.vent, "individualMatchSelected", function (match) {
            if (match) {
                this.lastRequestedID = match.id; // async catch
                //console.log ("MATCH ID", this, match.id);
                this.primaryMatch = match; // the 'dynamic_rank = true' match
                const url = "../CLMS-model/php/spectrumMatches.php?sid=" +
                    this.model.get("clmsModel").get("sid") +
                    "&unval=1&linears=1&spectrum=" + match.spectrumId + "&matchid=" + match.id;
                const self = this;
                d3.json(url, function (error, json) {
                    if (error) {
                        console.log("error", error, "for", url, arguments);
                    } else {
                        // this works if first item in array has the same id, might in future send matchid to php to return for reliability
                        //var thisMatchID = json.rawMatches && json.rawMatches[0] ? json.rawMatches[0].id : -1;
                        const returnedMatchID = json.matchid;

                        //console.log ("json", json, self.lastRequestedID, thisMatchID, returnedMatchID);
                        if (returnedMatchID == self.lastRequestedID) { // == not === 'cos returnedMatchID is a atring and self.lastRequestedID is a number
                            //console.log (":-)", json, self.lastRequestedID, thisSpecID);
                            const altModel = new SearchResultsModel();
                            altModel.parseJSON(json);
                            const allCrossLinks = Array.from(altModel.get("crosslinks").values());
                            // empty selection first
                            // (important or it will crash coz selection contains links to proteins not in clms model)
                            self.alternativesModel
                                .set("selection", [])
                                .set("clmsModel", altModel)
                                .applyFilter()
                                .set("lastSelectedMatch", {
                                    match: match,
                                    directSelection: true
                                });
                            d3.select("#alternatives").style("display", altModel.get("matches").length === 1 ? "none" : "block");
                            //self.alternativesModel.set("selection", allCrossLinks);
                            self.alternativesModel.setMarkedCrossLinks("selection", allCrossLinks, false, false);
                            window.vent.trigger("resizeSpectrumSubViews", true);
                        }
                    }
                });
            } else {
                //~ //this.model.clear();
            }
        });

    const xiSPEC_options = {
        targetDiv: "modular_xispec",
        baseDir: window.xiSpecBaseDir,
        xiAnnotatorBaseURL: window.xiAnnotRoot,
        knownModificationsURL: window.xiAnnotRoot + "annotate/knownModifications",
        showCustomConfig: true,
        showQualityControl: "min",
        colorScheme: "PRGn"
    };

    window.xiSPEC = new xiSPEC_wrapper(xiSPEC_options);

    // Update spectrum view when external resize event called
    window.xiSPEC.activeSpectrum.listenTo(window.vent, "resizeSpectrumSubViews", function () {
        window.xiSPECUI.vent.trigger("resize:spectrum");
    });

    // "individualMatchSelected" in vent is link event between selection table view and spectrum view
    // used to transport one Match between views
    window.xiSPEC.activeSpectrum.listenTo(window.vent, "individualMatchSelected", function (match) {
        if (match) {
            const randId = window.compositeModelInst.get("clmsModel").getSearchRandomId(match);
            loadSpectrum(match, randId, this.model);
        } else {
            //window.xiSPEC.setData({});
        }
    });

    // Generate data export drop down
    new DropDownMenuViewBB({
        el: "#expDropdownPlaceholder",
        model: compModel.get("clmsModel"),
        myOptions: {
            title: "Export",
            menu: [
                {
                    name: "Filtered Matches",
                    func: downloadMatches,
                    tooltip: "Produces a CSV File of Filtered Matches data",
                    categoryTitle: "As a CSV File",
                    sectionBegin: true
                },
                {
                    name: "Filtered Crosslinks",
                    func: downloadLinks,
                    tooltip: "Produces a CSV File of Filtered Cross-Link data"
                },
                {
                    name: "Filtered PPI",
                    func: downloadPPIs,
                    tooltip: "Produces a CSV File of Filtered Protein-Protein Interaction data"
                },
                {
                    name: "Filtered Residues",
                    func: downloadResidueCount,
                    tooltip: "Produces a CSV File of Count of Filtered Residues ",
                },
                {
                    name: "Filtered Modification Count",
                    func: downloadModificationCount,
                    tooltip: "Produces a CSV File of Count of Modifications (after filtering)",
                },
                {
                    name: "Protein Accession list",
                    func: downloadProteinAccessions,
                    tooltip: "Produces a single row CSV File of visible Proteins' Accession numbers",
                },
                {
                    name: "Groups",
                    func: downloadGroups,
                    tooltip: "Produces a CSV File of Proteins' Accession numbers with group membership given in the 'complex' column",
                    sectionEnd: true
                },
                {
                    name: "Filtered Matches ",  // extra space to differentiate from first entry in menu
                    func: downloadSSL,
                    tooltip: "Produces an SSL file for quantitation in SkyLine",
                    categoryTitle: "As an SSL File",
                    sectionBegin: true,
                    // sectionEnd: true
                },
                // {
                //     name: "Make Filtered XI URL",
                //     func: function () {
                //         vent.trigger("shareURLViewShow", true);
                //     },
                //     tooltip: "Produces a URL that embeds the current filter state within it for later reproducibility",
                //     categoryTitle: "As a URL",
                //     sectionBegin: true,
                // },
            ],
            //tooltipModel: compModel.get("tooltipModel"),
            sectionHeader: function (d) {
                return (d.categoryTitle ? d.categoryTitle.replace(/_/g, " ") : "");
            },
        }
    })
        .wholeMenuEnabled(!_.isEmpty(compModel.get("clmsModel").get("matches")))
        .listenTo(compModel.get("clmsModel"), "change:matches", function () {
            this.wholeMenuEnabled(true);
        });

    // Generate help drop down
    new DropDownMenuViewBB({
        el: "#helpDropdownPlaceholder",
        model: compModel.get("clmsModel"),
        myOptions: {
            title: "Help",
            menu: [{
                name: "Xi Docs",
                func: function () {
                    window.open("../xidocs/html/xiview.html", "_blank");
                },
                tooltip: "Documentation for xiVIEW"
            }, {
                name: "Online Videos",
                func: function () {
                    //                    window.open("https://vimeo.com/user64900020", "_blank");
                    window.open("https://rappsilberlab.org/software/xiview/", "_blank");
                },
                tooltip: "A number of how-to videos are available via this link to the lab homepage",
            }],
            //tooltipModel: compModel.get("tooltipModel"),
        }
    });
    d3.select("#helpDropdownPlaceholder > div").append("img")
        .attr("class", "rappsilberImage")
        .attr("src", "./images/logos/rappsilber-lab-small.png")
        .on("click", function () {
            window.open("https://rappsilberlab.org", "_blank");
        });


    d3.select("body").append("div").attr({
        id: "tooltip2",
        class: "CLMStooltip"
    });
    new TooltipViewBB({
        el: "#tooltip2",
        model: compModel.get("tooltipModel")
    });
};

init.viewsThatNeedAsyncData = function () {

    const compModel = window.compositeModelInst;

    // This generates the legend div, we don't keep a handle to it - the event object has one
    new KeyViewBB({
        el: "#keyPanel",
        displayEventName: "keyViewShow",
        model: compModel,
    });
    //if (window.compositeModelInst.get("clmsModel").get("searches").size > 1) {
    //     d3.select("#linkColourSelect").property("value","Group");
    //}

    new SearchSummaryViewBB({
        el: "#searchSummaryPanel",
        displayEventName: "searchesViewShow",
        model: compModel.get("clmsModel"),
    });

    /* 'cos circle listens to annotation model which is formed from uniprot async data */
    new CircularViewBB({
        el: "#circularPanel",
        displayEventName: "circularViewShow",
        model: compModel,
    });


    // Make a drop down menu constructed from the annotations collection
    new AnnotationDropDownMenuViewBB({
        el: "#annotationsDropdownPlaceholder",
        collection: compModel.get("annotationTypes"),
        myOptions: {
            title: "Annotations",
            closeOnClick: false,
            groupByAttribute: "category",
            labelByAttribute: "type",
            toggleAttribute: "shown",
            //tooltipModel: compModel.get("tooltipModel"),
            sectionHeader: function (d) {
                return (d.category ? d.category.replace(/_/g, " ") : "Uncategorised") +
                    (d.source ? " (" + d.source + ")" : "");
            },
        }
    })
        .wholeMenuEnabled(!_.isEmpty(compModel.get("clmsModel").get("matches")))
        .listenTo(compModel.get("clmsModel"), "change:matches", function () {
            this.wholeMenuEnabled(true);
        });


    new ColourCollectionOptionViewBB({
        el: "#linkColourDropdownPlaceholder",
        model: window.linkColor.Collection,
        storeSelectedAt: {
            model: compModel,
            attr: "linkColourAssignment"
        },
    });

    new ColourCollectionOptionViewBB({
        el: "#proteinColourDropdownPlaceholder",
        model: window.linkColor.ProteinCollection,
        storeSelectedAt: {
            model: compModel,
            attr: "proteinColourAssignment"
        },
        label: "Protein Colour Scheme"
    });

    new CrosslinkViewer({
        el: "#networkDiv",
        model: compModel,
        //     myOptions: {layout: storedLayout}
    });


    // Alignment View
    new AlignCollectionViewBB({
        el: "#alignPanel",
        collection: compModel.get("alignColl"),
        displayEventName: "alignViewShow",
        tooltipModel: compModel.get("tooltipModel")
    });


    new DistogramBB({
        el: "#distoPanel",
        model: compModel,
        //colourScaleModel: window.linkColor.distanceColoursBB,
        //colourScaleModel: window.linkColor.defaultColoursBB,
        colourScaleModel: window.linkColor.groupColoursBB,
        displayEventName: "distoViewShow",
        myOptions: {
            chartTitle: "Histogram",
            seriesName: "Actual"
        }
    });

    // This makes a matrix viewer
    new DistanceMatrixViewBB({
        el: "#matrixPanel",
        model: compModel,
        colourScaleModel: window.linkColor.distanceColoursBB,
        displayEventName: "matrixViewShow",
    });

    // Make new ngl view with pdb dataset
    // In a horrific misuse of the MVC pattern, this view actually generates the 3dsync
    // event that other views are waiting for.
    new NGLViewBB({
        el: "#nglPanel",
        model: compModel,
        displayEventName: "nglViewShow",
        myOptions: {
            showAllProteins: false,
            initialColourScheme: "chainname",
        }
    });

    const urlChunkMap = parseURLQueryString(window.location.search.slice(1));
    new PDBFileChooserBB({
        el: "#pdbPanel",
        model: compModel,
        displayEventName: "pdbFileChooserShow",
        initPDBs: urlChunkMap.pdb,
    });

    new STRINGFileChooserBB({
        el: "#stringPanel",
        model: compModel,
        displayEventName: "stringDataChooserShow",
        //initPDBs: urlChunkMap.pdb,
    });

    new ScatterplotViewBB({
        el: "#scatterplotPanel",
        model: compModel,
        displayEventName: "scatterplotViewShow",
    });

    new LinkMetaDataFileChooserBB({
        el: "#linkMetaLoadPanel",
        model: compModel,
        displayEventName: "linkMetaDataFileChooserShow",
    });

    new ProteinMetaDataFileChooserBB({
        el: "#proteinMetaLoadPanel",
        model: compModel,
        displayEventName: "proteinMetaDataFileChooserShow",
    });

    new UserAnnotationsMetaDataFileChooserBB({
        el: "#userAnnotationsMetaLoadPanel",
        model: compModel,
        displayEventName: "userAnnotationsMetaDataFileChooserShow",
    });

    new GoTermsViewBB({
        el: "#goTermsPanel",
        model: compModel,
        displayEventName: "goTermsViewShow",
    });

    new ProteinInfoViewBB({
        el: "#proteinInfoPanel",
        displayEventName: "proteinInfoViewShow",
        model: compModel,
    });

    new FDRViewBB({
        el: "#fdrPanel",
        //displayEventName: "fdrShow",
        model: compModel.get("filterModel"),
    });

    new FDRSummaryViewBB({
        el: "#fdrSummaryPlaceholder",
        //displayEventName: "fdrShow",
        model: compModel,
    });

    //make sure things that should be hidden are hidden
    compModel.trigger("hiddenChanged");

    // ByRei_dynDiv by default fires this on window.load (like this whole block), but that means the KeyView is too late to be picked up
    // so we run it again here, doesn't do any harm
    ByRei_dynDiv.init.main();
    //ByRei_dynDiv.db (1, d3.select("#subPanelLimiter").node());
};

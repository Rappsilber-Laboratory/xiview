/**
 * @fileoverview Main application initialization and setup for xiVIEW network interface.
 * Orchestrates model creation, view initialization, event wiring, and data loading.
 * Exports functions for phased initialization: models (FilterModel, CompositeModel, MinigramModel),
 * views (all UI components), postDataLoaded (annotations, filters), blosumLoading (async matrices).
 * Uses vent (Backbone event bus) from js/vent.js.
 * Entry point for full xiVIEW application with network visualization, spectrum viewer, alignment,
 * NGL 3D viewer, filters, exports, and all interactive UI components.
 */

import "../css/networkPage.css";
import "../css/xispecAdjust.css";
import packageInfo from "../package.json";

import * as _ from "underscore";
import Backbone from "backbone";
import $ from "jquery";
import d3 from "d3";
import {ByRei_dynDiv} from "../vendor/byrei-dyndiv_1.0rc1-src";

import {BlosumCollection} from "./model/models";
import {ProtAlignCollection} from "./align/protein-alignment-model-collection";
import {getLocalStorage, setLocalStorage} from "./utils";
import {flattenMatches, getSearchGroups, matchScoreRange, parseURLQueryString} from "./modelUtils";
import {FilterModel} from "./filter/filter-model";
import {TooltipModel} from "./model/models";
import {MinigramModel} from "./model/models";
import {CompositeModel} from "./model/composite-model";
import {FDRSummaryViewBB, FDRViewBB, FilterViewBB, ProteinSummaryViewBB} from "./filter/filterViewBB";
import {FilterSummaryViewBB} from "./filter/filterViewBB";
import {MinigramViewBB} from "./filter/minigramViewBB";
import {SelectionTableViewBB} from "./views/selectionTableViewBB";
import {SpectrumViewWrapper} from "./views/spectrumViewWrapper";

import {XispecWrapper} from "../src/xispec-wrapper";
import {xiSPECUI} from "../src/xispecui";
import {DropDownMenuViewBB} from "./ui-utils/ddMenuViewBB";
import {
    downloadMatches, downloadSSL, downloadLinks, downloadResidueCount,
    downloadGroups, downloadPPIs, downloadModificationCount, downloadProteinAccessions, downloadAlphaLink2
} from "./downloads";
import {TooltipViewBB} from "./views/tooltipViewBB";
import {checkBoxView} from "./ui-utils/checkbox-view";
import {xiNetControlsViewBB} from "./views/xiNetControlsViewBB";
import {CrosslinkViewer} from "./views/xinet/crosslink-viewer-BB";
import {AnnotationType} from "./model/annotation-model-collection";
import {AnnotationTypeCollection} from "./model/annotation-model-collection";
import {KeyViewBB} from "./views/key/keyViewBB";
import {SearchSummaryViewBB} from "./views/searchSummaryViewBB2";
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

import {setupColourModels, linkColor} from "./model/color/setup-colors";
import {DistanceMatrixViewBB} from "./views/matrixViewBB";
import {prideLoadSpectrum} from "./models/load-spectrum/pride-load-spectrum";

// Configuration imports
import {createDefaultAnnotationTypes} from "./config/annotation-types";
import {VIEW_CHECKBOX_CONFIGS} from "./config/view-checkboxes";
import {DYNAMIC_CONTAINER_IDS} from "./config/window-ids";
import {
    getProteinSelectionMenuConfig,
    getGroupsMenuConfig,
    getLoadMenuConfig,
    getExportMenuConfig,
    getHelpMenuConfig
} from "./config/menu-definitions";
import vent from "./vent";

// only when sequences and blosums have been loaded, if only one or other either no align models = crash, or no blosum matrices = null
export function postDataLoaded(compositeModelInst) {

    // Now we have blosum models and sequences, we can set blosum defaults for alignment models
    compositeModelInst.get("alignColl").models.forEach(function (protAlignModel) {
        protAlignModel.set("scoreMatrix", compositeModelInst.get("blosumColl").get("Blosum100"));
    });

    //init annotation types
    let annotationTypes = createDefaultAnnotationTypes();

    //  make uniprot feature types - done here as need proteins parsed and ready from xi
    const uniprotFeatureTypes = new Map();
    for (let protein of compositeModelInst.get("clmsModel").getProteinsIterator()) { //todo - remove static ref?
        if (protein.uniprot) {
            const featureArray = Array.from(protein.uniprot.features);
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
    compositeModelInst.set("annotationTypes", annotationTypeCollection);

    //viewsThatNeedAsyncData(compositeModelInst);
    vent.trigger("buildAsyncViews");


    // const savedConfig = window.compositeModelInst.get("clmsModel").get("savedConfig");//.layout
    // console.log("saved!", savedConfig);
    // let proteinPositions, groups;
    // // for backwards compatibility (after groups added to layout)
    // if (layout.proteins) {
    //     proteinPositions = layout.proteins;
    //     groups = layout.groups;
    // } else {
    //     proteinPositions = layout;
    // }
    //
    // loadConfig();

    compositeModelInst.applyFilter(); // do it first time so filtered sets aren't empty

    //folowing only used by tests
    vent.trigger("initialSetupDone"); //	Message that models and views are ready for action, with filter set initially

    //todo - bit hacky having this here, but it works here and not elsewhere (for reasons unknown)
    if (compositeModelInst.get("clmsModel").getSearches().size > 1) {
        d3.select("#linkColourSelect").property("value", "Group");
    }

}

/**
 * Commented-out function for loading saved layout configuration.
 * Would restore protein positions, rotations, zoom levels, groups from saved state.
 * Currently disabled - layout loading handled elsewhere or deprecated.
 */
// function loadConfig(layout) {
//
//     let layoutIsDodgy = false;
//     let namesChanged = false;
//     for (let protLayout of proteinPositions) {
//         const protein = this.renderedProteins.get(protLayout.id);
//         if (protein !== undefined) {
//             protein.setPositionFromXinet(protLayout["x"], protLayout["y"]);
//             if (typeof protLayout["rot"] !== "undefined") {
//                 protein.rotation = protLayout["rot"] - 0;
//             }
//             protein.ix = protLayout["x"];
//             protein.iy = protLayout["y"];
//             protein.newForm = protLayout["expanded"];
//             if (CrosslinkViewer.barScales.indexOf(+protLayout["stickZoom"]) > -1) {
//                 protein.stickZoom = protLayout["stickZoom"];
//             }
//             protein.rotation = protLayout["rot"] - 0;
//             protein.flipped = protLayout["flipped"];
//             protein.protein.manuallyHidden = protLayout["manuallyHidden"];
//
//             if (protLayout["name"]) {
//                 protein.protein.name = protLayout["name"];
//                 namesChanged = true;
//             }
//
//         } else {
//             layoutIsDodgy = true;
//             console.log("! protein in layout but not search:" + protLayout.id);
//         }
//     }
//
//     for (let rp of this.renderedProteins.values()) {
//         rp.setEverything();
//     }
//
//     if (groups && typeof groups[Symbol.iterator] === "function") {
//         const modelGroupMap = new Map();
//         for (const savedGroup of groups) {
//             //gonna need to check for proteins now missing from results
//             const presentProteins = new Set();
//             for (let pId of savedGroup.proteinIds) {
//                 if (this.renderedProteins.get(pId)) {
//                     presentProteins.add(pId);
//                 }
//             }
//             modelGroupMap.set(savedGroup.id, presentProteins);
//         }
//         this.model.set("groups", modelGroupMap);
//         this.model.trigger("change:groups");
//
//         for (const savedGroup of groups) {
//             const xiNetGroup = this.groupMap.get(savedGroup.id);
//             if (savedGroup.expanded === false) {
//                 xiNetGroup.setExpanded(savedGroup.expanded);
//                 xiNetGroup.setPositionFromXinet(savedGroup.x, savedGroup.y);
//             }
//         }
//     }
//
//     this.model.get("filterModel").trigger("change", this.model.get("filterModel"));
//
//     // this.zoomToFullExtent();
//
//     if (layoutIsDodgy) {
//         alert("Looks like something went wrong with the saved layout, if you can't see your proteins click Auto layout");
//     }
//
//     if (namesChanged) {
//         // vent.trigger("proteinMetadataUpdated", {}); //aint gonna work
//         for (let renderedParticipant of this.renderedProteins.values()) {
//             renderedParticipant.updateName();
//         }
//     }
// }

/**
 * Asynchronously loads BLOSUM substitution matrices from JSON file.
 * Creates a BlosumCollection, sets up sync listener for completion logging,
 * initiates fetch. BLOSUM matrices used for protein sequence alignment scoring.
 * Must complete before alignment views can be initialized.
 * @param {Object} [options={}] - Options to override BlosumCollection defaults (e.g., URL)
 * @returns {BlosumCollection} The collection instance (fetch still in progress)
 */
export function blosumLoading(options) {
    options = options || {};

    // Collection of blosum matrices that will be fetched from a json file
    const blosumCollInst = new BlosumCollection(options);

    // when the blosum Collection is fetched (an async process), we select one of its models as being selected
    blosumCollInst.listenToOnce(blosumCollInst, "sync", function () {
        console.log("ASYNC. blosum models loaded");
    });

    // Start the asynchronous blosum fetching after the above events have been set up
    blosumCollInst.fetch(options);
    return blosumCollInst;
}

/**
 * Creates all models for full xiVIEW application including alignment collection.
 * Calls modelsEssential to create core models, then adds alignment models for all proteins,
 * sets up 3dsync listener to add/remove PDB sequences from alignments, configures color models
 * with distance color settings from localStorage, wires color model change listeners to trigger
 * currentColourModelChanged/currentProteinColourModelChanged events, sets initial color schemes
 * (Group if multiple searches, default otherwise).
 * @param {Object} options - Options object with alignmentCollectionInst property
 * @param {SearchResultsModel} clmsModelInst - CLMS data model with crosslinks, matches, proteins
 * @returns {CompositeModel} Composite model instance with all models configured
 */
export function models(options, clmsModelInst) {
    // define alignment model and listeners first, so they're ready to pick up events from other models
    const alignmentCollectionInst = new ProtAlignCollection();
    options.alignmentCollectionInst = alignmentCollectionInst;

    const compositeModelInst = modelsEssential(options, clmsModelInst);
    alignmentCollectionInst.addNewProteins(Array.from(compositeModelInst.get("clmsModel").getProteinsIterator()));
    // following listeners are placed after modelsEssential() returns compositeModelInst

    // this listener adds new sequences obtained from pdb files to existing alignment sequence models
    alignmentCollectionInst.listenTo(compositeModelInst, "3dsync", function (sequences, removeThese) {
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

    // Set up colour models, some (most) of which depend on data properties
    // todo - BROKEN. FIX.
    const crosslinkerKeys = d3.keys(compositeModelInst.get("clmsModel").getCrosslinkerSpecificity());
    const storedDistanceColourSettings = crosslinkerKeys.length === 1 ? _.propertyOf(getLocalStorage())(["distanceColours", crosslinkerKeys[0]]) : undefined;
    setupColourModels(compositeModelInst, {distance: storedDistanceColourSettings});

    if (crosslinkerKeys.length === 1) {
        compositeModelInst.listenTo(linkColor.Collection.get("Distance"), "colourModelChanged", function (colourModel, attr) {
            const obj = {distanceColours: {}};
            obj.distanceColours[crosslinkerKeys[0]] = attr;
            setLocalStorage(obj);
        });
    }

    // A colour model's attributes have changed - is it the currently used model? If so, fire the currentColourModelChanged event
    compositeModelInst.listenTo(linkColor.Collection, "colourModelChanged", function (colourModel, changedAttrs) {
        if (this.get("linkColourAssignment").id === colourModel.id) {
            this.trigger("currentColourModelChanged", colourModel, changedAttrs);
        }
    });

    // same for protein colour models
    compositeModelInst.listenTo(linkColor.ProteinCollection, "colourModelChanged", function (colourModel, changedAttrs) {
        if (this.get("proteinColourAssignment").id === colourModel.id) {
            this.trigger("currentProteinColourModelChanged", colourModel, changedAttrs);
        }
    });

    // Set initial colour scheme choices
    // If more than one search, set group colour scheme to be default. https://github.com/Rappsilber-Laboratory/xi3-issue-tracker/issues/72
    compositeModelInst
        .set("linkColourAssignment",
            compositeModelInst.get("clmsModel").getSearches().size > 1 ? linkColor.groupColoursBB : linkColor.defaultColoursBB
        )
        .set("proteinColourAssignment", linkColor.defaultProteinColoursBB);

    return compositeModelInst;
}

//only inits stuff required by validation page
export function modelsEssential(options, clmsModelInst) {
    clmsModelInst.parseJSON();

    const scoreExtentInstance = matchScoreRange(clmsModelInst.getMatches(), false);
    // if (scoreExtentInstance[0]) {
    //     scoreExtentInstance[0] = Math.min(0, scoreExtentInstance[0]); // make scoreExtent min zero, if existing min isn't negative
    // }
    let filterSettings = {
        decoys: clmsModelInst.getDecoysPresent(),
        // selfLinks: clmsModelInst.targetProteinCount < 50,
        // AUTO: !clmsModelInst.get("manualValidatedPresent"),
        // ambig: clmsModelInst.getAmbiguousPresent() &&  clmsModelInst.targetProteinCount < 50,
        linears: clmsModelInst.getLinearsPresent(),
        //matchScoreCutoff: [undefined, undefined],
        matchScoreCutoff: scoreExtentInstance.slice(),
        //distanceCutoff: [0, 250],
        searchGroups: getSearchGroups(clmsModelInst),
        selectedScoreType: clmsModelInst.selectedScoreType, // todo - should maybe be part of compositeModel?
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

    // minigramModels[0].set("extent", scoreExtentInstance);

    // Data generation routines for minigram models
    minigramModels[0].data = function () {
        return flattenMatches(clmsModelInst.getMatches()); // matches is now an array of arrays - [matches, []];
    };
    // overarching model
    const compositeModel = new CompositeModel({
        clmsModel: clmsModelInst,
        filterModel: filterModelInst,
        tooltipModel: tooltipModelInst,
        alignColl: options.alignmentCollectionInst,
        minigramModels: {distance: minigramModels[1], score: minigramModels[0]},
    });
    minigramModels[1].data = function () {
        const crosslinks = compositeModel.getAllCrossLinks();
        const distances = crosslinks
            .map(function (clink) {
                return clink.getMeta("distance");
            })
            .filter(function (dist) {
                return dist !== undefined;
            });
        return [distances];
    };
    compositeModel.loadSpectrum = prideLoadSpectrum;
    filterModelInst.compositeModel = compositeModel;

    // change in distanceObj changes the distanceExtent in filter model and should trigger a re-filter for distance minigram model as dists may have changed
    minigramModels[1]
        .listenTo(compositeModel, "change:distancesObj", function (clmsModel, distObj) {
            //console.log ("minigram arguments", arguments, this);
            const max = Math.ceil(distObj.maxDistance);
            this.set("extent", [0, max + 1]);
            filterModelInst.distanceExtent = [0, max];
            filterModelInst
                .trigger("change:distanceCutoff", filterModelInst, [this.get("domainStart"), this.get("domainEnd")])
                .trigger("change", filterModelInst, {showHide: true});
        });

    //moving this to end of allDataLoaded - think validation page needs this, TODO, check
    //window.compositeModelInst.applyFilter(); // do it first time so filtered sets aren't empty

    // instead of views listening to changes in filter directly, we listen to any changes here, update filtered stuff
    // and then tell the views that filtering has occurred via a custom event ("filtering Done") in applyFilter().
    // This ordering means the views are only notified once the changed data is ready.
    compositeModel.listenTo(filterModelInst, "change", function () {
        // console.log("filterChange");
        this.applyFilter();
    });

    return compositeModel;
}

/**
 * Creates all views for full xiVIEW application including optional async-dependent views.
 * Creates dynamic window divs for all panels, calls viewsEssential for core views,
 * generates view checkboxes and adds to dropdown menu with enable/disable logic based on data availability,
 * creates protein selection and groups dropdown menus with search/filter, creates load dropdown,
 * creates xiNET controls, initializes color chooser dialog with protein color selection,
 * sets up one-time buildAsyncViews listener to call viewsThatNeedAsyncData when async data loaded.
 * @param {CompositeModel} compositeModelInst - Main composite model instance
 * @returns {undefined}
 */
export function views(compositeModelInst, split) {
    const windowIds = DYNAMIC_CONTAINER_IDS;
    // something funny happens if I do a data join and enter with d3 instead
    // ('distoPanel' datum trickles down into chart axes due to unintended d3 select.select inheritance)
    // http://stackoverflow.com/questions/18831949/d3js-make-new-parent-data-descend-into-child-nodes
    windowIds.forEach(function (winid) {
        d3.select("body").append("div")
            .attr("id", winid)
            .attr("class", "dynDiv dynDiv_bodyLimit");
    });

    document.getElementById("pdbLoadButton")?.addEventListener("click", () => vent.trigger("pdbFileChooserShow", true));

    viewsEssential(compositeModelInst, {
        "specWrapperDiv": "#spectrumPanelWrapper",
        split,
    });

    // Generate checkboxes for view dropdown
    const checkBoxData = VIEW_CHECKBOX_CONFIGS;
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
        model: compositeModelInst.get("clmsModel"),
        myOptions: {
            title: "Views",
            menu: checkBoxData,
            //tooltipModel: compModel.get("tooltipModel")
        }
    })
        // hide/disable view choices that depend on certain data being present until that data arrives
        .enableItemsByID(maybeViews, false)
        .enableItemsByID(mostViews, true)
        .listenTo(compositeModelInst, "change:distancesObj", function (model, newDistancesObj) {
            this.enableItemsByID(maybeViews, !!newDistancesObj);
        });

    // Generate protein selection drop down
    d3.select("body").append("input")
        .attr("type", "text")
        .attr("id", "proteinSelectionFilter");

    new DropDownMenuViewBB({
        el: "#proteinSelectionDropdownPlaceholder",
        model: compositeModelInst.get("clmsModel"),
        myOptions: getProteinSelectionMenuConfig(compositeModelInst)
    })
        .wholeMenuEnabled(true);

    d3.select("body").append("input")
        .attr("type", "text")
        .attr("id", "groupSelected");

    new DropDownMenuViewBB({
        el: "#groupsDropdownPlaceholder",
        model: compositeModelInst.get("clmsModel"),
        myOptions: getGroupsMenuConfig(compositeModelInst)
    })
        .wholeMenuEnabled(true);

    // Generate buttons for load dropdown
    new DropDownMenuViewBB({
        el: "#loadDropdownPlaceholder",
        model: compositeModelInst.get("clmsModel"),
        myOptions: getLoadMenuConfig()
    });

    new xiNetControlsViewBB({
        el: "#xiNetButtonBar",
        model: compositeModelInst
    });

    //initialise the color chooser dialog
    const dialog = document.getElementById("colorDialog"); //todo : make spelling of colour consistent
    const colorCancelButton = document.getElementById("colorCancel");
    colorCancelButton.addEventListener("click", () => {
        dialog.proteinId = "cancel";
        dialog.close();
    });
    dialog.addEventListener("close", () => {
        const iId = document.getElementById("colorDialog").proteinId;
        const checkedColor = document.querySelector("input[name=\"aColor\"]:checked");
        if (!checkedColor) {
            alert("No colour selected.");
        } else if (iId !== "cancel") {
            compositeModelInst.setProteinColor(iId, checkedColor.value);
        }
    });

    // Set up a one-time event listener that is then called from allDataLoaded
    // Once this is done, the views depending on async loading data (blosum, uniprot) can be set up
    // Doing it here also means that we don't have to set up these views at all if these views aren't needed (e.g. for some testing or validation pages)
    compositeModelInst.listenToOnce(vent, "buildAsyncViews", function () {
        viewsThatNeedAsyncData(compositeModelInst);
    });
}

/**
 * Creates essential views required by validation page and full application.
 * Creates FilterViewBB (comprehensive filter panel), ProteinSummaryViewBB (protein/PPI counts),
 * FilterSummaryViewBB (filtered crosslink counts), hides filter mode if no unvalidated data,
 * hides product ions if no linears, creates two MinigramViewBB instances (score and distance histograms
 * with brush selection), wires distance minigram to re-render on distancesObj changes,
 * creates SelectionTableViewBB (match table), creates SpectrumViewWrapper with xiSPEC integration,
 * creates xiSPEC wrapper with configuration, wires spectrum resize and match selection events,
 * creates export dropdown menu, creates help dropdown with Rappsilber lab logo, creates tooltip view.
 * @param {CompositeModel} compositeModelInst - Main composite model instance
 * @param {Object} options - Options with specWrapperDiv selector and spectrumToTop flag
 * @returns {undefined}
 */
export function viewsEssential(compositeModelInst, options) {

    const filterModel = compositeModelInst.get("filterModel");

    // var singleTargetProtein = compModel.get("clmsModel").targetProteinCount < 2;
    new FilterViewBB({
        el: "#filterPlaceholder",
        model: filterModel,
        myOptions: {
            hide: {
                "ambig": !compositeModelInst.get("clmsModel").getAmbiguousPresent(),
                "unval": !compositeModelInst.get("clmsModel").getUnvalidatedPresent(),
                "linears": !compositeModelInst.get("clmsModel").getLinearsPresent(),
            }
        }
    });

    new ProteinSummaryViewBB({
        el: "#ppiText",
        model: compositeModelInst,
    });

    new FilterSummaryViewBB({
        el: "#filterReportPlaceholder",
        model: compositeModelInst,
    });

    const unvalidatedPresent = compositeModelInst.get("clmsModel").getUnvalidatedPresent();
    if (unvalidatedPresent !== true) {
        d3.select("#filterModeDiv").style("display", "none");
    }
    const linearsPresent = compositeModelInst.get("clmsModel").getLinearsPresent();
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
            model: compositeModelInst.get("minigramModels")[config.id],
            myOptions: {
                maxX: 0, // let data decide
                seriesNames: config.seriesNames,
                //scaleOthersTo: "Matches",
                xlabel: config.label,
                ylabel: "Count",
                height: 65,
                colours: _.object(_.zip(config.seriesNames, config.colours)), // [a,b],[c,d] -> [a,c],[b,d] -> {a:c, b:d}
            }
        });
        // If the clmsModel matches attribute changes then tell the mini histogram view
        // .listenTo(compModel.get("clmsModel"), "change:matches", function () {
        //     this.render().redrawBrush();
        // }); // if the matches change (likely?) need to re-render the view too
    });

    // redraw brush when distancesObj is changed, extent is likely to be different
    minigramViews[1]
        // eslint-disable-next-line no-unused-vars
        .listenTo(compositeModelInst, "change:distancesObj", function (clmsModel, distObj) {
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
        model: compositeModelInst,
        split: options.split,
    });

    selectionViewer.lastCount = 1;
    selectionViewer.render();

    new SpectrumViewWrapper({
        el: options.specWrapperDiv,
        model: compositeModelInst,
        displayEventName: "spectrumShow",
        myOptions: {
            wrapperID: "spectrumPanel",
            canBringToTop: options.spectrumToTop
        }
    });
    // .listenTo(vent, "individualMatchSelected", function (match) {
    //todo - alternative explanations
    // if (match && (compositeModelInst.get("serverFlavour") === "XIVIEW.ORG")) {
    //     this.lastRequestedID = match.id; // async catch
    //     //console.log ("MATCH ID", this, match.id);
    //     this.primaryMatch = match; // the 'dynamic_rank = true' match
    //     const dataPath = compositeModelInst.get("dataPath");
    //     const url = dataPath + "?upload=" +
    //         this.model.get("clmsModel").get("sid") +
    //         "&unval=1&linears=1&spectrum=" + match.spectrumId + "&matchid=" + match.id;
    //     const self = this;
    //     d3.json(url, function (error, json) {
    //         if (error) {
    //             console.log("error", error, "for", url, arguments);
    //         } else {
    //             // this works if first item in array has the same id, might in future send matchid to php to return for reliability
    //             const returnedMatchID = json.matchid;
    //             if (returnedMatchID == self.lastRequestedID) { // == not === 'cos returnedMatchID is a atring and self.lastRequestedID is a number
    //                 //console.log (":-)", json, self.lastRequestedID, thisSpecID);
    //                 const altModel = new SearchResultsModel({serverFlavour: compositeModelInst.get("serverFlavour")});
    //                 altModel.parseJSON(json);
    //                 const allCrossLinks = Array.from(altModel.get("crosslinks").values());
    //                 // empty selection first
    //                 // (important or it will crash coz selection contains links to proteins not in clms model)
    //                 self.alternativesModel
    //                     .set("selection", [])
    //                     .set("clmsModel", altModel)
    //                     .applyFilter()
    //                     .set("lastSelectedMatch", {
    //                         match: match,
    //                         directSelection: true
    //                     });
    //                 d3.select("#alternatives").style("display", altModel.get("matches").length === 1 ? "none" : "block");
    //                 //self.alternativesModel.set("selection", allCrossLinks);
    //                 self.alternativesModel.setMarkedCrossLinks("selection", allCrossLinks, false, false);
    //                 vent.trigger("resizeSpectrumSubViews", true);
    //             }
    //         }
    //     });
    // } else {
    //     //~ //this.model.clear();
    // }
    // });

    const xiSPEC_options = {
        targetDiv: "modular_xispec",
        // baseDir: window.xiSpecBaseDir,
        xiAnnotatorBaseURL: compositeModelInst.get("annotatorURL"),
        dbView: window.dbView,
        compositeModelInst: compositeModelInst,
        showCustomConfig: true,
        showQualityControl: "min",
        colorScheme: "PRGn",
        labelFragmentCharge: false,
        labelCutoff: 0,
        labelFontSize: 10,
        accentuateCrossLinkContainingFragments: true,
        hideNotSelectedFragments: false,
        showLossLabels: false,
        QCabsErr: false
    };

    const xispec_wrapper = new XispecWrapper(xiSPEC_options);

    // Update spectrum view when external resize event called
    xispec_wrapper.activeSpectrum.listenTo(vent, "resizeSpectrumSubViews", function () {
        xiSPECUI.vent.trigger("resize:spectrum");
    });

    // "individualMatchSelected" in vent is link event between selection table view and spectrum view
    // used to transport one Match between views
    xispec_wrapper.activeSpectrum.listenTo(vent, "individualMatchSelected", function (match) {
        if (match) {
            compositeModelInst.loadSpectrum(match);
        } else {
            // xispec_wrapper.clear();
        }
    });

    compositeModelInst.set("xispec_wrapper", xispec_wrapper);

    // Generate data export drop down
    new DropDownMenuViewBB({
        el: "#expDropdownPlaceholder",
        model: compositeModelInst.get("clmsModel"),
        myOptions: getExportMenuConfig(
            () => downloadMatches(compositeModelInst),
            () => downloadLinks(compositeModelInst),
            () => downloadPPIs(compositeModelInst),
            () => downloadResidueCount(compositeModelInst),
            () => downloadModificationCount(compositeModelInst),
            () => downloadProteinAccessions(compositeModelInst),
            () => downloadGroups(compositeModelInst),
            () => downloadSSL(compositeModelInst),
            () => downloadAlphaLink2(compositeModelInst)
        )
    })
        .wholeMenuEnabled(true);

    // Generate help drop down
    new DropDownMenuViewBB({
        el: "#helpDropdownPlaceholder",
        model: compositeModelInst.get("clmsModel"),
        myOptions: getHelpMenuConfig()
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
        model: compositeModelInst.get("tooltipModel")
    });
}

/**
 * Creates views that depend on asynchronously loaded data (BLOSUM matrices, Uniprot features).
 * Called via buildAsyncViews event after async data loaded. Creates KeyViewBB (legend),
 * SearchSummaryViewBB (search metadata), CircularViewBB (circular protein view with annotations),
 * AnnotationDropDownMenuViewBB (annotation type selection), ColourCollectionOptionViewBB instances
 * (link and protein color schemes), AlignCollectionViewBB (sequence alignments),
 * DistogramBB (distance histogram), DistanceMatrixViewBB (distance matrix heatmap),
 * NGLViewBB (3D molecular viewer), PDBFileChooserBB (PDB file loader), STRINGFileChooserBB (STRING data),
 * ScatterplotViewBB, metadata file choosers (link, protein, user annotations), GoTermsViewBB (GO terms Sankey),
 * ProteinInfoViewBB (protein details), FDRViewBB (FDR threshold selection), FDRSummaryViewBB (FDR summary),
 * initializes ByRei_dynDiv window system, creates CrosslinkViewer (xiNET network visualization).
 * @param {CompositeModel} compositeModelInst - Main composite model instance
 * @returns {undefined}
 */
function viewsThatNeedAsyncData(compositeModelInst) {

    // This generates the legend div, we don't keep a handle to it - the event object has one
    new KeyViewBB({
        el: "#keyPanel",
        displayEventName: "keyViewShow",
        model: compositeModelInst,
    });
    //if (window.compositeModelInst.get("clmsModel").getSearches().size > 1) {
    //     d3.select("#linkColourSelect").property("value","Group");
    //}

    new SearchSummaryViewBB({
        el: "#searchSummaryPanel",
        displayEventName: "searchesViewShow",
        model: compositeModelInst.get("clmsModel"),
    });

    /* 'cos circle listens to annotation model which is formed from uniprot async data */
    new CircularViewBB({
        el: "#circularPanel",
        displayEventName: "circularViewShow",
        model: compositeModelInst,
    });


    // Make a drop down menu constructed from the annotations collection
    new AnnotationDropDownMenuViewBB({
        el: "#annotationsDropdownPlaceholder",
        collection: compositeModelInst.get("annotationTypes"),
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
        .wholeMenuEnabled(true);

    new ColourCollectionOptionViewBB({
        el: "#linkColourDropdownPlaceholder",
        model: linkColor.Collection,
        storeSelectedAt: {
            model: compositeModelInst,
            attr: "linkColourAssignment"
        },
    });

    new ColourCollectionOptionViewBB({
        el: "#proteinColourDropdownPlaceholder",
        model: linkColor.ProteinCollection,
        storeSelectedAt: {
            model: compositeModelInst,
            attr: "proteinColourAssignment"
        },
        label: "Protein Colour Scheme"
    });

    // Alignment View
    new AlignCollectionViewBB({
        el: "#alignPanel",
        collection: compositeModelInst.get("alignColl"),
        displayEventName: "alignViewShow",
        tooltipModel: compositeModelInst.get("tooltipModel"),
        blosumColl: compositeModelInst.get("blosumColl"),
    });


    new DistogramBB({
        el: "#distoPanel",
        model: compositeModelInst,
        //colourScaleModel: linkColor.distanceColoursBB,
        //colourScaleModel: linkColor.defaultColoursBB,
        colourScaleModel: linkColor.groupColoursBB,
        displayEventName: "distoViewShow",
        myOptions: {
            chartTitle: "Histogram",
            seriesName: "Actual"
        }
    });

    // This makes a matrix viewer
    new DistanceMatrixViewBB({
        el: "#matrixPanel",
        model: compositeModelInst,
        colourScaleModel: linkColor.distanceColoursBB,
        displayEventName: "matrixViewShow",
    });

    // Make new ngl view with pdb dataset
    // In a horrific misuse of the MVC pattern, this view actually generates the 3dsync
    // event that other views are waiting for.
    new NGLViewBB({
        el: "#nglPanel",
        model: compositeModelInst,
        displayEventName: "nglViewShow",
        myOptions: {
            showAllProteins: false,
            initialColourScheme: "chainname",
        }
    });

    const urlChunkMap = parseURLQueryString(window.location.search.slice(1));
    new PDBFileChooserBB({
        el: "#pdbPanel",
        model: compositeModelInst,
        displayEventName: "pdbFileChooserShow",
        initPDBs: urlChunkMap.pdb,
    });

    new STRINGFileChooserBB({
        el: "#stringPanel",
        model: compositeModelInst,
        displayEventName: "stringDataChooserShow",
        //initPDBs: urlChunkMap.pdb,
    });

    new ScatterplotViewBB({
        el: "#scatterplotPanel",
        model: compositeModelInst,
        displayEventName: "scatterplotViewShow",
    });

    new LinkMetaDataFileChooserBB({
        el: "#linkMetaLoadPanel",
        model: compositeModelInst,
        displayEventName: "linkMetaDataFileChooserShow",
    });

    new ProteinMetaDataFileChooserBB({
        el: "#proteinMetaLoadPanel",
        model: compositeModelInst,
        displayEventName: "proteinMetaDataFileChooserShow",
    });

    new UserAnnotationsMetaDataFileChooserBB({
        el: "#userAnnotationsMetaLoadPanel",
        model: compositeModelInst,
        displayEventName: "userAnnotationsMetaDataFileChooserShow",
    });

    new GoTermsViewBB({
        el: "#goTermsPanel",
        model: compositeModelInst,
        displayEventName: "goTermsViewShow",
    });

    new ProteinInfoViewBB({
        el: "#proteinInfoPanel",
        displayEventName: "proteinInfoViewShow",
        model: compositeModelInst,
    });

    new FDRViewBB({
        el: "#fdrPanel",
        //displayEventName: "fdrShow",
        model: compositeModelInst.get("filterModel"),
    });

    new FDRSummaryViewBB({
        el: "#fdrSummaryPlaceholder",
        //displayEventName: "fdrShow",
        model: compositeModelInst,
    });

    //make sure things that should be hidden are hidden
    // compModel.trigger("hiddenChanged"); // think this isn't needed? todo - check

    // ByRei_dynDiv by default fires this on window.load (like this whole block), but that means the KeyView is too late to be picked up
    // so we run it again here, doesn't do any harm
    ByRei_dynDiv.init.main();
    //ByRei_dynDiv.db (1, d3.select("#subPanelLimiter").node());

    new CrosslinkViewer({
        el: "#networkDiv",
        model: compositeModelInst,
    });
}

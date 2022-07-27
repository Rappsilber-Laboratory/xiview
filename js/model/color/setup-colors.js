import * as $ from "jquery";

import {DefaultLinkColourModel} from "./link-color-model";
import {GroupColourModel} from "./link-color-model";
import {InterProteinColourModel} from "./link-color-model";
import {DistanceColourModel} from "./link-color-model";

const colorbrewer = require("colorbrewer");
import {HighestScoreColourModel} from "./link-color-model";
import {
    ColourModelCollection,
    MetaDataColourModel,
    MetaDataHexValuesColourModel,
    ThresholdColourModel
} from "./color-model";
import {DefaultProteinColourModel} from "./protein-color-model";
import {commonRegexes} from "../../utils";
import d3 from "d3";

window.linkColor = {};//todo - get rid

export const setupColourModels = function (userConfig) {
    const defaultConfig = {
        default: {domain: [0, 1, 2], range: ["#7570b3FF", "#d95f02FF", "#1b9e77FF"]},
        distance: {domain: [15, 25], range: ["#5AAE61FF", "#FDB863FF", "#9970ABFF"]}
    };
    const config = $.extend(true, {}, defaultConfig, userConfig);    // true = deep merging

    window.linkColor.defaultColoursBB = new DefaultLinkColourModel({
        colScale: d3.scale.ordinal().domain(config.default.domain).range(config.default.range),
        title: "Crosslink Type",
        longDescription: "Default colour scheme, differentiates self links with overlapping peptides.",
        id: "Default"
    });

    const makeGroupColourModel = function () {
        return new GroupColourModel({
            title: "Group",
            longDescription: "Differentiate crosslinks by search group when multiple searches are viewed together.",
            id: "Group",
        }, {
            searchMap: window.compositeModelInst.get("clmsModel").get("searches"),
        });
    };

    window.linkColor.groupColoursBB = makeGroupColourModel();

    window.linkColor.interProteinColoursBB = new InterProteinColourModel({
        title: "Protein-Protein Colouring",
        longDescription: "Differentiate crosslinks by the proteins they connect. Suitable for 3 to 5 proteins only.",
        id: "InterProtein",
        type: "ordinal"
    }, {
        proteins: window.compositeModelInst.get("clmsModel").get("participants")
    });

    window.linkColor.distanceColoursBB = new DistanceColourModel({
        colScale: d3.scale.threshold().domain(config.distance.domain).range(config.distance.range),
        title: "Distance (Å)",
        longDescription: "Colour crosslinks by adjustable distance category. Requires PDB file to be loaded (via Load -> PDB Data).",
        id: "Distance",
        superDomain: [0, 120], // superdomain is used in conjunction with drawing sliders, it's the maximum that the values in the threshold can be
    });

    //init highest score colour model
    const clmsModel = window.compositeModelInst.get("clmsModel"); //todo - shouldn't have this static reference to model here
    const minScore = clmsModel.get("minScore");
    const maxScore = clmsModel.get("maxScore");

    const hiScores = [];
    for (let crosslink of clmsModel.get("crosslinks").values()) {
        const scores = crosslink.filteredMatches_pp.map(function (m) {
            return m.match.score();
        });
        hiScores.push(Math.max.apply(Math, scores));
    }

    const hiScoresColScale = d3.scale.quantile()
        .domain(hiScores)
        .range(colorbrewer.PRGn[3]);

    const quantiles = hiScoresColScale.quantiles();

    const range = [minScore, quantiles[0], quantiles[1], maxScore];
    console.log(quantiles, range);

    window.linkColor.highestScoreColoursBB = new HighestScoreColourModel({
        colScale: d3.scale.threshold().domain(quantiles).range(colorbrewer.Dark2[3].reverse()),
        title: "Highest Score",
        longDescription: "Highest score from supporting matches that meet current filter.",
        id: "HiScores",
        superDomain: [minScore, maxScore], // superdomain is used in conjunction with drawing sliders, it's the maximum that the values in the threshold can be
    });

    const linkColourCollection = new ColourModelCollection([
        window.linkColor.defaultColoursBB,
        window.linkColor.interProteinColoursBB,
        window.linkColor.groupColoursBB,
        window.linkColor.distanceColoursBB,
        window.linkColor.highestScoreColoursBB
    ]);

    // If necessary, swap in newly added colour scale with same id as removed (but current) scale pointed to by linkColourAssignment
    const replaceCurrentLinkColourAssignment = function (collection) {
        const currentColourModel = window.compositeModelInst.get("linkColourAssignment");
        if (currentColourModel && !currentColourModel.collection) {
            window.compositeModelInst.set("linkColourAssignment", collection.get(currentColourModel.get("id")));
        }
    };

    // Just the group colour scale is replaced for this event
    /*linkColourCollection.listenTo(window.compositeModelInst.get("clmsModel"), "change:matches", function() {
        this.remove("Group");   // remove old group scale
        window.linkColor.groupColoursBB = makeGroupColourModel();
        this.add (window.linkColor.groupColoursBB);    // add new group scale
        replaceCurrentLinkColourAssignment(this);   // replace existing selected scale if necessary
    });*/

    // All colour scales with ids in metadataFields array are removed (if already extant) and new scales added
    linkColourCollection.listenTo(window.vent, "linkMetadataUpdated", function (metaMetaData) {
        const columns = metaMetaData.columns;
        const crosslinks = metaMetaData.items;
        const colMaps = columns.map(function (field) {
            return makeColourModel(field, field, crosslinks);
        });
        this.remove(columns);
        this.add(colMaps);
        replaceCurrentLinkColourAssignment(this);
    });

    window.linkColor.Collection = linkColourCollection;


    // Protein colour schemes

    window.linkColor.defaultProteinColoursBB = new DefaultProteinColourModel({
        colScale: d3.scale.ordinal().domain([0]).range(["#ffffffff"]),
        title: "Default Protein Colour",
        longDescription: "Default protein colour.",
        id: "Default Protein"
    });

    // Can add other metadata-based schemes to this collection later
    const proteinColourCollection = new ColourModelCollection([
        window.linkColor.defaultProteinColoursBB,
    ]);

    // If necessary, swap in newly added colour scale with same id as removed (but current) scale pointed to by linkColourAssignment
    const replaceCurrentProteinColourAssignment = function (collection) {
        const currentColourModel = window.compositeModelInst.get("proteinColourAssignment");
        if (currentColourModel && !currentColourModel.collection) {
            window.compositeModelInst.set("proteinColourAssignment", collection.get(currentColourModel.get("id")));
        }
    };

    // All colour scales with ids in metadataFields array are removed (if already extant) and new scales added
    proteinColourCollection.listenTo(window.vent, "proteinMetadataUpdated", function (metaMetaData) {
        const columns = metaMetaData.columns;
        const proteins = metaMetaData.items;
        const colMaps = columns.map(function (field) {
            return makeColourModel(field, field, proteins);
        });
        this.remove(columns);
        this.add(colMaps);
        replaceCurrentProteinColourAssignment(this);
    });

    window.linkColor.ProteinCollection = proteinColourCollection;
};

const makeColourModel = function (field, label, objs) {
    let allColors = true, allNumbers = true, min = Number.POSITIVE_INFINITY, max = Number.NEGATIVE_INFINITY;
    const categories = new Set();
    const numbers = [];
    for (let obj of objs.values()) {
        let val = obj.getMeta(field);
        if (val) {
            if (allNumbers && Number.isFinite(val)) {
                if (val < min) {
                    min = val;
                }
                if (val > max) {
                    max = val;
                }
                numbers.push(val);
                allColors = false;
            } else {
                allNumbers = false;
                if (val.trim) {
                    val = val.trim();
                }
                categories.add(val);
                if (allColors && !commonRegexes.hexColour.test(val)) {
                    allColors = false;
                }
            }
        }
    }

    if (allNumbers) {

        const hiScoresColScale = d3.scale.quantile()
            .domain(numbers).range(colorbrewer.PRGn[3]);

        const quantiles = hiScoresColScale.quantiles();

        const range = [min, quantiles[0], quantiles[1], max];
        console.log(quantiles, range);

        return new ThresholdColourModel({
            colScale: d3.scale.threshold().domain(quantiles).range(colorbrewer.Dark2[3]),
            title: label || field,
            longDescription: (label || field) + ", " + " data extracted from metadata.",
            id: label,
            field: field,
            superDomain: [min, max], // super domain is used in conjunction with drawing sliders, it's the maximum that the values in the threshold can be
        });

    } else if (allColors) {
        const domain = [], range = [];
        //make weird categorical (using obj.id )
        for (let obj of objs.values()) {
            if (!obj.is_decoy) {
                domain.push(obj.id);
                let val = obj.getMeta(field);
                if (val) {
                    val = val.trim();
                }
                range.push(val);
            }
        }

        return new MetaDataHexValuesColourModel({
            colScale: d3.scale.ordinal().domain(domain).range(range),
            id: label,
            title: label || field,
            longDescription: (label || field) + ", " + " data extracted from metadata.",
            field: field,
            type: "ordinal",
        });
    } else {
        // make normal categorical
        const range = ["#4e79a7FF", "#f28e2cFF", "#e15759FF", "#76b7b2FF", "#59a14fFF", "#edc949FF", "#af7aa1FF", "#ff9da7FF", "#9c755fFF", "#bab0abFF"];

        return new MetaDataColourModel({
            colScale: d3.scale.ordinal().domain(Array.from(categories)).range(range),
            id: label,
            title: label || field,
            longDescription: (label || field) + ", " + " data extracted from metadata.",
            field: field,
            type: "ordinal",
        });
    }
};
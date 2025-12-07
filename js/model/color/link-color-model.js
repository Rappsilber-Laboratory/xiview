/**
 * @fileoverview Crosslink-specific color model classes for xiVIEW.
 * Provides five specialized color schemes for crosslinks: default (self/homo/hetero), group-based,
 * distance-based (threshold), protein-pair-based, and score-based (threshold).
 * Each class extends ColourModel and implements getValue() to extract appropriate values from crosslinks.
 */
import * as _ from "underscore";
import d3 from "d3";
import * as colorbrewer from "colorbrewer";
import {ColourModel} from "./color-model";
import {filterOutDecoyInteractors} from "../../modelUtils";

/**
 * Default crosslink color model - colors by link type (self/homomultimeric/heteromeric).
 * Three categories: Self (intra-protein), Homomultimeric (overlapping peptides proving different molecules),
 * and Heteromeric (inter-protein). Aggregate links always get dark gray (#202020).
 * @class
 * @extends ColourModel
 */
export class DefaultLinkColourModel extends ColourModel {
    constructor(attributes, options) {
        super(attributes, options);
    }

    /**
     * Initializes as ordinal type with three categories.
     * @returns {undefined}
     */
    initialize() {
        this
            .set("labels", this.get("colScale").copy().range(["Self", "Homomultimeric (Overlapping Peptides)", "Heteromeric"]))
            .set("type", "ordinal");
    }

    /**
     * Classifies link into self (0), homomultimeric (1), or heteromeric (2).
     * For aggregate links: uses first crosslink's properties and checks link.hd (homomultimer detected).
     * For regular links: uses confirmedHomomultimer flag.
     * @param {Object} link - Crosslink or aggregate link object
     * @returns {number} 0=self, 1=homomultimeric, 2=heteromeric
     */
    getValue(link) {
        if (link.isAggregateLink) {
            const crosslinks = link.getCrosslinks();
            return crosslinks[0].isSelfLink() || crosslinks[0].isLinearLink() ? (link.hd ? 1 : 0) : 2;
        } else {
            return link.isSelfLink() || link.isLinearLink() ? (link.confirmedHomomultimer ? 1 : 0) : 2;
        }
    }

    /**
     * Returns color for link - aggregate links always get dark gray.
     * @param {Object} obj - Crosslink or aggregate link object
     * @returns {string} Hex color string
     */
    getColour(obj) {  // obj is generally a crosslink, but is non-specific at this point
        if (obj.isAggregateLink) {
            return "#202020";
        }
        const val = this.getValue(obj);
        return val !== undefined ? this.get("colScale")(val) : this.get("undefinedColour");
    }
}

/**
 * Group-based color model - colors crosslinks by search group.
 * Analyzes search-to-group mappings and creates ordinal scale for up to 10 groups (using ColorBrewer).
 * For >10 groups, falls back to two-color scheme (multiple groups vs single group).
 * Links spanning multiple groups get dark gray (#202020FF).
 * @class
 * @extends ColourModel
 * @property {Map} searchMap - Map of dataset IDs to search objects (with group property)
 * @property {boolean} [overload] - True if >10 groups (uses simplified two-color scheme)
 */
export class GroupColourModel extends ColourModel {
    constructor(attributes, options) {
        super(attributes, options);
    }

    /**
     * Initializes group-based color model by analyzing search-to-group mappings.
     * Creates ordinal scale for up to 10 groups using ColorBrewer, or falls back to
     * two-color scheme (multiple/single) for >10 groups.
     * @param {Object} attrs - Model attributes
     * @param {Object} options - Options object
     * @param {Map} options.searchMap - Map of dataset IDs to search objects (with group property)
     * @returns {undefined}
     */
    initialize(attrs, options) {

        this.searchMap = options.searchMap;
        // find the search to group mappings
        const groups = new Map();
        const searchArray = Array.from(this.searchMap.values()); // todo - tidy
        searchArray.forEach(function (search) {
            let arr = groups.get(search.group);
            if (!arr) {
                arr = [];
                groups.set(search.group, arr);
            }
            arr.push(search.id);
        });

        // build scales on the basis of this mapping
        const groupDomain = [-1]; //[undefined];
        let labelRange = ["Multiple Groups"];
        const groupArray = Array.from(groups.entries());
        groupArray.forEach(function (group) {
            groupDomain.push(group[0]);
            labelRange.push("Group " + group[0] + " (" + group[1].join(", ") + ")");
        });

        const groupCount = groups.size;
        let colScale;

        const multiGroupColour = "#202020FF"; // default colour for links involved in multiple groups
        if (groupCount < 11) {
            const colArr = [multiGroupColour].concat(groupCount < 6 ? ["#1b9e77FF",
                "#7570b3FF",
                "#e7298aFF",
                "#66a61eFF",
                "#d95f02FF"
            ] : colorbrewer.Paired[10]);
            colScale = d3.scale.ordinal().range(colArr).domain(groupDomain);
        } else { // more than 10 groups, not really feasible to find colour scale that works - a d3.scale that always returns gray?
            colScale = d3.scale.linear().domain([-1, 0]).range([multiGroupColour, "#448866FF"]).clamp(true);
            labelRange = ["Multiple Groups", "Single Group"];
        }
        this
            .set("colScale", colScale)
            .set("labels", this.get("colScale").copy().range(labelRange))
            .set("type", "ordinal");
    }

    /**
     * Determines which group a link belongs to.
     * Returns group number if link belongs to exactly one group, -1 if multiple groups.
     * Checks all filtered matches across all crosslinks (for aggregate links).
     * @param {Object} link - Crosslink or aggregate link object
     * @returns {number} Group number (0+) or -1 for multiple groups
     */
    getValue(link) {
        // choose value if link definitely belongs to just one group or set as undefined (-1)
        let value = null;
        if (link.isAggregateLink) {
            for (let crosslink of link.getCrosslinks()) {
                const filteredMatchesAndPepPositions = crosslink.filteredMatches_pp;
                for (let fm_pp of filteredMatchesAndPepPositions) {
                    const match = fm_pp.match;
                    const group = this.searchMap.get(match.uploadId).group;
                    if (!value) {
                        value = group;
                    } else if (value !== group) { //check if link uniquely belongs to one group
                        value = -1;    //undefined;
                        break;
                    }
                }
            }
        } else {
            const filteredMatchesAndPepPositions = link.filteredMatches_pp;
            for (let fm_pp = filteredMatchesAndPepPositions.length; --fm_pp >= 0;) {
                const match = filteredMatchesAndPepPositions[fm_pp].match;
                const group = this.searchMap.get(match.uploadId).group;
                if (!value) {
                    value = group;
                } else if (value !== group) { //check if link uniquely belongs to one group
                    value = -1;    //undefined;
                    break;
                }
            }
        }
        return value;
    }

    /**
     * Returns color for a given value, handling undefined values appropriately.
     * For linear scale (>10 groups), converts undefined to -1 to get "multiple groups" color.
     * For ordinal scale, undefined was already added to domain during initialize.
     * @param {number} val - Group number or -1 for multiple groups
     * @returns {string} Hex color string
     */
    getColourByValue(val) {
        const scale = this.get("colScale");
        // the ordinal scales will have had a colour for undefined already added to their scales (in initialize)
        // if it's the linear scale [-1 = multiple, 0 = single] and value is undefined we change it to -1 so it then takes the [multiple] colour value
        if (val === undefined && scale.domain()[0] === -1) {
            val = -1;
        }
        // now all 'undefined' values will get a colour so we don't have to check/set undefined colour here like we do in the default getColour function
        return scale(val);
    }

    /**
     * Returns color for a crosslink by first getting its group value, then mapping to color.
     * @param {Object} crosslink - Crosslink or aggregate link object
     * @returns {string} Hex color string
     */
    getColour(crosslink) {
        return this.getColourByValue(this.getValue(crosslink));
    }
}

/**
 * Distance-based threshold color model - colors crosslinks by Ca-Ca distance.
 * Three categories: Within Distance (good), Borderline, Overlong (violates distance constraint).
 * Aggregate links return undefined (cannot have single distance value).
 * Uses metadata field "distance" from crosslink objects.
 * @class
 * @extends ColourModel
 */
export class DistanceColourModel extends ColourModel {
    constructor(attributes, options) {
        super(attributes, options);
    }

    /**
     * Initializes as threshold type with three distance categories.
     * Labels: Within Distance, Borderline, Overlong. Unit: Angstroms.
     * @returns {undefined}
     */
    initialize() {
        this
            .set("type", "threshold")
            .set("labels", this.get("colScale").copy().range(["Within Distance", "Borderline", "Overlong"]))
            .set("unit", "Å");
    }

    /**
     * Extracts Ca-Ca distance from crosslink metadata.
     * Returns undefined for aggregate links (no single distance value).
     * @param {Object} link - Crosslink or aggregate link object
     * @returns {number|undefined} Distance in Angstroms, or undefined for aggregate links
     */
    getValue(link) {
        if (link.isAggregateLink) {
            return undefined;
        }
        return link.getMeta("distance");
        //return window.compositeModelInst.getSingleCrosslinkDistance(crosslink);
    }
}

/**
 * Protein-pair-based color model - colors crosslinks by protein pair involved.
 * For 3-5 proteins: uses ColorBrewer Set3 with distinct color per protein pair.
 * For other counts: falls back to two-color scheme (same protein vs other).
 * Self-links (same protein) always get "same" category.
 * @class
 * @extends ColourModel
 * @property {boolean} [overload] - True if too many proteins (not 3-5) for distinct colors
 */
export class InterProteinColourModel extends ColourModel {
    constructor(attributes, options) {
        super(attributes, options);
    }

    /**
     * Initializes protein-pair color model by creating ordinal scale.
     * For 3-5 proteins: creates distinct color for each protein pair using Set3 palette.
     * Otherwise: uses two-color scheme (same/other).
     * @param {Object} properties - Model properties
     * @param {Object} options - Options object
     * @param {Map} options.proteins - Map of protein IDs to protein objects
     * @returns {undefined}
     */
    initialize(properties, options) {
        let colScale;
        let labels = ["Same Protein"];
        const proteinIDs = _.pluck(filterOutDecoyInteractors(Array.from(options.proteins.values())), "id");

        if (proteinIDs && proteinIDs.length > 2 && proteinIDs.length < 6) {
            const groupDomain = ["same"];
            proteinIDs.forEach(function (proteinID1, i) {
                for (let m = i + 1; m < proteinIDs.length; m++) {
                    groupDomain.push(this.makeProteinPairKey(proteinID1, proteinIDs[m]));
                    labels.push(options.proteins.get(proteinID1).name + " - " + options.proteins.get(proteinIDs[m]).name);
                }
            }, this);
            const colArr = colorbrewer.Set3[10].slice();
            colArr.unshift("grey");
            colScale = d3.scale.ordinal().range(colArr).domain(groupDomain);
        } else {
            colScale = d3.scale.ordinal().range(["blue", "grey"]).domain(["other", "same"]);
            labels = ["Other", "Same"];
            this.overload = true;   // too many proteins for sensible number of colours
        }

        this
            .set("colScale", colScale)
            .set("labels", this.get("colScale").copy().range(labels));
    }

    /**
     * Creates canonical string key for a protein pair (order-independent).
     * Always returns smaller ID first to ensure consistent key regardless of order.
     * @param {string} pid1 - First protein ID
     * @param {string} pid2 - Second protein ID
     * @returns {string} Canonical key in format "id1---id2" (sorted)
     */
    makeProteinPairKey(pid1, pid2) {
        return pid1 < pid2 ? pid1 + "---" + pid2 : pid2 + "---" + pid1;
    }

    /**
     * Determines protein pair key for a link.
     * Returns "same" for self-links or linear links (single protein).
     * Returns "other" (overload mode) or protein pair key (distinct color mode).
     * For aggregate links, uses first crosslink's proteins.
     * @param {Object} link - Crosslink or aggregate link object
     * @returns {string} "same", "other", or canonical protein pair key
     */
    getValue(link) {
        let id1, id2;
        if (link.isAggregateLink) {
            const crosslink = link.getCrosslinks()[0];
            id1 = crosslink.fromProtein.id;
            id2 = crosslink.toProtein ? link.getCrosslinks()[0].toProtein.id : undefined;
        } else {
            id1 = link.fromProtein.id;
            id2 = link.toProtein ? link.toProtein.id : undefined;
        }
        return (id2 === undefined || id1 === id2) ? "same" : (this.overload ? "other" : this.makeProteinPairKey(id1, id2));
    }
}

/**
 * Score-based threshold color model - colors crosslinks by highest match score.
 * Three categories: Low Score, Mid Score, High Score.
 * For aggregate links, examines all matches across all crosslinks to find maximum score.
 * Uses match.score() method to retrieve score value.
 * @class
 * @extends ColourModel
 */
export class HighestScoreColourModel extends ColourModel {
    constructor(attributes, options) {
        super(attributes, options);
    }

    /**
     * Initializes as threshold type with three score categories.
     * Labels: Low Score, Mid Score, High Score.
     * @param {Object} properties - Model properties (unused)
     * @param {Object} options - Options object (unused)
     * @returns {undefined}
     */
    // eslint-disable-next-line no-unused-vars
    initialize(properties, options) {
        this.set("type", "threshold")
            .set("labels", this.get("colScale").copy().range(["Low Score", "Mid Score", "High Score"]));
    }

    /**
     * Extracts highest score from all matches in a link.
     * For aggregate links: examines all matches across all constituent crosslinks.
     * For regular links: examines all filtered matches.
     * @param {Object} link - Crosslink or aggregate link object
     * @returns {number} Maximum score value
     */
    getValue(link) {
        let scores = [];
        if (link.isAggregateLink) {
            for (let crosslink of link.getCrosslinks()) {
                //todo if we were certain the matches were sorted by score we could speed this up by only taking first match
                for (let m_pp of crosslink.filteredMatches_pp) {
                    scores.push(m_pp.match.score());
                }
            }
        } else {
            scores = link.filteredMatches_pp.map(function (m) {
                return m.match.score();
            });
        }
        return Math.max.apply(Math, scores);
    }

    /**
     * Returns array of [label, color] pairs for legend display.
     * Restricts to minimum length between color range and label range (for ordinal scales).
     * Uses d3.zip to pair labels with their corresponding colors.
     * @returns {Array<Array>} Array of [label, color] tuples
     */
    getLabelColourPairings() {
        const colScale = this.get("colScale");
        const labels = this.get("labels").range();//.concat(this.get("undefinedLabel"));
        const minLength = Math.min(colScale.range().length, this.get("labels").range().length);  // restrict range used when ordinal scale
        const colScaleRange = colScale.range().slice(0, minLength);//.concat(this.get("undefinedColour"));
        return d3.zip(labels, colScaleRange);
    }
}

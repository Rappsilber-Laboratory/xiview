/**
 * @fileoverview Model for crosslink match filtering with FDR and manual modes.
 * Manages all filtering criteria including subset filters (linears/crosslinks/monolinks),
 * score filters, distance filters, validation status, navigation filters (protein names, peptide sequences),
 * and FDR-based filtering. Supports URL parameter encoding/decoding for filter state persistence.
 */

import * as _ from "underscore";
import {objectStateToAbbvString} from "../utils";
import {makeURLQueryPairs} from "../modelUtils";
import d3 from "d3";
import Backbone from "backbone";

/**
 * Model managing all filtering logic for crosslinking mass spectrometry matches.
 * Supports two filtering modes: manual (score-based) and FDR (false discovery rate).
 * Handles subset filtering, validation status, distance constraints, protein/peptide navigation,
 * search group filtering, and URL state encoding.
 * @class
 * @extends Backbone.Model
 * @property {Object} extents - Min/max value constraints for numeric filters
 * @property {Object} patterns - Regular expression patterns for text input validation
 * @property {Object} types - Data types for each filter property (boolean, number, text)
 * @property {Object} preprocessedInputValues - Cached pre-processed user input values
 */
export class FilterModel extends Backbone.Model {
    /**
     * Creates a new FilterModel instance and initializes filter constraints.
     * Sets up value extents, validation patterns, and type definitions for all filter properties.
     * @param {Object} attributes - Initial backbone-models attributes
     * @param {Object} options - Configuration options
     */
    constructor(attributes, options) {
        super(attributes, options);

        this.extents = {
            aaApart: {
                min: 0,
                max: 999
            },
            pepLength: {
                min: 1,
                max: 99
            },
            urpPpi: {
                min: 1,
                max: 99
            },
            fdrThreshold: {
                min: 0,
                max: 100
            }
        };

        this.patterns = {
            pepSeq: "[A-Za-z0-9]+-?[A-Za-z0-9]*",
        };

        this.types = {
            manualMode: "boolean",
            fdrMode: "boolean",
            linears: "boolean",
            monolinks: "boolean",
            crosslinks: "boolean",
            betweenLinks: "boolean",
            selfLinks: "boolean",
            homomultimericLinks: "boolean",
            notHomomult: "boolean",
            ambig: "boolean",
            aaApart: "number",
            pepLength: "number",
            //validation status
            pass: "boolean",
            fail: "boolean",
            decoys: "boolean",
            targets: "boolean",
            //distance
            distanceUndef: "boolean",
            //fdr
            fdrThreshold: "number",
            interFdrCut: "number",
            intraFdrCut: "number",
            //groups,
            multipleGroup: "boolean",
            //navigation
            pepSeq: "text",
            protNames: "text",
            protDesc: "text",
            protPDB: "boolean",
            peaklistName: "text",
            scanNumber: "number",
            urpPpi: "number",
        };
    }

    /**
     * Returns default filter values.
     * Manual mode enabled, FDR mode disabled, all link types shown, pass validation only,
     * targets shown, decoys shown, 5% FDR threshold, no protein/peptide navigation filters.
     * @returns {Object} Default filter attribute values
     */
    defaults() {
        return {
            manualMode: true,
            fdrMode: false,
            //subset
            linears: true,
            monolinks: true,
            crosslinks: true,
            betweenLinks: true,
            selfLinks: true,
            homomultimericLinks: true,
            notHomomult: true,
            ambig: true,
            aaApart: 0,
            pepLength: 1,
            //validation status
            pass: true,
            fail: false,
            decoys: true,
            targets: true,
            //distance
            distanceUndef: true,
            //fdr
            fdrThreshold: 0.05,
            interFdrCut: undefined,
            intraFdrCut: undefined,
            // groups
            multipleGroup: true,
            //navigation
            pepSeq: "",
            protNames: "",
            protDesc: "",
            protPDB: false,
            peaklistName: "",
            scanNumber: "",
            urpPpi: 1,
        };
    }

    /**
     * Initializes the filter backbone-models with score/distance extents and preprocessing structures.
     * Sets up matchScoreCutoff and distanceCutoff arrays (avoiding shared array references in defaults),
     * initializes scoreExtent and distanceExtent from secondarySettings or current values,
     * and creates preprocessing data structures (valMap, preprocessedInputValues).
     * @param {Object} options - Initialization options
     * @param {Object} [secondarySettings] - Optional settings containing scoreExtent, distanceExtent, possibleSearchGroups
     * @returns {void}
     */
    initialize(options, secondarySettings) {
        if (!this.get("matchScoreCutoff")) {
            this.set("matchScoreCutoff", [undefined, undefined]);
            // ^^^setting an array in defaults passes that same array reference to every instantiated backbone-models, so do it in initialize
        }
        // scoreExtent used to restrain text input values
        this.scoreExtent = (secondarySettings ? secondarySettings.scoreExtent : undefined) || this.get("matchScoreCutoff").slice(0);


        if (!this.get("distanceCutoff")) {
            this.set("distanceCutoff", [undefined, undefined]);
        }
        this.distanceExtent = (secondarySettings ? secondarySettings.distanceExtent : undefined) || this.get("distanceCutoff").slice(0);

        // possibleSearchGroups used to restrain searchGroup options
        this.possibleSearchGroups = (secondarySettings ? secondarySettings.possibleSearchGroups : undefined) || this.get("searchGroups").slice(0);
        //this.scoreExtent = this.matches.extent (fu)
        this.valMap = d3.map();
        this.valMap.set("?", "Q");
        this.preprocessedInputValues = d3.map(); // preprocessed user input values so they're not constantly reparsed for every match

        this.resetValues = this.toJSON(); // Store copy of original values if needed to restore later
    }

    /**
     * Resets all filter values to their initial state.
     * Only used by tests. Restores values stored during initialization.
     * @returns {FilterModel} This backbone-models instance for chaining
     */
    resetFilter() {
        this
            .clear({
                silent: true
            })
            .set(this.resetValues);

        return this;
    }

    /**
     * Gets the minimum allowed value for a numeric filter attribute.
     * @param {string} attrID - Attribute identifier (aaApart, pepLength, urpPpi, fdrThreshold)
     * @returns {number|null} Minimum value or null if no extent defined
     */
    getMinExtent(attrID) {
        const extents = this.extents[attrID];
        return extents ? extents.min : null;
    }

    /**
     * Gets the maximum allowed value for a numeric filter attribute.
     * @param {string} attrID - Attribute identifier (aaApart, pepLength, urpPpi, fdrThreshold)
     * @returns {number|null} Maximum value or null if no extent defined
     */
    getMaxExtent(attrID) {
        const extents = this.extents[attrID];
        return extents ? extents.max : null;
    }

    /**
     * Preprocesses user input filter values for efficient matching.
     * Parses and caches protein names/descriptions (split by commas and hyphens),
     * peptide sequences (with upper/lowercase versions), peaklist names, scan numbers,
     * and search group mappings. Called once before filtering to avoid repeated parsing.
     * @param {Array} searchArray - Array of search objects with id and group properties
     * @returns {void}
     */
    preprocessFilterInputValues(searchArray) {
        let protSplit1 = this.get("protNames").toLowerCase().split(","); // split by commas
        this.preprocessedInputValues.set("protNames", protSplit1.map(function (prot) {
            return prot.split("-").map(function (protSplit2) {
                return protSplit2.trim();
            });
        })); // split these in turn by hyphens
        //console.log ("preprocessedValues", this.preprocessedValues.get("protNames"));

        protSplit1 = this.get("protDesc").toLowerCase().split(","); // split by commas
        this.preprocessedInputValues.set("protDesc", protSplit1.map(function (prot) {
            return prot.split("-").map(function (protSplit2) {
                return protSplit2.trim();
            });
        })); // split these in turn by hyphens
        //console.log ("preprocessedValues", this.preprocessedValues.get("protDesc"));

        const pepSeq = this.get("pepSeq");
        const splitPepSeq = pepSeq.split("-").map(function (part) {
            return {
                upper: part.toUpperCase(),
                lower: part.toLowerCase()
            };
        });
        this.preprocessedInputValues.set("pepSeq", splitPepSeq);

        this.preprocessedInputValues.set("peaklistName", this.get("peaklistName").toLowerCase());
        this.preprocessedInputValues.set("scanNumber", parseInt(this.get("scanNumber")));

        // Search group pre calculations
        this.precalcedSearchGroupsSet = d3.set(this.get("searchGroups"));

        const searchGroupMap = d3.map();
        searchArray.forEach(function (search) {
            searchGroupMap.set(search.id, search.group);
        });
        this.precalcedSearchToGroupMap = searchGroupMap;
    }

    /**
     * Filters matches by link type subset criteria.
     * Checks linears/monolinks/crosslinks flags, between-links/self-links flags,
     * ambiguity, homomultimer status, amino acid separation (aaApart), and peptide length.
     * @param {Object} match - Match object to filter
     * @returns {boolean} True if match passes subset filter, false otherwise
     */
    subsetFilter(match) {
        const linear = match.isNotCrosslinked();
        const mono = match.isMonoLink();
        const ambig = match.isAmbig();
        const looplink = match.isLoopLink();

        //linears? - if linear (linkPos === 0) and linears not selected return false
        //cross-links? - if xl (linkPos > 0) and xls not selected return false
        if (mono && !this.get("monolinks")) {
            return false;
        } else if (linear && !this.get("linears")) {
            return false;
        }
        if (!linear && !this.get("crosslinks")) {
            return false;
        } else if (!linear && !mono && !((match.couldBelongToSelfLink && this.get("selfLinks")) ||
            (match.couldBelongToBetweenLink && this.get("betweenLinks")))) {
            //self-links? - if self links's not selected and match is self link return false
            // possible an ambiguous self link will still get displayed
            return false;
        }

        //ambigs? - if ambig's not selected and match is ambig return false
        if (ambig && !this.get("ambig")) {
            return false;
        }

        if (match.couldBelongToSelfLink) {
            if (match.confirmedHomomultimer && !this.get("homomultimericLinks")) {
                return false;
            } else if (!match.confirmedHomomultimer && !this.get("notHomomult")) {
                return false;
            }
        }

        const aaApart = +this.get("aaApart");
        if (!isNaN(aaApart)) {
            // if not homomultimer and not ambig and is a selfLink
            if ( /* !match.confirmedHomomultimer &&*/ !ambig && match.crosslinks[0].isSelfLink()) {
                // linears report false for isSelfLink so they never get to this bit (where toResidue would be null)
                const unambigCrossLink = match.crosslinks[0];
                if (Math.abs(unambigCrossLink.toResidue - unambigCrossLink.fromResidue) < aaApart) {
                    return false;
                }
            }
        }

        const pepLengthFilter = +this.get("pepLength");
        if (!isNaN(pepLengthFilter)) {
            const seq1length = match.matchedPeptides[0].sequence.length;
            if (seq1length > 0 && (seq1length < pepLengthFilter ||
                (!linear && !mono && !looplink && match.matchedPeptides[1].sequence.length < pepLengthFilter))) {
                return false;
            }
        }

        return true;
    }

    /**
     * Filters matches by score cutoff range.
     * Checks if match score falls within [matchScoreCutoff[0], matchScoreCutoff[1]].
     * Returns true if match has no score (e.g., from CSV without score column).
     * @param {Object} match - Match object with score() method
     * @returns {boolean} True if match passes score filter, false otherwise
     */
    scoreFilter(match) {
        const score = match.score();
        //defend against not having a score (from a CSV file without such a column)
        if (isNaN(score)) {
            return true;
        }
        const msc = this.get("matchScoreCutoff");
        return (msc[0] == undefined || score >= msc[0]) && (msc[1] == undefined || score <= msc[1]); // == undefined cos shared links get undefined json'ified to null
    }

    /**
     * Filters matches by decoy/target status.
     * Returns decoys flag if match is decoy, targets flag if match is target.
     * @param {Object} match - Match object with isDecoy() method
     * @returns {boolean} True if match passes decoy filter, false otherwise
     */
    decoyFilter(match) {
        if (match.isDecoy()) {
            return this.get("decoys");
        } else {
            return this.get("targets");
        }
    }

    /**
     * Filters crosslinks by 3D distance cutoff range.
     * Undefined distances pass if no distances exist or distanceUndef flag is true.
     * Checks if distance falls within [distanceCutoff[0], distanceCutoff[1]].
     * @param {Object} crosslink - Crosslink object with getMeta("distance") method
     * @returns {boolean} True if crosslink passes distance filter, false otherwise
     */
    distanceFilter(crosslink) {
        const dist = crosslink.getMeta("distance");
        if (dist === undefined) {   // show undefined distances if either no distances or specifically allowed (distanceUndef flag)
            const noDistances = this.distanceExtent[0] === undefined;
            return noDistances || this.get("distanceUndef");
        }
        const dsc = this.get("distanceCutoff");
        return (dsc[0] == undefined || dist >= dsc[0]) && (dsc[1] == undefined || dist <= dsc[1]); // == undefined cos shared links get undefined json'ified to null
    }

    /**
     * Filters matches by manual validation status.
     * Returns true if match passes threshold and "pass" flag is true,
     * or if match fails threshold and "fail" flag is true.
     * @param {Object} match - Match object with passThreshold property
     * @returns {boolean} True if match passes validation status filter, false otherwise
     */
    validationStatusFilter(match) {
        if (this.get("pass") && match.passThreshold == true) {
            return true;
        }
        if (this.get("fail") && match.passThreshold == false) {
            return true;
        }
        return false;
    }

    /**
     * Tests if proteins at both ends of match are present in the current PDB file.
     * Only applied when protPDB flag is true. Checks if both matched peptides have
     * associated proteins with chains in the current PDB chain map.
     * @param {Object} match - Match object with matchedPeptides array
     * @returns {boolean} True if match passes PDB protein filter (or filter inactive), false otherwise
     */
    pdbProteinFilter(match) {
        if (this.get("protPDB")) {
            const dObj = this.compositeModel.get("distancesObj");
            if (dObj) {
                const chainMap = dObj.chainMap;
                if (chainMap) {
                    const mpeps = match.matchedPeptides;
                    const pass = mpeps.every(function (mpep) {
                        const proteins = mpep.prt;
                        return proteins.some(function (prot) {
                            return chainMap[prot];
                        });   // ambig match can point to multiple proteins at one or both ends
                    });
                    return pass;
                }
            }
        }
        return true;
    }

    /**
     * Filters matches by protein name or description search strings.
     * Supports complex queries: comma-separated for OR, hyphen-separated for AND.
     * Example: "A-B,C-D" means (A AND B) OR (C AND D).
     * Searches protein names, accessions (for name field), or descriptions/keywords (for description field).
     * @param {Object} match - Match object with matchedPeptides array
     * @param {string} searchString - User input search string (raw)
     * @param {string} dataField - Field to search in protein object ("name" or "description")
     * @param {string} preProcessedField - Key for preprocessedInputValues ("protNames" or "protDesc")
     * @returns {boolean} True if match passes protein filter (or filter inactive), false otherwise
     */
    proteinFilter(match, searchString, dataField, preProcessedField) {
        if (searchString) {
            //protein name check
            const stringPartArrays = this.preprocessedInputValues.get(preProcessedField);
            const proteins = this.compositeModel.get("clmsModel").getProteinsMap();
            const matchedPeptides = match.matchedPeptides;
            const matchedPepCount = matchedPeptides.length;

            for (let spa = 0; spa < stringPartArrays.length; spa++) {
                const stringPartArr = stringPartArrays[spa];
                const used = [];
                let matchedProteins = 0;

                for (let ns = 0; ns < stringPartArr.length; ns++) {
                    const partString = stringPartArr[ns];
                    let found = false;

                    for (let i = 0; i < matchedPepCount; i++) {
                        const matchedPeptide = matchedPeptides[i];
                        if (found === false && typeof used[i] == "undefined") {
                            const pids = matchedPeptide.prt;
                            const pidCount = pids.length;
                            for (let p = 0; p < pidCount; p++) {
                                const protein = proteins.get(pids[p]);
                                let toSearch = protein[dataField];// + " " + protein.description;

                                //hacky
                                if (dataField === "description") {
                                    if (protein.uniprot) {
                                        toSearch += protein.uniprot.keywords;
                                    }
                                }

                                if (dataField == "name" && protein.accession) {  // hacky nevermind
                                    toSearch = toSearch + " " + protein.accession;
                                }
                                if (toSearch && toSearch.toLowerCase().indexOf(partString) != -1) {
                                    found = true;
                                    used[i] = true; // so can't match two strings to same peptide e.g. "dog-cat" to protein associated with same peptide
                                    break;
                                }
                            }
                        }
                    }
                    // this string is found in one of the protein names/descriptors associated with one of the match's so far unused peptides, so increment a counter
                    if (found) {
                        matchedProteins++;
                    }
                }
                // if number of matched proteins equals number of part strings to be matched then match passes the filter
                //console.log ("fp", foundPeptides, stringPartArr.length, foundPeptides === stringPartArr.length);
                if (matchedProteins === stringPartArr.length) {
                    return true;
                }
            }
            // return false if reach end of loop (no true condition found)
            return false;
        }
        // return true if no string to match against
        return true;
    }

    /**
     * Filters matches by navigation criteria (peaklist name, scan number, protein names/descriptions, peptide sequences, PDB presence).
     * Arranged with cheaper checks first for performance. Calls proteinFilter() for name/description searches,
     * pdbProteinFilter() for PDB checks, and internal seqCheck() for peptide sequence matching.
     * @param {Object} match - Match object to filter
     * @returns {boolean} True if match passes navigation filter, false otherwise
     */
    navigationFilter(match) {
        // Arranged so cheaper checks are done first

        //run name check
        const peaklistFilter = this.preprocessedInputValues.get("peaklistName");
        if (peaklistFilter &&
            match.peaklistFileName().toLowerCase().indexOf(peaklistFilter) == -1) {
            return false;
        }

        //scan number check
        const scanNumberFilter = this.preprocessedInputValues.get("scanNumber");
        if (!isNaN(scanNumberFilter) &&
            match.scanNumber !== scanNumberFilter
            //match.scanNumber.toString().toLowerCase().indexOf(scanNumberFilter.toLowerCase()) == -1
        ) {
            return false;
        }

        //protein name check
        if (this.proteinFilter(match, this.get("protNames"), "name", "protNames") === false) {
            return false;
        }

        //protein description check
        if (this.proteinFilter(match, this.get("protDesc"), "description", "protDesc") === false) {
            return false;
        }

        //protein in pdb check
        if (this.pdbProteinFilter(match) === false) {
            return false;
        }

        //peptide seq check
        if (seqCheck(this.get("pepSeq"), this.preprocessedInputValues.get("pepSeq")) === false) {
            return false;
        }

        //end of filtering check
        return true;

        //util functions used in nav filter check:

        //peptide seq check function
        function seqCheck(searchString, preprocPepStrings) { //preprocPepStrings: "KK-KR" will be [{upper:"KK", lower:"kk}, {upper:"KR", lower:"kr"}]
            if (searchString) {
                const matchedPeptides = match.matchedPeptides;
                const matchedPepCount = matchedPeptides.length;

                //var pepStrings = searchString.split('-');
                //var pepStringsCount = pepStrings.length;
                const pepStringsCount = preprocPepStrings.length;

                if (pepStringsCount == 1) {
                    let uppercasePep = preprocPepStrings[0].upper;
                    let lowercasePep = preprocPepStrings[0].lower;
                    for (let i = 0; i < matchedPepCount; i++) {
                        let matchedPeptide = matchedPeptides[i];
                        if (matchedPeptide.sequence.indexOf(uppercasePep) != -1 ||
                            (matchedPeptide.seq_mods && matchedPeptide.seq_mods.toLowerCase().indexOf(lowercasePep) != -1)) {
                            return true;
                        }
                    }
                    return false;
                }

                let aggMatchedCount = 0;
                for (let ps = 0; ps < pepStringsCount; ps++) {
                    const pepStringCases = preprocPepStrings[ps];
                    let uppercasePep = pepStringCases.upper;
                    let lowercasePep = pepStringCases.lower;
                    let matchCount = 0;
                    for (let i = 0; i < matchedPepCount; i++) {
                        let matchedPeptide = matchedPeptides[i];
                        if (matchedPeptide.sequence.indexOf(uppercasePep) != -1 ||
                            (matchedPeptide.seq_mods && matchedPeptide.seq_mods.toLowerCase().indexOf(lowercasePep) != -1)) {
                            matchCount += (i + 1); // add 1 for first matched peptide, add 2 for second. So will be 3 if both.
                        }
                    }
                    if (matchCount === 0) return false; // neither peptide matches this part of the input string, so match can't pass the filter
                    aggMatchedCount |= matchCount; // logically aggregate to aggMatchedCount
                }
                // If 1, both pepstrings matched first peptide. If 2, both pepstrings matched second peptide.
                // Can't be one pepstring matching both peptides and the other neither, as an individual zero matchcount would return false in the loop
                // (so can't be 0 in total either)
                // So 3 must be the case where both peptides contain the pepstrings, such that one or both pepstrings are present at alternate ends
                return aggMatchedCount === 3;
            }
            return true;
        }
    }

    /**
     * Filters matches by search group membership.
     * If multiple search groups exist, only passes matches whose datasetId belongs to
     * one of the selected search groups. Inactive if only one search group exists.
     * @param {Object} match - Match object with datasetId property
     * @returns {boolean} True if match passes group filter (or filter inactive), false otherwise
     */
    groupFilter(match) {
        if (this.possibleSearchGroups.length > 1) {
            const matchGroup = this.precalcedSearchToGroupMap.get(match.uploadId);
            return this.precalcedSearchGroupsSet.has(matchGroup);
        }
        return true;
    }

    /**
     * Filters match arrays by search group homogeneity.
     * When multipleGroup flag is false and multiple search groups exist, only passes
     * match arrays where all matches belong to the same search group.
     * @param {Array} matchArr - Array of match objects with match.match.uploadId
     * @returns {boolean} True if match array passes group filter (or filter inactive), false otherwise
     */
    groupFilter2(matchArr) {
        if (matchArr.length > 1 && this.possibleSearchGroups.length > 1 && !this.get("multipleGroup")) {
            const smap = this.precalcedSearchToGroupMap;
            const firstMatchGroup = smap.get(matchArr[0].match.uploadId);
            return matchArr.every(function (match) {
                return smap.get(match.match.uploadId) === firstMatchGroup;
            }, this);
        }
        return true;
    }

    /**
     * Generates abbreviated state string for filename/logging purposes.
     * Creates human-readable summary of active filter settings using abbreviated field names.
     * Different field sets for FDR mode vs manual mode. Follows Stanford data management file naming guidelines.
     * @returns {string} Abbreviated state string (e.g., "FDR_THR0.05_SELFCUT0.02_BTWNCUT0.03")
     */
    stateString() {
        // https://library.stanford.edu/research/data-management-services/case-studies/case-study-file-naming-done-well
        let fields = [];

        // http://www.indiana.edu/~letrs/help-services/QuickGuides/oed-abbr.html
        // https://www.allacronyms.com/
        const abbvMap = {
            intraFdrCut: "SELFCUT",
            interFdrCut: "BTWNCUT",
            fdrMode: "FDR",
            manualMode: "MAN",
            betweenLinks: "BTWN",
            selfLinks: "SELF",
            pepLength: "PEPLEN",
            fdrThreshold: "THR",
            matchScoreCutoff: "MATCHSCORES",
            distanceCutoff: "DIST",
            distanceUndef: "DISTUNK",
            aaApart: "APART",
            crosslinks: "XLINKS",
            homomultimericLinks: "HOMOM",
            searchGroups: "GROUPS",
            multipleGroup: "MGRP",
        };
        const zeroFormatFields = d3.set(["intraFdrCut", "interFdrCut", "scores"]);
        if (this.get("fdrMode")) {
            fields = ["fdrMode", "fdrThreshold", "ambig", "betweenLinks", "selfLinks", "aaApart", "pepLength"];
            // no point listing inter/intra fdr cut if between/self links aren't active
            if (this.get("betweenLinks")) {
                fields.splice(1, 0, "interFdrCut");
            }
            if (this.get("selfLinks")) {
                fields.splice(1, 0, "intraFdrCut");
            }
        } else {
            const antiFields = ["fdrThreshold", "interFdrCut", "intraFdrCut", "fdrMode"];
            if (this.get("matchScoreCutoff")[1] == undefined) { // ignore matchscorecutoff if everything allowed
                antiFields.push("matchScoreCutoff");
            }
            if (this.get("distanceCutoff")[1] == undefined) { // ignore distancecutoff if everything allowed
                antiFields.push("distanceCutoff");
            }
            fields = d3.keys(_.omit(this.attributes, antiFields));
            //console.log ("filter fieldset", this.attributes, fields);
        }

        const str = objectStateToAbbvString(this, fields, zeroFormatFields, abbvMap);
        return str;
    }

    /**
     * Generates URL query parameter pairs from current filter settings.
     * Encodes all filter attributes as URL parameters with "F" prefix.
     * Used for shareable URLs and state persistence.
     * @returns {Array<string>} Array of "key=value" query parameter strings
     */
    getURLQueryPairs() {
        // make url parts from current filter attributes
        return makeURLQueryPairs(this.attributes, "F");
    }

    /**
     * Extracts filter settings from URL query parameter map.
     * Parses URL parameters with "F" prefix, validates against allowable filter keys,
     * and returns filter-specific settings.
     * @param {Object} urlChunkMap - Map of URL parameter key-value pairs
     * @returns {Object} Validated filter settings extracted from URL
     */
    getFilterUrlSettings(urlChunkMap) {
        const urlChunkKeys = d3.keys(urlChunkMap).filter(function (key) {
            return key[0] === "F";
        });
        const filterUrlSettingsMap = {};
        urlChunkKeys.forEach(function (key) {
            filterUrlSettingsMap[key.slice(1)] = urlChunkMap[key];
        });
        const allowableFilterKeys = d3.keys(this.defaults);
        allowableFilterKeys.push("matchScoreCutoff", "searchGroups", "distanceCutoff", "pdb");
        const intersectingKeys = _.intersection(d3.keys(filterUrlSettingsMap), allowableFilterKeys);
        const filterChunkMap = _.pick(filterUrlSettingsMap, intersectingKeys);
        console.log("FCM", filterChunkMap);
        return filterChunkMap;
    }

}

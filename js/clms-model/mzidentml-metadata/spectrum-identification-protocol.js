// Ion series and neutral losses searched for, read from the protocol's AdditionalSearchParams.
// See https://github.com/HUPO-PSI/mzIdentML/issues/128 for why this needs several CV branches.

/**
 * Ion series the annotator supports, by CV accession (children of MS:1002473 "ion series considered in search").
 * @type {Object<string, string>}
 */
const ION_SERIES = {
    "MS:1001108": "a",
    "MS:1001118": "b",
    "MS:1001119": "c",
    "MS:1001261": "x",
    "MS:1001262": "y",
    "MS:1001263": "z",
};

/**
 * Deprecated ion series + neutral loss terms (children of MS:1001066 "ions series considered in search"),
 * still written by some software. Each means its base ion series, searched with that loss.
 * @type {Object<string, Array<string>>}
 */
const ION_SERIES_WITH_LOSS = {
    "MS:1001146": ["a", "NH3"],
    "MS:1001148": ["a", "H2O"],
    "MS:1001149": ["b", "NH3"],
    "MS:1001150": ["b", "H2O"],
    "MS:1001151": ["y", "NH3"],
    "MS:1001152": ["y", "H2O"],
    "MS:1002450": ["b", "H3PO4"],
    "MS:1002451": ["y", "H3PO4"],
};

/**
 * Ion series in the CV that the annotator can't annotate.
 * @type {Object<string, string>}
 */
const UNSUPPORTED_ION_SERIES = {
    "MS:1001257": "v ion",
    "MS:1001258": "d ion",
    "MS:1001259": "immonium ion",
    "MS:1001260": "w ion",
    "MS:1001406": "internal yb ion",
    "MS:1001407": "internal ya ion",
    "MS:1001408": "z+1 ion",
    "MS:1001409": "z+2 ion",
};

/**
 * Neutral loss terms: obsolete children of MS:1002473, giving the loss by accession.
 * @type {Object<string, string>}
 */
const LOSS_TERMS = {
    "MS:1002455": "H2O",
    "MS:1002456": "NH3",
    "MS:1002457": "H3PO4",
};

/**
 * MS:1000336 "neutral loss": the cvParam value(s) name the loss.
 * @type {string}
 */
const NEUTRAL_LOSS = "MS:1000336";

/**
 * Losses the annotator can be given, as xi1-style annotation request losses (same masses and
 * specificities as xi2annotator's default H2O and NH3 losses).
 * @type {Object<string, {id: string, mass: number, specificity: Array<string>}>}
 */
const SUPPORTED_LOSSES = {
    H2O: {id: "H2O", mass: 18.01056027, specificity: ["S", "T", "D", "E", "CTerm"]},
    NH3: {id: "NH3", mass: 17.02654493, specificity: ["R", "K", "N", "Q", "NTerm"]},
};

/**
 * Other names the neutral loss cvParam value may use for a supported loss.
 * @type {Object<string, string>}
 */
const LOSS_ALIASES = {h2o: "H2O", water: "H2O", nh3: "NH3", ammonia: "NH3"};

/**
 * Ion series used when a protocol names none: b and y.
 * @type {Array<string>}
 */
export const DEFAULT_ION_SERIES = ["b", "y"];

/**
 * Losses used when a protocol names none: H2O and NH3.
 * @type {Array<string>}
 */
export const DEFAULT_LOSSES = ["H2O", "NH3"];

/**
 * Ion types as used in annotation requests, e.g. [{type: "bIon"}, {type: "yIon"}]. New objects on every call.
 * @param {Array<string>} series - Ion series letters
 * @returns {Array<Object>} Ion type objects
 */
export function ionTypeObjects(series) {
    return series.map(s => ({type: s + "Ion"}));
}

/**
 * Losses as used in annotation requests. New objects on every call.
 * @param {Array<string>} losses - Loss names (keys of SUPPORTED_LOSSES)
 * @returns {Array<Object>} Loss objects {id, mass, specificity}
 */
export function lossObjects(losses) {
    return losses.map(l => {
        const loss = SUPPORTED_LOSSES[l];
        return {id: loss.id, mass: loss.mass, specificity: loss.specificity.slice()};
    });
}

export class SpectrumIdentificationProtocol {
    /**
     * Private JSON data sent by crosslinking-API
     * @type {Object}
     * @private
     */
    #json;

    /**
     * Private array of Enzyme instances
     * @type {Array<Enzyme>}
     */
    #enzymes;

    /**
     * Private array of SearchModification instances
     */
    #searchModifications;

    /**
     * Ion series searched for (letters, in a, b, c, x, y, z order), from AdditionalSearchParams
     * @type {Array<string>}
     */
    #ionSeries;

    /**
     * Neutral losses searched for (names, in H2O, NH3 order), from AdditionalSearchParams
     * @type {Array<string>}
     */
    #losses;

    /**
     * Problems found reading ion series / losses, for showing to the user
     * @type {Array<string>}
     */
    #fragmentationWarnings;

    /**
     * Create a SpectrumIdentificationProtocol instance
     * @param {Object} json - JSON data sent by crosslinking-API
     * @param {number} json.id - Protocol identifier
     * @param {string} json.sip_ref - Spectrum identification protocol reference
     * @param {number} json.upload_id - Upload identifier
     * @param {number} json.frag_tol - Fragment ion tolerance value
     * @param {string} json.frag_tol_unit - Fragment ion tolerance unit (e.g., "ppm", "Da")
     * @param {Object} json.additional_search_params - Additional search parameters object with CV term key-value pairs
     * @param {Object} json.analysis_software - Analysis software information object
     * @param {Object} json.threshold - Search threshold object
     * @param {Array<Enzyme>} enzymes - Array of Enzyme instances used in the search
     * @param {Array<SearchModification>} searchModifications - Array of Modification instances used in the search
     */
    constructor(json, enzymes, searchModifications) {
        this.#json = json;
        this.#enzymes = enzymes;
        this.#searchModifications = searchModifications;
        this.#readFragmentation(json.additional_search_params || {});
    }

    /**
     * Work out the ion series and neutral losses from AdditionalSearchParams.
     * Unsupported ion series and losses are left out, with a warning. If no supported ion series
     * is named, b and y are used, with a warning. If no loss is named at all, H2O and NH3 are used
     * (the annotator's own default); if losses are named but none is supported, none is used.
     * @param {Object} params - CV accession -> name or value(s)
     * @returns {void}
     * @private
     */
    #readFragmentation(params) {
        const series = new Set();
        const losses = new Set();
        const unsupportedSeries = [];
        const unsupportedLosses = new Set();
        let lossNamed = false;
        const addLoss = (name) => {
            lossNamed = true;
            const canonical = SUPPORTED_LOSSES[name] ? name : LOSS_ALIASES[String(name).trim().toLowerCase()];
            if (canonical) {
                losses.add(canonical);
            } else {
                unsupportedLosses.add(String(name));
            }
        };
        for (const accession of Object.keys(params)) {
            if (ION_SERIES[accession]) {
                series.add(ION_SERIES[accession]);
            } else if (ION_SERIES_WITH_LOSS[accession]) {
                series.add(ION_SERIES_WITH_LOSS[accession][0]);
                addLoss(ION_SERIES_WITH_LOSS[accession][1]);
            } else if (UNSUPPORTED_ION_SERIES[accession]) {
                unsupportedSeries.push(UNSUPPORTED_ION_SERIES[accession]);
            } else if (LOSS_TERMS[accession]) {
                addLoss(LOSS_TERMS[accession]);
            } else if (accession === NEUTRAL_LOSS) {
                const value = params[accession];
                for (const name of (Array.isArray(value) ? value : [value])) {
                    addLoss(name);
                }
            }
        }

        const warnings = [];
        if (unsupportedSeries.length) {
            warnings.push("ion series the annotator does not support were left out: " + unsupportedSeries.join(", "));
        }
        if (series.size === 0) {
            warnings.push("no supported ion series given, so b and y ions are used");
        }
        if (unsupportedLosses.size) {
            warnings.push("neutral losses the annotator does not support were left out: " + Array.from(unsupportedLosses).join(", "));
        }
        this.#ionSeries = series.size ? Object.values(ION_SERIES).filter(s => series.has(s)) : DEFAULT_ION_SERIES.slice();
        this.#losses = lossNamed ? Object.keys(SUPPORTED_LOSSES).filter(l => losses.has(l)) : DEFAULT_LOSSES.slice();
        this.#fragmentationWarnings = warnings;
    }

    // {
    //     "id": 0,
    //     "sip_ref": "SearchProtocol_1_0",
    //     "upload_id": 33,
    //     "frag_tol": 5,
    //     "frag_tol_unit": "ppm",
    //     "additional_search_params": {
    //         "MS:1001211": "parent mass type mono",
    //         "MS:1002494": "crosslinking search",
    //         "MS:1001256": "fragment mass type mono"
    //     },
    //     "analysis_software": {
    //         "version": "2.1.5.5",
    //         "id": "xiFDR_id",
    //         "name": "XiFDR",
    //         "SoftwareName": {
    //             "xiFDR": ""
    //         }
    //     },
    //     "threshold": {
    //         "no threshold": ""
    //     }
    // }

    /**
     * Get protocol identifier
     * @returns {number} Protocol identifier
     */
    get id()  {
        return this.#json.id;
    }
    /**
     * Get spectrum identification protocol reference
     * @returns {string} Protocol reference
     */
    get spectrumIdentificationProtocolRef() {
        return this.#json.sip_ref;
    }
    /**
     * Get upload identifier
     * @returns {number} Upload identifier
     */
    get uploadId() {
        return this.#json.upload_id;
    }
    /**
     * Get fragment ion tolerance value
     * @returns {number} Fragment tolerance
     */
    get fragmentTolerance() {
        return this.#json.frag_tol;
    }
    /**
     * Get fragment ion tolerance unit
     * @returns {string} Tolerance unit (e.g., "ppm", "Da")
     */
    get fragmentToleranceUnit() {
        return this.#json.frag_tol_unit;
    }
    /**
     * Get additional search parameters
     * @returns {Object} Object containing CV term key-value pairs
     */
    get additionalSearchParams() {
        return this.#json.additional_search_params;
    }
    /**
     * Get analysis software information
     * @returns {Object} Software information object
     */
    get analysisSoftware() {
        return this.#json.analysis_software;
    }
    /**
     * Get search threshold information
     * @returns {Object} Threshold object
     */
    get threshold() {
        return this.#json.threshold;
    }

    /**
     * Get the enzymes used in this protocol
     * @returns {Array<Enzyme>} Array of Enzyme instances (a protocol may use several)
     */
    get enzymes() {
        return this.#enzymes;
    }

    /**
     * Get the search modifications used in this protocol
     * @returns {Array<SearchModification>} Array of SearchModification instances
     */
    get searchModifications() {
        return this.#searchModifications;
    }

    /**
     * Crosslinker cleavage stubs (MS:1003390, "name:mass:pairs with") of the search modification
     * with this search modification id (MS:1003392), which a peptide's modification names with
     * MS:1003393 (search modification id ref).
     * @param {string} searchModificationId - The search modification id
     * @returns {Array<string>|undefined} The stubs ([] if that modification has none), or undefined
     *  if no search modification has this id, or several do with different stubs
     */
    crosslinkerStubs(searchModificationId) {
        const stubs = this.#stubIndex().get(String(searchModificationId));
        return stubs === null ? undefined : stubs;
    }

    /**
     * Whether any search modification of this protocol has crosslinker cleavage stubs (MS:1003390)
     * @returns {boolean}
     */
    get hasCrosslinkerStubs() {
        for (const stubs of this.#stubIndex().values()) {
            if (stubs === null || stubs.length) { // null: ambiguous, so has some
                return true;
            }
        }
        return false;
    }

    /**
     * Search modification id -> its stubs, or null if the id is given to several search
     * modifications with different stubs. Not cached: it is cheap, and so can't go stale.
     * @returns {Map<string, Array<string>|null>}
     */
    #stubIndex() {
        const index = new Map();
        for (const searchMod of this.#searchModifications ?? []) {
            const accessions = searchMod.accessions ?? {};
            const id = accessions["MS:1003392"];
            if (id === undefined || id === null) {
                continue;
            }
            const value = accessions["MS:1003390"];
            // one stub is stored as a string, several as a list
            const stubs = value === undefined || value === null ? [] : (Array.isArray(value) ? value.map(String) : [String(value)]);
            const key = String(id);
            if (index.has(key)) {
                const previous = index.get(key);
                if (previous === null || previous.length !== stubs.length || previous.some((s, i) => s !== stubs[i])) {
                    index.set(key, null);
                }
            } else {
                index.set(key, stubs);
            }
        }
        return index;
    }

    // /**
    //  * Get fragment tolerance settings
    //  * @returns {Object} Object with tolerance and unit properties
    //  */
    // fragmentTolerance() {
    //     const sip = this.spectrumIdentificationProtocol;
    //     return {
    //         "tolerance": sip.fragmentTolerance,
    //         "unit": sip.fragmentToleranceUnit
    //     };
    // }

    /**
     * Get fragment tolerance as formatted string
     * @returns {string|undefined} Fragment tolerance string or undefined
     */
    fragmentToleranceString() {
        let fragTol = this.fragmentTolerance();
        if (fragTol) {
            return fragTol.tolerance + " " + fragTol.unit;
        }
    }

    /**
     * Get the ion types searched for (b and y if the protocol names none)
     * @returns {Array<Object>} Array of ion type objects, e.g. [{type: "bIon"}, {type: "yIon"}]; new objects on every call
     */
    ionTypes() {
        return ionTypeObjects(this.#ionSeries);
    }

    /**
     * Get the neutral losses searched for (H2O and NH3 if the protocol names none)
     * @returns {Array<Object>} Array of xi1-style annotation request losses {id, mass, specificity}; new objects on every call
     */
    losses() {
        return lossObjects(this.#losses);
    }

    /**
     * Problems found reading the ion series / neutral losses (unsupported ones left out, defaults used)
     * @returns {Array<string>} Warning messages, empty if none
     */
    get fragmentationWarnings() {
        return this.#fragmentationWarnings.slice();
    }

    // /**
    //  * Get ion types as JSON string
    //  * @returns {string} JSON string of ion types
    //  */
    // ionTypesString() {
    //     return JSON.stringify(this.ionTypes());
    // }
    /**
     * Convert to JSON object for serialization
     * @returns {Object} Object with all getter values
     */
    toJSON() {
        return {
            // id: this.id,
            spectrumIdentificationProtocolRef: this.spectrumIdentificationProtocolRef,
            // uploadId: this.uploadId,
            fragmentTolerance: this.fragmentTolerance,
            fragmentToleranceUnit: this.fragmentToleranceUnit,
            additionalSearchParams: this.additionalSearchParams,
            analysisSoftware: this.analysisSoftware,
            threshold: this.threshold
        };
    }
}

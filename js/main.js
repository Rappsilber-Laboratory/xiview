/**
 * @fileoverview Main application entry point for xiVIEW.
 * Handles CSS imports, initialization, data loading, and application bootstrapping.
 * This is the entry point specified in webpack configuration.
 */

import "../css/reset.css";
import "../css/common.css";
import "../vendor/byrei-dyndiv_0.5.css";
import "jsonview/dist/jquery.jsonview.css";
import "../css/style.css";
import "../css/xiView.css";

import * as Spinner from "spin";
import * as d3 from "d3";
import {
    models,
    views,
    // blosumLoading,
    modelsEssential,
    viewsEssential,
    postDataLoaded
} from "./networkFrame";
import {showMessage} from "./ui-utils/message-popup";
import {fetchWithBackoff, parseUuidGroupLabels} from "./utils";
import Split from "split.js";
import {SearchResultsModel} from "./clms-model/search-results-model";
import {BlosumCollection} from "./backbone-models/models";
import vent from "./vent";
// Debugging helper (not for production): exposes window.applySavedLayout() to apply the
// bundled Juri_sorted layout from the browser console.
import {applySavedLayout} from "./debug/apply-saved-layout";
window.applySavedLayout = applySavedLayout;

/**
 * Global spinner instance for displaying loading state on the main network page.
 * @type {Spinner}
 */
export const networkPageSpinner = new Spinner({
    length: 38, // The length of each line
    width: 17, // The line thickness
    radius: 45, // The radius of the inner circle
});

/**
 * Starts periodic memory monitoring for development builds.
 * Logs JavaScript VM memory usage and DOM node count every 10 seconds.
 * Only works in Chrome/Chromium-based browsers that support performance.memory API.
 * @private
 */
function startMemoryMonitoring() {
    let logCount = 0;
    if (performance.memory) {
        setInterval(() => {
            logCount++;
            const memory = performance.memory;
            const usedMB = (memory.usedJSHeapSize / 1048576).toFixed(2);
            const totalMB = (memory.totalJSHeapSize / 1048576).toFixed(2);
            const limitMB = (memory.jsHeapSizeLimit / 1048576).toFixed(2);
            const domNodes = document.getElementsByTagName("*").length;
            console.log(`[Memory #${logCount}] Used: ${usedMB} MB | Total: ${totalMB} MB | Limit: ${limitMB} MB | DOM Nodes: ${domNodes}`);
        }, 10000);
    } else {
        console.warn("performance.memory is not available in this browser. Memory monitoring is only supported in Chrome/Chromium-based browsers.");
    }
}

// Start memory monitoring only in development builds
if (process.env.NODE_ENV !== "production") {
    startMemoryMonitoring();
}

/**
 * Fetches JSON data from a specified URL.
 * @param {string} url - The URL to fetch data from
 * @returns {Promise<Object>} Promise that resolves to the JSON data
 * @throws {Error} If the HTTP request fails or response is not OK
 * @private
 */
const fetchDataFromUrl = (url) => {
    return fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .catch(error => {
            throw new Error(`${error.message} <a href="'${url}'">${url}</a>`);
        });
};

/**
 * Fetches data from a URL and processes it with the provided function.
 * @param {string} url - The URL to fetch data from
 * @param {Function} processFunction - Function to process the fetched data
 * @returns {Promise<void>} Promise that resolves when data is fetched and processed
 * @throws {Error} If fetching or processing fails
 * @private
 */
const fetchDataAndProcess = (url, processFunction) => {
    return fetchDataFromUrl(url)
        .then((data) => {
            processFunction(data);
        })
        .catch((error) => {
            throw error;
        });
};

/**
 * Fetches the most recently saved config (xiNET layout + filter settings) for the current dataset(s).
 * Soft-fails: any error is logged and resolves to null, so data loading is never blocked.
 * @param {string} apiBase - Base URL for API endpoints
 * @returns {Promise<Object|null>} Promise that resolves to the saved config row or null
 * @private
 */
const fetchSavedConfig = (apiBase) => {
    return fetchDataFromUrl(`${apiBase}config${window.location.search}`)
        .catch((error) => {
            console.warn("Couldn't load saved config", error);
            return null;
        });
};

/**
 * Main application initialization function for the full xiVIEW interface.
 * Loads all necessary data (API endpoints, BLOSUM matrices), initializes clms-backbone-models and views,
 * and sets up the complete application UI.
 * @param {string} apiBase - Base URL for API endpoints
 * @param {string} annotatorURL - URL for the annotation service
 * @param {Object} [options] - Optional settings
 * @param {boolean} [options.configSaving] - Enable saving/loading configs (xiNET layout + filter settings).
 *     Defaults to true when the URL has a "uuid" param (xi2 datasets).
 * @returns {void}
 */
export function main(apiBase, annotatorURL, options = {}) {
    const spinTarget = d3.select("#main").node();
    networkPageSpinner.spin(spinTarget);
    showDataLoadStatus(spinTarget);
    setWindowTitle();
    const clmsModel = new SearchResultsModel();
    clmsModel.setSearchGroupLabels(parseUuidGroupLabels(window.location.search));
    const tasks = getTasks(apiBase, clmsModel);
    // Create a promise that resolves when blosum data is loaded
    const blosumCollInst = new BlosumCollection();
    const blosumPromise = new Promise((resolve) => {
        blosumCollInst.listenToOnce(blosumCollInst, "sync", resolve);
        blosumCollInst.fetch();
    });

    // Saved config (xiNET layout + filter settings) - xi2 datasets (uuid param) or when enabled via options
    const configSaving = options.configSaving ?? new URLSearchParams(window.location.search).has("uuid");
    let savedConfig = null;
    const configPromise = configSaving ? fetchSavedConfig(apiBase).then(config => {
        savedConfig = config;
    }) : Promise.resolve();

    // Add the blosum and config promises to the tasks array
    const allTasks = [...tasks, blosumPromise, configPromise];

    // Process all requests in parallel (including blosum loading)
    Promise.all(allTasks)
        .then(showBuildingViews)
        // eslint-disable-next-line no-unused-vars
        .then((results) => {
            console.log("API data and blosum backbone-models are ready.");
            const compositeModelInst = models({}, clmsModel);
            compositeModelInst.set("blosumColl", blosumCollInst);
            compositeModelInst.set("apiBase", apiBase);
            compositeModelInst.set("annotatorURL", annotatorURL);
            compositeModelInst.set("configSaving", configSaving);
            compositeModelInst.set("savedConfig", savedConfig);
            const split = initPageSplitter();
            views(compositeModelInst, split);
            postDataLoaded(compositeModelInst); // todo -this could be tidied up?, call postDatalOaded from end of views
            networkPageSpinner.stop();
            hideDataLoadStatus();
        })
        .catch((error) => {
            showMessage(error.stack || error.message || error, "error");
            console.error(error);
            networkPageSpinner.stop();
            hideDataLoadStatus();
        });
}

/**
 * Validation page initialization function for spectrum validation interface.
 * Loads essential data and initializes a minimal view set focused on spectrum validation.
 * Unlike main(), this does not load BLOSUM matrices or full visualization components.
 * @param {string} apiBase - Base URL for API endpoints
 * @param {string} annotatorURL - URL for the annotation service
 * @returns {void}
 */
export function validationPage(apiBase, annotatorURL) {
    const spinTarget = d3.select("#main").node();
    networkPageSpinner.spin(spinTarget);
    showDataLoadStatus(spinTarget);
    setWindowTitle();
    const clmsModel = new SearchResultsModel();
    clmsModel.setSearchGroupLabels(parseUuidGroupLabels(window.location.search));
    const tasks = getTasks(apiBase, clmsModel);
    Promise.all(tasks)
        .then(showBuildingViews)
        // eslint-disable-next-line no-unused-vars
        .then((results) => {
            console.log("API data ready.");
            const compositeModelInst = modelsEssential({}, clmsModel);
            compositeModelInst.set("apiBase", apiBase);
            compositeModelInst.set("annotatorURL", annotatorURL);
            const split = initPageSplitter();
            viewsEssential(compositeModelInst, {"specWrapperDiv": "#topDiv", spectrumToTop: false, split});
            vent.trigger("spectrumShow", true);
            const allMatches = compositeModelInst.get("clmsModel").getMatches();
            compositeModelInst.setMarkedMatches("selection", allMatches);
            networkPageSpinner.stop();
            hideDataLoadStatus();
            const targetProteinCount = clmsModel.getTargetProteinCount();
            if (targetProteinCount > 2000) {
                showMessage("More than 2000 proteins (" + targetProteinCount + ") — network view not available.", "info");
            }
        })
        .catch((error) => {
            showMessage(error.stack || error.message || error, "error");
            console.error(error);
            networkPageSpinner.stop();
            hideDataLoadStatus();
        });
}

/**
 * What's loading, shown under the page spinner: label -> true once loaded. See showDataLoadStatus.
 * @type {Map<string, boolean>}
 * @private
 */
const loadStages = new Map();

/**
 * Shows a line under the page spinner saying what's still loading (see trackLoad), until hideDataLoadStatus.
 * @param {Element} target - Element the spinner is in
 * @private
 */
function showDataLoadStatus(target) {
    loadStages.clear();
    d3.select(target).append("div")
        .attr("class", "data-load-status")
        .style({
            position: "absolute", top: "62%", left: "10%", right: "10%",
            "text-align": "center", "font-size": "1.2em", "pointer-events": "none"
        });
}

/**
 * Sets the text under the page spinner: the given message, or else the load stages and whether they're done.
 * @param {string} [message]
 * @private
 */
function updateDataLoadStatus(message) {
    const text = message || "Loading " + Array.from(loadStages,
        ([label, done]) => label + (done ? " \u2713" : "\u2026")).join(" \u00b7 ");
    d3.selectAll(".data-load-status").text(text);
}

/**
 * Removes the line shown by showDataLoadStatus.
 * @private
 */
function hideDataLoadStatus() {
    d3.selectAll(".data-load-status").remove();
}

/**
 * Says "Building views..." under the page spinner, and gives the browser a moment to show it before the
 * (synchronous, on big datasets long) view setup that follows.
 * @param {*} results - Passed through
 * @returns {Promise} Resolves to results
 * @private
 */
function showBuildingViews(results) {
    updateDataLoadStatus("Building views\u2026");
    return new Promise(resolve => setTimeout(() => resolve(results), 20));
}

/**
 * Lists a load stage under the page spinner and ticks it off when the promise resolves.
 * Several promises can share a label; it's ticked off when all of them have resolved.
 * @param {string} label - e.g. "matches"
 * @param {Promise} promise
 * @returns {Promise} The promise
 * @private
 */
function trackLoad(label, promise) {
    const pending = (trackLoad.pending[label] || 0) + 1;
    trackLoad.pending[label] = pending;
    loadStages.set(label, false);
    updateDataLoadStatus();
    return promise.then((result) => {
        trackLoad.pending[label] -= 1;
        if (trackLoad.pending[label] === 0) {
            loadStages.set(label, true);
            updateDataLoadStatus();
        }
        return result;
    });
}
trackLoad.pending = {};

/**
 * Creates an array of data fetching tasks for all required API endpoints.
 * Each task fetches data from an API endpoint and processes it into the CLMS backbone-models.
 * @param {string} apiBase - Base URL for API endpoints
 * @param {SearchResultsModel} clmsModel - The search results backbone-models to populate with data
 * @returns {Promise[]} Array of promises for parallel data fetching
 * @private
 */
function getTasks(apiBase, clmsModel) {
    const mzIdentMLUrl = `${apiBase}get_xiview_mzidentml_files${window.location.search}`;
    const analysisCollection_spectrum_identificationsUrl
        = `${apiBase}get_xiview_analysis_collection_spectrum_identifications${window.location.search}`;
    const spectrumIdentificationProtocolUrl
        = `${apiBase}get_xiview_spectrum_identification_protocols${window.location.search}`;
    const spectraDataUrl = `${apiBase}get_xiview_spectra_data${window.location.search}`;
    const enzymesUrl = `${apiBase}get_xiview_enzymes${window.location.search}`;
    const searchModificationsUrl = `${apiBase}get_xiview_search_modifications${window.location.search}`;
    const matchesUrl = `${apiBase}get_xiview_matches${window.location.search}`;
    const peptidesUrl = `${apiBase}get_xiview_peptides${window.location.search}`;
    const proteinUrl = `${apiBase}get_xiview_proteins${window.location.search}`;

    trackLoad.pending = {};
    const metadata = (url, process) => trackLoad("search metadata", fetchDataAndProcess(url, process));
    return [
        metadata(mzIdentMLUrl, (data) => clmsModel.storeMzIdentMLFiles(data)),
        metadata(analysisCollection_spectrum_identificationsUrl, (data) => clmsModel.storeAnalysisCollectionSpectrumIdentifications(data)),
        metadata(spectrumIdentificationProtocolUrl, (data) => clmsModel.storeSpectrumIdentificationProtocols(data)),
        metadata(spectraDataUrl, (data) => clmsModel.storeSpectraData(data)),
        metadata(enzymesUrl, (data) => clmsModel.storeEnzymes(data)),
        metadata(searchModificationsUrl, (data) => clmsModel.storeSearchModifications(data)),
        trackLoad("proteins", fetchDataAndProcess(proteinUrl, (data) => clmsModel.storeProteins(data))),
        trackLoad("peptides", fetchDataAndProcess(peptidesUrl, (data) => clmsModel.storePeptides(data))),
        trackLoad("matches", fetchDataAndProcess(matchesUrl, (data) => clmsModel.storeMatches(data))),
    ];
}

/**
 * Sets the browser window title based on current URL search parameters.
 * @returns {void}
 * @private
 */
function setWindowTitle() {
    const params = new URLSearchParams(window.location.search);
    const project = params.get("project");
    const file = params.get("file");
    document.title = file ? `${project}; ${file}` : project;
}

/**
 * Initializes the page splitter that divides the main view from the selection table.
 * Creates a vertical split with 80% for main content and 20% for selection table.
 * @returns {object} The Split.js instance
 * @private
 */
function initPageSplitter() {
    const split = Split(["#topDiv", "#bottomDiv"],
        {
            direction: "vertical", sizes: [80, 20], minSize: [200, 0],
            onDragEnd: function () {
                split.oldProportions = split.getSizes();
            },
            gutterStyle: function () {
                return {/*"margin": "0 10px",*/ "height": "10px"};
            }
        },
    );
    d3.select(".gutter").attr("title", "Drag to change space available to selection table");
    return split;
}

/**
 * UniProt return fields: the parts of an entry xiVIEW reads (sequence, keywords, subcellular location,
 * GO and Complex Portal cross-references, all feature types), plus names for the protein info panel.
 * About a third of the size of a full entry, most of which is references and other databases' cross-references.
 * @type {string}
 * @private
 */
const UNIPROT_FIELDS = [
    "accession", "id", "protein_name", "gene_names", "organism_name", "sequence", "keyword",
    "cc_subcellular_location", "go", "xref_complexportal",
    // feature types
    "ft_var_seq", "ft_variant", "ft_non_cons", "ft_non_std", "ft_non_ter", "ft_conflict", "ft_unsure",
    "ft_act_site", "ft_binding", "ft_dna_bind", "ft_site", "ft_mutagen", "ft_intramem", "ft_topo_dom",
    "ft_transmem", "ft_chain", "ft_crosslnk", "ft_disulfid", "ft_carbohyd", "ft_init_met", "ft_lipid",
    "ft_mod_res", "ft_peptide", "ft_propep", "ft_signal", "ft_transit", "ft_strand", "ft_helix", "ft_turn",
    "ft_coiled", "ft_compbias", "ft_domain", "ft_motif", "ft_region", "ft_repeat", "ft_zn_fing",
].join(",");

/**
 * A whole UniProtKB accession, e.g. P04637 or A0A096LP01 (not isoforms like P04637-2).
 * @type {RegExp}
 * @private
 */
const WHOLE_UNIPROT_ACCESSION = /^(?:[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})$/i;

/**
 * The UniProtKB accession to query for a protein accession: the accession itself if that's all it is, or the middle
 * part of a FASTA-style "sp|P04637|P53_HUMAN". Anything else (e.g. "DECOY_P04637", "P04637.1") gives null, because
 * UniProt rejects the whole batch query (400) if any accession in it is malformed.
 * @param {string} accession
 * @returns {string|null} Upper case accession, or null
 */
export function toUniprotQueryAccession(accession) {
    if (typeof accession !== "string") {
        return null;
    }
    const trimmed = accession.trim();
    if (WHOLE_UNIPROT_ACCESSION.test(trimmed)) {
        return trimmed.toUpperCase();
    }
    const parts = trimmed.split("|");
    if (parts.length === 3 && WHOLE_UNIPROT_ACCESSION.test(parts[1])) {
        return parts[1].toUpperCase();
    }
    return null;
}

/**
 * Most ids UniProt's ID mapping service takes in one job.
 * @type {number}
 * @private
 */
const UNIPROT_IDMAPPING_MAX_IDS = 100000;

/**
 * How long to wait for an ID mapping job to finish before giving up (it usually takes a second or two).
 * @type {number}
 * @private
 */
const UNIPROT_IDMAPPING_MAX_WAIT_MS = 5 * 60 * 1000;

/**
 * Fetches UniProt entries for accessions with UniProt's ID mapping service: submits a job for all of them, waits for
 * it to finish, then downloads the results in pages of 500 (UNIPROT_FIELDS only). That's a handful of requests
 * rather than one per 50 accessions, which UniProt's rate limit cut off. Accessions are matched under whatever
 * accession they were given as (primary or secondary).
 * If a results page still fails after retries, the entries from earlier pages are kept and the rest are missing.
 * @param {string[]} accessions - UniProt accessions (valid, see toUniprotQueryAccession)
 * @param {function(number, number)} onProgress - Called with (entries so far, accessions) while the job runs and
 *     after each page
 * @returns {Promise<{results: {from: string, to: Object}[], failedIds: string[], complete: boolean}>}
 * @throws {Error} If a job can't be submitted or fails, or no results page arrives
 * @private
 */
async function fetchUniprotByIdMapping(accessions, onProgress) {
    const base = "https://rest.uniprot.org/idmapping";
    const label = "UniProt ID mapping";
    const results = [];
    const failedIds = [];
    let complete = true;
    const progress = () => onProgress(Math.min(results.length, accessions.length), accessions.length);

    for (let i = 0; i < accessions.length; i += UNIPROT_IDMAPPING_MAX_IDS) {
        const ids = accessions.slice(i, i + UNIPROT_IDMAPPING_MAX_IDS);

        // submit
        const form = new FormData();
        form.append("from", "UniProtKB_AC-ID");
        form.append("to", "UniProtKB");
        form.append("ids", ids.join(","));
        const submitted = await (await fetchWithBackoff(base + "/run", {method: "POST", body: form}, label,
            {onWait: progress})).json();
        const jobId = submitted.jobId;
        if (!jobId) {
            throw new Error(`${label}: no job id (${JSON.stringify(submitted.messages || submitted)})`);
        }

        // wait for the job (usually a second or two)
        const giveUpAt = Date.now() + UNIPROT_IDMAPPING_MAX_WAIT_MS;
        for (;;) {
            const status = await (await fetchWithBackoff(`${base}/status/${jobId}`, undefined, label,
                {onWait: progress})).json();
            if (status.jobStatus === "FINISHED" || status.results || status.failedIds) {
                break;
            }
            if (status.jobStatus !== "NEW" && status.jobStatus !== "RUNNING") {
                throw new Error(`${label} job ${jobId}: ${status.jobStatus} ${JSON.stringify(status.messages || "")}`);
            }
            if (Date.now() > giveUpAt) {
                throw new Error(`${label} job ${jobId} not finished after ${UNIPROT_IDMAPPING_MAX_WAIT_MS / 1000} s`);
            }
            progress(); // still going, so listeners waiting on progress don't time out
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // results, a page at a time (the next page's url is in the Link header)
        let url = `${base}/uniprotkb/results/${jobId}?format=json&size=500&fields=${encodeURIComponent(UNIPROT_FIELDS)}`;
        let pages = 0;
        while (url) {
            let response;
            try {
                response = await fetchWithBackoff(url, undefined, label, {onWait: progress});
            } catch (error) {
                if (!pages && !results.length) {
                    throw error;
                }
                console.error(`${label}: results page failed, continuing with what arrived:`, error);
                complete = false;
                break;
            }
            const page = await response.json();
            results.push(...(page.results || []));
            if (Array.isArray(page.failedIds)) {
                failedIds.push(...page.failedIds);
            }
            pages++;
            progress();
            const next = /<([^>]+)>;\s*rel="next"/.exec(response.headers.get("Link") || "");
            url = next ? next[1] : null;
        }
        if (!complete) {
            break;
        }
    }
    return {results, failedIds, complete};
}

/**
 * Fetches UniProt KB data for the proteins in clmsModel and assigns each
 * returned entry to its matching Protein.uniprot. Fires vent.trigger("uniprotLoaded")
 * on success (even if some results are missing - those proteins keep uniprot=null);
 * vent.trigger("uniprotProgress", done, total) while waiting and after each page. Soft-fails: errors are logged,
 * proteins keep uniprot=null and vent.trigger("uniprotFailed", error) is fired.
 * The outcome is also recorded as clmsModel.uniprotStatus ("loaded" or "failed") for late listeners.
 * @param {string[]} accessions - Protein accessions (decoys already filtered out)
 * @param {SearchResultsModel} clmsModel - The CLMS results model whose Protein objects to populate
 * @returns {Promise<void>}
 */
export async function fetchUniprotKB(accessions, clmsModel) {
    try {
        const queryAccessions = Array.from(new Set(accessions.map(toUniprotQueryAccession).filter(acc => acc)));
        if (queryAccessions.length < accessions.length) {
            console.log(`UniProt: ${accessions.length - queryAccessions.length} accessions not queried (duplicates, ` +
                "or not a plain UniProt accession)");
        }
        if (!queryAccessions.length) {
            throw new Error("no valid UniProt accessions");
        }
        const onProgress = (done, total) => vent.trigger("uniprotProgress", done, total);
        const {results, failedIds, complete} = await fetchUniprotByIdMapping(queryAccessions, onProgress);

        // keyed by the accession we asked for, which may be a secondary accession of the entry
        const lookup = new Map();
        for (const result of results) {
            lookup.set(result.from, result.to);
        }

        let assigned = 0;
        for (const protein of clmsModel.getProteinsIterator()) {
            const entry = lookup.get(toUniprotQueryAccession(protein.accession));
            if (entry) {
                if (Array.isArray(entry.features)) {
                    for (const feature of entry.features) {
                        feature.category = "uniprot";
                        // v2 API nests positions; flatten to the begin/end/start the renderers expect
                        if (feature.location) {
                            feature.begin = feature.location.start?.value;
                            feature.start = feature.begin;
                            feature.end = feature.location.end?.value;
                        }
                    }
                }
                protein.uniprot = entry;
                assigned++;
            }
        }
        console.log(`UniProt: assigned data to ${assigned} of ${accessions.length} requested proteins` +
            (failedIds.length ? `; UniProt doesn't know ${failedIds.length}` : "") +
            (complete ? "" : "; some results pages failed"));

        clmsModel.uniprotStatus = "loaded";
    } catch (error) {
        console.error("UniProt fetch failed, continuing without annotations:", error);
        clmsModel.uniprotStatus = "failed";
        vent.trigger("uniprotFailed", error);
        return;
    }
    // outside the try so an error in a listener isn't reported as a failed fetch
    vent.trigger("uniprotLoaded");
}

export const _test = process.env.NODE_ENV !== "production" ? {
    test: async () => {
        const { testSetupNew } = await import("../tests/tests");
        return testSetupNew();
    },
    test2: async () => {
        const { testSetup2 } = await import("../tests/tests2");
        return testSetup2();
    },
    testClmsModel: async () => {
        const { testSetup } = await import("../tests/clms-model-tests");
        // eslint-disable-next-line no-undef
        QUnit.config.notrycatch = true;
        return testSetup();
    },
    testAnnotationRequest: async () => {
        const { testSetup } = await import("../tests/annotation-request-tests");
        return testSetup();
    }
} : undefined;

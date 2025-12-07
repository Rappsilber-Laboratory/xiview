/**
 * @fileoverview Main application entry point for xiVIEW.
 * Handles CSS imports, initialization, data loading, and application bootstrapping.
 * This is the entry point specified in webpack configuration.
 */

import "../css/reset.css";
import "../css/common.css";
import "../vendor/byrei-dyndiv_0.5.css";
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
import {displayError} from "./utils";
import Split from "split.js";
import {SearchResultsModel} from "../../CLMS-model/js/models/search-results-model";
import {BlosumCollection} from "./model/models";

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
// eslint-disable-next-line no-unused-vars
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
 * Main application initialization function for the full xiVIEW interface.
 * Loads all necessary data (API endpoints, BLOSUM matrices), initializes models and views,
 * and sets up the complete application UI.
 * @param {string} apiBase - Base URL for API endpoints
 * @param {string} annotatorURL - URL for the annotation service
 * @returns {void}
 */
export function main(apiBase, annotatorURL) {
    const spinTarget = d3.select("#main").node();
    networkPageSpinner.spin(spinTarget);

    const clmsModel = new SearchResultsModel();
    const tasks = getTasks(apiBase, clmsModel);
    // Create a promise that resolves when blosum data is loaded
    // eslint-disable-next-line no-unused-vars
    const blosumPromise = new Promise((resolve, reject) => {
        // Collection of blosum matrices that will be fetched from a json file
        window.blosumCollInst = new BlosumCollection(); // options if we want to override defaults
        // when the blosum Collection is fetched (an async process), we select one of its models as being selected
        window.blosumCollInst.listenToOnce(window.blosumCollInst, "sync", function () {
            resolve(); // Resolve the promise when blosum data is ready
        });
        // Start the asynchronous blosum fetching after the above events have been set up
        window.blosumCollInst.fetch();
    });

    // Add the blosum promise to the tasks array
    const allTasks = [...tasks, blosumPromise];

    // Process all requests in parallel (including blosum loading)
    Promise.all(allTasks)
        // eslint-disable-next-line no-unused-vars
        .then((results) => {
            console.log("API data and blosum model are ready.");
            const compositeModelInst = models({}, clmsModel);
            compositeModelInst.set("apiBase", apiBase);
            compositeModelInst.set("annotatorURL", annotatorURL);
            setWindowTitle(clmsModel);
            initPageSplitter();
            views(compositeModelInst);
            postDataLoaded(compositeModelInst); // todo -this could be tidied up?, call postDatalOaded from end of views
            networkPageSpinner.stop();
        })
        .catch((error) => {
            displayError(function () {
                return true;
            }, (error.stack || (error.message || error)));
            console.error(error);
            networkPageSpinner.stop();
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

    const clmsModel = new SearchResultsModel();
    const tasks = getTasks(apiBase, clmsModel);
    Promise.all(tasks)
        // eslint-disable-next-line no-unused-vars
        .then((results) => {
            console.log("API data ready.");
            const compositeModelInst = modelsEssential({}, clmsModel);
            compositeModelInst.set("apiBase", apiBase);
            compositeModelInst.set("annotatorURL", annotatorURL);
            setWindowTitle(clmsModel);
            initPageSplitter();
            viewsEssential(compositeModelInst, {"specWrapperDiv": "#topDiv", spectrumToTop: false});
            window.vent.trigger("spectrumShow", true);
            const allMatches = window.compositeModelInst.get("clmsModel").getMatches();
            compositeModelInst.setMarkedMatches("selection", allMatches);
            networkPageSpinner.stop();
        })
        .catch((error) => {
            displayError(function () {
                return true;
            }, (error.stack || (error.message || error)));
            console.error(error);
            networkPageSpinner.stop();
        });
}

/**
 * Creates an array of data fetching tasks for all required API endpoints.
 * Each task fetches data from an API endpoint and processes it into the CLMS model.
 * @param {string} apiBase - Base URL for API endpoints
 * @param {SearchResultsModel} clmsModel - The search results model to populate with data
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

    return [
        fetchDataAndProcess(mzIdentMLUrl, (data) => clmsModel.storeMzIdentMLFiles(data)),
        fetchDataAndProcess(analysisCollection_spectrum_identificationsUrl, (data) => clmsModel.storeAnalysisCollectionSpectrumIdentifications(data)),
        fetchDataAndProcess(spectrumIdentificationProtocolUrl, (data) => clmsModel.storeSpectrumIdentificationProtocols(data)),
        fetchDataAndProcess(spectraDataUrl, (data) => clmsModel.storeSpectraData(data)),
        fetchDataAndProcess(enzymesUrl, (data) => clmsModel.storeEnzymes(data)),
        fetchDataAndProcess(searchModificationsUrl, (data) => clmsModel.storeSearchModifications(data)),
        fetchDataAndProcess(proteinUrl, (data) => clmsModel.storeProteins(data)), // .then(() => {fetchUniprotKB(accessions);}),
        fetchDataAndProcess(peptidesUrl, (data) => clmsModel.storePeptides(data)),
        fetchDataAndProcess(matchesUrl, (data) => clmsModel.storeMatches(data)),
    ];
}

/**
 * Sets the browser window title based on current URL search parameters.
 * @returns {void}
 * @private
 */
function setWindowTitle() {
    document.title = window.location.search;//fileNames.join(", ");
}

/**
 * Initializes the page splitter that divides the main view from the selection table.
 * Creates a vertical split with 80% for main content and 20% for selection table.
 * @returns {void}
 * @private
 */
function initPageSplitter() {
    window.split = Split(["#topDiv", "#bottomDiv"], //yuk, todo - get rid
        {
            direction: "vertical", sizes: [80, 20], minSize: [200, 0],
            onDragEnd: function () {
                window.oldSplitterProportions = window.split.getSizes();
            },
            gutterStyle: function () {
                return {/*"margin": "0 10px",*/ "height": "10px"};
            }
        },
    );
    d3.select(".gutter").attr("title", "Drag to change space available to selection table");
}

/**
 * Fetches protein data from UniProt in batches to avoid rate limiting.
 * Queries the UniProt REST API for multiple accession IDs in batches.
 * @param {string[]} accessions - Array of UniProt accession IDs to fetch
 * @param {number} [batchSize=5] - Number of accessions to fetch per batch
 * @returns {Promise<Object[]>} Promise that resolves to array of UniProt entry objects
 * @private
 */
async function fetchAccessionsInBatches(accessions, batchSize = 5) {
    const baseURL = "https://rest.uniprot.org/uniprotkb/search";
    let allResults = []; // To store results from all batches

    // Split the accessions into chunks/batches
    for (let i = 0; i < accessions.length; i += batchSize) {
        const batch = accessions.slice(i, i + batchSize);
        const query = `accession:${batch.join(" OR accession:")}`;
        const url = `${baseURL}?query=${encodeURIComponent(query)}&format=json`;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch data for batch: ${batch}`);

            const data = await response.json();
            allResults.push(...data.results); // Collect results from each batch
            console.log(`Fetched batch: ${batch}`);
        } catch (error) {
            console.error("Error fetching batch:", error);
        }

        // Optional: Pause between batches to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 400)); // Wait 1 second
    }

    return allResults;
}

// Example usage with a list of accession IDs
// eslint-disable-next-line no-unused-vars
const accessions = [
    "O35004", "P12345", "Q67890", "A12345", "B67890", "C13579",
    "D24680", "E11223", "F33445", "G55667", "H77889", "I99001"
];

/**
 * Fetches UniProt KB data for a list of protein accessions.
 * Uses batch fetching to retrieve data in groups of 50.
 * @param {string[]} accessions - Array of UniProt accession IDs
 * @returns {void}
 * @private
 */
// eslint-disable-next-line no-unused-vars
function fetchUniprotKB(accessions) {
    fetchAccessionsInBatches(accessions, 50)
        .then(results => {
            console.log("All Fetched Data:", results);
            // Process or use results here
        })
        .catch(error => {
            console.error("Batch Fetch Error:", error);
        });
}

// Conditionally expose test functions only in development builds
if (process.env.NODE_ENV !== "production") {
    window.XIVIEW_TEST = {
        test: async () => {
            const { testSetupNew } = await import("../tests/tests");
            return testSetupNew();
        },
        test2: async () => {
            const { testSetup2 } = await import("../tests/tests2");
            return testSetup2();
        },
        testClmsModel: async () => {
            const { testSetup } = await import("../../CLMS-model/tests/clms-model-tests");
            // eslint-disable-next-line no-undef
            QUnit.config.notrycatch = true;
            return testSetup();
        }
    };
}

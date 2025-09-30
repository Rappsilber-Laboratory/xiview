import * as NGL from "ngl";
import * as d3 from "d3";
import {module, start, test} from "qunit";
import {blosumLoading, models, postDataLoaded, pretendLoad} from "../js/networkFrame";
import {setupColourModels} from "../js/model/color/setup-colors";
import {repopulateNGL} from "../js/views/ngl/RepopulateNGL";
import {NGLExportUtils} from "../js/views/ngl/NGLExportUtils";
import {SearchResultsModel} from "../../CLMS-model/src/search-results-model";

// Helper function to load JSON data using fetch (Promise-based replacement for d3.json)
function loadJsonData2(url) {
    return fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
            }
            return response.json();
        });
}

// Helper function to wrap event listeners in Promises
function waitForEvent2(target, eventName) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`Timeout waiting for event: ${eventName}`));
        }, 30000); // 30 second timeout

        target.listenToOnce(target, eventName, function(...args) {
            clearTimeout(timeoutId);
            resolve(args);
        });
    });
}

// Helper function to load blosum data as a Promise
function loadBlosumData2(url) {
    return new Promise((resolve, reject) => {
        // Initialize blosum loading
        blosumLoading({ url: url });

        // Listen for the sync event that indicates blosum data is loaded
        window.blosumCollInst.listenToOnce(window.blosumCollInst, "sync", function () {
            console.log("ASYNC. blosum models loaded in test2");
            resolve();
        });

        // Handle potential errors
        window.blosumCollInst.listenToOnce(window.blosumCollInst, "error", function (model, response) {
            reject(new Error(`Failed to load blosum data in test2: ${response.status} ${response.statusText}`));
        });
    });
}

// Helper function to initialize models with loaded data
function initializeModels2(options) {
    console.log("Creating SearchResultsModel for test2...");
    const clmsModel = new SearchResultsModel();

    console.log("Processing model data for test2...");
    // clmsModel.processMetadata(options.metadata);
    clmsModel.processMatches(options.matches);
    clmsModel.processPeptides(options.peptides);
    clmsModel.processProteins(options.proteins);

    console.log("Creating composite model for test2...");
    const compositeModelInst = models({}, clmsModel);

    console.log("Calling postDataLoaded for test2...");
    postDataLoaded(compositeModelInst);

    return compositeModelInst;
}

// Helper function to load a single PDB file
async function loadPdbFile(pdbFile, compositeModelInst) {
    console.log(`Loading PDB file: ${pdbFile}...`);

    const response = await fetch(pdbFile);
    const data = await response.text();

    console.log(`Loaded ${pdbFile}`);
    const blob = new Blob([data], { type: "application/text" });

    const pdbSettings = [{
        id: pdbFile,
        uri: blob,
        local: true,
        params: {
            ext: "pdb",
            cAlphaOnly: false,
        }
    }];

    const stage = new NGL.Stage("ngl", { tooltip: false });
    repopulateNGL({
        pdbSettings: pdbSettings,
        stage: stage,
        compositeModel: compositeModelInst
    });

    // Wait for distances object to be updated
    await waitForEvent2(compositeModelInst.get("clmsModel"), "change:distancesObj");
    console.log(`Distances obj changed for ${pdbFile}`);

    return compositeModelInst;
}

export async function testSetup2() {
    try {
        console.log("Starting testSetup2...");

        const pdbFiles = [
            "renum_hard.pdb",
            "simple_gap.pdb",
            "badgap.pdb",
            "flip.pdb",
            "point_mutation.pdb",
            "renum.pdb",
            // "simple_gap_weirdchains.pdb" // uncomment this if needed
        ];

        // Load JSON and blosum data concurrently
        console.log("Loading JSON and blosum data for test2...");
        const [jsonData] = await Promise.all([
            loadJsonData2("15884.json"),
            loadBlosumData2("../R/blosums.json")
        ]);

        console.log("Data loaded successfully for test2, JSON data:", jsonData);

        // Set up event listener BEFORE initializing models
        console.log("Setting up initialSetupDone event listener for test2...");
        const initialSetupPromise = waitForEvent2(window.vent, "initialSetupDone");

        // Initialize models (this will trigger the initialSetupDone event)
        console.log("Initializing models for test2...");
        const compositeModelInst = initializeModels2(jsonData);

        // Wait for initial setup completion
        console.log("Waiting for initialSetupDone event in test2...");
        await initialSetupPromise;

        // Setup color models
        console.log("Setting up color models for test2...");
        setupColourModels();

        // Process the first PDB file only (to match original behavior)
        console.log("Processing first PDB file...");
        const firstPdbFile = pdbFiles[0];
        console.log(`Processing PDB file: ${firstPdbFile}`);

        await loadPdbFile(firstPdbFile, compositeModelInst);

        // Run tests for this PDB file
        console.log(`Running tests for ${firstPdbFile}...`);
        testCallback2(compositeModelInst);

        console.log("PDB file processing completed.");

    } catch (error) {
        console.error("Test setup 2 failed:", error);
        throw error;
    }
}

export function testCallback2(model) {
    start();
    // qunit.config.notrycatch = true;
    const clmsModel = model.get("clmsModel");
    console.log("HERE");
    module("Parsing2");
    test("JSON to Model Parsing", function (assert) {
        const done = assert.async(); // This replaces `start()` and handles async completion
        const expectedLinks = 904;
        const expectedMatches = 1667;
        assert.deepEqual(clmsModel.get("crosslinks").size, expectedLinks, "Expected " + JSON.stringify(expectedLinks) + " crosslinks, Passed!");
        assert.deepEqual(clmsModel.get("matches").length, expectedMatches, "Expected " + JSON.stringify(expectedMatches) + " matches, Passed!");
        done();
    });
    // stop();

    module("3D Alignment and distance calculations");
    test("3D aliignment and distance calculations", function (assert) {
        const expected = 520;
        const stageModel = model.get("stageModel"); //(AKA nglWrapperModel?)
        let actual;
        //test by comparing distanceObj
        // let actual = stageModel.get("distancesObj").length;
        // assert.deepEqual(actual, expected, "Expected " + JSON.stringify(expected) + " distances, Passed!");


        //test by getting the CSV export
        // const linkExportArray = NGLExportUtils.export3dLinksCSV(stageModel.get("structureComp").structure, stageModel, "name", false);

        const crosslinks = stageModel.getFullLinks();
        const linkExportArray = NGLExportUtils.make3dLinkSyntax(stageModel.get("structureComp").structure, crosslinks, stageModel, false);
        console.log(linkExportArray);
        actual = linkExportArray.length;
        assert.deepEqual(actual, expected, "Expected " + JSON.stringify(expected) + " distances, Passed!");

    });
// done();}
}

/*
function testSetup (cbfunc) {
    d3.json ("10003.json", function (options) {
        CLMSUI.init.modelsEssential (options);
        cbfunc (CLMSUI.compositeModelInst);
    });
}
*/

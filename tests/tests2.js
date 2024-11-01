import * as NGL from "ngl";
import * as d3 from "d3";
import {module, start, test} from "qunit";
import {blosumLoading, models, postDataLoaded, pretendLoad} from "../js/networkFrame";
import {setupColourModels} from "../js/model/color/setup-colors";
import {repopulateNGL} from "../js/views/ngl/RepopulateNGL";
import {NGLExportUtils} from "../js/views/ngl/NGLExportUtils";
import {SearchResultsModel} from "../../CLMS-model/src/search-results-model";

export function testSetup2() {
    // qunit.config.autostart = true;
    // start();
    const pdbFiles = [
        "renum_hard.pdb",
        "simple_gap.pdb",
        "badgap.pdb",
        "flip.pdb",
        "point_mutation.pdb",
        "renum.pdb",

        // "simple_gap_weirdchains.pdb" // uncomment this if needed
    ];
    let currentFileIndex = 0;

    function loadNextPdbFile() {
        if (currentFileIndex >= pdbFiles.length) {
            console.log("All PDB files have been processed.");
            return;
        }

        const pdbFile = pdbFiles[currentFileIndex];
        fetch(pdbFile)
            .then(response => response.text())
            .then(data => {
                console.log(`*loaded ${pdbFile}`);
                const blob = new Blob([data], {
                    type: "application/text"
                });
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
                    compositeModel: window.compositeModelInst
                });

                // Set up listener for `change:distancesObj` event after each file load
                window.compositeModelInst.get("clmsModel").listenToOnce(
                    window.compositeModelInst.get("clmsModel"),
                    "change:distancesObj",
                    function () {
                        console.log("*distances obj changed");
                        testCallback2(window.compositeModelInst);

                        // Load next pdb file after testCallback2 completes
                        currentFileIndex++;
                        //loadNextPdbFile();
                    }
                );
            })
            .catch(error => console.error(error));
    }

    d3.json("15884.json", function (options) {
        console.log("*loaded 15584.json");
        window.vent.listenToOnce(window.vent, "initialSetupDone", function () {
            console.log("*initialSetupDone");
            setupColourModels();

            // Start loading the first pdb file
            // start();
            loadNextPdbFile();
        });

        // Initialization calls remain the same
        blosumLoading({ url: "../R/blosums.json" });
        const clmsModel = new SearchResultsModel();
        clmsModel.processMetadata(options.metadata);
        clmsModel.processMatches(options.matches);
        clmsModel.processPeptides(options.peptides);
        clmsModel.processProteins(options.proteins);

        models("PRIDE", {}, clmsModel);
        // Start QUnit if using autostart: false
        // start();
        postDataLoaded();

    });
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

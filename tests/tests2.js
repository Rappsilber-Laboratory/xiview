import * as NGL from "ngl";
import * as d3 from "d3";
import {module, start, test} from "qunit";
import {blosumLoading, models, postDataLoaded, pretendLoad} from "../js/networkFrame";
import {setupColourModels} from "../js/backbone-models/color/setup-colors";
import {repopulateNGL} from "../js/views/ngl/RepopulateNGL";
import {NGLExportUtils} from "../js/views/ngl/NGLExportUtils";
import {SearchResultsModel} from "../js/clms-model/search-results-model";
import vent from "../js/vent";

// Enable full stack traces in console for test failures
QUnit.config.notrycatch = true;

export function testSetup2() {
    const pdbFiles = [
        "renum_hard.pdb",
        "simple_gap.pdb",
        "badgap.pdb",
        "flip.pdb",
        "point_mutation.pdb",
        "renum.pdb",

        // "simple_gap_weirdchains.pdb" // uncomment this if needed
    ];

    // Start QUnit
    start();

    // Create an independent test module for each PDB file
    pdbFiles.forEach((pdbFile) => {
        module(`3D Alignment - ${pdbFile}`);

        test("distance calculations", function(assert) {
            const done = assert.async();

            // Load JSON data independently for this test
            d3.json("15884.json", function (options) {
                console.log(`*loaded 15884.json for ${pdbFile}`);

                // Create fresh backbone-models instance for this test
                const blosumCollInst = blosumLoading({ url: "../R/blosums.json" });
                const clmsModel = new SearchResultsModel();
                clmsModel.storeMzIdentMLFiles(options.mzidentmlFiles);
                clmsModel.storeAnalysisCollectionSpectrumIdentifications([]);//hack
                clmsModel.storeSpectrumIdentificationProtocols([]);//hack
                clmsModel.storeMatches(options.matches);
                clmsModel.storePeptides(options.peptides);
                clmsModel.storeProteins(options.proteins);
                clmsModel.storeEnzymes([]);
                clmsModel.storeSearchModifications([]);
                clmsModel.storeSpectraData([]);

                const compositeModelInst = models({}, clmsModel);
                compositeModelInst.set("blosumColl", blosumCollInst);

                // Wait for initialization
                vent.listenToOnce(vent, "initialSetupDone", function () {
                    console.log(`*initialSetupDone for ${pdbFile}`);
                    setupColourModels(compositeModelInst);

                    // Load PDB file
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
                                compositeModel: compositeModelInst
                            });

                            // Wait for distance calculations
                            compositeModelInst.listenToOnce(
                                compositeModelInst,
                                "change:distancesObj",
                                function () {
                                    console.log(`*distances obj changed for ${pdbFile}`);

                                    // Validate expectations (same for all PDB files)
                                    const expectedLinks = 904;
                                    const expectedMatches = 1667;
                                    assert.deepEqual(clmsModel.getCrosslinks().size, expectedLinks,
                                        "Expected " + JSON.stringify(expectedLinks) + " crosslinks, Passed!");
                                    assert.deepEqual(clmsModel.getMatches().length, expectedMatches,
                                        "Expected " + JSON.stringify(expectedMatches) + " matches, Passed!");

                                    // Validate distance calculations
                                    const expected = 520;
                                    const stageModel = compositeModelInst.get("stageModel");
                                    const crosslinks = stageModel.getFullLinks();
                                    const linkExportArray = NGLExportUtils.make3dLinkSyntax(
                                        stageModel.get("structureComp").structure,
                                        crosslinks,
                                        stageModel,
                                        false
                                    );
                                    console.log(linkExportArray);
                                    const actual = linkExportArray.length;
                                    assert.deepEqual(actual, expected,
                                        "Expected " + JSON.stringify(expected) + " distances, Passed!");

                                    done();
                                }
                            );
                        })
                        .catch(error => {
                            console.error(error);
                            assert.ok(false, `Failed to load ${pdbFile}: ${error}`);
                            done();
                        });
                });

                postDataLoaded(compositeModelInst);
            });
        });
    });
}

export function testCallback2(model) {
    // This function is no longer used - tests are now independent
    // Keeping for backwards compatibility in case it's called elsewhere
    console.warn("testCallback2 is deprecated - tests are now independent");
}

// COMMENTED OUT: JSON parsing test (Parsing2 module)
// This test was redundant as it ran 6 times with identical expectations
/*
export function testCallback2(backbone-models) {
    start();
    const clmsModel = backbone-models.get("clmsModel");
    console.log("HERE");
    module("Parsing2");
    test("JSON to Model Parsing", function (assert) {
        const done = assert.async();
        const expectedLinks = 904;
        const expectedMatches = 1667;
        assert.deepEqual(clmsModel.getCrosslinks().size, expectedLinks, "Expected " + JSON.stringify(expectedLinks) + " crosslinks, Passed!");
        assert.deepEqual(clmsModel.getMatches().length, expectedMatches, "Expected " + JSON.stringify(expectedMatches) + " matches, Passed!");
        done();
    });
}
*/

/*
function testSetup (cbfunc) {
    d3.json ("10003.json", function (options) {
        CLMSUI.init.modelsEssential (options);
        cbfunc (CLMSUI.compositeModelInst);
    });
}
*/

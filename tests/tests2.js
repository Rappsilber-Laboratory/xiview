import * as NGL from "../vendor/ngl.dev";
import * as d3 from "d3";
import qunit, {start, module, test} from "qunit";
import {blosumLoading, models, pretendLoad} from "../js/networkFrame";
import {setupColourModels} from "../js/model/color/setup-colors";
import {repopulateNGL} from "../js/views/ngl/RepopulateNGL";
import {NGLExportUtils} from "../js/views/ngl/NGLExportUtils";

export function testSetup2() {
    // *callback hell
    d3.json("15884.json", function (options) {
        console.log("*loaded 15584.json")
        window.vent.listenToOnce(window.vent, "initialSetupDone", function () {
            console.log("*initialSetupDone");
            setupColourModels();

            window.compositeModelInst.get("clmsModel").listenToOnce(window.compositeModelInst.get("clmsModel"), "change:distancesObj", function () {
                console.log("*distances obj changed");
                testCallback2(window.compositeModelInst);
                // then next pdb file?
            });

            const stage = new NGL.Stage("ngl", {tooltip: false});

            fetch("simple_gap.pdb")
            // fetch("badgap.pdb")
            // fetch("flip.pdb")
            // fetch("point_mutation.pdb")
            // fetch("renum.pdb")
            // fetch("renum_hard.pdb")
            // fetch("simple_gap_weirdchains.pdb") // fails
                .then(response => response.text())
                .then(data => {
                    console.log("*loaded simple_gap.pdb");
                    const blob = new Blob([data], {
                        type: "application/text"
                    });
                    const pdbSettings = [];
                    pdbSettings.push({
                        id: "simple_gap",
                        uri: blob,
                        local: true,
                        params: {
                            ext: "pdb",
                            cAlphaOnly: false,
                        }
                    });
                    repopulateNGL({
                        pdbSettings: pdbSettings,
                        stage: stage,
                        compositeModel: window.compositeModelInst
                    });
                })
                .catch(error => console.error(error));

            console.log("*here");
        });

        blosumLoading({url: "../R/blosums.json"});
        models("PRIDE", options);
        pretendLoad();	// add 2 to allDataLoaded bar (we aren't loading views or GO terms here)
    });
}


function testParsing(clmsModel) {
    module("Parsing2");
    test("JSON to Model Parsing", function (assert) {
        const expectedLinks = 904;
        const expectedMatches = 1667;
        assert.deepEqual(clmsModel.get("crosslinks").size, expectedLinks, "Expected " + JSON.stringify(expectedLinks) + " crosslinks, Passed!");
        assert.deepEqual(clmsModel.get("matches").length, expectedMatches, "Expected " + JSON.stringify(expectedMatches) + " matches, Passed!");
    });
}

function testCallback2(model) {
    qunit.config.notrycatch = true;
    const clmsModel = model.get("clmsModel");
    start();
    testParsing(clmsModel);

    module("3D Alignment and distance calculations");
    test("3D aliignment and distance calculations", function (assert) {
        let expected, actual;
        const stageModel = model.get("stageModel"); //(AKA nglWrapperModel?)

        //test by comparing distanceObj
        // actual = stageModel.get("distancesObj");
        // console.log(actual);
        // assert.deepEqual(actual, expected, "Expected " + JSON.stringify(expected) + " distances, Passed!");


        //test by getting the CSV export
        // const linkArray3d = NGLExportUtils.export3dLinksCSV(stageModel.get("structureComp").structure, stageModel, "name", false);
        expected = 520;
        const crosslinks = stageModel.getFullLinks();
        const linkExportArray = NGLExportUtils.make3dLinkSyntax(stageModel.get("structureComp").structure, crosslinks, stageModel, false);
        console.log(linkExportArray);
        actual = linkExportArray.length;
        assert.deepEqual(actual, expected, "Expected " + JSON.stringify(expected) + " distances, Passed!");

    });
}

/*
function testSetup (cbfunc) {
    d3.json ("10003.json", function (options) {
        CLMSUI.init.modelsEssential (options);
        cbfunc (CLMSUI.compositeModelInst);
    });
}
*/

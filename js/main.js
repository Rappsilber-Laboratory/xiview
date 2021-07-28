// import * as $ from 'jquery';
// // export for others scripts to use
// window.$ = $;
// import "jquery-ui";

// require('webpack-jquery-ui');
// require('webpack-jquery-ui/css');  //ommit, if you don't want to load basic css theme

import {ByRei_dynDiv} from "./ui-utils/byrei-dyndiv_1.0rc1-src";
// import {Spinner} from 'spin';
import * as d3 from 'd3';
import {init} from './networkFrame';
import {allDataLoaded} from "./networkFrame";
import {utils} from './utils';
import {loadGOAnnotations} from "./loadGO";
import Split from "split.js";
import {NGLUtils} from "./views/ngl/NGLUtils";
import {testCallback} from "../tests/tests";
import {setupColourModels} from "./model/color/setup-colors";

export function main() {
    const spinner = new Spinner({scale: 5}).spin(d3.select("#main").node());
    // let z;

    const success = function (json) {
        // try {
        if (json.error) {
            throw "Error from server";
        }
        if (json.times) {
            json.times.io = (Date.now() / 1000) - json.times.endAbsolute;
            json.times.overall = json.times.io + (json.times.endAbsolute - json.times.startAbsolute);
        }
        console.log("TIME t2", performance.now(), json.times);
        //console.log (JSON.stringify(json));
        //console.log (json);

        if (json.warn) {
            utils.displayError(function () {
                return true;
            }, "Warning <p class='errorReason'>" + json.warn + "</p>");
        }

        init.models(json);
        const searches = window.compositeModelInst.get("clmsModel").get("searches");
        document.title = Array.from(searches.keys()).join();

        window.split = Split(["#topDiv", "#bottomDiv"], //yuk, todo - get rid
            {
                direction: "vertical", sizes: [80, 20], minSize: [200, 0],
                onDragEnd: function () {
                    window.oldSplitterProportions = window.split.getSizes();
                },
                gutterStyle: function () {
                    return {'margin': '0 10px', 'height': '10px'}
                }
            },
        );
        d3.select(".gutter").attr("title", "Drag to change space available to selection table");

        const returnedTimeStamp = new Date(json.timeStamp * 1000);
        console.log(new Date(), returnedTimeStamp, new Date() - returnedTimeStamp);
        if (Math.abs(new Date() - returnedTimeStamp) > 60 * 5 * 1000) { // if out by 5 minutes...
            utils.displayError(function () {
                return true;
            }, "Returned search results were generated at " + returnedTimeStamp + " and are likely from cache.<p class='errorReason'>If you have revalidated results since, press CTRL + F5 to refresh.</p>");
        }

        init.views();
        allDataLoaded();

        //   } catch (err) {
        //     //console.log ("ERR", err);
        // 	utils.displayError (function() { return true; }, "An error has occurred. \t&#9785;<p class='errorReason'>"
        //         + (json.error? json.error : err.stack)
        //         +"</p>");
        // }
    };


    // z = performance.now();
    // console.log ("TIME t1", performance.now());

    if (window.location.search) {
        // 1. Load spectrum matches, dont send all query string to php (ostensibly to help with caching)
        // var urlChunkMap = modelUtils.parseURLQueryString (window.location.search.slice(1));
        // var phpProps = _.pick (urlChunkMap, "upload", "sid", "auto",  "unval", "linears", "lowestScore", "highestScore", "decoys");
        // var newQueryString = d3.entries(phpProps).map(function (entry) { return entry.key+"="+entry.value; }).join("&");
        // console.log ("ucm", urlChunkMap, newQueryString);
        const url = "../CLMS-model/php/spectrumMatches.php" + window.location.search;

        d3.json(url, function (error, json) {
            spinner.stop(); // stop spinner on request returning

            if (!error) {
                success(json);
            } else {
                utils.displayError(function () {
                    return true;
                }, "An error has occurred. \t&#9785;<p class='errorReason'>"
                    + (error.statusText ? error.statusText : error) + "</p>"
                    + "<a href='" + url + "'>Try loading data only.</a>");
                console.error("Error", error);
            }
        });

    } else {
        spinner.stop(); // stop spinner
        success({times: {}});   // bug fix for empty searches
    }

    // 2. Can load GO file in parallel - saves I/O time on initialising (whichever is shorter, go terms or spectrum matches)
    const goUrl = "./go.obo";
    d3.text(goUrl, function (error, txt) {
        if (error) {
            console.log("error", error, "for", goUrl, arguments);
        } else {
            window.go = loadGOAnnotations(txt);  // temp store until CLMS model is built
            allDataLoaded();
        }
    });

    // 3. Can load BLOSUM matrices in parallel - saves a little bit of initialisation
    init.blosumLoading();
}

export function validationPage() {

    const spinner = new Spinner({scale: 5}).spin(d3.select("#topDiv").node());

    const success = function (text) {
        spinner.stop(); // stop spinner on request returning
        const json = JSON.parse(text);
        init.modelsEssential(json);

        const searches = window.compositeModelInst.get("clmsModel").get("searches");
        document.title = "Validate " + Array.from(searches.keys()).join();
        Split(["#topDiv", "#bottomDiv"], {
            direction: "vertical",
            sizes: [60, 40], minSize: [200, 10],
            onDragEnd: function () {
                vent.trigger("resizeSpectrumSubViews", true);
            }
        });

        // need to make #spectrumSettingsWrapper before we can turn it into a backbone view later. mjg 27/11/17
        d3.select("body").append("div")
            .attr("id", "spectrumSettingsWrapper")
            .attr("class", "dynDiv")
        ;
        init.viewsEssential({"specWrapperDiv": "#topDiv", spectrumToTop: false});

        vent.trigger("spectrumShow", true);

        const allMatches = window.compositeModelInst.get("clmsModel").get("matches");
        window.compositeModelInst.setMarkedMatches("selection", allMatches);

        // ByRei_dynDiv by default fires this on window.load (like this whole block), but that means the SpectrumSettingsView is too late to be picked up
        // so we run it again here, doesn't do any harm
        ByRei_dynDiv.init.main();

        const resize = function (event) {
            vent.trigger("resizeSpectrumSubViews", true);
            const alts = d3.select("#alternatives");
            const w = alts.node().parentNode.parentNode.getBoundingClientRect().width - 20;
            alts.attr("style", "width:" + w + "px;"); //dont know why d3 style() aint working
        };

        window.onresize = resize;

        resize();
    };

    const url = "../CLMS-model/php/spectrumMatches.php" + window.location.search;


    d3.text(url, function (error, text) {
        if (!error) {
            success(text);
        }
    });

}

function testSetupNew(cbfunc) {
    d3.json("10003.json", function (options) {
        window.vent.listenToOnce(window.vent, "initialSetupDone", function () {

            setupColourModels();

            window.compositeModelInst.get("clmsModel").listenToOnce(window.compositeModelInst.get("clmsModel"), "change:distancesObj", function () {
                console.log("distances obj changed");
                cbfunc(window.compositeModelInst);
            });

            const stage = new NGL.Stage("ngl", {tooltip: false});

            //CLMSUI.NGLUtils.repopulateNGL ({pdbCode: "1AO6", stage: stage, compositeModel: CLMSUI.compositeModelInst});

            const pdbCode = "1AO6";

            const pdbSettings = pdbCode.match(utils.commonRegexes.multiPdbSplitter).map(function (code) {
                return {
                    id: code,
                    pdbCode: code,
                    uri: "rcsb://" + code,
                    local: false,
                    params: {calphaOnly: this.cAlphaOnly}
                };
            }, this);

            NGLUtils.repopulateNGL({
                pdbSettings: pdbSettings,
                stage: stage,
                compositeModel: window.compositeModelInst
            });

            console.log("here");
        });

        init.blosumLoading({url: "../R/blosums.json"});
        init.pretendLoad();	// add 2 to allDataLoaded bar (we aren't loading views or GO terms here)
        init.models(options);
    });
}

export function test() {
    testSetupNew(testCallback)
}
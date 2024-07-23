import "../css/reset.css";
import "../css/common.css";
import "../vendor/byrei-dyndiv_0.5.css";
import "../css/style.css";
import "../css/xiView.css";

import * as Spinner from "spin";
import {ByRei_dynDiv} from "../vendor/byrei-dyndiv_1.0rc1-src";
import * as NGL from "ngl"; // only used here for test setup
import * as d3 from "d3";
import {
    allDataLoaded,
    models,
    views,
    blosumLoading,
    modelsEssential,
    viewsEssential,
    pretendLoad
} from "./networkFrame";
import {commonRegexes, displayError} from "./utils";
import {loadGOAnnotations} from "./loadGO";
import Split from "split.js";
import {testCallback, testSetupNew} from "../tests/tests";
import {setupColourModels} from "./model/color/setup-colors";
import {repopulateNGL} from "./views/ngl/RepopulateNGL";
import * as assert from "assert";
import {testCallback2, testSetup2} from "../tests/tests2";

export const networkPageSpinner = new Spinner({
    length: 38, // The length of each line
    width: 17, // The line thickness
    radius: 45, // The radius of the inner circle
});

export function main(serverFlavour, dataPath, peakListPath, annotatorURL, loadLayoutPath, saveLayoutPath) {
    console.log("serverFlavour:", serverFlavour, "dataPath:", dataPath, "peakListPath:", peakListPath,
        "annotatorURL:", annotatorURL, "loadLayoutPath:", loadLayoutPath, "saveLayoutPath:", saveLayoutPath);
    assert((serverFlavour == "XIVIEW.ORG") || (serverFlavour == "XI2") || (serverFlavour == "PRIDE"),
        "serverFlavour must be one of XIVIEW.ORG, XI2 or PRIDE");

    window.xiAnnotRoot = annotatorURL;
    window.peakListUrl = peakListPath;

    const spinTarget = d3.select("#main").node();
    networkPageSpinner.spin(spinTarget);

    const success = function (json) {
        try {
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
                displayError(function () {
                    return true;
                }, "Warning <p class='errorReason'>" + json.warn + "</p>");
            }

            // !XI2 !X1
            window.loggedIn = json.loggedIn;

            models(serverFlavour, json);
            window.compositeModelInst.set("dataPath", dataPath);
            window.compositeModelInst.set("peakListPath", peakListPath);
            window.compositeModelInst.set("annotatorURL", annotatorURL);
            window.compositeModelInst.set("loadLayoutPath", loadLayoutPath);
            window.compositeModelInst.set("saveLayoutPath", saveLayoutPath);

            const searches = window.compositeModelInst.get("clmsModel").get("searches");
            if (!window.compositeModelInst.get("clmsModel").isAggregatedData()) {
                const id_file_names = [];
                searches.forEach(function (search) {
                    id_file_names.push(search.id + ": "
                        + (search.identification_file_name ? search.identification_file_name : search.name));
                });
                document.title = id_file_names.join(", ");
            } else {
                document.title = Array.from(searches.keys()).join(", ");
            }

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

            const returnedTimeStamp = new Date(json.timeStamp * 1000);
            console.log(new Date(), returnedTimeStamp, new Date() - returnedTimeStamp);
            if (Math.abs(new Date() - returnedTimeStamp) > 60 * 5 * 1000) { // if out by 5 minutes...
                displayError(function () {
                    return true;
                }, "Returned search results were generated at " + returnedTimeStamp + " and are likely from cache.<p class='errorReason'>If you have revalidated results since, press CTRL + F5 to refresh.</p>");
            }

            views();
            allDataLoaded();

        } catch (err) {
            displayError(function () {
                return true;
            }, "An error has occurred. \t&#9785;<p class='errorReason'>"
                + (json.error ? json.error : err.stack)
                + "</p>"
                + "<a href='" + dataPath + window.location.search + "'>Try loading data only.</a>");
            console.error("Error", err);
            networkPageSpinner.stop();
        }
    };


    // z = performance.now();
    // console.log ("TIME t1", performance.now());

    if (window.location.search) {
        // 1. Load spectrum matches, dont send all query string to php (ostensibly to help with caching)
        // var urlChunkMap = parseURLQueryString (window.location.search.slice(1));
        // var phpProps = _.pick (urlChunkMap, "upload", "sid", "auto",  "unval", "linears", "lowestScore", "highestScore", "decoys");
        // var newQueryString = d3.entries(phpProps).map(function (entry) { return entry.key+"="+entry.value; }).join("&");
        // console.log ("ucm", urlChunkMap, newQueryString);
        const url = dataPath + window.location.search;

        d3.json(url, function (error, json) {
            if (!error) {
                success(json);
            } else {
                displayError(function () {
                    return true;
                }, "An error has occurred. \t&#9785;<p class='errorReason'>"
                    + (error.statusText ? error.statusText : error) + "</p>"
                    + "<a href='" + url + "'>Try loading data only.</a>");
                console.error("Error", error);
            }
        });

    } else {
        networkPageSpinner.stop(); // stop spinner
        success({times: {}});   // bug fix for empty searches
    }

    if (serverFlavour != "PRIDE") {
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
    } else {
        allDataLoaded();
    }

    // 3. Can load BLOSUM matrices in parallel - saves a little bit of initialisation
    blosumLoading();
}

export function validationPage(serverFlavour, dataPath, peakListPath, annotatorURL) {
    assert((serverFlavour == "XIVIEW.ORG") || (serverFlavour == "XI2") || (serverFlavour == "PRIDE"),
        "serverFlavour must be one of XIVIEW.ORG, XI2 or PRIDE");
    window.xiAnnotRoot = annotatorURL;
    window.peakListUrl = peakListPath;

    const spinTarget = d3.select("#main").node();
    networkPageSpinner.spin(spinTarget);

    const success = function (json) {
        try {
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
                displayError(function () {
                    return true;
                }, "Warning <p class='errorReason'>" + json.warn + "</p>");
            }

            modelsEssential(serverFlavour, json);
            window.compositeModelInst.set("serverFlavour", serverFlavour);
            window.compositeModelInst.set("dataPath", dataPath);
            const searches = window.compositeModelInst.get("clmsModel").get("searches");
            document.title = "Validate " + Array.from(searches.keys()).join();
            window.split = Split(["#topDiv", "#bottomDiv"], {
                direction: "vertical",
                sizes: [60, 40], minSize: [200, 10],
                onDragEnd: function () {
                    window.vent.trigger("resizeSpectrumSubViews", true);
                }
            });

            // need to make #spectrumSettingsWrapper before we can turn it into a backbone view later. mjg 27/11/17
            d3.select("body").append("div")
                .attr("id", "spectrumSettingsWrapper")
                .attr("class", "dynDiv");
            viewsEssential({"specWrapperDiv": "#topDiv", spectrumToTop: false});

            window.vent.trigger("spectrumShow", true);

            const allMatches = window.compositeModelInst.get("clmsModel").get("matches");
            window.compositeModelInst.setMarkedMatches("selection", allMatches);

            // ByRei_dynDiv by default fires this on window.load (like this whole block), but that means the SpectrumSettingsView is too late to be picked up
            // so we run it again here, doesn't do any harm
            ByRei_dynDiv.init.main();

            // eslint-disable-next-line no-unused-vars
            const resize = function (event) {
                window.vent.trigger("resizeSpectrumSubViews", true);
                const alts = d3.select("#alternatives");
                const w = alts.node().parentNode.parentNode.getBoundingClientRect().width - 20;
                alts.attr("style", "width:" + w + "px;"); //dont know why d3 style() aint working
            };

            window.onresize = resize;

            resize();
            networkPageSpinner.stop(); // stop spinner

        } catch (err) {
            displayError(function () {
                return true;
            }, "An error has occurred. \t&#9785;<p class='errorReason'>"
                + (json.error ? json.error : err.stack)
                + "</p>");
            console.error("Error", err);
            networkPageSpinner.stop();
        }
    };

    if (window.location.search) {
        // 1. Load spectrum matches, dont send all query string to php (ostensibly to help with caching)
        // var urlChunkMap = parseURLQueryString (window.location.search.slice(1));
        // var phpProps = _.pick (urlChunkMap, "upload", "sid", "auto",  "unval", "linears", "lowestScore", "highestScore", "decoys");
        // var newQueryString = d3.entries(phpProps).map(function (entry) { return entry.key+"="+entry.value; }).join("&");
        // console.log ("ucm", urlChunkMap, newQueryString);
        const url = dataPath + window.location.search;

        d3.json(url, function (error, json) {
            if (!error) {
                success(json);
            } else {
                displayError(function () {
                    return true;
                }, "An error has occurred. \t&#9785;<p class='errorReason'>"
                    + (error.statusText ? error.statusText : error) + "</p>"
                    + "<a href='" + url + "'>Try loading data only.</a>");
                console.error("Error", error);
            }
        });

    } else {
        networkPageSpinner.stop(); // stop spinner
        success({times: {}});   // bug fix for empty searches
    }

}

export function test() {
    testSetupNew(testCallback);
    // delete window.compositeModelInst;
    // testSetup2();
}

export function test2() {
    // testSetupNew(testCallback2);
    // delete window.compositeModelInst;
    testSetup2();
}

<?php
    session_start();
    $cacheBuster = '?v='.microtime(true);
?>

<!DOCTYPE html>
<html>
    <head>
        <meta http-equiv="content-type" content="text/html; charset=UTF-8">
        <meta charset="utf-8">
        <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
        <meta http-equiv="content-type" content="text/html; charset=utf-8" />
        <meta http-equiv="cache-control" content="max-age=0" />
        <meta http-equiv="cache-control" content="no-cache" />
        <meta http-equiv="expires" content="0" />
        <meta http-equiv="expires" content="Tue, 01 Jan 1980 1:00:00 GMT" />
        <meta http-equiv="pragma" content="no-cache" />

        <meta name="description" content="common platform for downstream analysis of CLMS data" />
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-status-bar-style" content="black">

        <link rel="stylesheet" href="../vendor/css/reset.css<?php echo $cacheBuster ?>" />
        <link rel="stylesheet" href="../vendor/css/common.css<?php echo $cacheBuster ?>" />
        <link rel="stylesheet" href="../vendor/css/byrei-dyndiv_0.5.css<?php echo $cacheBuster ?>" />
        <link rel="stylesheet" href="../vendor/css/jquery-ui.css<?php echo $cacheBuster ?>"/>

        <!-- Spectrum Viewer styles  -->
        <link rel="stylesheet" href="../spectrum/css/spectrum.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="../spectrum/css/settings.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="../spectrum/css/QC.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="../spectrum/css/dropdown.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" type="text/css" href="../spectrum/css/font-awesome.min.css"/>
        <link rel="stylesheet" href="../spectrum/vendor/dt-1.10.12_datatables.min.css<?php echo $cacheBuster ?>">

        <link rel="stylesheet" href="./css/xispecAdjust.css<?php echo $cacheBuster ?>" />
        <link rel="stylesheet" href="./css/style.css<?php echo $cacheBuster ?>" />
        <link rel="stylesheet" href="./css/xiNET.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/matrix.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/tooltip.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="../vendor/css/c3.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/distogram.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/minigram.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/ddMenuViewBB.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/alignViewBB.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/selectionViewBB.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/circularViewBB.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/spectrumViewWrapper.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/validate.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/proteinInfoViewBB.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/key.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/filter.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/scatterplot.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/nglViewBB.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/networkPage.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/csvUpload.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/searchSummary.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/threeColourSlider.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/urlSearchBoxViewBB.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="../vendor/css/jquery.jsonview.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="../vendor/css/d3table.css<?php echo $cacheBuster ?>">
      	<link rel="stylesheet" href="../vendor/css/multiple-select.css<?php echo $cacheBuster ?>">
      	<link rel="stylesheet" href="./css/list.css<?php echo $cacheBuster ?>">
      	<link rel="stylesheet" href="./css/goTermsView.css<?php echo $cacheBuster ?>">

       <link rel="stylesheet" href="./css/xiView.css<?php echo $cacheBuster ?>">

        <script type="text/javascript" src="../vendor/js/byrei-dyndiv_1.0rc1-src.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/d3.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/colorbrewer.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/ngl.dev.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/c3.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/split.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/svgexp.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/underscore.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/spin.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/jquery-3.4.1.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/backbone.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/jquery.jsonview.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/d3table.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/cola.js<?php echo $cacheBuster ?>"></script><!-- for xiNET layout -->
	    <script type="text/javascript" src="../vendor/js/multiple-select.js<?php echo $cacheBuster ?>"></script>
	    <script type="text/javascript" src="../vendor/js/workerpool.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/d3-octree.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/jquery-ui.js<?php echo $cacheBuster ?>"></script>

        <script type="text/javascript" src="../CLMS-model/src/CLMS/model/SearchResultsModel.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../CLMS-model/src/CLMS/model/SpectrumMatch.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../CLMS-model/src/CLMS/model/CrossLink.js<?php echo $cacheBuster ?>"></script>

        <script type="text/javascript" src="../crosslink-viewer/src/xiNET/CrosslinkViewerBB.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../crosslink-viewer/src/xiNET/interactor/Interactor.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../crosslink-viewer/src/xiNET/interactor/RenderedProtein.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../crosslink-viewer/src/xiNET/interactor/Group.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../crosslink-viewer/src/xiNET/link/Link.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../crosslink-viewer/src/xiNET/link/RenderedCrosslink.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../crosslink-viewer/src/xiNET/link/P_PLink.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../crosslink-viewer/src/xiNET/link/G_GLink.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../crosslink-viewer/src/xiNET/interactor/Rotator.js<?php echo $cacheBuster ?>"></script>
        <!-- Backbone models/views loaded after Backbone itself, otherwise need to delay their instantiation somehow -->
        <script type="text/javascript" src="./js/Utils.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/circleArrange.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/filterModel.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/models.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/annotationTypeModel.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/compositeModelType.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/modelUtils.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/NGLUtils.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/stringUtils.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/fdr.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/distancesObj.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/distogramViewBB.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/threeColourSliderBB.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/filterViewBB.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/matrixViewBB.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/tooltipViewBB.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/minigramViewBB.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/ddMenuViewBB.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/NGLModelWrapperBB.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/PDBFileChooser.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/STRINGFileChooser.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/metaDataFileChoosers.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/NGLViewBB.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/bioseq32.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/alignModelType.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/alignViewBB3.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/alignSettingsViewBB.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/selectionTableViewBB.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/circularViewBB.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/color/color-model.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/color/link-color-model.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/color/protein-color-model.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/spectrumViewWrapper.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/validate.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/loadSpectrum.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/proteinInfoViewBB.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/keyViewBB.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/scatterplotViewBB.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/networkFrame.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/downloads.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/searchSummaryViewBB.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/urlSearchBoxViewBB.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/xiNetControlsViewBB.js<?php echo $cacheBuster ?>"></script>
         <script type="text/javascript" src="./js/goTermsSankeyViewBB.js<?php echo $cacheBuster ?>"></script>
         <script type="text/javascript" src="./js/goTerm.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/sankey.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/ui-utils/section-table.js<?php echo $cacheBuster ?>"></script>

        <script type="text/javascript" src="../userGUI/js/dialogs.js<?php echo $cacheBuster ?>"></script>

        <!-- Spectrum view files -->
        <script type="text/javascript" src="../spectrum/vendor/datatables.min.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../spectrum/vendor/jscolor.min.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../spectrum/src/Wrapper.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../spectrum/src/SpectrumWrapper.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../spectrum/src/AnnotatedSpectrumModel.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../spectrum/src/SpectrumControlsView.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../spectrum/src/SpectrumView2.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../spectrum/src/FragmentationKeyView.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../spectrum/src/PrecursorInfoView.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../spectrum/src/QCwrapperView.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../spectrum/src/ErrorPlotView.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../spectrum/src/SettingsView.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../spectrum/src/AppearanceSettingsView.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../spectrum/src/DataSettingsView.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../spectrum/src/PepInputView.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../spectrum/src/FragKey/KeyFragment.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../spectrum/src/graph/Graph.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../spectrum/src/graph/Peak.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../spectrum/src/graph/Fragment.js<?php echo $cacheBuster ?>"></script>
    </head>

    <body>
        <!-- Main -->
        <div id="main">

            <!-- Define main first so page-header overlays it -->
            <div class="mainContent">
                <div id="topDiv">
                    <div id="networkDiv"></div>
                </div>
                <div id="bottomDiv"></div>
            </div>

            <div class="page-header">
                    <i class="fa fa-home fa-xi"
                        onclick="window.open('../history/history.html');"
                        title="Return to search history / Login"></i>
                    <p id="loadDropdownPlaceholder"></p>
                    <p id="viewDropdownPlaceholder"></p>
                    <p id="proteinSelectionDropdownPlaceholder"></p>
                    <p id="annotationsDropdownPlaceholder"></p>
                    <p id="expDropdownPlaceholder"></p>
                    <p id="helpDropdownPlaceholder"></p>
                    <div id="xiNetButtonBar"></div>
            </div>

            <div id='hiddenProteinsMessage'>
                <p id='hiddenProteinsText'>Manually Hidden Message</p>
                <!-- not very backbone but its only a button -->
                <button class='btn btn-1 btn-1a showHidden' onclick="CLMSUI.compositeModelInst.showHiddenProteins()">Show</button>
            </div>"

            <div id='newGroupName'  title="Enter group name">
                <input type="text" style="z-index:10000" name="newGroupName" value="" size=20><br>
            </div>"

            <div class="controls">
                <div id="filterPlaceholder"></div>
                <div class="filterResultGroup">
                    <div id="filterReportPlaceholder"></div>
                    <div id="fdrSummaryPlaceholder"></div>
                </div>
            </div>

			<div id="subPanelLimiter"></div>
        </div><!-- MAIN -->


    <script>
    //<![CDATA[

        var CLMSUI = CLMSUI || {};
        <?php
            if (isset($_SESSION['session_name'])) {
                echo "CLMSUI.loggedIn = true;";
            }
            if (file_exists('../xiSpecConfig.php')) {
                include('../xiSpecConfig.php');
            }
        ?>

		var spinner = new Spinner({scale: 5}).spin (d3.select("#main").node());
        var z;

		var success = function (json) {
			try {
                if (json.error) {
                    throw "Error from server";
                }
                if (json.times) {
                    json.times.io = (Date.now() / 1000) - json.times.endAbsolute;
                    json.times.overall = json.times.io + (json.times.endAbsolute - json.times.startAbsolute);
                }
                console.log ("TIME t2", performance.now(), json.times);
                //console.log (JSON.stringify(json));
                //console.log (json);

                if (json.warn) {
                    CLMSUI.utils.displayError (function() { return true; }, "Warning <p class='errorReason'>"+json.warn+"</p>");
                }

				CLMSUI.init.models (json);
				var searches = CLMSUI.compositeModelInst.get("clmsModel").get("searches");
				document.title = Array.from(searches.keys()).join();

				CLMSUI.split = Split(["#topDiv", "#bottomDiv"],
					{ direction: "vertical", sizes: [80,20], minSize: [200,0],
						onDragEnd: function () { CLMSUI.oldSplitterProportions = CLMSUI.split.getSizes(); },
						gutterStyle: function () { return { 'margin': '0 10px', 'height': '10px' } }
					},
				);
                d3.select(".gutter").attr("title", "Drag to change space available to selection table");

                var returnedTimeStamp = new Date (json.timeStamp * 1000);
                console.log (new Date(), returnedTimeStamp, new Date() - returnedTimeStamp);
                if (Math.abs (new Date() - returnedTimeStamp) > 60 * 5 * 1000) { // if out by 5 minutes...
                    CLMSUI.utils.displayError (function() { return true; }, "Returned search results were generated at "+returnedTimeStamp+" and are likely from cache.<p class='errorReason'>If you have revalidated results since, press CTRL + F5 to refresh.</p>");
                }

				CLMSUI.init.views();
				allDataLoaded ();

  	        } catch (err) {
                //console.log ("ERR", err);
				CLMSUI.utils.displayError (function() { return true; }, "An error has occurred. \t&#9785;<p class='errorReason'>"
                    + (json.error? json.error : err.stack)
                    +"</p>");
			}
		};


        z = performance.now();
        console.log ("TIME t1", performance.now());

        if (window.location.search) {
            // 1. Load spectrum matches, dont send all query string to php (ostensibly to help with caching)
            var urlChunkMap = CLMSUI.modelUtils.parseURLQueryString (window.location.search.slice(1));
            var phpProps = _.pick (urlChunkMap, "upload", "sid", "auto",  "unval", "linears", "lowestScore", "highestScore", "decoys");
            var newQueryString = d3.entries(phpProps).map(function (entry) { return entry.key+"="+entry.value; }).join("&");
            console.log ("ucm", urlChunkMap, newQueryString);
            var url = "../CLMS-model/php/spectrumMatches.php?" + newQueryString;

            d3.json (url, function (error, json) {
                spinner.stop(); // stop spinner on request returning

                if (!error) {
                    success (json);
                } else {
                    CLMSUI.utils.displayError (function() { return true; }, "An error has occurred. \t&#9785;<p class='errorReason'>"
                        + (error.statusText? error.statusText : error) +"</p>"
                        + "<a href='" + url + "'>Try loading data only.</a>");
                    console.error ("Error", error);
                }
            });

        } else {
            spinner.stop(); // stop spinner
            success ({times:{}});   // bug fix for empty searches
        }

        // 2. Can load GO file in parallel - saves I/O time on initialising (whichever is shorter, go terms or spectrum matches)
        url = "./go.obo";
        d3.text (url, function(error, txt) {
            if (error) {
                console.log("error", error, "for", url, arguments);
            } else {
                CLMSUI.go = CLMSUI.modelUtils.loadGOAnnotations (txt);  // temp store until CLMS model is built
                //CLMSUI.jsongo = CLMSUI.modelUtils.jsonifyGoMap (CLMSUI.go);
                allDataLoaded ();
            }
        });

        // 3. Can load BLOSUM matrics in parallel - saves a little bit of intiialisation
        CLMSUI.init.blosumLoading ();

    //]]>
    </script>

    </body>
</html>

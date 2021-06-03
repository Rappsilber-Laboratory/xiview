<!--
//  CLMS-UI
//  Copyright 2015 Colin Combe, Rappsilber Laboratory, Edinburgh University
//
//  This file is part of CLMS-UI.
//
//  CLMS-UI is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version.
//
//  CLMS-UI is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU General Public License for more details.
//
//  You should have received a copy of the GNU General Public License
//  along with CLMS-UI.  If not, see <http://www.gnu.org/licenses/>.
-->
<?php
session_start();
$cacheBuster = '?v='.microtime(true);
if (!$_SESSION['session_name']) {
    header("location:login.html");
    exit;
}
header('Content-type: text/html; charset=utf-8');
?>

<!DOCTYPE html>
<html>
    <head>
<!-- Global site tag (gtag.js) - Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=UA-43266697-3"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'UA-43266697-3');
</script>

        <?php
            // $sid = urldecode($_GET["upload"]);
            //
            // $pattern = '/[^0-9,\-]/';
            // if (preg_match($pattern, $sid)){
            //     exit();
            // }
            $pageName = "Validation";
        ?>
        <title><?php echo $pageName ?></title>
        <meta http-equiv="content-type" content="text/html; charset=utf-8" />
        <meta name="description" content="common platform for downstream analysis of CLMS data" />
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-status-bar-style" content="black">

        <link rel="stylesheet" href="../vendor/css/reset.css<?php echo $cacheBuster ?>" />
        <link rel="stylesheet" href="../vendor/css/common.css<?php echo $cacheBuster ?>" />
        <link rel="stylesheet" href="../vendor/css/byrei-dyndiv_0.5.css<?php echo $cacheBuster ?>" />
        <link rel="stylesheet" href="../vendor/css/c3.css<?php echo $cacheBuster ?>">

        <!-- Spectrum Viewer styles  -->
        <link rel="stylesheet" href="../spectrum/css/spectrum.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="../spectrum/css/settings.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="../spectrum/css/QC.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="../spectrum/css/dropdown.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" type="text/css" href="../spectrum/css/font-awesome.min.css"/>
        <link rel="stylesheet" href="../spectrum/vendor/dt-1.10.12_datatables.min.css<?php echo $cacheBuster ?>">

        <link rel="stylesheet" href="./css/xispecAdjust.css<?php echo $cacheBuster ?>" />
        <link rel="stylesheet" href="./css/style.css<?php echo $cacheBuster ?>" />
        <link rel="stylesheet" href="./css/tooltip.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/minigram.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/ddMenuViewBB.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/selectionViewBB.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/spectrumViewWrapper.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/validate.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/filter.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/validationPage.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="./css/xiView.css<?php echo $cacheBuster ?>">

        <script type="text/javascript" src="../vendor/js/byrei-dyndiv_1.0rc1-src.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/d3.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/colorbrewer.js<?php echo $cacheBuster ?>"></script>

        <script type="text/javascript" src="../vendor/js/c3.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/split.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/svgexp.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/underscore.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/jquery-3.4.1.js<?php echo $cacheBuster ?>"></script>
        <!-- <script type="text/javascript" src="../vendor/js/zepto.js"></script> -->
        <script type="text/javascript" src="../vendor/js/backbone.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/spin.js<?php echo $cacheBuster ?>"></script>

        <script type="text/javascript" src="../CLMS-model/src/CLMS/model/SearchResultsModel.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../CLMS-model/src/CLMS/model/SpectrumMatch.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../CLMS-model/src/CLMS/model/CrossLink.js<?php echo $cacheBuster ?>"></script>


        <!-- Backbone models/views loaded after Backbone itself, otherwise need to delay their instantiation somehow -->
        <script type="text/javascript" src="./js/Utils.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/filterModel.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/models.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/compositeModelType.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/modelUtils.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/minigramViewBB.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/filterViewBB.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/fdr.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/ddMenuViewBB.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/tooltipViewBB.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/selectionTableViewBB.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/spectrumViewWrapper.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/loadSpectrum.js<?php echo $cacheBuster ?>"></script>

        <script type="text/javascript" src="./js/networkFrame.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/downloads.js<?php echo $cacheBuster ?>"></script>



        <!-- Spectrum view .js files -->
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
            <div class="mainContent">

            <div class="page-header">
                <i class="fa fa-home fa-xi" onclick="window.location = '../history/history.html';" title="Return to search history"></i>
                <span class="headerLabel">
                    <?php echo $_SESSION['session_name'] ?>
                </span>
                <p id="expDropdownPlaceholder"></p>
                <button class='btn btn-1 btn-1a' onclick="window.location = './network.php'+window.location.search;" title="View results">Done</button>
            </div> <!-- page-header -->

                <div id="topDiv"></div>
                <div id="bottomDiv"></div>
            </div>
            <div class="controls">
                <span id="filterPlaceholder"></span>
            </div>
        </div><!-- MAIN -->

        <script>
        //<![CDATA[

        //~ var windowLoaded = function () {
            var CLMSUI = CLMSUI || {};
            <?php
                if (isset($_SESSION['session_name'])) {
                    echo "CLMSUI.loggedIn = true;";
                }
                if (file_exists('../xiSpecConfig.php')) {
                    include('../xiSpecConfig.php');
                }
            ?>

            var spinner = new Spinner({scale: 5}).spin (d3.select("#topDiv").node());

            var success = function (text) {
                spinner.stop(); // stop spinner on request returning
                var json = JSON.parse (text);
                CLMSUI.init.modelsEssential(json);

                var searches = CLMSUI.compositeModelInst.get("clmsModel").get("searches");
                document.title = "Validate " + Array.from(searches.keys()).join();
                Split (["#topDiv", "#bottomDiv"], { direction: "vertical",
                        sizes: [60,40], minSize: [200,10],
                            onDragEnd: function () {CLMSUI.vent.trigger ("resizeSpectrumSubViews", true);
                } });

                // need to make #spectrumSettingsWrapper before we can turn it into a backbone view later. mjg 27/11/17
                d3.select("body").append("div")
                    .attr("id", "spectrumSettingsWrapper")
                    .attr("class", "dynDiv")
                ;
                CLMSUI.init.viewsEssential({"specWrapperDiv":"#topDiv", spectrumToTop: false});

                CLMSUI.vent.trigger ("spectrumShow", true);

        var allMatches = CLMSUI.compositeModelInst.get("clmsModel").get("matches")
        CLMSUI.compositeModelInst.setMarkedMatches ("selection", allMatches);

                // ByRei_dynDiv by default fires this on window.load (like this whole block), but that means the SpectrumSettingsView is too late to be picked up
                // so we run it again here, doesn't do any harm
                ByRei_dynDiv.init.main();

                var resize = function(event) {
                    CLMSUI.vent.trigger ("resizeSpectrumSubViews", true);
                    var alts = d3.select("#alternatives");
                    var w = alts.node().parentNode.parentNode.getBoundingClientRect().width - 20;
                    alts.attr("style", "width:"+w+"px;"); //dont know why d3 style() aint working
                };

                window.onresize = resize;

                resize();
            };

            var url = "../CLMS-model/php/spectrumMatches.php" + window.location.search;


            d3.text (url, function (error, text) {
                if (!error) {
                    success (text);
                }
            });


        //]]>
        </script>

    </body>
</html>

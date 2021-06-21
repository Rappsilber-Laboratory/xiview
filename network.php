<?php
    session_start();
    $cacheBuster = '';//'?v='.microtime(true);
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
        <link rel="stylesheet" href="../vendor/css/jquery.jsonview.css<?php echo $cacheBuster ?>">
        <link rel="stylesheet" href="../vendor/css/d3table.css<?php echo $cacheBuster ?>">
      	<link rel="stylesheet" href="../vendor/css/multiple-select.css<?php echo $cacheBuster ?>">
      	<link rel="stylesheet" href="./css/list.css<?php echo $cacheBuster ?>">
      	<link rel="stylesheet" href="./css/goTermsView.css<?php echo $cacheBuster ?>">

       <link rel="stylesheet" href="./css/xiView.css<?php echo $cacheBuster ?>">

        <script type="text/javascript" src="../vendor/js/byrei-dyndiv_1.0rc1-src.js<?php echo $cacheBuster ?>"></script>
<!--        <script type="text/javascript" src="../vendor/js/d3.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../vendor/js/colorbrewer.js--><?php //echo $cacheBuster ?><!--"></script>-->
        <script type="text/javascript" src="../vendor/js/ngl.dev.js<?php echo $cacheBuster ?>"></script>
<!--        <script type="text/javascript" src="../vendor/js/c3.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../vendor/js/split.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../vendor/js/svgexp.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../vendor/js/underscore.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../vendor/js/jquery-3.4.1.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../vendor/js/backbone.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../vendor/js/jquery.jsonview.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../vendor/js/d3table.js--><?php //echo $cacheBuster ?><!--"></script>-->
        <script type="text/javascript" src="../vendor/js/cola.js<?php echo $cacheBuster ?>"></script>
<!--	    <script type="text/javascript" src="../vendor/js/multiple-select.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--	    <script type="text/javascript" src="../vendor/js/workerpool.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../vendor/js/d3-octree.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../vendor/js/jquery-ui.js--><?php //echo $cacheBuster ?><!--"></script>-->

<!--        <script type="text/javascript" src="../dist/clms.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../dist/xinet.js--><?php //echo $cacheBuster ?><!--"></script>-->

        <!-- Backbone models/views loaded after Backbone itself, otherwise need to delay their instantiation somehow -->
<!--        <script type="text/javascript" src="./js/utils.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/views/circle/circleArrange.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/filter/filter-model.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/model/models.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/model/annotation-model-collection.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/model/composite-model.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/modelUtils.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/file-choosers/stringUtils.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/filter/fdr.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/model/distances.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!---->
<!--        <script type="text/javascript" src="./js/ui-utils/section-table.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/ui-utils/base-frame-view.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/ui-utils/checkbox-view.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/ui-utils/color-collection-option-view.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/ui-utils/radio-button-filter-view.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!---->
<!--        <script type="text/javascript" src="./js/views/distogramViewBB.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/views/key/threeColourSliderBB.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/filter/filterViewBB.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/views/matrixViewBB.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/views/tooltipViewBB.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/filter/minigramViewBB.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/ui-utils/ddMenuViewBB.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/file-choosers/PDBFileChooser.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/file-choosers/STRINGFileChooser.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/file-choosers/metaDataFileChoosers.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/align/bioseq32.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/align/sequence-model-collection.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/align/protein-alignment-model-collection.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/align/alignViewBB3.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/align/alignSettingsViewBB.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/views/selectionTableViewBB.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/views/circle/circularViewBB.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/model/color/color-model.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/model/color/link-color-model.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/model/color/protein-color-model.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/views/spectrumViewWrapper.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/validate.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/loadSpectrum.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/views/proteinInfoViewBB.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/views/key/keyViewBB.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/views/scatterplotViewBB.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/networkFrame.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/downloads.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/views/searchSummaryViewBB.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/views/xiNetControlsViewBB.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!---->
<!--        <script type="text/javascript" src="./js/views/go/goTermsSankeyViewBB.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/views/go/goTerm.js--><?php //echo $cacheBuster ?><!--"></script>-->

<!--        <script type="text/javascript" src="./js/views/ngl/NGLUtils.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/views/ngl/NGLExportUtils.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/views/ngl/ngl-wrapper-model.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/views/ngl/crosslink-representation.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="./js/views/ngl/NGLViewBB.js--><?php //echo $cacheBuster ?><!--"></script>-->



<!--        <script type="text/javascript" src="../userGUI/js/dialogs.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!---->
        <!-- Spectrum view files -->
<!--        <script type="text/javascript" src="../spectrum/vendor/datatables.min.js--><?php //echo $cacheBuster ?><!--"></script>-->
        <script type="text/javascript" src="../spectrum/vendor/jscolor.min.js<?php echo $cacheBuster ?>"></script>
<!--        <script type="text/javascript" src="../spectrum/src/Wrapper.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../spectrum/src/SpectrumWrapper.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../spectrum/src/AnnotatedSpectrumModel.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../spectrum/src/SpectrumControlsView.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../spectrum/src/SpectrumView2.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../spectrum/src/FragmentationKeyView.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../spectrum/src/PrecursorInfoView.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../spectrum/src/QCwrapperView.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../spectrum/src/ErrorPlotView.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../spectrum/src/SettingsView.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../spectrum/src/AppearanceSettingsView.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../spectrum/src/DataSettingsView.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../spectrum/src/PepInputView.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../spectrum/src/FragKey/KeyFragment.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../spectrum/src/graph/Graph.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../spectrum/src/graph/Peak.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../spectrum/src/graph/Fragment.js--><?php //echo $cacheBuster ?><!--"></script>-->

        <script type="text/javascript" src="../dist/xiview.js"></script>
        <script type="text/javascript" src="./js/views/go/sankey.js<?php echo $cacheBuster ?>"></script>
        <!---->
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
                <button class='btn btn-1 btn-1a showHidden' onclick="window.compositeModelInst.showHiddenProteins()">Show</button>
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

        //var CLMSUI = CLMSUI || {};
        <?php
        //    if (isset($_SESSION['session_name'])) {
        //        echo "CLMSUI.loggedIn = true;";
        //    }
        //    if (file_exists('../xiSpecConfig.php')) {
        //        include('../xiSpecConfig.php');
        //    }
        //?>

        xiview.main();

    //]]>
    </script>

    </body>
</html>

<?php
    session_start();
    $cacheBuster = '';//'?v='.microtime(true);
?>

<!DOCTYPE html>
<html lang="en">
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
<!--      	<link rel="stylesheet" href="./css/list.css--><?php //echo $cacheBuster ?><!--">-->
      	<link rel="stylesheet" href="./css/goTermsView.css<?php echo $cacheBuster ?>">

       <link rel="stylesheet" href="./css/xiView.css<?php echo $cacheBuster ?>">

        <script type="text/javascript" src="../vendor/js/jquery-3.4.1.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/jquery.jsonview.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/jquery-ui.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../spectrum/vendor/datatables.min.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../spectrum/vendor/jscolor.min.js<?php echo $cacheBuster ?>"></script>
<!--        spin.js and c3 both misbehavin' when imported using webpack-->
        <script type="text/javascript" src="../vendor/js/spin.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="../vendor/js/c3.js<?php echo $cacheBuster ?>"></script>
<!--    we're on a forked dev version of ngl   -->
        <script type="text/javascript" src="./vendor/ngl.dev.js<?php echo $cacheBuster ?>"></script>
<!--        <script type="text/javascript" src="./vendor/cola.js--><?php //echo $cacheBuster ?><!--"></script>-->


<!--        <script type="text/javascript" src="./js/align/bioseq32.js"></script>-->
        <script type="text/javascript" src="../dist/xiview.js"></script>

        <script type="text/javascript" src="../vendor/js/d3-octree.js<?php echo $cacheBuster ?>"></script>
        <script type="text/javascript" src="./js/views/go/sankey.js<?php echo $cacheBuster ?>"></script>
        <title>network</title>
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
                    <p id="groupsDropdownPlaceholder"></p>
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

        <?php
            if (file_exists('../xiSpecConfig.php')) {
                include('../xiSpecConfig.php');
            }
        ?>

        xiview.main();

    //]]>
    </script>

    </body>
</html>

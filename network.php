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

        <script type="text/javascript" src="../dist/xiview.js"></script>

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
<!--                <input data-jscolor='{}' value="#3399FF80"/>-->
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

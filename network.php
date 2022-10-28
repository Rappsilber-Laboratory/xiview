<?php
    session_start();
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

            <div id='ppiMessage'>
                <p id='ppiText'></p>
            </div>

            <div id='hiddenProteinsMessage'>
                <p id='hiddenProteinsText'>Manually Hidden Message</p>
                <!-- not very backbone but its only a button -->
                <button class='btn btn-1 btn-1a showHidden' onclick="window.compositeModelInst.showHiddenProteins()">Show</button>
            </div>

            <div id='newGroupName'  title="Enter group name">
                <input type="text" style="z-index:10000" name="newGroupName" value="" size=20><br>
            </div>

            <div class="controls">
                <div id="filterPlaceholder"></div>
                <div class="filterResultGroup">
                    <div id="filterReportPlaceholder"></div>
                    <div id="fdrSummaryPlaceholder"></div>
                </div>
            </div>

			<div id="subPanelLimiter"></div>
        </div><!-- MAIN -->

        <!-- Simple pop-up dialog box, containing a form, used to manually set colors -->
        <dialog id="colorDialog">
            <form method="dialog">
                <fieldset id="chooseColor">
                    <legend id="chooseColorLabel">Select a Colour:</legend>
                        <label for="c1">
                            <div style="background:#4e79a7" >
                                <input type="radio" id="c1" name="aColor" value="#4e79a7">
                                #4e79a7
                            </div>
                        </label>
                        <label for="c2">
                            <div style="background:#f28e2c"><input type="radio" id="c2" name="aColor" value="#f28e2c">
                                #f28e2c
                            </div>
                        </label>
                        <label for="c3">
                            <div style="background:#e15759">
                                <input type="radio" id="c3" name="aColor" value="#e15759">
                                #e15759
                            </div>
                        </label>
                        <label for="c4">
                            <div style="background:#76b7b2">
                                <input type="radio" id="c4" name="aColor" value="#76b7b2">
                                #76b7b2
                            </div>
                        </label>
                        <label for="c5">
                            <div style="background:#59a14f">
                                <input type="radio" id="c5" name="aColor" value="#59a14f">
                                #59a14f
                            </div>
                        </label>
                        <label for="c6">
                            <div style="background:#edc949">
                                <input type="radio" id="c6" name="aColor" value="#edc949">
                                #edc949
                            </div>
                        </label>
                        <label for="c7">
                            <div style="background:#af7aa1">
                                <input type="radio" id="c7" name="aColor" value="#af7aa1">
                                #af7aa1
                            </div>
                        </label>
                        <label for="c8">
                            <div style="background:#ff9da7">
                                <input type="radio" id="c8" name="aColor" value="#ff9da7">
                                #ff9da7
                            </div>
                        </label>
                        <label for="c9">
                            <div style="background:#9c755f">
                                <input type="radio" id="c9" name="aColor" value="#9c755f">
                                #9c755f
                            </div>
                        </label>
                        <label for="c10">
                            <div style="background:#bab0ab">
                                <input type="radio" id="c10" name="aColor" value="#bab0ab">
                                #bab0ab
                            </div>
                        </label>
                </fieldset>
                <menu>
                    <button id="colorCancel">Cancel</button>
                    <button type="submit">Confirm</button>
                </menu>
            </form>
        </dialog>


        <!-- Simple pop-up dialog box, containing a form, used to manually set colors -->
        <dialog id="groupDialog">
            <form method="dialog">
                <fieldset id="groupListDialog">

                </fieldset>
                <menu>
<!--                    <button>Cancel</button>-->
                    <button type="submit">Confirm</button>
                </menu>
            </form>
        </dialog>


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

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
        <?php
            $sid = urldecode($_GET["sid"]);

            $pattern = '/[^0-9,\-]/';
            if (preg_match($pattern, $sid)){
                header();
                echo ("<!DOCTYPE html>\n<html><head></head><body>404.</body></html>");
                exit;
            }
            $pageName = "Validation";
        ?>
        <title><?php echo $pageName ?></title>
        <meta http-equiv="content-type" content="text/html; charset=utf-8" />
        <meta name="description" content="common platform for downstream analysis of CLMS data" />
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-status-bar-style" content="black">
<!---->
<!--        <link rel="stylesheet" href="../vendor/css/reset.css--><?php //echo $cacheBuster ?><!--" />-->
<!--        <link rel="stylesheet" href="../vendor/css/common.css--><?php //echo $cacheBuster ?><!--" />-->
<!--        <link rel="stylesheet" href="../vendor/css/byrei-dyndiv_0.5.css--><?php //echo $cacheBuster ?><!--" />-->
<!--        <link rel="stylesheet" href="../vendor/css/c3.css--><?php //echo $cacheBuster ?><!--">-->
<!---->
        <!-- Spectrum Viewer styles  -->
<!--        <link rel="stylesheet" href="../spectrum/css/spectrum.css--><?php //echo $cacheBuster ?><!--">-->
<!--        <link rel="stylesheet" href="../spectrum/css/settings.css--><?php //echo $cacheBuster ?><!--">-->
<!--        <link rel="stylesheet" href="../spectrum/css/QC.css--><?php //echo $cacheBuster ?><!--">-->
<!--        <link rel="stylesheet" href="../spectrum/css/dropdown.css--><?php //echo $cacheBuster ?><!--">-->
<!--        <link rel="stylesheet" type="text/css" href="../spectrum/css/font-awesome.min.css"/>-->
<!--        <link rel="stylesheet" href="../spectrum/vendor/dt-1.10.12_datatables.min.css--><?php //echo $cacheBuster ?><!--">-->
<!---->
<!--        <link rel="stylesheet" href="./css/xispecAdjust.css--><?php //echo $cacheBuster ?><!--" />-->
<!--        <link rel="stylesheet" href="./css/style.css--><?php //echo $cacheBuster ?><!--" />-->
<!--        <link rel="stylesheet" href="./css/tooltip.css--><?php //echo $cacheBuster ?><!--">-->
<!--        <link rel="stylesheet" href="./css/minigram.css--><?php //echo $cacheBuster ?><!--">-->
<!--        <link rel="stylesheet" href="./css/ddMenuViewBB.css--><?php //echo $cacheBuster ?><!--">-->
<!--        <link rel="stylesheet" href="./css/selectionViewBB.css--><?php //echo $cacheBuster ?><!--">-->
<!--        <link rel="stylesheet" href="./css/spectrumViewWrapper.css--><?php //echo $cacheBuster ?><!--">-->
<!--        <link rel="stylesheet" href="./css/validate.css--><?php //echo $cacheBuster ?><!--">-->
<!--        <link rel="stylesheet" href="./css/filter.css--><?php //echo $cacheBuster ?><!--">-->
<!--        <link rel="stylesheet" href="./css/validationPage.css--><?php //echo $cacheBuster ?><!--">-->
<!--        <link rel="stylesheet" href="./css/xiView.css--><?php //echo $cacheBuster ?><!--">-->

<!--        <script type="text/javascript" src="../vendor/js/jquery-3.4.1.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../vendor/js/jquery.jsonview.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../vendor/js/jquery-ui.js--><?php //echo $cacheBuster ?><!--"></script>-->
<!--        <script type="text/javascript" src="../spectrum/vendor/datatables.min.js--><?php //echo $cacheBuster ?><!--"></script>-->

        <link rel="stylesheet" href="./css/validationPage.css<?php echo $cacheBuster ?>">
        <script type="text/javascript" src="../dist/xiview.js"></script>
    </head>

    <body>
        <!-- Main -->
        <div id="main">
            <div class="mainContent">
                <div class="page-header" style="position:relative">
                    <i class="fa fa-home fa-xi" onclick="window.location = '../history/history.html';" title="Return to search history"></i>
                    <span class="headerLabel">
                        <?php echo $_SESSION['session_name'] ?>
                    </span>
                    <p id="expDropdownPlaceholder"></p>
                    <button class='btn btn-1 btn-1a' onclick=<?php echo '"window.location = \'./network.php?sid='.$sid.'\'";' ?> title="View results">Done</button>
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

            xiview.validationPage();
            <?php
                if (file_exists('../xiSpecConfig.php')) {
                    include('../xiSpecConfig.php');
                }
            ?>

        //]]>
        </script>

    </body>
</html>

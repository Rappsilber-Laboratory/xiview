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

        <link rel="stylesheet" href="./css/validationPage.css<?php echo $cacheBuster ?>">
<<<<<<< HEAD
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
=======
        <script type="text/javascript" src="../dist/xiview.js"></script>
>>>>>>> 72da89c150c0eef374eacc2096a0a5b00b478713
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

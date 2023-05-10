<?php
session_start();
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

        <link rel="stylesheet" href="./css/validationPage.css">
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

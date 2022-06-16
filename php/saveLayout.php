<?php
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

session_start();
if (isset($_SESSION['session_name'])) {
    include('../../connectionString.php');
    $dbconn = pg_connect($connectionString)
            or die('Could not connect: ' . pg_last_error());

    $uploadId = $_POST["sid"];
    $pattern = '/[^0-9,\-_]/';
    if (preg_match($pattern, $uploadId)) {
        exit();
    }
    $user = $_SESSION['session_name'];

    $id_rands = explode(",", $uploadId);
    $searchId_randomId = [];
    for ($i = 0; $i < count($id_rands); $i++) {
        $dashSeperated = explode("-", $id_rands[$i]);
        $randId = implode('-', array_slice($dashSeperated, 1, 4));
        $id = $dashSeperated[0];
//        echo "hello ".$user." ".$id;


        $searchDataQuery = "SELECT user_name, random_id FROM uploads inner JOIN users on (uploads.user_id = users.id) where uploads.id =  '".$id."';";

//        echo $searchDataQuery;


        $res = pg_query($searchDataQuery)
        or die('Query failed: ' . pg_last_error());
        $line = pg_fetch_array($res, null, PGSQL_ASSOC);

        if ($line["random_id"] != $randId || $line["user_name"] != $user) {
            echo "no";
            exit();
        }

    }



    // Prepare a query for execution
    pg_prepare($dbconn, "my_query", 'INSERT INTO layouts (search_id, user_id, layout, description) VALUES ($1, -1, $2, $3)');
    // Execute the prepared query
    $sid = $_POST["sid"];
    $layout = addslashes($_POST["layout"]);
    $name = addslashes($_POST["name"]);//stores in field called 'description'
    $result = pg_execute($dbconn, "my_query", [$sid, $layout, $name])or die('Query failed: ' . pg_last_error());
    // Free resultset
    pg_free_result($result);
    // Closing connection
    pg_close($dbconn);
}
?>

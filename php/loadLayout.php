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

include('../../connectionString.php');
$dbconn = pg_connect($connectionString) or die('Could not connect to database.');

    //Stored layouts
	// $layoutQuery = "SELECT t1.layout AS l "
	// 		. " FROM layouts AS t1 "
	// 		. " WHERE t1.search_id LIKE '$1' "
	// 		. " AND t1.time = (SELECT max(t1.time) FROM layouts AS t1 "
	// 		. " WHERE t1.search_id LIKE '$1' );";
  //

  	$layoutQuery = "SELECT t1.layout AS layout, t1.description AS name FROM layouts AS t1  WHERE t1.search_id = $1 AND t1.time IN (SELECT max(t1.time) FROM layouts AS t1  WHERE t1.search_id = $1 GROUP BY t1.description);";


	// $layoutResult = pg_query($layoutQuery) or die('Query failed: ' . pg_last_error());
	// while ($line = pg_fetch_array($layoutResult, null, PGSQL_ASSOC)) {
	// 	echo "\"xiNETLayout\":" . stripslashes($line["l"]) . ",\n\n";
	// }

// Prepare a query for execution
pg_prepare($dbconn, "my_query", $layoutQuery);
// Execute the prepared query
$sid = $_POST["sid"];
$result = pg_execute($dbconn, "my_query", [$sid])or die('Query failed: ' . pg_last_error());

//echo json_encode($data); trouble with escaping

//yes, this is a mess
$i = 0;
echo '{';
while ($row = pg_fetch_array($result)) {
  $name = $row["name"];
  if ($name != "{}" && $name != ""){
    if ($i > 0) echo ',';
    echo '"'.$name.'":'.stripslashes($row["layout"]);
    $i++;
    //echo $name;
  }
}
echo '}';

//echo $data;

// Free resultset
pg_free_result($result);
// Closing connection
pg_close($dbconn);
?>

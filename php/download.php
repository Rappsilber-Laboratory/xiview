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



$contentType = $_POST["contentType"];
$fileName = $_POST["fileName"];
$data = base64_decode ($_POST["content"], true);

//error_log (print_r ("xi3 ".$fileName, true));

header('Content-Type:'.$contentType);
header('Content-Disposition: attachment; filename="'.$fileName.'"');	// https://www.abeautifulsite.net/forcing-file-downloads-in-php - quotes for safari
header('Pragma: no-cache');
echo $data;

?>

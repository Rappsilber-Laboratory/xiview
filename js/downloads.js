import {modelUtils} from "./modelUtils";
import {utils} from "./utils";

export function downloadFilename(type, suffix) {
    suffix = suffix || "csv";
    return utils.makeLegalFileName(utils.searchesToString() + "--" + type + "--" + utils.filterStateToString()) + "." + suffix;
}

export function downloadMatches() {
    download(getMatchesCSV(), 'text/csv', downloadFilename("matches"));
}

export function downloadSSL() {

// $("#newGroupName").dialog({
//   modal: true,
//   buttons: {
//     'OK': function () {
//       var newGroupName = $('input[name="newGroupName"]').val();
//       alert(name);
    download(getSSL(newGroupName), 'text/csv', "test.ssl"); //downloadFilename("ssl"));
//       // storeData(name);
//       $(this).dialog('close');
//     },
//     'Cancel': function () {
//       $(this).dialog('close');
//     }
//   }
// });

}

export function downloadLinks() {
    download(getLinksCSV(), 'text/csv', downloadFilename("links"));
}

export function downloadPPIs() {
    download(getPPIsCSV(), 'text/csv', downloadFilename("PPIs"));
}

export function downloadResidueCount() {
    download(getResidueCount(), 'text/csv', downloadFilename("residueCount"));
}

export function downloadModificationCount() {
    download(getModificationCount(), 'text/csv', downloadFilename("modificationCount"));
}

export function downloadProteinAccessions() {
    download(getProteinAccessions(), 'text/csv', downloadFilename("proteinAccessions"));
}

export function downloadGroups() {
    download(getGroups(), 'text/csv', downloadFilename("groups"));
}

function download(content, contentType, fileName) {
    const oldToNewTypes = {
        "application/svg": "image/svg+xml;charset=utf-8",
        "plain/text": "plain/text;charset=utf-8",
    };
    const newContentType = oldToNewTypes[contentType] || contentType;

    function dataURItoBlob(binary) {
        let array = [];
        let te;

        try {
            te = new TextEncoder("utf-8");
        } catch (e) {
            te = undefined;
        }

        if (te) {
            array = te.encode(binary); // html5 encoding api way
        } else {
            // https://stackoverflow.com/a/18729931/368214
            // fixes unicode bug
            for (let i = 0; i < binary.length; i++) {
                let charcode = binary.charCodeAt(i);
                if (charcode < 0x80) array.push(charcode);
                else if (charcode < 0x800) {
                    array.push(0xc0 | (charcode >> 6),
                        0x80 | (charcode & 0x3f));
                } else if (charcode < 0xd800 || charcode >= 0xe000) {
                    array.push(0xe0 | (charcode >> 12),
                        0x80 | ((charcode >> 6) & 0x3f),
                        0x80 | (charcode & 0x3f));
                }
                // surrogate pair
                else {
                    i++;
                    // UTF-16 encodes 0x10000-0x10FFFF by
                    // subtracting 0x10000 and splitting the
                    // 20 bits of 0x0-0xFFFFF into two halves
                    charcode = 0x10000 + (((charcode & 0x3ff) << 10) |
                        (binary.charCodeAt(i) & 0x3ff));
                    array.push(0xf0 | (charcode >> 18),
                        0x80 | ((charcode >> 12) & 0x3f),
                        0x80 | ((charcode >> 6) & 0x3f),
                        0x80 | (charcode & 0x3f));
                }
            }
        }

        return new Blob([new Uint8Array(array)], {
            type: newContentType
        });
    }

    let blob = dataURItoBlob(content);

    if (navigator.msSaveOrOpenBlob) {
        navigator.msSaveOrOpenBlob(blob, fileName);
    } else {
        const a = document.createElement('a');
        a.href = window.URL.createObjectURL(blob);
        // Give filename you wish to download
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(a.href); // clear up url reference to blob so it can be g.c.'ed
    }

    blob = null;
}

function mostReadableId(protein) {
    if (protein.accession && protein.name && (protein.accession !== protein.name)) {
        return "sp|" + protein.accession + "|" + protein.name;
    } else if (protein.name) {
        return protein.name;
    } else if (protein.accession) {
        return protein.accession;
    } else {
        return protein.id;
    }
}


export function mostReadableMultipleId(match, matchedPeptideIndex, clmsModel) {
    const mpeptides = match.matchedPeptides[matchedPeptideIndex];
    const proteins = mpeptides ? mpeptides.prt.map(function (pid) {
        return clmsModel.get("participants").get(pid);
    }) : [];
    return proteins.map(function (prot) {
        return mostReadableId(prot);
    }, this).join(";");
}


export function getMatchesCSV() {
    let csv = '"Id","Protein1","SeqPos1","PepPos1","PepSeq1","LinkPos1","Protein2","SeqPos2","PepPos2","PepSeq2","LinkPos2","Score","Charge","ExpMz","ExpMass","CalcMz","CalcMass","MassError","Missing Peaks","AutoValidated","Validated","Search","RawFileName","PeakListFileName","ScanNumber","ScanIndex","CrossLinkerModMass","FragmentTolerance","IonTypes","Decoy1","Decoy2","3D Distance","From Chain","To Chain","LinkType","DecoyType","Retention Time"\r\n';
    const clmsModel = window.compositeModelInst.get("clmsModel");
    const participants = clmsModel.get("participants");
    const distance2dp = d3.format(".2f");

    const crosslinks = window.compositeModelInst.getFilteredCrossLinks("all");
    const matchMap = d3.map();

    // do it like this so ambiguous matches (belonging to >1 crosslink) aren't repeated
    console.log("start map");
    let zz = performance.now();
    crosslinks.forEach(function (crosslink) {
        crosslink.filteredMatches_pp.forEach(function (match) {
            matchMap.set(match.match.id, match.match);
        });
    });
    console.log("finish map", performance.now() - zz, "ms.");
    zz = performance.now();

    matchMap.values().forEach(function (match) {
        const peptides1 = match.matchedPeptides[0];
        const peptides2 = match.matchedPeptides[1];
        const pp1 = utils.pepPosConcat(match, 0);
        const pp2 = utils.pepPosConcat(match, 1);
        const lp1 = utils.fullPosConcat(match, 0);
        const lp2 = utils.fullPosConcat(match, 1);

        const decoy1 = participants.get(peptides1.prt[0]).is_decoy;
        // TODO: looks to rely on "" == false, prob doesn't give right result for linears
        const decoy2 = peptides2 ? participants.get(peptides2.prt[0]).is_decoy : "";

        // Work out distances for this match - ambiguous matches will have >1 crosslink
        const crosslinks = match.crosslinks;
        const distances = window.compositeModelInst.getCrossLinkDistances(crosslinks, {
            includeUndefineds: true,
            returnChainInfo: true,
            calcDecoyProteinDistances: true
        });
        const distances2DArr = distances.map(function (dist) {
            return dist && dist.distance ? [distance2dp(dist.distance), dist.chainInfo.from, dist.chainInfo.to /*, dist.chainInfo.fromRes, dist.chainInfo.toRes*/] : ["", "", ""];//, "", ""];
        });
        const distancesTransposed = d3.transpose(distances2DArr); // transpose so distance data now grouped in array by field (distance, tores, etc)
        const distancesJoined = distancesTransposed.map(function (arr) {
            return arr.join(", ");
        });

        let linkType;
        if (match.isAmbig()) {
            linkType = "Ambig.";
        } else if (participants.get(match.matchedPeptides[0].prt[0]).accession === "___AMBIGUOUS___" || (match.matchedPeptides[1] && participants.get(match.matchedPeptides[1].prt[0]).accession === "___AMBIGUOUS___")) {
            linkType = "__AMBIG__";
        } else if (match.crosslinks[0].isSelfLink()) {
            linkType = "Self";
        } else {
            linkType = "Between";
        }

        const decoyType = (decoy1 && decoy2) ? "DD" : (decoy1 || decoy2 ? "TD" : "TT");
        const retentionTime = match.retentionTime !== undefined ? match.retentionTime : (match.elution_time_end === -1 ? match.elution_time_start : "");

        const data = [
            match.id, mostReadableMultipleId(match, 0, clmsModel), lp1, pp1, peptides1.seq_mods, match.linkPos1, (peptides2 ? mostReadableMultipleId(match, 1, clmsModel) : ""), lp2, pp2, (peptides2 ? peptides2.seq_mods : ""), match.linkPos2, match.score(), match.precursorCharge, match.expMZ(), match.expMass(), match.calcMZ(), match.calcMass(), match.massError(), match.missingPeaks(), match.autovalidated, match.validated, match.searchId, match.runName(), match.peakListFileName(), match.scanNumber, match.scanIndex, match.crosslinkerModMass(), match.fragmentToleranceString(), match.ionTypesString(), decoy1, decoy2, distancesJoined.join('","'), linkType, decoyType, retentionTime
        ];
        csv += '"' + data.join('","') + '"\r\n';
        /*
        }
    }
	*/
    });

    console.log("build string", performance.now() - zz, "ms.");

    //console.log ("MCSV", count, matchMap.values().length);
    return csv;
}

function getSSL() {
    let csv = 'file\tscan\tcharge\tsequence\tscore-type\tscore\tId\tProtein1\tSeqPos1\tPepPos1\tPepSeq1\tLinkPos1\tProtein2\tSeqPos2\tPepPos2\tPepSeq2\tLinkPos2\tCharge\tExpMz\tExpMass\tCalcMz\tCalcMass\tMassError\tAutoValidated\tValidated\tSearch\tRawFileName\tPeakListFileName\tScanNumber\tScanIndex\tCrossLinkerModMass\tFragmentTolerance\tIonTypes\r\n';
    const clmsModel = window.compositeModelInst.get("clmsModel");
    //var mass6dp = d3.format(".6f");

    const deltaMassRegex = /DELTAMASS:(.*)/;
    const massRegex = /MASS:(.*)/;
    const modifiedRegex = /MODIFIED:(.*);/;
    const modificationDeltasMap = new Map();
    for (let search of clmsModel.get("searches").values()) {
        for (let mod of search.modifications) {
            const sym = mod.symbol;
            let delta;
            const desc = mod.description;
            const deltaMatch = +deltaMassRegex.exec(desc);
            if (deltaMatch) {
                delta = deltaMatch[1];
            } else {
                const modified = modifiedRegex.exec(desc)[1];
                delta = massRegex.exec(desc)[1] - modelUtils.amino1toMass[modified];
            }

            if (delta > 0) {
                delta = "[+" + delta + "]";
            } else {
                delta = "[" + delta + "]";
            }

            modificationDeltasMap.set(sym, delta);

        }
    }

    console.log("modDeltas", modificationDeltasMap);


    const crosslinks = window.compositeModelInst.getFilteredCrossLinks("all");
    const matchMap = d3.map();

    // do it like this so ambiguous matches (belonging to >1 crosslink) aren't repeated
    crosslinks.forEach(function (crosslink) {
        crosslink.filteredMatches_pp.forEach(function (match) {
            matchMap.set(match.match.id, match.match);
        });
    });

    const notUpperCase = /[^A-Z]/g;
    const makeSslPepSeq = function (seq, linkPos) {
        notUpperCase.lastIndex = 0;
        if (notUpperCase.test(seq)) {
            for (let modInfo of modificationDeltasMap.entries()) {
                seq = seq.replace(new RegExp(modInfo[0], 'g'), modInfo[1]);
            }
        }
        const sslSeqLinkIndex = findIndexofNthUpperCaseLetter(seq, linkPos);
        return seq.slice(0, sslSeqLinkIndex + 1) + "[+1.008]" + seq.slice(sslSeqLinkIndex + 1, seq.length);
    };
    var findIndexofNthUpperCaseLetter = function (str, n) { // n is 1-indexed here
        str = str || "";
        let i = -1;
        while (n > 0 && i < str.length) {
            i++;
            const c = str[i];
            if (c >= "A" && c <= "Z") n--;
        }
        return i === str.length ? undefined : i;
    };

    matchMap.values().forEach(function (match) {
        const peptide1 = match.matchedPeptides[0];
        const peptide2 = match.matchedPeptides[1];

        const decoy1 = clmsModel.get("participants").get(peptide1.prt[0]).is_decoy;
        // TODO: looks to rely on "" == false, prob doesn't give right result for linears
        const decoy2 = peptide2 ? clmsModel.get("participants").get(peptide2.prt[0]).is_decoy : "";

        let decoyType;
        if (decoy1 && decoy2) {
            decoyType = "DD";
        } else if (decoy1 || decoy2) {
            decoyType = "TD";
        } else {
            decoyType = "TT";
        }

        if (decoyType === "TT") {
            const pep1sslSeq = makeSslPepSeq(peptide1.seq_mods, match.linkPos1);
            const pep2sslSeq = makeSslPepSeq(peptide2.seq_mods, match.linkPos2);
            const crosslinkerModMass = match.crosslinkerModMass();
            //var sequence = pep1sslSeq + "K[+" + (crosslinkerModMass - 112.099857) + "]" + pep2sslSeq;
            const joiningAAModMass = (crosslinkerModMass - 112.099857);
            let sequence = pep1sslSeq;
            if (joiningAAModMass > 0) {
                sequence = sequence + "K[+" + joiningAAModMass + "]" + pep2sslSeq;
            } else {
                sequence = sequence + "K[" + joiningAAModMass + "]" + pep2sslSeq;
            }

            const pp1 = utils.pepPosConcat(match, 0);
            const pp2 = utils.pepPosConcat(match, 1);
            const lp1 = utils.fullPosConcat(match, 0);
            const lp2 = utils.fullPosConcat(match, 1);

            const data = [
                match.peakListFileName(),
                match.scanNumber,
                match.precursorCharge,
                sequence,
                "UNKNOWN",
                match.score(),
                match.id,
                utils.proteinConcat(match, 0, clmsModel),
                lp1,
                pp1,
                peptide1.seq_mods,
                match.linkPos1,
                (peptide1 ? utils.proteinConcat(match, 1, clmsModel) : ""),
                lp2,
                pp2,
                (peptide2 ? peptide2.seq_mods : ""),
                match.linkPos2,
                match.precursorCharge,
                match.expMZ(),
                match.expMass(),
                match.calcMZ(),
                match.calcMass(),
                match.massError(),
                match.autovalidated,
                match.validated,
                match.searchId,
                match.runName(),
                match.peakListFileName(),
                match.scanNumber,
                match.scanIndex,
                match.crosslinkerModMass(),
                match.fragmentToleranceString(),
                match.ionTypesString()
            ];
            csv += data.join('\t') + '\r\n';
        }
    });

    //console.log ("MCSV", count, matchMap.values().length);
    return csv;
}


export function getLinksCSV() {
    const clmsModel = window.compositeModelInst.get("clmsModel");

    let headerArray = ["Protein1", "SeqPos1", "LinkedRes1", "Protein2", "SeqPos2", "LinkedRes2", "Highest Score", "Match Count", "DecoyType", "Self", "AutoValidated", "Validated", "Link FDR", "3D Distance", "From Chain", "To Chain"];//, "PDB SeqPos 1", "PDB SeqPos 2"];
    const searchIDs = Array.from(clmsModel.get("searches").keys());
    searchIDs.forEach(function (sid) {
        headerArray.push("Search_" + sid);
    });
    console.log("searchIds", searchIDs);

    const metaColumns = (clmsModel.get("crosslinkMetaRegistry") || d3.set()).values();
    headerArray = headerArray.concat(metaColumns);

    const headerRow = '"' + headerArray.join('","') + '"';

    const crosslinks = window.compositeModelInst.getFilteredCrossLinks("all");

    const physicalDistances = window.compositeModelInst.getCrossLinkDistances(crosslinks, {
        includeUndefineds: true,
        returnChainInfo: true,
        calcDecoyProteinDistances: true
    });
    //console.log ("pd", physicalDistances);
    const distance2dp = d3.format(".2f");

    const rows = crosslinks.map(function (crosslink, i) {
        const row = [];
        const linear = crosslink.isLinearLink();
        const filteredMatchesAndPepPos = crosslink.filteredMatches_pp;
        row.push(
            mostReadableId(crosslink.fromProtein), crosslink.fromResidue, crosslink.fromProtein.sequence? crosslink.fromProtein.sequence[crosslink.fromResidue - 1] : "",
            (linear ? "" : mostReadableId(crosslink.toProtein)), crosslink.toResidue, !linear && crosslink.toResidue && crosslink.toProtein.sequence? crosslink.toProtein.sequence[crosslink.toResidue - 1] : ""
        );

        let highestScore = null;
        const searchesFound = new Set();
        const filteredMatchCount = filteredMatchesAndPepPos.length; // me n lutz fix
        let linkAutovalidated = false;
        const validationStats = [];
        for (let fm_pp = 0; fm_pp < filteredMatchCount; fm_pp++) {
            const match = filteredMatchesAndPepPos[fm_pp].match;
            if (highestScore == null || match.score() > highestScore) {
                highestScore = match.score().toFixed(4);
            }
            if (match.autovalidated === true) {
                linkAutovalidated = true;
            }
            validationStats.push(match.validated);
            searchesFound.add(match.searchId);
        }

        let decoyType;
        if (linear) {
            if (crosslink.fromProtein.is_decoy) {
                decoyType = "D";
            } else {
                decoyType = "T";
            }
        } else {
            const decoy1 = crosslink.fromProtein.is_decoy;
            const decoy2 = crosslink.toProtein.is_decoy;
            if (decoy1 && decoy2) {
                decoyType = "DD";
            } else if (decoy1 || decoy2) {
                decoyType = "TD";
            } else {
                decoyType = "TT";
            }
        }

        row.push(highestScore, filteredMatchCount, decoyType, crosslink.isSelfLink(), linkAutovalidated, validationStats.toString(), crosslink.getMeta("fdr"));

        // Distance info
        const pDist = physicalDistances[i];
        if (pDist && pDist.distance) {
            const chain = pDist.chainInfo;
            row.push(distance2dp(pDist.distance), chain.from, chain.to);//, chain.fromRes + 1, chain.toRes + 1); // +1 to return to 1-INDEXED
        } else {
            row.push("", "", "");
        }

        // Add presence in searches
        for (let s = 0; s < searchIDs.length; s++) {
            row.push(searchesFound.has(searchIDs[s]) ? "X" : "");
        }

        // Add metadata information
        for (let m = 0; m < metaColumns.length; m++) {
            const mval = crosslink.getMeta(metaColumns[m]);
            row.push(mval === undefined ? "" : mval);
        }

        return '"' + row.join('","') + '"';
    }, this);

    rows.unshift(headerRow);
    return rows.join("\r\n") + '\r\n';
}

function getPPIsCSV() {
    const clmsModel = window.compositeModelInst.get("clmsModel");
    const headerArray = ["Protein1", "Protein2", "Unique Distance Restraints", "DecoyType"];
    const searchIDs = Array.from(clmsModel.get("searches").keys());
    searchIDs.forEach(function (sid) {
        headerArray.push("Search_" + sid);
    });

    const headerRow = '"' + headerArray.join('","') + '"';
    const rows = [headerRow];

    const crosslinks = window.compositeModelInst.getFilteredCrossLinks("all");

    const ppiMap = new Map();

    for (let crosslink of crosslinks) {
        // its ok, fromProtein and toProtein are already alphabetically ordered
        let ppiId = crosslink.fromProtein.id;
        if (!crosslink.isLinearLink()) {
            ppiId = ppiId + "-" + crosslink.toProtein.id;
        }
        let ppi = ppiMap.get(ppiId);
        if (!ppi) {
            ppi = [];
            ppiMap.set(ppiId, ppi);
        }
        ppi.push(crosslink);
    }

    for (let ppi of ppiMap.values()) {
        const row = [];
        const aCrosslink = ppi[0];
        const linear = aCrosslink.isLinearLink();
        const decoyType = getDecoyTypeFromCrosslink(aCrosslink);

        const searchesFound = new Set();
        for (let crosslink of ppi){
            const filteredMatchesAndPepPos = crosslink.filteredMatches_pp;
            for (let fm_pp of filteredMatchesAndPepPos) {
                const match = fm_pp.match;
                searchesFound.add(match.searchId);
            }
        }

        row.push(mostReadableId(aCrosslink.fromProtein), (linear ? "" : mostReadableId(aCrosslink.toProtein)), ppi.length, decoyType);

        // // Add presence in searches
        for (let s = 0; s < searchIDs.length; s++) {
            row.push(searchesFound.has(searchIDs[s]) ? "X" : "");
        }
        //
        // // Add metadata information
        // for (var m = 0; m < metaColumns.length; m++) {
        //     var mval = crosslink.getMeta(metaColumns[m]);
        //     row.push(mval === undefined ? "" : mval);
        // }

        rows.push('"' + row.join('","') + '"');

    }

    return rows.join("\r\n") + '\r\n';
}

function getDecoyTypeFromCrosslink (aCrosslink) {
    let decoyType;
    if (aCrosslink.isLinearLink()) {
        if (aCrosslink.fromProtein.is_decoy) {
            decoyType = "D";
        } else {
            decoyType = "T";
        }
    } else {
        const decoy1 = aCrosslink.fromProtein.is_decoy;
        const decoy2 = aCrosslink.toProtein.is_decoy;
        if (decoy1 && decoy2) {
            decoyType = "DD";
        } else if (decoy1 || decoy2) {
            decoyType = "TD";
        } else {
            decoyType = "TT";
        }
    }
    return decoyType;
}

export function getResidueCount() {
    let csv = '"Residue(s)","Occurences(in_unique_links)"\r\n';
    //~ var matches = xlv.matches;//.values();
    //~ var matchCount = matches.length;
    const residueCountMap = d3.map();
    const residuePairCountMap = d3.map();

    const crosslinks = window.compositeModelInst.getFilteredCrossLinks("all"); // already pre-filtered
    crosslinks.forEach(function (residueLink) {
        const linkedRes1 = residueLink.fromProtein.sequence[residueLink.fromResidue - 1] || "";
        const linkedRes2 = residueLink.isLinearLink() ? "" : residueLink.toProtein.sequence[residueLink.toResidue - 1];
        incrementCount(residueCountMap, linkedRes1);
        incrementCount(residueCountMap, linkedRes2);

        const pairId = (linkedRes1 > linkedRes2) ? linkedRes2 + "-" + linkedRes1 : linkedRes1 + "-" + linkedRes2;
        incrementCount(residuePairCountMap, pairId);
    });

    residuePairCountMap.forEach(function (k, v) {
        csv += '"' + k + '","' +
            v + '"\r\n';
    });
    residueCountMap.forEach(function (k, v) {
        csv += '"' + k + '","' +
            v + '"\r\n';
    });

    function incrementCount(map, res) {
        let c = parseInt(map.get(res));
        if (isNaN(c)) {
            map.set(res, 1);
        } else {
            c++;
            map.set(res, c);
        }
    }

    return csv;
}

function getModificationCount() {
    let csv = '"Modification(s)","TT","TD","DD"\r\n';
    const matches = window.compositeModelInst.get("clmsModel").get("matches");

    const modCountMap = new Map();
    const modByResCountMap = new Map();
    const regex = /[A-Z]([a-z0-9]+)/g;
    const filterModel = window.compositeModelInst.get("filterModel");
    const clmsModel = window.compositeModelInst.get("clmsModel");

    for (let match of matches) {
        const pass = filterModel.subsetFilter(match) &&
            filterModel.validationStatusFilter(match) &&
            filterModel.scoreFilter(match) &&
            filterModel.decoyFilter(match);

        if (pass) {

            const peptide1 = match.matchedPeptides[0];
            const peptide2 = match.matchedPeptides[1];

            const decoy1 = clmsModel.get("participants").get(peptide1.prt[0]).is_decoy;
            const decoy2 = peptide2 ? clmsModel.get("participants").get(peptide2.prt[0]).is_decoy : false;

            let decoyTypeIndex;
            if (decoy1 && decoy2) {
                decoyTypeIndex = 2;
            } else if (decoy1 || decoy2) {
                decoyTypeIndex = 1;
            } else {
                decoyTypeIndex = 0;
            }

            countMods(match.matchedPeptides[0].seq_mods, decoyTypeIndex);
            if (match.matchedPeptides[1]) {
                countMods(match.matchedPeptides[1].seq_mods, decoyTypeIndex)
            }
        }
    }

    function countMods(pep, decoyIndex) {
        const result = pep.matchAll(regex);
        if (result) {
            const modSet = new Set();
            const modByResSet = new Set();
            for (let m of result) {
                //console.log(pep, "::", m);
                modSet.add(m[1]);
                modByResSet.add(m[0]);
            }
            for (let mod of modSet) {
                const modCount = modCountMap.get(mod);
                if (typeof modCount == "undefined") {
                    var counts = [0, 0, 0];
                    modCountMap.set(mod, counts);
                    counts[decoyIndex] = counts[decoyIndex] + 1;
                } else {
                    ++modCount[decoyIndex];
                }
            }
            for (let modByRes of modByResSet) {
                const modByResCount = modByResCountMap.get(modByRes);
                if (!modByResCount) {
                    var counts = [0, 0, 0];
                    modByResCountMap.set(modByRes, counts);
                    ++counts[decoyIndex];
                } else {
                    ++modByResCount[decoyIndex];
                }
            }
        }
    }

    // var mapSort1 = new Map([...modCountMap.entries()].sort((a, b) => b[1] - a[1]));
    // var mapSort2 = new Map([...modByResCountMap.entries()].sort((a, b) => b[1] - a[1]));

    for (var e of modCountMap.entries()) {
        csv += '"' + e[0] + '","' + e[1][0] + '","' + e[1][1] + '","' + e[1][2] + '"\r\n';
    }


    csv += '"",,,""\r\n"",,,""\r\n"",,,""\r\n';

    for (var e of modByResCountMap.entries()) {
        csv += '"' + e[0] + '","' + e[1][0] + '","' + e[1][1] + '","' + e[1][2] + '"\r\n';
    }


    return csv;
}

function getProteinAccessions() {
    const accs = [];
    const proteins = window.compositeModelInst.get("clmsModel").get("participants").values();
    for (let p of proteins) {
        if (!p.hidden) {
            accs.push(p.accession);
        }
    }
    return accs.join(",");
}

function getGroups() {
    const headerArray = ["ProteinID", "Name", "Complex"];
    const headerRow = '"' + headerArray.join('","') + '"';
    const rows = [headerRow];

    const clmsModel = window.compositeModelInst.get("clmsModel");
    const groups = window.compositeModelInst.get("groups");
    console.log("**", groups);
    const proteins = clmsModel.get("participants").values();
    for (let p of proteins) {
        if (!p.is_decoy) {
            const row = [p.id, p.name];
            const protGroups = [];
            for (let g of groups.entries()) {
                if (g[1].has(p.id)) {
                    protGroups.push(g[0]);
                }
            }
            row.push(protGroups.join(","));
            rows.push('"' + row.join('","') + '"');
        }
    }
    return rows.join("\r\n") + '\r\n';
}

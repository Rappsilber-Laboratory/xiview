import {downloadFilename} from "../../downloads";

export const NGLExportUtils = {

    exportPDB: function (structure, nglModelWrapper, name, remarks) {
        const PDBLinks = nglModelWrapper.getPDBLinkString(nglModelWrapper.getFullLinks());
        const PDBConects = nglModelWrapper.getPDBConectString(nglModelWrapper.getFullLinks());
        //console.log ("ATOMPAIRS", PDBLinks, PDBConects);
        let PDBRemarks = remarks.map(function (remark) {
            return remark.match(/.{1,69}/g);
        });  // chop remarks into strings of max-length 69
        PDBRemarks = d3.merge(PDBRemarks);
        PDBRemarks.unshift("");
        PDBRemarks = PDBRemarks.map(function (remark) {
            return "  3 " + remark;
        });

        const writer = new NGL.PdbWriter(structure, {renumberSerial: false, remarks: PDBRemarks});
        writer.oldGetData = writer.getData;
        writer.getData = function () {
            const data = this.oldGetData();
            const linkInsert = data.indexOf("\nMODEL") + 1;
            const conectInsert = data.lastIndexOf("END");
            return data.substring(0, linkInsert) + PDBLinks + "\n" + data.slice(linkInsert, conectInsert) + PDBConects + "\n" + data.slice(conectInsert);
        };

        writer.download(name || structure.name + "-Crosslinked");
    },

    exportPymolCrossLinkSyntax: function (structure, nglModelWrapper, name, remarks) {
        const crosslinks = nglModelWrapper.getFullLinks();
        const pymolLinks = NGLExportUtils.makePymolCrossLinkSyntax(structure, crosslinks, remarks);
        const fileName = downloadFilename("pymol", "pml");
        download(pymolLinks.join("\r\n"), "plain/text", fileName);
    },

    makePymolCrossLinkSyntax: function (structure, links, remarks) {
        const pdbids = structure.chainToOriginalStructureIDMap || {};
        const cp = structure.getChainProxy();
        const rp = structure.getResidueProxy();

        const remarkLines = (remarks || []).map(function (remark) {
            return "# " + remark;
        });

        let pdbs = d3.set(d3.values(pdbids)).values();
        if (_.isEmpty(pdbs)) {
            pdbs = [structure.name];
        }

        const localFile = typeof (this.pdbSettings[0].pdbCode) === "undefined";
        const pdbLines = pdbs.map(function (pdb) {
            return (localFile ? "load " : "fetch ") + pdb + (localFile ? "" : ", async=0");
        });

        const crosslinkLines = links.map(function (link) {
            cp.index = link.residueA.chainIndex;
            const chainA = cp.chainname;
            cp.index = link.residueB.chainIndex;
            const chainB = cp.chainname;
            rp.index = link.residueA.NGLglobalIndex;
            const name1 = rp.qualifiedName().replace("/", ":");
            rp.index = link.residueB.NGLglobalIndex;
            const name2 = rp.qualifiedName().replace("/", ":");

            let pdbIdA = (pdbids[link.residueA.chainIndex] || structure.name);
            let pdbIdB = (pdbids[link.residueB.chainIndex] || structure.name);

            if (localFile) {
                pdbIdA = pdbIdA.replace(".pdb", "");
                pdbIdB = pdbIdB.replace(".pdb", "");
            }

            return "distance " + name1 + "-" + name2 +
                ", resi " + link.residueA.resno + " and name CA and chain " + chainA + " and " + pdbIdA +
                ", resi " + link.residueB.resno + " and name CA and chain " + chainB + " and " + pdbIdB
                ;
        });

        const lines = remarkLines.concat(pdbLines, crosslinkLines);
        return lines;
    },

    export3dLinksCSV: function (structure, nglModelWrapper, name, selectedOnly) {
        const crosslinks = nglModelWrapper.getFullLinks();
        const linkExportArray = NGLExportUtils.make3dLinkSyntax(structure, crosslinks, nglModelWrapper, selectedOnly);
        const fileName = downloadFilename("CSV_NGL", "csv");
        download(linkExportArray.join("\r\n"), "plain/text", fileName);
    },

    make3dLinkSyntax: function (structure, links, nglModelWrapper, selectedOnly) {
        const pdbIds = structure.chainToOriginalStructureIDMap || {};
        const chainProxy = structure.getChainProxy();
        const selectedLinkIds = nglModelWrapper.get("compositeModel").get("selection").map(l => l.id);
        const crosslinkMap = nglModelWrapper.get("compositeModel").get("clmsModel").get("crosslinks");

        const header = ["model,protein1,chain1,res1,protein2,chain2,res2,distance"];
        const crosslinkLines = [];
        for (let link of links) {
            if (!selectedOnly || selectedLinkIds.indexOf(link.origId) !== -1) {
                chainProxy.index = link.residueA.chainIndex;
                const chainA = chainProxy.chainname;
                chainProxy.index = link.residueB.chainIndex;
                const chainB = chainProxy.chainname;
                // .getXLinkDistanceFromPDBCoords (matrices, seqIndex1, seqIndex2, chainIndex1, chainIndex2);
                const distObj = window.compositeModelInst.get("clmsModel").get("distancesObj");

                const xiviewLink = crosslinkMap.get(link.origId);
                const p1 = xiviewLink.fromProtein.accession;
                const p2 = xiviewLink.toProtein.accession;

                crosslinkLines.push((pdbIds[link.residueA.chainIndex] || structure.name) + ","
                    + p1 + "," + chainA + "," + link.residueA.resno + ","
                    + p2 + "," + chainB + "," + link.residueB.resno + ","
                    + distObj.getXLinkDistanceFromPDBCoords(distObj.matrices, link.residueA.seqIndex, link.residueB.seqIndex, link.residueA.chainIndex, link.residueB.chainIndex));
            }
        }

        return header.concat(crosslinkLines);
    },

    exportChimeraPseudobonds: function (structure, nglModelWrapper, name, selectedOnly) {
        const chainProxy = structure.getChainProxy();
        const bondArray = [];
        const crosslinkMap = nglModelWrapper.get("compositeModel").get("clmsModel").get("crosslinks");
        const colorScheme = nglModelWrapper.get("compositeModel").get("linkColourAssignment");

        for (let link of nglModelWrapper.getFullLinks()) {
            chainProxy.index = link.residueA.chainIndex;
            const chainA = chainProxy.chainname;
            chainProxy.index = link.residueB.chainIndex;
            const chainB = chainProxy.chainname;

            const xiviewLink = crosslinkMap.get(link.origId);
            const color = colorScheme.getColour(xiviewLink);

            bondArray.push("/" + chainA + ":" + link.residueA.resno + "@CA /" + chainB + ":" + link.residueB.resno + "@CA " + color);
        }
        const fileName = downloadFilename("ChimeraX", "pb");
        download(bondArray.join("\r\n"), "plain/text", fileName);
    },

    exportJWalk: function (structure, nglModelWrapper) {
        const chainProxy = structure.getChainProxy();
        const crosslinkLines = [];
        for (let link of nglModelWrapper.getFullLinks()) {
            chainProxy.index = link.residueA.chainIndex;
            const chainA = chainProxy.chainname;
            chainProxy.index = link.residueB.chainIndex;
            const chainB = chainProxy.chainname;
            crosslinkLines.push(link.residueA.resno + "|" + chainA + "|" + link.residueB.resno + "|" + chainB + "|");
        }
        const fileName = downloadFilename("jWalk", "txt");
        download(crosslinkLines.join("\r\n"), "plain/text", fileName);
    },


    exportXlinkAnalyzer: function (structure, nglModelWrapper, name, selectedOnly) {
        const csvFileName = downloadFilename("xlinkAnalyzer_CSV", "csv");

        const json = {
            data: [{
                "fileGroup": {
                    "files": [
                        "./" + csvFileName
                    ]
                },
                "mapping": {},
                "name": "xiVIEW export",
                "type": "Xlink Analyzer"
            }],
            subcomplexes: [],
            subunits: [],
            xlinkanalyzerVersion: "1.1.1"
        };

        const xiViewProteins = nglModelWrapper.get("compositeModel").get("clmsModel").get("participants"); // ECMA map
        const mapping = json.data[0].mapping;

        for (let prot of xiViewProteins.values()) {
            if (!prot.is_decoy) {
                mapping[prot.id] = [prot.id];
            }
        }

        const chainProxy = structure.getChainProxy();
        const subunits = new Map();
        const crosslinkMap = nglModelWrapper.get("compositeModel").get("clmsModel").get("crosslinks");

        const header = ["Protein1,Protein2,AbsPos1,AbsPos2,score"];
        const crosslinkLines = [];
        for (let link of nglModelWrapper.getFullLinks()) {
            chainProxy.index = link.residueA.chainIndex;
            const chainA = chainProxy.chainname;
            chainProxy.index = link.residueB.chainIndex;
            const chainB = chainProxy.chainname;

            const xiviewLink = crosslinkMap.get(link.origId);
            const p1 = xiviewLink.fromProtein.id;
            const p2 = xiviewLink.toProtein.id;

            //todo - highestScore as function of crosslink
            const scores = xiviewLink.filteredMatches_pp.map(function (m) {
                return m.match.score();
            });
            const highestScore = Math.max.apply(Math, scores);

            crosslinkLines.push(p1 + "," + p2 + "," + link.residueA.resno + "," + link.residueB.resno + "," + highestScore);


            if (!subunits.has(p1)) {
                subunits.set(p1, new Set());
            }
            subunits.get(p1).add(chainA);

            if (!subunits.has(p2)) {
                subunits.set(p2, new Set());
            }
            subunits.get(p2).add(chainB);

        }

        //json.subunits = Array.from(subunits.keys());

        for (let subunit of subunits.entries()) {
            const chainIdArr = Array.from(subunit[1].values())
            const selString = ":." + chainIdArr.join(",.");
            const su = {
                "chainIds": chainIdArr,
                "color": [
                    0.0,
                    0.0,
                    0.0,
                    1.0
                ],
                "domains": [],
                "info": {},
                "name": subunit[0],
                "selection": selString
            };
            json.subunits.push(su);
        }

        download(header.concat(crosslinkLines).join("\r\n"), "plain/text", csvFileName);
        const jsonFileName = downloadFilename("xlinkAnalyzer", "json");
        download(JSON.stringify(json, null, 4), "json", jsonFileName);
    },

    exportHaddockCrossLinkSyntax: function (structure, nglModelWrapper, name, remarks, crosslinkerObj) {
        const crosslinks = nglModelWrapper.getFullLinks();
        const haddockLinks = NGLExportUtils.makeHaddockCrossLinkSyntax(structure, crosslinks, remarks, crosslinkerObj);
        const fileName = downloadFilename("haddock", "tbl");
        download(haddockLinks.join("\r\n"), "plain/text", fileName);
    },

    makeHaddockCrossLinkSyntax: function (structure, links, remarks, crosslinkerObj) {
        //console.log ("CLO", crosslinkerObj);
        const str = ["zeroth", "first", "second", "third", "fourth", "fifth", "next"];
        const pdbids = structure.chainToOriginalStructureIDMap || {};

        const remarkLines = (remarks || []).map(function (remark) {
            return "! " + remark;
        });

        const crosslinkers = d3.values(crosslinkerObj.crosslinkerInfo);
        crosslinkers.push({id: "default", name: "default", restraints: "12.0 10.0 18.0"});
        const restraints = d3.map(crosslinkers, function (d) {
            return d.id;
        });

        let pdbs = d3.set(d3.values(pdbids)).values();
        if (_.isEmpty(pdbs)) {
            pdbs = [structure.name];
        }
        const pdbLines = pdbs.map(function (pdb, i) {
            return "! upload " + pdb + " as " + str[Math.min(i + 1, 6)] + " file";
        });

        const interModelLinks = links.filter(function (link) {
            return link.residueA.modelIndex != link.residueB.modelIndex;
        });

        const crosslinkLines = {};
        crosslinkers.forEach(function (clinker) {
            crosslinkLines[clinker.id] = ["! " + clinker.name + " based length restraints"];
        });
        const origCrossLinks = crosslinkerObj.crosslinks;
        interModelLinks.forEach(function (link) {
            const origLink = origCrossLinks.get(link.origId);
            // get crosslinkers used by this crosslink
            let crosslinkerIDs =
                (origLink ? d3.set(origLink.filteredMatches_pp.map(function (match) {
                    return match.match.crosslinker_id;
                })).values() : [])
                    .map(function (clid) {
                        return clid === "undefined" ? "default" : clid;
                    })
            ;
            if (_.isEmpty(crosslinkerIDs)) {
                crosslinkerIDs = ["default"];
            }

            // add a restraint line for each different crosslinker
            crosslinkerIDs.forEach(function (clid) {
                //console.log ("clid", clid, restraints);
                const clRestraints = restraints.get(clid).restraints || restraints.get("default").restraints;
                const line = "assign" +
                    " (segid " + String.fromCharCode(65 + link.residueA.modelIndex) + " and name CA and resi " + link.residueA.resno + ")" +
                    " (segid " + String.fromCharCode(65 + link.residueB.modelIndex) + " and name CA and resi " + link.residueB.resno + ")" +
                    " " + clRestraints
                ;
                crosslinkLines[clid].push(line);
            });
        });

        // merge all the lines together (this keeps them grouped by crosslinker, rather than crosslink)
        const allCrossLinkLines = d3.merge(d3.values(crosslinkLines));

        const lines = remarkLines.concat(pdbLines, allCrossLinkLines);
        return lines;
    }
};

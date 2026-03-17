/**
 * @fileoverview Export utilities for Molstar 3D structures to various formats.
 * Replaces NGLExportUtils.js. Chain name lookup uses modelWrapper.getChainName() and
 * modelWrapper.getStructureIDForChain() instead of NGL chain proxies.
 * PDB export uses MolstarPdbWriter instead of NGL.PdbWriter.
 */

import _ from "underscore";
import d3 from "d3";
import { download, downloadFilename } from "../../downloads";
import { MolstarUtils } from "./RepopulateMolstar";

/**
 * Molstar export utilities namespace.
 * @namespace MolstarExportUtils
 */
export const MolstarExportUtils = {

    /**
     * Exports PDB structure with crosslink LINK and CONECT records.
     * Uses MolstarPdbWriter to generate ATOM records, inserts LINK/CONECT.
     */
    exportPDB: async function (modelWrapper, name, remarks) {
        const { writePDB } = await import("./MolstarPdbWriter");
        const PDBLinks = modelWrapper.getPDBLinkString(modelWrapper.getFullLinks());
        const PDBConects = modelWrapper.getPDBConectString(modelWrapper.getFullLinks());

        let PDBRemarks = remarks.map((r) => r.match(/.{1,69}/g));
        PDBRemarks = d3.merge(PDBRemarks);
        PDBRemarks.unshift("");
        PDBRemarks = PDBRemarks.map((r) => "  3 " + r);

        const atomData = writePDB(modelWrapper.get("modelInfoArr"), { remarks: PDBRemarks });

        // Insert LINK records after first line, CONECT records before END
        const linkInsert = atomData.indexOf("\n") + 1;
        const conectInsert = atomData.lastIndexOf("END");
        const fullPDB = atomData.substring(0, linkInsert)
            + PDBLinks + "\n"
            + atomData.slice(linkInsert, conectInsert)
            + PDBConects + "\n"
            + atomData.slice(conectInsert);

        const blob = new Blob([fullPDB], { type: "text/plain" });
        download(blob, name || modelWrapper.getStructureName() + "-Crosslinked.pdb");
    },

    exportPymolCrossLinkSyntax: function (modelWrapper, name, remarks) {
        const crosslinks = modelWrapper.getFullLinks();
        const lines = MolstarExportUtils.makePymolCrossLinkSyntax(modelWrapper, crosslinks, remarks);
        const fileName = downloadFilename("pymol", "pml");
        download(lines.join("\r\n"), "plain/text", fileName);
    },

    makePymolCrossLinkSyntax: function (modelWrapper, links, remarks) {
        const remarkLines = (remarks || []).map((r) => "# " + r);

        const structureName = modelWrapper.getStructureName();
        const pdbids = {};
        (modelWrapper.get("modelInfoArr") || []).forEach((info) => {
            pdbids[info.id] = info.id;
        });

        const localFile = !!(MolstarUtils.pdbSettings && MolstarUtils.pdbSettings[0] &&
            typeof MolstarUtils.pdbSettings[0].pdbCode === "undefined");

        let pdbs = Object.values(pdbids);
        if (!pdbs.length) pdbs = [structureName];

        const pdbLines = pdbs.map((pdb) =>
            (localFile ? "load " : "fetch ") + pdb + (localFile ? "" : ", async=0")
        );

        const crosslinkLines = links.map((link) => {
            const chainA = modelWrapper.getChainName(link.residueA.chainIndex);
            const chainB = modelWrapper.getChainName(link.residueB.chainIndex);
            let pdbIdA = modelWrapper.getStructureIDForChain(link.residueA.chainIndex) || structureName;
            let pdbIdB = modelWrapper.getStructureIDForChain(link.residueB.chainIndex) || structureName;

            if (localFile) {
                pdbIdA = pdbIdA.replace(/(\.pdb)|(\.cif)/, "");
                pdbIdB = pdbIdB.replace(/(\.pdb)|(\.cif)/, "");
            }

            const name1 = link.residueA.resno + "/" + chainA;
            const name2 = link.residueB.resno + "/" + chainB;

            return "distance " + name1 + "-" + name2 +
                ", resi " + link.residueA.resno + " and name CA and chain " + chainA + " and " + pdbIdA +
                ", resi " + link.residueB.resno + " and name CA and chain " + chainB + " and " + pdbIdB;
        });

        return remarkLines.concat(pdbLines, crosslinkLines);
    },

    export3dLinksCSV: function (modelWrapper, name, selectedOnly) {
        const crosslinks = modelWrapper.getFullLinks();
        const lines = MolstarExportUtils.make3dLinkSyntax(crosslinks, modelWrapper, selectedOnly);
        const fileName = downloadFilename(modelWrapper.get("compositeModel"), "CSV_Molstar", "csv");
        download(lines.join("\r\n"), "plain/text", fileName);
    },

    make3dLinkSyntax: function (links, modelWrapper, selectedOnly) {
        const compositeModel = modelWrapper.get("compositeModel");
        const selectedLinkIds = compositeModel.get("selection").map((l) => l.id);
        const crosslinkMap = compositeModel.get("clmsModel").getCrosslinks();
        const structureName = modelWrapper.getStructureName();

        const header = ["backbone-models,protein1,chain1,res1,protein2,chain2,res2,distance"];
        const crosslinkLines = [];

        for (const link of links) {
            if (selectedOnly && selectedLinkIds.indexOf(link.origId) === -1) continue;
            const chainA = modelWrapper.getChainName(link.residueA.chainIndex);
            const chainB = modelWrapper.getChainName(link.residueB.chainIndex);
            const distObj = compositeModel.get("distancesObj");
            const xiviewLink = crosslinkMap.get(link.origId);
            const p1 = xiviewLink.fromProtein.accession;
            const p2 = xiviewLink.toProtein.accession;
            const pdbIdA = modelWrapper.getStructureIDForChain(link.residueA.chainIndex) || structureName;

            crosslinkLines.push(pdbIdA + ","
                + p1 + "," + chainA + "," + link.residueA.resno + ","
                + p2 + "," + chainB + "," + link.residueB.resno + ","
                + distObj.getXLinkDistanceFromPDBCoords(distObj.matrices, link.residueA.seqIndex, link.residueB.seqIndex, link.residueA.chainIndex, link.residueB.chainIndex)
            );
        }

        return header.concat(crosslinkLines);
    },

    exportHalfInLinksCSV: function (modelWrapper, name, selectedOnly) {
        const links = modelWrapper.getHalfLinks();
        const lines = MolstarExportUtils.makeHalfInLinkSyntax(links, modelWrapper, selectedOnly);
        const fileName = downloadFilename("half-in-Molstar", "csv");
        download(lines.join("\r\n"), "plain/text", fileName);
    },

    makeHalfInLinkSyntax: function (links, modelWrapper, selectedOnly) {
        const compositeModel = modelWrapper.get("compositeModel");
        const selectedLinkIds = compositeModel.get("selection").map((l) => l.id);
        const crosslinkMap = compositeModel.get("clmsModel").getCrosslinks();
        const structureName = modelWrapper.getStructureName();

        const header = ["backbone-models,protein1,chain1,res1,protein2"];
        const crosslinkLines = [];

        for (const link of links) {
            if (selectedOnly && selectedLinkIds.indexOf(link.origId) === -1) continue;
            const chainA = modelWrapper.getChainName(link.residue.chainIndex);
            const xiviewLink = crosslinkMap.get(link.origId);
            const p1 = xiviewLink.fromProtein.accession;
            const p2 = xiviewLink.toProtein.accession;
            const pdbIdA = modelWrapper.getStructureIDForChain(link.residue.chainIndex) || structureName;

            crosslinkLines.push(pdbIdA + ","
                + p1 + "," + chainA + "," + link.residue.resno + ","
                + p2);
        }

        return header.concat(crosslinkLines);
    },

    // eslint-disable-next-line no-unused-vars
    exportChimeraPseudobonds: function (modelWrapper, name, selectedOnly) {
        const compositeModel = modelWrapper.get("compositeModel");
        const crosslinkMap = compositeModel.get("clmsModel").getCrosslinks();
        const colorScheme = compositeModel.get("linkColourAssignment");
        const bondArray = [];

        for (const link of modelWrapper.getFullLinks()) {
            const chainA = modelWrapper.getChainName(link.residueA.chainIndex);
            const chainB = modelWrapper.getChainName(link.residueB.chainIndex);
            const xiviewLink = crosslinkMap.get(link.origId);
            const color = colorScheme.getColour(xiviewLink);
            bondArray.push("#1/" + chainA + ":" + link.residueA.resno + "@CA #1/" + chainB + ":" + link.residueB.resno + "@CA " + color);
        }

        const fileName = downloadFilename("ChimeraX", "pb");
        download(bondArray.join("\r\n"), "plain/text", fileName);
    },

    exportJWalk: function (modelWrapper) {
        const crosslinkLines = [];
        for (const link of modelWrapper.getFullLinks()) {
            const chainA = modelWrapper.getChainName(link.residueA.chainIndex);
            const chainB = modelWrapper.getChainName(link.residueB.chainIndex);
            crosslinkLines.push(link.residueA.resno + "|" + chainA + "|" + link.residueB.resno + "|" + chainB + "|");
        }
        const fileName = downloadFilename("jWalk", "txt");
        download(crosslinkLines.join("\r\n"), "plain/text", fileName);
    },

    // eslint-disable-next-line no-unused-vars
    exportXlinkAnalyzer: function (modelWrapper, name, selectedOnly) {
        const csvFileName = downloadFilename("xlinkAnalyzer_CSV", "csv");
        const compositeModel = modelWrapper.get("compositeModel");

        const json = {
            data: [{
                "fileGroup": { "files": ["./" + csvFileName] },
                "mapping": {},
                "name": "xiVIEW export",
                "type": "Xlink Analyzer"
            }],
            subcomplexes: [],
            subunits: [],
            xlinkanalyzerVersion: "1.1.1"
        };

        const xiViewProteins = compositeModel.get("clmsModel").getProteinsMap();
        const mapping = json.data[0].mapping;
        for (const prot of xiViewProteins.values()) {
            if (!prot.is_decoy) mapping[prot.id] = [prot.id];
        }

        const subunits = new Map();
        const crosslinkMap = compositeModel.get("clmsModel").getCrosslinks();
        const header = ["Protein1,Protein2,AbsPos1,AbsPos2,score"];
        const crosslinkLines = [];

        for (const link of modelWrapper.getFullLinks()) {
            const chainA = modelWrapper.getChainName(link.residueA.chainIndex);
            const chainB = modelWrapper.getChainName(link.residueB.chainIndex);
            const xiviewLink = crosslinkMap.get(link.origId);
            const p1 = xiviewLink.fromProtein.id;
            const p2 = xiviewLink.toProtein.id;
            const scores = xiviewLink.filteredMatches_pp.map((m) => m.match.score());
            const highestScore = Math.max(...scores);

            crosslinkLines.push(p1 + "," + p2 + "," + link.residueA.resno + "," + link.residueB.resno + "," + highestScore);

            if (!subunits.has(p1)) subunits.set(p1, new Set());
            subunits.get(p1).add(chainA);
            if (!subunits.has(p2)) subunits.set(p2, new Set());
            subunits.get(p2).add(chainB);
        }

        for (const [subunit, chainSet] of subunits) {
            const chainIdArr = Array.from(chainSet);
            json.subunits.push({
                "chainIds": chainIdArr,
                "color": [0, 0, 0, 1],
                "domains": [],
                "info": {},
                "name": subunit,
                "selection": ":." + chainIdArr.join(",.")
            });
        }

        download(header.concat(crosslinkLines).join("\r\n"), "plain/text", csvFileName);
        const jsonFileName = downloadFilename("xlinkAnalyzer", "json");
        download(JSON.stringify(json, null, 4), "json", jsonFileName);
    },

    exportHaddockCrossLinkSyntax: function (modelWrapper, name, remarks, crosslinkerObj) {
        const links = modelWrapper.getFullLinks();
        const lines = MolstarExportUtils.makeHaddockCrossLinkSyntax(modelWrapper, links, remarks, crosslinkerObj);
        const fileName = downloadFilename("haddock", "tbl");
        download(lines.join("\r\n"), "plain/text", fileName);
    },

    makeHaddockCrossLinkSyntax: function (modelWrapper, links, remarks, crosslinkerObj) {
        const str = ["zeroth", "first", "second", "third", "fourth", "fifth", "next"];

        const remarkLines = (remarks || []).map((r) => "! " + r);

        const crosslinkers = d3.values(crosslinkerObj.crosslinkerInfo);
        crosslinkers.push({ id: "default", name: "default", restraints: "12.0 10.0 18.0" });
        const restraints = d3.map(crosslinkers, (d) => d.id);

        const structureName = modelWrapper.getStructureName();
        const pdbids = {};
        (modelWrapper.get("modelInfoArr") || []).forEach((info) => { pdbids[info.id] = info.id; });
        let pdbs = Object.values(pdbids);
        if (!pdbs.length) pdbs = [structureName];

        const pdbLines = pdbs.map((pdb, i) => "! upload " + pdb + " as " + str[Math.min(i + 1, 6)] + " file");

        const interModelLinks = links.filter((l) => l.residueA.modelIndex !== l.residueB.modelIndex);

        const crosslinkLines = {};
        crosslinkers.forEach((cl) => { crosslinkLines[cl.id] = ["! " + cl.name + " based length restraints"]; });

        const origCrossLinks = crosslinkerObj.crosslinks;
        interModelLinks.forEach((link) => {
            const origLink = origCrossLinks.get(link.origId);
            let crosslinkerIDs = origLink
                ? d3.set(origLink.filteredMatches_pp.map((m) => m.match.crosslinker_id)).values()
                    .map((clid) => clid === "undefined" ? "default" : clid)
                : [];
            if (_.isEmpty(crosslinkerIDs)) crosslinkerIDs = ["default"];

            crosslinkerIDs.forEach((clid) => {
                const clRestraints = restraints.get(clid).restraints || restraints.get("default").restraints;
                const line = "assign" +
                    " (segid " + String.fromCharCode(65 + link.residueA.modelIndex) + " and name CA and resi " + link.residueA.resno + ")" +
                    " (segid " + String.fromCharCode(65 + link.residueB.modelIndex) + " and name CA and resi " + link.residueB.resno + ")" +
                    " " + clRestraints;
                crosslinkLines[clid].push(line);
            });
        });

        const allCrossLinkLines = d3.merge(d3.values(crosslinkLines));
        return remarkLines.concat(pdbLines, allCrossLinkLines);
    }
};

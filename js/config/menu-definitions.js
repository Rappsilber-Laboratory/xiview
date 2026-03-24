/**
 * @fileoverview Menu configuration definitions for xiVIEW dropdown menus.
 * Exports factory functions that return menu configuration objects for:
 * Protein Selection (hide, select neighbors, text filter), Groups (group/collapse/expand),
 * Load (PDB, STRING, metadata files), Export (matches, links, various data formats), and Help (about dialog).
 * Each menu config includes: title, menu items array with name/func/tooltip/context, and section formatting.
 */

import packageInfo from "../../package.json";
import vent from "../vent";

/**
 * Get protein selection dropdown menu configuration
 * @param {Object} compositeModel - The composite backbone-models instance
 * @returns {Object} Menu configuration object
 */
export function getProteinSelectionMenuConfig(compositeModel) {
    return {
        title: "Protein-Selection",
        menu: [{
            name: "Hide Selected",
            func: compositeModel.hideSelectedProteins,
            context: compositeModel,
            tooltip: "Hide selected proteins",
        },
        {
            name: "Hide Unselected",
            func: compositeModel.hideUnselectedProteins,
            context: compositeModel,
            tooltip: "Hide unselected proteins",
            sectionEnd: true
        },
        {
            name: "+Neighbours",
            func: compositeModel.stepOutSelectedProteins,
            context: compositeModel,
            tooltip: "Select proteins which are crosslinked to already selected proteins",
            categoryTitle: "Change Selection",
            sectionBegin: true
        },
        {
            sectionBegin: true,
            id: "proteinSelectionFilter",
            func: compositeModel.proteinSelectionTextFilter,
            closeOnClick: false,
            context: compositeModel,
            tooltip: "Select proteins whose descriptions include input text",
            categoryTitle: "Select by text filter:",
            sectionEnd: true
        }
        ],
        sectionHeader: function (d) {
            return (d.categoryTitle ? d.categoryTitle.replace(/_/g, " ") : "");
        },
    };
}

/**
 * Get groups dropdown menu configuration
 * @param {Object} compositeModel - The composite backbone-models instance
 * @returns {Object} Menu configuration object
 */
export function getGroupsMenuConfig(compositeModel) {
    return {
        title: "Groups",
        menu: [
            {
                sectionBegin: true,
                categoryTitle: "Group Selected - enter name:",
                id: "groupSelected",
                func: compositeModel.groupSelectedProteins,
                closeOnClick: false,
                context: compositeModel,
                tooltip: "Enter group name",
            },
            {
                name: "Clear Groups",
                func: compositeModel.clearGroups,
                context: compositeModel,
                tooltip: "Clears all groups"
            },
            {
                name: "Auto Group",
                func: compositeModel.autoGroup,
                context: compositeModel,
                tooltip: "Group protein complexes based on GO terms. (Will clear old groups.)",
            },
            // {
            //     name: "Auto Group Compartments",
            //     func: compModel.autoGroupCompartments,
            //     context: compModel,
            //     tooltip: "Group protein into compartmenst based on GO terms.",
            //     sectionEnd: true
            // },
            {
                name: "Collapse All",
                func: compositeModel.collapseGroups,
                context: compositeModel,
                tooltip: "Collapse all groups",
            },
            {
                name: "Expand All",
                func: compositeModel.expandGroups,
                context: compositeModel,
                tooltip: "Expand all groups",
            }
        ],
        sectionHeader: function (d) {
            return (d.categoryTitle ? d.categoryTitle.replace(/_/g, " ") : "");
        },
    };
}

/**
 * Get load dropdown menu configuration
 * @returns {Object} Menu configuration object
 */
export function getLoadMenuConfig() {
    const loadButtonData = [{
        name: "PDB",
        eventName: "pdbFileChooserShow",
        tooltip: "Load a PDB File from local disk or by PDB ID code from RCSB.org. Allows viewing of 3D Structure and of distance background in Matrix View"
    },
    {
        name: "STRING",
        eventName: "stringDataChooserShow",
        tooltip: "Load STRING data from the STRING server. Note: limited to <2,000 proteins, for more generate a CSV file for import as PPI Metadata"
    },
    {
        name: "Edge Metadata",
        eventName: "linkMetaDataFileChooserShow",
        tooltip: "Load edge (crosslink or PPI) meta-data from a local CSV file"
    },
    {
        name: "Node Metadata",
        eventName: "proteinMetaDataFileChooserShow",
        tooltip: "Load node (protein) meta-data from a local CSV file"
    },
    {
        name: "Sequence Annotations",
        eventName: "userAnnotationsMetaDataFileChooserShow",
        tooltip: "Load custom domain annotations (or other sequence annotations) from a local CSV file"
    },
    ];

    // Add event trigger functions to each button
    loadButtonData.forEach(function (bdata) {
        bdata.func = function () {
            vent.trigger(bdata.eventName, true);
        };
    });

    return {
        title: "Import",
        menu: loadButtonData,
    };
}

/**
 * Get export dropdown menu configuration
 * @param {Function} downloadMatches - Download matches function
 * @param {Function} downloadLinks - Download links function
 * @param {Function} downloadPPIs - Download PPIs function
 * @param {Function} downloadResidueCount - Download residue count function
 * @param {Function} downloadModificationCount - Download modification count function
 * @param {Function} downloadProteinAccessions - Download protein accessions function
 * @param {Function} downloadGroups - Download groups function
 * @param {Function} downloadSSL - Download SSL function
 * @param {Function} downloadAlphaLink2 - Download AlphaLink2 function
 * @returns {Object} Menu configuration object
 */
export function getExportMenuConfig(downloadMatches, downloadLinks, downloadPPIs, downloadResidueCount, downloadModificationCount, downloadProteinAccessions, downloadGroups, downloadSSL, downloadAlphaLink2) {
    return {
        title: "Export",
        menu: [
            {
                name: "Filtered Matches",
                func: downloadMatches,
                tooltip: "Produces a CSV File of Filtered Matches data",
                categoryTitle: "As a CSV File",
                sectionBegin: true
            },
            {
                name: "Filtered Crosslinks",
                func: downloadLinks,
                tooltip: "Produces a CSV File of Filtered Crosslink data"
            },
            {
                name: "Filtered PPI",
                func: downloadPPIs,
                tooltip: "Produces a CSV File of Filtered Protein-Protein Interaction data"
            },
            {
                name: "Filtered Residues",
                func: downloadResidueCount,
                tooltip: "Produces a CSV File of Count of Filtered Residues ",
            },
            {
                name: "Filtered Modification Count",
                func: downloadModificationCount,
                tooltip: "Produces a CSV File of Count of Modifications (after filtering)",
            },
            {
                name: "Protein Accession list",
                func: downloadProteinAccessions,
                tooltip: "Produces a single row CSV File of visible Proteins' Accession numbers",
            },
            {
                name: "Groups",
                func: downloadGroups,
                tooltip: "Produces a CSV File of Proteins' Accession numbers with group membership given in the 'complex' column",
                sectionEnd: true
            },
            {
                name: "Filtered Matches ",  // extra space to differentiate from first entry in menu
                func: downloadSSL,
                tooltip: "Produces an SSL file for quantitation in SkyLine",
                categoryTitle: "As an SSL File",
                sectionBegin: true,
            },
            {
                name: "AlphaLink2 for selected proteins",  // extra space to differentiate from first entry in menu
                func: downloadAlphaLink2,
                tooltip: "Exports AlphaLink2 csv file and corresponding FASTA. Prototype! Exported FDR values are wrong (all set to 0.05).",
                categoryTitle: "AlphaLink2",
                sectionBegin: true,
            },
        ],
        sectionHeader: function (d) {
            return (d.categoryTitle ? d.categoryTitle.replace(/_/g, " ") : "");
        },
    };
}

/**
 * Get help dropdown menu configuration
 * @returns {Object} Menu configuration object
 */
export function getHelpMenuConfig() {
    return {
        title: "Help",
        menu: [{
            name: "Tutorials",
            func: function () {
                window.open("./docs/html/xiview.html", "_blank");
            },
            tooltip: "Documentation and video tutorials for xiVIEW"
        }, {
            name: "version " + packageInfo.version,
        }, ],
    };
}

/**
 * @fileoverview DOM element IDs for xiVIEW panel containers.
 * Defines string identifiers for all dynamically created panel wrappers used in the application.
 * These IDs are used for panel management, visibility toggling, and DOM element lookup.
 */

/**
 * List of DOM element IDs for all panel containers in xiVIEW.
 * Includes visualization panels (spectrum, NGL, matrix, etc.), data loading panels (PDB, STRING, CSV),
 * and utility panels (search summary, metadata loading, GO terms).
 * Used by panel management system to track and control all dynamic UI containers.
 * @constant {Array<string>}
 */
export const DYNAMIC_CONTAINER_IDS = [
    "spectrumPanelWrapper",
    "spectrumSettingsWrapper",
    "keyPanel",
    "nglPanel",
    "distoPanel",
    "matrixPanel",
    "alignPanel",
    "circularPanel",
    "proteinInfoPanel",
    "pdbPanel",
    "stringPanel",
    "csvPanel",
    "searchSummaryPanel",
    "linkMetaLoadPanel",
    "proteinMetaLoadPanel",
    "userAnnotationsMetaLoadPanel",
    "gafAnnotationsMetaLoadPanel",
    "scatterplotPanel",
    "urlSearchBox",
    "listPanel",
    "goTermsPanel"
];

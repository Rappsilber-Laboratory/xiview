/**
 * @fileoverview View checkbox configurations for xiVIEW dropdown menu.
 * Defines all view toggles available in the View menu with their labels, tooltips, and event triggers.
 * Views are organized into sections: Legend & primary views (circular, 3D, matrix, protein info, spectrum),
 * analysis views (histogram, scatterplot, alignment), and metadata views (search summaries, GO terms).
 */

/**
 * Configuration objects for all view checkboxes in the View menu.
 * Each entry defines a checkbox that toggles visibility of a specific visualization panel.
 * Sections are separated by sectionEnd flag for visual grouping in the dropdown.
 * @constant {Array<Object>}
 * @property {string} id - DOM element ID placeholder for checkbox
 * @property {string} label - Display label in View menu
 * @property {string} eventName - Event name triggered when checkbox toggled (e.g., "nglViewShow")
 * @property {string} tooltip - User-facing description of view's purpose and requirements
 * @property {boolean} [sectionEnd] - If true, adds visual separator after this checkbox
 */
export const VIEW_CHECKBOX_CONFIGS = [
    {
        id: "keyChkBxPlaceholder",
        label: "Legend & Colours",
        eventName: "keyViewShow",
        tooltip: "Explains and allows changing of current colour scheme",
        sectionEnd: true
    },
    {
        id: "circularChkBxPlaceholder",
        label: "Circular",
        eventName: "circularViewShow",
        tooltip: "Proteins are arranged in a circle, with crosslinks drawn in-between",
    },
    {
        id: "nglChkBxPlaceholder",
        label: "3D (NGL)",
        eventName: "nglViewShow",
        tooltip: "Spatial view of protein complexes and crosslinks. Requires a relevant PDB File to be loaded [Load > PDB Data]"
    },
    {
        id: "matrixChkBxPlaceholder",
        label: "Matrix",
        eventName: "matrixViewShow",
        tooltip: "AKA Contact Map. Relevant PDB File required for distance background"
    },
    {
        id: "proteinInfoChkBxPlaceholder",
        label: "Protein Info",
        eventName: "proteinInfoViewShow",
        tooltip: "Shows metadata and crosslink annotated sequences for currently selected proteins"
    },
    {
        id: "spectrumChkBxPlaceholder",
        label: "Spectrum",
        eventName: "spectrumShow",
        tooltip: "View the spectrum for a selected match (selection made through Selected Match Table after selecting Crosslinks)",
        sectionEnd: true
    },
    {
        id: "distoChkBxPlaceholder",
        label: "Histogram",
        eventName: "distoViewShow",
        tooltip: "Configurable view for showing distribution of one crosslink/match property"
    },
    {
        id: "scatterplotChkBxPlaceholder",
        label: "Scatterplot",
        eventName: "scatterplotViewShow",
        tooltip: "Configurable view for comparing two crosslink/match properties",
    },
    {
        id: "alignChkBxPlaceholder",
        label: "Alignment",
        eventName: "alignViewShow",
        tooltip: "Shows alignments between Search/PDB/Uniprot sequences per protein"
    },
    {
        id: "searchSummaryChkBxPlaceholder",
        label: "Search Summaries",
        eventName: "searchesViewShow",
        tooltip: "Shows metadata for current searches",
        sectionEnd: false
    },
    {
        id: "goTermsChkBxPlaceholder",
        label: "GO Terms",
        eventName: "goTermsViewShow",
        tooltip: "Browse Gene Ontology terms"
    },
];

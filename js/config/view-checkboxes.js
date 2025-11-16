// View checkbox configurations for the view dropdown menu

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

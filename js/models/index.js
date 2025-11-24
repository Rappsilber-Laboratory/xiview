// CLMS-model main exports

// Core data model
export { SearchResultsModel } from "./search-results-model";

// Primary entities
export { Protein } from "./protein";
export { Peptide } from "./peptide";
export { Crosslink } from "./crosslink";
export { SpectrumMatch } from "./spectrum-match";

// File parsers and data structures
export { MzidentmlFile } from "./mzidentml-metadata/mzidentml-file";
export { SpectraData } from "./mzidentml-metadata/spectra-data";

// Analysis and identification
export { AnalysisCollectionSpectrumIdentification } from "./mzidentml-metadata/analysis-collection-spectrum-identification";
export { SpectrumIdentificationProtocol } from "./mzidentml-metadata/spectrum-identification-protocol";

// Search configuration
export { SearchModification } from "./mzidentml-metadata/search-modification";
export { Enzyme } from "./mzidentml-metadata/enzyme";

// Utilities and options
export { attributeOptions } from "./attribute-options";

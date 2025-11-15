import {SpectrumMatch} from "./spectrum-match";
import {Peptide} from "./peptide";
import {Protein} from "./protein";
import {SpectrumIdentificationProtocol} from "./spectrum-identification-protocol";
import {SpectraData} from "./spectra-data";
import {MzidentmlFile} from "./mzidentml-file";
import {AnalysisCollectionSpectrumIdentification} from "./analysis-collection-spectrum-identification";
import {SearchModification} from "./search-modification";
import {Enzyme} from "./enzyme";

export class SearchResultsModel {

    constructor() {
        // Initialize all properties with underscore prefix
        this._proteins = new Map();
        this._matches = [];
        this._crosslinks = new Map();
        this._scoreExtent = null;
        this._searches = new Map();
        this._decoysPresent = false;
        this._ambiguousPresent = false;
        this._unvalidatedPresent = false;
        this._crosslinksPresent = false;
        this._linearsPresent = false;
        this._scoreSets = new Set();
        this._selectedScoreSet = null;
    }

    // Public getter methods
    /**
     * Get a single protein by ID
     * @param {string} proteinId - The protein identifier
     * @returns {Protein|undefined} The protein object, or undefined if not found
     */
    getProtein(proteinId) {
        return this._proteins.get(proteinId);
    }

    /**
     * Get an iterator over protein values (for iteration)
     * @returns {Iterator<Protein>} Iterator over all proteins
     */
    getProteinsIterator() {
        return this._proteins.values();
    }

    /**
     * Get the entire protein Map (for operations needing the Map)
     * @returns {Map<string, Protein>} Map of protein IDs to Protein objects
     */
    getProteinsMap() {
        return this._proteins;
    }

    /**
     * Get all spectrum matches
     * @returns {Array<SpectrumMatch>} Array of all spectrum matches
     */
    getMatches() {
        return this._matches;
    }

    /**
     * Get all crosslinks
     * @returns {Map<string, Crosslink>} Map of crosslink IDs to Crosslink objects
     */
    getCrosslinks() {
        return this._crosslinks;
    }

    /**
     * Get score extent (min/max range)
     * @returns {Array<number>|null} Score extent [min, max] or null
     */
    getScoreExtent() {
        return this._scoreExtent;
    }

    /**
     * Get all searches
     * @returns {Map<string, Object>} Map of search IDs to search objects
     */
    getSearches() {
        return this._searches;
    }

    /**
     * Check if decoy proteins are present in the data
     * @returns {boolean} True if decoys present
     */
    getDecoysPresent() {
        return this._decoysPresent;
    }

    /**
     * Check if ambiguous matches are present in the data
     * @returns {boolean} True if ambiguous matches present
     */
    getAmbiguousPresent() {
        return this._ambiguousPresent;
    }

    /**
     * Check if unvalidated matches are present in the data
     * @returns {boolean} True if unvalidated matches present
     */
    getUnvalidatedPresent() {
        return this._unvalidatedPresent;
    }

    /**
     * Check if crosslinks are present in the data
     * @returns {boolean} True if crosslinks present
     */
    getCrosslinksPresent() {
        return this._crosslinksPresent;
    }

    /**
     * Check if linear peptides are present in the data
     * @returns {boolean} True if linear peptides present
     */
    getLinearsPresent() {
        return this._linearsPresent;
    }

    /**
     * Get all available score sets
     * @returns {Set<string>} Set of score set names
     */
    getScoreSets() {
        return this._scoreSets;
    }

    /**
     * Get the currently selected score set
     * @returns {string|null} Selected score set name or null
     */
    getSelectedScoreSet() {
        return this._selectedScoreSet;
    }

    /**
     * Get all mzIdentML files
     * @returns {Map<string, MzidentmlFile>} Map of file IDs to MzidentmlFile objects
     */
    getMzidentmlFiles() {
        return this._mzidentmlFiles;
    }

    /**
     * Get all analysis collection spectrum identifications
     * @returns {Map<string, AnalysisCollectionSpectrumIdentification>} Map of identifications
     */
    getAnalysisCollectionSpectrumIdentifications() {
        return this._analysisCollectionSpectrumIdentifications;
    }

    /**
     * Get all spectrum identification protocols
     * @returns {Map<string, SpectrumIdentificationProtocol>} Map of protocol IDs to protocol objects
     */
    getSpectrumIdentificationProtocols() {
        return this._spectrumIdentificationProtocols;
    }

    /**
     * Get all spectra data
     * @returns {Map<string, SpectraData>} Map of spectra data IDs to SpectraData objects
     */
    getSpectraData() {
        return this._spectraData;
    }

    /**
     * Get all enzymes
     * @returns {Map<string, Enzyme>} Map of enzyme IDs to Enzyme objects
     */
    getEnzymes() {
        return this._enzymes;
    }

    /**
     * Get all search modifications
     * @returns {Map<string, SearchModification>} Map of modification IDs to SearchModification objects
     */
    getSearchModifications() {
        return this._searchModifications;
    }

    /**
     * Get the primary score definition
     * @returns {Object} Primary score object with score_name property
     */
    getPrimaryScore() {
        return this._primaryScore;
    }

    /**
     * Get all peptides
     * @returns {Map<string, Peptide>} Map of peptide IDs to Peptide objects
     */
    getPeptides() {
        return this._peptides;
    }

    /**
     * Get minimum score value
     * @returns {number} Minimum score
     */
    getMinScore() {
        return this._minScore;
    }

    /**
     * Get maximum score value
     * @returns {number} Maximum score
     */
    getMaxScore() {
        return this._maxScore;
    }

    /**
     * Get crosslinker specificity information
     * @returns {*} Crosslinker specificity data
     */
    getCrosslinkerSpecificity() {
        return this._crosslinkerSpecificity;
    }

    /**
     * Process and store mzIdentML file metadata
     * @param {Array<Object>} json - Array of mzIdentML file data objects
     * @returns {void}
     */
    processMzIdentMLFiles(json) {
        const mzidentmlFiles = new Map();
        for (let mzid of json) {
            mzidentmlFiles.set(mzid.id, new MzidentmlFile(mzid, this));
        }
        this._mzidentmlFiles = mzidentmlFiles;
    }

    /**
     * Process and store analysis collection spectrum identifications
     * @param {Array<Object>} json - Array of analysis collection data objects
     * @returns {void}
     */
    processAnalysisCollectionSpectrumIdentifications(json) {
        const analysisCollectionSpectrumIdentifications = new Map();
        for (let acsi of json) {
            const uploadId = acsi.upload_id;
            const listRef = acsi.spectrum_identification_list_ref;
            const key = uploadId + "_" + listRef;
            analysisCollectionSpectrumIdentifications.set(key, new AnalysisCollectionSpectrumIdentification(acsi, this));
        }
        this._analysisCollectionSpectrumIdentifications = analysisCollectionSpectrumIdentifications;
    }

    /**
     * Process and store spectrum identification protocols
     * @param {Array<Object>} json - Array of protocol data objects
     * @returns {void}
     */
    processSpectrumIdentificationProtocols(json) {
        const spectrumIdentificationProtocols = new Map();
        for (let siProtocol of json) {
            const id = siProtocol.id;
            const uploadId = siProtocol.upload_id;
            spectrumIdentificationProtocols.set(uploadId + "_" + id, new SpectrumIdentificationProtocol(siProtocol, this));
        }
        this._spectrumIdentificationProtocols = spectrumIdentificationProtocols;
    }

    /**
     * Get spectrum identification protocol by upload ID and protocol ID
     * @param {string} uploadId - The upload identifier
     * @param {string} id - The protocol identifier
     * @returns {SpectrumIdentificationProtocol|null} The protocol object or null if not found
     */
    getSpectrumIdentificationProtocol(uploadId, id) {
        const spectrumIdentificationProtocols = this._spectrumIdentificationProtocols;
        if (spectrumIdentificationProtocols) {
            return spectrumIdentificationProtocols.get(uploadId + "_" + id);
        } else {
            console.error("No spectrum identification protocol found for uploadId:", uploadId, "and id:", id);
            return null;
        }
    }

    /**
     * Process and store spectra data
     * @param {Array<Object>} json - Array of spectra data objects
     * @returns {void}
     */
    processSpectraData(json) {
        const spectrumSources = new Map();
        for (let specSource of json) {
            spectrumSources.set(specSource.upload_id + "_" + specSource.id, new SpectraData(specSource, this));
        }
        this._spectraData = spectrumSources;
    }

    /**
     * Get spectra data by upload ID and data ID
     * @param {string} uploadId - The upload identifier
     * @param {string} id - The spectra data identifier
     * @returns {SpectraData|null} The spectra data object or null if not found
     */
    getSpectraDataById(uploadId, id) {
        const spectraData = this._spectraData;
        if (spectraData) {
            return spectraData.get(uploadId + "_" + id);
        } else {
            console.error("No spectra data found for uploadId:", uploadId, "and id:", id);
            return null;
        }
    }

    /**
     * Process and store enzyme data
     * @param {Array<Object>} data - Array of enzyme data objects
     * @returns {void}
     */
    processEnzymes(data) {
        const enzymes = new Map();
        for (let e of data) {
            const enzyme = new Enzyme(e);
            enzymes.set(enzyme.id, enzyme);
        }
        this._enzymes = enzymes;
    }

    /**
     * Process and store search modification data
     * @param {Array<Object>} data - Array of modification data objects
     * @returns {void}
     */
    processSearchModifications(data) {
        const searchModifications = new Map();
        for (let mod of data) {
            const sm = new SearchModification(mod);
            searchModifications.set(sm.id, sm);
        }
        this._searchModifications = searchModifications;
    }

    /**
     * Store raw match data for later processing
     * @param {Array<Object>} data - Array of raw match data
     * @returns {void}
     */
    processMatches(data) {
        this._rawMatches = data;
    }

    /**
     * Store raw peptide data for later processing
     * @param {Array<Object>} data - Array of raw peptide data
     * @returns {void}
     */
    processPeptides(data) {
        this._rawPeptides = data;
    }

    /**
     * Store raw protein data for later processing
     * @param {Array<Object>} data - Array of raw protein data
     * @returns {void}
     */
    processProteins(data) {
        this._rawProteins = data;
    }

    /**
     * Parse JSON data and construct SpectrumMatch objects from raw data
     * @param {Object} json - JSON object containing search results data
     * @returns {void}
     */
    parseJSON(json) {
        this._primaryScore = {score_name: "Match Score"};
        // todo - saved config should end up including filter settings not just xiNET layout
        // this._xiNETLayout = json.xiNETLayout;
        const participants = this._proteins;
        const peptides = new Map();
        if (!this.isAggregatedData()) { // use id as protein id
            for (let rawProtein of this._rawProteins) {
                const protein = new Protein(rawProtein);
                participants.set(protein.id, protein);
            }
            for (let peptide of this._rawPeptides) {
                peptide.sequence = peptide.base_seq;
                peptides.set(peptide.u_id + "_" + peptide.id, new Peptide(peptide)); // concat upload_id and peptide.id
                for (let p = 0; p < peptide.prt.length; p++) {
                    if (peptide.dec[p]) {
                        const protein = participants.get(peptide.prt[p]);
                        if (!protein) {
                            console.error("Protein not found for peptide (not aggregated data)", peptide, peptide.prt[p]);
                        }
                        protein.is_decoy = true;
                        this._decoysPresent = true;
                    }
                }
            }
        } else { // is aggregated - use accession as protein id
            const tempProteins = new Map();
            for (let rawProtein of this._rawProteins) {
                const protein = new Protein(rawProtein);
                tempProteins.set(protein.id, protein);
            }
            for (let peptide of this._rawPeptides) {
                peptides.set(peptide.u_id + "_" + peptide.id, new Peptide(peptide)); // concat upload_id and peptide.id
                for (let pe = 0; pe < peptide.prt.length; pe++) {
                    const protein = tempProteins.get(peptide.prt[pe]);
                    if (!protein) {
                        console.error("Protein not found for peptide (aggregated data)", peptide, peptide.prt[pe]);
                    }
                    if (peptide.dec[pe]) {
                        const decoyId = "DECOY_" + protein.accession;
                        protein.is_decoy = true;
                        protein.id = decoyId;
                        // how to get prot acc after id has been changed?
                        peptide.prt[pe] = decoyId;
                        this._decoysPresent = true;
                    } else {
                        // fix ids for target in aggregated data
                        protein.id = protein.accession;
                        peptide.prt[pe] = protein.accession;
                    }
                }
            }
            for (let protein of tempProteins.values()) {
                participants.set(protein.id, protein);
            }
        }
        this._peptides = peptides;
        this._rawPeptides = null;
        this._rawProteins = null;
        delete this._rawPeptides;
        delete this._rawProteins;
        this.initDecoyLookup();
        const crosslinks = this._crosslinks;
        let minScore = undefined;
        let maxScore = undefined;
        const matches = this._matches;
        const l = this._rawMatches.length;
        for (let i = 0; i < l; i++) {
            const match = new SpectrumMatch(this, participants, crosslinks, peptides, this._rawMatches[i]);
            matches.push(match);
            if (maxScore === undefined || match.score() > maxScore) {
                maxScore = match.score();
            } else if (minScore === undefined || match.score() < minScore) {
                minScore = match.score();
            }
        }
        this._minScore = minScore;
        this._maxScore = maxScore;
        this._rawMatches = null;
        delete this._rawMatches;
        const searches = this.getProteinSearchMap(peptides, matches);
        this._searches = searches;
    }

    /**
     * Connect searches to proteins
     * @param {Map<string, Peptide>} peptideMap - Map of peptide IDs to Peptide objects
     * @param {Array<SpectrumMatch>} matchArray - Array of spectrum matches
     * @returns {Map<string, Object>} Map of search IDs to search objects with participantIDSet and id
     */
    getProteinSearchMap(peptideMap, matchArray) {
        const searchMap = new Map();
        matchArray.forEach((match) => {
            match.matchedPeptides.forEach((peptide) => {
                const prots = peptide.prt;
                const searchId = match.uploadId;
                const search = searchMap.get(searchId) || (() => {
                    const newSearch = {participantIDSet: new Set(), id: searchId};
                    searchMap.set(searchId, newSearch);
                    return newSearch;
                })();
                prots.forEach((prot) => search.participantIDSet.add(prot));
            });
        });
        return searchMap;
    }

    /**
     * Initialize decoy protein lookup mapping decoy proteins to their target proteins
     * @returns {void}
     */
    initDecoyLookup() {
        // Make map of reverse/random decoy proteins to real proteins
        const prefixes = ["REV_", "RAN_", "DECOY_", "DECOY:", "reverse_", "REV", "RAN"];
        const prots = Array.from(this._proteins.values());
        const nameMap = new Map ();
        const accessionMap = new Map ();
        prots.forEach(function (prot) {
            nameMap.set(prot.name, prot.id);
            accessionMap.set(prot.accession, prot.id);
            prot.targetProteinID = prot.id; // this gets overwritten for decoys in next bit, mjg
        });

        const decoys = prots.filter(function (p) {
            return p.is_decoy;
        });
        decoys.forEach(function (decoyProt) {
            prefixes.forEach(function (pre) {
                const targetProtIDByName = nameMap.get(decoyProt.name.substring(pre.length));
                if (decoyProt.accession) {
                    const targetProtIDByAccession = accessionMap.get(decoyProt.accession.substring(pre.length));
                    if (targetProtIDByAccession) {
                        decoyProt.targetProteinID = targetProtIDByAccession; // mjg
                    }
                } else if (targetProtIDByName) {
                    decoyProt.targetProteinID = targetProtIDByName; // mjg
                }
            });
        });

        this._targetProteinCount = prots.length - decoys.length;
    }

    /**
     * Check if the data is aggregated from multiple mzIdentML files
     * @returns {boolean} True if data is aggregated (more than one mzIdentML file)
     */
    isAggregatedData() {
        return this._mzidentmlFiles.size > 1;
    }
}

SearchResultsModel.commonRegexes = {
    uniprotAccession: /[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}/,
    // notUpperCase: /[^A-Z]/g,
    // decoyNames: /(REV_)|(RAN_)|(DECOY_)|(DECOY:)|(reverse_)/,
};

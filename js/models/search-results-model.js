import {SpectrumMatch} from "./spectrum-match";
import {Peptide} from "./peptide";
import {Protein} from "./protein";
import {SpectrumIdentificationProtocol} from "./mzid-metadata/spectrum-identification-protocol";
import {SpectraData} from "./mzid-metadata/spectra-data";
import {MzidentmlFile} from "./mzid-metadata/mzidentml-file";
import {AnalysisCollectionSpectrumIdentification} from "./mzid-metadata/analysis-collection-spectrum-identification";
import {SearchModification} from "./mzid-metadata/search-modification";
import {Enzyme} from "./mzid-metadata/enzyme";

export class SearchResultsModel {

    #mzidentmlFiles = new Map();
    #matches = [];
    #crosslinks = new Map();
    #proteins = new Map();

    #scoreExtent = null;
    _scoreSets = new Set();
    #minScore;
    #maxScore;
    #primaryScore;
    #searches = new Map();
    #decoysPresent = false;
    #ambiguousPresent = false;
    #unvalidatedPresent = false;
    #crosslinksPresent = false;
    #linearsPresent = false;
    #selectedScoreSet = null;
    #targetProteinCount;
    #crosslinkerSpecificity = [];

    /**
     * Stores mzIdentML file metadata for later processing
     * @param {Array<Object>} json - Array of mzIdentML file data objects
     * @returns {void}
     */
    storeMzIdentMLFiles(json) {
        // this var will be deleted after data is processed
        this._mzidentmlFilesJson = json;
    }

    /**
     * Store contents of <AnalysisCollection><SpectrumIdentification> from mzIdentML files for later processing
     * @param {Array<Object>} json - Array of analysis collection data objects
     * @returns {void}
     */
    storeAnalysisCollectionSpectrumIdentifications(json) {
        // this var will be deleted after data is processed
        this._analysisCollectionSpectrumIdentificationsJson = json;
    }
    
    /**
     * Store <SpectrumIdentificationProtocol> data for later processing
     * @param {Array<Object>} json - Array of protocol data objects
     * @returns {void}
     */
    storeSpectrumIdentificationProtocols(json) {
        // this var will be deleted after data is processed
        this._spectrumIdentificationProtocolsJson = json;
    }

    /**
     * Store <SpectraData> data for later processing
     * @param {Array<Object>} json - Array of spectra data objects
     * @returns {void}
     */
    storeSpectraData(json) {
        // this var will be deleted after data is processed
        this._spectraDataJson = json;
    }

    /**
     * Store enzyme data for later processing
     * @param {Array<Object>} data - Array of enzyme data objects
     * @returns {void}
     */
    storeEnzymes(json) {
        // this var will be deleted after data is processed
        this._enzymesJson = json;
    }

    /**
     * Store search modification data for later processing
     * @param {Array<Object>} data - Array of modification data objects
     * @returns {void}
     */
    processSearchModifications(json) {
        // this var will be deleted after data is processed
        this._searchModificationsJson = json;//searchModifications;
    }

    /**
     * Store raw match data for later processing
     * @param {Array<Object>} data - Array of raw match data
     * @returns {void}
     */
    storeMatches(json) {
        // this var will be deleted after data is processed
        this._rawMatches = json;
    }

    /**
     * Store raw peptide data for later processing
     * @param {Array<Object>} data - Array of raw peptide data
     * @returns {void}
     */
    storePeptides(json) {
        // this var will be deleted after data is processed
        this._rawPeptides = json;
    }

    /**
     * Store raw protein data for later processing
     * @param {Array<Object>} data - Array of raw protein data
     * @returns {void}
     */
    storeProteins(json) {
        // this var will be deleted after data is processed
        this._rawProteins = json;
    }

    /**
     * Parse JSON data and construct Prtein, peptide & SpectrumMatch objects from raw data
     * @param {Object} json - JSON object containing search results data
     * @returns {void}
     */
    parseJSON() {
        //process mzid meta data
        for (let mzidJson of this._mzidentmlFilesJson) {
            this.#mzidentmlFiles.set(mzidJson.id, new MzidentmlFile(mzidJson,
                this._analysisCollectionSpectrumIdentificationsJson,
                this._spectrumIdentificationProtocolsJson,
                this._searchModificationsJson,
                this._enzymesJson,
                this._spectraDataJson));
        }
        //clear temp data
        delete this._analysisCollectionSpectrumIdentificationsJson;
        delete this._spectrumIdentificationProtocolsJson;
        delete this._searchModificationsJson;
        delete this._enzymesJson;
        delete this._spectraDataJson;

        this.#primaryScore = {score_name: "Match Score"};
        // todo - saved config should end up including filter settings not just xiNET layout
        // this.#xiNETLayout = json.xiNETLayout;
        //process actual data
        const participants = this.#proteins;
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
                        this.#decoysPresent = true;
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
                        this.#decoysPresent = true;
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

        this._rawPeptides = null;
        this._rawProteins = null;
        delete this._rawPeptides;
        delete this._rawProteins;
        this.initDecoyLookup();
        const crosslinks = this.#crosslinks;
        let minScore = undefined;
        let maxScore = undefined;
        const matches = this.#matches;
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
        this.#minScore = minScore;
        this.#maxScore = maxScore;
        this._rawMatches = null;
        delete this._rawMatches;
        this.#searches = this.getProteinSearchMap(peptides, matches);
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
        const prots = Array.from(this.#proteins.values());
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

        this.#targetProteinCount = prots.length - decoys.length;
    }

    /**
     * Check if the data is aggregated from multiple mzIdentML files
     * @returns {boolean} True if data is aggregated (more than one mzIdentML file)
     */
    isAggregatedData() {
        return this.#mzidentmlFiles.size > 1;
    }

    // Public getter methods
    /**
     * Get a single protein by ID
     * @param {string} proteinId - The protein identifier
     * @returns {Protein|undefined} The protein object, or undefined if not found
     */
    getProtein(proteinId) {
        return this.#proteins.get(proteinId);
    }

    /**
     * Get an iterator over protein values (for iteration)
     * @returns {Iterator<Protein>} Iterator over all proteins
     */
    getProteinsIterator() {
        return this.#proteins.values();
    }

    /**
     * Get the entire protein Map (for operations needing the Map)
     * @returns {Map<string, Protein>} Map of protein IDs to Protein objects
     */
    getProteinsMap() {
        return this.#proteins;
    }

    /**
     * Get all spectrum matches
     * @returns {Array<SpectrumMatch>} Array of all spectrum matches
     */
    getMatches() {
        return this.#matches;
    }

    /**
     * Get all crosslinks
     * @returns {Map<string, Crosslink>} Map of crosslink IDs to Crosslink objects
     */
    getCrosslinks() {
        return this.#crosslinks;
    }

    /**
     * Get score extent (min/max range)
     * @returns {Array<number>|null} Score extent [min, max] or null
     */
    getScoreExtent() {
        return this.#scoreExtent;
    }

    /**
     * Get all searches
     * @returns {Map<string, Object>} Map of search IDs to search objects
     */
    getSearches() {
        return this.#searches;
    }

    /**
     * Check if decoy proteins are present in the data
     * @returns {boolean} True if decoys present
     */
    getDecoysPresent() {
        return this.#decoysPresent;
    }

    /**
     * Check if ambiguous matches are present in the data
     * @returns {boolean} True if ambiguous matches present
     */
    getAmbiguousPresent() {
        return this.#ambiguousPresent;
    }

    /**
     * Check if unvalidated matches are present in the data
     * @returns {boolean} True if unvalidated matches present
     */
    getUnvalidatedPresent() {
        return this.#unvalidatedPresent;
    }

    /**
     * Check if crosslinks are present in the data
     * @returns {boolean} True if crosslinks present
     */
    getCrosslinksPresent() {
        return this.#crosslinksPresent;
    }

    /**
     * Check if linear peptides are present in the data
     * @returns {boolean} True if linear peptides present
     */
    getLinearsPresent() {
        return this.#linearsPresent;
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
        return this.#selectedScoreSet;
    }

    /**
     * Get all mzIdentML files idexed by upload id
     * @returns {Map<int, MzidentmlFile>} Map of upload id's to MzidentmlFile objects
     */
    getMzidentmlFiles() {
        return this.#mzidentmlFiles;
    }

    /**
     * Get the primary score definition
     * @returns {Object} Primary score object with score_name property
     */
    getPrimaryScore() {
        return this.#primaryScore;
    }

    /**
     * Get minimum score value
     * TODO - question about which minimum score / which score set
     * @returns {number} Minimum score
     */
    getMinScore() {
        return this.#minScore;
    }

    /**
     * Get maximum score value
     * TODO - question about which minimum score / which score set
     * @returns {number} Maximum score
     */
    getMaxScore() {
        return this.#maxScore;
    }

    /**
     * Get crosslinker specificity information
     * @returns {*} Crosslinker specificity data
     */
    getCrosslinkerSpecificity() {
        return this.#crosslinkerSpecificity;
    }
}

/**
 * Helper method to get or create a Map for a given key
 * @param {Map} map - The outer map
 * @param {*} key - The key to look up or create
 * @returns {Map} The inner map (existing or newly created)
 * @private
 */
function _getOrCreateInnerMap(map, key) {
    if (!map.has(key)) {
        map.set(key, new Map());
    }
    return map.get(key);
}

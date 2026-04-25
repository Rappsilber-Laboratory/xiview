import {SpectrumMatch} from "./spectrum-match";
import {Peptide} from "./peptide";
import {Protein} from "./protein";
import {SpectrumIdentificationProtocol} from "./mzidentml-metadata/spectrum-identification-protocol";
import {SpectraData} from "./mzidentml-metadata/spectra-data";
import {MzidentmlFile} from "./mzidentml-metadata/mzidentml-file";
import {AnalysisCollection_SpectrumIdentification} from "./mzidentml-metadata/analysis-collection-spectrum-identification";
import {SearchModification} from "./mzidentml-metadata/search-modification";
import {Enzyme} from "./mzidentml-metadata/enzyme";

export class SearchResultsModel {
    /**
     * Private map of mzIdentML file objects keyed by upload ID
     * @type {Map<int, MzidentmlFile>}
     * @private
     */
    #mzidentmlFiles = new Map();

    /**
     * Private array of all spectrum matches in the search results
     * @type {Array<SpectrumMatch>}
     * @private
     */
    #matches = [];

    /**
     * Private map of crosslink objects keyed by crosslink ID
     * @type {Map<string, Crosslink>}
     * @private
     */
    #crosslinks = new Map();

    /**
     * Private map of protein objects keyed by protein ID
     * @type {Map<string, Protein>}
     * @private
     */
    #proteins = new Map();

    /**
     * Map of score type names to ScoreExtent objects
     * @type {Map<string, ScoreExtent>}
     */
    scoreExtents = new Map();

    /**
     * Currently selected score type name for filtering and visualization - todo check
     * Defaults to "Mascot:expectation value" if available, else first score type
     * @type {string|null}
     * @private
     */
    selectedScoreType = null;

    /**
     * Private map of
     * @type {Map<int, {particpantIdSet:Set(string), group:int}>
     * @private
     */
    #uploadIdToProteinIdsAndGroup = new Map();

    /**
     * Private flag indicating whether decoy proteins are present in results
     * @type {boolean}
     * @private
     */
    #decoysPresent = false;

    /**
     * Private flag indicating whether ambiguous matches are present
     * @type {boolean}
     * @private
     */
    #ambiguousPresent = false;

    /**
     * Private flag indicating whether unvalidated matches are present
     * @type {boolean}
     * @private
     */
    #unvalidatedPresent = false;

    /**
     * Private flag indicating whether crosslinked peptides are present
     * @type {boolean}
     * @private
     */
    #crosslinksPresent = false;

    /**
     * Private flag indicating whether linear (non-crosslinked) peptides are present
     * @type {boolean}
     * @private
     */
    #linearsPresent = false;

    /**
     * Private count of non-decoy target proteins
     * @type {number}
     * @private
     */
    #targetProteinCount;

    /**
     * Array of crosslinker specificity rules
     * @type {Array}
     */
    _crosslinkerSpecificity = [];

    _enzymeSpecificity = [];

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
     * @param {Array<Object>} json - Array of enzyme data objects
     * @returns {void}
     */
    storeEnzymes(json) {
        // this var will be deleted after data is processed
        this._enzymesJson = json;
    }

    /**
     * Store search modification data for later processing
     * @param {Array<Object>} json - Array of modification data objects
     * @returns {void}
     */
    storeSearchModifications(json) {
        // this var will be deleted after data is processed
        this._searchModificationsJson = json;//searchModifications;
    }

    /**
     * Store raw match data for later processing
     * @param {Array<Object>} json - Array of raw match data
     * @returns {void}
     */
    storeMatches(json) {
        // this var will be deleted after data is processed
        this._rawMatches = json;
    }

    /**
     * Store raw peptide data for later processing
     * @param {Array<Object>} json - Array of raw peptide data
     * @returns {void}
     */
    storePeptides(json) {
        // this var will be deleted after data is processed
        this._rawPeptides = json;
        //check and convert data types
        for (let peptideJson of this._rawPeptides) {
            peptideJson.ls1 = parseInt(peptideJson.ls1);
            peptideJson.ls2 = parseInt(peptideJson.ls2);
            peptideJson.pos = peptideJson.pos.map(p => parseInt(p));
        }
    }

    /**
     * Store raw protein data for later processing
     * @param {Array<Object>} json - Array of raw protein data
     * @returns {void}
     */
    storeProteins(json) {
        // this var will be deleted after data is processed
        this._rawProteins = json;
    }

    /**
     * Parse JSON data and construct Prtein, peptide & SpectrumMatch objects from raw data
     * @returns {void}
     */
    parseJSON() {
        //process mzid meta data
        //index enzymes
        const indexedEnzymes = new Map(); // thsi will be map of upload ids to map of protocol ids to Enzymes
        for (let enzymeJson of this._enzymesJson) {
            if (!indexedEnzymes.has(enzymeJson.upload_id)) {
                indexedEnzymes.set(enzymeJson.upload_id, new Map());
            }
            const enzyme = new Enzyme(enzymeJson);
            indexedEnzymes.get(enzymeJson.upload_id).set(enzymeJson.protocol_id, enzyme);
        }
        // Populate _enzymeSpecificity from unique site_regexp values
        const seenRegexps = new Set();
        for (const uploadEnzymes of indexedEnzymes.values()) {
            for (const enzyme of uploadEnzymes.values()) {
                const siteRegexp = enzyme.siteRegexp;
                if (!siteRegexp || seenRegexps.has(siteRegexp)) continue;
                seenRegexps.add(siteRegexp);

                const lookbehindMatch = siteRegexp.match(/\(\?<=\[?([A-Z]+)]?\)/);
                const residues = lookbehindMatch ? lookbehindMatch[1].split("") : [];
                const lookaheadMatch = siteRegexp.match(/\(\?!\[?([A-Z]+)]?\)/);
                const postConstraint = lookaheadMatch ? lookaheadMatch[1].split("") : null;

                for (const aa of residues) {
                    this._enzymeSpecificity.push({ aa, type: "DIGESTIBLE", postConstraint });
                }
            }
        }

        //index search modifications
        const indexedSMs = new Map(); // this will be map of upload ids to map of protocol ids to SearchModification
        for (let searchModificationJson of this._searchModificationsJson) {
            if (!indexedSMs.has(searchModificationJson.upload_id)) {
                indexedSMs.set(searchModificationJson.upload_id, new Map());
            }
            const sm = new SearchModification(searchModificationJson);
            indexedSMs.get(searchModificationJson.upload_id).set(searchModificationJson.protocol_id, sm);
        }
        // Populate _crosslinkerSpecificity from search modifications with crosslinker_id
        // const linkableResSets = {};
        // for (const smJson of this._searchModificationsJson) {
        //     if (!smJson.crosslinker_id) continue;
        //     const acc = smJson.accessions || {};
        //
        //     // Determine reactive group (0 = donor/group1, 1 = acceptor/group2)
        //     let groupIndex;
        //     if ("MS:1002509" in acc) groupIndex = 0;
        //     else if ("MS:1002510" in acc) groupIndex = 1;
        //     else continue;
        //
        //     // Name from UNIMOD accession value (e.g. "Xlink:DSSO"), else strip suffix from MS:1003392, else crosslinker_id
        //     let name = null;
        //     let unimodKey = null;
        //     for (const [k, v] of Object.entries(acc)) {
        //         if (k.startsWith("UNIMOD:")) { name = v; unimodKey = k; break; }
        //     }
        //     if (!name) {
        //         const xlName = acc["MS:1003392"];
        //         name = xlName ? xlName.replace(/_crosslink_(donor|acceptor)(_n_term)?$/, "") : String(smJson.crosslinker_id);
        //     }
        //
        //     const key = smJson.upload_id + ":" + (unimodKey || smJson.crosslinker_id);
        //     let resSet = linkableResSets[key];
        //     if (!resSet) {
        //         resSet = { name, linkables: [] };
        //         linkableResSets[key] = resSet;
        //     }
        //     if (!resSet.linkables[groupIndex]) {
        //         resSet.linkables[groupIndex] = new Set();
        //     }
        //
        //     // Each character in residues is an amino acid; "." alone means position-only (N/C-term handled by CV terms)
        //     const residues = smJson.residues || "";
        //     if (residues !== ".") {
        //         for (const aa of residues) {
        //             resSet.linkables[groupIndex].add(aa);
        //         }
        //     }
        //     if ("MS:1002057" in acc) resSet.linkables[groupIndex].add("nterm");
        //     if ("MS:1002058" in acc) resSet.linkables[groupIndex].add("cterm");
        // }
        // this._crosslinkerSpecificity = linkableResSets;

        //index spectrum identiifcation protocols
        const indexedSIPs = new Map(); // this will be map of upload ids to map of protocol ids to SIP
        for (let sipJson of this._spectrumIdentificationProtocolsJson) {
            if (!indexedSIPs.has(sipJson.upload_id)) {
                indexedSIPs.set(sipJson.upload_id, new Map());
            }
            const sip = new SpectrumIdentificationProtocol(sipJson,
                indexedEnzymes.get(sipJson.upload_id)?.get(sipJson.id),
                indexedSMs.get(sipJson.upload_id)?.get(sipJson.id));
            indexedSIPs.get(sipJson.upload_id).set(sipJson.id, sip);
        }
        //index spectra data
        const indexedSpectraData = new Map(); // this will be map of upload ids to map of spectra data ids to SpectraData
        for (let spectraDataJson of this._spectraDataJson) {
            if (!indexedSpectraData.has(spectraDataJson.upload_id)) {
                indexedSpectraData.set(spectraDataJson.upload_id, new Map());
            }
            const spectraData = new SpectraData(spectraDataJson);
            indexedSpectraData.get(spectraDataJson.upload_id).set(spectraDataJson.id, spectraData);
        }
        //index analysis collection spectrum identifications
        const spectrumIdentificationsMap = new Map(); // map of upload ids to array of spectrum identification objects
        for (let spectrumIdentificationJson of this._analysisCollectionSpectrumIdentificationsJson) {
            if (!spectrumIdentificationsMap.has(spectrumIdentificationJson.upload_id)) {
                spectrumIdentificationsMap.set(spectrumIdentificationJson.upload_id, []);
            }
            spectrumIdentificationsMap.get(spectrumIdentificationJson.upload_id).push(
                new AnalysisCollection_SpectrumIdentification(spectrumIdentificationJson,
                    indexedSIPs.get(spectrumIdentificationJson.upload_id).get(spectrumIdentificationJson.protocol_id),
                    Array.from(indexedSpectraData.get(spectrumIdentificationJson.upload_id).values()).filter(sd => spectrumIdentificationJson.spectra_data_refs.indexOf(sd.id) !== -1))
            );
        }

        for (let mzidJson of this._mzidentmlFilesJson) {
            this.#mzidentmlFiles.set(mzidJson.id, new MzidentmlFile(mzidJson,
                spectrumIdentificationsMap.get(mzidJson.id),
                indexedSpectraData.get(mzidJson.id), indexedSIPs.get(mzidJson.id)));
        }
        //clear some temp data
        delete this._analysisCollectionSpectrumIdentificationsJson;
        delete this._spectrumIdentificationProtocolsJson;
        delete this._searchModificationsJson;
        delete this._enzymesJson;
        delete this._spectraDataJson;

        // todo - saved config should end up including filter settings not just xiNET layout
        // this.#xiNETLayout = json.xiNETLayout;
        //process actual data
        const proteins = this.#proteins;
        const peptides = new Map();
        if (!this.isAggregatedData()) { // use id as protein id
            for (let rawProtein of this._rawProteins) {
                const protein = new Protein(rawProtein);
                proteins.set(protein.id, protein);
            }
            for (let peptide of this._rawPeptides) {
                peptide.sequence = peptide.base_seq;
                peptides.set(peptide.u_id + "_" + peptide.id, new Peptide(peptide)); // concat upload_id and peptide.id
                for (let p = 0; p < peptide.prt.length; p++) {
                    if (peptide.dec[p]) {
                        const protein = proteins.get(peptide.prt[p]);
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
                proteins.set(protein.id, protein);
            }
        }

        this._rawPeptides = null;
        this._rawProteins = null;
        delete this._rawPeptides;
        delete this._rawProteins;
        this.initDecoyLookup();
        const crosslinks = this.#crosslinks;
        const matches = this.#matches;
        const l = this._rawMatches.length;

        // Create all matches first (this populates _scoreExtents)
        for (let i = 0; i < l; i++) {
            const match = new SpectrumMatch(this, proteins, crosslinks, peptides, this._rawMatches[i]);
            matches.push(match);
        }

        // Select default score type (same logic as match.score())
        this.selectedScoreType = this.scoreExtents.has("Mascot:expectation value")
            ? "Mascot:expectation value"
            : this.scoreExtents.keys().next().value;

        this._rawMatches = null;
        delete this._rawMatches;
        this.#uploadIdToProteinIdsAndGroup = this.getProteinSearchMap(peptides, matches);
    }

    /**
     * Connect searches to proteins
     * @param {Map<string, Peptide>} peptideMap - Map of peptide IDs to Peptide objects
     * @param {Array<SpectrumMatch>} matchArray - Array of spectrum matches
     * @returns {Map<string, Object>} Map of search IDs to search objects with proteinIDSet and id
     */
    getProteinSearchMap(peptideMap, matchArray) {
        const searchMap = new Map();
        let nextGroup = 1;
        matchArray.forEach((match) => {
            match.matchedPeptides.forEach((peptide) => {
                const prots = peptide.prt;
                const searchId = match.uploadId;
                const search = searchMap.get(searchId) || (() => {
                    const newSearch = {proteinIDSet: new Set(), id: searchId, group: nextGroup++};
                    searchMap.set(searchId, newSearch);
                    return newSearch;
                })();
                prots.forEach((prot) => search.proteinIDSet.add(prot));
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
     * Get all searches
     * @returns {Map<string, Object>} Map of search IDs to search objects
     */
    getSearches() {
        return this.#uploadIdToProteinIdsAndGroup;
    }

    /**
     * Get the count of non-decoy target proteins
     * @returns {number} Number of target proteins
     */
    getTargetProteinCount() {
        return this.#targetProteinCount;
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

    // /**
    //  * Get all available score sets
    //  * @returns {Set<string>} Set of score set names
    //  */
    // getScoreSets() {
    //     return this._scoreSets;
    // }
    //
    // /**
    //  * Get min/max extent for a specific score type
    //  * @param {string} [scoreType] - Score type name (defaults to selected score type)
    //  * @returns {[number, number]|null} [min, max] or null if not found
    //  */
    // getScoreExtent(scoreType = this.#selectedScoreType) {
    //     return this.#scoreExtents.get(scoreType) || null;
    // }
    //
    // /**
    //  * Get all score extents for all score types
    //  * @returns {Map<string, [number, number]>} Map of score types to [min, max] extents
    //  */
    // getScoreExtents() {
    //     return this.#scoreExtents;
    // }
    //
    // /**
    //  * Get the currently selected score type name
    //  * @returns {string|null} Selected score type (e.g., "Mascot:expectation value")
    //  */
    // getSelectedScoreType() {
    //     return this.#selectedScoreType;
    // }

    // /**
    //  * Set the selected score type (must exist in _scoreSets)
    //  * @param {string} scoreType - Score type name
    //  * @throws {Error} If scoreType not found in available scores
    //  */
    // setSelectedScoreType(scoreType) {
    //     if (!this._scoreSets.has(scoreType)) {
    //         throw new Error(`Score type "${scoreType}" not found. Available: ${Array.from(this._scoreSets).join(", ")}`);
    //     }
    //     this.#selectedScoreType = scoreType;
    // }

    /**
     * Get all mzIdentML files idexed by upload id
     * @returns {Map<int, MzidentmlFile>} Map of upload id's to MzidentmlFile objects
     */
    getMzidentmlFiles() {
        return this.#mzidentmlFiles;
    }

    /**
     * Get crosslinker specificity information
     * @returns {*} Crosslinker specificity data
     */
    getCrosslinkerSpecificity() {
        return this._crosslinkerSpecificity;
    }

    getEnzymeSpecificity() {
        return this._enzymeSpecificity;
    }

    /**
     * Custom JSON serialization to avoid circular references
     *
     */
    toJSON() {
        return {
            // proteins: Array.from(this.#proteins.values()),
            // matches: this.#matches,
            // crosslinks: Array.from(this.#crosslinks.values()),
            // searches: Array.from(this.#uploadIdToProteinIdsAndGroup.entries()),
            // decoysPresent: this.#decoysPresent,
            // ambiguousPresent: this.#ambiguousPresent,
            // unvalidatedPresent: this.#unvalidatedPresent,
            // crosslinksPresent: this.#crosslinksPresent,
            // linearsPresent: this.#linearsPresent,
            // scoreExtents: Array.from(this.#scoreExtents.entries()),
            // selectedScoreType: this.#selectedScoreType,
            mzidentmlFiles: this.#mzidentmlFiles.entries(),
            targetProteinCount: this.#targetProteinCount,
        };
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

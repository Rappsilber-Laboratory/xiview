import {SpectrumMatch} from "./spectrum-match";
import {Peptide} from "./peptide";
import {Protein} from "./protein";
import {SpectrumIdentificationProtocol} from "./mzidentml-metadata/spectrum-identification-protocol";
import {Xi2SpectrumIdentificationProtocol} from "./xi2-metadata/xi2-spectrum-identification-protocol";
import {SpectraData} from "./mzidentml-metadata/spectra-data";
import {MzidentmlFile} from "./mzidentml-metadata/mzidentml-file";
import {AnalysisCollection_SpectrumIdentification} from "./mzidentml-metadata/analysis-collection-spectrum-identification";
import {SearchModification} from "./mzidentml-metadata/search-modification";
import {Enzyme} from "./mzidentml-metadata/enzyme";

export class SearchResultsModel {
    /** @type {Map<number, MzidentmlFile>} Map of mzIdentML file objects keyed by upload ID */
    #mzidentmlFiles = new Map();

    /** @type {Array<SpectrumMatch>} Array of all spectrum matches in the search results */
    #matches = [];

    /** @type {Map<string, Crosslink>} Map of crosslink objects keyed by crosslink ID */
    #crosslinks = new Map();

    /** @type {Map<string, Protein>} Map of protein objects keyed by protein ID */
    #proteins = new Map();

    /** @type {Map<string, ScoreExtent>} Map of score type names to ScoreExtent objects */
    scoreExtents = new Map();

    /**
     * Currently selected score type name for filtering and visualization - todo check
     * Defaults to "Mascot:expectation value" if available, else first score type
     * @type {string|null}
     * @private
     */
    selectedScoreType = null;

    /** @type {Map<number, {proteinIDSet: Set<string>, id: string, group: number}>} Map of search/upload IDs to search info */
    #uploadIdToProteinIdsAndGroup = new Map();

    /** @type {boolean} Whether decoy proteins are present in results */
    #decoysPresent = false;

    /** @type {boolean} Whether ambiguous matches are present */
    #ambiguousPresent = false;

    /** @type {boolean} Whether unvalidated matches are present */
    #unvalidatedPresent = false;

    /** @type {boolean} Whether crosslinked peptides are present */
    #crosslinksPresent = false;

    /** @type {boolean} Whether linear (non-crosslinked) peptides are present */
    #linearsPresent = false;

    /** @type {number} Count of non-decoy target proteins */
    #targetProteinCount;

    /** @type {Array} Array of crosslinker specificity rules */
    _crosslinkerSpecificity = [];

    _enzymeSpecificity = [];

    /** @type {Map<*, Map<*, Array<Enzyme>>>} upload id -> protocol id -> Enzymes (a protocol may use several) */
    _indexedEnzymes = new Map();

    /** @type {Map<*, Map<*, Array<SearchModification>>>} upload id -> protocol id -> SearchModifications */
    _indexedSearchModifications = new Map();

    /** @type {Map<*, Map<*, SpectraData>>} upload id -> spectra data id -> SpectraData */
    _indexedSpectraData = new Map();

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
        //xi2
        const rsNames = [];
        for (let key of Object.keys(json)) {
            if (json[key] && json[key].rs_name) {
                rsNames.push(json[key].rs_name);
            }
        }
        if (rsNames.length > 0) {
            document.title = rsNames.join(";");
        }
    }

    /**
     * Store <SpectraData> data for later processing
     * @param {Array<Object>} json - Array of spectra data objects
     * @returns {void}
     */
    storeSpectraData(json) {
        // index spectra data by upload id then spectra data id (each id maps to one SpectraData)
        for (let spectraDataJson of json) {
            if (!this._indexedSpectraData.has(spectraDataJson.upload_id)) {
                this._indexedSpectraData.set(spectraDataJson.upload_id, new Map());
            }
            this._indexedSpectraData.get(spectraDataJson.upload_id).set(spectraDataJson.id, new SpectraData(spectraDataJson));
        }
    }

    /**
     * Store enzyme data for later processing
     * @param {Array<Object>} json - Array of enzyme data objects
     * @returns {void}
     */
    storeEnzymes(json) {
        // index enzymes by upload id then protocol id; a protocol may use several enzymes
        for (let enzymeJson of json) {
            if (!this._indexedEnzymes.has(enzymeJson.upload_id)) {
                this._indexedEnzymes.set(enzymeJson.upload_id, new Map());
            }
            const perUpload = this._indexedEnzymes.get(enzymeJson.upload_id);
            if (!perUpload.has(enzymeJson.protocol_id)) {
                perUpload.set(enzymeJson.protocol_id, []);
            }
            perUpload.get(enzymeJson.protocol_id).push(new Enzyme(enzymeJson));
        }
        // derive _enzymeSpecificity from unique site_regexp values
        const seenRegexps = new Set();
        for (const uploadEnzymes of this._indexedEnzymes.values()) {
            for (const enzymes of uploadEnzymes.values()) {
                for (const enzyme of enzymes) {
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
        }
    }

    /**
     * Store search modification data for later processing
     * @param {Array<Object>} json - Array of modification data objects
     * @returns {void}
     */
    storeSearchModifications(json) {
        // index search modifications by upload id then protocol id; a protocol has many modifications
        for (let searchModificationJson of json) {
            if (!this._indexedSearchModifications.has(searchModificationJson.upload_id)) {
                this._indexedSearchModifications.set(searchModificationJson.upload_id, new Map());
            }
            const perUpload = this._indexedSearchModifications.get(searchModificationJson.upload_id);
            if (!perUpload.has(searchModificationJson.protocol_id)) {
                perUpload.set(searchModificationJson.protocol_id, []);
            }
            perUpload.get(searchModificationJson.protocol_id).push(new SearchModification(searchModificationJson));
        }
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
        //process mzid metadata
        // enzymes, search modifications and spectra data were already indexed by their store* methods
        // as the data arrived; parseJSON only performs the joins between metadata entities below.

        //index spectrum identification protocols
        // PRIDE returns an array of SIP records; XI2 returns a dict keyed by resultset id.
        const indexedSIPs = new Map(); // PRIDE: upload_id -> Map(protocol_id -> SIP). XI2: resultset_id -> Map(resultset_id -> Xi2SIP).
        const sipJsonRaw = this._spectrumIdentificationProtocolsJson;
        const xi2SipJsonsByResultsetId = new Map(); // populated only in xi2 path; used below to build bogus MzidentmlFiles
        // xi2 only: search id -> ordered config modification list. A peptide's u_id is
        // its search id and its m_as are 0-based indexes into this list. Empty for PRIDE
        // (there peptides self-describe their mods via CV objects).
        const xi2ModificationsBySearchId = new Map();
        if (Array.isArray(sipJsonRaw)) {
            for (let sipJson of sipJsonRaw) {
                if (!indexedSIPs.has(sipJson.upload_id)) {
                    indexedSIPs.set(sipJson.upload_id, new Map());
                }
                const sip = new SpectrumIdentificationProtocol(sipJson,
                    this._indexedEnzymes.get(sipJson.upload_id)?.get(sipJson.id),
                    this._indexedSearchModifications.get(sipJson.upload_id)?.get(sipJson.id));
                indexedSIPs.get(sipJson.upload_id).set(sipJson.id, sip);
            }
        } else {
            for (const [resultsetId, sipJson] of Object.entries(sipJsonRaw)) {
                const sip = new Xi2SpectrumIdentificationProtocol(sipJson);
                const perFile = new Map();
                perFile.set(resultsetId, sip);
                indexedSIPs.set(resultsetId, perFile);
                xi2SipJsonsByResultsetId.set(resultsetId, sipJson);
                xi2ModificationsBySearchId.set(sip.searchId, sip.searchModifications);
            }
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
                    Array.from(this._indexedSpectraData.get(spectrumIdentificationJson.upload_id).values()).filter(sd => spectrumIdentificationJson.spectra_data_refs.indexOf(sd.id) !== -1))
            );
        }

        for (let mzidJson of this._mzidentmlFilesJson) {
            this.#mzidentmlFiles.set(mzidJson.id, new MzidentmlFile(mzidJson,
                spectrumIdentificationsMap.get(mzidJson.id),
                this._indexedSpectraData.get(mzidJson.id), indexedSIPs.get(mzidJson.id)));
        }
        // Xi2 has no mzIdentML files; synthesise one stub per resultset so the
        // SpectrumMatch.spectrumIdentificationProtocol lookup path (mzidentmlFiles
        // .get(uploadId).getSpectrumIdentificationProtocolById(sip)) still resolves.
        if (this._mzidentmlFilesJson.length === 0 && xi2SipJsonsByResultsetId.size > 0) {
            for (const [resultsetId, sipJson] of xi2SipJsonsByResultsetId) {
                const stub = {
                    id: resultsetId,
                    project_id: new URLSearchParams(window.location.search).get("project") ?? "",
                    identification_file_name: sipJson.rs_name ?? "",
                    analysis_software_list: { AnalysisSoftware: [] },
                    provider: {},
                    audit_collection: {},
                    analysis_sample_collection: {},
                    spectra_formats: [],
                    bib: []
                };
                this.#mzidentmlFiles.set(resultsetId, new MzidentmlFile(stub, [],
                    this._indexedSpectraData.get(resultsetId) ?? new Map(), indexedSIPs.get(resultsetId)));
            }
        }
        //clear some temp data; the enzyme/search-mod/spectra-data objects survive via the
        //SIP and MzidentmlFile objects that now reference them, so only the index wrappers go
        delete this._analysisCollectionSpectrumIdentificationsJson;
        delete this._spectrumIdentificationProtocolsJson;
        delete this._indexedSearchModifications;
        delete this._indexedEnzymes;
        delete this._indexedSpectraData;

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
                peptides.set(peptide.u_id + "_" + peptide.id, new Peptide(peptide, xi2ModificationsBySearchId.get(peptide.u_id))); // concat upload_id and peptide.id
                if (peptide.dec) { // in xi2 the isDecoy info is in the protein
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
            }
        } else { // is aggregated - use accession as protein id
            const tempProteins = new Map();
            for (let rawProtein of this._rawProteins) {
                const protein = new Protein(rawProtein);
                tempProteins.set(protein.id, protein);
            }
            for (let peptide of this._rawPeptides) {
                peptides.set(peptide.u_id + "_" + peptide.id, new Peptide(peptide, xi2ModificationsBySearchId.get(peptide.u_id))); // concat upload_id and peptide.id
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
     * Flag that ambiguous matches are present in the data.
     * Called from SpectrumMatch during parsing (private #ambiguousPresent is not
     * accessible from outside this class).
     * @returns {undefined}
     */
    setAmbiguousPresent() {
        this.#ambiguousPresent = true;
    }

    /**
     * Flag that linear peptides are present in the data.
     * Called from SpectrumMatch during parsing.
     * @returns {undefined}
     */
    setLinearsPresent() {
        this.#linearsPresent = true;
    }

    /**
     * Flag that decoy matches are present in the data.
     * Called from SpectrumMatch during parsing.
     * @returns {undefined}
     */
    setDecoysPresent() {
        this.#decoysPresent = true;
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
     * @returns {Map<number, MzidentmlFile>} Map of upload id's to MzidentmlFile objects
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

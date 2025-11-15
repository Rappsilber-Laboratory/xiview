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
    // Get a single protein by ID
    getProtein(proteinId) {
        return this._proteins.get(proteinId);
    }

    // Get an iterator over protein values (for iteration)
    getProteinsIterator() {
        return this._proteins.values();
    }

    // Get the entire protein Map (for operations needing the Map)
    getProteinsMap() {
        return this._proteins;
    }

    getMatches() {
        return this._matches;
    }

    getCrosslinks() {
        return this._crosslinks;
    }

    getScoreExtent() {
        return this._scoreExtent;
    }

    getSearches() {
        return this._searches;
    }

    getDecoysPresent() {
        return this._decoysPresent;
    }

    getAmbiguousPresent() {
        return this._ambiguousPresent;
    }

    getUnvalidatedPresent() {
        return this._unvalidatedPresent;
    }

    getCrosslinksPresent() {
        return this._crosslinksPresent;
    }

    getLinearsPresent() {
        return this._linearsPresent;
    }

    getScoreSets() {
        return this._scoreSets;
    }

    getSelectedScoreSet() {
        return this._selectedScoreSet;
    }

    getMzidentmlFiles() {
        return this._mzidentmlFiles;
    }

    getAnalysisCollectionSpectrumIdentifications() {
        return this._analysisCollectionSpectrumIdentifications;
    }

    getSpectrumIdentificationProtocols() {
        return this._spectrumIdentificationProtocols;
    }

    getSpectraData() {
        return this._spectraData;
    }

    getEnzymes() {
        return this._enzymes;
    }

    getSearchModifications() {
        return this._searchModifications;
    }

    getPrimaryScore() {
        return this._primaryScore;
    }

    getPeptides() {
        return this._peptides;
    }

    getMinScore() {
        return this._minScore;
    }

    getMaxScore() {
        return this._maxScore;
    }

    getCrosslinkerSpecificity() {
        return this._crosslinkerSpecificity;
    }

    processMzIdentMLFiles(json) {
        const mzidentmlFiles = new Map();
        for (let mzid of json) {
            mzidentmlFiles.set(mzid.id, new MzidentmlFile(mzid, this));
        }
        this._mzidentmlFiles = mzidentmlFiles;
    }

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

    processSpectrumIdentificationProtocols(json) {
        const spectrumIdentificationProtocols = new Map();
        for (let siProtocol of json) {
            const id = siProtocol.id;
            const uploadId = siProtocol.upload_id;
            spectrumIdentificationProtocols.set(uploadId + "_" + id, new SpectrumIdentificationProtocol(siProtocol, this));
        }
        this._spectrumIdentificationProtocols = spectrumIdentificationProtocols;
    }

    getSpectrumIdentificationProtocol(uploadId, id) {
        const spectrumIdentificationProtocols = this._spectrumIdentificationProtocols;
        if (spectrumIdentificationProtocols) {
            return spectrumIdentificationProtocols.get(uploadId + "_" + id);
        } else {
            console.error("No spectrum identification protocol found for uploadId:", uploadId, "and id:", id);
            return null;
        }
    }

    processSpectraData(json) {
        const spectrumSources = new Map();
        for (let specSource of json) {
            spectrumSources.set(specSource.upload_id + "_" + specSource.id, new SpectraData(specSource, this));
        }
        this._spectraData = spectrumSources;
    }

    getSpectraDataById(uploadId, id) {
        const spectraData = this._spectraData;
        if (spectraData) {
            return spectraData.get(uploadId + "_" + id);
        } else {
            console.error("No spectra data found for uploadId:", uploadId, "and id:", id);
            return null;
        }
    }

    processEnzymes(data) {
        const enzymes = new Map();
        for (let e of data) {
            const enzyme = new Enzyme(e);
            enzymes.set(enzyme.id, enzyme);
        }
        this._enzymes = enzymes;
    }

    processSearchModifications(data) {
        const searchModifications = new Map();
        for (let mod of data) {
            const sm = new SearchModification(mod);
            searchModifications.set(sm.id, sm);
        }
        this._searchModifications = searchModifications;
    }

    processMatches(data) {
        this._rawMatches = data;
    }

    processPeptides(data) {
        this._rawPeptides = data;
    }

    processProteins(data) {
        this._rawProteins = data;
    }

    //our SpectrumMatches are constructed from the rawMatches and peptides arrays in this json
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

    // Connect searches to proteins
    // Returns: Map<searchId, {participantIDSet: Set<proteinId>, id: searchId}>
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

    isAggregatedData() {
        return this._mzidentmlFiles.size > 1;
    }
}

SearchResultsModel.commonRegexes = {
    uniprotAccession: /[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}/,
    // notUpperCase: /[^A-Z]/g,
    // decoyNames: /(REV_)|(RAN_)|(DECOY_)|(DECOY:)|(reverse_)/,
};

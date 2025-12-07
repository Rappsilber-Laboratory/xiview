import {SearchResultsModel} from "../js/models/search-results-model";

/**
 * Loads test data from JSON files and populates a SearchResultsModel
 * @param {string} baseUrl - Base URL for fetching test data files
 * @returns {Promise<SearchResultsModel>} - Promise that resolves with populated model
 */
export async function loadTestData(baseUrl = "./test-data") {
    const clmsModel = new SearchResultsModel();

    try {
        // Fetch all test data files
        const [
            mzidentmlFilesData,
            analysisCollectionData,
            protocolsData,
            spectraData,
            enzymesData,
            modificationsData,
            proteinsData,
            peptidesData,
            matchesData
        ] = await Promise.all([
            fetch(`${baseUrl}/get_xiview_mzidentml_files.json`).then(r => r.json()),
            fetch(`${baseUrl}/get_xiview_analysis_collection_spectrum_identifications.json`).then(r => r.json()),
            fetch(`${baseUrl}/get_xiview_spectrum_identification_protocols.json`).then(r => r.json()),
            fetch(`${baseUrl}/get_xiview_spectra_data.json`).then(r => r.json()),
            fetch(`${baseUrl}/get_xiview_enzymes.json`).then(r => r.json()),
            fetch(`${baseUrl}/get_xiview_search_modifications.json`).then(r => r.json()),
            fetch(`${baseUrl}/get_xiview_proteins.json`).then(r => r.json()),
            fetch(`${baseUrl}/get_xiview_peptides.json`).then(r => r.json()),
            fetch(`${baseUrl}/get_xiview_matches.json`).then(r => r.json())
        ]);

        // Process data
        clmsModel.storeMatches(matchesData);
        clmsModel.storePeptides(peptidesData);
        clmsModel.storeProteins(proteinsData);
        clmsModel.storeSearchModifications(modificationsData);
        clmsModel.storeEnzymes(enzymesData);
        clmsModel.storeSpectraData(spectraData);
        clmsModel.storeSpectrumIdentificationProtocols(protocolsData);
        clmsModel.storeAnalysisCollectionSpectrumIdentifications(analysisCollectionData);
        clmsModel.storeMzIdentMLFiles(mzidentmlFilesData);

        // After loading all data, call parseJSON to construct internal structures
        // This populates participants, crosslinks, matches arrays, etc.
        clmsModel.parseJSON({});
        console.log(clmsModel.toJSON());
        return clmsModel;
    } catch (error) {
        console.error("Error loading test data:", error);
        throw error;
    }
}

/**
 * Helper to get expected counts for validation
 */
export const expectedCounts = {
    proteins: 8,
    peptides: 69, // Will be determined by actual test data
    matches: 27,
    crosslinks: 22, // Will be determined after processing
    searches: 4 // Based on unique search_id values in proteins
};

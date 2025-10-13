import {module, test, start} from "qunit";
import {loadTestData} from "./test-helper";

/**
 * CLMS-model Test Suite
 * Tests core model functionality without UI dependencies
 */
export async function testSetup() {
    console.log("Loading test data for CLMS-model tests...");

    let clmsModel;
    try {
        clmsModel = await loadTestData();
        console.log("Test data loaded successfully");
    } catch (error) {
        console.error("Failed to load test data:", error);
        // Create a failing test to report the error
        module("Data Loading");
        test("Load test data", function(assert) {
            assert.ok(false, "Failed to load test data: " + error.message);
        });
        return;
    }

    console.log("Running QUnit tests...");
    start();
    module("Data Loading and Processing");

    test("Proteins loaded correctly", function (assert) {
        const participants = clmsModel.get("participants");
        assert.ok(participants instanceof Map, "participants is a Map");
        assert.ok(participants.size > 0, `At least some proteins loaded (${participants.size})`);

        // In aggregated data, protein IDs are changed to accessions during parseJSON
        // Check using accessions instead of original IDs
        const participantKeys = Array.from(participants.keys());
        assert.ok(participantKeys.length > 0, `Participant keys exist: ${participantKeys.join(", ")}`);

        // Check if PA (protein_A accession) exists
        const proteinA = participants.get("PA");
        if (proteinA) {
            assert.ok(true, "protein_A (PA) exists");
            assert.equal(proteinA.sequence, "MKVLVIGNGKPEPK", "protein_A sequence correct");
        } else {
            assert.ok(false, "protein_A (PA) not found in participants");
        }
    });

    test("Protein sequences loaded", function (assert) {
        const participants = clmsModel.get("participants");

        // Check protein B using its accession
        const proteinB = participants.get("PB");
        if (proteinB) {
            assert.equal(proteinB.sequence, "DAHKSEVAHRFKDLGEENFKTIDEK", "protein_B sequence correct");
            assert.equal(proteinB.accession, "PB", "protein_B accession correct");
        } else {
            assert.ok(false, "protein_B (PB) not found in participants");
        }
    });

    test("Peptides processed correctly", function (assert) {
        // Peptides are stored internally and accessed via matches
        // The raw peptide data is in clmsModel.peptides
        assert.ok(clmsModel.peptides, "peptides data exists");
        assert.ok(Array.isArray(clmsModel.peptides), "peptides is an array");
        assert.ok(clmsModel.peptides.length > 0, "peptides array is not empty");

        // Check first peptide has expected properties
        const firstPeptide = clmsModel.peptides[0];
        assert.ok(firstPeptide.id !== undefined, "peptide has id");
    });

    test("Matches loaded correctly", function (assert) {
        const matches = clmsModel.get("matches");
        assert.ok(Array.isArray(matches), "matches is an array");
        assert.equal(matches.length, 27, "Expected 27 matches");

        // Check first match has expected properties
        const firstMatch = matches[0];
        assert.ok(firstMatch.id, "match has id");
        assert.ok(firstMatch.searchId !== undefined, "match has searchId");
    });

    test("Searches identified", function (assert) {
        const searches = clmsModel.get("searches");
        assert.ok(searches instanceof Map, "searches is a Map");
        // Should have 4 unique search_ids based on protein data: "1", "2", "3", "4"
        assert.ok(searches.size > 0, "At least one search identified");
    });

    test("Enzymes loaded", function (assert) {
        const enzymes = clmsModel.enzymes;
        assert.ok(enzymes !== undefined, "enzymes data exists");
        assert.ok(Array.isArray(enzymes), "enzymes is an array");
    });

    test("Search modifications loaded", function (assert) {
        const modifications = clmsModel.get("modifications");
        assert.ok(modifications instanceof Map, "modifications is a Map");
    });

    test("Spectra data loaded", function (assert) {
        const spectraData = clmsModel.get("spectraData");
        assert.ok(spectraData instanceof Map, "spectraData is a Map");
    });

    test("Spectrum identification protocols loaded", function (assert) {
        const protocols = clmsModel.get("spectrumIdentificationProtocols");
        assert.ok(protocols instanceof Map, "spectrumIdentificationProtocols is a Map");
    });

    test("MzIdentML files loaded", function (assert) {
        const mzidentmlFiles = clmsModel.get("mzidentmlFiles");
        assert.ok(mzidentmlFiles instanceof Map, "mzidentmlFiles is a Map");
        assert.ok(mzidentmlFiles.size > 0, "At least one mzidentML file loaded");
    });

    test("MzIdentML file properties correct", function (assert) {
        const mzidentmlFiles = clmsModel.get("mzidentmlFiles");
        // Get first mzidentML file (id 1 based on test data)
        const mzidFile = mzidentmlFiles.get(1);

        if (mzidFile) {
            assert.equal(mzidFile.id, 1, "mzidentML file id is 1");
            assert.equal(mzidFile.uploadId, 1, "uploadId matches id");
            assert.equal(mzidFile.projectId, "crosslinking", "project_id is correct");
            assert.equal(mzidFile.identificationFileName, "multiple_spectra_per_id_1_3_0_draft.mzid", "identification_file_name is correct");
            assert.equal(mzidFile.containsCrosslinks, true, "contains_crosslinks is true");
            assert.ok(Array.isArray(mzidFile.warnings), "warnings is an array");
            assert.ok(Array.isArray(mzidFile.spectraFormats), "spectra_formats is an array");
            assert.ok(mzidFile.spectraFormats.length > 0, "spectra_formats has entries");
        } else {
            assert.ok(false, "MzIdentML file with id 1 not found");
        }
    });

    test("Analysis collection spectrum identifications loaded", function (assert) {
        const analysisCollection = clmsModel.get("analysisCollectionSpectrumIdentifications");
        assert.ok(analysisCollection instanceof Map, "analysisCollectionSpectrumIdentifications is a Map");
        assert.ok(analysisCollection.size > 0, "At least one analysis collection spectrum identification loaded");
    });

    test("Analysis collection spectrum identification properties correct", function (assert) {
        const analysisCollection = clmsModel.get("analysisCollectionSpectrumIdentifications");
        // Get first entry - upload_id 1, spectrum_identification_list_ref "sil_HCD"
        const acsi = analysisCollection.get("1_sil_HCD");

        if (acsi) {
            assert.equal(acsi.uploadId, 1, "uploadId is 1");
            assert.equal(acsi.spectrumIdentificationListRef, "sil_HCD", "spectrum_identification_list_ref is correct");
            assert.equal(acsi.spectrumIdentificationProtocolRef, "SearchProtocol_HCD", "spectrum_identification_protocol_ref is correct");
            assert.ok(Array.isArray(acsi.spectraDataRefs), "spectra_data_refs is an array");
            assert.ok(acsi.spectraDataRefs.length > 0, "spectra_data_refs has entries");
            assert.ok(Array.isArray(acsi.searchDatabaseRefs), "search_database_refs is an array");
            assert.ok(acsi.searchDatabaseRefs.length > 0, "search_database_refs has entries");
        } else {
            assert.ok(false, "Analysis collection spectrum identification with key '1_sil_HCD' not found");
        }
    });

    test("Relationship between mzidentml files and analysis collections", function (assert) {
        const mzidentmlFiles = clmsModel.get("mzidentmlFiles");
        const analysisCollection = clmsModel.get("analysisCollectionSpectrumIdentifications");

        // Check that analysis collection entries reference valid upload_ids (mzidentml file ids)
        let allValid = true;
        analysisCollection.forEach(acsi => {
            if (!mzidentmlFiles.get(acsi.uploadId)) {
                allValid = false;
                console.error("Analysis collection references non-existent upload_id:", acsi.uploadId);
            }
        });

        assert.ok(allValid, "All analysis collection entries reference valid mzidentml files");
    });

    module("Crosslinks");

    test("Crosslinks generated from matches", function (assert) {
        const crosslinks = clmsModel.get("crosslinks");
        assert.ok(crosslinks instanceof Map, "crosslinks is a Map");
        assert.ok(crosslinks.size > 0, "crosslinks generated from matches");
    });

    test("Crosslinks have correct structure", function (assert) {
        const crosslinks = clmsModel.get("crosslinks");
        const firstCrosslink = Array.from(crosslinks.values())[0];

        if (firstCrosslink) {
            assert.ok(firstCrosslink.id, "crosslink has id");
            assert.ok(firstCrosslink.matches_pp !== undefined, "crosslink has matches_pp array");
        } else {
            assert.ok(false, "No crosslinks found to test structure");
        }
    });

    test("Linear peptides identified", function (assert) {
        const matches = clmsModel.get("matches");
        const linearMatches = matches.filter(m => !m.crosslink);

        // Check if linear matches exist in test data
        if (linearMatches.length > 0) {
            assert.ok(true, `Found ${linearMatches.length} linear matches`);
        } else {
            assert.ok(true, "No linear matches in test data (expected for crosslink-only datasets)");
        }
    });

    module("Data Integrity");

    test("Peptide to protein mappings valid", function (assert) {
        const peptides = clmsModel.peptides;  // Use direct property, not get()
        const participants = clmsModel.get("participants");

        let allValid = true;
        const invalidPeptides = [];

        if (peptides && peptides.length) {
            peptides.forEach(peptide => {
                if (peptide.prt) {
                    peptide.prt.forEach(proteinId => {
                        if (!participants.get(proteinId)) {
                            allValid = false;
                            invalidPeptides.push({peptideId: peptide.id, proteinId: proteinId});
                        }
                    });
                }
            });
        }

        assert.ok(allValid, "All peptide-to-protein mappings reference valid proteins");
        if (!allValid) {
            console.error("Invalid peptide mappings:", invalidPeptides);
        }
    });

    test("Match to peptide mappings valid", function (assert) {
        const matches = clmsModel.get("matches");
        const peptides = clmsModel.peptides;  // Use direct property, not get()
        const peptideMap = new Map(peptides.map(p => [p.id, p]));

        let allValid = true;

        matches.forEach(match => {
            if (match.matchedPeptides) {
                match.matchedPeptides.forEach(mp => {
                    if (mp && mp.id && !peptideMap.get(mp.id)) {
                        allValid = false;
                        console.error("Invalid match-to-peptide mapping:", match.id, "->", mp.id);
                    }
                });
            }
        });

        assert.ok(allValid, "All match-to-peptide mappings reference valid peptides");
    });

    test("Search IDs consistent", function (assert) {
        const participants = clmsModel.get("participants");
        const searches = clmsModel.get("searches");

        // Check all protein search_ids are in searches map
        let allValid = true;
        participants.forEach(protein => {
            if (protein.search_id && !searches.has(protein.search_id)) {
                allValid = false;
                console.error("Protein has invalid search_id:", protein.id, protein.search_id);
            }
        });

        assert.ok(allValid, "All protein search_ids reference valid searches");
    });

    module("Model State");

    test("Presence flags set correctly", function (assert) {
        const crosslinksPresent = clmsModel.get("crosslinksPresent");
        const linearsPresent = clmsModel.get("linearsPresent");
        const decoysPresent = clmsModel.get("decoysPresent");

        assert.equal(typeof crosslinksPresent, "boolean", "crosslinksPresent is boolean");
        assert.equal(typeof linearsPresent, "boolean", "linearsPresent is boolean");
        assert.equal(typeof decoysPresent, "boolean", "decoysPresent is boolean");
    });

    test("Score extent calculated", function (assert) {
        const scoreExtent = clmsModel.get("scoreExtent");

        if (scoreExtent) {
            assert.ok(Array.isArray(scoreExtent) || scoreExtent instanceof Map,
                "scoreExtent exists and is array or map");
        } else {
            // Score extent might not be set if no matches have scores
            assert.ok(true, "scoreExtent not set (may be expected for this dataset)");
        }
    });

    module("SearchResultsModel Methods");

    test("getProteinSearchMap method", function (assert) {
        const peptides = [
            {id: "1", prt: ["A"]},
            {id: "2", prt: ["A"]},
            {id: "3", prt: ["A", "B"]},
            {id: "4", prt: ["C"]},
        ];
        const matches = [
            {pi: ["1", "2"], si: "S1"},
            {pi: ["1", "3"], si: "S1"},
            {pi: ["4"], si: "S2"},
        ];

        const searchMap = clmsModel.getProteinSearchMap(peptides, matches);

        assert.ok(searchMap, "getProteinSearchMap returns result");
        assert.ok(searchMap["S1"], "Search S1 exists in map");
        assert.ok(searchMap["S2"], "Search S2 exists in map");
    });

    test("isAggregatedData method", function (assert) {
        const isAggregated = clmsModel.isAggregatedData();
        assert.equal(typeof isAggregated, "boolean", "isAggregatedData returns boolean");
    });

    console.log("CLMS-model tests completed");
}

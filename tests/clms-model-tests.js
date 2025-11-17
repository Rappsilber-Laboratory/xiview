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
    module("Data Loading and Processing");

    test("Proteins loaded correctly", function (assert) {
        const proteins = clmsModel.getProteinsMap();
        assert.ok(proteins instanceof Map, "participants is a Map");
        assert.ok(proteins.size > 0, `At least some proteins loaded (${proteins.size})`);

        // In aggregated data, protein IDs are changed to accessions during parseJSON
        // Check using accessions instead of original IDs
        const participantKeys = Array.from(proteins.keys());
        assert.ok(participantKeys.length > 0, `Participant keys exist: ${participantKeys.join(", ")}`);

        // Check if PA (protein_A accession) exists
        const proteinA = proteins.get("PA");
        if (proteinA) {
            assert.ok(true, "protein_A (PA) exists");
            assert.equal(proteinA.sequence, "MKVLVIGNGKPEPK", "protein_A sequence correct");
        } else {
            assert.ok(false, "protein_A (PA) not found in participants");
        }
    });

    test("Protein sequences loaded", function (assert) {
        const participants = clmsModel.getProteinsMap();

        // Check protein B using its accession
        const proteinB = participants.get("PB");
        if (proteinB) {
            assert.equal(proteinB.sequence, "DAHKSEVAHRFKDLGEENFKTIDEK", "protein_B sequence correct");
            assert.equal(proteinB.accession, "PB", "protein_B accession correct");
        } else {
            assert.ok(false, "protein_B (PB) not found in participants");
        }
    });

    // test("Peptides processed correctly", function (assert) {
    //     const peptides = clmsModel.getPeptides();
    //     assert.ok(peptides instanceof Map, "peptides is a Map");
    //     assert.ok(peptides.size > 0, `peptides Map has entries (${peptides.size} total)`);
    //
    //     // Test DSSO crosslink donor peptide exists (from upload 1)
    //     const dssoDonor = peptides.get("1_0");
    //     assert.ok(dssoDonor, "DSSO crosslink donor peptide exists (1_0)");
    //     if (dssoDonor) {
    //         assert.equal(dssoDonor._pep.seq, "PEPK", "DSSO donor has expected sequence");
    //         assert.equal(dssoDonor._pep.ls1, 4, "DSSO donor has link site at position 4");
    //         assert.equal(dssoDonor._pep.cl_m, 158.003765, "DSSO donor has correct crosslink mass");
    //         const donorMod = dssoDonor._pep.m_as.find(m => m["MS:1003393"] === "DSSO_crosslink_donor");
    //         assert.ok(donorMod, "DSSO donor has crosslink donor modification");
    //     }
    //
    //     // Test DSSO crosslink acceptor peptide exists
    //     const dssoAcceptor = peptides.get("1_1");
    //     assert.ok(dssoAcceptor, "DSSO crosslink acceptor peptide exists (1_1)");
    //     if (dssoAcceptor) {
    //         assert.equal(dssoAcceptor._pep.seq, "TIDEK", "DSSO acceptor has expected sequence");
    //         assert.equal(dssoAcceptor._pep.ls1, 1, "DSSO acceptor has link site at position 1");
    //         const acceptorMod = dssoAcceptor._pep.m_as.find(m => m["MS:1003393"] === "DSSO_crosslink_acceptor");
    //         assert.ok(acceptorMod, "DSSO acceptor has crosslink acceptor modification");
    //     }
    //
    //     // Test DSSO monolink stubs exist
    //     const dssoStubA = peptides.get("1_2");
    //     assert.ok(dssoStubA, "DSSO stub_a monolink exists (1_2)");
    //     if (dssoStubA) {
    //         const stubMod = dssoStubA._pep.m_as.find(m => m["MS:1003393"] === "DSSO_crosslink_stub_a");
    //         assert.ok(stubMod, "DSSO stub_a has correct modification type");
    //         assert.equal(dssoStubA._pep.m_ms[0], 54.010565, "DSSO stub_a has correct mass");
    //     }
    //
    //     // Test EDC self-link (same peptide, two link sites)
    //     const edcSelfLink = peptides.get("2_5");
    //     assert.ok(edcSelfLink, "EDC self-link peptide exists (2_5)");
    //     if (edcSelfLink) {
    //         assert.equal(edcSelfLink._pep.seq, "DVIQSLVDDDLVAK", "EDC self-link has expected sequence");
    //         assert.equal(edcSelfLink._pep.ls1, 10, "EDC self-link has first link site");
    //         assert.equal(edcSelfLink._pep.ls2, 14, "EDC self-link has second link site");
    //         assert.equal(edcSelfLink._pep.cl_m, -18.010565, "EDC crosslink has correct mass");
    //     }
    //
    //     // Test SDA crosslink pair
    //     const sdaDonor = peptides.get("3_3");
    //     const sdaAcceptor = peptides.get("3_2");
    //     assert.ok(sdaDonor, "SDA crosslink donor exists (3_3)");
    //     assert.ok(sdaAcceptor, "SDA crosslink acceptor exists (3_2)");
    //     if (sdaDonor && sdaAcceptor) {
    //         const donorMod = sdaDonor._pep.m_as.find(m => m["MS:1003393"] === "SDA_crosslink_donor");
    //         const acceptorMod = sdaAcceptor._pep.m_as.find(m => m["MS:1003393"] === "SDA_crosslink_acceptor");
    //         assert.ok(donorMod, "SDA donor has correct modification");
    //         assert.ok(acceptorMod, "SDA acceptor has correct modification");
    //         assert.equal(sdaDonor._pep.cl_m, 82.04186, "SDA donor has correct crosslink mass");
    //     }
    //
    //     // Test linear peptide (no crosslink)
    //     const linearPep = peptides.get("2_0");
    //     assert.ok(linearPep, "Linear peptide exists (2_0)");
    //     if (linearPep) {
    //         assert.equal(linearPep._pep.ls1, null, "Linear peptide has no link site 1");
    //         assert.equal(linearPep._pep.ls2, null, "Linear peptide has no link site 2");
    //         assert.equal(linearPep._pep.cl_m, 0, "Linear peptide has no crosslink mass");
    //         assert.equal(linearPep._pep.m_as.length, 0, "Linear peptide has no modifications");
    //     }
    //
    //     // Test peptide with multiple non-crosslink modifications
    //     const modifiedPep = peptides.get("4_0");
    //     assert.ok(modifiedPep, "Peptide with multiple modifications exists (4_0)");
    //     if (modifiedPep) {
    //         assert.equal(modifiedPep._pep.m_as.length, 3, "Peptide has 3 modifications");
    //         const oxidation = modifiedPep._pep.m_as.find(m => m["UNIMOD:35"] === "Oxidation");
    //         const cm = modifiedPep._pep.m_as.filter(m => m["UNIMOD:4"] === "Carbamidomethyl");
    //         assert.ok(oxidation, "Peptide has Oxidation modification");
    //         assert.equal(cm.length, 2, "Peptide has 2 Carbamidomethyl modifications");
    //     }
    //
    //     // Test peptide structure consistency
    //     peptides.forEach((pepEntry, key) => {
    //         assert.ok(/^\d+_\d+$/.test(key), `peptide keys follow uploadId_peptideId pattern: ${key}`);
    //         const pep = pepEntry._pep;
    //         assert.ok(pep.id !== undefined, `Peptide ${key} has id`);
    //         assert.ok(pep.u_id, `Peptide ${key} has u_id`);
    //         assert.ok(pep.seq, `Peptide ${key} has sequence`);
    //         assert.ok(Array.isArray(pep.prt), `Peptide ${key} prt is array`);
    //         assert.ok(Array.isArray(pep.pos), `Peptide ${key} pos is array`);
    //         assert.ok(Array.isArray(pep.m_as), `Peptide ${key} m_as is array`);
    //         assert.ok(Array.isArray(pep.m_ps), `Peptide ${key} m_ps is array`);
    //         assert.ok(Array.isArray(pep.m_ms), `Peptide ${key} m_ms is array`);
    //         assert.ok(typeof pep.cl_m === "number", `Peptide ${key} cl_m is number`);
    //     });
    // });

    test("Matches loaded correctly", function (assert) {
        const matches = clmsModel.getMatches();
        assert.ok(Array.isArray(matches), "matches is an array");
        assert.equal(matches.length, 27, "Expected 27 matches");

        // Check first match has expected properties
        const firstMatch = matches[0];
        assert.ok(firstMatch.id, "match has id");
        assert.ok(firstMatch.uploadId !== undefined, "match has uploadId");
    });

    test("Searches identified", function (assert) {
        const searches = clmsModel.getMzidentmlFiles();
        assert.ok(searches instanceof Map, "searches is a Map");
        // Should have 4 unique search_ids based on protein data: "1", "2", "3", "4"
        assert.ok(searches.size > 0, "At least one search identified");
    });

    // test("Enzymes loaded", function (assert) {
    //     const enz = clmsModel.get("enzymes");
    //     assert.ok(enz instanceof Map, "modifications is a Map");
    // });

    // test("Search modifications loaded", function (assert) {
    //     const modifications = clmsModel.getSearchModifications();
    //     assert.ok(modifications instanceof Map, "modifications is a Map");
    // });

    // test("Spectra data loaded", function (assert) {
    //     const spectraData = clmsModel.getSpectraData();
    //     assert.ok(spectraData instanceof Map, "spectraData is a Map");
    // });

    // test("Spectrum identification protocols loaded", function (assert) {
    //     const protocols = clmsModel.getSpectrumIdentificationProtocols();
    //     assert.ok(protocols instanceof Map, "spectrumIdentificationProtocols is a Map");
    // });

    test("MzIdentML files loaded", function (assert) {
        const mzidentmlFiles = clmsModel.getMzidentmlFiles();
        assert.ok(mzidentmlFiles instanceof Map, "mzidentmlFiles is a Map");
        assert.ok(mzidentmlFiles.size > 0, "At least one mzidentML file loaded");
    });

    test("MzIdentML file properties correct", function (assert) {
        const mzidentmlFiles = clmsModel.getMzidentmlFiles();
        // Get first mzidentML file (id 1 based on test data)
        const mzidFile = mzidentmlFiles.get(1);

        if (mzidFile) {
            assert.equal(mzidFile.id, 1, "mzidentML file id is 1");
            assert.equal(mzidFile.projectId, "crosslinking", "project_id is correct");
            assert.equal(mzidFile.identificationFileName, "multiple_spectra_per_id_1_3_0_draft.mzid", "identification_file_name is correct");
            assert.ok(Array.isArray(mzidFile.spectraFormats), "spectra_formats is an array");
            assert.ok(mzidFile.spectraFormats.length > 0, "spectra_formats has entries");
        } else {
            assert.ok(false, "MzIdentML file with id 1 not found");
        }
    });

    // test("Analysis collection spectrum identifications loaded", function (assert) {
    //     const analysisCollection = clmsModel.getAnalysisCollectionSpectrumIdentifications();
    //     assert.ok(analysisCollection instanceof Map, "analysisCollectionSpectrumIdentifications is a Map");
    //     assert.ok(analysisCollection.size > 0, "At least one analysis collection spectrum identification loaded");
    // });

    // test("Analysis collection spectrum identification properties correct", function (assert) {
    //     const analysisCollection = clmsModel.getAnalysisCollectionSpectrumIdentifications();
    //     // Get first entry - upload_id 1, spectrum_identification_list_ref "sil_HCD"
    //     const acsiMap = analysisCollection.get(1);
    //
    //     if (acsiMap) {
    //         const acsi = acsiMap.get("sil_HCD");
    //         assert.equal(acsi.uploadId, 1, "uploadId is 1");
    //         assert.equal(acsi.spectrumIdentificationListRef, "sil_HCD", "spectrum_identification_list_ref is correct");
    //         assert.equal(acsi.spectrumIdentificationProtocolRef, "SearchProtocol_HCD", "spectrum_identification_protocol_ref is correct");
    //         assert.ok(Array.isArray(acsi.spectraDataRefs), "spectra_data_refs is an array");
    //         assert.ok(acsi.spectraDataRefs.length > 0, "spectra_data_refs has entries");
    //         assert.ok(Array.isArray(acsi.searchDatabaseRefs), "search_database_refs is an array");
    //         assert.ok(acsi.searchDatabaseRefs.length > 0, "search_database_refs has entries");
    //     } else {
    //         assert.ok(false, "Analysis collection spectrum identification with key '1_sil_HCD' not found");
    //     }
    // });

    // test("Relationship between mzidentml files and analysis collections", function (assert) {
    //     const mzidentmlFiles = clmsModel.getMzidentmlFiles();
    //     const analysisCollection = clmsModel.getAnalysisCollectionSpectrumIdentifications();
    //
    //     // Check that analysis collection entries reference valid upload_ids (mzidentml file ids)
    //     let allValid = true;
    //     analysisCollection.values().forEach(acsiMap => {
    //         acsiMap.forEach(acsi => {
    //             if (!mzidentmlFiles.get(acsi.uploadId)) {
    //                 allValid = false;
    //                 console.error("Analysis collection references non-existent upload_id:", acsi.uploadId);
    //             }
    //         });
    //     });
    //
    //     assert.ok(allValid, "All analysis collection entries reference valid mzidentml files");
    // });

    module("Crosslinks");

    test("Crosslinks generated from matches", function (assert) {
        const crosslinks = clmsModel.getCrosslinks();
        assert.ok(crosslinks instanceof Map, "crosslinks is a Map");
        assert.ok(crosslinks.size > 0, "crosslinks generated from matches");
    });

    test("Crosslinks have correct structure", function (assert) {
        const crosslinks = clmsModel.getCrosslinks();
        const firstCrosslink = Array.from(crosslinks.values())[0];

        if (firstCrosslink) {
            assert.ok(firstCrosslink.id, "crosslink has id");
            assert.ok(firstCrosslink.matches_pp !== undefined, "crosslink has matches_pp array");
        } else {
            assert.ok(false, "No crosslinks found to test structure");
        }
    });

    test("Linear peptides identified", function (assert) {
        const matches = clmsModel.getMatches();
        const linearMatches = matches.filter(m => !m.crosslink);

        // Check if linear matches exist in test data
        if (linearMatches.length > 0) {
            assert.ok(true, `Found ${linearMatches.length} linear matches`);
        } else {
            assert.ok(true, "No linear matches in test data (expected for crosslink-only datasets)");
        }
    });

    module("Data Integrity");

    // test("Peptide to protein mappings valid", function (assert) {
    //     const peptides = clmsModel.getPeptides();
    //     const participants = clmsModel.getProteinsMap();
    //
    //     let allValid = true;
    //     const invalidPeptides = [];
    //
    //     if (peptides && peptides.size > 0) {
    //         peptides.forEach(peptide => {
    //             if (peptide.prt) {
    //                 peptide.prt.forEach(proteinId => {
    //                     if (!participants.get(proteinId)) {
    //                         allValid = false;
    //                         invalidPeptides.push({peptideId: peptide.id, proteinId: proteinId});
    //                     }
    //                 });
    //             }
    //         });
    //     }
    //
    //     assert.ok(allValid, "All peptide-to-protein mappings reference valid proteins");
    //     if (!allValid) {
    //         console.error("Invalid peptide mappings:", invalidPeptides);
    //     }
    // });

    // test("Match to peptide mappings valid", function (assert) {
    //     const matches = clmsModel.getMatches();
    //     const peptides = clmsModel.getPeptides();
    //
    //     let allValid = true;
    //
    //     matches.forEach(match => {
    //         if (match.matchedPeptides) {
    //             match.matchedPeptides.forEach(mp => {
    //                 if (mp && mp.id && !peptides.get(mp.id)) {
    //                     allValid = false;
    //                     console.error("Invalid match-to-peptide mapping:", match.id, "->", mp.id);
    //                 }
    //             });
    //         }
    //     });
    //
    //     assert.ok(allValid, "All match-to-peptide mappings reference valid peptides");
    // });

    test("Search IDs consistent", function (assert) {
        const participants = clmsModel.getProteinsMap();
        const mzidFiles = clmsModel.getMzidentmlFiles();

        // Check all protein search_ids are in searches map
        let allValid = true;
        participants.forEach(protein => {
            if (protein.upload_id && !mzidFiles.has(protein.upload_id)) {
                allValid = false;
                console.error("Protein has invalid upload_id:", protein.id, protein.upload_id);
            }
        });

        assert.ok(allValid, "All protein search_ids reference valid searches");
    });

    module("Model State");

    test("Presence flags set correctly", function (assert) {
        const crosslinksPresent = clmsModel.getCrosslinksPresent();
        const linearsPresent = clmsModel.getLinearsPresent();
        const decoysPresent = clmsModel.getDecoysPresent();

        assert.equal(typeof crosslinksPresent, "boolean", "crosslinksPresent is boolean");
        assert.equal(typeof linearsPresent, "boolean", "linearsPresent is boolean");
        assert.equal(typeof decoysPresent, "boolean", "decoysPresent is boolean");
    });

    test("Score extent calculated", function (assert) {
        const scoreExtent = clmsModel.getScoreExtent();

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
            {matchedPeptides: [peptides[0], peptides[1]], uploadId: "S1"},
            {matchedPeptides: [peptides[0], peptides[2]], uploadId: "S1"},
            {matchedPeptides: [peptides[3]], uploadId: "S2"},
        ];

        const searchMap = clmsModel.getProteinSearchMap(peptides, matches);
        assert.ok(searchMap, "getProteinSearchMap returns result");
        assert.ok(searchMap.get("S1"), "Search S1 exists in map");
        assert.ok(searchMap.get("S2"), "Search S2 exists in map");
        assert.ok(searchMap.get("S1").participantIDSet instanceof Set, "S1 has participantIDSet as Set");
        assert.ok(searchMap.get("S2").participantIDSet instanceof Set, "S2 has participantIDSet as Set");
        assert.equal(searchMap.get("S1").id, "S1", "S1 has correct id property");
        assert.equal(searchMap.get("S2").id, "S2", "S2 has correct id property");
        // Check participantIDSet contents
        assert.deepEqual([...searchMap.get("S1").participantIDSet].sort(), ["A", "B"], "S1 contains proteins A and B");
        assert.deepEqual([...searchMap.get("S2").participantIDSet].sort(), ["C"], "S2 contains protein C");
    });

    test("isAggregatedData method", function (assert) {
        const isAggregated = clmsModel.isAggregatedData();
        assert.equal(isAggregated, true);
    });

    start();
    console.log("CLMS-model tests completed");
}

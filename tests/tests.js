import * as $ from "jquery";
import * as _ from 'underscore';
import * as NGL from "../vendor/ngl.dev";

import {mostReadableMultipleId, } from "../js/downloads";
import {GotohAligner} from "../js/align/bioseq32";
import {
    crosslinkCountPerProteinPairing,
    crosslinkerSpecificityPerLinker,
    filterRepeatedSequences,
    filterSequenceByResidueSet,
    getDistanceSquared,
    getLegalAccessionIDs,
    getMinimumDistance,
    highestScore,
    indexSameSequencesToFirstOccurrence,
    joinConsecutiveNumbersIntoRanges, makeSubIndexedMap,
    makeURLQueryPairs,
    matrixPairings,
    mergeContiguousFeatures,
    parseURLQueryString,
    radixSort,
    reinflateSequenceMap,
    updateLinkMetadata,
    updateProteinMetadata,
    updateUserAnnotationsMetadata
} from "../js/modelUtils";
import {
    getChainSequencesFromNGLStage,
    getRangedCAlphaResidueSelectionForChain,
    make3DAlignID,
    NGLUtils, not3DHomomultimeric
} from "../js/views/ngl/NGLUtils";
import {toNearest} from "../js/utils";
import {STRINGUtils} from "../js/file-choosers/stringUtils";
import {getLinksCSV, getMatchesCSV, getResidueCount} from "../js/downloads";

export function testCallback (model) {
    console.log ("model", model);
    const clmsModel = model.get("clmsModel");
    // utils.debug = true;

    const dseq1AO6 = "SEVAHRFKDLGEENFKALVLIAFAQYLQQCPFEDHVKLVNEVTEFAKTCVADESAENCDKSLHTLFGDKLCTVATLRETYGEMADCCAKQEPERNECFLQHKDDNPNLPRLVRPEVDVMCTAFHDNEETFLKKYLYEIARRHPYFYAPELLFFAKRYKAAFTECCQAADKAACLLPKLDELRDEGKASSAKQRLKCASLQKFGERAFKAWAVARLSQRFPKAEFAEVSKLVTDLTKVHTECCHGDLLECADDRADLAKYICENQDSISSKLKECCEKPLLEKSHCIAEVENDEMPADLPSLAADFVESKDVCKNYAEAKDVFLGMFLYEYARRHPDYSVVLLLRLAKTYETTLEKCCAAADPHECYAKVFDEFKPLVEEPQNLIKQNCELFEQLGEYKFQNALLVRYTKKVPQVSTPTLVEVSRNLGKVGSKCCKHPEAKRMPCAEDYLSVVLNQLCVLHEKTPVSDRVTKCCTESLVNRRPCFSALEVDETYVPKEFNAETFTFHADICTLSEKERQIKKQTALVELVKHKPKATKEQLKAVMDDFAAFVEKCCKADDKETCFAEEGKKLVAASQAA";

    QUnit.start();

    QUnit.module ("Parsing");
    QUnit.test("JSON to Model Parsing", function (assert) {
        const expectedLinks = 162;
        const expectedMatches = 291;
        assert.deepEqual(clmsModel.get("crosslinks").size, expectedLinks, "Expected "+JSON.stringify(expectedLinks)+" crosslinks, Passed!");
        assert.deepEqual(clmsModel.get("matches").length, expectedMatches, "Expected "+JSON.stringify(expectedMatches)+" matches, Passed!");
    });

    QUnit.test("Decoy Protein Matching", function (assert) {
        const decoys = [
            {id: "10001001", name: "REV", accession: "REV_P02768-A", is_decoy: true},
            {id: "10001002", name: "RAN", accession: "RAN_P02768-A", is_decoy: true},
        ];
        decoys.forEach (function (decoy) { clmsModel.get("participants").set (decoy.id, decoy); });

        clmsModel.initDecoyLookup();
        const actual = Array.from(clmsModel.get("participants").values()).map (function (p) { return {id: p.id, targetProteinID: p.targetProteinID}; });
        const expected = [{id: "P02768-A", targetProteinID: "P02768-A"}];
        decoys.forEach (function (decoy) {
            expected.push ({id: decoy.id, targetProteinID: "P02768-A"});
        });

        decoys.forEach (function (decoy) { clmsModel.get("participants").delete (decoy.id); });

        assert.deepEqual(actual, expected, "Expected "+JSON.stringify(expected)+" decoy to real protein match, Passed!");
    });

    QUnit.test("Search to Protein Mapping", function (assert) {
        const peptides = [
            {id: "1", prt: ["A"]},
            {id: "2", prt: ["A"]},
            {id: "3", prt: ["A", "B"]},
            {id: "4", prt: ["C"]},
            {id: "5", prt: ["C", "D"]},
        ];
        const matches = [
            {pi: ["1", "2"], si: "S1"},
            {pi: ["1", "3"], si: "S1"},
            {pi: ["1", "4"], si: "S1"},
            {pi: ["4", "5"], si: "S2"},
        ];

        const actual = clmsModel.getProteinSearchMap(peptides, matches);
        const expected = {"S1": d3.set(["A", "B", "C"]), "S2": d3.set(["C", "D"])};

        assert.deepEqual(actual, expected);//, "Expected "+JSON.stringify(expected)+" search to protein map, Passed!");
    });

    QUnit.test ("Readable ID Generation", function (assert) {
        const decoys = [
            {id: "10001001", name: "REV", accession: "REV_P02768-A", is_decoy: true},
            {id: "10001002", name: "RAN", accession: "RAN_P02768-A", is_decoy: true},
        ];
        decoys.forEach (function (decoy) { clmsModel.get("participants").set (decoy.accession, decoy); });

        const fakeMatch = {matchedPeptides: [{prt: ["P02768-A", "REV_P02768-A"]}, {prt: ["P02768-A"]}]};
        const expected = mostReadableMultipleId(fakeMatch, 0, clmsModel);
        decoys.forEach (function (decoy) { clmsModel.get("participants").delete (decoy.accession); });

        const actual = "sp|P02768-A|ALBU;sp|REV_P02768-A|REV";

        assert.deepEqual(actual, expected, "Expected "+JSON.stringify(expected)+" decoy to real protein match, Passed!");
    });


    QUnit.module ("Filtering");
    QUnit.test("Filter testing", function (assert) {
        let expectedLinks = 5;
        model.get("filterModel").resetFilter().set ({AUTO: false});
        // changes to filtermodel changes getFilteredCrossLinks contents via backbone event
        assert.deepEqual(model.getFilteredCrossLinks().length, expectedLinks, "Expected "+JSON.stringify(expectedLinks)+" filtered crosslinks, Passed!");

        expectedLinks = 162;
        model.get("filterModel").set ({AUTO: true});
        assert.deepEqual(model.getFilteredCrossLinks().length, expectedLinks, "Expected "+JSON.stringify(expectedLinks)+" filtered crosslinks with adding auto=true, Passed!");

        expectedLinks = 156;
        model.get("filterModel").set ({pepLength: 6});
        assert.deepEqual(model.getFilteredCrossLinks().length, expectedLinks, "Expected "+JSON.stringify(expectedLinks)+" filtered crosslinks with adding peplength=6, Passed!");

        model.get("filterModel").resetFilter();
    });



    QUnit.module ("Selecting", {
        beforeEach : function () {
            model.get("filterModel").resetFilter().set ({AUTO: true}, {pepLength: 0});
            model.setMarkedCrossLinks ("selection", [], false, false, false);	// Tidy up. Clear selection.
        }
    });
    // 3 cross links
    // P02768-A_1-P02768-A_11 has 1 match
    // P02768-A_415-P02768-A_497 has 2 matches
    // P02768-A_190-P02768-A_425 has 17 matches (2 of which are marked rejected and don't pass filter)
    // 20 matches in total (18 will pass minimal filter state)

    QUnit.test("Empty selection testing", function (assert) {
        const expectedLinks = 0;
        const expectedMatches = 0;
        model.setMarkedCrossLinks ("selection", [], false, false, false);
        assert.deepEqual(model.getMarkedCrossLinks("selection").length, expectedLinks, "Expected "+JSON.stringify(expectedLinks)+" selected crosslinks on setting empty crosslink selection, Passed!");
        assert.deepEqual(model.getMarkedMatches("selection").size(), expectedMatches, "Expected "+JSON.stringify(expectedMatches)+" selected matches on setting empty crosslink selection, Passed!");

        model.setMarkedMatches ("selection", [], false, false, false);
        assert.deepEqual(model.getMarkedCrossLinks("selection").length, expectedLinks, "Expected "+JSON.stringify(expectedLinks)+" selected crosslinks on setting empty match selection, Passed!");
        assert.deepEqual(model.getMarkedMatches("selection").size(), expectedMatches, "Expected "+JSON.stringify(expectedMatches)+" selected matches on setting empty match selection, Passed!");
    });

    QUnit.test("Cross-link Selection testing", function (assert) {
        const expectedLinks = 3;
        const expectedMatches = 18;
        const crosslinks = clmsModel.get("crosslinks");
        const selectedLinks = [crosslinks.get("P02768-A_1-P02768-A_11"), crosslinks.get("P02768-A_415-P02768-A_497"), crosslinks.get("P02768-A_190-P02768-A_425")];
        model.setMarkedCrossLinks ("selection", selectedLinks, false, false, false);

        assert.deepEqual(model.getMarkedCrossLinks("selection").length, expectedLinks, "Expected "+JSON.stringify(expectedLinks)+" selected crosslinks on setting 3 crosslinks selection, Passed!");
        assert.deepEqual(model.getMarkedMatches("selection").size(), expectedMatches, "Expected "+JSON.stringify(expectedMatches)+" selected matches on setting 3 crosslinks selection, Passed!");
    });

    QUnit.test("Match Selection testing", function (assert) {
        const expectedLinks = 2;
        const expectedMatches = 3;
        const crosslinks = clmsModel.get("crosslinks");
        const selectedMatches = d3.merge([crosslinks.get("P02768-A_415-P02768-A_497").matches_pp.slice(0, 1), crosslinks.get("P02768-A_190-P02768-A_425").matches_pp.slice(0, 2)]);
        model.setMarkedMatches ("selection", selectedMatches, false, false, false);

        assert.deepEqual(model.getMarkedCrossLinks("selection").length, expectedLinks, "Expected "+JSON.stringify(expectedLinks)+" selected crosslinks on setting 3 matches selection, Passed!");
        assert.deepEqual(model.getMarkedMatches("selection").size(), expectedMatches, "Expected "+JSON.stringify(expectedMatches)+" selected matches on setting 3 matches selection, Passed!");
    });

    QUnit.test("Adding Cross-link selection to prior Cross-link Selection testing", function (assert) {
        const expectedLinkIDs = ["P02768-A_415-P02768-A_497", "P02768-A_190-P02768-A_425"].sort();
        const expectedMatches = 17;
        const crosslinks = clmsModel.get("crosslinks");

        let selectedLinks = [crosslinks.get("P02768-A_1-P02768-A_11"), crosslinks.get("P02768-A_415-P02768-A_497")];
        model.setMarkedCrossLinks ("selection", selectedLinks, false, false, false);

        selectedLinks = [crosslinks.get("P02768-A_1-P02768-A_11"), crosslinks.get("P02768-A_190-P02768-A_425")];
        model.setMarkedCrossLinks ("selection", selectedLinks, false, true, false);	// add to existing selection

        assert.deepEqual(_.pluck(model.getMarkedCrossLinks("selection"), "id").sort(), expectedLinkIDs, "Expected "+JSON.stringify(expectedLinkIDs)+" selected crosslinks, Passed!");
        assert.deepEqual(model.getMarkedMatches("selection").size(), expectedMatches, "Expected "+JSON.stringify(expectedMatches)+" selected matches, Passed!");
    });


    QUnit.test("Adding Match Selection to prior Match Selection testing", function (assert) {
        const expectedLinkIDs = ["P02768-A_415-P02768-A_497", "P02768-A_190-P02768-A_425"].sort();
        const expectedMatchIDs = [625825062, 625825067, 625825068, 625826126].sort();
        const crosslinks = clmsModel.get("crosslinks");

        let selectedMatches = d3.merge([crosslinks.get("P02768-A_1-P02768-A_11").matches_pp.slice(0, 1), crosslinks.get("P02768-A_415-P02768-A_497").matches_pp.slice(0, 2), crosslinks.get("P02768-A_190-P02768-A_425").matches_pp.slice(0, 2)]);
        model.setMarkedMatches ("selection", selectedMatches, false, false, false);

        selectedMatches = d3.merge ([
            crosslinks.get("P02768-A_1-P02768-A_11").matches_pp.slice(0,1),
            crosslinks.get("P02768-A_415-P02768-A_497").matches_pp.slice(0,1),
            crosslinks.get("P02768-A_190-P02768-A_425").matches_pp.slice(1,4)
        ]);
        model.setMarkedMatches ("selection", selectedMatches, false, true, false);	// add to existing selection

        assert.deepEqual(_.pluck(model.getMarkedCrossLinks("selection"), "id").sort(), expectedLinkIDs, "Expected "+JSON.stringify(expectedLinkIDs)+" selected crosslinks, Passed!");
        assert.deepEqual(_.pluck(model.getMarkedMatches("selection").values(), "id").sort(), expectedMatchIDs, "Expected "+JSON.stringify(expectedMatchIDs)+" selected matches, Passed!");
    });


    QUnit.test("Adding Match Selection to prior Cross-link Selection testing", function (assert) {
        const expectedLinkIDs = ["P02768-A_415-P02768-A_497", "P02768-A_190-P02768-A_425"].sort();
        const expectedMatches = 4;	// Two of P02768-A_190-P02768-A_425 matches are marked rejected and don't pass filter
        const crosslinks = clmsModel.get("crosslinks");

        const selectedLinks = [crosslinks.get("P02768-A_1-P02768-A_11"), crosslinks.get("P02768-A_415-P02768-A_497")];
        model.setMarkedCrossLinks ("selection", selectedLinks, false, false, false);

        const selectedMatches = d3.merge([
            crosslinks.get("P02768-A_1-P02768-A_11").matches_pp.slice(0, 1),
            crosslinks.get("P02768-A_415-P02768-A_497").matches_pp.slice(0, 1),
            crosslinks.get("P02768-A_190-P02768-A_425").matches_pp.slice(1, 4)
        ]);
        model.setMarkedMatches ("selection", selectedMatches, false, true, false);	// add to existing selection

        assert.deepEqual (_.pluck(model.getMarkedCrossLinks("selection"), "id").sort(), expectedLinkIDs, "Expected "+JSON.stringify(expectedLinkIDs)+" selected crosslinks, Passed!");
        assert.deepEqual (model.getMarkedMatches("selection").size(), expectedMatches, "Expected "+JSON.stringify(expectedMatches)+" selected matches, Passed!");
    });

    QUnit.test("Adding Cross-Link Selection to prior Match Selection testing", function (assert) {
        const expectedLinkIDs = ["P02768-A_415-P02768-A_497", "P02768-A_190-P02768-A_425"].sort();
        const expectedMatches = 17;
        const crosslinks = clmsModel.get("crosslinks");

        const selectedMatches = d3.merge([crosslinks.get("P02768-A_1-P02768-A_11").matches_pp.slice(0, 1), crosslinks.get("P02768-A_415-P02768-A_497").matches_pp.slice(0, 2)]);
        model.setMarkedMatches ("selection", selectedMatches, false, false, false);

        const selectedLinks = [crosslinks.get("P02768-A_1-P02768-A_11"), crosslinks.get("P02768-A_190-P02768-A_425")];
        model.setMarkedCrossLinks ("selection", selectedLinks, false, true, false);	// add to existing selection

        assert.deepEqual (_.pluck(model.getMarkedCrossLinks("selection"), "id").sort(), expectedLinkIDs, "Expected "+JSON.stringify(expectedLinkIDs)+" selected crosslinks, Passed!");
        assert.deepEqual (model.getMarkedMatches("selection").size(), expectedMatches, "Expected "+JSON.stringify(expectedMatches)+" selected matches, Passed!");
    });

    QUnit.test("Adding no Cross-Links to prior Cross-link Selection testing", function (assert) {
        const crosslinks = clmsModel.get("crosslinks");
        const selectedLinks = [crosslinks.get("P02768-A_1-P02768-A_11"), crosslinks.get("P02768-A_415-P02768-A_497")];
        model.setMarkedCrossLinks ("selection", selectedLinks, false, false, false);
        const expectedLinkIDs = _.pluck(model.getMarkedCrossLinks("selection"), "id").sort();
        const expectedMatchIDs = _.pluck(model.getMarkedMatches("selection").values(), "id").sort();

        model.setMarkedCrossLinks ("selection", [], false, true, false);	// add to existing selection

        assert.deepEqual (_.pluck(model.getMarkedCrossLinks("selection"), "id").sort(), expectedLinkIDs, "Expected "+JSON.stringify(expectedLinkIDs)+" selected crosslinks, Passed!");
        assert.deepEqual (_.pluck(model.getMarkedMatches("selection").values(), "id").sort(), expectedMatchIDs, "Expected "+JSON.stringify(expectedMatchIDs)+" selected matches, Passed!");
    });

    QUnit.test("Adding no Matches to prior Match Selection testing", function (assert) {
        const crosslinks = clmsModel.get("crosslinks");
        const selectedMatches = d3.merge([crosslinks.get("P02768-A_1-P02768-A_11").matches_pp.slice(0, 1), crosslinks.get("P02768-A_415-P02768-A_497").matches_pp.slice(0, 1)]);
        model.setMarkedMatches ("selection", selectedMatches, false, false, false);
        const expectedLinkIDs = _.pluck(model.getMarkedCrossLinks("selection"), "id").sort();
        const expectedMatchIDs = _.pluck(model.getMarkedMatches("selection").values(), "id").sort();

        model.setMarkedMatches ("selection", [], false, true, false);	// add to existing selection

        assert.deepEqual (_.pluck(model.getMarkedCrossLinks("selection"), "id").sort(), expectedLinkIDs, "Expected "+JSON.stringify(expectedLinkIDs)+" selected crosslinks, Passed!");
        assert.deepEqual (_.pluck(model.getMarkedMatches("selection").values(), "id").sort(), expectedMatchIDs, "Expected "+JSON.stringify(expectedMatchIDs)+" selected matches, Passed!");
    });


    QUnit.module ("Alignment Tests");


    QUnit.test ("Scoring", function (assert) {
        const scoringSystem = {
            matrix: window.blosumCollInst.get("Blosum100").attributes,
            match: 10,
            mis: -6,
            gapOpen: 10,
            gapExt: 1,
            gapAtStart: 0
        };
        const refSeq = "ABCDEFGHIIKLMNNPQRSTTVWXYZ";

        const tests = [
            // * means any, X means missing
            {seq: "ABCDEFGHIIKLMNNPQRSTTVWXYZ", expScore: 251},
            {seq: "BCDEFGHIIKLMNNPQRSTTVWXYZ", expScore: 241},
            {seq: "BCDEFGHIIKLMNNPQRSTTVWXY", expScore: 235},
            {seq: "BCDETVWXY", expScore: 6 + 14 + 10 + 10 + -25 + 9 + 8 + 17 + -3 + 12},
            {seq: "ABCD", expScore: 38},
            {seq: "XYZ", expScore: 18},
            {seq: "Z", expScore: 7},   // in the blosum100 matrix Z matches to E (score:7) better than it matches to itself (6). Weird.
            {seq: "BCDH", expScore: 30 + 13 - 13},   // aligner puts in gap and matches H-H as H-H score (13) plus gap penalty (-13 = 0) exceeds E-H score (-2)
            {seq: "BCDY", expScore: 30 - 7},   // aligner goes for matching E-Y (-7) as gap penalty too long (30+) for Y-Y score (12) to recover from
            {seq: "BCDDEF", expScore: 6 + 14 + 10 + 10 + 11 - 11},   // aligner inserts gap (-11) in target to accommodate extra D
            {seq: "BCDDDDDDDDEF", expScore: 6 + 14 + 10 + 10 + 11 - 17},   // aligner inserts gap (-17) in target to accommodate lots of D's
            {seq: "BY", expScore: 12},   // aligner inserts B (no penalty as at start) and matches Y-Y
        ];

        const stageModel = window.compositeModelInst.get("stageModel");
        const actual = tests.map(function (test) {
            return GotohAligner.align(test.seq, refSeq, scoringSystem, false, true, 1000);
        });
        const actualScores = actual.map(function (v) {
            return v.res[0];
        });
        const expectedScores = _.pluck(tests, "expScore");
        const fmts = actual.map(function (v) {
            return v.fmt[0];
        });
        const cigars = _.pluck(actual, "cigar");
        assert.deepEqual (actualScores, expectedScores, "Expected "+JSON.stringify(expectedScores)+JSON.stringify(cigars)+JSON.stringify(fmts)+" when generating scores from bioseq32.js");
    });

    QUnit.test ("Sequence generation from PDB chains", function (assert) {
        const expected = [
            {chainName: "A", chainIndex: 0, modelIndex: 0, residueOffset: 0, data: dseq1AO6, structureID: "1ao6"},
            {chainName: "B", chainIndex: 1, modelIndex: 0, residueOffset: 578, data: dseq1AO6, structureID: "1ao6"},
        ];

        const stageModel = window.compositeModelInst.get("stageModel");
        const actual = getChainSequencesFromNGLStage(stageModel.get("structureComp").stage);
        assert.deepEqual (actual, expected, "Expected "+JSON.stringify(expected)+" when generating sequences from `1AO6`");
    });


    QUnit.test ("Matrix pairings", function (assert) {
        const testMatrix = {    // E-values per search sequence per pdb id
            //"1AO6": [0.01, 0.001, 1e-35],
            //"1AO7": [1e-30, 1e-15, 1e-30],
            //"1AO8": [1e-40, 1e-50, 1e-10],
            "1AO6": [0.1, 0.1, 8],
            "1AO7": [0.001, 5, 0.001],
            "1AO8": [5, 6, 0.1],
        };
        const testSeqs = [{data: "ABCD"}, {data: "EFGH"}, {data: "IJKL"}];
        const expectedValue = [
            {id: "1AO8", seqObj: {data: "ABCD"}},
            {id: "1AO8", seqObj: {data: "EFGH"}},
            {id: "1AO6", seqObj: {data: "IJKL"}},
        ];
        const actualValue = matrixPairings(testMatrix, testSeqs);

        // stringify turns undefined to null for printout, but it's a match
        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as matrix pairing, Passed!");
    });


    QUnit.test ("Align test", function (assert) {
        const stageModel = window.compositeModelInst.get("stageModel");
        const chainSequences = getChainSequencesFromNGLStage(stageModel.get("structureComp").stage);
        const alignCollection = window.compositeModelInst.get("alignColl");
        const protAlignModel = alignCollection.get("P02768-A");
        const actualValue = protAlignModel.alignWithoutStoring(
            _.pluck(chainSequences, "data"),
            {semiLocal: true}
        ).map(function (res) {
            return res.str;
        });
        const expectedValue = ["score=5735; pos=0; cigar=4D578M3D\n", "score=5735; pos=0; cigar=4D578M3D\n"];

        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as alignment result, Passed!");
    });


    QUnit.module ("NGL Model Wrapper");

    QUnit.test ("Divide protein to ngl chain mapping by intermediate model step", function (assert) {
        const data = {
            10001: [{modelIndex: 1, chain: "A"}, {modelIndex: 1, chain: "B"}, {modelIndex: 2, chain: "C"}],
            10002: [{modelIndex: 1, chain: "4"}]
        };
        const expectedValue = {
            10001: [{key: "1", values: [{modelIndex: 1, chain: "A"}, {modelIndex: 1, chain: "B"}]}, {
                key: "2",
                values: [{modelIndex: 2, chain: "C"}]
            }],
            10002: [{key: "1", values: [{modelIndex: 1, chain: "4"}]}]
        };

        const stageModel = window.compositeModelInst.get("stageModel");
        const actualValue = makeSubIndexedMap(data, "modelIndex");
        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" when mapping from "+JSON.stringify(data));
    });


    QUnit.module ("NGL Selection Language");

    QUnit.test ("Range Concatenation", function (assert) {
        const examples = [
            {data: undefined, expected: undefined},
            {data: [], expected: []},
            {data: ["7"], expected: ["7"]},
            {data: ["7", "9"], expected: ["7", "9"]},
            {data: ["10", "11", "12", "13", "14", "15"], expected: ["10-15"]},
            {data: ["97", "98", "99", "100", "101"], expected: ["97-101"]},
            {data: ["12", "13", "14", "19", "20", "21", "234", "235", "236"], expected: ["12-14", "19-21", "234-236"]},
            {data: ["6", "22", "23", "24"], expected: ["6", "22-24"]},
            {data: ["6", "7", "8", "22"], expected: ["6-8", "22"]},
        ];

        examples.forEach (function (example) {
            const actualValue = joinConsecutiveNumbersIntoRanges(example.data);
            assert.deepEqual (actualValue, example.expected, "Expected "+example.expected+" when concatenating "+example.data);
        })
    });

    QUnit.test ("Generate Nested Selection", function (assert) {

        const expectedValue = "(( /0 AND (( :A AND (107 OR 125 OR 131 OR 161-162 OR 190 OR 415 OR 425 OR 466 OR 497) ) OR ( :B AND (107 OR 125 OR 131 OR 161-162 OR 190 OR 415 OR 425 OR 466 OR 497) )) ) ) AND .CA";
        const data = [
            {seqIndex: 410, residueId: 0, resno: 415, chainIndex: 0, structureId: null}, {
                seqIndex: 492,
                residueId: 1,
                resno: 497,
                chainIndex: 0,
                structureId: null
            }, {seqIndex: 492, residueId: 2, resno: 497, chainIndex: 1, structureId: null}, {
                seqIndex: 410,
                residueId: 3,
                resno: 415,
                chainIndex: 1,
                structureId: null
            }, {seqIndex: 185, residueId: 4, resno: 190, chainIndex: 0, structureId: null}, {
                seqIndex: 420,
                residueId: 5,
                resno: 425,
                chainIndex: 0,
                structureId: null
            }, {seqIndex: 420, residueId: 6, resno: 425, chainIndex: 1, structureId: null}, {
                seqIndex: 185,
                residueId: 7,
                resno: 190,
                chainIndex: 1,
                structureId: null
            }, {seqIndex: 120, residueId: 8, resno: 125, chainIndex: 0, structureId: null}, {
                seqIndex: 156,
                residueId: 9,
                resno: 161,
                chainIndex: 0,
                structureId: null
            }, {seqIndex: 156, residueId: 10, resno: 161, chainIndex: 1, structureId: null}, {
                seqIndex: 120,
                residueId: 11,
                resno: 125,
                chainIndex: 1,
                structureId: null
            }, {seqIndex: 126, residueId: 12, resno: 131, chainIndex: 0, structureId: null}, {
                seqIndex: 157,
                residueId: 13,
                resno: 162,
                chainIndex: 0,
                structureId: null
            }, {seqIndex: 157, residueId: 14, resno: 162, chainIndex: 1, structureId: null}, {
                seqIndex: 126,
                residueId: 15,
                resno: 131,
                chainIndex: 1,
                structureId: null
            }, {seqIndex: 102, residueId: 16, resno: 107, chainIndex: 0, structureId: null}, {
                seqIndex: 461,
                residueId: 17,
                resno: 466,
                chainIndex: 0,
                structureId: null
            }, {seqIndex: 461, residueId: 18, resno: 466, chainIndex: 1, structureId: null}, {
                seqIndex: 102,
                residueId: 19,
                resno: 107,
                chainIndex: 1,
                structureId: null
            }
        ];

        const expectedValue2 = "(( /0 AND (( 415:A ) OR ( 497:B )) ) ) AND .CA";
        const expectedValue3 = "(( /0 AND (( 415:A ) OR ( 497:B )) ) )";
        const expectedValue4 = "(( /0 AND (:A OR :B) ) )";
        const data2 = [data[0], data[2]];

        const stageModel = window.compositeModelInst.get("stageModel");

        let actualValue = stageModel.getSelectionFromResidueList(data);
        assert.deepEqual (actualValue, expectedValue, "Expected "+expectedValue+" when mapping from "+JSON.stringify(data));

        actualValue = stageModel.getSelectionFromResidueList (data2);
        assert.deepEqual (actualValue, expectedValue2, "Expected "+expectedValue2+" when mapping from "+JSON.stringify(data2));

        actualValue = stageModel.getSelectionFromResidueList (data2, {allAtoms: true});
        assert.deepEqual (actualValue, expectedValue3, "Expected "+expectedValue3+" when mapping from "+JSON.stringify(data2)+" with option allAtoms");

        actualValue = stageModel.getSelectionFromResidueList (data2, {chainsOnly: true});
        assert.deepEqual (actualValue, expectedValue4, "Expected "+expectedValue4+" when mapping from "+JSON.stringify(data2)+" with option chainsOnly");
    });

    QUnit.test ("Get Chain Start Positions as Atom Indices (for label representation)", function (assert) {
        const stageModel = window.compositeModelInst.get("stageModel");
        const chainStartSele = stageModel.makeFirstAtomPerChainSelectionString(d3.set([0, 1]));
        const expectedValue = "@0,4599";
        assert.deepEqual (chainStartSele, expectedValue, "Expected "+expectedValue+" for chain start atom NGL selection, Passed!");
    });


    QUnit.test ("Get Just Chain Selection", function (assert) {
        const stageModel = window.compositeModelInst.get("stageModel");
        const chainSele = stageModel.makeChainSelectionString({showAll: false, chainIndices: [0, 1]});
        const expectedValue = "(( /0 AND (:A OR :B) ) )";
        assert.deepEqual (chainSele, expectedValue, "Expected "+expectedValue+" for just chain selection, Passed!");
    });


    QUnit.module ("3D Distances");

    QUnit.test ("Mapping to PDB", function (assert) {
        const expectedMapping = [411, 493];

        const alignCollection = window.compositeModelInst.get("alignColl");
        const alignModel = alignCollection.get("P02768-A");
        const actualMapping = alignModel.bulkMapFromSearch("1AO6:A:0", [415, 497]);

        assert.deepEqual (actualMapping, expectedMapping, "Expected "+expectedMapping+" when mapping from [415,497] to 1ao6 pdb indices, Passed!");
    });

    QUnit.test ("Mapping from PDB", function (assert) {
        const expectedMapping = [415, 497];

        const alignCollection = window.compositeModelInst.get("alignColl");
        const alignModel = alignCollection.get("P02768-A");
        const actualMapping = alignModel.bulkMapToSearch("1AO6:A:0", [411, 493]);

        assert.deepEqual (actualMapping, expectedMapping, "Expected "+expectedMapping+" when mapping from pdb [411, 493] back to search indices, Passed!");
    });

    QUnit.test ("Chain Info", function (assert) {
        const expectedMapping = {viableChainIndices: [0, 1], resCount: 1156};

        const stageModel = window.compositeModelInst.get("stageModel");
        const actualMapping = stageModel.getChainInfo();

        assert.deepEqual (actualMapping, expectedMapping, "Expected "+JSON.stringify(expectedMapping)+" chain info, Passed!");
    });

    QUnit.test ("C-Alpha Atom Selection String", function (assert) {
        const expectedMapping = ":A/0 AND 5-582.CA";

        const stageModel = window.compositeModelInst.get("stageModel");
        const chainProxy = stageModel.get("structureComp").structure.getChainProxy();
        chainProxy.index = 0;
        const actualMapping = getRangedCAlphaResidueSelectionForChain(chainProxy);

        assert.deepEqual (actualMapping, expectedMapping, "Expected "+expectedMapping+" NGL Selection String generated, Passed!");
    });

    QUnit.test ("C-Alpha Atom Indices [last 20]", function (assert) {
        const expectedMapping = {
            0: [4455, 4463, 4472, 4481, 4488, 4494, 4505, 4510, 4519, 4528, 4532, 4541, 4550, 4558, 4565, 4570, 4575, 4581, 4590, 4595],
            1: [9054, 9062, 9071, 9080, 9087, 9093, 9104, 9109, 9118, 9127, 9131, 9140, 9149, 9157, 9164, 9169, 9174, 9180, 9189, 9194]
        };	// last 20 in each

        const stageModel = window.compositeModelInst.get("stageModel");
        const shortenThese = [0, 1];
        const actualMapping = $.extend({}, stageModel.calculateAllCaAtomIndices(shortenThese));	// copy object so as not to affect original (causes error)
        shortenThese.forEach (function (index) {
            actualMapping[index] = actualMapping[index].slice(-20);
        });

        assert.deepEqual (actualMapping, expectedMapping, "Expected "+JSON.stringify(expectedMapping)+" NGL C-Alpha atom indices, Passed!");
    });

    QUnit.test ("Single Cross-Link Distance validated on NGLViewer", function (assert) {
        const crosslinks = clmsModel.get("crosslinks");
        const singleCrossLink = crosslinks.get("P02768-A_415-P02768-A_497");
        const expectedDistance = 9.13;	// as measured on nglviewer (2 decimal places)

        const stageModel = window.compositeModelInst.get("stageModel");
        // -5 cos 4 difference in pdb / search alignments, and another 1 because this function is 0-indexed.
        let actualDistance = stageModel.getSingleDistanceBetween2Residues(415 - 5, 497 - 5, 0, 0);	// 0 chain has slightly longer distance
        actualDistance = +(actualDistance.toFixed(2));

        assert.deepEqual (actualDistance, expectedDistance, "Expected "+expectedDistance+" distance (2 d.p.) for A chain 415-497 crosslink, Passed!");
    });

    QUnit.test ("Same Cross-Link Distance, different indexing methods 1", function (assert) {
        const crosslinks = clmsModel.get("crosslinks");
        const singleCrossLink = crosslinks.get("P02768-A_415-P02768-A_497");
        const alignCollection = window.compositeModelInst.get("alignColl");

        // this will be shortest distance of chain possibilities - 0-0, 0-1, 1-0, 1-1
        const actualDistance = clmsModel.get("distancesObj").getXLinkDistance(singleCrossLink, alignCollection);

        const stageModel = window.compositeModelInst.get("stageModel");
        // -5 cos 4 difference in pdb / search alignments, and another 1 because this function is 0-indexed.
        const actualDistance2 = stageModel.getSingleDistanceBetween2Residues(415 - 5, 497 - 5, 1, 1);	// 1 appears to be shortest distance

        assert.deepEqual (actualDistance, actualDistance2, "Expected "+actualDistance2+" distance in both methods (B chain 415-497 crosslink), Passed!");
    });


    QUnit.test ("2 different functions for returning atom indices", function (assert) {
        const crosslinks = clmsModel.get("crosslinks");
        const singleCrossLink = crosslinks.get("P02768-A_415-P02768-A_497");
        const alignCollection = window.compositeModelInst.get("alignColl");

        // this will be shortest distance of chain possibilities - 0-0, 0-1, 1-0, 1-1
        const stageModel = window.compositeModelInst.get("stageModel");
        const cproxy = stageModel.get("structureComp").structure.getChainProxy();
        const atomIndexA = stageModel.getAtomIndex(0, 0); // residue 0-indexed here
        const resObj = {resno: 5, seqIndex: 0, chainIndex: 0};
        const atomIndexB = stageModel.getAtomIndexFromResidueObj(resObj, cproxy, new NGL.Selection()); // residue is NGL resno (5 resno = 0 seqIndex)

        assert.deepEqual (atomIndexA, atomIndexB, "Expected "+atomIndexA+" index in both methods (A chain 415 residue), Passed!");
    });


    QUnit.test ("Compare Link-Only Distance Generation with All Distance Generation", function (assert) {
        const stageModel = window.compositeModelInst.get("stageModel");
        const crosslinks = stageModel.get("linkList");

        const matrices1 = stageModel.getChainDistances(true);
        const matrices2 = stageModel.getChainDistances(false);

        let list1 = [];
        let list2 = [];

        crosslinks.forEach (function (crosslink) {
            const chainIndex = crosslink.residueA.chainIndex + "-" + crosslink.residueB.chainIndex;
            list1.push (matrices1[chainIndex].distanceMatrix[crosslink.residueA.seqIndex][crosslink.residueB.seqIndex]);
            list2.push (matrices2[chainIndex].distanceMatrix[crosslink.residueA.seqIndex][crosslink.residueB.seqIndex]);
        });

        list1 = list1.map (function (v) { return v.toFixed (2); });
        list2 = list2.map (function (v) { return v.toFixed (2); });

        assert.deepEqual (list1, list2, "Expected "+list1.join(", ")+" distance (2 d.p.) for both link-only and all distance matrix link distances, Passed!");
    });


    QUnit.test ("Compare Distances from Atom Coords with All Distance Generation", function (assert) {
        const stageModel = window.compositeModelInst.get("stageModel");
        const crosslinks = stageModel.get("linkList");

        const matrices1 = stageModel.getChainDistances(true); //this test will fail if the defualt value for AUTO in filtermodel is true, to make it pass you need to change this call's param to true
        let list1 = [];
        let list2 = [];

        const atoms = stageModel.getAllResidueCoordsForChain(0);

        crosslinks.forEach (function (crosslink) {
            const seqIndexA = crosslink.residueA.seqIndex;
            const seqIndexB = crosslink.residueB.seqIndex;
            list1.push (matrices1["0-0"].distanceMatrix[seqIndexA][seqIndexB]);
            const distanceSquared = getDistanceSquared(atoms[seqIndexA], atoms[seqIndexB]);
            list2.push (Math.sqrt (distanceSquared));
        });

        list1 = list1.map (function (v) { return v.toFixed (2); });
        list2 = list2.map (function (v) { return v.toFixed (2); });

        assert.deepEqual (list1, list2, "Expected "+list1.join(", ")+" distance (2 d.p.) for both link-only and all distance matrix link distances, Passed!");
    });


    QUnit.test ("Octree test with negative match function", function (assert) {
        const octAccessorObj = {
            id: function (d) {
                return d;
            },
            x: function (d) {
                return d.coords[0];
            },
            y: function (d) {
                return d.coords[1];
            },
            z: function (d) {
                return d.coords[2];
            },
        };

        const pointsA = [];
        for (var n = 0; n < 64; n++) {
            var newPoint = {coords: [(n >> 4) & 3, (n >> 2) & 3, n & 3]};
            newPoint.chainIndex = (n === 4 ? 13 : 12);
            pointsA.push (newPoint);
        }

        const pointsB = [];
        for (var n = 0; n < 8; n++) {
            var newPoint = {coords: [((n >> 2) & 1) + 1.25, ((n >> 1) & 1) + 1.4, (n & 1) + 1.6]};
            newPoint.chainIndex = (n === 4 ? 12 : 13);
            pointsB.push (newPoint);
        }

        const octreeIgnoreFunc = function (point1, point2) {
            return not3DHomomultimeric({confirmedHomomultimer: true}, point1.chainIndex, point2.chainIndex);
        };

        const cdist = toNearest((0.25 * 0.25) + (0.4 * 0.4) + (0.4 * 0.4), 0.25);
        const odddist = toNearest((2.25 * 2.25) + (0.4 * 0.4) + (1.6 * 1.6), 0.25);
        const expected = [
            [pointsA[parseInt(112, 4)], pointsB[0], cdist],
            [pointsA[parseInt(113, 4)], pointsB[1], cdist],
            [pointsA[parseInt(122, 4)], pointsB[2], cdist],
            [pointsA[parseInt(123, 4)], pointsB[3], cdist],
            [pointsA[parseInt('010', 4)], pointsB[4], odddist],
            [pointsA[parseInt(213, 4)], pointsB[5], cdist],
            [pointsA[parseInt(222, 4)], pointsB[6], cdist],
            [pointsA[parseInt(223, 4)], pointsB[7], cdist],
        ];

        const actual = getMinimumDistance(pointsA, pointsB, octAccessorObj, 200, octreeIgnoreFunc);
        actual.forEach (function (indRes) { indRes[2] = toNearest (indRes[2], 0.25); });

        assert.deepEqual (actual, expected, "Expected "+expected.join(", ")+" distance (2 d.p.) for both link-only and all distance matrix link distances, Passed!");
    });


    QUnit.test ("Octree test with negative match function 2", function (assert) {
        const octAccessorObj = {
            id: function (d) {
                return d;
            },
            x: function (d) {
                return d.coords[0];
            },
            y: function (d) {
                return d.coords[1];
            },
            z: function (d) {
                return d.coords[2];
            },
        };

        const pointsA = [
            {
                atomIndex: 11889,
                chainIndex: 10,
                coords: [-145.10899353027344, 78.43499755859375, 10.786999702453613],
                modelIndex: 0,
                seqIndex: 208
            },
            {
                atomIndex: 88267,
                chainIndex: 45,
                coords: [-54.07099914550781, 253.4219970703125, -149.92100524902344],
                modelIndex: 0,
                seqIndex: 208
            },
            {
                atomIndex: 164645,
                chainIndex: 80,
                coords: [65.1240005493164, 100.05500030517578, -38.1879997253418],
                modelIndex: 0,
                seqIndex: 208
            },
            {
                atomIndex: 241023,
                chainIndex: 115,
                coords: [8.039999961853027, 239.88600158691406, 57.78200149536133],
                modelIndex: 0,
                seqIndex: 208
            },
            {
                atomIndex: 317401,
                chainIndex: 150,
                coords: [157.01600646972656, 229.23500061035156, -101.27899932861328],
                modelIndex: 0,
                seqIndex: 208
            },
            {
                atomIndex: 393779,
                chainIndex: 185,
                coords: [-1.2970000505447388, 98.26599884033203, 171.0780029296875],
                modelIndex: 0,
                seqIndex: 208
            }
        ];

        const pointsB = pointsA.slice();

        const octreeIgnoreFunc = function (point1, point2) {
            return not3DHomomultimeric({confirmedHomomultimer: true}, point1.chainIndex, point2.chainIndex);
        };

        const cdist = toNearest((0.25 * 0.25) + (0.4 * 0.4) + (0.4 * 0.4), 0.25);
        const odddist = toNearest((2.25 * 2.25) + (0.4 * 0.4) + (1.6 * 1.6), 0.25);
        const expected = [
            [pointsB[0], undefined, NaN],
            [pointsB[1], undefined, NaN],
            [pointsB[2], pointsA[4], 29112],
            [pointsB[3], pointsA[2], 32021.5],
            [pointsB[4], pointsA[2], 29112],
            [pointsB[5], pointsA[3], 32979.5],
        ];

        const actual = getMinimumDistance(pointsA, pointsB, octAccessorObj, 200, octreeIgnoreFunc);
        actual.forEach (function (indRes) { indRes[2] = toNearest (indRes[2], 0.25); });

        assert.deepEqual (actual, expected, "Expected "+expected.join(", ")+" distance (2 d.p.) for both link-only and all distance matrix link distances, Passed!");
    });


    QUnit.module ("Random Distance Generation");

    QUnit.test ("Calc Distanceable Sequence MetaData", function (assert) {
        const expectedValue = [
            {
                first: 5,
                last: 582,
                subSeq: dseq1AO6,
                chainIndex: 0,
                modelIndex: 0,
                protID: "P02768-A",
                alignID: "1AO6:A:0"
            },
            {
                first: 5,
                last: 582,
                subSeq: dseq1AO6,
                chainIndex: 1,
                modelIndex: 0,
                protID: "P02768-A",
                alignID: "1AO6:B:1"
            }
        ];

        const distObj = clmsModel.get("distancesObj");
        const actualValue = distObj.calcDistanceableSequenceData();

        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as distanceable sequence metadata, Passed!");
    });


    QUnit.test ("Include Terminal Indices", function (assert) {
        const expected = {ntermList: [], ctermList: []};	// because pdb for 1ao6 is within the larger sequence so neither cterm nor nterm match

        const alignCollBB = window.compositeModelInst.get("alignColl");
        const alignID = make3DAlignID("1AO6", "A", 0);
        const seqRange = alignCollBB.getRangeAsSearchSeq("P02768-A", alignID);
        $.extend (seqRange, {alignID: alignID, chainIndex: 0, protID: "P02768-A"});
        const seqMap = d3.map();
        seqMap.set ("P02768-A", {key: "P02768-A", values: [seqRange]});
        const alignedTerminalIndices = clmsModel.get("distancesObj").calcAlignedTerminalIndices(seqMap, clmsModel, alignCollBB);
        assert.deepEqual (alignedTerminalIndices, expected, "Expected "+JSON.stringify(expected)+" as end terminals out of PDB range, Passed!");
    });

    QUnit.test ("Filter Sequence By Residue Set = I and W", function (assert) {
        const expectedValue = [20, 137, 209, 259, 266, 285, 383, 508, 518];
        const actualValue = filterSequenceByResidueSet(dseq1AO6, new d3.set(["I", "W"]));

        // stringify turns undefined to null for printout, but it's a match
        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as filtered residue indices, Passed!");
    });

    QUnit.test ("Filter Sequence By Residue Set = All", function (assert) {
        const expectedValue = d3.range(0, dseq1AO6.length);
        const actualValue = filterSequenceByResidueSet(dseq1AO6, null, true);

        // stringify turns undefined to null for printout, but it's a match
        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as filtered residue indices, Passed!");
    });


    QUnit.test ("Filter Multiple Sequences by Cross-Linkable Specificity Setting", function (assert) {
        const expected = [535, 536, 540, 552, 555, 559, 561, 568, 569, 574];	// last 10 KSTY
        const expected2 = d3.range(0, dseq1AO6.length);	// everything

        const searchArray = Array.from(clmsModel.get("searches").values());
        const residueSets = crosslinkerSpecificityPerLinker(searchArray);
        const linkableResidues = residueSets["wrong mass SDA "].linkables;

        const alignCollBB = window.compositeModelInst.get("alignColl");
        const alignID = make3DAlignID("1AO6", "A", 0);
        const seqRange = alignCollBB.getRangeAsSearchSeq("P02768-A", alignID);
        let actualFilteredSubSeqIndices = filterSequenceByResidueSet(seqRange.subSeq, linkableResidues[1], false);	// 1 is KSTY
        actualFilteredSubSeqIndices = actualFilteredSubSeqIndices.slice(-10);	// last 10

        assert.deepEqual (actualFilteredSubSeqIndices, expected, "Expected "+expected.join(", ")+" as last 10 KSTY cross-linkable filtered sequence indices, Passed!");


        actualFilteredSubSeqIndices = filterSequenceByResidueSet (seqRange.subSeq, linkableResidues[0], false);	// 0 is everything

        assert.deepEqual (actualFilteredSubSeqIndices, expected2, "Expected "+expected2.join(", ")+" as everything cross-linkable filtered sequence indices, Passed!");
    });


    QUnit.test ("Calc Filtered Residue Points from Cross-linker Specificity", function (assert) {
        let expectedValue = [535, 536, 540, 552, 555, 559, 561, 568, 569, 574];	// last 10 KSTY
        expectedValue = expectedValue.map (function (v) {
            return {chainIndex: 1, protID: "P02768-A", seqIndex: v+1, searchIndex: v+5}	// seqIndex 1-indexed, sdearchIndex 4 on from that, last 10 residues will be chain 1
        });

        const searchArray = Array.from(clmsModel.get("searches").values());
        const crosslinkerSpecificityList = d3.values(crosslinkerSpecificityPerLinker(searchArray));
        const distanceableSequences = [
            {
                first: 5,
                last: 582,
                subSeq: dseq1AO6,
                chainIndex: 0,
                modelIndex: 0,
                protID: "P02768-A",
                alignID: "1AO6:A:0"
            },
            {
                first: 5,
                last: 582,
                subSeq: dseq1AO6,
                chainIndex: 1,
                modelIndex: 0,
                protID: "P02768-A",
                alignID: "1AO6:B:1"
            }
        ];
        const alignedTerminalIndices = {ntermList: [], ctermList: []};

        const distObj = clmsModel.get("distancesObj");
        let actualValue = distObj.calcFilteredSequenceResidues(crosslinkerSpecificityList[0], distanceableSequences, alignedTerminalIndices);
        actualValue = actualValue[1]; // the KSTY & NTERM residues
        actualValue = actualValue.slice(-10);	// The last 10 values

        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as last 10 KSTY cross-linkable filtered residue points, Passed!");
    });



    QUnit.test ("Sample Distance Generation, 1 Search, rounded to nearest integer", function (assert) {
        const expectedValue = [27, 36, 58, 41, 99, 77, 88, 93, 84, 44, 29, 48, 64, 47, 55, 38, 55, 69, 53, 26, 21, 17, 33, 23, 91, 68, 72, 73, 70, 44, 28, 29, 15, 11, 89, 69, 63, 66, 69, 41, 19, 47, 44, 20, 78, 64, 61, 78, 74, 99, 78, 88, 93, 84, 27, 36, 58, 41, 55, 38, 55, 69, 53, 45, 29, 48, 64, 47, 90, 68, 72, 73, 70, 26, 21, 17, 33, 23, 89, 69, 64, 66, 69, 44, 28, 29, 15, 11, 78, 64, 61, 78, 74, 42, 19, 48, 44, 20];

        const searchArray = Array.from(clmsModel.get("searches").values());
        const crosslinkerSpecificityList = d3.values(crosslinkerSpecificityPerLinker(searchArray));
        const distanceableSequences = [
            {
                first: 5,
                last: 582,
                subSeq: dseq1AO6,
                chainIndex: 0,
                modelIndex: 0,
                protID: "P02768-A",
                alignID: "1AO6:A:0"
            },
            {
                first: 5,
                last: 582,
                subSeq: dseq1AO6,
                chainIndex: 1,
                modelIndex: 0,
                protID: "P02768-A",
                alignID: "1AO6:B:1"
            }
        ];
        const alignedTerminalIndices = {ntermList: [], ctermList: []};

        const distObj = clmsModel.get("distancesObj");
        const filteredResidueMap = distObj.calcFilteredSequenceResidues(crosslinkerSpecificityList[0], distanceableSequences, alignedTerminalIndices);
        const sampleDists = [];
        distObj.generateSampleDistancesBySearch (filteredResidueMap[0], filteredResidueMap[1], sampleDists, {linksPerSearch: 100});
        const actualValue = sampleDists.map(Math.round);

        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as sampled distances, Passed!");
    });


    QUnit.test ("Sample Distance Generation, 1 Search, restricted to same protein id (dimer / full search equivalent), rounded to nearest integer", function (assert) {
        const expectedValue = [27, 36, 58, 41, 99, 77, 88, 93, 84, 44, 29, 48, 64, 47, 55, 38, 55, 69, 53, 26, 21, 17, 33, 23, 91, 68, 72, 73, 70, 44, 28, 29, 15, 11, 89, 69, 63, 66, 69, 41, 19, 47, 44, 20, 78, 64, 61, 78, 74, 99, 78, 88, 93, 84, 27, 36, 58, 41, 55, 38, 55, 69, 53, 45, 29, 48, 64, 47, 90, 68, 72, 73, 70, 26, 21, 17, 33, 23, 89, 69, 64, 66, 69, 44, 28, 29, 15, 11, 78, 64, 61, 78, 74, 42, 19, 48, 44, 20];

        const searchArray = Array.from(clmsModel.get("searches").values());
        const crosslinkerSpecificityList = d3.values(crosslinkerSpecificityPerLinker(searchArray));
        const distanceableSequences = [
            {
                first: 5,
                last: 582,
                subSeq: dseq1AO6,
                chainIndex: 0,
                modelIndex: 0,
                protID: "P02768-A",
                alignID: "1AO6:A:0"
            },
            {
                first: 5,
                last: 582,
                subSeq: dseq1AO6,
                chainIndex: 1,
                modelIndex: 0,
                protID: "P02768-A",
                alignID: "1AO6:B:1"
            }
        ];
        const alignedTerminalIndices = {ntermList: [], ctermList: []};

        const distObj = clmsModel.get("distancesObj");
        const filteredResidueMap = distObj.calcFilteredSequenceResidues(crosslinkerSpecificityList[0], distanceableSequences, alignedTerminalIndices);
        const sampleDists = [];
        // heterobidirectional crosslinker, between same protein id only - should be the same returned values as the previous test
        const options = {linksPerSearch: 100, heterobi: true, restrictToChain: false, restrictToProtein: true};
        distObj.generateSubDividedSampleDistancesBySearch (filteredResidueMap, sampleDists, options);
        const actualValue = sampleDists.map(Math.round);

        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as sampled distances, Passed!");
    });


    QUnit.test ("Sample Distance Generation, 1 Search, restricted to same chain (monomer equivalent), rounded to nearest integer", function (assert) {
        const expectedValue = [28, 33, 39, 50, 47, 55, 28, 10, 27, 46, 47, 40, 38, 44, 39, 34, 36, 64, 34, 29, 13, 20, 20, 28, 40, 34, 46, 43, 35, 20, 18, 18, 22, 50, 51, 24, 26, 47, 37, 29, 31, 60, 32, 35, 56, 47, 36, 31, 28, 34, 39, 50, 47, 56, 29, 10, 27, 46, 47, 39, 38, 45, 39, 35, 36, 65, 34, 29, 13, 20, 21, 28, 40, 34, 46, 43, 35, 21, 18, 18, 22, 50, 51, 24, 25, 47, 38, 29, 31, 60, 32, 35, 56, 48, 36, 31];

        const searchArray = Array.from(clmsModel.get("searches").values());
        const crosslinkerSpecificityList = d3.values(crosslinkerSpecificityPerLinker(searchArray));
        const distanceableSequences = [
            {
                first: 5,
                last: 582,
                subSeq: dseq1AO6,
                chainIndex: 0,
                modelIndex: 0,
                protID: "P02768-A",
                alignID: "1AO6:A:0"
            },
            {
                first: 5,
                last: 582,
                subSeq: dseq1AO6,
                chainIndex: 1,
                modelIndex: 0,
                protID: "P02768-A",
                alignID: "1AO6:B:1"
            }
        ];
        const alignedTerminalIndices = {ntermList: [], ctermList: []};

        const distObj = clmsModel.get("distancesObj");
        const filteredResidueMap = distObj.calcFilteredSequenceResidues(crosslinkerSpecificityList[0], distanceableSequences, alignedTerminalIndices);
        const sampleDists = [];
        // heterobidirectional crosslinker, between same chains only
        const options = {linksPerSearch: 100, heterobi: true, restrictToChain: true, restrictToProtein: true};
        distObj.generateSubDividedSampleDistancesBySearch (filteredResidueMap, sampleDists, options);
        const actualValue = sampleDists.map(Math.round);

        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as sampled distances, Passed!");
    });


    QUnit.test ("Sample Distance Generation, 1 Search, restricted to same model index (artificially set to make monomer equivalent), rounded to nearest integer", function (assert) {
        const expectedValue = [28, 33, 39, 50, 47, 55, 28, 10, 27, 46, 47, 40, 38, 44, 39, 34, 36, 64, 34, 29, 13, 20, 20, 28, 40, 34, 46, 43, 35, 20, 18, 18, 22, 50, 51, 24, 26, 47, 37, 29, 31, 60, 32, 35, 56, 47, 36, 31, 28, 34, 39, 50, 47, 56, 29, 10, 27, 46, 47, 39, 38, 45, 39, 35, 36, 65, 34, 29, 13, 20, 21, 28, 40, 34, 46, 43, 35, 21, 18, 18, 22, 50, 51, 24, 25, 47, 38, 29, 31, 60, 32, 35, 56, 48, 36, 31];

        const searchArray = Array.from(clmsModel.get("searches").values());
        const crosslinkerSpecificityList = d3.values(crosslinkerSpecificityPerLinker(searchArray));
        const distanceableSequences = [
            {
                first: 5,
                last: 582,
                subSeq: dseq1AO6,
                chainIndex: 0,
                modelIndex: 0,
                protID: "P02768-A",
                alignID: "1AO6:A:0"
            },
            {
                first: 5,
                last: 582,
                subSeq: dseq1AO6,
                chainIndex: 1,
                modelIndex: 1,
                protID: "P02768-A",
                alignID: "1AO6:B:1"
            }
        ];
        const alignedTerminalIndices = {ntermList: [], ctermList: []};

        const distObj = clmsModel.get("distancesObj");
        const filteredResidueMap = distObj.calcFilteredSequenceResidues(crosslinkerSpecificityList[0], distanceableSequences, alignedTerminalIndices);
        const sampleDists = [];
        const cimimap = d3.map({0: 0, 1: 1}); // artifically associate each chain with a different model
        // heterobidirectional crosslinker, between same chains only
        const options = {
            linksPerSearch: 100,
            heterobi: true,
            restrictToChain: false,
            restrictToModel: true,
            restrictToProtein: true
        };
        distObj.generateSubDividedSampleDistancesBySearch (filteredResidueMap, sampleDists, options, cimimap);
        const actualValue = sampleDists.map(Math.round);

        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as sampled distances, Passed!");
    });


     QUnit.test ("Sample Distance Generation, 1 Search, 2 different models, but inter-model distance flag set to true, rounded to nearest integer", function (assert) {
         const expectedValue = [27, 36, 58, 41, 99, 77, 88, 93, 84, 44, 29, 48, 64, 47, 55, 38, 55, 69, 53, 26, 21, 17, 33, 23, 91, 68, 72, 73, 70, 44, 28, 29, 15, 11, 89, 69, 63, 66, 69, 41, 19, 47, 44, 20, 78, 64, 61, 78, 74, 99, 78, 88, 93, 84, 27, 36, 58, 41, 55, 38, 55, 69, 53, 45, 29, 48, 64, 47, 90, 68, 72, 73, 70, 26, 21, 17, 33, 23, 89, 69, 64, 66, 69, 44, 28, 29, 15, 11, 78, 64, 61, 78, 74, 42, 19, 48, 44, 20];

         const searchArray = Array.from(clmsModel.get("searches").values());
         const crosslinkerSpecificityList = d3.values(crosslinkerSpecificityPerLinker(searchArray));
         const distanceableSequences = [
             {
                 first: 5,
                 last: 582,
                 subSeq: dseq1AO6,
                 chainIndex: 0,
                 modelIndex: 0,
                 protID: "P02768-A",
                 alignID: "1AO6:A:0"
             },
             {
                 first: 5,
                 last: 582,
                 subSeq: dseq1AO6,
                 chainIndex: 1,
                 modelIndex: 1,
                 protID: "P02768-A",
                 alignID: "1AO6:B:1"
             }
         ];
         const alignedTerminalIndices = {ntermList: [], ctermList: []};

         const distObj = clmsModel.get("distancesObj");
         const filteredResidueMap = distObj.calcFilteredSequenceResidues(crosslinkerSpecificityList[0], distanceableSequences, alignedTerminalIndices);
         const sampleDists = [];
         const cimimap = d3.map({0: 0, 1: 1}); // artifically associate each chain with a different model
        // heterobidirectional crosslinker, between same chains only

         const options = {
             linksPerSearch: 100,
             heterobi: true,
             restrictToChain: false,
             restrictToModel: false,
             restrictToProtein: true
         };
         distObj.generateSubDividedSampleDistancesBySearch (filteredResidueMap, sampleDists, options, cimimap);
         const actualValue = sampleDists.map(Math.round);

         assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as sampled distances, Passed!");
    });

    QUnit.test ("Run through DistancesObj right from getSampleDistances, 1 Search, restricted to same chain (monomer equivalent), rounded to nearest integer", function (assert) {
        const expectedValue = [28, 33, 39, 50, 47, 55, 28, 10, 27, 46, 47, 40, 38, 44, 39, 34, 36, 64, 34, 29, 13, 20, 20, 28, 40, 34, 46, 43, 35, 20, 18, 18, 22, 50, 51, 24, 26, 47, 37, 29, 31, 60, 32, 35, 56, 47, 36, 31, 28, 34, 39, 50, 47, 56, 29, 10, 27, 46, 47, 39, 38, 45, 39, 35, 36, 65, 34, 29, 13, 20, 21, 28, 40, 34, 46, 43, 35, 21, 18, 18, 22, 50, 51, 24, 25, 47, 38, 29, 31, 60, 32, 35, 56, 48, 36, 31];

        const searchArray = Array.from(clmsModel.get("searches").values());
        const crosslinkerSpecificityList = d3.values(crosslinkerSpecificityPerLinker(searchArray));
        const distObj = clmsModel.get("distancesObj");

        const sampleDists = distObj.getSampleDistances(100, crosslinkerSpecificityList, {
            withinProtein: true,
            withinChain: true
        });
        const actualValue = sampleDists.map(Math.round);

        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as sampled distances, Passed!");
    });


    QUnit.test ("Run through DistancesObj right from getSampleDistances, no crosslinker specified, 1 Search, restricted to same model (artifically set, to make monomer equivalent), rounded to nearest integer", function (assert) {
        const expectedValue = [28, 44, 13, 43, 51, 60, 28, 44, 24, 44, 29, 35, 44, 44, 37, 49, 51, 55, 13, 24, 37, 30, 41, 51, 43, 44, 49, 30, 38, 48, 51, 29, 51, 41, 38, 11, 60, 35, 55, 51, 48, 11, 29, 45, 13, 43, 51, 60, 29, 44, 25, 44, 29, 35, 45, 44, 38, 49, 51, 55, 13, 25, 38, 30, 41, 50, 43, 44, 49, 30, 38, 48, 51, 29, 51, 41, 38, 11, 60, 35, 55, 50, 48, 11];

        const crossSpec = clmsModel.get("crosslinkerSpecificity");
        clmsModel.set ("crosslinkerSpecificity", null);	// null crosslink specificity for this test
        const searchArray = Array.from(clmsModel.get("searches").values());
        const crosslinkerSpecificityList = d3.values(crosslinkerSpecificityPerLinker(searchArray));
        const distObj = clmsModel.get("distancesObj");

        const sampleDists = distObj.getSampleDistances(100, crosslinkerSpecificityList, {
            withinProtein: true,
            withinChain: true
        });
        const actualValue = sampleDists.map(Math.round);

        clmsModel.set ("crosslinkerSpecificity", crossSpec);	// restore crosslink specs

        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as sampled distances, Passed!");
    });

    QUnit.module ("Model Utils Functions");

    QUnit.test ("Get max score of crosslink matches", function (assert) {
        const testCrossLink = {
            filteredMatches_pp: [
                {
                    match: {
                        score: function () {
                            return "cat";
                        }
                    }
                },
                {
                    match: {
                        score: function () {
                            return 12.04;
                        }
                    }
                },
                {
                    match: {
                        score: function () {
                            return 11.34;
                        }
                    }
                },
                {
                    match: {
                        score: function () {
                            return null;
                        }
                    }
                },
            ]
        };
        const expectedValue = 12.04;
        const actualValue = highestScore(testCrossLink);

        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as highest score, Passed!");
    });


    QUnit.test ("Index same sequences to first occurence", function (assert) {
        const testSeqs = [
            "ABCDEFGHIJKLM",
            "BABARACUS",
            "ABCDEFGHIJKLM",
            "HANNIBALSMITH",
            "BABARACUS",
            "FACE",
            "FACE"
        ];
        const expectedValue = [undefined, undefined, 0, undefined, 1, undefined, 5];
        const actualValue = indexSameSequencesToFirstOccurrence(testSeqs);

        // stringify turns undefined to null for printout, but it's a match
        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as index array, Passed!");
    });

    QUnit.test ("Filter repeated Sequences", function (assert) {
        const testSeqs = [
            "ABCDEFGHIJKLM",
            "BABARACUS",
            "ABCDEFGHIJKLM",
            "HANNIBALSMITH",
            "BABARACUS",
            "FACE",
            "FACE"
        ];
        const expectedValue = {
            sameSeqIndices: [undefined, undefined, 0, undefined, 1, undefined, 5],
            uniqSeqs: ["ABCDEFGHIJKLM", "BABARACUS", "HANNIBALSMITH", "FACE"],
            uniqSeqIndices: [0, 1, 3, 5],
            uniqSeqReverseIndex: {"0": "0", "1": "1", "3": "2", "5": "3"}
        };
        const actualValue = filterRepeatedSequences(testSeqs);

        // stringify turns undefined to null for printout, but it's a match
        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as repeated sequence result, Passed!");
    });


    QUnit.test ("Reinflate sequence map", function (assert) {
        const testSeqs = [
            "ABCDEFGHIJKLM",
            "BABARACUS",
            "ABCDEFGHIJKLM",
            "HANNIBALSMITH",
            "BABARACUS",
            "FACE",
            "FACE"
        ];
        const matchMatrix = {Prot1: [1, 2, 3, 4], Prot2: [2, 4, 6, 8]};
        const filteredSeqInfo = {
            sameSeqIndices: [undefined, undefined, 0, undefined, 1, undefined, 5],
            uniqSeqs: ["ABCDEFGHIJKLM", "BABARACUS", "HANNIBALSMITH", "FACE"],
            uniqSeqIndices: [0, 1, 3, 5],
            uniqSeqReverseIndex: {"0": "0", "1": "1", "3": "2", "5": "3"}
        };

        const expectedValue = {Prot1: [1, 2, 1, 3, 2, 4, 4], Prot2: [2, 4, 2, 6, 4, 8, 8]};
        const actualValue = reinflateSequenceMap(matchMatrix, testSeqs, filteredSeqInfo);

        // stringify turns undefined to null for printout, but it's a match
        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as reinflated sequence result, Passed!");
    });


    QUnit.test ("Crosslink count per protein pairing", function (assert) {
        const crosslinks = model.getAllCrossLinks();
        const expectedCrossLinkIDs = _.pluck(crosslinks, "id");
        const expectedValue = {
            "P02768-A-P02768-A": {
                crosslinks: expectedCrossLinkIDs,
                fromProtein: "P02768-A",
                toProtein: "P02768-A",
                label: "ALBU - ALBU"
            }
        };
        const actualValue = crosslinkCountPerProteinPairing(crosslinks);
        d3.values(actualValue).forEach (function (pairing) {	// do this as otherwise stringify will kick off about circular structures, so just match ids
            pairing.fromProtein = pairing.fromProtein.id;
            pairing.toProtein = pairing.toProtein.id;
            pairing.crosslinks = _.pluck (pairing.crosslinks, "id");
        });

        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as crosslink protein pairing value, Passed!");
    });


    QUnit.test ("Legal accession ID Filter", function (assert) {
        const interactors = [
            {is_decoy: true, accession: "Q10276"},  // is decoy, good accession
            {is_decoy: false, accession: "P12345"}, // good accession
            {is_decoy: false, accession: "GIBBER"}, // bad accession
            {is_decoy: false, accession: "A0A022YWF9"},   // good accession
            {is_decoy: false, accession: "WH&T"},   // bad accession
        ];
        const expectedValue = ["P12345", "A0A022YWF9"];
        const actualValue = getLegalAccessionIDs(interactors);

        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as crosslink protein pairing value, Passed!");
    });


    QUnit.test ("Merge contiguous features", function (assert) {
        const testArrs = [
            [
                {begin: 1, end: 1},
                {begin: 2, end: 2},
                {begin: 4, end: 4},
                {begin: 5, end: 10},
                {begin: 6, end: 8},
                {begin: 7, end: 12},
                {begin: 20, end: 30},
            ],
            [
                {begin: -15, end: 6}
            ],
            [
                {begin: -12, end: 8},
                {begin: -15, end: 6}
            ]
        ];

        const expectedValue = [
            [
                {begin: 1, end: 2},
                {begin: 4, end: 12},
                {begin: 20, end: 30}
            ],
            [
                {begin: -15, end: 6}
            ],
            [
                {begin: -15, end: 8}
            ]
        ];

        const actualValue = testArrs.map(function (testArr, i) {
            return mergeContiguousFeatures(testArr);
        });

        // stringify turns undefined to null for printout, but it's a match
        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as contiguous feature ranges, Passed!");
    });


    QUnit.test ("Radix sort", function (assert) {
        const testArr = [2, 4, 6, 6, 3, 2, 1, 4, 2, 4, 6, 8, 1, 2, 4, 6, 9, 0];
        const expectedValue = [0, 1, 1, 2, 2, 2, 2, 3, 4, 4, 4, 4, 6, 6, 6, 6, 8, 9];
        const actualValue = radixSort(10, testArr, function (d) {
            return d;
        });

        // stringify turns undefined to null for printout, but it's a match
        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as sorted by radix, Passed!");
    });


    QUnit.test ("Parse URL Query String", function (assert) {
        const testString = "sid=10003-secret&decoys=1&unval=1&linear=1&cats=true&anon=";
        const expectedValue = {sid: "10003-secret", decoys: 1, unval: 1, linear: 1, cats: true, anon: ""};
        const actualValue = parseURLQueryString(testString);

        // stringify turns undefined to null for printout, but it's a match
        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as parsed URL query string, Passed!");
    });


    QUnit.test ("Make URL Query String", function (assert) {
        const testObj = {sid: "10003-secret", decoys: 1, unval: 1, linear: 1, cats: true, anon: ""};
        const expectedValue = ["sid=10003-secret", "decoys=1", "unval=1", "linear=1", "cats=1", "anon="];	// true gets turned to 1, false to 0
        const actualValue = makeURLQueryPairs(testObj, "");

        // stringify turns undefined to null for printout, but it's a match
        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as constructed URL query string, Passed!");
    });


    // QUnit.test ("ZScore array of values", function (assert) {
    //     var expectedValue = [-1.49, -1.16, -0.83, -0.5, -0.17, 0.17, 0.5, 0.83, 1.16, 1.49];
    //     var testNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    //     var actualValue = modelUtils.zscore(testNumbers).map(function (num) {
    //         return +(num).toFixed(2);
    //     });
    //
    //     assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as z-value output, Passed!");
    // });
    //
    //
    // QUnit.test ("Compact 2D array", function (assert) {
    //     var expectedValue = [[1, 2, undefined, 3], [4, 5, 6, 7]];
    //     var testNumbers = [[1, 2, undefined, 3], [undefined, undefined, undefined, undefined], [4, 5, 6, 7]];
    //     var actualValue = modelUtils.compact2DArray (testNumbers);
    //
    //     assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as compacted 2D array, Passed!");
    // });
    //
    //
    // QUnit.test ("makeColumnGroupIndices", function (assert) {
    //     var expectedValue = [["a", "b"],["c"]];
    //     var options = {groups: d3.map({a: "cat", b: "cat", c: "dog"})};
    //     var testNumbers = [[1, 1, 1, 1, 1],[3, 3, 3, 3, 3],[5, 5, 5, 5, 5]];
    //     ["a", "b", "c"].forEach (function (val, i) { testNumbers[i].colName = val; });
    //     var actualValue = modelUtils.makeColumnGroupIndices(testNumbers, options);
    //
    //     assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as groups, Passed!");
    //
    //     expectedValue = [0, 0, 1];
    //     actualValue = _.pluck (testNumbers, "groupIndex");
    //     assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as attached score group indices, Passed!");
    // });


    // QUnit.test ("Average columns by group", function (assert) {
    //     var expectedValue = [[2, 2, 2, 2, 2], [5, 5, 5, 5, 5]];
    //     ["Avg Z[a;b]", "Avg Z[c]"].forEach (function (val, i) { expectedValue[i].colName = val; });
    //
    //     var testNumbers = [[1, 1, 1, 1, 1],[3, 3, 3, 3, 3],[5, 5, 5, 5, 5],[7, 7, 7, 7, 7]];
    //     var columnGroupNames = [["a", "b"], ["c"]];
    //     [0,0,1].forEach (function (val, i) { testNumbers[i].groupIndex = val; });	// 7's not given groupIndex
    //     var actualValue = modelUtils.averageGroups(testNumbers, columnGroupNames);
    //
    //     assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as z-value output, Passed!");
    // });


    // QUnit.test ("Normalise 2D array to column", function (assert) {
    //     var testArr = [
    //         [2, 3, 4],
    //         [1, 2, 3],
    //         [4, 5, 6],
    //         [7, undefined, 9],	// column 1 value is undefined, this is the column we try to normalise against
    //         [undefined, 11, 12],	// column 0 value is undefined, just one of the other columns
    //     ];
    //
    //     var expectedValue = [
    //         [-1, 0, 1],
    //         [-1, 0, 1],
    //         [-1, 0, 1],
    //         [undefined, undefined, undefined],	// normalise row to an undefined value = all row undefined
    //         [undefined, 0, 1]	// normalise undefined value to known value = that value stays undefined
    //     ];
    //
    //     var actualValue = modelUtils.normalize2DArrayToColumn (testArr, 1);	// normalise to column 1
    //
    //     // stringify turns undefined to null for printout, but it's a match
    //     assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as normalised array, Passed!");
    // });


    // QUnit.test ("Update crosslink metadata with column data", function (assert) {
    //     var expectedValue = [{cat: 1, dog: 2}, {cat: 3, dog: 4}];
    //
    //     var testLinks = model.getAllCrossLinks().slice(0,2);
    //     var testZScores = [[1, 2],[3, 4]];
    //     testLinks.forEach (function (crosslink, i) { testZScores[i].clink = crosslink; });
    //     var testColumnNameIndexPair = [{name: "cat", index: 0}, {name: "dog", index: 1}];
    //     modelUtils.updateMetaDataWithTheseColumns (testZScores, testColumnNameIndexPair);
    //
    //     var actualValue = testLinks.map (function (testLink) { return $.extend({}, testLink.getMeta()); });
    //     actualValue.forEach (function (val) { delete val.distance; });
    //
    //     assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as updated metadata values, Passed!");
    // });

    QUnit.module ("Metadata parsing testing");


    QUnit.test ("Update Protein Metadata", function (assert) {
        const expectedValue = {
            columns: ["proteinid", "cat", "dog"],
            items: clmsModel.get("participants"),
            matchedItemCount: 1
        };
        window.vent.listenToOnce (window.vent, "proteinMetadataUpdated", function (actualValue) {
            assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as proteinmetadata event data, Passed!");

            const actualValue2 = clmsModel.get("participants").get("P02768-A").getMeta();
            const expectedValue2 = {proteinid: 'P02768-A', cat: 2, dog: 4};
            assert.deepEqual (actualValue2, expectedValue2, "Expected "+JSON.stringify(expectedValue2)+" as protein meta value, Passed!");
        });

        const fileContents = "ProteinID,cat,dog\nP02768-A,2,4\n";
        updateProteinMetadata (fileContents, clmsModel);
    });


    QUnit.test ("Update Crosslink Metadata", function (assert) {
        const expectedValue = {
            columns: ["cat", "dog"],
            columnTypes: {cat: "numeric", dog: "numeric"},
            items: clmsModel.get("crosslinks"),
            matchedItemCount: 2,
            ppiCount: 2
        };
        window.vent.listenToOnce (window.vent, "linkMetadataUpdated", function (actualValue) {
            console.log ("CLLCC2", clmsModel, clmsModel.get("crosslinks"));
            assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as linkmetadata event data, Passed!");

            const actualValue2 = $.extend({}, clmsModel.get("crosslinks").get("P02768-A_415-P02768-A_497").getMeta());
            delete actualValue2.distance;
            const expectedValue2 = {cat: 2, dog: 4};
            assert.deepEqual (actualValue2, expectedValue2, "Expected "+JSON.stringify(expectedValue2)+" as link meta value, Passed!");
        });

        const fileContents = "Protein 1,SeqPos 1,Protein 2,SeqPos 2,cat,dog\n"
            + "ALBU,415,ALBU,497,2,4\n"
            + "ALBU,190,ALBU,425,3,5\n"
        ;
        updateLinkMetadata (fileContents, clmsModel);
    });


    QUnit.test ("Parse User Annotations", function (assert) {
        model.get("filterModel")
            .resetFilter()
        ;

        window.vent.listenToOnce (window.vent, "userAnnotationsUpdated", function (actualValue) {
            const expectedAnnotationTypes = [
                {category: "User Defined", type: "Helix", source: "Search", colour: "blue"},
                {category: "User Defined", type: "Strand", source: "Search", colour: "yellow"},
                {category: "User Defined", type: "Sheet", source: "Search", colour: "red"},
            ];
            const expectedAnnotationItems = [
                {
                    category: "User Defined",
                    type: "Helix",
                    colour: "blue",
                    description: undefined,
                    begin: "10",
                    end: "20"
                },
                {
                    category: "User Defined",
                    type: "Strand",
                    colour: "yellow",
                    description: undefined,
                    begin: "20",
                    end: "30"
                },
                {
                    category: "User Defined",
                    type: "Helix",
                    colour: "red",
                    description: undefined,
                    begin: "40",
                    end: "70"
                },
                {
                    category: "User Defined",
                    type: "Sheet",
                    colour: "red",
                    description: undefined,
                    begin: "100",
                    end: "120"
                },
            ];

            let expectedValue = {
                types: expectedAnnotationTypes,
                columns: expectedAnnotationTypes,
                items: expectedAnnotationItems,
                matchedItemCount: 4
            };

            assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as passed userAnnotations value, Passed!");

            const annotColl = model.get("annotationTypes");
            expectedValue = expectedAnnotationTypes;
            expectedValue.forEach (function (type) {
                type.id = annotColl.modelId (type);
                type.shown = false;
            });
            // sort array by id, like collection is
            expectedValue.sort (function (a,b) {
                return a.id.localeCompare (b.id);
            });

            const modelsFromCollection = annotColl.where({category: "User Defined"});
            actualValue = modelsFromCollection.map (function (model) { return model.toJSON(); });

            assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as generated userAnnotation Models, Passed!");



        });

        const input = "ProteinID,AnnotName,StartRes,EndRes,Color\r\nP02768-A,Helix,10,20,blue\r\nP02768-A,Strand,20,30,yellow\r\nP02768-A,Helix,40,70,red\r\nP02768-A,Sheet,100,120,red\r\n";
        updateUserAnnotationsMetadata (input, clmsModel);
    });


    QUnit.module ("STRING utils testing");

    QUnit.test ("Compress/Decompress Small", function (assert) {

        const str = "\"Protein1\",\"SeqPos1\",\"LinkedRes1\",\"Protein2\",\"SeqPos2\",\"LinkedRes2\",\"Highest Score\",\"Match Count\",\"DecoyType\",\"AutoValidated\",\"Validated\",\"Link FDR\",\"3D Distance\",\"From Chain\",\"To Chain\",\"PDB SeqPos 1\",\"PDB SeqPos 2\",\"Search_10003\",\"cat\",\"dog\"\r\n\"sp|P02768-A|ALBU\",\"415\",\"V\",\"sp|P02768-A|ALBU\",\"497\",\"Y\",\"19.0000\",\"2\",\"TT\",\"true\",\"B,B\",\"\",\"8.79\",\"B\",\"B\",\"411\",\"493\",\"X\",\"2\",\"4\"\r\n\"sp|P02768-A|ALBU\",\"190\",\"K\",\"sp|P02768-A|ALBU\",\"425\",\"E\",\"17.3400\",\"4\",\"TT\",\"true\",\"A,C,A,A\",\"\",\"12.07\",\"B\",\"B\",\"186\",\"421\",\"X\",\"3\",\"5\"\r\n\"sp|P02768-A|ALBU\",\"125\",\"T\",\"sp|P02768-A|ALBU\",\"161\",\"Y\",\"17.3200\",\"1\",\"TT\",\"true\",\"C\",\"\",\"15.26\",\"A\",\"A\",\"121\",\"157\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"131\",\"E\",\"sp|P02768-A|ALBU\",\"162\",\"K\",\"17.0300\",\"1\",\"TT\",\"true\",\"?\",\"\",\"8.30\",\"A\",\"A\",\"127\",\"158\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"107\",\"D\",\"sp|P02768-A|ALBU\",\"466\",\"K\",\"13.9400\",\"1\",\"TT\",\"true\",\"B\",\"\",\"8.37\",\"B\",\"B\",\"103\",\"462\",\"X\",\"\",\"\"\r\n";

        const expectedValue = str;
        const actualValue = STRINGUtils.lzw_decode(STRINGUtils.lzw_encode(str));

        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as compressed then decompressed small string, Passed!");
    });


    QUnit.test ("Compress/Decompress Large", function (assert) {


        const animals = ["ant", "bat", "cat", "dog", "eel", "fox", "gnu", "hen", "iguana", "jay", "kestrel", "llama"];
        let str = "";
        for (let n = 0; n < 600000; n++) {
            str += animals[n % animals.length] + String.fromCharCode (n % 256);
        }

        const expectedValue = str;
        const actualValue = STRINGUtils.lzw_decode(STRINGUtils.lzw_encode(str));

        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue.slice(-200))+" as compressed then decompressed large string, Passed!");
    });

    QUnit.module ("File download string generation");

    QUnit.test ("Residues CSV", function (assert) {
        model.get("filterModel")
            .resetFilter()
            .set ({AUTO: false})
        ;
        const expectedValue = "\"Residue(s)\",\"Occurences(in_unique_links)\"\r\n\"V-Y\",\"1\"\r\n\"E-K\",\"2\"\r\n\"T-Y\",\"1\"\r\n\"D-K\",\"1\"\r\n\"V\",\"1\"\r\n\"Y\",\"2\"\r\n\"K\",\"3\"\r\n\"E\",\"2\"\r\n\"T\",\"1\"\r\n\"D\",\"1\"\r\n";
        const actualValue = getResidueCount();

        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as Residues CSV, Passed!");

        model.get("filterModel").resetFilter();
    });

    QUnit.test ("Links CSV", function (assert) {
        model.get("filterModel")
            .resetFilter()
            .set ({AUTO: false})
        ;
        const expectedValue = "\"Protein1\",\"SeqPos1\",\"LinkedRes1\",\"Protein2\",\"SeqPos2\",\"LinkedRes2\",\"Highest Score\",\"Match Count\",\"DecoyType\",\"AutoValidated\",\"Validated\",\"Link FDR\",\"3D Distance\",\"From Chain\",\"To Chain\",\"PDB SeqPos 1\",\"PDB SeqPos 2\",\"Search_10003\",\"cat\",\"dog\"\r\n\"sp|P02768-A|ALBU\",\"415\",\"V\",\"sp|P02768-A|ALBU\",\"497\",\"Y\",\"19.0000\",\"2\",\"TT\",\"true\",\"B,B\",\"\",\"8.79\",\"B\",\"B\",\"411\",\"493\",\"X\",\"2\",\"4\"\r\n\"sp|P02768-A|ALBU\",\"190\",\"K\",\"sp|P02768-A|ALBU\",\"425\",\"E\",\"17.3400\",\"4\",\"TT\",\"true\",\"A,C,A,A\",\"\",\"12.07\",\"B\",\"B\",\"186\",\"421\",\"X\",\"3\",\"5\"\r\n\"sp|P02768-A|ALBU\",\"125\",\"T\",\"sp|P02768-A|ALBU\",\"161\",\"Y\",\"17.3200\",\"1\",\"TT\",\"true\",\"C\",\"\",\"15.26\",\"A\",\"A\",\"121\",\"157\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"131\",\"E\",\"sp|P02768-A|ALBU\",\"162\",\"K\",\"17.0300\",\"1\",\"TT\",\"true\",\"?\",\"\",\"8.30\",\"A\",\"A\",\"127\",\"158\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"107\",\"D\",\"sp|P02768-A|ALBU\",\"466\",\"K\",\"13.9400\",\"1\",\"TT\",\"true\",\"B\",\"\",\"8.37\",\"B\",\"B\",\"103\",\"462\",\"X\",\"\",\"\"\r\n";

        // add the metadata from the other test, so it's always the same columns/values (i.e. test order doesn't change outcome of this test)
        const fileContents = "Protein 1,SeqPos 1,Protein 2,SeqPos 2,cat,dog\n"
            + "ALBU,415,ALBU,497,2,4\n"
            + "ALBU,190,ALBU,425,3,5\n"
        ;
        updateLinkMetadata (fileContents, clmsModel);

        const actualValue = getLinksCSV();

        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as Cross-Links CSV, Passed!");

        model.get("filterModel").resetFilter();
    });


    QUnit.test ("Matches CSV", function (assert) {
        model.get("filterModel")
            .resetFilter()
            .set ({AUTO: false})
        ;
        const expectedValue = "\"Id\",\"Protein1\",\"SeqPos1\",\"PepPos1\",\"PepSeq1\",\"LinkPos1\",\"Protein2\",\"SeqPos2\",\"PepPos2\",\"PepSeq2\",\"LinkPos2\",\"Score\",\"Charge\",\"ExpMz\",\"ExpMass\",\"CalcMz\",\"CalcMass\",\"MassError\",\"AutoValidated\",\"Validated\",\"Search\",\"RawFileName\",\"PeakListFileName\",\"ScanNumber\",\"ScanIndex\",\"CrossLinkerModMass\",\"FragmentTolerance\",\"IonTypes\",\"Decoy1\",\"Decoy2\",\"3D Distance\",\"From Chain\",\"To Chain\",\"PDB SeqPos 1\",\"PDB SeqPos 2\",\"LinkType\",\"DecoyType\",\"Retention Time\"\r\n\"625824830\",\"sp|P02768-A|ALBU\",\"425\",\"415\",\"VPQVSTPTLVEVSR\",\"11\",\"sp|P02768-A|ALBU\",\"190\",\"182\",\"LDELRDEGKASSAK\",\"9\",\"15.42\",\"5\",\"623.13706032591\",\"3110.6489192951553\",\"623.136349226899\",\"3110.6453638001\",\"1.141161179106242\",\"true\",\"C\",\"10003\",\"E151023_07_Lumos_CS_AB_IN_190_HCD_HSA_SDA_3\",\"\",\"23756\",\"0\",\"82.0413162600906\",\"20 ppm\",\"b;y;peptide;\",\"false\",\"false\",\"12.07\",\"B\",\"B\",\"185\",\"420\",\"Self\",\"TT\",\"-1\"\r\n\"625825062\",\"sp|P02768-A|ALBU\",\"425\",\"414\",\"KVPQVSTPTLVEVSR\",\"12\",\"sp|P02768-A|ALBU\",\"190\",\"182\",\"LDELRDEGKASSAK\",\"9\",\"14.8\",\"5\",\"648.75679602991\",\"3238.747597815155\",\"648.755341826899\",\"3238.7403268001\",\"2.2415276102587516\",\"true\",\"A\",\"10003\",\"E151023_07_Lumos_CS_AB_IN_190_HCD_HSA_SDA_3\",\"\",\"21558\",\"0\",\"82.0413162600906\",\"20 ppm\",\"b;y;peptide;\",\"false\",\"false\",\"12.07\",\"B\",\"B\",\"185\",\"420\",\"Self\",\"TT\",\"-1\"\r\n\"625825067\",\"sp|P02768-A|ALBU\",\"425\",\"414\",\"KVPQVSTPTLVEVSR\",\"12\",\"sp|P02768-A|ALBU\",\"190\",\"182\",\"LDELRDEGKASSAK\",\"9\",\"15.19\",\"5\",\"648.75676475862\",\"3238.747441458705\",\"648.755341826899\",\"3238.7403268001\",\"2.193325633318231\",\"true\",\"A\",\"10003\",\"E151023_07_Lumos_CS_AB_IN_190_HCD_HSA_SDA_3\",\"\",\"22016\",\"0\",\"82.0413162600906\",\"20 ppm\",\"b;y;peptide;\",\"false\",\"false\",\"12.07\",\"B\",\"B\",\"185\",\"420\",\"Self\",\"TT\",\"-1\"\r\n\"625825068\",\"sp|P02768-A|ALBU\",\"425\",\"414\",\"KVPQVSTPTLVEVSR\",\"12\",\"sp|P02768-A|ALBU\",\"190\",\"182\",\"LDELRDEGKASSAK\",\"9\",\"17.34\",\"4\",\"810.69382619827\",\"3238.746198925564\",\"810.692358166904\",\"3238.7403268001\",\"1.8108365660876746\",\"true\",\"A\",\"10003\",\"E151023_07_Lumos_CS_AB_IN_190_HCD_HSA_SDA_3\",\"\",\"21877\",\"0\",\"82.0413162600906\",\"20 ppm\",\"b;y;peptide;\",\"false\",\"false\",\"12.07\",\"B\",\"B\",\"185\",\"420\",\"Self\",\"TT\",\"-1\"\r\n\"625826126\",\"sp|P02768-A|ALBU\",\"497\",\"485\",\"RPCcmFSALEVDETYVPK\",\"13\",\"sp|P02768-A|ALBU\",\"415\",\"414\",\"KVPQVSTPTLVEVSR\",\"2\",\"10.59\",\"3\",\"1211.3077209543\",\"3630.901333462263\",\"1211.3060024002457\",\"3630.8961778001\",\"1.4187612799510967\",\"true\",\"B\",\"10003\",\"E151023_07_Lumos_CS_AB_IN_190_HCD_HSA_SDA_3\",\"\",\"32246\",\"0\",\"82.0413162600906\",\"20 ppm\",\"b;y;peptide;\",\"false\",\"false\",\"8.79\",\"B\",\"B\",\"410\",\"492\",\"Self\",\"TT\",\"-1\"\r\n\"625826136\",\"sp|P02768-A|ALBU\",\"497\",\"485\",\"RPCcmFSALEVDETYVPK\",\"13\",\"sp|P02768-A|ALBU\",\"415\",\"414\",\"KVPQVSTPTLVEVSR\",\"2\",\"19\",\"4\",\"908.73262202769\",\"3630.901382243244\",\"908.731320916904\",\"3630.8961778001\",\"1.4317882041347127\",\"true\",\"B\",\"10003\",\"E151023_07_Lumos_CS_AB_IN_190_HCD_HSA_SDA_3\",\"\",\"32195\",\"0\",\"82.0413162600906\",\"20 ppm\",\"b;y;peptide;\",\"false\",\"false\",\"8.79\",\"B\",\"B\",\"410\",\"492\",\"Self\",\"TT\",\"-1\"\r\n\"625827037\",\"sp|P02768-A|ALBU\",\"466\",\"446\",\"MoxPCcmAEDYLSVVLNQLCcmVLHEKTPVSDR\",\"21\",\"sp|P02768-A|ALBU\",\"107\",\"107\",\"DDNPNLPR\",\"1\",\"13.94\",\"5\",\"843.01100363988\",\"4210.018635865004\",\"843.009827426899\",\"4210.0127548001\",\"1.3952541745553082\",\"true\",\"B\",\"10003\",\"E151023_07_Lumos_CS_AB_IN_190_HCD_HSA_SDA_3\",\"\",\"50388\",\"0\",\"82.0413162600906\",\"20 ppm\",\"b;y;peptide;\",\"false\",\"false\",\"8.37\",\"B\",\"B\",\"102\",\"461\",\"Self\",\"TT\",\"-1\"\r\n\"625827168\",\"sp|P02768-A|ALBU\",\"125\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"11\",\"sp|P02768-A|ALBU\",\"161\",\"161\",\"YKAAFTECcmCcmQAADK\",\"1\",\"17.32\",\"6\",\"733.17742554659\",\"4393.020894478266\",\"733.1765762668957\",\"4393.0157988001\",\"1.158356283873163\",\"true\",\"C\",\"10003\",\"E151023_07_Lumos_CS_AB_IN_190_HCD_HSA_SDA_3\",\"\",\"33444\",\"0\",\"82.0413162600906\",\"20 ppm\",\"b;y;peptide;\",\"false\",\"false\",\"15.26\",\"A\",\"A\",\"120\",\"156\",\"Self\",\"TT\",\"-1\"\r\n\"625828211\",\"sp|P02768-A|ALBU\",\"131\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"17\",\"sp|P02768-A|ALBU\",\"162\",\"161\",\"YKAAFTECcmCcmQAADK\",\"2\",\"17.03\",\"6\",\"733.17716390522\",\"4393.019324630046\",\"733.1765762668957\",\"4393.0157988001\",\"0.8014963152490925\",\"true\",\"?\",\"10003\",\"E151023_07_Lumos_CS_AB_IN_190_HCD_HSA_SDA_3\",\"\",\"35032\",\"0\",\"82.0413162600906\",\"20 ppm\",\"b;y;peptide;\",\"false\",\"false\",\"8.30\",\"A\",\"A\",\"126\",\"157\",\"Self\",\"TT\",\"-1\"\r\n";

        const actualValue = getMatchesCSV();

        assert.deepEqual (actualValue, expectedValue, "Expected "+JSON.stringify(expectedValue)+" as Matches CSV, Passed!");

        model.get("filterModel").resetFilter();
    });

}


/*
function testSetupNew (cbfunc) {
    d3.json ("10003.json", function (options) {
        CLMSUI.vent.listenToOnce (CLMSUI.vent, "initialSetupDone", function () {
            CLMSUI.compositeModelInst.get("clmsModel").listenToOnce (CLMSUI.compositeModelInst.get("clmsModel"), "change:distancesObj", function () {
                console.log ("distances obj changed");
                cbfunc (CLMSUI.compositeModelInst);
            });

            var stage = new NGL.Stage ("ngl", {tooltip: false});

            //CLMSUI.NGLUtils.repopulateNGL ({pdbCode: "1AO6", stage: stage, compositeModel: CLMSUI.compositeModelInst});

            var pdbCode = "1AO6";

            var pdbSettings = pdbCode.match(commonRegexes.multiPdbSplitter).map (function (code) {
                return {id: code, pdbCode: code, uri:"rcsb://"+code, local: false, params: {calphaOnly: this.cAlphaOnly}};
            }, this);

            NGLUtils.repopulateNGL({
                pdbSettings: pdbSettings,
                stage: stage,
                compositeModel: CLMSUI.compositeModelInst
            });

            console.log ("here");
        });

        CLMSUI.init.blosumLoading ({url: "../R/blosums.json"});
        CLMSUI.init.pretendLoad();	// add 2 to allDataLoaded bar (we aren't loading views or GO terms here)
        CLMSUI.init.models (options);
    });
}

function testSetup (cbfunc) {
    d3.json ("10003.json", function (options) {
        CLMSUI.init.modelsEssential (options);

        cbfunc (CLMSUI.compositeModelInst);
    });
}
*/

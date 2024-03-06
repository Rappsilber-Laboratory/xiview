import * as $ from "jquery";
import * as _ from "underscore";
import * as NGL from "../vendor/ngl.dev";
import * as d3 from "d3";

import {mostReadableMultipleId,} from "../js/downloads";
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
    not3DHomomultimeric
} from "../js/views/ngl/NGLUtils";
import {commonRegexes, toNearest} from "../js/utils";
import {STRINGUtils} from "../js/file-choosers/stringUtils";
import {getLinksCSV, getMatchesCSV, getResidueCount} from "../js/downloads";

import QUnit from "qunit";

import {blosumLoading, models, pretendLoad} from "../js/networkFrame";
import {setupColourModels} from "../js/model/color/setup-colors";
import {repopulateNGL} from "../js/views/ngl/RepopulateNGL";

export function testCallback(model) {
    console.log("model", model);
    const clmsModel = model.get("clmsModel");
    // utils.debug = true;

    const dseq1AO6 = "SEVAHRFKDLGEENFKALVLIAFAQYLQQCPFEDHVKLVNEVTEFAKTCVADESAENCDKSLHTLFGDKLCTVATLRETYGEMADCCAKQEPERNECFLQHKDDNPNLPRLVRPEVDVMCTAFHDNEETFLKKYLYEIARRHPYFYAPELLFFAKRYKAAFTECCQAADKAACLLPKLDELRDEGKASSAKQRLKCASLQKFGERAFKAWAVARLSQRFPKAEFAEVSKLVTDLTKVHTECCHGDLLECADDRADLAKYICENQDSISSKLKECCEKPLLEKSHCIAEVENDEMPADLPSLAADFVESKDVCKNYAEAKDVFLGMFLYEYARRHPDYSVVLLLRLAKTYETTLEKCCAAADPHECYAKVFDEFKPLVEEPQNLIKQNCELFEQLGEYKFQNALLVRYTKKVPQVSTPTLVEVSRNLGKVGSKCCKHPEAKRMPCAEDYLSVVLNQLCVLHEKTPVSDRVTKCCTESLVNRRPCFSALEVDETYVPKEFNAETFTFHADICTLSEKERQIKKQTALVELVKHKPKATKEQLKAVMDDFAAFVEKCCKADDKETCFAEEGKKLVAASQAA";

    QUnit.start();

    QUnit.module("Parsing");
    QUnit.test("JSON to Model Parsing", function (assert) {
        const expectedLinks = 162;
        const expectedMatches = 289;//291; // presuming change was due to change in validation status in xi1 db
        assert.deepEqual(clmsModel.get("crosslinks").size, expectedLinks, "Expected " + JSON.stringify(expectedLinks) + " crosslinks, Passed!");
        assert.deepEqual(clmsModel.get("matches").length, expectedMatches, "Expected " + JSON.stringify(expectedMatches) + " matches, Passed!");
    });

    QUnit.test("Decoy Protein Matching", function (assert) {
        const decoys = [
            {id: "10001001", name: "REV", accession: "REV_P02768-A", is_decoy: true},
            {id: "10001002", name: "RAN", accession: "RAN_P02768-A", is_decoy: true},
        ];
        decoys.forEach(function (decoy) {
            clmsModel.get("participants").set(decoy.id, decoy);
        });

        clmsModel.initDecoyLookup();
        const actual = Array.from(clmsModel.get("participants").values()).map(function (p) {
            return {id: p.id, targetProteinID: p.targetProteinID};
        });
        const expected = [{id: "P02768-A", targetProteinID: "P02768-A"}];
        decoys.forEach(function (decoy) {
            expected.push({id: decoy.id, targetProteinID: "P02768-A"});
        });

        decoys.forEach(function (decoy) {
            clmsModel.get("participants").delete(decoy.id);
        });

        assert.deepEqual(actual, expected, "Expected " + JSON.stringify(expected) + " decoy to real protein match, Passed!");
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

        assert.deepEqual(actual, expected, "Expected " + JSON.stringify(expected) + " search to protein map, Passed!");
    });

    QUnit.test("Readable ID Generation", function (assert) {
        const decoys = [
            {id: "10001001", name: "REV", accession: "REV_P02768-A", is_decoy: true},
            {id: "10001002", name: "RAN", accession: "RAN_P02768-A", is_decoy: true},
        ];
        decoys.forEach(function (decoy) {
            clmsModel.get("participants").set(decoy.accession, decoy);
        });

        const fakeMatch = {matchedPeptides: [{prt: ["P02768-A", "REV_P02768-A"]}, {prt: ["P02768-A"]}]};
        const expected = mostReadableMultipleId(fakeMatch, 0, clmsModel);
        decoys.forEach(function (decoy) {
            clmsModel.get("participants").delete(decoy.accession);
        });

        const actual = "sp|P02768-A|ALBU;sp|REV_P02768-A|REV";

        assert.deepEqual(actual, expected, "Expected " + JSON.stringify(expected) + " decoy to real protein match, Passed!");
    });


    QUnit.module("Filtering");
    QUnit.test("Filter testing", function (assert) {
        let expectedLinks;// = 5;
        // model.get("filterModel").resetFilter().set ({AUTO: false});
        // // changes to filtermodel changes getFilteredCrossLinks contents via backbone event
        // assert.deepEqual(model.getFilteredCrossLinks().length, expectedLinks, "Expected "+JSON.stringify(expectedLinks)+" filtered crosslinks, Passed!");

        expectedLinks = 162;
        model.get("filterModel").set({AUTO: true});
        assert.deepEqual(model.getFilteredCrossLinks().length, expectedLinks, "Expected " + JSON.stringify(expectedLinks) + " filtered crosslinks with adding auto=true, Passed!");

        expectedLinks = 156;
        model.get("filterModel").set({pepLength: 6});
        assert.deepEqual(model.getFilteredCrossLinks().length, expectedLinks, "Expected " + JSON.stringify(expectedLinks) + " filtered crosslinks with adding peplength=6, Passed!");

        model.get("filterModel").resetFilter();
    });


    QUnit.module("Selecting", {
        beforeEach: function () {
            model.get("filterModel").resetFilter().set({AUTO: true}, {pepLength: 0});
            model.setMarkedCrossLinks("selection", [], false, false, false);	// Tidy up. Clear selection.
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
        model.setMarkedCrossLinks("selection", [], false, false, false);
        assert.deepEqual(model.getMarkedCrossLinks("selection").length, expectedLinks, "Expected " + JSON.stringify(expectedLinks) + " selected crosslinks on setting empty crosslink selection, Passed!");
        assert.deepEqual(model.getMarkedMatches("selection").size(), expectedMatches, "Expected " + JSON.stringify(expectedMatches) + " selected matches on setting empty crosslink selection, Passed!");

        model.setMarkedMatches("selection", [], false, false, false);
        assert.deepEqual(model.getMarkedCrossLinks("selection").length, expectedLinks, "Expected " + JSON.stringify(expectedLinks) + " selected crosslinks on setting empty match selection, Passed!");
        assert.deepEqual(model.getMarkedMatches("selection").size(), expectedMatches, "Expected " + JSON.stringify(expectedMatches) + " selected matches on setting empty match selection, Passed!");
    });

    QUnit.test("Cross-link Selection testing", function (assert) {
        const expectedLinks = 3;
        const expectedMatches = 18;
        const crosslinks = clmsModel.get("crosslinks");
        const selectedLinks = [crosslinks.get("P02768-A_1-P02768-A_11"), crosslinks.get("P02768-A_415-P02768-A_497"), crosslinks.get("P02768-A_190-P02768-A_425")];
        model.setMarkedCrossLinks("selection", selectedLinks, false, false, false);

        assert.deepEqual(model.getMarkedCrossLinks("selection").length, expectedLinks, "Expected " + JSON.stringify(expectedLinks) + " selected crosslinks on setting 3 crosslinks selection, Passed!");
        assert.deepEqual(model.getMarkedMatches("selection").size(), expectedMatches, "Expected " + JSON.stringify(expectedMatches) + " selected matches on setting 3 crosslinks selection, Passed!");
    });

    QUnit.test("Match Selection testing", function (assert) {
        const expectedLinks = 2;
        const expectedMatches = 3;
        const crosslinks = clmsModel.get("crosslinks");
        const selectedMatches = d3.merge([crosslinks.get("P02768-A_415-P02768-A_497").matches_pp.slice(0, 1), crosslinks.get("P02768-A_190-P02768-A_425").matches_pp.slice(0, 2)]);
        model.setMarkedMatches("selection", selectedMatches, false, false, false);

        assert.deepEqual(model.getMarkedCrossLinks("selection").length, expectedLinks, "Expected " + JSON.stringify(expectedLinks) + " selected crosslinks on setting 3 matches selection, Passed!");
        assert.deepEqual(model.getMarkedMatches("selection").size(), expectedMatches, "Expected " + JSON.stringify(expectedMatches) + " selected matches on setting 3 matches selection, Passed!");
    });

    QUnit.test("Adding Cross-link selection to prior Cross-link Selection testing", function (assert) {
        const expectedLinkIDs = ["P02768-A_415-P02768-A_497", "P02768-A_190-P02768-A_425"].sort();
        const expectedMatches = 17;
        const crosslinks = clmsModel.get("crosslinks");

        let selectedLinks = [crosslinks.get("P02768-A_1-P02768-A_11"), crosslinks.get("P02768-A_415-P02768-A_497")];
        model.setMarkedCrossLinks("selection", selectedLinks, false, false, false);

        selectedLinks = [crosslinks.get("P02768-A_1-P02768-A_11"), crosslinks.get("P02768-A_190-P02768-A_425")];
        model.setMarkedCrossLinks("selection", selectedLinks, false, true, false);	// add to existing selection

        assert.deepEqual(_.pluck(model.getMarkedCrossLinks("selection"), "id").sort(), expectedLinkIDs, "Expected " + JSON.stringify(expectedLinkIDs) + " selected crosslinks, Passed!");
        assert.deepEqual(model.getMarkedMatches("selection").size(), expectedMatches, "Expected " + JSON.stringify(expectedMatches) + " selected matches, Passed!");
    });


    QUnit.test("Adding Match Selection to prior Match Selection testing", function (assert) {
        const expectedLinkIDs = ["P02768-A_415-P02768-A_497", "P02768-A_190-P02768-A_425"].sort();
        const expectedMatchIDs =
            [
                "204",
                "5",
                "70",
                "71"
            ].sort();
        const crosslinks = clmsModel.get("crosslinks");

        let selectedMatches = d3.merge([crosslinks.get("P02768-A_1-P02768-A_11").matches_pp.slice(0, 1), crosslinks.get("P02768-A_415-P02768-A_497").matches_pp.slice(0, 2), crosslinks.get("P02768-A_190-P02768-A_425").matches_pp.slice(0, 2)]);
        model.setMarkedMatches("selection", selectedMatches, false, false, false);

        selectedMatches = d3.merge([
            crosslinks.get("P02768-A_1-P02768-A_11").matches_pp.slice(0, 1),
            crosslinks.get("P02768-A_415-P02768-A_497").matches_pp.slice(0, 1),
            crosslinks.get("P02768-A_190-P02768-A_425").matches_pp.slice(1, 4)
        ]);
        model.setMarkedMatches("selection", selectedMatches, false, true, false);	// add to existing selection

        assert.deepEqual(_.pluck(model.getMarkedCrossLinks("selection"), "id").sort(), expectedLinkIDs, "Expected " + JSON.stringify(expectedLinkIDs) + " selected crosslinks, Passed!");
        assert.deepEqual(_.pluck(model.getMarkedMatches("selection").values(), "id").sort(), expectedMatchIDs, "Expected " + JSON.stringify(expectedMatchIDs) + " selected matches, Passed!");
    });


    QUnit.test("Adding Match Selection to prior Cross-link Selection testing", function (assert) {
        const expectedLinkIDs = ["P02768-A_415-P02768-A_497", "P02768-A_190-P02768-A_425"].sort();
        const expectedMatches = 4;	// Two of P02768-A_190-P02768-A_425 matches are marked rejected and don't pass filter
        const crosslinks = clmsModel.get("crosslinks");

        const selectedLinks = [crosslinks.get("P02768-A_1-P02768-A_11"), crosslinks.get("P02768-A_415-P02768-A_497")];
        model.setMarkedCrossLinks("selection", selectedLinks, false, false, false);

        const selectedMatches = d3.merge([
            crosslinks.get("P02768-A_1-P02768-A_11").matches_pp.slice(0, 1),
            crosslinks.get("P02768-A_415-P02768-A_497").matches_pp.slice(0, 1),
            crosslinks.get("P02768-A_190-P02768-A_425").matches_pp.slice(1, 4)
        ]);
        model.setMarkedMatches("selection", selectedMatches, false, true, false);	// add to existing selection

        assert.deepEqual(_.pluck(model.getMarkedCrossLinks("selection"), "id").sort(), expectedLinkIDs, "Expected " + JSON.stringify(expectedLinkIDs) + " selected crosslinks, Passed!");
        assert.deepEqual(model.getMarkedMatches("selection").size(), expectedMatches, "Expected " + JSON.stringify(expectedMatches) + " selected matches, Passed!");
    });

    QUnit.test("Adding Cross-Link Selection to prior Match Selection testing", function (assert) {
        const expectedLinkIDs = ["P02768-A_415-P02768-A_497", "P02768-A_190-P02768-A_425"].sort();
        const expectedMatches = 17;
        const crosslinks = clmsModel.get("crosslinks");

        const selectedMatches = d3.merge([crosslinks.get("P02768-A_1-P02768-A_11").matches_pp.slice(0, 1), crosslinks.get("P02768-A_415-P02768-A_497").matches_pp.slice(0, 2)]);
        model.setMarkedMatches("selection", selectedMatches, false, false, false);

        const selectedLinks = [crosslinks.get("P02768-A_1-P02768-A_11"), crosslinks.get("P02768-A_190-P02768-A_425")];
        model.setMarkedCrossLinks("selection", selectedLinks, false, true, false);	// add to existing selection

        assert.deepEqual(_.pluck(model.getMarkedCrossLinks("selection"), "id").sort(), expectedLinkIDs, "Expected " + JSON.stringify(expectedLinkIDs) + " selected crosslinks, Passed!");
        assert.deepEqual(model.getMarkedMatches("selection").size(), expectedMatches, "Expected " + JSON.stringify(expectedMatches) + " selected matches, Passed!");
    });

    QUnit.test("Adding no Cross-Links to prior Cross-link Selection testing", function (assert) {
        const crosslinks = clmsModel.get("crosslinks");
        const selectedLinks = [crosslinks.get("P02768-A_1-P02768-A_11"), crosslinks.get("P02768-A_415-P02768-A_497")];
        model.setMarkedCrossLinks("selection", selectedLinks, false, false, false);
        const expectedLinkIDs = _.pluck(model.getMarkedCrossLinks("selection"), "id").sort();
        const expectedMatchIDs = _.pluck(model.getMarkedMatches("selection").values(), "id").sort();

        model.setMarkedCrossLinks("selection", [], false, true, false);	// add to existing selection

        assert.deepEqual(_.pluck(model.getMarkedCrossLinks("selection"), "id").sort(), expectedLinkIDs, "Expected " + JSON.stringify(expectedLinkIDs) + " selected crosslinks, Passed!");
        assert.deepEqual(_.pluck(model.getMarkedMatches("selection").values(), "id").sort(), expectedMatchIDs, "Expected " + JSON.stringify(expectedMatchIDs) + " selected matches, Passed!");
    });

    QUnit.test("Adding no Matches to prior Match Selection testing", function (assert) {
        const crosslinks = clmsModel.get("crosslinks");
        const selectedMatches = d3.merge([crosslinks.get("P02768-A_1-P02768-A_11").matches_pp.slice(0, 1), crosslinks.get("P02768-A_415-P02768-A_497").matches_pp.slice(0, 1)]);
        model.setMarkedMatches("selection", selectedMatches, false, false, false);
        const expectedLinkIDs = _.pluck(model.getMarkedCrossLinks("selection"), "id").sort();
        const expectedMatchIDs = _.pluck(model.getMarkedMatches("selection").values(), "id").sort();

        model.setMarkedMatches("selection", [], false, true, false);	// add to existing selection

        assert.deepEqual(_.pluck(model.getMarkedCrossLinks("selection"), "id").sort(), expectedLinkIDs, "Expected " + JSON.stringify(expectedLinkIDs) + " selected crosslinks, Passed!");
        assert.deepEqual(_.pluck(model.getMarkedMatches("selection").values(), "id").sort(), expectedMatchIDs, "Expected " + JSON.stringify(expectedMatchIDs) + " selected matches, Passed!");
    });


    QUnit.module("Alignment Tests");


    QUnit.test("Scoring", function (assert) {
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
        assert.deepEqual(actualScores, expectedScores, "Expected " + JSON.stringify(expectedScores) + JSON.stringify(cigars) + JSON.stringify(fmts) + " when generating scores from bioseq32.js");
    });

    QUnit.test("Sequence generation from PDB chains", function (assert) {
        const expected = [
            {chainName: "A", chainIndex: 0, modelIndex: 0, residueOffset: 0, data: dseq1AO6, structureID: "1ao6"},
            {chainName: "B", chainIndex: 1, modelIndex: 0, residueOffset: 578, data: dseq1AO6, structureID: "1ao6"},
        ];

        const stageModel = window.compositeModelInst.get("stageModel");
        const actual = getChainSequencesFromNGLStage(stageModel.get("structureComp").stage);
        assert.deepEqual(actual, expected, "Expected " + JSON.stringify(expected) + " when generating sequences from `1AO6`");
    });


    QUnit.test("Matrix pairings", function (assert) {
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
        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as matrix pairing, Passed!");
    });


    QUnit.test("Align test", function (assert) {
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

        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as alignment result, Passed!");
    });


    QUnit.module("NGL Model Wrapper");

    QUnit.test("Divide protein to ngl chain mapping by intermediate model step", function (assert) {
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
        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " when mapping from " + JSON.stringify(data));
    });


    QUnit.module("NGL Selection Language");

    QUnit.test("Range Concatenation", function (assert) {
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

        examples.forEach(function (example) {
            const actualValue = joinConsecutiveNumbersIntoRanges(example.data);
            assert.deepEqual(actualValue, example.expected, "Expected " + example.expected + " when concatenating " + example.data);
        });
    });

    QUnit.test("Generate Nested Selection", function (assert) {

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
        assert.deepEqual(actualValue, expectedValue, "Expected " + expectedValue + " when mapping from " + JSON.stringify(data));

        actualValue = stageModel.getSelectionFromResidueList(data2);
        assert.deepEqual(actualValue, expectedValue2, "Expected " + expectedValue2 + " when mapping from " + JSON.stringify(data2));

        actualValue = stageModel.getSelectionFromResidueList(data2, {allAtoms: true});
        assert.deepEqual(actualValue, expectedValue3, "Expected " + expectedValue3 + " when mapping from " + JSON.stringify(data2) + " with option allAtoms");

        actualValue = stageModel.getSelectionFromResidueList(data2, {chainsOnly: true});
        assert.deepEqual(actualValue, expectedValue4, "Expected " + expectedValue4 + " when mapping from " + JSON.stringify(data2) + " with option chainsOnly");
    });

    QUnit.test("Get Chain Start Positions as Atom Indices (for label representation)", function (assert) {
        const stageModel = window.compositeModelInst.get("stageModel");
        const chainStartSele = stageModel.makeFirstAtomPerChainSelectionString(d3.set([0, 1]));
        const expectedValue = "@0,4599";
        assert.deepEqual(chainStartSele, expectedValue, "Expected " + expectedValue + " for chain start atom NGL selection, Passed!");
    });


    QUnit.test("Get Just Chain Selection", function (assert) {
        const stageModel = window.compositeModelInst.get("stageModel");
        const chainSele = stageModel.makeChainSelectionString({showAll: false, chainIndices: [0, 1]});
        const expectedValue = "(( /0 AND (:A OR :B) ) )";
        assert.deepEqual(chainSele, expectedValue, "Expected " + expectedValue + " for just chain selection, Passed!");
    });


    QUnit.module("3D Distances");

    QUnit.test("Mapping to PDB", function (assert) {
        const expectedMapping = [411, 493];

        const alignCollection = window.compositeModelInst.get("alignColl");
        const alignModel = alignCollection.get("P02768-A");
        const actualMapping = alignModel.bulkMapFromSearch("1AO6:A:0", [415, 497]);

        assert.deepEqual(actualMapping, expectedMapping, "Expected " + expectedMapping + " when mapping from [415,497] to 1ao6 pdb indices, Passed!");
    });

    QUnit.test("Mapping from PDB", function (assert) {
        const expectedMapping = [415, 497];

        const alignCollection = window.compositeModelInst.get("alignColl");
        const alignModel = alignCollection.get("P02768-A");
        const actualMapping = alignModel.bulkMapToSearch("1AO6:A:0", [411, 493]);

        assert.deepEqual(actualMapping, expectedMapping, "Expected " + expectedMapping + " when mapping from pdb [411, 493] back to search indices, Passed!");
    });

    QUnit.test("Chain Info", function (assert) {
        const expectedMapping = {viableChainIndices: [0, 1], resCount: 1156};

        const stageModel = window.compositeModelInst.get("stageModel");
        const actualMapping = stageModel.getChainInfo();

        assert.deepEqual(actualMapping, expectedMapping, "Expected " + JSON.stringify(expectedMapping) + " chain info, Passed!");
    });

    QUnit.test("C-Alpha Atom Selection String", function (assert) {
        const expectedMapping = ":A/0 AND 5-582.CA";

        const stageModel = window.compositeModelInst.get("stageModel");
        const chainProxy = stageModel.get("structureComp").structure.getChainProxy();
        chainProxy.index = 0;
        const actualMapping = getRangedCAlphaResidueSelectionForChain(chainProxy);

        assert.deepEqual(actualMapping, expectedMapping, "Expected " + expectedMapping + " NGL Selection String generated, Passed!");
    });

    QUnit.test("C-Alpha Atom Indices [last 20]", function (assert) {
        const expectedMapping = {
            0: [4455, 4463, 4472, 4481, 4488, 4494, 4505, 4510, 4519, 4528, 4532, 4541, 4550, 4558, 4565, 4570, 4575, 4581, 4590, 4595],
            1: [9054, 9062, 9071, 9080, 9087, 9093, 9104, 9109, 9118, 9127, 9131, 9140, 9149, 9157, 9164, 9169, 9174, 9180, 9189, 9194]
        };	// last 20 in each

        const stageModel = window.compositeModelInst.get("stageModel");
        const shortenThese = [0, 1];
        const actualMapping = $.extend({}, stageModel.calculateAllCaAtomIndices(shortenThese));	// copy object so as not to affect original (causes error)
        shortenThese.forEach(function (index) {
            actualMapping[index] = actualMapping[index].slice(-20);
        });

        assert.deepEqual(actualMapping, expectedMapping, "Expected " + JSON.stringify(expectedMapping) + " NGL C-Alpha atom indices, Passed!");
    });

    QUnit.test("Single Cross-Link Distance validated on NGLViewer", function (assert) {
        const crosslinks = clmsModel.get("crosslinks");
        const singleCrossLink = crosslinks.get("P02768-A_415-P02768-A_497");
        const expectedDistance = 9.13;	// as measured on nglviewer (2 decimal places)

        const stageModel = window.compositeModelInst.get("stageModel");
        // -5 cos 4 difference in pdb / search alignments, and another 1 because this function is 0-indexed.
        let actualDistance = stageModel.getSingleDistanceBetween2Residues(415 - 5, 497 - 5, 0, 0);	// 0 chain has slightly longer distance
        actualDistance = +(actualDistance.toFixed(2));

        assert.deepEqual(actualDistance, expectedDistance, "Expected " + expectedDistance + " distance (2 d.p.) for A chain 415-497 crosslink, Passed!");
    });

    QUnit.test("Same Cross-Link Distance, different indexing methods 1", function (assert) {
        const crosslinks = clmsModel.get("crosslinks");
        const singleCrossLink = crosslinks.get("P02768-A_415-P02768-A_497");
        const alignCollection = window.compositeModelInst.get("alignColl");

        // this will be shortest distance of chain possibilities - 0-0, 0-1, 1-0, 1-1
        const actualDistance = clmsModel.get("distancesObj").getXLinkDistance(singleCrossLink, alignCollection);

        const stageModel = window.compositeModelInst.get("stageModel");
        // -5 cos 4 difference in pdb / search alignments, and another 1 because this function is 0-indexed.
        const actualDistance2 = stageModel.getSingleDistanceBetween2Residues(415 - 5, 497 - 5, 1, 1);	// 1 appears to be shortest distance

        assert.deepEqual(actualDistance, actualDistance2, "Expected " + actualDistance2 + " distance in both methods (B chain 415-497 crosslink), Passed!");
    });


    QUnit.test("2 different functions for returning atom indices", function (assert) {
        const crosslinks = clmsModel.get("crosslinks");
        const singleCrossLink = crosslinks.get("P02768-A_415-P02768-A_497");
        const alignCollection = window.compositeModelInst.get("alignColl");

        // this will be shortest distance of chain possibilities - 0-0, 0-1, 1-0, 1-1
        const stageModel = window.compositeModelInst.get("stageModel");
        const cproxy = stageModel.get("structureComp").structure.getChainProxy();
        const atomIndexA = stageModel.getAtomIndex(0, 0); // residue 0-indexed here
        const resObj = {resno: 5, seqIndex: 0, chainIndex: 0};
        const atomIndexB = stageModel.getAtomIndexFromResidueObj(resObj, cproxy, new NGL.Selection()); // residue is NGL resno (5 resno = 0 seqIndex)

        assert.deepEqual(atomIndexA, atomIndexB, "Expected " + atomIndexA + " index in both methods (A chain 415 residue), Passed!");
    });


    QUnit.test("Compare Link-Only Distance Generation with All Distance Generation", function (assert) {
        const stageModel = window.compositeModelInst.get("stageModel");
        const crosslinks = stageModel.get("linkList");

        const matrices1 = stageModel.getChainDistances(true);
        const matrices2 = stageModel.getChainDistances(false);

        let list1 = [];
        let list2 = [];

        crosslinks.forEach(function (crosslink) {
            const chainIndex = crosslink.residueA.chainIndex + "-" + crosslink.residueB.chainIndex;
            list1.push(matrices1[chainIndex].distanceMatrix[crosslink.residueA.seqIndex][crosslink.residueB.seqIndex]);
            list2.push(matrices2[chainIndex].distanceMatrix[crosslink.residueA.seqIndex][crosslink.residueB.seqIndex]);
        });

        list1 = list1.map(function (v) {
            return v.toFixed(2);
        });
        list2 = list2.map(function (v) {
            return v.toFixed(2);
        });

        assert.deepEqual(list1, list2, "Expected " + list1.join(", ") + " distance (2 d.p.) for both link-only and all distance matrix link distances, Passed!");
    });


    QUnit.test("Compare Distances from Atom Coords with All Distance Generation", function (assert) {
        const stageModel = window.compositeModelInst.get("stageModel");
        const crosslinks = stageModel.get("linkList");

        const matrices1 = stageModel.getChainDistances(false); //this test will fail if the defualt value for AUTO in filtermodel is true, to make it pass you need to change this call's param to true - todo - wtf?
        let list1 = [];
        let list2 = [];

        const atoms = stageModel.getAllResidueCoordsForChain(0);

        crosslinks.forEach(function (crosslink) {
            const seqIndexA = crosslink.residueA.seqIndex;
            const seqIndexB = crosslink.residueB.seqIndex;
            list1.push(matrices1["0-0"].distanceMatrix[seqIndexA][seqIndexB]);
            const distanceSquared = getDistanceSquared(atoms[seqIndexA], atoms[seqIndexB]);
            list2.push(Math.sqrt(distanceSquared));
        });

        list1 = list1.map(function (v) {
            return v.toFixed(2);
        });
        list2 = list2.map(function (v) {
            return v.toFixed(2);
        });

        assert.deepEqual(list1, list2, "Expected " + list1.join(", ") + " distance (2 d.p.) for both link-only and all distance matrix link distances, Passed!");
    });


    QUnit.test("Octree test with negative match function", function (assert) {
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
        for (let n = 0; n < 64; n++) {
            const newPoint = {coords: [(n >> 4) & 3, (n >> 2) & 3, n & 3]};
            newPoint.chainIndex = (n === 4 ? 13 : 12);
            pointsA.push(newPoint);
        }

        const pointsB = [];
        for (let n = 0; n < 8; n++) {
            const newPoint = {coords: [((n >> 2) & 1) + 1.25, ((n >> 1) & 1) + 1.4, (n & 1) + 1.6]};
            newPoint.chainIndex = (n === 4 ? 12 : 13);
            pointsB.push(newPoint);
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
            [pointsA[parseInt("010", 4)], pointsB[4], odddist],
            [pointsA[parseInt(213, 4)], pointsB[5], cdist],
            [pointsA[parseInt(222, 4)], pointsB[6], cdist],
            [pointsA[parseInt(223, 4)], pointsB[7], cdist],
        ];

        const actual = getMinimumDistance(pointsA, pointsB, octAccessorObj, 200, octreeIgnoreFunc);
        actual.forEach(function (indRes) {
            indRes[2] = toNearest(indRes[2], 0.25);
        });

        assert.deepEqual(actual, expected, "Expected " + expected.join(", ") + " distance (2 d.p.) for both link-only and all distance matrix link distances, Passed!");
    });


    QUnit.test("Octree test with negative match function 2", function (assert) {
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
        actual.forEach(function (indRes) {
            indRes[2] = toNearest(indRes[2], 0.25);
        });

        assert.deepEqual(actual, expected, "Expected " + expected.join(", ") + " distance (2 d.p.) for both link-only and all distance matrix link distances, Passed!");
    });


    QUnit.module("Random Distance Generation");

    QUnit.test("Calc Distanceable Sequence MetaData", function (assert) {
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

        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as distanceable sequence metadata, Passed!");
    });


    QUnit.test("Include Terminal Indices", function (assert) {
        const expected = {ntermList: [], ctermList: []};	// because pdb for 1ao6 is within the larger sequence so neither cterm nor nterm match

        const alignCollBB = window.compositeModelInst.get("alignColl");
        const alignID = make3DAlignID("1AO6", "A", 0);
        const seqRange = alignCollBB.getRangeAsSearchSeq("P02768-A", alignID);
        $.extend(seqRange, {alignID: alignID, chainIndex: 0, protID: "P02768-A"});
        const seqMap = d3.map();
        seqMap.set("P02768-A", {key: "P02768-A", values: [seqRange]});
        const alignedTerminalIndices = clmsModel.get("distancesObj").calcAlignedTerminalIndices(seqMap, clmsModel, alignCollBB);
        assert.deepEqual(alignedTerminalIndices, expected, "Expected " + JSON.stringify(expected) + " as end terminals out of PDB range, Passed!");
    });

    QUnit.test("Filter Sequence By Residue Set = I and W", function (assert) {
        const expectedValue = [20, 137, 209, 259, 266, 285, 383, 508, 518];
        const actualValue = filterSequenceByResidueSet(dseq1AO6, new d3.set(["I", "W"]));

        // stringify turns undefined to null for printout, but it's a match
        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as filtered residue indices, Passed!");
    });

    QUnit.test("Filter Sequence By Residue Set = All", function (assert) {
        const expectedValue = d3.range(0, dseq1AO6.length);
        const actualValue = filterSequenceByResidueSet(dseq1AO6, null, true);

        // stringify turns undefined to null for printout, but it's a match
        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as filtered residue indices, Passed!");
    });


    QUnit.test("Filter Multiple Sequences by Cross-Linkable Specificity Setting", function (assert) {
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

        assert.deepEqual(actualFilteredSubSeqIndices, expected, "Expected " + expected.join(", ") + " as last 10 KSTY cross-linkable filtered sequence indices, Passed!");


        actualFilteredSubSeqIndices = filterSequenceByResidueSet(seqRange.subSeq, linkableResidues[0], false);	// 0 is everything

        assert.deepEqual(actualFilteredSubSeqIndices, expected2, "Expected " + expected2.join(", ") + " as everything cross-linkable filtered sequence indices, Passed!");
    });


    QUnit.test("Calc Filtered Residue Points from Cross-linker Specificity", function (assert) {
        let expectedValue = [535, 536, 540, 552, 555, 559, 561, 568, 569, 574];	// last 10 KSTY
        expectedValue = expectedValue.map(function (v) {
            return {chainIndex: 1, protID: "P02768-A", seqIndex: v + 1, searchIndex: v + 5};	// seqIndex 1-indexed, sdearchIndex 4 on from that, last 10 residues will be chain 1
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

        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as last 10 KSTY cross-linkable filtered residue points, Passed!");
    });


    QUnit.test("Sample Distance Generation, 1 Search, rounded to nearest integer", function (assert) {
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
        distObj.generateSampleDistancesBySearch(filteredResidueMap[0], filteredResidueMap[1], sampleDists, {linksPerSearch: 100});
        const actualValue = sampleDists.map(Math.round);

        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as sampled distances, Passed!");
    });


    QUnit.test("Sample Distance Generation, 1 Search, restricted to same protein id (dimer / full search equivalent), rounded to nearest integer", function (assert) {
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
        distObj.generateSubDividedSampleDistancesBySearch(filteredResidueMap, sampleDists, options);
        const actualValue = sampleDists.map(Math.round);

        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as sampled distances, Passed!");
    });


    QUnit.test("Sample Distance Generation, 1 Search, restricted to same chain (monomer equivalent), rounded to nearest integer", function (assert) {
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
        distObj.generateSubDividedSampleDistancesBySearch(filteredResidueMap, sampleDists, options);
        const actualValue = sampleDists.map(Math.round);

        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as sampled distances, Passed!");
    });


    QUnit.test("Sample Distance Generation, 1 Search, restricted to same model index (artificially set to make monomer equivalent), rounded to nearest integer", function (assert) {
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
        distObj.generateSubDividedSampleDistancesBySearch(filteredResidueMap, sampleDists, options, cimimap);
        const actualValue = sampleDists.map(Math.round);

        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as sampled distances, Passed!");
    });


    QUnit.test("Sample Distance Generation, 1 Search, 2 different models, but inter-model distance flag set to true, rounded to nearest integer", function (assert) {
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
        distObj.generateSubDividedSampleDistancesBySearch(filteredResidueMap, sampleDists, options, cimimap);
        const actualValue = sampleDists.map(Math.round);

        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as sampled distances, Passed!");
    });

    QUnit.test("Run through DistancesObj right from getSampleDistances, 1 Search, restricted to same chain (monomer equivalent), rounded to nearest integer", function (assert) {
        const expectedValue = [28, 33, 39, 50, 47, 55, 28, 10, 27, 46, 47, 40, 38, 44, 39, 34, 36, 64, 34, 29, 13, 20, 20, 28, 40, 34, 46, 43, 35, 20, 18, 18, 22, 50, 51, 24, 26, 47, 37, 29, 31, 60, 32, 35, 56, 47, 36, 31, 28, 34, 39, 50, 47, 56, 29, 10, 27, 46, 47, 39, 38, 45, 39, 35, 36, 65, 34, 29, 13, 20, 21, 28, 40, 34, 46, 43, 35, 21, 18, 18, 22, 50, 51, 24, 25, 47, 38, 29, 31, 60, 32, 35, 56, 48, 36, 31];


        const searchArray = Array.from(clmsModel.get("searches").values());
        const crosslinkerSpecificityList = d3.values(crosslinkerSpecificityPerLinker(searchArray));
        const distObj = clmsModel.get("distancesObj");

        const sampleDists = distObj.getSampleDistances(100, crosslinkerSpecificityList, {
            withinProtein: true,
            withinChain: true
        });
        const actualValue = sampleDists.map(Math.round);

        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as sampled distances, Passed!");
    });


    QUnit.test("Run through DistancesObj right from getSampleDistances, no crosslinker specified, 1 Search, restricted to same model (artifically set, to make monomer equivalent), rounded to nearest integer", function (assert) {
        const expectedValue = [28, 44, 13, 43, 51, 60, 28, 44, 24, 44, 29, 35, 44, 44, 37, 49, 51, 55, 13, 24, 37, 30, 41, 51, 43, 44, 49, 30, 38, 48, 51, 29, 51, 41, 38, 11, 60, 35, 55, 51, 48, 11, 29, 45, 13, 43, 51, 60, 29, 44, 25, 44, 29, 35, 45, 44, 38, 49, 51, 55, 13, 25, 38, 30, 41, 50, 43, 44, 49, 30, 38, 48, 51, 29, 51, 41, 38, 11, 60, 35, 55, 50, 48, 11];

        const crossSpec = clmsModel.get("crosslinkerSpecificity");
        clmsModel.set("crosslinkerSpecificity", null);	// null crosslink specificity for this test
        const searchArray = Array.from(clmsModel.get("searches").values());
        const crosslinkerSpecificityList = d3.values(crosslinkerSpecificityPerLinker(searchArray));
        const distObj = clmsModel.get("distancesObj");

        const sampleDists = distObj.getSampleDistances(100, crosslinkerSpecificityList, {
            withinProtein: true,
            withinChain: true
        });
        const actualValue = sampleDists.map(Math.round);

        clmsModel.set("crosslinkerSpecificity", crossSpec);	// restore crosslink specs

        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as sampled distances, Passed!");
    });

    QUnit.module("Model Utils Functions");

    QUnit.test("Get max score of crosslink matches", function (assert) {
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

        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as highest score, Passed!");
    });


    QUnit.test("Index same sequences to first occurence", function (assert) {
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
        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as index array, Passed!");
    });

    QUnit.test("Filter repeated Sequences", function (assert) {
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
        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as repeated sequence result, Passed!");
    });


    QUnit.test("Reinflate sequence map", function (assert) {
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
        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as reinflated sequence result, Passed!");
    });


    QUnit.test("Crosslink count per protein pairing", function (assert) {
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
        d3.values(actualValue).forEach(function (pairing) {	// do this as otherwise stringify will kick off about circular structures, so just match ids
            pairing.fromProtein = pairing.fromProtein.id;
            pairing.toProtein = pairing.toProtein.id;
            pairing.crosslinks = _.pluck(pairing.crosslinks, "id");
        });

        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as crosslink protein pairing value, Passed!");
    });


    QUnit.test("Legal accession ID Filter", function (assert) {
        const interactors = [
            {is_decoy: true, accession: "Q10276"},  // is decoy, good accession
            {is_decoy: false, accession: "P12345"}, // good accession
            {is_decoy: false, accession: "GIBBER"}, // bad accession
            {is_decoy: false, accession: "A0A022YWF9"},   // good accession
            {is_decoy: false, accession: "WH&T"},   // bad accession
        ];
        const expectedValue = ["P12345", "A0A022YWF9"];
        const actualValue = getLegalAccessionIDs(interactors);

        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as crosslink protein pairing value, Passed!");
    });


    QUnit.test("Merge contiguous features", function (assert) {
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
        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as contiguous feature ranges, Passed!");
    });


    QUnit.test("Radix sort", function (assert) {
        const testArr = [2, 4, 6, 6, 3, 2, 1, 4, 2, 4, 6, 8, 1, 2, 4, 6, 9, 0];
        const expectedValue = [0, 1, 1, 2, 2, 2, 2, 3, 4, 4, 4, 4, 6, 6, 6, 6, 8, 9];
        const actualValue = radixSort(10, testArr, function (d) {
            return d;
        });

        // stringify turns undefined to null for printout, but it's a match
        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as sorted by radix, Passed!");
    });


    QUnit.test("Parse URL Query String", function (assert) {
        const testString = "sid=10003-secret&decoys=1&unval=1&linear=1&cats=true&anon=";
        const expectedValue = {sid: "10003-secret", decoys: 1, unval: 1, linear: 1, cats: true, anon: ""};
        const actualValue = parseURLQueryString(testString);

        // stringify turns undefined to null for printout, but it's a match
        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as parsed URL query string, Passed!");
    });


    QUnit.test("Make URL Query String", function (assert) {
        const testObj = {sid: "10003-secret", decoys: 1, unval: 1, linear: 1, cats: true, anon: ""};
        const expectedValue = ["sid=10003-secret", "decoys=1", "unval=1", "linear=1", "cats=1", "anon="];	// true gets turned to 1, false to 0
        const actualValue = makeURLQueryPairs(testObj, "");

        // stringify turns undefined to null for printout, but it's a match
        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as constructed URL query string, Passed!");
    });


    QUnit.module("Metadata parsing testing");


    QUnit.test("Update Protein Metadata", function (assert) {
        const expectedValue = {
            columns: ["proteinid", "cat", "dog"],
            items: clmsModel.get("participants"),
            matchedItemCount: 1
        };
        window.vent.listenToOnce(window.vent, "proteinMetadataUpdated", function (actualValue) {
            assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as proteinmetadata event data, Passed!");

            const actualValue2 = clmsModel.get("participants").get("P02768-A").getMeta();
            const expectedValue2 = {proteinid: "P02768-A", cat: 2, dog: 4};
            assert.deepEqual(actualValue2, expectedValue2, "Expected " + JSON.stringify(expectedValue2) + " as protein meta value, Passed!");
        });

        const fileContents = "ProteinID,cat,dog\nP02768-A,2,4\n";
        updateProteinMetadata(fileContents, clmsModel);
    });


    QUnit.test("Update Crosslink Metadata", function (assert) {
        const expectedValue = {
            columns: ["cat", "dog"],
            columnTypes: {cat: "numeric", dog: "numeric"},
            items: clmsModel.get("crosslinks"),
            matchedItemCount: 2,
            ppiCount: 2
        };
        window.vent.listenToOnce(window.vent, "linkMetadataUpdated", function (actualValue) {
            console.log("CLLCC2", clmsModel, clmsModel.get("crosslinks"));
            assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as linkmetadata event data, Passed!");

            const actualValue2 = $.extend({}, clmsModel.get("crosslinks").get("P02768-A_415-P02768-A_497").getMeta());
            delete actualValue2.distance;
            const expectedValue2 = {cat: 2, dog: 4};
            assert.deepEqual(actualValue2, expectedValue2, "Expected " + JSON.stringify(expectedValue2) + " as link meta value, Passed!");
        });

        const fileContents = "Protein 1,SeqPos 1,Protein 2,SeqPos 2,cat,dog\n"
            + "ALBU,415,ALBU,497,2,4\n"
            + "ALBU,190,ALBU,425,3,5\n";
        updateLinkMetadata(fileContents, clmsModel);
    });


    QUnit.test("Parse User Annotations", function (assert) {
        model.get("filterModel")
            .resetFilter();
        window.vent.listenToOnce(window.vent, "userAnnotationsUpdated", function (actualValue) {
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

            assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as passed userAnnotations value, Passed!");

            const annotColl = model.get("annotationTypes");
            expectedValue = expectedAnnotationTypes;
            expectedValue.forEach(function (type) {
                type.id = annotColl.modelId(type);
                type.shown = false;
            });
            // sort array by id, like collection is
            expectedValue.sort(function (a, b) {
                return a.id.localeCompare(b.id);
            });

            const modelsFromCollection = annotColl.where({category: "User Defined"});
            actualValue = modelsFromCollection.map(function (model) {
                return model.toJSON();
            });

            assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as generated userAnnotation Models, Passed!");


        });

        const input = "ProteinID,AnnotName,StartRes,EndRes,Color\r\nP02768-A,Helix,10,20,blue\r\nP02768-A,Strand,20,30,yellow\r\nP02768-A,Helix,40,70,red\r\nP02768-A,Sheet,100,120,red\r\n";
        updateUserAnnotationsMetadata(input, clmsModel);
    });


    QUnit.module("STRING utils testing");

    QUnit.test("Compress/Decompress Small", function (assert) {

        const str = "\"Protein1\",\"SeqPos1\",\"LinkedRes1\",\"Protein2\",\"SeqPos2\",\"LinkedRes2\",\"Highest Score\",\"Match Count\",\"DecoyType\",\"AutoValidated\",\"Validated\",\"Link FDR\",\"3D Distance\",\"From Chain\",\"To Chain\",\"PDB SeqPos 1\",\"PDB SeqPos 2\",\"Search_10003\",\"cat\",\"dog\"\r\n\"sp|P02768-A|ALBU\",\"415\",\"V\",\"sp|P02768-A|ALBU\",\"497\",\"Y\",\"19.0000\",\"2\",\"TT\",\"true\",\"B,B\",\"\",\"8.79\",\"B\",\"B\",\"411\",\"493\",\"X\",\"2\",\"4\"\r\n\"sp|P02768-A|ALBU\",\"190\",\"K\",\"sp|P02768-A|ALBU\",\"425\",\"E\",\"17.3400\",\"4\",\"TT\",\"true\",\"A,C,A,A\",\"\",\"12.07\",\"B\",\"B\",\"186\",\"421\",\"X\",\"3\",\"5\"\r\n\"sp|P02768-A|ALBU\",\"125\",\"T\",\"sp|P02768-A|ALBU\",\"161\",\"Y\",\"17.3200\",\"1\",\"TT\",\"true\",\"C\",\"\",\"15.26\",\"A\",\"A\",\"121\",\"157\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"131\",\"E\",\"sp|P02768-A|ALBU\",\"162\",\"K\",\"17.0300\",\"1\",\"TT\",\"true\",\"?\",\"\",\"8.30\",\"A\",\"A\",\"127\",\"158\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"107\",\"D\",\"sp|P02768-A|ALBU\",\"466\",\"K\",\"13.9400\",\"1\",\"TT\",\"true\",\"B\",\"\",\"8.37\",\"B\",\"B\",\"103\",\"462\",\"X\",\"\",\"\"\r\n";

        const expectedValue = str;
        const actualValue = STRINGUtils.lzw_decode(STRINGUtils.lzw_encode(str));

        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as compressed then decompressed small string, Passed!");
    });


    QUnit.test("Compress/Decompress Large", function (assert) {


        const animals = ["ant", "bat", "cat", "dog", "eel", "fox", "gnu", "hen", "iguana", "jay", "kestrel", "llama"];
        let str = "";
        for (let n = 0; n < 600000; n++) {
            str += animals[n % animals.length] + String.fromCharCode(n % 256);
        }

        const expectedValue = str;
        const actualValue = STRINGUtils.lzw_decode(STRINGUtils.lzw_encode(str));

        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue.slice(-200)) + " as compressed then decompressed large string, Passed!");
    });

    QUnit.module("File download string generation");

    QUnit.test("Residues CSV", function (assert) {
        model.get("filterModel")
            .resetFilter()
            .set({AUTO: false});
        const expectedValue = `"Residue(s)","Occurences(in_unique_links)"\r\n"D-L","1"\r\n"A-K","13"\r\n"C-K","6"\r\n"K-L","15"\r\n"E-K","17"\r\n"K-V","12"\r\n"F-K","13"\r\n"L-Y","3"\r\n"E-Y","6"\r\n"V-Y","3"\r\n"K-N","5"\r\n"P-T","4"\r\n"G-S","2"\r\n"K-S","3"\r\n"H-S","1"\r\n"H-K","2"\r\n"F-S","1"\r\n"L-T","1"\r\n"G-T","2"\r\n"A-Y","3"\r\n"C-T","1"\r\n"K-R","1"\r\n"E-S","2"\r\n"D-K","9"\r\n"C-S","1"\r\n"D-F","1"\r\n"K-T","4"\r\n"L-S","1"\r\n"H-T","1"\r\n"D-V","1"\r\n"A-D","1"\r\n"D-D","1"\r\n"D-E","1"\r\n"K-K","2"\r\n"T-V","1"\r\n"R-S","1"\r\n"F-Y","1"\r\n"C-Y","2"\r\n"D-T","2"\r\n"K-M","1"\r\n"P-Y","3"\r\n"D-S","1"\r\n"Q-T","1"\r\n"K-Y","3"\r\n"F-T","2"\r\n"T-Y","1"\r\n"K-Q","1"\r\n"I-S","1"\r\n"M-Y","1"\r\n"D","19"\r\n"L","21"\r\n"A","17"\r\n"K","109"\r\n"C","10"\r\n"E","26"\r\n"V","17"\r\n"F","18"\r\n"Y","26"\r\n"N","5"\r\n"P","7"\r\n"T","20"\r\n"G","4"\r\n"S","14"\r\n"H","4"\r\n"R","2"\r\n"M","2"\r\n"Q","2"\r\n"I","1"\r\n`;
        const actualValue = getResidueCount();

        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as Residues CSV, Passed!");

        model.get("filterModel").resetFilter();
    });

    QUnit.test("Links CSV", function (assert) {
        model.get("filterModel")
            .resetFilter().set({pepLength: 6});
        const expectedValue = "\"Protein1\",\"SeqPos1\",\"LinkedRes1\",\"Protein2\",\"SeqPos2\",\"LinkedRes2\",\"Highest Score\",\"Match Count\",\"DecoyType\",\"Self\",\"AutoValidated\",\"Validated\",\"Link FDR\",\"3D Distance\",\"From Chain\",\"To Chain\",\"Search_24070\",\"cat\",\"dog\"\r\n\"sp|P02768-A|ALBU\",\"1\",\"D\",\"sp|P02768-A|ALBU\",\"14\",\"L\",\"8.8900\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"\",\"\",\"\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"210\",\"A\",\"sp|P02768-A|ALBU\",\"212\",\"K\",\"8.5600\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"70.52\",\"B\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"476\",\"C\",\"sp|P02768-A|ALBU\",\"564\",\"K\",\"11.2000\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"49.32\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"151\",\"A\",\"sp|P02768-A|ALBU\",\"199\",\"K\",\"13.0000\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"13.26\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"182\",\"L\",\"sp|P02768-A|ALBU\",\"199\",\"K\",\"10.5100\",\"4\",\"TT\",\"true\",\"false\",\",,,\",\"\",\"25.91\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"190\",\"K\",\"sp|P02768-A|ALBU\",\"425\",\"E\",\"17.3400\",\"15\",\"TT\",\"true\",\"false\",\",,,,,,,,,,,,,,\",\"\",\"12.07\",\"B\",\"B\",\"X\",\"3\",\"5\"\r\n\"sp|P02768-A|ALBU\",\"190\",\"K\",\"sp|P02768-A|ALBU\",\"424\",\"V\",\"13.0900\",\"6\",\"TT\",\"true\",\"false\",\",,,,,\",\"\",\"15.75\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"11\",\"F\",\"sp|P02768-A|ALBU\",\"162\",\"K\",\"9.5700\",\"3\",\"TT\",\"true\",\"false\",\",,\",\"\",\"22.83\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"351\",\"K\",\"sp|P02768-A|ALBU\",\"476\",\"C\",\"10.0500\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"17.24\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"190\",\"K\",\"sp|P02768-A|ALBU\",\"433\",\"V\",\"8.2400\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"14.51\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"182\",\"L\",\"sp|P02768-A|ALBU\",\"432\",\"K\",\"8.3000\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"19.62\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"148\",\"Y\",\"sp|P02768-A|ALBU\",\"198\",\"L\",\"12.0400\",\"4\",\"TT\",\"true\",\"false\",\",,,\",\"\",\"9.35\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"16\",\"E\",\"sp|P02768-A|ALBU\",\"161\",\"Y\",\"13.3500\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"19.91\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"341\",\"Y\",\"sp|P02768-A|ALBU\",\"373\",\"V\",\"11.7100\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"17.52\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"190\",\"K\",\"sp|P02768-A|ALBU\",\"426\",\"V\",\"13.4200\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"12.67\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"12\",\"K\",\"sp|P02768-A|ALBU\",\"164\",\"A\",\"7.8800\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"28.83\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"425\",\"E\",\"sp|P02768-A|ALBU\",\"432\",\"K\",\"11.5600\",\"11\",\"TT\",\"true\",\"false\",\",,,,,,,,,,\",\"\",\"10.81\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"205\",\"K\",\"sp|P02768-A|ALBU\",\"211\",\"F\",\"10.4500\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"10.22\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"414\",\"K\",\"sp|P02768-A|ALBU\",\"415\",\"V\",\"9.9000\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"64.11\",\"B\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"475\",\"K\",\"sp|P02768-A|ALBU\",\"498\",\"V\",\"11.5100\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"19.83\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"155\",\"L\",\"sp|P02768-A|ALBU\",\"199\",\"K\",\"11.4600\",\"3\",\"TT\",\"true\",\"false\",\",,\",\"\",\"18.68\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"93\",\"K\",\"sp|P02768-A|ALBU\",\"99\",\"N\",\"13.0800\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"8.85\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"499\",\"P\",\"sp|P02768-A|ALBU\",\"508\",\"T\",\"9.6800\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"19.59\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"262\",\"K\",\"sp|P02768-A|ALBU\",\"395\",\"F\",\"11.2500\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"35.79\",\"B\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"505\",\"E\",\"sp|P02768-A|ALBU\",\"519\",\"K\",\"10.4600\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"48.92\",\"A\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"191\",\"A\",\"sp|P02768-A|ALBU\",\"199\",\"K\",\"8.3000\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"12.95\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"189\",\"G\",\"sp|P02768-A|ALBU\",\"192\",\"S\",\"13.1100\",\"3\",\"TT\",\"true\",\"false\",\",,\",\"\",\"5.15\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"212\",\"K\",\"sp|P02768-A|ALBU\",\"232\",\"S\",\"12.5600\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"8.93\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"5\",\"S\",\"sp|P02768-A|ALBU\",\"11\",\"F\",\"9.2900\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"9.91\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"190\",\"K\",\"sp|P02768-A|ALBU\",\"469\",\"V\",\"7.6000\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"25.25\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"68\",\"T\",\"sp|P02768-A|ALBU\",\"74\",\"L\",\"9.0700\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"9.88\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"71\",\"G\",\"sp|P02768-A|ALBU\",\"76\",\"T\",\"8.5000\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"8.49\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"474\",\"T\",\"sp|P02768-A|ALBU\",\"476\",\"C\",\"10.3500\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"5.70\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"209\",\"R\",\"sp|P02768-A|ALBU\",\"351\",\"K\",\"15.9200\",\"5\",\"TT\",\"true\",\"false\",\",,,,\",\"\",\"12.29\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"208\",\"E\",\"sp|P02768-A|ALBU\",\"351\",\"K\",\"12.2000\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"15.63\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"206\",\"F\",\"sp|P02768-A|ALBU\",\"351\",\"K\",\"9.7100\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"14.41\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"210\",\"A\",\"sp|P02768-A|ALBU\",\"351\",\"K\",\"12.0300\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"10.98\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"5\",\"S\",\"sp|P02768-A|ALBU\",\"57\",\"E\",\"9.9400\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"5.60\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"340\",\"D\",\"sp|P02768-A|ALBU\",\"444\",\"K\",\"11.2900\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"5.92\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"435\",\"S\",\"sp|P02768-A|ALBU\",\"437\",\"C\",\"10.7200\",\"5\",\"TT\",\"true\",\"false\",\",,,,\",\"\",\"5.77\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"338\",\"H\",\"sp|P02768-A|ALBU\",\"432\",\"K\",\"9.3100\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"24.73\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"1\",\"D\",\"sp|P02768-A|ALBU\",\"12\",\"K\",\"11.5800\",\"3\",\"TT\",\"true\",\"false\",\",,\",\"\",\"\",\"\",\"\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"1\",\"D\",\"sp|P02768-A|ALBU\",\"11\",\"F\",\"8.8200\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"\",\"\",\"\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"420\",\"T\",\"sp|P02768-A|ALBU\",\"432\",\"K\",\"7.4100\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"18.22\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"395\",\"F\",\"sp|P02768-A|ALBU\",\"432\",\"K\",\"8.6400\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"9.63\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"546\",\"A\",\"sp|P02768-A|ALBU\",\"574\",\"K\",\"9.8300\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"16.80\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"525\",\"K\",\"sp|P02768-A|ALBU\",\"546\",\"A\",\"10.4100\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"12.50\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"193\",\"S\",\"sp|P02768-A|ALBU\",\"199\",\"K\",\"9.1500\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"10.05\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"192\",\"S\",\"sp|P02768-A|ALBU\",\"198\",\"L\",\"8.3100\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"10.07\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"338\",\"H\",\"sp|P02768-A|ALBU\",\"478\",\"T\",\"8.1900\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"27.86\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"13\",\"D\",\"sp|P02768-A|ALBU\",\"162\",\"K\",\"10.1100\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"23.08\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"4\",\"K\",\"sp|P02768-A|ALBU\",\"54\",\"V\",\"11.6600\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"\",\"\",\"\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"571\",\"E\",\"sp|P02768-A|ALBU\",\"574\",\"K\",\"10.7700\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"5.12\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"394\",\"L\",\"sp|P02768-A|ALBU\",\"439\",\"K\",\"9.1100\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"13.26\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"157\",\"F\",\"sp|P02768-A|ALBU\",\"199\",\"K\",\"11.9500\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"19.18\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"12\",\"K\",\"sp|P02768-A|ALBU\",\"54\",\"V\",\"8.2900\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"7.47\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"12\",\"K\",\"sp|P02768-A|ALBU\",\"55\",\"A\",\"9.7400\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"10.78\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"1\",\"D\",\"sp|P02768-A|ALBU\",\"54\",\"V\",\"10.7300\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"\",\"\",\"\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"497\",\"Y\",\"sp|P02768-A|ALBU\",\"539\",\"A\",\"8.2600\",\"3\",\"TT\",\"true\",\"false\",\",,\",\"\",\"13.17\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"1\",\"D\",\"sp|P02768-A|ALBU\",\"55\",\"A\",\"11.5500\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"\",\"\",\"\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"1\",\"D\",\"sp|P02768-A|ALBU\",\"56\",\"D\",\"12.4500\",\"4\",\"TT\",\"true\",\"false\",\",,,\",\"\",\"\",\"\",\"\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"1\",\"D\",\"sp|P02768-A|ALBU\",\"57\",\"E\",\"10.4600\",\"3\",\"TT\",\"true\",\"false\",\",,\",\"\",\"\",\"\",\"\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"137\",\"K\",\"sp|P02768-A|ALBU\",\"162\",\"K\",\"8.9300\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"11.91\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"423\",\"L\",\"sp|P02768-A|ALBU\",\"432\",\"K\",\"11.9300\",\"3\",\"TT\",\"true\",\"false\",\",,\",\"\",\"14.21\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"13\",\"D\",\"sp|P02768-A|ALBU\",\"159\",\"K\",\"12.4700\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"18.98\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"17\",\"E\",\"sp|P02768-A|ALBU\",\"159\",\"K\",\"12.7400\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"11.85\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"18\",\"N\",\"sp|P02768-A|ALBU\",\"159\",\"K\",\"9.7900\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"11.13\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"239\",\"T\",\"sp|P02768-A|ALBU\",\"241\",\"V\",\"13.9900\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"5.23\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"212\",\"K\",\"sp|P02768-A|ALBU\",\"351\",\"K\",\"11.5300\",\"3\",\"TT\",\"true\",\"false\",\",,\",\"\",\"13.36\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"14\",\"L\",\"sp|P02768-A|ALBU\",\"162\",\"K\",\"12.7200\",\"3\",\"TT\",\"true\",\"false\",\",,\",\"\",\"19.45\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"154\",\"L\",\"sp|P02768-A|ALBU\",\"199\",\"K\",\"10.7700\",\"3\",\"TT\",\"true\",\"false\",\",,\",\"\",\"15.79\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"190\",\"K\",\"sp|P02768-A|ALBU\",\"203\",\"L\",\"10.8000\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"20.19\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"193\",\"S\",\"sp|P02768-A|ALBU\",\"197\",\"R\",\"11.7400\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"6.05\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"11\",\"F\",\"sp|P02768-A|ALBU\",\"161\",\"Y\",\"10.2400\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"23.98\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"12\",\"K\",\"sp|P02768-A|ALBU\",\"163\",\"A\",\"8.4900\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"25.64\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"415\",\"V\",\"sp|P02768-A|ALBU\",\"432\",\"K\",\"9.2700\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"19.69\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"341\",\"Y\",\"sp|P02768-A|ALBU\",\"361\",\"C\",\"15.7300\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"27.38\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"189\",\"G\",\"sp|P02768-A|ALBU\",\"422\",\"T\",\"12.3200\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"18.90\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"42\",\"L\",\"sp|P02768-A|ALBU\",\"73\",\"K\",\"14.6900\",\"6\",\"TT\",\"true\",\"false\",\",,,,,\",\"\",\"6.40\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"44\",\"N\",\"sp|P02768-A|ALBU\",\"73\",\"K\",\"13.0500\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"10.81\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"45\",\"E\",\"sp|P02768-A|ALBU\",\"73\",\"K\",\"13.4000\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"8.45\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"14\",\"L\",\"sp|P02768-A|ALBU\",\"159\",\"K\",\"12.0900\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"15.46\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"324\",\"D\",\"sp|P02768-A|ALBU\",\"355\",\"T\",\"9.8600\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"12.68\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"548\",\"M\",\"sp|P02768-A|ALBU\",\"560\",\"K\",\"11.3900\",\"4\",\"TT\",\"true\",\"false\",\",,,\",\"\",\"19.25\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"11\",\"F\",\"sp|P02768-A|ALBU\",\"159\",\"K\",\"10.9000\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"19.53\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"323\",\"K\",\"sp|P02768-A|ALBU\",\"357\",\"L\",\"9.0600\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"9.72\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"557\",\"K\",\"sp|P02768-A|ALBU\",\"570\",\"E\",\"11.9500\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"12.57\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"496\",\"T\",\"sp|P02768-A|ALBU\",\"537\",\"P\",\"8.4800\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"11.23\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"497\",\"Y\",\"sp|P02768-A|ALBU\",\"537\",\"P\",\"10.5500\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"8.59\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"504\",\"A\",\"sp|P02768-A|ALBU\",\"525\",\"K\",\"11.3000\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"15.63\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"190\",\"K\",\"sp|P02768-A|ALBU\",\"427\",\"S\",\"8.6700\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"15.06\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"54\",\"V\",\"sp|P02768-A|ALBU\",\"73\",\"K\",\"13.1400\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"19.28\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"63\",\"D\",\"sp|P02768-A|ALBU\",\"65\",\"S\",\"13.1700\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"6.60\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"402\",\"K\",\"sp|P02768-A|ALBU\",\"429\",\"N\",\"10.2800\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"12.83\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"556\",\"E\",\"sp|P02768-A|ALBU\",\"564\",\"K\",\"9.3700\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"15.70\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"415\",\"V\",\"sp|P02768-A|ALBU\",\"497\",\"Y\",\"19.0000\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"8.79\",\"B\",\"B\",\"X\",\"2\",\"4\"\r\n\"sp|P02768-A|ALBU\",\"37\",\"E\",\"sp|P02768-A|ALBU\",\"137\",\"K\",\"12.6900\",\"3\",\"TT\",\"true\",\"false\",\",,\",\"\",\"9.35\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"13\",\"D\",\"sp|P02768-A|ALBU\",\"51\",\"K\",\"11.4300\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"12.88\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"323\",\"K\",\"sp|P02768-A|ALBU\",\"354\",\"E\",\"10.9900\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"8.74\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"322\",\"A\",\"sp|P02768-A|ALBU\",\"351\",\"K\",\"11.2100\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"15.90\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"154\",\"L\",\"sp|P02768-A|ALBU\",\"161\",\"Y\",\"12.6200\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"10.25\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"512\",\"D\",\"sp|P02768-A|ALBU\",\"527\",\"T\",\"9.1100\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"16.25\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"506\",\"T\",\"sp|P02768-A|ALBU\",\"526\",\"Q\",\"10.6900\",\"3\",\"TT\",\"true\",\"false\",\",,\",\"\",\"12.64\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"505\",\"E\",\"sp|P02768-A|ALBU\",\"525\",\"K\",\"11.7900\",\"4\",\"TT\",\"true\",\"false\",\",,,\",\"\",\"14.99\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"135\",\"L\",\"sp|P02768-A|ALBU\",\"138\",\"Y\",\"10.0500\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"4.88\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"11\",\"F\",\"sp|P02768-A|ALBU\",\"64\",\"K\",\"11.1100\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"13.99\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"136\",\"K\",\"sp|P02768-A|ALBU\",\"138\",\"Y\",\"9.8000\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"5.20\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"182\",\"L\",\"sp|P02768-A|ALBU\",\"190\",\"K\",\"12.7000\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"28.27\",\"B\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"416\",\"P\",\"sp|P02768-A|ALBU\",\"497\",\"Y\",\"13.6900\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"7.00\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"107\",\"D\",\"sp|P02768-A|ALBU\",\"466\",\"K\",\"13.9400\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"8.37\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"125\",\"T\",\"sp|P02768-A|ALBU\",\"165\",\"F\",\"13.3800\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"9.99\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"124\",\"C\",\"sp|P02768-A|ALBU\",\"162\",\"K\",\"15.7000\",\"3\",\"TT\",\"true\",\"false\",\",,\",\"\",\"10.91\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"398\",\"L\",\"sp|P02768-A|ALBU\",\"432\",\"K\",\"7.4600\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"12.43\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"125\",\"T\",\"sp|P02768-A|ALBU\",\"161\",\"Y\",\"17.3200\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"15.26\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"190\",\"K\",\"sp|P02768-A|ALBU\",\"452\",\"Y\",\"12.7600\",\"3\",\"TT\",\"true\",\"false\",\",,\",\"\",\"12.87\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"132\",\"E\",\"sp|P02768-A|ALBU\",\"162\",\"K\",\"14.3700\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"9.88\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"414\",\"K\",\"sp|P02768-A|ALBU\",\"495\",\"E\",\"11.1500\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"9.23\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"12\",\"K\",\"sp|P02768-A|ALBU\",\"124\",\"C\",\"9.1700\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"32.87\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"499\",\"P\",\"sp|P02768-A|ALBU\",\"506\",\"T\",\"12.4600\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"15.12\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"129\",\"D\",\"sp|P02768-A|ALBU\",\"162\",\"K\",\"11.5200\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"13.75\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"130\",\"N\",\"sp|P02768-A|ALBU\",\"162\",\"K\",\"12.9100\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"11.99\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"414\",\"K\",\"sp|P02768-A|ALBU\",\"497\",\"Y\",\"15.8300\",\"4\",\"TT\",\"true\",\"false\",\",,,\",\"\",\"9.72\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"135\",\"L\",\"sp|P02768-A|ALBU\",\"162\",\"K\",\"15.2300\",\"3\",\"TT\",\"true\",\"false\",\",,\",\"\",\"7.22\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"199\",\"K\",\"sp|P02768-A|ALBU\",\"293\",\"V\",\"9.8800\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"18.20\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"11\",\"F\",\"sp|P02768-A|ALBU\",\"136\",\"K\",\"11.0700\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"18.28\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"205\",\"K\",\"sp|P02768-A|ALBU\",\"456\",\"V\",\"10.9100\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"16.62\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"413\",\"K\",\"sp|P02768-A|ALBU\",\"494\",\"D\",\"9.7500\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"6.19\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"134\",\"F\",\"sp|P02768-A|ALBU\",\"162\",\"K\",\"16.9400\",\"3\",\"TT\",\"true\",\"false\",\",,\",\"\",\"9.15\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"124\",\"C\",\"sp|P02768-A|ALBU\",\"161\",\"Y\",\"15.1600\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"12.22\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"127\",\"F\",\"sp|P02768-A|ALBU\",\"162\",\"K\",\"12.3300\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"8.96\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"402\",\"K\",\"sp|P02768-A|ALBU\",\"546\",\"A\",\"14.1900\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"11.69\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"131\",\"E\",\"sp|P02768-A|ALBU\",\"161\",\"Y\",\"14.5000\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"11.07\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"93\",\"K\",\"sp|P02768-A|ALBU\",\"104\",\"Q\",\"10.4400\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"13.22\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"125\",\"T\",\"sp|P02768-A|ALBU\",\"162\",\"K\",\"12.6600\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"13.49\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"261\",\"A\",\"sp|P02768-A|ALBU\",\"263\",\"Y\",\"11.0400\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"5.45\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"509\",\"F\",\"sp|P02768-A|ALBU\",\"525\",\"K\",\"11.5900\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"9.02\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"184\",\"E\",\"sp|P02768-A|ALBU\",\"452\",\"Y\",\"9.3300\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"18.57\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"131\",\"E\",\"sp|P02768-A|ALBU\",\"162\",\"K\",\"17.0300\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"8.30\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"427\",\"S\",\"sp|P02768-A|ALBU\",\"520\",\"E\",\"13.7800\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"14.66\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"199\",\"K\",\"sp|P02768-A|ALBU\",\"301\",\"D\",\"12.1500\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"33.63\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"132\",\"E\",\"sp|P02768-A|ALBU\",\"159\",\"K\",\"13.8900\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"11.89\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"361\",\"C\",\"sp|P02768-A|ALBU\",\"378\",\"K\",\"13.0200\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"21.67\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"125\",\"T\",\"sp|P02768-A|ALBU\",\"156\",\"F\",\"12.6800\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"22.97\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"363\",\"A\",\"sp|P02768-A|ALBU\",\"378\",\"K\",\"11.8700\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"23.48\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"131\",\"E\",\"sp|P02768-A|ALBU\",\"159\",\"K\",\"12.1600\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"11.87\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"125\",\"T\",\"sp|P02768-A|ALBU\",\"159\",\"K\",\"12.3900\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"18.60\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"124\",\"C\",\"sp|P02768-A|ALBU\",\"159\",\"K\",\"11.7500\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"16.12\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"125\",\"T\",\"sp|P02768-A|ALBU\",\"174\",\"K\",\"10.3300\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"11.90\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"359\",\"K\",\"sp|P02768-A|ALBU\",\"377\",\"F\",\"9.6300\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"16.12\",\"A\",\"A\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"358\",\"E\",\"sp|P02768-A|ALBU\",\"370\",\"Y\",\"8.7500\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"10.03\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"263\",\"Y\",\"sp|P02768-A|ALBU\",\"294\",\"E\",\"12.2300\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"18.23\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"264\",\"I\",\"sp|P02768-A|ALBU\",\"287\",\"S\",\"16.5000\",\"2\",\"TT\",\"true\",\"false\",\",\",\"\",\"9.82\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"263\",\"Y\",\"sp|P02768-A|ALBU\",\"298\",\"M\",\"10.9200\",\"3\",\"TT\",\"true\",\"false\",\",,\",\"\",\"22.15\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"263\",\"Y\",\"sp|P02768-A|ALBU\",\"293\",\"V\",\"11.5900\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"15.40\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"263\",\"Y\",\"sp|P02768-A|ALBU\",\"285\",\"E\",\"10.9600\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"15.46\",\"B\",\"B\",\"X\",\"\",\"\"\r\n\"sp|P02768-A|ALBU\",\"263\",\"Y\",\"sp|P02768-A|ALBU\",\"299\",\"P\",\"11.6000\",\"1\",\"TT\",\"true\",\"false\",\"\",\"\",\"22.70\",\"A\",\"A\",\"X\",\"\",\"\"\r\n";

        // add the metadata from the other test, so it's always the same columns/values (i.e. test order doesn't change outcome of this test)
        const fileContents = "Protein 1,SeqPos 1,Protein 2,SeqPos 2,cat,dog\n"
            + "ALBU,415,ALBU,497,2,4\n"
            + "ALBU,190,ALBU,425,3,5\n";
        updateLinkMetadata(fileContents, clmsModel);

        const actualValue = getLinksCSV();

        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as Cross-Links CSV, Passed!");

        model.get("filterModel").resetFilter();
    });


    QUnit.test("Matches CSV", function (assert) {
        model.get("filterModel")
            .resetFilter()
            .set({pepLength: 13});
        const expectedValue = "\"Id\",\"Protein1\",\"SeqPos1\",\"PepPos1\",\"PepSeq1\",\"LinkPos1\",\"Protein2\",\"SeqPos2\",\"PepPos2\",\"PepSeq2\",\"LinkPos2\",\"Score\",\"PrecursorIntensity\",\"Charge\",\"ExpMz\",\"ExpMass\",\"CalcMz\",\"CalcMass\",\"MassError\",\"Missing Peaks\",\"Validated\",\"Search\",\"RawFileName\",\"PeakListFileName\",\"ScanNumber\",\"ScanIndex\",\"CrossLinkerModMass\",\"FragmentTolerance\",\"IonTypes\",\"Decoy1\",\"Decoy2\",\"3D Distance\",\"From Chain\",\"To Chain\",\"LinkType\",\"DecoyType\",\"Retention Time\"\r\n\"14\",\"sp|P02768-A|ALBU\",\"426\",\"414\",\"KVPQVSTPTLVEVSR\",\"13\",\"sp|P02768-A|ALBU\",\"190\",\"182\",\"LDELRDEGKASSAKsda-loopQR\",\"9\",\"11.74\",\"\",\"5\",\"721.996424273029\",\"3604.94573903075\",\"721.9955428789152\",\"3604.941332060181\",\"1.222480524012838\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"12.67\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"15\",\"sp|P02768-A|ALBU\",\"425\",\"414\",\"Ksda-loopVPQVSTPTLVEVSR\",\"12\",\"sp|P02768-A|ALBU\",\"190\",\"182\",\"LDELRDEGKASSAKsda-loopQR\",\"9\",\"9.49\",\"\",\"5\",\"738.405240897058\",\"3686.9898221508947\",\"738.4038061309335\",\"3686.9826483202723\",\"1.9457185744137258\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"12.07\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"20\",\"sp|P02768-A|ALBU\",\"414\",\"414\",\"KVPQVSTPTLVEVSR\",\"1\",\"sp|P02768-A|ALBU\",\"415\",\"414\",\"KVPQVSTsda-loopPTLVEVSR\",\"2\",\"9.9\",\"\",\"4\",\"861.4939999999999\",\"3441.9468941324835\",\"861.4931672319244\",\"3441.9435630601815\",\"0.9677881815783963\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"64.11\",\"B\",\"A\",\"Self\",\"TT\",\"\"\r\n\"24\",\"sp|P02768-A|ALBU\",\"99\",\"99\",\"NECcmFLQHKDDNPNLPR\",\"1\",\"sp|P02768-A|ALBU\",\"93\",\"82\",\"ETYGEMoxADCcmCcmAKQEPER\",\"12\",\"13.08\",\"\",\"4\",\"1042.70465934211\",\"4166.789531500925\",\"1042.7028029169014\",\"4166.78210580009\",\"1.7821188259970435\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"8.85\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"25\",\"sp|P02768-A|ALBU\",\"499\",\"485\",\"RPCcmFSALEVDETYVPK\",\"15\",\"sp|P02768-A|ALBU\",\"508\",\"501\",\"EFNAETFTFHADICcmTLSEKsda-loopER\",\"8\",\"9.68\",\"\",\"4\",\"1155.55001317647\",\"4618.170946838364\",\"1155.5488082319239\",\"4618.16612706018\",\"1.043656302469069\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"19.59\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"26\",\"sp|P02768-A|ALBU\",\"395\",\"390\",\"QNCcmELFEQLGEYK\",\"6\",\"sp|P02768-A|ALBU\",\"262\",\"258\",\"ADLAKYICcmENQDSISSK\",\"5\",\"11.25\",\"\",\"3\",\"1227.5735\",\"3679.6986705993627\",\"1227.574489733576\",\"3679.7016398000906\",\"-0.8069134453076857\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"35.79\",\"B\",\"A\",\"Self\",\"TT\",\"\"\r\n\"27\",\"sp|P02768-A|ALBU\",\"505\",\"501\",\"EFNAETFTFHADICcmTLSEKsda-loopER\",\"5\",\"sp|P02768-A|ALBU\",\"519\",\"501\",\"EFNAETFTFHADICcmTLSEKER\",\"19\",\"10.46\",\"\",\"4\",\"1314.10858495249\",\"5252.405233942444\",\"1314.1074837319245\",\"5252.400829060182\",\"0.8386416812632597\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"48.92\",\"A\",\"B\",\"Self\",\"TT\",\"\"\r\n\"155\",\"sp|P02768-A|ALBU\",\"426\",\"415\",\"VPQVSTPTLVEVSR\",\"12\",\"sp|P02768-A|ALBU\",\"190\",\"182\",\"LDELRDEGKASSAK\",\"9\",\"13.42\",\"\",\"4\",\"778.6697294146891\",\"3110.64981179124\",\"778.6686174169017\",\"3110.6453638000908\",\"1.4299255071484673\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"12.67\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"157\",\"sp|P02768-A|ALBU\",\"425\",\"415\",\"VPQVSTPTLVEVSR\",\"11\",\"sp|P02768-A|ALBU\",\"190\",\"182\",\"LDELRDEGKASSAK\",\"9\",\"15.42\",\"\",\"5\",\"623.137060325913\",\"3110.64891929517\",\"623.1363492268973\",\"3110.6453638000917\",\"1.1430088172679143\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"12.07\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"158\",\"sp|P02768-A|ALBU\",\"422\",\"415\",\"VPQVSTPTLVEVSR\",\"8\",\"sp|P02768-A|ALBU\",\"189\",\"182\",\"LDELRDEGKASSAK\",\"8\",\"12.32\",\"\",\"3\",\"1037.89099352466\",\"3110.6511511733424\",\"1037.8890644002427\",\"3110.6453638000908\",\"1.8605056426644946\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"18.90\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"170\",\"sp|P02768-A|ALBU\",\"425\",\"414\",\"KVPQVSTPTLVEVSR\",\"12\",\"sp|P02768-A|ALBU\",\"190\",\"182\",\"LDELRDEGKASSAK\",\"9\",\"14.8\",\"\",\"5\",\"648.756796029914\",\"3238.7475978151747\",\"648.7553418268973\",\"3238.740326800091\",\"2.245013292141513\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"12.07\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"171\",\"sp|P02768-A|ALBU\",\"425\",\"414\",\"KVPQVSTPTLVEVSR\",\"12\",\"sp|P02768-A|ALBU\",\"190\",\"182\",\"LDELRDEGKASSAK\",\"9\",\"15.19\",\"\",\"5\",\"648.756764758622\",\"3238.747441458715\",\"648.7553418268973\",\"3238.740326800091\",\"2.196736356077894\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"12.07\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"172\",\"sp|P02768-A|ALBU\",\"425\",\"414\",\"KVPQVSTPTLVEVSR\",\"12\",\"sp|P02768-A|ALBU\",\"190\",\"182\",\"LDELRDEGKASSAK\",\"9\",\"17.34\",\"\",\"4\",\"810.6938261982699\",\"3238.7461989255635\",\"810.6923581669017\",\"3238.7403268000908\",\"1.8130893125685763\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"12.07\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"181\",\"sp|P02768-A|ALBU\",\"570\",\"561\",\"ADDKETCcmFAEEGK\",\"10\",\"sp|P02768-A|ALBU\",\"557\",\"546\",\"AVMDDFAAFVEKCcmCcmK\",\"12\",\"10.91\",\"\",\"5\",\"675.097978042907\",\"3370.45350788014\",\"675.0972064268973\",\"3370.4496498000913\",\"1.1446781437565208\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"12.57\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"188\",\"sp|P02768-A|ALBU\",\"190\",\"182\",\"LDELRDEGKASSAKsda-loopQR\",\"9\",\"sp|P02768-A|ALBU\",\"427\",\"415\",\"VPQVSTPTLVEVSR\",\"13\",\"8.67\",\"\",\"3\",\"1159.95808259874\",\"3476.852418395583\",\"1159.9560661536066\",\"3476.8463690601825\",\"1.7398914873490758\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"15.06\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"189\",\"sp|P02768-A|ALBU\",\"425\",\"415\",\"VPQVSTPTLVEVSR\",\"11\",\"sp|P02768-A|ALBU\",\"190\",\"182\",\"LDELRDEGKASSAKsda-loopQR\",\"9\",\"10.73\",\"\",\"5\",\"696.3778967291589\",\"3476.8531013113998\",\"696.3765502789154\",\"3476.846369060182\",\"1.9363096620075289\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"12.07\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"190\",\"sp|P02768-A|ALBU\",\"425\",\"415\",\"VPQVSTPTLVEVSR\",\"11\",\"sp|P02768-A|ALBU\",\"190\",\"182\",\"LDELRDEGKASSAKsda-loopQR\",\"9\",\"11.19\",\"\",\"5\",\"696.37736376397\",\"3476.8504364854552\",\"696.3765502789154\",\"3476.846369060182\",\"1.169860511928654\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"12.07\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"191\",\"sp|P02768-A|ALBU\",\"425\",\"415\",\"VPQVSTPTLVEVSR\",\"11\",\"sp|P02768-A|ALBU\",\"190\",\"182\",\"LDELRDEGKASSAKsda-loopQR\",\"9\",\"11.15\",\"\",\"3\",\"1159.9580970159\",\"3476.8524616470627\",\"1159.9560661536066\",\"3476.8463690601825\",\"1.7523313467062573\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"12.07\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"192\",\"sp|P02768-A|ALBU\",\"570\",\"561\",\"ADDKETCcmFAEEGKK\",\"10\",\"sp|P02768-A|ALBU\",\"557\",\"546\",\"AVMDDFAAFVEKCcmCcmK\",\"12\",\"11.95\",\"\",\"5\",\"700.716175549082\",\"3498.544495411015\",\"700.7161990268972\",\"3498.5446128000913\",\"-0.03355368858028104\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"12.57\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"195\",\"sp|P02768-A|ALBU\",\"54\",\"52\",\"TCcmVADESAENCcmDK\",\"3\",\"sp|P02768-A|ALBU\",\"73\",\"65\",\"SLHTLFGDKLCcmTVATLR\",\"9\",\"13.14\",\"\",\"5\",\"703.13609928505\",\"3510.644114090855\",\"703.1357464268971\",\"3510.6423498000904\",\"0.5025549710983602\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"19.28\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"196\",\"sp|P02768-A|ALBU\",\"65\",\"65\",\"SLHTLFGDKLCcmTVATLR\",\"1\",\"sp|P02768-A|ALBU\",\"63\",\"52\",\"TCcmVADESAENCcmDK\",\"12\",\"13.17\",\"\",\"4\",\"878.6690892636329\",\"3510.6472511870156\",\"878.6678639169015\",\"3510.64234980009\",\"1.3961510280151406\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"6.60\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"200\",\"sp|P02768-A|ALBU\",\"497\",\"485\",\"RPCcmFSALEVDETYVPK\",\"13\",\"sp|P02768-A|ALBU\",\"415\",\"414\",\"KVPQVSTPTLVEVSR\",\"2\",\"10.59\",\"\",\"3\",\"1211.30772095426\",\"3630.901333462143\",\"1211.3060024002427\",\"3630.896177800091\",\"1.419942019678313\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"8.79\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"204\",\"sp|P02768-A|ALBU\",\"497\",\"485\",\"RPCcmFSALEVDETYVPK\",\"13\",\"sp|P02768-A|ALBU\",\"415\",\"414\",\"KVPQVSTPTLVEVSR\",\"2\",\"19\",\"\",\"4\",\"908.7326220276891\",\"3630.9013822432403\",\"908.7313209169015\",\"3630.89617780009\",\"1.43337702197425\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"8.79\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"208\",\"sp|P02768-A|ALBU\",\"161\",\"161\",\"YKAAFTECcmCcmQAADK\",\"1\",\"sp|P02768-A|ALBU\",\"154\",\"145\",\"RHPYFYAPELLFFAKR\",\"10\",\"12.62\",\"\",\"6\",\"633.9830791575171\",\"3797.8548161438284\",\"633.9819644335607\",\"3797.8481278000904\",\"1.7610877299298104\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"10.25\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"218\",\"sp|P02768-A|ALBU\",\"182\",\"182\",\"LDELRDEGKsda-loopASSAKsda-loopQR\",\"1\",\"sp|P02768-A|ALBU\",\"190\",\"182\",\"LDELRDEGKASSAKsda-loopQR\",\"9\",\"12.7\",\"\",\"3\",\"1311.68376145873\",\"3932.0294549755527\",\"1311.6811876603329\",\"3932.0217335803613\",\"1.9637213918143948\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"28.27\",\"B\",\"A\",\"Self\",\"TT\",\"\"\r\n\"219\",\"sp|P02768-A|ALBU\",\"497\",\"485\",\"RPCcmFSALEVDETYVPK\",\"13\",\"sp|P02768-A|ALBU\",\"416\",\"411\",\"YTKKsda-loopVPQVSTPTLVEVSR\",\"6\",\"13.69\",\"\",\"5\",\"822.037383194996\",\"4105.150533640585\",\"822.0359692789152\",\"4105.143464060181\",\"1.722127488641999\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"7.00\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"221\",\"sp|P02768-A|ALBU\",\"125\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"11\",\"sp|P02768-A|ALBU\",\"165\",\"161\",\"YKAAFTECcmCcmQAADK\",\"5\",\"13.38\",\"\",\"5\",\"879.611316343597\",\"4393.02019938359\",\"879.6104362268973\",\"4393.015798800091\",\"1.0017226662526069\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"9.99\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"222\",\"sp|P02768-A|ALBU\",\"124\",\"115\",\"LVRPEVDVMoxCcmTAFHDNEETFLK\",\"10\",\"sp|P02768-A|ALBU\",\"162\",\"161\",\"YKAAFTECcmCcmQAADK\",\"2\",\"15.11\",\"\",\"6\",\"735.842462712475\",\"4409.011117473576\",\"735.8423946002276\",\"4409.010708800091\",\"0.0926905175186693\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"10.91\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"224\",\"sp|P02768-A|ALBU\",\"505\",\"501\",\"EFNAETFTFHADICcmTLSEKsda-loopER\",\"5\",\"sp|P02768-A|ALBU\",\"525\",\"522\",\"QIKsda-loopKQTALVELVK\",\"4\",\"10.82\",\"\",\"4\",\"1072.81150282099\",\"4287.216905416444\",\"1072.8102907969471\",\"4287.212057320273\",\"1.1308272384367364\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"14.99\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"225\",\"sp|P02768-A|ALBU\",\"125\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"11\",\"sp|P02768-A|ALBU\",\"161\",\"161\",\"YKAAFTECcmCcmQAADK\",\"1\",\"17.32\",\"\",\"6\",\"733.1774255465871\",\"4393.020894478248\",\"733.1765762668942\",\"4393.015798800091\",\"1.159949881894001\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"15.26\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"226\",\"sp|P02768-A|ALBU\",\"452\",\"446\",\"MPCcmAEDYLSVVLNQLCcmVLHEK\",\"7\",\"sp|P02768-A|ALBU\",\"190\",\"182\",\"LDELRDEGKASSAKsda-loopQR\",\"9\",\"11.82\",\"\",\"6\",\"748.211275533336\",\"4483.2239943987415\",\"748.2101854769094\",\"4483.217454060182\",\"1.4588492810656064\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"12.87\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"227\",\"sp|P02768-A|ALBU\",\"452\",\"446\",\"MPCcmAEDYLSVVLNQLCcmVLHEK\",\"7\",\"sp|P02768-A|ALBU\",\"190\",\"182\",\"LDELRDEGKASSAK\",\"9\",\"11.96\",\"\",\"6\",\"687.17635310693\",\"4117.014459840306\",\"687.1766846002275\",\"4117.016448800091\",\"-0.48310707764453925\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"12.87\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"229\",\"sp|P02768-A|ALBU\",\"132\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"18\",\"sp|P02768-A|ALBU\",\"162\",\"161\",\"YKAAFTECcmCcmQAADK\",\"2\",\"13.17\",\"\",\"4\",\"1099.2625224338499\",\"4393.020983867884\",\"1099.2612261669015\",\"4393.01579880009\",\"1.1802980073812712\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"9.88\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"230\",\"sp|P02768-A|ALBU\",\"495\",\"485\",\"RPCcmFSALEVDETYVPK\",\"11\",\"sp|P02768-A|ALBU\",\"414\",\"411\",\"YTKsda-loopKVPQVSTPTLVEVSR\",\"4\",\"11.15\",\"\",\"4\",\"1027.29498065632\",\"4105.150816757764\",\"1027.2931424819242\",\"4105.143464060181\",\"1.7910939404055486\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"9.23\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"232\",\"sp|P02768-A|ALBU\",\"506\",\"501\",\"EFNAETFTFHADICcmTLSEK\",\"6\",\"sp|P02768-A|ALBU\",\"499\",\"485\",\"RPCcmFSALEVDETYVPK\",\"15\",\"12.46\",\"\",\"4\",\"1063.75412771493\",\"4250.987404992205\",\"1063.7525531669016\",\"4250.981106800091\",\"1.4815855341354125\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"15.12\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"233\",\"sp|P02768-A|ALBU\",\"525\",\"522\",\"QIKsda-loopKQTALVELVK\",\"4\",\"sp|P02768-A|ALBU\",\"505\",\"501\",\"EFNAETFTFHADICcmTLSEKsda-loopER\",\"5\",\"10.93\",\"\",\"4\",\"1072.81136417616\",\"4287.216350837124\",\"1072.8102907969471\",\"4287.212057320273\",\"1.0014706046363\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"14.99\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"234\",\"sp|P02768-A|ALBU\",\"132\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"18\",\"sp|P02768-A|ALBU\",\"162\",\"161\",\"YKAAFTECcmCcmQAADK\",\"2\",\"14.37\",\"\",\"6\",\"733.1774255465871\",\"4393.020894478248\",\"733.1765762668942\",\"4393.015798800091\",\"1.159949881894001\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"9.88\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"235\",\"sp|P02768-A|ALBU\",\"129\",\"115\",\"LVRPEVDVMoxCcmTAFHDNEETFLK\",\"15\",\"sp|P02768-A|ALBU\",\"162\",\"161\",\"YKAAFTECcmCcmQAADK\",\"2\",\"11.52\",\"\",\"6\",\"735.8431786741149\",\"4409.015413243415\",\"735.8423946002276\",\"4409.010708800091\",\"1.0670065542491538\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"13.75\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"236\",\"sp|P02768-A|ALBU\",\"190\",\"182\",\"LDELRDEGKASSAKsda-loopQR\",\"9\",\"sp|P02768-A|ALBU\",\"452\",\"446\",\"MPCcmAEDYLSVVLNQLCcmVLHEK\",\"7\",\"12.76\",\"\",\"6\",\"748.2111857049921\",\"4483.223455428678\",\"748.2101854769094\",\"4483.217454060182\",\"1.3386298027183947\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"12.87\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"237\",\"sp|P02768-A|ALBU\",\"130\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"16\",\"sp|P02768-A|ALBU\",\"162\",\"160\",\"RYKAAFTECcmCcmQAADK\",\"3\",\"12.91\",\"\",\"5\",\"910.831659994432\",\"4549.121917637765\",\"910.8306584268972\",\"4549.116909800091\",\"1.1008373215460252\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"11.99\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"238\",\"sp|P02768-A|ALBU\",\"497\",\"485\",\"RPCcmFSALEVDETYVPK\",\"13\",\"sp|P02768-A|ALBU\",\"414\",\"411\",\"YTKsda-loopKVPQVSTPTLVEVSR\",\"4\",\"15.83\",\"\",\"4\",\"1027.2948563707598\",\"4105.150319615524\",\"1027.2931424819242\",\"4105.143464060181\",\"1.669991658652906\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"9.72\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"239\",\"sp|P02768-A|ALBU\",\"135\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLKK\",\"21\",\"sp|P02768-A|ALBU\",\"162\",\"161\",\"YKAAFTECcmCcmQAADK\",\"2\",\"14.89\",\"\",\"5\",\"905.230560249288\",\"4521.116418912045\",\"905.2294288268973\",\"4521.1107618000915\",\"1.2512659503389054\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"7.22\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"243\",\"sp|P02768-A|ALBU\",\"124\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"10\",\"sp|P02768-A|ALBU\",\"162\",\"161\",\"YKAAFTECcmCcmQAADK\",\"2\",\"15.7\",\"\",\"5\",\"879.611316343597\",\"4393.02019938359\",\"879.6104362268973\",\"4393.015798800091\",\"1.0017226662526069\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"10.91\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"244\",\"sp|P02768-A|ALBU\",\"413\",\"411\",\"YTKKsda-loopVPQVSTPTLVEVSR\",\"3\",\"sp|P02768-A|ALBU\",\"494\",\"485\",\"RPCcmFSALEVDETYVPK\",\"10\",\"9.75\",\"\",\"5\",\"822.037572412362\",\"4105.151479727415\",\"822.0359692789154\",\"4105.143464060182\",\"1.952591256095\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"6.19\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"245\",\"sp|P02768-A|ALBU\",\"134\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"20\",\"sp|P02768-A|ALBU\",\"162\",\"161\",\"YKAAFTECcmCcmQAADK\",\"2\",\"11.03\",\"\",\"4\",\"1099.2620106077302\",\"4393.018936563405\",\"1099.2612261669015\",\"4393.01579880009\",\"0.7142617870416583\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"9.15\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"246\",\"sp|P02768-A|ALBU\",\"124\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"10\",\"sp|P02768-A|ALBU\",\"161\",\"161\",\"YKAAFTECcmCcmQAADK\",\"1\",\"15.16\",\"\",\"6\",\"733.1775986284019\",\"4393.021932969137\",\"733.1765762668942\",\"4393.015798800091\",\"1.3963457740895535\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"12.22\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"247\",\"sp|P02768-A|ALBU\",\"162\",\"160\",\"RYKAAFTECcmCcmQAADK\",\"3\",\"sp|P02768-A|ALBU\",\"127\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"13\",\"12.33\",\"\",\"7\",\"650.882648730252\",\"4549.127605843611\",\"650.8811207240349\",\"4549.116909800091\",\"2.351235136771095\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"8.96\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"249\",\"sp|P02768-A|ALBU\",\"134\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"20\",\"sp|P02768-A|ALBU\",\"162\",\"161\",\"YKAAFTECcmCcmQAADK\",\"2\",\"16.94\",\"\",\"5\",\"879.611569966556\",\"4393.0214674983845\",\"879.6104362268973\",\"4393.015798800091\",\"1.2903887791608466\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"9.15\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"250\",\"sp|P02768-A|ALBU\",\"131\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"17\",\"sp|P02768-A|ALBU\",\"161\",\"161\",\"YKAAFTECcmCcmQAADK\",\"1\",\"14.5\",\"\",\"5\",\"879.6112559189751\",\"4393.01989726048\",\"879.6104362268973\",\"4393.015798800091\",\"0.9329491577075782\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"11.07\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"251\",\"sp|P02768-A|ALBU\",\"104\",\"99\",\"NECcmFLQHKDDNPNLPR\",\"6\",\"sp|P02768-A|ALBU\",\"93\",\"82\",\"ETYGEMADCcmCcmAKQEPER\",\"12\",\"10.44\",\"\",\"5\",\"831.165307267896\",\"4150.790154005085\",\"831.1647156268971\",\"4150.787195800091\",\"0.7126852944128584\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"13.22\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"252\",\"sp|P02768-A|ALBU\",\"125\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLKK\",\"11\",\"sp|P02768-A|ALBU\",\"162\",\"161\",\"YKAAFTECcmCcmQAADK\",\"2\",\"12.66\",\"\",\"6\",\"754.526665408302\",\"4521.116333648538\",\"754.5257367668942\",\"4521.110761800091\",\"1.232406977145289\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"13.49\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"253\",\"sp|P02768-A|ALBU\",\"124\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"10\",\"sp|P02768-A|ALBU\",\"161\",\"160\",\"RYKAAFTECcmCcmQAADK\",\"2\",\"13.72\",\"\",\"7\",\"650.882223005845\",\"4549.124625772763\",\"650.8811207240349\",\"4549.116909800091\",\"1.6961473676251124\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"12.22\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"254\",\"sp|P02768-A|ALBU\",\"414\",\"411\",\"YTKKVPQVSTPTLVEVSR\",\"4\",\"sp|P02768-A|ALBU\",\"497\",\"485\",\"RPCcmFSALEVDETYsda-loopVPK\",\"13\",\"10.56\",\"\",\"4\",\"1027.29498065632\",\"4105.150816757764\",\"1027.2931424819244\",\"4105.143464060182\",\"1.791093940183998\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"9.72\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"256\",\"sp|P02768-A|ALBU\",\"509\",\"501\",\"EFNAETFTFHADICcmTLSEKsda-loopER\",\"9\",\"sp|P02768-A|ALBU\",\"525\",\"522\",\"QIKsda-loopKQTALVELVK\",\"4\",\"11.59\",\"\",\"5\",\"858.451213920858\",\"4287.219687269895\",\"858.4496879309334\",\"4287.212057320272\",\"1.779699609242199\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"9.02\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"257\",\"sp|P02768-A|ALBU\",\"135\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"21\",\"sp|P02768-A|ALBU\",\"162\",\"161\",\"YKAAFTECcmCcmQAADK\",\"2\",\"13.99\",\"\",\"4\",\"1099.2629585120699\",\"4393.022728180764\",\"1099.2612261669015\",\"4393.01579880009\",\"1.5773630214521446\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"7.22\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"258\",\"sp|P02768-A|ALBU\",\"452\",\"446\",\"MPCcmAEDYLSVVLNQLCcmVLHEK\",\"7\",\"sp|P02768-A|ALBU\",\"184\",\"182\",\"LDELRDEGKASSAK\",\"3\",\"9.33\",\"\",\"5\",\"824.411595380754\",\"4117.021594569374\",\"824.4105662268972\",\"4117.016448800091\",\"1.2498782425181758\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"18.57\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"259\",\"sp|P02768-A|ALBU\",\"131\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"17\",\"sp|P02768-A|ALBU\",\"162\",\"161\",\"YKAAFTECcmCcmQAADK\",\"2\",\"17.03\",\"\",\"6\",\"733.177163905215\",\"4393.019324630016\",\"733.1765762668942\",\"4393.015798800091\",\"0.8025989630799508\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"8.30\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"260\",\"sp|P02768-A|ALBU\",\"497\",\"485\",\"RPCcmFSALEVDETYVPK\",\"13\",\"sp|P02768-A|ALBU\",\"414\",\"411\",\"YTKsda-loopKVPQVSTPTLVEVSR\",\"4\",\"15.62\",\"\",\"4\",\"1027.29508869715\",\"4105.1512489210845\",\"1027.2931424819242\",\"4105.143464060181\",\"1.8963675622154552\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"9.72\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"261\",\"sp|P02768-A|ALBU\",\"505\",\"501\",\"EFNAETFTFHADICcmTLSEKsda-loopER\",\"5\",\"sp|P02768-A|ALBU\",\"525\",\"522\",\"QIKsda-loopKQTALVELVK\",\"4\",\"11.38\",\"\",\"5\",\"858.4508990684151\",\"4287.218113007681\",\"858.4496879309334\",\"4287.212057320272\",\"1.4125000880984149\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"14.99\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"262\",\"sp|P02768-A|ALBU\",\"135\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"21\",\"sp|P02768-A|ALBU\",\"162\",\"161\",\"YKAAFTECcmCcmQAADK\",\"2\",\"15.23\",\"\",\"4\",\"1099.2620106077302\",\"4393.018936563405\",\"1099.2612261669015\",\"4393.01579880009\",\"0.7142617870416583\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"7.22\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"263\",\"sp|P02768-A|ALBU\",\"414\",\"411\",\"YTKKsda-loopVPQVSTPTLVEVSR\",\"4\",\"sp|P02768-A|ALBU\",\"497\",\"485\",\"RPCcmFSALEVDETYVPK\",\"13\",\"8.1\",\"\",\"3\",\"1369.3904260160302\",\"4105.149448647453\",\"1369.3884311536065\",\"4105.143464060182\",\"1.457826583523977\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"9.72\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"264\",\"sp|P02768-A|ALBU\",\"427\",\"415\",\"VPQVSTPTLVEVSR\",\"13\",\"sp|P02768-A|ALBU\",\"520\",\"501\",\"EFNAETFTFHADICcmTLSEKER\",\"20\",\"13.78\",\"\",\"3\",\"1380.021384247\",\"4137.042323340363\",\"1380.019248733576\",\"4137.0359168000905\",\"1.5485822218979366\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"14.66\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"265\",\"sp|P02768-A|ALBU\",\"134\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"20\",\"sp|P02768-A|ALBU\",\"162\",\"161\",\"YKAAFTECcmCcmQAADK\",\"2\",\"13.67\",\"\",\"4\",\"1099.2625224338499\",\"4393.020983867884\",\"1099.2612261669015\",\"4393.01579880009\",\"1.1802980073812712\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"9.15\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"267\",\"sp|P02768-A|ALBU\",\"509\",\"501\",\"EFNAETFTFHADICcmTLSEKsda-loopER\",\"9\",\"sp|P02768-A|ALBU\",\"525\",\"522\",\"QIKsda-loopKQTALVELVK\",\"4\",\"10.8\",\"\",\"4\",\"1072.81141373502\",\"4287.216549072565\",\"1072.8102907969471\",\"4287.212057320273\",\"1.0477093812516156\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"9.02\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"268\",\"sp|P02768-A|ALBU\",\"124\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLKsda-loopK\",\"10\",\"sp|P02768-A|ALBU\",\"162\",\"161\",\"YKAAFTECcmCcmQAADK\",\"2\",\"10.72\",\"\",\"6\",\"768.200254301344\",\"4603.157867006789\",\"768.1992894769091\",\"4603.15207806018\",\"1.2576049000069018\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"10.91\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"269\",\"sp|P02768-A|ALBU\",\"132\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"18\",\"sp|P02768-A|ALBU\",\"159\",\"146\",\"HPYFYAPELLFFAKR\",\"14\",\"13.89\",\"\",\"5\",\"926.866161842965\",\"4629.2944268804295\",\"926.8644654268973\",\"4629.285944800091\",\"1.8322653730449754\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"11.89\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"270\",\"sp|P02768-A|ALBU\",\"361\",\"352\",\"TYETTLEKCcmCcmAAADPHECcmYAK\",\"10\",\"sp|P02768-A|ALBU\",\"378\",\"373\",\"VFDEFKPLVEEPQNLIK\",\"6\",\"13.02\",\"\",\"5\",\"929.646530063165\",\"4643.19626798143\",\"929.6453668268973\",\"4643.190451800091\",\"1.2526260550662323\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"21.67\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"271\",\"sp|P02768-A|ALBU\",\"125\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"11\",\"sp|P02768-A|ALBU\",\"156\",\"146\",\"HPYFYAPELLFFAKR\",\"11\",\"12.68\",\"\",\"6\",\"772.556159616591\",\"4629.293298898272\",\"772.5549339335608\",\"4629.285944800091\",\"1.588603138552738\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"22.97\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"272\",\"sp|P02768-A|ALBU\",\"378\",\"373\",\"VFDEFKPLVEEPQNLIK\",\"6\",\"sp|P02768-A|ALBU\",\"363\",\"352\",\"TYETTLEKCcmCcmAAADPHECcmYAK\",\"12\",\"11.87\",\"\",\"5\",\"929.646530063165\",\"4643.19626798143\",\"929.6453668268973\",\"4643.190451800091\",\"1.2526260550662323\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"23.48\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"273\",\"sp|P02768-A|ALBU\",\"131\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"17\",\"sp|P02768-A|ALBU\",\"159\",\"146\",\"HPYFYAPELLFFAKR\",\"14\",\"12.16\",\"\",\"6\",\"772.5559295451241\",\"4629.29191846947\",\"772.5549339335608\",\"4629.285944800091\",\"1.2904083805803597\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"11.87\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"274\",\"sp|P02768-A|ALBU\",\"125\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"11\",\"sp|P02768-A|ALBU\",\"159\",\"145\",\"RHPYFYAPELLFFAKR\",\"15\",\"12.39\",\"\",\"7\",\"684.634579361082\",\"4785.391120259422\",\"684.6339987240348\",\"4785.387055800091\",\"0.8493480848161937\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"18.60\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n\"275\",\"sp|P02768-A|ALBU\",\"124\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"10\",\"sp|P02768-A|ALBU\",\"159\",\"145\",\"RHPYFYAPELLFFAKR\",\"15\",\"11.75\",\"\",\"7\",\"684.634579361082\",\"4785.391120259422\",\"684.6339987240348\",\"4785.387055800091\",\"0.8493480848161937\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"16.12\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"277\",\"sp|P02768-A|ALBU\",\"125\",\"115\",\"LVRPEVDVMCcmTAFHDNEETFLK\",\"11\",\"sp|P02768-A|ALBU\",\"174\",\"163\",\"AAFTECcmCcmQAADKAACcmLLPK\",\"12\",\"10.33\",\"\",\"6\",\"810.221440897326\",\"4855.284986582682\",\"810.2203164335609\",\"4855.278239800091\",\"1.3895769218338037\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"11.90\",\"B\",\"B\",\"Self\",\"TT\",\"\"\r\n\"278\",\"sp|P02768-A|ALBU\",\"359\",\"349\",\"LAKsda-loopTYETTLEKCcmCcmAAADPHECcmYAK\",\"11\",\"sp|P02768-A|ALBU\",\"377\",\"373\",\"VFDEFKsda-loopPLVEEPQNLIK\",\"5\",\"9.63\",\"\",\"5\",\"1024.9066323879\",\"5119.496779605104\",\"1024.9051215309337\",\"5119.489225320273\",\"1.47559346222291\",\"0\",\"\",\"24070\",\"\",\"\",\"\",\"\",\"82.0413162600906\",\"\",\"[{\"type\":\"BIon\"},{\"type\":\"YIon\"},{\"type\":\"PeptideIon\"},{\"type\":\"Ion\"}]\",\"false\",\"false\",\"16.12\",\"A\",\"A\",\"Self\",\"TT\",\"\"\r\n";

        const actualValue = getMatchesCSV();

        assert.deepEqual(actualValue, expectedValue, "Expected " + JSON.stringify(expectedValue) + " as Matches CSV, Passed!");

        model.get("filterModel").resetFilter();
    });

}


export function testSetupNew(cbfunc) {
    d3.json("10003.json", function (options) {
        window.vent.listenToOnce(window.vent, "initialSetupDone", function () {

            setupColourModels();

            window.compositeModelInst.get("clmsModel").listenToOnce(window.compositeModelInst.get("clmsModel"), "change:distancesObj", function () {
                console.log("distances obj changed");
                cbfunc(window.compositeModelInst);
            });

            const stage = new NGL.Stage("ngl", {tooltip: false});

            //CLMSUI.NGLUtils.repopulateNGL ({pdbCode: "1AO6", stage: stage, compositeModel: CLMSUI.compositeModelInst});

            const pdbCode = "1AO6";

            const pdbSettings = pdbCode.match(commonRegexes.multiPdbSplitter).map(function (code) {
                return {
                    id: code,
                    pdbCode: code,
                    uri: "rcsb://" + code,
                    local: false,
                    params: {calphaOnly: this.cAlphaOnly}
                };
            }, this);

            repopulateNGL({
                pdbSettings: pdbSettings,
                stage: stage,
                compositeModel: window.compositeModelInst
            });

            console.log("here");
        });

        blosumLoading({url: "../R/blosums.json"});
        models("XIVIEW.ORG", options);

        window.compositeModelInst.get("clmsModel").set("crosslinkerSpecificity",
            {
                "wrong mass SDA ": {
                    "searches": new Set(["24070"]),
                    "linkables": [
                        new Set([
                            "R",
                            "H",
                            "K",
                            "D",
                            "E",
                            "S",
                            "T",
                            "N",
                            "Q",
                            "C",
                            "U",
                            "G",
                            "P",
                            "A",
                            "V",
                            "I",
                            "L",
                            "M",
                            "F",
                            "Y",
                            "W"
                        ]),
                        new Set([
                            "K",
                            "S",
                            "Y",
                            "T",
                            "NTERM"
                        ])
                    ],
                    "name": "wrong mass SDA ",
                    "id": 13,
                    "heterobi": true
                }
            });

        pretendLoad();	// add 2 to allDataLoaded bar (we aren't loading views or GO terms here)
    });
}

/*

function testSetup (cbfunc) {
    d3.json ("10003.json", function (options) {
        CLMSUI.init.modelsEssential (options);

        cbfunc (CLMSUI.compositeModelInst);
    });
}
*/

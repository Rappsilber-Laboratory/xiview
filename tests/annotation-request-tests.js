import {module, test, start} from "qunit";
import {loadTestData, loadXi2TestData} from "./test-helper";
import {Peptide} from "../js/clms-model/peptide";
import {arrayifyPeptide, buildAnnotationRequest, convert_to_json_request} from "../js/load-spectrum";

/**
 * Tests of the annotation request xiVIEW sends to the annotator (via
 * get_annotated_peaklist). They pin the current request shape so a change to
 * the annotator call shows up as a failing test / golden-file diff.
 *
 * Tests named "KNOWN:" pin current behaviour that looks questionable; they are
 * there so a fix is a deliberate, visible change, not an endorsement.
 *
 * Golden files: tests/annotator-contract/<case>.request.json. Regenerate with
 *   UPDATE_GOLDEN=1 npm test
 * (the runner then exposes window.writeGolden) and review the diff.
 */

// Matches used for golden snapshots: [golden case name, match id]
const XI2_CASES = [
    ["xi2-xl-unmodified", "xl-unmodified"],
    ["xi2-xl-modified", "xl-modified"],
    ["xi2-linear-modified", "linear-modified"],
    ["xi2-xl-two-crosslinkers", "xl-two-crosslinkers"],
];
const MZID_CASES = [
    ["mzid-xl-dsso-etd", "ETD_SII_0"],
    ["mzid-xl-mascot-da-tolerance", "SII_8_2_p1"],
    ["mzid-xl-with-cm", "SII_2_1"],
    ["mzid-looplink-with-ox", "SII_11_1"],
    ["mzid-xl-charge4", "SII_17_1_p1"],
];

/**
 * Round-trip through JSON, i.e. what actually goes over the wire
 * (undefined values dropped, NaN -> null).
 * @param {Object} obj
 * @returns {Object}
 */
function wire(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Compare a request with its golden file, or (re)write the golden file when the
 * runner was started with UPDATE_GOLDEN=1.
 * @param {Object} assert - QUnit assert
 * @param {string} name - golden case name
 * @param {Object} request - annotation request
 * @returns {Promise<void>}
 */
async function checkGolden(assert, name, request) {
    const actual = wire(request);
    if (typeof window.writeGolden === "function") {
        await window.writeGolden(name, JSON.stringify(actual, null, 2) + "\n");
        assert.ok(true, `golden file ${name} written`);
        return;
    }
    const resp = await fetch(`./annotator-contract/${name}.request.json`, {cache: "no-store"});
    if (!resp.ok) {
        assert.ok(false, `golden file ${name}.request.json missing - run UPDATE_GOLDEN=1 npm test`);
        return;
    }
    assert.deepEqual(actual, await resp.json(), `request matches golden file ${name}.request.json`);
}

/**
 * Run fn with window.alert stubbed; returns the alert messages.
 * @param {Function} fn
 * @returns {Array<string>}
 */
function withAlertStub(fn) {
    const messages = [];
    const orig = window.alert;
    window.alert = (msg) => messages.push(msg);
    try {
        fn();
    } finally {
        window.alert = orig;
    }
    return messages;
}

/**
 * Minimal stand-in for an mzIdentML SpectrumMatch, exposing only what
 * buildAnnotationRequest reads.
 * @param {Array<Peptide>} peptides
 * @param {Object} [overrides]
 * @returns {Object}
 */
function fakeMzidMatch(peptides, overrides = {}) {
    return {
        id: "fake-1",
        spectraDataId: 1,
        matchedPeptides: peptides,
        linkPos1: 2,
        linkPos2: peptides[1] ? 1 : undefined,
        precursorCharge: 2,
        precursorMZ: 500.25,
        spectrumIdentificationProtocol: undefined, // mzIdentML SIP has no searchConfig
        crosslinkerModMass: () => 0,
        fragmentTolerance: () => ({tolerance: 20, unit: "ppm"}),
        ionTypes: () => [{type: "bIon"}, {type: "yIon"}],
        ...overrides
    };
}

export async function testSetup() {
    let mzidModel, xi2Model;
    try {
        mzidModel = await loadTestData();
        xi2Model = await loadXi2TestData();
    } catch (error) {
        module("Annotation request: data loading");
        test("Load test data", function (assert) {
            assert.ok(false, "Failed to load test data: " + error.message);
        });
        start();
        return;
    }
    const mzidMatch = (id) => mzidModel.getMatches().find(m => m.id === id);
    const xi2Match = (id) => xi2Model.getMatches().find(m => m.id === id);

    module("Annotation request: arrayifyPeptide");

    test("unmodified peptide", function (assert) {
        assert.deepEqual(arrayifyPeptide("PEK"), {
            sequence: [
                {aminoAcid: "P", Modification: ""},
                {aminoAcid: "E", Modification: ""},
                {aminoAcid: "K", Modification: ""},
            ]
        });
    });

    test("mod on first, internal and last residue", function (assert) {
        const seq = arrayifyPeptide("M(ox)EKC(cm)R(me)").sequence;
        assert.deepEqual(seq.map(a => a.aminoAcid).join(""), "MEKCR");
        assert.deepEqual(seq.map(a => a.Modification), ["(ox)", "", "", "(cm)", "(me)"]);
    });

    test("adjacent mods on consecutive residues", function (assert) {
        const seq = arrayifyPeptide("C(cm)C(cm)K").sequence;
        assert.deepEqual(seq.map(a => a.Modification), ["(cm)", "(cm)", ""]);
    });

    test("mod name with digits and punctuation", function (assert) {
        const seq = arrayifyPeptide("PEK(bs3-oh_2)").sequence;
        assert.equal(seq[2].Modification, "(bs3-oh_2)");
    });

    test("KNOWN: N-terminal mod (before first residue) is put on the first residue", function (assert) {
        const seq = arrayifyPeptide("(ac)KVLC(cm)").sequence;
        assert.deepEqual(seq.map(a => a.Modification), ["(ac)", "", "", "(cm)"]);
    });

    module("Annotation request: convert_to_json_request");

    test("defaults for a minimal linear request", function (assert) {
        const req = convert_to_json_request({
            sequence1: "PEPTIDEK", peakList: [], precursorCharge: "2", precursorMZ: "500.5"
        });
        assert.equal(req.annotation.requestID, "-1", "requestID defaults to '-1' (string)");
        assert.strictEqual(req.annotation.precursorCharge, 2, "precursorCharge is a number");
        assert.strictEqual(req.annotation.precursorMZ, 500.5, "precursorMZ is a number");
        assert.deepEqual(req.annotation.ions,
            [{type: "PeptideIon"}, {type: "BIon"}, {type: "YIon"}], "default ions peptide;b;y");
        assert.deepEqual(req.annotation.fragmentTolerance, {tolerance: "10.0", unit: "ppm"});
        assert.deepEqual(req.annotation.modifications, []);
        assert.strictEqual(req.annotation.crosslinker.modMass, 0);
        assert.deepEqual(req.annotation.crosslinker.stubs1, []);
        assert.deepEqual(req.annotation.crosslinker.stubs2, []);
        assert.equal(req.annotation.returnModSyntax, "Xmod");
        assert.deepEqual(req.LinkSite, [], "no link sites without linkPos1");
        assert.equal(req.Peptides.length, 1);
        assert.notOk("config" in req.annotation, "no xi2 config in xi1-style request");
    });

    test("requestID is stringified; peaks are converted to {mz, intensity}", function (assert) {
        const req = convert_to_json_request({
            sequence1: "PEK", peakList: [[100.1, 5], [200.2, 7]], requestID: 42,
            precursorCharge: 2, precursorMZ: 300
        });
        assert.strictEqual(req.annotation.requestID, "42");
        assert.deepEqual(req.peaks, [{intensity: 5, mz: 100.1}, {intensity: 7, mz: 200.2}]);
    });

    test("ionTypes string: capitalised + 'Ion', empty entries dropped", function (assert) {
        const req = convert_to_json_request({
            sequence1: "PEK", peakList: [], ionTypes: "b;;y;c;", precursorCharge: 2, precursorMZ: 300
        });
        assert.deepEqual(req.annotation.ions, [{type: "BIon"}, {type: "YIon"}, {type: "CIon"}]);
    });

    test("crosslinked link sites: one link (id 0) across peptides 0 and 1", function (assert) {
        const req = convert_to_json_request({
            sequence1: "AKT", sequence2: "KMR", linkPos1: 1, linkPos2: 0,
            peakList: [], precursorCharge: 3, precursorMZ: 300
        });
        assert.deepEqual(req.LinkSite, [
            {id: 0, peptideId: 0, linkSite: 1},
            {id: 0, peptideId: 1, linkSite: 0},
        ]);
        assert.equal(req.Peptides.length, 2);
    });

    test("xi1 branch passes losses and crosslinker mod mass", function (assert) {
        const losses = [{name: "H2O", mass: 18.0106, specificity: ["S"]}];
        const req = convert_to_json_request({
            sequence1: "PEK", peakList: [], precursorCharge: 2, precursorMZ: 300,
            crossLinkerModMass: 138.068, losses
        });
        assert.strictEqual(req.annotation.crosslinker.modMass, 138.068);
        assert.deepEqual(req.annotation.losses, losses);
    });

    test("xi2 branch: config passed, no ions/tolerance; crosslinkers emptied without crosslinkerID", function (assert) {
        const req = convert_to_json_request({
            sequence1: "PEK", base_sequence1: "PEK", mod_pos1: [], mod_ids1: [],
            peakList: [], precursorCharge: 2, precursorMZ: 300,
            config: {crosslinker: ["BS3"], ms2_tol: "10 ppm"}
        });
        assert.deepEqual(req.annotation.config.crosslinker, [], "crosslinker list emptied");
        assert.strictEqual(req.annotation.crosslinkerID, undefined);
        assert.notOk("ions" in req.annotation, "no ions in xi2 request");
        assert.notOk("fragmentTolerance" in req.annotation, "no fragmentTolerance in xi2 request");
        assert.notOk("modMass" in req.annotation.crosslinker, "no crosslinker modMass in xi2 request");
        assert.equal(req.Peptides[0].base_sequence, "PEK");
    });

    test("xi2 branch: crosslinkers kept when crosslinkerID given", function (assert) {
        const req = convert_to_json_request({
            sequence1: "AKT", sequence2: "KMR", base_sequence1: "AKT", base_sequence2: "KMR",
            mod_pos1: [], mod_ids1: [], mod_pos2: [], mod_ids2: [], linkPos1: 1, linkPos2: 0,
            peakList: [], precursorCharge: 3, precursorMZ: 300, crosslinkerID: 0,
            config: {crosslinker: ["BS3"]}
        });
        assert.deepEqual(req.annotation.config.crosslinker, ["BS3"]);
        assert.strictEqual(req.annotation.crosslinkerID, 0);
    });

    module("Annotation request: buildAnnotationRequest (xi2)");

    test("fixture matches loaded", function (assert) {
        for (const [, id] of XI2_CASES) {
            assert.ok(xi2Match(id), `xi2 match ${id} present`);
        }
    });

    test("crosslinked, unmodified", function (assert) {
        const match = xi2Match("xl-unmodified");
        const req = buildAnnotationRequest(match);
        const sipConfig = match.spectrumIdentificationProtocol.searchConfig;

        assert.equal(req.annotation.requestID, "xl-unmodified");
        assert.strictEqual(req.annotation.precursorCharge, 3);
        assert.strictEqual(req.annotation.precursorMZ, 297.509118);
        assert.deepEqual(req.Peptides.map(p => p.base_sequence), ["AKT", "KMR"]);
        assert.deepEqual(req.Peptides.map(p => p.modification_positions), [[], []]);
        assert.deepEqual(req.Peptides.map(p => p.modification_ids), [[], []]);
        assert.deepEqual(req.LinkSite, [
            {id: 0, peptideId: 0, linkSite: 1},
            {id: 0, peptideId: 1, linkSite: 0},
        ], "link sites are the match's 1-based s1/s2 minus 1");
        assert.strictEqual(req.annotation.crosslinkerID, 0);
        assert.deepEqual(req.annotation.config, sipConfig, "config is the search config");
        assert.notOk("ions" in req.annotation, "xi2 request carries no ions");
        assert.notOk("fragmentTolerance" in req.annotation, "xi2 request carries no fragmentTolerance");
    });

    test("config is a copy: mutating the request leaves the protocol's config alone", function (assert) {
        const match = xi2Match("xl-unmodified");
        const req = buildAnnotationRequest(match);
        const sipConfig = match.spectrumIdentificationProtocol.searchConfig;
        assert.notStrictEqual(req.annotation.config, sipConfig, "different object");
        req.annotation.config.ms2_tol = "999 Da";
        req.annotation.config.crosslinker.length = 0;
        req.annotation.config.modification.modifications[0].mass = -1;
        assert.equal(sipConfig.ms2_tol, "10 ppm");
        assert.equal(sipConfig.crosslinker.length, 1);
        assert.equal(sipConfig.modification.modifications[0].mass, 57.021464);
    });

    test("modifications: positions and config indexes passed through verbatim", function (assert) {
        const req = buildAnnotationRequest(xi2Match("xl-modified"));
        assert.deepEqual(req.Peptides.map(p => p.base_sequence), ["MEKCR", "KVLC"]);
        // first residue + internal residue
        assert.deepEqual(req.Peptides[0].modification_positions, [1, 4]);
        assert.deepEqual(req.Peptides[0].modification_ids, [1, 0]);
        // N-terminal (composition-only mod, no mass) + last residue
        assert.deepEqual(req.Peptides[1].modification_positions, [0, 4]);
        assert.deepEqual(req.Peptides[1].modification_ids, [2, 0]);
        assert.deepEqual(req.LinkSite.map(l => l.linkSite), [2, 0]);
        assert.deepEqual(req.annotation.modifications, [], "xi2 mods resolved from config, not sent");
    });

    test("xi1-style sequence alongside xi2 fields uses config mod names", function (assert) {
        const req = buildAnnotationRequest(xi2Match("xl-modified"));
        assert.deepEqual(req.Peptides[0].sequence.map(a => a.aminoAcid + a.Modification),
            ["M(ox)", "E", "K", "C(cm)", "R"]);
        assert.deepEqual(req.Peptides[1].sequence.map(a => a.aminoAcid + a.Modification),
            ["K(ac)", "V", "L", "C(cm)"]);
    });

    test("composition-only mod does not trigger the missing-mass alert (xi2)", function (assert) {
        const alerts = withAlertStub(() => buildAnnotationRequest(xi2Match("xl-modified")));
        assert.deepEqual(alerts, []);
    });

    test("linear search: no crosslinkerID, config crosslinker list empty", function (assert) {
        const req = buildAnnotationRequest(xi2Match("linear-modified"));
        assert.equal(req.Peptides.length, 1);
        assert.equal(req.Peptides[0].base_sequence, "GCLK");
        assert.deepEqual(req.Peptides[0].modification_positions, [2, 32767], "C-term sentinel passed through");
        assert.deepEqual(req.Peptides[0].modification_ids, [0, 3]);
        assert.strictEqual(req.annotation.crosslinkerID, undefined);
        assert.deepEqual(req.annotation.config.crosslinker, []);
    });

    test("KNOWN: xi2 linear (s1 = null) sends a link site of -1", function (assert) {
        // SpectrumMatch does +json.s1, so null becomes 0 and then 0 - 1. The
        // annotator overwrites LinkSite for single peptides, so this is harmless today.
        const req = buildAnnotationRequest(xi2Match("linear-modified"));
        assert.deepEqual(req.LinkSite, [{id: 0, peptideId: 0, linkSite: -1}]);
    });

    test("KNOWN: two crosslinkers in config - crosslinkerID is always 0, match's cl ignored", function (assert) {
        // match json has cl: 1 (DSSO); the builder assumes a single crosslinker
        const req = buildAnnotationRequest(xi2Match("xl-two-crosslinkers"));
        assert.strictEqual(req.annotation.crosslinkerID, 0);
        assert.deepEqual(req.annotation.config.crosslinker.map(c => c.name), ["BS3", "DSSO"]);
    });

    module("Annotation request: buildAnnotationRequest (mzIdentML)");

    test("fixture matches loaded", function (assert) {
        for (const [, id] of MZID_CASES) {
            assert.ok(mzidMatch(id), `mzIdentML match ${id} present`);
        }
    });

    test("crosslinked with carbamidomethyl: mods, link sites, tolerance, crosslinker mass", function (assert) {
        const match = mzidMatch("SII_2_1");
        const req = buildAnnotationRequest(match);
        assert.equal(req.annotation.requestID, "SII_2_1");
        assert.strictEqual(req.annotation.precursorCharge, 6);
        assert.equal(req.Peptides.length, 2);
        assert.equal(req.Peptides[0].sequence.map(a => a.aminoAcid).join(""), "SCKDLQILQASK");
        assert.equal(req.Peptides[0].sequence[1].Modification, "(carbamidomethyl)", "cm on C2 (1-based pos 2)");
        assert.notOk(req.Peptides[0].sequence.some(a => a.Modification.includes("crosslink")),
            "crosslinker mods are not in the sequence");
        assert.deepEqual(req.annotation.modifications,
            [{id: "(carbamidomethyl)", mass: 57.02147, aminoAcids: ["*"]}],
            "one entry per distinct mod, crosslinker CV mods excluded");
        assert.deepEqual(req.LinkSite, [
            {id: 0, peptideId: 0, linkSite: match.linkPos1 - 1},
            {id: 0, peptideId: 1, linkSite: match.linkPos2 - 1},
        ]);
        assert.strictEqual(req.LinkSite[0].linkSite, 0, "ls1 = 1 -> 0-based 0");
        assert.deepEqual(req.annotation.fragmentTolerance, {tolerance: 5, unit: "ppm"});
        assert.strictEqual(req.annotation.crosslinker.modMass, match.crosslinkerModMass());
        assert.notOk("config" in req.annotation, "no xi2 config for mzIdentML");
        assert.notOk("base_sequence" in req.Peptides[0], "no xi2 peptide fields for mzIdentML");
    });

    test("Da fragment tolerance from the protocol", function (assert) {
        const req = buildAnnotationRequest(mzidMatch("SII_8_2_p1"));
        assert.deepEqual(req.annotation.fragmentTolerance, {tolerance: 0.03, unit: "Da"});
    });

    test("KNOWN: ion types are always b/y, even for an ETD (c/z) protocol", function (assert) {
        // SpectrumMatch.ionTypes() returns a hard-coded [bIon, yIon] (todo in spectrum-match.js)
        const req = buildAnnotationRequest(mzidMatch("ETD_SII_0"));
        assert.deepEqual(req.annotation.ions, [{type: "BIon"}, {type: "YIon"}]);
    });

    test("KNOWN: loop link sends one peptide and only the first link site", function (assert) {
        // ls2 (17) is dropped; the annotator sees a single peptide and annotates it as linear
        const match = mzidMatch("SII_11_1");
        const req = buildAnnotationRequest(match);
        assert.equal(req.Peptides.length, 1);
        assert.deepEqual(req.LinkSite, [{id: 0, peptideId: 0, linkSite: 14}]);
        assert.equal(match.linkPos2, 17, "the model does know the second site");
    });

    test("no peak list (spectraDataId null/undefined) -> null", function (assert) {
        const pep = new Peptide({id: 1, u_id: "1", seq: "PEK", m_ps: [], m_as: [], m_ms: [], cl_m: 0});
        assert.strictEqual(buildAnnotationRequest(fakeMzidMatch([pep], {spectraDataId: null})), null);
        assert.strictEqual(buildAnnotationRequest(fakeMzidMatch([pep], {spectraDataId: undefined})), null);
        assert.notStrictEqual(buildAnnotationRequest(fakeMzidMatch([pep], {spectraDataId: 0})), null,
            "spectraDataId 0 is a valid id");
    });

    test("mod names normalised: lowercase, whitespace removed, deduplicated", function (assert) {
        const pep = new Peptide({
            id: 1, u_id: "1", seq: "SPSKS", m_ps: [1, 3, 5],
            m_as: [{"UNIMOD:21": "Phospho Ser"}, {"UNIMOD:21": "Phospho Ser"}, {"UNIMOD:1": "Acetyl"}],
            m_ms: [79.966331, 79.966331, 42.010565], cl_m: 0
        });
        const req = buildAnnotationRequest(fakeMzidMatch([pep]));
        assert.deepEqual(req.annotation.modifications, [
            {id: "(phosphoser)", mass: 79.966331, aminoAcids: ["*"]},
            {id: "(acetyl)", mass: 42.010565, aminoAcids: ["*"]},
        ]);
        assert.deepEqual(req.Peptides[0].sequence.map(a => a.Modification),
            ["(phosphoser)", "", "(phosphoser)", "", "(acetyl)"]);
    });

    test("crosslinker stubs (MS:1003390) are passed as stubs1/stubs2", function (assert) {
        const pep0 = new Peptide({
            id: 1, u_id: "1", seq: "AKT", m_ps: [2],
            m_as: [{"MS:1002509": 1, "MS:1003390": "A:54.01056:S"}], m_ms: [158.0038], cl_m: 158.0038
        });
        const pep1 = new Peptide({
            id: 2, u_id: "1", seq: "KMR", m_ps: [1],
            m_as: [{"MS:1002510": 1, "MS:1003390": "S:103.9932:A"}], m_ms: [0], cl_m: 0
        });
        const req = buildAnnotationRequest(fakeMzidMatch([pep0, pep1], {crosslinkerModMass: () => 158.0038}));
        assert.deepEqual(req.annotation.crosslinker.stubs1, "A:54.01056:S");
        assert.deepEqual(req.annotation.crosslinker.stubs2, "S:103.9932:A");
        assert.strictEqual(req.annotation.crosslinker.modMass, 158.0038);
        assert.deepEqual(req.annotation.modifications, [], "crosslinker mods excluded");
    });

    test("missing modification mass triggers an alert", function (assert) {
        const pep = new Peptide({
            id: 1, u_id: "1", seq: "MEK", m_ps: [1], m_as: [{"UNIMOD:35": "Oxidation"}], m_ms: [null], cl_m: 0
        });
        const alerts = withAlertStub(() => buildAnnotationRequest(fakeMzidMatch([pep])));
        assert.deepEqual(alerts, ["Failed: modification mass is undefined"]);
    });

    module("Annotation request: golden files");

    const goldenCases = [
        ...XI2_CASES.map(([name, id]) => [name, xi2Match(id), id]),
        ...MZID_CASES.map(([name, id]) => [name, mzidMatch(id), id]),
    ];
    for (const [name, match, id] of goldenCases) {
        test(name, async function (assert) {
            assert.ok(match, `match ${id} present`);
            if (match) {
                await checkGolden(assert, name, buildAnnotationRequest(match));
            }
        });
    }

    start();
}

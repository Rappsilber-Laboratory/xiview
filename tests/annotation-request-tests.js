import {module, test, start} from "qunit";
import {loadTestData, loadXi2TestData} from "./test-helper";
import {Peptide} from "../js/clms-model/peptide";
import {arrayifyPeptide, buildAnnotationRequest, convert_to_json_request, crosslinkerStubs} from "../js/load-spectrum";
import {SpectrumIdentificationProtocol} from "../js/clms-model/mzidentml-metadata/spectrum-identification-protocol";
import {SearchModification} from "../js/clms-model/mzidentml-metadata/search-modification";

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

    test("crosslinker stubs from the protocol's search modifications: DSSO (several stubs)", function (assert) {
        const dsso = ["A:54.0105647:ST", "S:103.9932001:A", "T:85.9826354:A"];
        for (const id of ["ETD_SII_0", "HCD_SII_0"]) {
            const req = wire(buildAnnotationRequest(mzidMatch(id)));
            assert.deepEqual(req.annotation.crosslinker.stubs1, dsso, id + " donor stubs");
            assert.deepEqual(req.annotation.crosslinker.stubs2, dsso, id + " acceptor stubs");
            assert.notOk(crosslinkerStubs(mzidMatch(id)).unresolved, id + " resolved");
        }
    });

    test("crosslinker stubs from the protocol's search modifications: SDA (one stub each, different)", function (assert) {
        const match = mzidMatch("SII_2_1");
        const refs = match.matchedPeptides.map(p => p.crosslinkerModifications[0].searchModificationRef);
        const expected = {SDA_crosslink_donor: ["S:82.041865:O"], SDA_crosslink_acceptor: ["O:0:S"]};
        const req = wire(buildAnnotationRequest(match));
        assert.deepEqual(req.annotation.crosslinker.stubs1, expected[refs[0]], "peptide 1 (" + refs[0] + ")");
        assert.deepEqual(req.annotation.crosslinker.stubs2, expected[refs[1]], "peptide 2 (" + refs[1] + ")");
    });

    test("crosslinker without search modification id refs (mzIdentML 1.2): no stubs", function (assert) {
        const match = mzidMatch("SII_11_1");
        const req = wire(buildAnnotationRequest(match));
        assert.deepEqual(req.annotation.crosslinker.stubs1, []);
        assert.deepEqual(req.annotation.crosslinker.stubs2, []);
        assert.notOk(match.spectrumIdentificationProtocol.hasCrosslinkerStubs, "protocol has no stubs, so nothing is missing");
    });

    test("Da fragment tolerance from the protocol", function (assert) {
        const req = buildAnnotationRequest(mzidMatch("SII_8_2_p1"));
        assert.deepEqual(req.annotation.fragmentTolerance, {tolerance: 0.03, unit: "Da"});
    });

    test("ion types come from the protocol: c/z for an ETD protocol", function (assert) {
        const req = buildAnnotationRequest(mzidMatch("ETD_SII_0"));
        assert.deepEqual(req.annotation.ions, [{type: "CIon"}, {type: "ZIon"}]);
    });

    test("ion types come from the protocol: b/y for an HCD protocol", function (assert) {
        const req = buildAnnotationRequest(mzidMatch("SII_2_1"));
        assert.deepEqual(req.annotation.ions, [{type: "BIon"}, {type: "YIon"}]);
    });

    test("neutral losses come from the protocol (MS:1000336 H2O, NH3)", function (assert) {
        const req = wire(buildAnnotationRequest(mzidMatch("ETD_SII_0")));
        assert.deepEqual(req.annotation.losses, [
            {id: "H2O", mass: 18.01056027, specificity: ["S", "T", "D", "E", "CTerm"]},
            {id: "NH3", mass: 17.02654493, specificity: ["R", "K", "N", "Q", "NTerm"]},
        ]);
    });

    module("SpectrumIdentificationProtocol: ion series and neutral losses");

    const sipWith = (params) => new SpectrumIdentificationProtocol({id: 0, sip_ref: "SIP", upload_id: 1, additional_search_params: params}, [], []);
    const types = (sip) => sip.ionTypes().map(i => i.type);
    const lossIds = (sip) => sip.losses().map(l => l.id);

    test("current MS:1002473 ion series terms", function (assert) {
        const sip = sipWith({"MS:1001263": "param: z ion", "MS:1001108": "param: a ion", "MS:1001119": "param: c ion",
            "MS:1001261": "param: x ion", "MS:1001118": "param: b ion", "MS:1001262": "param: y ion"});
        assert.deepEqual(types(sip), ["aIon", "bIon", "cIon", "xIon", "yIon", "zIon"], "all six, in a b c x y z order");
        assert.deepEqual(lossIds(sip), ["H2O", "NH3"], "no loss named: H2O and NH3");
        assert.deepEqual(sip.fragmentationWarnings, []);
    });

    test("deprecated ion series + loss terms give the series and the loss (e.g. Scout)", function (assert) {
        const sip = sipWith({"MS:1001118": "param: b ion", "MS:1001149": "param: b ion-NH3", "MS:1001262": "param: y ion",
            "MS:1001151": "param: y ion-NH3"});
        assert.deepEqual(types(sip), ["bIon", "yIon"]);
        assert.deepEqual(lossIds(sip), ["NH3"], "only the loss named");
        assert.deepEqual(sip.fragmentationWarnings, []);
        assert.deepEqual(types(sipWith({"MS:1001150": "param: b ion-H2O"})), ["bIon"], "a loss term alone still names its series");
    });

    test("neutral loss values (MS:1000336), single or repeated, and obsolete loss terms", function (assert) {
        assert.deepEqual(lossIds(sipWith({"MS:1001118": "", "MS:1000336": "water"})), ["H2O"]);
        assert.deepEqual(lossIds(sipWith({"MS:1001118": "", "MS:1000336": ["NH3", "H2O"]})), ["H2O", "NH3"]);
        assert.deepEqual(lossIds(sipWith({"MS:1001118": "", "MS:1002456": "NH3 neutral loss"})), ["NH3"]);
    });

    test("named losses that aren't supported are left out, with a warning, and not replaced by the defaults", function (assert) {
        const sip = sipWith({"MS:1001118": "param: b ion", "MS:1002450": "param: b ion-H3PO4"});
        assert.deepEqual(types(sip), ["bIon"]);
        assert.deepEqual(lossIds(sip), [], "no losses, not H2O/NH3");
        assert.equal(sip.fragmentationWarnings.length, 1);
        assert.ok(sip.fragmentationWarnings[0].includes("H3PO4"));
    });

    test("no supported ion series: b and y, with a warning", function (assert) {
        const none = sipWith({"MS:1001211": "parent mass type mono"});
        assert.deepEqual(types(none), ["bIon", "yIon"]);
        assert.equal(none.fragmentationWarnings.length, 1);
        const unsupported = sipWith({"MS:1001408": "param: z+1 ion"});
        assert.deepEqual(types(unsupported), ["bIon", "yIon"]);
        assert.equal(unsupported.fragmentationWarnings.length, 2, "one for the left-out series, one for the default");
        assert.ok(unsupported.fragmentationWarnings[0].includes("z+1"));
        const missing = new SpectrumIdentificationProtocol({id: 0}, [], []);
        assert.deepEqual(types(missing), ["bIon", "yIon"], "no additional_search_params at all");
    });

    test("ionTypes() / losses() return new objects each call", function (assert) {
        const sip = sipWith({"MS:1001118": ""});
        const a = sip.ionTypes();
        a[0].type = "changed";
        sip.losses()[0].specificity.push("X");
        assert.deepEqual(types(sip), ["bIon"]);
        assert.deepEqual(sip.losses()[0].specificity, ["S", "T", "D", "E", "CTerm"]);
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

    // The mass the annotator will use at each residue of each peptide of a request (null: unmodified)
    const residueMasses = (req) => {
        const massOf = new Map(req.annotation.modifications.map(m => [m.id, m.mass]));
        if (massOf.size !== req.annotation.modifications.length) {
            throw new Error("modification ids are not unique");
        }
        return req.Peptides.map(p => p.sequence.map(a => a.Modification === "" ? null : massOf.get(a.Modification)));
    };

    test("one name, several masses in a peptide (DSSO stub and monolink): each mass gets its own name", function (assert) {
        // MS3 fragment PEPKSK: stub A on K4, hydrolysed DSSO monolink on K6, both named Xlink:DSSO
        const pep = new Peptide({
            id: 1, u_id: "1", seq: "PEPKSK", m_ps: [4, 6],
            m_as: [{"UNIMOD:1842": "Xlink:DSSO", "MS:1003393": "DSSO_crosslink_stub_a"},
                {"UNIMOD:1842": "Xlink:DSSO", "MS:1003393": "DSSO_monolink_W"}],
            m_ms: [54.010565, 176.01433], cl_m: 0
        });
        const req = wire(buildAnnotationRequest(fakeMzidMatch([pep])));
        assert.deepEqual(req.annotation.modifications, [
            {id: "(xlink:dsso_54.010565)", mass: 54.010565, aminoAcids: ["*"]},
            {id: "(xlink:dsso_176.01433)", mass: 176.01433, aminoAcids: ["*"]},
        ]);
        assert.deepEqual(residueMasses(req), [[null, null, null, 54.010565, null, 176.01433]]);
        assert.strictEqual(pep.seq_mods, "PEPK(xlink:dsso)SK(xlink:dsso)", "seq_mods (display, export) unchanged");
    });

    test("MS3 stub-only peptide: the stub is an ordinary modification, no crosslinker stubs", function (assert) {
        // peptide 2 of tests/test-data/get_xiview_peptides.json (mzIdentML 1.3 draft fixture, MS3 of DSSO stub A)
        const pep = new Peptide({id: 2, u_id: "1", seq: "PEPK", m_ps: [4],
            m_as: [{"UNIMOD:1842": "Xlink:DSSO", "MS:1003393": "DSSO_crosslink_stub_a"}], m_ms: [54.010565], cl_m: 0});
        const match = fakeMzidMatch([pep]);
        const req = wire(buildAnnotationRequest(match));
        assert.deepEqual(req.annotation.modifications, [{id: "(xlink:dsso)", mass: 54.010565, aminoAcids: ["*"]}]);
        assert.deepEqual(residueMasses(req), [[null, null, null, 54.010565]]);
        assert.deepEqual(crosslinkerStubs(match), {stubs1: [], stubs2: [], unresolved: false});
    });

    test("one name, several masses across the two peptides of a crosslink: each mass gets its own name", function (assert) {
        const pep0 = new Peptide({id: 1, u_id: "1", seq: "AKTK", m_ps: [2, 4],
            m_as: [{"MS:1002509": 1}, {"UNIMOD:1842": "Xlink:DSSO"}], m_ms: [158.003765, 176.01433], cl_m: 158.003765});
        const pep1 = new Peptide({id: 2, u_id: "1", seq: "KMKR", m_ps: [1, 3],
            m_as: [{"MS:1002510": 1}, {"UNIMOD:1842": "Xlink:DSSO"}], m_ms: [0, 175.030314], cl_m: 0});
        const req = wire(buildAnnotationRequest(fakeMzidMatch([pep0, pep1], {crosslinkerModMass: () => 158.003765})));
        assert.deepEqual(req.annotation.modifications.map(m => m.id), ["(xlink:dsso_176.01433)", "(xlink:dsso_175.030314)"]);
        assert.deepEqual(residueMasses(req), [[null, null, null, 176.01433], [null, null, 175.030314, null]]);
    });

    test("one name with the same mass in both peptides: one name, as it is", function (assert) {
        const ox = (id, seq, pos) => new Peptide({id, u_id: "1", seq, m_ps: [pos],
            m_as: [{"UNIMOD:35": "Oxidation"}], m_ms: [15.994915], cl_m: 0});
        const req = wire(buildAnnotationRequest(fakeMzidMatch([ox(1, "MEK", 1), ox(2, "KMR", 2)])));
        assert.deepEqual(req.annotation.modifications, [{id: "(oxidation)", mass: 15.994915, aminoAcids: ["*"]}]);
        assert.deepEqual(residueMasses(req), [[15.994915, null, null], [null, 15.994915, null]]);
    });

    test("names with a mass appended: no \"-\", and never the same as another modification's name", function (assert) {
        const pep = new Peptide({
            id: 1, u_id: "1", seq: "QKKK", m_ps: [1, 2, 3],
            m_as: [{"UNIMOD:1": "X"}, {"UNIMOD:2": "X"}, {"UNIMOD:3": "x_42.010565"}],
            m_ms: [-17.026549, 42.010565, 1], cl_m: 0
        });
        const req = wire(buildAnnotationRequest(fakeMzidMatch([pep])));
        assert.deepEqual(req.annotation.modifications.map(m => m.id),
            ["(x_minus17.026549)", "(x_42.010565_2)", "(x_42.010565)"]);
        assert.notOk(req.annotation.modifications.some(m => m.id.includes("-")), "no \"-\" (terminal mod) in names");
        assert.deepEqual(residueMasses(req), [[-17.026549, 42.010565, 1, null]]);
    });

    // A protocol whose search modifications are the given {id (MS:1003392): stubs (MS:1003390)} pairs
    const sipWithSearchMods = (mods) => new SpectrumIdentificationProtocol({id: 0, sip_ref: "SIP", upload_id: 1}, [],
        mods.map(([id, stubs], i) => new SearchModification({id: i, upload_id: 1, protocol_id: 0,
            accessions: stubs === undefined ? {"MS:1003392": id} : {"MS:1003392": id, "MS:1003390": stubs}})));
    const dsso = ["A:54.0105647:ST", "S:103.9932001:A", "T:85.9826354:A"];
    const xlPeptides = (ref1, ref2) => [
        new Peptide({id: 1, u_id: "1", seq: "AKT", m_ps: [2],
            m_as: [{"MS:1002509": 1, "MS:1003393": ref1}], m_ms: [158.0038], cl_m: 158.0038}),
        new Peptide({id: 2, u_id: "1", seq: "KMR", m_ps: [1],
            m_as: [{"MS:1002510": 1, "MS:1003393": ref2}], m_ms: [0], cl_m: 0}),
    ];

    test("crosslinker stubs come from the search modification each crosslinker mod refers to (MS:1003393)", function (assert) {
        const sip = sipWithSearchMods([["XL_donor", dsso], ["XL_acceptor", "O:0:S"], ["other", ["X:1:Y"]]]);
        const req = buildAnnotationRequest(fakeMzidMatch(xlPeptides("XL_donor", "XL_acceptor"),
            {spectrumIdentificationProtocol: sip, crosslinkerModMass: () => 158.0038}));
        assert.deepEqual(req.annotation.crosslinker.stubs1, dsso, "several stubs: a list");
        assert.deepEqual(req.annotation.crosslinker.stubs2, ["O:0:S"], "one stub (stored as a string): still a list");
        assert.strictEqual(req.annotation.crosslinker.modMass, 158.0038);
        assert.deepEqual(req.annotation.modifications, [], "crosslinker mods excluded");
        assert.notOk(crosslinkerStubs(fakeMzidMatch(xlPeptides("XL_donor", "XL_acceptor"),
            {spectrumIdentificationProtocol: sip})).unresolved);
    });

    test("MS:1003390 on the peptide's own modification is not used", function (assert) {
        const pep = new Peptide({id: 1, u_id: "1", seq: "AKT", m_ps: [2],
            m_as: [{"MS:1002509": 1, "MS:1003390": "A:54.01056:S"}], m_ms: [158.0038], cl_m: 158.0038});
        const sip = sipWithSearchMods([["XL_donor", dsso]]);
        const match = fakeMzidMatch([pep], {spectrumIdentificationProtocol: sip});
        assert.deepEqual(buildAnnotationRequest(match).annotation.crosslinker.stubs1, []);
        assert.ok(crosslinkerStubs(match).unresolved, "no search modification id ref: unresolved");
    });

    test("crosslinker mod whose search modification can't be found, or is ambiguous: no stubs, unresolved", function (assert) {
        const unknown = fakeMzidMatch(xlPeptides("XL_donor", "missing"),
            {spectrumIdentificationProtocol: sipWithSearchMods([["XL_donor", dsso]])});
        assert.deepEqual(crosslinkerStubs(unknown), {stubs1: dsso, stubs2: [], unresolved: true});

        const ambiguous = fakeMzidMatch(xlPeptides("XL_donor", "XL_donor"),
            {spectrumIdentificationProtocol: sipWithSearchMods([["XL_donor", dsso], ["XL_donor", "S:1:A"]])});
        assert.deepEqual(crosslinkerStubs(ambiguous), {stubs1: [], stubs2: [], unresolved: true},
            "same id with different stubs: neither is used");

        const repeated = fakeMzidMatch(xlPeptides("XL_donor", "XL_donor"),
            {spectrumIdentificationProtocol: sipWithSearchMods([["XL_donor", dsso], ["XL_donor", dsso.slice()]])});
        assert.deepEqual(crosslinkerStubs(repeated), {stubs1: dsso, stubs2: dsso, unresolved: false},
            "same id with the same stubs: fine");

        const noSip = fakeMzidMatch(xlPeptides("XL_donor", "XL_acceptor"));
        assert.deepEqual(crosslinkerStubs(noSip), {stubs1: [], stubs2: [], unresolved: true}, "no protocol");
    });

    test("non-cleavable crosslinker: no stubs, resolved; linear peptide: no stubs", function (assert) {
        const sip = sipWithSearchMods([["XL_donor", undefined], ["XL_acceptor", undefined]]);
        assert.notOk(sip.hasCrosslinkerStubs);
        assert.deepEqual(crosslinkerStubs(fakeMzidMatch(xlPeptides("XL_donor", "XL_acceptor"),
            {spectrumIdentificationProtocol: sip})), {stubs1: [], stubs2: [], unresolved: false});
        const linear = new Peptide({id: 1, u_id: "1", seq: "MEK", m_ps: [1], m_as: [{"UNIMOD:35": "Oxidation"}], m_ms: [15.9949], cl_m: 0});
        assert.deepEqual(crosslinkerStubs(fakeMzidMatch([linear], {spectrumIdentificationProtocol: sip})),
            {stubs1: [], stubs2: [], unresolved: false});
        assert.ok(sipWithSearchMods([["XL_donor", "S:1:A"]]).hasCrosslinkerStubs);
    });

    test("looplink: stubs of both crosslinker mods, without duplicates", function (assert) {
        const loop = new Peptide({id: 1, u_id: "1", seq: "AKTKR", m_ps: [2, 4],
            m_as: [{"MS:1002509": 1, "MS:1003393": "XL_donor"}, {"MS:1002510": 1, "MS:1003393": "XL_acceptor"}],
            m_ms: [82.04, 0], cl_m: 82.04});
        const sip = sipWithSearchMods([["XL_donor", ["S:82.041865:O", "A:1:B"]], ["XL_acceptor", ["O:0:S", "A:1:B"]]]);
        assert.deepEqual(crosslinkerStubs(fakeMzidMatch([loop], {spectrumIdentificationProtocol: sip})),
            {stubs1: ["S:82.041865:O", "A:1:B", "O:0:S"], stubs2: [], unresolved: false});
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

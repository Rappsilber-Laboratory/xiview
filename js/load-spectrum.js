import * as _ from "underscore";
import {showMessage} from "./ui-utils/message-popup";
import {DEFAULT_LOSSES, lossObjects} from "./clms-model/mzidentml-metadata/spectrum-identification-protocol";

/**
 * Protocols whose ion series / neutral loss warnings have already been shown (once per protocol per page)
 * @type {WeakSet<Object>}
 */
const fragmentationWarningsShown = new WeakSet();

/**
 * Uploads for which the "no protocol, so default ion series / losses" warning has been shown
 * @type {Set<*>}
 */
const noProtocolWarningShown = new Set();

/**
 * Show, once per protocol, any problems reading the ion series / neutral losses used to annotate this match.
 * @param {SpectrumMatch} match - The spectrum match being annotated
 * @returns {void}
 */
function showFragmentationWarnings(match) {
    const sip = match.spectrumIdentificationProtocol;
    if (!sip) {
        if (!noProtocolWarningShown.has(match.uploadId)) {
            noProtocolWarningShown.add(match.uploadId);
            console.warn("No spectrum identification protocol for upload " + match.uploadId + ", using b and y ions and H2O and NH3 losses");
            showMessage("Spectrum annotation: no search protocol for this match, so b and y ions and H2O and NH3 losses are used.", "warning");
        }
        return;
    }
    const warnings = sip.fragmentationWarnings;
    if (!warnings || warnings.length === 0 || fragmentationWarningsShown.has(sip)) { // xi2 SIPs have no fragmentationWarnings
        return;
    }
    fragmentationWarningsShown.add(sip);
    console.warn("Spectrum identification protocol " + sip.spectrumIdentificationProtocolRef + ":", warnings);
    showMessage("Spectrum annotation (protocol " + _.escape(String(sip.spectrumIdentificationProtocolRef)) + "): "
        + warnings.map(w => _.escape(w)).join("; ") + ".", "warning");
}

/**
 * Protocols whose "crosslinker stubs not found" warning has already been shown (once per protocol per page)
 * @type {WeakSet<Object>}
 */
const stubWarningsShown = new WeakSet();

/**
 * Crosslinker cleavage stubs for an mzIdentML match, from its protocol's search modifications:
 * each crosslinker modification of a peptide names its search modification (MS:1003393), which
 * lists the stubs (MS:1003390). A looplink peptide gets the stubs of both of its crosslinker
 * modifications.
 * @param {SpectrumMatch} match - The spectrum match
 * @returns {{stubs1: Array<string>, stubs2: Array<string>, unresolved: boolean}} unresolved is true
 *  if a crosslinker modification could not be matched to a search modification
 */
export function crosslinkerStubs(match) {
    const sip = match.spectrumIdentificationProtocol;
    let unresolved = false;
    const peptideStubs = function (peptide) {
        const stubs = [];
        if (!peptide) {
            return stubs;
        }
        for (const mod of peptide.crosslinkerModifications) {
            const ref = mod.searchModificationRef;
            const found = (sip && ref !== undefined && ref !== null) ? sip.crosslinkerStubs(ref) : undefined;
            if (found === undefined) {
                unresolved = true;
                continue;
            }
            for (const stub of found) {
                if (!stubs.includes(stub)) {
                    stubs.push(stub);
                }
            }
        }
        return stubs;
    };
    const stubs1 = peptideStubs(match.matchedPeptides[0]);
    const stubs2 = peptideStubs(match.matchedPeptides[1]);
    return {stubs1, stubs2, unresolved};
}

/**
 * Show, once per protocol, that a match's crosslinker could not be matched to a search
 * modification of a protocol that has crosslinker cleavage stubs, so stubs may be missing from
 * its annotation. (If the protocol has no stubs at all, nothing is missing and nothing is shown.)
 * @param {SpectrumMatch} match - The spectrum match being annotated
 * @returns {void}
 */
function showStubWarning(match) {
    const sip = match.spectrumIdentificationProtocol;
    if (!sip || !sip.hasCrosslinkerStubs || stubWarningsShown.has(sip) || !crosslinkerStubs(match).unresolved) {
        return;
    }
    stubWarningsShown.add(sip);
    const message = "Spectrum annotation (protocol " + _.escape(String(sip.spectrumIdentificationProtocolRef))
        + "): a crosslinker modification could not be matched to one of the protocol's search modifications"
        + " (no or unknown search modification id ref), so crosslinker cleavage stubs may be missing from the annotation.";
    console.warn(message);
    showMessage(message, "warning");
}

/**
 * The modification names to send to the annotator for an mzIdentML match. Each modification
 * is named by its CV name (Peptide modification name), but different modifications can share
 * one: e.g. "Xlink:DSSO" is given to every DSSO stub and monolink, which differ in mass. The
 * annotator gets one mass per name, so a name that has several masses in the request (in
 * either peptide) gets its mass appended, one name per mass ("-" is written as "minus": in a
 * name, the annotator reads "-" as marking a terminal modification). A name with one mass
 * is used as it is.
 * @param {Array<Peptide>} peptides - The match's peptides
 * @returns {{nameOf: function(Object): string, modifications: Array<{name: string, mass: number}>}}
 *  nameOf gives the annotator name of a (non-crosslinker) modification of one of the peptides;
 *  modifications lists each annotator name once, with its mass, in order of first occurrence
 */
export function annotatorModifications(peptides) {
    const massesByName = new Map();
    for (const peptide of peptides) {
        for (const mod of peptide.modifications) {
            if (mod.isCrosslinker) {
                continue;
            }
            if (!massesByName.has(mod.name)) {
                massesByName.set(mod.name, []);
            }
            const masses = massesByName.get(mod.name);
            if (!masses.includes(mod.mass)) {
                masses.push(mod.mass);
            }
        }
    }
    // names used as they are, so that a name with a mass appended can't be the same as one
    const used = new Set();
    for (const [name, masses] of massesByName) {
        if (masses.length === 1) {
            used.add(name);
        }
    }
    const annotatorNames = new Map(); // name -> mass -> annotator name
    const modifications = [];
    for (const [name, masses] of massesByName) {
        const byMass = new Map();
        for (const mass of masses) {
            let annotatorName = name;
            if (masses.length > 1) {
                const withMass = name + "_" + String(mass).replace(/-/g, "minus");
                annotatorName = withMass;
                for (let n = 2; used.has(annotatorName); n++) {
                    annotatorName = withMass + "_" + n;
                }
            }
            used.add(annotatorName);
            byMass.set(mass, annotatorName);
            modifications.push({name: annotatorName, mass});
        }
        annotatorNames.set(name, byMass);
    }
    const nameOf = mod => annotatorNames.get(mod.name).get(mod.mass);
    return {nameOf, modifications};
}

/**
 * Load spectrum data from PRIDE for a given spectrum match
 * @param {SpectrumMatch} match - The spectrum match to load spectrum data for
 * @returns {void}
 */
export const loadSpectrum = function (match) {
    const json_request = buildAnnotationRequest(match);
    // no peak list was uploaded for this match (e.g. CSV without peak lists): nothing to load
    if (json_request === null) {
        return;
    }
    if (json_request.annotation.config === undefined) { // mzIdentML style: ion series / losses come from the SIP
        showFragmentationWarnings(match);
        showStubWarning(match);
    }

    this.get("xispec_wrapper").loadSpectrum(
        {id: match.spectrumId, sd_ref: match.spectraDataId, upload_id: match.uploadId},
        json_request);
};

/**
 * Build the annotation request body that loadSpectrum POSTs (via the API, which
 * injects the peaks) to the annotator. Pure apart from the alert() on a missing
 * modification mass; exported so the request shape can be tested.
 * @param {SpectrumMatch} match - The spectrum match to annotate
 * @returns {Object|null} The annotation request, or null if the match has no peak list
 */
export function buildAnnotationRequest (match) {
    // no peak list was uploaded for this match (e.g. CSV without peak lists): nothing to load
    if (match.spectraDataId === null || match.spectraDataId === undefined) {
        return null;
    }
    const formatted_data = {};
    const pep0 = match.matchedPeptides[0];
    const pep1 = match.matchedPeptides[1];

    // Fields common to both data sources.
    formatted_data.linkPos1 = match.linkPos1 - 1;
    if (pep1) {
        formatted_data.linkPos2 = match.linkPos2 - 1;
    }
    formatted_data.precursorCharge = match.precursorCharge;
    formatted_data.precursorMZ = match.precursorMZ;
    formatted_data.requestID = match.id;
    formatted_data.peakList = [];

    // The xi2 SIP surfaces the raw search config; the mzIdentML SIP does not.
    // Its presence selects the request style.
    const sip = match.spectrumIdentificationProtocol;
    const xi2Config = sip ? sip.searchConfig : undefined;

    if (xi2Config) {
        // xi2 style: pass base sequence + modification indexes + the search config,
        // and let the xi2 annotator resolve modification masses / stubs from the
        // config (some config mods carry only a composition, no mass - by design).
        // sequence1/2 are still required by convert_to_json_request (arrayifyPeptide).
        formatted_data.sequence1 = pep0.seq_mods;
        formatted_data.base_sequence1 = pep0.sequence;
        formatted_data.mod_pos1 = pep0.mod_pos;
        formatted_data.mod_ids1 = pep0.mod_acc;
        if (pep1) {
            formatted_data.sequence2 = pep1.seq_mods;
            formatted_data.base_sequence2 = pep1.sequence;
            formatted_data.mod_pos2 = pep1.mod_pos;
            formatted_data.mod_ids2 = pep1.mod_acc;
        }
        // Clone so downstream mutation (e.g. the spectrum controls form) can't
        // corrupt the config shared by the SIP.
        formatted_data.config = JSON.parse(JSON.stringify(xi2Config));
        // TODO(verify at runtime): crosslinkerID indexes config.crosslinker[]; without
        // it convert_to_json_request empties config.crosslinker. Assumes a single
        // crosslinker (index 0). Also confirm mod_pos convention (annotator may want
        // 0-based with -1=Nterm / 32767=Cterm rather than the 1-based API positions).
        if (xi2Config.crosslinker && xi2Config.crosslinker.length) {
            formatted_data.crosslinkerID = 0;
        }
    } else {
        // mzIdentML style: peptides self-describe their mods via CV objects.
        const annotatorMods = annotatorModifications(pep1 ? [pep0, pep1] : [pep0]);
        formatted_data.sequence1 = pep0.modifiedSequence(annotatorMods.nameOf);
        if (pep1) {
            formatted_data.sequence2 = pep1.modifiedSequence(annotatorMods.nameOf);
        }
        const stubs = crosslinkerStubs(match);
        formatted_data.stubs1 = stubs.stubs1;
        formatted_data.stubs2 = stubs.stubs2;
        formatted_data.crossLinkerModMass = match.crosslinkerModMass();

        const modifications = [];
        for (const {name, mass} of annotatorMods.modifications) {
            modifications.push({id: "(" + name + ")", mass, aminoAcids: ["*"]});
            if (mass === undefined || mass === null) {
                alert("Failed: modification mass is undefined");
            }
        }
        formatted_data.modifications = modifications;
        formatted_data.fragmentTolerance = match.fragmentTolerance();

        const ions = match.ionTypes();
        formatted_data.ionTypes = ions.map(function (ion) {
            return ion.type.replace("Ion", "");
        }).join(";");
        // neutral losses from the protocol (H2O and NH3 if it names none, as the annotator would do itself)
        formatted_data.losses = sip ? sip.losses() : lossObjects(DEFAULT_LOSSES);
    }

    return convert_to_json_request(formatted_data);
}

export function arrayifyPeptide (seq_mods) {
    let peptide = {};
    peptide.sequence = [];

    const seq_AAonly = seq_mods.replace(/[^A-Z]/g, "");
    let seq_length = seq_AAonly.length;

    for (let i = 0; i < seq_length; i++) {
        peptide.sequence[i] = {"aminoAcid": seq_AAonly[i], "Modification": ""};
    }

    const re = /[^A-Z]+/g;
    let offset = 1;
    let result;
    while (result = re.exec(seq_mods)) {
        const seqIndex = Math.max(0, result.index - offset);
        peptide.sequence[seqIndex]["Modification"] = result[0];
        offset += result[0].length;
    }
    return peptide;
}

export function convert_to_json_request(data) {

    //if (!this.sanityChecks(data)) return false;

    // defaults
    if (data.ionTypes === undefined) {
        data.ionTypes = "peptide;b;y";
    }
    if (data.crossLinkerModMass === undefined) {
        data.crossLinkerModMass = 0;
    }
    if (data.modifications === undefined) {
        data.modifications = [];
    }
    if (data.fragmentTolerance === undefined) {
        data.fragmentTolerance = {"tolerance": "10.0", "unit": "ppm"};
    }
    if (data.requestID === undefined) {
        data.requestID = -1;
    }
    // if (data.crosslinkerID === undefined) {
    //     data.crosslinkerID = -1;
    // }

    let annotationRequest = {};
    let peptides = [];
    let linkSites = [];
    // xi1annotator style modified peptides
    peptides[0] = arrayifyPeptide(data.sequence1);
    if (data.sequence2 !== undefined) {
        peptides[1] = arrayifyPeptide(data.sequence2);
        linkSites[1] = {"id": 0, "peptideId": 1, "linkSite": data.linkPos2};
    }
    // xi2annotator style modified peptides
    if (data.base_sequence1 !== undefined){
        peptides[0]["base_sequence"] = data.base_sequence1;
    }
    if (data.base_sequence2 !== undefined){
        peptides[1]["base_sequence"] = data.base_sequence2;
    }
    if (data.mod_pos1 !== undefined) {
        peptides[0]["modification_positions"] = data.mod_pos1;
    }
    if (data.mod_pos2 !== undefined) {
        peptides[1]["modification_positions"] = data.mod_pos2;
    }
    if (data.mod_ids1 !== undefined) {
        peptides[0]["modification_ids"] = data.mod_ids1;
    }
    if (data.mod_ids2 !== undefined) {
        peptides[1]["modification_ids"] = data.mod_ids2;
    }

    if (data.linkPos1 !== undefined) {
        linkSites[0] = {"id": 0, "peptideId": 0, "linkSite": data.linkPos1};
    }

    let peaks = [];
    for (let i = 0; i < data.peakList.length; i++) {
        peaks.push(
            {"intensity": data.peakList[i][1], "mz": data.peakList[i][0]}
        );
    }

    annotationRequest.Peptides = peptides;
    annotationRequest.LinkSite = linkSites;
    annotationRequest.peaks = peaks;
    annotationRequest.annotation = {};
    annotationRequest.annotation.requestID = data.requestID.toString();
    annotationRequest.annotation.crosslinkerID = data.crosslinkerID;
    annotationRequest.annotation.precursorCharge = +data.precursorCharge;
    annotationRequest.annotation.modifications = data.modifications;
    annotationRequest.annotation.precursorMZ = +data.precursorMZ;
    annotationRequest.annotation.returnModSyntax = "Xmod";
    annotationRequest.annotation.crosslinker = {};
    annotationRequest.annotation.crosslinker.stubs1 = data.stubs1 || []; //['A:82.041864:S']; // crosslink acceptor stubs
    annotationRequest.annotation.crosslinker.stubs2 = data.stubs2 || []; //['S:0.0:A']; // crosslink donor stubs


    // check if it's xi1 or xi2 style annotation
    if(data.config !== undefined){
        annotationRequest.annotation.config = data.config;
        if (annotationRequest.annotation.crosslinkerID === undefined){
            annotationRequest.annotation.config.crosslinker = [];
        }
    } else {

        let ionTypes = data.ionTypes.split(";");
        //remove empty strings from list
        ionTypes = ionTypes.filter(Boolean);
        let ions = [];
        for (let it = 0; it < ionTypes.length; it++) {
            let ionType = ionTypes[it];
            ions.push({"type": (ionType.charAt(0).toUpperCase() + ionType.slice(1) + "Ion")});
        }
        annotationRequest.annotation.fragmentTolerance = data.fragmentTolerance;
        annotationRequest.annotation.ions = ions;
        annotationRequest.annotation.crosslinker.modMass = data.crossLinkerModMass;
        annotationRequest.annotation.losses = data.losses;
    }

    console.log("request", annotationRequest);
    return annotationRequest;
}

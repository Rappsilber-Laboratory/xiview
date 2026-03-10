/**
 * Load spectrum data from PRIDE for a given spectrum match
 * @param {SpectrumMatch} match - The spectrum match to load spectrum data for
 * @returns {void}
 */
export const prideLoadSpectrum = function (match) {
    // if (match.spectrum && match.spectrum.pks) {
    const formatted_data = {};

    const modMap = new Map();
    /**
     * Collect modifications from a peptide
     * @param {Peptide} peptide - The peptide to collect modifications from
     * @returns {void}
     */
    function collectMods(peptide) { // yeah, this is awful, tidy up once knwo what annotator really needs
        // let seqMods = "";
        const pepLen = peptide.sequence.length;
        for (let i = 0; i < pepLen; i++) {
            // seqMods += peptide.sequence[i];
            if (peptide.mod_pos.indexOf(i + 1) !== -1){
                const modIndex = peptide.mod_pos.indexOf(i + 1); //?

                const allModCvs = peptide.mod_acc[modIndex]; // take out the crosslinker mods
                const allModCvsKeys = Object.keys(allModCvs);
                if (!allModCvsKeys.includes("MS:1002509") && !allModCvsKeys.includes("MS:1002510")) {
                    // const modName = "(" + peptide.mod_masses[modIndex] + ")";
                    const modName = "(" + Object.values(peptide.mod_acc[modIndex])[0].toLowerCase().replace(/\s+/g, "") + ")";
                    // seqMods += modName;
                    if (!modMap.has(modName)) {
                        modMap.set(modName, peptide.mod_masses[modIndex]);
                    }
                }
            }
        }

        // return seqMods;
    }

    collectMods(match.matchedPeptides[0]);
    formatted_data.sequence1 = match.matchedPeptides[0].seq_mods;
    formatted_data.linkPos1 = match.linkPos1 - 1;
    if (match.matchedPeptides[1]) {
        collectMods(match.matchedPeptides[1]);
        formatted_data.sequence2 = match.matchedPeptides[1].seq_mods;
        formatted_data.linkPos2 = match.linkPos2 - 1;
    }
    formatted_data.crossLinkerModMass = match.crosslinkerModMass();

    const modifications = [];
    modMap.forEach(function (value, key) {
        modifications.push({id: key, mass: value, aminoAcids: ["*"]});
        if (value === undefined || value === null) {
            alert("Failed: modification mass is undefined");
        }
    });

    formatted_data.modifications = modifications;
    formatted_data.precursorCharge = match.precursorCharge;
    formatted_data.fragmentTolerance = match.fragmentTolerance();

    const ions = match.ionTypes();
    formatted_data.ionTypes = ions.map(function (ion) {
        return ion.type.replace("Ion", "");
    }).join(";");
    formatted_data.precursorMZ = match.precursorMZ;
    formatted_data.requestID = match.id;
    formatted_data.stubs1 = match.matchedPeptides[0].stubs;
    formatted_data.stubs2 = match.matchedPeptides[1].stubs;


    formatted_data.peakList = [];
    const json_request = this.get("xispec_wrapper").convert_to_json_request(formatted_data);

    const url = this.get("apiBase") + "get_annotated_peaklist"
        + "?id=" + encodeURIComponent(match.spectrumId)
        + "&sd_ref=" + encodeURIComponent(match.spectraDataId)
        + "&upload_id=" + encodeURIComponent(match.uploadId);

    fetch(url, {
        method: "POST",
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify(json_request),
    })
        .then(response => {
            if (!response.ok) {
                throw new Error("Network response was not ok");
            }
            return response.json();
        })
        .then(data => {
            const rangeErrorEl = document.querySelector("#range-error");
            if (rangeErrorEl) {
                rangeErrorEl.textContent = "";
            }
            this.get("xispec_wrapper").receiveAnnotatedData(data, json_request);
        })
        .catch(error => {
            console.log("error getting annotated peak list", error);
        });
    // }
};

function arrayifyPeptide (seq_mods) {
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
        peptide.sequence[result.index - offset]["Modification"] = result[0];
        offset += result[0].length;
    }
    return peptide;
}

function convert_to_json_request(data) {

    if (!this.sanityChecks(data)) return false;

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
    peptides[0] = this.arrayifyPeptide(data.sequence1);
    if (data.sequence2 !== undefined) {
        peptides[1] = this.arrayifyPeptide(data.sequence2);
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

/**
 * Load spectrum data from PRIDE for a given spectrum match
 * @param {SpectrumMatch} match - The spectrum match to load spectrum data for
 * @returns {void}
 */
export const loadSpectrum = function (match) {
    // if (match.spectrum && match.spectrum.pks) {
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
        const modMap = new Map();
        /**
         * Collect modifications from a peptide
         * @param {Peptide} peptide - The peptide to collect modifications from
         * @returns {void}
         */
        const collectMods = function (peptide) { // yeah, this is awful, tidy up once knwo what annotator really needs
            for (let i = 0; i < peptide.mod_pos.length; i++) {
                const allModCvs = peptide.mod_acc[i]; // take out the crosslinker mods
                const allModCvsKeys = Object.keys(allModCvs);
                if (!allModCvsKeys.includes("MS:1002509") && !allModCvsKeys.includes("MS:1002510")) {
                    const modName = "(" + Object.values(allModCvs)[0].toLowerCase().replace(/\s+/g, "") + ")";
                    if (!modMap.has(modName)) {
                        modMap.set(modName, peptide.mod_masses[i]);
                    }
                }
            }
        };

        collectMods(pep0);
        formatted_data.sequence1 = pep0.seq_mods;
        formatted_data.stubs1 = pep0.stubs;
        if (pep1) {
            collectMods(pep1);
            formatted_data.sequence2 = pep1.seq_mods;
            formatted_data.stubs2 = pep1.stubs;
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
        formatted_data.fragmentTolerance = match.fragmentTolerance();

        const ions = match.ionTypes();
        formatted_data.ionTypes = ions.map(function (ion) {
            return ion.type.replace("Ion", "");
        }).join(";");
    }

    const json_request = convert_to_json_request(formatted_data);

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
        const seqIndex = Math.max(0, result.index - offset);
        peptide.sequence[seqIndex]["Modification"] = result[0];
        offset += result[0].length;
    }
    return peptide;
}

function convert_to_json_request(data) {

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

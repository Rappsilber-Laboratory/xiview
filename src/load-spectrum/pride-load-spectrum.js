export const prideLoadSpectrum = function (match) {
    // if (match.spectrum && match.spectrum.pks) {
    const formatted_data = {};

    const modMap = new Map();
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
    formatted_data.precursorMZ = match.expMZ();
    formatted_data.requestID = match.id;
    formatted_data.stubs1 = match.matchedPeptides[0].stubs;
    formatted_data.stubs2 = match.matchedPeptides[1].stubs;


    const url = window.compositeModelInst.get("apiBase") + "get_peaklist" + "?id=" +  encodeURIComponent(match.spectrumId)
                    + "&sd_ref=" +  encodeURIComponent(match._identification.sd)
                    + "&upload_id=" +  encodeURIComponent(match.uploadId);

    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error("Network response was not ok");
            }
            return response.json();
        })
        .then(json => {
            const rangeErrorEl = document.querySelector("#range-error");
            if (rangeErrorEl) {
                rangeErrorEl.textContent = "";
            }

            const peakArray = [];
            const peakCount = json.mz.length;
            for (let i = 0; i < peakCount; i++) {
                peakArray.push([json.mz[i], json.intensity[i]]);
            }

            formatted_data.peakList = peakArray; //JSON.parse(text).map(function(p){ return [p.mz, p.intensity]; });
            window.compositeModelInst.get("xispec_wrapper").setData(formatted_data);
        })
        .catch(error => {
            console.log("error getting peak list", error);
        });
    // }
};

import d3 from "d3";

export const loadSpectrum = function (match, randId, spectrumModel) {

    const formatted_data = {};

    formatted_data.sequence1 = match.matchedPeptides[0].seq_mods;
    formatted_data.linkPos1 = match.linkPos1 - 1;
    if (match.matchedPeptides[1]) {
        formatted_data.sequence2 = match.matchedPeptides[1].seq_mods;
        formatted_data.linkPos2 = match.linkPos2 - 1;
    }
    formatted_data.crossLinkerModMass = match.crosslinkerModMass()
    formatted_data.modifications = xiSPEC.activeSpectrum.models.Spectrum.knownModifications;
    formatted_data.precursorCharge = match.precursorCharge;
    formatted_data.fragmentTolerance = match.fragmentTolerance();

    const search = window.compositeModelInst.get("clmsModel").get("searches").get(match.searchId);
    formatted_data.customConfig = search.customsettings.split('\n');


    formatted_data.losses = [];
    search.losses.forEach(function (loss) {
        const formatted_loss = {};
        const match = /(?=.*NAME:([^;]+))(?=.*aminoacids:([^;]+))(?=.*MASS:([^;]+)).*/.exec(loss.description);
        if (match) {
            formatted_loss.id = match[1];
            formatted_loss.specificity = match[2].split(',');
            formatted_loss.mass = parseFloat(match[3]);
            if (loss.description.indexOf(';nterm') !== -1)
                formatted_loss.specificity.push('NTerm');
            if (loss.description.indexOf(';cterm') !== -1)
                formatted_loss.specificity.push('CTerm');
        }
        formatted_data.losses.push(formatted_loss);
        // ToDo: remove tmp fix for losses to customConfig
        // formatted_data.customConfig.push(loss.description);
    });

    const ions = match.ionTypes();
    formatted_data.ionTypes = ions.map(function (ion) {
        return ion.type.replace("Ion", "")
    }).join(';')
    formatted_data.precursorMZ = match.expMZ();
    formatted_data.requestID = match.id;
    formatted_data.spectrum_title = 'PSMID: ' + match.id;

    console.log("loadSpectrum match:" + match.id);

    d3.text('../CLMS-model/php/peakList.php?sid=' + match.searchId + '-' + randId + '&spid=' + match.spectrumId, function (error, text) {
        if (error) {
            console.log("error getting peak list", error);
        } else {
            if (text === "false") {
                const xiVersion = window.compositeModelInst.get("clmsModel").get("searches").get(match.searchId).version;
                const message = "Missing peak list for spectrum " + match.spectrumId + ". xiSearch v" + xiVersion;
                alert(message);
                // xiSPEC.clear();
            } else {
                d3.select("#range-error").text("");
                formatted_data.peakList = JSON.parse(text).map(function (p) {
                    return [p.mz, p.intensity];
                });
                console.log(formatted_data);
                xiSPEC.setData(formatted_data);
            }
        }
    });

};

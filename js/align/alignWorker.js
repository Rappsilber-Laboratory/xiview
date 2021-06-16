if (importScripts) {
    importScripts("bioseq32.js", "../../../vendor/js/workerpool.js", "../../../vendor/js/underscore.js", "../../../vendor/js/backbone.js", "alignModelType.js?v=2");
}

function protAlignPar(protID, settings, compSeqArray, tempSemiLocal) {
    settings.aligner = CLMSUI.GotohAligner;
    var protAlignModel = ProtAlignModel.prototype;
    var fullResults = protAlignModel.alignWithoutStoringWithSettings(compSeqArray, tempSemiLocal, settings);
    return {
        fullResults: fullResults,
        protID: protID
    };
}

// create a worker and register public functions
workerpool.worker({
    protAlignPar: protAlignPar
});
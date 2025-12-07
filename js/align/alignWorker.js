/**
 * @fileoverview Web Worker for parallel protein alignment (currently disabled).
 * Intended for running Gotoh alignment in background threads for large protein sets.
 * Would use workerpool library to distribute alignment tasks across workers.
 * Currently commented out - alignment runs on main thread.
 */

/*
if (importScripts) {
    importScripts("bioseq32.js", "../../../vendor/js/workerpool.js", "../../../vendor/js/underscore.js", "../../../vendor/js/backbone.js", "sequence-model-collection.js", "protein-alignment-model-collection.js");
}

function protAlignPar(protID, settings, compSeqArray, tempSemiLocal) {
    settings.aligner = CLMSUI.GotohAligner;
    const protAlignModel = ProtAlignModel.prototype;
    const fullResults = protAlignModel.alignWithoutStoringWithSettings(compSeqArray, tempSemiLocal, settings);
    return {
        fullResults: fullResults,
        protID: protID
    };
}

// create a worker and register public functions
workerpool.worker({
    protAlignPar: protAlignPar
});

 */

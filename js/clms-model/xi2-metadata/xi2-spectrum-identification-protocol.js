/**
 * Xi2 equivalent of SpectrumIdentificationProtocol.
 *
 * Mirrors the public interface of
 * js/clms-model/mzidentml-metadata/spectrum-identification-protocol.js
 * so downstream consumers (SpectrumMatch, MzidentmlFile, etc.) need not
 * distinguish between the two.
 *
 * Constructed from one value of the dict returned by
 *   GET /xi2/data/get_xiview_spectrum_identification_protocols
 * where each value carries: id (resultset id), rs_name, rs_note, rs_config
 * (already-parsed object when it is JSON, otherwise a raw text report
 * string), rs_main_score, resultset_type, s_id, s_name, s_config
 * (already-parsed search config object), s_note.
 *
 * Enzymes / search modifications / crosslinkers / fragmentation rules all
 * live inside s_config and are exposed via getters here rather than via
 * separate Enzyme / SearchModification endpoints.
 */
export class Xi2SpectrumIdentificationProtocol {
    #json;
    #sConfig;
    #rsConfig;

    constructor(json) {
        this.#json = json;
        this.#sConfig = json?.s_config ?? {};
        // this could be JSON or text string.
        this.#rsConfig = json.rs_config;
    }

    get id() {
        return this.#json.id;
    }

    get spectrumIdentificationProtocolRef() {
        return "xi2_" + this.#json.id;
    }

    get uploadId() {
        return this.#json.id;
    }

    /**
     * Search id (peptides carry this as their u_id, so it is used to map a
     * peptide back to the protocol that defines its modifications).
     * @returns {string}
     */
    get searchId() {
        return this.#json.s_id;
    }

    /**
     * The raw search config (s_config) object. Passed verbatim as the
     * `config` field of the xi2-style annotator request, from which the
     * annotator resolves modification masses, crosslinker stubs, etc.
     * @returns {Object}
     */
    get searchConfig() {
        return this.#sConfig;
    }

    /**
     * The ordered modifications list from the search config. In xi2 a
     * peptide's/match's modification ids are 0-based indexes into this array.
     * Mirrors the `searchModifications` getter on the mzIdentML
     * SpectrumIdentificationProtocol so consumers need not branch on source.
     * Note: some entries carry only `composition` (no `mass`).
     * @returns {Array<Object>} modification defs {name, long_name, mass?, composition?, specificity, type, level}
     */
    get searchModifications() {
        return this.#sConfig?.modification?.modifications ?? [];
    }

    /**
     * Resolve a 0-based modification index to its config definition.
     * @param {number} index
     * @returns {Object|undefined}
     */
    modificationByIndex(index) {
        return this.searchModifications[index];
    }

    get fragmentTolerance() {
        return this.#parsedFragTol().value;
    }

    get fragmentToleranceUnit() {
        return this.#parsedFragTol().unit;
    }

    get additionalSearchParams() {
        return {};
    }

    get analysisSoftware() {
        const name = this.#json.resultset_type || "Xi2";
        return {
            name,
            version: "",
            id: name,
            SoftwareName: { [name]: "" }
        };
    }

    get threshold() {
        return this.#rsConfig.thresholds ?? {};
    }

    fragmentToleranceString() {
        const fragTol = this.#parsedFragTol();
        if (fragTol.value !== undefined) {
            return fragTol.value + " " + fragTol.unit;
        }
    }

    ionTypes() {
        const frag = this.#sConfig.fragmentation || {};
        const types = [];
        for (const ion of (frag.nterm_ions || [])) {
            types.push({ type: ion + "Ion" });
        }
        for (const ion of (frag.cterm_ions || [])) {
            types.push({ type: ion + "Ion" });
        }
        return types;
    }

    toJSON() {
        return {
            spectrumIdentificationProtocolRef: this.spectrumIdentificationProtocolRef,
            fragmentTolerance: this.fragmentTolerance,
            fragmentToleranceUnit: this.fragmentToleranceUnit,
            additionalSearchParams: this.additionalSearchParams,
            analysisSoftware: this.analysisSoftware,
            threshold: this.threshold,
            sConfig: this.#sConfig,
            rsConfig: this.#rsConfig,
            rsName: this.#json.rs_name,
            rsNote: this.#json.rs_note
        };
    }

    // Parses strings like "5.0ppm" / "3.0 ppm" / "0.5 Da" into {value, unit}.
    // ms2_tol is the fragment-ion tolerance in xi2's s_config.
    #parsedFragTol() {
        const raw = this.#sConfig.ms2_tol;
        if (typeof raw !== "string") return {};
        const match = raw.match(/^\s*([0-9.eE+-]+)\s*([A-Za-z]+)\s*$/);
        if (!match) return {};
        return { value: parseFloat(match[1]), unit: match[2] };
    }
}

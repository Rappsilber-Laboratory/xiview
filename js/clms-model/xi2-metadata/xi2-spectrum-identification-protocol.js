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

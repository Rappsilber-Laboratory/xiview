/**
 * Normalise one part of a peptide key so that two values give the same key exactly when their String()
 * forms are equal, as they did when the key was the string uploadId + "_" + peptideId: numbers are used
 * as they are (Map compares them with SameValueZero, so 0 and -0 are one key, as "0" is), a string that
 * is exactly how a number prints ("7", "0.5", "NaN") becomes that number, and any other value is its
 * String() form ("01", " 7", "S1" stay strings, so they match only themselves, as before).
 * @param {*} value - Upload / search id or peptide id
 * @returns {number|string} Map key
 */
function keyPart(value) {
    if (typeof value === "number") {
        return value;
    }
    const s = String(value);
    const n = +s;
    return String(n) === s ? n : s;
}

/**
 * Peptides by (upload / search id, peptide id), used while matches are linked to their peptides.
 *
 * Two levels of Map rather than one keyed by uploadId + "_" + peptideId: no key string is built and
 * hashed per peptide and per match, and ids that contain "_" can't collide ("1_2" + 3 and "1" + "2_3"
 * used to give the same key, so one peptide replaced the other).
 */
export class PeptideLookup {
    /**
     * @type {Map<number|string, Map<number|string, Peptide>>}
     */
    #byUpload = new Map();

    /**
     * Add a peptide. A second peptide with the same ids replaces the first (as Map.set did before).
     * @param {*} uploadId - Upload id (mzIdentML) / search id (xi2)
     * @param {*} peptideId - Peptide id within the upload / search
     * @param {Peptide} peptide - The peptide
     * @returns {void}
     */
    set(uploadId, peptideId, peptide) {
        const uploadKey = keyPart(uploadId);
        let peptides = this.#byUpload.get(uploadKey);
        if (!peptides) {
            peptides = new Map();
            this.#byUpload.set(uploadKey, peptides);
        }
        peptides.set(keyPart(peptideId), peptide);
    }

    /**
     * Get a peptide
     * @param {*} uploadId - Upload id (mzIdentML) / search id (xi2)
     * @param {*} peptideId - Peptide id within the upload / search
     * @returns {Peptide|undefined} The peptide, or undefined if there is none with these ids
     */
    get(uploadId, peptideId) {
        return this.#byUpload.get(keyPart(uploadId))?.get(keyPart(peptideId));
    }
}

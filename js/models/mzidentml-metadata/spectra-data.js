export class SpectraData {
    /**
     * Private JSON data sent by crosslinking-API
     * @type {Object}
     * @private
     */
    #json;

    /**
     * Create a SpectraData instance
     * @param {Object} json - JSON data sent by crosslinking-API
     * @param {number} json.id - Spectra data identifier
     * @param {string} json.file_format - File format CV term (e.g., "MS:1001062")
     * @param {string} json.location - File location/path
     * @param {string|null} json.name - File name
     * @param {string} json.spectrum_id_format - Spectrum identifier format CV term (e.g., "MS:1000774")
     * @param {number} json.upload_id - Upload identifier
     * @param {string|null} json.external_format_documentation - External format documentation URL or null
     */
    constructor(json) {
        this.#json = json;
    }

    //example json
    // {external_format_documentation:null,
    // file_format:"MS:1001062",
    // id:6,
    // location:"recal_B190214_03_Lumos_TD_IN_120_Ecoli_photoAA_membrane_SCX16_SEC7.mgf",
    // name:null,
    // spectrum_id_format:"MS:1000774",
    // upload_id:33}

    /**
     * Get spectra file format
     * @returns {string} File format CV term
     */
    get fileFormat() {
        return this.#json.file_format;
    }
    /**
     * Get spectra data identifier
     * @returns {number} Data identifier
     */
    get id() {
        return this.#json.id;
    }
    /**
     * Get spectra file location/path
     * @returns {string} File location
     */
    get location() {
        return this.#json.location;
    }
    /**
     * Get spectra data name
     * @returns {string} Data name or null
     */
    get name() {
        return this.#json.name;
    }
    /**
     * Get spectrum identifier format
     * @returns {string} Spectrum ID format CV term
     */
    get spectrumIdFormat() {
        return this.#json.spectrum_id_format;
    }
    /**
     * Get upload identifier
     * @returns {number} Upload identifier
     */
    get uploadId() {
        return this.#json.upload_id;
    }
    /**
     * Get external format documentation
     * @returns {string|null} Documentation URL or null
     */
    get externalFormatDocumentation() {
        return this.#json.external_format_documentation;
    }

    /**
     * Convert to JSON object for serialization
     * @returns {Object} Object with all getter values
     */
    toJSON() {
        return {
            // id: this.id,
            fileFormat: this.fileFormat,
            location: this.location,
            name: this.name,
            spectrumIdFormat: this.spectrumIdFormat,
            // uploadId: this.uploadId,
            externalFormatDocumentation: this.externalFormatDocumentation
        };
    }
}

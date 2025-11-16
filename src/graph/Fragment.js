/**
 * Represents a fragment ion from peptide fragmentation in mass spectrometry.
 * Fragments are generated during MS/MS analysis and used for peptide identification.
 *
 * @class Fragment
 * @param {Object} fragment - Fragment data object containing fragment properties
 * @param {string} fragment.class - Fragment class (e.g., "lossy", "non-lossy")
 * @param {number[]} fragment.clusterIds - Array of cluster IDs this fragment belongs to
 * @param {Object[]} fragment.clusterInfo - Information about each cluster
 * @param {number} fragment.id - Unique fragment identifier
 * @param {boolean} fragment.isMonoisotopic - Whether this is a monoisotopic peak
 * @param {number} fragment.mass - Mass of the fragment in Daltons
 * @param {string} [fragment.stub] - Stub sequence if applicable
 * @param {string} fragment.name - Fragment name (e.g., "b3", "y5")
 * @param {number} fragment.peptideId - ID of the parent peptide (0 or 1)
 * @param {Array} fragment.range - Residue range(s) this fragment spans
 * @param {string} fragment.sequence - Amino acid sequence of the fragment
 * @param {string} fragment.type - Fragment ion type
 * @param {number} [fragment.ionNumber] - Ion number (position from terminus)
 * @param {Object[]} all_clusters - Array of all cluster objects for lookup
 */
export function Fragment(fragment, all_clusters) {
    this.class = fragment.class;
    this.clusterIds = fragment.clusterIds;
    this.clusterInfo = fragment.clusterInfo;
    this.clusters = [];
    for (let i = 0; i < this.clusterIds.length; i++) {
        this.clusters.push(all_clusters[this.clusterIds[i]]);
    }
    this.id = fragment.id;
    this.isMonoisotopic = fragment.isMonoisotopic;
    this.mass = fragment.mass;
    this.stub = fragment.stub || "";
    this.name = fragment.name.trim();
    this.peptideId = fragment.peptideId;
    this.range = fragment.range;
    this.sequence = fragment.sequence;
    this.type = fragment.type;
    this.range = fragment.range;
    this.stub = fragment.stub;
    this.ionSeries = this.name.split("")[0];

    this.ionNumber = fragment.ionNumber;
    // xi1 annotator doesn't report ionNumber directly
    if (this.ionNumber === undefined) {
        let fragRegex = /[abcxyz]([0-9]+)(?:_.*)?/g;
        let regexMatch = fragRegex.exec(this.name);
        this.ionNumber = (regexMatch) ? regexMatch[1] - 0 : null;
    }

    this.lossy = this.class === "lossy";

    // if we have a range on more than one peptide for the fragment it's crossLinkContaining
    this.crossLinkContaining = this.range.length > 1;

    this.idStr = this.peptideId + this.name;

}

/**
 * Gets the charge state of this fragment for a specific peak.
 *
 * @method get_charge
 * @param {number} peak_id - The peak ID to get charge information for
 * @returns {number} The charge state of the fragment at this peak
 */
Fragment.prototype.get_charge = function (peak_id) {

    // let clusterId = _.intersection(, this.clusterIds)[0];
    // let clusterInfoIdx = fragments[f].clusterIds.indexOf(clusterId);
    // let clusterInfo = fragments[f].clusterInfo[clusterInfoIdx]

    // returns the charge state of this fragment for a given peak_id
    let cluster = this.clusters.filter(
        function (c) {
            if (c.firstPeakId === peak_id) return true;
        });

    let clusterId = cluster[0].id;
    let clusterInfo = this.clusterInfo.filter(function (c) {
        return c.Clusterid === clusterId;
    });

    return clusterInfo[0].matchedCharge;
};

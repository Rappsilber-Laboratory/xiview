export function Fragment (fragment, all_clusters){
	this.class = fragment.class;
	this.clusterIds = fragment.clusterIds;
	this.clusterInfo = fragment.clusterInfo;
	this.clusters = [];
	for (let i=0; i < this.clusterIds.length; i++) {
		this.clusters.push(all_clusters[this.clusterIds[i]]);
	}
	this.id = fragment.id;
	this.isMonoisotopic = fragment.isMonoisotopic;
	this.mass = fragment.mass;
	this.name = fragment.name.trim();
	this.peptideId = fragment.peptideId;
	this.range = fragment.range;
	this.sequence = fragment.sequence;
	this.type = fragment.type;

	let ion = this.name.split("")[0];
	if (ion === "a" || ion === "b" || ion === "c") {
		this.byType = "bLike";
	} else if (ion === "x" || ion === "y" || ion === "z"){
		this.byType = "yLike";
	} else {
		this.byType = null;
	}

	let fragRegex = /[abcxyz]([0-9]+)(?:_.*)?/g;
	let regexMatch = fragRegex.exec(this.name);
	this.ionNumber = (regexMatch) ? regexMatch[1] - 0 : null;

    this.lossy = this.class === "lossy";

	let crossLinkContainingRegex = /CrossLink\(.*n\|PeptideIon\)/g;
	this.crossLinkContaining = crossLinkContainingRegex.test(this.type);

	this.idStr = this.peptideId + this.name;

}

Fragment.prototype.get_charge = function(peak_id){

	// let clusterId = _.intersection(, this.clusterIds)[0];
	// let clusterInfoIdx = fragments[f].clusterIds.indexOf(clusterId);
	// let clusterInfo = fragments[f].clusterInfo[clusterInfoIdx]

	// returns the charge state of this fragment for a given peak_id
	let cluster = this.clusters.filter(
		function(c){
 if (c.firstPeakId == peak_id) return true;
});

	let clusterId = cluster[0].id;
	let clusterInfo = this.clusterInfo.filter(function(c){
 return c.Clusterid === clusterId; 
});

	return clusterInfo[0].matchedCharge;
};

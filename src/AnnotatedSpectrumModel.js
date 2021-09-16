import * as _ from 'underscore';
import Backbone from "backbone";
import * as $ from "jquery";
import {Fragment} from "./graph/Fragment";

import * as colorbrewer from 'colorbrewer';

export const AnnotatedSpectrumModel = Backbone.Model.extend({

	defaults: function () {
		return {
			baseDir: './',
			knownModifications: [],
			knownModificationsURL: false,
			highlightColor: '#FFFF00',
			highlightWidth: 8,
			peakColor: "#a6a6a6",
			colorScheme: "RdBu",
			annotatorURL: "annotate/FULL",
			labelFragmentCharge: false,
			labelCutoff: 0,
			labelFontSize: 10,
			accentuateCrossLinkContainingFragments: false,
			hideNotSelectedFragments: false,
			showLossLabels: false,
			QCabsErr: false,
		};
	},

	initialize: function(){

		if(this.get('knownModificationsURL') !== false && !("cachedKnownModifications" in AnnotatedSpectrumModel.prototype)) {    // in tells difference between variable existing and having the undefined value and it not being defined at all
			this.getKnownModifications(this.get('knownModificationsURL'));
            AnnotatedSpectrumModel.prototype.cachedKnownModifications = this.knownModifications;
		}
		else{
			this.knownModifications = AnnotatedSpectrumModel.prototype.cachedKnownModifications || this.get('knownModifications');
		}

		this.set('showDecimals', 2);
		this.set('moveLabels', false);
		this.set('measureMode', false);
		this.set('zoomLocked', false);
		this.set('butterfly', false);
		this.set('changedAnnotation', false);
		// this.keepCustomConfig = false;

		this.set('visFragments', 'both');
		this.changeColorScheme(this.get('colorScheme'));

		this.labelFontSize = 10;

		this.pepStrs = [];
		this.pepStrsMods = [];
		this.fragmentIons = [];
		this.peakList = [];
		this.precursor = {}
		this.precursor.charge = null;
		this.customConfig = [];
		this.sticky = [];

		//ToDo: change JSONdata gets called 3 times for some reason?
		// define event triggers and listeners better
		this.on("change:JSONdata", function(){
			let json = this.get("JSONdata");
			if (typeof json !== 'undefined'){
				this.setData();
			}
			else
				this.trigger("cleared");
		});

		// //used for manual data input -- calcPrecursorMass disable for now
		// this.on("change:clModMass", function(){
		// 	if(this.peptides !== undefined && this.knownModifications !== undefined)
		// 		this.calcPrecursorMass();
		// });
		// this.on("change:charge", function(){
		// 	this.precursorCharge = parseInt(this.get("charge"));
		// 	this.trigger("changed:charge");
		// });
		// this.on("change:modifications", function(){
		// 	this.updateKnownModifications();
		// 	if(this.peptides !== undefined && this.knownModifications !== undefined)
		// 		this.calcPrecursorMass();
		// });

	},

	setData: function(){

		if (this.get("JSONdata") == null){
			this.trigger("changed:data");
			return;
		}

		let JSONrequest = this.get("JSONrequest");

		// if knownModifications are not set get them from the JSONrequest
		if(this.knownModifications.length === 0 && JSONrequest && JSONrequest.annotation && JSONrequest.annotation.modifications){
			this.knownModifications = JSONrequest.annotation.modifications.map(function(mod){
				 let obj = {};
				 obj.id = mod.id;
				 obj.mass = parseFloat(mod.mass);
				 obj.aminoAcids = mod.aminoAcids;
				 obj.changed = false;
				 obj.userMod = true;
				 return obj;
			 });
		}

		$("#xispec_measuringTool").prop("checked", false);
		$("#xispec_moveLabels").prop("checked", false);
		this.sticky = Array();
		this.highlights = Array();
		let JSONdata = this.get("JSONdata");

		if(JSONdata.annotation){
			this.MSnTolerance = JSONdata.annotation.fragmentTolerance;
			this.fragmentIons = JSONdata.annotation.ions;
			this.customConfig = JSONdata.annotation.custom;
			if (JSONdata.annotation.crosslinker)
				this.crossLinkerModMass = JSONdata.annotation.crosslinker.modMass;
		}

		this.peakList = JSONdata.peaks || [];

		this.pepStrs = [];
		this.pepStrsMods = [];
		this.peptides = JSONdata.Peptides;
		this.isLinear = this.peptides.length === 1;
		for(let i=0; i < this.peptides.length; i++){
			this.pepStrs[i] = "";
			this.pepStrsMods[i] = "";
			for(let j=0; j < this.peptides[i].sequence.length; j++){
				this.pepStrs[i] += this.peptides[i].sequence[j].aminoAcid;
				this.pepStrsMods[i] += this.peptides[i].sequence[j].aminoAcid + this.peptides[i].sequence[j].Modification;
			}
		}

		this.fragments = [];
		if (JSONdata.fragments !== undefined){
			for (let i = 0; i < JSONdata.fragments.length; i++) {
				this.fragments[i] = new Fragment(JSONdata.fragments[i], JSONdata.clusters);
				this.fragments[i].id = i;
			}
		}

		if (JSONdata.annotation){
			this.precursor.charge = JSONdata.annotation.precursorCharge;
			this.precursor.expMz = JSONdata.annotation.precursorMZ;
			this.precursor.error = JSONdata.annotation.precursorError;
			this.precursor.calcMz = JSONdata.annotation.calculatedMZ;
			// this.calcPrecursorMass();
			this.losses = (JSONdata.annotation.losses) ? JSONdata.annotation.losses : [];
		}

		this.trigger("changed:data");

		if (JSONdata.peaks !== undefined)
			this.setGraphData();

	},

	peaksToMGF: function(){
		let output = "";
		for (let i = 0; i < this.peakList.length; i++) {
			output += this.peakList[i].mz + "	";
			output += this.peakList[i].intensity + "\n";
		}
		return output.slice(0, -2);
	},

	clear: function(){
		this.sticky = Array();
		this.precursor = {};
		this.crossLinkerModMass = null;
		this.fragmentIons = Array();
		this.fragments = Array();

		this.pepStrs = [];
		this.pepStrsMods = [];
		this.fragmentIons = [];
		this.peakList = [];
		this.precursor = {}
		this.precursor.charge = null;
		this.MSnTolerance = {};
		this.customConfig = [];

		this.set("JSONdata", null);
		// Backbone.Model.prototype.clear.call(this);
	},

	setGraphData: function(){

		let peaks = this.get("JSONdata").peaks;

		let xDataArr = peaks.map(function(p){ return p.mz; })
		let xmax = Math.max.apply(Math, xDataArr);
		let xmin = Math.min.apply(Math, xDataArr);
		this.xmaxPrimary = parseInt((xmax + 50).toFixed(0));
		this.xminPrimary = parseInt((xmin - 50).toFixed(0));

		let yDataArr = peaks.map(function(p){ return p.intensity; })
		this.ymaxPrimary = Math.max.apply(Math, yDataArr);

		if (!this.get('zoomLocked')){
			this.set('mzRange', [this.xminPrimary, this.xmaxPrimary]);
			this.ymax = this.ymaxPrimary;
			this.ymin = 0;
		}
	},

	setZoom: function(arr){
		this.set('mzRange', [arr[0], arr[1]]);
	},

	resetZoom: function(){
		this.set('mzRange', [this.xminPrimary, this.xmaxPrimary]);
		this.trigger('resetZoom');
	},

	addHighlight: function(fragments){
		for (let f=0; f < fragments.length; f++){
			if(this.highlights.indexOf(fragments[f]) === -1)
				this.highlights.push(fragments[f]);
		}
		this.trigger("changed:Highlights");
	},

	clearHighlight: function(fragments){
		for (let f=0; f < fragments.length; f++){
			let index = this.highlights.indexOf(fragments[f])
			if(index !== -1 && !_.contains(this.sticky, fragments[f])){
				this.highlights.splice(index, 1);
			}
		}
		this.trigger("changed:Highlights");
	},

	clearStickyHighlights: function(){
		if(this.sticky.length !== 0){
			let oldsticky = this.sticky;
			this.sticky = Array();
			this.clearHighlight(oldsticky);
		}
	},

	updateStickyHighlight: function(fragments, add){
		if (add === true){
			for(let f=0; f < fragments.length; f++){
				if (this.sticky.indexOf(fragments[f]) === -1)
					this.sticky.push(fragments[f]);
			}
		}
		else{
			let clearHighlights = []
			if(this.sticky.length !== 0){
				for(let f=0; f < this.sticky.length; f++){
					if (fragments.indexOf(this.sticky[f]) == -1)
						clearHighlights.push(this.sticky[f]);
				}
				this.sticky = [];
			}
			for(let f=0; f < fragments.length; f++)
				this.sticky.push(fragments[f]);

			this.clearHighlight(clearHighlights);
		}
	},

	changeColorScheme: function(schemeStr){
		this.set('colorScheme', schemeStr);
		this.colorPalette = colorbrewer.RdBu[8]; // default
		switch(schemeStr) {
			case "RdBu":
				this.colorPalette = colorbrewer.RdBu[8];
				break;
			case "BrBG":
				this.colorPalette = colorbrewer.BrBG[8];
				break;
			case "PiYG":
				this.colorPalette = colorbrewer.PiYG[8];
				break;
			case "PRGn":
				this.colorPalette = colorbrewer.PRGn[8];
				break;
			case "PuOr":
				this.colorPalette = colorbrewer.PuOr[8];
				break;
		}

		this.updateColors();
		// this.trigger("changed:ColorScheme");
	},

	updateColors: function(){
		switch(this.get('visFragments')) {
			case 'both':
				this.p1color = this.colorPalette[0];
				this.p1color_cluster = this.colorPalette[2];
				this.p1color_loss = this.colorPalette[1];
				this.p2color = this.colorPalette[7];
				this.p2color_cluster = this.colorPalette[5];
				this.p2color_loss = this.colorPalette[6];
				break;
			case 'pep1':
				this.p1color = this.colorPalette[0];
				this.p1color_cluster = this.colorPalette[2];
				this.p1color_loss = this.colorPalette[1];
				this.p2color = this.get('peakColor');
				this.p2color_cluster = this.get('peakColor');
				this.p2color_loss = this.get('peakColor');
				break;
			case 'pep2':
				this.p1color = this.get('peakColor');
				this.p1color_cluster = this.get('peakColor');
				this.p1color_loss = this.get('peakColor');
				this.p2color = this.colorPalette[7];
				this.p2color_cluster = this.colorPalette[5];
				this.p2color_loss = this.colorPalette[6];
				break;
		}
		this.trigger("change:colors");
	},

	changeLinkPos: function(newLinkSites){

		// make sure this model is in the activated SpectrumWrapper
		this.trigger('activate');

		if(this.get("JSONrequest") !== undefined){
			let json_req = $.extend(true, {}, this.get("JSONrequest"));
			json_req.LinkSite = newLinkSites;
			window.xiSPECUI.vent.trigger('requestAnnotation', json_req, this.get('annotatorURL'));
		}
		else{
			this.get('JSONdata').LinkSite = newLinkSites;
			this.setData();
		}

		this.set('changedAnnotation', true);
	},

	changeMod: function(oldPos, newPos, oldPepIndex, newPepIndex){

		// make sure this model is in the activated SpectrumWrapper
		this.trigger('activate');

		if(this.get("JSONrequest") !== undefined){
			let json_req = $.extend(true, {}, this.get("JSONrequest"));
			//standalone
			let myNew = json_req.Peptides[newPepIndex].sequence[newPos];
			let myOld = this.get("JSONdata").Peptides[oldPepIndex].sequence[oldPos];

			myNew.Modification = myOld.Modification;
			json_req.Peptides[oldPepIndex].sequence[oldPos].Modification = "";

			if (myNew.aminoAcid !== myOld.aminoAcid){
				let annotationMod = $.grep(json_req.annotation.modifications, function(e){ return e.id == myNew.Modification; });
				if (annotationMod[0].aminoAcids.indexOf(myNew.aminoAcid) === -1)
					annotationMod[0].aminoAcids.push(myNew.aminoAcid);
			}
			window.xiSPECUI.vent.trigger('requestAnnotation', json_req, this.get('annotatorURL'));
		}
		else{
			//Preview
			this.get("JSONdata").Peptides[newPepIndex].sequence[newPos].Modification = this.get("JSONdata").Peptides[oldPepIndex].sequence[oldPos].Modification;
			this.get("JSONdata").Peptides[oldPepIndex].sequence[oldPos].Modification = "";
			this.setData();
		}

		this.set('changedAnnotation', true);
	},

	checkForValidModification: function(mod, aminoAcid){

		for (let i=0; i < this.knownModifications.length; i++) {
			if(this.knownModifications[i].id == mod){
				let knownMod_aminoAcids = this.knownModifications[i].aminoAcids;
				return knownMod_aminoAcids.indexOf('*') !== -1 || knownMod_aminoAcids.indexOf(aminoAcid) !== -1;
			}
		}
	},

	calcPrecursorMass: function(){

		let JSONdata = this.get("JSONdata");
		let modifications = JSONdata.annotation.modifications;
		let aastr = "ARNDCEQGHILKMFPSTWYV";
		let mA = [];
		mA[aastr.indexOf("A")] = 71.03711;
		mA[aastr.indexOf("R")] = 156.10111;
		mA[aastr.indexOf("N")] = 114.04293;
		mA[aastr.indexOf("D")] = 115.02694;
		mA[aastr.indexOf("C")] = 103.00919;
		mA[aastr.indexOf("E")] = 129.04259;
		mA[aastr.indexOf("Q")] = 128.05858;
		mA[aastr.indexOf("G")] = 57.02146;
		mA[aastr.indexOf("H")] = 137.05891;
		mA[aastr.indexOf("I")] = 113.08406;
		mA[aastr.indexOf("L")] = 113.08406;
		mA[aastr.indexOf("K")] = 128.09496;
		mA[aastr.indexOf("M")] = 131.04049;
		mA[aastr.indexOf("F")] = 147.06841;
		mA[aastr.indexOf("P")] = 97.05276;
		mA[aastr.indexOf("S")] = 87.03203;
		mA[aastr.indexOf("T")] = 101.04768;
		mA[aastr.indexOf("W")] = 186.07931;
		mA[aastr.indexOf("Y")] = 163.06333;
		mA[aastr.indexOf("V")] = 99.06841;

		let massArr = [];
		const h2o = 18.010565;
		const proton_mass = 1.007276466879;
		for (let i=0; i < this.peptides.length; i++) {
			massArr[i] = h2o;
			for (let j=0; j < this.peptides[i].sequence.length; j++) {
				let AA = this.peptides[i].sequence[j];
				massArr[i] += mA[aastr.indexOf(AA.aminoAcid)];
				// mod
				let mod = AA.Modification;
				if(mod !== ""){
					for (let k=0; k < modifications.length; k++) {
						if (modifications[k].id == mod && modifications[k].aminoacid == AA.aminoAcid)
						massArr[i] += modifications[k].massDifference;
					}
				}
			}
		}

		let totalMass = 0;
		let clModMass = 0;
		if(this.get("clModMass") !== undefined)
			clModMass = parseInt(this.get("clModMass"));
		else if (JSONdata.annotation.crosslinker !== undefined)
			clModMass = JSONdata.annotation.crosslinker.modMass;

		for (let i=0; i < massArr.length; i++) {
			totalMass += massArr[i];
		}

		if (totalMass === h2o){
			this.precursor.calcMass = 0;
			this.precursor.calcMz = 0;
			return;
		}

		// NOT Multilink future proof
		if(JSONdata.LinkSite.length > 1){
			if (JSONdata.LinkSite[0].linkSite !== -1 && JSONdata.LinkSite[1].linkSite !== -1)
				totalMass += clModMass;
		}
		this.precursor.calcMass = totalMass;
		this.precursor.calcMz = (totalMass / this.precursor.charge) + proton_mass;
		this.trigger("changed:mass");
	},

	getKnownModifications: function(modifications_url){
		let self = this;
		$.ajax({
			type: "GET",
			datatype: "json",
			async: false,
			url: modifications_url,
			success: function(data) {
				for (let i=0; i < data.modifications.length; i++) {
					data.modifications[i].changed = false;
					data.modifications[i].userMod = false;
					// data.modifications[i].original = false;
				}
				self.knownModifications = data.modifications;

			},
			error: function(xhr, status, error){
				alert("xiAnnotator could not be reached. Please try again later!");
			},
		});
	},

	updateModification: function(update_mod){
		let found = false;
		for (let i=0; i < this.knownModifications.length; i++) {
			if (this.knownModifications[i].id === update_mod.id) {
				found = true;
				// if it's not a changed mod save before overwriting
				if(!this.knownModifications[i].changed && !this.knownModifications[i].userMod){
					this.knownModifications[i].changed = true;
					this.knownModifications[i].original = {
						mass: this.knownModifications[i].mass,
						aminoAcids: this.knownModifications[i].aminoAcids
					};
				}
				this.knownModifications[i].mass = update_mod.mass;
				this.knownModifications[i].aminoAcids = update_mod.aminoAcids;
				return this.knownModifications[i];
			}
		}

		if (!found){
			update_mod.userMod = true;
			this.knownModifications.push(update_mod);
			return update_mod;
		}
	},

	resetModification: function(updateModId){
		for (let i=0; i < this.knownModifications.length; i++) {
			if (this.knownModifications[i].id === updateModId) {
				if(this.knownModifications[i].changed){
					this.knownModifications[i].changed = false;
					this.knownModifications[i].mass = this.knownModifications[i].original.mass;
					this.knownModifications[i].aminoAcids = this.knownModifications[i].original.aminoAcids;
					this.knownModifications[i].original = undefined;
				}
				break;
			}
		}

	},

	reset_all_modifications: function(){
		for (let i=0; i < this.knownModifications.length; i++) {
			this.resetModification(this.knownModifications[i].id);
		}
	},

	// saveUserModificationsToCookie: function(){
	// 	var cookie = JSON.stringify(this.userModifications);
	// 	Cookies.set('customMods', cookie);
	// },

	// delUserModification: function(modId, saveToCookie){	// IE 11 borks at new es5/6 syntax, saveCookie=true
	//
	// 	if (saveToCookie === undefined) {
	// 		saveToCookie = true;
	// 	}
	// 	var userModIndex = this.userModifications.findIndex(function(m){ return modId == m.id;});
	// 	if (userModIndex != -1){
	// 		this.userModifications.splice(userModIndex, 1);
	// 	}
	// 	else
	// 		console.log("Error modification "+modId+"could not be found!");
	// 	if (saveToCookie)
	// 		this.saveUserModificationsToCookie();
	// },

});

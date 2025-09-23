import * as d3 from "d3";
import * as Backbone from "backbone";

import {SpectrumMatch} from "./spectrum-match";
import {Peptide} from "./peptide";
import {SpectrumIdentificationProtocol} from "./spectrum-identification-protocol";
import {SpectraData} from "./spectra-data";

export class SearchResultsModel extends Backbone.Model {

    constructor(attributes, options) {
        super(attributes, options);
    }

    //http://stackoverflow.com/questions/19835163/backbone-model-collection-property-not-empty-on-new-model-creation
    defaults() {
        return {
            participants: new Map(), //map
            matches: [],
            crosslinks: new Map(), //map
            scoreExtent: null,
            searches: new Map(),
            decoysPresent: false,
            ambiguousPresent: false,
            unvalidatedPresent: false,
            crosslinksPresent: false,
            linearsPresent: false, // TODO
            scoreSets: new Set(),
            selectedScoreSet: null
        };
    }

    /*processMzIdentMLFiles(json) {
        const mzidentmlFiles = new Map();
        for (let mzid of json){
            mzidentmlFiles.set(mzid.id, new MzidentmlFile(mzid, this));
        }
        this.set("mzidentmlFiles", mzidentmlFiles);
    }*/

    /* processAnalysisCollectionSpectrumIdentifications(json) {
        const analysisCollectionSpectrumIdentifications = new Map();
        for (let acsi of json) {
            const id = acsi.id;
            analysisCollectionSpectrumIdentifications.set(id, new AnalysisCollectionSpectrumIdentifcation(
                acsi, this));
        }
        this.set("analysisCollectionSpectrumIdentifications", analysisCollectionSpectrumIdentifications);
    }*/

    processSpectrumIdentificationProtocols(json) {
        const spectrumIdentificationProtocols = new Map();
        for (let siProtocol of json) {
            const id = siProtocol.id;
            const uploadId = siProtocol.upload_id;
            spectrumIdentificationProtocols.set(uploadId + "_" + id, new SpectrumIdentificationProtocol(siProtocol, this));
        }
        this.set("spectrumIdentificationProtocols", spectrumIdentificationProtocols);
    }

    getSpectrumIdentificationProtocol(uploadId, id) {
        const spectrumIdentificationProtocols = this.get("spectrumIdentificationProtocols");
        if (spectrumIdentificationProtocols) {
            return spectrumIdentificationProtocols.get(uploadId + "_" + id);
        } else {
            console.error("No spectrum identification protocol found for uploadId:", uploadId, "and id:", id);
            return null;
        }
    }

    processSpectraData(json) {
        const spectrumSources = new Map();
        for (let specSource of json) {
            spectrumSources.set(specSource.upload_id + "_" + specSource.id, new SpectraData(specSource, this));
        }
        this.set("spectraData", spectrumSources);
    }

    getSpectraDataById(uploadId, id) {
        const spectraData = this.get("spectraData");
        if (spectraData) {
            return spectraData.get(uploadId + "_" + id);
        } else {
            console.error("No spectra data found for uploadId:", uploadId, "and id:", id);
            return null;
        }
    }

    processEnzymes(data) {
        this.enzymes = data;
        // const getResiduesFromEnzymeDescription = function (regexMatch, residueSet) {
        //     if (regexMatch && regexMatch.length > 1) {
        //         const resArray = regexMatch[1].split(",");
        //         const resCount = resArray.length;
        //         for (let r = 0; r < resCount; r++) {
        //             residueSet.add({
        //                 aa: resArray[r],
        //                 postConstraint: regexMatch[2] ? regexMatch[2].split(",") : null
        //             });
        //         }
        //     }
        // };

        //enzyme specificity
        // TODO _ seems like theres a duplication problem here if multiple searches are aggregated

        //eliminate duplication first
        // const enzymeDescriptions = new Set();
        // for (let search of searches.values()) {
        //     for (let enzyme of search.enzymes) {
        //         enzymeDescriptions.add(enzyme.description);
        //     }
        // }
        //
        // const postAaSet = new Set();
        // const aaConstrainedCTermSet = new Set();
        // const aaConstrainedNTermSet = new Set();
        //
        // for (let enzymeDescription of enzymeDescriptions) {
        //     const postAARegex = /PostAAConstrainedDigestion:DIGESTED:(.*?);ConstrainingAminoAcids:(.*?);/g;
        //     const postAAMatch = postAARegex.exec(enzymeDescription);
        //     getResiduesFromEnzymeDescription(postAAMatch, postAaSet);
        //
        //     const cTermRegex = /CTERMDIGEST:(.*?);/g;
        //     const ctMatch = cTermRegex.exec(enzymeDescription);
        //     getResiduesFromEnzymeDescription(ctMatch, aaConstrainedCTermSet);
        //
        //     const nTermRegex = /NTERMDIGEST:(.*?);/g;
        //     const ntMatch = nTermRegex.exec(enzymeDescription);
        //     getResiduesFromEnzymeDescription(ntMatch, aaConstrainedNTermSet);
        // }
        //
        // const addEnzymeSpecificityResidues = function (residueSet, type) {
        //     const resArray = Array.from(residueSet.values());
        //     const resCount = resArray.length;
        //     for (let r = 0; r < resCount; r++) {
        //         enzymeSpecificity.push({
        //             aa: resArray[r].aa,
        //             type: type,
        //             postConstraint: resArray[r].postConstraint
        //         });
        //     }
        // };

        const enzymeSpecificity = [];
        // addEnzymeSpecificityResidues(postAaSet, "DIGESTIBLE"); //"Post AA constrained");
        // addEnzymeSpecificityResidues(aaConstrainedCTermSet, "DIGESTIBLE"); // "AA constrained c-term");
        // addEnzymeSpecificityResidues(aaConstrainedNTermSet, "DIGESTIBLE"); // "AA constrained n-term");
        this.set("enzymeSpecificity", enzymeSpecificity);
    }

    processSearchModifications(data) {
        this.searchModifications = data;
        //modifications
        // short term hack - index mod names by accession
        const modificationNames = new Map();
        // for (let mod of json.modifications){
        //     modificationNames.set(mod.accession, mod.mod_name);
        // }
        this.set("modificationNames", modificationNames);

        // //crosslink specificity
        //         /*var linkableResSet = new Set();
        //         for (var s = 0; s < searchCount; s++) {
        //             var search = searchArray[s];
        //             var crosslinkers = search.crosslinkers || [];
        //             var crosslinkerCount = crosslinkers.length;
        //             for (var cl = 0; cl < crosslinkerCount; cl++) {
        //                 var crosslinkerDescription = crosslinkers[cl].description;
        //                 var linkedAARegex = /LINKEDAMINOACIDS:(.*?)(?:;|$)/g;
        //                 var result = null;
        //                 while ((result = linkedAARegex.exec(crosslinkerDescription)) !== null) {
        //                     var resArray = result[1].split(',');
        //                     var resCount = resArray.length;
        //                     for (var r = 0; r < resCount; r++) {
        //                         var resRegex = /([A-Z])(.*)?/
        //                         var resMatch = resRegex.exec(resArray[r]);
        //                         if (resMatch) {
        //                             linkableResSet.add(resMatch[1]);
        //                         }
        //                     }
        //                 }
        //             }
        //         }
        //         this.set("crosslinkerSpecificity", CLMS.arrayFromMapValues(linkableResSet));*/
        //
        //         const linkableResSets = {};
        //         for (let search of searches.values()) {
        //             const crosslinkers = search.crosslinkers || [];
        //
        //             crosslinkers.forEach(function (crosslinker) {
        //                 const crosslinkerDescription = crosslinker.description;
        //                 const crosslinkerName = crosslinker.name;
        //                 const linkedAARegex = /LINKEDAMINOACIDS:(.*?)(?:;|$)/g; // capture both sets if > 1 set
        //                 // //console.log("cld", crosslinkerDescription);
        //                 let resSet = linkableResSets[crosslinkerName];
        //
        //                 if (!resSet) {
        //                     resSet = {
        //                         searches: new Set(),
        //                         linkables: [],
        //                         name: crosslinkerName,
        //                         id: +crosslinker.id
        //                     };
        //                     linkableResSets[crosslinkerName] = resSet;
        //                 }
        //                 resSet.searches.add(search.id);
        //
        //                 let result = null;
        //                 let i = 0;
        //                 while ((result = linkedAARegex.exec(crosslinkerDescription)) !== null) {
        //                     if (!resSet.linkables[i]) {
        //                         resSet.linkables[i] = new Set();
        //                     }
        //
        //                     const resArray = result[1].split(",");
        //                     resArray.forEach(function (res) {
        //                         const resRegex = /(cterm|nterm|[A-Z])(.*)?/i;
        //                         const resMatch = resRegex.exec(res);
        //                         if (resMatch) {
        //                             resSet.linkables[i].add(resMatch[1].toUpperCase());
        //                         }
        //                     });
        //                     i++;
        //                 }
        //
        //                 if (i === 0) {
        //                     resSet.linkables.push(new Set(["*"]));  // in case non-covalent
        //                 }
        //
        //                 resSet.heterobi = resSet.heterobi || (i > 1);
        //             });
        //         }
        //
        //         // //console.log("CROSS", linkableResSets);
        //         // if (this.get("serverFlavour") === "XI2") { // hacky, crosslinker specificity not working in other systems
        //         //     this.set("crosslinkerSpecificity", linkableResSets);
        //         // }
    }

    processMatches(data) {
        this.matches = data;
    }

    processPeptides(data) {
        this.peptides = data;
    }

    processProteins(data) {
        this.proteins = data;
    }

    //our SpectrumMatches are constructed from the rawMatches and peptides arrays in this json
    parseJSON(json) {
        this.set("primaryScore", {score_name: "Match Score"});
        // //saved config should end up including filter settings not just xiNET layout
        // this.set("xiNETLayout", json.xiNETLayout);


        const participants = this.get("participants");
        const peptides = new Map();
        // if (this.get("serverFlavour") === "PRIDE") {
        if (!this.isAggregatedData()) {
            if (this.proteins) {
                for (let participant of this.proteins) {
                    this.initProtein(participant, json);
                    participants.set(participant.id, participant);
                }
            }
            //peptides
            if (this.peptides) {
                for (let peptide of this.peptides) {
                    SearchResultsModel.commonRegexes.notUpperCase.lastIndex = 0;
                    peptide.sequence = peptide.base_seq;//seq_mods.replace(SearchResultsModel.commonRegexes.notUpperCase, "");
                    peptides.set(peptide.u_id + "_" + peptide.id, new Peptide(peptide)); // concat upload_id and peptide.id
                    for (let p = 0; p < peptide.prt.length; p++) {
                        if (peptide.dec[p]) {
                            const protein = participants.get(peptide.prt[p]);
                            if (!protein) {
                                console.error("Protein not found for peptide (not aggregated data)", peptide, peptide.prt[p]);
                            }
                            protein.is_decoy = true;
                            this.set("decoysPresent", true);
                        }
                    }
                }
            }
        } else {
            const tempParticipants = new Map();
            if (this.proteins) {
                for (let participant of json.proteins) {
                    this.initProtein(participant, json);
                    tempParticipants.set(participant.id, participant);
                }
            }
            //peptides
            if (this.peptides) {
                for (let peptide of this.peptides) {
                    SearchResultsModel.commonRegexes.notUpperCase.lastIndex = 0;
                    peptide.sequence = peptide.seq_mods.replace(SearchResultsModel.commonRegexes.notUpperCase, "");
                    peptides.set(peptide.u_id + "_" + peptide.id, new Peptide(peptide)); // concat upload_id and peptide.id

                    for (let pe = 0; pe < peptide.prt.length; pe++) {
                        const protein = tempParticipants.get(peptide.prt[pe]);
                        if (!protein) {
                            console.error("Protein not found for peptide (aggregated data)", peptide, peptide.prt[pe]);
                        }
                        if (peptide.dec[pe]) {
                            const decoyId = "DECOY_" + protein.accession;
                            protein.is_decoy = true;
                            protein.id = decoyId;
                            // how to get prot acc after id has been changed?
                            peptide.prt[pe] = decoyId;
                            this.set("decoysPresent", true);
                        } else {
                            // fix ids for target in aggregated data
                            protein.id = protein.accession;
                            peptide.prt[pe] = protein.accession;

                        }

                    }
                }
            }

            for (let participant of tempParticipants.values()) {
                participants.set(participant.id, participant);
            }

        }

        this.initDecoyLookup();

        const crosslinks = this.get("crosslinks");

        let minScore = undefined;
        let maxScore = undefined;

        // moved from modelUtils 05/08/19
        // Connect searches to proteins, and add the protein set as a property of a search in the clmsModel, MJG 17/05/17
        const searchMap = this.getProteinSearchMap(this.peptides, this.matches);
        this.get("searches").forEach(function (value, key) {
            value.participantIDSet = searchMap[key];
        });

        if (this.matches) {
            const matches = this.get("matches");

            const l = this.matches.length;
            for (let i = 0; i < l; i++) {
                let match;
                match = new SpectrumMatch(this, participants, crosslinks, peptides, this.matches[i]);
                matches.push(match);

                if (maxScore === undefined || match.score() > maxScore) {
                    maxScore = match.score();
                } else if (minScore === undefined || match.score() < minScore) {
                    minScore = match.score();
                }
            }
        }

        this.set("minScore", minScore);
        this.set("maxScore", maxScore);
    }

    // Connect searches to proteins
    getProteinSearchMap(peptideArray, rawMatchArray) {
        const pepMap = d3.map(peptideArray, function (peptide) {
            return peptide.id;
        });
        const searchMap = {};
        rawMatchArray = rawMatchArray || [];
        const self = this;
        rawMatchArray.forEach(function (rawMatch) {
            const peptideIDs = rawMatch.pi ? rawMatch.pi : [rawMatch.pi1, rawMatch.pi2];
            peptideIDs.forEach(function (pepID) {
                if (pepID) {
                    const prots = pepMap.get(pepID).prt;
                    let searchId;
                    // check server flavour -- problems ere to do with xi2
                    if (self.get("serverFlavour") === "XI2") {
                        searchId = rawMatch.datasetId;
                    } else {
                        searchId = rawMatch.si;
                    }
                    let searchToProts = searchMap[searchId];
                    if (!searchToProts) {
                        const newSet = d3.set();
                        searchMap[searchId] = newSet;
                        searchToProts = newSet;
                    }
                    prots.forEach(function (prot) {
                        searchToProts.add(prot);
                    });
                }
            });
        });
        return searchMap;
    }

    //adds some attributes we want to protein object
    initProtein(protObj) {
        if (!protObj.crosslinks) {
            protObj.crosslinks = [];
        }
        protObj.is_decoy = false;
        if (protObj.sequence) {
            protObj.size = protObj.sequence.length;
        }

        protObj.form = 0;

        if (!protObj.name && protObj.accession) {
            protObj.name = protObj.accession;
        }
        protObj.getMeta = function (metaField) {
            if (arguments.length === 0) {
                return this.meta;
            }
            return this.meta ? this.meta[metaField] : undefined;
        }.bind(protObj);

        protObj.setMeta = function (metaField, value) {
            if (arguments.length === 2) {
                this.meta = this.meta || {};
                this.meta[metaField] = value;
            }
        }.bind(protObj);
    }

    getDigestibleResiduesAsFeatures(participant) {
        const digestibleResiduesAsFeatures = [];

        const sequence = participant.sequence;
        const seqLength = sequence.length;
        const specificity = this.get("enzymeSpecificity");

        const specifCount = specificity.length;
        for (let i = 0; i < specifCount; i++) {
            const spec = specificity[i];
            for (let s = 0; s < seqLength; s++) {
                if (sequence[s] === spec.aa) {
                    if (!spec.postConstraint || !sequence[s + 1] || spec.postConstraint.indexOf(sequence[s + 1]) === -1) {
                        digestibleResiduesAsFeatures.push({
                            begin: s + 1,
                            end: s + 1,
                            name: "DIGESTIBLE",
                            protID: participant.id,
                            id: participant.id + " " + spec.type + (s + 1),
                            category: "AA",
                            type: "DIGESTIBLE"
                        });
                    }
                }
            }
        }
        //console.log("sp:", specificity, "df:", digestibleResiduesAsFeatures);
        return digestibleResiduesAsFeatures;
    }

    getCrosslinkableResiduesAsFeatures(participant, reactiveGroup) {
        const crosslinkableResiduesAsFeatures = [];

        const sequence = participant.sequence;
        const seqLength = sequence.length;
        const linkedResSets = this.get("crosslinkerSpecificity");

        const temp = d3.values(linkedResSets);
        for (let cl = 0; cl < temp.length; cl++) {
            // resSet = {searches: new Set(), linkables: [], name: crosslinkerName};
            const crosslinkerLinkedResSet = temp[cl];
            const linkables = crosslinkerLinkedResSet.linkables;

            //for (var l = 0 ; l < linkables.length; l++) {
            if (linkables[reactiveGroup - 1]) {
                const linkableSet = linkables[reactiveGroup - 1];
                const linkableArr = [];
                linkableSet.forEach(v => linkableArr.push(v));
                const specifCount = linkableArr.length;
                for (let i = 0; i < specifCount; i++) {
                    const spec = linkableArr[i];
                    for (let s = 0; s < seqLength; s++) {
                        if (sequence[s] === spec) {
                            crosslinkableResiduesAsFeatures.push({
                                begin: s + 1,
                                end: s + 1,
                                name: "CROSSLINKABLE-" + reactiveGroup,
                                protID: participant.id,
                                id: participant.id + " Crosslinkable residue" + (s + 1) + "[group " + reactiveGroup + "]",
                                category: "AA",
                                type: "CROSSLINKABLE-" + reactiveGroup
                            });
                        }
                    }
                }
            }
        }

        console.log("reactiveGroup:", reactiveGroup, "sp:", linkedResSets, "clf:", crosslinkableResiduesAsFeatures);
        return crosslinkableResiduesAsFeatures;
    }

    initDecoyLookup(prefixes) {
        // Make map of reverse/random decoy proteins to real proteins
        prefixes = prefixes || ["REV_", "RAN_", "DECOY_", "DECOY:", "reverse_", "REV", "RAN"];
        const prots = Array.from(this.get("participants").values());
        const nameMap = d3.map();
        const accessionMap = d3.map();
        prots.forEach(function (prot) {
            nameMap.set(prot.name, prot.id);
            accessionMap.set(prot.accession, prot.id);
            prot.targetProteinID = prot.id; // this gets overwritten for decoys in next bit, mjg
        });

        const decoys = prots.filter(function (p) {
            return p.is_decoy;
        });
        decoys.forEach(function (decoyProt) {
            prefixes.forEach(function (pre) {
                const targetProtIDByName = nameMap.get(decoyProt.name.substring(pre.length));
                if (decoyProt.accession) {
                    const targetProtIDByAccession = accessionMap.get(decoyProt.accession.substring(pre.length));
                    if (targetProtIDByAccession) {
                        decoyProt.targetProteinID = targetProtIDByAccession; // mjg
                    }
                } else if (targetProtIDByName) {
                    decoyProt.targetProteinID = targetProtIDByName; // mjg
                }
            });
        });

        this.targetProteinCount = prots.length - decoys.length;
    }

    isAggregatedData() {
        return this.get("searches").size > 1;
    }
}

SearchResultsModel.commonRegexes = {
    uniprotAccession: /[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}/,
    notUpperCase: /[^A-Z]/g,
    decoyNames: /(REV_)|(RAN_)|(DECOY_)|(DECOY:)|(reverse_)/,
};

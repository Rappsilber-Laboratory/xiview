// import * as _ from 'underscore';
import Backbone from "backbone";
import * as $ from "jquery";

export const PepInputView = Backbone.View.extend({

    events: {
        "input": "contentChanged",
        //"keyup": "contentChanged",
    },

    initialize: function () {
        this.listenTo(this.model, 'changed:data', this.render);
    },

    contentChanged: function (e) {
        let pepStrs = this.el.value.split(";");

        let peptides = [];
        let linkSites = [];

        for (let i=0; i < pepStrs.length; i++) {

            if (pepStrs[i] !== '') {
                let firstChar = pepStrs[i][0];
                if (firstChar === firstChar.toLowerCase()) {
                    alert('peptide sequence must start with an amino acid.');
                    return;
                }
            }

            let pep_noMods = pepStrs[i].replace(/([^#0-9])([^A-Z#]+)/g, '$1');

            // linkSite
            let cl_re = /#([0-9]+)?/g;
            let match;
            while ((match = cl_re.exec(pep_noMods)) != null) {
                let clIndex = match[1] === undefined ? 0 : match[1];
                let linkSite = {'id': clIndex, 'peptideId': i, 'linkSite': match.index - 1};
                linkSites.push(linkSite);
            }

            // peptide sequence
            let pepAAseq = pepStrs[i].replace(/[^A-Z]/g, "");
            let peptide = {'sequence': []};
            for (let j=0; j < pepAAseq.length; j++) {
                peptide['sequence'].push({'aminoAcid': pepAAseq[j], 'Modification': ''});
            }

            // add in mods
            let pep_noCL = pepStrs[i].replace(cl_re, "");
            let modifications = [];
            let mod_re = /([^A-Z#]+)/g;
            let offset = 1;
            while ((match = mod_re.exec(pep_noCL)) != null) {
                peptide['sequence'][match.index - offset].Modification = match[1];
                offset += match[1].length;
            }

            peptides.push(peptide);
        }

        //update model with input data
        if (this.model.get("JSONdata") !== undefined && this.model.get("JSONdata") !== null) {
            let new_json = $.extend(true, {}, this.model.get("JSONdata"));
            new_json.Peptides = peptides;
            new_json.LinkSite = linkSites;
            this.model.set('JSONdata', new_json);
        } else
            this.model.set({JSONdata: {'Peptides': peptides, 'LinkSite': linkSites}});
    },

    clear: function () {
        this.el.value = '';
    },

    render: function () {
        if (this.model.get("JSONdata") === null)
            return;

        let pepStrsArr = [];
        for (let i=0; i < this.model.peptides.length; i++) {
            pepStrsArr[i] = "";
            for (let j=0; j < this.model.peptides[i].sequence.length; j++) {
                pepStrsArr[i] += this.model.peptides[i].sequence[j].aminoAcid + this.model.peptides[i].sequence[j].Modification;
                // insert the # for the crosslink
                if (this.model.get("JSONdata").LinkSite.length > 0) {
                    for (let k=0; k < this.model.get("JSONdata").LinkSite.length; k++) {
                        if (this.model.get("JSONdata").LinkSite[k].peptideId == i && this.model.get("JSONdata").LinkSite[k].linkSite == j)
                            pepStrsArr[i] += "#";
                    }
                }
            }
        }
        let pepsStr = pepStrsArr.join(";");

        // only update the input field if the string differs
        if (this.el.value !== pepsStr) {
            this.clear();
            this.el.value = pepsStr;
        }

    },


});

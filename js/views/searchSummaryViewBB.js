import * as _ from 'underscore';
// import $ from 'jquery';
// import Backbone from "backbone";

import {BaseFrameView} from "../ui-utils/base-frame-view";
import {modelUtils} from "../modelUtils";
import {download} from "../downloads";
import d3 from "d3";

export const SearchSummaryViewBB = BaseFrameView.extend({
    events: function() {
        let parentEvents = BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {});
    },

    initialize: function(viewOptions) {
        SearchSummaryViewBB.__super__.initialize.apply(this, arguments);

        this.listenTo(this.model, "change:matches", this.render);
        const self = this;

        const mainPanel = d3.select(this.el)
            .append("div").attr("class", "panelInner")
            .append("div").attr("class", "verticalFlexContainer");

        const descriptionButton = mainPanel.append("button")
            .classed("btn btn-1 btn-1a flexStatic", true)
            .text("Download Search Descriptions")
            .on("click", function () {
                const searchString = Array.from(self.model.get("searches").values())
                    .map(function (search) {
                        return search.id;
                    })
                    .join("-");
                download(self.exportDescriptions(), "plain/text", "search_description_" + searchString + ".txt");
            })
        ;
        descriptionButton.style ("display", _.isEmpty(self.model.get("crosslinkerSpecificity")) ? "none" : null);

        mainPanel.append("div").attr("class", "searchSummaryDiv");

        return this;
    },

    render: function() {
        const searches = this.model.get("searches");
        $(".searchSummaryDiv").JSONView(Array.from(searches.values()));
        $('.searchSummaryDiv').JSONView('collapse', 2);

        return this;
    },

    searchDescriptionTemplate: "The identification of cross-links was performed with <%= version %> using the following parameters: MS accuracy, <%= ms1Value %> <%= ms1Units %>; MS/MS accuracy, <%= ms2Value %> <%= ms2Units %>; enzyme, <%= enzymeNames %>; maximum missed cleavages, <%= missedCleavages %>; maximum number of modifications, <%= maxModifications %>; fixed modification, <%= fixedModList %>; variable modifications, <%= varModList %>. Cross-linking was allowed to involve <%= crosslinkerDesc %>.",

    exportDescriptions: function() {
        const template = _.template(this.searchDescriptionTemplate);
        const searches = Array.from(this.model.get("searches").values());
        const linkerData = modelUtils.crosslinkerSpecificityPerLinker(searches);
        //console.log ("LD", linkerData);

        const modRegex = /^.*;MODIFIED:([^;]*)/;

        const descriptions = searches.map(function (search) {

            // https://stackoverflow.com/questions/15069587/is-there-a-way-to-join-the-elements-in-an-js-array-but-let-the-last-separator-b
            const niceJoin = function (arr) {
                return arr.length < 2 ? arr.join("") : arr.slice(0, -1).join(', ') + ' and ' + arr.slice(-1);
            };

            const codonsToNames = function (codonArray) {
                return codonArray
                    .map(function (code) {
                        const name = modelUtils.amino1toNameMap[code];
                        return name ? name.replace("_", "-") : "(codon " + code + ")";  // state codon if no long name
                    })
                    ;
            };

            // crosslinker descriptions for each search
            const crosslinkerDescs = search.crosslinkers ? search.crosslinkers.map(function (clink) {
                const linkerDatum = linkerData[clink.name];
                const linkables = linkerDatum.linkables;
                const obj = {
                    name: linkerDatum.name,
                    first: niceJoin(codonsToNames(Array.from(linkables[0].values())))
                };
                if (linkerDatum.heterobi) {
                    obj.second = niceJoin(codonsToNames(Array.from(linkables[1].values())));
                }
                return obj;
            }) : "";

            // modification descriptions
            const modDesc = function (mod) {
                const residueList = mod.description.match(modRegex);
                if (residueList && residueList[1]) {
                    return mod.name + " of " + niceJoin(codonsToNames(residueList[1].split(",")));
                }
                return "";
            };

            // other values for each search
            const values = {
                version: search.version ? "Xi-Version " + search.version : search.notes,
                ms1Value: search.mstolerance,
                ms1Units: search.mstoleranceunits,
                ms2Value: search.ms2tolerance,
                ms2Units: search.ms2toleranceunits,
                enzymeNames: search.enzymes ? _.pluck(search.enzymes, "name").join(", ") : "",
                missedCleavages: search.missedcleavages,
                maxModifications: search.modifications ? search.modifications.length : 0,
                fixedModList: search.modifications ? search.modifications
                    .filter(function (mod) {
                        return mod.fixed === "t";
                    })
                    .map(function (mod) {
                        return modDesc(mod);
                    })
                    .join(", ") : "",
                varModList: search.modifications ? search.modifications
                    .filter(function (mod) {
                        return mod.fixed === "f";
                    })
                    .map(function (mod) {
                        return modDesc(mod);
                    })
                    .join(", ") : "",
                crosslinkerDesc: crosslinkerDescs ? crosslinkerDescs
                    .map(function (clinkDesc) {
                        return clinkDesc.name + " on " + clinkDesc.first + (clinkDesc.second ? " at one end of the cross-link to " + clinkDesc.second + " at the other" : "");
                    })
                    .join(", ") : "",
            };

            // turn crosslinker and other values into description per search
            return template(values);
        });

        // rationalise so that searches with the same exact description shared a paragraph in the output
        const dmap = d3.map();
        descriptions.forEach(function(desc, i) {
            let arr = dmap.get(desc);
            if (!arr) {
                arr = [];
                dmap.set(desc, arr);
            }
            arr.push(searches[i].id);
        });

        const fullDesc = dmap.entries()
            .map(function (entry) {
                return "Search " + entry.value.join(", ") + " -> " + entry.key;
            })
            .join("\r\n\r\n");

        return fullDesc;
    },

    identifier: "Search Summaries",
});
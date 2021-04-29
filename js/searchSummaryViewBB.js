var CLMSUI = CLMSUI || {};

CLMSUI.SearchSummaryViewBB = CLMSUI.utils.BaseFrameView.extend({
    events: function() {
        var parentEvents = CLMSUI.utils.BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {});
    },

    initialize: function(viewOptions) {
        CLMSUI.KeyViewBB.__super__.initialize.apply(this, arguments);

        this.listenTo(this.model, "change:matches", this.render);
        var self = this;

        var mainPanel = d3.select(this.el)
            .append("div").attr("class", "panelInner")
            .append("div").attr("class", "verticalFlexContainer");

        var descriptionButton = mainPanel.append("button")
            .classed("btn btn-1 btn-1a flexStatic", true)
            .text("Download Search Descriptions")
            .on("click", function() {
                var searchString = Array.from(self.model.get("searches").values())
                    .map(function(search) {
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
        var searches = this.model.get("searches");
        $(".searchSummaryDiv").JSONView(Array.from(searches.values()));
        $('.searchSummaryDiv').JSONView('collapse', 2);

        return this;
    },

    searchDescriptionTemplate: "The identification of cross-links was performed with <%= version %> using the following parameters: MS accuracy, <%= ms1Value %> <%= ms1Units %>; MS/MS accuracy, <%= ms2Value %> <%= ms2Units %>; enzyme, <%= enzymeNames %>; maximum missed cleavages, <%= missedCleavages %>; maximum number of modifications, <%= maxModifications %>; fixed modification, <%= fixedModList %>; variable modifications, <%= varModList %>. Cross-linking was allowed to involve <%= crossLinkerDesc %>.",

    exportDescriptions: function() {
        var template = _.template(this.searchDescriptionTemplate);
        var searches = Array.from(this.model.get("searches").values());
        var linkerData = CLMSUI.modelUtils.crosslinkerSpecificityPerLinker(searches);
        //console.log ("LD", linkerData);

        var modRegex = /^.*;MODIFIED:([^;]*)/;

        var descriptions = searches.map(function(search) {

            // https://stackoverflow.com/questions/15069587/is-there-a-way-to-join-the-elements-in-an-js-array-but-let-the-last-separator-b
            var niceJoin = function(arr) {
                return arr.length < 2 ? arr.join("") : arr.slice(0, -1).join(', ') + ' and ' + arr.slice(-1);
            };

            var codonsToNames = function (codonArray) {
                return codonArray
                    .map(function(code) {
                        var name = CLMSUI.modelUtils.amino1toNameMap[code];
                        return name ? name.replace("_", "-") : "(codon "+code+")";  // state codon if no long name
                    })
                ;
            };
            
            // crosslinker descriptions for each search
            var crossLinkerDescs = search.crosslinkers ? search.crosslinkers.map(function(clink) {
                var linkerDatum = linkerData[clink.name];
                var linkables = linkerDatum.linkables;
                var obj = {
                    name: linkerDatum.name,
                    first: niceJoin (codonsToNames (Array.from (linkables[0].values())))
                };
                if (linkerDatum.heterobi) {
                    obj.second = niceJoin (codonsToNames (Array.from (linkables[1].values())));
                }
                return obj;
            }) : "";

            // modification descriptions
            var modDesc = function(mod) {
                var residueList = mod.description.match(modRegex);
                if (residueList && residueList[1]) {
                    return mod.name + " of " + niceJoin (codonsToNames (residueList[1].split(",")));
                }
                return "";
            };

            // other values for each search
            var values = {
                version: search.version ? "Xi-Version " + search.version : search.notes,
                ms1Value: search.mstolerance,
                ms1Units: search.mstoleranceunits,
                ms2Value: search.ms2tolerance,
                ms2Units: search.ms2toleranceunits,
                enzymeNames: search.enzymes ? _.pluck(search.enzymes, "name").join(", ") : "",
                missedCleavages: search.missedcleavages,
                maxModifications: search.modifications ? search.modifications.length : 0,
                fixedModList: search.modifications ? search.modifications
                    .filter(function(mod) {
                        return mod.fixed === "t";
                    })
                    .map(function(mod) {
                        return modDesc(mod);
                    })
                    .join(", ") : "",
                varModList: search.modifications ? search.modifications
                    .filter(function(mod) {
                        return mod.fixed === "f";
                    })
                    .map(function(mod) {
                        return modDesc(mod);
                    })
                    .join(", ") : "",
                crossLinkerDesc: crossLinkerDescs ? crossLinkerDescs
                    .map(function(clinkDesc) {
                        return clinkDesc.name + " on " + clinkDesc.first + (clinkDesc.second ? " at one end of the cross-link to " + clinkDesc.second + " at the other" : "");
                    })
                    .join(", ") : "",
            };

            // turn crosslinker and other values into description per search
            return template(values);
        });

        // rationalise so that searches with the same exact description shared a paragraph in the output
        var dmap = d3.map();
        descriptions.forEach(function(desc, i) {
            var arr = dmap.get(desc);
            if (!arr) {
                arr = [];
                dmap.set(desc, arr);
            }
            arr.push(searches[i].id);
        });

        var fullDesc = dmap.entries()
            .map(function(entry) {
                return "Search " + entry.value.join(", ") + " -> " + entry.key;
            })
            .join("\r\n\r\n");

        return fullDesc;
    },

    identifier: "Search Summaries",
});
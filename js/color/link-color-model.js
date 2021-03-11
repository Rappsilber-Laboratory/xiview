var CLMSUI = CLMSUI || {};
CLMSUI.linkColour = CLMSUI.linkColour || {};

CLMSUI.BackboneModelTypes.DefaultLinkColourModel = CLMSUI.BackboneModelTypes.ColourModel.extend({
    initialize: function() {
        this
            .set("labels", this.get("colScale").copy().range(["Self", "Homomultimeric (Overlapping Peptides)", "Heteromeric"]))
            .set("type", "ordinal")
        ;
    },
    getValue: function(link) {
        // if (link.crossLinks) {
        //     return link.crossLinks[0].isSelfLink() || link.crossLinks[0].isLinearLink() ? (link.hd ? 1 : 0) : 2;
        // } else {
            return link.isSelfLink() || link.isLinearLink() ? (link.confirmedHomomultimer ? 1 : 0) : 2;
        // }
    },
    getColour: function(obj) {  // obj is generally a crosslink, but is non-specific at this point
        if (obj.crossLinks) {
            return "#202020";
        }
        const val = this.getValue(obj);
        return val !== undefined ? this.get("colScale")(val) : this.get("undefinedColour");
    },
});

CLMSUI.BackboneModelTypes.GroupColourModel = CLMSUI.BackboneModelTypes.ColourModel.extend({
    initialize: function(attrs, options) {

        this.searchMap = options.searchMap;
        // find the search to group mappings
        const groups = new Map();
        const searchArray = CLMS.arrayFromMapValues(this.searchMap);
        searchArray.forEach(function(search) {
            let arr = groups.get(search.group);
            if (!arr) {
                arr = [];
                groups.set(search.group, arr);
            }
            arr.push(search.id);
        });

        // build scales on the basis of this mapping
        const groupDomain = [-1]; //[undefined];
        let labelRange = ["Multiple Groups"];
        const groupArray = CLMS.arrayFromMapEntries(groups);
        groupArray.forEach(function(group) {
            groupDomain.push(group[0]);
            labelRange.push("Group " + group[0] + " (" + group[1].join(", ") + ")");
        });

        const groupCount = groups.size;
        let colScale;

        const multiGroupColour = "#202020"; // default colour for links involved in multiple groups
        if (groupCount < 11) {
            const colArr = [multiGroupColour].concat(groupCount < 6 ? ["#1b9e77",
            "#7570b3",
            "#e7298a",
            "#66a61e",
            "#d95f02"
            ] : colorbrewer.Paired[10]);
            colScale = d3.scale.ordinal().range(colArr).domain(groupDomain);
        } else { // more than 10 groups, not really feasible to find colour scale that works - a d3.scale that always returns gray?
            colScale = d3.scale.linear().domain([-1, 0]).range([multiGroupColour, "#448866"]).clamp(true);
            labelRange = ["Multiple Groups", "Single Group"];
        }
        this
            .set("colScale", colScale)
            .set("labels", this.get("colScale").copy().range(labelRange))
            .set("type", "ordinal")
        ;
    },
    getValue: function(link) {
        if (link.crossLinks) {
            for (let crosslink of link.crossLinks) {
                const filteredMatchesAndPepPositions = crosslink.filteredMatches_pp;

                let value = null;
                for (let fm_pp = filteredMatchesAndPepPositions.length; --fm_pp >= 0;) {
                    const match = filteredMatchesAndPepPositions[fm_pp].match;
                    const group = this.searchMap.get(match.searchId).group;
                    if (!value) {
                        value = group;
                    } else if (value !== group) {
                        value = -1;    //undefined;
                        break;
                    }
                }
                // choose value if link definitely belongs to just one group or set as undefined (-1)
                return value;
            }
        }
        else {
            //check if link uniquely belongs to one group
            const filteredMatchesAndPepPositions = link.filteredMatches_pp;

            let value = null;
            for (let fm_pp = filteredMatchesAndPepPositions.length; --fm_pp >= 0;) {
                const match = filteredMatchesAndPepPositions[fm_pp].match;
                const group = this.searchMap.get(match.searchId).group;
                if (!value) {
                    value = group;
                } else if (value !== group) {
                    value = -1;    //undefined;
                    break;
                }
            }
            // choose value if link definitely belongs to just one group or set as undefined (-1)
            return value;
        }
    },
    getColourByValue: function(val) {
        const scale = this.get("colScale");
        // the ordinal scales will have had a colour for undefined already added to their scales (in initialize)
        // if it's the linear scale [-1 = multiple, 0 = single] and value is undefined we change it to -1 so it then takes the [multiple] colour value
        if (val === undefined && scale.domain()[0] === -1) {
            val = -1;
        }
        // now all 'undefined' values will get a colour so we don't have to check/set undefined colour here like we do in the default getColour function
        return scale(val);
    },
    getColour: function(crossLink) {
        return this.getColourByValue (this.getValue (crossLink));
    },
});

CLMSUI.BackboneModelTypes.DistanceColourModel = CLMSUI.BackboneModelTypes.ColourModel.extend({
    initialize: function() {
        this
            .set("type", "threshold")
            .set("labels", this.get("colScale").copy().range(["Within Distance", "Borderline", "Overlong"]))
            .set("unit", "Å")
        ;
    },
    getValue: function(link) {
        if (link.crossLinks) {
            return undefined;
        }
        return link.getMeta("distance");
        //return CLMSUI.compositeModelInst.getSingleCrosslinkDistance(crossLink);
    },
});

CLMSUI.BackboneModelTypes.InterProteinColourModel = CLMSUI.BackboneModelTypes.ColourModel.extend({
    initialize: function(properties, options) {
        let colScale;
        let labels = ["Same Protein"];
        const proteinIDs = _.pluck(CLMSUI.modelUtils.filterOutDecoyInteractors(CLMS.arrayFromMapValues(options.proteins)), "id");

        if (proteinIDs && proteinIDs.length > 2 && proteinIDs.length < 6) {
            const groupDomain = ["same"];
            proteinIDs.forEach (function (proteinID1, i) {
                for (let m = i + 1; m < proteinIDs.length; m++) {
                    groupDomain.push (this.makeProteinPairKey(proteinID1, proteinIDs[m]));
                    labels.push (options.proteins.get(proteinID1).name + " - " + options.proteins.get(proteinIDs[m]).name);
                }
            }, this);
            const colArr = colorbrewer.Set3[10].slice();
            colArr.unshift("grey");
            colScale = d3.scale.ordinal().range(colArr).domain(groupDomain);
        } else {
            colScale = d3.scale.ordinal().range(["blue", "grey"]).domain(["other", "same"]);
            labels = ["Other", "Same"];
            this.overload = true;   // too many proteins for sensible number of colours
        }

        this
            .set("colScale", colScale)
            .set("labels", this.get("colScale").copy().range(labels))
        ;
    },

    makeProteinPairKey: function(pid1, pid2) {
        return pid1 < pid2 ? pid1 + "---" + pid2 : pid2 + "---" + pid1;
    },

    getValue: function(link) {
        let id1, id2;
        if (link.crossLinks) {
            id1 = link.crossLinks[0].fromProtein.id;
            id2 = link.crossLinks[0].toProtein ? link.crossLinks[0].toProtein.id : undefined;
        } else {
            id1 = link.fromProtein.id;
            id2 = link.toProtein ? link.toProtein.id : undefined;
        }
        return (id2 === undefined || id1 === id2) ? "same" : (this.overload ? "other" : this.makeProteinPairKey(id1, id2));
    },
});

CLMSUI.BackboneModelTypes.HighestScoreColourModel = CLMSUI.BackboneModelTypes.ColourModel.extend({
    initialize: function(properties, options) {
        this.set("type", "threshold")
            .set("labels", this.get("colScale").copy().range(["Low Score", "Mid Score", "High Score"]));
    },
    getValue: function (link) {
        let scores = [];
        if (link.crossLinks) { // watch out! proteins also have an att called crossLinks
            for (let crosslink of link.crossLinks) {
                //todo if we were certain the matches were sorted by score we could speed this up by only taking first match
                for (let m_pp of crosslink.filteredMatches_pp) {
                    scores.push(m_pp.match.score());
                }
            }
        }else {
            scores = link.filteredMatches_pp.map(function(m) {
                return m.match.score();
            });
        }
        return Math.max.apply(Math, scores);
    },
    getLabelColourPairings: function () {
        const colScale = this.get("colScale");
        const labels = this.get("labels").range();//.concat(this.get("undefinedLabel"));
        const minLength = Math.min(colScale.range().length, this.get("labels").range().length);  // restrict range used when ordinal scale
        const colScaleRange = colScale.range().slice(0, minLength);//.concat(this.get("undefinedColour"));
       return d3.zip (labels, colScaleRange);
    },
});

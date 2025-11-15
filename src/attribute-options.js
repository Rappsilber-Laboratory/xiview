export const attributeOptions =
    [
        {
            linkFunc: function (link) {
                return [link.filteredMatches_pp.length];
            },
            unfilteredLinkFunc: function (link) {
                return [link.matches_pp.length];
            },
            id: "MatchCount",
            label: "Crosslink Match Count",
            decimalPlaces: 0
        },
        {
            linkFunc: function (link) {
                return link.filteredMatches_pp.map(function (m) {
                    return m.match.score();
                });
            },
            unfilteredLinkFunc: function (link) {
                return link.matches_pp.map(function (m) {
                    return m.match.score();
                });
            },
            id: "Score",
            label: "Match Score",
            decimalPlaces: 2,
            matchLevel: true
        },
        {
            linkFunc: function (link) {
                const scores = link.filteredMatches_pp.map(function (m) {
                    return m.match.score();
                });
                return [Math.max.apply(Math, scores)];
            },
            unfilteredLinkFunc: function (link) {
                const scores = link.matches_pp.map(function (m) {
                    return m.match.score();
                });
                return [Math.max.apply(Math, scores)];
            },
            id: "Highest Score",
            label: "Highest Match Score per Crosslink",
            decimalPlaces: 2,
            matchLevel: false
        },
        {
            linkFunc: function (link) {
                return link.filteredMatches_pp.map(function (m) {
                    return m.match.precursorMZ;
                });
            },
            unfilteredLinkFunc: function (link) {
                return link.matches_pp.map(function (m) {
                    return m.match.precursorMZ;
                });
            },
            id: "MZ",
            label: "Match Precursor m/z",
            decimalPlaces: 4,
            matchLevel: true
        },
        {
            linkFunc: function (link) {
                return link.filteredMatches_pp.map(function (m) {
                    return m.match.precursorCharge;
                });
            },
            unfilteredLinkFunc: function (link) {
                return link.matches_pp.map(function (m) {
                    return m.match.precursorCharge;
                });
            },
            id: "Charge",
            label: "Match Precursor Charge (z)",
            decimalPlaces: 0,
            matchLevel: true
        },
        {
            linkFunc: function (link) {
                return link.filteredMatches_pp.map(function (m) {
                    return m.match.calcMass();
                });
            },
            unfilteredLinkFunc: function (link) {
                return link.matches_pp.map(function (m) {
                    return m.match.calcMass();
                });
            },
            id: "CalcMass",
            label: "Match Calculated Mass (m)",
            decimalPlaces: 4,
            matchLevel: true
        },
        {
            linkFunc: function (link) {
                return link.filteredMatches_pp.map(function (m) {
                    return m.match.massError();
                });
            },
            unfilteredLinkFunc: function (link) {
                return link.matches_pp.map(function (m) {
                    return m.match.massError();
                });
            },
            id: "MassError",
            label: "Match Mass Error",
            decimalPlaces: 4,
            matchLevel: true
        },
        {
            linkFunc: function (link) {
                return link.filteredMatches_pp.map(function (m) {
                    return m.match.missingPeaks();
                });
            },
            unfilteredLinkFunc: function (link) {
                return link.matches_pp.map(function (m) {
                    return m.match.missingPeaks();
                });
            },
            id: "MissingPeaks",
            label: "Missing Peaks",
            decimalPlaces: 0,
            matchLevel: true
        },
        {
            linkFunc: function (link) {
                return link.filteredMatches_pp.map(function (m) {
                    return Math.min(m.pepPos[0].length, m.pepPos[1].length);
                });
            },
            unfilteredLinkFunc: function (link) {
                return link.matches_pp.map(function (m) {
                    return Math.min(m.pepPos[0].length, m.pepPos[1].length);
                });
            },
            id: "SmallPeptideLen",
            label: "Match Smaller Peptide Length (AA)",
            decimalPlaces: 0,
            matchLevel: true
        },
        {
            linkFunc: function (link) {
                return link.filteredMatches_pp.map(function (m) {
                    const p = m.match.precursor_intensity;
                    return isNaN(p) ? undefined : p;
                });
            },
            unfilteredLinkFunc: function (link) {
                return link.matches_pp.map(function (m) {
                    const p = m.match.precursor_intensity;
                    return isNaN(p) ? undefined : p;
                });
            },
            id: "PrecursorIntensity",
            label: "Match Precursor Intensity",
            decimalPlaces: 0,
            matchLevel: true,
            valueFormat: function (n) {
                return n.toExponential(1);
            },
            logAxis: true,
            logStart: 1000
        },
        {
            linkFunc: function (link) {
                return link.filteredMatches_pp.map(function (m) {
                    return m.match.elution_time_start;
                });
            },
            unfilteredLinkFunc: function (link) {
                return link.matches_pp.map(function (m) {
                    return m.match.elution_time_start;
                });
            },
            id: "ElutionTimeStart",
            label: "Elution Time Start",
            decimalPlaces: 2,
            matchLevel: true
        },
        {
            linkFunc: function (link) {
                return link.filteredMatches_pp.map(function (m) {
                    return m.match.elution_time_end;
                });
            },
            unfilteredLinkFunc: function (link) {
                return link.matches_pp.map(function (m) {
                    return m.match.elution_time_end;
                });
            },
            id: "ElutionTimeEnd",
            label: "Elution Time End",
            decimalPlaces: 2,
            matchLevel: true
        },
        {
            //watch out for the 'this' reference
            linkFunc: function (link) {
                //return link.isLinearLink() ? [] : [this.model.getSingleCrosslinkDistance(link, null, null, option)];
                return link.isLinearLink() ? [] : [link.getMeta("distance")];
            },
            unfilteredLinkFunc: function (link) {
                //return link.isLinearLink() ? [] : [this.model.getSingleCrosslinkDistance(link, null, null, option)];
                return link.isLinearLink() ? [] : [link.getMeta("distance")];
            },
            id: "Distance",
            label: "Crosslink Cα-Cα Distance (Å)",
            decimalPlaces: 2,
            maxVal: 90,
        },
        {
            linkFunc: function (link) {
                return link.filteredMatches_pp.map(function (m) {
                    return m.match.experimentalMissedCleavageCount();
                });
            },
            unfilteredLinkFunc: function (link) {
                return link.matches_pp.map(function (m) {
                    return m.match.experimentalMissedCleavageCount();
                });
            },
            id: "ExpMissedCleavages",
            label: "Experimental Max. Missed Cleavages",
            decimalPlaces: 0,
            matchLevel: true
        },
        {
            linkFunc: function (link) {
                return link.filteredMatches_pp.map(function (m) {
                    return m.match.searchMissedCleavageCount();
                });
            },
            unfilteredLinkFunc: function (link) {
                return link.matches_pp.map(function (m) {
                    return m.match.searchMissedCleavageCount();
                });
            },
            id: "SearchMissedCleavages",
            label: "Search Max. Missed Cleavages",
            decimalPlaces: 0,
            matchLevel: true
        },
        {
            linkFunc: function (link) {
                return link.filteredMatches_pp.map(function (m) {
                    return m.match.modificationCount();
                });
            },
            unfilteredLinkFunc: function (link) {
                return link.matches_pp.map(function (m) {
                    return m.match.modificationCount();
                });
            },
            id: "ModificationCount",
            label: "Modification Count",
            decimalPlaces: 0,
            matchLevel: true
        },
    ];

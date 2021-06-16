var CLMSUI = CLMSUI || {};

CLMSUI.BackboneModelTypes = _.extend(CLMSUI.BackboneModelTypes || {},

    {
        // I want MinigramBB to be model agnostic so I can re-use it in other places
        MinigramModel: Backbone.Model.extend({
            defaults: {
                //domainStart: 0,
                //domainEnd: 100,
            },
            data: function() {
                return [1, 2, 3, 4];
            },
            extent: [0,4],
        }),

        TooltipModel: Backbone.Model.extend({
            defaults: {
                location: null,
                header: "Tooltip",
            },
            initialize: function() {
                // ^^^setting an array in defaults passes that same array reference to every instantiated model, so do it in initialize
                this.set("contents", ["Can show", "single items", "lists or", "tables"]);
            }
        }),

        BlosumModel: Backbone.Model.extend({
            initialize: function() {
                //console.log ("Blosum model initialised", this);
            },
        }),

        /*
        ConsensusModel: Backbone.Model.extend({
            initialize: function(modelOptions) {

            },

            fromSequences: function(sequences, categoryCount) {
                var max = d3.max(sequences, function(seq) {
                    return seq.length;
                });
                var maxRange = d3.range(0, max);
                var baseCounts = maxRange.map(function() {
                    return {};
                });
                var seqCounts = maxRange.map(function() {
                    return 0;
                });

                for (var i = 0; i < max; i++) {
                    sequences.forEach(function(seq) {
                        var letter = seq[i];
                        if (letter) {
                            if (!baseCounts[i][letter]) {
                                baseCounts[i][letter] = 0;
                            }
                            baseCounts[i][letter]++;
                            seqCounts[i]++;
                        }
                    });
                }

                var approxCounts = seqCounts.map(function(seqCount) {
                    return (1 / Math.log(2)) * ((categoryCount - 1) / (2 * seqCount));
                });

                var uncertainties = baseCounts.map(function(bc, i) {
                    var total = seqCounts[i];
                    return d3.sum(d3.values(bc), function(d) {
                        var relFreq = d / total;
                        return -(relFreq * Math.log2(relFreq));
                    });
                });

                var information = uncertainties.map(function(unc, i) {
                    return Math.log2(categoryCount) - (unc + approxCounts[i]);
                });

                var heights = baseCounts.map(function(baseCount, i) {
                    var entries = d3.entries(baseCount);
                    var height = {};
                    entries.forEach(function(entry) {
                        height[entry.key] = information[i] * (entry.value / seqCounts[i]);
                    });
                    return height;
                });

                this.set("heights", heights);
                console.log("bb", baseCounts, seqCounts, approxCounts, uncertainties, information, heights);
            },
        }),
        */

    });

// this is separate to get round the fact BlosumModel won't be available within the same declaration
CLMSUI.BackboneModelTypes = _.extend(CLMSUI.BackboneModelTypes || {}, {
    BlosumCollection: Backbone.Collection.extend({
        model: CLMSUI.BackboneModelTypes.BlosumModel,
        url: "R/blosums.json",
        parse: function(response) {
            // turn json object into array, add keys to value parts, then export just the values
            var entries = d3.entries (response);
            var values = entries.map(function (entry) {
                entry.value.id = entry.key;
                entry.value.name = entry.key;
                return entry.value;
            });

            console.log ("response", response, values);
            return values;
        }
    }),
});

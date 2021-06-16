// var CLMSUI = CLMSUI || {};
//
// CLMSUI.BackboneModelTypes = _.extend(CLMSUI.BackboneModelTypes || {},
//
//     {
        // I want MinigramBB to be model agnostic so I can re-use it in other places
        MinigramModel = Backbone.Model.extend({
            defaults: {
                //domainStart: 0,
                //domainEnd: 100,
            },
            data: function() {
                return [1, 2, 3, 4];
            },
            extent: [0,4],
        });

        TooltipModel = Backbone.Model.extend({
            defaults: {
                location: null,
                header: "Tooltip",
            },
            initialize: function() {
                // ^^^setting an array in defaults passes that same array reference to every instantiated model, so do it in initialize
                this.set("contents", ["Can show", "single items", "lists or", "tables"]);
            }
        });

        BlosumModel = Backbone.Model.extend({
            initialize: function() {
                //console.log ("Blosum model initialised", this);
            },
        });


// this is separate to get round the fact BlosumModel won't be available within the same declaration
// CLMSUI.BackboneModelTypes = _.extend(CLMSUI.BackboneModelTypes || {}, {
    BlosumCollection = Backbone.Collection.extend({
        model: BlosumModel,
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
    });
// });

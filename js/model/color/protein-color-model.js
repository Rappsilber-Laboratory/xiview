var CLMSUI = CLMSUI || {};

DefaultProteinColourModel = ColourModel.extend({
    initialize: function () {
        this
            .set("labels", this.get("colScale").copy().range(["Protein"]))
            .set("type", "ordinal")
        ;
    },
    getValue: function () {
        return 0;
    },
});

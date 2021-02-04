var CLMSUI = CLMSUI || {};

CLMSUI.BackboneModelTypes.DefaultProteinColourModel = CLMSUI.BackboneModelTypes.ColorModel.extend({
    initialize: function() {
        this
            .set("labels", this.get("colScale").copy().range(["Protein"]))
            .set("type", "categorical")
        ;
    },
    getValue: function () {
        return 0;
    },
});

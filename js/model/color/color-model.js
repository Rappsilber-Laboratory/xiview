import Backbone from "backbone";
import d3 from "d3";

export class ColourModel extends Backbone.Model {
    constructor(attributes, options) {
        super(attributes, options);
    }

    defaults() {
        return {
            title: undefined,
            longDescription: undefined,
            type: "linear",
            fixed: false,
            undefinedColour: "#aaaaaaff",
            undefinedLabel: "Unknown",
            unit: "",
        };
    }

    // used by threeColourSliderBB.js
    setDomain(newDomain) {
        this.get("colScale").domain(newDomain);
        this.triggerColourModelChanged({
            domain: newDomain
        });
        return this;
    }

    // used by KeyViewBB.changeColour
    setRange(newRange) {
        this.get("colScale").range(newRange);
        this.triggerColourModelChanged({
            range: newRange
        });
        return this;
    }

    //used by distogram and scatterplot
    getDomainIndex(obj) {    // obj is generally a crosslink, but is non-specific at this point
        const val = this.getValue(obj);
        const dom = this.get("colScale").domain();
        return val != undefined ? (this.get("type") !== "ordinal" ? d3.bisect(dom, val) : dom.indexOf(val)) : undefined;
    }

    //used by scatterplot
    getDomainCount() {
        const domain = this.get("colScale").domain();
        return this.isCategorical() ? (this.get("type") === "threshold" ? domain.length + 1 : domain.length) : domain[1] - domain[0] + 1;
    }

    // general entry point - all concrete subclasses must implement getValue(), all also implement initialise
    getColour(obj) {  // obj is generally a crosslink, but is non-specific at this point
        const val = this.getValue(obj);
        return val !== undefined ? this.get("colScale")(val) : this.get("undefinedColour");
    }

    getColourByValue(val) {
        return val !== undefined ? this.get("colScale")(val) : this.get("undefinedColour");
    }

    // called by setDomain & setRange above
    triggerColourModelChanged(changedAttrs) {
        this.trigger("colourModelChanged", this, changedAttrs);
    }

    // used by BaseFrameView.makeChartTitle, scatterplot & distogram
    isCategorical() {
        return this.get("type") !== "linear";
    }

    // over-ridden by HighestScoreColourModel, called by utils.updateColourKey & keyViewBB.render
    getLabelColourPairings() {
        const colScale = this.get("colScale");
        const labels = this.get("labels").range().concat(this.get("undefinedLabel"));
        const minLength = Math.min(colScale.range().length, this.get("labels").range().length);  // restrict range used when ordinal scale
        const colScaleRange = colScale.range().slice(0, minLength).concat(this.get("undefinedColour"));
        return d3.zip(labels, colScaleRange);
    }
}

export const ColourModelCollection = Backbone.Collection.extend({
    model: ColourModel,
});


export class MetaDataHexValuesColourModel extends ColourModel {
    initialize() {
        this.set("labels", this.get("colScale").copy());
    }

    getValue(obj) {  // obj can be anything with a getMeta function - crosslink or, now, proteins
        if (obj.isAggregateLink) { //} obj.crosslinks) {
            return obj.getCrosslinks()[0].id;
        }
        return obj.id;
    }
}

export class MetaDataColourModel extends ColourModel {
    // eslint-disable-next-line no-unused-vars
    initialize(properties, options) {
        const domain = this.get("colScale").domain();
        this.set("labels", this.get("colScale").copy().range(domain)); //
    }

    getValue(obj) {  // obj can be anything with a getMeta function - crosslink or, now, proteins
        if (obj.isAggregateLink) { //} obj.crosslinks) {
            return obj.getCrosslinks()[0].getMeta(this.get("field"));
        }
        return obj.getMeta(this.get("field"));
    }
}

export class ThresholdColourModel extends ColourModel { // todo -code duplication with Highest score col model
    initialize() {
        this.set("type", "threshold")
            .set("labels", this.get("colScale").copy().range(["Low", "Mid", "High"]));
    }

    getValue(obj) {
        // return obj.getMeta(this.get("field"));

        let scores = [];
        if (obj.isAggregateLink) {
            for (let crosslink of obj.getCrosslinks()) {
                const val = crosslink.getMeta(this.get("field"));
                if (isFinite(val) && !isNaN(parseFloat(val))) {
                    scores.push(val);
                }
            }
        } else {
            // scores.push(obj.getMeta(this.get("field")));
            const val = obj.getMeta(this.get("field"));
            if (isFinite(val) && !isNaN(parseFloat(val))) {
                scores.push(val);
            }
        }
        const max = Math.max.apply(Math, scores);
        if (isFinite(max)) {
            return max;
        } else {
            return undefined;
        }
    }

    getLabelColourPairings() {
        const colScale = this.get("colScale");
        const labels = this.get("labels").range().concat(this.get("undefinedLabel"));
        const minLength = Math.min(colScale.range().length, this.get("labels").range().length);  // restrict range used when ordinal scale
        const colScaleRange = colScale.range().slice(0, minLength).concat(this.get("undefinedColour"));
        return d3.zip(labels, colScaleRange);
    }
}

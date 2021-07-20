import * as _ from 'underscore';
import Backbone from "backbone";
import d3 from "d3";
const colorbrewer = require('colorbrewer');

export class AnnotationType extends Backbone.Model{
    constructor(attributes, options) {
        super(attributes, options);
    }

    defaults(){
        return {
            id: undefined,
            category: undefined,
            type: undefined,
            shown: false,
            colour: undefined,
        };
    }

    initialize (options) {
        const defaultOptions = {};
        this.options = _.extend(defaultOptions, options);
        this
            .set("id", (options.category + "-" + options.type).toLocaleLowerCase())
            .set("category", options.category)
            .set("type", options.type)
        ;
    }

}

export class AnnotationTypeCollection extends Backbone.Collection {

    constructor(attributes, options) {
        super(attributes, options);
        this.model = AnnotationType;

        //todo - make these static?
        this.dict = {
            "domains and sites": "sites",
            "structural": "secondary structure",
            "variants": "natural variations",
            "ptm": "amino acid modifications",
            "mutagenesis": "experimental info",
            "sequence information": "experimental info",
        };

        this.baseScale = d3.scale.ordinal()
            .range(colorbrewer.Set3[11])
            .domain(["aa", "alignment", "molecule processing", "regions", "sites", "amino acid modifications", "natural variations", "experimental info", "secondary structure", "undefined"])
        ;
    }

    initialize (models, options) {
        this.listenTo(vent, "userAnnotationsUpdated", function (details) {
            if (details.types) {
                // modelId declaration below is needed to stop same ids getting added - https://github.com/jashkenas/backbone/issues/3533
                this.add(details.types);
            }
        });
    }

    modelId (attrs) {
        return (attrs.category + "-" + attrs.type).toLocaleLowerCase();
    }

    comparator (model) {
        return model.get("id");
    }

    getColour (catName, typeName) {
        catName = catName || "undefined";
        typeName = typeName || "undefined";
        const id = this.modelId({category: catName, type: typeName});
        const annotTypeModel = this.get(id);

        if (annotTypeModel) {
            if (!annotTypeModel.get("colour")) {
                catName = this.dict[catName] || catName;
                const catColour = this.baseScale(catName);
                let hash = 0,
                    i, chr;
                if (typeName) {
                    for (i = 0; i < typeName.length; i++) {
                        chr = typeName.charCodeAt(i);
                        hash = ((hash << 5) - hash) + chr;
                        hash |= 0; // Convert to 32bit integer
                    }
                }

                let shade = (hash & 255) / 255;
                shade = (shade * 0.7) + 0.2;
                const hsl = d3.hsl(catColour);
                const newHsl = d3.hsl(hsl.h, shade, shade);
                annotTypeModel.set("colour", newHsl.toString());
            }
            return annotTypeModel.get("colour");
        }
        return "#888888";
    }

    /*
    window.domainColours.cols = {
        "aa-cross-linkable": "#a6cee3",
        "aa-digestible": "#1f78b4",
        "alignment-pdb aligned region": "#b2df8a",
    };
    */
}
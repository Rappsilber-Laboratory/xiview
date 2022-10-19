import {ColourModel} from "./color-model";

export class DefaultProteinColourModel extends ColourModel {
    initialize() {
        this
            .set("labels", this.get("colScale").copy().range(["Protein"]))
            .set("type", "ordinal");
    }

    getValue() {
        return 0;
    }
}

export class ManualProteinColourModel extends ColourModel {

    initialize() {
        this.colourAssignment = new Map();
        // this
        //     .set("labels", this.get("colScale").copy().range(["Protein"]))
        //     .set("type", "ordinal");
    }

    // getValue() {
    //     return 0;
    // }

    getColour(obj) {
        console.log(obj.id, this.colourAssignment.get(obj.id));
        if (this.colourAssignment.has(obj.id)) {
            return this.colourAssignment.get(obj.id);
        } else {
            return "#FFFFFF";
        }
    }

    setInteractorColour(interactorId, colour) {
        this.colourAssignment.set(interactorId, colour);
    }

    // called by utils.updateColourKey & keyViewBB.render
    getLabelColourPairings() {
        // const colScale = this.get("colScale");
        // const labels = this.get("labels").range().concat(this.get("undefinedLabel"));
        // const minLength = Math.min(colScale.range().length, this.get("labels").range().length);  // restrict range used when ordinal scale
        // const colScaleRange = colScale.range().slice(0, minLength).concat(this.get("undefinedColour"));
        // return d3.zip(labels, colScaleRange);

        return Array.from(this.colourAssignment.entries());
    }
}

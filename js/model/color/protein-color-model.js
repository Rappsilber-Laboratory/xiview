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

export class ManualColourModel extends ColourModel {

    initialize() {
        this.colourAssignment = new Map();
    }

    setMap(obj) {
        this.colourAssignment.clear();
        for (let [key, value] of Object.entries(obj)) {
            this.colourAssignment.set(key, value);
        }
    }

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

    hasManualAssignment(interactorId) {
        return this.colourAssignment.has(interactorId);
    }

    removeManualAssignment(interactorId) {
        this.colourAssignment.delete(interactorId);
    }

    // called by utils.updateColourKey & keyViewBB.render
    getLabelColourPairings() {
        return Array.from(this.colourAssignment.entries());
    }
}

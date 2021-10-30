import {ColourModel} from "./color-model";

export class DefaultProteinColourModel extends ColourModel {
    initialize  () {
        this
            .set("labels", this.get("colScale").copy().range(["Protein"]))
            .set("type", "ordinal");
    }

    getValue  () {
        return 0;
    }
}

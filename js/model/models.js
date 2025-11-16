import "../../css/minigram.css";
import Backbone from "backbone";
import d3 from "d3";

// I want MinigramBB to be model agnostic so I can re-use it in other places

export class MinigramModel extends Backbone.Model {
    defaults() {
        return {
            //domainStart: 0,
            //domainEnd: 100,
        };
    }

    data() {
        return [1, 2, 3, 4];
    }
}

MinigramModel.prototype.extent = [0, 4];

export class TooltipModel extends Backbone.Model {
    defaults() {
        return {
            location: null,
            header: "Tooltip",
        };
    }

    initialize() {
        // ^^^setting an array in defaults passes that same array reference to every instantiated model, so do it in initialize
        this.set("contents", ["Can show", "single items", "lists or", "tables"]);
    }
}

class BlosumModel extends Backbone.Model {
    initialize() {
        //console.log ("Blosum model initialised", this);
    }
}


// this is separate to get round the fact BlosumModel won't be available within the same declaration
export class BlosumCollection extends Backbone.Collection {
    constructor(models, options) {
        super(models, options);
        this.model = BlosumModel;
        this.url = "R/blosums.json";
    }

    parse(response) {
        // turn json object into array, add keys to value parts, then export just the values
        const entries = d3.entries(response);
        const values = entries.map(function (entry) {
            entry.value.id = entry.key;
            entry.value.name = entry.key;
            return entry.value;
        });
        return values;
    }
}

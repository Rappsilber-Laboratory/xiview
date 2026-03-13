import * as _ from "underscore";
import Backbone from "backbone";

export const xiSPECUI = {
    vent: _.extend({}, Backbone.Events),
    lastRequestedID: undefined,
};

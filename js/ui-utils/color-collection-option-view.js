// import * as _ from 'underscore';
import Backbone from "backbone";
import d3 from "d3";

export const ColourCollectionOptionViewBB = Backbone.View.extend({
    initialize: function (options) {
        const self = this;
        d3.select(this.el).attr("class", "btn selectHolder")
            .append("span")
            .attr("class", "noBreak")
            .html((options.label || "Crosslink Colour Scheme") + " ►");

        const addOptions = function (selectSel) {
            const optionSel = selectSel
                .selectAll("option")
                .data(self.model.toJSON())
            ;
            optionSel.exit().remove();
            optionSel.enter().append("option");
            optionSel
                .text(function (d) {
                    return d.title;
                })
                .property("value", function (d) {
                    return d.id;
                })
                .attr("title", function (d) {
                    return d.longDescription;
                })
                .order();
        };

        d3.select(this.el).select("span.noBreak")
            .append("select")
            .attr("id", "linkColourSelect")
            .on("change", function () {
                if (options.storeSelectedAt) {
                    const colourModel = self.model.at(d3.event.target.selectedIndex);
                    //window.compositeModelInst.set("linkColourAssignment", colourModel);
                    options.storeSelectedAt.model.set(options.storeSelectedAt.attr, colourModel);
                }
            })
            .call(addOptions);

        if (options.storeSelectedAt) {
            this.listenTo(options.storeSelectedAt.model, "change:" + options.storeSelectedAt.attr, function (compModel, newColourModel) {
                //console.log ("colourSelector listening to change Link Colour Assignment", this, arguments);
                this.setSelected(newColourModel);
            });
        }

        this.listenTo(this.model, "update", function () {
            d3.select(this.el).select("select#linkColourSelect").call(addOptions);
        });

        return this;
    },

    setSelected: function (model) {
        d3.select(this.el)
            .selectAll("option")
            .property("selected", function (d) {
                return d.id === model.get("id");
            });

        return this;
    }
});

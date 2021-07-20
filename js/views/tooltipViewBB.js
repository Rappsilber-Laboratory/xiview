// import * as _ from 'underscore';
import Backbone from "backbone";
import d3 from "d3";
// import * as $ from "jquery";

export const TooltipViewBB = Backbone.View.extend({
    className: "CLMStooltip",
    initialize: function () {
        const tooltip = d3.select(this.el);
        tooltip.style("visibility", "hidden");
        tooltip.append("h2");
        tooltip.append("p");
        this.holdDuration = 10000;
        this.fadeDuration = 200;
        this.mouseOffset = 60;
        this.numberFormat = function (val) {
            return d3.round(val, 6);
        };

        this.listenTo(this.model, "change:location", this.setPosition);
        this.listenTo(this.model, "change:contents change:header", this.render);
    },
    render: function () {
        const contents = this.model.get("contents");
        if (contents === null) {
            this.setToFade();
            return;
        }

        const self = this;
        const tooltip = d3.select(this.el);
        tooltip.select("h2").text(this.model.get("header"));

        const oned = $.isArray(contents);
        const twod = oned ? $.isArray(contents[0]) : false;

        let cstring;
        if (twod) {
            cstring = "<table>";
            let rtype = contents.tableHasHeaders ? "th" : "td";
            let headerCount = 0;
            contents.forEach(function (row) {
                headerCount = headerCount || row.length;
                let str = "";
                let colspan = "";
                row.forEach(function (cell, i) {
                    if (i === row.length - 1 && row.length < headerCount) {
                        colspan = " COLSPAN=\"" + (headerCount - row.length + 1) + "\"";
                    }
                    const val = isNaN(cell) ? cell : self.numberFormat(cell);
                    str += "<" + rtype + colspan + ">" + val + "</" + rtype + ">";
                });
                rtype = "td";
                cstring += "<tr>" + str + "</tr>";
            });
            cstring += "</table>";
        } else if (oned) {
            cstring = "<ul><li>" + contents.join("<li>") + "</ul>";
        } else {
            cstring = contents;
        }

        tooltip.select("p").html(cstring);
        tooltip
            .transition()
            .style("visibility", "visible")
            .style("opacity", null)
            .transition()
            .duration(self.holdDuration)
            .each("end", function () {
                self.setToFade();
            });

        return this;
    },
    setPosition: function () {
        const e = this.model.get("location");

        //console.log ("event", e);

        const tooltip = d3.select(this.el);
        const doc = $(document);
        const win = $(window);
        const dw = doc.width();
        const dh = doc.height();
        const ww = win.width();
        const wh = win.height();
        const sx = win.scrollLeft();
        const sy = win.scrollTop();

        const tx = e.pageX;
        const ty = e.pageY;
        const tw = $.zepto ? this.$el.width() : this.$el.outerWidth(); // outerWidth in JQuery, width in Zepto
        const th = $.zepto ? this.$el.height() : this.$el.outerHeight(); // ditto, but for height

        const allDefinedAndNonZero = (dw && dh && tw && th && ww && wh); // test all widths/heights are non-zero and defined
        let newtx, newty;

        if (allDefinedAndNonZero) {
            const roomBelow = ty + th + this.mouseOffset < Math.min(dh, wh + sy);
            newty = roomBelow ? ty + this.mouseOffset : ty - th - this.mouseOffset;

            const roomRight = tx + tw + this.mouseOffset < Math.min(dw, ww + sx);
            newtx = roomRight ? tx + this.mouseOffset : tx - tw - this.mouseOffset;
        } else {
            newtx = tx;
            newty = ty;
        }

        tooltip.style("left", newtx + "px").style("top", newty + "px");
        return this;
    },
    setToFade: function () {
        const self = this;
        const tooltip = d3.select(this.el);
        tooltip
            .transition()
            .duration(self.fadeDuration)
            .style("opacity", 0)
            .each("end", function () {
                tooltip.style("visibility", "hidden");
            });
        return this;
    }
});
import Backbone from "backbone";
import d3 from "d3";

export const MinigramViewBB = Backbone.View.extend({
    events: {},

    initialize: function (viewOptions) {
        const mainDivSel = d3.select(this.el).attr("class", "minigram");
        this.chartDiv = mainDivSel.append("div")
            .attr("id", this.el.id + "c3Chart")
            .attr("class", "c3minigram");

        const margin = { top: 5, right: 10, bottom: 25, left: 10 };
        const width = 300 - margin.left - margin.right;
        const height = 65 - margin.top - margin.bottom;

        this.svg = d3.select("#" + this.el.id + "c3Chart").append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

        this.x = d3.scale.linear().range([0, width]);
        this.y = d3.scale.linear().range([height, 0]);

        this.xAxis = d3.svg.axis().scale(this.x).orient("bottom");

        this.svg.append("g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + height + ")");

        // Create the brush
        this.brush = d3.svg.brush()
            .x(this.x)
            .on("brush", this.brushed.bind(this));

        // Append the brush to the SVG
        this.brushg = this.svg.append("g")
            .attr("class", "brush")
            .call(this.brush);

        // Set the height of the brush rect
        this.brushg.selectAll("rect")
            .attr("height", height);

        this.listenTo(this.model, "change", this.redrawBrush);
        this.render();
        return this;
    },

    render: function () {
        console.log("rendering minigram", this.el.id, "with data: ", this.model.data());
        const seriesData = this.model.data();

        const min = Math.min(...seriesData.flat());
        const max = Math.max(...seriesData.flat());

        this.x.domain([min, max]);

        const data = d3.layout.histogram()
            .bins(this.x.ticks(30))(seriesData[0]);

        this.y.domain([0, d3.max(data, d => d.y)]);

        const bars = this.svg.selectAll(".bar")
            .data(data);

        // Remove old bars
        bars.exit().remove();

        if (data[0]) {
            // Add new bars
            const barsEnter = bars.enter().append("g")
                .attr("class", "bar")
                .attr("transform", d => "translate(" + this.x(d.x) + "," + this.y(d.y) + ")");

            barsEnter.append("rect")
                .attr("x", 1)
                .attr("width", d => this.x(d.dx) - this.x(0) - 1)
                .attr("height", d => this.y(0) - this.y(d.y));

            // Update existing bars
            bars.attr("transform", d => "translate(" + this.x(d.x) + "," + this.y(d.y) + ")")
                .select("rect")
                .attr("width", d => this.x(d.dx) - this.x(0) - 1)
                .attr("height", d => this.y(0) - this.y(d.y));
        }

        if (seriesData[1]) {
            const decoyData = d3.layout.histogram()
                .bins(this.x.ticks(20))(seriesData[1]);

            const decoyBars = this.svg.selectAll(".decoyBar")
                .data(decoyData);

            // Remove old decoy bars
            decoyBars.exit().remove();

            // Add new decoy bars
            const decoyBarsEnter = decoyBars.enter().append("g")
                .attr("class", "decoyBar")
                .style("fill", "red")
                .attr("transform", d => "translate(" + this.x(d.x) + "," + this.y(d.y) + ")");

            decoyBarsEnter.append("rect")
                .attr("x", 1)
                .attr("width", d => (this.x(d.dx) - this.x(0) - 1) / 2)
                .attr("height", d => this.y(0) - this.y(d.y));

            // Update existing decoy bars
            decoyBars.attr("transform", d => "translate(" + this.x(d.x) + "," + this.y(d.y) + ")")
                .select("rect")
                .attr("width", d => (this.x(d.dx) - this.x(0) - 1) / 2)
                .attr("height", d => this.y(0) - this.y(d.y));
        }

        this.svg.select(".x.axis").call(this.xAxis);

        this.brushg.call(this.brush);

        return this;
    },

    brushed: function () {
        const extent = this.brush.extent();
        if (extent[0] === extent[1]) {
            this.clearBrush();
        } else {
            this.model.set({
                domainStart: extent[0],
                domainEnd: extent[1]
            });
        }
    },

    // brushClicked: function () {
    //     if (d3.event.defaultPrevented) return; // Ignore click events that are part of a brush event
    //     this.clearBrush();
    // },

    clearBrush: function () {
        this.brush.clear();
        this.brushg.call(this.brush);
        this.model.set({
            domainStart: null,
            domainEnd: null
        });
    },

    brushRecalc: function () {
        if (this.model.get("domainStart") !== undefined) {
            this.brush.extent([this.model.get("domainStart"), this.model.get("domainEnd")]);
            this.brushg.call(this.brush);
        }
        return this;
    },

    redrawBrush: function () {
        if (!this.stopRebounds) {
            this.brushRecalc();
        }
        return this;
    },

});

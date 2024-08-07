import Backbone from "backbone";
import d3 from "d3";

export const MinigramViewBB = Backbone.View.extend({
    events: {},

    initialize: function (viewOptions) {
        // const defaultOptions = {
        //     maxX: 80,
        //     height: 60,
        //     width: 180,
        //     xAxisHeight: 20,
        //     maxBars: 50,
        // };
        // this.options = _.extend(defaultOptions, viewOptions.myOptions);
        // this.el is the dom element this should be getting added to, replaces targetDiv
        const mainDivSel = d3.select(this.el).attr("class", "minigram");
        // const bid = "#" + chartDiv.attr("id");
        const chartDiv = mainDivSel.append("div")
            .attr("id", this.el.id + "c3Chart")
            .attr("class", "c3minigram");
        this.listenTo(this.model, "change", this.redrawBrush);
        this.render();
        return this;
    },

    render: function () {
        // const self = this;
        const seriesData = this.model.data();

        var margin = {top: 5, right: 10, bottom: 25, left: 10},
            width = 300 - margin.left - margin.right,
            height = 65 - margin.top - margin.bottom;

        let min = Math.min(...seriesData[0]);
        let max = Math.max(...seriesData[0]);

        //defence against no data (distances)
        if (!min) {
            min = 0;
        }
        if (!max) {
            max = 1;
        }

        const x = d3.scale.linear()
            .domain([min, max])//[d3.min(seriesData[0]), d3.max(seriesData[0])])
            .range([0, width]);

        // Generate a histogram using twenty uniformly-spaced bins.
        const data = d3.layout.histogram()
            .bins(x.ticks(30))(seriesData[0]);

        const y = d3.scale.linear()
            .domain([0, d3.max(data, function (d) {
                return d.y;
            })])
            .range([height, 0]);

        const xAxis = d3.svg.axis()
            .scale(x)
            .orient("bottom");

        const svg = d3.select("#" + this.el.id + "c3Chart").append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

        const bar = svg.selectAll(".bar")
            .data(data)
            .enter().append("g")
            .attr("class", "bar")
            .attr("transform", function (d) {
                return "translate(" + x(d.x) + "," + y(d.y) + ")";
            });

        if (data[0]) {
            bar.append("rect")
                .attr("x", 1)
                .attr("width", x(data[0].dx) - x(0) - 1)
                .attr("height", function (d) {
                    return height - y(d.y);
                });
        }
        if (seriesData[1]) {
            const decoyData = d3.layout.histogram()
                .bins(x.ticks(20))(seriesData[1]);

            const decoyBar = svg.selectAll(".decoyBar")
                .data(decoyData)
                .enter().append("g")
                .attr("class", "decoyBar")
                .style("fill", "red")
                .attr("transform", function (d) {
                    return "translate(" + x(d.x) + "," + y(d.y) + ")";
                });

            decoyBar.append("rect")
                .attr("x", 1)
                .attr("width", (x(data[0].dx) - x(0) - 1) / 2)
                .attr("height", function (d) {
                    return height - y(d.y);
                });
        }
        svg.append("g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + height + ")")
            .call(xAxis);

        // Create the brush
        this.brush = d3.svg.brush()
            .x(x)
            // .extent([this.model.get("domainStart"), this.model.get("domainEnd")])
            .on("brush", brushed);

        // Append the brush to the SVG
        const brushg = svg.append("g")
            .attr("class", "brush")
            .call(this.brush);

        // Set the height of the brush rect
        brushg.selectAll("rect")
            .attr("height", height);

        const self = this;
        // Function to handle brushing
        function brushed() {
            const extent = self.brush.extent();
            self.model.set({
                domainStart: extent[0],
                domainEnd: extent[1]
            });
            // console.log(extent[0]);
            // console.log(extent[1]);
        }

        // brushed();

        return this;
    },

    brushRecalc: function () {
        if (this.model.get("domainStart") !== undefined) {
            this.brush.extent([this.model.get("domainStart"), this.model.get("domainEnd")]);
            d3.select("#" + this.el.id + "c3Chart").select(".brush").call(this.brush);
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
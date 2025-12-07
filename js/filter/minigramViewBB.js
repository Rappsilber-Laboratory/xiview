/**
 * @fileoverview Minigram histogram view with interactive brush selection.
 * Displays small histogram visualization of score/distance distributions with brushable range selection.
 * Supports target and decoy data overlays. Uses requestAnimationFrame for efficient batch rendering.
 * Brush interaction updates model's domainStart/domainEnd attributes for range filtering.
 */
import Backbone from "backbone";
import d3 from "d3";

/**
 * Minigram histogram view with interactive brush selection for range filtering.
 * Creates compact histogram (300x65px) showing data distribution with optional decoy overlay (red bars).
 * D3 brush tool enables range selection - dragging updates model's domainStart/domainEnd.
 * Efficient rendering with requestAnimationFrame batching. Automatically redraws on model changes.
 * @class
 * @extends Backbone.View
 * @property {d3.selection} chartDiv - D3 selection of chart container div
 * @property {d3.selection} svg - D3 selection of SVG g element
 * @property {d3.scale.linear} x - X-axis linear scale
 * @property {d3.scale.linear} y - Y-axis linear scale
 * @property {d3.svg.axis} xAxis - X-axis generator
 * @property {d3.svg.brush} brush - D3 brush behavior for range selection
 * @property {d3.selection} brushg - D3 selection of brush g element
 * @property {boolean} renderQueued - Flag to prevent duplicate render requests
 */
export class MinigramViewBB extends Backbone.View {
    constructor(options) {
        super(options);
    }

    get events() {
        return {};
    }

    /**
     * Initializes minigram view by creating SVG structure, scales, axis, and brush.
     * Sets up 300x65px SVG with margins, linear scales for x/y axes, bottom-oriented x-axis with 5 ticks,
     * D3 brush for range selection. Listens to model changes to redraw brush. Triggers initial render.
     * @param {Object} viewOptions - View initialization options (unused)
     * @returns {MinigramViewBB} this for chaining
     */
    initialize(viewOptions) {
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

        this.xAxis = d3.svg.axis().scale(this.x).orient("bottom").ticks(5);//.subticks(5);

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

        // Initialize render state
        this.pendingRender = false;
        this.renderQueued = false;

        this.listenTo(this.model, "change", this.redrawBrush);
        this.render();
        return this;
    }

    /**
     * Queues render operation using requestAnimationFrame for efficient batching.
     * Prevents duplicate render requests via renderQueued flag. Delegates to _doRender.
     * @returns {MinigramViewBB} this for chaining
     */
    render() {
        if (this.renderQueued) {
            return this;
        }

        this.renderQueued = true;
        requestAnimationFrame(() => {
            this.renderQueued = false;
            this._doRender();
        });

        return this;
    }

    /**
     * Performs actual histogram rendering with D3 data join pattern.
     * Algorithm: 1) Gets data from model, 2) Calculates min/max for x-domain, 3) Creates histogram with 30 bins,
     * 4) Updates y-domain from histogram max, 5) Updates/adds/removes target bars (blue), 6) If present, updates decoy bars (red, half-width),
     * 7) Updates x-axis, 8) Redraws brush. Uses efficient enter/update/exit pattern.
     * @returns {undefined}
     */
    _doRender() {
        const seriesData = this.model.data();

        // Find min/max without creating array copies
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < seriesData.length; i++) {
            const series = seriesData[i];
            for (let j = 0; j < series.length; j++) {
                const value = series[j];
                if (value < min) min = value;
                if (value > max) max = value;
            }
        }

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
                .bins(this.x.ticks(30))(seriesData[1]);

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
    }

    /**
     * Handles brush interaction events (user dragging brush extent).
     * If brush extent is empty (no selection), clears brush. Otherwise, updates model
     * with selected range (domainStart/domainEnd) to trigger filtering.
     * @returns {undefined}
     */
    brushed() {
        const extent = this.brush.extent();
        if (extent[0] === extent[1]) {
            this.clearBrush();
        } else {
            this.model.set({
                domainStart: extent[0],
                domainEnd: extent[1]
            });
        }
    }

    // brushClicked() {
    //     if (d3.event.defaultPrevented) return; // Ignore click events that are part of a brush event
    //     this.clearBrush();
    // }

    /**
     * Clears brush selection and resets model's domain range to null.
     * Removes visual brush extent and sets domainStart/domainEnd to null (no filtering).
     * @returns {undefined}
     */
    clearBrush() {
        this.brush.clear();
        this.brushg.call(this.brush);
        this.model.set({
            domainStart: null,
            domainEnd: null
        });
    }

    /**
     * Recalculates and redraws brush extent from model's domain range.
     * If domainStart is defined, sets brush extent to [domainStart, domainEnd] and redraws.
     * Used to sync brush visualization with model state.
     * @returns {MinigramViewBB} this for chaining
     */
    brushRecalc() {
        if (this.model.get("domainStart") !== undefined) {
            this.brush.extent([this.model.get("domainStart"), this.model.get("domainEnd")]);
            this.brushg.call(this.brush);
        }
        return this;
    }

    /**
     * Model change listener that triggers brush recalculation.
     * Calls brushRecalc unless stopRebounds flag is set (prevents infinite update loops).
     * Automatically invoked when model changes to keep brush in sync.
     * @returns {MinigramViewBB} this for chaining
     */
    redrawBrush() {
        if (!this.stopRebounds) {
            this.brushRecalc();
        }
        return this;
    }
}

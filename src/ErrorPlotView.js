import * as _ from "underscore";
import Backbone from "backbone";
import $ from "jquery";
import {svgUtils} from "../vendor/svgexp";
import {xiSPECUI} from "./xispecui";
import d3 from "d3";
import {download} from "./download";

export const ErrorPlotView = Backbone.View.extend({

    events: {},

    initialize: function (viewOptions) {

        this.listenTo(this.model, "change:QCabsErr", this.toggleAbsErr);
        this.listenTo(xiSPECUI.vent, "QCPlotToggle", this.toggleView);
        this.listenTo(xiSPECUI.vent, "resize", _.debounce(this.render));
        this.listenTo(xiSPECUI.vent, "resize:spectrum", this.render);
        this.listenTo(xiSPECUI.vent, "downloadQCSVG", this.downloadSVG);
        this.listenTo(xiSPECUI.vent, "QCWrapperShow", this.wrapperVisToggle);

        const defaultOptions = {};
        this.options = _.extend(defaultOptions, viewOptions);

        this.absolute = false;
        this.isVisible = true;
        this.wrapperVisible = false;

        let svgId = this.options.svg || this.el.getElementsByTagName("svg")[0];
        this.svg = d3.select(svgId);
        let margin = this.options.margin;

        let width = 960 - margin.left - margin.right;
        let height = 500 - margin.top - margin.bottom;

        this.svgWrapper = this.svg
            .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
            .attr("width", width)
            .attr("height", height)
            .attr("class", "wrapper");

        this.tooltipIsBBModel = this.options.compositeModelInst !== undefined;
        if (this.tooltipIsBBModel)
            this.tooltip = this.options.compositeModelInst.get("tooltipModel");
        else {
            this.tooltip = d3.select("body").append("span")
                .attr("class", "xispec_tooltip");
        }

        this.listenTo(this.model, "change", this.render);
        this.listenTo(this.model, "change:colors", this.render);
        this.listenTo(this.model, "change:highlightColor", this.render);
        this.listenTo(this.model, "changed:Highlights", this.updateHighlights);
    },

    wrapperVisToggle: function (specPanelId) {
        if (this.options.specPanelId === specPanelId)
            this.wrapperVisible = !this.wrapperVisible;
    },

    //ToDo: duplicate with SpectrumView2 downloadSVG function
    downloadSVG: function () {
        if (this.isVisible) {
            let svgSel = d3.select(this.el).selectAll("svg");
            let svgArr = svgSel[0];
            let svgStrings = svgUtils.capture(svgArr);
            let svgXML = svgUtils.makeXMLStr(new XMLSerializer(), svgStrings[0]);

            let charge = this.model.precursor.charge;
            let pepStrs = this.model.pepStrsMods;
            let linkSites = Array(this.model.get("JSONdata").LinkSite.length);

            this.model.get("JSONdata").LinkSite.forEach(function (ls) {
                linkSites[ls.peptideId] = ls.linkSite;
            });

            //insert CL sites with #
            if (linkSites.length > 0) {
                pepStrs.forEach(function (pepStr, index) {
                    let positions = [];
                    for (let i = 0; i < pepStr.length; i++) {
                        if (pepStr[i].match(/[A-Z]/) != null) {
                            positions.push(i);
                        }
                    }
                    let clAA_index = positions[linkSites[index]] + 1;
                    pepStrs[index] = pepStr.slice(0, clAA_index) + "#" + pepStr.slice(clAA_index, pepStr.length);
                });
            }

            let svg_name = pepStrs.join("-") + "_z=" + charge;
            svg_name += svgSel.node().id;
            svg_name += ".svg";
            download(svgXML, "application/svg", svg_name, true);
        }
    },

    toggleView: function (specPanelId, id) {
        if (this.options.specPanelId !== specPanelId)
            return;
        if (id === this.options.xData) {
            this.isVisible = !this.isVisible;
            $(this.el).toggle();
        }
    },

    clear: function () {
        this.svgWrapper.selectAll("*").remove();
    },

    render: function () {

        this.clear();
        if (this.model.get("JSONdata") === undefined || this.model.get("JSONdata") === null || !this.isVisible
            || !this.wrapperVisible)
            return;

        //get Data
        let fragments = this.model.fragments;

        let self = this;
        this.data = [];

        // ToDo: creating the points via the fragments->clusterInfos leads to hidden points when
        //  a peak has two annotations
        fragments.forEach(function (fragment) {
            let peptideId = fragment.peptideId;
            let fragId = fragment.id;
            let lossy = false;
            if (fragment.type.includes("Loss"))
                lossy = true;
            fragment.clusterInfo.forEach(function (cluster) {
                let firstPeakId = self.model.get("JSONdata").clusters[cluster.Clusterid].firstPeakId;
                let intensity = self.model.get("JSONdata").peaks[firstPeakId].intensity;
                let mz = self.model.get("JSONdata").peaks[firstPeakId].mz;
                let x_value = self.options.xData === "Intensity" ? intensity : mz;

                let point = {
                    fragId: fragId,
                    peptideId: peptideId,
                    lossy: lossy,
                    x: x_value,
                    error: cluster.error,
                    errorUnit: cluster.errorUnit,
                    y: self.absolute ? Math.abs(cluster.error) : cluster.error,
                    charge: cluster.matchedCharge,
                    //mz: self.model.get("JSONdata").peaks[firstPeakId].mz
                };
                self.data.push(point);
            });
        });

        let cx = $(this.el).width();
        let cy = $(this.el).height();

        let margin_bottom = this.absolute ? self.options.margin.bottom + 20 : self.options.margin.bottom;

        this.width = cx - self.options.margin.left - self.options.margin.right;
        this.height = cy - self.options.margin.top - margin_bottom;

        let xmax = d3.max(this.data, function (d) {
            return d["x"];
        });
        // let ymax = d3.max(this.data, function(d) { return d['error']; });
        let ymax = this.model.MSnTolerance.tolerance;

        let ymin = this.absolute ? 0 : 0 - ymax;

        this.x = d3.scale.linear()
            .domain([0, xmax])
            .range([0, this.width]);


        this.y = d3.scale.linear()
            .domain([ymin, ymax]).nice()
            .range([this.height, 0]).nice();
        let yTicks = this.height / 40;
        let xTicks = this.width / 100;

        this.svgWrapper.selectAll(".axis line, .axis path")
            .style({"stroke": "Black", "fill": "none", "stroke-width": "1.2px"});

        this.background = this.svgWrapper.append("rect")
            .style("fill", "white")
            // .style("z-index", -1)
            .attr("width", this.width)
            .attr("height", 0);
        this.background.on("click", function () {
            this.model.clearStickyHighlights();
        }.bind(this));

        // draw the x axis
        this.xAxis = d3.svg.axis().scale(self.x).ticks(xTicks).orient("bottom").tickFormat(d3.format("s"));

        this.xAxisSVG = this.svgWrapper.append("g")
            .attr("transform", "translate(0," + this.y(0) + ")")
            .attr("class", "axis xAxis")
            .call(this.xAxis);


        let ticks = this.xAxisSVG.selectAll(".tick text");
        ticks.attr("class", function (d, i) {
            // remove 0 for non-absolute
            if (!this.absolute && i == 0) d3.select(this).remove();
            // remove every other xTickLabel
            if (i % 2 != 0) d3.select(this).remove();
        });

        this.xLabel = this.svgWrapper.append("text")
            .attr("class", "xAxisLabel")
            .text(self.options.xData)
            .attr("dy", "2.4em")
            .style("text-anchor", "middle").style("pointer-events", "none");
        let xLabelHeight = this.absolute ? this.height : this.height - 20;
        this.xLabel.attr("x", this.width / 2).attr("y", xLabelHeight);

        // draw the y axis
        self.yAxis = d3.svg.axis().scale(this.y).ticks(yTicks).orient("left").tickFormat(d3.format("s"));

        this.yAxisSVG = this.svgWrapper.append("g")
            .attr("transform", "translate(0,0)")
            .attr("class", "axis")
            .call(this.yAxis);
        let yLabelText = self.absolute ? "absolute " : "";
        yLabelText += "error (" + this.model.MSnTolerance.unit + ")";
        this.yLabel = this.svgWrapper.append("g").append("text")
            .attr("class", "axis")
            .text(yLabelText)
            .style("text-anchor", "middle").style("pointer-events", "none");
        this.yLabel.attr("transform", "translate(" + -50 + " " + this.height / 2 + ") rotate(-90)");

        this.g = this.svgWrapper.append("g");

        this.highlights = this.g.selectAll("scatter-dot-highlights")
            .data(this.data)
            .enter().append("circle")
            .attr("cx", function (d) {
                return self.x(d["x"]);
            })
            .attr("cy", function (d) {
                return self.y(d["y"]);
            })
            .style("fill", this.model.get("highlightColor"))
            .style("opacity", 0)
            .style("pointer-events", "none")
            .attr("id", function (d) {
                return d.fragId;
            })
            .attr("r", 8);

        this.datapoints = this.g.selectAll("scatter-dots")
            .data(this.data)
            .enter().append("circle")
            .attr("cx", function (d) {
                return self.x(d["x"]);
            })
            .attr("cy", function (d) {
                return self.y(d["y"]);
            })
            .attr("id", function (d) {
                return d.fragId;
            })
            .style("cursor", "pointer")
            .style("fill-opacity", 0)
            .style("stroke-width", 1)
            .style("fill", function (d) {
                return getColor(d);
            })
            .style("stroke", function (d) {
                return getColor(d);
            })
            .on("mouseover", function (d) {
                self.model.addHighlight([self.model.fragments[d.fragId]]);
                self.showTooltip(d3.event.pageX, d3.event.pageY, d);
            })
            .on("mouseout", function (d) {
                self.model.clearHighlight([self.model.fragments[d.fragId]]);
                self.hideTooltip();
            })
            .on("click", function (d) {
                self.stickyHighlight(d.fragId, d3.event.ctrlKey);
            })
            .attr("r", 3);

        function getColor(d) {
            if (d.lossy) {
                if (d["peptideId"] == 0) return self.model.p1color_loss;
                else return self.model.p2color_loss;
            } else {
                if (d["peptideId"] == 0) return self.model.p1color;
                else return self.model.p2color;
            }
        }

        this.updateHighlights();

    },

    showTooltip: function (x, y, data) {

        let fragId = data.fragId;
        let fragments = this.model.fragments.filter(function (d) {
            return parseInt(d.id) === fragId;
        });
        let fragment = fragments[0];

        let header = [[fragment.name]];
        let contents = [
            ["charge", data.charge],
            ["error", data.error.toFixed(this.model.get("showDecimals")) + " " + data.errorUnit],
            [this.options.xData, data.x.toFixed(this.model.get("showDecimals"))]
        ];


        //Tooltip
        if (this.tooltipIsBBModel) {
            this.tooltip.set("contents", contents)
                .set("header", header.join(" "))
                .set("location", {pageX: x, pageY: y});
        } else {
            let html = header.join(" ");

            let charge = data.charge;
            // clusterInfo.matchedCharge;
            let chargeStr = (charge > 1) ? charge : "";
            html += "<span style=\"vertical-align:super;font-size: 0.8em;\">" + chargeStr + "+</span>";

            for (let i = contents.length - 1; i >= 0; i--) {
                html += "</br>";
                html += contents[i].join(": ");
            }
            this.tooltip.html(html);
            this.tooltip.transition()
                .duration(200)
                .style("opacity", .9);

            //if cursor is too close to left window edge change tooltip to other side
            if (window.innerWidth - x < 100) {
                x = x - 100;
                y = y + 20;
            }
            this.tooltip.style("left", (x + 15) + "px")
                .style("top", y + "px");
        }
    },

    hideTooltip: function () {
        if (this.tooltipIsBBModel)
            this.tooltip.set("contents", null);
        else {
            this.tooltip.style("opacity", 0);
            this.tooltip.html("");
        }
    },

    stickyHighlight: function (fragId, ctrlKey) {
        let fragments = this.model.fragments.filter(function (d) {
            return parseInt(d.id) === fragId;
        });

        this.model.updateStickyHighlight(fragments, ctrlKey);

    },

    startHighlight: function (fragId) {
        let highlights = this.highlights[0].filter(function (d) {
            return parseInt(d.id) === fragId;
        });
        let points = this.datapoints[0].filter(function (d) {
            return parseInt(d.id) === fragId;
        });
        highlights.forEach(function (circle) {
            circle.style.opacity = "1";
        });

        points.forEach(function (point) {
            point.style.fillOpacity = "1";
        });
    },

    clearHighlights: function () {
        this.highlights[0].forEach(function (circle) {
            circle.style.opacity = "0";
        });

        this.datapoints[0].forEach(function (point) {
            point.style.fillOpacity = "0";
        });
    },

    updateHighlights: function () {
        if (!this.isVisible || !this.wrapperVisible)
            return;
        this.clearHighlights();
        for (let i = this.model.highlights.length - 1; i >= 0; i--) {
            this.startHighlight(this.model.highlights[i].id);
        }
    },

    toggleAbsErr: function () {
        this.absolute = this.model.get("QCabsErr");
        this.render();
    },
});

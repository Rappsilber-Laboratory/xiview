/**
 * @fileoverview 2D matrix view displaying crosslinks between protein pairs as a grid.
 * Renders distance heatmap background using canvas and crosslinks as SVG circles.
 * Supports pan/zoom, selection brushing, protein pair selection, tooltips, and distance coloring.
 * Matrix axes represent residue indices of two proteins, with crosslinks shown at intersection points.
 */

import "../../css/matrix.css";
import $ from "jquery";
import * as _ from "underscore";

import {BaseFrameView} from "../ui-utils/base-frame-view";
import {
    crosslinkCountPerProteinPairing,
    findResiduesInSquare,
    getDistanceSquared,
    radixSort
} from "../modelUtils";
import {getChainNameFromChainIndex, make3DAlignID} from "./ngl/NGLUtils";
import {commonLabels, declutterAxis, makeBackboneButtons} from "../utils";
import d3 from "d3";
import {makeTooltipContents, makeTooltipTitle} from "../ui-utils/make-tooltip";
import vent from "../vent";

/**
 * Backbone view for 2D crosslink distance matrix visualization.
 * Displays crosslinks between two proteins as points in a 2D grid (residue index vs residue index).
 * Background shows distance heatmap rendered to canvas, crosslinks rendered as SVG circles.
 * Supports protein pair selection, pan/zoom, selection brushing, distance coloring, and tooltips.
 * @class
 * @extends BaseFrameView
 * @property {Object} x - D3 linear scale for x-axis (protein 1 residues)
 * @property {Object} y - D3 linear scale for y-axis (protein 2 residues)
 * @property {Object} zoomStatus - D3 zoom behavior for pan/zoom functionality
 * @property {Object} brush - D3 brush behavior for rectangular selection
 * @property {Object} canvas - Canvas element for rendering distance heatmap background
 * @property {Object} svg - SVG element for rendering crosslinks and axes
 * @property {Object} colourScaleModel - Color scale backbone-models for distance coloring
 */
export class DistanceMatrixViewBB extends BaseFrameView {
    constructor(options) {
        super(options);
    }

    /**
     * Returns event handlers for this view.
     * Extends parent events with matrix-specific handlers for mouse interaction and drag mode.
     * @returns {Object} Event handlers map
     */
    get events() {
        let parentEvents = BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "mousemove .mouseMat": "brushNeighbourhood",
            "mousemove .clipg": "brushNeighbourhood",
            "mouseleave .viewport": "cancelHighlights",
            "mouseleave .clipg": "cancelHighlights",
            "input .dragPanRB": "setMatrixDragMode",
        });
    }

    /**
     * Returns default options for matrix view.
     * @returns {Object} Default options including labels, colors, margins, and interaction settings
     */
    get defaultOptions() {
        return {
            xlabel: "Residue Index 1",
            ylabel: "Residue Index 2",
            chartTitle: "Crosslink Matrix",
            chainBackground: "white",
            matrixObj: null,
            selectedColour: "#ff0",
            highlightedColour: "#f80",
            linkWidth: 5,
            tooltipRange: 7,
            matrixDragMode: "Pan",
            margin: {
                top: 30,
                right: 20,
                bottom: 40,
                left: 60
            },
            exportKey: true,
            exportTitle: true,
            canHideToolbarArea: true,
            canTakeImage: true,
        };
    }

    /**
     * Initializes the matrix view.
     * Sets up SVG/canvas elements, scales, zoom/pan behaviors, brush selection, axes,
     * control buttons, event listeners, and initial protein pairing.
     * @param {Object} viewOptions - View initialization options including colourScaleModel
     */
    initialize(viewOptions) {
        super.initialize(...arguments);

        const self = this;

        const marginLimits = {
            top: this.options.chartTitle ? 30 : undefined,
            bottom: this.options.xlabel ? 40 : undefined,
            left: this.options.ylabel ? 60 : undefined
        };
        $.extend(this.options.margin, marginLimits);

        this.colourScaleModel = viewOptions.colourScaleModel;

        // targetDiv could be div itself or id of div - lets deal with that
        // Backbone handles the above problem now - element is now found in this.el
        //avoids prob with 'save - web page complete'
        const mainDivSel = d3.select(this.el).classed("matrixView", true);

        const flexWrapperPanel = mainDivSel.append("div")
            .attr("class", "verticalFlexContainer");

        this.controlDiv = flexWrapperPanel.append("div").attr("class", "toolbar toolbarArea");

        this.controlDiv.append("button")
            .attr("class", "downloadButton btn btn-1 btn-1a")
            .text(commonLabels.downloadImg + "SVG");

        const buttonHolder = this.controlDiv.append("span").attr("class", "noBreak reducePadding");
        // Radio Button group to decide pan or select
        const toggleButtonData = [{
            class: "dragPanRB",
            label: "Drag to Pan",
            id: "dragPan",
            tooltip: "Left-click and drag pans the matrix. Mouse-wheel zooms.",
            group: "matrixDragMode",
            value: "Pan"
        },
        {
            class: "dragPanRB",
            label: "Or Select",
            id: "dragSelect",
            tooltip: "Left-click and drag selects an area in the matrix",
            group: "matrixDragMode",
            value: "Select"
        },
        ];
        toggleButtonData
            .forEach(function (d) {
                $.extend(d, {
                    type: "radio",
                    inputFirst: false,
                    value: d.value || d.label
                });
                if (d.initialState === undefined && d.group && d.value) { // set initial values for radio button groups
                    d.initialState = (d.value === this.options[d.group]);
                }
            }, this);
        makeBackboneButtons(buttonHolder, self.el.id, toggleButtonData);


        const setSelectTitleString = function () {
            const selElem = d3.select(d3.event.target);
            selElem.attr("title", selElem.selectAll("option")
                .filter(function () {
                    return d3.select(this).property("selected");
                })
                .text()
            );
        };

        this.controlDiv.append("label")
            .attr("class", "btn selectHolder")
            .append("span")
            //.attr("class", "noBreak")
            .text("Show Protein Pairing ►")
            .append("select")
            .attr("id", mainDivSel.attr("id") + "chainSelect")
            .on("change", function () {
                // const value = this.value;
                const selectedDatum = d3.select(this).selectAll("option")
                    .filter(function () {
                        return d3.select(this).property("selected");
                    })
                    .datum();
                self.setAndShowPairing(selectedDatum.value);
                const selElem = d3.select(d3.event.target);
                setSelectTitleString(selElem);
            });
        const chartDiv = flexWrapperPanel.append("div")
            .attr("class", "panelInner")
            .attr("flex-grow", 1)
            .style("position", "relative");

        const viewDiv = chartDiv.append("div")
            .attr("class", "viewDiv");


        // Scales
        this.x = d3.scale.linear();
        this.y = d3.scale.linear();

        this.zoomStatus = d3.behavior.zoom()
            .scaleExtent([1, 8])
            .on("zoom", function () {
                self.zoomHandler(self);
            });

        // Canvas viewport and element
        const canvasViewport = viewDiv.append("div")
            .attr("class", "viewport")
            .style("top", this.options.margin.top + "px")
            .style("left", this.options.margin.left + "px")
            .call(self.zoomStatus);

        this.canvas = canvasViewport
            .append("canvas")
            .attr("class", "toSvgImage")
            .style("background", this.options.background) // override standard background colour with option
            .style("display", "none");
        canvasViewport.append("div")
            .attr("class", "mouseMat");


        // SVG element
        this.svg = viewDiv.append("svg");

        // Defs
        this.svg.append("defs")
            .append("clipPath")
            .attr("id", "matrixClip")
            .append("rect")
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", 0)
            .attr("height", 0);

        this.vis = this.svg.append("g")
            .attr("transform", "translate(" + this.options.margin.left + "," + this.options.margin.top + ")");

        this.brush = d3.svg.brush()
            .x(self.x)
            .y(self.y)
            //.clamp ([false, false])
            .on("brush", function () {
            })
            .on("brushend", function () {
                self.selectNeighbourhood(self.brush.extent());
            });


        // Add clippable and pan/zoomable viewport made of two group elements
        this.clipGroup = this.vis.append("g")
            .attr("class", "clipg")
            .attr("clip-path", "url(#matrixClip)");
        this.clipGroup.append("rect").attr("width", "100%").attr("height", "100%").style("fill", "#e4e4e4");
        this.zoomGroup = this.clipGroup.append("g");
        this.zoomGroup.append("g").attr("class", "blockAreas");
        this.zoomGroup.append("g").attr("class", "backgroundImage").append("image");
        this.zoomGroup.append("g").attr("class", "crosslinkPlot");
        this.zoomGroup.append("g")
            .attr("class", "brush")
            .call(self.brush);

        // Axes setup
        this.xAxis = d3.svg.axis().scale(this.x).orient("bottom");
        this.yAxis = d3.svg.axis().scale(this.y).orient("left");

        this.vis.append("g").attr("class", "y axis");
        this.vis.append("g").attr("class", "x axis");


        // Add labels
        const labelInfo = [{
            class: "axis",
            text: this.options.xlabel,
            dy: "0em"
        },
        {
            class: "axis",
            text: this.options.ylabel,
            dy: "1em"
        },
        {
            class: "matrixHeader",
            text: this.options.chartTitle,
            dy: "-0.5em"
        },
        ];

        this.vis.selectAll("g.label")
            .data(labelInfo)
            .enter()
            .append("g")
            .attr("class", "label")
            .append("text")
            .attr("class", function (d) {
                return d.class;
            })
            .text(function (d) {
                return d.text;
            })
            .attr("dy", function (d) {
                return d.dy;
            });

        // rerender crosslinks if selection/highlight changed, filteringDone or colourmodel changed
        this.listenTo(this.model, "change:selection filteringDone", this.renderCrossLinks);
        // eslint-disable-next-line no-unused-vars
        this.listenTo(this.model, "currentColourModelChanged", function (colourModel, domain) {
            if (colourModel.get("id") !== this.colourScaleModel.get("id")) {    // todo - test if backbone-models is distances, if so rendering is already guaranteed
                this.renderCrossLinks();
            }
        });
        this.listenTo(this.model, "change:highlights", function () {
            this.renderCrossLinks({rehighlightOnly: true});
        });
        this.listenTo(this.model, "change:linkColourAssignment", this.render);
        this.listenTo(this.model, "change:selectedProteins", this.makeProteinPairingOptions);
        this.listenTo(this.colourScaleModel, "colourModelChanged", function () {
            this.render({noResize: true});
        }); // colourScaleModel is pointer to distance colour backbone-models, so this triggers even if not current colour backbone-models (redraws background)
        this.listenTo(this.model, "change:distancesObj", this.distancesChanged); // Entire new set of distances
        // this.listenTo(this.backbone-models.get("clmsModel"), "change:matches", this.matchesChanged); // New matches added (via csv generally) - clmsModel no longer extends Backbone
        this.listenTo(vent, "proteinMetadataUpdated", function () {
            this.makeProteinPairingOptions();
            this.updateAxisLabels();
        });
        this.listenTo(vent, "PDBPermittedChainSetsUpdated changeAllowInterModelDistances", this.distancesChanged); // New PDB or existing residues/pdb but distances changed

        const entries = this.makeProteinPairingOptions();
        const startPairing = _.isEmpty(entries) ? undefined : entries[0].value;
        this.setAndShowPairing(startPairing);

        this.setMatrixDragMode({
            target: {
                value: this.options.matrixDragMode
            }
        });
    }

    /**
     * Relayouts the view by triggering a resize.
     * @returns {DistanceMatrixViewBB} This view instance for chaining
     */
    relayout() {
        this.resize();
        return this;
    }

    /**
     * Sets the protein pairing and renders the matrix.
     * Convenience method that chains matrixChosen, zoom reset, and render.
     * @param {Object} pairing - Protein pairing object with fromProtein and toProtein
     */
    setAndShowPairing(pairing) {
        this
            .matrixChosen(pairing)
            .resetZoomHandler(this)
            .render();
    }

    /**
     * Builds dropdown options for protein pairings based on available crosslinks.
     * Filters to selected proteins if any selected, sorts by crosslink count.
     * Updates the protein pairing dropdown with options showing [count] proteinA-proteinB.
     * @returns {Array} Array of protein pairing entries
     */
    makeProteinPairingOptions() {
        const crosslinks = this.model.getAllTTCrossLinks();
        const totals = crosslinkCountPerProteinPairing(crosslinks);
        const entries = d3.entries(totals);

        let nonEmptyEntries = entries.filter(function (entry) {
            return entry.value.crosslinks.length;
        });

        // If there are selected proteins, reduce the choice to pairs within this set
        const selectedProteins = this.model.get("selectedProteins");
        if (selectedProteins.length) {
            const selectedProteinSet = d3.set(_.pluck(selectedProteins, "id"));
            nonEmptyEntries = nonEmptyEntries.filter(function (entry) {
                const value = entry.value;
                return selectedProteinSet.has(value.fromProtein.id) && selectedProteinSet.has(value.toProtein.id);
            });
        }

        nonEmptyEntries.sort(function (a, b) {
            return b.value.crosslinks.length - a.value.crosslinks.length;
        });

        const mainDivSel = d3.select(this.el);
        const matrixOptions = mainDivSel.select("#" + mainDivSel.attr("id") + "chainSelect")
            .selectAll("option")
            .data(nonEmptyEntries, function (d) {
                return d.key;
            });
        matrixOptions.exit().remove();
        matrixOptions
            .enter()
            .append("option");
        matrixOptions
            .order()
            .property("value", function (d) {
                return d.key;
            })
            .text(function (d) {
                return "[" + d.value.crosslinks.length + "] " + d.value.label;
            });
        return nonEmptyEntries.length ? nonEmptyEntries : entries;
    }

    /**
     * Gets the currently selected protein pairing from the dropdown.
     * @param {Object} pairing - Fallback pairing if none selected and onlyIfNoneSelected is true
     * @param {boolean} onlyIfNoneSelected - If true, returns pairing parameter when nothing selected
     * @returns {Object} Currently selected protein pairing object
     */
    getCurrentPairing(pairing, onlyIfNoneSelected) {
        const mainDivSel = d3.select(this.el);
        const selected = mainDivSel.select("#" + mainDivSel.attr("id") + "chainSelect")
            .selectAll("option")
            .filter(function () {
                return d3.select(this).property("selected");
            });
        return (selected.size() === 0 && onlyIfNoneSelected) ? pairing : selected.datum().value;
    }

    /**
     * Handler called when matches have changed (e.g., new CSV data loaded).
     * Rebuilds protein pairing options and re-renders matrix.
     * @returns {DistanceMatrixViewBB} This view instance for chaining
     */
    matchesChanged() {
        const entries = this.makeProteinPairingOptions();
        const pairing = this.getCurrentPairing(entries[0], true);
        this.matrixChosen(pairing);
        this.render();
        return this;
    }

    // Either new PDB File in town, or change to existing distances
    distancesChanged() {
        this.render();
        return this;
    }

    /**
     * Updates axis labels with current protein names.
     * Fetches protein IDs and updates label text elements.
     */
    updateAxisLabels() {
        const protIDs = this.getCurrentProteinIDs();
        this.vis.selectAll("g.label text").data(protIDs)
            .text(function (d) {
                return d.labelText;
            });
    }

    /**
     * Sets the current protein pair for the matrix and updates scales/axes.
     * Updates x/y scale domains based on protein sequence lengths and sets axis tick formats.
     * @param {Object} proteinPairValue - Protein pair value object with fromProtein and toProtein
     * @returns {DistanceMatrixViewBB} This view instance for chaining
     */
    matrixChosen(proteinPairValue) {
        if (proteinPairValue) {
            this.options.matrixObj = proteinPairValue;

            const seqLengths = this.getSeqLengthData();
            this.x.domain([1, seqLengths.lengthA + 1]);
            this.y.domain([seqLengths.lengthB + 1, 1]);

            // Update x/y labels and axes tick formats
            this.xAxis.tickFormat(this.alignedIndexAxisFormat);
            this.yAxis.tickFormat(this.alignedIndexAxisFormat);

            this.updateAxisLabels();
        }

        return this;
    }

    // chain may show if checked in dropdown and if allowed by chainset in distancesobj (i.e. not cutoff by assembly choice)
    chainMayShow(dropdownIndex, chainIndex) {
        const distanceObj = this.model.get("distancesObj");
        const allowedChains = distanceObj ? distanceObj.permittedChainIndicesSet : null;
        return allowedChains ? allowedChains.has(chainIndex) : true;
    }

    /**
     * Formats search index values for axis tick labels.
     * @param {number} searchIndex - 1-indexed residue position in search sequence
     * @returns {string} Formatted tick label
     */
    alignedIndexAxisFormat(searchIndex) {
        return d3.format(",.0f")(searchIndex);
    }

    /**
     * Gets protein IDs and label text for current matrix pairing.
     * @returns {Array} Array of two objects with proteinID and labelText properties
     */
    getCurrentProteinIDs() {
        const mObj = this.options.matrixObj;
        return mObj ? [{
            chainIDs: null,
            proteinID: mObj.fromProtein.id,
            labelText: mObj.fromProtein.name.replace("_", " ")
        },
        {
            chainIDs: null,
            proteinID: mObj.toProtein.id,
            labelText: mObj.toProtein.name.replace("_", " ")
        }
        ] : [null, null];
    }

    /**
     * Gets chains for a protein from the distances object.
     * @param {string} proteinID - Protein ID
     * @returns {Array} Array of chain objects for the protein
     */
    getChainsForProtein(proteinID) {
        return this.model.get("distancesObj").chainMap[proteinID];
    }

    /**
     * Adds alignment IDs to protein ID objects for 3D structure alignment.
     * @param {Array} proteinIDsObj - Array of objects with proteinID and chainID properties
     * @returns {Array} The same array with alignID properties added
     */
    addAlignIDs(proteinIDsObj) {
        const distancesObj = this.model.get("distancesObj");
        proteinIDsObj.forEach(function (pid) {
            pid.alignID = null;
            if (pid.proteinID) {
                const chainName = getChainNameFromChainIndex(distancesObj.chainMap, pid.chainID);
                pid.alignID = make3DAlignID(distancesObj.structureName, chainName, pid.chainID);
            }
        }, this);
        return proteinIDsObj;
    }

    /**
     * Calculates overall scale factor including both base scale and zoom scale.
     * @param {Object} [sizeData] - Optional size data (fetched if not provided)
     * @returns {number} Combined scale factor for rendering
     */
    getOverallScale(sizeData) {
        const sd = sizeData || this.getSizeData();
        const baseScale = Math.min(sd.width / sd.lengthA, sd.height / sd.lengthB);
        return baseScale * this.zoomStatus.scale();
    }

    // Tooltip functions
    convertEvtToXY(evt) {
        const sd = this.getSizeData();

        // *****!$$$ finally, cross-browser
        const elem = d3.select(this.el).select(".viewport");
        let px = evt.pageX - $(elem.node()).offset().left;
        let py = evt.pageY - $(elem.node()).offset().top;
        //console.log ("p", evt, px, py, evt.target, evt.originalEvent.offsetX);

        const t = this.zoomStatus.translate();
        const scale = this.getOverallScale(sd);
        //console.log ("XXXY", this.zoomStatus.scale(), baseScale, scale, t);

        px -= t[0]; // translate
        py -= t[1];
        //console.log ("p2", px, py);

        px /= scale; // scale
        py /= scale;
        //console.log ("p3", px, py);

        px++; // +1 cos crosslinks are 1-indexed
        py = (sd.lengthB - 1) - py; // flip because y is bigger at top
        //console.log ("p4", px, py);

        return [Math.round(px), Math.round(py)];
    }

    /**
     * Finds crosslinks within a rectangular extent on the matrix.
     * @param {Array} extent - 2D extent [[x0, y0], [x1, y1]] defining rectangle bounds
     * @returns {Array} Array of link wrapper objects with crosslink references
     */
    grabNeighbourhoodLinks(extent) {
        const filteredCrossLinks = this.model.getFilteredCrossLinks();
        const filteredCrossLinkMap = d3.map(filteredCrossLinks, function (d) {
            return d.id;
        });
        const proteinIDs = this.getCurrentProteinIDs();
        const convFunc = function (x, y) { // x and y are 0-indexed
            return {
                convX: x,
                convY: y,
                proteinX: proteinIDs[0] ? proteinIDs[0].proteinID : undefined,
                proteinY: proteinIDs[1] ? proteinIDs[1].proteinID : undefined,
            };
        };
        const neighbourhoodLinks = findResiduesInSquare(convFunc, filteredCrossLinkMap, extent[0][0], extent[0][1], extent[1][0], extent[1][1], true);
        return neighbourhoodLinks;
    }

    /**
     * Selects crosslinks within a brushed extent.
     * Called on brush end. Adds to selection if Ctrl/Shift held.
     * @param {Array} extent - 2D extent [[x0, y0], [x1, y1]] from brush
     */
    selectNeighbourhood(extent) {
        const add = d3.event.ctrlKey || d3.event.shiftKey; // should this be added to current selection?
        const linkWrappers = this.grabNeighbourhoodLinks(extent);
        const crosslinks = _.pluck(linkWrappers, "crosslink");
        this.model.setMarkedCrossLinks("selection", crosslinks, false, add);
    }


    // Brush neighbourhood and invoke tooltip
    brushNeighbourhood(evt) {
        const xy = this.convertEvtToXY(evt);
        const halfRange = this.options.tooltipRange / 2;
        const highlightExtent = d3.transpose(xy.map(function (xory) {
            return [xory - halfRange, xory + halfRange];
        })); // turn xy into extent equivalent
        const linkWrappers = this.grabNeighbourhoodLinks(highlightExtent);
        const crosslinks = _.pluck(linkWrappers, "crosslink");

        // invoke tooltip before setting highlights backbone-models change for quicker tooltip response
        this.invokeTooltip(evt, linkWrappers);
        this.model.setMarkedCrossLinks("highlights", crosslinks, true, false);
    }

    /**
     * Clears all highlighted crosslinks.
     * Called on mouse leave from viewport.
     */
    cancelHighlights() {
        this.model.setMarkedCrossLinks("highlights", [], true, false);
    }

    /**
     * Sets matrix drag mode (Pan or Select).
     * Pan mode enables zoom/pan, Select mode enables rectangular brush selection.
     * @param {Event} evt - Input event with target.value of "Pan" or "Select"
     * @returns {DistanceMatrixViewBB} This view instance for chaining
     */
    setMatrixDragMode(evt) {
        this.options.matrixDragMode = evt.target.value;
        const top = d3.select(this.el);
        if (this.options.matrixDragMode === "Pan") {
            top.select(".viewport").call(this.zoomStatus);
            top.selectAll(".clipg .brush rect").style("pointer-events", "none");
        } else {
            top.select(".viewport").on(".zoom", null);
            top.selectAll(".clipg .brush rect").style("pointer-events", null);
        }
        return this;
    }

    /**
     * Displays tooltip showing crosslinks at cursor position.
     * @param {Event} evt - Mouse event for tooltip positioning
     * @param {Array} linkWrappers - Array of link wrapper objects to display
     */
    invokeTooltip(evt, linkWrappers) {
        if (this.options.matrixObj) {
            const crosslinks = _.pluck(linkWrappers, "crosslink");
            crosslinks.sort(function (a, b) {
                return a.getMeta("distance") - b.getMeta("distance");
            });
            const linkDistances = crosslinks.map(function (crosslink) {
                return crosslink.getMeta("distance");
            });

            this.model.get("tooltipModel")
                .set("header", makeTooltipTitle.linkList(crosslinks.length))
                .set("contents", makeTooltipContents.linkList(crosslinks, {"Distance": linkDistances}))
                .set("location", evt);
            //this.trigger("change:location", this.backbone-models, evt); // necessary to change position 'cos d3 event is a global property, it won't register as a change
        }
    }
    // end of tooltip functions

    /**
     * Handles zoom behavior with bounded panning.
     * Constrains pan translation to prevent showing empty space beyond matrix bounds.
     * @param {DistanceMatrixViewBB} self - Reference to this view instance
     */
    zoomHandler(self) {
        const sizeData = this.getSizeData();
        const width = sizeData.width;
        const height = sizeData.height;
        // bounded zoom behavior adapted from https://gist.github.com/shawnbot/6518285
        // (d3 events translate and scale values are just copied from zoomStatus)

        const widthRatio = width / sizeData.lengthA;
        const heightRatio = height / sizeData.lengthB;
        const minRatio = Math.min(widthRatio, heightRatio);

        const fx = sizeData.lengthA * minRatio;
        const fy = sizeData.lengthB * minRatio;

        const tx = Math.min(0, Math.max(d3.event.translate[0], fx - (fx * d3.event.scale)));
        const ty = Math.min(0, Math.max(d3.event.translate[1], fy - (fy * d3.event.scale)));
        //console.log ("tx", tx, ty, fx, fy, width, height);
        self.zoomStatus.translate([tx, ty]);
        self.panZoom();
    }

    /**
     * Resets zoom and pan to default (no zoom, no pan).
     * @param {DistanceMatrixViewBB} self - Reference to this view instance
     * @returns {DistanceMatrixViewBB} This view instance for chaining
     */
    resetZoomHandler(self) {
        self.zoomStatus.scale(1.0).translate([0, 0]);
        return this;
    }

    // That's how you define the value of a pixel //
    // http://stackoverflow.com/questions/7812514/drawing-a-dot-on-html5-canvas
    // moved from out of render() as firefox in strict mode objected
    drawPixel(cd, pixi, r, g, b, a) {
        const index = pixi * 4;
        cd[index] = r;
        cd[index + 1] = g;
        cd[index + 2] = b;
        cd[index + 3] = a;
    }

    /**
     * Main render method for the matrix view.
     * Renders background distance heatmap and crosslink circles.
     * Only renders if matrix object set and view is visible.
     * @param {Object} [renderOptions] - Render options
     * @param {boolean} [renderOptions.noResize] - If true, skips resize step
     * @returns {DistanceMatrixViewBB} This view instance for chaining
     */
    render(renderOptions) {
        renderOptions = renderOptions || {};
        if (this.options.matrixObj && this.isVisible()) {
            if (!renderOptions.noResize) {
                this.resize();
            }
            this
                .renderBackgroundMap()
                .renderCrossLinks({
                    isVisible: true
                });
        }
        return this;
    }

    // draw white blocks in background to demarcate areas covered by active pdb chains
    renderChainBlocks(alignInfo) {

        const seqLengths = this.getSeqLengthData();
        const seqLengthB = seqLengths.lengthB - 1;

        // Find continuous blocks for each chain when mapped to search sequence (as chain sequence may have gaps in) (called in next bit of code)
        const blockMap = {};
        d3.merge(alignInfo).forEach(function (alignDatum) {
            blockMap[alignDatum.alignID] = this.model.get("alignColl").get(alignDatum.proteinID).blockify(alignDatum.alignID);
        }, this);
        //console.log ("blockMap", blockMap);

        // Draw backgrounds for each pairing of chains
        const blockAreas = this.zoomGroup.select(".blockAreas");
        const blockSel = blockAreas.selectAll(".chainArea");
        blockSel.remove();

        //console.log ("BLOX", blockMap);

        const allowInterModel = this.model.get("stageModel").get("allowInterModelDistances");

        alignInfo[0].forEach(function (alignInfo1) {
            const blocks1 = blockMap[alignInfo1.alignID];

            alignInfo[1].forEach(function (alignInfo2) {
                if ((alignInfo1.modelID === alignInfo2.modelID) || allowInterModel) {
                    const blocks2 = blockMap[alignInfo2.alignID];

                    blocks1.forEach(function (brange1) {
                        blocks2.forEach(function (brange2) {
                            blockAreas.append("rect")
                                .attr("x", brange1.begin - 1)
                                .attr("y", seqLengthB - (brange2.end - 1))
                                .attr("width", brange1.end - brange1.begin + 1)
                                .attr("height", brange2.end - brange2.begin + 1)
                                .attr("class", "chainArea")
                                .style("fill", this.options.chainBackground);
                        }, this);
                    }, this);
                }
            }, this);

        }, this);
    }

    /**
     * Renders distance heatmap background to canvas.
     * Calculates distance matrices for all chain pairings, renders to canvas as colored heatmap,
     * then converts to PNG image for display. For very large proteins (>5M residue pairs),
     * skips background rendering to avoid memory issues. Uses color scale from colourScaleModel.
     * @returns {DistanceMatrixViewBB} This view instance for chaining
     */
    renderBackgroundMap() {
        let z = performance.now();
        const distancesObj = this.model.get("distancesObj");
        const stageModel = this.model.get("stageModel");

        // only render background if distances available
        if (distancesObj) {

            // Get alignment info for chains in the two proteins, filtering to chains that are marked as showable
            const proteinIDs = this.getCurrentProteinIDs();
            const alignInfo = proteinIDs.map(function (proteinID, i) {
                const pid = proteinID.proteinID;
                const chains = distancesObj.chainMap[pid];
                if (chains) {
                    const chainIDs = chains
                        .filter(function (chain) {
                            return this.chainMayShow(i, chain.index);
                        }, this)
                        .map(function (chain) {
                            return {
                                proteinID: pid,
                                chainID: chain.index,
                                modelID: chain.modelIndex,
                            };
                        });
                    return this.addAlignIDs(chainIDs);
                }
                return [];
            }, this);
            //console.log ("ALLL", alignInfo);

            // draw the areas covered by pdb chain data
            this.renderChainBlocks(alignInfo);

            const seqLengths = this.getSeqLengthData();
            // Don't draw backgrounds for huge protein combinations (5,000,000 =~ 2250 x 2250 is limit), begins to be memory issue
            if (seqLengths.lengthA * seqLengths.lengthB > 5e6) {
                // shrink canvas / hide image if not showing it
                this.canvas
                    .attr("width", 1)
                    .attr("height", 1);
                this.zoomGroup.select(".backgroundImage").select("image").style("display", "none");
            } else {
                this.canvas
                    .attr("width", seqLengths.lengthA)
                    .attr("height", seqLengths.lengthB);
                const canvasNode = this.canvas.node();
                const ctx = canvasNode.getContext("2d");
                //ctx.fillStyle = "rgba(255, 0, 0, 0)";
                ctx.clearRect(0, 0, canvasNode.width, canvasNode.height);

                const rangeDomain = this.colourScaleModel.get("colScale").domain();
                const min = rangeDomain[0];
                const max = rangeDomain[1];
                const rangeColours = this.colourScaleModel.get("colScale").range();
                const cols = rangeColours; //.slice (1,3);
                // have slightly different saturation/luminance for each colour so shows up in black & white
                // eslint-disable-next-line no-unused-vars
                const colourArray = cols.map(function (col, i) {
                    col = d3.hsl(col);
                    col.s = 0.4; // - (0.1 * i);
                    col.l = 0.85; // - (0.1 * i);
                    const col2 = col.rgb();
                    return (255 << 24) + (col2.b << 16) + (col2.g << 8) + col2.r;   // 32-bit value of colour
                });

                const seqLengthB = seqLengths.lengthB - 1;

                // let times = window.times || [];
                // const start = performance.now();

                // function to draw one matrix according to a pairing of two chains (called in loop later)
                const drawDistanceMatrix = function (imgDataArr, minArray, matrixValue, alignInfo1, alignInfo2) {
                    const alignColl = this.model.get("alignColl");
                    const distanceMatrix = matrixValue.distanceMatrix;
                    const pw = this.canvas.attr("width");

                    const atoms1 = stageModel.getAllResidueCoordsForChain(matrixValue.chain1);
                    const atoms2 = (matrixValue.chain1 !== matrixValue.chain2) ? stageModel.getAllResidueCoordsForChain(matrixValue.chain2) : atoms1;
                    // precalc some stuff that would get recalculatd a lot in the inner loop
                    // Combine into single pass to avoid creating intermediate arrays
                    const atoms2Length = atoms2.length;
                    const preCalcSearchIndices = new Int32Array(atoms2Length);
                    const preCalcRowIndices = new Int32Array(atoms2Length);
                    for (let seqIndex = 0; seqIndex < atoms2Length; seqIndex++) {
                        const alignedIdx = alignColl.getAlignedIndex(seqIndex + 1, alignInfo2.proteinID, true, alignInfo2.alignID, true) - 1;
                        preCalcSearchIndices[seqIndex] = alignedIdx;
                        preCalcRowIndices[seqIndex] = alignedIdx >= 0 ? (seqLengthB - alignedIdx) * pw : -1;
                    }
                    //console.log ("pcsi", preCalcSearchIndices);
                    //console.log ("atoms", atoms1, atoms2);

                    // draw chain values, aligned to search sequence
                    const max2 = max * max;
                    const min2 = min * min;

                    //var p = performance.now();
                    const len = atoms2.length;
                    for (let i = 0; i < atoms1.length; i++) {
                        const searchIndex1 = alignColl.getAlignedIndex(i + 1, alignInfo1.proteinID, true, alignInfo1.alignID, true) - 1;
                        if (searchIndex1 >= 0) {
                            const row = distanceMatrix[i];
                            for (let j = 0; j < len; j++) { // was seqLength
                                const distance2 = row && row[j] ? row[j] * row[j] : getDistanceSquared(atoms1[i], atoms2[j]);
                                if (distance2 < max2) {
                                    const searchIndex2 = preCalcRowIndices[j];
                                    if (searchIndex2 >= 0) {
                                        const aindex = searchIndex1 + searchIndex2;   //((seqLengthB - searchIndex2) * pw);
                                        const val = minArray ? minArray[aindex] : 0;
                                        const r = distance2 > min2 ? 1 : 2;
                                        if (r > val) {
                                            imgDataArr[aindex] = colourArray[2 - r];    // 32-bit array view can take colour directly
                                            if (minArray) {
                                                minArray[aindex] = r;//val;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    //p = performance.now() - p;
                    //console.log (atoms1.length * atoms2.length, "coordinates drawn to canvas in ", p, " ms.");
                };

                // const middle = performance.now();

                const canvasData = ctx.getImageData(0, 0, this.canvas.attr("width"), this.canvas.attr("height"));
                const cd = new Uint32Array(canvasData.data.buffer); // canvasData.data         // 32-bit view of buffer
                let minArray = (alignInfo[0].length * alignInfo[1].length) > 1 ? new Uint8Array(this.canvas.attr("width") * this.canvas.attr("height")) : undefined;

                // draw actual content of chain pairings
                alignInfo[0].forEach(function (alignInfo1) {
                    const chainIndex1 = alignInfo1.chainID;
                    alignInfo[1].forEach(function (alignInfo2) {
                        const chainIndex2 = alignInfo2.chainID;
                        const distanceMatrixValue = distancesObj.matrices[chainIndex1 + "-" + chainIndex2];
                        drawDistanceMatrix.call(this, cd, minArray, distanceMatrixValue, alignInfo1, alignInfo2);
                    }, this);
                }, this);

                ctx.putImageData(canvasData, 0, 0);

                // const end = performance.now();
                // window.times.push(Math.round(end - middle));
                //console.log ("window.times", window.times);

                this.zoomGroup.select(".backgroundImage").select("image")
                    .style("display", null) // default value
                    .attr("width", this.canvas.attr("width"))
                    .attr("height", this.canvas.attr("height"))
                    .attr("xlink:href", canvasNode.toDataURL("image/png"));
            }
        }
        z = performance.now() - z;
        console.log("render background map", z, "ms");

        return this;
    }

    /**
     * Renders crosslinks as SVG circles on the matrix.
     * Filters crosslinks to current protein pairing, sorts by selection/highlight status,
     * colors by current color scheme, and positions circles at residue index coordinates.
     * Supports incremental re-highlighting for performance.
     * @param {Object} [renderOptions] - Render options
     * @param {boolean} [renderOptions.isVisible] - If true, forces rendering even if visibility check would fail
     * @param {boolean} [renderOptions.rehighlightOnly] - If true, only updates highlights without full re-render
     * @returns {DistanceMatrixViewBB} This view instance for chaining
     */
    renderCrossLinks(renderOptions) {

        renderOptions = renderOptions || {};
        //console.log ("renderCrossLinks", renderOptions);

        if (renderOptions.isVisible || (this.options.matrixObj && this.isVisible())) {
            const self = this;

            if (this.options.matrixObj) {
                const highlightOnly = renderOptions.rehighlightOnly;
                const colourScheme = this.model.get("linkColourAssignment");

                const seqLengths = this.getSeqLengthData();
                const seqLengthB = seqLengths.lengthB - 1;
                const xStep = 1; //minDim / seqLengthA;
                //const yStep = 1; //minDim / seqLengthB;
                let linkWidth = this.options.linkWidth / 2;
                const overallScale = this.getOverallScale();
                if (overallScale < 1 && overallScale > 0) {
                    linkWidth /= overallScale;
                    linkWidth = Math.ceil(linkWidth);
                }
                //console.log ("os", overallScale);
                const xLinkWidth = linkWidth * xStep;
                // const yLinkWidth = linkWidth * yStep;

                const proteinIDs = this.getCurrentProteinIDs();

                const filteredCrossLinks = this.model.getFilteredCrossLinks(); //.values();
                const selectedCrossLinkIDs = d3.set(_.pluck(this.model.getMarkedCrossLinks("selection"), "id"));
                const highlightedCrossLinkIDs = d3.set(_.pluck(this.model.getMarkedCrossLinks("highlights"), "id"));

                // Filter without creating intermediate array copy
                const finalCrossLinks = [];
                for (const crosslink of filteredCrossLinks) {
                    if ((crosslink.toProtein.id === proteinIDs[0].proteinID && crosslink.fromProtein.id === proteinIDs[1].proteinID) ||
                        (crosslink.toProtein.id === proteinIDs[1].proteinID && crosslink.fromProtein.id === proteinIDs[0].proteinID)) {
                        finalCrossLinks.push(crosslink);
                    }
                }

                // sort so that selected links appear on top
                let sortedFinalCrossLinks;
                if (highlightOnly) {
                    sortedFinalCrossLinks = finalCrossLinks.filter(function (link) {
                        return highlightedCrossLinkIDs.has(link.id);
                    });
                } else {
                    sortedFinalCrossLinks = radixSort(3, finalCrossLinks, function (link) {
                        return highlightedCrossLinkIDs.has(link.id) ? 2 : (selectedCrossLinkIDs.has(link.id) ? 1 : 0);
                    });
                }


                const fromToStore = sortedFinalCrossLinks.map(function (crosslink) {
                    return [crosslink.fromResidue - 1, crosslink.toResidue - 1];
                });

                const indLinkPlot = function (d) {
                    const high = highlightedCrossLinkIDs.has(d.id);
                    const selected = high ? false : selectedCrossLinkIDs.has(d.id);
                    const ambig = d.ambiguous;
                    d3.select(this)
                        .attr("class", "crosslink" + (high ? " high" : ""))
                        .style("fill-opacity", ambig ? 0.6 : null)
                        .style("fill", high ? self.options.highlightedColour : (selected ? self.options.selectedColour : colourScheme.getColour(d)))
                        .style("stroke-dasharray", ambig ? 3 : null)
                        .style("stroke", high || selected ? "black" : (ambig ? colourScheme.getColour(d) : null));
                    //.style ("stroke-opacity", high || selected ? 0.4 : null)
                };

                // if redoing highlights only, find previously highlighted links not part of current set and restore them
                // to a non-highlighted state
                if (highlightOnly) {
                    // eslint-disable-next-line no-unused-vars
                    const oldHighLinkSel = this.zoomGroup.select(".crosslinkPlot").selectAll(".high")
                        .filter(function (d) {
                            return !highlightedCrossLinkIDs.has(d.id);
                        })
                        .each(indLinkPlot);
                }

                const linkSel = this.zoomGroup.select(".crosslinkPlot").selectAll(".crosslink")
                    .data(sortedFinalCrossLinks, function (d) {
                        return d.id;
                    })
                    // Equivalent of d3 v4 selection.raise - https://github.com/d3/d3-selection/blob/master/README.md#selection_raise
                    .each(function () {
                        this.parentNode.appendChild(this);
                    });
                //.order()

                if (!highlightOnly) {
                    linkSel.exit().remove();
                    linkSel.enter().append("circle")    // replacing rect
                        .attr("class", "crosslink")
                        .attr("r", xLinkWidth);
                    //.attr("width", xLinkWidth)
                    //.attr("height", yLinkWidth)
                }
                //var linkWidthOffset = (linkWidth - 1) / 2;    // for rects
                linkSel
                    .attr("cx", function (d, i) {    // cx/cy for circle, x/y for rect
                        return fromToStore[i][0];// - linkWidthOffset;
                    })
                    .attr("cy", function (d, i) {
                        return (seqLengthB - fromToStore[i][1]);// - linkWidthOffset;
                    })
                    .each(indLinkPlot);
            }
        }

        return this;
    }

    /**
     * Gets size data for the matrix viewport.
     * Calculates available width/height accounting for margins, and includes sequence lengths.
     * Uses jQuery width() instead of clientWidth/Height for Firefox compatibility.
     * @returns {Object} Size data with cx, cy (total SVG size), width, height (minus margins), minDim (minimum dimension), lengthA, lengthB (sequence lengths)
     */
    getSizeData() {
        // Firefox returns 0 for an svg element's clientWidth/Height, so use zepto/jquery width function instead
        const jqElem = $(this.svg.node());
        const cx = jqElem.width(); //this.svg.node().clientWidth;
        const cy = jqElem.height(); //this.svg.node().clientHeight;
        const width = Math.max(0, cx - this.options.margin.left - this.options.margin.right);
        const height = Math.max(0, cy - this.options.margin.top - this.options.margin.bottom);
        //its going to be square and fit in containing div
        const minDim = Math.min(width, height);

        const sizeData = this.getSeqLengthData();
        $.extend(sizeData, {
            cx: cx,
            cy: cy,
            width: width,
            height: height,
            minDim: minDim,
        });
        return sizeData;
    }

    /**
     * Gets sequence lengths of current protein pairing.
     * @returns {Object} Object with lengthA (protein 1 length) and lengthB (protein 2 length)
     */
    getSeqLengthData() {
        const mObj = this.options.matrixObj;
        const size = mObj ? [mObj.fromProtein.size, mObj.toProtein.size] : [0, 0];
        return {
            lengthA: size[0],
            lengthB: size[1]
        };
    }

    // called when things need repositioned, but not re-rendered from data
    resize() {
        console.log("matrix resize");
        const sizeData = this.getSizeData();
        const minDim = sizeData.minDim;

        // fix viewport new size, previously used .attr, but then setting the size on the child canvas element expanded it, some style trumps attr thing
        //var widthRatio = minDim / sizeData.lengthA;
        //var heightRatio = minDim / sizeData.lengthB;
        const widthRatio = sizeData.width / sizeData.lengthA;
        const heightRatio = sizeData.height / sizeData.lengthB;
        const minRatio = Math.min(widthRatio, heightRatio);
        // const diffRatio = widthRatio / heightRatio;

        const viewPort = d3.select(this.el).select(".viewport");

        const fx = sizeData.lengthA * minRatio;
        const fy = sizeData.lengthB * minRatio;

        //console.log (sizeData, "rr", widthRatio, heightRatio, minRatio, diffRatio, "FXY", fx, fy);

        viewPort
            .style("width", fx + "px")
            .style("height", fy + "px");

        d3.select(this.el).select("#matrixClip > rect")
            .attr("width", fx)
            .attr("height", fy);

        // Need to rejig x/y scales and d3 translate coordinates if resizing
        // set x/y scales to full domains and current size (range)
        this.x
            .domain([1, sizeData.lengthA + 1])
            .range([0, fx]);

        // y-scale (inverted domain)
        this.y
            .domain([sizeData.lengthB + 1, 1])
            .range([0, fy]);

        // update brush
        this.brush
            .x(this.x.copy().range(this.x.domain().slice()))
            .y(this.y.copy().range(this.y.domain().slice().reverse()));
        this.zoomGroup.select(".brush").call(this.brush);
        //console.log ("BRUSH", this.brush);

        // make sure brush rectangle is big enough to cover viewport (accommodate for scaling)
        this.zoomGroup.select(".brush rect.background")
            .attr("width", sizeData.lengthA)
            .attr("height", sizeData.lengthB);

        //var approxTicks = Math.round (minDim / 50); // 50px minimum spacing between ticks
        this.xAxis.ticks(Math.round(fx / 50)).outerTickSize(0);
        this.yAxis.ticks(Math.round(fy / 50)).outerTickSize(0);

        // then store the current pan/zoom values
        const curt = this.zoomStatus.translate();
        const curs = this.zoomStatus.scale();

        // reset reference x and y scales in zoomStatus object to be x and y scales above
        this.zoomStatus.x(this.x).y(this.y);

        // modify translate coordinates by change (delta) in display size
        const deltaz = this.last ? (minDim / this.last) : 1;
        //console.log ("deltaz", deltaz);
        this.last = minDim;
        curt[0] *= deltaz;
        curt[1] *= deltaz;
        // feed current pan/zoom values back into zoomStatus object
        // (as setting .x and .y above resets them inside zoomStatus)
        // this adjusts domains of x and y scales
        this.zoomStatus.scale(curs).translate(curt);

        // Basically the point is to readjust the axes when the display space is resized, but preserving their current zoom/pan settings
        // separately from the scaling due to the resizing

        // pan/zoom canvas
        this.panZoom();

        return this;
    }

    // Used to do this just on resize, but rectangular areas mean labels often need re-centred on panning
    repositionLabels(sizeData) {
        // reposition labels
        //console.log ("SD", sizeData, this.options.margin);
        const labelCoords = [{
            x: sizeData.right / 2,
            y: sizeData.bottom + this.options.margin.bottom - 5,
            rot: 0
        },
        {
            x: -this.options.margin.left,
            y: sizeData.bottom / 2,
            rot: -90
        },
        {
            x: sizeData.right / 2,
            y: 0,
            rot: 0
        }
        ];
        this.vis.selectAll("g.label text")
            .data(labelCoords)
            .attr("transform", function (d) {
                return "translate(" + d.x + " " + d.y + ") rotate(" + d.rot + ")";
            });
        return this;
    }

    // called when panning and zooming performed
    panZoom() {

        const self = this;
        const sizeData = this.getSizeData();

        // rescale and position canvas according to pan/zoom settings and available space
        const scale = this.getOverallScale(sizeData);
        const scaleString = "scale(" + scale + ")";
        const translateString = "translate(" + this.zoomStatus.translate()[0] + "px," + this.zoomStatus.translate()[1] + "px)";
        const translateStringAttr = "translate(" + this.zoomStatus.translate()[0] + "," + this.zoomStatus.translate()[1] + ")";
        const transformStrings = {
            attr: translateStringAttr + " " + scaleString,
            style: translateString + " " + scaleString
        };

        // for some reason using a css transform style on an svg group doesn't play nice in firefox (i.e. wrong positions reported, offsetx/y mangled etc)
        // , so use attr transform instead
        [ /*{elem: d3.select(this.el).select(".mouseMat"), type: "style"},*/ {
            elem: this.zoomGroup,
            type: "attr"
        }].forEach(function (d3sel) {
            if (d3sel.type === "attr") {
                d3sel.elem.attr("transform", transformStrings[d3sel.type]);
            } else {
                const tString = transformStrings[d3sel.type];
                ["-ms-transform", "-moz-transform", "-o-transform", "-webkit-transform", "transform"].forEach(function (styleName) {
                    d3sel.elem.style(styleName, tString);
                });
            }
        });

        // If bottom edge of canvas is higher up than bottom of viewport put the x axis beneath it
        const cvs = $(this.canvas.node());
        const viewport = cvs.parent();
        sizeData.viewHeight = $.zepto ? viewport.height() : viewport.outerHeight(true);
        sizeData.viewWidth = $.zepto ? viewport.width() : viewport.outerWidth(true);

        const bottom = sizeData.viewHeight;
        /*Math.min (
                   cvs.position().top + (($.zepto ? cvs.height() : cvs.outerHeight(true)) * scale),
                   sizeData.viewHeight
               ); */
        const right = sizeData.viewWidth;
        /*Math.min (
                   cvs.position().left + (($.zepto ? cvs.width() : cvs.outerWidth(true)) * scale),
                   sizeData.viewWidth
               );*/

        // redraw axes
        this.vis.select(".y")
            .call(self.yAxis);

        this.vis.select(".x")
            .attr("transform", "translate(0," + bottom + ")")
            .call(self.xAxis);

        declutterAxis(this.vis.select(".x"));

        sizeData.bottom = bottom;
        sizeData.right = right;
        this.repositionLabels(sizeData);

        //console.log ("sizeData", sizeData);

        return this;
    }

    /**
     * Generates string representation of current matrix view options.
     * Returns protein pairing formatted as "ProteinA-ProteinB" with underscores replaced by spaces.
     * Used for display and export filenames.
     * @returns {string} String representation of protein pairing
     */
    optionsToString() {
        const matrixObj = this.options.matrixObj;
        return [matrixObj.fromProtein, matrixObj.toProtein]
            .map(function (protein) {
                return protein.name.replace("_", " ");
            })
            .join("-");
    }
}

DistanceMatrixViewBB.prototype.identifier = "Matrix View";

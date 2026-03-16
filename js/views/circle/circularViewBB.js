/**
 * @fileoverview Circular/chord diagram view for visualizing protein networks and crosslinks.
 * Displays proteins as arcs around a circle with crosslinks as curves between them.
 * Supports protein ordering (alpha, size, reduce-crossings, manual drag), self-link positioning
 * (inside/outside), homomultimer handling, feature overlays, residue labels, and interactive selection.
 */

import "../../../css/circularViewBB.css";
import $ from "jquery";
import * as _ from "underscore";

import {BaseFrameView} from "../../ui-utils/base-frame-view";
import {getResidueType} from "../../modelUtils";
import {commonLabels, makeBackboneButtons, niceRound, objectStateToAbbvString, xilog} from "../../utils";
import {DropDownMenuViewBB} from "../../ui-utils/ddMenuViewBB";
import d3 from "d3";
import {circleArrange} from "./circleArrange";
import {makeTooltipContents, makeTooltipTitle} from "../../ui-utils/make-tooltip";
import vent from "../../vent";

/**
 * Calculates circular layout positioning for proteins, crosslinks, and features.
 * Maps linear protein sequences to circular arcs with gaps, converts link/feature positions
 * to angular coordinates, handles alignment between different index spaces.
 * @param {Array} nodeArr - Array of protein objects with id, name, size
 * @param {Array} linkArr - Array of crosslink objects
 * @param {Array} featureArrs - Array of feature arrays (one per protein)
 * @param {Array} range - Angular range [start, end] in degrees (e.g., [0, 360])
 * @param {Object} options - Layout options with gap, linkParse, featureParse functions
 * @returns {Object} Layout object with nodes (arc positions), links (angular coords), features (arc positions)
 */
const circleLayout = function (nodeArr, linkArr, featureArrs, range, options) {

    const defaults = {
        gap: 5,
        linkParse: function (link) {
            return {
                fromPos: link.fromPos,
                fromNodeID: link.fromNodeID,
                toPos: link.toPos,
                toNodeID: link.toNodeID
            };
        },
        // eslint-disable-next-line no-unused-vars
        featureParse: function (feature, node) {
            return {
                fromPos: feature.start - 1,
                toPos: feature.end // - 1
            };
        },
    };
    const _options = _.extend(defaults, options);

    let totalLength = nodeArr.reduce(function (total, protein) {
        return total + (protein.size || 1); // for some reason, some people use an ambiguous protein with no size declared, which causes NaN's
    }, 0);

    const realRange = range[1] - range[0];
    const noOfGaps = nodeArr.length;
    // Fix so gaps never take more than a quarter the display circle in total
    _options.gap = Math.min((realRange / 4) / noOfGaps, _options.gap);

    // work out the length a gap needs to be in the domain to make a _options.gap length in the range
    const ratio = totalLength / (realRange - (_options.gap * noOfGaps));
    const dgap = _options.gap * ratio;
    totalLength += dgap * noOfGaps;
    const scale = d3.scale.linear().domain([0, totalLength]).range(range);
    let total = dgap / 2; // start with half gap, so gap at top is symmetrical (like a double top)

    const nodeCoordMap = d3.map();
    nodeArr.forEach(function (node) {
        const size = node.size || 1; // again size is sometimes not there for some artificial protein (usually an ambiguous placeholder)
        // start ... end goes from scale (0 ... size), 1 bigger than 1-indexed size
        nodeCoordMap.set(node.id, {
            id: node.id,
            name: node.name,
            rawStart: total,
            start: scale(total),
            end: scale(total + size),
            size: size
        });
        total += size + dgap;
        //xilog ("prot", nodeCoordMap.get(node.id));
    });

    const featureCoords = [];
    let fid = 0;
    featureArrs.forEach(function (farr, i) {
        const nodeID = nodeArr[i].id;
        const nodeCoord = nodeCoordMap.get(nodeID);
        farr.forEach(function (feature) {
            const tofrom = _options.featureParse(feature, nodeID);
            //xilog (nodeArr[i].name, "nc", nodeCoord, farr, tofrom, "ORIG FEATURE", feature);
            if (tofrom) {
                featureCoords.push({
                    id: feature.category + fid.toString(),
                    description: feature.description,
                    category: feature.category,
                    type: feature.type,
                    name: feature.name,
                    nodeID: nodeID,
                    fstart: tofrom.fromPos + 1,
                    fend: tofrom.toPos,
                    start: scale(tofrom.fromPos + nodeCoord.rawStart),
                    end: scale(tofrom.toPos + nodeCoord.rawStart),
                });
                fid++;
            }
        });
    });
    //xilog ("CONV FEATURES", featureCoords);

    const linkCoords = linkArr.map(function (link) {
        const tofrom = _options.linkParse(link);
        return {
            id: link.id,
            start: scale(0.5 + tofrom.fromPos + nodeCoordMap.get(tofrom.fromNodeID).rawStart),
            end: scale(0.5 + tofrom.toPos + nodeCoordMap.get(tofrom.toNodeID).rawStart),
        };
    });

    // End result
    // 0...1...2...3...4...5...6...7...8...9...10 - node start - end range for protein length 10 (1-indexed)
    // ..1...2...3...4...5...6...7...8...9...10.. - link positions set to 1-indexed link pos minus 0.5
    // 0...2...............5..................... - feature range [2..5] starts at node start -1 to node end to cover approporiate links

    return {
        nodes: Array.from(nodeCoordMap.values()),
        links: linkCoords,
        features: featureCoords
    };
};

/**
 * Backbone view for circular/chord diagram visualization of protein networks.
 * Displays proteins as colored arcs around a circle with crosslinks as curves (chords) between them.
 * Supports multiple protein orderings (alphabetical, by size, to reduce crossings, manual drag-to-reorder),
 * self-link positioning (inside/outside circle), homomultimer detection and display, protein features
 * as colored arcs, residue labels at link ends, selection/highlighting, and interactive tooltips.
 * @class
 * @extends BaseFrameView
 * @property {number} radius - Current circle radius in pixels
 * @property {Object} line - D3 radial line generator for inside links
 * @property {Object} outsideLine - D3 radial line generator for outside links
 * @property {Object} arc - D3 arc generator for protein arcs
 * @property {Object} textArc - D3 arc generator for protein name paths
 * @property {Object} featureArc - D3 arc generator for feature arcs
 * @property {Object} resLabelArc - D3 arc generator for residue label positioning
 * @property {Object} nodeDrag - D3 drag behavior for manual protein reordering
 * @property {Array} proteinOrder - Current protein ordering (array of protein IDs)
 * @property {Object} bespokeOrder - Custom protein ordering map from manual dragging
 */
export class CircularViewBB extends BaseFrameView {
    constructor(options) {
        super(options);
    }

    /**
     * Returns event handlers for this view.
     * Extends parent events with circular view-specific handlers for ordering, display toggles, and selection.
     * @returns {Object} Event handlers map
     */
    get events() {
        let parentEvents = BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "click .niceButton": "reOrderAndRender",
            "click .flipIntraButton": "flipIntra",
            "click .showResLabelsButton": "showResLabelsIfRoom",
            "click .showLinkless": "toggleLinklessVisibility",
            "click .toggleHomomOpposition": "toggleHomomOppositeIntra",
            "click .showSelectedOnly": "toggleSelectedOnly",
            "click .backdrop": "clearSelection",
        });
    }

    /**
     * Returns default options for circular view.
     * @returns {Object} Default options including node/tick widths, gaps, parsing functions, display flags
     */
    get defaultOptions() {
        return {
            nodeWidth: 10, // this is a percentage measure
            tickWidth: 23,
            tickLabelCycle: 5, // show label every nth tick
            gap: 5,
            linkParse: function (link) {
                // turn toPos and fromPos to zero-based index
                return {
                    fromPos: link.fromResidue - 1,
                    fromNodeID: link.fromProtein.id,
                    toPos: link.toResidue - 1,
                    toNodeID: link.toProtein.id
                };
            },
            intraOutside: true,
            showResLabels: true,
            homomOpposite: true,
            showSelectedOnly: false,
            sort: "alpha",
            sortDir: 1,
            showLinkless: true,
            exportKey: true,
            exportTitle: true,
            canHideToolbarArea: true,
            canTakeImage: true,
        };
    }

    /**
     * Initializes the circular view.
     * Sets up SVG structure, D3 line/arc generators, drag behaviors for rotation and protein reordering,
     * ordering/show option dropdowns, tooltips, event listeners for filtering/selection/colors/features,
     * and initial render. Configures feature parsing with alignment handling.
     * @param {Object} viewOptions - View initialization options
     * @returns {CircularViewBB} This view instance for chaining
     */
    initialize(viewOptions) {
        const self = this;

        this.defaultOptions.featureParse = function (feature, nodeid) {
            // feature.start and .end are 1-indexed, and so are the returned convStart and convEnd values
            if (!feature.start) {
                feature.start = +feature.begin;
            }
            let convStart = +feature.start;
            let convEnd = +feature.end;
            // const type = feature.type.toLowerCase();
            const protAlignModel = self.model.get("alignColl").get(nodeid);

            const annotationColl = self.model.get("annotationTypes");
            const annotationTypeModel = annotationColl.get(annotationColl.modelId(feature));
            const annotationTypeModelAlignmentID = annotationTypeModel ? annotationTypeModel.get("typeAlignmentID") : undefined;

            if (protAlignModel) {
                const alignmentID = feature.alignmentID || annotationTypeModelAlignmentID; // individual feature alignment ids trump feature type alignment ids
                /*
                convStart = protAlignModel.mapToSearch (alignmentID, +feature.start);
                convEnd = protAlignModel.mapToSearch (alignmentID, +feature.end);
                if (convStart <= 0) { convStart = -convStart; }   // <= 0 indicates no equal index match, do the - to find nearest index
                if (convEnd <= 0) { convEnd = -convEnd; }         // <= 0 indicates no equal index match, do the - to find nearest index
                */
                if (alignmentID) {
                    const convertedRange = protAlignModel.rangeToSearch(alignmentID, convStart, convEnd);
                    if (!convertedRange) {
                        return null;
                    }
                    convStart = convertedRange[0];
                    convEnd = convertedRange[1];
                }
            }
            convStart = Math.max(0, convStart - 1); // subtract one, but don't have negative values
            if (isNaN(convEnd) || convEnd === undefined) {
                convEnd = +feature.end;
            }
            //convEnd--;    // commented out as convEnd must extend by 1 so length of displayed range is (end-start) + 1
            // e.g. a feature that starts/stops at some point has length of 1, not 0

            xilog(feature, "convStart", +feature.start, convStart, "convEnd", +feature.end, convEnd, protAlignModel);
            return {
                fromPos: convStart,
                toPos: convEnd
            };
        };

        // if protein default colour backbone-models use this instead for legibility
        this.replacementDefaultNodeColourModel = {
            getColour: function () {
                return "#dde";
            }
        };

        super.initialize(...arguments);

        // this.el is the dom element this should be getting added to, replaces targetDiv
        const mainDivSel = d3.select(this.el);
        // defs to store path definitions for curved text, two nested g's, one for translating, then one for rotating
        const template = _.template("<DIV class='toolbar toolbarArea'></DIV><DIV class='panelInner backdrop' flex-grow='1'><svg class='<%= svgClass %>'><defs></defs><g><g></g></g></svg></DIV>");
        mainDivSel.append("div")
            .attr("class", "verticalFlexContainer")
            .html(
                template({
                    svgClass: "circularView",
                })
            );
        mainDivSel.select(".backdrop")
            // can replace .backdrop class colouring with this option if defined
            .style("background-color", this.options.background);
        const buttonData = [{
            class: "downloadButton",
            label: commonLabels.downloadImg + "SVG",
            type: "button",
            id: "download"
        },];

        const toolbar = mainDivSel.select("div.toolbar");
        makeBackboneButtons(toolbar, self.el.id, buttonData);


        // DROPDOWN STARTS
        // Various view options set up, then put in a dropdown menu
        const orderOptionsButtonData = [
            {
                class: "circRadio",
                label: "Alphabetically",
                id: "alpha",
                raw_id: "alpha",
                type: "radio",
                group: "sort"
            },
            {
                class: "circRadio",
                label: "By Length",
                id: "size",
                raw_id: "size",
                type: "radio",
                group: "sort"
            },
            {
                class: "circRadio",
                label: "To Reduce Crossings",
                id: "best",
                raw_id: "best",
                type: "radio",
                group: "sort",
                sectionEnd: true,
                d3tooltip: "Order proteins to reduce visual crosslink intersections in the circle - making it easier to comprehend"
            },
            {
                class: "niceButton",
                label: "Redo Current Ordering",
                id: "nice",
                raw_id: "nice",
                type: "button"
            },
        ];
        orderOptionsButtonData
            .filter(function (d) {
                return d.type === "radio";
            })
            .forEach(function (d) {
                d.initialState = this.options.sort === d.id;
                d.inputFirst = true;
                d.func = function () {
                    self.options.sort = d.raw_id;
                    self.reOrderAndRender({
                        reverseConsecutive: true
                    });
                };
            }, this);
        makeBackboneButtons(toolbar, self.el.id, orderOptionsButtonData);

        const orderoptid = this.el.id + "OrderOptions";
        toolbar.append("p").attr("id", orderoptid);
        new DropDownMenuViewBB({
            el: "#" + orderoptid,
            model: self.model.get("clmsModel"),
            myOptions: {
                title: "Order Proteins ▼",
                menu: orderOptionsButtonData.map(function (d) {
                    d.id = self.el.id + d.id;
                    d.tooltip = d.d3tooltip;
                    return d;
                }),
                closeOnClick: false,
                tooltipModel: self.model.get("tooltipModel")
            }
        });


        const showOptionsButtonData = [
            {
                class: "showLinkless",
                label: "All Proteins",
                id: "showLinkless",
                initialState: this.options.showLinkless,
                d3tooltip: "Keep showing proteins with no current crosslinks for a steadier layout"
            },
            {
                class: "showResLabelsButton",
                label: "Residue Labels (If Few Links)",
                id: "resLabels",
                initialState: this.options.showResLabels,
                d3tooltip: "If only a few crosslinks, show the residue letters at the ends of the cross-links"
            },
            {
                class: "flipIntraButton",
                label: "Self Links on Outside",
                id: "flip",
                initialState: this.options.intraOutside,
                d3tooltip: "Flips the display of Self crosslinks between inside and outside"
            },
            {
                class: "toggleHomomOpposition",
                label: "Links with Overlapping Peptides Opposite to Self Links",
                id: "homomOpposite",
                initialState: this.options.homomOpposite,
                d3tooltip: "Show crosslinks with overlapping peptides on the opposite side (in/out) to Self crosslinks. Often these may be homomultimeric - links between different copies of the same protein."
            },
            {
                class: "showSelectedOnly",
                label: "Selected Crosslinks Only",
                id: "showSelectedOnly",
                initialState: this.options.showSelectedOnly,
                d3tooltip: "Show selected crosslinks only (yellow highlighting is removed also.)"
            },
        ];
        showOptionsButtonData
            .forEach(function (d) {
                d.type = "checkbox";
                d.inputFirst = true;
            });
        makeBackboneButtons(toolbar, self.el.id, showOptionsButtonData);

        const showoptid = this.el.id + "ShowOptions";
        toolbar.append("p").attr("id", showoptid);
        new DropDownMenuViewBB({
            el: "#" + showoptid,
            model: self.model.get("clmsModel"),
            myOptions: {
                title: "Show ▼",
                menu: showOptionsButtonData.map(function (d) {
                    d.id = self.el.id + d.id;
                    d.tooltip = d.d3tooltip;
                    return d;
                }),
                closeOnClick: false,
                tooltipModel: self.model.get("tooltipModel"),
            }
        });


        // DROPDOWN ENDS

        const degToRad = Math.PI / 180;

        // Lets user rotate diagram
        const backgroundDrag = d3.behavior.drag();
        backgroundDrag.on("dragstart", function () {
            d3.event.sourceEvent.stopPropagation();
            d3.event.sourceEvent.stopImmediatePropagation();
            d3.event.sourceEvent.preventDefault();
            const curTheta = d3.transform(svg.select("g g").attr("transform")).rotate * degToRad;
            const mc = d3.mouse(this);
            const dragStartTheta = Math.atan2(mc[1] - self.radius, mc[0] - self.radius);
            backgroundDrag.offTheta = curTheta - dragStartTheta;
        })
            .on("drag", function () {
                const dmc = d3.mouse(this);
                let theta = Math.atan2(dmc[1] - self.radius, dmc[0] - self.radius);
                theta += backgroundDrag.offTheta;
                svg.select("g g").attr("transform", "rotate(" + (theta / degToRad) + ")");
            });
        let svg = mainDivSel.select("svg");//.call(backgroundDrag);

        this.nodeDrag = d3.behavior.drag();
        this.nodeDrag.reOrder = function (d) {
            const mc = d3.mouse(svg.node());
            const dragTheta = Math.atan2(mc[1] - self.radius, mc[0] - self.radius);
            const deg = (((dragTheta / degToRad) + 90) + 360) % 360;
            const offsetDeg = deg - self.nodeDrag.startDeg;

            const newStart = (d.start + offsetDeg + 360) % 360;
            const newEnd = (d.end + offsetDeg + 360) % 360;

            const nodeData = d3.select(self.el).select(".nodeLayer").selectAll(".circleNode").data()
                .map(function (nd) {
                    return {
                        id: nd.id,
                        start: nd.start,
                        end: nd.end
                    };
                });
            const thisNode = nodeData.filter(function (nd) {
                return nd.id === d.id;
            })[0];
            thisNode.start = newStart;
            thisNode.end = newEnd;

            nodeData.sort(function (a, b) {
                const aMid = (a.start + a.end + (a.end < a.start ? 360 : 0)) % 720; // add 360 to end values smaller than start (zero wraparound)
                const bMid = (b.start + b.end + (b.end < b.start ? 360 : 0)) % 720;
                return aMid - bMid;
            });
            const bespokeOrder = _.object(
                _.pluck(nodeData, "id"),
                _.range(0, nodeData.length)
            ); // generate {7890: 0, 1234: 1, 2345: 2} etc

            if (!_.isEqual(bespokeOrder, this.bespokeOrder)) {
                self.bespokeOrder = bespokeOrder;
                self.options.sort = "bespoke";
                self.reOrderAndRender({
                    bespokeOrder: bespokeOrder
                });
            }
        };
        this.nodeDrag.on("dragstart", function () {
            d3.event.sourceEvent.stopPropagation();
            d3.event.sourceEvent.preventDefault();
            const mc = d3.mouse(svg.node());
            self.nodeDrag.startClick = mc;
            const dragStartTheta = Math.atan2(mc[1] - self.radius, mc[0] - self.radius);
            self.nodeDrag.startDeg = (((dragStartTheta / degToRad) + 90) + 360) % 360;
            // draw drag representation if >1 protein displayed
            if (self.filterProteins(self.model.get("clmsModel").getProteinsMap()).length > 1) {
                d3.select(this).classed("draggedNode", true);
            }
            self.nodeDrag.visited = true;
        })
            .on("drag", function (d) {
                d3.event.sourceEvent.stopPropagation();
                d3.event.sourceEvent.preventDefault();
                self.nodeDrag.reOrder(d);
            })
            .on("dragend", function (d) {
                d3.event.sourceEvent.stopPropagation(); // stop event getting picked up by backdrop listener which cancels all selections
                d3.event.sourceEvent.preventDefault();
                d3.select(this).classed("draggedNode", false);
                self.nodeDrag.reOrder(d);
                const mc = d3.mouse(svg.node());
                const movementSq = Math.pow(mc[0] - self.nodeDrag.startClick[0], 2) + Math.pow(mc[1] - self.nodeDrag.startClick[1], 2);
                if (movementSq < 9) {
                    self.selectNode.call(self, d);
                }
                d3.event.sourceEvent.stopPropagation(); // stop event getting picked up by backdrop listener which cancels all selections
                d3.event.sourceEvent.stopImmediatePropagation();
                d3.event.sourceEvent.preventDefault();
            });


        // for internal circle paths
        this.line = d3.svg.line.radial()
            .interpolate("bundle")
            .tension(0.45)
            .radius(function (d) {
                return d.rad;
            })
            .angle(function (d) {
                return d.ang * degToRad;
            });

        // 'bundle' intersects circle when trying to draw curves around circumference of circle between widely separated points
        this.outsideLine = d3.svg.line.radial()
            .interpolate("basis")
            .tension(0.45)
            .radius(function (d) {
                return d.rad;
            })
            .angle(function (d) {
                return d.ang * degToRad;
            });

        const arcs = ["arc", "textArc", "featureArc", "resLabelArc"];
        arcs.forEach(function (arc) {
            this[arc] = d3.svg.arc()
                .innerRadius(90)
                .outerRadius(100)
                .startAngle(function (d) {
                    return d.start * degToRad;
                }) // remembering to convert from degs to radians
                .endAngle(function (d) {
                    return d.end * degToRad;
                });
        }, this);

        this.clearTip = function () {
            self.model.get("tooltipModel").set("contents", null);
        };

        this.nodeTip = function (d) {
            const protein = self.model.get("clmsModel").getProtein(d.id);
            self.model.get("tooltipModel")
                .set("header", makeTooltipTitle.protein(protein))
                .set("contents", makeTooltipContents.protein(protein))
                .set("location", {
                    pageX: d3.event.pageX,
                    pageY: d3.event.pageY
                });
        };

        this.linkTip = function (d) {
            const xlink = self.model.get("clmsModel").getCrosslinks().get(d.id);
            self.model.get("tooltipModel")
                .set("header", makeTooltipTitle.link())
                .set("contents", makeTooltipContents.link(xlink))
                .set("location", {
                    pageX: d3.event.pageX,
                    pageY: d3.event.pageY
                });
        };

        this.featureTip = function (d) {
            self.model.get("tooltipModel")
                .set("header", makeTooltipTitle.feature())
                .set("contents", makeTooltipContents.feature(d))
                .set("location", {
                    pageX: d3.event.pageX,
                    pageY: d3.event.pageY
                });
        };

        // return order as is
        this.proteinOrder = _.pluck(Array.from(this.model.get("clmsModel").getProteinsIterator()), "id");

        let alignCall = 0;

        // listen to custom filteringDone event from backbone-models
        this.listenTo(this.model, "filteringDone", function () {
            // filtering can change node and thus feature positioning too if proteins are hidden or rearranged by sorting
            if (!self.options.showLinkless || self.options.sort === "best") {
                self.render();
            } else {
                self.renderPartial(["links", "nodes"]);
            }
        });
        this.listenTo(this.model, "change:selection", function () {
            this.options.showSelectedOnly ? this.renderPartial(["links"]) : this.showAccentedLinks("selection");
        });
        this.listenTo(this.model, "change:highlights", function () {
            this.showAccentedLinks("highlights");
        });
        this.listenTo(this.model, "change:selectedProteins", function () {
            this.showAccentedNodes("selection");
        });
        this.listenTo(this.model, "change:highlightedProteins", function () {
            this.showAccentedNodes("highlights");
        });
        this.listenTo(this.model.get("alignColl"), "bulkAlignChange", function () {
            xilog(++alignCall, ". CIRCULAR VIEW AWARE OF ALIGN CHANGES", arguments);
            self.renderPartial(["features"]);
        });
        this.listenTo(this.model, "change:linkColourAssignment currentColourModelChanged", function () {
            self.renderPartial(["links"]);
        }); // either colour change or new colour backbone-models
        this.listenTo(this.model, "change:proteinColourAssignment currentProteinColourModelChanged", function () {
            self.renderPartial(["nodes"]);
        }); // either colour change or new colour backbone-models
        this.listenTo(vent, "proteinMetadataUpdated", function () {   // generally a name change
            self.renderPartial(["nodes"]);
        });
        this.listenTo(this.model.get("annotationTypes"), "change:shown", function () {
            self.renderPartial(["features"]);
        });
        //this.listenTo (this.backbone-models.get("clmsModel"), "change:matches", this.reOrder);
        this.reOrderAndRender();

        return this;
    }

    /**
     * Reorders proteins according to current sort setting.
     * Supports alpha (name), size (length), best (reduce crossings via circleArrange algorithm),
     * or bespoke (manual drag ordering). Can reverse sort direction on consecutive calls.
     * @param {Object} [orderOptions] - Ordering options
     * @param {boolean} [orderOptions.reverseConsecutive] - Reverse sort direction if called consecutively
     * @param {Object} [orderOptions.bespokeOrder] - Custom ordering map for bespoke mode
     * @returns {CircularViewBB} This view instance for chaining
     */
    reOrder(orderOptions) {
        orderOptions = orderOptions || {};
        //xilog ("this", this, this.options);
        if (orderOptions.reverseConsecutive) {
            this.options.sortDir = -this.options.sortDir; // reverse direction of consecutive resorts
        }
        const prots = this.filterProteins(this.model.get("clmsModel").getProteinsMap());
        const proteinSort = function (field) {
            const numberSort = prots.length ? !isNaN(prots[0][field]) : false; // stop undefined 'prots[0].field' bug when no prots
            const sortDir = this.options.sortDir;
            prots.sort(function (a, b) {
                return (numberSort ? (+a[field]) - (+b[field]) : a[field].localeCompare(b[field])) * sortDir;
            });
            return _.pluck(prots, "id");
        };

        const self = this;
        const sortFuncs = {
            best: function () {
                return circleArrange(self.filterProteins(this.model.get("clmsModel").getProteinsMap()));
            },
            size: function () {
                return proteinSort.call(this, "size");
            },
            alpha: function () {
                return proteinSort.call(this, "name");
            },
            bespoke: function () {
                const bespokeOrder = orderOptions.bespokeOrder || self.bespokeOrder;
                prots.sort(function (a, b) {
                    return bespokeOrder[a.id] - bespokeOrder[b.id];
                });
                return _.pluck(prots, "id");
            }
        };
        this.proteinOrder = sortFuncs[this.options.sort] ? sortFuncs[this.options.sort].call(this) : _.pluck(prots, "id");
        return this;
    }

    /**
     * Reorders proteins and renders the view.
     * Convenience method that chains reOrder() and render().
     * @param {Object} [localOptions] - Options passed to both reOrder and render
     * @returns {CircularViewBB} This view instance for chaining
     */
    reOrderAndRender(localOptions) {
        return this.reOrder(localOptions).render(localOptions);
    }

    /**
     * Toggles self-link position between inside and outside circle.
     * @returns {CircularViewBB} This view instance for chaining
     */
    flipIntra() {
        this.options.intraOutside = !this.options.intraOutside;
        this.render(); // nodes move position too (radially)
        return this;
    }

    /**
     * Toggles residue letter labels at link ends (if few enough links).
     * @returns {CircularViewBB} This view instance for chaining
     */
    showResLabelsIfRoom() {
        this.options.showResLabels = !this.options.showResLabels;
        this.renderPartial(["linkLabels"]);
        return this;
    }

    /**
     * Toggles visibility of proteins with no current crosslinks.
     * @returns {CircularViewBB} This view instance for chaining
     */
    toggleLinklessVisibility() {
        this.options.showLinkless = !this.options.showLinkless;
        this.render();
        return this;
    }

    /**
     * Toggles whether homomultimer links display opposite to self links.
     * @returns {CircularViewBB} This view instance for chaining
     */
    toggleHomomOppositeIntra() {
        this.options.homomOpposite = !this.options.homomOpposite;
        this.renderPartial(["links"]);
        return this;
    }

    /**
     * Toggles showing only selected crosslinks.
     * @returns {CircularViewBB} This view instance for chaining
     */
    toggleSelectedOnly() {
        this.options.showSelectedOnly = !this.options.showSelectedOnly;
        this.renderPartial(["links"]);
        return this;
    }

    /**
     * ID function for D3 data joins.
     * @param {Object} d - Data object with id property
     * @returns {string} Object ID
     */
    idFunc(d) {
        return d.id;
    }

    /**
     * Shows accented (selected/highlighted) links.
     * @param {string} accentType - "selection" or "highlights"
     * @returns {CircularViewBB} This view instance for chaining
     */
    showAccentedLinks(accentType) {
        if (this.isVisible()) {
            this.showAccentOnTheseLinks(d3.select(this.el).selectAll(".circleGhostLink"), accentType);
        }
        return this;
    }

    /**
     * Applies accent styling to specified links based on marked crosslinks.
     * @param {Object} d3Selection - D3 selection of link elements
     * @param {string} accentType - "selection" or "highlights"
     * @returns {CircularViewBB} This view instance for chaining
     */
    showAccentOnTheseLinks(d3Selection, accentType) {
        let accentedLinkList = this.model.getMarkedCrossLinks(accentType);
        if (accentType === "selection" && this.options.showSelectedOnly) {
            accentedLinkList = [];
        }
        if (accentedLinkList) {
            const linkTypes = {
                selection: "selectedCircleLink",
                highlights: "highlightedCircleLink"
            };
            const linkType = linkTypes[accentType] || "link";
            const accentedLinkIDs = _.pluck(accentedLinkList, "id");
            const idset = d3.set(accentedLinkIDs);
            d3Selection.filter("." + linkType)
                .filter(function (d) {
                    return !idset.has(d.id);
                })
                .classed(linkType, false);
            d3Selection.filter(function (d) {
                return idset.has(d.id);
            })
                .classed(linkType, true);
        }
        return this;
    }

    /**
     * Shows accented (selected/highlighted) protein nodes.
     * @param {string} accentType - "selection" or "highlights"
     * @returns {CircularViewBB} This view instance for chaining
     */
    showAccentedNodes(accentType) {
        if (this.isVisible()) {
            this.showAccentOnTheseNodes(d3.select(this.el).selectAll(".circleNode"), accentType);
        }
        return this;
    }

    /**
     * Applies accent styling to specified protein nodes based on marked proteins.
     * @param {Object} d3Selection - D3 selection of node elements
     * @param {string} accentType - "selection" or "highlights"
     * @returns {CircularViewBB} This view instance for chaining
     */
    showAccentOnTheseNodes(d3Selection, accentType) {
        const accentedNodeList = this.model.get(accentType === "selection" ? "selectedProteins" : "highlightedProteins");
        if (accentedNodeList) {
            const linkType = {
                selection: "selected",
                highlights: "highlighted"
            };
            const accentedLinkIDs = _.pluck(accentedNodeList, "id");
            const idset = d3.set(accentedLinkIDs);
            d3Selection.classed(linkType[accentType], function (d) {
                return idset.has(d.id);
            });
        }
        return this;
    }

    /**
     * Marks crosslinks involving a protein node (or residue range within it).
     * Filters to links involving specified protein/residues and marks them as selection/highlights.
     * @param {string} nodeId - Protein ID
     * @param {string} actionType - "selection" or "highlights"
     * @param {boolean} add - Add to existing marks (true) or replace (false)
     * @param {number} [startPos] - Optional start residue position
     * @param {number} [endPos] - Optional end residue position
     * @returns {CircularViewBB} This view instance for chaining
     */
    actionNodeLinks(nodeId, actionType, add, startPos, endPos) {
        const filteredCrossLinks = this.model.getFilteredCrossLinks();
        const anyPos = startPos == undefined && endPos == undefined;
        startPos = startPos || 0;
        endPos = endPos || 100000;
        const matchLinks = filteredCrossLinks.filter(function (link) {
            return (link.fromProtein.id === nodeId && (anyPos || (link.fromResidue >= startPos && endPos >= link.fromResidue))) ||
                (link.toProtein.id === nodeId && (anyPos || (link.toResidue >= startPos && endPos >= link.toResidue)));
        });
        this.model.setMarkedCrossLinks(actionType, matchLinks, actionType === "highlights", add);
        //this.backbone-models.set (actionType, matchLinks);
        return this;
    }

    /**
     * Clears current crosslink and protein selections.
     * Doesn't clear if node was just dragged or if alt/ctrl/shift held (adding to selection).
     * @param {Event} [evt] - Optional event with altKey, ctrlKey, shiftKey properties
     * @returns {CircularViewBB} This view instance for chaining
     */
    clearSelection(evt) {
        evt = evt || {};
        //console.log ("evt", evt);
        if (!this.nodeDrag.visited) {
            // don't cancel if any of alt/ctrl/shift held down as it's probably a mis-aimed attempt at adding to an existing search
            // this is also logically consistent as it's adding 'nothing' to the existing selection
            if (!evt.altKey && !evt.ctrlKey && !evt.shiftKey) {
                this.model.setMarkedCrossLinks("selection", [], false, false);
                this.model.setSelectedProteins([], false);
            }
        }
        this.nodeDrag.visited = false;
        return this;
    }

    /**
     * Converts link angular positions to path coordinates.
     * Determines if links go inside or outside circle based on self/homomultimer status,
     * generates coordinate arrays for D3 radial line generators. Handles long outside links
     * with multiple control points, homomultimer bow shapes, and normal curved links.
     * @param {Array} links - Array of link objects with id, start, end angles
     * @param {number} rad1 - Inner radius (for inside/normal links)
     * @param {number} rad2 - Outer radius (for outside links)
     * @returns {Array} Array of link objects with id, coords (path control points), outside flag
     */
    convertLinks(links, rad1, rad2) {
        const xlinks = this.model.get("clmsModel").getCrosslinks();
        const intraOutside = this.options.intraOutside;
        const homomOpposite = this.options.homomOpposite;
        const bowOutMultiplier = 1.2;

        const newLinks = links.map(function (link) {
            const xlink = xlinks.get(link.id);
            const homom = xlink.confirmedHomomultimer; // TODO: need to deal with this changing
            const intra = xlink.toProtein.id === xlink.fromProtein.id;
            const out = intraOutside ? intra && (homomOpposite ? !homom : true) : (homomOpposite ? homom : false);
            const rad = out ? rad2 : rad1;
            const bowRadius = out ? rad2 * bowOutMultiplier : 0;

            const a1 = Math.min(link.start, link.end);
            const a2 = Math.max(link.start, link.end);
            const midang = (a1 + a2) / 2; //(a2 - a1 < 180) ? (a1 + a2) / 2 : ((a1 + a2 + 360) / 2) % 360; // mid-angle (bearing in mind it might be shorter to wrap round the circle)
            const degSep = a2 - a1; // Math.min (a2 - a1, a1 - a2 + 360); // angle of separation, 2nd one works for doing long outside links the other way round. See next comment.
            //xilog ("angs", link.start, link.end, degSep);
            let coords;

            if (out && degSep > 70) {
                const controlPointAngleSep = 60;
                const counterClockwise = false; //(degSep === a1 - a2 + 360) ^ (link.start > link.end); // odd occassion when not intra and homom (is an error)
                const furtherBowRadius = bowRadius * (1 + (0.25 * ((degSep - 70) / 180)));
                coords = [{
                    ang: link.start,
                    rad: rad
                }, {
                    ang: link.start,
                    rad: bowRadius
                }];
                const holdPoints = Math.floor(degSep / controlPointAngleSep) + 1;
                const deltaAng = (degSep % controlPointAngleSep) / 2;
                const offsetAng = link.start + deltaAng;
                for (let n = 0; n < holdPoints; n++) {
                    coords.push({
                        ang: ((offsetAng + (counterClockwise ? -n : n) * controlPointAngleSep) + 360) % 360,
                        rad: furtherBowRadius
                    });
                }
                coords.push({
                    ang: link.end,
                    rad: bowRadius
                }, {
                    ang: link.end,
                    rad: rad
                });
            } else if (homom && intra) {
                const homomBowRadius = out ? rad + this.options.tickWidth : rad * 0.65;
                const homomAngDelta = out ? 2 : 10;
                coords = [{
                    ang: link.start,
                    rad: rad
                }, {
                    ang: (midang - homomAngDelta) % 360,
                    rad: homomBowRadius
                }, {
                    ang: (midang + homomAngDelta) % 360,
                    rad: homomBowRadius
                }, {
                    ang: link.end,
                    rad: rad
                }];
            } else {
                coords = [{
                    ang: link.start,
                    rad: rad
                }, {
                    ang: midang,
                    rad: bowRadius
                }, {
                    ang: link.end,
                    rad: rad
                }];
            }
            return {
                id: link.id,
                coords: coords,
                outside: out
            };
        }, this);
        return newLinks;
    }

    /**
     * Gets maximum circle radius that fits in SVG container.
     * @param {Object} d3sel - D3 selection of SVG element
     * @returns {number} Maximum radius in pixels (min of width/height divided by 2)
     */
    getMaxRadius(d3sel) {
        const zelem = $(d3sel.node());
        return Math.min(zelem.width(), zelem.height()) / 2;
    }

    /**
     * Filters proteins to non-decoys and optionally removes hidden ones.
     * @param {Map} proteins - Native map of protein objects
     * @returns {Array} Array of filtered protein objects
     */
    filterProteins(proteins) {  // proteins is a native map
        const filteredProteins = [];
        const showLinkless = this.options.showLinkless;
        proteins.forEach(function (value) {
            if (!value.is_decoy && (showLinkless || !value.hidden)) {
                filteredProteins.push(value);
            }
        });
        return filteredProteins;
    }

    /**
     * Renders only specified parts of the view.
     * Convenience method that calls render with changed set.
     * @param {Array} renderPartArr - Array of part names: "links", "nodes", "features", "linkLabels"
     * @returns {CircularViewBB} This view instance for chaining
     */
    renderPartial(renderPartArr) {
        this.render({
            changed: d3.set(renderPartArr)
        });
        return this;
    }

    /**
     * Main render method for the circular view.
     * Calculates circle radius, filters proteins/links, generates circular layout, calculates radii,
     * and draws links/nodes/features/labels. Supports partial rendering via changed set.
     * @param {Object} [renderOptions] - Render options
     * @param {Object} [renderOptions.changed] - D3 set of changed parts ("links", "nodes", "features", "linkLabels")
     * @returns {CircularViewBB} This view instance for chaining
     */
    render(renderOptions) {

        renderOptions = renderOptions || {};
        //xilog ("render options", renderOptions);
        const changed = renderOptions.changed;

        if (this.isVisible()) {
            //xilog ("re-rendering circular view");
            const svg = d3.select(this.el).select("svg");
            this.radius = this.getMaxRadius(svg);

            const proteins = this.model.get("clmsModel").getProteinsMap();
            //xilog ("proteinOrder", this.proteinOrder);
            //xilog ("backbone-models", this.backbone-models);

            let filteredProteins = this.filterProteins(proteins);
            let filteredCrossLinks = this.model.getFilteredCrossLinks(); //modelUtils.getFilteredNonDecoyCrossLinks (crosslinks);
            if (this.options.showSelectedOnly) {
                const selectedIDs = d3.set(_.pluck(this.model.getMarkedCrossLinks("selection"), "id"));
                filteredCrossLinks = filteredCrossLinks.filter(function (xlink) {
                    return selectedIDs.has(xlink.id);
                });
            }

            // If only one protein hide some options, and make links go in middle
            // make it so menu stays if we've filtered down to one protein, rather than just one protein in the search

            d3.select(this.el).selectAll("button.flipIntraButton,#" + this.el.id + "Options")
                .style("display", (this.model.get("clmsModel").targetProteinCount < 2) ? "none" : null);

            if (filteredProteins.length < 2) {
                this.options.intraOutside = false;
            }
            //xilog ("fi", filteredProteins, proteins);

            const fmap = d3.map(filteredProteins, function (d) {
                return d.id;
            });

            // This line in case links are loaded via csv and proteinOrder isn't initialised or out of sync with proteins
            if (filteredProteins.length !== this.proteinOrder.length) { // proteins is map so size, proteinOrder is array so length
                //console.log("REORDERING OK", filteredProteins.length, this.proteinOrder.length)
                this.reOrder();
            }

            // reset filteredProteins to same order as protein order
            filteredProteins = this.proteinOrder
                .filter(function (proteinId) {
                    return fmap.has(proteinId);
                })
                .map(function (proteinId) {
                    return fmap.get(proteinId);
                });

            // After rearrange proteins, because filtered features depends on the protein order
            // const alignColl = this.backbone-models.get("alignColl");
            const filteredFeatures = filteredProteins.map(function (inter) {
                return this.model.getFilteredFeatures(inter);
            }, this);
            //xilog ("filteredFeatures", filteredFeatures);

            const layout = circleLayout(filteredProteins, filteredCrossLinks, filteredFeatures, [0, 360], this.options);
            //xilog ("layout", layout);

            const tickRadius = (this.radius - this.options.tickWidth) * (this.options.intraOutside ? 0.8 : 1.0); // shrink radius if some links drawn on outside
            const innerNodeRadius = tickRadius * ((100 - this.options.nodeWidth) / 100);
            const innerFeatureRadius = tickRadius * ((100 - (this.options.nodeWidth * 0.7)) / 100);
            const textRadius = (tickRadius + innerNodeRadius) / 2;

            const arcRadii = [
                {
                    arc: "arc",
                    inner: innerNodeRadius,
                    outer: tickRadius
                },
                {
                    arc: "featureArc",
                    inner: innerFeatureRadius,
                    outer: tickRadius
                }, // both radii same for textArc
                {
                    arc: "textArc",
                    inner: textRadius,
                    outer: textRadius
                }, // both radii same for textArc
                {
                    arc: "resLabelArc",
                    inner: innerNodeRadius,
                    outer: textRadius
                },
            ];
            arcRadii.forEach(function (arcData) {
                this[arcData.arc].innerRadius(arcData.inner).outerRadius(arcData.outer);
            }, this);

            const nodes = layout.nodes;
            const links = layout.links;
            const features = layout.features;
            // turns link end & start angles into something d3.svg.arc can use
            const linkCoords = this.convertLinks(links, innerNodeRadius, tickRadius);
            //xilog ("linkCoords", linkCoords);

            const gTrans = svg.select("g");
            gTrans.attr("transform", "translate(" + this.radius + "," + this.radius + ")");
            const gRot = gTrans.select("g");
            //gRot.attr("transform", "rotate(0)");

            if (!changed || changed.has("links")) {
                this.drawLinks(gRot, linkCoords);   // draw links
            }
            if (!changed || changed.has("nodes")) {
                this
                    .drawNodes(gRot, nodes) // draw nodes (around edge)
                    .drawNodeTicks(gRot, nodes, tickRadius); // draw scales on nodes - adapted from http://bl.ocks.org/mbostock/4062006
            }
            if (!changed || changed.has("features")) {
                this.drawFeatures(gRot, features);  // draw features
            }
            if (!changed || changed.has("nodes")) {
                this.drawNodeText(gRot, nodes); // draw names on nodes
            }
            if (!changed || changed.has("links") || changed.has("linkLabels")) {
                this.drawResidueLetters(gRot, linkCoords);
            }
        }

        return this;
    }

    /**
     * Gets or creates a named SVG group layer.
     * @param {Object} g - D3 selection of parent group
     * @param {string} layerClass - Class name for the layer
     * @returns {Object} D3 selection of the layer group
     */
    addOrGetGroupLayer(g, layerClass) {
        let groupLayer = g.select("g." + layerClass);
        if (groupLayer.empty()) {
            groupLayer = g.append("g").attr("class", layerClass);
        }
        return groupLayer;
    }

    /**
     * Draws crosslink curves as SVG paths.
     * Creates thin visible links (colored by link color backbone-models, ambiguous dashed) and thick invisible
     * ghost links for mouse events (hover tooltip/highlight, click select). Links are D3-joined by ID
     * for efficient updates. Uses cached paths from convertLinks.
     * @param {Object} g - D3 selection of parent group
     * @param {Array} links - Array of link objects with id, coords, outside flag
     * @returns {CircularViewBB} This view instance for chaining
     */
    drawLinks(g, links) {
        const self = this;
        const crosslinks = this.model.get("clmsModel").getCrosslinks();
        //xilog ("clinks", crosslinks);
        const colourScheme = this.model.get("linkColourAssignment");

        const lineCopy = {}; // make cache as linkJoin and ghostLinkJoin will have same 'd' paths for the same link

        // draw thin links
        const thinLayer = this.addOrGetGroupLayer(g, "thinLayer");
        const linkJoin = thinLayer.selectAll(".circleLink").data(links, self.idFunc);
        //var hasNew = linkJoin.enter().size() > 0;
        linkJoin.exit().remove();
        linkJoin.enter()
            .append("path")
            .attr("class", "circleLink");
        linkJoin
            .attr("d", function (d) {
                const path = (d.outside ? self.outsideLine : self.line)(d.coords);
                lineCopy[d.id] = path;
                return path;
            })
            .style("stroke", function (d) {
                return colourScheme.getColour(crosslinks.get(d.id));
            })
            .classed("ambiguous", function (d) {
                return crosslinks.get(d.id).ambiguous;
            });

        // draw thick, invisible links (used for highlighting and mouse event capture)
        const ghostLayer = this.addOrGetGroupLayer(g, "ghostLayer");
        const ghostLinkJoin = ghostLayer.selectAll(".circleGhostLink").data(links, self.idFunc);

        ghostLinkJoin.exit().remove();
        ghostLinkJoin.enter()
            .append("path")
            .attr("class", "circleGhostLink")
            .on("mouseenter", function (d) {
                self.linkTip(d);
                self.model.setMarkedCrossLinks("highlights", [crosslinks.get(d.id)], true, false);
            })
            .on("mouseleave", function () {
                self.clearTip();
                self.model.setMarkedCrossLinks("highlights", [], false, false);
            })
            .on("click", function (d) {
                d3.event.stopPropagation(); // stop event getting picked up by backdrop listener which cancels all selections
                const add = d3.event.ctrlKey || d3.event.shiftKey;
                self.model.setMarkedCrossLinks("selection", [crosslinks.get(d.id)], false, add);
            });
        ghostLinkJoin
            .attr("d", function (d) {
                const path = lineCopy[d.id] || (d.outside ? self.outsideLine : self.line)(d.coords);
                return path;
            })
            .call(function () {
                self.showAccentOnTheseLinks.call(self, this, "selection");
            });
        return this;
    }

    /**
     * Handles node selection on click (or drag-end with no movement).
     * Selects links involving the protein and marks the protein itself as selected.
     * @param {Object} d - Node data object with id
     * @returns {CircularViewBB} This view instance for chaining
     */
    selectNode(d) {
        const add = d3.event.ctrlKey || d3.event.shiftKey;
        this.actionNodeLinks(d.id, "selection", add);
        const protein = this.model.get("clmsModel").getProtein(d.id);
        this.model.setSelectedProteins([protein], add);
        return this;
    }

    /**
     * Draws protein arcs as colored paths around circle.
     * Creates arc paths colored by protein color backbone-models, with mouse events for tooltips/highlights/selection.
     * If multiple proteins, enables drag behavior for manual reordering.
     * @param {Object} g - D3 selection of parent group
     * @param {Array} nodes - Array of node objects with id, start, end angles
     * @returns {CircularViewBB} This view instance for chaining
     */
    drawNodes(g, nodes) {
        const self = this;

        const multipleNodes = true; //this.filterProteins(this.backbone-models.get("clmsModel").getProteins()).length > 1;
        let colourScheme = this.model.get("proteinColourAssignment");
        if (colourScheme.id === "Default Protein") {
            colourScheme = this.replacementDefaultNodeColourModel;
        }
        const proteins = this.model.get("clmsModel").getProteinsMap();

        const nodeLayer = this.addOrGetGroupLayer(g, "nodeLayer");
        const nodeJoin = nodeLayer.selectAll(".circleNode").data(nodes, self.idFunc);

        nodeJoin.exit().remove();

        nodeJoin.enter()
            .append("path")
            .attr("class", "circleNode")
            .on("mouseenter", function (d) {
                self.nodeTip(d);
                self.actionNodeLinks(d.id, "highlights", false);
                const protein = self.model.get("clmsModel").getProtein(d.id);
                self.model.setHighlightedProteins([protein]);
            })
            .on("mouseleave", function () {
                self.clearTip();
                self.model.setHighlightedProteins([]);
                self.model.setMarkedCrossLinks("highlights", [], false, false);
            })
            .call(function (sel) {
                if (multipleNodes) {
                    sel.call(self.nodeDrag);
                }
            });
        nodeJoin
            .attr("d", this.arc)
            .style("fill", function (d) {
                return colourScheme.getColour(proteins.get(d.id));
            });
        this.showAccentOnTheseNodes(nodeJoin, "selection");

        return this;
    }

    /**
     * Draws tick marks and labels on protein arcs showing residue indices.
     * Calculates nice tick spacing, generates tick positions (1-indexed), positions radially,
     * and labels every Nth tick. First and last ticks always labeled, second-last tick label suppressed for aesthetics.
     * @param {Object} g - D3 selection of parent group
     * @param {Array} nodes - Array of node objects with id, start, end, size
     * @param {number} radius - Tick radius in pixels
     * @returns {CircularViewBB} This view instance for chaining
     */
    drawNodeTicks(g, nodes, radius) {
        const self = this;
        const tot = nodes.reduce(function (total, node) {
            return total + (node.size || 1);
        }, 0);

        const tickValGap = (tot / 360) * 5;
        const tickGap = niceRound(tickValGap);

        const groupTicks = function (d) {
            const k = (d.end - d.start) / (d.size || 1);
            const tRange = d3.range(0, d.size, tickGap);
            // make first tick at 1, not 0 (as protein indices are 1-based)
            tRange[0] = 1;
            // decide whether to add extra tick for last value (d.size) or replace last tick if close enough
            let tlen = tRange.length;
            const lastIndex = tlen - (d.size - tRange[tlen - 1] <= tickGap / 3 ? 1 : 0);
            tRange[lastIndex] = d.size;
            tlen = tRange.length;

            const labelCycle = self.options.tickLabelCycle;
            return tRange.map(function (v, i) {
                //xilog ("d.start", d);
                return {
                    angle: (((v - 1) + 0.5) * k) + d.start, // v-1 cos we want 1 to be at the zero pos angle, +0.5 cos we want it to be a tick in the middle
                    // show label every labelCycle'th tick starting with first.
                    // Exceptions: Show label for last tick. Don't show for second last tick (unless that tick is the first). It looks nicer.
                    label: (i % labelCycle && i < tlen - 1) || (i === tlen - 2 && i > 0) ? "" : v,
                };
            });
        };

        const tickLayer = this.addOrGetGroupLayer(g, "tickLayer");
        const groupTickJoin = tickLayer.selectAll("g.tickGroups")
            .data(nodes, self.idFunc);

        groupTickJoin.exit().remove();

        groupTickJoin.enter()
            .append("g")
            .attr("class", "tickGroups");


        const indTickJoin = groupTickJoin.selectAll("g.tick")
            .data(groupTicks);

        indTickJoin.exit().remove();

        const newTicks = indTickJoin.enter()
            .append("g")
            .attr("class", "tick");

        const llength = Math.min(this.options.tickWidth, 5);
        newTicks.append("line")
            .attr("x1", 1)
            .attr("y1", 0)
            .attr("x2", llength)
            .attr("y2", 0);

        newTicks.append("text")
            .attr("x", 8)
            .attr("y", 0)
            .attr("dy", ".35em");

        indTickJoin
            .attr("transform", function (d) {
                return "rotate(" + (d.angle - 90) + ")" + "translate(" + radius + ",0)";
            })
            .select("text")
            .text(function (d) {
                return d.label;
            })
            //.classed ("justifyTick", function(d) { return d.angle > 180; })   // must wait for inkscape/illustrator to catch up with css3 so have to use following code instead
            .attr("transform", function (d) {
                return d.angle > 180 ? "rotate(180) translate(-16 0)" : null;
            })
            .attr("text-anchor", function (d) {
                return d.angle > 180 ? "end" : null;
            });

        return this;
    }

    /**
     * Draws protein names as curved text along arcs.
     * Only draws names for proteins with ≥10° display arc. Creates curved paths in defs and textPath
     * references. Text positioned at arc midpoint, flipped for bottom half of circle for readability.
     * @param {Object} g - D3 selection of parent group
     * @param {Array} nodes - Array of node objects with id, name, start, end
     * @returns {CircularViewBB} This view instance for chaining
     */
    drawNodeText(g, nodes) {
        const self = this;

        const defs = d3.select(this.el).select("svg defs");
        const pathId = function (d) {
            return self.el.id + d.id;
        };

        // only add names to nodes with 10 degrees of display or more
        const tNodes = nodes.filter(function (d) {
            return (d.end - d.start) > 10;
        });

        const pathJoin = defs.selectAll("path").data(tNodes, self.idFunc);
        pathJoin.exit().remove();
        pathJoin.enter().append("path")
            .attr("id", pathId);
        pathJoin
            .attr("d", function (d) {
                let pathd = self.textArc(d);
                // xilog ("pathd", pathd);
                // only want one curve, not solid arc shape, so chop path string
                const cutoff = pathd.indexOf("L");
                if (cutoff >= 0) {
                    const midAng = (d.start + d.end) / 2;
                    // use second curve in arc for labels on bottom of circle to make sure text is left-to-right + chop off end 'Z',
                    // use first curve otherwise
                    pathd = (midAng > 90 && midAng < 270) ?
                        "M" + pathd.substring(cutoff + 1, pathd.length - 1) : pathd.substring(0, cutoff);
                }
                return pathd;
            });

        // add labels to layer, to ensure they 'float' above feature elements added directly to g
        const nodeLabelLayer = this.addOrGetGroupLayer(g, "nodeLabelLayer");
        const textJoin = nodeLabelLayer.selectAll("text.circularNodeLabel")
            .data(tNodes, self.idFunc);

        textJoin.exit().remove();
        textJoin.enter()
            .append("text")
            .attr("class", "circularNodeLabel")
            .attr("dy", "0.3em")
            .append("textPath")
            .attr("startOffset", "50%")
            .attr("xlink:href", function (d) {
                return "#" + pathId(d);
            });
        //.text (function(d) { return d.name.replace("_", " "); })

        // this lets names update for existing nodes
        textJoin.select("text textPath").text(function (d) {
            return d.name.replace("_", " ");
        });

        return this;
    }

    /**
     * Draws protein features as colored arc segments.
     * Sorts features largest first to avoid occlusion, colors by annotation type,
     * with mouse events for tooltips/highlights/selection of links within feature range.
     * @param {Object} g - D3 selection of parent group
     * @param {Array} features - Array of feature objects with id, category, type, nodeID, start, end, fstart, fend
     * @returns {CircularViewBB} This view instance for chaining
     */
    drawFeatures(g, features) {
        const self = this;

        // Sort so features are drawn biggest first, smallest last (trying to avoid small features being occluded)
        features.sort(function (a, b) {
            const diff = (b.end - b.start) - (a.end - a.start);
            return (diff < 0 ? -1 : (diff > 0 ? 1 : 0));
        });

        const featureLayer = this.addOrGetGroupLayer(g, "featureLayer");
        const featureJoin = featureLayer.selectAll(".circleFeature").data(features, self.idFunc);

        featureJoin.exit().remove();

        featureJoin.enter()
            .append("path")
            .attr("class", "circleFeature")
            .on("mouseenter", function (d) {
                self.featureTip(d);
                self.actionNodeLinks(d.nodeID, "highlights", false, d.fstart, d.fend);
            })
            .on("mouseleave", function () {
                self.clearTip();
                self.model.setMarkedCrossLinks("highlights", [], false, false);
            })
            .on("click", function (d) {
                d3.event.stopPropagation(); // stop event getting picked up by backdrop listener which cancels all selections
                const add = d3.event.ctrlKey || d3.event.shiftKey;
                self.actionNodeLinks(d.nodeID, "selection", add, d.fstart, d.fend);
            });

        //xilog ("FEATURES", features);

        const annotColl = this.model.get("annotationTypes");

        featureJoin
            .order()
            .attr("d", this.featureArc)
            .style("fill", function (d) {
                return annotColl.getColour(d.category, d.type);
            });

        return this;
    }

    /**
     * Draws single-letter amino acid codes at link ends (if few enough links).
     * Only draws if >30 pixels/link on average and showResLabels enabled. Gets residue types
     * from proteins, positions as rotated text at link endpoints.
     * @param {Object} g - D3 selection of parent group
     * @param {Array} links - Array of link objects with id, coords
     * @returns {CircularViewBB} This view instance for chaining
     */
    drawResidueLetters(g, links) {

        const circumference = this.resLabelArc.innerRadius()() * 2 * Math.PI;
        //xilog ("ff", this.resLabelArc, this.resLabelArc.innerRadius(), this.resLabelArc.innerRadius()(), circumference);
        if (circumference / links.length < 30 || !this.options.showResLabels) { // arbitrary cutoff decided by me (mjg)
            links = [];
        }

        const crosslinks = this.model.get("clmsModel").getCrosslinks();
        const resMap = d3.map();
        links.forEach(function (link) {
            const xlink = crosslinks.get(link.id);
            resMap.set(xlink.fromProtein.id + "-" + xlink.fromResidue, {
                polar: link.coords[0],
                res: getResidueType(xlink.fromProtein, xlink.fromResidue)
            });
            resMap.set(xlink.toProtein.id + "-" + xlink.toResidue, {
                polar: _.last(link.coords),
                res: getResidueType(xlink.toProtein, xlink.toResidue)
            });
        });
        const degToRad = Math.PI / 180;

        const letterLayer = this.addOrGetGroupLayer(g, "letterLayer");
        const resJoin = letterLayer.selectAll(".residueLetter").data(resMap.entries(), function (d) {
            return d.key;
        });

        resJoin.exit().remove();

        resJoin.enter()
            .append("text")
            .attr("class", "residueLetter")
            .text(function (d) {
                return d.value.res;
            });

        resJoin
            .attr("transform", function (d) {
                const polar = d.value.polar;
                const rang = (polar.ang - 90) * degToRad;
                const x = polar.rad * Math.cos(rang);
                const y = polar.rad * Math.sin(rang);
                const rot = (polar.ang < 90 || polar.ang > 270) ? polar.ang : polar.ang + 180;
                return "rotate (" + rot + " " + x + " " + y + ") translate(" + x + " " + y + ")";
            })
            .attr("dy", function (d) {
                const polar = d.value.polar;
                return (polar.ang < 90 || polar.ang > 270) ? "0.8em" : "-0.1em";
            });

        return this;
    }

    /**
     * Relayouts the circular view on resize or visibility change.
     * Only renders if dragEnd is true to avoid double renders when view becomes visible.
     * @param {Object} [descriptor] - Descriptor object with dragEnd flag
     * @returns {CircularViewBB} This view instance for chaining
     */
    relayout(descriptor) {
        if (descriptor && descriptor.dragEnd) { // avoids doing two renders when view is being made visible
            this.render();
        }
        return this;
    }

    /**
     * Generates string representation of current circular view options.
     * Returns abbreviated option names formatted for display/export filenames.
     * @returns {string} String representation of view configuration
     */
    optionsToString() {
        const abbvMap = {
            showResLabels: "RESLBLS",
            intraOutside: "SELFOUTER",
            showLinkless: "SHOWIFNOLINKS",
            showSelectedOnly: "SELONLY",
        };
        const fields = ["showResLabels", "showSelectedOnly"];
        if (this.model.get("clmsModel").targetProteinCount > 1) {
            fields.push("intraOutside", "showLinkLess", "sort");
        }

        const str = objectStateToAbbvString(this.options, fields, d3.set(), abbvMap);
        return str;
    }

    // removes view
    // not really needed unless we want to do something extra on top of the prototype remove function (like destroy c3 view just to be sure)
    remove() {
        super.remove(...arguments);
    }
}

CircularViewBB.prototype.identifier = "Circular View";

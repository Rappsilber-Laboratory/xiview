import "../../../css/xiNET.css";

import * as d3 from "d3";
// import * as _ from "underscore";
import Backbone from "backbone";
import * as cola from "webcola";

import {capture, makeXMLStr} from "../../svgexp";
import {filterStateToString, makeLegalFileName, searchesToString} from "../../utils";
import {download} from "../../downloads";

import {RenderedProtein} from "./interactor/rendered-protein";
import {RenderedCrosslink} from "./link/rendered-crosslink";
import {Group} from "./interactor/group";
import {P_PLink} from "./link/p_p-link";
import {G_GLink} from "./link/g_g-link";
import {ManualColourModel} from "../../backbone-models/color/protein-color-model";
import {linkColor} from "../../backbone-models/color/setup-colors";
import vent from "../../vent";
import {AUTO_GROUP_STRATEGIES} from "../../backbone-models/mixins/protein-group-manager-mixin";

/**
 * Main controller class for the xiNET crosslink network visualization.
 * Extends Backbone.View to provide an interactive SVG-based visualization of protein
 * crosslink networks. Handles layout, rendering, user interaction, and state management.
 *
 * Key Features:
 * - Interactive protein network visualization with force-directed layout (cola.js)
 * - Residue-level crosslink display
 * - Protein grouping and hierarchical organization
 * - Zoom, pan, and selection capabilities
 * - Export to SVG and layout saving/loading
 *
 * @extends Backbone.View
 */
export class CrosslinkViewer extends Backbone.View {

    // constructor(attributes, options) {
    //     super(_.extend(attributes, {
    //         events: {
    //         }
    //     }), options);
    // }

    /**
     * Initializes the CrosslinkViewer.
     * Sets up SVG elements, event listeners, layout groups, and the cola force-directed layout.
     * Creates context menus and initializes the backbone-models listeners.
     */
    initialize() {
        // this.debug = true;
        this.fixedSize = this.model.get("xinetFixedSize");
        this.cropLabels = this.model.get("xinetCropLabels");
        const self = this;

        function newCustomContextMenuSel(outerDivClass) {
            const contextMenuSel = d3.select(self.el)
                .append("div").classed("custom-menu-margin", true)
                .classed(outerDivClass, true);
            const menuUL = contextMenuSel.append("div").classed("custom-menu", true)
                .append("ul");
            contextMenuSel.node().onmouseover = function () {
                // self.contextMenuParticipant.highlighted = true; // todo - look at - change hidden proteins in backbone-models
                self.model.setHighlightedProteins(self.contextMenuParticipant.proteins);
            };
            contextMenuSel.node().onmouseout = function (evt) {
                let e = evt.toElement || evt.relatedTarget;
                do {
                    if (e === this) return;
                    if (e) e = e.parentNode; // seems like tab changing when uniprot opens can cause e to become null
                } while (e);
                if (self.contextMenuParticipant){
                    self.model.setHighlightedProteins([]); // todo - look at
                }
                self.contextMenuParticipant = null;
                d3.select(this).style("display", "none");
            };
            return menuUL;
        }

        this.contextMenuUlSel = newCustomContextMenuSel("xinet-context-menu");
        //create SVG element
        this.svgElement = d3.select(this.el).append("div").style("height", "100%").append("svg").node(); //document.createElementNS(CrosslinkViewer.svgns, "svg");
        this.svgElement.setAttribute("width", "100%");
        this.svgElement.setAttribute("height", "100%");
        this.svgElement.setAttribute("style", "pointer-events:visible");
        //add listeners

        this.svgElement.onmousedown = function (evt) {
            self.mouseDown(evt);
        };
        this.svgElement.onmousemove = function (evt) {
            self.mouseMove(evt);
        };
        this.svgElement.onmouseup = function (evt) {
            self.mouseUp(evt);
        };

        this.el.oncontextmenu = function (evt) {
            if (evt.preventDefault) { // necessary for addEventListener, works with traditional
                evt.preventDefault();
            }
            evt.returnValue = false; // necessary for attachEvent, works with traditional
            return false; // works with traditional, not with attachEvent or addEventListener
        };

        const mouseWheelEvt = (/Firefox/i.test(navigator.userAgent)) ? "DOMMouseScroll" : "mousewheel"; //FF doesn't recognize mousewheel as of FF3.x
        this.svgElement.addEventListener(mouseWheelEvt, function (evt) {
            self.mouseWheel(evt);
        }, false);

        this.lastMouseUp = new Date().getTime();

        // various SVG groups needed
        this.wrapper = document.createElementNS(CrosslinkViewer.svgns, "g"); //in effect, a hack for fact firefox doesn't support getCTM on svgElement
        const identM = this.svgElement.createSVGMatrix();
        const s = "matrix(" + identM.a + "," + identM.b + "," + identM.c + "," + identM.d + "," + identM.e + "," + identM.f + ")";
        this.wrapper.setAttribute("transform", s);
        this.container = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.container.setAttribute("id", "container");
        this.wrapper.appendChild(this.container);

        this.groupsSVG = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.groupsSVG.setAttribute("id", "groupsSVG");
        this.container.appendChild(this.groupsSVG);

        this.p_pLinksWide = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.p_pLinksWide.setAttribute("id", "p_pLinksWide");
        this.container.appendChild(this.p_pLinksWide);

        this.proteinLower = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.proteinLower.setAttribute("id", "proteinLower");
        this.container.appendChild(this.proteinLower);

        this.highlights = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.highlights.setAttribute("class", "highlights"); //proteins also contain highlight groups
        this.container.appendChild(this.highlights);

        this.res_resLinks = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.res_resLinks.setAttribute("id", "res_resLinks");
        this.container.appendChild(this.res_resLinks);

        this.p_pLinks = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.p_pLinks.setAttribute("id", "p_pLinks");
        this.container.appendChild(this.p_pLinks);

        this.proteinUpper = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.proteinUpper.setAttribute("id", "proteinUpper");
        this.container.appendChild(this.proteinUpper);

        this.svgElement.appendChild(this.wrapper);

        // this.debugRectSel = d3.select(this.proteinUpper).append("rect").attr("stroke", "green").attr("fill", "none").style("pointer-events", "none");
        // this.debugRectSel2 = d3.select(this.proteinUpper).append("rect").attr("stroke", "blue").attr("fill", "none").style("pointer-events", "none");

        //is a d3 selection unlike those above
        this.selectionRectSel = d3.select(this.svgElement).append("rect")
            .attr("x", 10)
            .attr("y", 10)
            .attr("width", 50)
            .attr("height", 100)
            .attr("stroke", "red")
            .attr("stroke-dasharray", "4,4")
            .attr("stroke-dashoffset", "32")
            .style("animation", "dash 2s linear infinite")
            .attr("fill", "none")
            .attr("display", "none");

        this.d3cola = cola.d3adaptor()
            .groupCompactness(1e-5)
            .avoidOverlaps(true);

        this.dragElement = null;
        this.dragStart = null;

        this.renderedProteins = new Map();
        this.renderedCrosslinks = new Map();
        this.renderedP_PLinks = new Map();
        // all xiNET.Groups in play
        this.groupMap = new Map();
        this.g_gLinks = new Map();
        this.toSelect = []; // used by right click drag
        this.z = 1;
        this.container.setAttribute("transform", "scale(1)");
        this.state = CrosslinkViewer.STATES.MOUSE_UP;

        this.firstRender = true;

        // benchmarking hook: a harness can define window.xinetDebug before the page loads to get at the
        // viewer and cola, and set skipFirstLayout to time layouts itself (e.g. to compare auto group strategies)
        if (window.xinetDebug) {
            window.xinetDebug.viewer = this;
            window.xinetDebug.cola = cola;
            window.xinetDebug.strategyNames = Object.keys(AUTO_GROUP_STRATEGIES);
        }

        // calculate default bar scale
        let maxSeqLength = 0;
        for (let protein of this.model.get("clmsModel").getProteinsIterator()) {
            if (protein.is_decoy === false && this.renderedProteins.has(protein.id) === false) {
                const newProtein = new RenderedProtein(protein, this);
                this.renderedProteins.set(protein.id, newProtein);

                const protSize = protein.size;
                if (protSize > maxSeqLength) {
                    maxSeqLength = protSize;
                }
            }
        }
        const width = this.svgElement.parentNode.clientWidth;
        const defaultPixPerRes = ((width * 0.8) - RenderedProtein.LABELMAXLENGTH) / maxSeqLength;

        // https://stackoverflow.com/questions/12141150/from-list-of-integers-get-number-closest-to-a-given-value/12141511#12141511
        function takeClosest(myList, myNumber) {
            const bisect = d3.bisector(function (d) {
                return d;
            }).left;
            const pos = bisect(myList, myNumber);
            if (pos === 0 || pos === 1) {
                return myList[1]; // don't return smallest scale as default
            }
            if (pos === myList.length) {
                return myList[myList.length - 1];
            }
            return myList[pos - 1];
        }

        this.defaultBarScale = takeClosest(CrosslinkViewer.barScales, defaultPixPerRes);

        // proteins' SVG is built when they're first displayed (see lazy-svg.js), in the form set here
        const expand = this.renderedProteins.size < 4;
        for (let rp of this.renderedProteins.values()) {
            if (!rp.stickZoom) {
                rp.stickZoom = this.defaultBarScale;
            }
            if (expand) {
                rp.toStickNoTransition();
            }
        }

        for (let crosslink of this.model.get("clmsModel").getCrosslinks().values()) {
            if (!crosslink.isDecoyLink() && !crosslink.isLinearLink()) {
                if (!this.renderedCrosslinks.has(crosslink.id)) {
                    const renderedCrossLink = new RenderedCrosslink(crosslink, this);
                    this.renderedCrosslinks.set(crosslink.id, renderedCrossLink);
                    const toId = crosslink.toProtein ? crosslink.toProtein.id : "null";
                    const p_pId = crosslink.fromProtein.id + "-" + toId;
                    let p_pLink = this.renderedP_PLinks.get(p_pId);
                    if (typeof p_pLink == "undefined") {
                        p_pLink = new P_PLink(p_pId, crosslink, this);
                        this.renderedP_PLinks.set(p_pId, p_pLink);
                    }
                    p_pLink.crosslinks.push(crosslink);

                    crosslink.p_pLink = p_pLink;
                }
            }
        }

        this.listenTo(this.model, "filteringDone", this.render);
        this.listenTo(this.model, "hiddenChanged", this.hiddenProteinsChanged);
        this.listenTo(this.model, "change:groups", this.groupsChanged);
        this.listenTo(this.model, "change:highlights", this.highlightedLinksChanged);
        this.listenTo(this.model, "change:selection", this.selectedLinksChanged);

        this.listenTo(this.model, "change:linkColourAssignment currentColourModelChanged", this.render);
        this.listenTo(this.model, "change:proteinColourAssignment currentProteinColourModelChanged", this.proteinColoursUpdated);

        this.listenTo(this.model.get("annotationTypes"), "change:shown", this.setAnnotations);
        this.listenTo(this.model.get("alignColl"), "bulkAlignChange", this.setAnnotations);
        this.listenTo(this.model, "change:selectedProteins", this.selectedProteinsChanged);
        this.listenTo(this.model, "change:highlightedProteins", this.highlightedProteinsChanged);

        this.listenTo(vent, "proteinMetadataUpdated", this.proteinMetadataUpdated);

        this.listenTo(vent, "xinetSvgDownload", this.downloadSVG);
        this.listenTo(vent, "xinetAutoLayout", this.autoLayout);
        this.listenTo(vent, "xinetLoadLayout", this.loadLayout);
        this.listenTo(vent, "xinetSaveLayout", this.saveLayout);

        this.listenTo(vent, "collapseGroups", this.collapseGroups);
        this.listenTo(vent, "expandGroups", this.expandGroups);

        this.listenTo(this.model, "change:xinetShowLabels", this.showLabels);
        this.listenTo(this.model, "change:xinetFixedSize", this.setFixedSize);
        this.listenTo(this.model, "change:xinetCropLabels", this.setCropLabels);
        this.listenTo(this.model, "change:xinetThickLinks", this.render);
        this.listenTo(this.model, "change:xinetPpiSteps", this.render);

        return this;
    }

    expandProtein() {
        d3.select(".xinet-context-menu").style("display", "none");
        this.contextMenuParticipant.setExpanded(true);
        this.render();
        this.contextMenuParticipant = null;
    }

    collapseInteractor() {
        d3.select(".xinet-context-menu").style("display", "none");
        this.model.setHighlightedProteins([]);
        this.contextMenuParticipant.setExpanded(false, this.contextMenuPoint);
        // if (this.contextMenuParticipant.type === "group") {
        //     this.render();
        // }
        //this.hiddenProteinsChanged(); //REINSTATE?
        //this.render();
        this.contextMenuParticipant = null;
    }

    cantCollapseGroup() {
        // d3.select(".custom-menu-margin").style("display", "none");
        // d3.select(".group-custom-menu-margin").style("display", "none");
    }

    ungroup() {
        d3.select(".xinet-context-menu").style("display", "none");
        this.model.setHighlightedProteins([]);
        this.model.get("groups").delete(this.contextMenuParticipant.id);
        this.model.trigger("change:groups");
        this.contextMenuParticipant = null;
    }

    collapseGroups() {
        for (let group of this.groupMap.values()) {
            if (group.expanded === true && !group.isOverlappingGroup()) {
                // group.setExpanded(false);
                group.collapse(null, false);
            }
        }
        this.hiddenProteinsChanged();
        this.render();
    }

    expandGroups() {
        for (let group of this.groupMap.values()) {
            if (group.expanded === false) {
                // group.setExpanded(true);
                group.expand(false);// todo: reanme this to expandNoTransition
            }
        }
        this.hiddenProteinsChanged();
        this.render();
    }

    groupsChanged() {
        console.log("xiNET GROUPS CHANGED");
        this.d3cola.stop();

        // a Map with group id as key and Set of protein ids to group as value
        const modelGroups = this.model.get("groups");

        //clear out old groups -- https://stackoverflow.com/questions/9882284/looping-through-array-and-removing-items-without-breaking-for-loop
        const groupIdsToRemove = [];
        for (let group of this.groupMap.values()) {
            if (!modelGroups.has(group.id)) {
                groupIdsToRemove.push(group.id);

                group.parentGroups = new Set();//[]; //don't think necessary but just in case
                group.subroups = [];
                for (let rp of group.renderedProteins) {
                    rp.parentGroups.delete(group);
                }

                if (group.expanded) {
                    this.groupsSVG.removeChild(group.upperGroup);
                } else {
                    this.proteinUpper.removeChild(group.upperGroup);
                }
            }
        }
        for (let rgId of groupIdsToRemove) {
            this.groupMap.delete(rgId);
        }

        for (let g of modelGroups.entries()) {
            if (!this.groupMap.has(g[0])) { //if group doesn't exist
                const group = new Group(g[0], g[1], this);
                group.init();
                this.groupMap.set(group.id, group);
            } else { // group already exists but the proteins in it may have changed
                const group = this.groupMap.get(g[0]);
                group.renderedProteins = [];
                for (let pId of g[1]) {
                    const p = this.renderedProteins.get(pId);
                    if (p) { // no decoys in this.renderedProteins
                        group.renderedProteins.push(this.renderedProteins.get(pId));
                    }
                }
            }
        }
        this.scale();//just to update groups selection highlights
        this.hiddenProteinsChanged();
        this.render();
    }

    // handle changes to manually hidden proteins,
    // but also deal with stuff to do with groups / group hierarchy
    // specifically subgroups could change as result of things being hidden so this is here
    // (i.e. overlapping group becomes subgroup)
    hiddenProteinsChanged() {
        console.log("xiNET HIDDEN PROTEINS CHANGED");
        this.d3cola.stop();

        //clear parent groups of all proteins
        for (let rp of this.renderedProteins.values()) {
            rp.parentGroups = new Set();//[];
        }

        // parent groups may change, so clear groups
        for (let g of this.groupMap.values()) {
            g.subgroups = []; // subgroups as xiNET.Groups
            g.parentGroups = new Set();
            g.leaves = []; // different from g.renderedProteins coz only contains ungrouped RenderedProteins, used by cola.js
            g.groups = []; // indexes of subgroups in resulting groupArr, used by cola.js // needed? prob not coz groups already referred to by index

            for (let rp of g.renderedProteins) {
                rp.parentGroups.delete(g); // sometimes it won't have contained g as parentGroup
            }
        }

        //sort it by count not hidden (not manually hidden and not filtered)
        const sortedGroupMap = new Map([...this.groupMap.entries()].sort((a, b) => a[1].unhiddenProteinCount - b[1].unhiddenProteinCount));

        // get maximal set of possible subgroups
        const groups = Array.from(sortedGroupMap.values());
        const gCount = groups.length; // contains xiNET.Groups
        for (let gi = 0; gi < gCount - 1; gi++) {
            const group1 = groups[gi];
            if (group1.unhiddenProteinCount > 0) {
                for (let gj = gi + 1; gj < gCount; gj++) {
                    const group2 = groups[gj];
                    if (group1.isSubsetOf(group2)) {
                        group2.subgroups.push(group1);
                    }
                }
            }
        }

        for (let g of groups) {
            for (let rp of g.renderedProteins) {
                rp.parentGroups.add(g);
            }
        }

        //sort out parentGroups
        for (let group1 of groups.reverse()) {
            if (group1.upperGroup.parentNode) {
                // z-ordering (?)
                const pn = group1.upperGroup.parentNode;
                pn.removeChild(group1.upperGroup);
                pn.appendChild(group1.upperGroup);
            }
            for (let group2 of group1.subgroups) {
                group2.parentGroups.add(group1);
            }
        }

        let manuallyHidden = 0;
        for (let renderedParticipant of this.renderedProteins.values()) {
            if (renderedParticipant.protein.manuallyHidden === true) {
                manuallyHidden++;
            }
            if (renderedParticipant.inCollapsedGroup() === false) {
                renderedParticipant.setHidden(renderedParticipant.protein.hidden);
            } else {
                renderedParticipant.setHidden(true);
            }
        }

        if (manuallyHidden === 0) {
            d3.select("#hiddenProteinsMessage").style("display", "none");
        } else {
            const pSel = d3.select("#hiddenProteinsText");
            pSel.text((manuallyHidden > 1) ? (manuallyHidden + " Hidden Proteins") : (manuallyHidden + " Hidden Protein"));
            const messageSel = d3.select("#hiddenProteinsMessage");
            messageSel.style("display", "block");
        }


        // overlapping groups can't be drawn collapsed, so force them open. expand() calls back into
        // hiddenProteinsChanged(); the flag stops that nested pass from starting its own forced
        // expansions, which previously cascaded one level deeper per group.
        if (!this._forcingOverlapExpansion) {
            const overlapping = groups.filter(g => !g.expanded && g.isOverlappingGroup());
            if (overlapping.length) {
                this._forcingOverlapExpansion = true;
                try {
                    for (let group of overlapping) {
                        group.setExpanded(true);
                    }
                } finally {
                    this._forcingOverlapExpansion = false;
                }
            }
        }
        // smallest first (groups was reversed above), so subgroups are fitted before the groups containing them
        // and each group is refitted once, rather than every refit also refitting all of its parents
        for (let group of groups.slice().reverse()) {
            let hasVisible = false;
            for (let p of group.renderedProteins) {
                if (p.protein.hidden === false) {
                    hasVisible = true;
                }
            }
            if (!hasVisible || group.inCollapsedGroup()) {
                group.setHidden(true);
            } else {
                group.setHidden(false);
                group.updateCountLabel();
                if (group.expanded) {
                    group.updateExpandedGroup(false);
                } else {
                    group.setPosition(group.ix, group.iy, false);
                }
            }
        }


        this.subgraphs = [];

        for (let interactor of this.renderedProteins.values()) {
            interactor.subgraph = null;
        }
        for (let interactor of this.groupMap.values()) {
            interactor.subgraph = null;
        }

        for (let interactor of this.renderedProteins.values()) {
            if (!interactor.hidden) {
                interactor.getSubgraph();//adds new subgraphs to this.subgraphs
            }
        }
        for (let interactor of this.groupMap.values()) {
            if (!interactor.hidden) {
                interactor.getSubgraph();//adds new subgraphs to this.subgraphs
            }
        }

        this.subgraphs.sort(function (a, b) {
            return b.nodes.size - a.nodes.size;
        });


        //Sort subgraphs into linear and non-linear sets
        this.linearGraphs = [];
        this.nonLinearGraphs = [];
        // a member of an expanded group resolves to itself (getRenderedInteractor), so it would
        // otherwise pass as linear and get gridded — but it's laid out by cola within its expanded
        // group (as one of the group's leaves), so it must be in a non-linear graph.
        const isInsideExpandedGroup = function (node) {
            for (let pg of node.parentGroups) {
                if (pg.expanded && !pg.hidden) {
                    return true;
                }
            }
            return false;
        };
        for (let graph of this.subgraphs) {
            // const nodes = graph.nodes.values();
            const nodeCount = graph.nodes.size;
            let isLinear = true;
            if (nodeCount === 1) {
                // unlinked node - gridded unless it belongs inside an expanded group
                isLinear = !isInsideExpandedGroup(graph.nodes.values().next().value);
            } else {
                var endFound = false;
                for (let node of graph.nodes.values()) {
                    const externalLinkCount = node.countExternalLinks();
                    // console.log("ELC*: " + externalLinkCount);
                    if (node.expanded === true || isInsideExpandedGroup(node)) {
                        isLinear = false;
                        break;
                    }
                    if (externalLinkCount > 2) {
                        isLinear = false;
                        break;
                    } else if (externalLinkCount < 2) {
                        endFound = true;
                    }
                }
                //check not circular
                if (!endFound) {
                    isLinear = false;
                }
            }
            if (isLinear === true) {
                this.linearGraphs.push(graph);
            } else {
                this.nonLinearGraphs.push(graph);
            }
        }

        return this;
    }

    /**
     * Renders the crosslink network visualization.
     * Updates all links and proteins based on current filter state.
     * On first render, initializes the automatic layout.
     * Updates link colors, widths, and visibility based on filtered crosslinks.
     *
     * @returns {CrosslinkViewer} Returns this for method chaining
     */
    render() {
        console.log("xiNET RENDER");
        this.d3cola.stop();
        if (this.firstRender) { // first render
            this.firstRender = false;
            const savedConfig = this.model.get("savedConfig");
            if (window.xinetDebug && window.xinetDebug.skipFirstLayout) {
                console.log("xiNET: first layout skipped (xinetDebug.skipFirstLayout)");
            } else if (savedConfig && savedConfig.config && savedConfig.config.layout) {
                this.loadLayout(savedConfig.config.layout);
            } else if (this.countColaNodes() > CrosslinkViewer.LARGE_NETWORK_COLA_NODES) {
                this.deferFirstLayout(); // too big for cola as is - group and collapse first
            } else {
                this.autoLayout([]); //layout all
            }
            if (!this.svgOnHold) {
                this.buildVisibleProteinSVG(); // held back until now (see svgOnHold)
            }
        }

        for (let ppLink of this.renderedP_PLinks.values()) {


            ppLink.hd = false;
            const filteredCrossLinks = new Set();
            const filteredMatches = new Set();
            // const altP_PLinks = new Set();
            ppLink.ambiguous = true;
            for (let crosslink of ppLink.crosslinks) {
                if (crosslink.filteredMatches_pp.length > 0) {
                    filteredCrossLinks.add(crosslink.id);
                    for (let m of crosslink.filteredMatches_pp) {
                        const match = m.match; // oh dear, this...
                        filteredMatches.add(match.id);
                        if (match.hd === true) {
                            ppLink.hd = true;
                        }
                        if (match.crosslinks.length == 1) {
                            // for (let matchCrossLink of match.crosslinks) {
                            //     if (!matchCrossLink.isDecoyLink()) {
                            //         altP_PLinks.add(matchCrossLink.p_pLink.id);
                            //     }
                            // }
                            ppLink.ambiguous = false;
                        }
                    }
                }
            }
            ppLink.filteredMatchCount = filteredMatches.size;
            ppLink.filteredCrossLinkCount = filteredCrossLinks.size;
            // ppLink.ambiguous = altP_PLinks.size > 1;

            if (!ppLink.renderedToProtein || // not linear
                //or either end hidden
                ppLink.renderedFromProtein.protein.hidden ||
                ppLink.renderedToProtein.protein.hidden) {
                ppLink.hide();
            } else {
                const fromProtInCollapsedGroup = ppLink.renderedFromProtein.inCollapsedGroup();
                const toProtInCollapsedGroup = ppLink.renderedToProtein.inCollapsedGroup();

                // if (// or is self link in collapsed group
                //     (ppLink.crosslinks[0].isSelfLink() && fromProtInCollapsedGroup) ||
                //     // or either end is expanded to bar and not in collapsed group
                //     (ppLink.renderedFromProtein.expanded && !fromProtInCollapsedGroup) ||
                //     (ppLink.renderedToProtein.expanded && !toProtInCollapsedGroup) ||
                //     (fromProtInCollapsedGroup && toProtInCollapsedGroup)
                // ) {
                //     ppLink.hide();
                // }
                // else {
                if (ppLink.filteredCrossLinkCount === 0) {
                    ppLink.hide();
                } else {
                    // ppLink.ambiguous = altP_PLinks.size > 1;
                    if (fromProtInCollapsedGroup && toProtInCollapsedGroup) {
                        const source = ppLink.renderedFromProtein.getRenderedInteractor();
                        const target = ppLink.renderedToProtein.getRenderedInteractor();
                        let ggId;
                        if (source.id < target.id) {
                            ggId = source.id + "_" + target.id;
                        } else {
                            ggId = target.id + "_" + source.id;
                        }
                        let ggLink = ppLink.controller.g_gLinks.get(ggId);
                        if (!ggLink) {
                            if (source.id < target.id) {
                                ggLink = new G_GLink(ggId, source, target, this);
                            } else {
                                ggLink = new G_GLink(ggId, target, source, this);
                            }
                            this.g_gLinks.set(ggId, ggLink);
                        }
                        ggLink.p_pLinks.set(ppLink.id, ppLink);
                        ppLink.hide();
                    } else {
                        // ppLink.show();
                        if (// or is self link in collapsed group
                            (ppLink.crosslinks[0].isSelfLink() && fromProtInCollapsedGroup) ||
                            // or either end is expanded to bar and not in collapsed group
                            (ppLink.renderedFromProtein.expanded && !fromProtInCollapsedGroup) ||
                            (ppLink.renderedToProtein.expanded && !toProtInCollapsedGroup) ||
                            (fromProtInCollapsedGroup && toProtInCollapsedGroup)
                        ) {
                            ppLink.hide();
                        } else {
                            ppLink.show();
                        }
                    }
                }
                // }
            }
        }
        for (let cLink of this.renderedCrosslinks.values()) {
            cLink.check();
        }
        const ggLinkIdsToRemove = [];
        for (let ggLink of this.g_gLinks.values()) {
            if ( //true
                ggLink.group1.expanded === false && ggLink.group2.expanded === false
                && ggLink.check()
                && this.groupMap.has(ggLink.group1.id) && this.groupMap.has(ggLink.group2.id)
                && !(ggLink.group1.inCollapsedGroup() || ggLink.group2.inCollapsedGroup())
            ) {
                ggLink.show();
                //set line coord?
            } else {
                ggLinkIdsToRemove.push(ggLink.id);
                ggLink.remove();
            }
        }
        for (let id of ggLinkIdsToRemove) {
            this.g_gLinks.delete(id);
        }
    }

    /**
     * Uses the cola.js library to position proteins based on their connections.
     *
     * @param {Array} fixedParticipants - Array of proteins to keep in fixed positions
     */
    autoLayout(fixedParticipants) {
        console.log("xiNET AUTO LAYOUT");
        this.cancelDeferredFirstLayout(); // e.g. user pressed Auto Layout while we were waiting for UniProt
        this.d3cola.stop();
        if (fixedParticipants.length === 0) {
            this.container.setAttribute("transform", "scale(" + 1 + ")");// translate(" + ((width / scaleFactor) - bbox.width - bbox.x) + " " + -bbox.y + ")");
            this.scale();
        }

        const linkLength = (this.renderedProteins.size < 20) ? 40 : 30;
        const width = this.svgElement.parentNode.clientWidth;
        const height = this.svgElement.parentNode.clientHeight;

        const tempGroupMap = new Map (this.groupMap);

        //Grid layout linear graphs
        var column = 0, row = 0;
        if (this.linearGraphs.length > 0) {
            column++;
            for (let graph of this.linearGraphs) {
                // todo - this is a right mess, fixing can wait til i'm back from holiday
                var nodes = Array.from(graph.nodes.keys()); //
                var nodeCount = nodes.length;
                if (nodeCount > 2) {
                    nodes = this.reorderedNodes(graph);
                }
                nodeCount = nodes.length;
                for (var n = 0; n < nodeCount; n++) {
                    var p = this.renderedProteins.get(nodes[n]);
                    if (!p) {
                        p = this.groupMap.get(nodes[n]);
                        tempGroupMap.delete(nodes[n]);
                    }
                    for (let pg of p.parentGroups.values()) {
                        tempGroupMap.delete(pg.id);
                    }
                    var x, y;
                    row++;
                    x = this.xForColumn(column);
                    y = this.yForRow(row);
                    var lastNodeY = this.yForRow(row + (nodeCount - 1 - n));
                    let lowerBound = height;
                    if ((lastNodeY + 20) > lowerBound) {
                        column++;
                        row = 1;
                        x = this.xForColumn(column);
                        y = this.yForRow(row);
                    }
                    // console.log("??", p.id, column, row);
                    p.setPosition(x, y);
                    p.setAllLinkCoordinates();
                }
            }
        }
        //remember edge of gridded proteins
        const layoutXOffset = this.xForColumn(column + 1);

        for (let renderedProtein of this.renderedProteins.values()) {
            if (fixedParticipants.length === 0) {
                delete renderedProtein.x;
                delete renderedProtein.y;
                delete renderedProtein.px;
                delete renderedProtein.py;
            }
            renderedProtein.fixed = fixedParticipants.indexOf(renderedProtein.protein) !== -1;
            delete renderedProtein.index;
        }
        for (let g of this.groupMap.values()) {
            if (fixedParticipants.length === 0) { // todo - some issues here (select a collapsed group and select fixed selected)
                delete g.x;
                delete g.y;
                delete g.px;
                delete g.py;
            }
            delete g.index;
            delete g.parent;
            g.leaves = []; // clear this, it's used by cola, gets filled by auto
        }

        this.d3cola.size([width - layoutXOffset - 120, height - 60]).symmetricDiffLinkLengths(linkLength);

        const {nodes: nodeArr, links: linkArr, leaves} = this.getColaGraph();
        const groups = this.getColaGroups(nodeArr, this.groupMap.values());
        // scale cola's layout to fill the space right of the gridded linear graphs
        const place = function (colaNodes) {
            let x1 = null, y1 = null, x2 = null, y2 = null;
            for (let node of colaNodes) {
                if (!x1 || node.x < x1) {
                    x1 = node.x;
                }
                if (!y1 || node.y < y1) {
                    y1 = node.y;
                }
                if (!x2 || node.x > x2) {
                    x2 = node.x;
                }
                if (!y2 || node.y > y2) {
                    y2 = node.y;
                }
            }

            let xr = (width - layoutXOffset - 120) / (x2 - x1);
            let yr = ((height - 60) / (y2 - y1));

            for (let node of colaNodes) {
                node.setPositionFromCola((node.x * xr) - (x1 * xr) + layoutXOffset,
                    (node.y * yr) - (y1 * yr) + 30);
                node.setAllLinkCoordinates();
            }
        };
        this.runCola(nodeArr, linkArr, leaves, groups, place, groups, () => {
            if (fixedParticipants.length === 0) {
                this.zoomToFullExtent();
            }
        });
    }

    /**
     * Lays out the visible contents of an expanded group - its proteins, collapsed subgroups and nested expanded
     * subgroups - with cola, centred on where the group is now. Nothing outside the group moves (its links to
     * the outside are left out of the layout); groups containing it are refitted round the result.
     * Cola's positions are used at their natural size (one cola unit is one pixel on screen, like the glyphs
     * cola keeps from overlapping), rather than stretched to fill the view as autoLayout does.
     *
     * @param {Group} group - An expanded group
     */
    autoLayoutGroup(group) {
        console.log("xiNET AUTO LAYOUT GROUP", group.id);
        this.cancelDeferredFirstLayout();
        this.d3cola.stop();

        const {nodes, links, leaves} = this.getColaGraph(group);
        if (nodes.length === 0) {
            return;
        }
        // centre of the group's contents now
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        for (let node of nodes) {
            x1 = Math.min(x1, node.ix);
            y1 = Math.min(y1, node.iy);
            x2 = Math.max(x2, node.ix);
            y2 = Math.max(y2, node.iy);
        }
        const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;

        // start the group's contents afresh; nothing else is handed to cola so nothing else is touched
        for (let node of nodes) {
            delete node.x;
            delete node.y;
            delete node.px;
            delete node.py;
            delete node.index;
            delete node.parent; // else cola leaves it out of its root group (see cola's groups())
            node.fixed = false; // the protein Fix Selected option of the last autoLayout doesn't apply here
        }
        const candidateGroups = [group].concat(group.subgroups);
        for (let g of candidateGroups) {
            delete g.parent;
        }
        const groups = this.getColaGroups(nodes, candidateGroups);

        // expanded groups the layout changes the size of, besides the cola groups (and the groups containing
        // them, which updateExpandedGroup refits): groups overlapping this one
        const refitGroups = new Set(groups);
        for (let node of nodes) {
            for (let pg of node.parentGroups) {
                if (pg.expanded && !pg.hidden && pg !== group && !group.parentGroups.has(pg)) {
                    refitGroups.add(pg);
                }
            }
        }

        const width = this.svgElement.parentNode.clientWidth;
        const height = this.svgElement.parentNode.clientHeight;
        const linkLength = (nodes.length < 20) ? 40 : 30;
        this.d3cola.size([width, height]).symmetricDiffLinkLengths(linkLength);

        const z = this.z;
        const place = function (colaNodes) {
            let mx1 = Infinity, my1 = Infinity, mx2 = -Infinity, my2 = -Infinity;
            for (let node of colaNodes) {
                mx1 = Math.min(mx1, node.x);
                my1 = Math.min(my1, node.y);
                mx2 = Math.max(mx2, node.x);
                my2 = Math.max(my2, node.y);
            }
            const mx = (mx1 + mx2) / 2, my = (my1 + my2) / 2;
            for (let node of colaNodes) {
                node.setPositionFromCola(cx + (node.x - mx) * z, cy + (node.y - my) * z);
                node.setAllLinkCoordinates();
            }
        };
        this.runCola(nodes, links, leaves, groups, place, refitGroups);
    }

    /**
     * The expanded groups to hand to cola, from candidateGroups, with their leaves (indexes of their proteins
     * in nodes that aren't in a subgroup, and their collapsed subgroups) and groups (their expanded subgroups,
     * innermost only) filled in.
     *
     * @param {Object[]} nodes - Cola's nodes (from getColaGraph)
     * @param {Iterable<Group>} candidateGroups - Groups to consider; must include the subgroups of each
     * @returns {Group[]}
     */
    getColaGroups(nodes, candidateGroups) {
        const groups = [];
        for (let g of candidateGroups) {
            delete g.index;
            if (!g.hidden && g.expanded) {
                g.groups = [];
                g.leaves = [];
                // put any rp not contained in a subgroup in group1.leaves
                for (let rp of g.renderedProteins) {
                    if (!rp.hidden) {
                        let inSubGroup = false;
                        for (let subgroup of g.subgroups) {
                            if (subgroup.contains(rp)) {
                                inSubGroup = true;
                                break;
                            }
                        }
                        if (!inSubGroup) {
                            const nodeIndex = nodes.indexOf(rp);
                            if (nodeIndex !== -1) {
                                g.leaves.push(nodeIndex);
                            } else {
                                console.warn("xiNET layout: group member not in layout nodes", g.id, rp.id);
                            }
                        }
                    }
                }
                groups.push(g);
            }
        }
        //need to use indexes of groups
        for (let g of groups) {
            console.log("GROUP ", g.unhiddenProteinCount, g.id);
            for (let i = 0; i < g.subgroups.length; i++) {
                console.log("\tSUBGROUP ", g.subgroups[i].unhiddenProteinCount, g.subgroups[i].id);
                if (!g.subgroups[i].hidden) {
                    // todo - this is where you need to sort out issue of nested subgroups...
                    // the problem is when the same subgroup gets added to multiple parent groups
                    // the following seems to be working but not convinced it's totally reliable (depends on order groups end up in?)
                    let isSubset = false;
                    for (let j = i + 1; j < g.subgroups.length; j++) {
                        if (g.subgroups[i].isSubsetOf(g.subgroups[j])) {
                            isSubset = true;
                            break;
                        }
                    }
                    if (!isSubset) {
                        if (g.subgroups[i].expanded) {
                            g.groups.push(groups.indexOf(g.subgroups[i]));

                        } else if (nodes.indexOf(g.subgroups[i]) !== -1) {
                            g.leaves.push(g.subgroups[i]);
                        } else {
                            console.warn("xiNET layout: collapsed subgroup not in layout nodes", g.id, g.subgroups[i].id);
                        }
                    }
                }
            }
        }
        return groups;
    }

    /**
     * Runs cola on a graph from getColaGraph and groups from getColaGroups: briefly without groups first, which
     * warm-starts the grouped layout, then with groups, which keeps running. Each tick, place(nodes) turns cola's
     * positions into xiNET ones, the one-link leaves are placed next to their anchors and refitGroups refitted.
     *
     * @param {Object[]} nodes
     * @param {{source: Object, target: Object}[]} links
     * @param {{node: Object, anchor: Object}[]} leaves
     * @param {Group[]} groups
     * @param {function(Object[])} place - Sets the xiNET positions of the nodes from their cola ones
     * @param {Iterable<Group>} refitGroups - Expanded groups to refit after each tick
     * @param {function()} [afterTick]
     */
    runCola(nodes, links, leaves, groups, place, refitGroups, afterTick) {
        const self = this;
        //don't know how necessary these deletions are
        const resetCola = function () {
            delete self.d3cola._lastStress;
            delete self.d3cola._alpha;
            delete self.d3cola._descent;
            delete self.d3cola._rootGroup;
        };

        // Run the layout briefly without groups first; this warm-starts the grouped
        // layout below. The grouped run uses start(0, ...) so cola's group-aware
        // initialLayout is a no-op and these settled node positions are retained.
        resetCola();
        self.d3cola.nodes(nodes).links(links);
        const initialUnconstrainedIterations = nodes.length < 10 ? 10 : 23;
        self.d3cola.groups([]).start(initialUnconstrainedIterations, 10, 1, 0, false);

        resetCola();
        let participantDebugSel, groupDebugSel;
        if (self.debug) {
            participantDebugSel = d3.select(self.groupsSVG).selectAll(".node")
                .data(nodes);
            participantDebugSel.enter().append("rect")
                .classed("node", true)
                .attr({
                    rx: 5,
                    ry: 5
                })
                .style("stroke", "red")
                .style("fill", "none")
                .style("pointer-events", "none");
            groupDebugSel = d3.select(self.groupsSVG).selectAll(".group")
                .data(groups);
            groupDebugSel.enter().append("rect")
                .classed("group", true)
                .attr({
                    rx: 5,
                    ry: 5
                })
                .style("stroke", "blue")
                .style("fill", "none")
                .style("pointer-events", "none");
            groupDebugSel.exit().remove();
            participantDebugSel.exit().remove();
        }
        self.d3cola.nodes(nodes).groups(groups).links(links).start(0, 10, 1, 0, true).on("tick", function () { // start(0, ...) keeps the groups-free pre-run positions
            place(self.d3cola.nodes());
            self.placeLeaves(leaves, links);
            for (let g of refitGroups) { // todo -  seems a bit of a weird way to have done this?
                if (g.expanded) {
                    g.updateExpandedGroup();
                }
            }
            if (afterTick) {
                afterTick();
            }

            if (self.debug) {
                groupDebugSel.attr({
                    x: function (d) {
                        return d.bounds.x;
                    },
                    y: function (d) {
                        return d.bounds.y;
                    },
                    width: function (d) {
                        return d.bounds.width();
                    },
                    height: function (d) {
                        return d.bounds.height();
                    }
                });
                participantDebugSel.attr({
                    x: function (d) {
                        return d.bounds.x;
                    },
                    y: function (d) {
                        return d.bounds.y;
                    },
                    width: function (d) {
                        return d.bounds.width();
                    },
                    height: function (d) {
                        return d.bounds.height();
                    }
                });
            }
        });
    }

    /**
     * The graph autoLayout hands to cola: proteins / collapsed groups in non-linear subgraphs (linear ones
     * are gridded instead) and one link per linked pair of them. Expanded groups are cola groups, not nodes.
     * With PLACE_ONE_LINK_NODES, nodes with a single link to a node that has more are left out (as `leaves`)
     * and placed next to that node after each layout tick instead (see placeLeaves), which shrinks the layout a
     * lot on large sparse networks. Fixed nodes and nodes inside an expanded group stay in the layout.
     * @param {Group} [scope] - An expanded group: only take the nodes inside it, and the links between them
     * @returns {{nodes: Object[], links: {source: Object, target: Object, id: string}[],
     *     leaves: {node: Object, anchor: Object}[]}}
     */
    getColaGraph(scope) {
        const inScope = node => !scope || node.parentGroups.has(scope);
        const links = new Map();
        const nodeSet = new Set();
        for (let graph of this.nonLinearGraphs || []) {
            for (let link of graph.links.values()) {
                // structural self-link test (see countExternalLinks): crosslinks[0] is
                // unreliable for ambiguous links bundling several crosslinks.
                if (link.renderedFromProtein !== link.renderedToProtein) {
                    const source = this.renderedProteins.get(link.renderedFromProtein.protein.id).getRenderedInteractor();
                    const target = this.renderedProteins.get(link.renderedToProtein.protein.id).getRenderedInteractor();
                    if (!inScope(source) || !inScope(target)) {
                        continue;
                    }
                    nodeSet.add(source);
                    nodeSet.add(target);
                    // one link per pair of interactors - proteins in the same collapsed group give no link,
                    // and many protein pairs between two collapsed groups give one
                    const linkId = source.id < target.id ? source.id + "-" + target.id : target.id + "-" + source.id;
                    if (source !== target && !links.has(linkId)) {
                        links.set(linkId, {source: source, target: target, id: linkId});
                    }
                }
            }
        }
        // nodes with no links in a non-linear graph (e.g. unlinked members of an expanded group)
        // still need to be cola nodes; expanded groups themselves are cola groups, not nodes
        for (let graph of this.nonLinearGraphs || []) {
            for (let node of graph.nodes.values()) {
                if (!(node.type === "group" && node.expanded) && inScope(node)) {
                    nodeSet.add(node);
                }
            }
        }
        if (!CrosslinkViewer.PLACE_ONE_LINK_NODES) {
            return {nodes: Array.from(nodeSet), links: Array.from(links.values()), leaves: []};
        }
        const degree = new Map();
        for (let link of links.values()) {
            degree.set(link.source, (degree.get(link.source) || 0) + 1);
            degree.set(link.target, (degree.get(link.target) || 0) + 1);
        }
        const isInsideExpandedGroup = node => Array.from(node.parentGroups).some(pg => pg.expanded && !pg.hidden);
        const leaves = [];
        const leafLinkIds = new Set();
        for (let link of links.values()) {
            for (let [leaf, anchor] of [[link.source, link.target], [link.target, link.source]]) {
                if (degree.get(leaf) === 1 && degree.get(anchor) > 1 && !leaf.fixed && !isInsideExpandedGroup(leaf)) {
                    leaves.push({node: leaf, anchor: anchor});
                    nodeSet.delete(leaf);
                    leafLinkIds.add(link.id);
                }
            }
        }
        return {
            nodes: Array.from(nodeSet),
            links: Array.from(links.values()).filter(link => !leafLinkIds.has(link.id)),
            leaves: leaves,
        };
    }

    /**
     * Places nodes left out of the cola layout (getColaGraph leaves) around the node they're linked to: fanned
     * out on the side away from that node's other (laid out) neighbours, or all round it if it has none, at half
     * the mean on-screen length of the laid out links, in further rings out when there are too many for one.
     * @param {{node: Object, anchor: Object}[]} leaves - From getColaGraph
     * @param {{source: Object, target: Object}[]} links - The links cola laid out
     */
    placeLeaves(leaves, links) {
        if (leaves.length === 0) {
            return;
        }
        const neighbours = new Map(); // laid out node -> its laid out neighbours
        let totalLength = 0;
        for (let link of links) {
            for (let [a, b] of [[link.source, link.target], [link.target, link.source]]) {
                if (!neighbours.has(a)) {
                    neighbours.set(a, []);
                }
                neighbours.get(a).push(b);
            }
            totalLength += Math.hypot(link.source.ix - link.target.ix, link.source.iy - link.target.iy);
        }
        const distance = links.length ? 0.5 * totalLength / links.length : 50 * this.z;
        const leavesByAnchor = new Map();
        for (let {node, anchor} of leaves) {
            if (!leavesByAnchor.has(anchor)) {
                leavesByAnchor.set(anchor, []);
            }
            leavesByAnchor.get(anchor).push(node);
        }
        const minGap = 0.4 * distance; // between neighbouring leaves on a ring
        for (let [anchor, anchorLeaves] of leavesByAnchor) {
            const others = neighbours.get(anchor) || [];
            let awayAngle = 0;
            if (others.length) {
                let cx = 0, cy = 0;
                for (let other of others) {
                    cx += other.ix;
                    cy += other.iy;
                }
                awayAngle = Math.atan2(anchor.iy - cy / others.length, anchor.ix - cx / others.length);
            }
            // fill rings outwards: a fan centred on awayAngle, or a full circle when a ring is full or the
            // anchor has no laid out neighbours
            let placedCount = 0, ring = 0;
            while (placedCount < anchorLeaves.length) {
                const radius = distance * (1 + 0.6 * ring);
                const capacity = Math.max(1, Math.floor(2 * Math.PI * radius / minGap));
                const n = Math.min(anchorLeaves.length - placedCount, capacity);
                const step = (n === capacity || others.length === 0) ? 2 * Math.PI / n : minGap / radius;
                const startAngle = awayAngle - step * (n - 1) / 2;
                for (let i = 0; i < n; i++) {
                    const angle = startAngle + i * step;
                    const leaf = anchorLeaves[placedCount + i];
                    leaf.setPositionFromXinet(anchor.ix + radius * Math.cos(angle), anchor.iy + radius * Math.sin(angle), false);
                    leaf.setAllLinkCoordinates();
                }
                placedCount += n;
                ring++;
            }
        }
    }

    /**
     * Number of nodes autoLayout would hand to cola.
     * @returns {number}
     */
    countColaNodes() {
        return this.getColaGraph().nodes.length;
    }

    /**
     * Very large networks freeze the page in cola (its start() is synchronous, builds an all-pairs
     * shortest path matrix and runs O(n^2) iterations), so instead of laying them out straight away we wait
     * for UniProt, auto group the proteins (LARGE_NETWORK_GROUPING_STRATEGIES), collapse the groups and
     * then lay out the (smaller) result.
     * Falls back to laying out ungrouped if UniProt fails, or if the UniProt fetch or the grouping makes no
     * progress for LARGE_NETWORK_GROUPING_TIMEOUT_MS.
     */
    deferFirstLayout() {
        const nodeCount = this.countColaNodes();
        console.log("xiNET LARGE NETWORK: " + nodeCount + " nodes for cola (threshold " +
            CrosslinkViewer.LARGE_NETWORK_COLA_NODES + ") - deferring first layout until proteins are grouped");
        this.firstLayoutPending = true;
        this.container.setAttribute("visibility", "hidden"); // nothing has a position yet
        this.showStatus("Large network (" + nodeCount + " interconnected proteins) - waiting for UniProt annotations " +
            "to group proteins before layout...");

        const uniprotStatus = this.model.get("clmsModel").uniprotStatus;
        if (uniprotStatus === "loaded") {
            this.groupAndLayoutLargeNetwork();
        } else if (uniprotStatus === "failed") {
            this.runDeferredFirstLayout("UniProt annotations unavailable");
        } else {
            this.listenToOnce(vent, "uniprotLoaded", this.groupAndLayoutLargeNetwork);
            this.listenToOnce(vent, "uniprotFailed", function () {
                this.runDeferredFirstLayout("UniProt annotations failed to load");
            });
            // big datasets take minutes to fetch from UniProt, so time out on lack of progress, not total time
            this.listenTo(vent, "uniprotProgress", function (done, total) {
                this.showStatus("Large network (" + nodeCount + " interconnected proteins) - waiting for UniProt annotations " +
                    "to group proteins before layout (" + done + " / " + total + ")...");
                this.restartFirstLayoutTimer();
            });
            this.restartFirstLayoutTimer();
        }
    }

    /**
     * (Re)starts the timer after which a deferred large network layout gives up waiting for grouping.
     */
    restartFirstLayoutTimer() {
        clearTimeout(this.firstLayoutTimer);
        this.firstLayoutTimer = setTimeout(() => {
            this.runDeferredFirstLayout("No progress for " + (CrosslinkViewer.LARGE_NETWORK_GROUPING_TIMEOUT_MS / 1000) +
                "s waiting for UniProt annotations / auto grouping");
        }, CrosslinkViewer.LARGE_NETWORK_GROUPING_TIMEOUT_MS);
    }

    /**
     * Called when UniProt annotations arrive while the first layout of a large network is deferred.
     * Auto groups proteins (unless there are already groups), collapses all groups, then lays out.
     * @returns {Promise<void>}
     */
    async groupAndLayoutLargeNetwork() {
        if (!this.firstLayoutPending) {
            return;
        }
        this.stopListening(vent, "uniprotProgress");
        if (this.model.get("groups").size === 0) {
            let groupMap = null;
            for (let strategy of CrosslinkViewer.LARGE_NETWORK_GROUPING_STRATEGIES) { // first is preferred, rest fallbacks
                this.restartFirstLayoutTimer(); // each strategy (its QuickGO requests) gets its own full timeout
                this.showStatus("Large network - auto grouping proteins (" + strategy + ")...");
                try {
                    groupMap = await this.model.buildAutoGroupsByStrategy(strategy);
                } catch (e) {
                    console.warn("xiNET: auto grouping (" + strategy + ") failed", e);
                    groupMap = null;
                }
                if (!this.firstLayoutPending) {
                    return; // timed out, or user laid out / loaded a layout meanwhile - don't touch groups now
                }
                if (groupMap && groupMap.size > 0) {
                    console.log("xiNET: auto grouped large network into " + groupMap.size + " groups (" + strategy + ")");
                    break;
                }
            }
            if (groupMap && groupMap.size > 0 && this.model.get("groups").size === 0) {
                this.showStatus("Large network - collapsing " + groupMap.size + " auto groups...");
                await CrosslinkViewer.yieldToBrowser();
                if (!this.firstLayoutPending) {
                    return;
                }
                this.model.set("groups", groupMap);
                this.model.trigger("change:groups");
            } else {
                console.warn("xiNET: no auto groups found, laying out ungrouped");
            }
        }
        this.collapseGroups();
        this.runDeferredFirstLayout();
    }

    /**
     * Ends the wait for grouping and runs the deferred first layout.
     * @param {string} [reason] - Why it's running without grouping, if it is (logged as a warning)
     * @returns {Promise<void>}
     */
    async runDeferredFirstLayout(reason) {
        if (!this.firstLayoutPending) {
            return;
        }
        if (reason) {
            console.warn("xiNET: " + reason + " - laying out large network without grouping, this may take a long time");
        }
        const nodeCount = this.countColaNodes();
        this.showStatus((reason ? reason + ". " : "") + "Laying out " + nodeCount + " nodes - the page may be unresponsive for a while...");
        await CrosslinkViewer.yieldToBrowser(); // let the status paint before cola blocks the thread
        if (!this.firstLayoutPending) {
            return;
        }
        console.log("xiNET: first layout of large network with " + nodeCount + " cola nodes");
        this.autoLayout([]); // clears firstLayoutPending, shows container, hides status
    }

    /**
     * Stops waiting to lay out a large network (if we were) and reveals it.
     */
    cancelDeferredFirstLayout() {
        if (!this.firstLayoutPending) {
            return;
        }
        this.firstLayoutPending = false;
        clearTimeout(this.firstLayoutTimer);
        this.stopListening(vent, "uniprotLoaded", this.groupAndLayoutLargeNetwork);
        this.stopListening(vent, "uniprotFailed");
        this.stopListening(vent, "uniprotProgress");
        this.container.removeAttribute("visibility");
        this.showStatus(null);
        this.buildVisibleProteinSVG(); // held back while waiting (see svgOnHold)
        this.render(); // and links
    }

    /**
     * xiNET elements build no SVG (see lazy-svg.js) until the first render has decided how to lay out, and while
     * the first layout of a large network is deferred: nothing is visible yet, and on a large network most of it
     * will be hidden by grouping and collapsing.
     * @returns {boolean}
     */
    get svgOnHold() {
        return this.firstRender === true || this.firstLayoutPending === true;
    }

    /**
     * Builds the SVG of the proteins that are displayed but have none (because of svgOnHold).
     */
    buildVisibleProteinSVG() {
        for (let rp of this.renderedProteins.values()) {
            rp.setHidden(rp.hidden);
        }
    }

    /**
     * Shows a status message over the network, or hides it.
     * @param {string|null} message - Text to show; null hides the message
     */
    showStatus(message) {
        if (!this.statusSel) {
            this.statusSel = d3.select(this.el).append("div")
                .attr("class", "xinet-status")
                .style({
                    position: "absolute", top: "40%", left: "10%", right: "10%",
                    "text-align": "center", "font-size": "1.2em", "pointer-events": "none"
                });
        }
        this.statusSel.text(message || "").style("display", message ? null : "none");
    }

    //functions used...
    xForColumn(c) {
        const maxBlobRadius = 40;
        // var LABELMAXLENGTH = 0;
        // return (c * ((2 * maxBlobRadius) + LABELMAXLENGTH)) - maxBlobRadius;
        return c * maxBlobRadius - (maxBlobRadius / 2);
    }

    yForRow(r) {
        const maxBlobRadius = 60;
        return (r * maxBlobRadius) - 10;
    }

    reorderedNodes(linearGraph) {
        const reorderedNodes = [];
        appendNode(getStartNode(), new Set ());
        return reorderedNodes;

        function getStartNode() {
            // var ns = Array.from(linearGraph.nodes.values());
            // var count = ns.length;
            // //                    alert (nodeCount);
            // for (var n = 0; n < count; n++) {
            //     if (ns[n].countExternalLinks() < 2) {
            //         //                            alert("got start");
            //         return ns[n];
            //     }
            // }
            for (let node of linearGraph.nodes.values()) {
                if (node.countExternalLinks() < 2) {
                    return node;
                }
            }
            console.error("missed linear subgraph start");
            return null;
        }

        function appendNode(currentNode, checkedNodes) {
            checkedNodes.add(currentNode.id); // yeah, wierdness, this all needs tidied up
            if (!currentNode.hidden) {
                reorderedNodes.push(currentNode.id);
            }

            // var proteinLinksArr = Array.from(currentNode.renderedP_PLinks.values());
            // for (var l = 0; l < proteinLinksArr.length; l++) {
            //     var link = proteinLinksArr[l];
            //     if (link.isPassingFilter()) {
            //         var nextNode = link.getOtherEnd(currentNode);
            //         if (reorderedNodes.indexOf(nextNode.participant.id) === -1) {
            //             //                    alert("here");
            //             appendNode(nextNode);
            //             break;
            //         }
            //     }
            // }

            // currentNode may be a RenderedProtein or a Group; only proteins have
            // renderedP_PLinks, so resolve neighbours via the rendered interactor of
            // each link's other end (same approach as countExternalLinks).
            for (let nextNode of getNeighbours(currentNode)) {
                if (!checkedNodes.has(nextNode.id)) {
                    appendNode(nextNode, checkedNodes);
                    break;
                }
            }
        }

        function getNeighbours(node) {
            const neighbours = new Set();
            // groups have no renderedP_PLinks of their own - gather from members
            const proteins = node.renderedP_PLinks ? [node] : node.renderedProteins;
            for (let protein of proteins) {
                for (let link of protein.renderedP_PLinks) {
                    // structural self-link test (see countExternalLinks): crosslinks[0] is
                    // unreliable for ambiguous links bundling several crosslinks.
                    if (link.renderedFromProtein !== link.renderedToProtein && link.isPassingFilter()) {
                        neighbours.add(link.getOtherEnd(protein).getRenderedInteractor());
                    }
                }
            }
            neighbours.delete(node); // drop self (e.g. links internal to a group)
            return neighbours;
        }
    }

    saveLayout(callback) {
        const layout = {};
        const proteinColourModel = this.model.get("proteinColourAssignment");
        if (proteinColourModel instanceof ManualColourModel) {
            layout.manualColourAssignment = JSON.stringify(Object.fromEntries(proteinColourModel.colourAssignment));
        }
        layout.groups = Array.from(this.groupMap.values());
        layout.proteins = Array.from(this.renderedProteins.values());
        // round trip through JSON to get plain objects (via toJSON) and strip null chars
        const myJSONText = JSON.stringify(layout, null);
        callback(JSON.parse(myJSONText.replace(/\\u0000/gi, "")));
    }

    //todo - this is becoming about config of all xiVIEw not just config of xiNET, should be moved
    loadLayout(layout) {
        console.log("xiNET LOAD LAYOUT", layout);
        this.cancelDeferredFirstLayout();
        let proteinPositions, groups;
        // for backwards compatibility (after groups added to layout)
        if (layout.proteins) {
            proteinPositions = layout.proteins;
            groups = layout.groups;
        } else {
            proteinPositions = layout;
        }
        let namesChanged = false;
        for (let protLayout of proteinPositions) {
            const protein = this.renderedProteins.get(protLayout.id);
            if (protein !== undefined) {
                protein.setPositionFromXinet(protLayout["x"], protLayout["y"]);
                if (typeof protLayout["rot"] !== "undefined") {
                    // noinspection PointlessArithmeticExpressionJS
                    protein.rotation = protLayout["rot"] - 0;
                }
                protein.ix = protLayout["x"];
                protein.iy = protLayout["y"];
                protein.newForm = protLayout["expanded"];
                if (CrosslinkViewer.barScales.indexOf(+protLayout["stickZoom"]) > -1) {
                    protein.stickZoom = protLayout["stickZoom"];
                }
                // noinspection PointlessArithmeticExpressionJS
                protein.rotation = protLayout["rot"] - 0;
                protein.flipped = protLayout["flipped"];
                protein.protein.manuallyHidden = protLayout["manuallyHidden"];

                if (protLayout["name"]) {
                    protein.protein.name = protLayout["name"];
                    namesChanged = true;
                }

            }
        }

        for (let rp of this.renderedProteins.values()) {
            rp.setEverything();
        }

        if (groups && typeof groups[Symbol.iterator] === "function") {
            const modelGroupMap = new Map();
            for (const savedGroup of groups) {
                //gonna need to check for proteins now missing from results
                const presentProteins = new Set();

                // older saved layouts use participantIds
                for (let pId of savedGroup.proteinIds || savedGroup.participantIds || []) {
                    if (this.renderedProteins.get(pId)) {
                        presentProteins.add(pId);
                    }
                }
                if (presentProteins.size === 0) {
                    // layoutIsDodgy = true;
                    // this prob happens as a result of revalidating data in lab version
                    console.log("! group in layout but no proteins in search:" + savedGroup.id + "; " + savedGroup.proteinIds);
                } else {
                    modelGroupMap.set(savedGroup.id, presentProteins);
                }
            }
            this.model.set("groups", modelGroupMap);
            this.model.trigger("change:groups");

            for (const savedGroup of groups) {
                const xiNetGroup = this.groupMap.get(savedGroup.id);
                if (xiNetGroup && savedGroup.expanded === false) {
                    xiNetGroup.collapse(null, false);
                    xiNetGroup.setPositionFromXinet(savedGroup.x, savedGroup.y);
                }
            }
        }

        this.model.get("filterModel").trigger("change", this.model.get("filterModel"));

        this.zoomToFullExtent();

        if (layout.manualColourAssignment) {
            linkColor.manualProteinColoursBB.setMap(JSON.parse(layout.manualColourAssignment));
            this.model.set("proteinColourAssignment", linkColor.manualProteinColoursBB);
        }

        // if (layoutIsDodgy) {
        //     alert("Looks like something went wrong with the saved layout, if you can't see your proteins click Auto layout");
        // }

        if (namesChanged) {
            // vent.trigger("proteinMetadataUpdated", {}); //ain't gonna work
            for (let renderedParticipant of this.renderedProteins.values()) {
                renderedParticipant.updateName();
            }
        }
    }

    downloadSVG() {
        const svgArr = [this.svgElement];
        const svgStrings = capture(svgArr);
        let svgXML = makeXMLStr(new XMLSerializer(), svgStrings[0]);
        //bit of a hack
        const bBox = this.svgElement.getBoundingClientRect();
        const width = Math.round(bBox.width);
        const height = Math.round(bBox.height);
        svgXML = svgXML.replace("width=\"100%\"", "width=\"" + width + "px\"");
        svgXML = svgXML.replace("height=\"100%\"", "height=\"" + height + "px\"");
        const fileName = makeLegalFileName(searchesToString(this.model) + "--xiNET--" + filterStateToString(this.model));
        download(svgXML, "application/svg", fileName + ".svg");
    }

    highlightedLinksChanged() {
        for (let p_pLink of this.renderedP_PLinks.values()) {
            p_pLink.showHighlight(false);
        }
        const highlightedCrossLinks = this.model.getMarkedCrossLinks("highlights");
        for (let renderedCrossLink of this.renderedCrosslinks.values()) {
            if (highlightedCrossLinks.indexOf(renderedCrossLink.crosslink) !== -1) {
                if (renderedCrossLink.renderedFromProtein.expanded ||
                    !renderedCrossLink.renderedToProtein || renderedCrossLink.renderedToProtein.expanded) {
                    renderedCrossLink.showHighlight(true);
                } else if (renderedCrossLink.renderedToProtein) {
                    const p_pLink = this.renderedP_PLinks.get(
                        renderedCrossLink.renderedFromProtein.protein.id + "-" + renderedCrossLink.renderedToProtein.protein.id);
                    p_pLink.showHighlight(true);
                }
            } else {
                renderedCrossLink.showHighlight(false);
            }
        }
        for (let gg of this.g_gLinks.values()) {
            gg.checkHighlight();
        }
        return this;
    }

    selectedLinksChanged() {
        for (let p_pLink of this.renderedP_PLinks.values()) {
            p_pLink.setSelected(false);
        }
        const selectedCrossLinks = this.model.getMarkedCrossLinks("selection");
        for (let renderedCrossLink of this.renderedCrosslinks.values()) {
            if (selectedCrossLinks.indexOf(renderedCrossLink.crosslink) !== -1) {
                renderedCrossLink.setSelected(true);
                if (renderedCrossLink.renderedToProtein) {
                    const p_pLink = this.renderedP_PLinks.get(
                        renderedCrossLink.renderedFromProtein.protein.id + "-" + renderedCrossLink.renderedToProtein.protein.id);
                    p_pLink.setSelected(true);
                }
            } else {
                renderedCrossLink.setSelected(false);
            }
        }
        for (let gg of this.g_gLinks.values()) {
            gg.checkSelected();
        }
        return this;
    }

    selectedProteinsChanged() {
        const selectedProteins = this.model.get("selectedProteins");
        for (let renderedProtein of this.renderedProteins.values()) {
            if (selectedProteins.indexOf(renderedProtein.protein) === -1 ){//&& renderedProtein.isSelected === true) {
                renderedProtein.selected = false;
            }
        }
        for (let selectedProtein of selectedProteins) {
            if (selectedProtein.is_decoy !== true) {
                this.renderedProteins.get(selectedProtein.id).selected = true;
            }
        }
        if (this.groupMap) {
            for (let g of this.groupMap.values()) {
                g.updateSelected();
            }
        }
        return this;
    }

    highlightedProteinsChanged() {
        const highlightedProteins = this.model.get("highlightedProteins");

        for (let renderedProtein of this.renderedProteins.values()) {
            if (highlightedProteins.indexOf(renderedProtein.protein) === -1){//} && renderedProtein.highlight === true) {
                renderedProtein.highlighted = false;
            }
        }
        for (let highlightedProtein of highlightedProteins) {
            if (highlightedProtein.is_decoy !== true) {
                const renderedProtein = this.renderedProteins.get(highlightedProtein.id);
                renderedProtein.highlighted = true;
            }

        }

        if (this.groupMap) {
            for (let g of this.groupMap.values()) {
                let someHighlighted = false, allHighlighted = true;
                for (let rp of g.renderedProteins) {
                    if (rp.highlighted) {
                        someHighlighted = true;
                    } else {
                        allHighlighted = false;
                    }
                }
                if (someHighlighted) {
                    g.dashed = !allHighlighted;
                    g.highlighted = true;
                } else {
                    g.highlighted = false;
                    g.updateSelected();
                }
            }
        }

        return this;
    }

    // updates protein names and colours
    proteinMetadataUpdated() {
        for (let renderedParticipant of this.renderedProteins.values()) {
            renderedParticipant.updateName();
        }
        this.proteinColoursUpdated();
        return this;
    }

    proteinColoursUpdated() {
        const proteinColourModel = this.model.get("proteinColourAssignment");
        for (let renderedParticipant of this.renderedProteins.values()) {
            if (proteinColourModel && renderedParticipant.svgCreated) { // (initSVG() sets the colour)
                const c = proteinColourModel.getColour(renderedParticipant.protein);
                d3.select(renderedParticipant.outline)
                    .attr("fill", c);
                d3.select(renderedParticipant.background)
                    .attr("fill", c);
            }
        }
        //groups also
        for (let g of this.groupMap.values()) {
            if (proteinColourModel && proteinColourModel instanceof ManualColourModel) {
                const c = proteinColourModel.getColour(g);
                g.setColour(c);
            } else {
                g.setColour("#CCCCCC");
            }
        }
        return this;
    }

    showLabels() {
        const show = this.model.get("xinetShowLabels");
        for (let renderedParticipant of this.renderedProteins.values()) {
            renderedParticipant.showLabel(show);
        }
        return this;
    }

    setFixedSize() {
        this.fixedSize = this.model.get("xinetFixedSize");
        for (let renderedParticipant of this.renderedProteins.values()) {
            renderedParticipant.resize();
        }
        return this;
    }

    setCropLabels() {
        this.cropLabels = this.model.get("xinetCropLabels");
        for (let renderedParticipant of this.renderedProteins.values()) {
            renderedParticipant.updateName();
        }
        return this;
    }

    zoomToFullExtent() {
        const margin = 10;
        const width = this.svgElement.parentNode.clientWidth - (2 * margin);
        const height = this.svgElement.parentNode.clientHeight - (2 * margin);
        const bbox = this.container.getBBox();
        let xr = (width / bbox.width);
        let yr = (height / bbox.height);
        let scaleFactor;
        if (xr > yr) {
            scaleFactor = yr;
        } else {
            scaleFactor = xr;
        }
        this.container.setAttribute("transform", "scale(" + scaleFactor
            + ") translate(" + (-bbox.x + (margin / scaleFactor)) + " " + (-bbox.y + (margin / scaleFactor)) + ")");
        this.scale();
    }

    scale() {
        this.z = this.container.getCTM().inverse().a;
        if (this.z < 0) {
            console.error("weird negative value for this.z");
            this.z = 1;
        }
        for (let prot of this.renderedProteins.values()) {
            if (prot.hidden) {
                continue; // rescaled when shown again (see RenderedProtein.setHidden) - big win for large collapsed groups
            }
            prot.setPositionFromXinet(prot.ix, prot.iy); // this rescales the protein
            if (prot.expanded)
                prot.setAllLinkCoordinates();
        }
        for (let renderedCrossLink of this.renderedCrosslinks.values()) {
            if (renderedCrossLink.shown && renderedCrossLink.crosslink.isSelfLink() === false && renderedCrossLink.crosslink.toProtein) {
                renderedCrossLink.line.setAttribute("stroke-width", this.z * CrosslinkViewer.linkWidth);
                renderedCrossLink.highlightLine.setAttribute("stroke-width", this.z * 10);
                if (renderedCrossLink.crosslink.ambiguous === true) {
                    renderedCrossLink.dashedLine(true); //rescale spacing of dashes
                }
            }
        }
        for (let p_pLink of this.renderedP_PLinks.values()) {
            // hidden links are rescaled in show(), touching them here dirties the style of every hidden element
            if (p_pLink.shown && p_pLink.renderedToProtein && p_pLink.renderedFromProtein !== p_pLink.renderedToProtein &&
                !p_pLink.renderedFromProtein.expanded && !p_pLink.renderedToProtein.expanded) {
                p_pLink.line.setAttribute("stroke-width", this.z * CrosslinkViewer.linkWidth);
                p_pLink.highlightLine.setAttribute("stroke-width", this.z * 10);
                p_pLink.updateThickLineWidth();
                if (p_pLink.ambiguous) {
                    p_pLink.dashedLine(true); //rescale spacing of dashes // performance issue?
                }
            }
        }
        for (let gg of this.g_gLinks.values()) {
            if (gg.shown && gg.group1 !== gg.group2) {
                //     if (p_pLink.line) {
                gg.line.setAttribute("stroke-width", this.z * CrosslinkViewer.linkWidth);
                gg.highlightLine.setAttribute("stroke-width", this.z * 10);
                gg.updateThickLineWidth();
                // if (p_pLink.ambiguous) {
                //     p_pLink.dashedLine(true); //rescale spacing of dashes
                // }
                // }
            }
        }
        for (let g of this.groupMap.values()) {
            if (!g.hidden) {
                g.outline.setAttribute("stroke-width", this.z * 5);
                g.highlight.setAttribute("stroke-width", this.z * 5);
                if (g.expanded) {
                    g.updateExpandedGroup();
                } else {
                    g.setPositionFromXinet(g.ix, g.iy);
                }
                g.dashed = g._dashed; // rescale dashes
            }
        }
    }

    setAnnotations() {
        this.annotationsSet = true; // proteins drawn from now on add their annotations (RenderedProtein.initSVG)
        for (let renderedProtein of this.renderedProteins.values()) {
            renderedProtein.setPositionalFeatures();
        }
    }

    setCTM(element, matrix) {
        const s = "matrix(" + matrix.a + "," + matrix.b + "," + matrix.c + "," + matrix.d + "," + matrix.e + "," + matrix.f + ")";
        element.setAttribute("transform", s);
    }

    /**
     * Handles mouse down events on the SVG canvas.
     * Initiates selection/pan mode and hides context menu.
     *
     * @param {MouseEvent} evt - The mouse event
     */
    mouseDown(evt) {
        evt.preventDefault();
        this.d3cola.stop();
        this.dragStart = evt;
        this.state = CrosslinkViewer.STATES.SELECT_PAN;
        this.mouseMoved = false;
        this.toSelect = [];
        d3.select(".xinet-context-menu").style("display", "none");
    }

    /**
     * Handles mouse move events for dragging, rotating, panning, and selecting.
     * Implements different behaviors based on current state (DRAGGING, ROTATING, SELECT_PAN).
     *
     * @param {MouseEvent} evt - The mouse event
     */
    mouseMove(evt) {
        if (this.dragStart) {
            const p = this.getEventPoint(evt); // seems to be correct, see below
            const c = p.matrixTransform(this.container.getCTM().inverse());
            const ds = this.getEventPoint(this.dragStart).matrixTransform(this.container.getCTM().inverse());
            const dx = ds.x - c.x;
            const dy = ds.y - c.y;
            if (Math.sqrt(dx * dx + dy * dy) > (5 * this.z)) {
                this.mouseMoved = true;
            }
            if (this.dragElement != null && evt.which !== 3) { //dragging or rotating / not right-click mouse down
                //remove tooltip
                this.model.get("tooltipModel").set("contents", null);
                if (this.state === CrosslinkViewer.STATES.DRAGGING) {
                    // we are currently dragging things around
                    if (this.dragElement.type === "group" && this.dragElement.expanded) {
                        if (!this.dragElement.selected) {
                            const toDrag = this.dragElement.renderedProteins;
                            for (let d = 0; d < toDrag.length; d++) {
                                const renderedProtein = toDrag[d];
                                renderedProtein.setPositionFromXinet(renderedProtein.ix - dx, renderedProtein.iy - dy);
                                renderedProtein.setAllLinkCoordinates();
                            }
                            for (let g of this.dragElement.subgroups) {
                                if (!g.expanded) {
                                    g.setPositionFromXinet(g.ix - dx, g.iy - dy);
                                    g.setAllLinkCoordinates();
                                }
                            }
                        }else {
                            this.moveSelected(dx, dy);
                        }
                        this.dragElement.updateExpandedGroup();
                    } else if (this.dragElement.protein || this.dragElement.type === "group"){ //collapsed group or protein
                        if (!this.dragElement.selected) {
                            this.dragElement.setPositionFromXinet(this.dragElement.ix - dx, this.dragElement.iy - dy);
                            this.dragElement.setAllLinkCoordinates();
                        } else {
                            this.moveSelected(dx, dy);
                        }
                    }
                    this.dragStart = evt;
                } else if (this.state === CrosslinkViewer.STATES.ROTATING) {
                    // Distance from mouse x and center of stick.
                    const _dx = c.x - this.dragElement.ix;
                    // Distance from mouse y and center of stick.
                    const _dy = c.y - this.dragElement.iy;
                    //see http://en.wikipedia.org/wiki/Atan2#Motivation
                    let centreToMouseAngleRads = Math.atan2(_dy, _dx);
                    if (this.whichRotator === 0) {
                        centreToMouseAngleRads = centreToMouseAngleRads + Math.PI;
                    }
                    const centreToMouseAngleDegrees = centreToMouseAngleRads * (360 / (2 * Math.PI));
                    this.dragElement.setRotation(centreToMouseAngleDegrees);
                    this.dragElement.setAllLinkCoordinates();
                } else { //not dragging or rotating yet, maybe we should start
                    // don't start dragging just on a click - we need to move the mouse a bit first
                    if (Math.sqrt(dx * dx + dy * dy) > (5 * this.z)) { //this.mouseMoved?
                        this.state = CrosslinkViewer.STATES.DRAGGING;
                    }
                }
            } else if (this.state === CrosslinkViewer.STATES.SELECT_PAN) {
                if (evt.which === 3) {
                    //SELECT
                    const ds = this.getEventPoint(this.dragStart).matrixTransform(this.wrapper.getCTM().inverse());
                    // var dx = c.x - ds.x;
                    // var dy = c.y - ds.y;

                    const sx = p.x - ds.x;
                    const sy = p.y - ds.y;

                    let rectX = ds.x;
                    if (sx < 0) {
                        rectX += sx;
                    }
                    let rectY = ds.y;
                    if (sy < 0) {
                        rectY += sy;
                    }

                    this.selectionRectSel.attr("display", "inline")
                        .attr("x", rectX)
                        .attr("y", rectY)
                        .attr("width", Math.abs(sx))
                        .attr("height", Math.abs(sy));

                    this.toSelect = [];

                    const svgRect = this.svgElement.createSVGRect();
                    svgRect.x = rectX;
                    svgRect.y = rectY;
                    svgRect.width = Math.abs(sx);
                    svgRect.height = Math.abs(sy);

                    for (let renderedParticipant of this.renderedProteins.values()) {
                        if (renderedParticipant.hidden !== true) {
                            const intersects = this.svgElement.getIntersectionList(svgRect, renderedParticipant.upperGroup);
                            if (intersects.length > 0) {
                                renderedParticipant.highlighted = true; // todo - use backbone-models
                                this.toSelect.push(renderedParticipant.protein);
                            } else {
                                renderedParticipant.highlighted = false; // todo - use backbone-models
                            }
                        }

                    }
                    for (let renderedGroup of this.groupMap.values()) {
                        if (renderedGroup.hidden !== true && renderedGroup.expanded === false) {
                            const intersects = this.svgElement.getIntersectionList(svgRect, renderedGroup.upperGroup);
                            if (intersects.length > 0) {
                                renderedGroup.highlighted = true;  // todo - use backbone-models?
                                for (let renderedParticipant of renderedGroup.renderedProteins) {
                                    this.toSelect.push(renderedParticipant.protein);
                                }
                            } else {
                                renderedGroup.highlighted = false;  // todo - use backbone-models?
                            }
                        }
                    }
                } else {
                    //PAN
                    const ds = this.getEventPoint(this.dragStart).matrixTransform(this.container.getCTM().inverse());
                    const dx = c.x - ds.x;
                    const dy = c.y - ds.y;
                    this.setCTM(this.container,
                        this.container.getCTM()
                            .translate(dx, dy)
                    );
                    this.dragStart = evt;
                }
            }
        }
    }

    moveSelected(dx, dy) {
        const toDrag = this.model.get("selectedProteins");
        for (let d = 0; d < toDrag.length; d++) {
            const renderedProtein = this.renderedProteins.get(toDrag[d].id);
            renderedProtein.setPositionFromXinet(renderedProtein.ix - dx, renderedProtein.iy - dy);
            renderedProtein.setAllLinkCoordinates();
        }
        for (let g of this.groupMap.values()) {
            if (!g.expanded && g.selected) {
                g.setPositionFromXinet(g.ix - dx, g.iy - dy);
                g.setAllLinkCoordinates();
            }
        }
    }

    /**
     * Handles mouse up events.
     * Finalizes drag, rotation, pan, or selection operations.
     * Handles context menu display for right-clicks.
     *
     * @param {MouseEvent} evt - The mouse event
     * @returns {boolean} False to prevent default behavior
     */
    mouseUp(evt) {
        this.preventDefaultsAndStopPropagation(evt);
        //remove selection rect, may not be shown but just do this now
        this.selectionRectSel.attr("display", "none");
        //eliminate some spurious mouse up events - a simple version of debouncing, but it seems to work better than for e.g. _.debounce
        const time = new Date().getTime();
        if ((time - this.lastMouseUp) > 150) {
            const rightClick = (evt.button === 2);
            const add = evt.ctrlKey || evt.shiftKey;
            const p = this.getEventPoint(evt);
            const c = p.matrixTransform(this.container.getCTM().inverse());
            if (this.state === CrosslinkViewer.STATES.ROTATING) {
                //round protein rotation to nearest 5 degrees (looks neater)
                this.dragElement.setRotation(Math.round(this.dragElement.rotation / 5) * 5);
                this.dragElement.setAllLinkCoordinates();
            } else {
                if (this.dragElement) {
                    if (rightClick) {
                        if (this.mouseMoved) { // move and right click
                            // ADD TO SELECT POST RIGHT CLICK DRAG -- RIGHT CLICK, HAS MOVED, NO DRAG ELEMENT
                            this.model.setSelectedProteins(this.toSelect, add);
                        }
                        // EXPANDING / COLLAPSING -- RIGHT CLICK, NO MOVE, IS A DRAG ELEMENT
                        this.contextMenuParticipant = this.dragElement;
                        if (this.dragElement.ix || this.dragElement.type === "group") {
                            this.model.get("tooltipModel").set("contents", null);
                            this.contextMenuPoint = c;
                            this.showContextMenu(evt);
                        }
                    } else if (this.dragElement.protein && !this.mouseMoved) { // it's a protein
                        // ADD SINGLE PROTEIN TO SELECTION - LEFT CLICK, NO MOVE, IS A DRAG ELEMENT
                        this.model.setSelectedProteins([this.dragElement.protein], add);
                    } else if (this.dragElement.protein && add && this.mouseMoved) {
                        // alert ("add protein to group, not implemented yet");
                        // get list of groups intersecting point where protein was 'dropped'
                        const groupsAtPoint = [];
                        for (let renderedGroup of this.groupMap.values()) {
                            if (renderedGroup.hidden !== true){ // && renderedGroup.expanded === false) {
                                const bbox = renderedGroup.upperGroup.getBBox();
                                if (c.x > bbox.x && c.x < bbox.x + bbox.width && c.y > bbox.y && c.y < bbox.y + bbox.height) {
                                    console.log("just dropped in" + renderedGroup.id); //to see-ee what condition my condition was in
                                    groupsAtPoint.push(renderedGroup);
                                }
                            }
                        }
                        // if only one group, add protein to that group
                        if (groupsAtPoint.length === 1) {
                            const group = groupsAtPoint[0];
                            this.model.addProteinToGroup(group.id, this.dragElement.protein.id);
                        } else if (groupsAtPoint.length > 1) {
                            // if more than one group, show a menu of groups to add to
                            alert("more than one group at that point, this not implemented yet. You need a menu to confirm which group(s) to add to");
                        }
                    } else if (this.dragElement.type === "group" && !this.mouseMoved) { // was left-click on a group, no move mouse
                        //add all group's proteins to selection
                        this.model.setSelectedProteins(this.dragElement.proteins, add);
                    }
                } else { //no drag element
                    if (rightClick) {
                        if (this.mouseMoved) { // move and right click
                            // ADD TO SELECT POST RIGHT CLICK DRAG -- RIGHT CLICK, HAS MOVED, NO DRAG ELEMENT
                            this.model.setSelectedProteins(this.toSelect, add);
                        }
                    } else if (!this.mouseMoved) {
                        //UNSELECT - EITHER MOUSE BUTTON, NO MOVE, NO DRAG ELEMENT
                        this.model.setMarkedCrossLinks("selection", [], false, add);
                        this.model.setSelectedProteins([]);

                    }
                }
            }
            this.dragElement = null;
            this.whichRotator = -1;
            this.state = CrosslinkViewer.STATES.MOUSE_UP;
            this.mouseMoved = false;
        }
        this.lastMouseUp = time;
        return false;
    }

    showContextMenu(evt) {
        const self = this;
        const menuListSel = this.contextMenuUlSel;
        menuListSel.selectAll("li").remove();

        const renderedInteractor = this.contextMenuParticipant;
        const proteinColourModel = this.model.get("proteinColourAssignment");

        if (renderedInteractor.protein) { //protein
            if (renderedInteractor.expanded) {
                menuListSel.append("li").text("Collapse Protein").on("click", () => {
                    this.collapseInteractor(renderedInteractor);
                });
                //scale buttons
                const scaleButtonsListItemSel = menuListSel.append("li").text("Scale: ");
                const scaleButtons = scaleButtonsListItemSel.selectAll("ul.custom-menu")
                    .data(CrosslinkViewer.barScales)
                    .enter()
                    .append("div")
                    .attr("class", "barScale")
                    .append("label");
                scaleButtons.append("span")
                    .text(function (d) {
                        if (d === 8) return "AA";
                        else return d;
                    });
                scaleButtons.append("input")
                    // .attr ("id", function(d) { return d*100; })
                    .attr("class", function (d) {
                        return "scaleButton scaleButton_" + (d * 100);
                    })
                    .attr("name", "scaleButtons")
                    .attr("type", "radio")
                    .on("change", function (d) {
                        self.contextMenuParticipant.setStickScale(d, self.contextMenuPoint);
                    });
                d3.select(".scaleButton_" + (renderedInteractor.stickZoom * 100)).property("checked", true);

            } else {
                menuListSel.append("li").text("Expand Protein").on("click", () => {
                    this.expandProtein(renderedInteractor);
                });
            }

            menuListSel.append("li").text("Open in UniProt").on("click", () => {
                window.open("https://www.uniprot.org/uniprotkb?query=" + renderedInteractor.protein.accession);
            });

            menuListSel.append("li").text("Set Protein Colour").on("click", () => {
                //todo: set protein colour for all selected proteins?
                this.model.chooseProteinColor(renderedInteractor.protein.id);
                d3.select(".xinet-context-menu").style("display", "none");
            });

            menuListSel.append("li").text("stoichiometry for AlphaLink2 export:")
                .append("input")
                .attr("id", "alphaLinkStoich")
                .attr("type", "number")
                .attr("max", "99")
                .attr("min", "1")
                .attr("step", 1)
                // .attr("max-width", "70px")
                .property("value",
                    renderedInteractor.protein.alphaLinkStoich? renderedInteractor.protein.alphaLinkStoich : 1)
                .on("change", () => {
                    const stoich = d3.select("#alphaLinkStoich").property("value");
                    // console.log("STOICH", stoich);
                    renderedInteractor.protein.alphaLinkStoich = stoich;
                });

            if (proteinColourModel instanceof ManualColourModel) {
                if (proteinColourModel.hasManualAssignment(renderedInteractor.protein.id)) {
                    menuListSel.append("li").text("Remove Protein Colour").on("click", () => {
                        proteinColourModel.removeManualAssignment(renderedInteractor.protein.id);
                        this.model.trigger("currentProteinColourModelChanged", proteinColourModel);
                        d3.select(".xinet-context-menu").style("display", "none");
                    });
                }
            }

            for (let pg of renderedInteractor.parentGroups) {
                menuListSel.append("li").text("Remove from group " + pg.name)
                    .attr("data-group", pg.name).attr("data-protein", renderedInteractor.protein.id)
                    .node().onclick = function (evt) { //on("click", function (evt)  {
                        const protien = evt.target.getAttribute("data-protein");
                        const group = evt.target.getAttribute("data-group");
                        console.log("remove protein " + protien + " from group " + group);
                        d3.select(".xinet-context-menu").style("display", "none");
                        self.contextMenuParticipant.highlighted = false;
                        self.model.removeProteinFromGroup(group, protien);
                    };
            }

        } else { // group
            if (renderedInteractor.expanded) {
                if (renderedInteractor.isOverlappingGroup()) {
                    menuListSel.append("li").text("Can't collapse overlapping groups").on("click", () => {
                        this.cantCollapseGroup(); //does nothing
                        d3.select(".xinet-context-menu").style("display", "none");
                    });
                    // menuListSel.append("li").text("Enclose Overlapping Groups").on("click", () => {
                    //     alert("enclose overlapping groups not implemented yet");
                    // });
                } else {
                    menuListSel.append("li").text("Collapse Group").on("click", () => {
                        this.collapseInteractor(renderedInteractor);
                    });
                }
                menuListSel.append("li").text("Auto Layout Group").on("click", () => {
                    d3.select(".xinet-context-menu").style("display", "none");
                    this.autoLayoutGroup(renderedInteractor);
                });
            } else {
                menuListSel.append("li").text("Expand Group").on("click", () => {
                    renderedInteractor.setExpanded(true, this.getEventPoint(evt));
                    d3.select(".xinet-context-menu").style("display", "none");
                });
            }

            menuListSel.append("li").text("Hide Group").on("click", () => {
                d3.select(".xinet-context-menu").style("display", "none");
                this.model.setHighlightedProteins([]);
                this.contextMenuParticipant = null;
                this.model.hideProteins(renderedInteractor.proteins);
            });

            menuListSel.append("li").text("Ungroup").on("click", () => {
                this.ungroup(renderedInteractor);
                d3.select(".xinet-context-menu").style("display", "none");
            });

            menuListSel.append("li").text("Set Group Colour").on("click", () => {
                this.model.chooseProteinColor(renderedInteractor.id);
                d3.select(".xinet-context-menu").style("display", "none");
            });

            if (proteinColourModel instanceof ManualColourModel) {
                if (proteinColourModel.hasManualAssignment(renderedInteractor.id)) {
                    menuListSel.append("li").text("Remove Group Colour").on("click", () => {
                        proteinColourModel.removeManualAssignment(renderedInteractor.id);
                        this.model.trigger("currentProteinColourModelChanged", proteinColourModel);
                        d3.select(".xinet-context-menu").style("display", "none");
                    });
                }
            }
        }

        //keep menu on screen
        const width = this.svgElement.parentNode.clientWidth;
        const height = this.svgElement.parentNode.clientHeight;
        const pageX = evt.pageX;
        const pageY = evt.pageY - 37; //todo: hacky, 37 is height of top bar
        const menu = d3.select(".xinet-context-menu");
        menu.style("display", "block");
        const menuWidth = menu.node().getBoundingClientRect().width;
        const menuHeight = menu.node().getBoundingClientRect().height;
        // console.log("menuWidth: " + menuWidth, "menuHeight: " + menuHeight);
        const mouseOffset = 20;
        const x = pageX + mouseOffset + menuWidth > width ? pageX - mouseOffset - menuWidth : pageX + mouseOffset;
        const y = pageY + mouseOffset + menuHeight > height ? pageY - mouseOffset - menuHeight : pageY + mouseOffset;
        menu.style("top", y + "px").style("left", x + "px");
    }

    mouseWheel(evt) {
        this.preventDefaultsAndStopPropagation(evt);
        this.d3cola.stop();
        let delta;
        //see http://stackoverflow.com/questions/5527601/normalizing-mousewheel-speed-across-browsers
        // noinspection JSUnresolvedVariable
        if (evt.wheelDelta) {
            delta = evt.wheelDelta / 3600; // Chrome/Safari
        } else {
            delta = evt.detail / -90; // Mozilla
        }
        const z = 1 + delta;
        const g = this.container;
        const p = this.getEventPoint(evt);
        const c = p.matrixTransform(g.getCTM().inverse());
        const k = this.svgElement.createSVGMatrix().translate(c.x, c.y).scale(z).translate(-c.x, -c.y);
        this.setCTM(g, g.getCTM().multiply(k));
        this.scale();
        return false;
    }

    mouseOut() { //todo
        // don't, causes problem's - RenderedInteractor mouseOut getting propagated?
        // d3.select(".custom-menu-margin").style("display", "none");
        // d3.select(".group-custom-menu-margin").style("display", "none");
    }

    getEventPoint(evt) {
        const p = this.svgElement.createSVGPoint();
        let element = this.svgElement.parentNode;
        let top = 0,
            left = 0;
        do {
            top += element.offsetTop || 0;
            left += element.offsetLeft || 0;
            element = element.offsetParent;
        } while (element);
        p.x = evt.clientX - left; //crossBrowserElementX(evt);//, this.svgElement);
        p.y = evt.clientY - top; //crossBrowserElementY(evt);//, this.svgElement);
        return p;
    }

    //stop event propagation and defaults; only do what we ask
    preventDefaultsAndStopPropagation(evt) {
        if (evt.stopPropagation)
            evt.stopPropagation();
        if (evt.cancelBubble != null)
            evt.cancelBubble = true;
        if (evt.preventDefault)
            evt.preventDefault();
    }

}

CrosslinkViewer.removeDomElement = function (child) {
    if (child && child.parentNode) {
        child.parentNode.removeChild(child);
    }
};

CrosslinkViewer.svgns = "http://www.w3.org/2000/svg"; // namespace for svg elements
CrosslinkViewer.linkWidth = 1.7; // default line width
//static values signifying Controller's status
CrosslinkViewer.STATES = {
    MOUSE_UP: 0,
    SELECT_PAN: 1,
    DRAGGING: 2,
    ROTATING: 3
};

CrosslinkViewer.barScales = [0.01, 0.2, 0.5, 0.8, 1, 2, 4, 8];
// networks with more cola nodes than this get auto grouped and collapsed before their first layout
CrosslinkViewer.LARGE_NETWORK_COLA_NODES = 500;
// leave nodes with a single link out of the cola layout and place them next to their neighbour (see getColaGraph)
CrosslinkViewer.PLACE_ONE_LINK_NODES = true;
// auto group strategies (keys of AUTO_GROUP_STRATEGIES) tried in order for large networks, until one finds groups.
// On DUC-XL-MS (6.7k proteins, 5171 cola nodes ungrouped) complexesInLocations leaves 306 cola nodes (30 top-level
// groups, 1167 in all, complexes kept and nested inside organelles), laminarAll 492 (66 top-level, 424 in all),
// goComplexLaminar 3438. These need QuickGO (and the first UniProt locations); location doesn't, so it's the last resort.
CrosslinkViewer.LARGE_NETWORK_GROUPING_STRATEGIES = ["complexesInLocations", "laminarAll", "goComplexLaminar", "location"];
// how long a large network waits without progress on UniProt annotations / GO grouping before being laid out ungrouped
CrosslinkViewer.LARGE_NETWORK_GROUPING_TIMEOUT_MS = 60000;
// resolves after the browser has had a chance to paint (e.g. a status message before a long blocking task)
CrosslinkViewer.yieldToBrowser = function () {
    return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
};

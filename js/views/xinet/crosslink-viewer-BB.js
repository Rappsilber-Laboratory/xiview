import "../../../css/xiNET.css";

import * as d3 from "d3";
// import * as _ from "underscore";
import Backbone from "backbone";
import * as cola from "../../../vendor/cola";

import {capture, makeXMLStr} from "../../../../xiview/js/svgexp";
import {filterStateToString, makeLegalFileName, searchesToString} from "../../../../xiview/js/utils";
import {download} from "../../../../xiview/js/downloads";

import {RenderedProtein} from "./interactor/rendered-protein";
import {RenderedCrosslink} from "./link/rendered-crosslink";
import {Group} from "./interactor/group";
import {P_PLink} from "./link/p_p-link";
import {G_GLink} from "./link/g_g-link";
import {ManualColourModel} from "../../../../xiview/js/model/color/protein-color-model";

export class CrosslinkViewer extends Backbone.View {

    // constructor(attributes, options) {
    //     super(_.extend(attributes, {
    //         events: {
    //         }
    //     }), options);
    // }

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
                // self.contextMenuParticipant.highlighted = true; // todo - look at - change hidden proteins in model
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

        // calculate default bar scale
        let maxSeqLength = 0;
        for (let participant of this.model.get("clmsModel").getProteinsIterator()) {
            if (participant.is_decoy === false && this.renderedProteins.has(participant.id) === false) {
                const newProtien = new RenderedProtein(participant, this);
                this.renderedProteins.set(participant.id, newProtien);

                const protSize = participant.size;
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

        const expand = this.renderedProteins.size < 4;
        for (let rp of this.renderedProteins.values()) {
            //to do - should this really be here
            this.proteinLower.appendChild(rp.lowerGroup);
            this.proteinUpper.appendChild(rp.upperGroup);
            if (!rp.stickZoom) {
                rp.stickZoom = this.defaultBarScale;
            }
            rp.scale();
            // rp.width;// cause it to store a constant value for unexpanded width?
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

        this.listenTo(window.vent, "proteinMetadataUpdated", this.proteinMetadataUpdated);

        this.listenTo(window.vent, "xinetSvgDownload", this.downloadSVG);
        this.listenTo(window.vent, "xinetAutoLayout", this.autoLayout);
        this.listenTo(window.vent, "xinetLoadLayout", this.loadLayout);
        this.listenTo(window.vent, "xinetSaveLayout", this.saveLayout);

        this.listenTo(window.vent, "collapseGroups", this.collapseGroups);
        this.listenTo(window.vent, "expandGroups", this.expandGroups);

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
                for (let rp of group.renderedParticipants) {
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
                group.renderedParticipants = [];
                for (let pId of g[1]) {
                    const p = this.renderedProteins.get(pId);
                    if (p) { // no decoys in this.renderedProteins
                        group.renderedParticipants.push(this.renderedProteins.get(pId));
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
            g.leaves = []; // different from g.renderedParticipants coz only contains ungrouped RenderedProteins, used by cola.js
            g.groups = []; // indexes of subgroups in resulting groupArr, used by cola.js // needed? prob not coz groups already referred to by index

            for (let rp of g.renderedParticipants) {
                rp.parentGroups.delete(g); // sometimes it won't have contained g as parentGroup
            }
        }

        //sort it by count not hidden (not manually hidden and not filtered)
        const sortedGroupMap = new Map([...this.groupMap.entries()].sort((a, b) => a[1].unhiddenParticipantCount - b[1].unhiddenParticipantCount));

        // get maximal set of possible subgroups
        const groups = Array.from(sortedGroupMap.values());
        const gCount = groups.length; // contains xiNET.Groups
        for (let gi = 0; gi < gCount - 1; gi++) {
            const group1 = groups[gi];
            if (group1.unhiddenParticipantCount > 0) {
                for (let gj = gi + 1; gj < gCount; gj++) {
                    const group2 = groups[gj];
                    if (group1.isSubsetOf(group2)) {
                        group2.subgroups.push(group1);
                        console.log(group1.name, "is SUBSET of", group2.name);
                    }
                }
            }
        }

        for (let g of groups) {
            for (let rp of g.renderedParticipants) {
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
            if (renderedParticipant.participant.manuallyHidden === true) {
                manuallyHidden++;
            }
            if (renderedParticipant.inCollapsedGroup() === false) {
                renderedParticipant.setHidden(renderedParticipant.participant.hidden);
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


        for (let group of groups) {
            if (!group.expanded && group.isOverlappingGroup()) {
                group.setExpanded(true);
            }
        }
        for (let group of groups) {
            let hasVisible = false;
            for (let p of group.renderedParticipants) {
                if (p.participant.hidden === false) {
                    hasVisible = true;
                }
            }
            if (!hasVisible || group.inCollapsedGroup()) {
                group.setHidden(true);
            } else {
                group.setHidden(false);
                group.updateCountLabel();
                if (group.expanded) {
                    group.updateExpandedGroup();
                } else {
                    group.setPosition(group.ix, group.iy);
                }
            }
        }

        /*
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
        for (let graph of this.subgraphs) {
            // const nodes = graph.nodes.values();
            const nodeCount = graph.nodes.size;
            let isLinear = true;
            if (nodeCount === 1) {
                isLinear = true;
            } else {
                var endFound = false;
                for (let node of graph.nodes.values()) {
                    const externalLinkCount = node.countExternalLinks();
                    // console.log("ELC*: " + externalLinkCount);
                    if (node.expanded === true) {
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
        }*/

        return this;
    }

    render() {
        console.log("xiNET RENDER");
        this.d3cola.stop();
        if (this.firstRender) { // first render
            this.firstRender = false;
            // if (this.model.get("clmsModel").get("xiNETLayout")) {
            //     this.loadLayout(this.model.get("clmsModel").get("xiNETLayout").layout);
            // } else {
            this.autoLayout([]); //layout all
            // }
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
                ppLink.renderedFromProtein.participant.hidden ||
                ppLink.renderedToProtein.participant.hidden) {
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
                ggLink.hide();
            }
        }
        for (let id of ggLinkIdsToRemove) {
            this.g_gLinks.delete(id);
        }
    }

    autoLayoutGroup(group, fixedParticipants) {
        console.log("xiNET AUTO LAYOUT SINGLE GROUP");
        this.d3cola.stop();

        const linkLength = (this.renderedProteins.size < 20) ? 40 : 20;
        const width = this.svgElement.parentNode.clientWidth;
        const height = this.svgElement.parentNode.clientHeight;

        for (let renderedProtein of this.renderedProteins.values()) {
            if (fixedParticipants.length === 0) {
                delete renderedProtein.x;
                delete renderedProtein.y;
                delete renderedProtein.px;
                delete renderedProtein.py;
            }
            renderedProtein.fixed = fixedParticipants.indexOf(renderedProtein.participant) !== -1;
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

        this.d3cola.size([height - /*layoutXOffset -*/ 40, width - 40]).symmetricDiffLinkLengths(linkLength);

        const self = this;

        const links = new Map();
        const nodeSet = new Set();
        for (let crosslink of self.model.getFilteredCrossLinks()) {
            // for (let graph of this.nonLinearGraphs) {
            //     for (let link of graph.links.values()) {
            if (crosslink.toProtein) { // not linears
                // if (link.crosslinks[0].isSelfLink() === false) {
                const source = self.renderedProteins.get(crosslink.fromProtein.id).getRenderedInteractor();
                const target = self.renderedProteins.get(crosslink.toProtein.id).getRenderedInteractor();
                if (group.renderedParticipants.indexOf(source) !== -1 || group.renderedParticipants.indexOf(target) !== -1) {
                    nodeSet.add(source);
                    const fromId = crosslink.fromProtein.id;
                    const toId = crosslink.toProtein.id;
                    const linkId = fromId + "-" + toId;
                    if (!links.has(linkId)) {
                        const linkObj = {};
                        // todo - maybe do use indexes, might avoid probs in cola
                        linkObj.source = source;
                        linkObj.target = target;
                        nodeSet.add(target); // bit weird doing ths here
                        linkObj.id = linkId;
                        links.set(linkId, linkObj);
                    }
                }
            }
        }

        const nodeArr = Array.from(nodeSet);
        const linkArr = Array.from(links.values());
        doLayout(nodeArr, linkArr);

        function doLayout(nodes, links) {
            //don't know how necessary these deletions are
            delete self.d3cola._lastStress;
            delete self.d3cola._alpha;
            delete self.d3cola._descent;
            delete self.d3cola._rootGroup;

            const groups = [];
            if (self.groupMap) {
                for (let g of self.groupMap.values()) {
                    delete g.index;
                    if (!g.hidden && g.expanded) {
                        g.groups = [];
                        // put any rp not contained in a subgroup in group1.leaves
                        for (let rp of g.renderedParticipants) {
                            if (!rp.hidden) {
                                let inSubGroup = false;
                                for (let subgroup of g.subgroups) {
                                    if (subgroup.contains(rp)) {
                                        inSubGroup = true;
                                        break;
                                    }
                                }
                                if (!inSubGroup) {
                                    g.leaves.push(nodes.indexOf(rp));
                                }
                            }
                        }
                        groups.push(g);
                    }
                }
                //need to use indexes of groups
                for (let g of groups) {
                    console.log("GROUP ", g.unhiddenParticipantCount, g.id);
                    for (let i = 0; i < g.subgroups.length; i++) {
                        console.log("\tSUBGROUP ", g.subgroups[i].unhiddenParticipantCount, g.subgroups[i].id);
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

                                } else {
                                    g.leaves.push(g.subgroups[i]);
                                }
                            }
                        }
                    }
                }
            }

            const cmp = self.contextMenuPoint;

            self.d3cola.nodes(nodes).groups(groups).links(links).start(23, 10, 1, 0, true).on("tick", function () { //.start(23, 10, 1, 0, true)
                for (let node of self.d3cola.nodes()) {
                    node.setPositionFromXinet((node.x * self.z)  - ((width/2 * self.z)) + cmp.x,
                        (node.y * self.z)  - ((height/2 * self.z)) + cmp.y);
                    // node.setPositionFromXinet((node.x * self.z) - ((cmp.x - (width/2)) * self.z),
                    //     (node.y * self.z) - ((cmp.y - (width/2)) * self.z) + 30);
                    // // node.setPositionFromCola();
                    node.setAllLinkCoordinates();
                }
                for (let g of self.d3cola.groups()) { // todo -  seems a bit of a weird way to have done this?
                    if (g.expanded) {
                        g.updateExpandedGroup();
                    }
                }
            });
        }
    }

    autoLayout(fixedParticipants) {
        console.log("xiNET AUTO LAYOUT");
        this.d3cola.stop();
        if (fixedParticipants.length === 0) {
            this.container.setAttribute("transform", "scale(" + 1 + ")");// translate(" + ((width / scaleFactor) - bbox.width - bbox.x) + " " + -bbox.y + ")");
            this.scale();
        }

        const linkLength = (this.renderedProteins.size < 20) ? 40 : 20;
        const width = this.svgElement.parentNode.clientWidth;
        const height = this.svgElement.parentNode.clientHeight;

        /*        const tempGroupMap = new Map (this.groupMap);

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
                    var lastNodeY = this.yForRow(row + ((nodeCount - 1 - n) * 2));
                    let lowerBound = height;
                    if (column < 4) {
                        lowerBound = lowerBound - 100;
                    }
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
        const layoutXOffset = this.xForColumn(column + 1);*/

        for (let renderedProtein of this.renderedProteins.values()) {
            if (fixedParticipants.length === 0) {
                delete renderedProtein.x;
                delete renderedProtein.y;
                delete renderedProtein.px;
                delete renderedProtein.py;
            }
            renderedProtein.fixed = fixedParticipants.indexOf(renderedProtein.participant) !== -1;
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

        this.d3cola.size([height - /*layoutXOffset -*/ 40, width - 40]).symmetricDiffLinkLengths(linkLength);

        const self = this;

        const links = new Map();
        const nodeSet = new Set();
        for (let crosslink of self.model.getFilteredCrossLinks()) {
        // for (let graph of this.nonLinearGraphs) {
        //     for (let link of graph.links.values()) {
            if (crosslink.toProtein) { // not linears
            // if (link.crosslinks[0].isSelfLink() === false) {
                const source = self.renderedProteins.get(crosslink.fromProtein.id).getRenderedInteractor();
                const target = self.renderedProteins.get(crosslink.toProtein.id).getRenderedInteractor();
                nodeSet.add(source);
                const fromId = crosslink.fromProtein.id;
                const toId = crosslink.toProtein.id;
                const linkId = fromId + "-" + toId;
                if (!links.has(linkId)) {
                    const linkObj = {};
                    // todo - maybe do use indexes, might avoid probs in cola
                    linkObj.source = source;
                    linkObj.target = target;
                    nodeSet.add(target); // bit weird doing ths here
                    linkObj.id = linkId;
                    links.set(linkId, linkObj);
                }
            }
        }
        // }
        const nodeArr = Array.from(nodeSet);
        const linkArr = Array.from(links.values());
        doLayout(nodeArr, linkArr);

        function doLayout(nodes, links) {
            //don't know how necessary these deletions are
            delete self.d3cola._lastStress;
            delete self.d3cola._alpha;
            delete self.d3cola._descent;
            delete self.d3cola._rootGroup;

            const groups = [];
            if (self.groupMap) {
                for (let g of self.groupMap.values()) {
                    delete g.index;
                    if (!g.hidden && g.expanded) {
                        g.groups = [];
                        // put any rp not contained in a subgroup in group1.leaves
                        for (let rp of g.renderedParticipants) {
                            if (!rp.hidden) {
                                let inSubGroup = false;
                                for (let subgroup of g.subgroups) {
                                    if (subgroup.contains(rp)) {
                                        inSubGroup = true;
                                        break;
                                    }
                                }
                                if (!inSubGroup) {
                                    g.leaves.push(nodes.indexOf(rp));
                                }
                            }
                        }
                        groups.push(g);
                    }
                }
                //need to use indexes of groups
                for (let g of groups) {
                    console.log("GROUP ", g.unhiddenParticipantCount, g.id);
                    for (let i = 0; i < g.subgroups.length; i++) {
                        console.log("\tSUBGROUP ", g.subgroups[i].unhiddenParticipantCount, g.subgroups[i].id);
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

                                } else {
                                    g.leaves.push(g.subgroups[i]);
                                }
                            }
                        }
                    }
                }
            }
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
            self.d3cola.nodes(nodes).groups(groups).links(links).start(23, 10, 1, 0, true).on("tick", function () { //.start(23, 10, 1, 0, true)
                // let x1 = null, y1 = null, x2 = null, y2 = null;
                // for (let node of self.d3cola.nodes()) {
                //     if (!x1 || node.x < x1) {
                //         x1 = node.x;
                //     }
                //     if (!y1 || node.y < y1) {
                //         y1 = node.y;
                //     }
                //     if (!x2 || node.x > x2) {
                //         x2 = node.x;
                //     }
                //     if (!y2 || node.y > y2) {
                //         y2 = node.y;
                //     }
                // }
                //
                // let c = 0;
                // let xr = (width - /*layoutXOffset -*/ 120) / (x2 - x1);
                // let yr = ((height - 60) / (y2 - y1));

                for (let node of self.d3cola.nodes()) {
                    // node.setPositionFromCola((node.x * xr) - (x1 * xr) /*+ layoutXOffset*/,
                    //     (node.y * yr) - (y1 * yr) + 30);
                    node.setPositionFromCola();
                    node.setAllLinkCoordinates();
                }
                for (let g of self.d3cola.groups()) { // todo -  seems a bit of a weird way to have done this?
                    if (g.expanded) {
                        g.updateExpandedGroup();
                    }
                }
                if (fixedParticipants.length === 0) {
                    self.zoomToFullExtent();
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
            //}
        }
    }

    // //functions used...
    // xForColumn(c) {
    //     const maxBlobRadius = 40;
    //     // var LABELMAXLENGTH = 0;
    //     // return (c * ((2 * maxBlobRadius) + LABELMAXLENGTH)) - maxBlobRadius;
    //     return c * maxBlobRadius - (maxBlobRadius / 2);
    // }
    //
    // yForRow(r) {
    //     const maxBlobRadius = 50;
    //     return (r * maxBlobRadius) - 10;
    // }
    //
    // reorderedNodes(linearGraph) {
    //     const reorderedNodes = [];
    //     appendNode(getStartNode(), new Set ());
    //     return reorderedNodes;
    //
    //     function getStartNode() {
    //         // var ns = Array.from(linearGraph.nodes.values());
    //         // var count = ns.length;
    //         // //                    alert (nodeCount);
    //         // for (var n = 0; n < count; n++) {
    //         //     if (ns[n].countExternalLinks() < 2) {
    //         //         //                            alert("got start");
    //         //         return ns[n];
    //         //     }
    //         // }
    //         for (let node of linearGraph.nodes.values()) {
    //             if (node.countExternalLinks() < 2) {
    //                 console.log("StartNode", node.id);
    //                 return node;
    //             }
    //         }
    //         console.error("missed linear subgraph start");
    //         return null;
    //     }
    //
    //     function appendNode(currentNode, checkedNodes) {
    //         checkedNodes.add(currentNode.id); // yeah, wierdness, this all needs tidied up
    //         if (!currentNode.hidden) {
    //             reorderedNodes.push(currentNode.participant.id);
    //         }
    //
    //         // var proteinLinksArr = Array.from(currentNode.renderedP_PLinks.values());
    //         // for (var l = 0; l < proteinLinksArr.length; l++) {
    //         //     var link = proteinLinksArr[l];
    //         //     if (link.isPassingFilter()) {
    //         //         var nextNode = link.getOtherEnd(currentNode);
    //         //         if (reorderedNodes.indexOf(nextNode.participant.id) === -1) {
    //         //             //                    alert("here");
    //         //             appendNode(nextNode);
    //         //             break;
    //         //         }
    //         //     }
    //         // }
    //
    //         for (let link of currentNode.renderedP_PLinks.values()) {
    //             if (link.isPassingFilter()) {
    //                 const nextNode = link.getOtherEnd(currentNode);
    //                 if (!checkedNodes.has(nextNode.id)) {
    //                     console.log("nextNode", nextNode.id);
    //                     appendNode(nextNode, checkedNodes);
    //                     break;
    //                 }
    //             }
    //         }
    //     }
    // }

    saveLayout(callback) {
        const layout = {};
        const proteinColourModel = this.model.get("proteinColourAssignment");
        if (proteinColourModel instanceof ManualColourModel) {
            layout.manualColourAssignment = JSON.stringify(Object.fromEntries(proteinColourModel.colourAssignment));
        }
        layout.groups = Array.from(this.groupMap.values());
        layout.proteins = Array.from(this.renderedProteins.values());
        const myJSONText = JSON.stringify(layout, null);
        console.log("SAVING", layout);
        callback(myJSONText.replace(/\\u0000/gi, ""));
    }

    //todo - this is becoming about config of all xiVIEw not just config of xiNET, should be moved
    loadLayout(layout) {
        console.log("xiNET LOAD LAYOUT", layout);
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
                protein.participant.manuallyHidden = protLayout["manuallyHidden"];

                if (protLayout["name"]) {
                    protein.participant.name = protLayout["name"];
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

                for (let pId of savedGroup.participantIds) {
                    if (this.renderedProteins.get(pId)) {
                        presentProteins.add(pId);
                    }
                }
                if (presentProteins.size === 0) {
                    // layoutIsDodgy = true;
                    // this prob happens as a result of revalidating data in lab version
                    console.log("! group in layout but no proteins in search:" + savedGroup.id + "; " + savedGroup.participantIds);
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
            window.linkColor.manualProteinColoursBB.setMap(JSON.parse(layout.manualColourAssignment));
            this.model.set("proteinColourAssignment", window.linkColor.manualProteinColoursBB);
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
        const fileName = makeLegalFileName(searchesToString() + "--xiNET--" + filterStateToString());
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
                        renderedCrossLink.renderedFromProtein.participant.id + "-" + renderedCrossLink.renderedToProtein.participant.id);
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
                        renderedCrossLink.renderedFromProtein.participant.id + "-" + renderedCrossLink.renderedToProtein.participant.id);
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
            if (selectedProteins.indexOf(renderedProtein.participant) === -1 ){//&& renderedProtein.isSelected === true) {
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
            if (highlightedProteins.indexOf(renderedProtein.participant) === -1){//} && renderedProtein.highlight === true) {
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
                for (let rp of g.renderedParticipants) {
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
        const proteinColourModel = window.compositeModelInst.get("proteinColourAssignment");
        for (let renderedParticipant of this.renderedProteins.values()) {
            if (proteinColourModel) {
                const c = proteinColourModel.getColour(renderedParticipant.participant);
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
        const margin = 50;
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
            + ") translate(" + ((width / scaleFactor) - bbox.width - bbox.x + (margin / scaleFactor)) + " " + (-bbox.y + (margin / scaleFactor)) + ")");
        this.scale();
    }

    scale() {
        this.z = this.container.getCTM().inverse().a;
        if (this.z < 0) {
            console.error("weird negative value for this.z");
            this.z = 1;
        }
        for (let prot of this.renderedProteins.values()) {
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
            if (p_pLink.renderedToProtein && p_pLink.renderedFromProtein !== p_pLink.renderedToProtein &&
                !p_pLink.renderedFromProtein.expanded && !p_pLink.renderedToProtein.expanded) {
                if (p_pLink.line) {
                    p_pLink.line.setAttribute("stroke-width", this.z * CrosslinkViewer.linkWidth);
                    p_pLink.highlightLine.setAttribute("stroke-width", this.z * 10);
                    p_pLink.updateThickLineWidth();
                    if (p_pLink.ambiguous) {
                        p_pLink.dashedLine(true); //rescale spacing of dashes // performance issue?
                    }
                }
            }
        }
        for (let gg of this.g_gLinks.values()) {
            if (gg.group1 !== gg.group2) {
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
        for (let renderedProtein of this.renderedProteins.values()) {
            renderedProtein.setPositionalFeatures();
        }
    }

    setCTM(element, matrix) {
        const s = "matrix(" + matrix.a + "," + matrix.b + "," + matrix.c + "," + matrix.d + "," + matrix.e + "," + matrix.f + ")";
        element.setAttribute("transform", s);
    }

    mouseDown(evt) {
        evt.preventDefault();
        this.d3cola.stop();
        this.dragStart = evt;
        this.state = CrosslinkViewer.STATES.SELECT_PAN;
        this.mouseMoved = false;
        this.toSelect = [];
        d3.select(".xinet-context-menu").style("display", "none");
    }

    // dragging/rotating/panning/selecting
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
                            const toDrag = this.dragElement.renderedParticipants;
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
                    } else if (this.dragElement.participant || this.dragElement.type === "group"){ //collapsed group or protein
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
                                renderedParticipant.highlighted = true; // todo - use model
                                this.toSelect.push(renderedParticipant.participant);
                            } else {
                                renderedParticipant.highlighted = false; // todo - use model
                            }
                        }

                    }
                    for (let renderedGroup of this.groupMap.values()) {
                        if (renderedGroup.hidden !== true && renderedGroup.expanded === false) {
                            const intersects = this.svgElement.getIntersectionList(svgRect, renderedGroup.upperGroup);
                            if (intersects.length > 0) {
                                renderedGroup.highlighted = true;  // todo - use model?
                                for (let renderedParticipant of renderedGroup.renderedParticipants) {
                                    this.toSelect.push(renderedParticipant.participant);
                                }
                            } else {
                                renderedGroup.highlighted = false;  // todo - use model?
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

    // this ends all dragging and rotating
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
                    } else if (this.dragElement.participant && !this.mouseMoved) { // it's a protein
                        // ADD SINGLE PROTEIN TO SELECTION - LEFT CLICK, NO MOVE, IS A DRAG ELEMENT
                        this.model.setSelectedProteins([this.dragElement.participant], add);
                    } else if (this.dragElement.participant && add && this.mouseMoved) {
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
                            this.model.addProteinToGroup(group.id, this.dragElement.participant.id);
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

        if (renderedInteractor.participant) { //protein
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
                window.open("https://www.uniprot.org/uniprotkb?query=" + renderedInteractor.participant.accession);
            });

            menuListSel.append("li").text("Set Protein Colour").on("click", () => {
                //todo: set protein colour for all selected proteins?
                this.model.chooseInteractorColor(renderedInteractor.participant.id);
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
                    renderedInteractor.participant.alphaLinkStoich? renderedInteractor.participant.alphaLinkStoich : 1)
                .on("change", () => {
                    const stoich = d3.select("#alphaLinkStoich").property("value");
                    // console.log("STOICH", stoich);
                    renderedInteractor.participant.alphaLinkStoich = stoich;
                });

            if (proteinColourModel instanceof ManualColourModel) {
                if (proteinColourModel.hasManualAssignment(renderedInteractor.participant.id)) {
                    menuListSel.append("li").text("Remove Protein Colour").on("click", () => {
                        proteinColourModel.removeManualAssignment(renderedInteractor.participant.id);
                        this.model.trigger("currentProteinColourModelChanged", proteinColourModel);
                        d3.select(".xinet-context-menu").style("display", "none");
                    });
                }
            }

            for (let pg of renderedInteractor.parentGroups) {
                menuListSel.append("li").text("Remove from group " + pg.name)
                    .attr("data-group", pg.name).attr("data-protein", renderedInteractor.participant.id)
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
                // menuListSel.append("li").text("Autolayout Group").on("click", () => {
                //     this.autoLayoutGroup(renderedInteractor, []);
                //     d3.select(".xinet-context-menu").style("display", "none");
                // });
            } else {
                menuListSel.append("li").text("Expand Group").on("click", () => {
                    renderedInteractor.setExpanded(true, this.getEventPoint(evt));
                    d3.select(".xinet-context-menu").style("display", "none");
                });
            }

            menuListSel.append("li").text("Ungroup").on("click", () => {
                this.ungroup(renderedInteractor);
                d3.select(".xinet-context-menu").style("display", "none");
            });

            menuListSel.append("li").text("Set Group Colour").on("click", () => {
                this.model.chooseInteractorColor(renderedInteractor.id);
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

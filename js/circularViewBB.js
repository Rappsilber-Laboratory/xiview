//      circular protein cross-link view
//
//      Martin Graham, Colin Combe, Rappsilber Laboratory, 2015


var CLMSUI = CLMSUI || {};


CLMSUI.circleLayout = function(nodeArr, linkArr, featureArrs, range, options) {

    var defaults = {
        gap: 5,
        linkParse: function(link) {
            return {
                fromPos: link.fromPos,
                fromNodeID: link.fromNodeID,
                toPos: link.toPos,
                toNodeID: link.toNodeID
            };
        },
        featureParse: function(feature, node) {
            return {
                fromPos: feature.start - 1,
                toPos: feature.end // - 1
            };
        },
    };
    var _options = _.extend(defaults, options);

    var totalLength = nodeArr.reduce(function(total, interactor) {
        return total + (interactor.size || 1); // for some reason, some people use an ambiguous protein with no size declared, which causes NaN's
    }, 0);

    var realRange = range[1] - range[0];
    var noOfGaps = nodeArr.length;
    // Fix so gaps never take more than a quarter the display circle in total
    _options.gap = Math.min((realRange / 4) / noOfGaps, _options.gap);

    // work out the length a gap needs to be in the domain to make a _options.gap length in the range
    var ratio = totalLength / (realRange - (_options.gap * noOfGaps));
    var dgap = _options.gap * ratio;
    totalLength += dgap * noOfGaps;
    var scale = d3.scale.linear().domain([0, totalLength]).range(range);
    var total = dgap / 2; // start with half gap, so gap at top is symmetrical (like a double top)

    var nodeCoordMap = d3.map();
    nodeArr.forEach(function(node) {
        var size = node.size || 1; // again size is sometimes not there for some artificial protein (usually an ambiguous placeholder)
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
        //CLMSUI.utils.xilog ("prot", nodeCoordMap.get(node.id));
    });

    var featureCoords = [];
    var fid = 0;
    featureArrs.forEach(function(farr, i) {
        var nodeID = nodeArr[i].id;
        var nodeCoord = nodeCoordMap.get(nodeID);
        farr.forEach(function(feature) {
            var tofrom = _options.featureParse(feature, nodeID);
            //CLMSUI.utils.xilog (nodeArr[i].name, "nc", nodeCoord, farr, tofrom, "ORIG FEATURE", feature);
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
    //CLMSUI.utils.xilog ("CONV FEATURES", featureCoords);

    var linkCoords = linkArr.map (function(link) {
        var tofrom = _options.linkParse(link);
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

CLMSUI.CircularViewBB = CLMSUI.utils.BaseFrameView.extend({
    events: function() {
        var parentEvents = CLMSUI.utils.BaseFrameView.prototype.events;
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
    },

    defaultOptions: {
        nodeWidth: 10, // this is a percentage measure
        tickWidth: 23,
        tickLabelCycle: 5, // show label every nth tick
        gap: 5,
        linkParse: function(link) {
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
    },

    initialize: function(viewOptions) {
        var self = this;

        this.defaultOptions.featureParse = function(feature, nodeid) {
            // feature.start and .end are 1-indexed, and so are the returned convStart and convEnd values
            if (feature.start == undefined) {
                feature.start = +feature.begin;
            }
            var convStart = +feature.start;
            var convEnd = +feature.end;
            var type = feature.type.toLowerCase();
            var protAlignModel = self.model.get("alignColl").get(nodeid);

            var annotationColl = self.model.get ("annotationTypes");
            var annotationTypeModel = annotationColl.get (annotationColl.modelId (feature));
            var annotationTypeModelAlignmentID = annotationTypeModel ? annotationTypeModel.get("typeAlignmentID") : undefined;

            if (protAlignModel) {
                var alignmentID = feature.alignmentID || annotationTypeModelAlignmentID; // individual feature alignment ids trump feature type alignment ids
                /*
                convStart = protAlignModel.mapToSearch (alignmentID, +feature.start);
                convEnd = protAlignModel.mapToSearch (alignmentID, +feature.end);
                if (convStart <= 0) { convStart = -convStart; }   // <= 0 indicates no equal index match, do the - to find nearest index
                if (convEnd <= 0) { convEnd = -convEnd; }         // <= 0 indicates no equal index match, do the - to find nearest index
                */
                if (alignmentID) {
                    var convertedRange = protAlignModel.rangeToSearch(alignmentID, convStart, convEnd);
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

            CLMSUI.utils.xilog(feature, "convStart", +feature.start, convStart, "convEnd", +feature.end, convEnd, protAlignModel);
            return {
                fromPos: convStart,
                toPos: convEnd
            };
        };

        // if protein default colour model use this instead for legibility
        this.replacementDefaultNodeColourModel = {
            getColour: function () { return "#dde"; }
        };

        CLMSUI.CircularViewBB.__super__.initialize.apply(this, arguments);

        // this.el is the dom element this should be getting added to, replaces targetDiv
        var mainDivSel = d3.select(this.el);
        // defs to store path definitions for curved text, two nested g's, one for translating, then one for rotating
        var template = _.template("<DIV class='toolbar toolbarArea'></DIV><DIV class='panelInner backdrop' flex-grow='1'><svg class='<%= svgClass %>'><defs></defs><g><g></g></g></svg></DIV>");
        mainDivSel.append("div")
            .attr("class", "verticalFlexContainer")
            .html(
                template({
                    svgClass: "circularView",
                })
            )
        ;

        mainDivSel.select(".backdrop")
            // can replace .backdrop class colouring with this option if defined
            .style("background-color", this.options.background)
        ;


        var buttonData = [{
            class: "downloadButton",
            label: CLMSUI.utils.commonLabels.downloadImg + "SVG",
            type: "button",
            id: "download"
        }, ];

        var toolbar = mainDivSel.select("div.toolbar");
        CLMSUI.utils.makeBackboneButtons(toolbar, self.el.id, buttonData);


        // DROPDOWN STARTS
        // Various view options set up, then put in a dropdown menu
        var orderOptionsButtonData = [{
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
            .filter(function(d) {
                return d.type === "radio";
            })
            .forEach(function(d) {
                d.initialState = this.options.sort === d.id;
                d.inputFirst = true;
                d.func = function() {
                    self.options.sort = d.raw_id;
                    self.reOrderAndRender({
                        reverseConsecutive: true
                    });
                };
            }, this);
        CLMSUI.utils.makeBackboneButtons(toolbar, self.el.id, orderOptionsButtonData);

        var orderoptid = this.el.id + "OrderOptions";
        toolbar.append("p").attr("id", orderoptid);
        new CLMSUI.DropDownMenuViewBB({
            el: "#" + orderoptid,
            model: self.model.get("clmsModel"),
            myOptions: {
                title: "Order Proteins ▼",
                menu: orderOptionsButtonData.map(function(d) {
                    d.id = self.el.id + d.id;
                    d.tooltip = d.d3tooltip;
                    return d;
                }),
                closeOnClick: false,
                tooltipModel: self.model.get("tooltipModel")
            }
        });


        var showOptionsButtonData = [{
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
            .forEach(function(d) {
                d.type = "checkbox";
                d.inputFirst = true;
            });
        CLMSUI.utils.makeBackboneButtons(toolbar, self.el.id, showOptionsButtonData);

        var showoptid = this.el.id + "ShowOptions";
        toolbar.append("p").attr("id", showoptid);
        new CLMSUI.DropDownMenuViewBB({
            el: "#" + showoptid,
            model: self.model.get("clmsModel"),
            myOptions: {
                title: "Show ▼",
                menu: showOptionsButtonData.map(function(d) {
                    d.id = self.el.id + d.id;
                    d.tooltip = d.d3tooltip;
                    return d;
                }),
                closeOnClick: false,
                tooltipModel: self.model.get("tooltipModel"),
            }
        });


        // DROPDOWN ENDS

        var degToRad = Math.PI / 180;

        // Lets user rotate diagram
        var backgroundDrag = d3.behavior.drag();
        backgroundDrag.on("dragstart", function() {
                d3.event.sourceEvent.stopPropagation();
                d3.event.sourceEvent.stopImmediatePropagation();
                d3.event.sourceEvent.preventDefault();
                var curTheta = d3.transform(svg.select("g g").attr("transform")).rotate * degToRad;
                var mc = d3.mouse(this);
                var dragStartTheta = Math.atan2(mc[1] - self.radius, mc[0] - self.radius);
                backgroundDrag.offTheta = curTheta - dragStartTheta;
            })
            .on("drag", function() {
                var dmc = d3.mouse(this);
                var theta = Math.atan2(dmc[1] - self.radius, dmc[0] - self.radius);
                theta += backgroundDrag.offTheta;
                svg.select("g g").attr("transform", "rotate(" + (theta / degToRad) + ")");
            })
        ;

        var svg = mainDivSel.select("svg");//.call(backgroundDrag);

        this.nodeDrag = d3.behavior.drag();
        this.nodeDrag.reOrder = function(d) {
            var mc = d3.mouse(svg.node());
            var dragTheta = Math.atan2(mc[1] - self.radius, mc[0] - self.radius);
            var deg = (((dragTheta / degToRad) + 90) + 360) % 360;
            var offsetDeg = deg - self.nodeDrag.startDeg;

            var newStart = (d.start + offsetDeg + 360) % 360;
            var newEnd = (d.end + offsetDeg + 360) % 360;

            var nodeData = d3.select(self.el).select(".nodeLayer").selectAll(".circleNode").data()
                .map(function(nd) {
                    return {
                        id: nd.id,
                        start: nd.start,
                        end: nd.end
                    };
                });
            var thisNode = nodeData.filter(function(nd) {
                return nd.id === d.id;
            })[0];
            thisNode.start = newStart;
            thisNode.end = newEnd;

            nodeData.sort(function(a, b) {
                var aMid = (a.start + a.end + (a.end < a.start ? 360 : 0)) % 720; // add 360 to end values smaller than start (zero wraparound)
                var bMid = (b.start + b.end + (b.end < b.start ? 360 : 0)) % 720;
                return aMid - bMid;
            });
            var bespokeOrder = _.object(
                _.pluck (nodeData, "id"),
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
        this.nodeDrag.on("dragstart", function() {
                d3.event.sourceEvent.stopPropagation();
                d3.event.sourceEvent.preventDefault();
                var mc = d3.mouse(svg.node());
                self.nodeDrag.startClick = mc;
                var dragStartTheta = Math.atan2(mc[1] - self.radius, mc[0] - self.radius);
                self.nodeDrag.startDeg = (((dragStartTheta / degToRad) + 90) + 360) % 360;
                // draw drag representation if >1 protein displayed
                if (self.filterInteractors(self.model.get("clmsModel").get("participants")).length > 1) {
                    d3.select(this).classed("draggedNode", true);
                }
                self.nodeDrag.visited = true;
            })
            .on("drag", function(d) {
                d3.event.sourceEvent.stopPropagation();
                d3.event.sourceEvent.preventDefault();
                self.nodeDrag.reOrder(d);
            })
            .on("dragend", function(d) {
                d3.event.sourceEvent.stopPropagation(); // stop event getting picked up by backdrop listener which cancels all selections
                d3.event.sourceEvent.preventDefault();
                d3.select(this).classed("draggedNode", false);
                self.nodeDrag.reOrder(d);
                var mc = d3.mouse(svg.node());
                var movementSq = Math.pow (mc[0] - self.nodeDrag.startClick[0], 2) + Math.pow (mc[1] - self.nodeDrag.startClick[1], 2);
                if (movementSq < 9) {
                    self.selectNode.call (self, d);
                }
                d3.event.sourceEvent.stopPropagation(); // stop event getting picked up by backdrop listener which cancels all selections
                d3.event.sourceEvent.stopImmediatePropagation();
                d3.event.sourceEvent.preventDefault();
            });


        // for internal circle paths
        this.line = d3.svg.line.radial()
            .interpolate("bundle")
            .tension(0.45)
            .radius(function(d) {
                return d.rad;
            })
            .angle(function(d) {
                return d.ang * degToRad;
            });

        // 'bundle' intersects circle when trying to draw curves around circumference of circle between widely separated points
        this.outsideLine = d3.svg.line.radial()
            .interpolate("basis")
            .tension(0.45)
            .radius(function(d) {
                return d.rad;
            })
            .angle(function(d) {
                return d.ang * degToRad;
            });

        var arcs = ["arc", "textArc", "featureArc", "resLabelArc"];
        arcs.forEach(function(arc) {
            this[arc] = d3.svg.arc()
                .innerRadius(90)
                .outerRadius(100)
                .startAngle(function(d) {
                    return d.start * degToRad;
                }) // remembering to convert from degs to radians
                .endAngle(function(d) {
                    return d.end * degToRad;
                });
        }, this);

        this.clearTip = function() {
            self.model.get("tooltipModel").set("contents", null);
        };

        this.nodeTip = function(d) {
            var interactor = self.model.get("clmsModel").get("participants").get(d.id);
            self.model.get("tooltipModel")
                .set("header", CLMSUI.modelUtils.makeTooltipTitle.interactor(interactor))
                .set("contents", CLMSUI.modelUtils.makeTooltipContents.interactor(interactor))
                .set("location", {
                    pageX: d3.event.pageX,
                    pageY: d3.event.pageY
                });
        };

        this.linkTip = function(d) {
            var xlink = self.model.get("clmsModel").get("crossLinks").get(d.id);
            self.model.get("tooltipModel")
                .set("header", CLMSUI.modelUtils.makeTooltipTitle.link())
                .set("contents", CLMSUI.modelUtils.makeTooltipContents.link(xlink))
                .set("location", {
                    pageX: d3.event.pageX,
                    pageY: d3.event.pageY
                });
        };

        this.featureTip = function(d) {
            self.model.get("tooltipModel")
                .set("header", CLMSUI.modelUtils.makeTooltipTitle.feature())
                .set("contents", CLMSUI.modelUtils.makeTooltipContents.feature(d))
                .set("location", {
                    pageX: d3.event.pageX,
                    pageY: d3.event.pageY
                });
        };

        // return order as is
        this.interactorOrder = _.pluck(Array.from(this.model.get("clmsModel").get("participants").values()), "id");

        var alignCall = 0;

        // listen to custom filteringDone event from model
        this.listenTo(this.model, "filteringDone", function() {
            // filtering can change node and thus feature positioning too if proteins are hidden or rearranged by sorting
            if (!self.options.showLinkless || self.options.sort === "best") {
                self.render();
            } else {
                self.renderPartial(["links", "nodes"]);
            }
        });
        this.listenTo(this.model, "change:selection", function() {
            this.options.showSelectedOnly ? this.renderPartial(["links"]) : this.showAccentedLinks("selection");
        });
        this.listenTo(this.model, "change:highlights", function() {
            this.showAccentedLinks("highlights");
        });
        this.listenTo(this.model, "change:selectedProteins", function() {
            this.showAccentedNodes("selection");
        });
        this.listenTo(this.model, "change:highlightedProteins", function() {
            this.showAccentedNodes("highlights");
        });
        this.listenTo(this.model.get("alignColl"), "bulkAlignChange", function() {
            CLMSUI.utils.xilog(++alignCall, ". CIRCULAR VIEW AWARE OF ALIGN CHANGES", arguments);
            self.renderPartial(["features"]);
        });
        this.listenTo(this.model, "change:linkColourAssignment currentColourModelChanged", function() {
            self.renderPartial(["links"]);
        }); // either colour change or new colour model
        this.listenTo(this.model, "change:proteinColourAssignment currentProteinColourModelChanged", function() {
            self.renderPartial(["nodes"]);
        }); // either colour change or new colour model
        this.listenTo(CLMSUI.vent, "proteinMetadataUpdated", function() {   // generally a name change
            self.renderPartial(["nodes"]);
        });
        this.listenTo(this.model.get("annotationTypes"), "change:shown", function() {
            self.renderPartial(["features"]);
        });
        //this.listenTo (this.model.get("clmsModel"), "change:matches", this.reOrder);
        this.reOrderAndRender();

        return this;
    },

    reOrder: function(orderOptions) {
        orderOptions = orderOptions || {};
        //CLMSUI.utils.xilog ("this", this, this.options);
        if (orderOptions.reverseConsecutive) {
            this.options.sortDir = -this.options.sortDir; // reverse direction of consecutive resorts
        }
        var prots = this.filterInteractors(this.model.get("clmsModel").get("participants"));
        var proteinSort = function(field) {
            var numberSort = prots.length ? !isNaN(prots[0][field]) : false; // stop undefined 'prots[0].field' bug when no prots
            var sortDir = this.options.sortDir;
            prots.sort(function(a, b) {
                return (numberSort ? (+a[field]) - (+b[field]) : a[field].localeCompare(b[field])) * sortDir;
            });
            return _.pluck(prots, "id");
        };

        var self = this;
        var sortFuncs = {
            best: function() {
                return CLMSUI.utils.circleArrange(self.filterInteractors(this.model.get("clmsModel").get("participants")));
            },
            size: function() {
                return proteinSort.call(this, "size");
            },
            alpha: function() {
                return proteinSort.call(this, "name");
            },
            bespoke: function() {
                var bespokeOrder = orderOptions.bespokeOrder || self.bespokeOrder;
                prots.sort(function(a, b) {
                    return bespokeOrder[a.id] - bespokeOrder[b.id];
                });
                return _.pluck(prots, "id");
            }
        };
        this.interactorOrder = sortFuncs[this.options.sort] ? sortFuncs[this.options.sort].call(this) : _.pluck(prots, "id");
        return this;
    },

    reOrderAndRender: function(localOptions) {
        return this.reOrder(localOptions).render(localOptions);
    },

    flipIntra: function() {
        this.options.intraOutside = !this.options.intraOutside;
        this.render(); // nodes move position too (radially)
        return this;
    },

    showResLabelsIfRoom: function() {
        this.options.showResLabels = !this.options.showResLabels;
        this.renderPartial(["linkLabels"]);
        return this;
    },

    toggleLinklessVisibility: function() {
        this.options.showLinkless = !this.options.showLinkless;
        this.render();
        return this;
    },

    toggleHomomOppositeIntra: function() {
        this.options.homomOpposite = !this.options.homomOpposite;
        this.renderPartial(["links"]);
        return this;
    },

    toggleSelectedOnly: function() {
        this.options.showSelectedOnly = !this.options.showSelectedOnly;
        this.renderPartial(["links"]);
        return this;
    },

    idFunc: function(d) {
        return d.id;
    },

    showAccentedLinks: function(accentType) {
        if (this.isVisible()) {
            this.showAccentOnTheseLinks(d3.select(this.el).selectAll(".circleGhostLink"), accentType);
        }
        return this;
    },

    showAccentOnTheseLinks: function(d3Selection, accentType) {
        var accentedLinkList = this.model.getMarkedCrossLinks(accentType);
        if (accentType === "selection" && this.options.showSelectedOnly) {
            accentedLinkList = [];
        }
        if (accentedLinkList) {
            var linkTypes = {
                selection: "selectedCircleLink",
                highlights: "highlightedCircleLink"
            };
            var linkType = linkTypes[accentType] || "link";
            var accentedLinkIDs = _.pluck(accentedLinkList, "id");
            var idset = d3.set(accentedLinkIDs);
            d3Selection.filter("."+linkType)
                .filter(function(d) { return !idset.has(d.id); })
                .classed(linkType, false)
            ;

            d3Selection.filter(function(d) { return idset.has(d.id); })
                .classed(linkType, true)
            ;
        }
        return this;
    },

    showAccentedNodes: function(accentType) {
        if (this.isVisible()) {
            this.showAccentOnTheseNodes(d3.select(this.el).selectAll(".circleNode"), accentType);
        }
        return this;
    },

    showAccentOnTheseNodes: function(d3Selection, accentType) {
        var accentedNodeList = this.model.get(accentType === "selection" ? "selectedProteins" : "highlightedProteins");
        if (accentedNodeList) {
            var linkType = {
                selection: "selected",
                highlights: "highlighted"
            };
            var accentedLinkIDs = _.pluck(accentedNodeList, "id");
            var idset = d3.set(accentedLinkIDs);
            d3Selection.classed(linkType[accentType], function(d) {
                return idset.has(d.id);
            });
        }
        return this;
    },


    actionNodeLinks: function(nodeId, actionType, add, startPos, endPos) {
        var filteredCrossLinks = this.model.getFilteredCrossLinks();
        var anyPos = startPos == undefined && endPos == undefined;
        startPos = startPos || 0;
        endPos = endPos || 100000;
        var matchLinks = filteredCrossLinks.filter(function(link) {
            return (link.fromProtein.id === nodeId && (anyPos || (link.fromResidue >= startPos && endPos >= link.fromResidue))) ||
                (link.toProtein.id === nodeId && (anyPos || (link.toResidue >= startPos && endPos >= link.toResidue)));
        });
        this.model.setMarkedCrossLinks(actionType, matchLinks, actionType === "highlights", add);
        //this.model.set (actionType, matchLinks);
        return this;
    },

    clearSelection: function(evt) {
        evt = evt || {};
        //console.log ("evt", evt);
        if (!this.nodeDrag.visited) {
            // don't cancel if any of alt/ctrl/shift held down as it's probably a mis-aimed attempt at adding to an existing search
            // this is also logically consistent as it's adding 'nothing' to the existing selection
            if (!evt.altKey && !evt.ctrlKey && !evt.shiftKey) {
                this.model.setMarkedCrossLinks ("selection", [], false, false);
                this.model.setSelectedProteins ([], false);
            }
        }
        this.nodeDrag.visited = false;
        return this;
    },

    convertLinks: function(links, rad1, rad2) {
        var xlinks = this.model.get("clmsModel").get("crossLinks");
        var intraOutside = this.options.intraOutside;
        var homomOpposite = this.options.homomOpposite;
        var bowOutMultiplier = 1.2;

        var newLinks = links.map(function(link) {
            var xlink = xlinks.get(link.id);
            var homom = xlink.confirmedHomomultimer; // TODO: need to deal with this changing
            var intra = xlink.toProtein.id === xlink.fromProtein.id;
            var out = intraOutside ? intra && (homomOpposite ? !homom : true) : (homomOpposite ? homom : false);
            var rad = out ? rad2 : rad1;
            var bowRadius = out ? rad2 * bowOutMultiplier : 0;

            var a1 = Math.min(link.start, link.end);
            var a2 = Math.max(link.start, link.end);
            var midang = (a1 + a2) / 2; //(a2 - a1 < 180) ? (a1 + a2) / 2 : ((a1 + a2 + 360) / 2) % 360; // mid-angle (bearing in mind it might be shorter to wrap round the circle)
            var degSep = a2 - a1; // Math.min (a2 - a1, a1 - a2 + 360); // angle of separation, 2nd one works for doing long outside links the other way round. See next comment.
            //CLMSUI.utils.xilog ("angs", link.start, link.end, degSep);
            var coords;

            if (out && degSep > 70) {
                var controlPointAngleSep = 60;
                var counterClockwise = false; //(degSep === a1 - a2 + 360) ^ (link.start > link.end); // odd occassion when not intra and homom (is an error)
                var furtherBowRadius = bowRadius * (1 + (0.25 * ((degSep - 70) / 180)));
                coords = [{
                    ang: link.start,
                    rad: rad
                }, {
                    ang: link.start,
                    rad: bowRadius
                }];
                var holdPoints = Math.floor(degSep / controlPointAngleSep) + 1;
                var deltaAng = (degSep % controlPointAngleSep) / 2;
                var offsetAng = link.start + deltaAng;
                for (var n = 0; n < holdPoints; n++) {
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
                var homomBowRadius = out ? rad + this.options.tickWidth : rad * 0.65;
                var homomAngDelta = out ? 2 : 10;
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
    },

    getMaxRadius: function(d3sel) {
        var zelem = $(d3sel.node());
        return Math.min(zelem.width(), zelem.height()) / 2;
    },

    filterInteractors: function(interactors) {  // interactors is a native map
        var filteredInteractors = [];
        var showLinkless = this.options.showLinkless;
        interactors.forEach(function(value) {
            if (!value.is_decoy && (showLinkless || !value.hidden)) {
                filteredInteractors.push(value);
            }
        });
        return filteredInteractors;
    },

    renderPartial: function(renderPartArr) {
        this.render({
            changed: d3.set(renderPartArr)
        });
        return this;
    },

    render: function (renderOptions) {

        renderOptions = renderOptions || {};
        //CLMSUI.utils.xilog ("render options", renderOptions);
        var changed = renderOptions.changed;

        if (this.isVisible()) {
            //CLMSUI.utils.xilog ("re-rendering circular view");
            var svg = d3.select(this.el).select("svg");
            this.radius = this.getMaxRadius(svg);

            var interactors = this.model.get("clmsModel").get("participants");
            //CLMSUI.utils.xilog ("interactorOrder", this.interactorOrder);
            //CLMSUI.utils.xilog ("model", this.model);

            var filteredInteractors = this.filterInteractors(interactors);
            var filteredCrossLinks = this.model.getFilteredCrossLinks(); //CLMSUI.modelUtils.getFilteredNonDecoyCrossLinks (crossLinks);
            if (this.options.showSelectedOnly) {
                var selectedIDs = d3.set (_.pluck (this.model.getMarkedCrossLinks("selection"), "id"));
                filteredCrossLinks = filteredCrossLinks.filter(function(xlink) {
                    return selectedIDs.has(xlink.id);
                });
            }

            // If only one protein hide some options, and make links go in middle
            // make it so menu stays if we've filtered down to one protein, rather than just one protein in the search

            d3.select(this.el).selectAll("button.flipIntraButton,#" + this.el.id + "Options")
                .style("display", (this.model.get("clmsModel").targetProteinCount < 2) ? "none" : null);

            if (filteredInteractors.length < 2) {
                this.options.intraOutside = false;
            }
            //CLMSUI.utils.xilog ("fi", filteredInteractors, interactors);

            var fmap = d3.map(filteredInteractors, function(d) {
                return d.id;
            });

            // This line in case links are loaded via csv and interactorOrder isn't initialised or out of sync with interactors
            if (filteredInteractors.length !== this.interactorOrder.length) { // interactors is map so size, interactorOrder is array so length
                //console.log("REORDERING OK", filteredInteractors.length, this.interactorOrder.length)
                this.reOrder();
            }

            // reset filteredInteractors to same order as interactor order
            filteredInteractors = this.interactorOrder
                .filter(function(interactorId) {
                    return fmap.has(interactorId);
                })
                .map(function(interactorId) {
                    return fmap.get(interactorId);
                });

            // After rearrange interactors, because filtered features depends on the interactor order
            var alignColl = this.model.get("alignColl");
            var filteredFeatures = filteredInteractors.map(function(inter) {
                return this.model.getFilteredFeatures (inter);
            }, this);
            //CLMSUI.utils.xilog ("filteredFeatures", filteredFeatures);

            var layout = CLMSUI.circleLayout(filteredInteractors, filteredCrossLinks, filteredFeatures, [0, 360], this.options);
            //CLMSUI.utils.xilog ("layout", layout);

            var tickRadius = (this.radius - this.options.tickWidth) * (this.options.intraOutside ? 0.8 : 1.0); // shrink radius if some links drawn on outside
            var innerNodeRadius = tickRadius * ((100 - this.options.nodeWidth) / 100);
            var innerFeatureRadius = tickRadius * ((100 - (this.options.nodeWidth * 0.7)) / 100);
            var textRadius = (tickRadius + innerNodeRadius) / 2;

            var arcRadii = [{
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
            arcRadii.forEach(function(arcData) {
                this[arcData.arc].innerRadius(arcData.inner).outerRadius(arcData.outer);
            }, this);

            var nodes = layout.nodes;
            var links = layout.links;
            var features = layout.features;
            // turns link end & start angles into something d3.svg.arc can use
            var linkCoords = this.convertLinks(links, innerNodeRadius, tickRadius);
            //CLMSUI.utils.xilog ("linkCoords", linkCoords);

            var gTrans = svg.select("g");
            gTrans.attr("transform", "translate(" + this.radius + "," + this.radius + ")");
            var gRot = gTrans.select("g");
            //gRot.attr("transform", "rotate(0)");

            if (!changed || changed.has("links")) {
                this.drawLinks(gRot, linkCoords);   // draw links
            }
            if (!changed || changed.has("nodes")) {
                this
                    .drawNodes(gRot, nodes) // draw nodes (around edge)
                    .drawNodeTicks(gRot, nodes, tickRadius) // draw scales on nodes - adapted from http://bl.ocks.org/mbostock/4062006
                ;
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
    },

    addOrGetGroupLayer: function(g, layerClass) {
        var groupLayer = g.select("g." + layerClass);
        if (groupLayer.empty()) {
            groupLayer = g.append("g").attr("class", layerClass);
        }
        return groupLayer;
    },

    drawLinks: function(g, links) {
        var self = this;
        var crossLinks = this.model.get("clmsModel").get("crossLinks");
        //CLMSUI.utils.xilog ("clinks", crossLinks);
        var colourScheme = this.model.get("linkColourAssignment");

        var lineCopy = {}; // make cache as linkJoin and ghostLinkJoin will have same 'd' paths for the same link

        // draw thin links
        var thinLayer = this.addOrGetGroupLayer(g, "thinLayer");
        var linkJoin = thinLayer.selectAll(".circleLink").data(links, self.idFunc);
        //var hasNew = linkJoin.enter().size() > 0;
        linkJoin.exit().remove();
        linkJoin.enter()
            .append("path")
            .attr("class", "circleLink");
        linkJoin
            .attr("d", function(d) {
                var path = (d.outside ? self.outsideLine : self.line)(d.coords);
                lineCopy[d.id] = path;
                return path;
            })
            .style("stroke", function(d) {
                return colourScheme.getColour(crossLinks.get(d.id));
            })
            .classed("ambiguous", function(d) {
                return crossLinks.get(d.id).ambiguous;
            });

        // draw thick, invisible links (used for highlighting and mouse event capture)
        var ghostLayer = this.addOrGetGroupLayer(g, "ghostLayer");
        var ghostLinkJoin = ghostLayer.selectAll(".circleGhostLink").data(links, self.idFunc);

        ghostLinkJoin.exit().remove();
        ghostLinkJoin.enter()
            .append("path")
            .attr("class", "circleGhostLink")
            .on("mouseenter", function(d) {
                self.linkTip(d);
                self.model.setMarkedCrossLinks("highlights", [crossLinks.get(d.id)], true, false);
            })
            .on("mouseleave", function() {
                self.clearTip();
                self.model.setMarkedCrossLinks("highlights", [], false, false);
            })
            .on("click", function(d) {
                d3.event.stopPropagation(); // stop event getting picked up by backdrop listener which cancels all selections
                var add = d3.event.ctrlKey || d3.event.shiftKey;
                self.model.setMarkedCrossLinks("selection", [crossLinks.get(d.id)], false, add);
            });
        ghostLinkJoin
            .attr("d", function(d) {
                var path = lineCopy[d.id] || (d.outside ? self.outsideLine : self.line)(d.coords);
                return path;
            })
            .call(function() {
                self.showAccentOnTheseLinks.call(self, this, "selection");
            })
        ;

        return this;
    },

    selectNode: function (d) {
        var add = d3.event.ctrlKey || d3.event.shiftKey;
        this.actionNodeLinks(d.id, "selection", add);
        var interactor = this.model.get("clmsModel").get("participants").get(d.id);
        this.model.setSelectedProteins([interactor], add);
        return this;
    },

    drawNodes: function(g, nodes) {
        var self = this;

        var multipleNodes = true; //this.filterInteractors(this.model.get("clmsModel").get("participants")).length > 1;
        var colourScheme = this.model.get("proteinColourAssignment");
        if (colourScheme.id === "Default Protein") {
            colourScheme = this.replacementDefaultNodeColourModel;
        }
        var interactors = this.model.get("clmsModel").get("participants");

        var nodeLayer = this.addOrGetGroupLayer(g, "nodeLayer");
        var nodeJoin = nodeLayer.selectAll(".circleNode").data(nodes, self.idFunc);

        nodeJoin.exit().remove();

        nodeJoin.enter()
            .append('path')
            .attr("class", "circleNode")
            .on("mouseenter", function(d) {
                self.nodeTip(d);
                self.actionNodeLinks(d.id, "highlights", false);
                var interactor = self.model.get("clmsModel").get("participants").get(d.id);
                self.model.setHighlightedProteins([interactor]);
            })
            .on("mouseleave", function() {
                self.clearTip();
                self.model.setHighlightedProteins([]);
                self.model.setMarkedCrossLinks("highlights", [], false, false);
            })
            .call(function(sel) {
                if (multipleNodes) {
                    sel.call(self.nodeDrag);
                }
            })
        ;

        nodeJoin
            .attr("d", this.arc)
            .style("fill", function(d) { return colourScheme.getColour(interactors.get(d.id)); })
        ;

        this.showAccentOnTheseNodes(nodeJoin, "selection");

        return this;
    },

    drawNodeTicks: function(g, nodes, radius) {
        var self = this;
        var tot = nodes.reduce(function(total, node) {
            return total + (node.size || 1);
        }, 0);

        var tickValGap = (tot / 360) * 5;
        var tickGap = CLMSUI.utils.niceRound(tickValGap);

        var groupTicks = function(d) {
            var k = (d.end - d.start) / (d.size || 1);
            var tRange = d3.range(0, d.size, tickGap);
            // make first tick at 1, not 0 (as protein indices are 1-based)
            tRange[0] = 1;
            // decide whether to add extra tick for last value (d.size) or replace last tick if close enough
            var tlen = tRange.length;
            var lastIndex = tlen - (d.size - tRange[tlen - 1] <= tickGap / 3 ? 1 : 0);
            tRange[lastIndex] = d.size;
            tlen = tRange.length;

            var labelCycle = self.options.tickLabelCycle;
            return tRange.map(function(v, i) {
                //CLMSUI.utils.xilog ("d.start", d);
                return {
                    angle: (((v - 1) + 0.5) * k) + d.start, // v-1 cos we want 1 to be at the zero pos angle, +0.5 cos we want it to be a tick in the middle
                    // show label every labelCycle'th tick starting with first.
                    // Exceptions: Show label for last tick. Don't show for second last tick (unless that tick is the first). It looks nicer.
                    label: (i % labelCycle && i < tlen - 1) || (i === tlen - 2 && i > 0) ? "" : v,
                };
            });
        };

        var tickLayer = this.addOrGetGroupLayer(g, "tickLayer");
        var groupTickJoin = tickLayer.selectAll("g.tickGroups")
            .data(nodes, self.idFunc);

        groupTickJoin.exit().remove();

        groupTickJoin.enter()
            .append("g")
            .attr("class", "tickGroups");


        var indTickJoin = groupTickJoin.selectAll("g.tick")
            .data(groupTicks);

        indTickJoin.exit().remove();

        var newTicks = indTickJoin.enter()
            .append("g")
            .attr("class", "tick");

        var llength = Math.min(this.options.tickWidth, 5);
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
            .attr("transform", function(d) {
                return "rotate(" + (d.angle - 90) + ")" + "translate(" + radius + ",0)";
            })
            .select("text")
            .text(function(d) {
                return d.label;
            })
            //.classed ("justifyTick", function(d) { return d.angle > 180; })   // must wait for inkscape/illustrator to catch up with css3 so have to use following code instead
            .attr("transform", function(d) {
                return d.angle > 180 ? "rotate(180) translate(-16 0)" : null;
            })
            .attr("text-anchor", function(d) {
                return d.angle > 180 ? "end" : null;
            });

        return this;
    },

    drawNodeText: function(g, nodes) {
        var self = this;

        var defs = d3.select(this.el).select("svg defs");
        var pathId = function(d) {
            return self.el.id + d.id;
        };

        // only add names to nodes with 10 degrees of display or more
        var tNodes = nodes.filter(function(d) {
            return (d.end - d.start) > 10;
        });

        var pathJoin = defs.selectAll("path").data(tNodes, self.idFunc);
        pathJoin.exit().remove();
        pathJoin.enter().append("path")
            .attr("id", pathId);
        pathJoin
            .attr("d", function(d) {
                var pathd = self.textArc(d);
                // CLMSUI.utils.xilog ("pathd", pathd);
                // only want one curve, not solid arc shape, so chop path string
                var cutoff = pathd.indexOf("L");
                if (cutoff >= 0) {
                    var midAng = (d.start + d.end) / 2;
                    // use second curve in arc for labels on bottom of circle to make sure text is left-to-right + chop off end 'Z',
                    // use first curve otherwise
                    pathd = (midAng > 90 && midAng < 270) ?
                        "M" + pathd.substring(cutoff + 1, pathd.length - 1) : pathd.substring(0, cutoff);
                }
                return pathd;
            });

        // add labels to layer, to ensure they 'float' above feature elements added directly to g
        var nodeLabelLayer = this.addOrGetGroupLayer(g, "nodeLabelLayer");
        var textJoin = nodeLabelLayer.selectAll("text.circularNodeLabel")
            .data(tNodes, self.idFunc);

        textJoin.exit().remove();
        textJoin.enter()
            .append("text")
            .attr("class", "circularNodeLabel")
            .attr("dy", "0.3em")
            .append("textPath")
            .attr("startOffset", "50%")
            .attr("xlink:href", function(d) {
                return "#" + pathId(d);
            })
        //.text (function(d) { return d.name.replace("_", " "); })
        ;

        // this lets names update for existing nodes
        textJoin.select("text textPath").text(function(d) {
            return d.name.replace("_", " ");
        });

        return this;
    },

    drawFeatures: function(g, features) {
        var self = this;

        // Sort so features are drawn biggest first, smallest last (trying to avoid small features being occluded)
        features.sort(function(a, b) {
            var diff = (b.end - b.start) - (a.end - a.start);
            return (diff < 0 ? -1 : (diff > 0 ? 1 : 0));
        });

        var featureLayer = this.addOrGetGroupLayer(g, "featureLayer");
        var featureJoin = featureLayer.selectAll(".circleFeature").data(features, self.idFunc);

        featureJoin.exit().remove();

        featureJoin.enter()
            .append('path')
            .attr("class", "circleFeature")
            .on("mouseenter", function(d) {
                self.featureTip(d);
                self.actionNodeLinks(d.nodeID, "highlights", false, d.fstart, d.fend);
            })
            .on("mouseleave", function() {
                self.clearTip();
                self.model.setMarkedCrossLinks("highlights", [], false, false);
            })
            .on("click", function(d) {
                d3.event.stopPropagation(); // stop event getting picked up by backdrop listener which cancels all selections
                var add = d3.event.ctrlKey || d3.event.shiftKey;
                self.actionNodeLinks(d.nodeID, "selection", add, d.fstart, d.fend);
            });

        //CLMSUI.utils.xilog ("FEATURES", features);

        var annotColl = this.model.get("annotationTypes");

        featureJoin
            .order()
            .attr("d", this.featureArc)
            .style("fill", function(d) {
                return annotColl.getColour (d.category, d.type);
            });

        return this;
    },


    drawResidueLetters: function(g, links) {

        var circumference = this.resLabelArc.innerRadius()() * 2 * Math.PI;
        //CLMSUI.utils.xilog ("ff", this.resLabelArc, this.resLabelArc.innerRadius(), this.resLabelArc.innerRadius()(), circumference);
        if (circumference / links.length < 30 || !this.options.showResLabels) { // arbitrary cutoff decided by me (mjg)
            links = [];
        }

        var crossLinks = this.model.get("clmsModel").get("crossLinks");
        var resMap = d3.map();
        links.forEach(function(link) {
            var xlink = crossLinks.get(link.id);
            resMap.set(xlink.fromProtein.id + "-" + xlink.fromResidue, {
                polar: link.coords[0],
                res: CLMSUI.modelUtils.getResidueType(xlink.fromProtein, xlink.fromResidue)
            });
            resMap.set(xlink.toProtein.id + "-" + xlink.toResidue, {
                polar: _.last(link.coords),
                res: CLMSUI.modelUtils.getResidueType(xlink.toProtein, xlink.toResidue)
            });
        });
        var degToRad = Math.PI / 180;

        var letterLayer = this.addOrGetGroupLayer(g, "letterLayer");
        var resJoin = letterLayer.selectAll(".residueLetter").data(resMap.entries(), function(d) {
            return d.key;
        });

        resJoin.exit().remove();

        resJoin.enter()
            .append("text")
            .attr("class", "residueLetter")
            .text(function(d) {
                return d.value.res;
            });

        resJoin
            .attr("transform", function(d) {
                var polar = d.value.polar;
                var rang = (polar.ang - 90) * degToRad;
                var x = polar.rad * Math.cos(rang);
                var y = polar.rad * Math.sin(rang);
                var rot = (polar.ang < 90 || polar.ang > 270) ? polar.ang : polar.ang + 180;
                return "rotate (" + rot + " " + x + " " + y + ") translate(" + x + " " + y + ")";
            })
            .attr("dy", function(d) {
                var polar = d.value.polar;
                return (polar.ang < 90 || polar.ang > 270) ? "0.8em" : "-0.1em";
            });

        return this;
    },

    relayout: function(descriptor) {
        if (descriptor && descriptor.dragEnd) { // avoids doing two renders when view is being made visible
            this.render();
        }
        return this;
    },

    identifier: "Circular View",

    optionsToString: function() {
        var abbvMap = {
            showResLabels: "RESLBLS",
            intraOutside: "SELFOUTER",
            showLinkless: "SHOWIFNOLINKS",
            showSelectedOnly: "SELONLY",
        };
        var fields = ["showResLabels", "showSelectedOnly"];
        if (this.model.get("clmsModel").targetProteinCount > 1) {
            fields.push("intraOutside", "showLinkLess", "sort");
        }

        var str = CLMSUI.utils.objectStateToAbbvString(this.options, fields, d3.set(), abbvMap);
        return str;
    },

    // removes view
    // not really needed unless we want to do something extra on top of the prototype remove function (like destroy c3 view just to be sure)
    remove: function() {
        CLMSUI.CircularViewBB.__super__.remove.apply(this, arguments);
    }
});

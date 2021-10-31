import "../../../css/goTermsView.css";

import * as $ from "jquery";
import * as _ from "underscore";
import * as d3 from "d3";
import {d3_sankey} from "./sankey";

import {BaseFrameView} from "../../ui-utils/base-frame-view";
import {GoTerm} from "./goTerm";

export const GoTermsViewBB = BaseFrameView.extend({

    events: function () {
        let parentEvents = BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "keyup .goTextMatch": "goTextMatch",
        });
    },

    defaultOptions: {
        margin: {
            top: 5,
            right: 5,
            bottom: 5,
            left: 5
        },
        subclassColour: "gray",
        partofColour: "brown",
        canHideToolbarArea: true,
        canTakeImage: true,
    },

    initialize: function (viewOptions) {
        GoTermsViewBB.__super__.initialize.apply(this, arguments);

        const self = this;

        // targetDiv could be div itself or id of div - lets deal with that
        // Backbone handles the above problem now - element is now found in this.el
        //avoids prob with 'save - web page complete'
        const mainDivSel = d3.select(this.el).classed("goTermsView", true);

        const flexWrapperPanel = mainDivSel.append("div")
            .attr("class", "verticalFlexContainer");

        const controlDiv = flexWrapperPanel.append("div").attr("class", "toolbar toolbarArea");
        this.termSelect = controlDiv.append("label")
            .attr("class", "btn selectHolder")
            .append("span")
            //.attr("class", "noBreak")
            .text("Term Type ►")
            .append("select")
            .attr("id", mainDivSel.attr("id") + "goTermSelect")
            .on("change", function () {
                self.updateThenRender();
            });

        const termSelectData = ["cellular_component", "biological_process", "molecular_function"];

        const options = this.termSelect.selectAll("option")
            .data(termSelectData)
            .enter()
            .append("option");

        // Set the text and value for your options

        options.text(function (d) {
            return d;
        })
            .attr("value", function (d) {
                return d;
            });

        controlDiv.append("input")
            .attr("type", "text")
            .attr("placeholder", "Search Go Term Names...")
            .attr("class", "btn-1 goTextMatch");
        controlDiv.append("span").attr("class", "goTextResult");

        this.chartDiv = flexWrapperPanel.append("div")
            .attr("class", "panelInner")
            .attr("flex-grow", 1)
            .style("position", "relative");

        // SVG element
        this.svg = this.chartDiv.append("svg");
        /* this.svg.on("click", function (d) {
            // self.model.set("groupedGoTerms", []);
            // self.model.trigger("groupedGoTermsChanged");
        })
            .on("contextmenu", function (d) {
                //d3.event.preventDefault();
                // react on right-clicking
                //self.fixed = [];
                //self.render();
            });*/
        const margin = this.options.margin;
        this.vis = this.svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");
        this.backgroundGroup = this.vis.append("g");
        // this.linkGroup = vis.append("g");
        this.foregroundGroup = this.vis.append("g");
        this.listenTo(this.model.get("clmsModel"), "change:matches", this.updateThenRender); // New matches added (via csv generally)
        this.listenTo(this.model, "hiddenChanged", this.updateThenRender);

        this.sankey = d3_sankey().nodeWidth(15);

        //markers
        const data = [{
            id: 1,
            name: "diamond",
            path: "M 0,-7.0710768 L -7.0710894,0 L 0,7.0710589 L 7.0710462,0 L 0,-7.0710768 z",
            viewbox: "-5 -5 15 15",
            transform: "scale(0.7) translate(5,0)",
            color: this.options.partofColour
        }, {
            id: 2,
            name: "arrow",
            path: "M 8.7185878,4.0337352 L -2.2072895,0.016013256 L 8.7185884,-4.0017078 C 6.9730900,-1.6296469 6.9831476,1.6157441 8.7185878,4.0337352 z",
            viewbox: "-5 -5 15 15",
            transform: "scale(1.1) translate(1,0)",
            color: this.options.subclassColour
        }];

        const defs = this.svg.append("svg:defs");
        defs.selectAll("marker")
            .data(data)
            .enter()
            .append("svg:marker")
            .attr("id", function (d) {
                return "marker_" + d.name;
            })
            .attr("markerHeight", 15)
            .attr("markerWidth", 15)
            .attr("markerUnits", "userSpaceOnUse")
            .attr("refX", 0)
            .attr("refY", 0)
            .attr("viewBox", function (d) {
                return d.viewbox;
            })
            .append("svg:path")
            .attr("d", function (d) {
                return d.path;
            })
            .attr("fill", function (d) {
                return d.color;
            })
            .attr("transform", function (d) {
                return d.transform;
            });

        // initial update done via hiddenChanged trigger above - which is called after all views are set up
        // this.update();  // needed here to init interactors in goterms, temp hack, todo
        const go = this.model.get("go");

        const proteins = this.model.get("clmsModel").get("participants").values();
        for (let protein of proteins) {
            if (protein.uniprot) {
                for (let goId of protein.uniprot.go) {
                    const goTerm = go.get(goId);
                    if (goTerm) {
                        goTerm.interactors = goTerm.interactors || new Set();  // Lazy instantiation
                        goTerm.interactors.add(protein);
                    }
                }
            }
        }
    },


    goTextMatch: function (evt) {
        const val = evt.target.value;
        const regex = new RegExp(val, "i");

        const allInteractorSet = new Set();
        let goMatchCount = 0;

        const nodes = this.foregroundGroup.selectAll(".node")
            .each(function (d) {
                d.strMatch = val && val.length > 1 && d.name.match(regex);
                if (d.strMatch) {
                    goMatchCount++;
                    const interactorSet = d.term.getInteractors();
                    if (interactorSet) {
                        interactorSet.forEach(allInteractorSet.add, allInteractorSet);
                    }
                }
            })
            .sort(function (a, b) {
                return (a.strMatch ? 1 : 0) - (b.strMatch ? 1 : 0);
            })
            .classed("highlightedGOTerm", function (d) {
                return d.strMatch;
            });

        nodes.select("rect")
            .style("stroke", function (d) {
                return d.strMatch ? null : d3.rgb(d.color).darker(2);
            });

        const interactors = Array.from(allInteractorSet.values());
        const msg = (!val || val.length < 2) ? "Enter at least 2 characters" : (goMatchCount ? goMatchCount + " matching GO terms, mapping to " + interactors.length + " proteins" : "No matches");
        d3.select(this.el).select(".goTextResult").text(msg);
        this.model[evt.key === "Enter" || evt.keyCode === 13 || evt.which === 13 ? "setSelectedProteins" : "setHighlightedProteins"](interactors, false);
    },

    update: function () {
        const termType = d3.select("#goTermsPanelgoTermSelect")
            .selectAll("option")
            .filter(function () {
                return d3.select(this).property("selected");
            })
            .datum()
            .trim();
        const go = this.model.get("go");
        //associate go terms with proteins (clear them first)
        for (let g of go.values()) {
            // const gints = g.interactors;
            // if (gints && gints.size > 0) {
            //     gints.clear();
            // }
            g.filtInteractorCount = 0;
        }

        // const proteins = this.model.get("clmsModel").get("participants").values();
        // for (let protein of proteins) {
        //     if (protein.uniprot) {
        //         for (let goId of protein.uniprot.go) {
        //             const goTerm = go.get(goId);
        //             if (goTerm) {
        //                 goTerm.interactors = goTerm.interactors || new Set();  // Lazy instantiation
        //                 goTerm.interactors.add(protein);
        //             }
        //         }
        //     }
        // }

        const nodes = new Map();
        const linksMap = new Map();

        // GoTerm.prototype.getCount = 0; // what?
        if (termType === "biological_process") {
            go.get("GO0008150").getInteractors(true);
            sankeyNode("GO0008150");
        } else if (termType === "molecular_function") {
            go.get("GO0003674").getInteractors(true);
            sankeyNode("GO0003674");
        } else { // default to cellular component
            go.get("GO0005575").getInteractors(true);
            sankeyNode("GO0005575");
        }

        function sankeyNode(goId) {
            if (!nodes.has(goId)) {
                const goTerm = go.get(goId);
                const node = {
                    name: goTerm.name,
                    id: goTerm.id,
                    term: goTerm,
                };
                nodes.set(node.id, node);

                if (goTerm.part_of) {
                    for (let partOfId of goTerm.part_of) {
                        const partOfTerm = go.get(partOfId);
                        // if (partOfTerm.isDescendantOf("GO0032991")) {
                        if (partOfTerm.namespace === goTerm.namespace) {
                            const linkId = partOfId + "_" + node.id;
                            const link = {
                                source: sankeyNode(partOfId),
                                target: node,
                                value:10,
                                id: linkId,
                                partOf: true
                            };
                            linksMap.set(linkId, link);
                        }
                    }
                }
                if (goTerm.is_a) {
                    for (let superclassId of goTerm.is_a) {
                        const superclassTerm = go.get(superclassId);
                        // if (superclassTerm.isDescendantOf("GO0032991")) {
                        if (superclassTerm.namespace === goTerm.namespace) {
                            const linkId = superclassId + "_" + node.id;
                            const link = {
                                source: sankeyNode(superclassId),
                                target: node,
                                value:10,
                                id: linkId,
                                partOf: false
                            };
                            linksMap.set(linkId, link);
                        }
                    }
                }
                if (goTerm.parts) {
                    for (let partId of goTerm.parts) {
                        const partTerm = go.get(partId);
                        // if (partTerm.isDescendantOf("GO0032991")) {
                        if (partTerm.namespace == goTerm.namespace && partTerm.filtInteractorCount > 1) {
                            sankeyNode(partId);
                        }
                        // }
                    }
                }
                if (goTerm.subclasses) {
                    for (let subclassId of goTerm.subclasses) {
                        const subclassTerm = go.get(subclassId);
                        // if (subclassTerm.isDescendantOf("GO0032991")){
                        if (subclassTerm.namespace == goTerm.namespace && subclassTerm.filtInteractorCount > 1) {
                            sankeyNode(subclassId);
                        }
                        // }
                    }
                }
                return node;
            } else {
                return nodes.get(goId);
            }
        }

        this.data = {
            "nodes": Array.from(nodes.values()),
            "links": Array.from(linksMap.values())
        };

        return this;
    },

    render: function (renderOptions) {
        if (this.isVisible()) {
            //this.update();
            if (this.data) {

                renderOptions = renderOptions || {iterations: 32};

                //console.log("RENDERING GO TERMS");
                const jqElem = $(this.svg.node());
                const cx = jqElem.width(); //this.svg.node().clientWidth;
                const cy = jqElem.height(); //this.svg.node().clientHeight;
                const margin = this.options.margin;
                const width = Math.max(0, cx - margin.left - margin.right);
                const height = Math.max(0, cy - margin.top - margin.bottom);

                this.sankey
                    .nodes(this.data.nodes)
                    .links(this.data.links)
                    .size([width, height])
                    .layout(renderOptions.iterations);

                //console.log ("res", this.sankey);
                const maxDepth = d3.max(this.data.nodes, function (d) {
                    return d.depth;
                });
                const colWidth = (width - this.sankey.nodePadding() - this.sankey.nodeWidth()) / maxDepth;
                this.colWidth = colWidth;
                //console.log ("data", this.data, maxDepth, colWidth);

                const color = d3.scale.category20();

                const path = this.sankey.link();
                const self = this;

                const linkSel = self.backgroundGroup.selectAll(".goLink")
                    .data(this.data.links,
                        function (d) {
                            return d.id;
                        }
                    );

                linkSel.enter()
                    .append("path")
                    .attr("class", "goLink")
                    .style("stroke", function (d) {
                        return d.partOf ? self.options.partofColour : self.options.subclassColour; //"#bdbdbd"
                    })
                    .style("display", "none")
                    .attr("marker-start", function (d) {
                        return "url(#marker_" + (d.partOf ? "diamond" : "arrow") + ")";
                    });
                const nodeSel = this.foregroundGroup.selectAll(".node")
                    .data(this.data.nodes, function (d) {
                        return d.id;
                    });
                const nodeEnter = nodeSel.enter().append("g")
                    .attr("class", "node")
                    .on("click", function (d) {
                        self.model.setSelectedProteins([], false);
                        self.model.setSelectedProteins(Array.from(d.term.getInteractors().values()), true);
                        // self.model.get("groupedGoTerms").push(d.term);
                        // self.model.trigger("groupedGoTermsChanged");
                        d3.event.stopPropagation();
                    })
                    .on("mouseover", function (d) {
                        const term = d.term;
                        self.hideAllExceptMe(term);
                        self.hideAllLinksExceptTo(term);
                        self.model.setHighlightedProteins(Array.from(term.getInteractors().values()));
                    })
                    .on("mouseout", function () {
                        self.hideAllExceptMe();
                        self.hideAllLinksExceptTo();
                        self.model.setHighlightedProteins([]);
                    });
                    // .on("contextmenu", function () {
                    //     //d3.event.preventDefault();
                    //     //d3.event.stopPropagation();
                    //     // react on right-clicking
                    //     //self.fixed.push(d.id);
                    // });

                nodeEnter.append("rect")
                    .attr("width", self.sankey.nodeWidth())
                    .style("fill", function (d) {
                        return d.color = color(d.name.replace(/ .*/, ""));
                    })
                    .style("fill-opacity", function () {
                        return 0.2;
                    })
                    .style("stroke", function (d) {
                        return d3.rgb(d.color).darker(2);
                    })
                    .append("title")
                    .text(function (d) {
                        return d.id + " : " + d.name + " : " + d.value;
                    });

                nodeEnter.append("text")
                    .attr("dy", ".35em")

                    .text(function (d) {
                        return d.name;
                    });

                nodeSel.attr("transform", function (d) {
                    return "translate(" + (d.x ? d.x : 0) + "," + (d.y ? d.y : 0) + ")";
                });

                nodeSel.select("rect")
                    .attr("height", function (d) {
                        return Math.max(1, (d.dy ? d.dy : 0));
                    });

                nodeSel.select("text")
                    .attr("x", function () {
                        return -6;
                    })
                    .style("text-anchor", function () {
                        return "end";
                    })
                    .attr("y", function (d) {
                        return (d.dy ? d.dy : 0) / 4;
                    });

                nodeSel.select("title").text(function (d) {
                    return d.id + " : " + d.name + " : " + d.value;
                });

                linkSel.attr("d", path);

                nodeSel.exit().remove();
                linkSel.exit().remove();
            }
        }

        return this;
    },

    hideAllExceptMe: function (term) {
        const nodeSel = this.foregroundGroup.selectAll(".node")
            .data(this.data.nodes, function (d) {
                return d.id;
            });
        if (!term) {
            nodeSel.style("opacity", function () {
                return 1;
            });
        } else {
            nodeSel.style("opacity", function (d2) {
                return term.isDirectRelation(d2.term) ? 1 : 0;
            });
        }
    },

    hideAllLinksExceptTo: function (term) {
        const linkSel = this.backgroundGroup.selectAll(".goLink")
            .data(this.data.links,
                function (d) {
                    return d.id;
                }
            );
        linkSel.style("display", function (dlink) {
            if (!term) return "none";
            return /*!term ||*/ (term.id === dlink.source.id || term.id === dlink.target.id) ? null : "none";
        });
    },

    updateThenRender: function () {
        if (this.isVisible()) {
            return this.update().render();
        }
        return this;
    },

    relayout: function (descriptor) {
        if (descriptor && descriptor.dragEnd) { // avoids doing two renders when view is being made visible
            this.render({iterations: 6});
        }
        return this;
    },

    reshow: function () {
        return this.update();
    },

    // called when things need repositioned, but not re-rendered from data
    // gets called before render
    resize: function () {
        return this.render();
    },

    identifier: "Go Terms View",
});

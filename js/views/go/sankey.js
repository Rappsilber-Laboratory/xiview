/**
 * @fileoverview D3 Sankey diagram layout algorithm for GO term visualization.
 * Implements flow-based layout with nodes (GO terms) and links (relationships/flows).
 * Computes positions and sizes for hierarchical flow visualization with iterative relaxation.
 * Adapted from D3 Sankey plugin with customizations for GO term hierarchy display.
 */
import d3 from "d3";

/**
 * Creates a Sankey diagram layout generator with configurable properties.
 * Returns a layout object with getter/setter methods and layout computation functions.
 * Layout algorithm: computes node positions (x, y) and sizes (dx, dy) based on flow values.
 * @returns {Object} Sankey layout object with methods: nodeWidth(), nodePadding(), nodes(), links(), size(), layout(), relayout(), link()
 */
export const d3_sankey = function () {
    const sankey = {};
    let nodeWidth = 24,
        nodePadding = 8,
        size = [1, 1],
        nodes = [],
        links = [];

    /**
     * Getter/setter for node width in pixels.
     * @param {number} [_] - New node width value
     * @returns {number|Object} Current width (if no args) or sankey object (for chaining)
     */
    sankey.nodeWidth = function (_) {
        if (!arguments.length) return nodeWidth;
        nodeWidth = +_;
        return sankey;
    };

    /**
     * Getter/setter for vertical padding between nodes in pixels.
     * @param {number} [_] - New node padding value
     * @returns {number|Object} Current padding (if no args) or sankey object (for chaining)
     */
    sankey.nodePadding = function (_) {
        if (!arguments.length) return nodePadding;
        nodePadding = +_;
        return sankey;
    };

    /**
     * Getter/setter for nodes array.
     * @param {Array<Object>} [_] - Array of node objects (must have 'term' property with GO term)
     * @returns {Array<Object>|Object} Current nodes (if no args) or sankey object (for chaining)
     */
    sankey.nodes = function (_) {
        if (!arguments.length) return nodes;
        nodes = _;
        return sankey;
    };

    /**
     * Getter/setter for links array.
     * @param {Array<Object>} [_] - Array of link objects with source, target, value, and optional partOf flag
     * @returns {Array<Object>|Object} Current links (if no args) or sankey object (for chaining)
     */
    sankey.links = function (_) {
        if (!arguments.length) return links;
        links = _;
        return sankey;
    };

    /**
     * Getter/setter for diagram size [width, height].
     * @param {Array<number>} [_] - Two-element array [width, height] in pixels
     * @returns {Array<number>|Object} Current size (if no args) or sankey object (for chaining)
     */
    sankey.size = function (_) {
        if (!arguments.length) return size;
        size = _;
        return sankey;
    };

    /**
     * Computes full Sankey layout: positions and sizes for all nodes and links.
     * Steps: compute node links, values, breadths (x-positions), depths (y-positions via iterative relaxation), link depths.
     * @param {number} iterations - Number of relaxation iterations for node depth optimization
     * @returns {Object} Sankey object for chaining
     */
    sankey.layout = function (iterations) {
        computeNodeLinks();
        computeNodeValues();
        computeNodeBreadths();
        computeNodeDepths(iterations);
        computeLinkDepths();
        return sankey;
    };

    /**
     * Recomputes only link depths (sy, ty offsets within nodes).
     * Use after manually adjusting node positions without full relayout.
     * @returns {Object} Sankey object for chaining
     */
    sankey.relayout = function () {
        computeLinkDepths();
        return sankey;
    };

    /**
     * Returns SVG path generator function for drawing curved Bezier links between nodes.
     * Creates horizontal cubic Bezier curves with configurable curvature.
     * Special handling for partOf links (straight vertical alignment).
     * @returns {Function} Path generator function with curvature() getter/setter
     */
    sankey.link = function () {
        let curvature = 0.7;//1;//.9;

        /**
         * Generates SVG path string for a link between nodes.
         * @param {Object} d - Link object with source, target, dy, sy, ty, and optional partOf properties
         * @returns {string} SVG path string (M...C... format)
         */
        function link(d) {
            // if (d.target.term.getInteractors().size < 30) {
            //     return "M" + 0 + "," + 0;
            // } else {
            const x0 = d.source.x + d.source.dx,
                x1 = d.target.x,
                xi = d3.interpolateNumber(x0, x1),
                x2 = xi(curvature),
                x3 = xi(1 - curvature);
            let y0 = d.source.y + (d.source.dy / 2), // + /*+ d.sy*/ + d.dy / 2,
                y1 = d.target.y + (d.target.dy / 2); // +  /*+ d.ty*/ + d.dy / 2;

            /*  y0 = d.source.y + (d.source.dy / 2) - d.dy / 2,
                  y1 = d.target.y + (d.target.dy / 2) - d.dy / 2,

                  x4 = x1,
                  y4 =  d.target.y + (d.target.dy / 2) + d.dy / 2,

                  x7 = x0,
                  y7 =  d.source.y + (d.source.dy / 2) + d.dy / 2,
                  xi = d3.interpolateNumber(x4, x7),
                  x5 = xi(curvature),
                  x6 = xi(1 - curvature); */


            /*
              var sourceVal = d3.sum(d.source.sourceLinks, value);
              // sourceVal = 0;
              var sourceSize = d.source.term.getInteractors().size;
              console.log(d.source.term.name + " > " + d.target.term.name);
              console.log(sourceVal, sourceSize);*/
            if (d.partOf) {//sourceVal <= sourceSize) {
                //     console.log("**", d.ty);
                y0 = d.source.y; /*+ d.sy + d.dy / 2*/
                y1 = d.target.y;
            }


            return "M" + x0 + "," + y0
                + " C" + x2 + "," + y0
                + " " + x3 + "," + y1
                + " " + x1 + "," + y1;

            // + " L" +  + x4 + "," + y4
            //
            // + " C"  + x5 + "," + y4
            // + " " + x6 + "," + y7
            // + " " + x7 + "," + y7
            //
            // + " Z"
        }

        /**
         * Getter/setter for link curvature (0=straight, 1=very curved).
         * @param {number} [_] - New curvature value (0-1)
         * @returns {number|Function} Current curvature (if no args) or link function (for chaining)
         */
        link.curvature = function (_) {
            if (!arguments.length) return curvature;
            curvature = +_;
            return link;
        };

        return link;
    };
    // Populate the sourceLinks and targetLinks for each node.
    // Also, if the source and target are not objects, assume they are indices.
    function computeNodeLinks() {
        nodes.forEach(function (node) {
            node.sourceLinks = [];
            node.targetLinks = [];
        });
        links.forEach(function (link) {
            let source = link.source,
                target = link.target;
            if (typeof source === "number") source = link.source = nodes[link.source];
            if (typeof target === "number") target = link.target = nodes[link.target];
            source.sourceLinks.push(link);
            target.targetLinks.push(link);
        });
    }

    // Compute the value (size) of each node by summing the associated links.
    function computeNodeValues() {
        nodes.forEach(function (node) {
            // var sourceVal = d3.sum(node.sourceLinks, value);
            // var targetVal = d3.sum(node.targetLinks, value);
            // node.value = Math.max( // targetVal? targetVal : sourceVal//
            //   d3.sum(node.sourceLinks, value),
            //   d3.sum(node.targetLinks, value)
            // );
            //node.value = node.term.getInteractors().size;
            node.value = node.term.filtInteractorCount;
            // console.log("*!", node.value);
        });
    }

    // Iteratively assign the breadth (x-position) for each node.
    // Nodes are assigned the maximum breadth of incoming neighbors plus one;
    // nodes with no incoming links are assigned breadth zero, while
    // nodes with no outgoing links are assigned the maximum breadth.
    function computeNodeBreadths() {
        let remainingNodes = nodes,
            nextNodes,
            x = 0;

        while (remainingNodes.length) {
            nextNodes = [];
            remainingNodes.forEach(function (node) {
                node.x = x;
                node.dx = nodeWidth;
                node.sourceLinks.forEach(function (link) {
                    if (nextNodes.indexOf(link.target) < 0) {
                        nextNodes.push(link.target);
                    }
                });
            });
            remainingNodes = nextNodes;
            ++x;
        }

        //
        moveSinksRight(x);
        scaleNodeBreadths((size[0] - nodeWidth) / (x - 1));
    }

    /*
  function moveSourcesRight() {
    nodes.forEach(function(node) {
      if (!node.targetLinks.length) {
        node.x = d3.min(node.sourceLinks, function(d) { return d.target.x; }) - 1;
      }
    });
  }
  */

    function moveSinksRight(x) {
        nodes.forEach(function (node) {
            if (!node.sourceLinks.length) {
                node.x = x - 1;
            }
        });
    }

    function scaleNodeBreadths(kx) {
        nodes.forEach(function (node) {
            node.depth = node.x;
            node.x *= kx;
        });
    }

    /**
     * Computes depth (y-position) for nodes using iterative relaxation algorithm.
     * Groups nodes by breadth (x-position), initializes y based on value scaling,
     * then iteratively relaxes positions (left-to-right and right-to-left) to minimize link crossings.
     * Resolves vertical collisions by pushing overlapping nodes apart.
     * @param {number} iterations - Number of relaxation iterations to perform
     * @returns {undefined}
     */
    function computeNodeDepths(iterations) {
        const nodesByBreadth = d3.nest()
            .key(function (d) {
                return d.x;
            })
            .sortKeys(d3.ascending)
            .entries(nodes)
            .map(function (d) {
                return d.values;
            });

        //
        initializeNodeDepth();
        resolveCollisions();
        for (let alpha = 1; iterations > 0; --iterations) {
            relaxRightToLeft(alpha *= .99);
            resolveCollisions();
            relaxLeftToRight(alpha);
            resolveCollisions();
        }

        function initializeNodeDepth() {
            let ky = d3.min(nodesByBreadth, function (nodes) {
                return (size[1] - (nodes.length - 1) * nodePadding) / d3.sum(nodes, value);
            });

            ky = Math.max(ky, 0.1);  // mjg

            nodesByBreadth.forEach(function (nodes) {
                nodes.forEach(function (node, i) {
                    node.y = i;
                    node.dy = node.value * ky;
                });
            });

            links.forEach(function (link) {
                link.dy = link.value * ky;
            });
        }

        function relaxLeftToRight(alpha) {
            nodesByBreadth.forEach(function (nodes/*, breadth*/) {
                nodes.forEach(function (node) {
                    if (node.targetLinks.length) {
                        const y = d3.sum(node.targetLinks, weightedSource) / d3.sum(node.targetLinks, value);
                        node.y += (y - center(node)) * alpha;
                    }
                });
            });

            function weightedSource(link) {
                return center(link.source) * link.value;
            }
        }

        function relaxRightToLeft(alpha) {
            nodesByBreadth.slice().reverse().forEach(function (nodes) {
                nodes.forEach(function (node) {
                    if (node.sourceLinks.length) {
                        const y = d3.sum(node.sourceLinks, weightedTarget) / d3.sum(node.sourceLinks, value);
                        node.y += (y - center(node)) * alpha;
                    }
                });
            });

            function weightedTarget(link) {
                return center(link.target) * link.value;
            }
        }

        function resolveCollisions() {
            nodesByBreadth.forEach(function (nodes) {
                let node,
                    dy,
                    y0 = 0;
                const n = nodes.length;
                let i;

                // Push any overlapping nodes down.
                nodes.sort(ascendingDepth);
                for (i = 0; i < n; ++i) {
                    node = nodes[i];
                    dy = y0 - node.y;
                    if (dy > 0) node.y += dy;
                    y0 = node.y + node.dy + nodePadding;
                }

                // If the bottommost node goes outside the bounds, push it back up.
                dy = y0 - nodePadding - size[1];
                if (dy > 0) {
                    y0 = node.y -= dy;

                    // Push any overlapping nodes back up.
                    for (i = n - 2; i >= 0; --i) {
                        node = nodes[i];
                        dy = node.y + node.dy + nodePadding - y0;
                        if (dy > 0) node.y -= dy;
                        y0 = node.y;
                    }
                }
            });
        }

        function ascendingDepth(a, b) {
            return a.y - b.y;
        }
    }

    /**
     * Computes vertical offsets (sy, ty) for links within their source and target nodes.
     * Sorts links by target/source depth to minimize visual crossing, then assigns cumulative offsets.
     * Ensures links stack properly within node heights.
     * @returns {undefined}
     */
    function computeLinkDepths() {
        nodes.forEach(function (node) {
            node.sourceLinks.sort(ascendingTargetDepth);
            node.targetLinks.sort(ascendingSourceDepth);
        });
        nodes.forEach(function (node) {
            let sy = 0, ty = 0;
            node.sourceLinks.forEach(function (link) {
                link.sy = sy;
                sy += link.dy;
            });
            node.targetLinks.forEach(function (link) {
                link.ty = ty;
                ty += link.dy;
            });
        });

        function ascendingSourceDepth(a, b) {
            return a.source.y - b.source.y;
        }

        function ascendingTargetDepth(a, b) {
            return a.target.y - b.target.y;
        }
    }

    function center(node) {
        return node.y + node.dy / 2;
    }

    function value(link) {
        return link.value;
    }

    return sankey;
};

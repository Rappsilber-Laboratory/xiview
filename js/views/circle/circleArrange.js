export const circleArrange = function(proteins, options) {

    function makeNodeEdgeList(protein) {
        var node = {
            id: protein.id,
            length: protein.size,
            edges: []
        };
        var edgeIds = d3.set();

        if (protein.crosslinks) {
            protein.crosslinks.forEach(function(clink) {
                // must have active matches, no intra-protein links, no repeated edges
                if (clink.filteredMatches_pp.length && !clink.isLinearLink() // added this check to account for linears (they have no toProtein)
                    && clink.fromProtein.id !== clink.toProtein.id && !edgeIds.has(clink.id)) {
                    var isFromId = clink.fromProtein.id === protein.id;
                    node.edges.push({
                        edgeId: clink.id,
                        pos: isFromId ? clink.fromResidue : clink.toResidue,
                        otherNode: isFromId ? clink.toProtein.id : clink.fromProtein.id,
                        otherPos: isFromId ? clink.toResidue : clink.fromResidue,
                    });
                    edgeIds.add(clink.id);
                }
            });
        }
        // MJG might not need to sort if nesting anyways - 21/03/2017 - update: yeah, we don't need to
        //node.edges.sort (function (a,b) { return b.pos-a.pos; });
        node.total = node.edges.length;
        //console.log ("flat edges", node.edges);

        node.edges = d3.nest()
            .key(function(d) {
                return d.pos;
            })
            .entries(node.edges);
        //console.log ("nested edges", node.edges);

        return node;
    }


    function makeNodeEdgeLists(proteins) {
        return Array.from(proteins.values()).map(makeNodeEdgeList);
    }


    // pick which node to start with
    var nextNodeAlternatives = {

        // pick node with most number of edges to nodes in pmap
        inwardConn: function(nodeLinkArr, pMap) {
            var max = {
                max: -1,
                node: null
            };
            nodeLinkArr.forEach(function(nodeLink) {
                if (!pMap[nodeLink.id]) {
                    var cur = 0;
                    nodeLink.edges.forEach(function(pos) {
                        pos.values.forEach(function(edge) {
                            if (pMap[edge.otherNode]) {
                                cur++;
                            }
                        });
                    });
                    if (cur > max.max) {
                        max.max = cur;
                        max.node = nodeLink;
                    }
                }
            });
            return max;
        },


        // pick node with least number of edges to nodes not in pmap
        outwardConn: function(nodeLinkArr, pMap) {
            var min = {
                min: Number.MAX_SAFE_INTEGER,
                node: null
            };
            nodeLinkArr.forEach(function(nodeLink) {
                if (!pMap[nodeLink.id]) {
                    var cur = 0;
                    nodeLink.edges.forEach(function(pos) {
                        pos.values.forEach(function(edge) {
                            if (!pMap[edge.otherNode]) {
                                cur++;
                            }
                        });
                    });
                    if (cur < min.min) {
                        min.min = cur;
                        min.node = nodeLink;
                    }
                }
            });

            return min;
        }
    };


    // pick which end to add subsequent nodes to.
    var endingAlternatives = {

        // Baur & Brandes, crossing reduction in circular layouts
        // http://algo.uni-konstanz.de/publications/bb-crcl-04.pdf

        // Baur end append routine 1
        randomEnd: function(order, node) {
            var pos = (Math.random() > 0.5) ? order.length : 0;
            order.splice(pos, 0, node);
        },

        // Baur end append routine 2
        fixedEnd: function(order, node) {
            order.push(node);
        },

        // Baur end append routine 3
        // Calculate lengths of links to be added and work out which end the total will be shortest at.
        leastLengthEnd: function(order, node, interLinks) {

            var allDistance = interLinks.reduce(function(tot, node) {
                return tot + node.length;
            }, 0);

            var orderDistance = order.reduce(function(tot, node) {
                return tot + node.length;
            }, 0);

            var thisNodeSize = node.length;

            var runDistance = 0;
            var leftDistance = 0;
            var rightDistance = 0;
            order.forEach(function(pnode) {
                pnode.edges.forEach(function(pos) {
                    pos.values.forEach(function(edge) {
                        //console.log ("val", val);
                        if (edge.otherNode === node.id) {
                            var leftDist = (thisNodeSize - edge.otherPos) + runDistance + edge.pos;
                            var circLeftDistance = Math.min(allDistance - leftDist, leftDist); // might be closer via circle 'gap'
                            leftDistance += circLeftDistance;

                            var rightDist = (orderDistance + edge.otherPos) - (runDistance + edge.pos);
                            var circRightDistance = Math.min(allDistance - rightDist, rightDist); // might be closer via circle 'gap'
                            rightDistance += circRightDistance;
                        }
                    });
                });
                runDistance += pnode.length;
            });

            //console.log (node, "left", leftDistance, "right", rightDistance);  
            var pos = (leftDistance > rightDistance) ? order.length : 0;
            order.splice(pos, 0, node);

            return order;
        },


        // Baur end append routine 4A - added stuff by me
        // check for open-edge crossings on individual level
        // check for open-edge crossings in added protein too depending on direction added
        leastCrossingsEnd: function(order, node, interLinks, pMap) {

            // make two orderings, one adding a node to start of existing list, another to the end
            var lcrossTest = [node].concat(order);
            var rcrossTest = order.concat(node);
            var orders = [lcrossTest, rcrossTest];
            //console.log ("l", lcrossTest, rcrossTest, node, order);

            // get ordering (either adding to start or end) which produces the least extra crossings
            var crossings = orders.map(function(run) {
                var tot = 0;
                var active = 0;
                var activeSet = d3.set();
                run.forEach(function(pnode) {
                    pnode.edges.forEach(function(pos) {
                        var curActive = active;
                        var openCount = 0;
                        pos.values.forEach(function(edge) {
                            var enode = edge.otherNode;
                            var isOpenEdge = !(enode === node.id || pMap[enode]); // is edge that has unlinked endpoint to another node in current node set
                            if (isOpenEdge) {
                                openCount++;
                            } else if (activeSet.has(edge.edgeId)) {
                                activeSet.remove(edge.edgeId);
                                active--;
                                curActive--;
                            } else {
                                activeSet.add(edge.edgeId);
                                active++;
                            }
                        });
                        tot += (curActive * openCount); // use curClosed so we don't include links opened at same pos as crossings
                        //console.log ("pnode", pnode, "pos", pos, "curClosed", curClosed, "openCount", openCount, "tot", tot);
                    });
                });
                return {
                    order: run,
                    total: tot
                };
            });

            var minCrossing = _.min(crossings, function(c) {
                return c.total;
            });
            order = minCrossing.total < 1000 ? minCrossing.order : orders[0];
            //console.log ("leastCross", minCrossing, crossings);   
            return order;
        },
    };


    var shuffleAlternatives = {
        randomShuffle: function(order, node, interLinks, pMap, variations) {

            // console.log ("RUN", run);
            // count number of crossings given a full list of nodes
            // Edges are arranged in order, per protein and then per position, and then run through in that order.
            // openArr and openSet keep a running tally of unclosed edges (i.e. edges where one end has been encountered so far but not the other)
            // If the closing point of an open edge is encountered then the number of crossings it must make to close is found through openArr
            // i.e. if openArr is [E1, E3, E10, E15, E20] and the closing position of edge E3 is encountered next, 
            // then the edges [E10, E15, E20] must in future cross through it to reach their end points, so totalCrossings is incremented by 3
            function countCrossing(run) {
                var tot = 0;
                var open = 0;
                var openSet = d3.set();
                var openArr = [];

                run.forEach(function(pnode) {
                    //console.log ("NODE", pnode.id, pnode);
                    pnode.edges.forEach(function(pos) {
                        var curOpen = open;
                        var freeCount = 0;
                        var openEdgeCount = openArr.length;
                        var justClosed = [];
                        pos.values.forEach(function(edge) {
                            // if encountering closing position of an open edge
                            if (openSet.has(edge.edgeId)) {
                                // reduce open totals, add to justClosed array
                                open--;
                                curOpen--;
                                justClosed.push(openArr.indexOf(edge.edgeId));
                            }
                        });

                        // If closing edges encountered, work out the crossings they incur
                        var closedLen = justClosed.length;
                        if (closedLen) {
                            justClosed.sort(function(a, b) {
                                return a - b;
                            }); // grr, default is to sort numbers alphabetically
                            //console.log ("removed", removed, activeArr);
                            for (var n = closedLen; --n >= 0;) {
                                var cpos = justClosed[n];
                                // openEdgeCount - cpos = number of intervening edges between start of current edge and its end point (which is now)
                                // closedLen - n = number of edges that have also closed at this exact same point: we don't count them as crossings
                                var cutsThrough = (openEdgeCount - cpos) - (closedLen - n);
                                tot += cutsThrough;
                                //console.log ("total inc'ed", l-cpos, l, cpos, cutsThrough, openArr, tot);   
                                openArr.splice(cpos, 1); // remove closed edge from open edge array
                            }
                            //console.log ("postremoved", activeArr);
                        }

                        // remove or add edges from open edge array / sets as applicable
                        pos.values.forEach(function(edge) {
                            var enode = edge.otherNode;
                            var isFreeEdge = !(enode === node.id || pMap[enode]); // SHOULDN'T HAPPEN NOW PMAP IS FULL SET OF NODES.
                            if (isFreeEdge) {
                                freeCount++;
                            } else if (openSet.has(edge.edgeId)) {
                                openSet.remove(edge.edgeId);
                            } else {
                                openSet.add(edge.edgeId);
                                openArr.push(edge.edgeId);
                                open++;
                            }
                        });

                        tot += (curOpen * freeCount); // use curActive so we don't include links opened at same pos as crossings
                        //console.log ("shuffle. pnode", pnode, "pos", pos, "curOpen", curOpen, "openArr", openArr, "freeCount", freeCount, "tot", tot);
                    });
                });
                return tot;
            }

            // Random shuffle
            function swapRandomPair() {
                var newOrder = order.slice(0);
                var n = Math.floor((Math.random() * order.length));
                var m = Math.floor((Math.random() * (order.length - 1)));
                if (m >= n) {
                    m++;
                }
                var temp = newOrder[n];
                newOrder[n] = newOrder[m];
                newOrder[m] = temp;
                return newOrder;
            }

            // try and improve the ordering by randomly swapping pairs of nodes and recalculating the number of crossings
            // If crossings less than the previous value then keep the new ordering as the basis for the next swap
            // Prone to local minima and not reproducible but searching full space is prohibitive (20 nodes = 20! combinations)
            var min = 100000;
            var shuffledOrder = order;
            for (var n = 0; n < variations && min > 0; n++) {
                var crossings = countCrossing(shuffledOrder);
                if (crossings < min) {
                    min = crossings;
                    order = shuffledOrder;
                }
                shuffledOrder = swapRandomPair(order);
                //console.log (crossings, shuffledOrder, "cur | min", min, order);
            }

            return order;
        }
    };



    function sort(interLinks, options) {
        var order = [];
        var pMap = {};
        interLinks.sort(function(a, b) {
            return b.total - a.total;
        });

        for (var n = 0; n < interLinks.length; n++) {
            // pick the next node to add to the previously added nodes
            var choice = nextNodeAlternatives[options.crossingMethod](interLinks, pMap);

            // pick which end of the list of previously added nodes to add this next node to
            order = endingAlternatives[options.endType](order, choice.node, interLinks, pMap);
            pMap[choice.node.id] = true;
        }

        order = shuffleAlternatives[options.shuffleType](order, {
            id: null
        }, interLinks, pMap, 50);
        return order;
    }

    var pArray = Array.from(proteins.values());
    if (pArray.length < 2) {
        return (pArray.length === 1 ? [pArray[0].id] : []);
    }

    var interLinks = makeNodeEdgeLists(proteins);
    var defaults = {
        crossingMethod: "inwardConn",
        endType: "leastCrossingsEnd",
        shuffleType: "randomShuffle"
    };
    var combinedOptions = _.extend({}, defaults, options || {});

    return _.pluck (sort(interLinks, combinedOptions), "id");
};
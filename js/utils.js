import * as _ from 'underscore';
import d3 from "d3";
// import * as $ from "jquery";

export const utils = {

    debug: false,

    xilog: function () {
        if (this.debug && (typeof (console) !== 'undefined')) {
            console.log.apply(console, arguments);
        }
    },

    commonRegexes: {
        uniprotAccession: new RegExp("[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}", "i"),
        pdbPattern: "[A-Za-z0-9]{4}",
        multiPdbPattern: "(\\b[A-Za-z0-9]{4}((\\W+)|$))+",    // matches only if full string conforms to 4 char and some separator pattern (double escaped)
        multiPdbSplitter: /(\b[A-Za-z0-9]{4}\b)+/g, // matches parts of the string that conform to 4 char and some separator pattern
        hexColour: new RegExp("#[0-9A-F]{3}([0-9A-F]{3})?", "i"), // matches #3-char or #6-char hex colour strings
        validDomID: /^[^a-z]+|[^\w:.-]+/gi,
        invalidFilenameChars: /[^a-zA-Z0-9-=&()¦_\\.]/g,
        digitsOnly: "\\d{3,}",
    },

    // return comma-separated list of protein names from array of protein ids
    proteinConcat: function (match, matchedPeptideIndex, clmsModel) {
        const mpeptides = match.matchedPeptides[matchedPeptideIndex];
        const pnames = mpeptides ? mpeptides.prt.map(function (pid) {
            return clmsModel.get("participants").get(pid).name;
        }) : [];
        return pnames.join(";");
    },

    pepPosConcat: function (match, matchedPeptideIndex) {
        const mpeptides = match.matchedPeptides[matchedPeptideIndex];
        return mpeptides ? mpeptides.pos.join("; ") : "";
    },

    fullPosConcat: function (match, matchedPeptideIndex) {
        const mpeptides = match.matchedPeptides[matchedPeptideIndex];
        const linkPos = matchedPeptideIndex === 0 ? match.linkPos1 : match.linkPos2;
        return mpeptides ? mpeptides.pos.map(function (v) {
            return v + linkPos - 1;
        }).join("; ") : "";
    },

    commonLabels: {
        downloadImg: "Download Image As ", // http://ux.stackexchange.com/a/61757/76906
        shareLink: "Share Search Link with Current Filter State",
    },

    commonTemplates: {
        downloadImg: _.template("Download Image As <%=fileType%>"),
        downloadCSV: _.template("Download Filtered <%=items> as CSV"),
    },



    // http://stackoverflow.com/questions/10066630/how-to-check-if-element-is-visible-in-zepto
    isZeptoDOMElemVisible: function (zeptoElem) { // could be a jquery-ref'ed elem as well
        //console.log ("zepto", zeptoElem);
        const display = zeptoElem.css('display') !== 'none';
        return display && (zeptoElem.css('visibility') !== 'hidden') && (zeptoElem.height() > 0);
    },

    // try .layerX / .layerY first as .offsetX / .offsetY is wrong in firefox
    // in fact don't use layerX / offsetX, they're unreliable cross-browser
    crossBrowserElementX: function (evt, optElem) {
        return evt.clientX - $(optElem || evt.target).offset().left; // use evt.target if no optional element passed
        //return (evt.layerX || evt.offsetX) - evt.target.offsetLeft;
    },

    crossBrowserElementY: function (evt, optElem) {
        return evt.clientY - $(optElem || evt.target).offset().top;
    },

    niceRoundMap: {
        1: 1,
        2: 2,
        3: 5,
        4: 5,
        5: 5,
        6: 10,
        7: 10,
        8: 10,
        9: 10,
        10: 10
    },

    niceRound: function (val) {
        const log = Math.floor(Math.log(val) / Math.log(10)); //no log10 func in IE
        const pow = Math.pow(10, log);
        val = Math.ceil(val / pow); // will now be a number 1-10
        let roundVal = utils.niceRoundMap[val];
        roundVal *= pow;
        return roundVal;
    },

    // correlates to d3's .round with decimal places function
    ceil: function (val, decimalPlaces) {
        const pow = Math.pow(10, decimalPlaces);
        val *= pow;
        val = Math.ceil(val);
        return val / pow;
    },

    floor: function (val, decimalPlaces) {
        const pow = Math.pow(10, decimalPlaces);
        val *= pow;
        val = Math.floor(val);
        return val / pow;
    },

    toNearest: function (val, interval) {
        // adapted from https://stackoverflow.com/a/27861660/368214 - inverting small intervals avoids .00000001 stuff
        return interval ?
            (Math.abs(interval) > 1 ? Math.round(val * interval) / interval : Math.round(val / interval) * interval)
            : val
            ;
    },

    displayError: function (condition, message, borderColour, scale) {
        if (condition()) {
            let box = d3.select("#clmsErrorBox");
            if (box.empty()) {
                box = d3.select("body").append("div").attr("id", "clmsErrorBox");
                box.append("div");
                box.append("i")
                    .attr("class", "fa fa-times-circle errorCloseButton closeButton")
                    .attr("title", "Close Dialog")
                    .on("click", function () {
                        box.style("display", "none");
                    });
            }

            box
                .style("opacity", 0)
                .style("display", "block")
                .style("border-color", borderColour || null)
                .style("transform", "scale(" + (scale || "1") + ")")
                .style("margin", "3em 9em")
                .select("div")
                .html(message)
            ;
            box
                .transition()
                .duration(500)
                .style("opacity", 1)
            ;
        }
    },

    makeCanvas: function (width, height, existingD3CanvasSel) {
        const canvas = (existingD3CanvasSel ? existingD3CanvasSel.node() : null) || document.createElement("canvas");
        const d3canvas = d3.select(canvas);
        d3canvas
            .attr("width", width)
            .attr("height", height)
        ;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const canvasData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        // const cd = canvasData.data;
        return {canvas: canvas, context: ctx, dataStructure: canvasData, d3canvas: d3canvas};
    },

    nullCanvasObj: function (canvasObj) {
        canvasObj.canvas = null;
        canvasObj.context = null;
        canvasObj.dataStructure = null;
    },

    drawCanvasToSVGImage: function (d3canvas, svgImage, callback) { // d3canvas is a canvas wrapped in a d3 selection
        let destinationCanvasObj;
        let url;

        const width = d3canvas.attr("width");
        const height = d3canvas.attr("height");

        svgImage.on("load", function () {
            // tidy up canvas and url
            utils.nullCanvasObj(destinationCanvasObj);
            const DOMURL = URL || webkitURL || this;
            DOMURL.revokeObjectURL(url);

            // do callback
            callback(svgImage);
        })
            .attr("width", width)
            .attr("height", height)
            .attr("transform", d3canvas.style("transform"))
            .attr("xlink:href", function () {
                // from https://stackoverflow.com/a/19539048/368214
                // use dummy canvas and fill with background colour so exported png is not transparent

                destinationCanvasObj = utils.makeCanvas(width, height);
                const destinationCanvas = destinationCanvasObj.canvas;

                //create a rectangle with the desired color
                const background = d3canvas.style("background-color");
                /*
                console.log("background", background, d3canvas);
                // convert if background style string in rgb() format
                if (background && background[0] !== '#') {
                    var rgb = d3.rgb(background);
                    background = rgb.toString();
                }
                */
                console.log("background", background, width, height);
                destinationCanvasObj.context.fillStyle = background;
                destinationCanvasObj.context.fillRect(0, 0, width, height);

                //draw the original canvas onto the destination canvas
                destinationCanvasObj.context.drawImage(d3canvas.node(), 0, 0);

                url = destinationCanvas.toDataURL("image/png");
                return url;
            })
        ;
    },

    // Hide overlapping d3 axis labels
    declutterAxis: function (d3AxisElem, keepHidden) {
        let lastBounds = {
            left: -100,
            right: -100,
            top: -100,
            bottom: -100
        };
        d3AxisElem.selectAll(".tick text").style("visibility", "visible");

        d3AxisElem.selectAll(".tick text")
            .each(function (d) {
                const text = d3.select(this);
                const elemVis = text.style("visibility") !== "hidden";
                if (elemVis) {
                    const bounds = this.getBoundingClientRect();
                    if (bounds.width * bounds.height !== 0) {
                        const overlap = !(bounds.right <= lastBounds.left + 1 || bounds.left >= lastBounds.right - 1 || bounds.bottom <= lastBounds.top + 1 || bounds.top >= lastBounds.bottom - 1);
                        text.style("visibility", overlap ? "hidden" : "visible");
                        if (!overlap) {
                            lastBounds = bounds;
                        }
                    }
                }
            });
    },

    // Remove non-round d3 axis labels and associated ticks
    niceValueAxis: function (d3AxisElem, maxVal) {
        const u = Math.round(Math.log10(maxVal + 3)) - 1;
        const m = Math.pow(10, u);

        d3AxisElem.selectAll(".tick")
            .each(function (d) {
                const nice = d % m === 0;
                const tick = d3.select(this);
                tick.style("stroke-width", nice ? 2 : 1);
                const text = tick.select("text");
                if (!nice) {
                    text.text("");
                } else {
                    text.style("display", "block");
                }
            })
        ;
    },

    makeLegalDomID: function (id) {
        return id.replace(utils.commonRegexes.validDomID, "");
    },

    // Routine assumes on click methods are added via backbone definitions, though they could be added later with d3
    // targetDiv is a d3 select element
    // buttonData array of objects of type:
    // {class: "circRadio", label: "Alphabetical", id: "alpha", type: "radio"|"checkbox"|"button",
    // initialState: true|false, group: "sort", tooltip: "tooltipText", noBreak: true|false},
    makeBackboneButtons: function (targetDiv, baseID, buttonData) {
        const makeID = function (d) {
            return utils.makeLegalDomID(baseID + d.id);
        };

        // Don't make buttons whose id already exists
        buttonData = buttonData.filter(function (d) {
            return d3.select("#" + makeID(d)).empty();
        });

        targetDiv.selectAll("button.tempClass") // .tempClass ensures existing buttons aren't picked up, only new ones created
            .data(buttonData.filter(function (bd) {
                return bd.type === "button";
            }), function (d) {
                return d.id;
            })
            .enter()
            .append("button")
            .text(function (d) {
                return d.label;
            })
            .attr("class", function (d) {
                return d.class;
            })
            .classed("btn btn-1 btn-1a", true) // and we don't class .temp so these can't be picked up by a subsequent call to make backbonebuttons
            .attr("title", function (d) {
                return d.tooltip;
            })
            .attr("id", makeID);

        const cboxes = targetDiv.selectAll("label.tempClass") // .tempClass ensures existing buttons aren't picked up, only new ones created
            .data(buttonData.filter(function (bd) {
                return bd.type === "checkbox" || bd.type === "radio";
            }), function (d) {
                return d.id;
            })
            .enter()
            .append("label")
            .attr("class", "noBreak"/* btn"*/)
            .attr("title", function (d) {
                return d.tooltip;
            })
            .attr("id", makeID);

        // add header if asked for
        cboxes
            .filter(function (d) {
                return d.header;
            })
            .append("span")
            .attr("class", "ddSectionHeader")
            .text(function (d) {
                return d.header;
            });

        // add text first if asked for
        cboxes
            .filter(function (d) {
                return !d.inputFirst;
            })
            .append("span")
            .style("white-space", function (d) {
                return d.noBreak ? "nowrap" : "normal";
            })
            .text(function (d) {
                return d.label;
            });

        // add input control
        cboxes.append("input")
            .attr("type", function (d) {
                return d.type;
            })
            .attr("class", function (d) {
                return d.class;
            })
            .property("checked", function (d) {
                return d.initialState;
            })
            .property("value", function (d) {
                return d.value;
            })
            .each(function (d) {
                if (d.group) {
                    d3.select(this).attr("name", d.group);
                }
            });

        // add text last if asked for
        cboxes
            .filter(function (d) {
                return d.inputFirst;
            })
            .append("span")
            .style("white-space", function (d) {
                return d.noBreak ? "nowrap" : "normal";
            })
            .text(function (d) {
                return d.label;
            });
    },

    // Functions for making useful file names

    objectStateToAbbvString: function (object, fields, zeroFormatFields, abbvMap) {
        fields = fields.filter(function (field) {
            const val = object.get ? object.get(field) || object[field] : object[field];
            return !(val === "" || val === false || val === undefined);
        }, this);

        //console.log ("fields", fields);

        const zeroFormat = d3.format(".4f");
        const strValue = function (field, val) {
            if (val === true) {
                return "";
            }
            if (zeroFormatFields.has(field) && !isNaN(val)) {
                return zeroFormat(val);
            }
            if ($.isArray(val)) {
                const arrayStr = val.map(function (elem) {
                    return strValue(field, elem);
                });
                return arrayStr.join("-");
            }
            return val;
        };

        const strParts = fields.map(function (field) {
            const val = object.get ? object.get(field) || object[field] : object[field];
            return (abbvMap[field] || field.toUpperCase()) + (val === true ? "" : "=" + strValue(field, val));
        }, this);
        return strParts.join(".");
    },

    filterStateToString: function () {
        const filterStr = window.compositeModelInst.get("filterModel").stateString();
        return filterStr.substring(0, 160);
    },

    searchesToString: function () {
        const searches = Array.from(window.compositeModelInst.get("clmsModel").get("searches"));
        const searchKeys = _.pluck(searches, 0); // just the keys
        const searchStr = ("SRCH=" + searchKeys.join("-")).substring(0, 40);
        return searchStr;
    },

    makeLegalFileName: function (fileNameStr) {
        let newStr = fileNameStr.replace(utils.commonRegexes.invalidFilenameChars, "");
        newStr = newStr.substring(0, 240);
        return newStr;
    },


    // Function for making a cross-link colour key as an svg group element
    updateColourKey: function (colourAssign, svgElem) {
        svgElem.attr("height", "200");

        const keyGroup = svgElem.selectAll("g.key").data([0]);
        keyGroup.enter()
            .append("g").attr("class", "key")
            .append("text").attr("class", "keyTitle")
        ;

        if (colourAssign) {
            keyGroup.select("text.keyTitle")
                .attr("y", 12)
                .text("Key: " + colourAssign.get("title"))
            ;

            const schemeType = colourAssign.get("type");
            const colScale = colourAssign.get("colScale");
            const domain = colScale.domain();
            const labelColourPairs = colourAssign.getLabelColourPairings();
            const isLinear = schemeType === "linear";
            const linearHeight = 150;
            const normalScale = d3.scale.linear().domain(d3.extent(domain)).range([0, 100]);
            const heightScale = d3.scale.linear().domain(d3.extent(domain)).range([18, linearHeight + 18]);

            if (schemeType === "threshold") {
                labelColourPairs.forEach(function (pair, i) {
                    if (i < labelColourPairs.length - 1) {    // don't do for last category - which is unknown
                        const d1 = i > 0 ? ">" + domain[i - 1] : undefined;
                        const d2 = i < domain.length ? "<" + domain[i] : undefined;
                        const dp = [d1, d2].filter(function (d) {
                            return d !== undefined;
                        });
                        pair[0] += " (" + dp.join(" & ") + ")";
                    }
                });
            }

            // set y-position of colour swatches and labels
            labelColourPairs.forEach(function (pair, i) {
                pair[2] = isLinear ? (domain[i] === undefined ? _.last(heightScale.range()) + 15 : heightScale(domain[i])) : 3 + ((i + 1) * 15);
            });

            const colourElems = keyGroup.selectAll("g.keyPoint").data(colourAssign.get("fixed") ? [] : labelColourPairs);
            colourElems.exit().remove();
            const newElems = colourElems.enter().append("g")
                .attr("class", "keyPoint")
                .attr("transform", function (d) {
                    return "translate(0," + d[2] + ")";
                })
            ;
            newElems.append("rect")
                .attr("height", 4)
                .attr("width", "1em")
                .attr("x", 1)
                .attr("y", 5)
                .style("stroke", "none")
            ;
            newElems.append("text")
                .attr("x", 19)
                .attr("y", 12)
            ;
            colourElems.select("rect")
                .style("fill", function (d, i) {
                    return d[1];
                })
                // hide individual colour swatches if showing linear scale
                .style("display", function (d) {
                    return isLinear && d[0] !== colourAssign.get("undefinedLabel") ? "none" : null;
                })
            ;
            colourElems.select("text").text(function (d, i) {
                return d[0];
            });


            if (isLinear && !colourAssign.get("fixed")) {
                // Make gradient and fill a rect with it
                const gradID = "grad" + Math.ceil(Math.random() * 100000);

                const defs = svgElem.selectAll("defs").data([0]);
                defs.enter().append("defs");
                const grad = defs.selectAll("#" + gradID).data([0]);
                const newGrad = grad.enter().append("linearGradient")
                    .attr("id", gradID)
                    .attr("x1", "0%")
                    .attr("x2", "0%")
                    .attr("y1", "0%")
                    .attr("y2", "100%")
                ;
                newGrad.selectAll("stop").data(domain)
                    .enter()
                    .append("stop")
                    .attr("offset", function (d) {
                        return Math.round(normalScale(d)) + "%";
                    })
                    .attr("stop-color", function (d, i) {
                        return labelColourPairs[i][1];
                    })
                ;

                svgElem.selectAll("rect.gradientScale").remove();

                keyGroup.append("rect")
                    .attr("class", "gradientScale")
                    .attr("x", 1)
                    .attr("y", heightScale.range()[0] + 5)
                    .attr("width", "1em")
                    .attr("height", heightScale.range()[1] - heightScale.range()[0])
                    .attr("fill", "url(#" + gradID + ")")
                ;
            }

            // add undefined category
        }
    },

    updateAnnotationColourKey: function (bbModelArray, svgElem, myOptions) {
        const defaults = {
            colour: function (d) {
                return d.colour;
            },
            label: function (d) {
                return d.label || d.name;
            },
            title: "Key",
        };
        const options = $.extend({}, defaults, myOptions);

        let keyGroup = svgElem.select("g.key");
        if (keyGroup.empty()) {
            svgElem
                .append("g")
                .attr("class", "key")
                .append("text").attr("class", "keyTitle");
        }
        keyGroup = svgElem.select("g.key");

        keyGroup.select("text.keyTitle")
            .attr("y", 12)
            .text("Key: " + options.title);

        const pairUp = bbModelArray.map(function (model) {
            const modelJSON = model.toJSON();
            return [options.colour(modelJSON), options.label(modelJSON)];
        });

        const colourElems = keyGroup.selectAll("g.keyPoint").data(pairUp);
        colourElems.exit().remove();
        const newElems = colourElems.enter().append("g")
            .attr("class", "keyPoint")
            .attr("transform", function (d, i) {
                return "translate(0," + (3 + ((i + 1) * 15)) + ")";
            });
        newElems.append("rect")
            .attr("x", 1)
            .attr("width", "1em")
            .attr("height", "1em");
        newElems.append("text")
            .attr("x", 19)
            .attr("y", 12);
        colourElems.select("rect").style("fill", function (d) {
            return d[0];
        });
        colourElems.select("text").text(function (d) {
            return d[1];
        });
    },


    // settings can be
    // addToElem - element to add select elements to
    // selectList - names of select elements to add
    // optionList - options to add to each select element (same)
    // selectLabelFunc - function to set human readable name for select element label
    // optionLabelFunc - function to set human readable name for option
    // changeFunc - function that runs when change event occurs on a select element
    // initialSelectionFunc - function that decides initially set option
    addMultipleSelectControls: function (settings) {
        const defaults = {
            selectList: [],
            optionList: [],
            selectLabelFunc: function (d) {
                return d;
            },
            optionLabelFunc: function (d) {
                return d;
            },
            optionValueFunc: function (d) {
                return d;
            },
            optionSortFunc: undefined,
            selectLabelTooltip: function (d) {
                return undefined;
            },
            initialSelectionFunc: function (d, i) {
                return i === 0;
            },
            idFunc: function (d, i) {
                return i;
            },
        };
        settings = _.extend(defaults, settings);

        // Add a number of select widgets for picking axes data types
        const selectHolders = settings.addToElem.selectAll("label.selectHolder")
            .data(settings.selectList, function (d) {
                return d.id ? d.id : d;
            });

        // new select elements
        selectHolders
            .enter()
            .append("label")
            .attr("class", "btn selectHolder")
            .append("span")
            .attr("class", "noBreak")
            .each(function (d) {
                const tip = settings.selectLabelTooltip(d);
                if (tip) {
                    d3.select(this).attr("title", tip);
                }
            })
            .text(settings.selectLabelFunc)
            .append("select")
            .on("change", settings.changeFunc);

        let optionData = settings.optionList.slice();
        if (settings.keepOldOptions) {
            const existingOptions = selectHolders.select("select").selectAll("option");
            const oldData = existingOptions.length ? existingOptions.data() : [];
            //console.log ("OLD DATA", oldData);
            optionData = oldData.concat(optionData);
        }
        //console.log ("SETTINGS", optionData);

        // add options to new and existing select elements
        const selects = selectHolders.selectAll("select");
        const options = selects
            .selectAll("option")
            .data(optionData, settings.idFunc);
        options.exit().remove();
        options
            .enter()
            .append("option")
            .property("selected", settings.initialSelectionFunc) // necessary for IE not to fall over later (it detects nothing is selected otherwise)
        ;
        options
            .text(settings.optionLabelFunc)
            .property("value", settings.optionValueFunc)
        ;
        if (settings.optionSortFunc) {
            options.sort(settings.optionSortFunc);
        }

        return selects;
    },

    // add to local storage, partObj is object such as {distanceColours: {"BS3": {domain:[15,25], range:["red", "blue", "green"]} }} that gets merged
    // into existing stored object
    setLocalStorage: function (partObj, objName) {
        objName = objName || "xiView";
        const storageStr = localStorage.getItem(objName) || "{}";
        let storage = JSON.parse(storageStr);
        storage = $.extend(true, storage, partObj);
        localStorage.setItem(objName, JSON.stringify(storage));
    },

    getLocalStorage: function (objName) {
        objName = objName || "xiView";
        const storageStr = localStorage.getItem(objName) || "{}";
        return JSON.parse(storageStr);
    },

    // is local storage viable?
    canLocalStorage: function () {
        try {
            localStorage.setItem('mod_xi', 'mod');
            localStorage.removeItem('mod_xi');
            return true;
        } catch (e) {
            return false;
        }
    },

};

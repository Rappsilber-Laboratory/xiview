var CLMSUI = CLMSUI || {};

CLMSUI.utils = {

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

    addFourCorners: function (d3DivSelection) {
        const classNames = ["dynDiv_resizeDiv_tl", "dynDiv_resizeDiv_tr", "dynDiv_resizeDiv_bl", "dynDiv_resizeDiv_br"];
        const fourCorners = d3DivSelection
            .selectAll("div")
            .data(classNames, function (d) {
                return d;
            }) // key on classnames
            .enter()
            .append("div")
            .attr("class", function (d) {
                return d;
            }) // make class the classname entry
            .classed("draggableCorner", true);

        return fourCorners;
    },

    addDynDivParentBar: function (d3DivSelection) {
        const parentBar = d3DivSelection
            .append("div")
            .attr("class", "dynDiv_moveParentDiv dynDiv_bodyLimit");

        parentBar
            .append("span")
            .attr("class", "dynTitle")
        //.text ("Title")
        ;

        parentBar
            .append("i")
            .attr("class", "fa fa-times-circle closeButton panelMenuButton")
            .attr("title", "Hide View")
        ;

        return parentBar;
    },

    addDynDivScaffolding: function (d3DivSelection) {
        CLMSUI.utils.addDynDivParentBar(d3DivSelection);
        CLMSUI.utils.addFourCorners(d3DivSelection);
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

    buttonView: Backbone.View.extend({
        tagName: "span",
        className: "buttonPlaceholder",
        events: {
            "click button": "buttonClicked"
        },

        initialize: function (viewOptions) {
            const defaultOptions = {};
            this.options = _.extend(defaultOptions, viewOptions.myOptions);

            // this.el is the dom element this should be getting added to, replaces targetDiv
            const sel = d3.select(this.el);
            if (!sel.attr("id")) {
                sel.attr("id", this.options.id);
            }

            sel.append("button")
                .attr("class", "btn")
                .text(this.options.label);
        },

        buttonClicked: function () {
            CLMSUI.vent.trigger(this.options.eventName, true);
        }
    }),

    checkBoxView: Backbone.View.extend({
        tagName: "span",
        className: "buttonPlaceholder",
        events: {
            "click input": "checkboxClicked"
        },

        initialize: function (viewOptions) {

            //console.log ("this", this.model);
            const defaultOptions = {
                labelFirst: true
            };
            this.options = _.extend(defaultOptions, viewOptions.myOptions);

            // this.el is the dom element this should be getting added to, replaces targetDiv
            const sel = d3.select(this.el);
            if (!sel.attr("id")) {
                sel.attr("id", CLMSUI.utils.makeLegalDomID(this.options.id));
            }

            const labs = sel.append("label")
                .attr("class", "btn")
            ;
            labs.append("input")
                .attr("id", sel.attr("id") + "ChkBx")
                .attr("type", "checkbox")
            ;
            const labelText = this.options.labelFirst ? labs.insert("span", ":first-child") : labs.append("span");
            labelText.text(this.options.label);

            // Remember to listen to changes to model or global event state that come from outside the view (keeps it in sync with models)
            if (this.model && this.options.toggleAttribute) {
                this.showState(this.model.get(this.options.toggleAttribute)); // initial state
                this.listenTo(this.model, "change:" + this.options.toggleAttribute, this.showState);
            } else if (this.options.eventName) {
                this.listenTo(CLMSUI.vent, this.options.eventName, this.showState);
            }
        },

        showState: function (args) {
            const boolVal = arguments.length > 1 ? arguments[1] : arguments[0];
            d3.select(this.el).select("input").property("checked", boolVal);
        },

        checkboxClicked: function () {
            const checked = d3.select(this.el).select("input").property("checked");
            if (this.model && this.options.toggleAttribute) {
                this.model.set(this.options.toggleAttribute, checked);
            } else if (this.options.eventName) {
                CLMSUI.vent.trigger(this.options.eventName, checked);
            }
        }
    }),

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
        let roundVal = CLMSUI.utils.niceRoundMap[val];
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
            CLMSUI.utils.nullCanvasObj(destinationCanvasObj);
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

                destinationCanvasObj = CLMSUI.utils.makeCanvas(width, height);
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

    RadioButtonFilterViewBB: Backbone.View.extend({
        tagName: "div",
        events: {
            "click .singleRadioButton": "changeFilter"
        },
        initialize: function (initData) {
            const defaultOptions = {
                states: [0, 1],
                labels: ["Option 1", "Option 2"],
                header: "A Filter",
                eventName: undefined,
                labelGroupFlow: "horizontalFlow"
            };
            this.options = _.extend(defaultOptions, initData.myOptions);
            if (this.options.eventName) {
                this.listenTo(CLMSUI.vent, this.options.eventName, this.showState);
            }
            this.render();
        },

        render: function () {
            const self = this;
            const con = d3.select(this.el);
            con.append("p").attr("class", "headerLabel").text(this.options.header);

            const sel = con.selectAll("label.singleChoice").data(this.options.states);
            const labs = sel.enter()
                .append("label")
                .attr("class", "singleChoice " + self.options.labelGroupFlow);
            labs
                .append("input")
                .attr("type", "radio")
                .attr("name", self.el.id + "RBGroup")
                .attr("value", function (d) {
                    return d;
                })
                .attr("class", "singleRadioButton")
            //.property("checked", function(d,i) { return i == self.options.presetIndex; })
            ;
            const labels = this.options.labels;
            labs.append("span").text(function (d, i) {
                return labels[i];
            });
        },

        showState: function (filterVal) {
            //console.log ("in show state rb", filterVal);
            const self = this;
            d3.select(this.el).selectAll("input.singleRadioButton")
                .property("checked", function (d, i) {
                    return self.options.states[i] === filterVal;
                });
        },

        changeFilter: function (evt) {
            if (this.options.eventName) {
                CLMSUI.vent.trigger(this.options.eventName, +evt.currentTarget.value);
            }
        }
    }),

    makeLegalDomID: function (id) {
        return id.replace(CLMSUI.utils.commonRegexes.validDomID, "");
    },

    // Routine assumes on click methods are added via backbone definitions, though they could be added later with d3
    // targetDiv is a d3 select element
    // buttonData array of objects of type:
    // {class: "circRadio", label: "Alphabetical", id: "alpha", type: "radio"|"checkbox"|"button",
    // initialState: true|false, group: "sort", tooltip: "tooltipText", noBreak: true|false},
    makeBackboneButtons: function (targetDiv, baseID, buttonData) {
        const makeID = function (d) {
            return CLMSUI.utils.makeLegalDomID(baseID + d.id);
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
        const filterStr = CLMSUI.compositeModelInst.get("filterModel").stateString();
        return filterStr.substring(0, 160);
    },

    searchesToString: function () {
        const searches = Array.from(CLMSUI.compositeModelInst.get("clmsModel").get("searches"));
        const searchKeys = _.pluck(searches, 0); // just the keys
        const searchStr = ("SRCH=" + searchKeys.join("-")).substring(0, 40);
        return searchStr;
    },

    makeLegalFileName: function (fileNameStr) {
        let newStr = fileNameStr.replace(CLMSUI.utils.commonRegexes.invalidFilenameChars, "");
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

    BaseFrameView: Backbone.View.extend({

        events: {
            // following line commented out, mouseup sometimes not called on element if pointer drifts outside element
            // and dragend not supported by zepto, fallback to d3 instead (see later)
            // "mouseup .draggableCorner": "relayout",    // do resize without dyn_div alter function
            "click .downloadButton": "downloadSVG",
            "click .downloadButton2": "downloadSVGWithCanvas",
            "click .closeButton": "hideView",
            "click .hideToolbarButton": "hideToolbarArea",
            "click .takeImageButton": "takeImage",
            "click .maximiseButton": "minMaxPanel",
            "click": "bringToTop",
        },

        initialize: function (viewOptions) {

            // window level options that don't depend on type of view
            const globalOptions = {
                canBringToTop: true,
                canMaximise: true,
                background: null,
                canHideToolbarArea: false,
                canTakeImage: false,
            };
            this.options = _.extend(globalOptions, this.defaultOptions, viewOptions.myOptions);

            this.displayEventName = viewOptions.displayEventName;

            const self = this;

            // this.el is the dom element this should be getting added to, replaces targetDiv
            const mainDivSel = d3.select(this.el);

            // Set up some html scaffolding in d3
            CLMSUI.utils.addDynDivScaffolding(mainDivSel);
            if (this.options.canMaximise) {
                mainDivSel.select(".dynDiv_moveParentDiv").append("i")
                    .attr("class", "fa fa-expand maximiseButton panelMenuButton")
                    .attr("title", "Maximise / Restore Panel Size")
                ;
            }
            if (this.options.canHideToolbarArea) {
                mainDivSel.select(".dynDiv_moveParentDiv").append("i")
                    .attr("class", "fa fa-wrench hideToolbarButton panelMenuButton")
                    .attr("title", "Hide/Show the View Toolbar")
                ;
            }
            if (this.options.canTakeImage) {
                mainDivSel.select(".dynDiv_moveParentDiv").append("i")
                    .attr("class", "fa fa-photo takeImageButton panelMenuButton")
                    .attr("title", "Download Image")
                ;
            }
            mainDivSel.select(".dynTitle").text(this.identifier);

            // add drag listener to four corners to call resizing locally rather than through dyn_div's api, which loses this view context
            const drag = d3.behavior.drag().on("dragend", function () {
                self.relayout({
                    dragEnd: true
                });
            });
            mainDivSel.selectAll(".draggableCorner")
                .call(drag);

            if (this.displayEventName) {
                this.listenTo(CLMSUI.vent, this.displayEventName, this.setVisible);
            }

            return this;
        },

        render: function () {
            return this;
        },

        relayout: function () {
            return this;
        },

        // called when reshown (visible set to true) - use for updating calcs before rendering
        reshow: function () {
            return this;
        },

        _makeDetachedSVG: function (thisSVG) {
            let keyHeight = 0;
            if (this.options.exportKey) {
                const svgKey = this.addKey({addOrigin: this.options.exportTitle});
                keyHeight = svgKey.node().getBoundingClientRect().height + 10;
            }
            const gap = keyHeight;

            const svgSel = thisSVG || d3.select(this.el).selectAll("svg");
            const svgArr = [svgSel.node()];
            const svgStrings = CLMSUI.svgUtils.capture(svgArr);
            const detachedSVG = svgStrings[0];
            const detachedSVGD3 = d3.select(detachedSVG);
            const height = parseFloat(detachedSVGD3.attr("height"));

            if (keyHeight) {
                // make a gap to reposition the key into
                detachedSVGD3.attr("height", (height + gap) + "px");
                detachedSVGD3.style("height", (height + gap) + "px"); // .style("height") returns "" - dunno why?
                detachedSVGD3.select("svg").attr("y", gap + "px");
                this.removeKey(detachedSVGD3); // remove key that's currently on top of svg
                this.addKey({addToSelection: detachedSVGD3, addOrigin: this.options.exportTitle});    // and make a new one in the gap we just made
            }

            return {detachedSVGD3: detachedSVGD3, allSVGs: svgStrings};
        },

        takeImage: function (event, thisSVG) {
            return this.downloadSVG(event, thisSVG);
        },

        // use thisSVG d3 selection to set a specific svg element to download, otherwise take first in the view
        downloadSVG: function (event, thisSVG) {
            const detachedSVG = this._makeDetachedSVG(thisSVG);
            // const detachedSVGD3 = detachedSVG.detachedSVGD3;
            const svgStrings = detachedSVG.allSVGs;

            const svgXML = CLMSUI.svgUtils.makeXMLStr(new XMLSerializer(), svgStrings[0]);
            //console.log ("xml", svgXML);

            const fileName = this.filenameStateString().substring(0, 240);
            download(svgXML, 'application/svg', fileName + ".svg");
            this.removeKey();

            return this;
        },

        canvasImageParent: "svg",

        /**
         Called when we need to change a canvas element to an image to add to a cloned svg element we download.
         Needs canvasImageParent set to decide where to place it in an svg (e.g. for matrix we put it in a g with a clipPath)
         And add an extra css rule after the style element's already been generated to try and stop the image anti-aliasing
         */
        downloadSVGWithCanvas: function () {
            const detachedSVG = this._makeDetachedSVG();
            const detachedSVGD3 = detachedSVG.detachedSVGD3;
            const svgStrings = detachedSVG.allSVGs;

            const self = this;
            const d3canvases = d3.select(this.el).selectAll("canvas.toSvgImage");
            const fileName = this.filenameStateString().substring(0, 240);
            // _.after means finalDownload only gets called after all canvases finished converting to svg images
            const finalDownload = _.after(d3canvases.size(), function () {
                const svgXML = CLMSUI.svgUtils.makeXMLStr(new XMLSerializer(), svgStrings[0]);
                download(svgXML, "application/svg", fileName + ".svg");
                self.removeKey();
            });

            d3canvases.each(function (d) {
                const d3canvas = d3.select(this);
                // Add image to existing clip in svg, (as first-child so sibling group holding links appears on top of it)
                const img = detachedSVGD3
                    .select(self.canvasImageParent) // where to add image
                    .insert("svg:image", ":first-child")
                ;

                // Add a rule to stop the image being anti-aliased (i.e. blurred)
                img.attr("class", "sharpImage");
                const extraRule = "image.sharpImage {image-rendering: optimizeSpeed; image-rendering: -moz-crisp-edges; -ms-interpolation-mode: nearest-neighbor; image-rendering: pixelated; }";
                const style = detachedSVGD3.select("style");
                style.text(style.text() + "\n" + extraRule);

                // Now convert the canvas and its data to the image element we just added and download the whole svg when done
                CLMSUI.utils.drawCanvasToSVGImage(d3canvas, img, finalDownload);
            });

            return this;
        },

        addKey: function (options) {
            options = options || {};
            const tempSVG = (options.addToSelection || d3.select(this.el).select("svg")).append("svg").attr("class", "tempKey");
            CLMSUI.utils.updateColourKey(CLMSUI.compositeModelInst.get("linkColourAssignment"), tempSVG);
            if (options.addOrigin) {
                tempSVG.select("g.key").attr("transform", "translate(0,20)");
                const link = this.model.get("filterModel") ?
                    tempSVG.append("a")
                        .attr("class", "imageOrigin")
                        .attr("xlink:href", this.model.generateUrlString())
                        .attr("target", "_blank")
                    : tempSVG
                ;
                link.append("text").text(this.imageOriginString().substring(0, 240)).attr("dy", "1em").attr("class", "imageOrigin");
            }
            return tempSVG;
        },

        removeKey: function (d3Sel) {
            (d3Sel || d3.select(this.el)).selectAll(".tempKey").remove();
        },

        hideView: function () {
            CLMSUI.vent.trigger(this.displayEventName, false);
            return this;
        },

        hideToolbarArea: function () {
            const toolbarArea = d3.select(this.el).select(".toolbarArea");
            if (!toolbarArea.empty()) {
                const currentState = toolbarArea.style("display");
                toolbarArea.style("display", currentState !== "none" ? "none" : null);
                this.relayout({dragEnd: true});
            }
            return this;
        },

        minMaxPanel: function () {
            const panel = d3.select(this.el);
            const maxed = panel.classed("maxSize");
            panel.classed("maxSize", !maxed);
            if (maxed) {
                panel.style("bottom", null).style("right", null);
                d3.entries(this.prevBounds).forEach(function (propEntry) {
                    panel.style(propEntry.key, propEntry.value);
                });
            } else {
                const collectThese = ["top", "left", "width", "height"];
                this.prevBounds = {};
                collectThese.forEach(function (prop) {
                    this.prevBounds[prop] = panel.style(prop);
                }, this);
                panel.style("bottom", "65px").style("top", "75px").style("left", 0).style("right", 0).style("width", "auto").style("height", "auto");
            }

            panel.selectAll(".maximiseButton").classed("fa-expand", maxed).classed("fa-compress", !maxed);
            this.relayout({dragEnd: true});

            return this;
        },

        // find z-indexes of all visible, movable divs, and make the current one a higher z-index
        // then a bit of maths to reset the lowest z-index so they don't run off to infinity
        bringToTop: function () {
            if (this.options.canBringToTop !== false && this.el.id !== CLMSUI.utils.BaseFrameView.staticLastTopID) {
                const sortArr = [];
                const activeDivs = d3.selectAll(".dynDiv").filter(function () {
                    return CLMSUI.utils.isZeptoDOMElemVisible($(this));
                });
                //console.log("this view", this);

                // Push objects containing the individual divs as selections along with their z-indexes to an array
                activeDivs.each(function () {
                    // default z-index is "auto" on firefox, + on this returns NaN, so need || 0 to make it sensible
                    let zindex = d3.select(this).style("z-index"); //*/ d3.select(this).datum() ? d3.select(this).datum()("z-index") : 0;
                    zindex = zindex || 0;
                    sortArr.push({
                        z: zindex,
                        selection: d3.select(this)
                    });
                });
                // Sort that array by the z-index
                // Then reset the z-index incrementally based on that sort - stops z-index racing away to a number large enough to overwrite dropdown menus
                sortArr
                    .sort(function (a, b) {
                        return a.z > b.z ? 1 : (a.z < b.z ? -1 : 0);
                    })
                    .forEach(function (sorted, i) {
                        sorted.selection
                            .style("z-index", i + 1);
                    });
                // Make the current window top of this pile
                d3.select(this.el)
                    .style("z-index", sortArr.length + 1);

                CLMSUI.utils.BaseFrameView.staticLastTopID = this.el.id; // store current top view as property of 'class' BaseFrameView (not instance of view)
                //console.log ("sortArr", sortArr);
            }
            return this;
        },

        setVisible: function (show) {
            this.visible = show;
            d3.select(this.el)
                .style('display', show ? 'block' : 'none')
                .classed('dynDivVisible', show);

            if (show) {
                this
                    .reshow()
                    .relayout() // need to resize first sometimes so render gets correct width/height coords
                    .render();
                this.bringToTop();
            }
            return this;
        },

        // Ask if view is currently visible in the DOM (use boolean for performance, querying dom for visibility often took ages)
        isVisible: function () {
            const start = window.performance.now();
            CLMSUI.utils.xilog(this.$el.toString(), "isVis start:", start);
            //var answer = CLMSUI.utils.isZeptoDOMElemVisible (this.$el);
            const answer = this.visible;
            CLMSUI.utils.xilog(this.$el, "isVis time:" + answer, (window.performance.now() - start));
            return answer;
        },

        // removes view
        // not really needed unless we want to do something extra on top of the prototype remove function (like destroy a c3 view just to be sure)
        remove: function () {
            // remove drag listener
            d3.select(this.el).selectAll(".draggableCorner").on(".drag", null);

            // this line destroys the containing backbone view and it's events
            Backbone.View.prototype.remove.call(this);
        },

        identifier: "Base",

        makeChartTitle: function (counts, colourScheme, titleElem, matchLevel) {
            const labels = colourScheme.isCategorical() ? colourScheme.get("labels").range() : [];
            const commaed = d3.format(",");
            const totalStr = commaed(d3.sum(counts));
            const itemStr = matchLevel ? " Matches" : " Crosslinks";
            // const pairs = _.zip(labels, counts);
            const linkCountStr = counts.map(function (count, i) {
                return commaed(count) + " " + (matchLevel ? "in " : "") + (labels[i] || colourScheme.get("undefinedLabel"));
            }, this);

            const titleText = this.identifier + ": " + totalStr + itemStr + " - " + linkCountStr.join(", ");
            titleElem.text(titleText);

            const self = this;
            titleElem.on("mouseenter", function (d) {
                self.model.get("tooltipModel")
                    .set("header", self.identifier + ": " + totalStr + itemStr)
                    .set("contents", linkCountStr)
                    .set("location", {
                        pageX: d3.event.pageX,
                        pageY: d3.event.pageY
                    });
            })
                .on("mouseleave", function () {
                    self.model.get("tooltipModel").set("contents", null);
                })
            ;

            return this;
        },

        // return any relevant view states that can be used to label a screenshot etc
        optionsToString: function () {
            return "";
        },

        // Returns a useful filename given the view and filters current states
        filenameStateString: function () {
            return CLMSUI.utils.makeLegalFileName(CLMSUI.utils.searchesToString() + "--" + this.identifier + "-" + this.optionsToString() + "--" + CLMSUI.utils.filterStateToString());
        },

        // Returns a useful image title string - omit type of view as user will see it
        imageOriginString: function () {
            return CLMSUI.utils.makeLegalFileName(CLMSUI.utils.searchesToString() + "--" + CLMSUI.utils.filterStateToString());
        },

        /* Following used in PDBFileChooser and StringFileChooser, though any of the views could take advantage of them */
        setSpinner: function (state) {
            const target = d3.select(this.el).node();
            if (state) {
                this.spinner = new Spinner().spin(target)
            } else if (!state && this.spinner) {
                this.spinner.stop();
            }
            return this;
        },

        setWaitingEffect: function () {
            this.setStatusText("Please Wait...").setSpinner(true);
            d3.select(this.el).selectAll(".columnbar, .fakeButton").property("disabled", true).attr("disabled", true);
            d3.select(this.el).selectAll(".btn").property("disabled", true);
            return this;
        },

        setCompletedEffect: function () {
            d3.select(this.el).selectAll(".columnbar, .fakeButton").property("disabled", false).attr("disabled", null);
            d3.select(this.el).selectAll(".btn").property("disabled", false);
            this.setSpinner(false);
            return this;
        },

        setStatusText: function (msg, success) {
            const mbar = d3.select(this.el).select(".messagebar"); //.style("display", null);
            let t = mbar.html(msg);
            if (success !== undefined) {
                t = t.transition().delay(0).duration(1000).style("color", (success === false ? "red" : (success ? "blue" : null)));
                t.transition().duration(5000).style("color", "#091d42");
            } else {
                t.style("color", "#091d42");
            }
            return this;
        },
    }, {
        staticLastTopID: 1, // stores id of last view which was 'brought to top' as class property. So I don't need to do expensive DOM operations sometimes.
    }),
};

CLMSUI.utils.ColourCollectionOptionViewBB = Backbone.View.extend({
    initialize: function (options) {
        const self = this;
        d3.select(this.el).attr("class", "btn selectHolder")
            .append("span")
            .attr("class", "noBreak")
            .html((options.label || "Crosslink Colour Scheme") + " ►");

        const addOptions = function (selectSel) {
            const optionSel = selectSel
                .selectAll("option")
                .data(self.model.toJSON())
            ;
            optionSel.exit().remove();
            optionSel.enter().append("option");
            optionSel
                .text(function (d) {
                    return d.title;
                })
                .property("value", function (d) {
                    return d.id;
                })
                .attr("title", function (d) {
                    return d.longDescription;
                })
                .order();
        };

        d3.select(this.el).select("span.noBreak")
            .append("select")
            .attr("id", "linkColourSelect")
            .on("change", function () {
                if (options.storeSelectedAt) {
                    const colourModel = self.model.at(d3.event.target.selectedIndex);
                    //CLMSUI.compositeModelInst.set("linkColourAssignment", colourModel);
                    options.storeSelectedAt.model.set(options.storeSelectedAt.attr, colourModel);
                }
            })
            .call(addOptions);

        if (options.storeSelectedAt) {
            this.listenTo(options.storeSelectedAt.model, "change:" + options.storeSelectedAt.attr, function (compModel, newColourModel) {
                //console.log ("colourSelector listening to change Link Colour Assignment", this, arguments);
                this.setSelected(newColourModel);
            });
        }

        this.listenTo(this.model, "update", function () {
            d3.select(this.el).select("select#linkColourSelect").call(addOptions);
        });

        return this;
    },

    setSelected: function (model) {
        d3.select(this.el)
            .selectAll("option")
            .property("selected", function (d) {
                return d.id === model.get("id");
            });

        return this;
    }
});

CLMSUI.utils.c3mods = function () {
    const c3guts = c3.chart.internal.fn;
    const c3funcs = c3.chart.fn;

    c3guts.redrawMirror = c3guts.redraw;
    c3funcs.enableRedraw = function (enable, immediate) {
        c3guts.enableRedrawFlag = enable;
        console.log("YO REDA", c3guts.enableRedrawFlag, this);
        if (immediate) {
            console.log("YOOOO", c3guts.enableRedrawFlag, this);
            //c3guts.redraw.call (this);
        }
    };

    c3guts.redraw = function (options, transitions) {
        console.log("this", this);
        const c3guts = c3.chart.internal.fn;
        this.accumulatedOptions = $.extend({}, this.accumulatedOptions, options || {});
        if (c3guts.enableRedrawFlag) {
            this.redrawMirror(this.accumulatedOptions, transitions);
            this.accumulatedOptions = {};
        }
        console.log("accum", c3guts.enableRedrawFlag, this.accumulatedOptions);
    };
};

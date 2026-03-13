/**
 * @fileoverview Utility functions for xiVIEW application.
 * Contains helper functions for DOM manipulation, file naming, data formatting,
 * visualization utilities, and cross-browser compatibility.
 */

import * as _ from "underscore";
import d3 from "d3";
import $ from "jquery";

const debug = false;

/**
 * Debug logging function that only logs when debug flag is true.
 * @param {...*} args - Arguments to pass to console.log
 * @returns {void}
 */
export function xilog() {
    if (debug && (typeof (console) !== "undefined")) {
        console.log.apply(console, arguments);
    }
}

/**
 * Collection of commonly used regular expressions for validation and parsing.
 * @type {Object}
 * @property {RegExp} uniprotAccession - Pattern for UniProt accession IDs
 * @property {string} pdbPattern - Pattern for 4-character PDB IDs
 * @property {string} multiPdbPattern - Pattern for multiple PDB IDs with separators
 * @property {RegExp} multiPdbSplitter - Global pattern for extracting PDB IDs from text
 * @property {RegExp} hexColour - Pattern for 3 or 6 character hex colour codes
 * @property {RegExp} invalidFilenameChars - Characters not allowed in filenames
 * @property {string} digitsOnly - Pattern for 3 or more consecutive digits
 */
export const commonRegexes = {
    uniprotAccession: new RegExp("[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}", "i"),
    pdbPattern: "[A-Za-z0-9]{4}",
    multiPdbPattern: "(\\b[A-Za-z0-9]{4}((\\W+)|$))+",    // matches only if full string conforms to 4 char and some separator pattern (double escaped)
    multiPdbSplitter: /(\b[A-Za-z0-9]{4}\b)+/g, // matches parts of the string that conform to 4 char and some separator pattern
    hexColour: new RegExp("#[0-9A-F]{3}([0-9A-F]{3})?", "i"), // matches #3-char or #6-char hex colour strings
    // validDomID: /^[^a-z]+|[^\w:.-]+/gi,
    invalidFilenameChars: /[^a-zA-Z0-9-=&()¦_\\.]/g,
    digitsOnly: "\\d{3,}",
};

/**
 * Returns a semicolon-separated list of protein names for a match's matched peptide.
 * Used by downloads, selection table view, and spectrum wrapper view.
 * @param {Object} match - The match object containing matchedPeptides
 * @param {number} matchedPeptideIndex - Index (0 or 1) of the matched peptide
 * @param {Object} clmsModel - The CLMS backbone-models containing protein information
 * @returns {string} Semicolon-separated protein names
 */
export function proteinConcat(match, matchedPeptideIndex, clmsModel) {
    const mpeptides = match.matchedPeptides[matchedPeptideIndex];
    const pnames = mpeptides ? mpeptides.prt.map(function (pid) {
        return clmsModel.getProtein(pid).name;
    }) : [];
    return pnames.join(";");
}

/**
 * Returns a semicolon-separated list of peptide positions for a match's matched peptide.
 * Used by downloads and selection table view.
 * @param {Object} match - The match object containing matchedPeptides
 * @param {number} matchedPeptideIndex - Index (0 or 1) of the matched peptide
 * @returns {string} Semicolon-separated peptide positions, or empty string if no matched peptides
 */
export function pepPosConcat(match, matchedPeptideIndex) {
    const mpeptides = match.matchedPeptides[matchedPeptideIndex];
    return mpeptides ? mpeptides.pos.join("; ") : "";
}


/**
 * Returns full crosslink positions (peptide position + link position - 1) for a match.
 * Used by downloads and selection table view.
 * @param {Object} match - The match object containing matchedPeptides and linkPos1/linkPos2
 * @param {number} matchedPeptideIndex - Index (0 or 1) of the matched peptide
 * @returns {string} Semicolon-separated full positions, or empty string if no matched peptides
 */
export function fullPosConcat(match, matchedPeptideIndex) {
    const mpeptides = match.matchedPeptides[matchedPeptideIndex];
    const linkPos = matchedPeptideIndex === 0 ? match.linkPos1 : match.linkPos2;
    return mpeptides ? mpeptides.pos.map(function (v) {
        return v + linkPos - 1;
    }).join("; ") : "";
}


/**
 * Common UI label strings used across the application.
 * @type {Object}
 * @property {string} downloadImg - Label for image download button
 * @property {string} shareLink - Label for share link button
 */
export const commonLabels = {
    downloadImg: "Download Image As ", // http://ux.stackexchange.com/a/61757/76906
    shareLink: "Share Search Link with Current Filter State",
};

// commonTemplates: {
//     downloadImg: _.template("Download Image As <%=fileType%>"),
//     downloadCSV: _.template("Download Filtered <%=items> as CSV"),
// },


/**
 * Checks if a jQuery/Zepto DOM element is visible.
 * Element is considered visible if display is not 'none', visibility is not 'hidden',
 * and it has a height greater than 0.
 * Used by base frame view.
 * @param {Object} zeptoElem - jQuery or Zepto wrapped DOM element
 * @returns {boolean} True if element is visible
 */
export function isZeptoDOMElemVisible(zeptoElem) { // could be a jquery-ref'ed elem as well
    //console.log ("zepto", zeptoElem);
    const display = zeptoElem.css("display") !== "none";
    return display && (zeptoElem.css("visibility") !== "hidden") && (zeptoElem.height() > 0);
}

/**
 * Gets the X coordinate of an event relative to an element in a cross-browser compatible way.
 * Uses clientX and offset calculations instead of unreliable layerX/offsetX.
 * Used by scatterplot view.
 * @param {Event} evt - The browser event object
 * @param {Element} [optElem] - Optional element to calculate offset from (defaults to event target)
 * @returns {number} X coordinate relative to the element
 */
export function crossBrowserElementX(evt, optElem) {
    return evt.clientX - $(optElem || evt.target).offset().left; // use evt.target if no optional element passed
    //return (evt.layerX || evt.offsetX) - evt.target.offsetLeft;
}

/**
 * Gets the Y coordinate of an event relative to an element in a cross-browser compatible way.
 * Uses clientY and offset calculations.
 * Used by scatterplot view.
 * @param {Event} evt - The browser event object
 * @param {Element} [optElem] - Optional element to calculate offset from (defaults to event target)
 * @returns {number} Y coordinate relative to the element
 */
export function crossBrowserElementY(evt, optElem) {
    return evt.clientY - $(optElem || evt.target).offset().top;
}


const niceRoundMap = {
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
};

/**
 * Rounds a value to a "nice" number suitable for chart axes (1, 2, 5, 10, 20, 50, etc.).
 * Used by minigram, circular, and distogram views.
 * @param {number} val - The value to round
 * @returns {number} The rounded "nice" value
 * @example
 * niceRound(37); // returns 50
 * niceRound(123); // returns 200
 */
export function niceRound(val) {
    const log = Math.floor(Math.log(val) / Math.log(10)); //no log10 func in IE
    const pow = Math.pow(10, log);
    val = Math.ceil(val / pow); // will now be a number 1-10
    let roundVal = niceRoundMap[val];
    roundVal *= pow;
    return roundVal;
}

/**
 * Rounds a value up to a specified number of decimal places.
 * Correlates to d3's .round with decimal places function.
 * Used in scatterplot for axes tooltips.
 * @param {number} val - The value to ceil
 * @param {number} decimalPlaces - Number of decimal places to preserve
 * @returns {number} The ceiled value
 */
export function ceil(val, decimalPlaces) {
    const pow = Math.pow(10, decimalPlaces);
    val *= pow;
    val = Math.ceil(val);
    return val / pow;
}


/**
 * Rounds a value down to a specified number of decimal places.
 * @param {number} val - The value to floor
 * @param {number} decimalPlaces - Number of decimal places to preserve
 * @returns {number} The floored value
 */
export function floor(val, decimalPlaces) {
    const pow = Math.pow(10, decimalPlaces);
    val *= pow;
    val = Math.floor(val);
    return val / pow;
}


/**
 * Rounds a value to the nearest interval.
 * Handles both large (>1) and small (<1) intervals correctly to avoid floating point issues.
 * Used by NGL utils, NGL backbone-models wrapper, and distances.
 * @param {number} val - The value to round
 * @param {number} interval - The interval to round to
 * @returns {number} The rounded value, or original value if interval is falsy
 */
export function toNearest(val, interval) {
    // adapted from https://stackoverflow.com/a/27861660/368214 - inverting small intervals avoids .00000001 stuff
    return interval ?
        (Math.abs(interval) > 1 ? Math.round(val * interval) / interval : Math.round(val / interval) * interval)
        : val;
}



/**
 * Creates or reuses a canvas element with the specified dimensions.
 * Used here and by NGL view.
 * @param {number} width - Canvas width in pixels
 * @param {number} height - Canvas height in pixels
 * @param {Object} [existingD3CanvasSel] - Optional existing d3 selection of canvas to reuse
 * @returns {Object} Object containing canvas, context, dataStructure (ImageData), and d3canvas
 */
export function makeCanvas(width, height, existingD3CanvasSel) {
    const canvas = (existingD3CanvasSel ? existingD3CanvasSel.node() : null) || document.createElement("canvas");
    const d3canvas = d3.select(canvas);
    d3canvas
        .attr("width", width)
        .attr("height", height);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const canvasData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // const cd = canvasData.data;
    return {canvas: canvas, context: ctx, dataStructure: canvasData, d3canvas: d3canvas};
}


/**
 * Nullifies canvas object properties for cleanup/garbage collection.
 * Used here and by NGL view.
 * @param {Object} canvasObj - Canvas object with canvas, context, and dataStructure properties
 * @returns {void}
 */
export function nullCanvasObj(canvasObj) {
    canvasObj.canvas = null;
    canvasObj.context = null;
    canvasObj.dataStructure = null;
}


/**
 * Converts a d3 canvas to an SVG image element with proper background color.
 * The resulting PNG will have a non-transparent background matching the canvas background.
 * Only used by base frame view.
 * @param {Object} d3canvas - Canvas element wrapped in a d3 selection
 * @param {Object} svgImage - SVG image element (d3 selection) to populate
 * @param {Function} callback - Callback function called with svgImage when load completes
 * @returns {void}
 */
export function drawCanvasToSVGImage(d3canvas, svgImage, callback) { // d3canvas is a canvas wrapped in a d3 selection
    let destinationCanvasObj;
    let url;

    const width = d3canvas.attr("width");
    const height = d3canvas.attr("height");

    svgImage.on("load", function () {
        // tidy up canvas and url
        nullCanvasObj(destinationCanvasObj);
        // eslint-disable-next-line no-undef
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

            destinationCanvasObj = makeCanvas(width, height);
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
        });
}

/**
 * Hides overlapping d3 axis labels to prevent clutter.
 * Iterates through axis tick labels and hides any that overlap with the previous visible label.
 * Used by minigram, distogram, matrix, and scatterplot views.
 * @param {Object} d3AxisElem - d3 selection of the axis element
 * @returns {void}
 */
export function declutterAxis(d3AxisElem) {
    let lastBounds = {
        left: -100,
        right: -100,
        top: -100,
        bottom: -100
    };
    d3AxisElem.selectAll(".tick text").style("visibility", "visible");

    d3AxisElem.selectAll(".tick text")
        .each(function () {
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
}

/**
 * Removes non-round axis labels and adjusts tick stroke widths based on value roundness.
 * Labels that are multiples of a power of 10 are emphasized with thicker ticks.
 * Used by minigram and distogram views.
 * @param {Object} d3AxisElem - d3 selection of the axis element
 * @param {number} maxVal - Maximum value on the axis
 * @returns {void}
 */
export function niceValueAxis(d3AxisElem, maxVal) {
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
        });
}


/**
 * Converts a string to a legal DOM ID by removing invalid characters.
 * Removes leading non-lowercase characters and any characters not in [\w:.-]
 * @param {string} id - The string to convert to a legal DOM ID
 * @returns {string} Legal DOM ID string
 */
export function makeLegalDomID(id) {
    const validDomID = /^[^a-z]+|[^\w:.-]+/gi;
    return id.replace(validDomID, "");
}


/**
 * Creates Backbone-compatible button/checkbox/radio controls in a target div.
 * Assumes click methods are added via Backbone definitions, though they could be added later with d3.
 * @param {Object} targetDiv - d3 selection of the container element
 * @param {string} baseID - Base ID string to prefix all button IDs
 * @param {Object[]} buttonData - Array of button configuration objects
 * @param {string} buttonData[].class - CSS class for the control
 * @param {string} buttonData[].label - Label text for the control
 * @param {string} buttonData[].id - Unique identifier for the control
 * @param {string} buttonData[].type - Type: "radio", "checkbox", or "button"
 * @param {boolean} [buttonData[].initialState] - Initial checked state for radio/checkbox
 * @param {string} [buttonData[].group] - Group name for radio buttons
 * @param {string} [buttonData[].tooltip] - Tooltip text
 * @param {boolean} [buttonData[].noBreak] - Whether to prevent line breaks in label
 * @param {string} [buttonData[].header] - Optional header text
 * @param {boolean} [buttonData[].inputFirst] - Whether to place input before label text
 * @param {*} [buttonData[].value] - Value property for the input
 * @returns {void}
 */
export function makeBackboneButtons(targetDiv, baseID, buttonData) {
    const makeID = function (d) {
        return makeLegalDomID(baseID + d.id);
    };

    // Don't make buttons whose id already exists
    buttonData = buttonData.filter(function (d) {
        return d3.select("#" + makeID(d)).empty();
    });

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

}

/**
 * Converts object state to an abbreviated string representation for use in filenames.
 * Filters out empty/false/undefined values and formats them with abbreviations.
 * @param {Object} object - Object to convert (can be Backbone backbone-models or plain object)
 * @param {string[]} fields - Array of field names to include
 * @param {Set} zeroFormatFields - Set of field names that should be formatted with 4 decimal places
 * @param {Object} abbvMap - Map of field names to their abbreviations
 * @returns {string} Dot-separated string of field=value pairs
 */
export function objectStateToAbbvString(object, fields, zeroFormatFields, abbvMap) {
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
}

/**
 * Converts the current filter state to a string representation.
 * Truncates to 160 characters maximum.
 * @returns {string} Filter state string
 */
export function filterStateToString(compositeModelInst) {
    const filterStr = compositeModelInst.get("filterModel").stateString();
    return filterStr.substring(0, 160);
}

/**
 * Converts the current searches to a string representation.
 * @param {Object} compositeModelInst - The composite backbone-models instance
 * @returns {string} Search IDs joined with hyphens, prefixed with "SRCH="
 */
export function searchesToString(compositeModelInst) {
    const searches = Array.from(compositeModelInst.get("clmsModel").getSearches());
    const searchKeys = _.pluck(searches, 0); // just the keys
    const searchStr = ("SRCH=" + searchKeys.join("-"));// .substring(0, 40);
    return searchStr;
}


/**
 * Removes invalid characters from a filename string and truncates to 240 characters.
 * Uses commonRegexes.invalidFilenameChars to determine invalid characters.
 * @param {string} fileNameStr - The filename string to sanitize
 * @returns {string} Legal filename string
 */
export function makeLegalFileName(fileNameStr) {
    let newStr = fileNameStr.replace(commonRegexes.invalidFilenameChars, "");
    newStr = newStr.substring(0, 240);
    return newStr;
}


/**
 * Creates or updates a crosslink colour key as an SVG group element.
 * Generates a visual legend showing the color scheme with labels and optionally a gradient.
 * @param {Object} colourAssign - Color assignment backbone-models containing scale and scheme information
 * @param {Object} svgElem - d3 selection of the SVG element to add the key to
 * @returns {void}
 */
export function updateColourKey(colourAssign, svgElem) {
    svgElem.attr("height", "200");

    const keyGroup = svgElem.selectAll("g.key").data([0]);
    keyGroup.enter()
        .append("g").attr("class", "key")
        .append("text").attr("class", "keyTitle");
    if (colourAssign) {
        keyGroup.select("text.keyTitle")
            .attr("y", 12)
            .text("Key: " + colourAssign.get("title"));
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
            });
        newElems.append("rect")
            .attr("height", 4)
            .attr("width", "1em")
            .attr("x", 1)
            .attr("y", 5)
            .style("stroke", "none");
        newElems.append("text")
            .attr("x", 19)
            .attr("y", 12);
        colourElems.select("rect")
            .style("fill", function (d) {
                return d[1];
            })
            // hide individual colour swatches if showing linear scale
            .style("display", function (d) {
                return isLinear && d[0] !== colourAssign.get("undefinedLabel") ? "none" : null;
            });
        colourElems.select("text").text(function (d) {
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
                .attr("y2", "100%");
            newGrad.selectAll("stop").data(domain)
                .enter()
                .append("stop")
                .attr("offset", function (d) {
                    return Math.round(normalScale(d)) + "%";
                })
                .attr("stop-color", function (d, i) {
                    return labelColourPairs[i][1];
                });
            svgElem.selectAll("rect.gradientScale").remove();

            keyGroup.append("rect")
                .attr("class", "gradientScale")
                .attr("x", 1)
                .attr("y", heightScale.range()[0] + 5)
                .attr("width", "1em")
                .attr("height", heightScale.range()[1] - heightScale.range()[0])
                .attr("fill", "url(#" + gradID + ")");
        }

        // add undefined category
    }
}

/**
 * Creates or updates an annotation colour key from Backbone backbone-models array.
 * Each backbone-models in the array is rendered as a colored swatch with label.
 * @param {Object[]} bbModelArray - Array of Backbone clms-backbone-models to display in the key
 * @param {Object} svgElem - d3 selection of the SVG element to add the key to
 * @param {Object} [myOptions] - Options to customize the key display
 * @param {Function} [myOptions.colour] - Function to extract color from backbone-models JSON (default: d => d.colour)
 * @param {Function} [myOptions.label] - Function to extract label from backbone-models JSON (default: d => d.label || d.name)
 * @param {string} [myOptions.title] - Title for the key (default: "Key")
 * @returns {void}
 */
export function updateAnnotationColourKey(bbModelArray, svgElem, myOptions) {
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
}


/**
 * Adds multiple select dropdown controls to a container element.
 * Creates labeled select elements with options and change handlers.
 * @param {Object} settings - Configuration object for the select controls
 * @param {Object} settings.addToElem - d3 selection of element to add select controls to
 * @param {Array} [settings.selectList=[]] - Array of select element identifiers
 * @param {Array} [settings.optionList=[]] - Array of options to add to each select
 * @param {Function} [settings.selectLabelFunc] - Function to generate label text for select (default: d => d)
 * @param {Function} [settings.optionLabelFunc] - Function to generate label text for option (default: d => d)
 * @param {Function} [settings.optionValueFunc] - Function to generate value for option (default: d => d)
 * @param {Function} [settings.optionSortFunc] - Optional function to sort options
 * @param {Function} [settings.selectLabelTooltip] - Function to generate tooltip for select label
 * @param {Function} [settings.initialSelectionFunc] - Function to determine initial selected option (default: first option)
 * @param {Function} [settings.idFunc] - Function to generate IDs for data binding (default: index)
 * @param {Function} [settings.changeFunc] - Function to call when select value changes
 * @param {boolean} [settings.keepOldOptions] - Whether to keep existing options when updating
 * @returns {Object} d3 selection of the created select elements
 */
export function addMultipleSelectControls(settings) {
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
        selectLabelTooltip: function () {
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
        .property("selected", settings.initialSelectionFunc); // necessary for IE not to fall over later (it detects nothing is selected otherwise)
    options
        .text(settings.optionLabelFunc)
        .property("value", settings.optionValueFunc);
    if (settings.optionSortFunc) {
        options.sort(settings.optionSortFunc);
    }

    return selects;
}


/**
 * Merges an object into existing localStorage data using deep extend.
 * Creates the storage entry if it doesn't exist.
 * @param {Object} partObj - Partial object to merge into storage (e.g., {distanceColours: {"BS3": {domain:[15,25], range:["red", "blue", "green"]}}})
 * @param {string} [objName="xiView"] - Name of the localStorage item
 * @returns {void}
 * @example
 * setLocalStorage({userPrefs: {theme: "dark"}}, "xiView");
 */
export function setLocalStorage(partObj, objName) {
    objName = objName || "xiView";
    const storageStr = localStorage.getItem(objName) || "{}";
    let storage = JSON.parse(storageStr);
    storage = $.extend(true, storage, partObj);
    localStorage.setItem(objName, JSON.stringify(storage));
}

/**
 * Retrieves and parses a JSON object from localStorage.
 * Returns empty object if item doesn't exist.
 * @param {string} [objName="xiView"] - Name of the localStorage item
 * @returns {Object} Parsed object from localStorage, or empty object if not found
 */
export function getLocalStorage(objName) {
    objName = objName || "xiView";
    const storageStr = localStorage.getItem(objName) || "{}";
    return JSON.parse(storageStr);
}

// is local storage viable?
// export function canLocalStorage () {
//         try {
//             localStorage.setItem('mod_xi', 'mod');
//             localStorage.removeItem('mod_xi');
//             return true;
//         } catch (e) {
//             return false;
//         }
//     }

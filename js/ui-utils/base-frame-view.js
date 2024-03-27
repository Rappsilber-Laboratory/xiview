import * as _ from "underscore";
import Backbone from "backbone";
import * as $ from "jquery";

import {capture, makeXMLStr} from "../svgexp";
import {
    drawCanvasToSVGImage,
    filterStateToString,
    isZeptoDOMElemVisible,
    makeLegalFileName,
    searchesToString,
    updateColourKey,
    xilog
} from "../utils";
import * as Spinner from "spin";
import {download} from "../downloads";
import d3 from "d3";

// https://stackoverflow.com/questions/32065257/having-a-static-variable-in-backbone-js-views#32820288
export const BaseFrameView = Backbone.View.extend({

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
        addDynDivScaffolding(mainDivSel);

        function addDynDivScaffolding(d3DivSelection) {
            addDynDivParentBar(d3DivSelection);
            addFourCorners(d3DivSelection);
        }


        function addDynDivParentBar(d3DivSelection) {
            const parentBar = d3DivSelection
                .append("div")
                .attr("class", "dynDiv_moveParentDiv dynDiv_bodyLimit");

            parentBar
                .append("span")
                .attr("class", "dynTitle");

            parentBar
                .append("i")
                .attr("class", "fa fa-times-circle closeButton panelMenuButton")
                .attr("title", "Hide View");
            return parentBar;
        }

        function addFourCorners(d3DivSelection) {
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
        }

        if (this.options.canMaximise) {
            mainDivSel.select(".dynDiv_moveParentDiv").append("i")
                .attr("class", "fa fa-expand maximiseButton panelMenuButton")
                .attr("title", "Maximise / Restore Panel Size");
        }
        if (this.options.canHideToolbarArea) {
            mainDivSel.select(".dynDiv_moveParentDiv").append("i")
                .attr("class", "fa fa-wrench hideToolbarButton panelMenuButton")
                .attr("title", "Hide/Show the View Toolbar");
        }
        if (this.options.canTakeImage) {
            mainDivSel.select(".dynDiv_moveParentDiv").append("i")
                .attr("class", "fa fa-photo takeImageButton panelMenuButton")
                .attr("title", "Download Image");
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
            this.listenTo(window.vent, this.displayEventName, this.setVisible);
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
        const svgStrings = capture(svgArr);
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

        const svgXML = makeXMLStr(new XMLSerializer(), svgStrings[0]);
        //console.log ("xml", svgXML);

        const fileName = this.filenameStateString().substring(0, 240);
        download(svgXML, "application/svg", fileName + ".svg");
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
            const svgXML = makeXMLStr(new XMLSerializer(), svgStrings[0]);
            download(svgXML, "application/svg", fileName + ".svg");
            self.removeKey();
        });

        d3canvases.each(function () {
            const d3canvas = d3.select(this);
            // Add image to existing clip in svg, (as first-child so sibling group holding links appears on top of it)
            const img = detachedSVGD3
                .select(self.canvasImageParent) // where to add image
                .insert("svg:image", ":first-child");

            // Add a rule to stop the image being anti-aliased (i.e. blurred)
            img.attr("class", "sharpImage");
            const extraRule = "image.sharpImage {image-rendering: optimizeSpeed; image-rendering: -moz-crisp-edges; -ms-interpolation-mode: nearest-neighbor; image-rendering: pixelated; }";
            const style = detachedSVGD3.select("style");
            style.text(style.text() + "\n" + extraRule);

            // Now convert the canvas and its data to the image element we just added and download the whole svg when done
            drawCanvasToSVGImage(d3canvas, img, finalDownload);
        });

        return this;
    },

    addKey: function (options) {
        options = options || {};
        const tempSVG = (options.addToSelection || d3.select(this.el).select("svg")).append("svg").attr("class", "tempKey");
        updateColourKey(window.compositeModelInst.get("linkColourAssignment"), tempSVG);
        if (options.addOrigin) {
            tempSVG.select("g.key").attr("transform", "translate(0,20)");
            const link = this.model.get("filterModel") ?
                tempSVG.append("a")
                    .attr("class", "imageOrigin")
                    .attr("xlink:href", this.model.generateUrlString())
                    .attr("target", "_blank")
                : tempSVG;
            link.append("text").text(this.imageOriginString().substring(0, 240)).attr("dy", "1em").attr("class", "imageOrigin");
        }
        return tempSVG;
    },

    removeKey: function (d3Sel) {
        (d3Sel || d3.select(this.el)).selectAll(".tempKey").remove();
    },

    hideView: function () {
        window.vent.trigger(this.displayEventName, false);
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
        if (this.options.canBringToTop !== false && this.el.id !== BaseFrameView.staticLastTopID) {
            const sortArr = [];
            const activeDivs = d3.selectAll(".dynDiv").filter(function () {
                return isZeptoDOMElemVisible($(this));
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

            BaseFrameView.staticLastTopID = this.el.id; // store current top view as property of 'class' BaseFrameView (not instance of view)
            //console.log ("sortArr", sortArr);
        }
        return this;
    },

    setVisible: function (show) {
        this.visible = show;
        d3.select(this.el)
            .style("display", show ? "block" : "none")
            .classed("dynDivVisible", show);

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
        xilog(this.$el.toString(), "isVis start:", start);
        //var answer = isZeptoDOMElemVisible (this.$el);
        const answer = this.visible;
        xilog(this.$el, "isVis time:" + answer, (window.performance.now() - start));
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
        titleElem.on("mouseenter", function () {
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
            });
        return this;
    },

    // return any relevant view states that can be used to label a screenshot etc
    optionsToString: function () {
        return "";
    },

    // Returns a useful filename given the view and filters current states
    filenameStateString: function () {
        return makeLegalFileName(searchesToString() + "--" + this.identifier
            + "-" + this.optionsToString() + "--" + filterStateToString());
    },

    // Returns a useful image title string - omit type of view as user will see it
    imageOriginString: function () {
        return makeLegalFileName(searchesToString() + "--" + filterStateToString());
    },

    /* Following used in PDBFileChooser and StringFileChooser, though any of the views could take advantage of them */
    setSpinner: function (state) {
        const target = d3.select(this.el).node();
        if (state) {
            this.spinner = new Spinner().spin(target);
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
            t.transition().duration(5000).style("color", "var(--main-color)");
        } else {
            t.style("color", "var(--main-color)");
        }
        return this;
    },
});

// stores id of last view which was 'brought to top' as class property. So I don't need to do expensive DOM operations sometimes.
BaseFrameView.staticLastTopID = 1;
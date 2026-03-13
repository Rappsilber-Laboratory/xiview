import d3 from "d3";
import * as _ from "underscore";

export class KeyFragment{
    constructor(fragments, FragKey) {
        this.FragKey = FragKey;
        this.fragments = [];
        // svg elements
        this.g = this.FragKey.scaleSvgGroup.append("g");
    }

    startHighlight(fragments) {
        if (!this.FragKey.changeCL && !this.FragKey.changeMod)
            this.FragKey.model.addHighlight(fragments);
    }

    endHighlight(fragments) {
        if (!this.FragKey.changeCL && !this.FragKey.changeMod)
            this.FragKey.model.clearHighlight(fragments);
    }
}


export class CrosslinkKeyFragment extends KeyFragment{
    constructor(fragments, offset, FragKey) {
        super(fragments, FragKey);

        this.pep1_frags = fragments.filter(function(frag){
            return frag.peptideId === 0;
        });
        this.pep2_frags = fragments.filter(function(frag){
            return frag.peptideId === 1;
        });
        this.fragments = fragments;

        let pep1OnlyLoss;
        let pep2OnlyLoss;
        let highlightPath;
        const self = this;

        this.yfrag_index = "";
        this.bfrag_index = "";

        // determine x,y position
        const barWidth = 18, tailX = 5, tailY = 5;
        let x_coord = (FragKey.xStep * FragKey.CLpos) - (barWidth / 2);
        let y_coord = 25 + offset;

        // svg elements
        // pep1 ccl fragments; either normal or lossy; have different colors
        if (this.pep1_frags.length !== 0) { // really a, b, or c , see get_fragment_annotation()

            // only lossy fragments?
            let pep1PrimFragments = this.pep1_frags.filter(function (f) {
                return f.lossy !== true;
            });
            pep1OnlyLoss = pep1PrimFragments.length === 0;

            let fragLineClass = "xispec_fragBar";

            // define the highlight path - if there are no pep2 fragments it's the full length of the fragBar...
            if (this.pep2_frags.length === 0) {
                highlightPath = "M" + x_coord  + "," + y_coord
                    + " L" + (x_coord + barWidth) + "," + y_coord
                    + " L" + (x_coord + barWidth + tailX) + "," + (y_coord - tailY);
            } else { // .. else it's half-length of the fragBar
                highlightPath = "M" + (x_coord + barWidth / 2) + "," + y_coord
                    + " L" + (x_coord + barWidth) + "," + y_coord
                    + " L" + (x_coord + barWidth + tailX)  + "," + (y_coord - tailY);
            }

            this.pep1group = self.g.append("g")
                .on("mouseover", function () {
                    const evt = d3.event;
                    if (!self.FragKey.changeMod && !self.FragKey.changeCL) {
                        if (evt.ctrlKey) {
                            self.fragBar.style("cursor", "copy");
                            self.pep1Tail.style("cursor", "copy");
                            self.pep1Highlight.style("cursor", "copy");
                        } else {
                            self.fragBar.style("cursor", "pointer");
                            self.pep1Tail.style("cursor", "pointer");
                            self.pep1Highlight.style("cursor", "pointer");
                        }
                    }
                    self.startHighlight(self.pep1_frags);
                })
                .on("mouseout", function () {
                    self.endHighlight(self.pep1_frags);
                })
                .on("touchstart", function () {
                    self.startHighlight(self.pep1_frags);
                })
                .on("touchend", function () {
                    self.endHighlight(self.pep1_frags);
                })
                .on("click", function () {
                    const evt = d3.event;
                    self.FragKey.model.updateStickyHighlight(self.pep1_frags, evt.ctrlKey);
                });

            this.pep1Highlight = this.pep1group.append("path")
                .attr("d", highlightPath)
                .attr("stroke", self.FragKey.model.get("highlightColor"))
                .attr("stroke-width", self.FragKey.model.get("highlightWidth"))
                .attr("opacity", 0)
                .style("cursor", "pointer");

            this.pep1Tail = this.pep1group.append("line")
                .attr("x1", x_coord + barWidth)
                .attr("y1", y_coord)
                .attr("x2", x_coord + barWidth + tailX)
                .attr("y2", y_coord - tailY)
                .style("cursor", "pointer")
                .attr("class", fragLineClass)
                .attr("stroke", "black");

            this.pep1Text = self.g.append("text")
                .attr("x", x_coord + barWidth + tailX + 3)
                .attr("y", y_coord - tailY + 2)
                .style("font-size", "0.6em")
                .style("fill", this.FragKey.model.p1color)
                .style("cursor", "default")
                //.attr("text-anchor", "middle")
                .text([... new Set(this.pep1_frags.map(s => s.stub))].join(","))
                .attr("opacity", 0);

            if (pep1OnlyLoss) {
                this.pep1Tail.attr("stroke", this.FragKey.model.get("peakColor"));
            } else {
                this.pep1Tail.attr("stroke", "black");
            }
        }

        // # pep2 ccl fragments;; either normal or lossy; have different colors
        if (this.pep2_frags.length !== 0) {

            // only lossy fragments?
            let pep2PrimFragments = this.pep2_frags.filter(function (f) {
                return f.lossy !== true;
            });

            pep2OnlyLoss = pep2PrimFragments.length === 0;

            let fragLineClass = "xispec_fragBar";

            if (this.pep1_frags.length === 0) {	// highlight full length of the fragbar
                highlightPath = "M" + (x_coord + barWidth)  + "," + y_coord
                    + " L" + x_coord + "," + y_coord
                    + " L" + (x_coord - tailX) + "," + (y_coord + tailY);
            } else { // .. else it's half-length of the fragBar
                highlightPath = "M" + (x_coord + barWidth / 2) + "," + y_coord
                    + " L" + x_coord + "," + y_coord
                    + " L" + (x_coord - tailX) + "," + (y_coord + tailY);
            }

            this.pep2group = this.g.append("g")
                .on("mouseover", function () {
                    const evt = d3.event;
                    if (!self.FragKey.changeMod && !self.FragKey.changeCL) {
                        if (evt.ctrlKey) {
                            self.fragBar.style("cursor", "copy");
                            self.pep2Tail.style("cursor", "copy");
                            self.pep2Highlight.style("cursor", "copy");
                        } else {
                            self.fragBar.style("cursor", "pointer");
                            self.pep2Tail.style("cursor", "pointer");
                            self.pep2Highlight.style("cursor", "pointer");
                        }
                    }
                    self.startHighlight(self.pep2_frags);
                })
                .on("mouseout", function () {
                    self.endHighlight(self.pep2_frags);
                })
                .on("touchstart", function () {
                    self.startHighlight(self.pep2_frags);
                })
                .on("touchend", function () {
                    self.endHighlight(self.pep2_frags);
                })
                .on("click", function () {
                    const evt = d3.event;
                    self.FragKey.model.updateStickyHighlight(self.pep2_frags, evt.ctrlKey);
                });


            this.pep2Highlight = this.pep2group.append("path")
                .attr("d", highlightPath)
                .attr("stroke", this.FragKey.model.get("highlightColor"))
                .attr("stroke-width", this.FragKey.model.get("highlightWidth"))
                .attr("opacity", 0)
                .style("cursor", "pointer");

            this.pep2Tail = this.pep2group.append("line")
                .attr("x1", x_coord)
                .attr("y1", y_coord)
                .attr("x2", x_coord - tailX)
                .attr("y2", y_coord + tailY)
                .style("cursor", "pointer")
                .attr("class", fragLineClass);

            this.pep2Text = this.g.append("text")
                .attr("x", x_coord - tailX - 4)
                .attr("y", y_coord + tailY + 2)
                .style("font-size", "0.6em")
                .style("fill", this.FragKey.model.p2color)
                .style("cursor", "default")
                .attr("text-anchor", "end")
                .text([... new Set(this.pep2_frags.map(s => s.stub))].join(","))
                .attr("opacity", 0);

            if (pep2OnlyLoss) {
                this.pep2Tail.attr("stroke", this.FragKey.model.get("peakColor"));
            } else {
                this.pep2Tail.attr("stroke", "black");
            }
        }

        this.fragBar = this.g.append("line")
            .attr("x1", x_coord)
            .attr("y1", y_coord)
            .attr("x2", x_coord + barWidth)
            .attr("y2", y_coord)
            .style("cursor", "pointer")
            .style("pointer-events", "none")
            .attr("class", "xispec_fragBar");

        // color the fragBar in grey if all fragments are lossy otherwise go with the default color
        if ((this.pep1_frags.length === 0 || pep1OnlyLoss) && ( this.pep2_frags.length === 0 || pep2OnlyLoss)) {
            this.fragBar.attr("stroke", this.FragKey.model.get("peakColor"));
        } else {
            this.fragBar.attr("stroke", "black");
        }
    }

    highlight(show, fragments) {
        if (show === true) {
            let pep1_frags = _.intersection(fragments, this.pep1_frags);
            let pep2_frags = _.intersection(fragments, this.pep2_frags);
            if (pep1_frags.length > 0){
                this.pep1Highlight.attr("opacity", 1);
                this.pep1Text.text([... new Set(pep1_frags.map(s => s.stub))].join(","));
                this.pep1Text.attr("opacity", 1);
            }
            if (pep2_frags.length > 0){
                this.pep2Highlight.attr("opacity", 1);
                this.pep2Text.text([... new Set(pep2_frags.map(s => s.stub))].join(","));
                this.pep2Text.attr("opacity", 1);
            }
        } else {
            if (this.pep1Highlight) {
                this.pep1Highlight.attr("opacity", 0);
                this.pep1Text.attr("opacity", 0);
            }
            if (this.pep2Highlight) {
                this.pep2Highlight.attr("opacity", 0);
                this.pep2Text.attr("opacity", 0);
            }
        }
    }

    disableCursor() {
        this.fragBar.style("cursor", "default");
        if (this.pep2Tail) {
            this.pep2Tail.style("cursor", "default");
            this.pep2Highlight.style("cursor", "default");
        }
        if (this.pep1Tail) {
            this.pep1Tail.style("cursor", "default");
            this.pep1Highlight.style("cursor", "default");
        }
    }
}

export class PeptideKeyFragment extends KeyFragment{
    constructor(fragments, index, offset, peptideId, FragKey) {
        super(fragments, FragKey);
        this.peptideId = peptideId;
        if (this.peptideId === 0) {
            this.color = this.FragKey.model.p1color;
        } else if (this.peptideId === 1) {
            this.color = this.FragKey.model.p2color;
        }
        this.peptide = FragKey.model.peptides[peptideId];
        this.b = [];
        this.y = [];
        if (fragments.b) {
            this.b = fragments.b;
            this.fragments = this.fragments.concat(fragments.b);
        }
        if (fragments.y) {
            this.y = fragments.y;
            this.fragments = this.fragments.concat(fragments.y);
        }
        this.yfrag_index = this.peptide.sequence.length - (index + 1);
        this.bfrag_index = (index + 1);

        let bOnlyLoss;
        let yOnlyLoss;
        let clContFrags;
        let highlightPath;
        let y_coord;
        const self = this;

        // determine x,y position
        let x_coord = (FragKey.xStep * (index + offset)) + (FragKey.xStep / 2);
        if (this.peptideId === 0)
            y_coord = 25;
        if (this.peptideId === 1)
            y_coord = 75;
        const barHeight = 18, tailX = 5, tailY = 5;

        // svg elements
        // bions; either normal or lossy; have different colors
        if (fragments.b.length !== 0) { // really a, b, or c , see get_fragment_annotation()

            let bLikeLossFragments = fragments.b.filter(function (f) {
                return f.lossy;
            });
            let bLikePrimFragments = fragments.b.filter(function (f) {
                return f.lossy !== true;
            });

            // only lossy fragments?
            bOnlyLoss = bLikePrimFragments.length === 0;

            // Crosslink containing fragment accentuation
            // Only consider losses for accentuation if there are no primary fragments
            if (bOnlyLoss) {
                clContFrags = bLikeLossFragments.filter(function (f) {
                    return f.crossLinkContaining;
                });
            } else {
                clContFrags = bLikePrimFragments.filter(function (f) {
                    return f.crossLinkContaining;
                });
            }
            let clContaining = clContFrags.length !== 0;
            let fragLineClass = "xispec_fragBar";
            if (self.FragKey.model.get("accentuateCrossLinkContainingFragments") && clContaining) {
                fragLineClass = "xispec_fragBarThick";
            }

            // define the highlight path - if there are no yLike fragments it's the full length of the fragBar...
            if (fragments.y.length === 0) {
                highlightPath = "M" + x_coord + "," + (y_coord - barHeight)
                    + " L" + x_coord + "," + y_coord
                    + " L" + (x_coord - tailX) + "," + (y_coord + tailY);
            } else { // .. else it's half-length of the fragBar
                highlightPath = "M" + x_coord + "," + (y_coord - barHeight / 2)
                    + " L" + x_coord + "," + y_coord
                    + " L" + (x_coord - tailX) + "," + (y_coord + tailY);
            }

            self.bgroup = self.g.append("g")
                .on("mouseover", function () {
                    const evt = d3.event;
                    if (!self.FragKey.changeMod && !self.FragKey.changeCL) {
                        if (evt.ctrlKey) {
                            self.fragBar.style("cursor", "copy");
                            self.bTail.style("cursor", "copy");
                            self.bHighlight.style("cursor", "copy");
                        } else {
                            self.fragBar.style("cursor", "pointer");
                            self.bTail.style("cursor", "pointer");
                            self.bHighlight.style("cursor", "pointer");
                        }
                    }
                    self.startHighlight(self.b);
                })
                .on("mouseout", function () {
                    self.endHighlight(self.b);
                })
                .on("touchstart", function () {
                    self.startHighlight(self.b);
                })
                .on("touchend", function () {
                    self.endHighlight(self.b);
                })
                .on("click", function () {
                    const evt = d3.event;
                    self.FragKey.model.updateStickyHighlight(self.b, evt.ctrlKey);
                });

            self.bHighlight = self.bgroup.append("path")
                .attr("d", highlightPath)
                .attr("stroke", self.FragKey.model.get("highlightColor"))
                .attr("stroke-width", self.FragKey.model.get("highlightWidth"))
                .attr("opacity", 0)
                .style("cursor", "pointer");

            self.bTail = self.bgroup.append("line")
                .attr("x1", x_coord)
                .attr("y1", y_coord)
                .attr("x2", x_coord - tailX)
                .attr("y2", y_coord + tailY)
                .style("cursor", "pointer")
                .attr("class", fragLineClass)
                .attr("stroke", "black");


            let fragText = fragments.b[0].type.toLowerCase()[0] + fragments.b[0].ionNumber;

            // Idea for multiple texts, could be to crowded
            /*		self.bTexts = []	//Array of d3 selections
                    bions = []
                    for (var i = 0; i < fragments.b.length; i++) {
                        if(fragments.b[i].type.indexOf("AIon") != -1 && bions.indexOf("a"+self.bfrag_index) == -1)
                            bions.push("a"+self.bfrag_index);
                        if(fragments.b[i].type.indexOf("BIon") != -1 && bions.indexOf("b"+self.bfrag_index) == -1)
                            bions.push("b"+self.bfrag_index);
                        if(fragments.b[i].type.indexOf("CIon") != -1 && bions.indexOf("c"+self.bfrag_index) == -1)
                            bions.push("c"+self.bfrag_index);
                    }

                    for (var i = 0; i < bions.length; i++) {
                        bText = self.g.append("text")
                        .attr("x", self.x - 7)
                        .attr("y", y + 15)
                        .style("font-size", "0.6em")
                        .style("fill", color)
                        .style("cursor", "default")
                        //.attr("text-anchor", "end")
                        .text(bions[i])
                        .attr("opacity", 0);
                        self.bTexts.push(bText);
                    }
            */

            self.bText = self.g.append("text")
                .attr("x", x_coord - 7)
                .attr("y", y_coord + 15)
                .style("font-size", "0.6em")
                .style("fill", this.color)
                .style("cursor", "default")
                //.attr("text-anchor", "middle")
                .text(fragText)
                .attr("opacity", 0);

            if (bOnlyLoss) {
                this.bTail.attr("stroke", this.FragKey.model.get("peakColor"));
            } else {
                this.bTail.attr("stroke", "black");
            }
        }

        // # yions; either normal or lossy; have different colors
        if (fragments.y.length !== 0) {

            let yLikeLossFragments = fragments.y.filter(function (f) {
                return f.lossy;
            });
            let yLikePrimFragments = fragments.y.filter(function (f) {
                return f.lossy !== true;
            });

            // only lossy fragments?
            yOnlyLoss = yLikePrimFragments.length === 0;

            // Crosslink containing fragment accentuation
            // Only consider losses for accentuation if there are no primary fragments
            if (yOnlyLoss) {
                clContFrags = yLikeLossFragments.filter(function (f) {
                    return f.crossLinkContaining;
                });
            } else {
                clContFrags = yLikePrimFragments.filter(function (f) {
                    return f.crossLinkContaining;
                });
            }
            let clContaining = clContFrags.length !== 0;
            let fragLineClass = "xispec_fragBar";
            if (self.FragKey.model.get("accentuateCrossLinkContainingFragments") && clContaining) {
                fragLineClass = "xispec_fragBarThick";
            }

            if (fragments.b.length === 0) {	//highlight full length of the fragbar
                highlightPath = "M" + x_coord + "," + y_coord
                    + " L" + x_coord + "," + (y_coord - barHeight)
                    + " L" + (x_coord + tailX) + "," + (y_coord - barHeight - tailY);
            } else {
                highlightPath = "M" + x_coord + "," + (y_coord - barHeight / 2)
                    + " L" + x_coord + "," + (y_coord - barHeight)
                    + " L" + (x_coord + tailX) + "," + (y_coord - barHeight - tailY);
            }

            this.ygroup = this.g.append("g")
                .on("mouseover", function () {
                    const evt = d3.event;
                    if (!self.FragKey.changeMod && !self.FragKey.changeCL) {
                        if (evt.ctrlKey) {
                            self.fragBar.style("cursor", "copy");
                            self.yTail.style("cursor", "copy");
                            self.yHighlight.style("cursor", "copy");
                        } else {
                            self.fragBar.style("cursor", "pointer");
                            self.yTail.style("cursor", "pointer");
                            self.yHighlight.style("cursor", "pointer");
                        }
                    }
                    self.startHighlight(self.y);
                })
                .on("mouseout", function () {
                    self.endHighlight(self.y);
                })
                .on("touchstart", function () {
                    self.startHighlight(self.y);
                })
                .on("touchend", function () {
                    self.endHighlight(self.y);
                })
                .on("click", function () {
                    const evt = d3.event;
                    self.FragKey.model.updateStickyHighlight(self.y, evt.ctrlKey);
                });


            this.yHighlight = this.ygroup.append("path")
                .attr("d", highlightPath)
                .attr("stroke", this.FragKey.model.get("highlightColor"))
                .attr("stroke-width", this.FragKey.model.get("highlightWidth"))
                .attr("opacity", 0)
                .style("cursor", "pointer");

            this.yTail = this.ygroup.append("line")
                .attr("x1", x_coord)
                .attr("y1", y_coord - barHeight)
                .attr("x2", x_coord + tailX)
                .attr("y2", y_coord - barHeight - tailY)
                .style("cursor", "pointer")
                .attr("class", fragLineClass);

            let fragText = fragments.y[0].type.toLowerCase()[0] + fragments.y[0].ionNumber;

            //Idea for multiple texts, could be to crowded
            /*		this.yTexts = []	//Array of d3 selections
                    yions = []
                    for (var i = 0; i < fragments.y.length; i++) {
                        if(fragments.y[i].type.indexOf("XIon") != -1 && yions.indexOf("x"+this.yfrag_index) == -1)
                            yions.push("x"+this.yfrag_index);
                        if(fragments.y[i].type.indexOf("YIon") != -1 && yions.indexOf("y"+this.yfrag_index) == -1)
                            yions.push("y"+this.yfrag_index);
                        if(fragments.y[i].type.indexOf("ZIon") != -1 && yions.indexOf("z"+this.yfrag_index) == -1)
                            yions.push("z"+this.yfrag_index);
                    }

                    for (var i = 0; i < yions.length; i++) {
                        yText = this.g.append("text")
                        .attr("x", this.x - 2)
                        .attr("y", y - barHeight - 7)
                        .style("font-size", "0.6em")
                        .style("fill", this.color)
                        .style("cursor", "default")
                        //.attr("text-anchor", "end")
                        .text(yions[i])
                        .attr("opacity", 0);
                        this.yTexts.push(yText);
                    }*/

            this.yText = this.g.append("text")
                .attr("x", x_coord - 2)
                .attr("y", y_coord - barHeight - 10)
                .style("font-size", "0.6em")
                .style("fill", this.color)
                .style("cursor", "default")
                //.attr("text-anchor", "end")
                .text(fragText)
                .attr("opacity", 0);

            if (yOnlyLoss) {
                this.yTail.attr("stroke", this.FragKey.model.get("peakColor"));
            } else {
                this.yTail.attr("stroke", "black");
            }
        }

        this.fragBar = this.g.append("line")
            .attr("x1", x_coord)
            .attr("y1", y_coord)
            .attr("x2", x_coord)
            .attr("y2", y_coord - barHeight)
            .style("cursor", "pointer")
            .style("pointer-events", "none")
            .attr("class", "xispec_fragBar");

        //if all fragments are lossy
        if ((fragments.y.length === 0 || yOnlyLoss) && (fragments.b.length === 0 || bOnlyLoss)) {
            this.fragBar.attr("stroke", this.FragKey.model.get("peakColor"));
        } else {
            this.fragBar.attr("stroke", "black");
        }
    }

    highlight(show, fragments) {
        if (show === true) {
            for (let f = 0; f < fragments.length; f++) {
                if (this.b.indexOf(fragments[f]) !== -1 && this.bHighlight) {
                    this.bHighlight.attr("opacity", 1);
                    this.bText.text(fragments[f].ionSeries + this.bfrag_index);
                    this.bText.attr("opacity", 1);
                }
                if (this.y.indexOf(fragments[f]) !== -1 && this.yHighlight) {
                    this.yHighlight.attr("opacity", 1);
                    this.yText.text(fragments[f].ionSeries + this.yfrag_index);
                    this.yText.attr("opacity", 1);
                }
            }
        } else {
            if (this.yHighlight) {
                this.yHighlight.attr("opacity", 0);
                this.yText.attr("opacity", 0);
            }
            if (this.bHighlight) {
                this.bHighlight.attr("opacity", 0);
                this.bText.attr("opacity", 0);
            }
        }
    }

    disableCursor() {
        this.fragBar.style("cursor", "default");
        if (this.yTail) {
            this.yTail.style("cursor", "default");
            this.yHighlight.style("cursor", "default");
        }
        if (this.bTail) {
            this.bTail.style("cursor", "default");
            this.bHighlight.style("cursor", "default");
        }
    }


}

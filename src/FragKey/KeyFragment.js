import d3 from "d3";

export function KeyFragment(fragments, index, offset, peptideId, FragKey) {
    this.FragKey = FragKey;
    this.peptideId = peptideId;
    this.peptide = FragKey.model.peptides[peptideId];

    this.fragments = [];
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
    if (this.peptideId === 0)
        var color = this.FragKey.model.p1color;
    else if (this.peptideId === 1)
        var color = this.FragKey.model.p2color;


    const xStep = FragKey.xStep;
    // var xStep = 23;

    this.x = (xStep * (index + offset)) + (xStep / 2);
    if (this.peptideId === 0)
        var y = 25;
    if (this.peptideId === 1)
        var y = 75;
    const barHeight = 18, tailX = 5, tailY = 5;

    const self = this;

    //svg elements
    this.g = this.FragKey.scaleSvgGroup.append("g");

    /*	var group = this.g
            .on("mouseover", function() {
                var evt = d3.event;
                if(!self.FragKey.changeMod && !self.FragKey.changeCL){
                    if (evt.ctrlKey){
                        self.fragBar.style("cursor", "copy");
                        if(self.yTail){
                            self.yTail.style("cursor", "copy");
                            self.yHighlight.style("cursor", "copy");
                        }
                        if(self.bTail){
                            self.bTail.style("cursor", "copy");
                            self.bHighlight.style("cursor", "copy");
                        }
                    }
                    else{
                        self.fragBar.style("cursor", "pointer");
                        if(self.yTail){
                            self.yTail.style("cursor", "pointer");
                            self.yHighlight.style("cursor", "pointer");
                        }
                        if(self.bTail){
                            self.bTail.style("cursor", "pointer");
                            self.bHighlight.style("cursor", "pointer");
                        }
                    }
                }
                //startHighlight();
            })
            .on("mouseout", function() {
                endHighlight();
            })
            .on("touchstart", function() {
                startHighlight();
            })
            .on("touchend", function() {
                endHighlight();
            })
            .on("click", function() {
                var evt = d3.event;
                self.FragKey.model.updateStickyHighlight(self.fragments, evt.ctrlKey);
            })
        ;*/

    function startHighlight(fragments) {

        if (!self.FragKey.changeCL && !self.FragKey.changeMod)
            self.FragKey.model.addHighlight(fragments);
    }

    function endHighlight(fragments) {
        if (!self.FragKey.changeCL && !self.FragKey.changeMod)
            self.FragKey.model.clearHighlight(fragments);
    }

    // # bions; either normal or lossy; have different colors
    if (fragments.b.length !== 0) { // really a, b, or c , see get_fragment_annotation()

        // check for Crosslink containing fragment - checking first is sufficient
        // fragments.b.filter(function(b){return b.type.crossLinkContaining})
        var fragLineClass = "xispec_fragBar";
        if (this.FragKey.model.get("accentuateCrossLinkContainingFragments") && fragments.b[0].crossLinkContaining) {
            fragLineClass = "xispec_fragBarThick";
        }

        if (fragments.y.length === 0)	//highlightPath full length of the fragbar
            var highlightPath = "M" + this.x + "," + (y - barHeight)
                + " L" + this.x + "," + y
                + " L" + (this.x - tailX) + "," + (y + tailY);

        else ////highlightPath half length of the fragbar
            var highlightPath = "M" + this.x + "," + (y - barHeight / 2)
                + " L" + this.x + "," + y
                + " L" + (this.x - tailX) + "," + (y + tailY);

        this.bgroup = this.g.append("g")
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
                startHighlight(self.b);
            })
            .on("mouseout", function () {
                endHighlight(self.b);
            })
            .on("touchstart", function () {
                startHighlight(self.b);
            })
            .on("touchend", function () {
                endHighlight(self.b);
            })
            .on("click", function () {
                const evt = d3.event;
                self.FragKey.model.updateStickyHighlight(self.b, evt.ctrlKey);
            });

        this.bHighlight = this.bgroup.append("path")
            .attr("d", highlightPath)
            .attr("stroke", this.FragKey.model.get("highlightColor"))
            .attr("stroke-width", this.FragKey.model.get("highlightWidth"))
            .attr("opacity", 0)
            .style("cursor", "pointer");

        this.bTail = this.bgroup.append("line")
            .attr("x1", this.x)
            .attr("y1", y)
            .attr("x2", this.x - tailX)
            .attr("y2", y + tailY)
            .style("cursor", "pointer")
            .attr("class", fragLineClass);


        var ion = fragments.b[0].type.toLowerCase()[0] + fragments.b[0].ionNumber;


//Idea for multiple texts, could be to crowded
        /*		this.bTexts = []	//Array of d3 selections
                bions = []
                for (var i = 0; i < fragments.b.length; i++) {
                    if(fragments.b[i].type.indexOf("AIon") != -1 && bions.indexOf("a"+this.bfrag_index) == -1)
                        bions.push("a"+this.bfrag_index);
                    if(fragments.b[i].type.indexOf("BIon") != -1 && bions.indexOf("b"+this.bfrag_index) == -1)
                        bions.push("b"+this.bfrag_index);
                    if(fragments.b[i].type.indexOf("CIon") != -1 && bions.indexOf("c"+this.bfrag_index) == -1)
                        bions.push("c"+this.bfrag_index);
                }

                for (var i = 0; i < bions.length; i++) {
                    bText = this.g.append("text")
                    .attr("x", this.x - 7)
                    .attr("y", y + 15)
                    .style("font-size", "0.6em")
                    .style("fill", color)
                    .style("cursor", "default")
                    //.attr("text-anchor", "end")
                    .text(bions[i])
                    .attr("opacity", 0);
                    this.bTexts.push(bText);
                }
        */

        this.bText = this.g.append("text")
            .attr("x", this.x - 7)
            .attr("y", y + 15)
            .style("font-size", "0.6em")
            .style("fill", color)
            .style("cursor", "default")
            //.attr("text-anchor", "middle")
            .text(ion)
            .attr("opacity", 0);

        //check if only lossy fragments
        var blossy = true;
        for (var i = 0; i < fragments.b.length; i++) {
            if (fragments.b[i].class !== "lossy")
                blossy = false;
        }
        if (blossy) {
            this.bTail.attr("stroke", this.FragKey.model.get("peakColor"));
        } else {
            this.bTail.attr("stroke", "black");
        }
    }

    // # yions; either normal or lossy; have different colors
    if (fragments.y.length !== 0) {

        var fragLineClass = "xispec_fragBar";
        if (this.FragKey.model.get("accentuateCrossLinkContainingFragments") && fragments.y[0].crossLinkContaining) {
            fragLineClass = "xispec_fragBarThick";
        }

        if (fragments.b.length === 0)	//highlight full length of the fragbar
            var highlightPath = "M" + this.x + "," + y
                + " L" + this.x + "," + (y - barHeight)
                + " L" + (this.x + tailX) + "," + (y - barHeight - tailY);
        else
            var highlightPath = "M" + this.x + "," + (y - barHeight / 2)
                + " L" + this.x + "," + (y - barHeight)
                + " L" + (this.x + tailX) + "," + (y - barHeight - tailY);

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
                startHighlight(self.y);
            })
            .on("mouseout", function () {
                endHighlight(self.y);
            })
            .on("touchstart", function () {
                startHighlight(self.y);
            })
            .on("touchend", function () {
                endHighlight(self.y);
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
            .attr("x1", this.x)
            .attr("y1", y - barHeight)
            .attr("x2", this.x + tailX)
            .attr("y2", y - barHeight - tailY)
            .style("cursor", "pointer")
            .attr("class", fragLineClass);

        var ion = fragments.y[0].type.toLowerCase()[0] + fragments.y[0].ionNumber;

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
                    .style("fill", color)
                    .style("cursor", "default")
                    //.attr("text-anchor", "end")
                    .text(yions[i])
                    .attr("opacity", 0);
                    this.yTexts.push(yText);
                }*/

        this.yText = this.g.append("text")
            .attr("x", this.x - 2)
            .attr("y", y - barHeight - 10)
            .style("font-size", "0.6em")
            .style("fill", color)
            .style("cursor", "default")
            //.attr("text-anchor", "end")
            .text(ion)
            .attr("opacity", 0);

        //check if only lossy fragments
        var ylossy = true;
        for (var i = 0; i < fragments.y.length; i++) {
            if (fragments.y[i].class !== "lossy")
                ylossy = false;
        }
        if (ylossy) {
            this.yTail.attr("stroke", this.FragKey.model.get("peakColor"));
        } else {
            this.yTail.attr("stroke", "black");
        }
    }

    this.fragBar = this.g.append("line")
        .attr("x1", this.x)
        .attr("y1", y)
        .attr("x2", this.x)
        .attr("y2", y - barHeight)
        .style("cursor", "pointer")
        .style("pointer-events", "none")
        .attr("class", "xispec_fragBar");

    //if all fragments are lossy
    if ((fragments.y.length === 0 || ylossy) && (fragments.b.length === 0 || blossy)) {
        this.fragBar.attr("stroke", this.FragKey.model.get("peakColor"));
    } else {
        this.fragBar.attr("stroke", "black");
    }


}

KeyFragment.prototype.highlight = function (show, fragments) {
    if (show === true) {
        for (let f = 0; f < fragments.length; f++) {
            if (this.b.indexOf(fragments[f]) !== -1 && this.bHighlight) {
                this.bHighlight.attr("opacity", 1);
                if (fragments[f].type.indexOf("AIon") !== -1)
                    this.bText.text("a" + this.bfrag_index);
                if (fragments[f].type.indexOf("BIon") !== -1)
                    this.bText.text("b" + this.bfrag_index);
                if (fragments[f].type.indexOf("CIon") !== -1)
                    this.bText.text("c" + this.bfrag_index);
                //if (fragments[f].type.indexOf("AIon") != -1 || fragments[f].type.indexOf("BIon") != -1 || fragments[f].type.indexOf("CIon") != -1)
                this.bText.attr("opacity", 1);
            }
            if (this.y.indexOf(fragments[f]) !== -1 && this.yHighlight) {
                this.yHighlight.attr("opacity", 1);
                if (fragments[f].type.indexOf("XIon") !== -1)
                    this.yText.text("x" + this.yfrag_index);
                if (fragments[f].type.indexOf("YIon") !== -1)
                    this.yText.text("y" + this.yfrag_index);
                if (fragments[f].type.indexOf("ZIon") !== -1)
                    this.yText.text("z" + this.yfrag_index);
                //if (fragments[f].type.indexOf("XIon") != -1 || fragments[f].type.indexOf("YIon") != -1 || fragments[f].type.indexOf("ZIon") != -1)
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
};

KeyFragment.prototype.disableCursor = function () {
    this.fragBar.style("cursor", "default");
    if (this.yTail) {
        this.yTail.style("cursor", "default");
        this.yHighlight.style("cursor", "default");
    }
    if (this.bTail) {
        this.bTail.style("cursor", "default");
        this.bHighlight.style("cursor", "default");
    }
};

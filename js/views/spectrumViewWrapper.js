// eslint-disable-next-line no-unused-vars
import "../../css/spectrumViewWrapper.css";

import {BaseFrameView} from "../ui-utils/base-frame-view";
import * as _ from 'underscore';
import {CompositeModel} from "../model/composite-model";
import {SelectionTableViewBB} from "./selectionTableViewBB";
import {makeLegalFileName, proteinConcat} from "../utils";
import d3 from "d3";

export const SpectrumViewWrapper = BaseFrameView.extend({

    events: function () {
        let parentEvents = BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({
            'click #clearHighlights': 'clearSpectrumHighlights',
        }, parentEvents, {});
    },

    defaultOptions: {
        canBringToTop: true,
        canHideToolbarArea: false,
        canTakeImage: true,
    },

    initialize: function (options) {
        SpectrumViewWrapper.__super__.initialize.apply(this, arguments);


        //this.options = _.extend({}, this.options, this.defaultOptions, options.myOptions);

        const _html = "" // i think its a mistake (of mine, I think - cc) to use id's in following instead of classes... its a backbone thing
            //~ +"<div id='spectrum'>"
            +
            "<div id='modular_xispec' class='spectrumPlotsDiv'>" +
            "</div>" +
            "<div class='validationControls'>" +
            "</div>" +
            "<div id='alternatives'>" +
            "</div>";

        d3.select(this.el)
            .classed("CLMSUIspectrumWrapper", true)
            .append("div")
            .attr("class", "verticalFlexContainer")
            .attr("id", this.options.wrapperID)
            // http://stackoverflow.com/questions/90178/make-a-div-fill-the-height-of-the-remaining-screen-space?rq=1
            //.style ("display", "table")
            .html(_html);

        d3.select("#" + this.options.wrapperID)
            .selectAll("button,input[type='submit']")
            .classed("btn btn-1 btn-1a", true);

        d3.select(this.el).selectAll("label")
            .classed("btn", true);


        d3.select(this.el).select("div.validationControls")
            .append("p")
            .html("Current Manual Validation State: <span class='validatedState'></span></p>");

        this.alternativesModel = new CompositeModel({
            //~ filterModel: filterModelInst,
            selection: [], //will contain cross-link objects
        });

        // World of code smells vol.1
        // selectionViewer declared before spectrumWrapper because...
        // 1. Both listen to event A, selectionViewer to build table, spectrumWrapper to do other stuff
        // 2. Event A in spectrumWrapper fires event B
        // 3. selectionViewer listens for event B to highlight row in table - which means it must have built the table
        // 4. Thus selectionViewer must do it's routine for event A before spectrumWrapper, so we initialise it first
        const altsSelectionViewer = new SelectionTableViewBB({
            el: "#alternatives",
            model: this.alternativesModel,
            mainModel: this.model
        });

        //~ var split = Split (["#spectrum", "#alternatives"],
        //~ { direction: "vertical", sizes: [60,40], minSize: [200,10],
        //~ onDragEnd: function () {vent.trigger ("resizeSpectrumSubViews", true); }
        //~ }
        //~ );

        // redraw / hide table on selected cross-link change
        altsSelectionViewer.listenTo(this.alternativesModel, "selectionMatchesLinksChanged" /*"change:selection"*/, function () {
            altsSelectionViewer.render();
            //~ alert();
            //~ var emptySelection = (selection.length === 0);
            //~ split.collapse (emptySelection);    // this is a bit hacky as it's referencing the split component in another view
        });
        altsSelectionViewer.setVisible(true);
        //~ split.collapse (true);
        //~ selectionViewer.setVisible (false);


        // Only if spectrum viewer visible...
        // When crosslink selection changes, pick highest scoring filtered match of the set
        // and tell it to show the spectrum for that match
        this.listenTo(this.model, "selectionMatchesLinksChanged" /*"change:selection"*/, function (model) {
            let highestScore = Number.MIN_VALUE;
            let highestScoringMatch = null;
            const selection = model.get("selection");
            const selectedMatches = model.get("match_selection");

            selection.forEach(function (selCrossLink) {
                const filteredMatches_pp = selCrossLink.filteredMatches_pp;
                // DB query orders by score
                //console.log ("fpp", filteredMatches_pp);
                const filteredSelectedMatches = filteredMatches_pp ? filteredMatches_pp.filter(function (match) {
                    return selectedMatches.get(match.match.id);
                }) : [];
                if (filteredSelectedMatches.length) {
                    var match = filteredSelectedMatches[0].match;
                    //console.log ("match", match, selectedMatches.get(match.id));
                    if (match.score() > highestScore || !highestScoringMatch) {
                        highestScore = match.score();
                        highestScoringMatch = match;
                    }
                }
            });
            this.model.set("lastSelectedMatch", {
                match: highestScoringMatch,
                directSelection: false
            });
        });

        this.listenTo(this.model, "change:lastSelectedMatch", function (model, selectedMatch) {
            selectedMatch = selectedMatch || model.get("lastSelectedMatch");
            this.triggerSpectrumViewer(selectedMatch.match, selectedMatch.directSelection);
        });

        this.newestSelectionShown = true;
        this.enableControls(false);
    },

    enableControls: function (state) {
        d3.select(this.el)
            .selectAll(".validationControls,#spectrumControls")
            //.style ("background", state ? null : "#888888")
            .selectAll("*")
            .property("disabled", !state)
            .classed("spectrumDisabled", !state);
    },

    triggerSpectrumViewer: function (match, forceShow) {
        //console.log ("MATCH selected", match, forceShow);
        if (this.isVisible() || forceShow) {
            this.newestSelectionShown = true;
            const visible = !!match;
            if (this.isVisible() !== visible) {
                //console.log ("CHANGE VISIBILITY");
                vent.trigger("spectrumShow", visible);
            }
            vent.trigger("individualMatchSelected", match);
            this.enableControls(match);
            if (match) {
                d3.select(this.el).select("span.validatedState")
                    .text(match.validated ? match.validated : "Undefined")
                    .attr("class", "validatedState")
                    .classed(match.validated, true);
            } else {
                d3.select(this.el).select("span.validatedState")
                    .text("")
                    .attr("class", "validatedState");
            }
        } else {
            this.newestSelectionShown = false;
        }
    },

    relayout: function () {
        // if a new selected match has been made while the spectrum viewer was hidden,
        // load it in when the spectrum viewer is made visible
        if (!this.newestSelectionShown) {
            //console.log ("LAZY LOADING SPECTRUM");
            const selectedMatch = this.model.get("lastSelectedMatch") || {
                match: null
            };
            this.triggerSpectrumViewer(selectedMatch.match, true);
        }
        // resize the spectrum on drag
        vent.trigger("resizeSpectrumSubViews", true);

        const altModel = this.alternativesModel.get("clmsModel");
        const keepDisplayNone = (altModel && altModel.get("matches").length === 1); // altModel check as sometime clmsModel isn't populated (undefined)

        const alts = d3.select("#alternatives");
        const w = alts.node().parentNode.parentNode.getBoundingClientRect().width - 20;
        alts.attr("style", "width:" + w + "px;" + (keepDisplayNone ? " display: none;" : "")); //dont know why d3 style() aint working
        // mjg - i dunno why d3.style doesn't work either - i might replace later the layout of the wrapper with a flexbox based layout to see if that helps.
        //cc - yes, probably better, theres old code of mine scattered around that should use flexbox also...
        // anyways at the moment replacing the entire style attribute wipes out display: none when single alt explanation so I've added the above bit of code.
        //alts.style("width", w+"px");
        return this;
    },

    identifier: "Spectrum View",

    optionsToString: function () {
        //console.log ("this", this);
        const match = this.primaryMatch;
        console.log("MATCH", match);
        const description = [{
            field: "id"
        },
            {
                label: "prot1",
                value: proteinConcat(match, 0, this.model.get("clmsModel"))
            },
            {
                label: "pep1",
                value: match.matchedPeptides[0].sequence
            },
            {
                label: "pos1",
                value: match.matchedPeptides[0].pos[0]
            },
            {
                label: "lp1",
                value: match.linkPos1
            },
        ];
        if (match.matchedPeptides[1]) {
            description.push({
                label: "prot2",
                value: proteinConcat(match, 1, this.model.get("clmsModel"))
            }, {
                label: "pep2",
                value: match.matchedPeptides[1].sequence
            }, {
                label: "pos2",
                value: match.matchedPeptides[1].pos[0]
            }, {
                label: "lp2",
                value: match.linkPos2
            });
        }
        description.push({
                field: "score",
                value: match.score()
            }, {
                field: "autovalidated",
                label: "Auto"
            }, {
                field: "validated",
                label: "Val"
            },
            //["precursorCharge"],
            {
                field: "searchId"
            }, {
                label: "run",
                value: match.runName()
            }, {
                field: "scanNumber"
            }, {
                field: "is_decoy",
                label: "Decoy"
            }
        );
        description.forEach(function (desc) {
            desc.value = desc.value || match[desc.field] || "null";
        });
        //description.push(["crosslinks", match.crosslinks.map(function(xlink) { return xlink.id; }).join("&") ]);
        const description1 = description.map(function (desc) {
            return (desc.label || desc.field) + "=" + desc.value;
        });
        const joinedDescription = description1.join("-");
        return joinedDescription;
    },

    // Returns a useful filename given the view and filters current states
    filenameStateString: function () {
        return makeLegalFileName(this.identifier + "-" + this.optionsToString());
    },

    clearSpectrumHighlights: function () {
        xiSPEC.vent.trigger('clearSpectrumHighlights'); //todo -looks like error? is normally called window.xiSPECUI.vent - cc
    }
});
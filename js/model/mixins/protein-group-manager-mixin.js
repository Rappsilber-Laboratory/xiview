/**
 * @fileoverview Mixin for protein grouping operations on CompositeModel.
 * Mixed into CompositeModel.prototype via Object.assign so `this` is always the CompositeModel instance.
 * All Backbone get/set/trigger calls operate on the CompositeModel.
 */

import {jqdialogs} from "../../dialogs";
import d3 from "d3";
import vent from "../../vent";

export const ProteinGroupManagerMixin = {
    /**
     * Creates a new protein group from currently selected proteins.
     * Triggered by Enter key press on the groupSelected input. Alerts if group name already exists.
     * @param {Object} d3target - D3 selection of target element
     * @param {Object} evt - jQuery event object
     */
    groupSelectedProteins(d3target, evt) {
        const self = this;
        evt = evt.originalEvent;
        if (evt.key == "Enter") {
            const groups = self.get("groups");
            const groupName = d3.select("#groupSelected").property("value").trim();
            if (groupName) {
                if (groups.has(groupName)) {
                    alert("Cannot group - duplicate group name");
                } else {
                    const participantIds = new Set();
                    for (let p of self.get("selectedProteins")) {
                        participantIds.add(p.id);
                    }
                    groups.set(groupName, participantIds);
                    self.trigger("change:groups");
                    d3.select("#groupSelected").property("value", "");
                }
            }
        }
    },

    /**
     * Removes a protein from a specified group. Deletes group if it becomes empty.
     * @param {string} groupName - Name of the group
     * @param {string} participantId - Protein participant ID to remove
     */
    removeProteinFromGroup(groupName, participantId) {
        const groups = this.get("groups");
        const group = groups.get(groupName);
        group.delete(participantId);
        if (group.size === 0) {
            groups.delete(groupName);
        }
        this.trigger("change:groups");
    },

    /**
     * Adds a protein to a specified group.
     * @param {string} groupName - Name of the group
     * @param {string} participantId - Protein participant ID to add
     */
    addProteinToGroup(groupName, participantId) {
        const groups = this.get("groups");
        const group = groups.get(groupName);
        group.add(participantId);
        this.trigger("change:groups");
    },

    /**
     * Clears all protein groups after user confirmation.
     */
    clearGroups() {
        const self = this;
        jqdialogs.areYouSureDialog("ClearGroupsDialog", "Clear all groups?", "Clear Groups", "Yes", "No", function () {
            self.set("groups", new Map());
            self.trigger("change:groups");
        });
    },

    /**
     * Automatically creates protein groups based on GO term annotations.
     * Groups proteins by GO terms that are descendants of "protein complex" (GO0032991).
     * Clears existing groups after user confirmation.
     */
    autoGroup() {
        const self = this;
        jqdialogs.areYouSureDialog("ClearGroupsDialog", "Auto group always clears existing groups - proceed?", "Clear Groups", "Yes", "No", function () {
            const groupMap = new Map();
            const go = self.get("go");
            for (let goTerm of go.values()) {
                if (!goTerm.subclasses && !goTerm.parts) {
                    const interactors = goTerm.getInteractors();
                    if (interactors && interactors.size > 1) {
                        if (goTerm.isDescendantOf("GO0032991")) {
                            console.log(">" + goTerm.name);
                            const participantIds = new Set();
                            for (let p of interactors) {
                                participantIds.add(p.id);
                            }
                            groupMap.set(goTerm.name, participantIds);
                        }
                    }
                }
            }
            self.set("groups", groupMap);
            self.trigger("change:groups");
        });
    },

    /**
     * Automatically creates protein groups based on cellular compartment GO annotations.
     * Currently configured for nucleus (GO0005634).
     */
    autoGroupCompartments() {
        const go = this.get("go");

        // plasma membrane 0005886 n
        // peroxysomes 0005777
        // lysomes 0005764
        // golgi 0005794 y
        // cytosol 5829
        // cytoskeleton 5856
        // er 0005783 ?
        // mitochondria 0005739
        // nucleus 0005634
        const groupMap = this.get("groups");
        const termOfInterest = ["0005634"];
        for (let term of termOfInterest) {
            const goTerm = this.get("go").get("GO" + term);
            const interactors = goTerm.getInteractors();
            if (interactors && interactors.size > 1) {
                console.log("Compartment>" + goTerm.name);
                const participantIds = new Set();
                groupMap.set(goTerm.name, participantIds);
            }
        }

        const proteins = this.get("clmsModel").getProteinsIterator();
        for (let protein of proteins) {
            if (protein.uniprot) {
                for (let goId of protein.uniprot.go) {
                    const goTerm = go.get(goId);
                    if (goTerm) {
                        for (let term of termOfInterest) {
                            const termOfInterest = this.get("go").get("GO" + term);
                            if (goTerm.isDescendantOf(termOfInterest.id)) {
                                groupMap.get(termOfInterest.name).add(protein.id);
                            }
                        }
                    }
                }
            }
        }
        this.set("groups", groupMap);
        this.trigger("change:groups");
    },

    /**
     * Triggers group collapse in visualization views.
     */
    collapseGroups() {
        vent.trigger("collapseGroups", true);
    },

    /**
     * Triggers group expansion in visualization views.
     */
    expandGroups() {
        vent.trigger("expandGroups", true);
    },
};

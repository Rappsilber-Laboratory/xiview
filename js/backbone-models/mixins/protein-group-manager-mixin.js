/**
 * @fileoverview Mixin for protein grouping operations on CompositeModel.
 * Mixed into CompositeModel.prototype via Object.assign so `this` is always the CompositeModel instance.
 * All Backbone get/set/trigger calls operate on the CompositeModel.
 */

import {jqdialogs} from "../../ui-utils/dialogs";
import d3 from "d3";
import vent from "../../vent";

const MIN_GROUP_SIZE = 2;

/**
 * Returns the hierarchical path of a protein's primary (first listed, canonical) UniProt
 * subcellular location, e.g. "Cytoplasm, cytoskeleton, centrosome" -> ["Cytoplasm", "cytoskeleton", "centrosome"].
 * @param {Object} protein - Protein with optional uniprot entry
 * @returns {string[]|null} Location path segments, or null if none
 */
function getPrimaryLocationPath(protein) {
    const comments = protein.uniprot && protein.uniprot.comments;
    if (!Array.isArray(comments)) {
        return null;
    }
    // prefer the canonical comment (no molecule = not isoform-specific)
    const locComments = comments.filter(c => c.commentType === "SUBCELLULAR LOCATION");
    const comment = locComments.find(c => !c.molecule) || locComments[0];
    const locations = comment && comment.subcellularLocations;
    const value = locations && locations.length && locations[0].location && locations[0].location.value;
    if (!value) {
        return null;
    }
    const path = value.split(",").map(s => s.trim()).filter(s => s);
    return path.length ? path : null;
}

/**
 * Returns Complex Portal complexes a protein belongs to, from its UniProt cross-references.
 * @param {Object} protein - Protein with optional uniprot entry
 * @returns {{id: string, name: string}[]} Complexes (empty if none)
 */
function getComplexes(protein) {
    const xrefs = protein.uniprot && protein.uniprot.uniProtKBCrossReferences;
    if (!Array.isArray(xrefs)) {
        return [];
    }
    return xrefs
        .filter(x => x.database === "ComplexPortal")
        .map(function (x) {
            const nameProp = Array.isArray(x.properties) ? x.properties.find(p => p.key === "EntryName") : null;
            return {id: x.id, name: (nameProp && nameProp.value) || x.id};
        });
}

/**
 * Builds nested subcellular location groups. A protein whose primary location is "A, B, C" is placed in
 * groups "A", "A, B" and "A, B, C", so parents are supersets of children and xiNET nests them.
 * Ancestors with exactly the same members as a child are dropped (keeping the more specific name),
 * as are groups smaller than MIN_GROUP_SIZE.
 * @param {Iterable<Object>} proteins - Proteins to group
 * @returns {Map<string, Set<string>>} Group name -> protein ids
 */
function buildLocationGroups(proteins) {
    const groupMap = new Map();
    const childKeys = new Map(); // group key -> Set of direct child group keys
    for (let protein of proteins) {
        const path = getPrimaryLocationPath(protein);
        if (path) {
            let parentKey = null;
            for (let i = 1; i <= path.length; i++) {
                const key = path.slice(0, i).join(", ");
                if (!groupMap.has(key)) {
                    groupMap.set(key, new Set());
                    childKeys.set(key, new Set());
                }
                groupMap.get(key).add(protein.id);
                if (parentKey) {
                    childKeys.get(parentKey).add(key);
                }
                parentKey = key;
            }
        }
    }

    for (let [key, proteinIds] of groupMap) {
        if (proteinIds.size < MIN_GROUP_SIZE) {
            groupMap.delete(key);
        }
    }
    // drop ancestors that are identical to one of their children (children always subsets, so compare sizes)
    for (let [key, proteinIds] of Array.from(groupMap.entries())) {
        for (let childKey of childKeys.get(key)) {
            const child = groupMap.get(childKey);
            if (child && child.size === proteinIds.size) {
                groupMap.delete(key);
                break;
            }
        }
    }
    return groupMap;
}

/**
 * Builds Complex Portal complex groups (may overlap, a protein can be in several complexes).
 * @param {Iterable<Object>} proteins - Proteins to group
 * @returns {Map<string, Set<string>>} Complex name -> protein ids
 */
function buildComplexGroups(proteins) {
    const byId = new Map(); // complex id -> {name, proteinIds}
    for (let protein of proteins) {
        for (let complex of getComplexes(protein)) {
            if (!byId.has(complex.id)) {
                byId.set(complex.id, {name: complex.name, proteinIds: new Set()});
            }
            byId.get(complex.id).proteinIds.add(protein.id);
        }
    }
    const groupMap = new Map();
    for (let [id, complex] of byId) {
        if (complex.proteinIds.size >= MIN_GROUP_SIZE) {
            const name = groupMap.has(complex.name) ? complex.name + " (" + id + ")" : complex.name;
            groupMap.set(name, complex.proteinIds);
        }
    }
    return groupMap;
}

/**
 * Builds location groups and complex groups together; xiNET nests complexes inside locations
 * where all members share a location.
 * @param {Object[]} proteins - Proteins to group
 * @returns {Map<string, Set<string>>} Group name -> protein ids
 */
function buildLocationAndComplexGroups(proteins) {
    const groupMap = buildLocationGroups(proteins);
    for (let [name, proteinIds] of buildComplexGroups(proteins)) {
        groupMap.set(groupMap.has(name) ? name + " (complex)" : name, proteinIds);
    }
    return groupMap;
}

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
                    const proteinIds = new Set();
                    for (let p of self.get("selectedProteins")) {
                        proteinIds.add(p.id);
                    }
                    groups.set(groupName, proteinIds);
                    self.trigger("change:groups");
                    d3.select("#groupSelected").property("value", "");
                }
            }
        }
    },

    /**
     * Removes a protein from a specified group. Deletes group if it becomes empty.
     * @param {string} groupName - Name of the group
     * @param {string} proteinId - Protein ID to remove
     */
    removeProteinFromGroup(groupName, proteinId) {
        const groups = this.get("groups");
        const group = groups.get(groupName);
        group.delete(proteinId);
        if (group.size === 0) {
            groups.delete(groupName);
        }
        this.trigger("change:groups");
    },

    /**
     * Adds a protein to a specified group.
     * @param {string} groupName - Name of the group
     * @param {string} proteinId - Protein ID to add
     */
    addProteinToGroup(groupName, proteinId) {
        const groups = this.get("groups");
        const group = groups.get(groupName);
        group.add(proteinId);
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
     * Groups proteins by nested UniProt subcellular location (primary location only).
     * Clears existing groups after user confirmation.
     */
    autoGroupBySubcellularLocation() {
        this._applyAutoGroups(buildLocationGroups, "subcellular location");
    },

    /**
     * Groups proteins by Complex Portal complex membership (from UniProt cross-references).
     * Clears existing groups after user confirmation.
     */
    autoGroupByComplex() {
        this._applyAutoGroups(buildComplexGroups, "Complex Portal complex");
    },

    /**
     * Groups proteins by both subcellular location and complex membership.
     * Clears existing groups after user confirmation.
     */
    autoGroupBySubcellularLocationAndComplex() {
        this._applyAutoGroups(buildLocationAndComplexGroups, "subcellular location or complex");
    },

    /**
     * Builds groups from UniProt annotations and, after confirmation, replaces existing groups with them.
     * If no groups can be built, alerts and leaves existing groups untouched.
     * @param {function(Object[]): Map<string, Set<string>>} buildFn - Builds group map from proteins
     * @param {string} description - Annotation type, used in the "nothing found" message
     * @private
     */
    _applyAutoGroups(buildFn, description) {
        const self = this;
        const proteins = Array.from(self.get("clmsModel").getProteinsIterator());
        const groupMap = buildFn(proteins);
        if (groupMap.size === 0) {
            alert("No " + description + " data found in UniProt annotations - groups unchanged.");
            return;
        }
        jqdialogs.areYouSureDialog("ClearGroupsDialog", "Auto group always clears existing groups - proceed?", "Clear Groups", "Yes", "No", function () {
            self.set("groups", groupMap);
            self.trigger("change:groups");
        });
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

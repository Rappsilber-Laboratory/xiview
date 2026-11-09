/**
 * @fileoverview Mixin for protein grouping operations on CompositeModel.
 * Mixed into CompositeModel.prototype via Object.assign so `this` is always the CompositeModel instance.
 * All Backbone get/set/trigger calls operate on the CompositeModel.
 */

import {jqdialogs} from "../../ui-utils/dialogs";
import d3 from "d3";
import vent from "../../vent";
import {fetchJsonInBatches} from "../../utils";

const MIN_GROUP_SIZE = 2;
const GO_PROTEIN_CONTAINING_COMPLEX = "GO:0032991";
const QUICKGO_TERMS_URL = "https://www.ebi.ac.uk/QuickGO/services/ontology/go/terms/";

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
 * Returns a protein's UniProt cross-references to one database, with properties as a key -> value object.
 * @param {Object} protein - Protein with optional uniprot entry
 * @param {string} database - Cross-referenced database name, e.g. "ComplexPortal", "GO"
 * @returns {{id: string, properties: Object<string, string>}[]} Cross-references (empty if none)
 */
function getXrefs(protein, database) {
    const xrefs = protein.uniprot && protein.uniprot.uniProtKBCrossReferences;
    if (!Array.isArray(xrefs)) {
        return [];
    }
    return xrefs
        .filter(x => x.database === database)
        .map(function (x) {
            const properties = {};
            if (Array.isArray(x.properties)) {
                for (let p of x.properties) {
                    properties[p.key] = p.value;
                }
            }
            return {id: x.id, properties: properties};
        });
}

/**
 * Returns Complex Portal complexes a protein belongs to, from its UniProt cross-references.
 * @param {Object} protein - Protein with optional uniprot entry
 * @returns {{id: string, name: string}[]} Complexes (empty if none)
 */
function getComplexes(protein) {
    return getXrefs(protein, "ComplexPortal")
        .map(x => ({id: x.id, name: x.properties.EntryName || x.id}));
}

/**
 * Returns the GO Cellular Component terms a protein is annotated with, from its UniProt cross-references.
 * @param {Object} protein - Protein with optional uniprot entry
 * @returns {{id: string, name: string}[]} GO CC terms (empty if none)
 */
function getGoComponentTerms(protein) {
    return getXrefs(protein, "GO")
        .filter(x => x.properties.GoTerm && x.properties.GoTerm.startsWith("C:"))
        .map(x => ({id: x.id, name: x.properties.GoTerm.slice(2)}));
}

/**
 * Fetches the is_a / part_of ancestors of GO terms from QuickGO, in batches.
 * @param {string[]} termIds - GO term ids
 * @param {number} [batchSize=100] - Number of terms per request
 * @returns {Promise<Map<string, Set<string>>>} Term id -> ancestor ids (QuickGO includes the term itself)
 * @throws {Error} If a request fails or a term is missing from the response
 */
async function fetchGoAncestors(termIds, batchSize = 100) {
    const responses = await fetchJsonInBatches(termIds, batchSize,
        batch => QUICKGO_TERMS_URL + batch.join(",") + "/ancestors?relations=is_a,part_of", "QuickGO");
    const ancestors = new Map();
    for (let data of responses) {
        for (let term of data.results) {
            ancestors.set(term.id, new Set(term.ancestors));
        }
    }
    const missing = termIds.filter(id => !ancestors.has(id));
    if (missing.length) throw new Error("QuickGO returned no ancestors for " + missing.join(", "));
    return ancestors;
}

/**
 * Removes groups smaller than MIN_GROUP_SIZE, then groups with exactly the same members as one of their
 * child groups (keeping the more specific one). Children must be subsets of their parents.
 * @param {Map<string, Set<string>>} groupMap - Group key -> protein ids, modified in place
 * @param {Map<string, Set<string>>} childKeys - Group key -> keys of child (or descendant) groups
 * @returns {Map<string, Set<string>>} The pruned groupMap
 */
function pruneGroups(groupMap, childKeys) {
    for (let [key, proteinIds] of groupMap) {
        if (proteinIds.size < MIN_GROUP_SIZE) {
            groupMap.delete(key);
        }
    }
    // children always subsets, so compare sizes
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

    return pruneGroups(groupMap, childKeys);
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
 * Builds nested groups from GO Cellular Component terms that are protein-containing complexes
 * (descendants of GO:0032991), using QuickGO for the ontology. A protein is placed in each of its complex
 * terms and in those of their ancestors that are also annotated directly on some protein in the dataset,
 * so related complexes nest without adding generic classes like "catalytic complex".
 * Pruned as for location groups.
 * @param {Iterable<Object>} proteins - Proteins to group
 * @returns {Promise<Map<string, Set<string>>>} GO term name -> protein ids
 */
async function buildGoComplexGroups(proteins) {
    const termIdsByProtein = new Map(); // protein id -> GO CC term ids
    const termNames = new Map(); // GO term id -> name
    for (let protein of proteins) {
        const terms = getGoComponentTerms(protein);
        if (terms.length) {
            termIdsByProtein.set(protein.id, terms.map(t => t.id));
            for (let term of terms) {
                termNames.set(term.id, term.name);
            }
        }
    }
    if (termNames.size === 0) {
        return new Map();
    }

    const ancestors = await fetchGoAncestors(Array.from(termNames.keys()));
    const complexIds = new Set(Array.from(termNames.keys())
        .filter(id => id !== GO_PROTEIN_CONTAINING_COMPLEX && ancestors.get(id).has(GO_PROTEIN_CONTAINING_COMPLEX)));

    const groupMap = new Map(); // GO term id -> protein ids
    const descendantKeys = new Map(); // GO term id -> descendant term ids (within complexIds)
    for (let id of complexIds) {
        groupMap.set(id, new Set());
        descendantKeys.set(id, new Set());
    }
    for (let id of complexIds) {
        for (let ancestorId of ancestors.get(id)) {
            if (ancestorId !== id && complexIds.has(ancestorId)) {
                descendantKeys.get(ancestorId).add(id);
            }
        }
    }
    for (let [proteinId, termIds] of termIdsByProtein) {
        for (let id of termIds) {
            if (complexIds.has(id)) {
                // ancestors include the term itself
                for (let ancestorId of ancestors.get(id)) {
                    if (complexIds.has(ancestorId)) {
                        groupMap.get(ancestorId).add(proteinId);
                    }
                }
            }
        }
    }
    pruneGroups(groupMap, descendantKeys);

    const namedGroupMap = new Map();
    for (let [id, proteinIds] of groupMap) {
        const name = termNames.get(id);
        namedGroupMap.set(namedGroupMap.has(name) ? name + " (" + id + ")" : name, proteinIds);
    }
    return namedGroupMap;
}

/**
 * Builds location groups and complex groups together; xiNET nests complexes inside locations
 * where all members share a location. Complexes come from Complex Portal, or from GO CC complex terms
 * if no Complex Portal groups are found.
 * @param {Object[]} proteins - Proteins to group
 * @returns {Promise<Map<string, Set<string>>>} Group name -> protein ids
 */
async function buildLocationAndComplexGroups(proteins) {
    const groupMap = buildLocationGroups(proteins);
    let complexGroups = buildComplexGroups(proteins);
    if (complexGroups.size === 0) {
        complexGroups = await buildGoComplexGroups(proteins);
    }
    for (let [name, proteinIds] of complexGroups) {
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
     * Groups proteins by GO Cellular Component protein-containing complex terms (from UniProt, ontology from QuickGO).
     * Clears existing groups after user confirmation.
     */
    autoGroupByGoComplex() {
        this._applyAutoGroups(buildGoComplexGroups, "GO complex");
    },

    /**
     * Groups proteins by both subcellular location and complex membership (Complex Portal, else GO complex terms).
     * Clears existing groups after user confirmation.
     */
    autoGroupBySubcellularLocationAndComplex() {
        this._applyAutoGroups(buildLocationAndComplexGroups, "subcellular location or complex");
    },

    /**
     * Builds groups from UniProt annotations and, after confirmation, replaces existing groups with them.
     * If no groups can be built, or building fails, alerts and leaves existing groups untouched.
     * @param {function(Object[]): (Map<string, Set<string>>|Promise<Map<string, Set<string>>>)} buildFn - Builds group map from proteins
     * @param {string} description - Annotation type, used in the "nothing found" message
     * @returns {Promise<void>}
     * @private
     */
    async _applyAutoGroups(buildFn, description) {
        const self = this;
        const proteins = Array.from(self.get("clmsModel").getProteinsIterator());
        let groupMap;
        try {
            groupMap = await buildFn(proteins);
        } catch (e) {
            console.error(e);
            alert("Auto group failed - groups unchanged.\n" + e.message);
            return;
        }
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

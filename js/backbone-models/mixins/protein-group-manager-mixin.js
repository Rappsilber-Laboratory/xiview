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
// GO doesn't class e.g. the ribosome as a protein-containing complex but as a non-membrane-bounded organelle
const GO_NON_MEMBRANE_BOUNDED_ORGANELLE = "GO:0043232";
// general GO CC terms with very long child lists that are never used as containing groups
const GO_TERMS_NOT_CONTAINERS = ["GO:0005575", "GO:0110165", GO_PROTEIN_CONTAINING_COMPLEX, GO_NON_MEMBRANE_BOUNDED_ORGANELLE];
const QUICKGO_TERMS_URL = "https://www.ebi.ac.uk/QuickGO/services/ontology/go/terms/";
const UNIPROT_LOCATIONS_URL = "https://rest.uniprot.org/locations/stream?query=*&format=tsv&fields=id,name,is_a,part_of,gene_ontologies";
// UniProt locations that cut across organelles (they contain organelle membranes but not lumens), so they
// aren't used as containing groups: Endomembrane system, Cell envelope
const SL_TERMS_NOT_CONTAINERS = new Set(["SL-0147", "SL-0036"]);
// GO CC terms not used to place proteins that have no UniProt location: extracellular exosome (attached to many
// cytosolic proteins by proteomics surveys), membrane, protein-containing complex and the CC roots
const GO_TERMS_NOT_LOCATIONS = new Set(["GO:0070062", "GO:0016020", GO_PROTEIN_CONTAINING_COMPLEX, "GO:0005575", "GO:0110165"]);

/**
 * Returns a protein's primary (first listed, canonical) UniProt subcellular location.
 * @param {Object} protein - Protein with optional uniprot entry
 * @returns {{value: string, id: string}|null} Location, e.g. {value: "Cytoplasm, cytoskeleton", id: "SL-0090"},
 *     or null if none
 */
function getPrimaryLocation(protein) {
    const comments = protein.uniprot && protein.uniprot.comments;
    if (!Array.isArray(comments)) {
        return null;
    }
    // prefer the canonical comment (no molecule = not isoform-specific)
    const locComments = comments.filter(c => c.commentType === "SUBCELLULAR LOCATION");
    const comment = locComments.find(c => !c.molecule) || locComments[0];
    const locations = comment && comment.subcellularLocations;
    const location = locations && locations.length && locations[0].location;
    return location && location.value ? location : null;
}

/**
 * Returns the hierarchical path of a protein's primary UniProt subcellular location,
 * e.g. "Cytoplasm, cytoskeleton, centrosome" -> ["Cytoplasm", "cytoskeleton", "centrosome"].
 * @param {Object} protein - Protein with optional uniprot entry
 * @returns {string[]|null} Location path segments, or null if none
 */
function getPrimaryLocationPath(protein) {
    const location = getPrimaryLocation(protein);
    if (!location) {
        return null;
    }
    const path = location.value.split(",").map(s => s.trim()).filter(s => s);
    return path.length ? path : null;
}

/**
 * Makes a lookup of the terms that physically contain a term in an ontology with "is_a" (kind of) and
 * "part_of" (contained in) relations, such as GO cellular component or UniProt subcellular location.
 * A term is contained in the targets of chains of the form (is_a* part_of)+: "cytosolic large ribosomal subunit
 * part_of cytosolic ribosome" or "inner membrane is_a mitochondrion membrane part_of envelope part_of mitochondrion".
 * Chains ending in is_a only lead to kinds (e.g. "large ribosomal subunit"), which aren't containers.
 * Of the containers found, any that another one is a kind of is left out, so the most specific is kept
 * (cytosolic ribosome, not ribosome).
 * @param {function(string): {id: string, relation: string}[]} getParents - Direct parents of a term
 * @returns {function(string): Set<string>} Term id -> ids of the terms containing it (not including itself),
 *     with a `kinds` property: term id -> ids of the terms it is a kind of (its is_a ancestors)
 */
function makeContainerLookup(getParents) {
    const containersMemo = new Map();
    const kindsMemo = new Map();
    // memo entries are set before recursing, so a cycle ends instead of looping
    function containers(id) {
        if (!containersMemo.has(id)) {
            containersMemo.set(id, new Set());
            const result = new Set();
            for (let parent of getParents(id)) {
                if (parent.relation === "part_of") {
                    result.add(parent.id);
                }
                if (parent.relation === "part_of" || parent.relation === "is_a") {
                    for (let c of containers(parent.id)) {
                        result.add(c);
                    }
                }
            }
            containersMemo.set(id, result);
        }
        return containersMemo.get(id);
    }
    function kinds(id) {
        if (!kindsMemo.has(id)) {
            kindsMemo.set(id, new Set());
            const result = new Set();
            for (let parent of getParents(id)) {
                if (parent.relation === "is_a") {
                    result.add(parent.id);
                    for (let k of kinds(parent.id)) {
                        result.add(k);
                    }
                }
            }
            kindsMemo.set(id, result);
        }
        return kindsMemo.get(id);
    }
    const lookup = function (id) {
        const all = containers(id);
        const general = new Set();
        for (let c of all) {
            for (let k of kinds(c)) {
                general.add(k);
            }
        }
        return new Set(Array.from(all).filter(c => !general.has(c)));
    };
    lookup.kinds = kinds;
    return lookup;
}

let locationVocabularyPromise = null;

/**
 * Fetches the UniProt subcellular location vocabulary (once per page; ~40 kB).
 * @returns {Promise<Map<string, {name: string, parents: {id: string, relation: string}[], goIds: string[]}>>}
 *     SL id -> term (goIds: the GO CC terms UniProt maps to it)
 * @throws {Error} If the request fails
 */
function fetchLocationVocabulary() {
    if (!locationVocabularyPromise) {
        locationVocabularyPromise = fetch(UNIPROT_LOCATIONS_URL)
            .then(function (response) {
                if (!response.ok) throw new Error("UniProt locations fetch failed (" + response.status + ")");
                return response.text();
            })
            .then(function (text) {
                const vocabulary = new Map();
                const ids = s => (s || "").match(/SL-\d+/g) || [];
                // columns: id, name, is a, is part of (each relation "SL-0162; Membrane; LOCATION, ..."),
                // gene ontologies ("GO:0020022:acidocalcisome; ...")
                for (let line of text.split("\n").slice(1)) {
                    const cols = line.split("\t");
                    if (cols[0]) {
                        vocabulary.set(cols[0], {
                            name: cols[1] || cols[0],
                            parents: ids(cols[2]).map(id => ({id, relation: "is_a"}))
                                .concat(ids(cols[3]).map(id => ({id, relation: "part_of"}))),
                            goIds: (cols[4] || "").match(/GO:\d{7}/g) || [],
                        });
                    }
                }
                return vocabulary;
            })
            .catch(function (e) {
                locationVocabularyPromise = null;
                throw e;
            });
    }
    return locationVocabularyPromise;
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
 * Fetches the direct is_a / part_of parents of GO terms from QuickGO, as far as the parents are among termIds
 * (QuickGO only gives children, so the parents' children are fetched).
 * @param {string[]} termIds - GO term ids
 * @param {number} [batchSize=100] - Number of terms per request
 * @returns {Promise<{parents: Map<string, {id: string, relation: string}[]>, names: Map<string, string>}>}
 *     Term id -> its parents within termIds, and term id -> name for termIds
 * @throws {Error} If a request fails
 */
async function fetchGoParents(termIds, batchSize = 100) {
    const responses = await fetchJsonInBatches(termIds, batchSize,
        batch => QUICKGO_TERMS_URL + batch.join(",") + "/children", "QuickGO");
    const parents = new Map();
    const names = new Map();
    for (let data of responses) {
        for (let term of data.results) {
            names.set(term.id, term.name);
            for (let child of term.children || []) {
                if (child.relation === "is_a" || child.relation === "part_of") {
                    if (!parents.has(child.id)) {
                        parents.set(child.id, []);
                    }
                    parents.get(child.id).push({id: term.id, relation: child.relation});
                }
            }
        }
    }
    return {parents, names};
}

/**
 * Builds subcellular location groups from the UniProt location vocabulary. A protein is placed in its primary
 * location, in the locations containing it (e.g. Mitochondrion inner membrane -> Mitochondrion envelope ->
 * Mitochondrion, see makeContainerLookup) and in the broader terms UniProt names in the location's text
 * (e.g. Cell projection for "Cell projection, cilium"), so organelles collect their membranes, lumens and
 * sub-compartments. Groups may overlap (e.g. Cilium membrane is in Cilium and Cell membrane).
 * Proteins without a UniProt location are placed by their GO Cellular Component terms instead, see
 * placeByGoComponents.
 * @param {Iterable<Object>} proteins - Proteins to group
 * @param {Map<string, Set<string>>} [neighbours] - Protein id -> ids of the proteins crosslinked to it, used to
 *     choose between several GO locations
 * @returns {Promise<Map<string, Set<string>>>} Location name -> protein ids (groups of MIN_GROUP_SIZE or more)
 * @throws {Error} If the vocabulary (or, for GO placement, QuickGO) can't be fetched
 */
async function buildLocationHierarchyGroups(proteins, neighbours = new Map()) {
    const vocabulary = await fetchLocationVocabulary();
    const containersOf = makeContainerLookup(id => (vocabulary.has(id) ? vocabulary.get(id).parents : []));
    const idsByName = new Map();
    for (let [id, term] of vocabulary) {
        const key = term.name.toLowerCase();
        if (!idsByName.has(key)) {
            idsByName.set(key, id);
        }
    }
    // a location, the locations containing it and the broader terms in its text (segments before the last)
    const locationIds = function (ownId, broaderSegments) {
        const ids = new Set([ownId]);
        for (let id of containersOf(ownId)) {
            ids.add(id);
        }
        for (let segment of broaderSegments) {
            if (idsByName.has(segment)) {
                ids.add(idsByName.get(segment));
            }
        }
        return new Set(Array.from(ids).filter(id => id === ownId || !SL_TERMS_NOT_CONTAINERS.has(id)));
    };

    const idsByProtein = new Map(); // protein id -> SL ids of the groups it goes in
    const unlocated = [];
    for (let protein of proteins) {
        const location = getPrimaryLocation(protein);
        if (location) {
            const segments = location.value.split(",").map(s => s.trim().toLowerCase());
            const ownId = location.id || idsByName.get(segments[segments.length - 1]);
            if (ownId) {
                idsByProtein.set(protein.id, locationIds(ownId, segments.slice(0, -1)));
                continue;
            }
        }
        unlocated.push(protein);
    }
    const placed = await placeByGoComponents(unlocated, vocabulary, containersOf, idsByProtein, neighbours);
    for (let [proteinId, slId] of placed) {
        idsByProtein.set(proteinId, locationIds(slId, []));
    }

    const groupMap = new Map(); // SL id -> protein ids
    for (let [proteinId, ids] of idsByProtein) {
        for (let id of ids) {
            if (!groupMap.has(id)) {
                groupMap.set(id, new Set());
            }
            groupMap.get(id).add(proteinId);
        }
    }
    const namedGroupMap = new Map();
    for (let [id, proteinIds] of groupMap) {
        if (proteinIds.size >= MIN_GROUP_SIZE) {
            const name = vocabulary.has(id) ? vocabulary.get(id).name : id;
            namedGroupMap.set(namedGroupMap.has(name) ? name + " (" + id + ")" : name, proteinIds);
        }
    }
    return namedGroupMap;
}

/**
 * Chooses a UniProt location for proteins that have none, from their GO Cellular Component terms. Each term is
 * translated with UniProt's own GO mapping of its location vocabulary, or, if not mapped, through its mapped GO
 * ancestors. Only locations already used by proteins with UniProt locations are considered (GO's plasma membrane
 * also maps to e.g. the bacterial Cell inner membrane), and of those the most specific (e.g. Cytosol rather
 * than Cytoplasm). If several remain (e.g. Cytosol and Nucleoplasm), the one holding most of the protein's
 * crosslinked partners is chosen, then the one used by most proteins.
 * @param {Object[]} proteins - Proteins without a UniProt location
 * @param {Map<string, Object>} vocabulary - From fetchLocationVocabulary
 * @param {function(string): Set<string>} containersOf - From makeContainerLookup on the vocabulary
 * @param {Map<string, Set<string>>} idsByProtein - SL ids of the groups each located protein goes in
 * @param {Map<string, Set<string>>} neighbours - Protein id -> crosslinked protein ids
 * @returns {Promise<Map<string, string>>} Protein id -> chosen SL id, for the proteins that could be placed
 * @throws {Error} If a QuickGO request fails
 */
async function placeByGoComponents(proteins, vocabulary, containersOf, idsByProtein, neighbours) {
    const slIdsByGoId = new Map();
    for (let [slId, term] of vocabulary) {
        for (let goId of term.goIds) {
            if (!slIdsByGoId.has(goId)) {
                slIdsByGoId.set(goId, []);
            }
            slIdsByGoId.get(goId).push(slId);
        }
    }
    const usage = new Map(); // SL id -> number of located proteins in it
    for (let ids of idsByProtein.values()) {
        for (let id of ids) {
            usage.set(id, (usage.get(id) || 0) + 1);
        }
    }

    const termIdsByProtein = new Map();
    const unmappedTermIds = new Set();
    for (let protein of proteins) {
        const termIds = getGoComponentTerms(protein).map(t => t.id).filter(id => !GO_TERMS_NOT_LOCATIONS.has(id));
        if (termIds.length) {
            termIdsByProtein.set(protein.id, termIds);
            for (let id of termIds) {
                if (!slIdsByGoId.has(id)) {
                    unmappedTermIds.add(id);
                }
            }
        }
    }
    const ancestors = unmappedTermIds.size ? await fetchGoAncestors(Array.from(unmappedTermIds)) : new Map();

    const placed = new Map();
    for (let [proteinId, termIds] of termIdsByProtein) {
        const candidates = new Set();
        for (let termId of termIds) {
            const mappedIds = slIdsByGoId.has(termId) ? [termId]
                : Array.from(ancestors.get(termId) || []).filter(id => slIdsByGoId.has(id) && !GO_TERMS_NOT_LOCATIONS.has(id));
            for (let goId of mappedIds) {
                for (let slId of slIdsByGoId.get(goId)) {
                    if (usage.has(slId)) {
                        candidates.add(slId);
                    }
                }
            }
        }
        // most specific: leave out locations containing, or more general kinds of, another candidate
        const general = new Set();
        for (let id of candidates) {
            for (let c of containersOf(id)) {
                general.add(c);
            }
            for (let k of containersOf.kinds(id)) {
                general.add(k);
            }
        }
        const specific = Array.from(candidates).filter(id => !general.has(id));
        if (specific.length === 0) {
            continue;
        }
        const partners = neighbours.get(proteinId) || new Set();
        const partnersIn = function (slId) {
            let count = 0;
            for (let partnerId of partners) {
                const ids = idsByProtein.get(partnerId);
                if (ids && ids.has(slId)) {
                    count++;
                }
            }
            return count;
        };
        const scored = specific.map(id => ({id, partners: partnersIn(id), usage: usage.get(id)}));
        scored.sort((a, b) => (b.partners - a.partners) || (b.usage - a.usage) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        placed.set(proteinId, scored[0].id);
    }
    return placed;
}

/**
 * Builds groups from GO Cellular Component terms that are protein-containing complexes (descendants of
 * GO:0032991), nested by physical containment rather than kind: a protein is placed in each of its complex terms
 * and in the complexes containing them (see makeContainerLookup), e.g. cytosolic large ribosomal subunit ->
 * cytosolic ribosome, but not in "large ribosomal subunit" or "catalytic complex". Containing terms that no
 * protein is annotated with are added if they contain at least two annotated complexes and are complexes or
 * non-membrane-bounded organelles (like the ribosome). Pruned as for location groups.
 * @param {Iterable<Object>} proteins - Proteins to group
 * @returns {Promise<{groups: Map<string, Set<string>>, containers: Map<Set<string>, Set<Set<string>>>}>}
 *     GO term name -> protein ids, and each group's protein id set -> the protein id sets of the groups
 *     GO says contain it (an entry for every group, so callers can tell GO groups from others)
 * @throws {Error} If a QuickGO request fails
 */
async function buildGoComplexContainmentGroups(proteins) {
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
        return {groups: new Map(), containers: new Map()};
    }

    const ancestors = await fetchGoAncestors(Array.from(termNames.keys()));
    const complexIds = new Set(Array.from(termNames.keys())
        .filter(id => id !== GO_PROTEIN_CONTAINING_COMPLEX && ancestors.get(id).has(GO_PROTEIN_CONTAINING_COMPLEX)));
    const ontologyIds = new Set();
    for (let id of complexIds) {
        for (let ancestorId of ancestors.get(id)) {
            ontologyIds.add(ancestorId);
        }
    }
    for (let id of GO_TERMS_NOT_CONTAINERS) {
        ontologyIds.delete(id);
    }
    const {parents, names} = await fetchGoParents(Array.from(ontologyIds));
    const containersOf = makeContainerLookup(id => parents.get(id) || []);

    // add unannotated containers of two or more annotated complexes, if they are complexes or organelles like ribosomes
    const containedBy = new Map(); // container id -> annotated complex ids in it
    for (let id of complexIds) {
        for (let containerId of containersOf(id)) {
            if (!complexIds.has(containerId)) {
                if (!containedBy.has(containerId)) {
                    containedBy.set(containerId, new Set());
                }
                containedBy.get(containerId).add(id);
            }
        }
    }
    const candidateIds = Array.from(containedBy.keys()).filter(id => containedBy.get(id).size >= 2);
    const candidateAncestors = candidateIds.length ? await fetchGoAncestors(candidateIds) : new Map();
    const groupIds = new Set(complexIds);
    for (let id of candidateIds) {
        const a = candidateAncestors.get(id);
        if (a.has(GO_PROTEIN_CONTAINING_COMPLEX) || a.has(GO_NON_MEMBRANE_BOUNDED_ORGANELLE)) {
            groupIds.add(id);
        }
    }

    const groupMap = new Map(); // GO term id -> protein ids
    const descendantKeys = new Map(); // GO term id -> ids of group terms it contains
    const containerIds = new Map(); // GO term id -> ids of group terms containing it
    for (let id of groupIds) {
        groupMap.set(id, new Set());
        descendantKeys.set(id, new Set());
        containerIds.set(id, new Set());
    }
    for (let id of complexIds) {
        for (let containerId of containersOf(id)) {
            if (groupIds.has(containerId)) {
                descendantKeys.get(containerId).add(id);
                containerIds.get(id).add(containerId);
            }
        }
    }
    for (let [proteinId, termIds] of termIdsByProtein) {
        for (let id of termIds) {
            if (complexIds.has(id)) {
                groupMap.get(id).add(proteinId);
                for (let containerId of containerIds.get(id)) {
                    groupMap.get(containerId).add(proteinId);
                }
            }
        }
    }
    pruneGroups(groupMap, descendantKeys);

    const namedGroupMap = new Map();
    const containers = new Map();
    for (let [id, proteinIds] of groupMap) {
        const name = termNames.get(id) || names.get(id) || id;
        namedGroupMap.set(namedGroupMap.has(name) ? name + " (" + id + ")" : name, proteinIds);
        containers.set(proteinIds, new Set(Array.from(containerIds.get(id))
            .filter(c => groupMap.has(c)).map(c => groupMap.get(c))));
    }
    return {groups: namedGroupMap, containers};
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

/**
 * Keeps a laminar subset of groups: every kept pair is either disjoint or nested (one a subset of the other);
 * only partial overlaps are dropped. Groups are taken largest first (ties broken by name, so the result is
 * deterministic), so a group can only ever be a subset of an already kept one, never a superset, and the
 * biggest groups win. Exact duplicates of a kept group are dropped.
 * xiNET supports nested groups (a collapsed parent hides its subgroups), so all kept groups can be collapsed.
 * @param {Map<string, Set<string>>} groupMap - Group name -> protein ids
 * @returns {Map<string, Set<string>>} New map with the kept groups
 */
function keepNonOverlappingGroups(groupMap) {
    const kept = [];
    const sorted = Array.from(groupMap.entries())
        .sort((a, b) => (b[1].size - a[1].size) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    for (let [name, proteinIds] of sorted) {
        const rejected = kept.some(function ([, keptIds]) {
            let shared = 0;
            for (let id of proteinIds) {
                if (keptIds.has(id)) {
                    shared++;
                }
            }
            // keptIds is at least as big: partial overlap if some but not all shared; duplicate if same size
            return (shared > 0 && shared < proteinIds.size) || (shared === keptIds.size);
        });
        if (!rejected) {
            kept.push([name, proteinIds]);
        }
    }
    if (kept.length < groupMap.size) {
        console.log("Auto group: kept " + kept.length + " of " + groupMap.size + " groups (dropped partially overlapping or duplicate ones)");
    }
    return new Map(kept);
}

/**
 * Returns the given groups sorted smallest first (ties by name, so results are deterministic).
 * @param {Map<string, Set<string>>} groupMap - Group name -> protein ids
 * @returns {Array<[string, Set<string>]>}
 */
function smallestFirst(groupMap) {
    return Array.from(groupMap.entries())
        .sort((a, b) => (a[1].size - b[1].size) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/**
 * Builds a laminar (disjoint or nested) set of groups bottom up, so the smallest complexes are always kept and
 * bigger groups are built around them:
 * 1. Complexes, smallest first. Each is compared with the top-level groups kept so far that share proteins with
 *    it. It absorbs one whole (making it a subgroup) if GO says it contains it, or, when either isn't a GO group,
 *    if at least half of that group's proteins are in it; otherwise the shared proteins are left out of it.
 *    E.g. the small-subunit processome shares the cytosolic small ribosomal subunit's proteins but doesn't
 *    absorb it, so the subunit stays free to join the cytosolic ribosome.
 * 2. Locations, smallest first, the same way, except that each top-level complex goes to its home location:
 *    the one holding most of its proteins, ties going to the most specific (smallest) location.
 * Candidates left with fewer than MIN_GROUP_SIZE proteins, or identical to a kept group, are dropped.
 * @param {Map<string, Set<string>>} complexGroups - Complex name -> protein ids
 * @param {Map<Set<string>, Set<Set<string>>>} goContainers - For GO complex groups, protein id set -> the
 *     protein id sets of the GO groups containing it (see buildGoComplexContainmentGroups)
 * @param {Map<string, Set<string>>} locationGroups - Location name -> protein ids, where containing locations
 *     are supersets of the locations they contain
 * @returns {Map<string, Set<string>>} Kept group name -> protein ids
 */
function nestComplexesInLocations(complexGroups, goContainers, locationGroups) {
    const kept = new Map();
    const sourceIds = new Map(); // kept name -> the candidate's own protein id set (before absorbing / trimming)
    const rootOf = new Map(); // protein id -> name of the top-level kept group containing it

    function addCandidate(name, proteinIds, shouldAbsorb) {
        const shared = new Map(); // top-level kept group name -> number of shared proteins
        for (let id of proteinIds) {
            const root = rootOf.get(id);
            if (root !== undefined) {
                shared.set(root, (shared.get(root) || 0) + 1);
            }
        }
        const members = new Set(proteinIds);
        const absorbed = [];
        for (let [root, count] of shared) {
            const rootIds = kept.get(root);
            if (shouldAbsorb(root, count)) {
                absorbed.push(root);
                for (let id of rootIds) {
                    members.add(id);
                }
            } else {
                for (let id of rootIds) {
                    members.delete(id);
                }
            }
        }
        // members contain every absorbed group, so equal size means a duplicate
        if (members.size < MIN_GROUP_SIZE || (absorbed.length === 1 && kept.get(absorbed[0]).size === members.size)) {
            return;
        }
        let key = name, n = 2;
        while (kept.has(key)) {
            key = name + " (" + n++ + ")";
        }
        kept.set(key, members);
        sourceIds.set(key, proteinIds);
        for (let id of members) {
            rootOf.set(id, key);
        }
    }

    for (let [name, proteinIds] of smallestFirst(complexGroups)) {
        addCandidate(name, proteinIds, function (root, count) {
            const rootContainers = goContainers.get(sourceIds.get(root));
            return rootContainers && goContainers.has(proteinIds) ? rootContainers.has(proteinIds)
                : count * 2 >= kept.get(root).size;
        });
    }

    const homes = new Map(); // top-level complex name -> protein ids of its home location
    for (let root of new Set(rootOf.values())) {
        const rootIds = kept.get(root);
        let best = null, bestCount = 0;
        for (let locationIds of locationGroups.values()) {
            let count = 0;
            for (let id of rootIds) {
                if (locationIds.has(id)) {
                    count++;
                }
            }
            if (count > bestCount || (count === bestCount && count > 0 && locationIds.size < best.size)) {
                best = locationIds;
                bestCount = count;
            }
        }
        if (best) {
            homes.set(root, best);
        }
    }

    for (let [name, proteinIds] of smallestFirst(locationGroups)) {
        addCandidate(name, proteinIds, function (root, count) {
            const home = homes.get(root);
            if (home) {
                // the home location, or one containing it
                return home === proteinIds || (home.size <= proteinIds.size && Array.from(home).every(id => proteinIds.has(id)));
            }
            return count * 2 >= kept.get(root).size;
        });
    }
    return kept;
}

/**
 * Builds the groups used to collapse very large networks: Complex Portal and GO complexes (nested by
 * containment) inside UniProt subcellular locations (nested by containment), see nestComplexesInLocations.
 * Proteins without a UniProt location are placed by GO, preferring the location of their crosslinked partners.
 * @param {Object[]} proteins - Proteins to group
 * @param {SearchResultsModel} [clmsModel] - For the crosslinked partners
 * @returns {Promise<Map<string, Set<string>>>} Group name -> protein ids
 */
async function buildComplexesInLocationsGroups(proteins, clmsModel) {
    const neighbours = new Map();
    if (clmsModel) {
        for (let pair of getLinkedProteinPairs(clmsModel)) {
            const [a, b] = pair.split("\t");
            for (let [x, y] of [[a, b], [b, a]]) {
                if (!neighbours.has(x)) {
                    neighbours.set(x, new Set());
                }
                neighbours.get(x).add(y);
            }
        }
    }
    const go = await buildGoComplexContainmentGroups(proteins);
    const complexGroups = mergeGroupMaps([buildComplexGroups(proteins), go.groups]);
    return nestComplexesInLocations(complexGroups, go.containers, await buildLocationHierarchyGroups(proteins, neighbours));
}

/**
 * Returns the set of unordered protein id pairs that have at least one (non-decoy, non-self) crosslink.
 * @param {SearchResultsModel} clmsModel
 * @returns {Set<string>} "idA\tidB" keys with idA < idB
 */
function getLinkedProteinPairs(clmsModel) {
    const pairs = new Set();
    for (let crosslink of clmsModel.getCrosslinks().values()) {
        if (crosslink.toProtein && !crosslink.isDecoyLink() && crosslink.fromProtein.id !== crosslink.toProtein.id) {
            const a = crosslink.fromProtein.id, b = crosslink.toProtein.id;
            pairs.add(a < b ? a + "\t" + b : b + "\t" + a);
        }
    }
    return pairs;
}

/**
 * Counts crosslinked protein pairs within a group.
 * @param {Set<string>} proteinIds
 * @param {Set<string>} linkedPairs - from getLinkedProteinPairs
 * @returns {number}
 */
function countIntraGroupLinks(proteinIds, linkedPairs) {
    const ids = Array.from(proteinIds);
    let count = 0;
    if (ids.length * ids.length / 2 < linkedPairs.size) {
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const a = ids[i], b = ids[j];
                if (linkedPairs.has(a < b ? a + "\t" + b : b + "\t" + a)) {
                    count++;
                }
            }
        }
    } else {
        for (let pair of linkedPairs) {
            const [a, b] = pair.split("\t");
            if (proteinIds.has(a) && proteinIds.has(b)) {
                count++;
            }
        }
    }
    return count;
}

/**
 * Merges several group maps into one, suffixing names that clash.
 * @param {Map<string, Set<string>>[]} groupMaps
 * @returns {Map<string, Set<string>>}
 */
function mergeGroupMaps(groupMaps) {
    const merged = new Map();
    for (let groupMap of groupMaps) {
        for (let [name, proteinIds] of groupMap) {
            let key = name, n = 2;
            while (merged.has(key)) {
                key = name + " (" + n++ + ")";
            }
            merged.set(key, proteinIds);
        }
    }
    return merged;
}

/**
 * Turns (possibly overlapping) groups into a partition: groups are visited in order (most proteins first, or
 * most crosslinked protein pairs inside the group first), each takes the proteins not already assigned to an
 * earlier group, and groups left with fewer than MIN_GROUP_SIZE proteins are dropped.
 * Every protein ends up in at most one group, so all groups can be collapsed.
 * @param {Map<string, Set<string>>} groupMap - Group name -> protein ids
 * @param {"size"|"links"} order - Visiting order
 * @param {Set<string>} [linkedPairs] - Needed for order "links" (from getLinkedProteinPairs)
 * @returns {Map<string, Set<string>>} Group name -> protein ids
 */
function partitionGroups(groupMap, order, linkedPairs) {
    const entries = Array.from(groupMap.entries()).map(function ([name, proteinIds]) {
        const score = order === "links" ? countIntraGroupLinks(proteinIds, linkedPairs) : proteinIds.size;
        return {name, proteinIds, score};
    });
    entries.sort((a, b) => (b.score - a.score) || (b.proteinIds.size - a.proteinIds.size));
    const assigned = new Set();
    const partition = new Map();
    for (let {name, proteinIds} of entries) {
        const remaining = new Set();
        for (let id of proteinIds) {
            if (!assigned.has(id)) {
                remaining.add(id);
            }
        }
        if (remaining.size >= MIN_GROUP_SIZE) {
            partition.set(name, remaining);
            for (let id of remaining) {
                assigned.add(id);
            }
        }
    }
    return partition;
}

/**
 * Auto grouping strategies by name. Each takes (proteins, clmsModel) and returns (a promise of) a
 * group name -> protein ids map. The menu items use the first four (which may give overlapping groups);
 * the others are non-overlapping variants for collapsing very large networks (see xiNET deferFirstLayout).
 * @type {Object<string, function(Object[], SearchResultsModel): (Map<string, Set<string>>|Promise<Map<string, Set<string>>>)>}
 */
export const AUTO_GROUP_STRATEGIES = {
    goComplex: proteins => buildGoComplexGroups(proteins),
    location: proteins => buildLocationGroups(proteins),
    complexPortal: proteins => buildComplexGroups(proteins),
    locationAndComplex: proteins => buildLocationAndComplexGroups(proteins),
    // GO complex groups minus those partially overlapping a bigger one (nesting kept)
    goComplexLaminar: async proteins => keepNonOverlappingGroups(await buildGoComplexGroups(proteins)),
    // laminar (disjoint or nested) subset of the union of location, Complex Portal and GO complex groups
    laminarAll: async proteins => keepNonOverlappingGroups(await buildAllGroups(proteins)),
    // bottom up: Complex Portal and GO complexes (smallest first), then locations nested around them
    complexesInLocations: (proteins, clmsModel) => buildComplexesInLocationsGroups(proteins, clmsModel),
    // partitions of the union of location, Complex Portal and GO complex groups
    partitionAllBySize: async proteins => partitionGroups(await buildAllGroups(proteins), "size"),
    partitionAllByLinks: async (proteins, clmsModel) =>
        partitionGroups(await buildAllGroups(proteins), "links", getLinkedProteinPairs(clmsModel)),
    // partitions of the union of Complex Portal and GO complex groups (no locations)
    partitionComplexesBySize: async proteins => partitionGroups(await buildAllComplexGroups(proteins), "size"),
    partitionComplexesByLinks: async (proteins, clmsModel) =>
        partitionGroups(await buildAllComplexGroups(proteins), "links", getLinkedProteinPairs(clmsModel)),
};

async function buildAllComplexGroups(proteins) {
    return mergeGroupMaps([buildComplexGroups(proteins), await buildGoComplexGroups(proteins)]);
}

async function buildAllGroups(proteins) {
    return mergeGroupMaps([buildLocationGroups(proteins), await buildAllComplexGroups(proteins)]);
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
     * Non-interactive auto grouping by a named strategy (see AUTO_GROUP_STRATEGIES), used by xiNET to shrink
     * very large networks before their first layout (and by benchmarks). Doesn't change the model's groups or
     * ask the user anything - the caller applies the result.
     * @param {string} strategy - Key of AUTO_GROUP_STRATEGIES
     * @returns {Promise<Map<string, Set<string>>>} Group name -> protein ids (empty if none found)
     * @throws {Error} If building the groups fails (e.g. QuickGO request fails)
     */
    async buildAutoGroupsByStrategy(strategy) {
        const clmsModel = this.get("clmsModel");
        return AUTO_GROUP_STRATEGIES[strategy](Array.from(clmsModel.getProteinsIterator()), clmsModel);
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

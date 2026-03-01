/**
 * @fileoverview Gene Ontology (GO) term class for xiVIEW.
 * Represents a single GO term with hierarchical relationships (is_a, part_of) and associated proteins.
 * Provides methods to traverse GO term hierarchy and collect interactors from subtrees.
 */

/**
 * Gene Ontology term with hierarchical relationships and protein associations.
 * Relationships are lazily instantiated Sets: is_a (superclasses), subclasses, part_of, parts.
 * The interactors Set contains protein objects associated with this term.
 * @class
 * @property {string} id - GO term ID (e.g., "GO:0005737")
 * @property {string} name - Human-readable GO term name
 * @property {Set<string>} [is_a] - Set of parent GO term IDs (superclasses)
 * @property {Set<string>} [subclasses] - Set of child GO term IDs
 * @property {Set<string>} [part_of] - Set of GO term IDs this term is part of
 * @property {Set<string>} [parts] - Set of GO term IDs that are parts of this term
 * @property {Set<Object>} [interactors] - Set of protein objects with this GO annotation
 * @property {number} filtInteractorCount - Cached count of filtered interactors in subtree
 */
export class GoTerm {
    constructor() {
        // lazy instantiation instead
        //this.is_a = new Set(); // i.e. superclasses
        //this.subclasses = new Set();
        //this.part_of = new Set();
        //this.parts = new Set();
        //this.interactors = new Set();

        this.filtInteractorCount = 0;
    }

    // getInteractors (interactorSet) {
    //     var go = window.compositeModelInst.get("go");
    //     if (!interactorSet) {
    //         interactorSet = new Set();
    //     }
    //     if (this.parts) {
    //         for (let partId of this.parts) {
    //             go.get(partId).getInteractors(interactorSet);
    //         }
    //     }
    //     if (this.subclasses) {
    //         for (let subclassId of this.subclasses) {
    //             go.get(subclassId).getInteractors(interactorSet);
    //         }
    //     }
    //     if (this.interactors) {
    //         for (let i of this.interactors) {
    //             if (i.hidden == false) {
    //                 interactorSet.add(i);
    //             }
    //         }
    //     }
    //     return interactorSet;
    // }

    /**
     * Recursively collects all interactors (proteins) from this GO term and its subtree.
     * Traverses parts and subclasses hierarchies to collect all associated proteins.
     * Only includes proteins where hidden === false.
     * @param {boolean} [storeCount] - If true, stores result count in filtInteractorCount property
     * @returns {Set<Object>|null} Set of protein objects, or null if no interactors found
     */
    getInteractors(storeCount) {
        const go = this.go;
        // GoTerm.prototype.getCount++;

        let subTreeSet; // = new Set();

        if (this.parts || this.subclasses || this.interactors) {
            subTreeSet = new Set();

            if (this.parts) {
                for (let partId of this.parts) {
                    let sub = go.get(partId).getInteractors(storeCount);
                    if (sub) {
                        sub.forEach(subTreeSet.add, subTreeSet);
                    }
                }
            }
            if (this.subclasses) {
                for (let subclassId of this.subclasses) {
                    let sub = go.get(subclassId).getInteractors(storeCount);
                    if (sub) {
                        sub.forEach(subTreeSet.add, subTreeSet);
                    }
                }
            }

            if (this.interactors) {
                for (let i of this.interactors) {
                    if (i.hidden === false) {
                        subTreeSet.add(i);
                    }
                }
            }

            if (subTreeSet.size === 0) {
                subTreeSet = null;
            }
        }
        if (storeCount) {
            this.filtInteractorCount = subTreeSet ? subTreeSet.size : 0;
            //if (subTreeSet.size) { console.log ("sub", subTreeSet, this.id); }
        }

        return subTreeSet;
    }

    /**
     * Checks if another GO term is directly related to this term (one step away).
     * Direct relations include: same term, is_a, subclass, part_of, or parts relationship.
     * @param {GoTerm} anotherGoTerm - GO term to check for direct relationship
     * @returns {boolean} True if directly related (including self), false otherwise
     */
    isDirectRelation(anotherGoTerm) {
        const aGoId = anotherGoTerm.id;
        return (
            (this === anotherGoTerm) ||
            (this.is_a && this.is_a.has(aGoId)) ||
            (this.subclasses && this.subclasses.has(aGoId)) ||
            (this.part_of && this.part_of.has(aGoId)) ||
            (this.parts && this.parts.has(aGoId))
        );
    }

    /**
     * Recursively checks if this GO term is a descendant of another term.
     * Traverses up the hierarchy via part_of and is_a relationships.
     * Returns true if anotherGoTermId is found anywhere in ancestry chain (including self).
     * @param {string} anotherGoTermId - GO term ID to check for ancestry
     * @returns {boolean} True if this term descends from the specified term (or is the same term)
     */
    isDescendantOf(anotherGoTermId) {
        const go = this.go;
        if (anotherGoTermId === this.id) {
            return true;
        }
        if (this.part_of) {
            for (let part_ofId of this.part_of) {
                const partOf = go.get(part_ofId);
                if (partOf.isDescendantOf(anotherGoTermId)) {
                    return true;
                }
            }
        }
        if (this.is_a) {
            for (let superclassId of this.is_a) {
                const sup = go.get(superclassId);
                if (sup.isDescendantOf(anotherGoTermId)) {
                    return true;
                }
            }
        }
        return false;
    }
}

/*
GoTerm.prototype.getClosestVisibleParents = function(visibleParents) {
    if (!visibleParents) {
        visibleParents = new Set();
    }
    for (var parent of this.parents) {
        if (parent.isVisible()) {
            visibleParents.add(parent);
        } else {
            parent.getClosestVisibleParents(visibleParents);
        }
    }
    return visibleParents;
}

GoTerm.prototype.isVisible = function() {
    if (this.parents.length == 0) {
        return true;
    } else {
        for (let p of this.parents) {
            if (p.expanded) {
                return true;
            }
        }
    }
    return false;
}
*/

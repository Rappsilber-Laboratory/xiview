/**
 * @fileoverview Feature extraction utilities for protein sequence annotations.
 * Converts protease cleavage sites and crosslinkable residues into feature objects for visualization.
 * Features include position (begin/end), category, type, and identifiers for tracking.
 */
import * as d3 from "d3";

/**
 * Extracts protease-digestible residues as feature objects.
 * Searches protein sequence for residues matching enzyme specificity rules.
 * Applies post-constraint checks (e.g., "not followed by P" for trypsin).
 * Returns array of features with position, category "AA", type "DIGESTIBLE".
 * @param {Object} clmsModel - CLMS backbone-models with enzymeSpecificity array
 * @param {Object} protein - Protein object with sequence and id properties
 * @returns {Array<Object>} Array of digestible residue feature objects
 */
export function getDigestibleResiduesAsFeatures(clmsModel, protein) {
    const digestibleResiduesAsFeatures = [];

    const sequence = protein.sequence;
    const seqLength = sequence.length;
    const specificity = clmsModel.get("enzymeSpecificity");

    const specifCount = specificity.length;
    for (let i = 0; i < specifCount; i++) {
        const spec = specificity[i];
        for (let s = 0; s < seqLength; s++) {
            if (sequence[s] === spec.aa) {
                if (!spec.postConstraint || !sequence[s + 1] || spec.postConstraint.indexOf(sequence[s + 1]) === -1) {
                    digestibleResiduesAsFeatures.push({
                        begin: s + 1,
                        end: s + 1,
                        name: "DIGESTIBLE",
                        protID: protein.id,
                        id: protein.id + " " + spec.type + (s + 1),
                        category: "AA",
                        type: "DIGESTIBLE"
                    });
                }
            }
        }
    }
    //console.log("sp:", specificity, "df:", digestibleResiduesAsFeatures);
    return digestibleResiduesAsFeatures;
}

/**
 * Extracts crosslinkable residues as feature objects for specific reactive group.
 * Searches protein sequence for residues matching crosslinker specificity rules.
 * For heterobifunctional crosslinkers, reactiveGroup selects which reactive group (1 or 2).
 * Returns array of features with position, category "AA", type "CROSSLINKABLE-N".
 * @param {Object} clmsModel - CLMS backbone-models with crosslinkerSpecificity map
 * @param {Object} protein - Protein object with sequence and id properties
 * @param {number} reactiveGroup - Reactive group number (1 for first/only, 2 for second if heterobifunctional)
 * @returns {Array<Object>} Array of crosslinkable residue feature objects
 */
export function getCrosslinkableResiduesAsFeatures(clmsModel, protein, reactiveGroup) {
    const crosslinkableResiduesAsFeatures = [];

    const sequence = protein.sequence;
    const seqLength = sequence.length;
    const linkedResSets = clmsModel.get("crosslinkerSpecificity");

    const temp = d3.values(linkedResSets);
    for (let cl = 0; cl < temp.length; cl++) {
        // resSet = {searches: new Set(), linkables: [], name: crosslinkerName};
        const crosslinkerLinkedResSet = temp[cl];
        const linkables = crosslinkerLinkedResSet.linkables;

        //for (var l = 0 ; l < linkables.length; l++) {
        if (linkables[reactiveGroup - 1]) {
            const linkableSet = linkables[reactiveGroup - 1];
            const linkableArr = [];
            linkableSet.forEach(v => linkableArr.push(v));
            const specifCount = linkableArr.length;
            for (let i = 0; i < specifCount; i++) {
                const spec = linkableArr[i];
                for (let s = 0; s < seqLength; s++) {
                    if (sequence[s] === spec) {
                        crosslinkableResiduesAsFeatures.push({
                            begin: s + 1,
                            end: s + 1,
                            name: "CROSSLINKABLE-" + reactiveGroup,
                            protID: protein.id,
                            id: protein.id + " Crosslinkable residue" + (s + 1) + "[group " + reactiveGroup + "]",
                            category: "AA",
                            type: "CROSSLINKABLE-" + reactiveGroup
                        });
                    }
                }
            }
        }
    }

    return crosslinkableResiduesAsFeatures;
}

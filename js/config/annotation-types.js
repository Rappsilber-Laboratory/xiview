import {ANNOTATION_COLORS} from "./color-constants";
import {AnnotationType} from "../model/annotation-model-collection";

// Default annotation type configurations
export const DEFAULT_ANNOTATION_TYPE_CONFIGS = [
    {
        category: "AA",
        type: "Digestible",
        tooltip: "Mark Digestible Residues",
        source: "Search",
        colour: ANNOTATION_COLORS.DIGESTIBLE,
    },
    {
        category: "AA",
        type: "Crosslinkable-1",
        tooltip: "Mark CrossLinkable residues (first or only reactive group)",
        source: "Search",
        colour: ANNOTATION_COLORS.NOT_DIGESTIBLE,
    },
    {
        category: "AA",
        type: "Cross-linkable-2",
        tooltip: "Mark CrossLinkable residues (second reactive group if heterobifunctional cross-linker)",
        source: "Search",
        colour: ANNOTATION_COLORS.NOT_DIGESTIBLE,
    },
    {
        category: "Alignment",
        type: "PDB aligned region",
        tooltip: "Show regions that align to currently loaded PDB Data",
        source: "PDB",
        colour: ANNOTATION_COLORS.LINKER_MODIFIED,
    }
];

/**
 * Create default annotation type instances
 * @returns {Array<AnnotationType>} Array of AnnotationType instances
 */
export function createDefaultAnnotationTypes() {
    return DEFAULT_ANNOTATION_TYPE_CONFIGS.map(config => new AnnotationType(config));
}

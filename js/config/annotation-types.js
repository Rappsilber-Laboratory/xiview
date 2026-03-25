/**
 * @fileoverview Default annotation type configurations for xiVIEW.
 * Defines standard annotation types for marking digestible residues, crosslinkable residues, and PDB-aligned regions.
 * Provides factory function to create AnnotationType instances from configurations.
 */
import {ANNOTATION_COLORS} from "./color-constants";
import {AnnotationType} from "../backbone-models/annotation-model-collection";

/**
 * Default annotation type configurations.
 * Defines four standard annotation types: Digestible, Crosslinkable-1 (first/only reactive group),
 * Cross-linkable-2 (second reactive group for heterobifunctional crosslinkers), and PDB aligned regions.
 * @constant {Array<Object>}
 * @property {string} category - Annotation category ("AA" for amino acid, "Alignment" for structure)
 * @property {string} type - Annotation type identifier
 * @property {string} tooltip - User-facing description
 * @property {string} source - Data source ("Search" or "PDB")
 * @property {string} colour - Hex color code from ANNOTATION_COLORS
 */
export const DEFAULT_ANNOTATION_TYPE_CONFIGS = [
    {
        category: "Amino Acids",
        type: "Digestible",
        tooltip: "Mark enzyme digestible residues",
        // source: "Search",
        colour: ANNOTATION_COLORS.DIGESTIBLE,
    },
    // {
    //     category: "AA",
    //     type: "Crosslinkable-1",
    //     tooltip: "Mark CrossLinkable residues (first or only reactive group)",
    //     source: "Search",
    //     colour: ANNOTATION_COLORS.NOT_DIGESTIBLE,
    // },
    // {
    //     category: "AA",
    //     type: "Cross-linkable-2",
    //     tooltip: "Mark CrossLinkable residues (second reactive group if heterobifunctional cross-linker)",
    //     source: "Search",
    //     colour: ANNOTATION_COLORS.NOT_DIGESTIBLE,
    // },
    {
        category: "3D Alignment",
        type: "3D model aligned region",
        tooltip: "Show regions that align to currently loaded 3D model",
        // source: "PDB",
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

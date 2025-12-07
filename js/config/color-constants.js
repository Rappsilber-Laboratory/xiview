/**
 * @fileoverview Color constants for annotation types in xiVIEW.
 * Defines hex color codes for protein sequence annotations: digestibility, linker modifications, and crosslinkable residues.
 */

/**
 * Color scheme for protein sequence annotations.
 * Used to visually distinguish different residue properties in alignment and protein views.
 * @constant {Object}
 * @property {string} DIGESTIBLE - Blue (#1f78b4) for peptides digestible by protease
 * @property {string} NOT_DIGESTIBLE - Light blue (#a6cee3) for non-digestible regions
 * @property {string} LINKER_MODIFIED - Light green (#b2df8a) for residues with linker modifications
 * @property {string} CROSSLINKABLE - Dark green (#33a02c) for residues that can form crosslinks (typically lysines)
 */
export const ANNOTATION_COLORS = {
    DIGESTIBLE: "#1f78b4",
    NOT_DIGESTIBLE: "#a6cee3",
    LINKER_MODIFIED: "#b2df8a",
    CROSSLINKABLE: "#33a02c"
};

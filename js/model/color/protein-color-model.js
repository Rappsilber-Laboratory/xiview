/**
 * @fileoverview Protein-specific color model classes.
 * Provides DefaultProteinColourModel (single color for all proteins) and ManualColourModel
 * (user-assignable colors per protein). Used by protein coloring dropdown in xiVIEW.
 */
import {ColourModel} from "./color-model";

/**
 * Default protein color model - assigns single color to all proteins.
 * Simple ordinal color model with one category ("Protein") and one color.
 * Used as fallback protein color scheme when no specific coloring is needed.
 * @class
 * @extends ColourModel
 */
export class DefaultProteinColourModel extends ColourModel {
    /**
     * Initializes the default protein color model.
     * Sets labels to single "Protein" category and type to "ordinal".
     * @returns {undefined}
     */
    initialize() {
        this
            .set("labels", this.get("colScale").copy().range(["Protein"]))
            .set("type", "ordinal");
    }

    /**
     * Returns the value for color assignment (always 0 for single-color scheme).
     * All proteins get the same value, so all map to the single color.
     * @param {Object} obj - Protein/interactor object (unused)
     * @returns {number} Always returns 0
     */
    getValue() {
        return 0;
    }
}

/**
 * Manual protein color model - allows per-protein color assignment.
 * Maintains a Map of protein IDs to user-selected colors. Used when users manually
 * assign specific colors to individual proteins via color picker controls.
 * Returns white (#FFFFFF) for proteins without manual assignments.
 * @class
 * @extends ColourModel
 * @property {Map<string, string>} colourAssignment - Map of protein IDs to hex color strings
 */
export class ManualColourModel extends ColourModel {

    /**
     * Initializes the manual color model with empty assignment map.
     * @returns {undefined}
     */
    initialize() {
        this.colourAssignment = new Map();
    }

    /**
     * Sets the entire color assignment map from an object.
     * Clears existing assignments and populates map from object entries.
     * @param {Object} obj - Object with protein IDs as keys and hex colors as values
     * @returns {undefined}
     */
    setMap(obj) {
        this.colourAssignment.clear();
        for (let [key, value] of Object.entries(obj)) {
            this.colourAssignment.set(key, value);
        }
    }

    /**
     * Returns the assigned color for a protein/interactor.
     * @param {Object} obj - Protein/interactor object with id property
     * @param {string} obj.id - Unique protein/interactor identifier
     * @returns {string} Hex color string (assigned color or "#FFFFFF" if no assignment)
     */
    getColour(obj) {
        // console.log(obj.id, this.colourAssignment.get(obj.id));
        if (this.colourAssignment.has(obj.id)) {
            return this.colourAssignment.get(obj.id);
        } else {
            return "#FFFFFF";
        }
    }

    /**
     * Sets the color for a specific protein/interactor.
     * @param {string} interactorId - Unique protein/interactor identifier
     * @param {string} colour - Hex color string (e.g., "#FF0000")
     * @returns {undefined}
     */
    setInteractorColour(interactorId, colour) {
        this.colourAssignment.set(interactorId, colour);
    }

    /**
     * Checks if a protein/interactor has a manual color assignment.
     * @param {string} interactorId - Unique protein/interactor identifier
     * @returns {boolean} True if protein has manual assignment, false otherwise
     */
    hasManualAssignment(interactorId) {
        return this.colourAssignment.has(interactorId);
    }

    /**
     * Removes the manual color assignment for a protein/interactor.
     * @param {string} interactorId - Unique protein/interactor identifier
     * @returns {undefined}
     */
    removeManualAssignment(interactorId) {
        this.colourAssignment.delete(interactorId);
    }

    /**
     * Returns all manual color assignments as label-color pairs.
     * Used by utils.updateColourKey and keyViewBB.render to display color legend.
     * @returns {Array<[string, string]>} Array of [proteinId, hexColor] pairs
     */
    getLabelColourPairings() {
        return Array.from(this.colourAssignment.entries());
    }
}

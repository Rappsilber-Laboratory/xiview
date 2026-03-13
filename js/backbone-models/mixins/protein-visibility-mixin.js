/**
 * @fileoverview Mixin for protein selection and visibility operations on CompositeModel.
 * Mixed into CompositeModel.prototype via Object.assign so `this` is always the CompositeModel instance.
 */

import d3 from "d3";

export const ProteinVisibilityMixin = {
    /**
     * Sets highlighted proteins, optionally adding to existing highlights.
     * Removes duplicates before setting.
     * @param {Array} pArr - Array of protein objects to highlight
     * @param {boolean} add - If true, add to existing highlights; if false, replace
     */
    setHighlightedProteins(pArr, add) {
        let toHighlight = add ? pArr.concat(this.get("highlightedProteins")) : pArr;
        toHighlight = d3.map(toHighlight, function (d) {
            return d.id;
        }).values();
        this.set("highlightedProteins", toHighlight);
    },

    /**
     * Sets selected proteins, optionally toggling with existing selection.
     * For toggle mode (add=true), proteins already selected are removed.
     * @param {Array} pArr - Array of protein objects to select
     * @param {boolean} add - If true, toggle proteins in selection; if false, replace
     */
    setSelectedProteins(pArr, add) {
        let toSelect;
        if (!add) {
            toSelect = [...new Set(pArr)];
        } else {
            const alreadySelected = this.get("selectedProteins");
            toSelect = [];
            for (let a = 0; a < alreadySelected.length; a++) {
                if (pArr.indexOf(alreadySelected[a]) == -1) {
                    toSelect.push(alreadySelected[a]);
                }
            }
            for (let p = 0; p < pArr.length; p++) {
                const protein = pArr[p];
                if (alreadySelected.indexOf(protein) == -1) {
                    toSelect.push(protein);
                }
            }
        }
        this.set("selectedProteins", toSelect);
    },

    /**
     * Hides currently selected proteins and clears the selection.
     * Triggers filter backbone-models change to reapply filtering.
     */
    hideSelectedProteins() {
        const selectedArr = this.get("selectedProteins");
        const selectedCount = selectedArr.length;
        for (let s = 0; s < selectedCount; s++) {
            const protein = selectedArr[s];
            protein.manuallyHidden = true;
        }
        this.setSelectedProteins([]);
        this.get("filterModel").trigger("change", this.get("filterModel"));
    },

    /**
     * Hides all proteins except currently selected ones.
     * Triggers filter backbone-models change to reapply filtering.
     */
    hideUnselectedProteins() {
        const selected = this.get("selectedProteins");
        for (let protein of this.get("clmsModel").getProteinsIterator()) {
            if (selected.indexOf(protein) == -1) {
                protein.manuallyHidden = true;
            }
        }
        this.get("filterModel").trigger("change", this.get("filterModel"));
    },

    /**
     * Shows all manually hidden proteins.
     * Triggers filter backbone-models change to reapply filtering.
     */
    showHiddenProteins() {
        for (let protein of this.get("clmsModel").getProteinsIterator()) {
            protein.manuallyHidden = false;
        }
        this.get("filterModel").trigger("change");
    },

    /**
     * Expands selection to include all proteins connected to currently selected proteins.
     * Follows crosslinks and adds non-decoy interaction partners.
     */
    stepOutSelectedProteins() {
        const selectedArr = this.get("selectedProteins");
        const selectedCount = selectedArr.length;
        const toSelect = new Set();
        for (let s = 0; s < selectedCount; s++) {
            const protein = selectedArr[s];
            const crosslinks = protein.crosslinks;
            const clCount = crosslinks.length;
            for (let cl = 0; cl < clCount; cl++) {
                const crosslink = crosslinks[cl];
                const fromProtein = crosslink.fromProtein;
                if (fromProtein.is_decoy != true) {
                    fromProtein.manuallyHidden = false;
                    toSelect.add(fromProtein);
                }
                if (crosslink.toProtein && crosslink.toProtein.is_decoy != true) {
                    const toProtein = crosslink.toProtein;
                    toProtein.manuallyHidden = false;
                    toSelect.add(toProtein);
                }
            }
        }

        this.get("filterModel").trigger("change");
        this.setSelectedProteins(Array.from(toSelect));
    },

    /**
     * Filters protein selection based on text input from #proteinSelectionFilter element.
     * Searches protein names and descriptions (case-insensitive).
     * NOTE: reads d3.select("#proteinSelectionFilter") directly — DOM coupling by design.
     */
    proteinSelectionTextFilter() {
        const filterText = d3.select("#proteinSelectionFilter").property("value").trim().toLowerCase();
        const proteinsArr = Array.from(this.get("clmsModel").getProteinsIterator());

        const toSelect = proteinsArr.filter(function (p) {
            if (p.description) {
                return (p.name.toLowerCase().indexOf(filterText) != -1 || p.description.toLowerCase().indexOf(filterText) != -1);
            }
            return p.name.toLowerCase().indexOf(filterText) != -1;
        });
        this.setSelectedProteins(toSelect);
    },
};

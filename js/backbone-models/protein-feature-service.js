/**
 * @fileoverview Delegate class for retrieving and filtering protein features.
 * Pure computation; fires no Backbone events.
 */

import d3 from "d3";
import {xilog} from "../utils";
import {mergeContiguousFeatures} from "../modelUtils";
import {getCrosslinkableResiduesAsFeatures, getDigestibleResiduesAsFeatures} from "./get-as-features";

/**
 * Retrieves and filters features for proteins.
 * CompositeModel creates one instance, passing references that may update over time.
 */
export class ProteinFeatureService {
    /**
     * @param {Object} opts
     * @param {Object} opts.clmsModel - Core CLMS data backbone-models
     * @param {Object} opts.alignColl - Protein alignment collection
     * @param {Object} opts.annotationTypes - Backbone collection of annotation type clms-backbone-models
     */
    constructor({ clmsModel, alignColl, annotationTypes }) {
        this.clmsModel = clmsModel;
        this.alignColl = alignColl;
        this.annotationTypes = annotationTypes;
    }

    update({ clmsModel, alignColl, annotationTypes }) {
        if (clmsModel !== undefined) this.clmsModel = clmsModel;
        if (alignColl !== undefined) this.alignColl = alignColl;
        if (annotationTypes !== undefined) this.annotationTypes = annotationTypes;
    }

    /**
     * Retrieves all features for a protein.
     * Merges UniProt features, alignment features, and user annotations.
     * @param {Object} protein - Protein object
     * @returns {Array} Array of feature objects
     */
    getProteinFeatures(protein) {
        const featuresArray = [
            protein.uniprot ? protein.uniprot.features : [],
            this.alignColl.getAlignmentsAsFeatures(protein.id),
            protein.userAnnotations || [],
        ];
        return d3.merge(featuresArray.filter(function (arr) {
            return arr !== undefined;
        }));
    }

    /**
     * Retrieves features for a protein filtered by active annotation types.
     * Optionally includes dynamically generated features (Digestible, Crosslinkable-1, Crosslinkable-2).
     * @param {Object} protein - Protein object
     * @returns {Array} Array of filtered feature objects
     */
    getFilteredFeatures(protein) {
        let features = this.getProteinFeatures(protein);

        const annots = this.annotationTypes.where({ shown: true });
        const featureFilterSet = d3.set(annots.map(function (annot) {
            return annot.get("type");
        }));
        featureFilterSet.values().forEach(function (value) {
            featureFilterSet.add(value.toUpperCase());
        });

        const clmsModel = this.clmsModel;
        if (featureFilterSet.has("Digestible")) {
            const digestFeatures = getDigestibleResiduesAsFeatures(clmsModel, protein);
            const mergedFeatures = mergeContiguousFeatures(digestFeatures);
            features = d3.merge([mergedFeatures, features]);
        }

        if (featureFilterSet.has("Crosslinkable-1")) {
            const crosslinkableFeatures = getCrosslinkableResiduesAsFeatures(clmsModel, protein, 1);
            const mergedFeatures = mergeContiguousFeatures(crosslinkableFeatures);
            features = d3.merge([mergedFeatures, features]);
        }

        if (featureFilterSet.has("Crosslinkable-2")) {
            const crosslinkableFeatures = getCrosslinkableResiduesAsFeatures(clmsModel, protein, 2);
            const mergedFeatures = mergeContiguousFeatures(crosslinkableFeatures);
            features = d3.merge([mergedFeatures, features]);
        }

        xilog("annots", annots, "f", features);
        return features ? features.filter(function (f) {
            return featureFilterSet.has(f.type);
        }) : [];
    }

    /**
     * Calculates the value range (extent) for a crosslink attribute across all crosslinks.
     * @param {Object} attrMetaData - Attribute metadata object containing unfilteredLinkFunc
     * @param {Array} allCrossLinks - Array of all crosslinks
     * @returns {Array} Two-element array [min, max]
     */
    getAttributeRange(attrMetaData, allCrossLinks) {
        const func = attrMetaData.unfilteredLinkFunc;
        const vals = allCrossLinks.map(function (link) {
            let attrVals = func(link);
            if (attrVals.length > 1) {
                attrVals = d3.extent(attrVals);
            }
            return attrVals;
        });
        return d3.extent(d3.merge(vals));
    }
}

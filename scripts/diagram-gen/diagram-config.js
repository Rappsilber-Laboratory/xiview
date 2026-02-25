/**
 * Configuration for CLMS-model diagram generation
 * This file defines what to include/exclude and how to layout the diagram
 */

module.exports = {
    // Source and output paths
    sourceDir: "./CLMS-model/src",
    outputFile: "./CLMS-model/clms-model-diagram.dia",

    // Which classes to include
    classes: {
        include: ["*"], // "*" means all classes, or specify: ["SearchResultsModel", "Protein", ...]
        exclude: [], // Classes to skip
    },

    // Property filtering options
    properties: {
        includePrivate: false,          // Include properties starting with _
        includeGetters: true,           // Include getters as properties (recommended: true)
                                        // When true: getters appear in properties section as "propName: type"
                                        // When false: getters can appear in methods section (if methods.includeGetters is true)
        excludePatterns: [],            // Regex patterns to exclude (e.g., [/^temp/, /debug/])
        maxProperties: null,            // Limit number of properties per class (null = no limit)
    },

    // Method filtering options
    methods: {
        includePrivate: false,          // Include methods starting with _
        includeGetters: false,          // Include getter methods as operations (only relevant if properties.includeGetters is false)
                                        // Recommended: false (let properties.includeGetters handle getters instead)
        includeSetters: false,          // Include setter methods (set propName())
        excludePatterns: [],            // Regex patterns to exclude
        maxMethods: 15,                 // Limit number of methods per class
    },

    // Relationship detection options
    relationships: {
        enabled: false,                 // Master switch for relationship detection
        detectComposition: true,        // Detect composition from property assignments
        detectInheritance: true,        // Detect extends relationships

        // Visual options
        showMultiplicity: false,        // Show multiplicity labels (1, *, 0..1)
        showRoleNames: false,           // Show role names on relationships
        autoRoute: true,                // Use automatic orthogonal routing
    },

    // Layout and visual customization
    layout: {
        // Class dimensions
        defaultWidth: 12,
        defaultHeight: 11,
        spacing: 2,                     // Space between classes

        // Positioning strategy: "manual", "grid", "hierarchical"
        strategy: "manual",

        // Manual positions for specific classes (when strategy = "manual")
        positions: {
            "SearchResultsModel": { x: 10, y: 2, width: 18, height: 18 },
            "Protein": { x: 2, y: 22, width: 9, height: 11 },
            "Crosslink": { x: 13, y: 22, width: 9, height: 11 },
            "Peptide": { x: 24, y: 22, width: 9, height: 11 },
            "SpectrumMatch": { x: 35, y: 22, width: 12, height: 11 },
            "MzidentmlFile": { x: 2, y: 35, width: 11, height: 7 },
            "AnalysisCollectionSpectrumIdentification": { x: 15, y: 35, width: 15, height: 7 },
            "SpectrumIdentificationProtocol": { x: 32, y: 35, width: 14, height: 7 },
            "SpectraData": { x: 48, y: 35, width: 12, height: 7 },
            "Enzyme": { x: 10, y: 44, width: 12, height: 7 },
            "SearchModification": { x: 24, y: 44, width: 14, height: 7 },
        },

        // Color scheme for different class types
        colors: {
            root: "#e8f4f8",            // Root container classes (blue)
            core: "#ffffcc",            // Core data classes (yellow)
            metadata: "#e8e8ff",        // Metadata classes (purple)
            config: "#ffe8e8",          // Configuration classes (pink)
            default: "#ffffff",         // Default color
        },

        // Class type mapping (for coloring)
        classTypes: {
            "SearchResultsModel": "root",
            "Protein": "core",
            "Crosslink": "core",
            "Peptide": "core",
            "SpectrumMatch": "core",
            "MzidentmlFile": "metadata",
            "AnalysisCollectionSpectrumIdentification": "metadata",
            "SpectrumIdentificationProtocol": "metadata",
            "SpectraData": "metadata",
            "Enzyme": "config",
            "SearchModification": "config",
        },

        // Font settings
        fonts: {
            normalHeight: 0.6,
            polymorphicHeight: 0.6,
            abstractHeight: 0.6,
            classnameHeight: 1.0,
            abstractClassnameHeight: 1.0,
            commentHeight: 0.7,
        },
    },
};

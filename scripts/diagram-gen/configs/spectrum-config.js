/**
 * Configuration for spectrum viewer diagram generation
 * This file defines what to include/exclude and how to layout the spectrum diagram
 */

module.exports = {
    // Source and output paths
    sourceDir: "./spectrum/src",
    outputFile: "./spectrum/spectrum-diagram.dia",

    // Which classes to include
    classes: {
        include: ["*"], // "*" means all classes
        exclude: [], // Classes to skip
    },

    // Property filtering options
    properties: {
        includePrivate: false,          // Include properties starting with _
        includeGetters: true,           // Include getters as properties (recommended: true)
        excludePatterns: [],            // Regex patterns to exclude
        maxProperties: null,            // Limit number of properties per class (null = no limit)
    },

    // Method filtering options
    methods: {
        includePrivate: false,          // Include methods starting with _
        includeGetters: false,          // Include getter methods as operations
        includeSetters: false,          // Include setter methods
        excludePatterns: [],            // Regex patterns to exclude
        maxMethods: 15,                 // Limit number of methods per class
    },

    // Relationship detection options
    relationships: {
        enabled: false,                 // Master switch for relationship detection
        detectComposition: true,        // Detect composition from property assignments
        detectInheritance: true,        // Detect extends relationships

        // Visual options
        showMultiplicity: false,        // Show multiplicity labels
        showRoleNames: false,           // Show role names on relationships
        autoRoute: true,                // Use automatic orthogonal routing
    },

    // Layout and visual customization
    layout: {
        // Class dimensions
        defaultWidth: 12,
        defaultHeight: 11,
        spacing: 2,

        // Positioning strategy
        strategy: "manual",

        // Manual positions for specific classes
        positions: {
            // Add specific class positions here as needed
        },

        // Color scheme
        colors: {
            view: "#ffccff",            // Pink for spectrum views
            model: "#e8f4f8",           // Blue for models
            default: "#ffffff",
        },

        // Class type mapping
        classTypes: {
            // Add class type mappings here as needed
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

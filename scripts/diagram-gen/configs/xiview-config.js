/**
 * Configuration for xiview diagram generation
 * This file defines what to include/exclude and how to layout the xiview views diagram
 */

module.exports = {
    // Source and output paths
    sourceDir: "./xiview/js/",
    outputFile: "./xiview/new-xiview-diagram.dia",

    // Which classes to include
    classes: {
        include: ["*"], // "*" means all classes
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
        enabled: true,                 // Master switch for relationship detection
        detectComposition: false,        // Detect composition from property assignments
        detectInheritance: true,        // Detect extends relationships

        // Visual options
        showMultiplicity: false,        // Show multiplicity labels (1, *, 0..1)
        showRoleNames: false,           // Show role names on relationships
        autoRoute: false,                // Use automatic orthogonal routing
    },

    // Layout and visual customization
    layout: {
        // Class dimensions
        defaultWidth: 12,
        defaultHeight: 11,
        spacing: 2,                     // Space between classes

        // Grid layout for auto-positioning
        columns: 10,                    // Number of columns in grid layout
        horizontalSpacing: 20,          // Horizontal spacing between classes
        verticalSpacing: 15,            // Vertical spacing between classes

        // Positioning strategy: "manual"
        strategy: "manual",

        // Manual positions for specific classes (adjust as needed)
        positions: {
            // Add specific class positions here as needed
            // Example: "ClassName": { x: 10, y: 2, width: 18, height: 18 },
        },

        // Color scheme for different class types
        colors: {
            view: "#ffffcc",            // Yellow for view classes
            model: "#e8f4f8",           // Blue for model classes
            default: "#ffffff",         // Default color
        },

        // Class type mapping (for coloring)
        classTypes: {
            // Add class type mappings here as needed
            // Example: "ClassName": "view",
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

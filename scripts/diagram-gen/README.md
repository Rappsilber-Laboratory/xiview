# Diagram Generation Tool

Automatically generate UML class diagrams in `.dia` format from JavaScript source files.

## Overview

This tool analyzes JavaScript classes using Babel parser and generates Dia diagram files that can be opened and edited in the [Dia diagram editor](http://dia-installer.de/).

## Features

- **Automatic class discovery**: Scans directory and finds all ES6 classes
- **Property extraction**: Extracts properties from constructors and class fields
- **Method extraction**: Extracts all methods including getters/setters
- **Configurable filtering**: Control what properties/methods to include
- **Type inference**: Infers types from initialization values
- **Custom layouts**: Configure positioning, colors, and sizes
- **Visibility detection**: Automatically detects public/private members (underscore prefix)

## Usage

### Generate Diagrams by Submodule

Generate diagrams for specific submodules:

```bash
# Generate CLMS-model diagram
npm run diagram:clms

# Generate xiview views diagram
npm run diagram:xiview

# Generate crosslink-viewer diagram
npm run diagram:crosslink

# Generate spectrum viewer diagram
npm run diagram:spectrum

# Generate ALL diagrams at once
npm run diagram:all
```

Each command uses a dedicated configuration file in `configs/` for that submodule.

### Command-Line Arguments

Override configuration settings with command-line arguments:

```bash
# Use custom source directory
npm run diagram:clms -- --source ./custom/path

# Use custom output file
npm run diagram:xiview -- --output ./my-diagram.dia

# Use both custom source and output
node scripts/diagram-gen/generate-diagram.js --source ./mycode --output ./my-diagram.dia

# Use custom config file
node scripts/diagram-gen/generate-diagram.js --config ./my-custom-config.js
```

### Available Options

- `--config <path>` - Path to configuration file
- `--source <path>` - Override source directory from config
- `--output <path>` - Override output file path from config

## Configuration

Configuration files are located in `scripts/diagram-gen/configs/`:

- `clms-model-config.js` - CLMS-model diagram configuration
- `xiview-config.js` - xiview views diagram configuration
- `crosslink-viewer-config.js` - crosslink-viewer diagram configuration
- `spectrum-config.js` - spectrum viewer diagram configuration

Edit these files to customize diagram generation for each submodule:

### Source and Output

```javascript
sourceDir: "./CLMS-model/src",     // Directory to analyze
outputFile: "./CLMS-model/clms-model-diagram.dia",  // Output file path
```

### Class Filtering

```javascript
classes: {
    include: ["*"],                 // Include all classes, or specify: ["Class1", "Class2"]
    exclude: ["TestClass"],         // Classes to skip
}
```

### Property Filtering

```javascript
properties: {
    includePrivate: true,           // Include properties starting with _
    includeGetters: false,          // Include getter properties
    excludePatterns: [/^temp/],     // Regex patterns to exclude
    maxProperties: null,            // Limit properties per class (null = no limit)
}
```

### Method Filtering

```javascript
methods: {
    includePrivate: false,          // Include methods starting with _
    includeGetters: false,          // Include getter methods
    includeSetters: false,          // Include setter methods
    excludePatterns: [],            // Regex patterns to exclude
    maxMethods: 15,                 // Limit methods per class
}
```

### Layout Customization

```javascript
layout: {
    defaultWidth: 12,               // Default class box width
    defaultHeight: 11,              // Default class box height
    spacing: 2,                     // Space between classes

    // Manual positions for specific classes
    positions: {
        "ClassName": { x: 10, y: 2, width: 18, height: 18 },
    },

    // Color scheme
    colors: {
        root: "#e8f4f8",            // Blue for root classes
        core: "#ffffcc",            // Yellow for core classes
        metadata: "#e8e8ff",        // Purple for metadata classes
        config: "#ffe8e8",          // Pink for config classes
    },

    // Class type mapping (for coloring)
    classTypes: {
        "ClassName": "root",        // Maps class to color type
    },

    // Font settings
    fonts: {
        normalHeight: 0.6,
        classnameHeight: 1.0,
    },
}
```

## Architecture

### Components

1. **generate-diagram.js** - Main executable script
   - Orchestrates the analysis and generation process
   - Handles error reporting and logging
   - Exit codes: 0 = success, 1 = failure

2. **js-analyzer.js** - JavaScript class analyzer
   - Uses @babel/parser to parse JavaScript files
   - Extracts class names, properties, and methods
   - Applies filtering based on configuration

3. **dia-generator.js** - Dia XML generator
   - Generates valid .dia format XML
   - Applies layout configuration
   - Handles positioning and styling

4. **diagram-config.js** - Configuration file
   - Defines what to include/exclude
   - Controls layout and appearance
   - Currently configured for CLMS-model

### Workflow

```
1. Load configuration
   ↓
2. Analyze JavaScript files (js-analyzer)
   - Parse with Babel
   - Extract class metadata
   - Apply filters
   ↓
3. Generate Dia XML (dia-generator)
   - Create XML structure
   - Apply layout configuration
   ↓
4. Write output file
```

## Extending for Other Directories

Currently configured for CLMS-model. To use with other directories:

1. **Create a new config file**:
   ```javascript
   // xiview-config.js
   module.exports = {
       sourceDir: "./xiview/js/views",
       outputFile: "./xiview/xiview-diagram.dia",
       // ... other settings
   };
   ```

2. **Run with custom config**:
   ```bash
   node scripts/diagram-gen/generate-diagram.js --config xiview-config.js
   ```

3. **Future enhancement**: Add command-line arguments for source/output paths

## Dependencies

- **@babel/parser** - JavaScript parser for AST generation
- **xmlbuilder2** - XML generation library

## Output Format

Generates `.dia` XML files compatible with Dia diagram editor. The output can be:
- Opened and edited in Dia
- Version controlled (text-based XML)
- Converted to images using Dia command-line tools

## Troubleshooting

### No classes found
- Check that `sourceDir` points to correct directory
- Ensure files use ES6 class syntax
- Check `include`/`exclude` patterns in config

### Invalid XML output
- Verify config file is valid JavaScript
- Check for special characters in class/property names
- Ensure positions don't have negative coordinates

### Parser errors
- Ensure source files are valid JavaScript
- Check for unsupported syntax features
- Review console output for specific file errors

## Future Enhancements

- [ ] Automatic relationship detection (composition, association)
- [ ] Command-line arguments for source/output paths
- [ ] JSDoc comment extraction for documentation

## Examples

### Minimal Example

```javascript
// minimal-config.js
module.exports = {
    sourceDir: "./src",
    outputFile: "./diagram.dia",
    classes: { include: ["*"], exclude: [] },
    properties: { includePrivate: true },
    methods: { maxMethods: 10 },
    layout: { defaultWidth: 12, defaultHeight: 10 },
};
```

### Focus on Public API Only

```javascript
properties: {
    includePrivate: false,          // Hide private properties
    excludePatterns: [/^_/],        // Exclude underscore prefix
},
methods: {
    includePrivate: false,          // Hide private methods
    includeGetters: false,          // Hide getters
    includeSetters: false,          // Hide setters
}
```

## License

Part of the xiVIEW project. See main repository for license information.

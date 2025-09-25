# CLAUDE.md - CLMS-model

This file provides guidance to Claude Code when working with the CLMS-model submodule within the build-xiview project.

## Component Overview

CLMS-model is the core data model library for cross-linking mass spectrometry (CLMS) data. It provides the fundamental data structures, validation, and business logic that power the entire xiVIEW application ecosystem.

## Role in build-xiview Project

CLMS-model serves as the **foundational data layer** for the entire xiVIEW system:

- **Core Models**: Defines essential data structures (CrossLink, Peptide, SearchResultsModel, etc.)
- **Data Validation**: Ensures data integrity across all components
- **Business Logic**: Implements CLMS-specific algorithms and calculations
- **Shared Foundation**: Used by xiview, spectrum, and crosslink-viewer components

## Architecture

### Key Source Files (`src/`)

- **`crosslink.js`**: CrossLink model - represents cross-linked peptide pairs
- **`peptide.js`**: Peptide model - individual peptide sequences and modifications
- **`search-results-model.js`**: Main container for search results and experiment data
- **`spectrum-match.js`**: SpectrumMatch model - links spectra to peptide identifications
- **`attribute-options.js`**: Configuration and attribute management
- **`enzyme.js`**: Protease enzyme definitions and specificity rules
- **`search-modification.js`**: Post-translational modification definitions
- **`spectra-data.js`**: Spectral data containers and management
- **`spectrum-identification-protocol.js`**: Search protocol metadata
- **`load-spectrum/`**: Utilities for loading and parsing spectrum data

### Core Data Models

1. **SearchResultsModel**: Top-level container for all experiment data
2. **CrossLink**: Represents cross-linked peptide pairs with positions and evidence
3. **Peptide**: Individual peptide sequences with modifications and proteins
4. **SpectrumMatch**: Links mass spectra to peptide identifications
5. **SpectraData**: Container for raw spectral data and metadata

### Technology Stack

- **Pure JavaScript**: No external dependencies for maximum compatibility
- **ES6+ Features**: Modern JavaScript with class definitions and modules
- **Modular Design**: Each model in separate file for maintainability
- **Event-Driven**: Uses event patterns for model change notifications

## Development Workflow

### Branch Information
- **Current branch**: `v2`
- **Development branch**: `v2`

### File Organization

When adding new models or extending existing ones:
- **New Models**: Create separate .js files in `src/` directory
- **Extensions**: Add methods to existing model classes
- **Utilities**: Place helper functions in appropriate model files
- **Loading**: Add spectrum loading utilities to `load-spectrum/` directory

### Code Conventions

- **Classes**: Use ES6 class syntax with proper constructors
- **Naming**: Use camelCase for methods, PascalCase for classes
- **Documentation**: Include JSDoc comments for public methods
- **Validation**: Implement proper data validation in setters
- **Events**: Use consistent event naming patterns

### Key Patterns

```javascript
// Model definition pattern
class ModelName {
    constructor(data) {
        // Initialize properties
        // Set up validation
        // Trigger events
    }

    // Getters and setters with validation
    set property(value) {
        // Validate input
        // Update internal state
        // Trigger change events
    }
}
```

## Development Guidelines

### Adding New Models

1. **Follow Existing Patterns**: Study existing models like `crosslink.js` or `peptide.js`
2. **Implement Validation**: Add proper data validation and error handling
3. **Event Integration**: Ensure models trigger appropriate change events
4. **Dependencies**: Consider relationships with other models
5. **Testing**: Create comprehensive tests for new functionality

### Extending Existing Models

1. **Backward Compatibility**: Maintain existing API contracts
2. **Documentation**: Update JSDoc comments for new methods
3. **Validation**: Extend validation logic for new properties
4. **Integration**: Test integration with xiview and other components

### Data Flow Patterns

- **Immutable Updates**: Prefer creating new instances over mutating existing data
- **Event Propagation**: Ensure changes propagate to dependent components
- **Lazy Loading**: Implement lazy loading for expensive computations
- **Caching**: Cache computed properties where appropriate

## Integration with build-xiview

### Usage by Other Components

**xiview**:
- Imports all core models for application state management
- Extends models with UI-specific functionality
- Uses SearchResultsModel as primary data container

**crosslink-viewer**:
- Uses CrossLink and Peptide models for network visualization
- Accesses protein and cross-link data for layout algorithms

### Build Integration

- **No Separate Build**: Models are imported directly by consuming components
- **ES6 Modules**: Uses modern module syntax for clean imports
- **No Dependencies**: Maintains zero external dependencies for maximum compatibility

## Key Classes and Their Relationships

```
SearchResultsModel
├── CrossLink[]
│   ├── Peptide (peptide1)
│   └── Peptide (peptide2)
├── SpectrumMatch[]
│   ├── SpectraData
│   └── Peptide[]
├── Proteins{}
└── Modifications{}
```

## Important Notes

- **Pure JavaScript**: No external dependencies - keep it that way
- **Cross-Module Compatibility**: Changes must work with all consuming components
- **Data Integrity**: Maintain strict validation to prevent corrupt data states
- **Performance**: Consider memory usage and computational efficiency
- **Backward Compatibility**: API changes affect multiple components

## Context Within xiVIEW

CLMS-model provides the stable foundation that enables:
- Consistent data representation across all visualization components
- Reliable data validation and integrity checking
- Shared business logic for cross-linking mass spectrometry analysis
- Seamless data exchange between xiview, spectrum, and crosslink-viewer components

The models defined here directly impact the functionality and reliability of the entire xiVIEW application ecosystem.

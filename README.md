# CLMS-model

JavaScript data model library for cross-linking mass spectrometry (CLMS) data.

## Component Overview

CLMS-model provides the core data structures for xiVIEW
## Architecture

### Core Data Models

- **SearchResultsModel**: Top-level container for all experiment data
- **CrossLink**: Represents cross-linked peptide pairs with positions and evidence
- **Peptide**: Individual peptide sequences with modifications and proteins
- **SpectrumMatch**: Links mass spectra to peptide identifications
- **SpectraData**: Container for raw spectral data and metadata

### Key Source Files (`src/`)

- **`search-results-model.js`**: Main container for search results and experiment data
- **`crosslink.js`**: CrossLink model - represents cross-linked peptide pairs
- **`peptide.js`**: Peptide model - individual peptide sequences and modifications
- **`spectrum-match.js`**: SpectrumMatch model - links spectra to peptide identifications
- **`attribute-options.js`**: Configuration and attribute management
- **`enzyme.js`**: Protease enzyme definitions and specificity rules
- **`search-modification.js`**: Post-translational modification definitions
- **`spectra-data.js`**: Spectral data containers and management
- **`spectrum-identification-protocol.js`**: Search protocol metadata
- **`load-spectrum/`**: Utilities for loading and parsing spectrum data

## Development

### Branch Information
- **Current branch**: v2
- **Development branch**: v2

### Usage by Other Components

- **xiview**: Imports all core models for application state management
- **crosslink-viewer**: Uses CrossLink and Peptide models for network visualization

### Integration

CLMS-model is imported directly by consuming components using ES6 module syntax. It maintains minimal external dependencies.

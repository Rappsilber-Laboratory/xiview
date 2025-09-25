# CLAUDE.md - spectrum

This file provides guidance to Claude Code when working with the spectrum submodule within the build-xiview project.

## Component Overview

The spectrum submodule contains xiSPEC, a mass spectrometry visualization tool for annotating and displaying peptide fragmentation spectra. It provides interactive spectrum visualization with fragment annotation capabilities.

## Role in build-xiview Project

spectrum serves as the **specialized spectrum visualization component** within the xiVIEW ecosystem:

- **Spectrum Display**: Interactive visualization of mass spectrometry data
- **Fragment Annotation**: Automatic annotation of peptide fragment ions
- **Quality Control**: Visualization of spectrum quality metrics
- **Modular Component**: Self-contained spectrum viewer that can be integrated

## Architecture

### Key Directories

- **`src/`**: Core xiSPEC source code and modules
- **`dist/`**: Build output directory (xispec.js)
- **`examples/`**: Example HTML files demonstrating usage
- **`css/`**: Stylesheets for spectrum visualization
- **`vendor/`**: Third-party libraries and dependencies

### Technology Stack

- **D3.js**: Data visualization and SVG manipulation
- **Webpack**: Module bundling and build system
- **Babel**: ES6+ transpilation for browser compatibility
- **Independent Build**: Self-contained build process separate from parent

## Development Workflow

### Branch Information
- **Current branch**: `dev`
- **Development branch**: `dev`

### Build Process

spectrum has its own independent build system:

```bash
# Development build
npm run build-dev

# Production build
npm run build-prod

# Development server
npm run start:dev
```

### File Organization

- **Core Modules**: Place in `src/` directory
- **Examples**: Add demonstration files to `examples/`
- **Styles**: Component-specific CSS in `css/` directory
- **Dependencies**: Managed independently via package.json

### Code Conventions

- **ES6+ Syntax**: Modern JavaScript with proper module imports
- **D3 Patterns**: Follow D3.js best practices for data visualization
- **Modular Design**: Separate concerns into focused modules
- **API Design**: Maintain clean public API for integration

## Development Guidelines

### xiSPEC Configuration

Basic xiSPEC configuration:

```javascript
var options = {
    targetDiv: 'spectrum_container',
    showCustomConfig: false,
    showQualityControl: 'bottom',
    baseDir: './spectrum/',
    xiAnnotatorBaseURL: 'https://spectrumviewer.org/xiAnnotator/',
};

var xiSPEC = xispec.createApp(options);
```

## Integration with build-xiview

### Independent vs Integrated Build

- **Independent**: spectrum can be built and used standalone
- **Integrated**: When built via parent build-xiview, output is included in final xiVIEW distribution
- **Dependencies**: Maintains separate package.json for spectrum-specific dependencies

## Important Notes

- **Independent Package**: Maintains separate package.json and build process
- **xiAnnotator Dependency**: Requires external annotation service for full functionality
- **CORS Considerations**: xiAnnotator integration may require CORS configuration
- **No Vendor Changes**: Never modify code in vendor/ directories

## Context Within xiVIEW

spectrum provides functionality for:
- Detailed examination of individual mass spectra
- Validation of peptide identifications through fragment evidence
- Quality assessment of spectral data
- Interactive exploration of fragmentation patterns

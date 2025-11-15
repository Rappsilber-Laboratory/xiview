# CLAUDE.md - crosslink-viewer

This file provides guidance to Claude Code when working with the crosslink-viewer submodule within the build-xiview project.

## Component Overview

The crosslink-viewer submodule contains xiNET, a web-based visualization tool for crosslinking mass spectrometry data. It provides interactive network visualization of protein crosslinks with residue-level resolution.

## Role in build-xiview Project

crosslink-viewer serves as the **network visualization component** within the xiVIEW ecosystem:

- **Network Display**: Interactive visualization of protein crosslink networks
- **Residue Resolution**: Detailed view of crosslink positions on protein sequences
- **Layout Algorithms**: Sophisticated network layout and clustering capabilities

## Architecture

### Key Directories

- **`src/`**: Core xiNET source code and modules
- **`css/`**: Stylesheets for network visualization
- **`vendor/`**: Third-party libraries and dependencies
- **`js/`**: JavaScript modules and utilities
- **`images/`**: Icons and graphics for the interface

### Technology Stack

- **D3.js**: Data visualization and network layout
- **JavaScript**: Modern ES6+ features for component logic
- **SVG**: Vector graphics for scalable network rendering
- **CSS**: Styling for interactive network elements

## Development Workflow

### Branch Information
- **Current branch**: `master`
- **Development branch**: `master`

### File Organization

- **Core Components**: Place main visualization logic in `src/`
- **Styling**: Network-specific CSS in `css/` directory
- **Utilities**: Helper functions and modules in `js/`
- **Assets**: Icons and images in `images/` directory

### Code Conventions

- **Modular Design**: Separate network layout, rendering, and interaction concerns
- **D3 Patterns**: Follow D3.js best practices for data-driven visualizations
- **Event Handling**: Clean event delegation and interaction patterns
- **Performance**: Optimize for large network datasets

## Development Guidelines

### Integration Points

- **Data Import**: Accepts crosslink data from CLMS-model structures
- **Filtering**: Responds to data filtering and selection from parent application

## Integration with build-xiview

### Component Integration

crosslink-viewer operates as a visualization component that:
- Receives crosslink data through defined interfaces
- Provides interactive network exploration capabilities
- Communicates selection and interaction events

### Build Process

crosslink-viewer is integrated into the main xiVIEW build process while maintaining its modular structure.

## Important Notes

- **No Vendor Changes**: Never modify code in vendor/ directories
- **Performance**: Consider performance with large crosslink datasets
- **Browser Compatibility**: Ensure SVG rendering works across target browsers

## Citation

If using xiNET functionality, cite:
> Combe, Colin W., Lutz Fischer, and Juri Rappsilber. "xiNET: Cross-Link Network Maps With Residue Resolution." Molecular & Cellular Proteomics : MCP 14, no. 4 (April 2015): 1137–47.

## Context Within xiVIEW

crosslink-viewer provides essential functionality for:
- Interactive exploration of protein interaction networks
- Visualization of crosslink connectivity patterns
- Analysis of protein complex topology

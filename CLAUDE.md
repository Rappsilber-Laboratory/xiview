# CLAUDE.md - xiview

This file provides guidance to Claude Code when working with the xiview submodule within the build-xiview project.

## Component Overview

xiview is the main application component of the xiVIEW cross-linking mass spectrometry visualization tool. It provides the primary user interface, application logic, and coordinates with other submodules to deliver the complete xiVIEW experience.

## Role in build-xiview Project

xiview serves as the **main application orchestrator** within the build-xiview container:

- **Primary UI**: All main user interface components and views
- **Application Logic**: Core application state management and business logic
- **Integration Hub**: Coordinates with CLMS-model, spectrum, and crosslink-viewer components
- **Entry Point**: Contains `js/promises-load.js` which is the main application entry point

## Architecture

### Key Directories

- **`js/views/`**: UI view components using Backbone.js framework
- **`js/model/`**: Application-specific models extending CLMS-model
- **`js/filter/`**: Data filtering and search functionality
- **`js/controller/`**: Application controllers and event handling
- **`css/`**: Stylesheets for the main application
- **`images/`**: Icons, logos, and UI graphics
- **`tests/`**: Test files and testing utilities

### Technology Stack

- **Framework**: Backbone.js for MVC architecture
- **UI Library**: jQuery for DOM manipulation
- **Visualization**: d3.js v3 (intentionally not upgraded)
- **Molecular Graphics**: NGL viewer for 3D protein structures
- **Build**: Integrated with webpack via parent build-xiview project

### Integration Points

xiview integrates with other submodules through:

- **CLMS-model**: Uses core data models (CrossLink, Peptide, SearchResultsModel)
- **spectrum**: Embeds xiSPEC for spectrum visualization
- **crosslink-viewer**: Integrates xiNET for network visualization

## Development Workflow

### Branch Information
- **Current branch**: `v2`
- **Development branch**: `v2`

### File Organization

Follow existing patterns when adding new components:
- **Views**: Place in `js/views/` directory, extend Backbone.View
- **Models**: Extend CLMS-model base classes in `js/model/`
- **Styles**: Add component-specific CSS to appropriate files in `css/`
- **Tests**: Create corresponding test files in `tests/` directory

### Code Conventions

- **Naming**: Use camelCase for JavaScript, kebab-case for CSS classes
- **Indentation**: 4 spaces (configured in parent .eslintrc.json)
- **Quotes**: Double quotes for strings
- **Semicolons**: Required at end of statements
- **Line Endings**: Unix style (LF)

### Key Files

- **`js/promises-load.js`**: Main application entry point and loader
- **`js/main.js`**: Core application initialization
- **`js/views/`**: UI components organized by feature
- **`css/style.css`**: Main stylesheet
- **`package.json`**: Not present - dependencies managed by parent project

## Development Guidelines

### Adding New Features

1. **Understand Integration**: Consider how new features interact with other submodules
2. **Follow Backbone Patterns**: Use existing view and model patterns
3. **Test Integration**: Verify compatibility with CLMS-model, spectrum, and crosslink-viewer
4. **Maintain d3 v3**: Do not upgrade d3 version - intentionally staying on v3
5. **Respect Dependencies**: Use libraries available in parent package.json

### Common Patterns

- **Views**: Extend Backbone.View, use proper event handling
- **Models**: Extend CLMS-model classes when possible
- **Events**: Use Backbone events for component communication
- **DOM**: Use jQuery for DOM manipulation, d3 for data-driven visualizations

### Integration with Build System

xiview is built as part of the parent build-xiview webpack configuration:
- Entry point: `xiview/js/promises-load.js`
- Output: Combined into `dist/xiview.js`
- No separate build process - integrated with parent

## Important Notes

- **d3 Version**: Intentionally staying on d3 v3 - do not upgrade
- **Dependencies**: All dependencies managed by parent build-xiview project
- **Testing**: Run tests from parent directory using npm commands
- **Linting**: ESLint configuration inherited from parent .eslintrc.json
- **No Vendor Changes**: Never modify code in vendor/ directories

## Debugging and Development

### Local Development

Development is done through the parent build-xiview project:
```bash
# From build-xiview root
npm run build-dev
```

### Testing

Tests are located in the `tests/` directory. Run from parent project:
```bash
# From build-xiview root
npm run lint
```

### Common Issues

1. **Module Loading**: Ensure new modules are properly imported in promises-load.js
2. **Backbone Integration**: Follow existing view and model patterns
3. **Cross-Module Communication**: Use proper event channels for submodule integration
4. **Styling Conflicts**: Check for CSS conflicts with other components

## Context Within xiVIEW

xiview serves as the main application shell that:
- Loads and initializes all other components
- Provides the primary user interface
- Manages application state and user interactions
- Coordinates data flow between visualization components
- Handles user authentication and session management

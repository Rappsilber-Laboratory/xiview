# CLAUDE.md - xiview_all

This file provides guidance to Claude Code when working with this repository.

## Project Overview

xiVIEW is a web-based visualization tool for crosslinking mass spectrometry data developed by the Rappsilber Laboratory. This repository is a **merged, single-repository** version of what was previously organised as a git submodule project (`build-xiview`). All four original components have been combined into one codebase.

## Repository Structure

What were previously four separate git submodules are now merged into this single repository:

| Original submodule | Original branch | Now located at |
|--------------------|-----------------|----------------|
| xiview | v2 | `js/`, `css/`, `images/`, `tests/` (top level) |
| CLMS-model | v2 | `js/models/` |
| spectrum (xiSPEC) | dev | `src/` |
| crosslink-viewer (xiNET) | master | `js/views/xinet/` |

## Architecture

### Key Directories

- **`js/`** - Main application JavaScript
  - **`js/promises-load.js`** - Application entry point and loader
  - **`js/networkFrame.js`** - Main application initialisation, wires up all views and models
  - **`js/models/`** - Core CLMS data models (CrossLink, Peptide, SearchResultsModel, etc.) — originally CLMS-model
  - **`js/model/`** - Application-specific models extending the core CLMS models
  - **`js/views/`** - UI view components using Backbone.js
  - **`js/views/xinet/`** - xiNET crosslink network visualization — originally crosslink-viewer
  - **`js/filter/`** - Data filtering and search functionality
  - **`js/align/`** - Sequence alignment utilities
  - **`js/config/`** - Configuration and menu definitions
  - **`js/file-choosers/`** - File import UI components
  - **`js/ui-utils/`** - Shared UI utilities
- **`src/`** - xiSPEC spectrum viewer — originally spectrum submodule
- **`css/`** - All stylesheets
- **`images/`** - Icons, logos, and UI graphics
- **`tests/`** - Test files and test data
- **`vendor/`** - Third-party libraries (do not modify)

### Core Data Models (`js/models/`)

- **`search-results-model.js`** - Top-level container for all experiment data
- **`crosslink.js`** - CrossLink model
- **`peptide.js`** - Peptide model
- **`protein.js`** - Protein model
- **`spectrum-match.js`** - SpectrumMatch model
- **`attribute-options.js`** - Configuration and attribute management
- **`load-spectrum/`** - Utilities for loading and parsing spectrum data

### Technology Stack

- **Backbone.js**: MVC framework for application structure
- **jQuery**: DOM manipulation and event handling
- **d3.js v3**: Data visualization (intentionally staying on v3)
- **NGL viewer**: 3D molecular structure visualization
- **DataTables**: Interactive data table components
- **Webpack**: Module bundling (dev/prod configurations)
- **Babel**: ES2018 transpilation

## Development Commands

### Building
```bash
# Development build
npm run build-dev

# Production build
npm run build-prod
```

### Linting
```bash
npm run lint
```

### Testing
```bash
npm test           # Full test suite (builds first)
npm run test-headless  # Run tests without building (requires prior build)
```

**Test Infrastructure**:
- **Framework**: QUnit 2.21.1 with Puppeteer headless execution
- **Test Files**: `tests/qunit.html`, `tests/qunit2.html`, `tests/tests.js`, `tests/tests2.js`, `tests/clms-model-tests.js`
- **Coverage**: 67 tests covering data parsing, filtering, selection, scoring, alignment, distance calculations, and CSV export

## Build System

- **Webpack**: Uses `webpack.common.js` with separate `webpack.dev.js` / `webpack.prod.js`
- **Entry point**: `js/promises-load.js`
- **Output**: Builds to `dist/xiview.js` as UMD library
- **Babel**: Configured for ES2018 with preset-env
- **ESLint**: Unix line endings, semicolons required, 4-space indentation, double quotes

## Code Conventions

- **Naming**: camelCase for JavaScript, kebab-case for CSS classes
- **Indentation**: 4 spaces
- **Quotes**: Double quotes for strings
- **Semicolons**: Required at end of statements
- **Line Endings**: Unix style (LF)
- **Framework**: Follow Backbone.js patterns for views and models

### Adding New Components

- **Views**: Place in `js/views/`, extend Backbone.View
- **Core models**: Place in `js/models/`
- **App-specific models**: Place in `js/model/`, extend core CLMS models where possible
- **Styles**: Add to appropriate file in `css/`
- **Tests**: Add to `tests/`

## Important Rules

- crosslink and crosslinking are not hyphenated
- Do not upgrade from d3 v3
- Never modify code in `vendor/` directories
- Do not add QUnit import to HTML files (it is included in the development bundle)
- Do not lint, test, or build — the user will do that

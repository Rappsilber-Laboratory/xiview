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
  - **`js/main.js`** - Application entry point and loader
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
- **Entry point**: `js/main.js`
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

## Data Loading and API Integration

### How data is loaded

`js/main.js` exports `xiview.main(apiBase, annotatorURL)`. The entry HTML (`network.html` in xiview-server) calls it with the production API base URL:

```javascript
xiview.main("https://www.ebi.ac.uk/pride/ws/archive/crosslinking/v3/data/", "xiAnnotator/");
```

Inside `main()`, every data fetch appends `window.location.search` verbatim to the `apiBase` URL. This means the page's own URL query parameters are forwarded to every API call. For example:

```
page URL:  network.html?project=PXD53341&file=some_file.mzid
API call:  https://.../data/get_xiview_matches?project=PXD53341&file=some_file.mzid
```

### URL parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `project` | yes | PRIDE project accession, e.g. `PXD53341` |
| `file` | no | Specific mzIdentML filename within the project. If omitted, data from all files in the project is aggregated. |

Example URLs:
- All files in a project: `network.html?project=PXD53341`
- Single file: `network.html?project=PXD53341&file=SomeSearch.mzid`

### The crosslinking-api backend (sibling submodule)

The API is provided by the `crosslinking-api` submodule (FastAPI, Python 3.11, PostgreSQL). Base path: `/pride/ws/archive/crosslinking/v3`.

**xiVIEW data endpoints** (all under `/data/`, all accept `?project=&file=`):

| Endpoint | Description |
|----------|-------------|
| `GET /data/visualisations/{project_id}` | Lists available files and their xiVIEW links for a project |
| `GET /data/get_xiview_matches` | Spectral matches / PSMs with crosslink info |
| `GET /data/get_xiview_peptides` | Peptide sequences with modifications |
| `GET /data/get_xiview_proteins` | Protein sequences and accessions |
| `GET /data/get_xiview_enzymes` | Enzyme configuration |
| `GET /data/get_xiview_search_modifications` | Search modification parameters |
| `GET /data/get_xiview_spectrum_identification_protocols` | Protocol / search configuration |
| `GET /data/get_xiview_spectra_data` | Spectra data metadata |
| `GET /data/get_xiview_mzidentml_files` | mzIdentML file metadata |
| `GET /data/get_xiview_analysis_collection_spectrum_identifications` | Analysis collection data |
| `GET /data/get_peaklist` | Raw peak list for a spectrum (`id`, `sd_ref`, `upload_id`) |

Production API base: `https://www.ebi.ac.uk/pride/ws/archive/crosslinking/v3/data/`

Local dev API base (from the commented-out line in `network.html`): `http://127.0.0.1:8000/pride/ws/archive/crosslinking/v2/data/`

### network.html (xiview-server)

`xiview-server/static/network.html` is the main HTML entry point served by xiview-server (Flask). It loads `vendors.js` and `xiview.js` (built output), then calls `xiview.main(...)`. The `pride.css` stylesheet is conditionally applied when a `pride` URL param is present or the host ends with `ebi.ac.uk`.

xiview-server serves `network.html` at `/network.html` via Flask's static file handling. To run locally with a local API:
1. Build xiview: `npm run build-dev` (outputs `dist/xiview.js`)
2. Copy or symlink build output into `xiview-server/static/`
3. Edit the `xiview.main(...)` call in `network.html` to point at your local API
4. Run xiview-server and open `http://localhost:{port}/network.html?project=PXD53341`

## Important Rules

- crosslink and crosslinking are not hyphenated
- Do not upgrade from d3 v3
- Never modify code in `vendor/` directories
- Do not add QUnit import to HTML files (it is included in the development bundle)
- Do not lint, test, or build — the user will do that

# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

xiVIEW is a web-based visualization tool for crosslinking mass spectrometry data developed by the Rappsilber Laboratory.

## Correctness Comes First — Read This Before Any Change

xiVIEW is a **scientific data visualisation tool**. Researchers draw conclusions, and publish them, from what it shows. **The top priority, above performance, appearance and code elegance, is that every view always shows exactly the correct data.** Every link, colour, count, position, filter result, table cell and export has to match the underlying data exactly, every time.

What this means in practice:

- **No trade-offs that are "almost always right".** Do not suggest or make an optimisation, cache, shortcut or approximation that has *any* chance, however small, of showing a wrong result. For example: a link drawn in the wrong colour, a stale selection or highlight state, a filtered-out item still visible (or the reverse), or a rounded or truncated value shown as if exact. A small chance of wrong output is a bug, not an acceptable cost. (Real example: a xiNET rendering speed-up that skipped link colour updates and so could leave a link the wrong colour was rejected for exactly this reason.)
- **Performance work must be provably equivalent.** A speed-up is only acceptable if the rendered output is identical to the unoptimised path in every case. Before proposing one, work out and state *why* it can't change the output: which invariants it depends on, and what keeps them true (all events and update paths that touch the cached or skipped state). If you can't show that, don't propose it, or present it clearly as unsafe.
- **Caches and dirty flags have to be invalidated everywhere.** Anything that skips recomputation (memoisation, "only update what changed", reused DOM or SVG elements, throttled or debounced redraws) must be invalidated by *every* change that can affect its output: filter changes, selection and highlight, colour scheme or colour model changes, grouping/collapse/expand, hide/show, data reloads, etc. When in doubt, recompute.
- **Raise uncertainty, don't hide it.** If you aren't sure a change keeps the output exact, say so to the user explicitly rather than presenting it as safe. Don't silently swallow errors or fall back to defaults in a way that could show plausible but wrong data. Failing visibly is better than showing something wrong.
- **Check output, not just that it runs.** For changes that affect what's displayed, check the actual rendered result (colours, counts, which items are shown) against the expected data, and add or extend tests where possible.

## Architecture

### Key Directories

- **`js/`** - Main application JavaScript
  - **`js/main.js`** - Application entry point and loader
  - **`js/networkFrame.js`** - Main application initialisation, wires up all views and models
  - **`js/clms-model/`** - Core CLMS data models (CrossLink, Peptide, SearchResultsModel, etc.)
  - **`js/backbone-models/`** - Application-specific models extending the core CLMS models
  - **`js/views/`** - UI view components using Backbone.js
  - **`js/views/xinet/`** - xiNET crosslink network visualization
  - **`js/views/xispec/`** - xiSPEC spectrum viewer
  - **`js/filter/`** - Data filtering and search functionality
  - **`js/align/`** - Sequence alignment utilities
  - **`js/config/`** - Configuration and menu definitions
  - **`js/file-choosers/`** - File import UI components
  - **`js/ui-utils/`** - Shared UI utilities
- **`css/`** - All stylesheets
- **`images/`** - Icons, logos, and UI graphics
- **`tests/`** - Test files and test data
- **`vendor/`** - Third-party libraries (do not modify)

### Core Data Models (`js/clms-model/`)

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
npm run lint        # ESLint (JS only)
npm run lint:css    # stylelint (CSS only)
```

### Pre-commit hooks

Hooks are configured in `.pre-commit-config.yaml` and installed automatically via the `prepare` npm script (runs on `npm install`). On commit: trailing whitespace, EOF, YAML/JSON checks, ESLint, stylelint. On push: webpack build + QUnit tests.

### Testing
```bash
npm run build-dev && npm test  # Build then run tests
npm test                       # Run tests against existing build in dist/
```

**Test Infrastructure**:
- **Framework**: QUnit 2.21.1 with Puppeteer headless execution
- **Test pages** (run by `scripts/run-tests.js`): `tests/qunit.html`, `tests/qunit2.html`, `tests/qunit-clms-backbone-models.html`, `tests/qunit-annotation.html`
- **Test scripts**: `tests/tests.js`, `tests/tests2.js`, `tests/clms-model-tests.js`, `tests/annotation-request-tests.js`, `tests/test-helper.js`
- **Coverage**: ~130 tests covering data parsing, filtering, selection, scoring, alignment, distance calculations, annotation requests and CSV export

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
- **Core models**: Place in `js/clms-model/`
- **App-specific models**: Place in `js/backbone-models/`, extend core CLMS models where possible
- **Styles**: Add to appropriate file in `css/`
- **Tests**: Add to `tests/`

## Data Loading and API Integration

### How data is loaded

`js/main.js` exports `xiview.main(apiBase, annotatorURL, options)` (and `validationPage(...)` with the same signature). `options` is optional:

- `configSaving` — enable saving/loading of saved configs (xiNET layout + filter settings) via `${apiBase}config`. Defaults to true when the page URL has a `uuid` param (xi2 datasets).
- `groupLabels` — map of upload id → group label. Overrides labels parsed from the `uuid` URL param.

The entry HTML (`network.html` in xiview-server) chooses the API base from an `?api=` URL param (`pride-prod` (default), `pride-local`, `xi2-local`):

```javascript
const APIS = {
    'pride-prod':  "https://www.ebi.ac.uk/pride/ws/archive/crosslinking/v3/data/",
    'pride-local': "http://127.0.0.1:5005/pride/ws/archive/crosslinking/v3/data/",
    'xi2-local':   "http://127.0.0.1:5005/xi2/data/",
};
xiview.main(APIS[apiKey] || APIS['pride-prod'], "xiAnnotator/");
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
| `uuid` | no | xi2 dataset id(s), `.`-separated, each optionally `id~groupLabel`; used instead of `project` for xi2. Turns on config saving. |
| `api` | no | Read by `network.html` only: picks the API base (see above). |

Example URLs:
- All files in a project: `network.html?project=PXD53341`
- Single file: `network.html?project=PXD53341&file=SomeSearch.mzid`

### The crosslinking-api backend (sibling repository)

The API is provided by the `crosslinking-api` repository (`../crosslinking-api`) (FastAPI, Python 3.11, PostgreSQL). Base path: `/pride/ws/archive/crosslinking/v3`.

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

Local dev API base: `http://127.0.0.1:5005/pride/ws/archive/crosslinking/v3/data/` (open `network.html?api=pride-local&project=...`)

### network.html (xiview-server)

`xiview-server/static/network.html` is the main HTML entry point served by xiview-server (Flask). It loads `vendors.js` and `xiview.js` (built output), then calls `xiview.main(...)`. The `pride.css` stylesheet is conditionally applied when a `pride` URL param is present or the host ends with `ebi.ac.uk`.

xiview-server serves `network.html` at `/network.html` via Flask's static file handling. To run locally with a local API:
1. Build and copy: `npm run build-dev-and-copy-to-xiview-server` (builds `dist/` and copies it into `../xiview-server/static/`)
2. Run xiview-server and open `http://localhost:{port}/network.html?api=pride-local&project=PXD53341`

## Known Correctness Issues

Open problems where xiVIEW can display wrong data. Fix them when working nearby, and don't add more like them.

- **UniProt accession mapped to several entries** (`fetchUniprotKB` in `js/main.js`): UniProt's ID mapping can return more than one entry for one accession (e.g. a secondary accession whose entry was split / demerged). `lookup.set(result.from, result.to)` keeps whichever comes last, so the protein silently gets one arbitrary entry's annotations (features, subcellular location, GO terms, and so auto groups). It should detect the ambiguity, leave such proteins unannotated and tell the user.

## Important Rules

- Correctness of displayed data beats performance, always (see "Correctness Comes First" above)
- Auto grouping (`protein-group-manager-mixin.js`) only ever puts a protein in a group if it is annotated with the group's term or a term the group contains. No heuristics (majority membership, crosslink partners, etc.) that add proteins to a group they aren't annotated to — the group label is a claim about every member
- crosslink and crosslinking are not hyphenated
- Do not upgrade from d3 v3
- Never modify code in `vendor/` directories
- Do not add QUnit import to HTML files (it is included in the development bundle)

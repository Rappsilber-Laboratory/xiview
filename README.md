# xiVIEW

Interactive visualization of protein crosslinking mass spectrometry data sets, developed by the Rappsilber Laboratory.

## Project Architecture

The entry point is `js/main.js`, which loads CSS, initialises the spinner, imports core modules, and handles data fetching.

## Key Directories

- **`js/`** - Main application code (views, models, filters, controllers)
  - **`js/clms-model/`** - Core CLMS data models (CrossLink, Peptide, SearchResultsModel, etc.)
  - **`js/backbone-models/`** - Application-specific models extending the core CLMS models
  - **`js/views/`** - UI view components using Backbone.js, including xiNET and xiSPEC
  - **`js/views/xinet/`** - xiNET crosslink network visualization component
  - **`js/views/xispec/`** - xiSPEC spectrum viewer component
  - **`js/filter/`** - Data filtering and search functionality
  - **`js/align/`** - Sequence alignment utilities
  - **`js/config/`** - Configuration and menu definitions
  - **`js/file-choosers/`** - File import UI components
  - **`js/ui-utils/`** - Shared UI utilities
- **`css/`** - All stylesheets
- **`images/`** - Icons, logos, and UI graphics
- **`tests/`** - Test files and test data
- **`vendor/`** - Third-party libraries (do not modify)

## Quick Start

Requires Node >=24.13.1. Install dependencies:
```bash
npm install
```

Pre-commit git hooks are installed automatically by the `prepare` script during `npm install`.

### Development Build

```bash
npm run build-dev
```

### Production Build

```bash
npm run build-prod
```

## Available Commands

```bash
# Development build
npm run build-dev

# Production build
npm run build-prod

# Run ESLint
npm run lint

# Run automated tests (requires a prior build)
npm test
```

## Testing Infrastructure

xiVIEW includes automated testing using QUnit and Puppeteer:

- **Test Location**: `tests/` directory
- **Test Files**: `qunit.html`, `qunit2.html`, `qunit-clms-backbone-models.html` (browser), `tests.js`, `tests2.js`, `clms-model-tests.js` (logic)
- **Test Data**: JSON test datasets (`10003.json`, `15884.json`, `blosums.json`)
- **Execution**: Headless browser testing via Puppeteer with local HTTP server; requires a prior build (`npm run build-dev`)
- **Coverage**: Data parsing, filtering, selection, scoring, alignment, distance calculations, and CSV export

The test runner automatically:
1. Starts a local HTTP server to serve test files
2. Launches headless Chrome to execute QUnit tests
3. Reports detailed results with pass/fail counts and timing

## Build System

- **Webpack**: Separate development and production configurations (`webpack.dev.js`, `webpack.prod.js`)
- **Entry Point**: `js/main.js`
- **Output**: Builds to `dist/xiview.js` as UMD library
- **Babel**: ES2018 with preset-env for browser compatibility
- **ESLint**: Unix line endings, semicolons required, 4-space indentation

## Key Dependencies

- **d3** (~3.5.17) - Data visualization (note: intentionally staying on v3)
- **backbone** (~1.6.0) - MVC framework
- **jquery** (~3.7.1) - DOM manipulation
- **ngl** (~2.4.0) - 3D molecular visualization
- **datatables.net** - Data table components
- **split.js** - UI panel splitting

## Data Loading and API Integration

xiVIEW loads crosslinking data from a REST API at runtime. `js/main.js` exports `xiview.main(apiBase, annotatorURL)`, which is called from the HTML entry point (`network.html` in xiview-server):

```javascript
xiview.main("https://www.ebi.ac.uk/pride/ws/archive/crosslinking/v3/data/", "xiAnnotator/");
```

### URL parameters

Every data fetch in `main.js` appends `window.location.search` to the API base URL, forwarding the page's query string to the API. Supported parameters:

| Parameter | Required | Description |
|-----------|----------|-------------|
| `project` | yes | PRIDE project accession, e.g. `PXD53341` |
| `file` | no | Specific mzIdentML filename. Omit to aggregate all files in the project. |

Example URLs:
- All files: `network.html?project=PXD53341`
- Specific file: `network.html?project=PXD53341&file=SomeSearch.mzid`

### crosslinking-api

The backend REST API is provided by the `crosslinking-api` project (FastAPI, PostgreSQL). The xiVIEW-specific endpoints are all under `/pride/ws/archive/crosslinking/v3/data/`:

- `GET /data/visualisations/{project_id}` — list available files and xiVIEW links for a project
- `GET /data/get_xiview_matches` — spectral matches / PSMs
- `GET /data/get_xiview_peptides` — peptide sequences
- `GET /data/get_xiview_proteins` — protein sequences and accessions
- `GET /data/get_xiview_enzymes`, `get_xiview_search_modifications`, `get_xiview_spectrum_identification_protocols`, `get_xiview_spectra_data`, `get_xiview_mzidentml_files`, `get_xiview_analysis_collection_spectrum_identifications` — search/protocol metadata
- `GET /data/get_peaklist` — raw spectrum peak list

Production API: `https://www.ebi.ac.uk/pride/ws/archive/crosslinking/v3/data/`

### network.html (xiview-server)

`xiview-server/static/network.html` is the HTML shell that bootstraps xiVIEW. It loads the built JS bundles (`vendors.js`, `xiview.js`) and calls `xiview.main(...)`. The `pride.css` stylesheet is conditionally loaded when a `pride` param is present or the host ends with `ebi.ac.uk`.

To run locally with a local API, edit the `xiview.main(...)` call in `network.html` to use the local API base (e.g. `http://127.0.0.1:8000/pride/ws/archive/crosslinking/v2/data/`).

## Troubleshooting

### Build Failures

1. Check node version compatibility
2. Clear node_modules and reinstall:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

## Citations

Please cite xiVIEW as:
> Combe, C. W., Graham, M., Kolbowski, L., Fischer, L., & Rappsilber, J. (2024). xiVIEW: Visualisation of Crosslinking Mass Spectrometry Data. Journal of Molecular Biology, 436(17), 168656. https://doi.org/10.1016/j.jmb.2024.168656

If using xiSPEC functionality, cite:
> Lars Kolbowski, Colin Combe, Juri Rappsilber; xiSPEC: web-based visualization, analysis and sharing of proteomics data, Nucleic Acids Research, gky353, https://doi.org/10.1093/nar/gky353

If using xiNET functionality, cite:
> Combe, Colin W., Lutz Fischer, and Juri Rappsilber. "xiNET: Cross-Link Network Maps With Residue Resolution." Molecular & Cellular Proteomics : MCP 14, no. 4 (April 2015): 1137–47. https://doi.org/10.1074/mcp.O114.042259.

---

Built by

[<img src="/images/logos/rappsilber-lab_blk.png">](http://rappsilberlab.org/rappsilber-laboratory-home-page/tools/xiview/ "Go To The Rappsilber Lab Home Page")

---

[<img src="/images/logos/wellcome-trust_blk.png">](https://wellcome.ac.uk/home "Go To The Wellcome Trust Home Page")

---
Browser cross-compatibility bug fixing aided by BrowserStack

[<img src="/images/logos/Browserstack-logo@2x.png">](https://www.browserstack.com "Go To BrowserStack.com")

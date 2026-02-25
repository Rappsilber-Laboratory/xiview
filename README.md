# xiVIEW

Interactive visualization of protein crosslinking mass spectrometry data sets, developed by the Rappsilber Laboratory.

## Project Architecture

This is a merged, single-repository version of what was previously organised as a git submodule project. It combines four original components into a single codebase:

| Original submodule | Branch | Now located at |
|--------------------|--------|----------------|
| xiview | v2 | `js/`, `css/`, `images/`, `tests/` (top level) |
| CLMS-model | v2 | `js/models/` |
| spectrum (xiSPEC) | dev | `src/` |
| crosslink-viewer (xiNET) | master | `js/views/xinet/` |

The entry point is `js/promises-load.js`, which loads CSS, initialises the spinner, imports core modules, and handles data fetching.

## Key Directories

- **`js/`** - Main application code (views, models, filters, controllers)
  - **`js/models/`** - Core CLMS data models (CrossLink, Peptide, SearchResultsModel, etc.)
  - **`js/views/xinet/`** - xiNET crosslink network visualization component
  - **`js/model/`** - Application-specific models extending the core CLMS models
  - **`js/views/`** - UI view components using Backbone.js
  - **`js/filter/`** - Data filtering and search functionality
- **`src/`** - xiSPEC spectrum viewer component
- **`css/`** - All stylesheets
- **`images/`** - Icons, logos, and UI graphics
- **`tests/`** - Test files and test data
- **`vendor/`** - Third-party libraries (do not modify)

## Quick Start

Install dependencies:
```bash
npm install
```

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

# Run automated tests (builds first, then tests)
npm test

# Run tests without building (requires prior build)
npm run test-headless
```

## Testing Infrastructure

xiVIEW includes automated testing using QUnit and Puppeteer:

- **Test Location**: `tests/` directory
- **Test Files**: `qunit.html`, `qunit2.html` (browser), `tests.js`, `tests2.js` (logic), `clms-model-tests.js`
- **Test Data**: JSON test datasets (`10003.json`, `15884.json`, `blosums.json`)
- **Execution**: Headless browser testing via Puppeteer with local HTTP server
- **Coverage**: 67 tests covering data parsing, filtering, selection, scoring, alignment, distance calculations, and CSV export

The test runner automatically:
1. Starts a local HTTP server to serve test files
2. Launches headless Chrome to execute QUnit tests
3. Reports detailed results with pass/fail counts and timing

## Build System

- **Webpack**: Separate development and production configurations (`webpack.dev.js`, `webpack.prod.js`)
- **Entry Point**: `js/promises-load.js`
- **Output**: Builds to `dist/xiview.js` as UMD library
- **Babel**: ES2018 with preset-env for browser compatibility
- **ESLint**: Unix line endings, semicolons required, 4-space indentation

## Key Dependencies

- **d3** (~3.5.17) - Data visualization (note: intentionally staying on v3)
- **backbone** (~1.6.0) - MVC framework
- **jquery** (~3.7.1) - DOM manipulation
- **ngl** (~2.3.1) - 3D molecular visualization
- **datatables.net** - Data table components
- **split.js** - UI panel splitting

## Troubleshooting

### Build Failures

1. Check node version compatibility
2. Clear node_modules and reinstall:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

## Citations

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

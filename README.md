# xiVIEW

Interactive visualization of protein cross-linking mass spectrometry data sets.

## Component Overview

xiVIEW is the main application component within the build-xiview project. It provides the primary user interface, application logic, and coordinates with other submodules (CLMS-model, spectrum, crosslink-viewer) to deliver comprehensive cross-linking mass spectrometry data analysis and visualization.

## Architecture

### Key Features

- **Interactive Data Exploration**: Browse and filter cross-linking datasets
- **Multiple Visualization Modes**: Integrated spectrum and network views
- **Protein Structure Integration**: 3D visualization with NGL viewer
- **Data Management**: Import, export, and session management
- **Advanced Filtering**: Sophisticated data filtering and search capabilities

### Key Directories

- **`js/views/`**: UI view components using Backbone.js framework
- **`js/model/`**: Application-specific models extending CLMS-model
- **`js/filter/`**: Data filtering and search functionality
- **`js/controller/`**: Application controllers and event handling
- **`css/`**: Stylesheets for the main application
- **`images/`**: Icons, logos, and UI graphics

### Technology Stack

- **Backbone.js**: MVC framework for application structure
- **jQuery**: DOM manipulation and event handling
- **d3.js v3**: Data visualization (intentionally staying on v3)
- **NGL viewer**: 3D molecular structure visualization
- **DataTables**: Interactive data table components

## Development

### Branch Information
- **Current branch**: v2
- **Development branch**: v2

### Integration with build-xiview

xiVIEW is built as part of the parent build-xiview webpack configuration:
- Entry point: `js/promises-load.js`
- Build commands run from parent directory
- Dependencies managed by parent package.json

### Code Conventions

- **Framework**: Follow Backbone.js patterns for views and models
- **Naming**: camelCase for JavaScript, kebab-case for CSS
- **Dependencies**: Use libraries available in parent build system
- **Testing**: Tests located in `tests/` directory

## Integration Points

xiVIEW coordinates with other submodules:
- **CLMS-model**: Core data structures and business logic
- **spectrum**: Embedded spectrum visualization (xiSPEC)
- **crosslink-viewer**: Network visualization (xiNET)

Built by

[<img src="/images/logos/rappsilber-lab_blk.png">](http://rappsilberlab.org/rappsilber-laboratory-home-page/tools/xiview/ "Go To The Rappsilber Lab Home Page")

---

[<img src="/images/logos/wellcome-trust_blk.png">](https://wellcome.ac.uk/home "Go To The Wellcome Trust Home Page")

---
Browser cross-compatibility bug fixing aided by BrowserStack

[<img src="/images/logos/Browserstack-logo@2x.png">](https://www.browserstack.com "Go To BrowserStack.com")

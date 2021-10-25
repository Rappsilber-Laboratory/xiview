# xiSPEC mass spectrometry visualization tool - modular version

Citation: Lars Kolbowski, Colin Combe, Juri Rappsilber; xiSPEC: web-based visualization, analysis and sharing of proteomics data, Nucleic Acids Research, gky353, https://doi.org/10.1093/nar/gky353

### Note

Annotation of spectra is done per default via xiAnnotator (https://github.com/Rappsilber-Laboratory/xiAnnotator) set up on https://spectrumviewer.org/xiAnnotator/. Instructions for setting up your own copy of the xiAnnotator can be found here: https://github.com/Rappsilber-Laboratory/xiAnnotator/blob/master/doc/SysV/Readme.md

To change the xiAnnotatorURL use the xiAnnotatorBaseURL option. (If you use the default you may run into issues with CORS.)


### Examples
Please refer to the following examples of using xiSPEC in a html page:
  1. example_linear.html 	-- linear peptide example
  2. example_crosslink.html 	-- crosslinked peptide example
  

### Usage

To initialize the module create the xiSPEC app with your desired options:

targetDiv is the only required option.

```

var options = {
  targetDiv: 'xispec_wrapper'                 // id of your html target div for the spectrum viewer
  showCustomConfig: false,                    // show/hide custom annotation options tab in settings view
  showQualityControl: 'bottom',               // select where to show the quality control plots per default. values: 'bottom', 'side', 'min'
  baseDir:  './',                             // path to base directory of the spectrum viewer on your website
  xiAnnotatorBaseURL: 'https://spectrumviewer.org/xiAnnotator/',    // url of annotator change if you're hosting xiAnnotator yourself
  highlightColor: '#FFFF00',                  // initial highlight color (can be changed in settings)
  highlightWidth: 8,                          // highlight width
  peakColor: "#a6a6a6",                       // color for not annotated peaks
};

var xiSPEC = xispec.createApp(options);

```




To set the data call the setData function with the spectra data:
```
var data = {
      sequence1: sequence1,                     // sequence of peptide 1 incl. modifications
      sequence2: sequence2,                     // sequence of peptide 2 incl. modifications (for crosslinked peptide)
      linkPos1: linkPos1,                       // crosslinked residue on peptide 1 (for crosslinked peptide)
      linkPos2: linkPos2,                       // crosslinked residue on peptide 2 (for crosslinked peptide)
      crossLinkerModMass: crossLinkerModMass    // modification mass of the crosslinker (for crosslinked peptide)
      modifications: modifications,             // modification definitions
      precursorMz: precursorMz,                 // m/z of the precursor
      precursorCharge: precursorCharge,         // charge state of the precursor
      fragmentTolerance: fragmentTolerance;,    // tolerance for fragment annotation in the MS2 scan
      ionTypes: ionTypes,                       // ion types to annotate
      peakList: peakList                        // array of peaks
   }

xiSPEC.setData(data);
```

sequence1/2: Peptide sequence for peptide 1/2 in one letter amino acid code (uppercase) with modifications following the amino acid and consisting of the following characters: a-z:0-9.()\-

linkPos1/2: Position of crosslinked residue for peptide 1/2 (0-based)

crossLinkerModMass: Modification Mass of the crosslinker.

modifications: Array of modification definitions with id, mass and amino acid specificity e.g.
```
[
  {id: 'carbamidomethyl', mass: 57.021464, aminoAcids: ['K', 'H', 'C', 'D', 'E', 'S', 'T', 'Y']},
];
```

precursorMz: The m/z of the precursor ion. (optional)

precursorCharge: Charge state of the precursor ion.

fragmentTolerance: MS2 tolerance for annotating fragment peaks (in ppm or Da). e.g. ```{"tolerance": '10.0', 'unit': 'ppm'}```

ionTypes: Fragment ion types to annotate separated by semicolon e.g. ```"peptide;a;b;c;x;y;z"```

peakList: Array of peaks of the MS2 scan e.g. ```[[110.0714, 28063.6230], [118.08385, 2084.98925781], ...]```

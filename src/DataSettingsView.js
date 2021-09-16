import "../css/settings.css";
// import "../../xi3/css/xispecAdjust.css";
import 'datatables.net-dt/css/jquery.dataTables.css';

import * as _ from 'underscore';
import * as $ from "jquery";
import 'datatables.net';
import {SettingsView} from "./SettingsView";
import {PepInputView} from "./PepInputView";
import d3 from "d3";

export const DataSettingsView = SettingsView.extend({

    events: function() {
        return _.extend({}, SettingsView.prototype.events, {
            'click #xispec_toggleModifications': 'toggleModTable',
            'click #xispec_toggleLosses': 'toggleLossTable',
            'click #xispec_addNewLoss': 'addNewLoss',
            'click #xispec_toggleCustomCfgHelp': 'toggleCustomCfgHelp',
            'click #xispec_settingsCustomCfgApply': 'applyCustomCfg',
            'click #xispec_settingsCustomCfgDbSave': 'saveCustomCfg',
            'click #xispec_settingsAnnotatorApply': 'applyAnnotator',
            'submit #xispec_settingsForm': 'applyData',
            // 'keyup .stepInput' : 'updateStepSizeKeyUp',
            'change .xispec_ionSelectChkbox': 'updateIons',
        });
    },

    identifier: "Data Settings",

    initialize: function (options) {
        // load default options and super initialize the parent view
        const defaultOptions = {
            showCustomCfg: true,
            tabs: ["general", "custom config", "annotator"]
        };
        this.options = _.extend(defaultOptions, options);
        arguments[0] = this.options;
        DataSettingsView.__super__.initialize.apply(this, arguments);

        this.displayModel = this.options.displayModel;
        // event listeners
        this.listenTo(window.xiSPECUI.vent, 'dataSettingsToggle', this.toggleView);

        if (!this.options.showCustomCfg) {
            this.menu.selectAll('#custom_config').style("display", "none");
        }

        // general tab
        let generalTab = this.mainDiv.append("div")
            .attr("class", "xispec_settings-tab xispec_flex-column")
            .attr("id", "xispec_general_tab")
        ;

        let dataForm = generalTab.append("form")
            .attr("id", "xispec_settingsForm")
            .attr("method", "post")
            .attr("class", "xispec_flex-column")
        ;

        let topDataDiv = dataForm.append('div').attr('class', 'xispec_topDataDiv');
        let peptideLabel = topDataDiv.append("label").attr("class", "xispec_flex-row").text("Peptide Sequence: ");
        this.peptideViewEl = peptideLabel.append('div').attr('class', 'xispec_flex-grow').append("input")
            .attr("type", "text")
            .attr("required", "")
            .attr("autofocus", "")
            .attr("autocomplete", "off")
            .attr("placeholder", "Peptide Sequence1[;Peptide Sequence2]")
            .attr("name", "peps")
        ;
        this.pepInputView = new PepInputView({model: this.model, el: this.peptideViewEl[0]});

        let dataFlexRow = topDataDiv.append("div").attr("class", "xispec_flex-row xispec_splitDataDiv");

        let leftDiv = dataFlexRow.append("div").attr("class", "xispec_settingsDataLeft");

        this.peaklist = leftDiv.append("label").attr("class", "xispec_flex-column").attr("style", "height: 100%").text("Peak list (m/z\tintensity): ").append("textarea")
            .attr("required", "")
            .attr("id", "xispec_settingsPeaklist")
            .attr("type", "text")
            .attr("placeholder", "Peak List [m/z intensity]")
            .attr("name", "peaklist")
            .attr("class", "xispec_form-control")
        ;

        let rightDiv = dataFlexRow.append("div").attr("class", "xispec_settingsDataRight");

        let ionSelector = rightDiv.append("label").attr("class", "xispec_flex-row").text("Fragment Ions: ")
            .append("div").attr("class", "xispec_multiSelect_dropdown xispec_flex-grow")
        ;
        ionSelector.append("input")
            .attr("type", "text")
            .attr("class", "xispec_btn-drop")
            .attr("id", "xispec_ionSelection")
            .attr("readonly", "")
        ;
        let ionSelectorDropdown = ionSelector.append("div").attr("class", "xispec_multiSelect_dropdown-content");
        let ionSelectorList = ionSelectorDropdown.append("ul").attr("id", 'xispec_ionList');
        const ionOptions = [
            {value: "peptide", text: "Peptide Ion"},
            {value: "a", text: "A Ion"},
            {value: "b", text: "B Ion"},
            {value: "c", text: "C Ion"},
            {value: "x", text: "X Ion"},
            {value: "y", text: "Y Ion"},
            {value: "z", text: "Z Ion"},
        ];
        ionSelectorList.selectAll("li").data(ionOptions)
            .enter()
            .append("li").append("label")
            .append("input")
            .attr("class", "xispec_ionSelectChkbox")
            .attr("type", "checkbox")
            .attr("name", "ions[]")
            .attr("id", function (d) {
                return d.text.replace(" ", "");
            })
            .attr("value", function (d) {
                return d.value;
            })
        ;
        ionSelectorList.selectAll("label").data(ionOptions)
            .append('span')
            .text(function (d) {
                return d.text;
            })
        ;

        this.precursorZ = rightDiv.append("label").attr("class", "xispec_flex-row").text("Precursor charge state: ").append('div').attr('class', 'xispec_flex-grow')
            .append("input").attr("type", "number").attr("placeholder", "Charge").attr("autocomplete", "off").attr("name", "preCharge").attr("min", "1").attr("required", "")
        ;

        let toleranceWrapper = rightDiv.append("label").attr("class", "xispec_flex-row").text("MS2 tolerance: ");
        this.toleranceValue = toleranceWrapper.append('div').attr('class', 'xispec_flex-grow').append("input")
            .attr("type", "text")
            // .attr("type", "number")
            .attr("placeholder", "tolerance")
            .attr("autocomplete", "off")
            .attr("name", "ms2Tol")
            // .attr("min", "0")
            // .attr("step", "0.1")
            .attr("required", "")
        // .attr("class", "stepInput")
        ;
        this.toleranceUnit = toleranceWrapper.append('div').append("select")
            .attr("name", "tolUnit")
            .attr("required", "")
            .attr("style", "width: 65px; margin-left: 8px;")
            .attr("class", "xispec_form-control")
        ;
        this.toleranceUnit.append("option").attr("value", "ppm").text("ppm");
        this.toleranceUnit.append("option").attr("value", "Da").text("Da");

        this.crossLinkerModMassWrapper = rightDiv.append("label").attr("class", "xispec_flex-row").text("Cross-linker mod mass: ");

        this.crossLinkerModMass = this.crossLinkerModMassWrapper.append('div').attr('class', 'xispec_flex-grow')
            .append("input")
            .attr("placeholder", "CL mod mass")
            .attr("autocomplete", "off")
            .attr("name", "clModMass")
            .attr("required", "")
            .attr("type", "text")
        // .attr("type", "number")
        // .attr("step", "0.001")
        // .attr("class", "stepInput")
        ;

        // modTable
        let modToggle = dataForm.append('div')
            .attr('id', 'xispec_toggleModifications')
            .attr('class', 'pointer')
        ;
        modToggle.append('i').attr("class", "fa fa-minus-square").attr("aria-hidden", "true")
        modToggle.append('span').text(' Modifications:');

        this.modTableWrapper = dataForm.append("div")
            .attr("class", "xispec_settingsTable_wrapper xispec_form-control dataTables_wrapper")
        ;
        let modTable = this.modTableWrapper.append("table")
            .attr("id", "xispec_modificationTable")
            .attr("class", "xispec_settingsTable")
            .attr("style", "width: 100%")
        ;
        this.initializeModTable();
        //end modTable

        //lossTable
        let lossToggle = dataForm.append('div')
            .attr('id', 'xispec_toggleLosses')
            .attr('class', 'pointer')
        ;
        lossToggle.append('i').attr("class", "fa fa-plus-square pointer").attr("aria-hidden", "true");
        lossToggle.append('span').text(' Losses:').append('span');

        this.lossTableWrapper = dataForm.append("div")
            .attr("class", "xispec_settingsTable_wrapper xispec_form-control dataTables_wrapper")
            .style('display', 'none')
        ;
        let lossTable = this.lossTableWrapper.append("table")
            .attr("id", "xispec_lossTable")
            .attr("class", "xispec_settingsTable")
            .attr("style", "width: 100%")
        ;
        this.initializeLossTable();
        //end lossTable

        let dataBottom = dataForm.append("div").attr("class", "xispec_settings-bottom");

        let applyxispec_btn = dataBottom.append("input")
            .attr("class", "xispec_btn xispec_btn-1 xispec_btn-1a network-control")
            .attr("value", "Apply")
            .attr("id", "settingsDataApply")
            .attr("type", "submit")
        ;
        let cancelxispec_btn = dataBottom.append("input")
            .attr("class", "xispec_btn xispec_btn-1 xispec_btn-1a network-control xispec_settingsCancel")
            .attr("value", "Cancel")
            .attr("type", "button")
        ;
        
        //custom config
        let customConfigTab = this.mainDiv.append("div")
            .attr("class", "xispec_settings-tab xispec_flex-column")
            .attr("id", "xispec_custom_config_tab")
            .style("display", "none");
        let customConfigHelpToggle = customConfigTab.append('div')
            .attr('id', 'xispec_toggleCustomCfgHelp')
            .attr('class', 'pointer')
            .text('Help ')
            .append('i').attr("class", "fa fa-question-circle").attr("aria-hidden", "true");
        customConfigTab.append("textarea")
            .attr("id", "xispec_customCfgHelp")
            .attr("class", "xispec_form-control")
            .attr("style", "display:none")
            .text('# enable double fragmentation within one fragment\n# also fragmentation events on both peptides\nfragment:BLikeDoubleFragmentation\n\n# also match peaks if they are one Dalton off\n# assuming that sometimes the monoisotopic peak is missing\nMATCH_MISSING_MONOISOTOPIC:(true|false)');
        let customConfigInputLabel = customConfigTab.append('label')
            .attr("for", "xispec_settingsCustomCfg-input")
            .text('Custom config input:');
        this.customConfigInput = customConfigTab.append("textarea")
            .attr("id", "xispec_settingsCustomCfg-input")
            .attr("class", "xispec_form-control");

        let customConfigBottom = customConfigTab.append("div")
            .attr("class", "xispec_settings-bottom");

        // customConfigBottom.append("label").text("keep config")
        // 	.append("input")
        // 		.attr("type", "checkbox")
        // 		.attr("name", "keepCustomCfg")
        // 		.attr("id", "xispec_keepCustomCfg")
        // ;
        let customConfigSubmit = customConfigBottom.append("input")
            .attr("class", "xispec_btn xispec_btn-1 xispec_btn-1a network-control")
            .attr("value", "Apply")
            .attr("title", "Apply custom config to current spectrum.")
            .attr("id", "xispec_settingsCustomCfgApply")
            .attr("type", "submit");


        let customConfigDbSave = customConfigBottom.append("input")
            .attr("class", "xispec_btn xispec_btn-1 xispec_btn-1a network-control")
            .attr("value", "Save for whole dataset")
            .attr("title", "Write the current custom config to the database.")
            .attr("id", "xispec_settingsCustomCfgDbSave")
            .attr("type", "submit");
        if (window.dbView !== 'true') {
            customConfigDbSave.style("display", "none");
        }

        let customConfigCancel = customConfigBottom.append("input")
            .attr("class", "xispec_btn xispec_btn-1 xispec_btn-1a network-control xispec_settingsCancel")
            .attr("value", "Cancel")
            .attr("type", "button");

        // annotatorTab
        let annotatorTab = this.mainDiv.append("div")
            .attr("class", "xispec_settings-tab xispec_flex-column")
            .attr("id", "xispec_annotator_tab")
            .style("display", "none");

        let annotatorWrapper = annotatorTab.append("label")
            .attr("class", "xispec_label")
            .text("Choose Annotator to use: ");

        this.annotatorDropdown = annotatorWrapper.append("select")
            .attr("name", "annotator")
            .attr("class", "xispec_form-control")
            .attr('id', 'xispec_annotatorDropdown')
        ;
        this.annotatorDropdown.append("option").attr("value", "annotate/FULL").text("classic");
        this.annotatorDropdown.append("option").attr("value", "test/FULL").text("test");
        let annotatorBottom = annotatorTab.append("div")
            .attr("class", "xispec_settings-bottom");
        let annotatorSubmit = annotatorBottom.append("input")
            .attr("class", "xispec_btn xispec_btn-1 xispec_btn-1a network-control")
            .attr("value", "Apply")
            .attr("id", "xispec_settingsAnnotatorApply")
            .attr("type", "submit");

        let annotatorCancel = annotatorBottom.append("input")
            .attr("class", "xispec_btn xispec_btn-1 xispec_btn-1a network-control xispec_settingsCancel")
            .attr("value", "Cancel")
            .attr("type", "button");
        // end Tabs

        let d3el = d3.select(this.el);
        d3el.selectAll("label").classed("xispec_label", true);
        d3el.selectAll("input[type=text]").classed("xispec_form-control", true);
        d3el.selectAll("input[type=number]").classed("xispec_form-control", true);
        d3el.selectAll("input[type=textarea]").classed("xispec_form-control", true);
        d3el.selectAll('select').style("cursor", "pointer");

        // borrowed from CLMSUI.BaseframeView
        // add drag listener to four corners to call resizing locally rather than through dyn_div's api,
        // which loses this view context
        let self = this;
        let drag = d3.behavior.drag().on("dragend", function () {
            self.modTable.draw();
            self.lossTable.draw();
        });
        this.wrapper.selectAll(".draggableCorner").call(drag);

    },

    render: function () {
        if (!this.isVisible) return;

        this.pepInputView.render();

        this.renderModTable();
        this.renderLossTable();

        //ions
        $('.xispec_ionSelectChkbox:checkbox').prop('checked', false);
        this.model.fragmentIons.forEach(function (ion) {
            $('#' + ion.type).prop('checked', true);
        });
        let ionSelectionArr = [];
        $('.xispec_ionSelectChkbox:checkbox:checked').each(function () {
            ionSelectionArr.push($(this).val());
        });
        $('#xispec_ionSelection').val(ionSelectionArr.join(", "));

        this.peaklist[0][0].value = this.model.peaksToMGF();
        this.precursorZ[0][0].value = this.model.precursor.charge;
        this.toleranceValue[0][0].value = this.model.MSnTolerance.tolerance;
        this.toleranceUnit[0][0].value = this.model.MSnTolerance.unit;
        this.crossLinkerModMass[0][0].value = this.model.crossLinkerModMass;
        this.annotatorDropdown[0][0].value = this.displayModel.get('annotatorURL');
        if (this.model.isLinear)
            $(this.crossLinkerModMassWrapper[0][0]).hide();
        else
            $(this.crossLinkerModMassWrapper[0][0]).show();

        if (this.model.customConfig !== undefined)
            this.customConfigInput[0][0].value = this.model.customConfig.join("\n");
        else
            this.customConfigInput[0][0].value = '';
        // this.updateStepSize($(this.toleranceValue[0][0]));
        // this.updateStepSize($(this.crossLinkerModMass[0][0]));
    },

    reset: function(){
        // resetModel: ToDo: move to xiSPEC Wrapper? change to cloning of models?
        // used to reset SettingsModel
        if (this.displayModel.get("JSONdata") == null) return;
        let json_data_copy = $.extend({}, this.displayModel.get("JSONdata"));
        let json_request_copy = $.extend({}, this.displayModel.get("JSONrequest"));
        this.knownModifications = $.extend(true, [], this.displayModel.knownModifications);
        this.model.set({"JSONdata": json_data_copy, "JSONrequest": json_request_copy});
        this.model.trigger("change:JSONdata");
    },

    applyCustomCfg: function (e) {
        let json = this.model.get("JSONrequest");
        json.annotation.custom = $("#xispec_settingsCustomCfg-input").val().split("\n");
        window.xiSPECUI.vent.trigger('requestAnnotation', json, this.displayModel.get('annotatorURL'));
        this.displayModel.set('changedAnnotation', true);
        // this.render();
    },

    saveCustomCfg: function (e) {
        let self = this;
        e.preventDefault();
        let customConfig = $("#xispec_settingsCustomCfg-input").val();
        let post_data = {
            custom_config: customConfig,
        };
        $.ajax({
            url: "/php/saveCustomCfg.php",
            type: 'POST',
            data: post_data,
            success: function (data) {
                customConfig = customConfig.split("\n");
                // add custom config to current json request
                let json = self.model.get("JSONrequest");
                json.annotation.custom = customConfig;
                // overwrite customConfig on current wrapper
                window.xiSPECUI.vent.trigger('setCustomConfigOverwrite', customConfig);
                // request current spectrum with updated custom config as original annotation
                window.xiSPECUI.vent.trigger('requestAnnotation', json_req, this.displayModel.get('annotatorURL'), true);
            }
        });
    },

    applyAnnotator: function (e) {
        e.preventDefault();
        let json = this.model.get("JSONrequest");
        this.displayModel.set('annotatorURL', $('#xispec_annotatorDropdown').val());
        window.xiSPECUI.vent.trigger('requestAnnotation', json, this.displayModel.get('annotatorURL'));
        this.displayModel.set('changedAnnotation', true);
    },

    applyData: function (e) {

        e.preventDefault();

        let form = e.currentTarget;
        //Todo error handling!
        if (!this.checkInputsForValidity(form)) {
            console.log('Invalid character found in form');
            return false;
        }
        let self = this;
        let formData = new FormData($(form)[0]);
        $('#xispec_settingsForm').hide();
        let spinner = new Spinner({scale: 5}).spin(d3.select("#xispec_settings_main").node());

        $.ajax({
            url: self.model.get('baseDir') + "php/formToJson.php",
            type: 'POST',
            data: formData,
            async: false,
            cache: false,
            contentType: false,
            processData: false,
            success: function (response) {
                let json = JSON.parse(response);
// 				json['annotation']['custom'] = self.displayModel.customConfig;
                json['annotation']['custom'] = self.displayModel.get("JSONdata").annotation.custom;
                json['annotation']['precursorMZ'] = self.displayModel.precursor.expMz;
                json['annotation']['requestID'] = window.xiSPECUI.lastRequestedID + Date.now();
                window.xiSPECUI.vent.trigger('requestAnnotation', json, self.displayModel.get('annotatorURL'));
                self.displayModel.set('changedAnnotation', true);
                self.displayModel.knownModifications = $.extend(true, [], self.model.knownModifications);
                spinner.stop();
                $('#xispec_settingsForm').show();
            }
        });
        return false;
    },

    //ToDo: improve error handling to be more informative - display outside of console
    checkInputsForValidity: function (formData) {

        let invalidChars = function (input, unknownCharPattern) {
            let match = input.match(unknownCharPattern);
            if (match) {
                return match[0];
            }
            return false;
        }

        // peptideStr
        var invalidChar = invalidChars(formData['peps'].value, /([^GALMFWKQESPVICYHRNDTXa-z:;#0-9(.)\-]+)/);
        if (invalidChar) {
            alert('Invalid character(s) in peptide sequence: ' + invalidChar);
            return false;
        }

        // peakList
        var invalidChar = invalidChars(formData['peaklist'].value, /([^0-9\.\s]+)/);
        if (invalidChar) {
            alert('Invalid character(s) in peak list: ' + invalidChar);
            return false;
        }
        // clModMass
        var invalidChar = invalidChars(formData['clModMass'].value, /([^0-9\.\-]+)/);
        if (invalidChar) {
            alert('Invalid character(s) in cros-linker modmass: ' + invalidChar);
            return false;
        }
        // precursor charge state
        var invalidChar = invalidChars(formData['preCharge'].value, /([^0-9]+)/);
        if (invalidChar) {
            alert('Invalid character(s) in charge state: ' + invalidChar);
            return false;
        }
        // ms2Tolerance
        var invalidChar = invalidChars(formData['ms2Tol'].value, /([^0-9\.]+)/);
        if (invalidChar) {
            alert('Invalid character(s) in ms2Tolerance: ' + invalidChar);
            return false;
        }


        // modifications
        if (formData['mods[]']) {
            const inputMods = this.extractModsFromPepStr(this.model.pepStrsMods.join(''));

            if (formData['mods[]'][0] === undefined) {
                var formDataMods = new Array(formData['mods[]']);
                var formDataSpecificities = new Array(formData['modSpecificities[]'])
            } else {
                var formDataMods = formData['mods[]'];
                var formDataSpecificities = formData['modSpecificities[]'];
            }

            for (let i = 0; i < formDataMods.length; i++) {
                let formDataAminoAcidsArr = formDataSpecificities[i].value.split('');

                let inputMod = inputMods.filter(function (mod) {
                    return mod.id == formDataMods[i].value
                })[0];
                let inputAminoAcidsArr = inputMod.aminoAcids.split('');

                if (formDataAminoAcidsArr.indexOf('*') != -1) {
                    console.log('ok', formDataMods[i].value);
                    // return true;
                } else {
                    for (let j=0; j < inputAminoAcidsArr.length; j++) {
                        if (formDataAminoAcidsArr.indexOf(inputAminoAcidsArr[j]) == -1) {
                            console.log('not ok', formDataMods[i].value);
                            alert('Invalid modification specificity for: ' + formDataMods[i].value);
                            return false;
                        }
                        // else{
                        // 	console.log('ok', formDataMods[i].value);
                        // 	return true;
                        // };
                    }
                }
            }
        }
        return true;

    },

    initializeModTable: function () {
        let self = this;
        let tableVars = {
            "scrollCollapse": true,
            "paging": false,
            "ordering": false,
            "info": false,
            "searching": false,
            "columns": [
                {"title": "Mod-Input", "className": "invisible"},
                {"title": "Modification", "className": "dt-center"},
                {"title": "Mass", "className": "dt-center"},
                {"title": "Specificity", "className": "dt-center"},
            ],
            "columnDefs": [
                {
                    "render": function (data, type, row, meta) {
                        return '<input class="xispec_form-control" id="modName_' + meta.row + '" title="modification code" name="mods[]" readonly type="text" value=' + data + '>';
                    },
                    "class": "invisible",
                    "targets": 0,
                },
                {
                    "render": function (data, type, row, meta) {
                        return row[0] + '<i class="fa fa-undo xispec_resetMod" title="reset modification to default" aria-hidden="true"></i></span>';
                    },
                    "targets": 1,
                },
                {
                    "render": function (data, type, row, meta) {
                        data = 0;

                        let rowNode = self.modTable.rows(meta.row).nodes().to$();

                        for (let i = 0; i < self.model.knownModifications.length; i++) {
                            if (self.model.knownModifications[i].id === row[0]) {
                                data = self.model.knownModifications[i].mass;
                                if (self.model.knownModifications[i].changed) {
                                    displayModified(rowNode);
                                }
                            }
                        }
                        data = parseFloat(parseFloat(data).toFixed(10).toString()); // limit to 10 decimal places and get rid of tailing zeroes
                        // if (data.toString().indexOf('.') !== -1)
                        //     let stepSize = '0.' + '0'.repeat(data.toString().split('.')[1].length - 1) + 1;
                        // else
                        //     let stepSize = 1;
                        return '<input class="xispec_form-control stepInput" id="modMass_' + meta.row + '" row="' + meta.row + '" title="modification mass" name="modMasses[]" type="text" required value=' + data + ' autocomplete=off>';
                    },
                    "targets": 2,
                },
                {
                    "render": function (data, type, row, meta) {
                        if (self.model.knownModifications !== undefined) {
                            for (let i = 0; i < self.model.knownModifications.length; i++) {
                                if (self.model.knownModifications[i].id == row[0]) {
                                    data = data.split("");
                                    if (self.model.knownModifications[i].aminoAcids == '*')
                                        data = '*';
                                    else {
                                        data = _.union(data, self.model.knownModifications[i].aminoAcids);
                                        data.sort();
                                        data = data.join("");
                                    }
                                    // let found = true;
                                }
                            }
                        }
                        data = data.split(",").join("");
                        return '<input class="xispec_form-control" id="modSpec_' + meta.row + '" row="' + meta.row + '" title="amino acids that can be modified" name="modSpecificities[]" type="text" required value=' + data + ' autocomplete=off>'
                    },
                    "targets": 3,
                }
            ]
        };
        let $modTable = $('#xispec_modificationTable')

        this.modTable = $modTable.DataTable(tableVars);

        //ToDo: change to BB event handling
        $modTable.on('input', 'input', function () {
            let row = this.getAttribute("row");
            let modName = $('#modName_' + row).val();
            let modMass = parseFloat($('#modMass_' + row).val());
            let modSpec = $('#modSpec_' + row).val();

            let mod = {'id': modName, 'mass': modMass, 'aminoAcids': modSpec.split('')};

            let updatedMod = self.model.updateModification(mod);
            if (!updatedMod.userMod)
                displayModified($(this).closest("tr"));
        });

        let displayModified = function (row) {
            row.addClass('userModified');
            row.find(".xispec_resetMod").css("visibility", "visible");
        }

        $modTable.on('click', '.xispec_resetMod', function () {
            let modId = $(this).parent()[0].innerText;
            self.model.resetModification(modId);
            self.renderModTable();
        });

    },

    initializeLossTable: function () {
        let self = this;
        let tableVars = {
            "scrollCollapse": true,
            "paging": false,
            "ordering": false,
            "info": false,
            "searching": false,
            "data": this.model.losses,
            "columns": [
                {},
                {
                    "title": 'Neutral Loss <i id="xispec_addNewLoss" class="fa fa-plus-circle" aria-hidden="true" title="add new neutral loss"></i>',
                    "className": "dt-center"
                },
                {"title": "Mass", "className": "dt-center"},
                {"title": "Specificity", "className": "dt-center"},
            ],
            "columnDefs": [
                {
                    "render": function (data, type, row, meta) {
                        return '<i class="fa fa-trash xispec_deleteLoss" title="delete neutral loss" aria-hidden="true">';
                    },
                    "targets": 0,
                },
                {
                    "render": function (data, type, row, meta) {
                        return '<input class="xispec_form-control" style="width:100px" id="lossName_' + meta.row + '" title="neutral loss name" name="losses[]" type="text" value=' + data + '>';
                    },
                    "targets": 1,
                },
                {
                    "render": function (data, type, row, meta) {
                        return '<input class="xispec_form-control stepInput" style="width:120px" id="lossMass_' + meta.row + '" row="' + meta.row + '" title="neutral loss mass" name="lossMasses[]" type="text" required value=' + data + ' autocomplete=off>';
                    },
                    "targets": 2,
                },
                {
                    "render": function (data, type, row, meta) {
                        data = data.join(", ");
                        return '<input class="xispec_form-control" id="lossSpec_' + meta.row + '" row="' + meta.row + '" title="neutral loss specificity" name="lossSpecificities[]" type="text" required value="' + data + '" autocomplete=off>'
                    },
                    "targets": 3,
                }
            ]
        };

        this.lossTable = $('#xispec_lossTable').DataTable(tableVars);

        $('#xispec_lossTable ').on('click', '.xispec_deleteLoss', function () {
            self.lossTable
                .row($(this).parents('tr'))
                .remove()
                .draw();
        });

        // ToDO:
        // $('#xispec_lossTable').on('click', '.xispec_resetLoss', function() {
        // 	let id = $(this).parent()[0].innerText;
        // 	self.model.resetLoss(id);
        // 	self.renderLossTable();
        // });

    },

    extractModsFromPepStr: function (pepStrMods) {
        let modifications = [];
        const re = /[^A-Z]+/g;
        let result;
        while (result = re.exec(pepStrMods)) {

            let new_mod = {};
            new_mod.id = result[0];
            new_mod.aminoAcids = pepStrMods[result.index - 1];

            let found = false;
            for (let i = 0; i < modifications.length; i++) {
                if (modifications[i].id === new_mod.id) {
                    found = true;
                    if (modifications[i].aminoAcids.indexOf(new_mod.aminoAcids) === -1)
                        modifications[i].aminoAcids += new_mod.aminoAcids;
                    break;
                }
            }
            if (!found) modifications.push(new_mod);
        }

        return modifications;
    },

    renderModTable: function () {

        // ToDo: modifications might be better placed inside model
        let modifications = this.extractModsFromPepStr(this.model.pepStrsMods.join(''));

        let self = this;
        this.modTable.clear();

        if (modifications.length === 0) {
            this.modTable.draw(false);
            this.hideModTable();
        } else {
            this.showModTable();
            modifications.forEach(function (mod) {
                self.modTable.row.add([
                    mod.id,
                    mod.id,
                    0,
                    mod.aminoAcids,
                ]).draw(false);
            });
        }
    },

    hideModTable: function () {
        $('#xispec_toggleModifications').find(".fa-minus-square").removeClass("fa-minus-square").addClass("fa-plus-square");
        $(this.modTableWrapper.node()).hide();
    },

    showModTable: function () {
        $('#xispec_toggleModifications').find(".fa-plus-square").removeClass("fa-plus-square").addClass("fa-minus-square");
        $(this.modTableWrapper.node()).show();
    },

    toggleModTable: function () {
        if ($(this.modTableWrapper.node()).is(":visible")) {
            $('#xispec_toggleModifications').find(".fa-minus-square").removeClass("fa-minus-square").addClass("fa-plus-square");
        } else {
            $('#xispec_toggleModifications').find(".fa-plus-square").removeClass("fa-plus-square").addClass("fa-minus-square");
        }
        $(this.modTableWrapper.node()).toggle();
    },

    addNewLoss: function () {
        console.log('new loss');
        this.lossTable.row.add([
            '',
            '',
            0,
            [],
        ]).draw(false);
    },

    toggleLossTable: function () {
        if ($(this.lossTableWrapper.node()).is(":visible")) {
            $('#xispec_toggleLosses').find(".fa-minus-square").removeClass("fa-minus-square").addClass("fa-plus-square");
        } else {
            $('#xispec_toggleLosses').find(".fa-plus-square").removeClass("fa-plus-square").addClass("fa-minus-square");
        }
        $(this.lossTableWrapper.node()).toggle();
    },

    renderLossTable: function () {
        let self = this;
        let losses = this.model.losses;
        this.lossTable.clear();

        if (losses.length === 0) {
            this.lossTable.draw(false);
        } else {
            losses.forEach(function (loss) {
                self.lossTable.row.add([
                    '',
                    loss.id,
                    loss.mass,
                    loss.specificity,
                ]).draw(false);
            });
        }
    },

    toggleCustomCfgHelp: function () {
        $('#xispec_customCfgHelp').toggle();
    },

    // updateStepSizeKeyUp: function(e){
    // 	this.updateStepSize($(e.target));
    // },
    //
    // updateStepSize: function($target){
    // 	// let $target = $(e.target);
    // 	//update stepsize
    // 	if ($target.prop('value').toString().split('.')[1])
    // 		let stepSize = '0.'+'0'.repeat($target.prop('value').toString().split('.')[1].length - 1) + '1';
    // 	else {
    // 		//min stepsize to 0.1 -- can't read out 0. from target value
    // 		let stepSize = 0.1;
    // 	}
    // 	$target.attr('step', stepSize);
    // 	$target.attr('value', $target.prop('value'));
    // },

    updateIons: function () {
        let ionSelectionArr = [];
        $('.xispec_ionSelectChkbox:checkbox:checked').each(function () {
            ionSelectionArr.push($(this).val());
        });

        if (ionSelectionArr.length === 0)
            $('#xispec_ionSelection').val("Select ions...");
        else
            $('#xispec_ionSelection').val(ionSelectionArr.join(", "));
    },

    modelChanged: function () {
        // update pepInputView model
        this.pepInputView.model = this.model;
        DataSettingsView.__super__.modelChanged.apply(this);
    },
});

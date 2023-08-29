import "../css/settings.css";
// import "../../xi3/css/xispecAdjust.css";
import "datatables.net-dt/css/jquery.dataTables.css";

import * as _ from "underscore";
import * as $ from "jquery";
import "datatables.net";
import {SettingsView} from "./SettingsView";
import {PepInputView} from "./PepInputView";
import d3 from "d3";

export const DataSettingsView = SettingsView.extend({

    events: function () {
        return _.extend({}, SettingsView.prototype.events, {
            "click #xispec_toggleModifications": "toggleModTable",
            "click #xispec_toggleLosses": "toggleLossTable",
            "click #xispec_addNewLoss": "addNewLoss",
            "click #xispec_toggleCustomCfgHelp": "toggleCustomCfgHelp",
            "click #xispec_settingsCustomCfgApply": "applyCustomCfg",
            "click #xispec_settingsCustomCfgDbSave": "saveCustomCfg",
            "click #xispec_settingsAnnotatorApply": "applyAnnotator",
            "submit #xispec_settingsForm": "applyData",
            // 'keyup .stepInput' : 'updateStepSizeKeyUp',
            "change .xispec_ionSelectChkbox": "updateIons",
        });
    },

    identifier: "Data Settings",

    initialize: function (options) {
        // load default options and super initialize the parent view
        const defaultOptions = {
            showCustomCfg: true,
            tabs: ["general", "custom config"] //, "annotator"] disabled, all xi2 for now
        };
        this.options = _.extend(defaultOptions, options);
        arguments[0] = this.options;
        DataSettingsView.__super__.initialize.apply(this, arguments);

        this.displayModel = this.options.displayModel;
        // event listeners
        this.listenTo(window.xiSPECUI.vent, "dataSettingsToggle", this.toggleView);

        if (!this.options.showCustomCfg) {
            this.menu.selectAll("#xispec_custom_config_Btn").style("display", "none");
        }

        // general tab
        let generalTab = this.mainDiv.append("div")
            .attr("class", "xispec_settings-tab xispec_flex-column")
            .attr("id", "xispec_general_tab");
        let dataForm = generalTab.append("form")
            .attr("id", "xispec_settingsForm")
            .attr("method", "post")
            .attr("class", "xispec_flex-column");
        let topDataDiv = dataForm.append("div").attr("class", "xispec_topDataDiv");
        let peptideLabel = topDataDiv.append("label").attr("class", "xispec_flex-row").text("Peptide Sequence: ");
        this.peptideViewEl = peptideLabel.append("div").attr("class", "xispec_flex-grow").append("input")
            .attr("type", "text")
            .attr("required", "")
            .attr("autofocus", "")
            .attr("autocomplete", "off")
            .attr("placeholder", "Peptide Sequence1[;Peptide Sequence2]")
            .attr("name", "peps");
        this.pepInputView = new PepInputView({model: this.model, el: this.peptideViewEl[0]});

        let dataFlexRow = topDataDiv.append("div").attr("class", "xispec_flex-row xispec_splitDataDiv");

        let leftDiv = dataFlexRow.append("div").attr("class", "xispec_settingsDataLeft");

        this.peaklist = leftDiv.append("label").attr("class", "xispec_flex-column").attr("style", "height: 100%").text("Peak list (m/z\tintensity): ").append("textarea")
            .attr("required", "")
            .attr("id", "xispec_settingsPeaklist")
            .attr("type", "text")
            .attr("placeholder", "Peak List [m/z intensity]")
            .attr("name", "peaklist")
            .attr("class", "xispec_form-control");
        let rightDiv = dataFlexRow.append("div").attr("class", "xispec_settingsDataRight");

        let ionSelector = rightDiv.append("label").attr("class", "xispec_flex-row").text("Fragment Ions: ")
            .append("div").attr("class", "xispec_multiSelect_dropdown xispec_flex-grow");
        ionSelector.append("input")
            .attr("type", "text")
            .attr("class", "xispec_btn-drop")
            .attr("id", "xispec_ionSelection")
            .attr("readonly", "");
        let ionSelectorDropdown = ionSelector.append("div").attr("class", "xispec_multiSelect_dropdown-content");
        let ionSelectorList = ionSelectorDropdown.append("ul").attr("id", "xispec_ionList");
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
            });
        ionSelectorList.selectAll("label").data(ionOptions)
            .append("span")
            .text(function (d) {
                return d.text;
            });
        this.precursorZ = rightDiv.append("label").attr("class", "xispec_flex-row").text("Precursor charge state: ").append("div").attr("class", "xispec_flex-grow")
            .append("input").attr("type", "number").attr("placeholder", "Charge").attr("autocomplete", "off").attr("name", "preCharge").attr("min", "1").attr("required", "");
        let toleranceWrapper = rightDiv.append("label").attr("class", "xispec_flex-row").text("MS2 tolerance: ");
        this.toleranceValue = toleranceWrapper.append("div").attr("class", "xispec_flex-grow").append("input")
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
        this.toleranceUnit = toleranceWrapper.append("div").append("select")
            .attr("name", "tolUnit")
            .attr("required", "")
            .attr("style", "width: 65px; margin-left: 8px;")
            .attr("class", "xispec_form-control");
        this.toleranceUnit.append("option").attr("value", "ppm").text("ppm");
        this.toleranceUnit.append("option").attr("value", "Da").text("Da");

        this.crossLinkerModMassWrapper = rightDiv.append("label").attr("class", "xispec_flex-row").text("Crosslinker mod mass: ");

        this.crossLinkerModMass = this.crossLinkerModMassWrapper.append("div").attr("class", "xispec_flex-grow")
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
        let modToggle = dataForm.append("div")
            .attr("id", "xispec_toggleModifications")
            .attr("class", "pointer");
        modToggle.append("i").attr("class", "fa fa-minus-square").attr("aria-hidden", "true");
        modToggle.append("span").text(" Modifications:");

        this.modTableWrapper = dataForm.append("div")
            .attr("class", "xispec_settingsTable_wrapper xispec_form-control dataTables_wrapper");
        let modTable = this.modTableWrapper.append("table")
            .attr("id", "xispec_modificationTable")
            .attr("class", "xispec_settingsTable")
            .attr("style", "width: 100%");
        this.initializeModTable();
        //end modTable

        //lossTable
        let lossToggle = dataForm.append("div")
            .attr("id", "xispec_toggleLosses")
            .attr("class", "pointer");
        lossToggle.append("i").attr("class", "fa fa-plus-square pointer").attr("aria-hidden", "true");
        lossToggle.append("span").text(" Losses:").append("span");

        this.lossTableWrapper = dataForm.append("div")
            .attr("class", "xispec_settingsTable_wrapper xispec_form-control dataTables_wrapper")
            .style("display", "none");
        let lossTable = this.lossTableWrapper.append("table")
            .attr("id", "xispec_lossTable")
            .attr("class", "xispec_settingsTable")
            .attr("style", "width: 100%");
        this.initializeLossTable();
        //end lossTable

        let dataBottom = dataForm.append("div").attr("class", "xispec_settings-bottom");

        let applyxispec_btn = dataBottom.append("input")
            .attr("class", "xispec_btn xispec_btn-1 xispec_btn-1a network-control")
            .attr("value", "Apply")
            .attr("id", "settingsDataApply")
            .attr("type", "submit");
        let cancelxispec_btn = dataBottom.append("input")
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
            .attr("id", "xispec_annotatorDropdown");
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
        d3el.selectAll("select").style("cursor", "pointer");

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

        // make sure the knownModifications are in sync
        this.model.knownModifications = $.extend(true, [], this.displayModel.knownModifications);

        this.pepInputView.render();
        this.renderModTable();
        this.renderLossTable();

        //ions
        $(".xispec_ionSelectChkbox:checkbox").prop("checked", false);
        this.model.fragmentIons.forEach(function (ion) {
            $("#" + ion.type).prop("checked", true);
        });
        let ionSelectionArr = [];
        $(".xispec_ionSelectChkbox:checkbox:checked").each(function () {
            ionSelectionArr.push($(this).val());
        });
        $("#xispec_ionSelection").val(ionSelectionArr.join(", "));

        this.peaklist[0][0].value = this.model.peaksToMGF();
        this.precursorZ[0][0].value = this.model.precursor.charge;
        this.toleranceValue[0][0].value = this.model.MSnTolerance.tolerance;
        this.toleranceUnit[0][0].value = this.model.MSnTolerance.unit;
        this.crossLinkerModMass[0][0].value = this.model.crossLinkerModMass;
        this.annotatorDropdown[0][0].value = this.displayModel.get("annotatorURL");
        if (this.model.isLinear)
            $(this.crossLinkerModMassWrapper[0][0]).hide();
        else
            $(this.crossLinkerModMassWrapper[0][0]).show();

        // this.updateStepSize($(this.toleranceValue[0][0]));
        // this.updateStepSize($(this.crossLinkerModMass[0][0]));
    },

    reset: function () {
        // resetModel: ToDo: move to xiSPEC Wrapper? change to cloning of models?
        // used to reset SettingsModel
        if (this.displayModel.get("JSONdata") == null) return;
        let json_data_copy = $.extend({}, this.displayModel.get("JSONdata"));
        let json_request_copy = $.extend({}, this.displayModel.get("JSONrequest"));
        this.model.knownModifications = $.extend(true, [], this.displayModel.knownModifications);
        this.model.set({"JSONdata": json_data_copy, "JSONrequest": json_request_copy});
        this.model.trigger("change:JSONdata");
    },

    applyCustomCfg: function () {
        let json = this.model.get("JSONrequest");
        json.annotation.custom = $("#xispec_settingsCustomCfg-input").val().split("\n");
        window.xiSPECUI.vent.trigger("requestAnnotation", json, this.displayModel.get("annotatorURL"));
        this.displayModel.set("changedAnnotation", true);
        // this.render();
    },

    applyAnnotator: function (e) {
        e.preventDefault();
        let json = this.model.get("JSONrequest");
        this.displayModel.set("annotatorURL", $("#xispec_annotatorDropdown").val());
        window.xiSPECUI.vent.trigger("requestAnnotation", json, this.displayModel.get("annotatorURL"));
        this.displayModel.set("changedAnnotation", true);
    },

    applyData: function (e) {

        e.preventDefault();

        let form = e.currentTarget;
        //Todo error handling!
        if (!this.checkInputsForValidity(form)) {
            console.log("Invalid character found in form");
            return false;
        }

        // If xi2 config is defined modify the config and send the JSON request
        let json_request;
        if (this.model.get("JSONrequest").annotation.config !== undefined){
            json_request = this.form_to_json_request_xi2(form);
        } else {
            // convert the form data into a JSON request
            json_request = this.form_to_json_request(form);
        }


        json_request["annotation"]["custom"] = this.displayModel.get("JSONdata").annotation.custom;
        json_request["annotation"]["precursorMZ"] = this.displayModel.precursor.expMz;
        json_request["annotation"]["requestID"] = window.xiSPECUI.lastRequestedID + Date.now();
        json_request["annotation"]["returnModSyntax"] = "Xmod";
        window.xiSPECUI.vent.trigger("requestAnnotation", json_request, this.displayModel.get("annotatorURL"));
        this.displayModel.set("changedAnnotation", true);
        this.displayModel.knownModifications = $.extend(true, [], this.model.knownModifications);

        return false;
    },

    form_to_json_request_xi2: function (form) {

        let xi2_request = this.model.get("JSONrequest");
        let xi2_config = xi2_request.annotation.config;
        // convert form to json
        // peptides & linkSites block
        let linkSitesJSON = Array();
        let peptidesJSON = Array();

        let formData = new FormData(form);

        function pep_to_array(pep_str){
            let pepArray = Array();
            let pep = pep_str.replace(/#\d?/g , "");
            let matches = pep.matchAll(/([A-Z][^A-Z]*)/g);
            for (let AAmod of matches){
                pepArray.push({"aminoAcid": AAmod[0][0], "Modification": AAmod[0].slice(1)});
            }
            return {"sequence": pepArray};
        }
        let peps = formData.get("peps").split(";");
        for (let i = 0; i < peps.length; i++) {
            // create peptide JSON
            peptidesJSON.push(pep_to_array(peps[i]));
            // create linkSite JSON
            let pep_noMods = peps[i].replace(/[^A-Z#]+/g , "");
            let link_pos = pep_noMods.indexOf("#")-1;
            let linkSite = {"id": 0, "peptideId": i, "linkSite": link_pos};
            linkSitesJSON.push(linkSite);
        }
        // peak block
        let peaks = formData.get("peaklist").trim().split(/[\r\n]/);
        let peaksJSON = peaks.map(function(p){
            p = p.split(/\s/);
            return {"mz": p[0], "intensity": p[1]};
        });
        // xi2 config - modifications
        let mods_xi2 = Array();
        let mods = formData.getAll("mods[]");
        let modSpecs = formData.getAll("modSpecificities[]");
        let modMasses = formData.getAll("modMasses[]");
        for (let i = 0; i < mods.length; i++) {
            // split after , and trim whitespaces
            let modSpec = modSpecs[i].split(",").map(function(l){
                return l.trim();
            });
            // remove empty elements
            modSpec = modSpec.filter(function(ms){
                if (ms !== "")
                    return ms;
            });
            mods_xi2.push({
                "name": mods[i],
                "specificity": modSpec,
                "mass": modMasses[i]
            });
        }
        xi2_config.modification.modifications = mods_xi2;

        // xi2 config - losses
        let loss_xi2 = Array();
        let losses = formData.getAll("losses[]");
        let lossSpecs = formData.getAll("lossSpecificities[]");
        let lossMasses = formData.getAll("lossMasses[]");
        for (let i = 0; i < losses.length; i++) {
            // split after , and trim whitespaces
            let lossSpec = lossSpecs[i].split(",").map(function(l){
                return l.trim();
                // let ret = l.trim();
                // if (['CTerm', 'NTerm'])
                // return ret;
            });
            loss_xi2.push({
                "name": losses[i],
                "specificity": lossSpec,
                "mass": lossMasses[i]
            });
        }
        xi2_config.fragmentation.losses = loss_xi2;

        // xi2 config - ions
        let ions_nterm_xi2 = [];
        let ions_cterm_xi2 = [];
        let ions_precursor_xi2 = false;
        let ionTypes = formData.getAll("ions[]");
        for (let it = 0; it < ionTypes.length; it++) {
            let ionType = ionTypes[it];
            if (ionType === "peptide") ions_precursor_xi2 = true;
            else if (["a", "b", "c"].indexOf(ionType) !== -1){
                ions_nterm_xi2.push(ionType);
            } else if (["x", "y", "z"].indexOf(ionType) !== -1){
                ions_cterm_xi2.push(ionType);
            }
        }
        xi2_config.fragmentation.nterm_ions = ions_nterm_xi2;
        xi2_config.fragmentation.cterm_ions = ions_cterm_xi2;
        xi2_config.fragmentation.add_precursor = ions_precursor_xi2;
        // xi2 config - crosslinker # ToDo crosslinkerID
        let cl_id = xi2_request.annotation.crosslinkerID;
        xi2_config.crosslinker[cl_id].mass = parseFloat(form["clModMass"].value);
        // xi2 config - tolerance
        xi2_config.ms2_tol = form["ms2Tol"].value + form["tolUnit"].value;
        
        // annotation block - JSON assembly
        xi2_request.Peptides = peptidesJSON;
        xi2_request.LinkSite = linkSitesJSON;
        xi2_request.peaks = peaksJSON;

        return xi2_request;

    },

    form_to_json_request: function (form) {
        // convert form to json
        // peptides & linkSites block
        let linkSitesJSON = Array();
        let peptidesJSON = Array();

        let formData = new FormData(form);

        function pep_to_array(pep_str){
            let pepArray = Array();
            let pep = pep_str.replace(/#\d?/g , "");
            let matches = pep.matchAll(/([A-Z][^A-Z]*)/g);
            for (let AAmod of matches){
                pepArray.push({"aminoAcid": AAmod[0][0], "Modification": AAmod[0].slice(1)});
            }
            return {"sequence": pepArray};
        }
        let peps = formData.get("peps").split(";");
        for (let i = 0; i < peps.length; i++) {
            // create peptide JSON
            peptidesJSON.push(pep_to_array(peps[i]));
            // create linkSite JSON
            let pep_noMods = peps[i].replace(/[^A-Z#]+/g , "");
            let link_pos = pep_noMods.indexOf("#")-1;
            let linkSite = {"id": 0, "peptideId": i, "linkSite": link_pos};
            linkSitesJSON.push(linkSite);
        }
        // peak block
        let peaks = formData.get("peaklist").trim().split(/[\r\n]/);
        let peaksJSON = peaks.map(function(p){
            p = p.split(/\s/);
            return {"mz": p[0], "intensity": p[1]};
        });
        // annotation block - modifications
        let modsJSON = Array();
        let mods = formData.getAll("mods[]");
        let modSpecs = formData.getAll("modSpecificities[]");
        let modMasses = formData.getAll("modMasses[]");
        for (let i = 0; i < mods.length; i++) {
            // split after , and trim whitespaces
            let modSpec = modSpecs[i].split(",").map(function(l){
                return l.trim();
            });
            // remove empty elements
            modSpec = modSpec.filter(function(ms){
                if (ms !== "")
                    return ms;
            });
            modsJSON.push({
                "id": mods[i],
                "aminoAcids": modSpec,
                "mass": modMasses[i]
            });
        }
        // annotation block - losses
        let lossJSON = Array();
        let losses = formData.getAll("losses[]");
        let lossSpecs = formData.getAll("lossSpecificities[]");
        let lossMasses = formData.getAll("lossMasses[]");
        for (let i = 0; i < losses.length; i++) {
            // split after , and trim whitespaces
            let lossSpec = lossSpecs[i].split(",").map(function(l){
                return l.trim();
            });
            lossJSON.push({
                "id": losses[i],
                "specificity": lossSpec,
                "mass": lossMasses[i]
            });
        }
        // annotation block - ions
        let ionTypes = formData.getAll("ions[]");
        let ionsJSON = [];
        for (let it = 0; it < ionTypes.length; it++) {
            let ionType = ionTypes[it];
            ionsJSON.push({"type": (ionType.charAt(0).toUpperCase() + ionType.slice(1) + "Ion")});
        }
        // annotation block - crosslinker
        let crosslinkerJSON = {"modMass": form["clModMass"].value};
        // annotation block - tolerance
        let toleranceJSON = {
            "tolerance": parseFloat(form["ms2Tol"].value),
            "unit": form["tolUnit"].value
        };
        // annotation block - JSON assembly
        let annotationJSON = {
            "fragmentTolerance": toleranceJSON,
            "modifications": modsJSON,
            "ions": ionsJSON,
            "crosslinker": crosslinkerJSON,
            "precursorCharge": parseInt(form["preCharge"].value),
            "losses": lossJSON
        };
        
        // final JSON assembly
        return {
            "Peptides": peptidesJSON,
            "LinkSite": linkSitesJSON,
            "peaks": peaksJSON,
            "annotation": annotationJSON
        };
    },

    //ToDo: improve error handling to be more informative - display outside of console
    checkInputsForValidity: function (form) {

        let formData = new FormData(form);
        let invalidChars = function (input, unknownCharPattern) {
            let match = input.match(unknownCharPattern);
            if (match) {
                return match[0];
            }
            return false;
        };

        // peptideStr
        let invalidChar = invalidChars(formData.get("peps"), /([^GALMFWKQESPVICYHRNDTXa-z:;#\d(.)\-+]+)/);
        if (invalidChar) {
            alert("Invalid character(s) in peptide sequence: " + invalidChar);
            return false;
        }

        // peakList
        invalidChar = invalidChars(formData.get("peaklist"), /([^\d.\s]+)/);
        if (invalidChar) {
            alert("Invalid character(s) in peak list: " + invalidChar);
            return false;
        }
        // clModMass
        invalidChar = invalidChars(formData.get("clModMass"), /([^\d.-]+)/);
        if (invalidChar) {
            alert("Invalid character(s) in cros-linker modmass: " + invalidChar);
            return false;
        }
        // precursor charge state
        invalidChar = invalidChars(formData.get("preCharge"), /([^\d]+)/);
        if (invalidChar) {
            alert("Invalid character(s) in charge state: " + invalidChar);
            return false;
        }
        // ms2Tolerance
        invalidChar = invalidChars(formData.get("ms2Tol"), /([^\d.]+)/);
        if (invalidChar) {
            alert("Invalid character(s) in ms2Tolerance: " + invalidChar);
            return false;
        }

        // // modifications specificities
        // let formModSpecs = formData.getAll("modSpecificities[]");
        // formModSpecs.forEach(function(spec{
        //     spec = spec.split(',');
        //     // check for each specificity if it's valid
        //     spec.forEach(function(s){
        //         s = s.trim();
        //         let invalidChar = invalidChars(s, /([^GALMFWKQESPVICYHRNDTXa-z:;#\d(.)\-+]+)/);
        //         if (invalidChar) {
        //             alert("Invalid specificity string for mod:" + );
        //             return false;
        //         }
        //     })
        //
        // })

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
                        return "<input class=\"xispec_form-control\" id=\"modName_" + meta.row + "\" title=\"modification code\" name=\"mods[]\" readonly type=\"text\" value=\"" + data + "\">";
                    },
                    "class": "invisible",
                    "targets": 0,
                },
                {
                    "render": function (data, type, row) {
                        return row[0] + "<i class=\"fa fa-undo xispec_resetMod\" title=\"reset modification to default\" aria-hidden=\"true\"></i></span>";
                    },
                    "targets": 1,
                },
                {
                    "render": function (data, type, row, meta) {
                        let rowNode = self.modTable.rows(meta.row).nodes().to$();

                        for (let i = 0; i < self.model.knownModifications.length; i++) {
                            if (self.model.knownModifications[i].id === row[0]) {
                                data = self.model.knownModifications[i].mass;
                                if (self.model.knownModifications[i].changed) {
                                    displayModified(rowNode);
                                }
                                break;
                            }
                        }
                        data = parseFloat(parseFloat(data).toFixed(10).toString()); // limit to 10 decimal places and get rid of tailing zeroes
                        // if (data.toString().indexOf('.') !== -1)
                        //     let stepSize = '0.' + '0'.repeat(data.toString().split('.')[1].length - 1) + 1;
                        // else
                        //     let stepSize = 1;
                        return "<input class=\"xispec_form-control stepInput\" id=\"modMass_" + meta.row + "\" row=\"" + meta.row + "\" title=\"modification mass\" name=\"modMasses[]\" type=\"text\" required value=\"" + data + "\" autocomplete=off>";
                    },
                    "targets": 2,
                },
                {
                    "render": function (data, type, row, meta) {
                        if (self.model.knownModifications !== undefined) {
                            for (let i = 0; i < self.model.knownModifications.length; i++) {
                                if (self.model.knownModifications[i].id === row[0]) {
                                    if (self.model.knownModifications[i].aminoAcids === ["*"])
                                        data = ["*"];
                                    else {
                                        data = _.union(data, self.model.knownModifications[i].aminoAcids);
                                    }
                                    break;
                                }
                            }
                        }
                        data = data.join(", ");
                        return "<input class=\"xispec_form-control\" id=\"modSpec_" + meta.row + "\" row=\"" + meta.row + "\" title=\"comma separated list of amino acids that can be modified\" name=\"modSpecificities[]\" type=\"text\" required value=\"" + data + "\" autocomplete=off>";
                    },
                    "targets": 3,
                }
            ]
        };
        let $modTable = $("#xispec_modificationTable");

        this.modTable = $modTable.DataTable(tableVars);

        //ToDo: change to BB event handling
        $modTable.on("input", "input", function () {
            let row = this.getAttribute("row");
            let modName = $("#modName_" + row).val();
            let modMass = parseFloat($("#modMass_" + row).val());
            // extract specificities from input
            let modSpecInput = $("#modSpec_" + row).val();
            let modSpec = [];
            [... modSpecInput.matchAll(/([^\s,]+),?/g)].forEach(function (s){
                modSpec.push(s[1]);
            });
            let mod = {"id": modName, "mass": modMass, "aminoAcids": modSpec};

            let updatedMod = self.model.updateModification(mod);
            if (!updatedMod.userMod)
                displayModified($(this).closest("tr"));
        });

        let displayModified = function (row) {
            row.addClass("userModified");
            row.find(".xispec_resetMod").css("visibility", "visible");
        };

        $modTable.on("click", ".xispec_resetMod", function () {
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
                    "title": "Neutral Loss <i id=\"xispec_addNewLoss\" class=\"fa fa-plus-circle\" aria-hidden=\"true\" title=\"add new neutral loss\"></i>",
                    "className": "dt-center"
                },
                {"title": "Mass", "className": "dt-center"},
                {"title": "Specificity", "className": "dt-center"},
            ],
            "columnDefs": [
                {
                    "render": function () {
                        return "<i class=\"fa fa-trash xispec_deleteLoss\" title=\"delete neutral loss\" aria-hidden=\"true\">";
                    },
                    "targets": 0,
                },
                {
                    "render": function (data, type, row, meta) {
                        return "<input class=\"xispec_form-control\" style=\"width:100px\" id=\"lossName_" + meta.row + "\" title=\"neutral loss name\" name=\"losses[]\" type=\"text\" value=\"" + data + "\">";
                    },
                    "targets": 1,
                },
                {
                    "render": function (data, type, row, meta) {
                        return "<input class=\"xispec_form-control stepInput\" style=\"width:120px\" id=\"lossMass_" + meta.row + "\" row=\"" + meta.row + "\" title=\"neutral loss mass\" name=\"lossMasses[]\" type=\"text\" required value=\"" + data + "\" autocomplete=off>";
                    },
                    "targets": 2,
                },
                {
                    "render": function (data, type, row, meta) {
                        data = data.join(", ");
                        return "<input class=\"xispec_form-control\" id=\"lossSpec_" + meta.row + "\" row=\"" + meta.row + "\" title=\"neutral loss specificity\" name=\"lossSpecificities[]\" type=\"text\" required value=\"" + data + "\" autocomplete=off>";
                    },
                    "targets": 3,
                }
            ]
        };

        this.lossTable = $("#xispec_lossTable").DataTable(tableVars);

        // ToDo: should be moved to BB event handling
        $("#xispec_lossTable ").on("click", ".xispec_deleteLoss", function () {
            self.lossTable
                .row($(this).parents("tr"))
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
            new_mod.aminoAcids = Array(pepStrMods[result.index - 1]);

            let found = false;
            for (let i = 0; i < modifications.length; i++) {
                if (modifications[i].id === new_mod.id) {
                    found = true;
                    if (modifications[i].aminoAcids.indexOf(new_mod.aminoAcids[0]) === -1)
                        modifications[i].aminoAcids.concat(new_mod.aminoAcids);
                    break;
                }
            }
            if (!found) modifications.push(new_mod);
        }

        return modifications;
    },

    renderModTable: function () {

        // extract modification from peptide input
        let modifications = this.extractModsFromPepStr(this.model.pepStrsMods.join(""));

        let self = this;
        this.modTable.clear();
        if (modifications.length === 0) {
            this.modTable.draw(false);
            this.hideModTable();
        } else {
            this.showModTable();
            modifications.forEach(function (mod) {
                let add_mod = [
                    mod.id,
                    mod.id,
                    0,
                    mod.aminoAcids,
                ];
                // check if the modification is one of the ones from the JSON annotation
                let annotation_mod_match = self.model.knownModifications.filter(
                    function (m) {
                        return m.id === mod.id;
                    });
                if (annotation_mod_match.length === 1) {
                    add_mod = [
                        annotation_mod_match[0].id,
                        annotation_mod_match[0].id,
                        annotation_mod_match[0].mass,
                        _.union(annotation_mod_match[0].aminoAcids, mod.aminoAcids),
                    ];
                }

                self.modTable.row.add(add_mod).draw(false);
            });
        }
    },

    hideModTable: function () {
        $("#xispec_toggleModifications").find(".fa-minus-square").removeClass("fa-minus-square").addClass("fa-plus-square");
        $(this.modTableWrapper.node()).hide();
    },

    showModTable: function () {
        $("#xispec_toggleModifications").find(".fa-plus-square").removeClass("fa-plus-square").addClass("fa-minus-square");
        $(this.modTableWrapper.node()).show();
    },

    toggleModTable: function () {
        if ($(this.modTableWrapper.node()).is(":visible")) {
            $("#xispec_toggleModifications").find(".fa-minus-square").removeClass("fa-minus-square").addClass("fa-plus-square");
        } else {
            $("#xispec_toggleModifications").find(".fa-plus-square").removeClass("fa-plus-square").addClass("fa-minus-square");
        }
        $(this.modTableWrapper.node()).toggle();
    },

    addNewLoss: function () {
        console.log("new loss");
        this.lossTable.row.add([
            "",
            "",
            0,
            [],
        ]).draw(false);
    },

    toggleLossTable: function () {
        if ($(this.lossTableWrapper.node()).is(":visible")) {
            $("#xispec_toggleLosses").find(".fa-minus-square").removeClass("fa-minus-square").addClass("fa-plus-square");
        } else {
            $("#xispec_toggleLosses").find(".fa-plus-square").removeClass("fa-plus-square").addClass("fa-minus-square");
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
                    "",
                    loss.id,
                    loss.mass,
                    loss.specificity,
                ]).draw(false);
            });
        }
    },

    toggleCustomCfgHelp: function () {
        $("#xispec_customCfgHelp").toggle();
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
        $(".xispec_ionSelectChkbox:checkbox:checked").each(function () {
            ionSelectionArr.push($(this).val());
        });

        if (ionSelectionArr.length === 0)
            $("#xispec_ionSelection").val("Select ions...");
        else
            $("#xispec_ionSelection").val(ionSelectionArr.join(", "));
    },

    modelChanged: function () {
        // update pepInputView model
        this.pepInputView.model = this.model;
        DataSettingsView.__super__.modelChanged.apply(this);
    },
});

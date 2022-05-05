import * as $ from "jquery";

window.jQuery = $;
import d3 from "d3";
// eslint-disable-next-line no-unused-vars
import webpack_jquery_ui from "webpack-jquery-ui";
// eslint-disable-next-line no-unused-vars
import webpack_jquery_ui0 from "webpack-jquery-ui/css";  //ommit, if you don't want to load basic css theme

export const jqdialogs = {
    constructDialogMessage: function (dialogID, msg, title) {
        let dialogParas = d3.select("body").select("#" + dialogID);
        if (dialogParas.empty()) {
            dialogParas = d3.select("body").append("div").attr("id", dialogID);
        }
        dialogParas.selectAll("p").remove();
        dialogParas
            .attr("id", dialogID)
            .attr("title", title)
            .selectAll("p")
            .data(msg.split("<br>"))
            .enter()
            .append("p")
            .html(function (d) {
                return d;
            });
    },

    errorDialog: function (dialogID, msg, title) {
        msg = msg.concat("<br><A href='https://github.com/Rappsilber-Laboratory/' target='_blank'>Rappsilber Lab GitHub</A>");
        jqdialogs.constructDialogMessage(dialogID, msg, title || "Database Error");

        $("#" + dialogID).dialog({
            modal: true,
        });
    },

    areYouSureDialog: function (dialogID, msg, title, yesText, noText, yesFunc) {
        jqdialogs.constructDialogMessage(dialogID, msg, title || "Confirm");

        function hardClose() {
            $(this).dialog("close").dialog("destroy").remove();
        }

        function yesAndHardClose() {
            hardClose.call(this);  // need to do it this way to pass on 'this' context
            yesFunc();
        }

        $("#" + dialogID).dialog({
            modal: true,
            open: function () {
                $(".ui-dialog :button").blur(); // http://stackoverflow.com/questions/1793592/jquery-ui-dialog-button-focus
            },
            buttons: [
                {text: yesText, click: yesAndHardClose},
                {text: noText, click: hardClose}
            ]
        });
    }
};

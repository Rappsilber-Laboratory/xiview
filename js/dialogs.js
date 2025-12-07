/**
 * @fileoverview jQuery UI dialog utilities for xiVIEW.
 * Provides convenience wrappers for creating error dialogs and confirmation dialogs.
 * Uses jQuery UI dialog widget with modal behavior.
 */
import * as $ from "jquery";

window.jQuery = $;
import d3 from "d3";
// eslint-disable-next-line no-unused-vars
import "jquery-ui/ui/widgets/dialog";
// eslint-disable-next-line no-unused-vars
import "jquery-ui/themes/base/all.css";

//todo - this wrapping object is unnecessary
export const jqdialogs = {
    /**
     * Creates or updates DOM element for dialog with message paragraphs.
     * Splits message on &lt;br&gt; tags and creates paragraph elements.
     * Reuses existing dialog div if present, otherwise creates new one in body.
     * @param {string} dialogID - DOM element ID for dialog container
     * @param {string} msg - Message text (supports &lt;br&gt; for line breaks, HTML for formatting)
     * @param {string} title - Dialog title text
     * @returns {undefined}
     */
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

    /**
     * Displays modal error dialog with message and GitHub link.
     * Appends Rappsilber Lab GitHub link to message automatically.
     * Uses jQuery UI modal dialog with default "OK" button behavior.
     * @param {string} dialogID - DOM element ID for dialog container
     * @param {string} msg - Error message text
     * @param {string} [title="Database Error"] - Dialog title
     * @returns {undefined}
     */
    errorDialog: function (dialogID, msg, title) {
        msg = msg.concat("<br><A href='https://github.com/Rappsilber-Laboratory/' target='_blank'>Rappsilber Lab GitHub</A>");
        jqdialogs.constructDialogMessage(dialogID, msg, title || "Database Error");

        $("#" + dialogID).dialog({
            modal: true,
        });
    },

    /**
     * Displays modal confirmation dialog with customizable Yes/No buttons.
     * Executes callback function on "Yes", closes without action on "No".
     * Dialog is destroyed and removed from DOM after closing.
     * @param {string} dialogID - DOM element ID for dialog container
     * @param {string} msg - Confirmation message text
     * @param {string} [title="Confirm"] - Dialog title
     * @param {string} yesText - Text for "Yes" button
     * @param {string} noText - Text for "No" button
     * @param {Function} yesFunc - Callback function to execute if user clicks "Yes"
     * @returns {undefined}
     */
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

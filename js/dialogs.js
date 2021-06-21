export const TEMP = (function (mod) {
    
    mod.jqdialogs = {
        constructDialogMessage: function (dialogID, msg, title) {
            var dialogParas = d3.select("body").select("#"+dialogID);
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
                    .html (function(d) { return d; })
            ;
        },

        errorDialog: function (dialogID, msg, title) {
            msg = msg.concat("<br><A href='https://github.com/Rappsilber-Laboratory/' target='_blank'>Rappsilber Lab GitHub</A>");
            TEMP.jqdialogs.constructDialogMessage (dialogID, msg, title || "Database Error");

            $("#"+dialogID).dialog({
                modal:true,
            });
        },

        areYouSureDialog: function (dialogID, msg, title, yesText, noText, yesFunc) {
            TEMP.jqdialogs.constructDialogMessage (dialogID, msg, title || "Confirm");

            function hardClose () {
                 $(this).dialog("close").dialog("destroy").remove();
            }

            function yesAndHardClose () {
                hardClose.call (this);  // need to do it this way to pass on 'this' context
                yesFunc();
            }

            $("#"+dialogID).dialog({
                modal: true,
                open: function () {
                    $('.ui-dialog :button').blur(); // http://stackoverflow.com/questions/1793592/jquery-ui-dialog-button-focus
                },
                buttons: [
                    { text: yesText, click: yesAndHardClose },
                    { text: noText, click: hardClose }
                ]
            });
        }
    };
    
    return mod;
    
}({})); //wtf
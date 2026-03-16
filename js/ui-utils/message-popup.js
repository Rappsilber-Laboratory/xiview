import d3 from "d3";

const MESSAGE_TYPES = {
    error:   { color: "red",     icon: "fa-times-circle" },
    warning: { color: "orange",  icon: "fa-exclamation-triangle" },
    info:    { color: "#2196F3", icon: "fa-info-circle" },
};

/**
 * Displays a notification popup with a severity icon.
 * Reuses a single #clmsMessageBox element across calls.
 * @param {string} message - HTML message to display
 * @param {string} [type="error"] - Severity: "error", "warning", or "info"
 * @returns {void}
 */
export function showMessage(message, type) {
    const config = MESSAGE_TYPES[type] || MESSAGE_TYPES.error;

    let box = d3.select("#clmsMessageBox");
    if (box.empty()) {
        box = d3.select("body").append("div").attr("id", "clmsMessageBox");
        box.append("i").attr("class", "fa messageTypeIcon");
        box.append("div").attr("class", "messageContent");
        box.append("i")
            .attr("class", "fa fa-times-circle messageCloseButton closeButton")
            .attr("title", "Close Dialog")
            .on("click", function () {
                box.style("display", "none");
            });
    }

    box.select("i.messageTypeIcon")
        .attr("class", "fa " + config.icon + " messageTypeIcon")
        .style("color", config.color);

    box.select("div.messageContent").html(message);

    box
        .style("opacity", 0)
        .style("display", "block")
        .style("border-color", config.color)
        .style("margin", "3em 9em")
        .transition()
        .duration(500)
        .style("opacity", 1);
}

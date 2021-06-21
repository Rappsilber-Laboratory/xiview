const validate = function (matchId, validationStatus, randId, successCallBack) {
    $.ajax({
        type: "POST",
        url: "./php/validateMatch.php",
        data: "mid=" + matchId + "&val=" + validationStatus + "&randId=" + randId,
        contentType: "application/x-www-form-urlencoded",
        success: function (data, status, xhr) {
            console.log("SUCCESS VALIDATION", data, status, xhr.responseText);
            successCallBack();
        },
    });
};
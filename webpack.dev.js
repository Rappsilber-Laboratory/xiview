require("webpack");
const path = require("path");
const { merge } = require("webpack-merge");
const common = require("./webpack.common.js");

module.exports = merge(common, {
    mode: "development",
    devtool: "eval-source-map",
    module: {
        rules: [
        ]
    },
    devServer: {
        contentBase: path.join(__dirname),
        compress: true,
        port: 9000,
        openPage: "example_crosslink.html"
    }
});

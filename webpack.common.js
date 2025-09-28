require("webpack");
const path = require("path");


module.exports = {
    entry: {
        xispec: "./src/main.js"
    },
    output: {
        filename: '[name].js',
        path: __dirname + '/dist',
        library: ['[name]'],
        libraryTarget: "umd"
    },

    module: {
        rules: [
            {
                test: /\.(css|scss)$/i,
                use: ["style-loader", "css-loader"],
            },
            {
                test: /\.(png|jpe?g|gif|svg|eot|ttf|woff|woff2)$/i,
                loader: "url-loader",
            }
        ]
    },
    devServer: {
        contentBase: path.join(__dirname),
        compress: true,
        port: 9000
    },
    plugins: [
    ]
};

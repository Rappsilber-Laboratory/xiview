const webpack = require("webpack");
const path = require("path");

module.exports = {
    entry: {
        xiview: "./js/promises-load.js",
    },
    output: {
        filename: "[name].js",
        chunkFilename: "[name].js",
        path: path.resolve(__dirname, "dist"),
        library: "[name]",
        libraryTarget: "umd",
        globalObject: "this"
    },

    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: [
                    /node_modules/,
                    /vendor/
                ],
                use: {
                    loader: "babel-loader"
                }
            },
            {
                test: /\.(css|scss)$/i,
                use: ["style-loader", "css-loader"],
            },
            {
                test: /\.(png|jpe?g|gif|svg|eot|ttf|woff|woff2)(\?.*)?$/i,
                type: "asset",
                parser: {
                    dataUrlCondition: {
                        maxSize: 8192,
                    },
                },
            }
        ]
    },
    optimization: {
        splitChunks: {
            chunks: "all",
            cacheGroups: {
                commons: {
                    name: "commons",
                    chunks: "initial",
                    minChunks: 2,
                },
                vendors: {
                    test: /[\\/]node_modules[\\/]/,
                    name: "vendors",
                    chunks: "all",
                },
            },
        },
    },
    plugins: [
        new webpack.ProvidePlugin({
            $: "jquery",
            jQuery: "jquery",
            "window.jQuery": "jquery",
            "window.$": "jquery"
        })
    ]
};

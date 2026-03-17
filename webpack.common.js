const path = require("path");

module.exports = {
    entry: {
        xiview: "./js/main.js",
    },
    output: {
        filename: "[name].js",
        chunkFilename: "[name].js",
        path: path.resolve(__dirname, "dist"),
        library: {
            name: "[name]",
            type: "umd",
        },
        globalObject: "this"
    },

    resolve: {
        fallback: {
            "path": require.resolve("path-browserify"),
            "fs": false,
            "crypto": false,
            "buffer": false,
            "os": false,
            "stream": false,
        }
    },
    performance: { hints: false },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules|vendor/,
                use: ["babel-loader"]
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
                generator: {
                    filename: "[name][ext][query]",
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
    plugins: []
};

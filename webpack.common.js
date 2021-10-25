require("webpack");
const path = require("path");


module.exports = {
    // entry: "./xi3/js/main.js",
    // output: {
    //     path: path.resolve(__dirname, "dist"),
    //     filename: "xiview.js",
    //     library: ["xiview"],
    //     libraryTarget: "umd"
    // },

    entry: {
        xispec: "./src/Wrapper.js"
        // aligner: './xi3/js/align/alignWorker.js',
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
                // options: {
                //     limit: 8192,
                // },
            }
        ]
    },
    devServer: {
        contentBase: path.join(__dirname),
        compress: true,
        port: 9000
    },
    plugins: [
        // not working because has outdated webpack dependency
        /* Use the ProvidePlugin constructor to inject jquery implicit globals */
        // new webpack.ProvidePlugin({
        //     $: "jquery",
        //     jQuery: "jquery",
        //     "window.jQuery": "jquery'",
        //     "window.$": "jquery"
        // })
    ]
};

import globals from "globals";

// globals v11 has entries with trailing whitespace; trim them for ESLint v10
function cleanGlobals(obj) {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.trim(), v]));
}

export default [
    {
        ignores: [
            "crosslink-viewer/vendor/cola.js",
            "xiview/vendor/**",
            "xiview/js/align/bioseq32.js",
            "xiview/js/svgexp.js",
            "node_modules/**",
        ],
    },
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...cleanGlobals(globals.browser),
                ...cleanGlobals(globals.node),
                ...cleanGlobals(globals.es2015),
                Atomics: "readonly",
                SharedArrayBuffer: "readonly",
            },
        },
        rules: {
            // From eslint:recommended (key rules)
            "no-const-assign": "error",
            "no-dupe-args": "error",
            "no-dupe-keys": "error",
            "no-duplicate-case": "error",
            "no-empty": "warn",
            "no-ex-assign": "error",
            "no-extra-semi": "error",
            "no-fallthrough": "error",
            "no-func-assign": "error",
            "no-redeclare": "error",
            "no-undef": "error",
            "no-unreachable": "error",
            "no-unused-vars": "warn",
            "use-isnan": "error",
            "valid-typeof": "error",
            // Project-specific rules
            "linebreak-style": ["error", "unix"],
            "semi": ["error", "always"],
            "semi-style": ["error", "last"],
            "semi-spacing": ["error", {"before": false, "after": true}],
            "quotes": ["warn", "double"],
            "brace-style": "warn",
            "indent": ["error", 4],
        },
    },
];

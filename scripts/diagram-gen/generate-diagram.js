#!/usr/bin/env node

/**
 * Generate UML class diagram in .dia format from JavaScript source files
 *
 * This script analyzes JavaScript classes and generates a Dia diagram file.
 *
 * Usage:
 *   node generate-diagram.js [options]
 *
 * Options:
 *   --config <path>   Path to configuration file (default: ./diagram-config.js)
 *   --source <path>   Override source directory from config
 *   --output <path>   Override output file path from config
 *
 * Examples:
 *   node generate-diagram.js --config configs/xiview-config.js
 *   node generate-diagram.js --source ./mycode --output ./my-diagram.dia
 */

const fs = require("fs");
const path = require("path");
const { analyzeDirectory, detectRelationships } = require("./js-analyzer");
const { generateDiagram } = require("./dia-generator");

/**
 * Parse command-line arguments
 * @returns {object} Parsed arguments {config, source, output}
 */
function parseArguments() {
    const args = {
        config: null,
        source: null,
        output: null,
    };

    for (let i = 2; i < process.argv.length; i++) {
        const arg = process.argv[i];
        const nextArg = process.argv[i + 1];

        if (arg === "--config" && nextArg) {
            args.config = nextArg;
            i++;
        } else if (arg === "--source" && nextArg) {
            args.source = nextArg;
            i++;
        } else if (arg === "--output" && nextArg) {
            args.output = nextArg;
            i++;
        }
    }

    return args;
}

// Parse CLI arguments
const cliArgs = parseArguments();

// Load configuration
const configPath = cliArgs.config || path.join(__dirname, "diagram-config.js");

// Resolve to absolute path if needed
const absoluteConfigPath = path.isAbsolute(configPath)
    ? configPath
    : path.resolve(process.cwd(), configPath);

let config;
try {
    config = require(absoluteConfigPath);
    console.log(`✓ Loaded configuration from: ${absoluteConfigPath}`);
} catch (error) {
    console.error(`✗ Failed to load configuration from: ${absoluteConfigPath}`);
    console.error(error.message);
    process.exit(1);
}

// Override config with CLI arguments
if (cliArgs.source) {
    config.sourceDir = cliArgs.source;
    console.log(`  Overriding sourceDir: ${cliArgs.source}`);
}
if (cliArgs.output) {
    config.outputFile = cliArgs.output;
    console.log(`  Overriding outputFile: ${cliArgs.output}`);
}

/**
 * Main execution function
 */
async function main() {
    console.log("\n" + "=".repeat(60));
    console.log("  Diagram Generation Tool");
    console.log("=".repeat(60) + "\n");

    try {
        // Step 1: Analyze source directory
        console.log(`[1/3] Analyzing source directory: ${config.sourceDir}`);

        if (!fs.existsSync(config.sourceDir)) {
            throw new Error(`Source directory not found: ${config.sourceDir}`);
        }

        const classes = analyzeDirectory(config.sourceDir, config);
        console.log(`      Found ${classes.length} classes\n`);

        if (classes.length === 0) {
            console.warn("⚠ Warning: No classes found in source directory");
            process.exit(0);
        }

        // Display found classes
        classes.forEach(cls => {
            console.log(`      - ${cls.name} (${cls.properties.length} properties, ${cls.methods.length} methods)`);
        });
        console.log();

        // Step 2: Detect relationships
        console.log("[2/4] Detecting relationships...");
        const relationships = detectRelationships(classes, config);
        console.log(`      Found ${relationships.length} relationships`);

        if (relationships.length > 0) {
            const inheritanceCount = relationships.filter(r => r.type === "inheritance").length;
            const compositionCount = relationships.filter(r => r.type === "composition").length;
            console.log(`      - Inheritance: ${inheritanceCount}`);
            console.log(`      - Composition: ${compositionCount}`);
        }
        console.log();

        // Step 3: Generate diagram XML
        console.log("[3/4] Generating .dia XML...");
        const diagramXml = generateDiagram(classes, relationships, config);
        console.log(`      Generated ${diagramXml.length} characters of XML\n`);

        // Step 4: Write output file
        console.log(`[4/4] Writing diagram to: ${config.outputFile}`);

        const outputDir = path.dirname(config.outputFile);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(config.outputFile, diagramXml, "utf-8");
        console.log(`      ✓ Diagram saved successfully\n`);

        // Success summary
        console.log("=".repeat(60));
        console.log("✓ Diagram generation completed successfully!");
        console.log(`  Output: ${config.outputFile}`);
        console.log(`  Classes: ${classes.length}`);
        console.log(`  Relationships: ${relationships.length}`);
        console.log(`  Total properties: ${classes.reduce((sum, cls) => sum + cls.properties.length, 0)}`);
        console.log(`  Total methods: ${classes.reduce((sum, cls) => sum + cls.methods.length, 0)}`);
        console.log("=".repeat(60) + "\n");

        process.exit(0);

    } catch (error) {
        console.error("\n" + "=".repeat(60));
        console.error("✗ Diagram generation failed!");
        console.error("=".repeat(60));
        console.error("\nError:", error.message);

        if (error.stack) {
            console.error("\nStack trace:");
            console.error(error.stack);
        }

        console.error("\n" + "=".repeat(60) + "\n");
        process.exit(1);
    }
}

// Run main function
main();

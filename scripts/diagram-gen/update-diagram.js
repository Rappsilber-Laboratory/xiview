#!/usr/bin/env node

/**
 * Update existing UML diagram with current class members while preserving layout
 *
 * This script updates class properties and methods in an existing .dia file
 * without overwriting manually adjusted positions and routing.
 *
 * Usage:
 *   node update-diagram.js --config <path>
 *   node update-diagram.js --config configs/xiview-config.js
 */

const fs = require("fs");
const path = require("path");
const { analyzeDirectory } = require("./js-analyzer");

/**
 * Escape XML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for XML
 */
function escapeXml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/**
 * Parse command-line arguments
 * @returns {object} Parsed arguments
 */
function parseArguments() {
    const args = { config: null };

    for (let i = 2; i < process.argv.length; i++) {
        const arg = process.argv[i];
        const nextArg = process.argv[i + 1];

        if (arg === "--config" && nextArg) {
            args.config = nextArg;
            i++;
        }
    }

    return args;
}

/**
 * Parse existing .dia file and extract class data, positions and routing
 * @param {string} diaFilePath - Path to existing .dia file
 * @returns {object} { classes: {className: classMetadata}, positions: {className: {x, y, width, height}}, relationships: [...] }
 */
async function parseExistingDiagram(diaFilePath) {
    if (!fs.existsSync(diaFilePath)) {
        console.log(`   No existing diagram found at ${diaFilePath}`);
        return null;
    }

    const xmlContent = fs.readFileSync(diaFilePath, "utf-8");
    const parsed = await parseStringPromise(xmlContent);

    const positions = {};
    const existingClasses = {};
    const existingRelationships = [];

    // Extract class objects
    const layer = parsed["dia:diagram"]["dia:layer"][0];
    const objects = layer["dia:object"] || [];

    objects.forEach(obj => {
        const objType = obj.$.type;

        if (objType === "UML - Class") {
            // Extract class name
            const nameAttr = obj["dia:attribute"].find(attr => attr.$.name === "name");
            if (!nameAttr) return;

            const className = nameAttr["dia:string"][0].replace(/^#|#$/g, "");

            // Extract position
            const posAttr = obj["dia:attribute"].find(attr => attr.$.name === "elem_corner");
            const widthAttr = obj["dia:attribute"].find(attr => attr.$.name === "elem_width");
            const heightAttr = obj["dia:attribute"].find(attr => attr.$.name === "elem_height");

            if (posAttr && widthAttr && heightAttr) {
                const posVal = posAttr["dia:point"][0].$.val.split(",");
                positions[className] = {
                    x: parseFloat(posVal[0]),
                    y: parseFloat(posVal[1]),
                    width: parseFloat(widthAttr["dia:real"][0].$.val),
                    height: parseFloat(heightAttr["dia:real"][0].$.val),
                };
            }

            // Extract properties and methods (for preserving deleted classes)
            const properties = [];
            const methods = [];

            const attributesAttr = obj["dia:attribute"].find(attr => attr.$.name === "attributes");
            if (attributesAttr && attributesAttr["dia:composite"]) {
                attributesAttr["dia:composite"].forEach(comp => {
                    const nameAttr = comp["dia:attribute"]?.find(a => a.$.name === "name");
                    if (nameAttr) {
                        const propName = nameAttr["dia:string"][0].replace(/^#|#$/g, "");
                        properties.push({ name: propName, type: "unknown", visibility: "public" });
                    }
                });
            }

            const operationsAttr = obj["dia:attribute"].find(attr => attr.$.name === "operations");
            if (operationsAttr && operationsAttr["dia:composite"]) {
                operationsAttr["dia:composite"].forEach(comp => {
                    const nameAttr = comp["dia:attribute"]?.find(a => a.$.name === "name");
                    if (nameAttr) {
                        const methodName = nameAttr["dia:string"][0].replace(/^#|#$/g, "");
                        methods.push({ name: methodName, visibility: "public", params: 0 });
                    }
                });
            }

            // Store class metadata
            existingClasses[className] = {
                name: className,
                filename: className,
                properties,
                methods,
                superClass: null,
            };
        } else if (objType === "UML - Association" || objType === "UML - Generalization") {
            // Extract relationship routing
            const orthPointsAttr = obj["dia:attribute"].find(attr => attr.$.name === "orth_points");
            const orthOrientAttr = obj["dia:attribute"].find(attr => attr.$.name === "orth_orient");
            const connections = obj["dia:connections"];

            if (orthPointsAttr && orthOrientAttr && connections) {
                const points = orthPointsAttr["dia:point"].map(p => {
                    const vals = p.$.val.split(",");
                    return { x: parseFloat(vals[0]), y: parseFloat(vals[1]) };
                });

                const orientations = orthOrientAttr["dia:enum"].map(e => parseInt(e.$.val));

                const conns = connections[0]["dia:connection"] || [];
                const fromConn = conns.find(c => c.$.handle === "0");
                const toConn = conns.find(c => c.$.handle === "1");

                existingRelationships.push({
                    type: objType,
                    id: obj.$.id,
                    points,
                    orientations,
                    fromConnection: fromConn ? { to: fromConn.$.to, connection: fromConn.$.connection } : null,
                    toConnection: toConn ? { to: toConn.$.to, connection: toConn.$.connection } : null,
                });
            }
        }
    });

    return { classes: existingClasses, positions, relationships: existingRelationships };
}

/**
 * Build attributes section as XML string
 * @param {Array} properties - Array of property metadata
 * @param {string} indent - Indentation string (e.g., "      ")
 * @returns {string} XML string for attributes section
 */
function buildAttributesXmlString(properties, indent = "      ") {
    if (properties.length === 0) {
        return `${indent}<dia:attribute name="attributes"/>`;
    }

    let xml = `${indent}<dia:attribute name="attributes">\n`;

    properties.forEach(prop => {
        // Remove leading # from private property names for display (visibility attribute handles private indicator)
        const propName = prop.name.startsWith("#") ? prop.name.substring(1) : prop.name;
        const escapedPropName = escapeXml(propName);
        const visibility = prop.visibility === "private" ? "1" : "0";

        // Escape type and comment text for XML
        const typeText = prop.type && prop.type !== "unknown" ? escapeXml(prop.type) : "";
        const commentText = prop.comment ? escapeXml(prop.comment) : "";

        xml += `${indent}  <dia:composite type="umlattribute">\n`;
        xml += `${indent}    <dia:attribute name="name">\n`;
        xml += `${indent}      <dia:string>#${escapedPropName}#</dia:string>\n`;
        xml += `${indent}    </dia:attribute>\n`;
        xml += `${indent}    <dia:attribute name="type">\n`;
        xml += `${indent}      <dia:string>#${typeText}#</dia:string>\n`;
        xml += `${indent}    </dia:attribute>\n`;
        xml += `${indent}    <dia:attribute name="value">\n`;
        xml += `${indent}      <dia:string>##</dia:string>\n`;
        xml += `${indent}    </dia:attribute>\n`;
        xml += `${indent}    <dia:attribute name="comment">\n`;
        xml += `${indent}      <dia:string>#${commentText}#</dia:string>\n`;
        xml += `${indent}    </dia:attribute>\n`;
        xml += `${indent}    <dia:attribute name="visibility">\n`;
        xml += `${indent}      <dia:enum val="${visibility}"/>\n`;
        xml += `${indent}    </dia:attribute>\n`;
        xml += `${indent}    <dia:attribute name="abstract">\n`;
        xml += `${indent}      <dia:boolean val="false"/>\n`;
        xml += `${indent}    </dia:attribute>\n`;
        xml += `${indent}    <dia:attribute name="class_scope">\n`;
        xml += `${indent}      <dia:boolean val="false"/>\n`;
        xml += `${indent}    </dia:attribute>\n`;
        xml += `${indent}  </dia:composite>\n`;
    });

    xml += `${indent}</dia:attribute>`;
    return xml;
}

/**
 * Build operations section as XML string
 * @param {Array} methods - Array of method metadata
 * @param {string} indent - Indentation string (e.g., "      ")
 * @returns {string} XML string for operations section
 */
function buildOperationsXmlString(methods, indent = "      ") {
    if (methods.length === 0) {
        return `${indent}<dia:attribute name="operations"/>`;
    }

    let xml = `${indent}<dia:attribute name="operations">\n`;

    methods.forEach(method => {
        // Remove leading # from private method names for display (visibility attribute handles private indicator)
        const methodName = method.name.startsWith("#") ? method.name.substring(1) : method.name;

        // Build method display name without parameters or parentheses
        let displayName = methodName;
        if (method.kind === "get") {
            displayName = `get ${methodName}`;
        } else if (method.kind === "set") {
            displayName = `set ${methodName}`;
        }

        const visibility = method.visibility === "private" ? "1" : "0";

        // Escape return type and comment for XML
        const returnTypeText = method.returnType ? escapeXml(method.returnType) : "";
        const commentText = method.comment ? escapeXml(method.comment) : "";

        xml += `${indent}  <dia:composite type="umloperation">\n`;
        xml += `${indent}    <dia:attribute name="name">\n`;
        xml += `${indent}      <dia:string>#${displayName}#</dia:string>\n`;
        xml += `${indent}    </dia:attribute>\n`;
        xml += `${indent}    <dia:attribute name="stereotype">\n`;
        xml += `${indent}      <dia:string>##</dia:string>\n`;
        xml += `${indent}    </dia:attribute>\n`;
        xml += `${indent}    <dia:attribute name="type">\n`;
        xml += `${indent}      <dia:string>#${returnTypeText}#</dia:string>\n`;
        xml += `${indent}    </dia:attribute>\n`;
        xml += `${indent}    <dia:attribute name="visibility">\n`;
        xml += `${indent}      <dia:enum val="${visibility}"/>\n`;
        xml += `${indent}    </dia:attribute>\n`;
        xml += `${indent}    <dia:attribute name="comment">\n`;
        xml += `${indent}      <dia:string>#${commentText}#</dia:string>\n`;
        xml += `${indent}    </dia:attribute>\n`;
        xml += `${indent}    <dia:attribute name="abstract">\n`;
        xml += `${indent}      <dia:boolean val="false"/>\n`;
        xml += `${indent}    </dia:attribute>\n`;
        xml += `${indent}    <dia:attribute name="inheritance_type">\n`;
        xml += `${indent}      <dia:enum val="2"/>\n`;
        xml += `${indent}    </dia:attribute>\n`;
        xml += `${indent}    <dia:attribute name="query">\n`;
        xml += `${indent}      <dia:boolean val="false"/>\n`;
        xml += `${indent}    </dia:attribute>\n`;
        xml += `${indent}    <dia:attribute name="class_scope">\n`;
        xml += `${indent}      <dia:boolean val="false"/>\n`;
        xml += `${indent}    </dia:attribute>\n`;

        // Build parameters section
        if (method.parameters && method.parameters.length > 0) {
            xml += `${indent}    <dia:attribute name="parameters">\n`;
            method.parameters.forEach(param => {
                const paramDisplay = param.type !== "unknown" ? `${param.name}: ${param.type}` : param.name;
                const escapedParamDisplay = escapeXml(paramDisplay);
                xml += `${indent}      <dia:composite type="umlparameter">\n`;
                xml += `${indent}        <dia:attribute name="name">\n`;
                xml += `${indent}          <dia:string>#${escapedParamDisplay}#</dia:string>\n`;
                xml += `${indent}        </dia:attribute>\n`;
                xml += `${indent}        <dia:attribute name="type">\n`;
                xml += `${indent}          <dia:string>##</dia:string>\n`;
                xml += `${indent}        </dia:attribute>\n`;
                xml += `${indent}        <dia:attribute name="value">\n`;
                xml += `${indent}          <dia:string>##</dia:string>\n`;
                xml += `${indent}        </dia:attribute>\n`;
                xml += `${indent}        <dia:attribute name="comment">\n`;
                xml += `${indent}          <dia:string>##</dia:string>\n`;
                xml += `${indent}        </dia:attribute>\n`;
                xml += `${indent}        <dia:attribute name="kind">\n`;
                xml += `${indent}          <dia:enum val="0"/>\n`;
                xml += `${indent}        </dia:attribute>\n`;
                xml += `${indent}      </dia:composite>\n`;
            });
            xml += `${indent}    </dia:attribute>\n`;
        } else {
            xml += `${indent}    <dia:attribute name="parameters"/>\n`;
        }

        xml += `${indent}  </dia:composite>\n`;
    });

    xml += `${indent}</dia:attribute>`;
    return xml;
}

/**
 * Find the matching closing tag for a section, accounting for nested tags
 * @param {string} content - XML content
 * @param {number} startPos - Position after the opening tag
 * @param {string} tagName - Tag name to match (e.g., "dia:attribute")
 * @returns {number} Position of the matching closing tag
 */
function findMatchingClosingTag(content, startPos, tagName) {
    const closeTag = `</${tagName}>`;
    let depth = 1;
    let pos = startPos;

    // Use regex to find both opening and closing tags, ignoring self-closing tags
    const tagRegex = new RegExp(`<${tagName}(?:\\s[^>]*)?(?<!/)>|</${tagName}>`, 'g');
    tagRegex.lastIndex = pos;

    let match;
    while ((match = tagRegex.exec(content)) !== null) {
        const matchedTag = match[0];

        if (matchedTag.startsWith('</')) {
            // Found a closing tag
            depth--;
            if (depth === 0) {
                return tagRegex.lastIndex;
            }
        } else {
            // Found an opening tag (not self-closing due to negative lookbehind)
            depth++;
        }
    }

    throw new Error(`No matching closing tag found for ${tagName}`);
}

/**
 * Generate a unique object ID for a new diagram object
 * @param {string} xmlContent - Current XML content
 * @returns {string} New unique object ID
 */
function generateUniqueObjectId(xmlContent) {
    // Find all existing object IDs
    const idRegex = /<dia:object[^>]+id="O(\d+)"/g;
    let maxId = -1;
    let match;

    while ((match = idRegex.exec(xmlContent)) !== null) {
        const id = parseInt(match[1], 10);
        if (id > maxId) {
            maxId = id;
        }
    }

    return `O${maxId + 1}`;
}

/**
 * Generate complete XML for a new UML class object
 * @param {object} classData - Class metadata from source analysis
 * @param {string} objectId - Unique object ID
 * @param {number} posX - X position (default for new classes)
 * @param {number} posY - Y position (default for new classes)
 * @returns {string} Complete XML for the class object
 */
function generateNewClassXml(classData, objectId, posX = 5, posY = 5) {
    const attributesXml = buildAttributesXmlString(classData.properties, "        ");
    const operationsXml = buildOperationsXmlString(classData.methods, "        ");

    return `    <dia:object type="UML - Class" version="0" id="${objectId}">
      <dia:attribute name="obj_pos">
        <dia:point val="${posX},${posY}"/>
      </dia:attribute>
      <dia:attribute name="obj_bb">
        <dia:rectangle val="${posX},${posY};${posX + 10},${posY + 10}"/>
      </dia:attribute>
      <dia:attribute name="elem_corner">
        <dia:point val="${posX},${posY}"/>
      </dia:attribute>
      <dia:attribute name="elem_width">
        <dia:real val="10"/>
      </dia:attribute>
      <dia:attribute name="elem_height">
        <dia:real val="10"/>
      </dia:attribute>
      <dia:attribute name="name">
        <dia:string>#${escapeXml(classData.name)}#</dia:string>
      </dia:attribute>
      <dia:attribute name="stereotype">
        <dia:string>##</dia:string>
      </dia:attribute>
      <dia:attribute name="comment">
        <dia:string>##</dia:string>
      </dia:attribute>
      <dia:attribute name="abstract">
        <dia:boolean val="false"/>
      </dia:attribute>
      <dia:attribute name="suppress_attributes">
        <dia:boolean val="false"/>
      </dia:attribute>
      <dia:attribute name="suppress_operations">
        <dia:boolean val="false"/>
      </dia:attribute>
      <dia:attribute name="visible_attributes">
        <dia:boolean val="true"/>
      </dia:attribute>
      <dia:attribute name="visible_operations">
        <dia:boolean val="true"/>
      </dia:attribute>
      <dia:attribute name="visible_comments">
        <dia:boolean val="false"/>
      </dia:attribute>
      <dia:attribute name="wrap_operations">
        <dia:boolean val="true"/>
      </dia:attribute>
      <dia:attribute name="wrap_after_char">
        <dia:int val="40"/>
      </dia:attribute>
      <dia:attribute name="comment_line_length">
        <dia:int val="17"/>
      </dia:attribute>
      <dia:attribute name="comment_tagging">
        <dia:boolean val="false"/>
      </dia:attribute>
      <dia:attribute name="line_width">
        <dia:real val="0.10000000000000001"/>
      </dia:attribute>
      <dia:attribute name="line_color">
        <dia:color val="#000000ff"/>
      </dia:attribute>
      <dia:attribute name="fill_color">
        <dia:color val="#ffffffff"/>
      </dia:attribute>
      <dia:attribute name="text_color">
        <dia:color val="#000000ff"/>
      </dia:attribute>
      <dia:attribute name="normal_font">
        <dia:font family="monospace" style="0" name="Courier"/>
      </dia:attribute>
      <dia:attribute name="abstract_font">
        <dia:font family="monospace" style="88" name="Courier-BoldOblique"/>
      </dia:attribute>
      <dia:attribute name="polymorphic_font">
        <dia:font family="monospace" style="8" name="Courier-Oblique"/>
      </dia:attribute>
      <dia:attribute name="classname_font">
        <dia:font family="sans" style="80" name="Helvetica-Bold"/>
      </dia:attribute>
      <dia:attribute name="abstract_classname_font">
        <dia:font family="sans" style="88" name="Helvetica-BoldOblique"/>
      </dia:attribute>
      <dia:attribute name="comment_font">
        <dia:font family="sans" style="8" name="Helvetica-Oblique"/>
      </dia:attribute>
      <dia:attribute name="normal_font_height">
        <dia:real val="0.80000000000000004"/>
      </dia:attribute>
      <dia:attribute name="polymorphic_font_height">
        <dia:real val="0.80000000000000004"/>
      </dia:attribute>
      <dia:attribute name="abstract_font_height">
        <dia:real val="0.80000000000000004"/>
      </dia:attribute>
      <dia:attribute name="classname_font_height">
        <dia:real val="1"/>
      </dia:attribute>
      <dia:attribute name="abstract_classname_font_height">
        <dia:real val="1"/>
      </dia:attribute>
      <dia:attribute name="comment_font_height">
        <dia:real val="0.69999999999999996"/>
      </dia:attribute>
${attributesXml}
${operationsXml}
      <dia:attribute name="template">
        <dia:boolean val="false"/>
      </dia:attribute>
      <dia:attribute name="templates"/>
    </dia:object>
`;
}

/**
 * Update diagram using direct XML string manipulation with proper tag matching
 * @param {string} xmlContent - Original XML content
 * @param {Array} currentClasses - Array of class metadata from source code
 * @returns {string} Updated XML content
 */
function updateDiagramWithStringReplacement(xmlContent, currentClasses) {
    // Build a map of current classes by name for quick lookup
    const classDataMap = new Map();
    currentClasses.forEach(cls => {
        classDataMap.set(cls.name, cls);
    });

    let updatedContent = xmlContent;
    let updatedCount = 0;
    const processedClasses = new Set(); // Track which classes were found in diagram

    // Find all UML - Class objects
    const classObjectRegex = /<dia:object type="UML - Class"[^>]*>/g;
    let match;
    const replacements = []; // Store replacements to apply in reverse order

    while ((match = classObjectRegex.exec(xmlContent)) !== null) {
        const objectStartPos = match.index;
        const objectContentStart = match.index + match[0].length;

        // Find the closing </dia:object> tag
        const objectEndPos = findMatchingClosingTag(xmlContent, objectContentStart, "dia:object");
        const classObjectContent = xmlContent.substring(objectStartPos, objectEndPos);

        // Extract class name
        const classNameRegex = /<dia:attribute name="name">\s*<dia:string>#([^#]+)#<\/dia:string>\s*<\/dia:attribute>/;
        const nameMatch = classObjectContent.match(classNameRegex);
        if (!nameMatch) continue;

        const className = nameMatch[1];
        const classData = classDataMap.get(className);

        // If this class doesn't exist in source code, leave unchanged
        if (!classData) continue;

        // Mark this class as processed
        processedClasses.add(className);

        // Find attributes section positions in ORIGINAL content
        let attributesReplacement = null;
        const attributesMatch = classObjectContent.match(/<dia:attribute name="attributes">/);
        const attributesSelfClosing = classObjectContent.match(/<dia:attribute name="attributes"\/>/);

        if (attributesMatch) {
            const attrStartPos = classObjectContent.indexOf('<dia:attribute name="attributes">');
            const attrEndPos = findMatchingClosingTag(classObjectContent, attrStartPos + '<dia:attribute name="attributes">'.length, "dia:attribute");
            const oldAttributesXml = classObjectContent.substring(attrStartPos, attrEndPos);
            const newAttributesXml = buildAttributesXmlString(classData.properties);
            attributesReplacement = { old: oldAttributesXml, new: newAttributesXml };
        } else if (attributesSelfClosing) {
            attributesReplacement = { old: '<dia:attribute name="attributes"/>', new: buildAttributesXmlString(classData.properties) };
        }

        // Find operations section positions in ORIGINAL content
        let operationsReplacement = null;
        const operationsSelfClosing = classObjectContent.match(/<dia:attribute name="operations"\/>/);
        const operationsMatch = !operationsSelfClosing && classObjectContent.match(/<dia:attribute name="operations">/);

        if (operationsSelfClosing) {
            operationsReplacement = { old: '<dia:attribute name="operations"/>', new: buildOperationsXmlString(classData.methods) };
        } else if (operationsMatch) {
            const opStartPos = classObjectContent.indexOf('<dia:attribute name="operations">');
            try {
                const opEndPos = findMatchingClosingTag(classObjectContent, opStartPos + '<dia:attribute name="operations">'.length, "dia:attribute");
                const oldOperationsXml = classObjectContent.substring(opStartPos, opEndPos);
                const newOperationsXml = buildOperationsXmlString(classData.methods);
                operationsReplacement = { old: oldOperationsXml, new: newOperationsXml };
            } catch (e) {
                console.error(`Error finding closing tag for operations in class ${className}`);
                console.error(`Content snippet: ${classObjectContent.substring(opStartPos, opStartPos + 200)}`);
                throw e;
            }
        }

        // Apply both replacements to the original content
        let updatedClassContent = classObjectContent;
        if (attributesReplacement) {
            updatedClassContent = updatedClassContent.replace(attributesReplacement.old, attributesReplacement.new);
        }
        if (operationsReplacement) {
            updatedClassContent = updatedClassContent.replace(operationsReplacement.old, operationsReplacement.new);
        }

        // Store replacement (will apply in reverse order to maintain positions)
        replacements.push({
            start: objectStartPos,
            end: objectEndPos,
            newContent: updatedClassContent
        });

        updatedCount++;
    }

    // Apply replacements in reverse order (to maintain positions)
    replacements.reverse().forEach(repl => {
        updatedContent = updatedContent.substring(0, repl.start) + repl.newContent + updatedContent.substring(repl.end);
    });

    console.log(`      Updated ${updatedCount} classes using direct XML manipulation`);

    // Find classes in source code that don't exist in diagram
    const missingClasses = currentClasses.filter(cls => !processedClasses.has(cls.name));

    if (missingClasses.length > 0) {
        console.log(`      Found ${missingClasses.length} new class(es) to add to diagram`);

        // Find the last </dia:object> before </dia:layer> to insert new classes
        const layerEndMatch = updatedContent.lastIndexOf('</dia:layer>');
        if (layerEndMatch === -1) {
            console.error('      Warning: Could not find </dia:layer> tag, skipping new class insertion');
        } else {
            // Generate XML for each new class
            let newClassesXml = '';
            let posY = 5; // Start position for new classes

            for (const classData of missingClasses) {
                const objectId = generateUniqueObjectId(updatedContent + newClassesXml);
                newClassesXml += generateNewClassXml(classData, objectId, 5, posY);
                posY += 15; // Stack new classes vertically with spacing
            }

            // Insert before </dia:layer>
            updatedContent = updatedContent.substring(0, layerEndMatch) + newClassesXml + updatedContent.substring(layerEndMatch);

            console.log(`      Added ${missingClasses.length} new class(es): ${missingClasses.map(c => c.name).join(', ')}`);
        }
    }

    console.log(`      Preserved all formatting, associations, annotations, and routing\n`);

    return updatedContent;
}

/**
 * Main execution function
 */
async function main() {
    console.log("\n" + "=".repeat(60));
    console.log("  Diagram Update Tool (Preserve Layout)");
    console.log("=".repeat(60) + "\n");

    try {
        // Parse arguments
        const cliArgs = parseArguments();

        if (!cliArgs.config) {
            console.error("Error: --config argument is required");
            console.log("Usage: node update-diagram.js --config <path>");
            process.exit(1);
        }

        // Load configuration
        const configPath = path.resolve(cliArgs.config);
        if (!fs.existsSync(configPath)) {
            throw new Error(`Config file not found: ${configPath}`);
        }

        const config = require(configPath);
        console.log(`✓ Loaded configuration from: ${configPath}\n`);

        // Step 1: Check if diagram exists
        console.log("[1/3] Checking for existing diagram...");
        if (!fs.existsSync(config.outputFile)) {
            throw new Error(`Diagram file not found: ${config.outputFile}\nPlease create an initial diagram first using generate-diagram.js`);
        }
        console.log(`      ✓ Found diagram: ${config.outputFile}\n`);

        // Step 2: Analyze current source code
        console.log(`[2/3] Analyzing source directory: ${config.sourceDir}`);

        if (!fs.existsSync(config.sourceDir)) {
            throw new Error(`Source directory not found: ${config.sourceDir}`);
        }

        const classes = analyzeDirectory(config.sourceDir, config);
        console.log(`      Found ${classes.length} classes in source code\n`);

        if (classes.length === 0) {
            console.warn("⚠ Warning: No classes found in source directory");
            process.exit(0);
        }

        // Step 3: Update diagram using direct XML string manipulation
        console.log("[3/3] Updating diagram using direct XML manipulation...");

        // Load existing diagram as string
        const xmlContent = fs.readFileSync(config.outputFile, "utf-8");

        // Update class members using string replacement (preserves all formatting)
        const updatedXml = updateDiagramWithStringReplacement(xmlContent, classes);

        // Write to file
        fs.writeFileSync(config.outputFile, updatedXml);
        console.log(`✓ Diagram updated and saved to: ${config.outputFile}\n`);

        console.log("=".repeat(60));
        console.log("✓ Diagram update completed successfully!");
        console.log(`  Output: ${config.outputFile}`);
        console.log(`  Classes analyzed: ${classes.length}`);
        console.log(`  All diagram elements preserved byte-for-byte (positions, routing, annotations, etc.)`);
        console.log("=".repeat(60) + "\n");

    } catch (error) {
        console.error("\n❌ Error:", error.message);
        if (error.stack) {
            console.error("\nStack trace:");
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

module.exports = { parseExistingDiagram };

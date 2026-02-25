/**
 * JavaScript class analyzer
 * Parses JavaScript files and extracts class metadata for diagram generation
 */

const fs = require("fs");
const path = require("path");
const { parse } = require("@babel/parser");

/**
 * Determine if a member name is truly private (JavaScript private fields)
 * Convention: Only names starting with # are considered private
 * Underscore-prefixed names (_) are treated as regular public members
 * @param {string} name - Member name (property or method)
 * @returns {boolean} True if private, false if public
 */
function isPrivateMember(name) {
    return name && typeof name === 'string' && name.startsWith("#");
}

/**
 * Extract type information from JSDoc @type annotation
 * @param {object} node - AST node that may have leading comments
 * @returns {string|null} Type string from JSDoc or null if not found
 */
function extractJSDocType(node) {
    if (!node.leadingComments || node.leadingComments.length === 0) {
        return null;
    }

    // Look through all leading comments for JSDoc @type annotation
    for (const comment of node.leadingComments) {
        if (comment.type === "CommentBlock") {
            // Match @type {TypeExpression} pattern
            const typeMatch = comment.value.match(/@type\s*\{([^}]+)\}/);
            if (typeMatch) {
                return typeMatch[1].trim();
            }
        }
    }

    return null;
}

/**
 * Extract parameter information from JSDoc @param annotations
 * @param {object} node - AST node that may have leading comments
 * @returns {Map<string, string>} Map of parameter names to their types
 */
function extractJSDocParams(node) {
    const paramTypes = new Map();

    if (!node.leadingComments || node.leadingComments.length === 0) {
        return paramTypes;
    }

    // Look through all leading comments for JSDoc @param annotations
    for (const comment of node.leadingComments) {
        if (comment.type === "CommentBlock") {
            // Match @param {Type} name pattern
            const paramRegex = /@param\s*\{([^}]+)\}\s*(\w+)/g;
            let match;
            while ((match = paramRegex.exec(comment.value)) !== null) {
                const type = match[1].trim();
                const paramName = match[2].trim();
                paramTypes.set(paramName, type);
            }
        }
    }

    return paramTypes;
}

/**
 * Extract return type from JSDoc @returns or @return annotation
 * @param {object} node - AST node that may have leading comments
 * @returns {string|null} Return type string from JSDoc or null if not found
 */
function extractJSDocReturnType(node) {
    if (!node.leadingComments || node.leadingComments.length === 0) {
        return null;
    }

    for (const comment of node.leadingComments) {
        if (comment.type === "CommentBlock") {
            // Match @returns {Type} or @return {Type}
            const returnMatch = comment.value.match(/@returns?\s*\{([^}]+)\}/);
            if (returnMatch) {
                return returnMatch[1].trim();
            }
        }
    }

    return null;
}

/**
 * Extract description text from JSDoc (text before first @ tag)
 * @param {object} node - AST node that may have leading comments
 * @returns {string|null} Description text or null if not found
 */
function extractJSDocDescription(node) {
    if (!node.leadingComments || node.leadingComments.length === 0) {
        return null;
    }

    for (const comment of node.leadingComments) {
        if (comment.type === "CommentBlock") {
            // Extract text before first @ tag
            // Remove leading/trailing whitespace and asterisks
            const descMatch = comment.value.match(/^\s*\*?\s*([\s\S]*?)(?=@|$)/);
            if (descMatch) {
                const description = descMatch[1]
                    .split('\n')
                    .map(line => line.replace(/^\s*\*\s?/, '').trim())
                    .filter(line => line.length > 0)
                    .join(' ')
                    .trim();

                return description.length > 0 ? description : null;
            }
        }
    }

    return null;
}

/**
 * Recursively find all JavaScript files in a directory
 * @param {string} dir - Directory to search
 * @param {Array} fileList - Accumulator for file paths
 * @returns {Array} Array of absolute file paths
 */
function findJsFilesRecursive(dir, fileList = []) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            // Recursively search subdirectories
            findJsFilesRecursive(filePath, fileList);
        } else if (file.endsWith(".js")) {
            // Add JavaScript files
            fileList.push(filePath);
        }
    });

    return fileList;
}

/**
 * Analyze all JavaScript files in a directory (recursively)
 * @param {string} sourceDir - Directory containing JavaScript files
 * @param {object} config - Configuration options
 * @returns {Array} Array of class metadata objects
 */
function analyzeDirectory(sourceDir, config) {
    const classes = [];

    // Recursively find all .js files
    const files = findJsFilesRecursive(sourceDir);

    for (const filePath of files) {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const fileName = path.basename(filePath);
        const classInfo = analyzeFile(fileContent, fileName, config);

        if (classInfo) {
            classes.push(...classInfo);
        }
    }

    // Filter based on include/exclude patterns
    return filterClasses(classes, config.classes);
}

/**
 * Parse a single JavaScript file and extract class information
 * @param {string} content - File content
 * @param {string} filename - Name of the file
 * @param {object} config - Configuration options
 * @returns {Array} Array of class metadata (a file may have multiple classes)
 */
function analyzeFile(content, filename, config) {
    try {
        const ast = parse(content, {
            sourceType: "module",
            plugins: ["classProperties", "classPrivateProperties", "classPrivateMethods"],
        });

        const classes = [];

        // Traverse AST to find class declarations
        for (const node of ast.program.body) {
            if (node.type === "ExportNamedDeclaration" && node.declaration?.type === "ClassDeclaration") {
                classes.push(extractClassInfo(node.declaration, filename, config));
            } else if (node.type === "ClassDeclaration") {
                classes.push(extractClassInfo(node, filename, config));
            }
        }

        // If no classes found, create a pseudo-class from top-level functions
        if (classes.length === 0) {
            const pseudoClass = extractFunctionsAsPseudoClass(ast, filename, config);
            if (pseudoClass) {
                classes.push(pseudoClass);
            }
        }

        return classes;
    } catch (error) {
        console.error(`Error parsing ${filename}:`, error.message);
        return null;
    }
}

/**
 * Extract properties from an array of object literals
 * @param {object} arrayNode - AST ArrayExpression node
 * @returns {Array} Array of property metadata
 */
function extractPropertiesFromArrayLiteral(arrayNode) {
    const properties = [];
    const propertyKeys = new Set();

    // Collect all unique keys from objects in the array
    for (const element of arrayNode.elements) {
        if (element && element.type === "ObjectExpression") {
            for (const prop of element.properties) {
                if (prop.type === "ObjectProperty" && prop.key.type === "Identifier") {
                    propertyKeys.add(prop.key.name);
                }
            }
        }
    }

    // Create property entries
    for (const key of propertyKeys) {
        properties.push({
            name: key,
            type: "unknown", // Could try to infer from first element
            visibility: "public",
            source: "constant-array",
            comment: null,
        });
    }

    return properties;
}

/**
 * Extract properties from an object literal
 * @param {object} objectNode - AST ObjectExpression node
 * @returns {Array} Array of property metadata
 */
function extractPropertiesFromObjectLiteral(objectNode) {
    const properties = [];

    for (const prop of objectNode.properties) {
        if (prop.type === "ObjectProperty" && prop.key.type === "Identifier") {
            const propType = inferType(prop.value);
            properties.push({
                name: prop.key.name,
                type: propType,
                visibility: "public",
                source: "constant-object",
                comment: null,
            });
        }
    }

    return properties;
}

/**
 * Extract top-level functions and constants, creating a pseudo-class for files without classes
 * @param {object} ast - Babel AST
 * @param {string} filename - Name of the file (will be used as pseudo-class name)
 * @param {object} config - Configuration options
 * @returns {object|null} Pseudo-class metadata or null if no functions/constants found
 */
function extractFunctionsAsPseudoClass(ast, filename, config) {
    const methods = [];
    const properties = [];

    // Traverse AST to find top-level functions and exported constants
    for (const node of ast.program.body) {
        let functionNode = null;
        let functionName = null;

        // Function declarations: function foo() {}
        if (node.type === "FunctionDeclaration" && node.id) {
            functionNode = node;
            functionName = node.id.name;
        }
        // Exported function declarations: export function foo() {}
        else if (node.type === "ExportNamedDeclaration" && node.declaration?.type === "FunctionDeclaration") {
            functionNode = node.declaration;
            functionName = node.declaration.id.name;
        }
        // Variable declarations with function expressions: const foo = function() {}
        else if (node.type === "VariableDeclaration") {
            for (const declarator of node.declarations) {
                if (declarator.init &&
                    (declarator.init.type === "FunctionExpression" ||
                     declarator.init.type === "ArrowFunctionExpression")) {
                    functionNode = declarator.init;
                    functionName = declarator.id.name;
                    break;
                }
            }
        }
        // Exported variable with function: export const foo = () => {}
        // Also handle exported constants (arrays/objects): export const foo = [...]
        else if (node.type === "ExportNamedDeclaration" && node.declaration?.type === "VariableDeclaration") {
            for (const declarator of node.declaration.declarations) {
                if (declarator.init &&
                    (declarator.init.type === "FunctionExpression" ||
                     declarator.init.type === "ArrowFunctionExpression")) {
                    functionNode = declarator.init;
                    functionName = declarator.id.name;
                    break;
                } else if (declarator.init &&
                          (declarator.init.type === "ArrayExpression" ||
                           declarator.init.type === "ObjectExpression")) {
                    // Handle exported constant arrays/objects
                    const constantName = declarator.id.name;
                    const jsDocType = extractJSDocType(node) || extractJSDocType(declarator);
                    const jsDocDesc = extractJSDocDescription(node) || extractJSDocDescription(declarator);

                    let constantProps = [];
                    if (declarator.init.type === "ArrayExpression") {
                        constantProps = extractPropertiesFromArrayLiteral(declarator.init);
                    } else if (declarator.init.type === "ObjectExpression") {
                        constantProps = extractPropertiesFromObjectLiteral(declarator.init);
                    }

                    // Add a special "property" representing the constant itself
                    properties.push({
                        name: constantName,
                        type: jsDocType || (declarator.init.type === "ArrayExpression" ? "Array" : "Object"),
                        visibility: "public",
                        source: "constant",
                        comment: jsDocDesc,
                    });

                    // Add the structure properties with a prefix
                    constantProps.forEach(prop => {
                        properties.push({
                            ...prop,
                            name: `  ${prop.name}`, // Indent to show hierarchy
                        });
                    });
                    break;
                }
            }
        }

        // Extract function info if found
        if (functionNode && functionName) {
            const isPrivate = isPrivateMember(functionName);

            // Apply filtering based on config
            if (isPrivate && !config.methods.includePrivate) continue;

            // Extract return type and description from JSDoc
            const returnType = extractJSDocReturnType(functionNode);
            const functionDescription = extractJSDocDescription(functionNode);

            methods.push({
                name: functionName,
                visibility: isPrivate ? "private" : "public",
                params: functionNode.params ? functionNode.params.length : 0,
                source: "function",
                returnType: returnType,
                comment: functionDescription,
            });
        }
    }

    // If no functions or constants found, don't create a pseudo-class
    if (methods.length === 0 && properties.length === 0) {
        return null;
    }

    // Apply method filtering and limits
    const filteredMethods = filterMethods(methods, config.methods);
    const filteredProps = filterProperties(properties, config.properties);

    // Create pseudo-class with filename as class name
    return {
        name: filename, // Use filename including .js extension
        filename,
        properties: filteredProps,
        methods: filteredMethods,
        superClass: null, // No inheritance for pseudo-classes
    };
}

/**
 * Extract class information from a class declaration AST node
 * @param {object} classNode - Babel AST class declaration node
 * @param {string} filename - Source filename
 * @param {object} config - Configuration options
 * @returns {object} Class metadata
 */
function extractClassInfo(classNode, filename, config) {
    const className = classNode.id.name;
    const properties = [];
    const methods = [];

    // Extract constructor properties and methods from class body
    for (const member of classNode.body.body) {
        if (member.type === "ClassMethod" || member.type === "ClassPrivateMethod") {
            if (member.key.name === "constructor" || (member.key.type === "Identifier" && member.key.name === "constructor")) {
                // Extract properties assigned in constructor
                extractConstructorProperties(member, properties, config.properties);
                // Also extract constructor as a method
                const constructorInfo = extractMethod(member, config.methods);
                if (constructorInfo) {
                    methods.push(constructorInfo);
                }
            } else if (member.kind === "get" && config.properties.includeGetters) {
                // Getter - treat as a property when includeGetters is true in properties config
                const propInfo = extractGetter(member, config.properties);
                if (propInfo) {
                    properties.push(propInfo);
                }
            } else if (member.kind === "get" || member.kind === "set") {
                // Getter/setter being treated as methods (only if not already handled above)
                const methodInfo = extractMethod(member, config.methods);
                if (methodInfo) {
                    methods.push(methodInfo);
                }
            } else {
                // Regular method (public or private)
                const methodInfo = extractMethod(member, config.methods);
                if (methodInfo) {
                    methods.push(methodInfo);
                }
            }
        } else if (member.type === "ClassProperty" || member.type === "ClassPrivateProperty") {
            // Class field (public or private)
            const propInfo = extractProperty(member, config.properties);
            if (propInfo) {
                properties.push(propInfo);
            }
        }
    }

    // Deduplicate properties by name (keep first occurrence)
    const seenProps = new Map();
    const uniqueProperties = [];
    for (const prop of properties) {
        if (!seenProps.has(prop.name)) {
            seenProps.set(prop.name, true);
            uniqueProperties.push(prop);
        }
    }

    // Deduplicate methods by name (keep first occurrence)
    const seenMethods = new Map();
    const uniqueMethods = [];
    for (const method of methods) {
        if (!seenMethods.has(method.name)) {
            seenMethods.set(method.name, true);
            uniqueMethods.push(method);
        }
    }

    // Apply filtering and limits
    const filteredProps = filterProperties(uniqueProperties, config.properties);
    const filteredMethods = filterMethods(uniqueMethods, config.methods);

    return {
        name: className,
        filename,
        properties: filteredProps,
        methods: filteredMethods,
        superClass: classNode.superClass ? classNode.superClass.name : null,
    };
}

/**
 * Detect if a property represents a composition relationship to another class
 * @param {string} propName - Property name
 * @param {object} valueNode - AST node of the assigned value
 * @returns {string|null} Name of the composed class, or null if not a composition
 */
function detectCompositionType(propName, valueNode) {
    // Pattern 1: Property name suggests a class type (e.g., containingModel, fromProtein, toProtein)
    // Look for patterns like: fromXxx, toXxx, containingXxx, xxxModel
    const patterns = [
        { regex: /^from([A-Z][a-zA-Z]*)$/, capture: 1 },        // fromProtein → Protein
        { regex: /^to([A-Z][a-zA-Z]*)$/, capture: 1 },          // toProtein → Protein
        { regex: /^containing([A-Z][a-zA-Z]*)$/, capture: 1 },  // containingModel → Model
        { regex: /([A-Z][a-zA-Z]*)Model$/, capture: 1 },        // searchResultsModel → SearchResultsModel
    ];

    for (const pattern of patterns) {
        const match = propName.match(pattern.regex);
        if (match) {
            return match[pattern.capture];
        }
    }

    // Pattern 2: Assignment from parameter (e.g., this.containingModel = containingModel)
    if (valueNode.type === "Identifier") {
        const paramName = valueNode.name;
        // If parameter name suggests a type, extract it
        for (const pattern of patterns) {
            const match = paramName.match(pattern.regex);
            if (match) {
                return match[pattern.capture];
            }
        }
    }

    // Pattern 3: New expression (e.g., this.x = new Crosslink(...))
    if (valueNode.type === "NewExpression" && valueNode.callee && valueNode.callee.name) {
        return valueNode.callee.name;
    }

    return null;
}

/**
 * Extract properties from constructor assignments (this.prop = ...)
 * @param {object} constructorNode - Constructor method AST node
 * @param {Array} properties - Array to push property info into
 * @param {object} propConfig - Property configuration
 */
function extractConstructorProperties(constructorNode, properties, propConfig) {
    if (!constructorNode.body || !constructorNode.body.body) return;

    for (const statement of constructorNode.body.body) {
        if (statement.type === "ExpressionStatement" &&
            statement.expression.type === "AssignmentExpression" &&
            statement.expression.left.type === "MemberExpression" &&
            statement.expression.left.object.type === "ThisExpression") {

            // Handle both regular properties and private properties (#field)
            let propName;
            const property = statement.expression.left.property;
            if (property.type === "PrivateName") {
                // Private field: this.#fieldName
                if (property.id && property.id.name) {
                    propName = "#" + property.id.name;
                } else {
                    continue; // Skip if name is missing
                }
            } else if (property.name) {
                propName = property.name;
            } else {
                continue; // Skip if name is missing
            }

            const isPrivate = isPrivateMember(propName);

            // Apply filtering based on config
            if (isPrivate && !propConfig.includePrivate) continue;

            const rightSide = statement.expression.right;

            // Try to get type from JSDoc first, fallback to inference
            let propType = extractJSDocType(statement);
            if (!propType) {
                propType = inferType(rightSide);
            }

            // Try to get description from JSDoc
            let propDescription = extractJSDocDescription(statement);

            // Detect potential composition relationships (skip for private fields with #)
            const compositionTarget = propName.startsWith("#") ? null : detectCompositionType(propName, rightSide);

            properties.push({
                name: propName,
                type: propType,
                visibility: isPrivate ? "private" : "public",
                source: "constructor",
                compositionTarget: compositionTarget, // Class name if this is a composition, null otherwise
                comment: propDescription,
            });
        }
    }
}

/**
 * Extract method information
 * Note: Getters are typically handled as properties (see extractGetter).
 * This function only processes getters when config.properties.includeGetters is false
 * and config.methods.includeGetters is true.
 *
 * @param {object} methodNode - Method AST node
 * @param {object} methodConfig - Method configuration
 * @returns {object|null} Method metadata or null if filtered
 */
function extractMethod(methodNode, methodConfig) {
    // Handle both regular methods and private methods (#method)
    let methodName;
    if (methodNode.key.type === "PrivateName") {
        // Private method: #methodName - the id contains the name without #
        if (methodNode.key.id && methodNode.key.id.name) {
            methodName = "#" + methodNode.key.id.name;
        } else {
            return null; // Skip if name is missing
        }
    } else if (methodNode.key.name) {
        methodName = methodNode.key.name;
    } else {
        return null; // Skip if name is missing
    }

    const isPrivate = isPrivateMember(methodName);
    const isGetter = methodNode.kind === "get";
    const isSetter = methodNode.kind === "set";

    // Early filtering
    if (isPrivate && !methodConfig.includePrivate) return null;
    if (isGetter && !methodConfig.includeGetters) return null;
    if (isSetter && !methodConfig.includeSetters) return null;

    // Extract parameter types from JSDoc
    const jsDocParamTypes = extractJSDocParams(methodNode);

    // Extract return type and description from JSDoc
    const returnType = extractJSDocReturnType(methodNode);
    const methodDescription = extractJSDocDescription(methodNode);

    // Build parameter list with types
    const parameters = methodNode.params.map(param => {
        let paramName = "unknown";

        // Extract parameter name from various AST node types
        if (param.type === "Identifier") {
            paramName = param.name;
        } else if (param.type === "AssignmentPattern" && param.left.type === "Identifier") {
            // Default parameter: param = defaultValue
            paramName = param.left.name;
        } else if (param.type === "RestElement" && param.argument.type === "Identifier") {
            // Rest parameter: ...param
            paramName = "..." + param.argument.name;
        }

        // Get type from JSDoc or default to unknown
        const paramType = jsDocParamTypes.get(paramName.replace("...", "")) || "unknown";

        return {
            name: paramName,
            type: paramType
        };
    });

    return {
        name: methodName,
        kind: methodNode.kind, // "method", "get", or "set"
        visibility: isPrivate ? "private" : "public",
        params: methodNode.params.length,
        parameters: parameters, // Array of {name, type} objects
        returnType: returnType,
        comment: methodDescription,
    };
}

/**
 * Extract property information
 * @param {object} propNode - Property AST node
 * @param {object} propConfig - Property configuration
 * @returns {object|null} Property metadata or null if filtered
 */
function extractProperty(propNode, propConfig) {
    // Handle both regular properties and private properties (#field)
    let propName;
    if (propNode.key.type === "PrivateName") {
        // Private field: #fieldName - the id contains the name without #
        if (propNode.key.id && propNode.key.id.name) {
            propName = "#" + propNode.key.id.name;
        } else {
            return null; // Skip if name is missing
        }
    } else if (propNode.key.name) {
        propName = propNode.key.name;
    } else {
        return null; // Skip if name is missing
    }

    const isPrivate = isPrivateMember(propName);

    if (isPrivate && !propConfig.includePrivate) return null;

    // Try to get type from JSDoc first, fallback to inference
    let propType = extractJSDocType(propNode);
    if (!propType) {
        propType = propNode.value ? inferType(propNode.value) : "unknown";
    }

    // Try to get description from JSDoc
    let propDescription = extractJSDocDescription(propNode);

    return {
        name: propName,
        type: propType,
        visibility: isPrivate ? "private" : "public",
        source: "field",
        comment: propDescription,
    };
}

/**
 * Extract getter as a property
 * @param {object} getterNode - Getter method AST node
 * @param {object} propConfig - Property configuration
 * @returns {object|null} Property metadata or null if filtered
 */
function extractGetter(getterNode, propConfig) {
    // Handle both regular getters and private getters (#getter)
    let propName;
    if (getterNode.key.type === "PrivateName") {
        // Private getter: #propName - the id contains the name without #
        if (getterNode.key.id && getterNode.key.id.name) {
            propName = "#" + getterNode.key.id.name;
        } else {
            return null; // Skip if name is missing
        }
    } else if (getterNode.key.name) {
        propName = getterNode.key.name;
    } else {
        return null; // Skip if name is missing
    }

    const isPrivate = isPrivateMember(propName);

    if (isPrivate && !propConfig.includePrivate) return null;

    // Try to get type from JSDoc - getters use @returns since they're methods that return values
    let propType = extractJSDocReturnType(getterNode);
    if (!propType) {
        // Fallback to @type in case it was documented as a property
        propType = extractJSDocType(getterNode);
    }
    if (!propType) {
        propType = "unknown"; // Could try to infer from return statement in future
    }

    // Try to get description from JSDoc
    let propDescription = extractJSDocDescription(getterNode);

    return {
        name: propName,
        type: propType,
        visibility: isPrivate ? "private" : "public",
        source: "getter",
        comment: propDescription,
    };
}

/**
 * Infer type from AST node
 * @param {object} node - AST node
 * @returns {string} Inferred type
 */
function inferType(node) {
    if (!node) return "unknown";

    switch (node.type) {
        case "StringLiteral":
            return "string";
        case "NumericLiteral":
            return "number";
        case "BooleanLiteral":
            return "boolean";
        case "ArrayExpression":
            return "Array";
        case "ObjectExpression":
            return "Object";
        case "NewExpression":
            return node.callee.name || "Object";
        case "Identifier":
            return "unknown";
        default:
            return "unknown";
    }
}

/**
 * Filter classes based on include/exclude patterns
 * @param {Array} classes - Array of class metadata
 * @param {object} classConfig - Class configuration
 * @returns {Array} Filtered classes
 */
function filterClasses(classes, classConfig) {
    return classes.filter(cls => {
        // Check exclude patterns
        if (classConfig.exclude.includes(cls.name)) {
            return false;
        }

        // Check include patterns
        if (classConfig.include.includes("*")) {
            return true;
        }

        return classConfig.include.includes(cls.name);
    });
}

/**
 * Filter properties based on configuration
 * @param {Array} properties - Array of property metadata
 * @param {object} propConfig - Property configuration
 * @returns {Array} Filtered properties
 */
function filterProperties(properties, propConfig) {
    let filtered = properties;

    // Apply exclude patterns
    if (propConfig.excludePatterns.length > 0) {
        filtered = filtered.filter(prop => {
            return !propConfig.excludePatterns.some(pattern => pattern.test(prop.name));
        });
    }

    // Apply max limit
    if (propConfig.maxProperties && filtered.length > propConfig.maxProperties) {
        filtered = filtered.slice(0, propConfig.maxProperties);
    }

    return filtered;
}

/**
 * Filter methods based on configuration
 * @param {Array} methods - Array of method metadata
 * @param {object} methodConfig - Method configuration
 * @returns {Array} Filtered methods
 */
function filterMethods(methods, methodConfig) {
    let filtered = methods;

    // Apply exclude patterns
    if (methodConfig.excludePatterns.length > 0) {
        filtered = filtered.filter(method => {
            return !methodConfig.excludePatterns.some(pattern => pattern.test(method.name));
        });
    }

    // Apply max limit
    if (methodConfig.maxMethods && filtered.length > methodConfig.maxMethods) {
        filtered = filtered.slice(0, methodConfig.maxMethods);
    }

    return filtered;
}

/**
 * Detect relationships (inheritance and composition) between classes
 * @param {Array} classes - Array of class metadata
 * @param {object} config - Configuration with relationships settings
 * @returns {Array} Array of relationship objects
 */
function detectRelationships(classes, config) {
    if (!config.relationships || !config.relationships.enabled) {
        return [];
    }

    const relationships = [];
    const classNames = new Set(classes.map(cls => cls.name));

    for (const cls of classes) {
        // Detect inheritance relationships
        if (config.relationships.detectInheritance && cls.superClass) {
            // Only add if the superclass is in our class list
            if (classNames.has(cls.superClass)) {
                relationships.push({
                    type: "inheritance",
                    from: cls.name,
                    to: cls.superClass,
                });
            }
        }

        // Detect composition relationships from properties
        if (config.relationships.detectComposition) {
            for (const prop of cls.properties) {
                if (prop.compositionTarget && classNames.has(prop.compositionTarget)) {
                    relationships.push({
                        type: "composition",
                        from: cls.name,
                        to: prop.compositionTarget,
                        fromProperty: prop.name,
                    });
                }
            }
        }
    }

    return relationships;
}

module.exports = {
    analyzeDirectory,
    detectRelationships,
};

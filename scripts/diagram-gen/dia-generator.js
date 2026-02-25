/**
 * Dia diagram XML generator
 * Generates .dia format XML from class metadata
 */

const { create } = require("xmlbuilder2");
const { generateRelationships, calculateHierarchicalPositions } = require("./dia-relationship-generator");

/**
 * Generate .dia XML from class metadata
 * @param {Array} classes - Array of class metadata from analyzer
 * @param {Array} relationships - Array of relationship metadata
 * @param {object} config - Layout and visual configuration
 * @returns {string} XML string in .dia format
 */
function generateDiagram(classes, relationships, config) {
    // Create root diagram structure
    const root = create({ version: "1.0", encoding: "UTF-8" })
        .ele("dia:diagram", { "xmlns:dia": "http://www.lysator.liu.se/~alla/dia/" });

    // Add diagram metadata
    addDiagramData(root);

    // Add layer with all classes
    const layer = root.ele("dia:layer", { name: "Background", visible: "true", active: "true" });

    // Calculate hierarchical positions based on inheritance
    const hierarchicalPositions = calculateHierarchicalPositions(classes, relationships, config);

    // Generate class objects
    classes.forEach((classInfo, index) => {
        addClassObject(layer, classInfo, index, config, hierarchicalPositions);
    });

    // Generate relationship objects
    if (relationships && relationships.length > 0) {
        const startId = classes.length; // Relationships start after classes
        const relationshipObjs = generateRelationships(relationships, classes, config, startId);

        relationshipObjs.forEach(relObj => {
            addRelationshipObject(layer, relObj);
        });
    }

    return root.end({ prettyPrint: true });
}

/**
 * Add diagram metadata section
 * @param {object} root - XML root element
 */
function addDiagramData(root) {
    const data = root.ele("dia:diagramdata");

    data.ele("dia:attribute", { name: "background" })
        .ele("dia:color", { val: "#ffffff" });

    data.ele("dia:attribute", { name: "pagebreak" })
        .ele("dia:color", { val: "#000099" });

    const paper = data.ele("dia:attribute", { name: "paper" })
        .ele("dia:composite", { type: "paper" });

    paper.ele("dia:attribute", { name: "name" })
        .ele("dia:string", {}).txt("#A4#");
    paper.ele("dia:attribute", { name: "tmargin" })
        .ele("dia:real", { val: "2.8222" });
    paper.ele("dia:attribute", { name: "bmargin" })
        .ele("dia:real", { val: "2.8222" });
    paper.ele("dia:attribute", { name: "lmargin" })
        .ele("dia:real", { val: "2.8222" });
    paper.ele("dia:attribute", { name: "rmargin" })
        .ele("dia:real", { val: "2.8222" });
    paper.ele("dia:attribute", { name: "is_portrait" })
        .ele("dia:boolean", { val: "true" });
    paper.ele("dia:attribute", { name: "scaling" })
        .ele("dia:real", { val: "1" });
    paper.ele("dia:attribute", { name: "fitto" })
        .ele("dia:boolean", { val: "false" });

    const grid = data.ele("dia:attribute", { name: "grid" })
        .ele("dia:composite", { type: "grid" });

    grid.ele("dia:attribute", { name: "width_x" })
        .ele("dia:real", { val: "1" });
    grid.ele("dia:attribute", { name: "width_y" })
        .ele("dia:real", { val: "1" });
    grid.ele("dia:attribute", { name: "visible_x" })
        .ele("dia:int", { val: "1" });
    grid.ele("dia:attribute", { name: "visible_y" })
        .ele("dia:int", { val: "1" });
    grid.ele("dia:composite", { type: "color" });

    data.ele("dia:attribute", { name: "color" })
        .ele("dia:color", { val: "#d8e5e5" });

    const guides = data.ele("dia:attribute", { name: "guides" })
        .ele("dia:composite", { type: "guides" });
    guides.ele("dia:attribute", { name: "hguides" });
    guides.ele("dia:attribute", { name: "vguides" });
}

/**
 * Add a UML class object to the diagram
 * @param {object} layer - Layer element
 * @param {object} classInfo - Class metadata
 * @param {number} index - Class index for ID
 * @param {object} config - Layout configuration
 * @param {object} hierarchicalPositions - Pre-calculated hierarchical positions
 */
function addClassObject(layer, classInfo, index, config, hierarchicalPositions) {
    const className = classInfo.name;

    // Get position: manual override > hierarchical > fallback
    const position = config.layout.positions[className] || hierarchicalPositions[className] || {
        x: 10,
        y: 10,
        width: config.layout.defaultWidth,
        height: config.layout.defaultHeight,
    };

    // Get color based on class type
    const classType = config.layout.classTypes[className] || "default";
    const fillColor = config.layout.colors[classType] || config.layout.colors.default;

    const obj = layer.ele("dia:object", { type: "UML - Class", version: "0", id: `O${index}` });

    // Position attributes
    obj.ele("dia:attribute", { name: "obj_pos" })
        .ele("dia:point", { val: `${position.x},${position.y}` });

    obj.ele("dia:attribute", { name: "obj_bb" })
        .ele("dia:rectangle", {
            val: `${position.x - 0.05},${position.y - 0.05};${position.x + position.width + 0.05},${position.y + position.height + 0.05}`
        });

    obj.ele("dia:attribute", { name: "elem_corner" })
        .ele("dia:point", { val: `${position.x},${position.y}` });

    obj.ele("dia:attribute", { name: "elem_width" })
        .ele("dia:real", { val: position.width });

    obj.ele("dia:attribute", { name: "elem_height" })
        .ele("dia:real", { val: position.height });

    // Class name and basic attributes
    obj.ele("dia:attribute", { name: "name" })
        .ele("dia:string", {}).txt(`#${className}#`);

    obj.ele("dia:attribute", { name: "stereotype" })
        .ele("dia:string", {}).txt("##");

    obj.ele("dia:attribute", { name: "comment" })
        .ele("dia:string", {}).txt("##");

    obj.ele("dia:attribute", { name: "abstract" })
        .ele("dia:boolean", { val: "false" });

    obj.ele("dia:attribute", { name: "suppress_attributes" })
        .ele("dia:boolean", { val: "false" });

    obj.ele("dia:attribute", { name: "suppress_operations" })
        .ele("dia:boolean", { val: "false" });

    obj.ele("dia:attribute", { name: "visible_attributes" })
        .ele("dia:boolean", { val: "true" });

    obj.ele("dia:attribute", { name: "visible_operations" })
        .ele("dia:boolean", { val: "true" });

    obj.ele("dia:attribute", { name: "visible_comments" })
        .ele("dia:boolean", { val: "false" });

    obj.ele("dia:attribute", { name: "wrap_operations" })
        .ele("dia:boolean", { val: "true" });

    obj.ele("dia:attribute", { name: "wrap_after_char" })
        .ele("dia:int", { val: "40" });

    obj.ele("dia:attribute", { name: "comment_line_length" })
        .ele("dia:int", { val: "17" });

    obj.ele("dia:attribute", { name: "comment_tagging" })
        .ele("dia:boolean", { val: "false" });

    // Visual styling
    obj.ele("dia:attribute", { name: "line_width" })
        .ele("dia:real", { val: "0.1" });

    obj.ele("dia:attribute", { name: "line_color" })
        .ele("dia:color", { val: "#000000" });

    obj.ele("dia:attribute", { name: "fill_color" })
        .ele("dia:color", { val: fillColor });

    obj.ele("dia:attribute", { name: "text_color" })
        .ele("dia:color", { val: "#000000" });

    // Font attributes
    obj.ele("dia:attribute", { name: "normal_font" })
        .ele("dia:font", { family: "monospace", style: "0", name: "Courier" });

    obj.ele("dia:attribute", { name: "abstract_font" })
        .ele("dia:font", { family: "monospace", style: "88", name: "Courier-BoldOblique" });

    obj.ele("dia:attribute", { name: "polymorphic_font" })
        .ele("dia:font", { family: "monospace", style: "8", name: "Courier-Oblique" });

    obj.ele("dia:attribute", { name: "classname_font" })
        .ele("dia:font", { family: "sans", style: "80", name: "Helvetica-Bold" });

    obj.ele("dia:attribute", { name: "abstract_classname_font" })
        .ele("dia:font", { family: "sans", style: "88", name: "Helvetica-BoldOblique" });

    obj.ele("dia:attribute", { name: "comment_font" })
        .ele("dia:font", { family: "sans", style: "8", name: "Helvetica-Oblique" });

    // Font heights
    const fonts = config.layout.fonts;
    obj.ele("dia:attribute", { name: "normal_font_height" })
        .ele("dia:real", { val: fonts.normalHeight });

    obj.ele("dia:attribute", { name: "polymorphic_font_height" })
        .ele("dia:real", { val: fonts.polymorphicHeight });

    obj.ele("dia:attribute", { name: "abstract_font_height" })
        .ele("dia:real", { val: fonts.abstractHeight });

    obj.ele("dia:attribute", { name: "classname_font_height" })
        .ele("dia:real", { val: fonts.classnameHeight });

    obj.ele("dia:attribute", { name: "abstract_classname_font_height" })
        .ele("dia:real", { val: fonts.abstractClassnameHeight });

    obj.ele("dia:attribute", { name: "comment_font_height" })
        .ele("dia:real", { val: fonts.commentHeight });

    // Add properties (attributes)
    addAttributes(obj, classInfo.properties);

    // Add methods (operations)
    addOperations(obj, classInfo.methods);

    // Template attributes
    obj.ele("dia:attribute", { name: "template" })
        .ele("dia:boolean", { val: "false" });

    obj.ele("dia:attribute", { name: "templates" });
}

/**
 * Add properties (attributes) to a class object
 * @param {object} obj - Class object element
 * @param {Array} properties - Array of property metadata
 */
function addAttributes(obj, properties) {
    const attrs = obj.ele("dia:attribute", { name: "attributes" });

    properties.forEach(prop => {
        const composite = attrs.ele("dia:composite", { type: "umlattribute" });

        // Property name with type annotation
        const displayName = prop.type !== "unknown" ? `${prop.name}: ${prop.type}` : prop.name;

        composite.ele("dia:attribute", { name: "name" })
            .ele("dia:string", {}).txt(`#${displayName}#`);

        // Visibility: 0 = public, 1 = private, 2 = protected
        const visibility = prop.visibility === "private" ? "1" : "0";
        composite.ele("dia:attribute", { name: "visibility" })
            .ele("dia:enum", { val: visibility });
    });
}

/**
 * Add methods (operations) to a class object
 * @param {object} obj - Class object element
 * @param {Array} methods - Array of method metadata
 */
function addOperations(obj, methods) {
    const ops = obj.ele("dia:attribute", { name: "operations" });

    methods.forEach(method => {
        const composite = ops.ele("dia:composite", { type: "umloperation" });

        // Method name
        let displayName = method.name;
        if (method.kind === "get") {
            displayName = `get ${method.name}()`;
        } else if (method.kind === "set") {
            displayName = `set ${method.name}()`;
        } else {
            displayName = `${method.name}()`;
        }

        composite.ele("dia:attribute", { name: "name" })
            .ele("dia:string", {}).txt(`#${displayName}#`);

        // Visibility
        const visibility = method.visibility === "private" ? "1" : "0";
        composite.ele("dia:attribute", { name: "visibility" })
            .ele("dia:enum", { val: visibility });
    });
}

/**
 * Add a UML relationship object (association/composition/inheritance) to the diagram
 * @param {object} layer - Layer element
 * @param {object} relObj - Relationship object with points, orientations, etc.
 */
function addRelationshipObject(layer, relObj) {
    if (relObj.type === "inheritance") {
        // Use UML - Generalization for inheritance relationships
        addGeneralizationObject(layer, relObj);
    } else {
        // Use UML - Association for composition and other relationships
        addAssociationObject(layer, relObj);
    }
}

/**
 * Add a UML - Generalization object for inheritance
 * @param {object} layer - Layer element
 * @param {object} relObj - Relationship object with points, orientations, etc.
 */
function addGeneralizationObject(layer, relObj) {
    const obj = layer.ele("dia:object", {
        type: "UML - Generalization",
        version: "1",
        id: relObj.id
    });

    // Name (usually empty)
    obj.ele("dia:attribute", { name: "name" })
        .ele("dia:string", {}).txt("##");

    // Stereotype (usually empty)
    obj.ele("dia:attribute", { name: "stereotype" })
        .ele("dia:string", {}).txt("##");

    // Object position (first point)
    const firstPoint = relObj.points[0];
    obj.ele("dia:attribute", { name: "obj_pos" })
        .ele("dia:point", { val: `${firstPoint.x},${firstPoint.y}` });

    // Bounding box
    const bb = relObj.boundingBox;
    obj.ele("dia:attribute", { name: "obj_bb" })
        .ele("dia:rectangle", {
            val: `${bb.minX},${bb.minY};${bb.maxX},${bb.maxY}`
        });

    // Orthogonal points
    const orthPoints = obj.ele("dia:attribute", { name: "orth_points" });
    relObj.points.forEach(point => {
        orthPoints.ele("dia:point", { val: `${point.x},${point.y}` });
    });

    // Orthogonal orientations
    const orthOrient = obj.ele("dia:attribute", { name: "orth_orient" });
    relObj.orientations.forEach(orientation => {
        orthOrient.ele("dia:enum", { val: orientation.toString() });
    });

    // Auto-routing
    obj.ele("dia:attribute", { name: "autorouting" })
        .ele("dia:boolean", { val: "true" });

    // Colors
    obj.ele("dia:attribute", { name: "text_colour" })
        .ele("dia:color", { val: "#000000" });
    obj.ele("dia:attribute", { name: "line_colour" })
        .ele("dia:color", { val: "#000000" });

    // Line width
    obj.ele("dia:attribute", { name: "line_width" })
        .ele("dia:real", { val: "0.1" });

    // Connections to class objects
    // For UML Generalization: handle 0 goes to parent (superclass), handle 1 to child (subclass)
    // Connection point 6 = middle bottom, connection point 1 = middle top
    const connections = obj.ele("dia:connections");
    connections.ele("dia:connection", {
        handle: "0",
        to: `O${relObj.toId}`,  // parent class - connect to middle bottom (6)
        connection: "6"
    });
    connections.ele("dia:connection", {
        handle: "1",
        to: `O${relObj.fromId}`,  // child class - connect to middle top (1)
        connection: "1"
    });
}

/**
 * Add a UML - Association object for composition and other relationships
 * @param {object} layer - Layer element
 * @param {object} relObj - Relationship object with points, orientations, etc.
 */
function addAssociationObject(layer, relObj) {
    const obj = layer.ele("dia:object", {
        type: "UML - Association",
        version: "2",
        id: relObj.id
    });

    // Name (usually empty)
    obj.ele("dia:attribute", { name: "name" })
        .ele("dia:string", {}).txt("##");

    // Direction: 1 = A to B
    obj.ele("dia:attribute", { name: "direction" })
        .ele("dia:enum", { val: "1" });

    // Show direction arrow
    obj.ele("dia:attribute", { name: "show_direction" })
        .ele("dia:boolean", { val: "false" });

    // Association type: 0=normal, 1=aggregate, 2=composition
    obj.ele("dia:attribute", { name: "assoc_type" })
        .ele("dia:enum", { val: relObj.assocType });

    // Role names (empty)
    obj.ele("dia:attribute", { name: "role_a" })
        .ele("dia:string", {}).txt("##");
    obj.ele("dia:attribute", { name: "role_b" })
        .ele("dia:string", {}).txt("##");

    // Multiplicity (empty)
    obj.ele("dia:attribute", { name: "multipicity_a" })
        .ele("dia:string", {}).txt("##");
    obj.ele("dia:attribute", { name: "multipicity_b" })
        .ele("dia:string", {}).txt("##");

    // Visibility
    obj.ele("dia:attribute", { name: "visibility_a" })
        .ele("dia:enum", { val: "3" });
    obj.ele("dia:attribute", { name: "visibility_b" })
        .ele("dia:enum", { val: "3" });

    // Show arrows
    obj.ele("dia:attribute", { name: "show_arrow_a" })
        .ele("dia:boolean", { val: "false" });
    obj.ele("dia:attribute", { name: "show_arrow_b" })
        .ele("dia:boolean", { val: "false" });

    // Object position (first point)
    const firstPoint = relObj.points[0];
    obj.ele("dia:attribute", { name: "obj_pos" })
        .ele("dia:point", { val: `${firstPoint.x},${firstPoint.y}` });

    // Bounding box
    const bb = relObj.boundingBox;
    obj.ele("dia:attribute", { name: "obj_bb" })
        .ele("dia:rectangle", {
            val: `${bb.minX},${bb.minY};${bb.maxX},${bb.maxY}`
        });

    // Meta (empty)
    obj.ele("dia:attribute", { name: "meta" })
        .ele("dia:composite", { type: "dict" });

    // CRITICAL: Orthogonal points
    const orthPoints = obj.ele("dia:attribute", { name: "orth_points" });
    relObj.points.forEach(point => {
        orthPoints.ele("dia:point", { val: `${point.x},${point.y}` });
    });

    // CRITICAL: Orthogonal orientations
    const orthOrient = obj.ele("dia:attribute", { name: "orth_orient" });
    relObj.orientations.forEach(orientation => {
        orthOrient.ele("dia:enum", { val: orientation.toString() });
    });

    // Auto-routing
    obj.ele("dia:attribute", { name: "orth_autoroute" })
        .ele("dia:boolean", { val: "true" });

    // Colors
    obj.ele("dia:attribute", { name: "text_colour" })
        .ele("dia:color", { val: "#000000" });
    obj.ele("dia:attribute", { name: "line_colour" })
        .ele("dia:color", { val: "#000000" });

    // Connections to class objects
    // Use connection point 8 (first attribute/method point, typically center-right area)
    const connections = obj.ele("dia:connections");
    connections.ele("dia:connection", {
        handle: "0",
        to: `O${relObj.fromId}`,
        connection: "8"
    });
    connections.ele("dia:connection", {
        handle: "1",
        to: `O${relObj.toId}`,
        connection: "8"
    });
}

module.exports = {
    generateDiagram,
};

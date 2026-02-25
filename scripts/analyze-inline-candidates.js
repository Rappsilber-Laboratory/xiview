const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

/**
 * AST-based analyzer to find single-use functions that could be inlined
 */
class FunctionAnalyzer {
    constructor(config) {
        this.config = config;
        this.functionRegistry = new Map(); // file -> functions data
        this.callSites = new Map(); // functionKey -> array of call sites
        this.importGraph = new Map(); // file -> imports/exports
        this.fileContents = new Map(); // file -> source code
        this.callGraph = null; // Call graph model (built in Pass 4)
    }

    /**
     * Main analysis entry point
     */
    async analyze() {
        console.log('Starting function inlining analysis...\n');

        // Discover files
        const files = this.discoverFiles();
        console.log(`Found ${files.length} JavaScript files to analyze\n`);

        // Pass 1: Parse all files and collect functions
        console.log('Pass 1: Parsing files and collecting function definitions...');
        for (const file of files) {
            this.parseFile(file);
        }
        console.log(`  Collected ${this.getTotalFunctionCount()} function definitions\n`);

        // Pass 2: Resolve imports
        console.log('Pass 2: Resolving imports and building import graph...');
        this.resolveImports();
        console.log(`  Resolved ${this.getImportCount()} import statements\n`);

        // Pass 3: Track call sites
        console.log('Pass 3: Tracking function call sites...');
        this.trackCallSites();
        console.log(`  Found ${this.callSites.size} unique functions called\n`);

        // Pass 4: Build call graph
        console.log('Pass 4: Building call graph model...');
        this.buildCallGraph();
        console.log(`  Graph model ready (${this.callGraph.nodes.size} nodes, ${this.callGraph.edges.size} edges)\n`);

        // Pass 5: Filter candidates
        console.log('Pass 5: Filtering single-use candidates...');
        const candidates = this.filterCandidates();
        console.log(`  Identified ${candidates.length} single-use functions\n`);

        // Pass 6: Score candidates
        console.log('Pass 6: Scoring candidates...');
        const scored = this.scoreCandidates(candidates);
        console.log(`  Scored all candidates\n`);

        // Generate reports
        console.log('Generating reports...');
        this.generateReport(scored);

        // Generate call graph reports if enabled
        if (this.config.generateCallGraph) {
            console.log('Generating call graph reports...');

            if (this.config.callGraphFormats.includes('stats')) {
                this.generateStatisticsReport();
            }

            if (this.config.callGraphFormats.includes('dot')) {
                this.generateGraphVizDOT();
            }

            if (this.config.callGraphFormats.includes('html')) {
                this.generateInteractiveHTML();
            }
        }

        console.log('Analysis complete!\n');
    }

    /**
     * Discover all JavaScript files in scope
     */
    discoverFiles() {
        const files = [];

        for (const dir of this.config.includeDirs) {
            const fullPath = path.join(this.config.rootDir, dir);
            this.walkDirectory(fullPath, files);
        }

        return files.filter(file => {
            const relativePath = path.relative(this.config.rootDir, file);
            return !this.config.excludePatterns.some(pattern => pattern.test(relativePath));
        });
    }

    /**
     * Recursively walk directory to find .js files
     */
    walkDirectory(dir, files) {
        if (!fs.existsSync(dir)) return;

        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                this.walkDirectory(fullPath, files);
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                files.push(fullPath);
            }
        }
    }

    /**
     * Parse a single file and collect function definitions
     */
    parseFile(filePath) {
        try {
            const code = fs.readFileSync(filePath, 'utf-8');
            this.fileContents.set(filePath, code);

            const ast = parser.parse(code, {
                sourceType: 'module',
                plugins: ['jsx', 'classProperties']
            });

            const functions = [];
            const imports = [];
            const exports = [];

            this.traverseAST(ast, filePath, functions, imports, exports);

            this.functionRegistry.set(filePath, { functions, imports, exports });
        } catch (error) {
            console.error(`  Error parsing ${filePath}: ${error.message}`);
            this.functionRegistry.set(filePath, { functions: [], imports: [], exports: [] });
        }
    }

    /**
     * Traverse AST to collect functions, imports, and exports
     */
    traverseAST(node, filePath, functions, imports, exports, context = {}) {
        if (!node || typeof node !== 'object') return;

        // Track if we're inside a class or callback context
        const newContext = { ...context };

        // Detect function definitions
        if (node.type === 'FunctionDeclaration' && node.id) {
            const funcData = this.extractFunctionData(node, filePath, newContext);
            functions.push(funcData);
        } else if (node.type === 'VariableDeclaration') {
            for (const declarator of node.declarations) {
                if (this.isFunctionExpression(declarator.init)) {
                    const funcData = this.extractFunctionFromDeclarator(declarator, filePath, newContext);
                    if (funcData) functions.push(funcData);
                }
            }
        } else if (node.type === 'ExportNamedDeclaration') {
            if (node.declaration) {
                if (node.declaration.type === 'FunctionDeclaration') {
                    const funcData = this.extractFunctionData(node.declaration, filePath, newContext);
                    funcData.exported = true;
                    funcData.exportType = 'named';
                    functions.push(funcData);
                } else if (node.declaration.type === 'VariableDeclaration') {
                    for (const declarator of node.declaration.declarations) {
                        if (this.isFunctionExpression(declarator.init)) {
                            const funcData = this.extractFunctionFromDeclarator(declarator, filePath, newContext);
                            if (funcData) {
                                funcData.exported = true;
                                funcData.exportType = 'named';
                                functions.push(funcData);
                            }
                        }
                    }
                }
            }
            if (node.specifiers) {
                for (const spec of node.specifiers) {
                    exports.push({
                        name: spec.exported.name,
                        local: spec.local.name,
                        source: node.source ? node.source.value : null
                    });
                }
            }
        } else if (node.type === 'ExportDefaultDeclaration') {
            if (this.isFunctionExpression(node.declaration) || node.declaration.type === 'FunctionDeclaration') {
                const funcData = this.extractFunctionData(node.declaration, filePath, newContext);
                funcData.exported = true;
                funcData.exportType = 'default';
                functions.push(funcData);
            }
        } else if (node.type === 'ImportDeclaration') {
            for (const spec of node.specifiers) {
                imports.push({
                    name: spec.local.name,
                    imported: spec.imported ? spec.imported.name : 'default',
                    source: node.source.value
                });
            }
        } else if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
            newContext.inClass = true;
        }

        // Recursively traverse all properties
        for (const key in node) {
            if (key === 'loc' || key === 'comments') continue;
            const child = node[key];

            if (Array.isArray(child)) {
                for (const item of child) {
                    this.traverseAST(item, filePath, functions, imports, exports, newContext);
                }
            } else if (child && typeof child === 'object') {
                this.traverseAST(child, filePath, functions, imports, exports, newContext);
            }
        }
    }

    /**
     * Check if node is a function expression
     */
    isFunctionExpression(node) {
        return node && (
            node.type === 'FunctionExpression' ||
            node.type === 'ArrowFunctionExpression'
        );
    }

    /**
     * Extract function data from a function node
     */
    extractFunctionData(node, filePath, context) {
        const name = node.id ? node.id.name : '<anonymous>';
        const loc = node.loc || { start: { line: 0 }, end: { line: 0 } };

        return {
            name,
            type: node.type,
            loc,
            filePath,
            exported: false,
            exportType: 'none',
            isCallback: context.isCallback || false,
            isClassMethod: context.inClass || false,
            complexity: loc.end.line - loc.start.line + 1,
            params: node.params ? node.params.length : 0,
            async: node.async || false,
            usesThis: this.checkUsesThis(node)
        };
    }

    /**
     * Extract function from variable declarator
     */
    extractFunctionFromDeclarator(declarator, filePath, context) {
        if (!declarator.id || declarator.id.type !== 'Identifier') return null;

        const name = declarator.id.name;
        const node = declarator.init;
        const loc = node.loc || { start: { line: 0 }, end: { line: 0 } };

        return {
            name,
            type: node.type,
            loc,
            filePath,
            exported: false,
            exportType: 'none',
            isCallback: context.isCallback || false,
            isClassMethod: context.inClass || false,
            complexity: loc.end.line - loc.start.line + 1,
            params: node.params ? node.params.length : 0,
            async: node.async || false,
            usesThis: this.checkUsesThis(node)
        };
    }

    /**
     * Check if function uses 'this' keyword
     */
    checkUsesThis(node) {
        let usesThis = false;

        const checkNode = (n) => {
            if (!n || typeof n !== 'object') return;

            if (n.type === 'ThisExpression') {
                usesThis = true;
                return;
            }

            // Don't traverse into nested functions (they have their own 'this')
            if (n.type === 'FunctionExpression' ||
                n.type === 'FunctionDeclaration' ||
                n.type === 'ArrowFunctionExpression') {
                return;
            }

            for (const key in n) {
                if (key === 'loc' || key === 'comments') continue;
                const child = n[key];

                if (Array.isArray(child)) {
                    for (const item of child) checkNode(item);
                } else {
                    checkNode(child);
                }
            }
        };

        checkNode(node.body);
        return usesThis;
    }

    /**
     * Resolve imports and build import graph
     */
    resolveImports() {
        this.importGraph.clear();

        for (const [filePath, data] of this.functionRegistry) {
            const resolvedImports = [];

            for (const imp of data.imports) {
                const resolvedPath = this.resolveImportPath(filePath, imp.source);
                resolvedImports.push({
                    ...imp,
                    resolvedPath
                });
            }

            this.importGraph.set(filePath, resolvedImports);
        }
    }

    /**
     * Resolve relative import path to absolute path
     */
    resolveImportPath(fromFile, importPath) {
        if (importPath.startsWith('.')) {
            const dir = path.dirname(fromFile);
            let resolved = path.resolve(dir, importPath);

            // Try adding .js extension if not exists
            if (!fs.existsSync(resolved) && !resolved.endsWith('.js')) {
                resolved += '.js';
            }

            return resolved;
        }

        // External module, can't resolve
        return null;
    }

    /**
     * Track all function call sites
     */
    trackCallSites() {
        this.callSites.clear();

        for (const [filePath, data] of this.functionRegistry) {
            const code = this.fileContents.get(filePath);
            if (!code) continue;

            try {
                const ast = parser.parse(code, {
                    sourceType: 'module',
                    plugins: ['jsx', 'classProperties']
                });

                this.findCallsInAST(ast, filePath);
            } catch (error) {
                // Already reported in parseFile
            }
        }
    }

    /**
     * Find function calls in AST
     */
    findCallsInAST(node, filePath, callbackContext = false) {
        if (!node || typeof node !== 'object') return;

        // Check if this is a callback context
        let isCallbackContext = callbackContext;

        if (node.type === 'CallExpression') {
            const callee = node.callee;

            // Check if calling a callback-accepting method
            if (callee.type === 'MemberExpression' && callee.property) {
                const methodName = callee.property.name;
                const callbackMethods = ['map', 'filter', 'forEach', 'reduce', 'find', 'some', 'every', 'then', 'catch', 'on', 'addEventListener'];
                if (callbackMethods.includes(methodName)) {
                    isCallbackContext = true;
                }
            }

            // Record the call
            if (callee.type === 'Identifier') {
                this.recordCall(callee.name, filePath, node.loc, isCallbackContext);
            } else if (callee.type === 'MemberExpression' && callee.property) {
                this.recordCall(callee.property.name, filePath, node.loc, isCallbackContext);
            }
        } else if (node.type === 'Identifier' && callbackContext) {
            // Function passed as callback without being called
            this.recordCall(node.name, filePath, node.loc, true);
        }

        // Recursively traverse
        for (const key in node) {
            if (key === 'loc' || key === 'comments') continue;
            const child = node[key];

            if (Array.isArray(child)) {
                for (let i = 0; i < child.length; i++) {
                    // If this is an argument to a callback-accepting function, mark it
                    const inCallback = isCallbackContext && key === 'arguments' && i > 0;
                    this.findCallsInAST(child[i], filePath, inCallback || callbackContext);
                }
            } else if (child && typeof child === 'object') {
                this.findCallsInAST(child, filePath, callbackContext);
            }
        }
    }

    /**
     * Record a function call
     */
    recordCall(functionName, callerFile, loc, isCallback) {
        // Try to resolve which file this function comes from
        const candidates = this.findFunctionDefinitions(functionName, callerFile);

        for (const candidate of candidates) {
            const key = `${candidate.name}@${candidate.filePath}`;

            if (!this.callSites.has(key)) {
                this.callSites.set(key, []);
            }

            this.callSites.get(key).push({
                callerFile,
                line: loc ? loc.start.line : 0,
                isCallback
            });
        }
    }

    /**
     * Find function definitions by name (local or imported)
     */
    findFunctionDefinitions(name, fromFile) {
        const results = [];

        // Check local definitions
        const localData = this.functionRegistry.get(fromFile);
        if (localData) {
            for (const func of localData.functions) {
                if (func.name === name) {
                    results.push(func);
                }
            }
        }

        // Check imports
        const imports = this.importGraph.get(fromFile) || [];
        for (const imp of imports) {
            if (imp.name === name && imp.resolvedPath) {
                const importedData = this.functionRegistry.get(imp.resolvedPath);
                if (importedData) {
                    for (const func of importedData.functions) {
                        if (func.name === imp.imported ||
                            (imp.imported === 'default' && func.exportType === 'default')) {
                            results.push(func);
                        }
                    }
                }
            }
        }

        return results;
    }

    /**
     * Filter candidates to single-use functions
     */
    filterCandidates() {
        const candidates = [];

        // Build call count map
        const callCounts = new Map();
        for (const [key, calls] of this.callSites) {
            callCounts.set(key, calls.length);
        }

        // Check all functions
        for (const [filePath, data] of this.functionRegistry) {
            for (const func of data.functions) {
                const key = `${func.name}@${func.filePath}`;
                const callCount = callCounts.get(key) || 0;

                // Only single-use functions
                if (callCount === 1) {
                    const calls = this.callSites.get(key) || [];
                    candidates.push({
                        func,
                        callCount,
                        calls
                    });
                }
            }
        }

        return candidates;
    }

    /**
     * Score candidates for inline-worthiness
     */
    scoreCandidates(candidates) {
        const scored = candidates.map(candidate => {
            const score = this.calculateScore(candidate.func, candidate.callCount, candidate.calls);
            return {
                ...candidate,
                score
            };
        });

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);

        return scored;
    }

    /**
     * Calculate inline-worthiness score
     */
    calculateScore(func, callCount, calls) {
        let score = 50; // Base score

        // Call count impact
        if (callCount === 1) score += 30;
        else if (callCount === 2) score += 10;
        else if (callCount > 5) score -= 30;

        // Complexity impact
        if (func.complexity <= 3) score += 20;
        else if (func.complexity <= 10) score += 5;
        else if (func.complexity > 15) score -= 40;

        // Context impact
        const isCallback = calls.some(call => call.isCallback);
        if (isCallback) score -= 50;
        if (func.isClassMethod) score -= 60;
        if (func.exported) score -= 20;

        // Simplicity bonuses
        if (func.params <= 1) score += 10;
        if (!func.async) score += 5;
        if (func.usesThis) score -= 30;

        return Math.max(0, Math.min(100, score));
    }

    /**
     * Generate analysis reports
     */
    generateReport(scored) {
        const outputDir = this.config.outputDir;

        // Create output directory
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Generate markdown report
        const markdown = this.generateMarkdownReport(scored);
        fs.writeFileSync(path.join(outputDir, 'inline-report.md'), markdown);
        console.log(`  Created: ${path.join(outputDir, 'inline-report.md')}`);

        // Generate CSV report
        const csv = this.generateCSVReport(scored);
        fs.writeFileSync(path.join(outputDir, 'inline-candidates.csv'), csv);
        console.log(`  Created: ${path.join(outputDir, 'inline-candidates.csv')}`);

        // Generate JSON report
        const json = JSON.stringify(scored, null, 2);
        fs.writeFileSync(path.join(outputDir, 'inline-candidates.json'), json);
        console.log(`  Created: ${path.join(outputDir, 'inline-candidates.json')}`);
    }

    /**
     * Generate markdown report
     */
    generateMarkdownReport(scored) {
        const highPriority = scored.filter(c => c.score >= 80);
        const mediumPriority = scored.filter(c => c.score >= 60 && c.score < 80);
        const flagged = scored.filter(c => c.score < 60);

        let md = '# Function Inlining Analysis Report\n\n';
        md += `Generated: ${new Date().toISOString().split('T')[0]}\n\n`;

        md += '## Summary\n\n';
        md += `- Total functions analyzed: ${this.getTotalFunctionCount()}\n`;
        md += `- Single-use functions: ${scored.length}\n`;
        md += `- Recommended for inlining: ${highPriority.length}\n`;
        md += `- Medium priority: ${mediumPriority.length}\n`;
        md += `- Flagged for review: ${flagged.length}\n\n`;

        md += '---\n\n';
        md += '## High Priority Recommendations (Score ≥ 80)\n\n';

        if (highPriority.length === 0) {
            md += '*No high priority recommendations found.*\n\n';
        } else {
            for (let i = 0; i < highPriority.length; i++) {
                md += this.formatRecommendation(highPriority[i], i + 1);
            }
        }

        md += '---\n\n';
        md += '## Medium Priority (Score 60-79)\n\n';

        if (mediumPriority.length === 0) {
            md += '*No medium priority recommendations found.*\n\n';
        } else {
            for (const candidate of mediumPriority) {
                md += this.formatShortRecommendation(candidate);
            }
        }

        md += '---\n\n';
        md += '## Flagged for Manual Review (Score < 60)\n\n';
        md += '*These functions have only one call site but may have reasons not to inline.*\n\n';

        if (flagged.length === 0) {
            md += '*No flagged items.*\n\n';
        } else {
            for (const candidate of flagged) {
                md += this.formatFlaggedItem(candidate);
            }
        }

        return md;
    }

    /**
     * Format a detailed recommendation
     */
    formatRecommendation(candidate, num) {
        const { func, calls, score } = candidate;
        const relativePath = path.relative(this.config.rootDir, func.filePath);
        const call = calls[0];
        const callerRelPath = path.relative(this.config.rootDir, call.callerFile);

        let md = `### ${num}. ${func.name}() - Score: ${score}\n\n`;
        md += `**Location**: ${relativePath}:${func.loc.start.line}-${func.loc.end.line}\n`;
        md += `**Called**: 1 time\n`;
        md += `**Call site**: ${callerRelPath}:${call.line}\n\n`;

        md += '**Function**:\n';
        md += '```javascript\n';
        md += this.extractFunctionCode(func);
        md += '\n```\n\n';

        md += '**Rationale**: ';
        md += this.generateRationale(func, calls);
        md += '\n\n';

        md += '---\n\n';

        return md;
    }

    /**
     * Format a short recommendation
     */
    formatShortRecommendation(candidate) {
        const { func, calls, score } = candidate;
        const relativePath = path.relative(this.config.rootDir, func.filePath);
        const call = calls[0];
        const callerRelPath = path.relative(this.config.rootDir, call.callerFile);

        let md = `- **${func.name}()** - Score: ${score}\n`;
        md += `  - Location: ${relativePath}:${func.loc.start.line}\n`;
        md += `  - Called from: ${callerRelPath}:${call.line}\n`;
        md += `  - ${func.complexity} lines, ${func.params} params\n\n`;

        return md;
    }

    /**
     * Format a flagged item
     */
    formatFlaggedItem(candidate) {
        const { func, score } = candidate;
        const relativePath = path.relative(this.config.rootDir, func.filePath);

        let reason = '';
        if (func.isClassMethod) reason = 'class method';
        else if (func.exported) reason = 'exported function';
        else if (func.complexity > 15) reason = 'complex logic';
        else if (func.usesThis) reason = 'uses this keyword';
        else if (calls && calls.some(c => c.isCallback)) reason = 'used as callback';
        else reason = 'low score';

        return `- **${func.name}()** (${relativePath}:${func.loc.start.line}) - ${reason}\n`;
    }

    /**
     * Extract function source code
     */
    extractFunctionCode(func) {
        const code = this.fileContents.get(func.filePath);
        if (!code) return '// Code not available';

        const lines = code.split('\n');
        const startLine = func.loc.start.line - 1;
        const endLine = func.loc.end.line - 1;

        return lines.slice(startLine, endLine + 1).join('\n');
    }

    /**
     * Generate rationale for inlining
     */
    generateRationale(func, calls) {
        const reasons = [];

        if (func.complexity <= 3) reasons.push('simple function');
        if (func.params <= 1) reasons.push('few parameters');
        if (!func.exported) reasons.push('private to module');
        if (!func.usesThis) reasons.push('no context dependency');
        if (!calls.some(c => c.isCallback)) reasons.push('direct call only');

        if (reasons.length === 0) {
            return 'Single use function that could be inlined.';
        }

        return reasons.join(', ') + '.';
    }

    /**
     * Generate CSV report
     */
    generateCSVReport(scored) {
        let csv = 'Function,File,Line,Score,Complexity,Params,Exported,IsCallback,CallSite\n';

        for (const candidate of scored) {
            const { func, calls, score } = candidate;
            const relativePath = path.relative(this.config.rootDir, func.filePath);
            const call = calls[0];
            const callerRelPath = path.relative(this.config.rootDir, call.callerFile);

            csv += `"${func.name}","${relativePath}",${func.loc.start.line},${score},${func.complexity},${func.params},${func.exported},${call.isCallback},"${callerRelPath}:${call.line}"\n`;
        }

        return csv;
    }

    /**
     * Build call graph model from existing data structures
     */
    buildCallGraph() {
        this.callGraph = {
            nodes: new Map(),
            edges: new Map(),
            metadata: {}
        };

        this.buildGraphNodes();
        this.buildGraphEdges();
        this.buildGraphMetadata();
    }

    /**
     * Build graph nodes (both function and module level)
     */
    buildGraphNodes() {
        const moduleNodes = new Map();

        // Create function nodes and aggregate module data
        for (const [filePath, data] of this.functionRegistry) {
            // Initialize module node if not exists
            if (!moduleNodes.has(filePath)) {
                moduleNodes.set(filePath, {
                    id: filePath,
                    type: 'module',
                    name: path.basename(filePath),
                    relativePath: path.relative(this.config.rootDir, filePath),
                    filePath: filePath,
                    functionCount: 0,
                    totalComplexity: 0,
                    exportedFunctionCount: 0
                });
            }

            const moduleNode = moduleNodes.get(filePath);

            // Create function nodes
            for (const func of data.functions) {
                const funcId = `${func.name}@${func.filePath}`;
                const calls = this.callSites.get(funcId) || [];

                this.callGraph.nodes.set(funcId, {
                    id: funcId,
                    type: 'function',
                    name: func.name,
                    filePath: func.filePath,
                    relativePath: path.relative(this.config.rootDir, func.filePath),
                    line: func.loc.start.line,
                    callCount: calls.length,
                    callerCount: new Set(calls.map(c => c.callerFile)).size,
                    complexity: func.complexity,
                    exported: func.exported,
                    exportType: func.exportType,
                    params: func.params,
                    async: func.async,
                    usesThis: func.usesThis,
                    isClassMethod: func.isClassMethod
                });

                // Update module aggregates
                moduleNode.functionCount++;
                moduleNode.totalComplexity += func.complexity;
                if (func.exported) moduleNode.exportedFunctionCount++;
            }
        }

        // Add module nodes
        for (const [filePath, moduleNode] of moduleNodes) {
            this.callGraph.nodes.set(filePath, moduleNode);
        }
    }

    /**
     * Build graph edges (calls and imports)
     */
    buildGraphEdges() {
        // Function call edges
        for (const [functionKey, calls] of this.callSites) {
            for (const call of calls) {
                const edgeId = `${functionKey}→${call.callerFile}:${call.line}`;

                if (!this.callGraph.edges.has(edgeId)) {
                    this.callGraph.edges.set(edgeId, {
                        id: edgeId,
                        source: functionKey,
                        target: call.callerFile,
                        type: 'call',
                        callSites: [],
                        isCallback: false,
                        weight: 0
                    });
                }

                const edge = this.callGraph.edges.get(edgeId);
                edge.callSites.push(call);
                edge.isCallback = edge.isCallback || call.isCallback;
                edge.weight++;
            }
        }

        // Module import edges
        for (const [filePath, imports] of this.importGraph) {
            const importTargets = new Map(); // target -> count

            for (const imp of imports) {
                if (!imp.resolvedPath) continue;

                if (!importTargets.has(imp.resolvedPath)) {
                    importTargets.set(imp.resolvedPath, 0);
                }
                importTargets.set(imp.resolvedPath, importTargets.get(imp.resolvedPath) + 1);
            }

            // Create edges with aggregated counts
            for (const [target, count] of importTargets) {
                const edgeId = `${filePath}→${target}`;

                this.callGraph.edges.set(edgeId, {
                    id: edgeId,
                    source: filePath,
                    target: target,
                    type: 'import',
                    weight: count
                });
            }
        }
    }

    /**
     * Build graph metadata
     */
    buildGraphMetadata() {
        const functionNodes = Array.from(this.callGraph.nodes.values()).filter(n => n.type === 'function');
        const moduleNodes = Array.from(this.callGraph.nodes.values()).filter(n => n.type === 'module');
        const callEdges = Array.from(this.callGraph.edges.values()).filter(e => e.type === 'call');

        this.callGraph.metadata = {
            generatedAt: new Date().toISOString(),
            totalFunctions: functionNodes.length,
            totalModules: moduleNodes.length,
            totalCalls: callEdges.length,
            totalImports: Array.from(this.callGraph.edges.values()).filter(e => e.type === 'import').length
        };
    }

    /**
     * Calculate comprehensive statistics from call graph
     */
    calculateStatistics() {
        const stats = {
            totalModules: 0,
            totalFunctions: 0,
            totalCalls: 0,
            totalImports: 0,
            avgCallsPerFunction: 0,
            maxDepth: 0,
            topFunctions: [],
            topModules: [],
            deepestChains: [],
            circularDeps: [],
            complexityDist: {}
        };

        // Count nodes and edges by type
        for (const node of this.callGraph.nodes.values()) {
            if (node.type === 'function') stats.totalFunctions++;
            if (node.type === 'module') stats.totalModules++;
        }

        for (const edge of this.callGraph.edges.values()) {
            if (edge.type === 'call') stats.totalCalls++;
            if (edge.type === 'import') stats.totalImports++;
        }

        stats.avgCallsPerFunction = stats.totalFunctions > 0
            ? (stats.totalCalls / stats.totalFunctions).toFixed(2)
            : 0;

        // Rank functions by call count
        stats.topFunctions = this.rankFunctionsByCallCount();

        // Rank modules by connectivity
        stats.topModules = this.rankModulesByConnectivity();

        // Find max call chain depth
        stats.maxDepth = this.findMaxCallChainDepth();

        // Detect circular dependencies
        stats.circularDeps = this.detectCircularDependencies();

        // Calculate complexity distribution
        stats.complexityDist = this.calculateComplexityDistribution();

        return stats;
    }

    /**
     * Rank functions by how many times they're called
     */
    rankFunctionsByCallCount() {
        const functions = [];

        for (const node of this.callGraph.nodes.values()) {
            if (node.type === 'function') {
                functions.push({
                    name: node.name,
                    filePath: node.relativePath,
                    callCount: node.callCount,
                    callerCount: node.callerCount,
                    complexity: node.complexity
                });
            }
        }

        return functions.sort((a, b) => b.callCount - a.callCount).slice(0, 20);
    }

    /**
     * Rank modules by connectivity (imports + exports)
     */
    rankModulesByConnectivity() {
        const moduleStats = new Map();

        // Initialize module stats
        for (const node of this.callGraph.nodes.values()) {
            if (node.type === 'module') {
                moduleStats.set(node.id, {
                    name: node.name,
                    relativePath: node.relativePath,
                    importedBy: 0,
                    imports: 0,
                    functionCount: node.functionCount,
                    totalComplexity: node.totalComplexity
                });
            }
        }

        // Count imports
        for (const edge of this.callGraph.edges.values()) {
            if (edge.type === 'import') {
                const sourceStats = moduleStats.get(edge.source);
                const targetStats = moduleStats.get(edge.target);

                if (sourceStats) sourceStats.imports += edge.weight;
                if (targetStats) targetStats.importedBy += edge.weight;
            }
        }

        // Convert to array and add total connectivity
        const modules = Array.from(moduleStats.values()).map(m => ({
            ...m,
            totalConnections: m.importedBy + m.imports
        }));

        return modules.sort((a, b) => b.totalConnections - a.totalConnections).slice(0, 20);
    }

    /**
     * Find maximum call chain depth using DFS
     */
    findMaxCallChainDepth() {
        let maxDepth = 0;
        const visited = new Set();

        for (const node of this.callGraph.nodes.values()) {
            if (node.type === 'function') {
                const depth = this.dfsDepth(node.id, visited, new Set(), 0);
                maxDepth = Math.max(maxDepth, depth);
            }
        }

        return maxDepth;
    }

    /**
     * DFS helper to find call chain depth
     */
    dfsDepth(nodeId, globalVisited, pathVisited, currentDepth) {
        // Cycle detection
        if (pathVisited.has(nodeId)) return currentDepth;

        globalVisited.add(nodeId);
        pathVisited.add(nodeId);

        let maxChildDepth = currentDepth;

        // Find all outgoing call edges from this function
        for (const edge of this.callGraph.edges.values()) {
            if (edge.type === 'call' && edge.source === nodeId) {
                // This is a simplification - we're using the target file
                // In a full implementation, we'd resolve to specific functions
                const childDepth = this.dfsDepth(edge.target, globalVisited, new Set(pathVisited), currentDepth + 1);
                maxChildDepth = Math.max(maxChildDepth, childDepth);
            }
        }

        pathVisited.delete(nodeId);
        return maxChildDepth;
    }

    /**
     * Detect circular dependencies using simple cycle detection
     */
    detectCircularDependencies() {
        const cycles = [];
        const visited = new Set();
        const recStack = new Set();

        for (const node of this.callGraph.nodes.values()) {
            if (node.type === 'module' && !visited.has(node.id)) {
                this.dfsFindCycles(node.id, visited, recStack, [], cycles);
            }
        }

        return cycles;
    }

    /**
     * DFS helper for cycle detection
     */
    dfsFindCycles(nodeId, visited, recStack, nodePath, cycles) {
        visited.add(nodeId);
        recStack.add(nodeId);
        nodePath.push(nodeId);

        // Check all import edges
        for (const edge of this.callGraph.edges.values()) {
            if (edge.type === 'import' && edge.source === nodeId) {
                const target = edge.target;

                if (!visited.has(target)) {
                    this.dfsFindCycles(target, visited, recStack, nodePath, cycles);
                } else if (recStack.has(target)) {
                    // Found a cycle
                    const cycleStart = nodePath.indexOf(target);
                    if (cycleStart !== -1) {
                        const cycle = nodePath.slice(cycleStart).map(p =>
                            path.relative(this.config.rootDir, p)
                        );
                        cycle.push(path.relative(this.config.rootDir, target));
                        cycles.push(cycle);
                    }
                }
            }
        }

        nodePath.pop();
        recStack.delete(nodeId);
    }

    /**
     * Calculate complexity distribution
     */
    calculateComplexityDistribution() {
        const dist = {
            '1-5': 0,
            '6-15': 0,
            '16-30': 0,
            '31-50': 0,
            '50+': 0
        };

        for (const node of this.callGraph.nodes.values()) {
            if (node.type === 'function') {
                const c = node.complexity;
                if (c <= 5) dist['1-5']++;
                else if (c <= 15) dist['6-15']++;
                else if (c <= 30) dist['16-30']++;
                else if (c <= 50) dist['31-50']++;
                else dist['50+']++;
            }
        }

        return dist;
    }

    /**
     * Generate statistics report in Markdown format
     */
    generateStatisticsReport() {
        const stats = this.calculateStatistics();
        const lines = [];

        lines.push('# Call Graph Statistics Report\n');
        lines.push(`Generated: ${new Date().toISOString().split('T')[0]}\n`);
        lines.push('## Overview\n');
        lines.push(`- **Total Modules**: ${stats.totalModules}`);
        lines.push(`- **Total Functions**: ${stats.totalFunctions}`);
        lines.push(`- **Total Call Relationships**: ${stats.totalCalls}`);
        lines.push(`- **Total Import Relationships**: ${stats.totalImports}`);
        lines.push(`- **Average Calls per Function**: ${stats.avgCallsPerFunction}`);
        lines.push(`- **Maximum Call Chain Depth**: ${stats.maxDepth}\n`);

        lines.push('---\n');
        lines.push('## Module-Level Analysis\n');
        lines.push('### Most Connected Modules\n');
        lines.push('| Module | Imported By | Imports | Total Connections |');
        lines.push('|--------|-------------|---------|-------------------|');
        for (const mod of stats.topModules.slice(0, 10)) {
            lines.push(`| ${mod.relativePath} | ${mod.importedBy} | ${mod.imports} | ${mod.totalConnections} |`);
        }
        lines.push('');

        if (stats.circularDeps.length > 0) {
            lines.push('### Circular Dependencies Detected\n');
            for (let i = 0; i < Math.min(stats.circularDeps.length, 5); i++) {
                const cycle = stats.circularDeps[i];
                lines.push(`${i + 1}. ${cycle.join(' → ')}\n`);
            }
        } else {
            lines.push('### Circular Dependencies\n');
            lines.push('*No circular dependencies detected.*\n');
        }

        lines.push('---\n');
        lines.push('## Function-Level Analysis\n');
        lines.push('### Most Called Functions\n');
        lines.push('| Function | File | Call Count | Unique Callers | Complexity |');
        lines.push('|----------|------|------------|----------------|------------|');
        for (const func of stats.topFunctions.slice(0, 15)) {
            lines.push(`| ${func.name}() | ${func.filePath} | ${func.callCount} | ${func.callerCount} | ${func.complexity} |`);
        }
        lines.push('');

        lines.push('### Functions by Complexity\n');
        lines.push('| Complexity Range | Function Count | % of Total |');
        lines.push('|------------------|----------------|------------|');
        const total = stats.totalFunctions;
        for (const [range, count] of Object.entries(stats.complexityDist)) {
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
            lines.push(`| ${range} lines | ${count} | ${pct}% |`);
        }
        lines.push('');

        lines.push('---\n');
        lines.push(`Generated by analyze-inline-candidates.js\n`);

        const markdown = lines.join('\n');
        const outputPath = path.join(this.config.outputDir, 'call-graph-stats.md');
        fs.writeFileSync(outputPath, markdown);
        console.log(`  Created: ${outputPath}`);
    }

    /**
     * Generate GraphViz DOT files
     */
    generateGraphVizDOT() {
        const moduleDOT = this.generateDOT('module');
        const functionDOT = this.generateDOT('function');

        const moduleFile = path.join(this.config.outputDir, 'call-graph-module.dot');
        const functionFile = path.join(this.config.outputDir, 'call-graph-function.dot');

        fs.writeFileSync(moduleFile, moduleDOT);
        fs.writeFileSync(functionFile, functionDOT);

        console.log(`  Created: ${moduleFile}`);
        console.log(`  Created: ${functionFile}`);

        // Generate README with rendering instructions
        this.generateGraphVizReadme();
    }

    /**
     * Generate DOT format for GraphViz
     */
    generateDOT(level) {
        const lines = [];

        if (level === 'module') {
            lines.push('digraph ModuleDependencies {');
            lines.push('  graph [rankdir=LR, bgcolor=white, fontname="Arial", fontsize=12];');
            lines.push('  node [shape=box, style="rounded,filled", fontname="Arial", fontsize=10];');
            lines.push('  edge [fontname="Arial", fontsize=8];');
            lines.push('');

            // Group by component
            const components = this.groupModulesByComponent();
            let clusterIndex = 0;

            for (const [component, modules] of components) {
                lines.push(`  subgraph cluster_${clusterIndex} {`);
                lines.push(`    label="${component}";`);
                lines.push('    style=filled;');
                lines.push('    color=lightgrey;');
                lines.push('');

                for (const mod of modules) {
                    const nodeId = this.sanitizeDOTId(mod.relativePath);
                    const label = this.formatModuleLabel(mod);
                    const color = this.getModuleColor(mod);
                    lines.push(`    "${nodeId}" [label="${label}", fillcolor="${color}"];`);
                }

                lines.push('  }');
                lines.push('');
                clusterIndex++;
            }

            // Add import edges
            for (const edge of this.callGraph.edges.values()) {
                if (edge.type === 'import') {
                    const from = this.sanitizeDOTId(path.relative(this.config.rootDir, edge.source));
                    const to = this.sanitizeDOTId(path.relative(this.config.rootDir, edge.target));
                    const attrs = this.formatEdgeAttributes(edge, 'module');
                    lines.push(`  "${from}" -> "${to}" [${attrs}];`);
                }
            }

        } else {
            // Function-level
            lines.push('digraph FunctionCalls {');
            lines.push('  graph [rankdir=TB, bgcolor=white];');
            lines.push('  node [shape=box, style="rounded,filled", fontname="Arial", fontsize=9];');
            lines.push('  edge [fontname="Arial", fontsize=7];');
            lines.push('');

            // Add function nodes
            for (const node of this.callGraph.nodes.values()) {
                if (node.type === 'function') {
                    const nodeId = this.sanitizeDOTId(node.id);
                    const label = this.formatFunctionLabel(node);
                    const color = this.getComplexityColor(node.complexity);
                    const tooltip = `${node.relativePath}:${node.line}`;
                    lines.push(`  "${nodeId}" [label="${label}", fillcolor="${color}", tooltip="${tooltip}"];`);
                }
            }

            lines.push('');

            // Add call edges
            for (const edge of this.callGraph.edges.values()) {
                if (edge.type === 'call') {
                    const from = this.sanitizeDOTId(edge.source);
                    const to = this.sanitizeDOTId(edge.target);
                    const attrs = this.formatEdgeAttributes(edge, 'function');
                    lines.push(`  "${from}" -> "${to}" [${attrs}];`);
                }
            }
        }

        lines.push('}');
        return lines.join('\n');
    }

    /**
     * Group modules by component
     */
    groupModulesByComponent() {
        const components = new Map();

        for (const node of this.callGraph.nodes.values()) {
            if (node.type === 'module') {
                let component = 'other';
                if (node.relativePath.startsWith('xiview/')) component = 'xiview';
                else if (node.relativePath.startsWith('CLMS-model/')) component = 'CLMS-model';
                else if (node.relativePath.startsWith('crosslink-viewer/')) component = 'crosslink-viewer';

                if (!components.has(component)) {
                    components.set(component, []);
                }
                components.get(component).push(node);
            }
        }

        return components;
    }

    /**
     * Sanitize identifier for DOT syntax
     */
    sanitizeDOTId(str) {
        return str.replace(/[^a-zA-Z0-9_]/g, '_');
    }

    /**
     * Format module label for DOT
     */
    formatModuleLabel(module) {
        const name = module.name;
        const funcs = module.functionCount;
        const complexity = module.totalComplexity;
        return `${name}\\n${funcs} functions\\n${complexity} LOC`;
    }

    /**
     * Format function label for DOT
     */
    formatFunctionLabel(node) {
        const name = node.name;
        const file = path.basename(node.relativePath);
        const line = node.line;
        const complexity = node.complexity;
        return `${name}()\\n${file}:${line}\\n${complexity} lines`;
    }

    /**
     * Get color for module based on complexity
     */
    getModuleColor(module) {
        const avgComplexity = module.functionCount > 0
            ? module.totalComplexity / module.functionCount
            : 0;

        if (avgComplexity <= 10) return '#D2E5FF';
        if (avgComplexity <= 20) return '#FFE5D2';
        return '#FFD2D2';
    }

    /**
     * Get color for function based on complexity
     */
    getComplexityColor(complexity) {
        if (complexity <= 5) return '#E5FFE5';     // Green
        if (complexity <= 15) return '#FFFFE5';    // Yellow
        if (complexity <= 30) return '#FFE5D2';    // Orange
        return '#FFD2D2';                           // Red
    }

    /**
     * Format edge attributes for DOT
     */
    formatEdgeAttributes(edge, level) {
        const attrs = [];

        if (level === 'module') {
            attrs.push(`label="${edge.weight} imports"`);
            const penwidth = Math.min(edge.weight / 2, 5);
            attrs.push(`penwidth=${penwidth.toFixed(1)}`);
        } else {
            if (edge.isCallback) {
                attrs.push('style=dashed');
                attrs.push('color="#FF6B6B"');
                attrs.push('label="callback"');
            } else {
                attrs.push('color="#848484"');
            }
            attrs.push('penwidth=1.0');
        }

        return attrs.join(', ');
    }

    /**
     * Generate README for GraphViz rendering
     */
    generateGraphVizReadme() {
        const readme = `# GraphViz DOT Files

This directory contains GraphViz DOT files for visualizing the call graph.

## Files

- \`call-graph-module.dot\` - Module-level dependency graph
- \`call-graph-function.dot\` - Function-level call graph

## Rendering

### Install GraphViz

**macOS:**
\`\`\`bash
brew install graphviz
\`\`\`

**Ubuntu/Debian:**
\`\`\`bash
sudo apt-get install graphviz
\`\`\`

**Windows:**
Download from https://graphviz.org/download/

### Generate Images

**Module-level (hierarchical layout):**
\`\`\`bash
dot -Tsvg call-graph-module.dot -o call-graph-module.svg
dot -Tpng call-graph-module.dot -o call-graph-module.png
\`\`\`

**Function-level (force-directed layout for large graph):**
\`\`\`bash
fdp -Tsvg call-graph-function.dot -o call-graph-function.svg
sfdp -Tsvg call-graph-function.dot -o call-graph-function.svg
\`\`\`

### Layout Engines

- \`dot\` - Hierarchical (good for trees and DAGs)
- \`neato\` - Spring model (good for general graphs)
- \`fdp\` - Force-directed (good for large graphs)
- \`sfdp\` - Scalable force-directed (fastest for very large graphs)
- \`circo\` - Circular (good for visualizing cycles)

### Online Viewers

If you don't have GraphViz installed, you can use online viewers:

- https://dreampuf.github.io/GraphvizOnline/
- https://edotor.net/

Just copy the contents of the .dot file and paste into the online editor.

## Color Legend

### Module-level:
- Light Blue: Low average complexity (<10 lines/function)
- Light Orange: Medium complexity (10-20 lines/function)
- Light Red: High complexity (>20 lines/function)

### Function-level:
- Green: Simple (1-5 lines)
- Yellow: Moderate (6-15 lines)
- Orange: Complex (16-30 lines)
- Red: Very complex (>30 lines)

### Edges:
- Solid: Direct calls/imports
- Dashed: Callback functions
- Width: Proportional to number of calls/imports
`;

        const readmePath = path.join(this.config.outputDir, 'README-graphviz.txt');
        fs.writeFileSync(readmePath, readme);
        console.log(`  Created: ${readmePath}`);
    }

    /**
     * Generate interactive HTML visualization
     */
    generateInteractiveHTML() {
        const graphData = this.buildVisJSGraphData();
        const html = this.buildHTMLTemplate(graphData);

        const htmlPath = path.join(this.config.outputDir, 'call-graph.html');
        fs.writeFileSync(htmlPath, html);
        console.log(`  Created: ${htmlPath}`);
    }

    /**
     * Build vis.js compatible graph data
     */
    buildVisJSGraphData() {
        const data = {
            module: { nodes: [], edges: [] },
            function: { nodes: [], edges: [] },
            metadata: this.callGraph.metadata
        };

        // Module-level nodes
        for (const node of this.callGraph.nodes.values()) {
            if (node.type === 'module') {
                const component = this.getComponentName(node.relativePath);
                data.module.nodes.push({
                    id: node.id,
                    label: node.name,
                    title: this.formatModuleTooltip(node),
                    group: component,
                    value: node.functionCount,
                    complexity: node.totalComplexity,
                    shape: 'box'
                });
            }
        }

        // Function-level nodes
        for (const node of this.callGraph.nodes.values()) {
            if (node.type === 'function') {
                const component = this.getComponentName(node.relativePath);
                data.function.nodes.push({
                    id: node.id,
                    label: `${node.name}()`,
                    title: this.formatFunctionTooltip(node),
                    group: component,
                    value: Math.max(node.callCount, 1),
                    color: {
                        background: this.getComplexityColor(node.complexity),
                        border: '#2B7CE9'
                    },
                    shape: 'box',
                    module: node.filePath,
                    complexity: node.complexity,
                    exported: node.exported
                });
            }
        }

        // Module-level edges
        for (const edge of this.callGraph.edges.values()) {
            if (edge.type === 'import') {
                data.module.edges.push({
                    from: edge.source,
                    to: edge.target,
                    label: `${edge.weight}`,
                    width: Math.min(edge.weight / 2, 5),
                    arrows: 'to',
                    color: { color: '#848484' }
                });
            }
        }

        // Function-level edges
        for (const edge of this.callGraph.edges.values()) {
            if (edge.type === 'call') {
                data.function.edges.push({
                    from: edge.source,
                    to: edge.target,
                    arrows: 'to',
                    color: edge.isCallback ? { color: '#FF6B6B' } : { color: '#848484' },
                    dashes: edge.isCallback,
                    width: Math.min(edge.weight, 3)
                });
            }
        }

        return data;
    }

    /**
     * Get component name from relative path
     */
    getComponentName(relativePath) {
        if (relativePath.startsWith('xiview/')) return 'xiview';
        if (relativePath.startsWith('CLMS-model/')) return 'CLMS-model';
        if (relativePath.startsWith('crosslink-viewer/')) return 'crosslink-viewer';
        return 'other';
    }

    /**
     * Format module tooltip
     */
    formatModuleTooltip(node) {
        return `${node.relativePath}\\n${node.functionCount} functions\\n${node.totalComplexity} lines total\\n${node.exportedFunctionCount} exported`;
    }

    /**
     * Format function tooltip
     */
    formatFunctionTooltip(node) {
        return `${node.name}()\\n${node.relativePath}:${node.line}\\n${node.complexity} lines\\n${node.params} params\\nCalled ${node.callCount} times by ${node.callerCount} callers`;
    }

    /**
     * Build self-contained HTML template
     */
    buildHTMLTemplate(graphData) {
        return `<!DOCTYPE html>
<html>
<head>
    <title>Call Graph - xiVIEW</title>
    <script src="https://unpkg.com/vis-network@9.1.9/dist/vis-network.min.js"></script>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
        }
        #container {
            display: flex;
            height: 100vh;
        }
        #controls {
            width: 320px;
            padding: 20px;
            background: #f5f5f5;
            overflow-y: auto;
            border-right: 1px solid #ddd;
        }
        #graph {
            flex: 1;
            background: white;
        }
        .control-section {
            margin-bottom: 25px;
            padding-bottom: 15px;
            border-bottom: 1px solid #ddd;
        }
        .control-section:last-child {
            border-bottom: none;
        }
        h2 {
            margin: 0 0 15px 0;
            font-size: 16px;
            color: #333;
        }
        h3 {
            margin: 0 0 10px 0;
            font-size: 14px;
            color: #666;
        }
        label {
            display: block;
            margin: 8px 0;
            font-size: 13px;
        }
        input[type="text"], input[type="number"], select {
            width: 100%;
            padding: 6px;
            margin-top: 4px;
            border: 1px solid #ccc;
            border-radius: 3px;
            box-sizing: border-box;
        }
        button {
            padding: 8px 16px;
            background: #2B7CE9;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
        }
        button:hover {
            background: #1a5bb8;
        }
        .radio-group {
            margin: 8px 0;
        }
        .radio-group label {
            display: inline-block;
            margin-right: 15px;
        }
        #info-panel {
            background: #fff;
            padding: 12px;
            border-radius: 4px;
            font-size: 12px;
            max-height: 200px;
            overflow-y: auto;
        }
        #stats {
            font-size: 12px;
            line-height: 1.6;
        }
        .legend {
            font-size: 11px;
            line-height: 1.8;
        }
        .legend-item {
            display: flex;
            align-items: center;
            margin: 4px 0;
        }
        .legend-color {
            width: 20px;
            height: 14px;
            margin-right: 8px;
            border: 1px solid #999;
        }
    </style>
</head>
<body>
    <div id="container">
        <div id="controls">
            <h2>Call Graph Visualization</h2>

            <div class="control-section">
                <h3>View Level</h3>
                <div class="radio-group">
                    <label><input type="radio" name="level" value="module" checked> Module</label>
                    <label><input type="radio" name="level" value="function"> Function</label>
                </div>
            </div>

            <div class="control-section">
                <h3>Search</h3>
                <input type="text" id="search" placeholder="Search nodes...">
                <button id="focus-btn" style="margin-top: 8px; width: 100%;">Focus</button>
            </div>

            <div class="control-section">
                <h3>Layout</h3>
                <select id="layout">
                    <option value="hierarchical">Hierarchical</option>
                    <option value="force">Force-Directed</option>
                </select>
            </div>

            <div class="control-section">
                <h3>Filters</h3>
                <label><input type="checkbox" id="show-exported" checked> Exported functions</label>
                <label><input type="checkbox" id="show-private" checked> Private functions</label>
                <label>
                    Min Complexity: <input type="number" id="min-complexity" value="0" min="0" max="100" style="width: 60px;">
                </label>
                <label>
                    Max Complexity: <input type="number" id="max-complexity" value="100" min="0" max="100" style="width: 60px;">
                </label>
                <button id="apply-filters" style="margin-top: 8px; width: 100%;">Apply Filters</button>
            </div>

            <div class="control-section">
                <h3>Selected Node</h3>
                <div id="info-panel">
                    <em>Click a node to see details</em>
                </div>
            </div>

            <div class="control-section">
                <h3>Statistics</h3>
                <div id="stats">
                    Nodes: <span id="node-count">0</span><br>
                    Edges: <span id="edge-count">0</span><br>
                    Modules: <span id="module-count">${graphData.metadata.totalModules}</span><br>
                    Functions: <span id="function-count">${graphData.metadata.totalFunctions}</span>
                </div>
            </div>

            <div class="control-section">
                <h3>Legend</h3>
                <div class="legend">
                    <strong>Complexity Colors:</strong>
                    <div class="legend-item">
                        <div class="legend-color" style="background: #E5FFE5;"></div>
                        <span>Simple (1-5 lines)</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="background: #FFFFE5;"></div>
                        <span>Moderate (6-15 lines)</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="background: #FFE5D2;"></div>
                        <span>Complex (16-30 lines)</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="background: #FFD2D2;"></div>
                        <span>Very Complex (30+ lines)</span>
                    </div>
                </div>
            </div>
        </div>

        <div id="graph"></div>
    </div>

    <script>
        const graphData = ${JSON.stringify(graphData, null, 2)};

        let network = null;
        let currentLevel = 'module';
        let allNodes = new vis.DataSet(graphData.module.nodes);
        let allEdges = new vis.DataSet(graphData.module.edges);

        // Initialize network
        const container = document.getElementById('graph');
        const options = {
            nodes: {
                shape: 'box',
                font: { size: 14 },
                borderWidth: 2,
                color: {
                    border: '#2B7CE9',
                    background: '#D2E5FF',
                    highlight: { border: '#2B7CE9', background: '#FFA500' }
                }
            },
            edges: {
                arrows: { to: { enabled: true, scaleFactor: 0.5 } },
                smooth: { type: 'cubicBezier' },
                color: { color: '#848484', highlight: '#FF0000' }
            },
            groups: {
                'xiview': { color: { background: '#D2E5FF', border: '#2B7CE9' } },
                'CLMS-model': { color: { background: '#FFE5D2', border: '#FF8C00' } },
                'crosslink-viewer': { color: { background: '#E5FFE5', border: '#32CD32' } }
            },
            physics: {
                enabled: true,
                solver: 'barnesHut',
                barnesHut: {
                    gravitationalConstant: -8000,
                    centralGravity: 0.3,
                    springLength: 200,
                    springConstant: 0.04,
                    damping: 0.09,
                    avoidOverlap: 0.5
                },
                stabilization: {
                    enabled: true,
                    iterations: 200,
                    updateInterval: 25
                }
            },
            layout: {
                hierarchical: {
                    enabled: false,
                    direction: 'UD',
                    sortMethod: 'directed',
                    levelSeparation: 150
                }
            }
        };

        network = new vis.Network(container, { nodes: allNodes, edges: allEdges }, options);

        // Update stats
        updateStats();

        // Event: Node selected
        network.on('selectNode', function(params) {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                const node = allNodes.get(nodeId);
                displayNodeInfo(node);
            }
        });

        // Event: Level change
        document.querySelectorAll('input[name="level"]').forEach(radio => {
            radio.addEventListener('change', function() {
                switchLevel(this.value);
            });
        });

        // Event: Layout change
        document.getElementById('layout').addEventListener('change', function() {
            const isHierarchical = this.value === 'hierarchical';
            network.setOptions({
                layout: { hierarchical: { enabled: isHierarchical } },
                physics: { enabled: !isHierarchical }
            });
        });

        // Event: Search and focus
        document.getElementById('focus-btn').addEventListener('click', function() {
            const query = document.getElementById('search').value.toLowerCase();
            if (!query) return;

            const matches = allNodes.get({
                filter: node => node.label.toLowerCase().includes(query)
            });

            if (matches.length > 0) {
                network.selectNodes([matches[0].id]);
                network.focus(matches[0].id, { scale: 1.5, animation: true });
                displayNodeInfo(matches[0]);
            }
        });

        // Event: Apply filters
        document.getElementById('apply-filters').addEventListener('click', applyFilters);

        function switchLevel(level) {
            currentLevel = level;
            const data = level === 'module' ? graphData.module : graphData.function;
            allNodes.clear();
            allEdges.clear();
            allNodes.add(data.nodes);
            allEdges.add(data.edges);
            updateStats();
            network.fit();
        }

        function applyFilters() {
            if (currentLevel !== 'function') return;

            const showExported = document.getElementById('show-exported').checked;
            const showPrivate = document.getElementById('show-private').checked;
            const minComplexity = parseInt(document.getElementById('min-complexity').value);
            const maxComplexity = parseInt(document.getElementById('max-complexity').value);

            const filtered = graphData.function.nodes.filter(node => {
                if (node.exported && !showExported) return false;
                if (!node.exported && !showPrivate) return false;
                if (node.complexity < minComplexity) return false;
                if (node.complexity > maxComplexity) return false;
                return true;
            });

            allNodes.clear();
            allNodes.add(filtered);

            // Filter edges to only show connections between visible nodes
            const nodeIds = new Set(filtered.map(n => n.id));
            const filteredEdges = graphData.function.edges.filter(e =>
                nodeIds.has(e.from) && nodeIds.has(e.to)
            );
            allEdges.clear();
            allEdges.add(filteredEdges);

            updateStats();
            network.fit();
        }

        function displayNodeInfo(node) {
            const panel = document.getElementById('info-panel');
            if (currentLevel === 'module') {
                panel.innerHTML = \`
                    <strong>\${node.label}</strong><br>
                    <small>\${node.id.replace(/.+\\//, '')}</small><br><br>
                    Functions: \${node.value}<br>
                    Complexity: \${node.complexity} lines
                \`;
            } else {
                const exported = node.exported ? 'Exported' : 'Private';
                panel.innerHTML = \`
                    <strong>\${node.label}</strong><br>
                    <small>\${node.module.split('/').slice(-1)[0]}</small><br><br>
                    Complexity: \${node.complexity} lines<br>
                    Status: \${exported}
                \`;
            }
        }

        function updateStats() {
            document.getElementById('node-count').textContent = allNodes.length;
            document.getElementById('edge-count').textContent = allEdges.length;
        }
    </script>
</body>
</html>`;
    }

    /**
     * Get total function count
     */
    getTotalFunctionCount() {
        let count = 0;
        for (const [, data] of this.functionRegistry) {
            count += data.functions.length;
        }
        return count;
    }

    /**
     * Get import count
     */
    getImportCount() {
        let count = 0;
        for (const [, imports] of this.importGraph) {
            count += imports.length;
        }
        return count;
    }
}

// Main execution
const analyzer = new FunctionAnalyzer({
    rootDir: path.join(__dirname, '..'),
    includeDirs: [
        'xiview/js',
        'CLMS-model/js/models',
        'crosslink-viewer/js'
    ],
    excludePatterns: [
        /vendor\//,
        /node_modules\//,
        /spectrum\//,
        /scripts\//,
        /dist\//,
        /tests?\//,
        /sankey\.js$/,
        /bioseq32\.js$/
    ],
    outputDir: path.join(__dirname, '..', 'analysis-results'),
    generateCallGraph: true,  // Enable call graph generation
    callGraphFormats: ['html', 'dot', 'stats']  // Output formats
});

analyzer.analyze().then(() => {
    console.log('\nAnalysis complete! See analysis-results/ directory for reports.');
}).catch(error => {
    console.error('Analysis failed:', error);
    process.exit(1);
});

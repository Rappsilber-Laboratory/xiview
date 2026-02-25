#!/usr/bin/env node

/**
 * Simple QUnit Test Harness
 *
 * Runs three QUnit HTML test files in headless Chrome via Puppeteer.
 * Designed for simplicity, reliability, and easy understanding.
 */

const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Test files to run (relative to project root)
const TEST_FILES = [
    'xiview/tests/qunit.html',
    'xiview/tests/qunit2.html',
    'CLMS-model/tests/qunit-clms-model.html'
];

const SERVER_PORT = 8080;
const TEST_TIMEOUT = 60000; // 60 seconds per test file

/**
 * Creates and starts a simple static file server
 */
function startServer(port) {
    const projectRoot = path.join(__dirname, '..');

    const server = http.createServer((req, res) => {
        // Build file path from URL (decode to handle spaces and special chars)
        const urlPath = decodeURIComponent(req.url);
        const filePath = path.join(projectRoot, urlPath === '/' ? 'index.html' : urlPath);

        // Determine content type from file extension
        const ext = path.extname(filePath);
        const contentTypes = {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.pdb': 'text/plain'
        };
        const contentType = contentTypes[ext] || 'application/octet-stream';

        // Read and serve the file
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(data);
            }
        });
    });

    return new Promise((resolve, reject) => {
        server.listen(port, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve(server);
            }
        });
    });
}

/**
 * Runs a single QUnit test file and returns results
 */
async function runTest(browser, baseUrl, testFile) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Running: ${testFile}`);
    console.log('='.repeat(70));

    const page = await browser.newPage();

    // Capture console errors for debugging
    page.on('pageerror', error => {
        console.log(`  Page Error: ${error.message}`);
    });

    try {
        // Navigate to the test page
        const url = `${baseUrl}/${testFile}`;
        console.log(`Loading: ${url}`);
        await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout: TEST_TIMEOUT
        });

        // Wait for QUnit to complete and extract results
        // This runs in the browser context
        const results = await page.evaluate(() => {
            return new Promise((resolve, reject) => {
                // Safety timeout - if QUnit doesn't finish in time, reject
                const safetyTimeout = setTimeout(() => {
                    reject(new Error('QUnit did not complete within timeout period'));
                }, 55000); // Slightly less than TEST_TIMEOUT

                // Poll for QUnit availability and completion
                const checkInterval = 200;
                let checkCount = 0;
                const maxChecks = 275; // 55 seconds / 200ms

                const checkQUnit = () => {
                    checkCount++;

                    // Give up after max checks
                    if (checkCount >= maxChecks) {
                        clearTimeout(safetyTimeout);
                        reject(new Error('QUnit did not become available within timeout period'));
                        return;
                    }

                    // Check if QUnit is available globally
                    if (typeof window.QUnit !== 'undefined') {
                        // QUnit is available - check if it's already done
                        const config = window.QUnit.config;

                        // If QUnit has already finished, get results from config
                        if (config && config.stats && config.stats.all !== undefined) {
                            clearTimeout(safetyTimeout);
                            resolve({
                                passed: config.stats.all - config.stats.bad,
                                failed: config.stats.bad,
                                total: config.stats.all,
                                runtime: config.stats.runtime || 0
                            });
                            return;
                        }

                        // QUnit exists but hasn't finished - register done callback
                        window.QUnit.done((details) => {
                            clearTimeout(safetyTimeout);
                            resolve({
                                passed: details.passed,
                                failed: details.failed,
                                total: details.total,
                                runtime: details.runtime
                            });
                        });
                        return;
                    }

                    // QUnit not available yet, check again
                    setTimeout(checkQUnit, checkInterval);
                };

                // Start checking
                checkQUnit();
            });
        });

        // Display results
        console.log(`\nResults:`);
        console.log(`  Total:   ${results.total}`);
        console.log(`  Passed:  ${results.passed}`);
        console.log(`  Failed:  ${results.failed}`);
        console.log(`  Runtime: ${results.runtime}ms`);

        if (results.failed > 0) {
            console.log(`  ⚠️  ${results.failed} test(s) failed`);
        } else {
            console.log(`  ✓ All tests passed`);
        }

        return results;

    } finally {
        // Always close the page
        await page.close();
    }
}

/**
 * Main test harness function
 */
async function main() {
    console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║           QUnit Test Harness - xiVIEW Test Suite                 ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

    let server = null;
    let browser = null;

    try {
        // Step 1: Start HTTP server
        console.log(`Starting HTTP server on port ${SERVER_PORT}...`);
        server = await startServer(SERVER_PORT);
        console.log('✓ HTTP server started\n');

        const baseUrl = `http://localhost:${SERVER_PORT}`;

        // Step 2: Launch headless browser
        console.log('Launching headless browser...');
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        });
        console.log('✓ Browser launched');

        // Step 3: Run each test file sequentially
        const allResults = [];
        for (const testFile of TEST_FILES) {
            const results = await runTest(browser, baseUrl, testFile);
            allResults.push(results);
        }

        // Step 4: Display summary
        console.log('\n' + '═'.repeat(70));
        console.log('FINAL SUMMARY');
        console.log('═'.repeat(70));

        const totals = allResults.reduce((acc, r) => ({
            total: acc.total + r.total,
            passed: acc.passed + r.passed,
            failed: acc.failed + r.failed,
            runtime: acc.runtime + r.runtime
        }), { total: 0, passed: 0, failed: 0, runtime: 0 });

        console.log(`\nTotal tests:   ${totals.total}`);
        console.log(`Passed:        ${totals.passed}`);
        console.log(`Failed:        ${totals.failed}`);
        console.log(`Total runtime: ${totals.runtime}ms`);

        // Step 5: Exit with appropriate code
        if (totals.failed > 0) {
            console.log('\n❌ TEST SUITE FAILED\n');
            process.exit(1);
        } else {
            console.log('\n✅ ALL TESTS PASSED\n');
            process.exit(0);
        }

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error.stack);
        process.exit(1);

    } finally {
        // Cleanup: close browser and server
        if (browser) {
            await browser.close();
        }
        if (server) {
            server.close();
        }
    }
}

// Execute main function
main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});

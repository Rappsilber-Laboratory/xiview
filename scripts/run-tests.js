/**
 * Test runner for CLMS-model
 * Runs QUnit tests in headless browser using Puppeteer
 */

import { spawn } from "child_process";
import { createRequire } from "module";
import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const TEST_PORT = 8765;
const TEST_URL = `http://localhost:${TEST_PORT}/tests/qunit-clms-model.html`;

async function startServer() {
    return new Promise((resolve, reject) => {
        const server = spawn("npx", ["http-server", "-p", TEST_PORT, "--silent"], {
            cwd: path.join(__dirname, "..")
        });

        server.stdout.on("data", (data) => {
            if (data.toString().includes("Available on")) {
                resolve(server);
            }
        });

        server.stderr.on("data", (data) => {
            console.error(`Server error: ${data}`);
        });

        setTimeout(() => {
            resolve(server);
        }, 1000);

        server.on("error", reject);
    });
}

async function runTests() {
    let server;
    let browser;

    try {
        console.log("Starting HTTP server...");
        server = await startServer();

        console.log("Launching browser...");
        browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"]
        });

        const page = await browser.newPage();

        page.on("console", (msg) => {
            const text = msg.text();
            if (!text.includes("Failed to load resource") && !text.includes("vendors-node")) {
                console.log(`Browser: ${text}`);
            }
        });

        page.on("pageerror", (error) => {
            console.error(`Page error: ${error.message}`);
        });

        console.log(`Opening test page: ${TEST_URL}`);
        await page.goto(TEST_URL, {
            waitUntil: "networkidle0",
            timeout: 30000
        });

        // Wait for QUnit to complete
        const results = await page.evaluate(() => {
            return new Promise((resolve) => {
                const checkQUnit = () => {
                    if (window.QUnit && window.QUnit.config && window.QUnit.config.current) {
                        if (window.QUnit.config.queue.length === 0 && !window.QUnit.config.current) {
                            resolve({
                                passed: window.QUnit.config.stats.all - window.QUnit.config.stats.bad,
                                failed: window.QUnit.config.stats.bad,
                                total: window.QUnit.config.stats.all,
                                runtime: window.QUnit.config.stats.runtime
                            });
                        } else {
                            setTimeout(checkQUnit, 100);
                        }
                    } else {
                        setTimeout(checkQUnit, 100);
                    }
                };
                checkQUnit();
            });
        });

        console.log("\n" + "=".repeat(60));
        console.log("CLMS-model Test Results");
        console.log("=".repeat(60));
        console.log(`Total tests: ${results.total}`);
        console.log(`Passed: ${results.passed}`);
        console.log(`Failed: ${results.failed}`);
        console.log(`Runtime: ${results.runtime}ms`);
        console.log("=".repeat(60) + "\n");

        if (results.failed > 0) {
            process.exit(1);
        }

    } catch (error) {
        console.error("Error running tests:", error);
        process.exit(1);
    } finally {
        if (browser) {
            await browser.close();
        }
        if (server) {
            server.kill();
        }
    }
}

runTests();

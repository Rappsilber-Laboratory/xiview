import {module, test} from "qunit";
import {TooltipViewBB} from "../js/views/tooltipViewBB";
import {TooltipModel} from "../js/backbone-models/models";
import {makeTooltipContents, makeTooltipTitle} from "../js/ui-utils/make-tooltip";
import {TrustedHtml, toHtml} from "../js/ui-utils/trusted-html";

// Text that would add elements if it were inserted as HTML
const EVIL = "<img src=x onerror=\"window.xssRan=true\">&<b>bold</b>";

function makeTooltip() {
    const model = new TooltipModel();
    const view = new TooltipViewBB({model: model});
    return {model, el: view.el};
}

/**
 * Data (protein names, group names, layout names, ...) shown by views that build HTML must be
 * shown as text, never parsed as HTML.
 */
export function addHtmlEscapingTests() {
    module("HTML escaping");

    test("toHtml escapes text, keeps TrustedHtml, and stringifies like before", function (assert) {
        assert.strictEqual(toHtml(EVIL), "&lt;img src=x onerror=&quot;window.xssRan=true&quot;&gt;&amp;&lt;b&gt;bold&lt;/b&gt;");
        assert.strictEqual(toHtml(new TrustedHtml("<b>x</b>")), "<b>x</b>");
        assert.strictEqual(toHtml(12.5), "12.5");
        assert.strictEqual(toHtml(undefined), "undefined");
        assert.strictEqual(toHtml(null), "null");
    });

    test("Tooltip shows header and table contents as text", function (assert) {
        const {model, el} = makeTooltip();
        model.set("header", EVIL);
        model.set("contents", [["Name", EVIL], ["Count", 3], ["Value", 1.23456789]]);
        assert.strictEqual(el.querySelector("h2").textContent, EVIL, "header text unchanged");
        const cells = Array.from(el.querySelectorAll("td")).map(td => td.textContent);
        assert.deepEqual(cells, ["Name", EVIL, "Count", "3", "Value", "1.234568"], "cells as text, numbers formatted as before");
        assert.strictEqual(el.querySelectorAll("img, b").length, 0, "no elements from the data");
    });

    test("Tooltip shows list and plain contents as text", function (assert) {
        const {model, el} = makeTooltip();
        model.set("contents", ["a", EVIL, null]);
        assert.deepEqual(Array.from(el.querySelectorAll("li")).map(li => li.textContent), ["a", EVIL, ""]);
        model.set("contents", EVIL);
        assert.strictEqual(el.querySelector("p").textContent, EVIL);
        assert.strictEqual(el.querySelectorAll("img, b").length, 0, "no elements from the data");
    });

    test("Tooltip keeps markup the caller marked as TrustedHtml", function (assert) {
        const {model, el} = makeTooltip();
        model.set("header", new TrustedHtml("y3<span class='sup'>2+</span>"));
        assert.strictEqual(el.querySelectorAll("h2 span.sup").length, 1);
        assert.strictEqual(el.querySelector("h2").textContent, "y32+");
    });

    test("Protein and link tooltips show a renamed protein's name as text", function (assert) {
        const protein = {
            id: "P1", accession: "P12345", size: 100, description: EVIL, name: EVIL,
            getMeta: () => ({}),
        };
        const {model, el} = makeTooltip();
        model.set("header", makeTooltipTitle.protein(protein));
        model.set("contents", makeTooltipContents.protein(protein));
        // makeTooltipTitle.protein replaces the first "_" with a space; EVIL has none
        assert.strictEqual(el.querySelector("h2").textContent, EVIL);
        assert.ok(Array.from(el.querySelectorAll("td")).some(td => td.textContent === EVIL), "description cell");
        assert.strictEqual(el.querySelectorAll("img, b").length, 0, "no elements from the data");
        assert.notOk(window.xssRan, "no script ran");
    });
}

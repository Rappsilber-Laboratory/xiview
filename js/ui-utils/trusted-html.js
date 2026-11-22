/**
 * @fileoverview HTML escaping for views that build HTML strings.
 * Values that may come from data (protein names, group names, file names, modification names,
 * saved layouts, ...) must be escaped before going into HTML. A view that deliberately passes
 * markup to a sink that escapes by default (e.g. the tooltip) wraps it in TrustedHtml, after
 * escaping any data inside it itself.
 */
import * as _ from "underscore";

/**
 * Marks a string as HTML that is safe to insert as is.
 */
export class TrustedHtml {
    /**
     * @param {string} html - HTML whose data parts are already escaped
     */
    constructor(html) {
        this.html = html;
    }

    toString() {
        return this.html;
    }
}

/**
 * HTML for a value: TrustedHtml as is, anything else escaped as text (String(value), so
 * numbers, null and undefined read as before).
 * @param {*} value
 * @returns {string}
 */
export function toHtml(value) {
    return value instanceof TrustedHtml ? value.html : _.escape(String(value));
}

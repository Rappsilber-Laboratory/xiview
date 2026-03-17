/**
 * @fileoverview Builds Molstar Shape<Cylinders> objects for crosslink display.
 * Three layers: all links (base color), selected (emphasis), highlighted (hover).
 * Called by MolstarRepresentation when the link list changes.
 */

import { Shape } from "molstar/lib/mol-model/shape";
import { CylindersBuilder } from "molstar/lib/mol-geo/geometry/cylinders/cylinders-builder";
import { Color } from "molstar/lib/mol-util/color";
import d3 from "d3";

const DEFAULT_COLOR = Color(0x808080);

/**
 * Parses an 'rgb(r,g,b)' or '#rrggbb' string (as returned by d3.rgb/linkColourAssignment)
 * to a Molstar Color integer.
 * @param {string} rgbStr
 * @returns {Color}
 */
function cssStringToColor(rgbStr) {
    if (!rgbStr) return DEFAULT_COLOR;
    // trim transparency suffix if present (e.g. 'rgba(...)' or 8-digit hex)
    const rgb = d3.rgb(rgbStr.substring(0, 7));
    if (isNaN(rgb.r)) return DEFAULT_COLOR;
    return Color.fromRgb(rgb.r | 0, rgb.g | 0, rgb.b | 0);
}

/**
 * Builds a Shape<Cylinders> for a list of 3D crosslinks.
 * Links without valid atom positions are silently skipped.
 * @param {Array} links - Array of fullLink objects from MolstarModelWrapperBB.getFullLinks()
 * @param {MolstarModelWrapperBB} modelWrapper
 * @param {Function} colorFn - (link) => '#rrggbb' | 'rgb(r,g,b)' string; null for uniform color
 * @param {number} radius - Cylinder radius scale (default 0.5)
 * @param {Color} uniformColor - Used when colorFn is null
 * @returns {import("molstar/lib/mol-model/shape").Shape}
 */
export function buildCrosslinkShape(links, modelWrapper, colorFn, radius, uniformColor) {
    const r = radius || 0.5;

    if (!links || links.length === 0) {
        const cylinders = CylindersBuilder.create(0, 0).getCylinders();
        return Shape.create("crosslinks", [], cylinders,
            () => uniformColor || DEFAULT_COLOR, () => 1, () => "");
    }

    const builder = CylindersBuilder.create(links.length, links.length);
    const usableLinks = [];

    links.forEach((link) => {
        const atomA = modelWrapper.getAtomIndex(link.residueA.seqIndex, link.residueA.chainIndex);
        const atomB = modelWrapper.getAtomIndex(link.residueB.seqIndex, link.residueB.chainIndex);
        if (!atomA || !atomB) return;
        const [ax, ay, az] = modelWrapper.getAtomCoordinates(atomA);
        const [bx, by, bz] = modelWrapper.getAtomCoordinates(atomB);
        if (ax === undefined || bx === undefined) return;
        const groupId = usableLinks.length;
        builder.add(ax, ay, az, bx, by, bz, r, true, true, 2, groupId);
        usableLinks.push(link);
    });

    const cylinders = builder.getCylinders();

    return Shape.create(
        "crosslinks",
        usableLinks,
        cylinders,
        (groupId) => {
            if (uniformColor) return uniformColor;
            const link = usableLinks[groupId];
            if (!link || !colorFn) return DEFAULT_COLOR;
            return cssStringToColor(colorFn(link));
        },
        () => 1,
        (groupId) => {
            const link = usableLinks[groupId];
            return link ? "Crosslink " + link.origId : "";
        }
    );
}

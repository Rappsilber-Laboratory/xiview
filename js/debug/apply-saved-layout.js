// Debugging helper — NOT for production.
//
// Usage: open the network, then run `await applySavedLayout(url)` in the browser console.
// `source` can be a URL string or a pre-loaded layout object.

import vent from "../vent";

export async function applySavedLayout(source) {
    const layout = (source && typeof source === "object")
        ? source
        : await fetch(source).then(r => r.json());
    const normalized = {
        proteins: layout.proteins,
        // loadLayout reads `proteinIds`; the saved file uses `participantIds`.
        groups: (layout.groups || []).map(g => ({
            ...g,
            proteinIds: g.proteinIds || g.participantIds,
        })),
        // already a JSON string of {accession: "#hex"}, which loadLayout JSON.parses.
        manualColourAssignment: layout.manualColourAssignment,
    };
    vent.trigger("xinetLoadLayout", normalized);
    return normalized;
}

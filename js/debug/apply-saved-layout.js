// Debugging helper — NOT for production.
//
// Usage: open the network, then run `applySavedLayout()` in the browser console.

// import vent from "../vent";
// // import layout from "./juri-sorted-layout.json";
//
// export function applySavedLayout() {
//     const normalized = {
//         proteins: layout.proteins,
//         // loadLayout reads `proteinIds`; the saved file uses `participantIds`.
//         groups: (layout.groups || []).map(g => ({
//             ...g,
//             proteinIds: g.proteinIds || g.participantIds,
//         })),
//         // already a JSON string of {accession: "#hex"}, which loadLayout JSON.parses.
//         manualColourAssignment: layout.manualColourAssignment,
//     };
//     vent.trigger("xinetLoadLayout", normalized);
//     return normalized;
// }

/**
 * @fileoverview Custom PDB ATOM record writer using Molstar atomicHierarchy.
 * Replaces NGL.PdbWriter. Generates standard PDB format ATOM lines from
 * model.atomicHierarchy + model.atomicConformation. Supports multiple structures.
 */

import { sprintf } from "sprintf-js";

/**
 * Writes PDB ATOM records for an array of modelInfo objects.
 * @param {Array<{model, id}>} modelInfoArr - From MolstarModelWrapperBB
 * @param {Object} [opts]
 * @param {Array<string>} [opts.remarks] - Lines to include as REMARK records
 * @returns {string} PDB-format text
 */
export function writePDB(modelInfoArr, opts) {
    const remarks = (opts && opts.remarks) || [];
    const lines = [];

    // Remarks
    for (const remark of remarks) {
        lines.push("REMARK" + remark);
    }

    let serialOffset = 0;

    for (let mi = 0; mi < modelInfoArr.length; mi++) {
        const { model } = modelInfoArr[mi];
        const { atomicHierarchy, atomicConformation } = model;
        const { chains, residues, atoms, chainAtomSegments, residueAtomSegments } = atomicHierarchy;
        const { x, y, z } = atomicConformation;

        if (modelInfoArr.length > 1) {
            lines.push(sprintf("MODEL     %4d", mi + 1));
        }

        const chainCount = chains._rowCount;
        for (let ci = 0; ci < chainCount; ci++) {
            // Residue range for this chain
            const rStart = chainAtomSegments.index[ci];
            const rEnd = chainAtomSegments.index[ci + 1];

            for (let ri = rStart; ri < rEnd; ri++) {
                const compId = residues.label_comp_id.value(ri);
                const seqId = residues.auth_seq_id.value(ri);
                const chainId = chains.auth_asym_id.value(ci);

                // Atom range for this residue
                const aStart = residueAtomSegments.offsets[ri];
                const aEnd = residueAtomSegments.offsets[ri + 1];

                for (let ai = aStart; ai < aEnd; ai++) {
                    const serial = ai + 1 + serialOffset;
                    const atomName = atoms.label_atom_id.value(ai).padEnd(4);
                    const altLoc = " ";
                    const iCode = " ";
                    const occupancy = 1.0;
                    const bFactor = 0.0;
                    const element = atoms.type_symbol.value(ai) || " ";

                    lines.push(sprintf(
                        "ATOM  %5d %-4s%1s%-3s %1s%4d%1s   %8.3f%8.3f%8.3f%6.2f%6.2f          %2s",
                        serial, atomName, altLoc, compId, chainId, seqId, iCode,
                        x[ai], y[ai], z[ai], occupancy, bFactor, element
                    ));
                }
            }

            lines.push(sprintf("TER   %5d      %-3s %1s%4d",
                (rEnd > rStart ? residueAtomSegments.offsets[rEnd - 1] + 1 : 0) + serialOffset,
                residues.label_comp_id.value(Math.max(0, rEnd - 1)),
                chains.auth_asym_id.value(ci),
                residues.auth_seq_id.value(Math.max(0, rEnd - 1))
            ));
        }

        serialOffset += atomicConformation.x.length;

        if (modelInfoArr.length > 1) {
            lines.push("ENDMDL");
        }
    }

    lines.push("END");
    return lines.join("\n") + "\n";
}

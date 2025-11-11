import * as d3 from "d3";

export function getDigestibleResiduesAsFeatures(clmsModel, participant) {
    const digestibleResiduesAsFeatures = [];

    const sequence = participant.sequence;
    const seqLength = sequence.length;
    const specificity = clmsModel.get("enzymeSpecificity");

    const specifCount = specificity.length;
    for (let i = 0; i < specifCount; i++) {
        const spec = specificity[i];
        for (let s = 0; s < seqLength; s++) {
            if (sequence[s] === spec.aa) {
                if (!spec.postConstraint || !sequence[s + 1] || spec.postConstraint.indexOf(sequence[s + 1]) === -1) {
                    digestibleResiduesAsFeatures.push({
                        begin: s + 1,
                        end: s + 1,
                        name: "DIGESTIBLE",
                        protID: participant.id,
                        id: participant.id + " " + spec.type + (s + 1),
                        category: "AA",
                        type: "DIGESTIBLE"
                    });
                }
            }
        }
    }
    //console.log("sp:", specificity, "df:", digestibleResiduesAsFeatures);
    return digestibleResiduesAsFeatures;
}

export function getCrosslinkableResiduesAsFeatures(clmsModel, participant, reactiveGroup) {
    const crosslinkableResiduesAsFeatures = [];

    const sequence = participant.sequence;
    const seqLength = sequence.length;
    const linkedResSets = clmsModel.get("crosslinkerSpecificity");

    const temp = d3.values(linkedResSets);
    for (let cl = 0; cl < temp.length; cl++) {
        // resSet = {searches: new Set(), linkables: [], name: crosslinkerName};
        const crosslinkerLinkedResSet = temp[cl];
        const linkables = crosslinkerLinkedResSet.linkables;

        //for (var l = 0 ; l < linkables.length; l++) {
        if (linkables[reactiveGroup - 1]) {
            const linkableSet = linkables[reactiveGroup - 1];
            const linkableArr = [];
            linkableSet.forEach(v => linkableArr.push(v));
            const specifCount = linkableArr.length;
            for (let i = 0; i < specifCount; i++) {
                const spec = linkableArr[i];
                for (let s = 0; s < seqLength; s++) {
                    if (sequence[s] === spec) {
                        crosslinkableResiduesAsFeatures.push({
                            begin: s + 1,
                            end: s + 1,
                            name: "CROSSLINKABLE-" + reactiveGroup,
                            protID: participant.id,
                            id: participant.id + " Crosslinkable residue" + (s + 1) + "[group " + reactiveGroup + "]",
                            category: "AA",
                            type: "CROSSLINKABLE-" + reactiveGroup
                        });
                    }
                }
            }
        }
    }

    return crosslinkableResiduesAsFeatures;
}

export const matchMassToAA = function (mass, tolerance) {

    if (tolerance === undefined) tolerance = 0.01;

    const aminoAcids = [
        {"aminoAcid": "A", "monoisotopicMass": 71.03711},
        {"aminoAcid": "R", "monoisotopicMass": 156.10111},
        {"aminoAcid": "N", "monoisotopicMass": 114.04293},
        {"aminoAcid": "D", "monoisotopicMass": 115.02694},
        {"aminoAcid": "C", "monoisotopicMass": 103.00919},
        {"aminoAcid": "E", "monoisotopicMass": 129.04259},
        {"aminoAcid": "Q", "monoisotopicMass": 128.05858},
        {"aminoAcid": "G", "monoisotopicMass": 57.02146},
        {"aminoAcid": "H", "monoisotopicMass": 137.05891},
        {"aminoAcid": "I", "monoisotopicMass": 113.08406},
        {"aminoAcid": "L", "monoisotopicMass": 113.08406},
        {"aminoAcid": "K", "monoisotopicMass": 128.09496},
        {"aminoAcid": "M", "monoisotopicMass": 131.04049},
        {"aminoAcid": "F", "monoisotopicMass": 147.06841},
        {"aminoAcid": "P", "monoisotopicMass": 97.05276},
        {"aminoAcid": "S", "monoisotopicMass": 87.03203},
        {"aminoAcid": "T", "monoisotopicMass": 101.04768},
        {"aminoAcid": "W", "monoisotopicMass": 186.07931},
        {"aminoAcid": "Y", "monoisotopicMass": 163.06333},
        {"aminoAcid": "V", "monoisotopicMass": 99.06841}
    ];

    let aaArray = aminoAcids.filter(function (d) {
        if (Math.abs(mass - d.monoisotopicMass) < tolerance)
            return true;
    }).map(function (d) {
        return d.aminoAcid;
    });

    return aaArray.join();
};

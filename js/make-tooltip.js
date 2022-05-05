import * as d3 from "d3";
import * as _ from "underscore";
import {amino1to3Map, getDirectionalResidueType, getResidueType, highestScore} from "./modelUtils";

export const makeTooltipContents = {
    maxRows: 25,

    residueString: function (singleLetterCode) {
        return singleLetterCode + " (" + amino1to3Map[singleLetterCode] + ")";
    },

    formatDictionary: {
        formats: {distance: d3.format(".2f")},
        units: {distance: " Å"},
        unknownText: {distance: "Unknown"}
    },

    niceFormat: function (key, value) {
        const fd = makeTooltipContents.formatDictionary;
        const noFormat = function (v) {
            return v;
        };

        const format = fd.formats[key] || noFormat;
        const unit = fd.units[key] || "";
        const unknown = fd.unknownText[key] || "";

        return value !== undefined ? (format(value) + (unit || "")) : unknown;
    },

    link: function (xlink, extras) {
        const linear = xlink.isLinearLink();
        const mono = xlink.isMonoLink();
        const info = [
            ["From", xlink.fromProtein.name, xlink.fromResidue, makeTooltipContents.residueString(getDirectionalResidueType(xlink, false))],
            linear ? ["To", "Linear", "---", "---"] : mono ? ["To", "Monolink", "---", "---"]
                : ["To", xlink.toProtein.name, xlink.toResidue, makeTooltipContents.residueString(getDirectionalResidueType(xlink, true))],
            ["Matches", xlink.filteredMatches_pp.length],
            ["Highest Score", highestScore(xlink)]
        ];

        const extraEntries = _.pairs(extras);    // turn {a:1, b:2} into [["a",1],["b",2]]
        info.push.apply(info, extraEntries);

        d3.entries(xlink.getMeta()).forEach(function (entry) {
            const val = entry.value;
            const key = entry.key.toLocaleLowerCase();
            if (val !== undefined && !_.isObject(val)) {
                info.push([key, makeTooltipContents.niceFormat(key, val)]);
            }
        });
        return info;
    },

    interactor: function (interactor) {
        const contents = [
            ["ID", interactor.id],
            ["Accession", interactor.accession],
            ["Size", interactor.size],
            ["Desc.", interactor.description]
        ];

        if (interactor.uniprot) {
            contents.push(["Keywords", interactor.uniprot.keywords]);
        }

        d3.entries(interactor.getMeta()).forEach(function (entry) {
            const val = entry.value;
            const key = entry.key.toLocaleLowerCase();
            if (val !== undefined && !_.isObject(val)) {
                contents.push([key, makeTooltipContents.niceFormat(key, val)]);
            }
        });

        return contents;
    },

    multilinks: function (xlinks, interactorId, residueIndex, extras) {
        let ttinfo = xlinks.map(function (xlink) {
            const linear = xlink.isLinearLink();
            const startIsTo = !linear && (xlink.toProtein.id === interactorId && xlink.toResidue === residueIndex);
            const residueCode = linear ? "---" : makeTooltipContents.residueString(getDirectionalResidueType(xlink, !startIsTo));
            if (startIsTo) {
                return [xlink.fromProtein.name, xlink.fromResidue, residueCode, xlink.filteredMatches_pp.length];
            } else {
                return [linear ? "Linear" : xlink.toProtein.name, linear ? "---" : xlink.toResidue, residueCode, xlink.filteredMatches_pp.length];
            }
        });

        const extraEntries = d3.entries(extras);
        extraEntries.forEach(function (extraEntry) {
            const key = extraEntry.key.toLocaleLowerCase();

            extraEntry.value.forEach(function (val, i) {
                ttinfo[i].push(makeTooltipContents.niceFormat(key, val));
            });
        });

        const sortFields = [3, 0, 1]; // sort by matches, then protein name, then res index
        const sortDirs = [1, -1, -1];
        ttinfo.sort(function (a, b) {
            let diff = 0;
            for (let s = 0; s < sortFields.length && diff === 0; s++) {
                const field = sortFields[s];
                diff = (b[field] - a[field]) * sortDirs[s];
                if (isNaN(diff)) {
                    diff = b[field].localeCompare(a[field]) * sortDirs[s];
                }
            }
            return diff;
        });


        const headers = ["Protein", "Pos", "Residue", "Matches"];
        extraEntries.forEach(function (extraEntry) {
            headers.push(extraEntry.key);
        });

        ttinfo.unshift(headers);
        ttinfo.tableHasHeaders = true;
        const length = ttinfo.length;
        const limit = makeTooltipContents.maxRows;
        if (length > limit) {
            ttinfo = ttinfo.slice(0, limit);
            ttinfo.push(["+ " + (length - limit) + " More"]);
        }
        return ttinfo;
    },

    feature: function (feature) {
        const possFields = [
            ["description"],
            ["type"],
            ["category"],
            ["fstart", "start"],
            ["fend", "end"]
        ];
        const data = possFields
            .filter(function (field) {
                return feature[field[0]] != undefined;
            })
            .map(function (field) {
                return [field.length > 1 ? field[1] : field[0], feature[field[0]]];
            });
        return data;
    },

    linkList: function (linkList, extras) {
        const extraEntries = d3.entries(extras);
        let fromProtein, toProtein;

        let details = linkList.map(function (crosslink, i) {
            const from3LetterCode = makeTooltipContents.residueString(getDirectionalResidueType(crosslink, false));
            const to3LetterCode = makeTooltipContents.residueString(getDirectionalResidueType(crosslink, true));
            fromProtein = crosslink.fromProtein.name;
            toProtein = crosslink.toProtein.name;
            const row = [crosslink.fromResidue + " " + from3LetterCode, crosslink.toResidue + " " + to3LetterCode];
            extraEntries.forEach(function (entry) {
                const key = entry.key.toLocaleLowerCase();
                const val = entry.value[i];
                row.push(makeTooltipContents.niceFormat(key, val));
            });
            return row;
        });
        if (details.length) {
            const header = [fromProtein.replace("_", " "), toProtein.replace("_", " ")];
            extraEntries.forEach(function (entry) {
                header.push(entry.key);
            });
            details.unshift(header);
            details.tableHasHeaders = true;
        } else {
            details = null;
        }
        return details;
    },

    match: function (match) {
        return [
            ["Match ID", match.match.id],
        ];
    },

    goTerm: function (goTerm) {
        return [
            //["ID", goTerm.id],
            ["Name", goTerm.name],
            //["Namespace", goTerm.namespace],
            ["Definition", goTerm.def],
            // ["Synonym", goTerm.synomym],
            // ["is_a", Array.from(goTerm.is_a.values()).join(", ")],
            // ["intersection_of", Array.from(goTerm.intersection_of.values()).join(", ")],
            // ["relationship", Array.from(goTerm.relationship.values()).join(", ")],
            // ["interactors", goTerm.getInteractors(false).size]
        ];
    },

    complex: function (interactor) {
        const contents = [
            ["Complex", interactor.id],
            //  ["Members", Array.from(goTerm.relationship.values()).join(", ")]
            // ["Accession", interactor.accession],
            // ["Size", interactor.size],
            // ["Desc.", interactor.description]
        ];

        // d3.entries(interactor.getMeta()).forEach(function(entry) {
        //     var val = entry.value;
        //     var key = entry.key.toLocaleLowerCase();
        //     if (val !== undefined && !_.isObject(val)) {
        //         contents.push ([key, makeTooltipContents.niceFormat (key, val)]);
        //     }
        // });
        //
        // if (interactor.go) {
        //     var goTermsMap = window.compositeModelInst.get("go");
        //     var goTermsText = "";
        //     for (var goId of interactor.go) {
        //         var goTerm = goTermsMap.get(goId);
        //         goTermsText += goTerm.name + "<br>";
        //     }
        //     contents.push(["GO", goTermsText]);
        // }
        return contents;
    },
};
export const makeTooltipTitle = {
    link: function (linkCount) {
        return "Linked Residue Pair" + (linkCount > 1 ? "s" : "");
    },
    interactor: function (interactor) {
        return interactor.name.replace("_", " ");
    },
    residue: function (interactor, residueIndex, residueExtraInfo) {
        return interactor.name + ":" + residueIndex + "" + (residueExtraInfo ? residueExtraInfo : "") + " " +
            makeTooltipContents.residueString(getResidueType(interactor, residueIndex));
    },
    feature: function () {
        return "Feature";
    },
    linkList: function (linkCount) {
        return "Linked Residue Pair" + (linkCount > 1 ? "s" : "");
    },
    complex: function (interactor) {
        return interactor.name.replace("_", " ");
    },
};
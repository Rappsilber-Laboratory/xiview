import {GoTerm} from "./views/go/goTerm";

export function loadGOAnnotations (txt) {
    console.log ("parsing go obo");
    var z = performance.now();
    var go = new Map();
    //var lines = txt.split('\n');
    var term;
    var i = 0, l = 0;
    var first = true;

    //for (var l = 0; l < lines.length; l++) {
    while (i !== 0 || first) {
        first = false;
        var endi = txt.indexOf("\n", i);
        var line = txt.slice(i, endi !== -1 ? endi : undefined);
        //not having ':' in go ids, so valid html id later, maybe a mistake, (do trim here to get rid of '/r's too - mjg)
        line = line.trim().replace (/:/g, '');
        //var line = lines[l].trim().replace (/:/g, '');

        if (line) {
            if (line === "[Term]" || line === "[Typedef]") {
                if (term) {
                    go.set(term.id, term);
                }
                term = new GoTerm();
            } else if (term) {
                //var parts = line.split(" ");  // speed up by avoiding split if humanly possible as free text lines are space heavy
                var tag = line.slice (0, line.indexOf(" "));
                var value = line.slice (tag.length + 1);
                if (tag === "is_a") {
                    var vi = value.indexOf(" ");
                    var valuewc = vi >= 0 ? value.slice(0, vi) : value; // remove comment portion
                    term.is_a = term.is_a || new Set();
                    term.is_a.add (valuewc);
                } else if (tag === "intersection_of" || tag === "relationship") {
                    var parts = value.split(" ", 2);    // split to first 2 only, avoid parsing comments
                    if (parts[0] === "part_of") {
                        // console.log(term.namespace, line);
                        term.part_of = term.part_of || new Set();
                        term.part_of.add (parts[1]);
                    }
                } else {
                    term[tag] = value;   // quicker in chrome at least
                }
            }
        }
        i = endi + 1;
        l++;
    }
    go.set(term.id, term); // last one left over

    var zz = performance.now();
    //populate subclasses and parts
    for (term of go.values()) {
        if (term.is_a) {
            for (let superclassId of term.is_a){
                //console.log ("go", go, superclassId, go.get(superclassId));
                var other = go.get(superclassId);
                other.subclasses = other.subclasses || new Set();
                other.subclasses.add(term.id);
            }
        }
        if (term.part_of) {
            for (let partOfId of term.part_of){
                var other = go.get(partOfId);
                other.parts = other.parts || new Set();
                other.parts.add(term.id);
            }
        }
    }
    console.log (zz-z, "ms. first pass (is_a, part_of)", performance.now() - zz, "ms. second pass (subclasses, parts)");
    console.log ("for obo parsing", l, "lines into map size", go.size);

    return go;
}

/*
jsonifyGoMap (goMap) {
    var json = {};
    goMap.forEach (function (v, k) {
        var newv = $.extend({}, v);
        Object.keys(newv).forEach (function (key) {
            if (newv[key] instanceof Set) {
                if (newv[key].size === 0) {
                    delete newv[key];
                } else {
                    newv[key] = [...newv[key]];
                }
            }
        });
        json[k] = JSON.parse(JSON.stringify(newv));
    });

    return json;
},


/*
    convertGO_OBOtoJson: function (url) {
        d3.text (url, function(error, txt) {
            if (error) {
                console.log("error", error, "for", url, arguments);
            } else {
                go = modelUtils.loadGOAnnotations (txt);  // temp store until CLMS model is built
                jsongo = modelUtils.jsonifyGoMap (go);
            }
        });
    },
*/

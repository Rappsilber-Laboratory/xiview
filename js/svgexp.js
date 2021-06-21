/**
 * Created by cs22 on 04/12/14.
 */

export const svgUtils = {
    
    capture: function (svgElems) {
        return svgElems.map (function(svg) { return svgUtils.makeSVGDoc (svg); });
    },

    getAllSVGElements: function () {
        // search through all document objects, including those in iframes
        var allIFrames = [].slice.apply (document.getElementsByTagName('iframe'));
        var docs = [document];
        allIFrames.forEach (function (iframe) {
            try {
                docs.push (iframe.contentDocument || iframe.contentWindow.document);
            }
            catch (e) {
                console.log ("Protected cross-domain IFrame", iframe);
            }
        });

        var allSvgs = [];
        docs.forEach (function(doc) {
            var allDocSvgs = [].slice.apply (doc.getElementsByTagName('svg'));
            allSvgs.push.apply (allSvgs, allDocSvgs);
        });
        return allSvgs;
    },


    makeSVGDoc: function (svgElem) {
        // clone node
        var cloneSVG = svgElem.cloneNode (true);
        var ownerDoc = cloneSVG.ownerDocument || document;
        svgUtils.pruneInvisibleSubtrees (cloneSVG, svgElem);

        // find all styles inherited/referenced at or below this node
        var styles = svgUtils.usedStyles (svgElem, true, true);

        // collect relevant info on parent chain of svg node
        var predecessorInfo = svgUtils.parentChain (svgElem, styles);
        
        var addDummy = function (dummySVGElem, cloneSVG, origSVG, transferAttr) {
            dummySVGElem.appendChild (cloneSVG);
            Object.keys(transferAttr).forEach (function (attr) {
                var val = cloneSVG.getAttribute (attr) || cloneSVG.style [attr] || svgUtils.getComputedStyleCssText (origSVG, attr);
                if (val != null) {
                    dummySVGElem.setAttribute (attr, val);
                    var attrVal = transferAttr[attr];
                    if (attrVal.replace) {
                        cloneSVG.setAttribute (attr, attrVal.replace);
                    } else if (attrVal.delete) {
                        cloneSVG.removeAttribute (attr);
                    }
                }
            });
        };

        // make a chain of dummy svg nodes to include classes / ids of parent chain of our original svg
        // this means any styles referenced within the svg that depend on the presence of these classes/ids are fired
        var transferAttr = {width: {replace: "100%"}, height: {replace: "100%"}, xmlns: {delete: true}};
        var parentAdded = false;
        for (var p = 0; p < predecessorInfo.length; p++) {
            var pinf = predecessorInfo [p];
            //var dummySVGElem = ownerDoc.createElement ("svg");
            var dummySVGElem = ownerDoc.createElementNS ("http://www.w3.org/2000/svg", "svg");
            var empty = true;
            Object.keys(pinf).forEach (function (key) {
                if (pinf[key]) {
                    dummySVGElem.setAttribute (key, pinf[key]);
                    empty = false;
                }
            });
            // If the dummy svg has no relevant id, classes or computed style then ignore it, otherwise make it the new root
            if (!empty) {
                addDummy (dummySVGElem, cloneSVG, svgElem, transferAttr);
                cloneSVG = dummySVGElem;
                parentAdded = true;
            }
        }

        // if no dummy parent added in previous section, but our svg isn't root then add one as placeholder
        if (svgElem.parentNode != null && !parentAdded) {
            var dummySVGElem = ownerDoc.createElementNS ("http://www.w3.org/2000/svg", "svg");
            addDummy (dummySVGElem, cloneSVG, svgElem, transferAttr);
            cloneSVG = dummySVGElem;
            parentAdded = true;
        }

        // Copy svg's computed style (it's style context) if a dummy parent node has been introduced
        if (parentAdded) {
            cloneSVG.setAttribute ("style", svgUtils.getComputedStyleCssText (svgElem));
        }

        cloneSVG.setAttribute ("version", "1.1");
        //cloneSVG.setAttribute ("xmlns", "http://www.w3.org/2000/svg");    // XMLSerializer does this
        //cloneSVG.setAttribute ("xmlns:xlink", "http://www.w3.org/1999/xlink");  // when I used setAttributeNS it ballsed up
		// however using these attributeNS calls work, and stops errors in IE11. Win.
		cloneSVG.setAttributeNS ("http://www.w3.org/2000/xmlns/", "xmlns", "http://www.w3.org/2000/svg");    // XMLSerializer does this
        cloneSVG.setAttributeNS ("http://www.w3.org/2000/xmlns/", "xmlns:xlink", "http://www.w3.org/1999/xlink");  // when I used setAttributeNS it ballsed up


        var styleElem = ownerDoc.createElement ("style");
        styleElem.setAttribute ("type", "text/css");
        var styleText = ownerDoc.createTextNode (styles.join("\n"));
        styleElem.appendChild (styleText);
        cloneSVG.insertBefore (styleElem, cloneSVG.firstChild);

        return cloneSVG;
    },
    
    // Because firefox returns cssText as empty
    // https://bugzilla.mozilla.org/show_bug.cgi?id=137687
    getComputedStyleCssText: function (element, field) {
        var style = window.getComputedStyle(element);
        if (field) {
            return style[field];
        }

        if (style.cssText != "") {
            return style.cssText;
        }

        var cssText = "";
        for (var i = 0; i < style.length; i++) {
            var styleName = style[i];
            var propVal = style.getPropertyValue(styleName);
            cssText += styleName + ": " + propVal + "; ";
        }

        return cssText;
    },
    
    doPruneInvisible: true,
    
    pruneConditionSets: [{"display": "none"}, {"visibility": "hidden"}, {"opacity": "0"}, {"fill-opacity": "0", "stroke-opacity": "0"}, {"fill-opacity": "0", "stroke": "none"}, {"fill": "none", "stroke-opacity": "0"}],
    
    pruneInvisibleSubtrees: function (clonedElement, matchingOriginalElement) {
        if (svgUtils.doPruneInvisible) {
            var style = window.getComputedStyle (matchingOriginalElement);  // cloned (unattached) nodes in chrome at least don't have computed styles
            var prune = false;
            
            svgUtils.pruneConditionSets.forEach (function (conditionSet) {
                if (!prune) {
                    var allConditionsMet = true;
                    Object.keys(conditionSet).forEach (function (condition) {
                        var condVal = conditionSet[condition];
                        var eStyle = style[condition];
                        var eAttr = matchingOriginalElement.getAttribute(condition);
                        if (!(eStyle === condVal || (!eStyle && eAttr === condVal))) {
                            allConditionsMet = false; 
                        }
                    });
                    prune = allConditionsMet;
                }
            });
            if (prune && clonedElement.parentNode) {
                clonedElement.parentNode.removeChild (clonedElement);
                //console.log ("removed", clonedElement);
            } else {
                var clonedChildren = clonedElement.children;
                var matchingOriginalChildren = matchingOriginalElement.children;
                //console.log ("kept", clonedElement, style.display, style.visibility, style.opacity, style["stroke-opacity"], style["fill-opacity"], style);
                //console.log (element, "children", children);
                if (clonedChildren && clonedChildren.length) {
                    // count backwards because removing a child will break the 'i' counter if we go forwards
                    // e.g. if children=[A,B,C,D] and i=2, if we delete[C] then children becomes [A,B,D],
                    // and when i then increments to 3, expecting D, instead we find the end of loop, and don't test D
                    // PS. And if we fixed that we'd then need a separate counter for the original child elements anyways so backwards it is
                    for (var i = clonedChildren.length; --i >= 0;) {
                        svgUtils.pruneInvisibleSubtrees (clonedChildren[i], matchingOriginalChildren[i]);
                    }
                }
            }
        }
    },

    parentChain: function (elem, styles) {
        // Capture id / classes of svg's parent chain.
        var ownerDoc = elem.ownerDocument || document;
        var elemArr = [];
        while (elem.parentNode !== ownerDoc && elem.parentNode !== null) {
            elem = elem.parentNode;
            elemArr.push ({id: elem.id, class: elem.getAttribute("class") || ""});
        }

        // see if id or element class are referenced in any styles collected below the svg node
        // if not, null the id / class as they're not going to be relevant
        elemArr.forEach (function (elemData) {
            var presences = {id: false, class: false};
            var classes = elemData.class.split(" ").filter(function(a) { return a.length > 0; });   // v1.13: may be multiple classes in a containing class attribute
            styles.forEach (function (style) {
                for (var c = 0; c < classes.length; c++) {
                    if (style.indexOf ("."+classes[c]) >= 0) {
                        presences.class = true;
                        break;  // no need to keep looking through rest of classtypes if one is needed
                    }
                }
                if (elemData.id && style.indexOf ("#"+elemData.id) >= 0) {
                    presences.id = true;
                }
            });
            Object.keys(presences).forEach (function (presence) {
                if (!presences[presence]) { elemData[presence] = undefined; }
            });
        });

        return elemArr;
    },

    // code adapted from user adardesign's answer in http://stackoverflow.com/questions/13204785/is-it-possible-to-read-the-styles-of-css-classes-not-being-used-in-the-dom-using
    usedStyles: function (elem, subtree, both) {
        var needed = [], rule;
        var ownerDoc = elem.ownerDocument || document;
        var CSSSheets = ownerDoc.styleSheets;

        for(var j=0; j < CSSSheets.length; j++){
			// stop accessing empty style sheets (1.15), catch security exceptions (1.20)
			try{
				if (CSSSheets[j].cssRules == null) {
					continue;
				}
			} catch (err) {
				continue;
			}
			
            for(var i=0; i < CSSSheets[j].cssRules.length; i++){
                rule = CSSSheets[j].cssRules[i];
                var match = false;
                // Issue reported, css rule '[ng:cloak], [ng-cloak], [data-ng-cloak], [x-ng-cloak], .ng-cloak, .x-ng-cloak, .ng-hide:not(.ng-hide-animate)' gives error
                // It's the [ng:cloak] bit that does the damage
                // Fix found from https://github.com/exupero/saveSvgAsPng/issues/11 - but the css rule isn't applied
                try {
                    if (subtree) {
                        match = elem.querySelectorAll(rule.selectorText).length > 0;
                    }
                    if (!subtree || both) {
                        match |= elem.matches(rule.selectorText);
                    }
                }
                catch (err) {
                    console.warn ("CSS selector error: "+rule.selectorText+". Often angular issue.", err);
                }
                if (match) { needed.push (rule.cssText); }
            }
        }

        return needed;
    },
    
    makeXMLStr: function (xmls, svgDoc) {
        var xmlStr = xmls.serializeToString(svgDoc);
        // serializing adds an xmlns attribute to the style element ('cos it thinks we want xhtml), which knackers it for inkscape, here we chop it out
        xmlStr = xmlStr.split("xmlns=\"http://www.w3.org/1999/xhtml\"").join("");
        return xmlStr;
    },

    saveSVGDocs: function (svgDocs) {
        var xmls = new XMLSerializer();
        svgDocs.forEach (function (svgDoc, i) {
            var xmlStr = svgUtils.makeXMLStr (xmls, svgDoc);
            var blob = new Blob([xmlStr], {type: "image/svg+xml"});
            saveAs(blob, "saved"+i+".svg");
        });
    },
};
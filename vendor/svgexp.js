/**
 * Created by cs22 on 04/12/14.
 */

export const svgUtils = {
    
    capture: function (svgElems) {
        return svgElems.map (function(svg) { return svgUtils.makeSVGDoc (svg); });
    },

    getAllSVGElements: function () {
        // search through all document objects, including those in iframes
        const allIFrames = [].slice.apply(document.getElementsByTagName('iframe'));
        const docs = [document];
        allIFrames.forEach (function (iframe) {
            try {
                docs.push (iframe.contentDocument || iframe.contentWindow.document);
            }
            catch (e) {
                console.log ("Protected cross-domain IFrame", iframe);
            }
        });

        const allSvgs = [];
        docs.forEach (function(doc) {
            const allDocSvgs = [].slice.apply(doc.getElementsByTagName('svg'));
            allSvgs.push.apply (allSvgs, allDocSvgs);
        });
        return allSvgs;
    },


    makeSVGDoc: function (svgElem) {
        // clone node
        let cloneSVG = svgElem.cloneNode(true);
        const ownerDoc = cloneSVG.ownerDocument || document;
        svgUtils.pruneInvisibleSubtrees (cloneSVG, svgElem);

        // find all styles inherited/referenced at or below this node
        const styles = svgUtils.usedStyles(svgElem, true, true);

        // collect relevant info on parent chain of svg node
        const predecessorInfo = svgUtils.parentChain(svgElem, styles);

        const addDummy = function (dummySVGElem, cloneSVG, origSVG, transferAttr) {
            dummySVGElem.appendChild(cloneSVG);
            Object.keys(transferAttr).forEach(function (attr) {
                const val = cloneSVG.getAttribute(attr) || cloneSVG.style [attr] || svgUtils.getComputedStyleCssText(origSVG, attr);
                if (val != null) {
                    dummySVGElem.setAttribute(attr, val);
                    const attrVal = transferAttr[attr];
                    if (attrVal.replace) {
                        cloneSVG.setAttribute(attr, attrVal.replace);
                    } else if (attrVal.delete) {
                        cloneSVG.removeAttribute(attr);
                    }
                }
            });
        };

        // make a chain of dummy svg nodes to include classes / ids of parent chain of our original svg
        // this means any styles referenced within the svg that depend on the presence of these classes/ids are fired
        var transferAttr = {width: {replace: "100%"}, height: {replace: "100%"}, xmlns: {delete: true}};
        let parentAdded = false;
        for (let p = 0; p < predecessorInfo.length; p++) {
            const pinf = predecessorInfo [p];
            //var dummySVGElem = ownerDoc.createElement ("svg");
            var dummySVGElem = ownerDoc.createElementNS ("http://www.w3.org/2000/svg", "svg");
            let empty = true;
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


        const styleElem = ownerDoc.createElement("style");
        styleElem.setAttribute ("type", "text/css");
        const styleText = ownerDoc.createTextNode(styles.join("\n"));
        styleElem.appendChild (styleText);
        cloneSVG.insertBefore (styleElem, cloneSVG.firstChild);

        return cloneSVG;
    },
    
    // Because firefox returns cssText as empty
    // https://bugzilla.mozilla.org/show_bug.cgi?id=137687
    getComputedStyleCssText: function (element, field) {
        const style = window.getComputedStyle(element);
        if (field) {
            return style[field];
        }

        if (style.cssText != "") {
            return style.cssText;
        }

        let cssText = "";
        for (let i = 0; i < style.length; i++) {
            const styleName = style[i];
            const propVal = style.getPropertyValue(styleName);
            cssText += styleName + ": " + propVal + "; ";
        }

        return cssText;
    },
    
    doPruneInvisible: true,
    
    pruneConditionSets: [{"display": "none"}, {"visibility": "hidden"}, {"opacity": "0"}, {"fill-opacity": "0", "stroke-opacity": "0"}, {"fill-opacity": "0", "stroke": "none"}, {"fill": "none", "stroke-opacity": "0"}],
    
    pruneInvisibleSubtrees: function (clonedElement, matchingOriginalElement) {
        if (svgUtils.doPruneInvisible) {
            const style = window.getComputedStyle(matchingOriginalElement);  // cloned (unattached) nodes in chrome at least don't have computed styles
            let prune = false;

            svgUtils.pruneConditionSets.forEach (function (conditionSet) {
                if (!prune) {
                    let allConditionsMet = true;
                    Object.keys(conditionSet).forEach (function (condition) {
                        const condVal = conditionSet[condition];
                        const eStyle = style[condition];
                        const eAttr = matchingOriginalElement.getAttribute(condition);
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
                const clonedChildren = clonedElement.children;
                const matchingOriginalChildren = matchingOriginalElement.children;
                //console.log ("kept", clonedElement, style.display, style.visibility, style.opacity, style["stroke-opacity"], style["fill-opacity"], style);
                //console.log (element, "children", children);
                if (clonedChildren && clonedChildren.length) {
                    // count backwards because removing a child will break the 'i' counter if we go forwards
                    // e.g. if children=[A,B,C,D] and i=2, if we delete[C] then children becomes [A,B,D],
                    // and when i then increments to 3, expecting D, instead we find the end of loop, and don't test D
                    // PS. And if we fixed that we'd then need a separate counter for the original child elements anyways so backwards it is
                    for (let i = clonedChildren.length; --i >= 0;) {
                        svgUtils.pruneInvisibleSubtrees (clonedChildren[i], matchingOriginalChildren[i]);
                    }
                }
            }
        }
    },

    parentChain: function (elem, styles) {
        // Capture id / classes of svg's parent chain.
        const ownerDoc = elem.ownerDocument || document;
        const elemArr = [];
        while (elem.parentNode !== ownerDoc && elem.parentNode !== null) {
            elem = elem.parentNode;
            elemArr.push ({id: elem.id, class: elem.getAttribute("class") || ""});
        }

        // see if id or element class are referenced in any styles collected below the svg node
        // if not, null the id / class as they're not going to be relevant
        elemArr.forEach (function (elemData) {
            const presences = {id: false, class: false};
            const classes = elemData.class.split(" ").filter(function (a) {
                return a.length > 0;
            });   // v1.13: may be multiple classes in a containing class attribute
            styles.forEach (function (style) {
                for (let c = 0; c < classes.length; c++) {
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
        const needed = [];
        let rule;
        const ownerDoc = elem.ownerDocument || document;
        const CSSSheets = ownerDoc.styleSheets;

        for(let j=0; j < CSSSheets.length; j++){
			// stop accessing empty style sheets (1.15), catch security exceptions (1.20)
			try{
				if (CSSSheets[j].cssRules == null) {
					continue;
				}
			} catch (err) {
				continue;
			}
			
            for(let i=0; i < CSSSheets[j].cssRules.length; i++){
                rule = CSSSheets[j].cssRules[i];
                let match = false;
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
        let xmlStr = xmls.serializeToString(svgDoc);
        // serializing adds an xmlns attribute to the style element ('cos it thinks we want xhtml), which knackers it for inkscape, here we chop it out
        xmlStr = xmlStr.split("xmlns=\"http://www.w3.org/1999/xhtml\"").join("");

        xmlStr = xmlStr.replace(/(#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f])([0-9A-Fa-f][0-9A-Fa-f])/g, "$1")

        return xmlStr;
    },

    saveSVGDocs: function (svgDocs) {
        const xmls = new XMLSerializer();
        svgDocs.forEach (function (svgDoc, i) {
            const xmlStr = svgUtils.makeXMLStr(xmls, svgDoc);
            const blob = new Blob([xmlStr], {type: "image/svg+xml"});
            saveAs(blob, "saved"+i+".svg");
        });
    },
};
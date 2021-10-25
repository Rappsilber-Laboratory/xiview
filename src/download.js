export function download(content, contentType, fileName) {
    const oldToNewTypes = {
        "application/svg": "image/svg+xml;charset=utf-8",
        "plain/text": "plain/text;charset=utf-8",
    };
    const newContentType = oldToNewTypes[contentType] || contentType;

    function dataURItoBlob(binary) {
        let array = [];
        let te;

        try {
            te = new TextEncoder("utf-8");
        } catch (e) {
            te = undefined;
        }

        if (te) {
            array = te.encode(binary); // html5 encoding api way
        } else {
            // https://stackoverflow.com/a/18729931/368214
            // fixes unicode bug
            for (let i = 0; i < binary.length; i++) {
                let charcode = binary.charCodeAt(i);
                if (charcode < 0x80) array.push(charcode);
                else if (charcode < 0x800) {
                    array.push(0xc0 | (charcode >> 6),
                        0x80 | (charcode & 0x3f));
                } else if (charcode < 0xd800 || charcode >= 0xe000) {
                    array.push(0xe0 | (charcode >> 12),
                        0x80 | ((charcode >> 6) & 0x3f),
                        0x80 | (charcode & 0x3f));
                }
                // surrogate pair
                else {
                    i++;
                    // UTF-16 encodes 0x10000-0x10FFFF by
                    // subtracting 0x10000 and splitting the
                    // 20 bits of 0x0-0xFFFFF into two halves
                    charcode = 0x10000 + (((charcode & 0x3ff) << 10) |
                        (binary.charCodeAt(i) & 0x3ff));
                    array.push(0xf0 | (charcode >> 18),
                        0x80 | ((charcode >> 12) & 0x3f),
                        0x80 | ((charcode >> 6) & 0x3f),
                        0x80 | (charcode & 0x3f));
                }
            }
        }

        return new Blob([new Uint8Array(array)], {
            type: newContentType
        });
    }

    let blob = dataURItoBlob(content);

    if (navigator.msSaveOrOpenBlob) {
        navigator.msSaveOrOpenBlob(blob, fileName);
    } else {
        const a = document.createElement('a');
        a.href = window.URL.createObjectURL(blob);
        // Give filename you wish to download
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(a.href); // clear up url reference to blob so it can be g.c.'ed
    }

    blob = null;
}

/**
 * Load a file from the user's computer and pass it to a success function. Used by pdbfilechooser, metadatafilechooser.
 * todo - looks like this could be replaced by fetch()
 * @param fileObj the file object
 * @param successFunc the function to call with the file's contents
 * @param associatedData any data to pass to the success function
 * @returns {void}
 */
export function loadUserFile(fileObj, successFunc, associatedData) {
    if (window.File && window.FileReader && window.FileList && window.Blob) {
        const reader = new FileReader();

        // Closure to capture the file information.
        reader.onload = (function () {
            return function (e) {
                successFunc(e.target.result, associatedData);
                // hack for https://stackoverflow.com/a/28274454
                const fileChooserInputs = document.getElementsByClassName("selectMetaDataFileButton");
                for (let fci of fileChooserInputs) {
                    fci.value = null;
                }
            };
        })(fileObj); // pass the fileObj to the closure and do nothing with it? mistake? todo: check

        // Read in the image file as a data URL.
        reader.readAsText(fileObj);
    }
}
makeJSONBlosumMatrix = function (blosumRaw, outputFilename, leftCut = 1, topCut = 0) {
  library(stringr)
  library(RJSONIO)
  # let blosumRaw be a table full of spaces as found at http://www.cbcb.umd.edu/confcour/Fall2008/CMSC423-materials/BLOSUM80
  # copy/paste table as variable into r

  # split it by line, to get a vector of strings (actually a list of length 1 holding the vector,
  # as strsplit accepts a vector of inputs as do the following functions, so we [[1]] the
  # result to uncomplicate things for this first split)
  blos <- strsplit (blosumRaw,"\n")[[1]]
  bloss <- str_trim (blos)    # trim whitespace from front/back of each line
  blossc <- gsub ("\\s+", ",", bloss)  # replace other spacing in lines with commas
  blossMat <- strsplit (blossc, ",")    # split the lines in turn by those commas (now have a list of vectors, one vector per line)
  blossHeader <- blossMat[[1]]  # first row may be the amino acid abbreviations, copy current state for later

  # get rid of the first 'leftCut' items in each line vector (usually 1 for the AA letter)
  if (is.numeric(leftCut) && (leftCut > 0)) {
    colCut <- c(1,leftCut)
    blossMat <- lapply(blossMat, function(s) s[-colCut])
  }

  # get rid of the first 'topCut' items in the toplevel list (usually a header of AA abbreviations)
  if (is.numeric(topCut) && (topCut > 0)) {
    rowCut <- c(1,topCut)
    blossMat <- blossMat [-rowCut]
  }

  # turn values from strings into integers, non-numbers become nulls
  blossMatNum <- lapply(blossMat, strtoi)
  # collapse header row then remove numbers to make ordered alphabet, if no header row alphabet will be empty string
  blossAlphabet <- gsub("\\d", "", paste(blossHeader, collapse=""))
  # combine matrix and alphabet into one object
  blossObj <- list(alphabetInOrder=blossAlphabet, scoreMatrix=blossMatNum)

  blossJSON <- toJSON (blossObj) # turn it into a json object
  writeLines (blossJSON, outputFilename, useBytes=T) # write it to a json file

  blossObj
}

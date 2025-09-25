# '~' is home directory, specifically user/MyDocuments on Windows 7/8
fullCompareDistanceRun <- function (dataDir = "~",
                                    json_file1 = "distances.json",
                                    json_file2 = "newDistances.json") {
  d <- compareDistanceJSONs (dataDir, json_file1, json_file2);
  h <- drawHistogram(d);
  h
}


compareDistanceJSONs <- function (dataDir = "~",
                                  json_file1 = "distances.json",
                                  json_file2 = "newDistances.json") {
  require("rjson")

  setwd (dataDir)
  json_data1 <- fromJSON(paste(readLines(json_file1), collapse=""))
  json_data2 <- fromJSON(paste(readLines(json_file2), collapse=""))

  deltaVals <- lapply (seq_along(json_data1), function (rindex) {
    row1 <- json_data1[[rindex]];
    row2 <- json_data2[[rindex]];

    # rowLength *- 1* as cell (m,n) seems to contain some other info in json1 rather
    # than the expected 0 distance
    rowLength = length(row1) - 1;
    #print (rowLength);
    if (rowLength > 0) {
      rowVals <- lapply (seq_len(rowLength), function (cindex) {
        #print (cindex);
        s1 <- row1[[cindex]];
        s2 <- row2[[cindex]];
        v1 = as.numeric(s1);
        v2 = as.numeric(s2);
        if (is.null (s1) || is.null(s2) || is.na(v1) || is.na(v2)) {
          diff <- NULL
        } else {
          diff <- abs (v1 - v2)
        }
      })

      # remove nulls from row list
      rowVals <- rowVals[!sapply(rowVals,is.null)];
    } else {
      rowVals <- list();
    }

    rowVals
  })

  oneDeltaList <- unlist (deltaVals);
  oneDeltaArr <- unlist (oneDeltaList)
  list("deltaArray" = oneDeltaArr,
       "mean" = mean(oneDeltaArr),
       "median" = median(oneDeltaArr),
       "max" = max(oneDeltaArr)
  );
}

drawHistogram <- function (distanceDeltas) {
  h<-hist(distanceDeltas$deltaArray, breaks=20, col="lightblue",
          border="blue",
          xlab="Distance Delta",
          ylab="Count",
          labels=TRUE,
          main="Distance Matrix Comparison Histogram")

  list("histogram" = h, "distanceDeltas" = distanceDeltas);
}

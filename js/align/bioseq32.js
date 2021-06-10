/**************************
 *** Common data tables ***
 **************************/

// https://github.com/lh3/bioseq-js

var cani8 = typeof Int8Array !== "undefined";

var intBitMap = [];
for (var n = 0; n <= 8; n++) {
    intBitMap[n] = Int8Array;
}
for (var n = 9; n <= 16; n++) {
    intBitMap[n] = Int16Array;
}
for (var n = 17; n <= 32; n++) {
    intBitMap[n] = Int32Array;
}

function makeIntArray(length, bitSize, fillValue) {
    //bitSize = Math.max (bitSize || 32, 32);
    //var arr = (cani8 ? new intBitMap[bitSize](length) : []);

    var arr = (cani8 ?
        ((bitSize > 16) ? new Int32Array(length) :
            (bitSize <= 8 ? new Int8Array(length) : new Int16Array(length))) :
        []);

    if (!cani8 || (fillValue !== 0 && fillValue !== undefined)) {
        if (arr.fill) {
            arr.fill(fillValue);
        } else {
            for (var n = 0; n < length; n++) {
                arr[n] = fillValue;
            }
        }
    }

    return arr;
}

function makeAlphabetMap(str, defaultVal) {
    var lstr = str.toLowerCase();
    if (defaultVal === undefined) {
        defaultVal = lstr.indexOf("x") || str.length;
    }
    var aMap = makeIntArray(256, 8, defaultVal);

    for (var n = 0; n < str.length; n++) {
        aMap[str.charCodeAt(n)] = n;
        aMap[lstr.charCodeAt(n)] = n;
    }
    return aMap;
}


var bst_nt5 = makeAlphabetMap("ACGT", 4);


/* 
    Ala     A       Alanine
    Arg     R       Arginine
    Asn     N       Asparagine
    Asp     D       Aspartic acid (Aspartate)
    Cys     C       Cysteine
    Gln     Q       Glutamine
    Glu     E       Glutamic acid (Glutamate)
    Gly     G       Glycine
    His     H       Histidine
    Ile     I       Isoleucine
    Leu     L       Leucine
    Lys     K       Lysine
    Met     M       Methionine
    Phe     F       Phenylalanine
    Pro     P       Proline
    Ser     S       Serine
    Thr     T       Threonine
    Trp     W       Tryptophan
    Tyr     Y       Tyrosine
    Val     V       Valine
    Asx     B       Aspartic acid or Asparagine
    Glx     Z       Glutamine or Glutamic acid.
    Xaa     X       Any amino acid.
    TERM            termination codon

    not in alphabet : JOU
*/
var aminos = makeAlphabetMap("ARNDCQEGHILKMFPSTWYVBZX");

/*
    See R/blosumJsonise.R for details
    */

var Blosum80Map = {
    alphabetInOrder: "ARNDCQEGHILKMFPSTWYVBZX*",
    scoreMatrix: [
        [7, -3, -3, -3, -1, -2, -2, 0, -3, -3, -3, -1, -2, -4, -1, 2, 0, -5, -4, -1, -3, -2, -1, -8],
        [-3, 9, -1, -3, -6, 1, -1, -4, 0, -5, -4, 3, -3, -5, -3, -2, -2, -5, -4, -4, -2, 0, -2, -8],
        [-3, -1, 9, 2, -5, 0, -1, -1, 1, -6, -6, 0, -4, -6, -4, 1, 0, -7, -4, -5, 5, -1, -2, -8],
        [-3, -3, 2, 10, -7, -1, 2, -3, -2, -7, -7, -2, -6, -6, -3, -1, -2, -8, -6, -6, 6, 1, -3, -8],
        [-1, -6, -5, -7, 13, -5, -7, -6, -7, -2, -3, -6, -3, -4, -6, -2, -2, -5, -5, -2, -6, -7, -4, -8],
        [-2, 1, 0, -1, -5, 9, 3, -4, 1, -5, -4, 2, -1, -5, -3, -1, -1, -4, -3, -4, -1, 5, -2, -8],
        [-2, -1, -1, 2, -7, 3, 8, -4, 0, -6, -6, 1, -4, -6, -2, -1, -2, -6, -5, -4, 1, 6, -2, -8],
        [0, -4, -1, -3, -6, -4, -4, 9, -4, -7, -7, -3, -5, -6, -5, -1, -3, -6, -6, -6, -2, -4, -3, -8],
        [-3, 0, 1, -2, -7, 1, 0, -4, 12, -6, -5, -1, -4, -2, -4, -2, -3, -4, 3, -5, -1, 0, -2, -8],
        [-3, -5, -6, -7, -2, -5, -6, -7, -6, 7, 2, -5, 2, -1, -5, -4, -2, -5, -3, 4, -6, -6, -2, -8],
        [-3, -4, -6, -7, -3, -4, -6, -7, -5, 2, 6, -4, 3, 0, -5, -4, -3, -4, -2, 1, -7, -5, -2, -8],
        [-1, 3, 0, -2, -6, 2, 1, -3, -1, -5, -4, 8, -3, -5, -2, -1, -1, -6, -4, -4, -1, 1, -2, -8],
        [-2, -3, -4, -6, -3, -1, -4, -5, -4, 2, 3, -3, 9, 0, -4, -3, -1, -3, -3, 1, -5, -3, -2, -8],
        [-4, -5, -6, -6, -4, -5, -6, -6, -2, -1, 0, -5, 0, 10, -6, -4, -4, 0, 4, -2, -6, -6, -3, -8],
        [-1, -3, -4, -3, -6, -3, -2, -5, -4, -5, -5, -2, -4, -6, 12, -2, -3, -7, -6, -4, -4, -2, -3, -8],
        [2, -2, 1, -1, -2, -1, -1, -1, -2, -4, -4, -1, -3, -4, -2, 7, 2, -6, -3, -3, 0, -1, -1, -8],
        [0, -2, 0, -2, -2, -1, -2, -3, -3, -2, -3, -1, -1, -4, -3, 2, 8, -5, -3, 0, -1, -2, -1, -8],
        [-5, -5, -7, -8, -5, -4, -6, -6, -4, -5, -4, -6, -3, 0, -7, -6, -5, 16, 3, -5, -8, -5, -5, -8],
        [-4, -4, -4, -6, -5, -3, -5, -6, 3, -3, -2, -4, -3, 4, -6, -3, -3, 3, 11, -3, -5, -4, -3, -8],
        [-1, -4, -5, -6, -2, -4, -4, -6, -5, 4, 1, -4, 1, -2, -4, -3, 0, -5, -3, 7, -6, -4, -2, -8],
        [-3, -2, 5, 6, -6, -1, 1, -2, -1, -6, -7, -1, -5, -6, -4, 0, -1, -8, -5, -6, 6, 0, -3, -8],
        [-2, 0, -1, 1, -7, 5, 6, -4, 0, -6, -5, 1, -3, -6, -2, -1, -2, -5, -4, -4, 0, 6, -1, -8],
        [-1, -2, -2, -3, -4, -2, -2, -3, -2, -2, -2, -2, -2, -3, -3, -1, -1, -5, -3, -2, -3, -1, -2, -8],
        [-8, -8, -8, -8, -8, -8, -8, -8, -8, -8, -8, -8, -8, -8, -8, -8, -8, -8, -8, -8, -8, -8, -8, 1]
    ]
};


/************************
 *** Generic routines ***
 ************************/

/**
 * Encode a sequence string with table
 *
 * @param seq    sequence
 * @param table  encoding table; must be of size 256
 *
 * @return an integer array
 */

function bsg_enc_seq(seq, table) {
    if (table == null) return null;
    var s = makeIntArray(seq.length, 8);
    //s.length = seq.length;
    for (var i = 0; i < seq.length; ++i) {
        s[i] = table[seq.charCodeAt(i)];
    }
    return s;
}

/**************************
 *** Pairwise alignment ***
 **************************/

/*
 * The following implements local and global pairwise alignment with affine gap
 * penalties. There are two formulations: the Durbin formulation as is
 * described in his book and the Green formulation as is implemented in phrap.
 * The Durbin formulation is easier to understand, while the Green formulation
 * is simpler to code and probably faster in practice.
 *
 * The Durbin formulation is:
 *
 *   M(i,j) = max{M(i-1,j-1)+S(i,j), E(i-1,j-1), F(i-1,j-1)}
 *   E(i,j) = max{M(i-1,j)-q-r, F(i-1,j)-q-r, E(i-1,j)-r}
 *   F(i,j) = max{M(i,j-1)-q-r, F(i,j-1)-r, E(i,j-1)-q-r}
 *
 * where q is the gap open penalty, r the gap extension penalty and S(i,j) is
 * the score between the i-th residue in the row sequence and the j-th residue
 * in the column sequence. Note that the original Durbin formulation disallows
 * transitions between between E and F states, but we allow them here.
 *
 * In the Green formulation, we introduce:
 *
 *   H(i,j) = max{M(i,j), E(i,j), F(i,j)}
 *
 * The recursion becomes:
 *
 *   H(i,j) = max{H(i-1,j-1)+S(i,j), E(i,j), F(i,j)}
 *   E(i,j) = max{H(i-1,j)-q, E(i-1,j)} - r
 *   F(i,j) = max{H(i,j-1)-q, F(i,j-1)} - r
 *
 * It is in fact equivalent to the Durbin formulation. In implementation, we
 * calculate the scores in a different order:
 *
 *   H(i,j)   = max{H(i-1,j-1)+S(i,j), E(i,j), F(i,j)}
 *   E(i+1,j) = max{H(i,j)-q, E(i,j)} - r = max(h-gapoe, e-gape)
 *   F(i,j+1) = max{H(i,j)-q, F(i,j)} - r = max(h-gapoe, f-gape)
 *
 * i.e. at cell (i,j), we compute E for the next row and F for the next column.
 * Please see inline comments below for details.
 *
 *
 * The following implementation is ported from klib/ksw.c. The original C
 * implementation has a few bugs which have been fixed here. Like the C
 * version, this implementation should be very efficient. It could be made more
 * efficient if we use typed integer arrays such as Uint8Array. In addition,
 * I mixed the local and global alignments together. For performance,
 * it would be preferred to separate them out.
 */

/**
 * Generate scoring matrix from match/mismatch score
 *
 * @param n     size of the alphabet
 * @param a     match score, positive
 * @param b     mismatch score, negative
 *
 * @return square scoring matrix. The last row and column are zero, for
 * matching an ambiguous residue.
 */
function bsa_gen_score_matrix(n, a, b) {
    var m = [],
        mrow;
    b = -Math.abs(b); // mismatch score b should be non-positive
    for (var i = 0; i < n - 1; ++i) {
        mrow = m[i] = makeIntArray(n, 32);
        for (var j = 0; j < n - 1; ++j) {
            mrow[j] = i === j ? a : b;
        }
        mrow[j] = 0;
    }
    m[n - 1] = makeIntArray(n, 32, 0);
    //for (var j = 0; j < n; ++j) m[n-1][j] = 0;
    return m;
}

/**
 * Generate query profile (a preprocessing step)
 *
 * @param _s      sequence in string or post bsg_enc_seq()
 * @param _m      score matrix or [match,mismatch] array
 * @param table   encoding table; must be consistent with _s and _m
 *
 * @return query profile. It is a two-dimensional integer matrix.
 */
function bsa_gen_query_profile(_s, _m, table) {
    var s = typeof _s == 'string' ? bsg_enc_seq(_s, table) : _s;
    var qp = [],
        matrix;
    if (_m.length >= 2 && typeof _m[0] == 'number' && typeof _m[1] == 'number') { // match/mismatch score
        if (table == null) return null;
        var n = typeof table == 'number' ? table : table[table.length - 1] + 1;
        matrix = bsa_gen_score_matrix(n, _m[0], _m[1]);
        //console.log ("matrix", matrix);
    } else matrix = _m; // _m is already a matrix; FIXME: check if it is really a square matrix!
    var slen = s.length;
    for (var j = 0; j < matrix.length; ++j) {
        var qpj, mj = matrix[j];
        qpj = qp[j] = makeIntArray(slen, 32); //[];
        for (var i = 0; i < slen; ++i)
            qpj[i] = mj[s[i]];
    }
    return qp;
}

/**
 * Local or global pairwise alignemnt
 *
 * @param is_local  perform local alignment
 * @param target    target string
 * @param query     query string or query profile
 * @param matrix    square score matrix or [match,mismatch] array
 * @param gapsc     [gap_open,gap_ext] array; k-length gap costs gap_open+gap_ext*k
 * @param w         bandwidth, disabled by default
 * @param table     encoding table. It defaults to bst_nt5.
 *
 * @return [score,target_start,cigar]. cigar is encoded in the BAM way, where
 * higher 28 bits keeps the length and lower 4 bits the operation in order of
 * "MIDNSH". See bsa_cigar2str() for converting cigar to string.
 */
function bsa_align(is_local, is_semi_local, target, query, matrix, gapsc, w, table) {

    // convert bases to integers
    if (table == null) table = bst_nt5;
    var t = bsg_enc_seq(target, table);
    var qp = bsa_gen_query_profile(query, matrix, table);
    var qlen = qp[0].length;

    // adjust band width
    //console.log ("orig w", w);
    var max_len = Math.max(qlen, t.length);
    w = w == null || w < 0 ? max_len : w;
    var len_diff = Math.abs(t.length - qlen); // MJG - think t.target was a mistake, replace with t.length
    w = Math.max(w, len_diff); // mjg - dunno why this needs to be done, would just make w massive for small target and big query  
    //console.log ("w", w, qlen, t.length, len_diff);

    // set gap score
    var gapo, gape; // these are penalties which should be non-negative
    if (typeof gapsc == 'number') {
        gapo = 0, gape = Math.abs(gapsc);
    } else {
        gapo = Math.abs(gapsc[0]), gape = Math.abs(gapsc[1]);
    }
    var gapoe = gapo + gape; // penalty for opening the first gap

    // initial values
    var NEG_INF = -0x40000000;
    var H = []; //makeIntArray (qlen+1, 32, is_local ? 0 : undefined); // [];
    var E = []; //makeIntArray (qlen+1, 32, is_local ? 0 : undefined); // [];
    var C = []; // holds last column scores, added by mjg for semi-global alignment
    var z = [],
        score, max = 0,
        end_i = -1,
        end_j = -1;
    if (is_local || is_semi_local) {
        for (var j = 0; j <= qlen; ++j) H[j] = E[j] = 0;
    } else {
        H[0] = 0;
        E[0] = -gapoe - gapoe;
        for (var j = 1; j <= qlen; ++j) {
            if (j >= w) H[j] = E[j] = NEG_INF; // everything is -inf outside the band
            else H[j] = -(gapo + gape * j), E[j] = E[j - 1] - gape;
        }
    }

    // the DP loop
    for (var i = 0; i < t.length; ++i) {
        var h1 = 0,
            f = 0,
            m = 0,
            mj = -1;
        var zi, qpi = qp[t[i]];
        var beg = Math.max(i - w, 0);
        var end = Math.min(i + w + 1, qlen); // only loop through [beg,end) of the query sequence
        if (!is_local) {
            // changed so don't have to penalise a start gap (is_semi_local) (hopefully)
            h1 = beg > 0 ? NEG_INF : (is_semi_local ? 0 : -gapoe - gape * i);
            f = beg > 0 ? NEG_INF : (is_semi_local ? 0 : -gapoe - gapoe - gape * i);
        }
        //zi = z[i] = makeIntArray (qlen, 32) ;//[];
        zi = z[i] = makeIntArray(end - beg + 1, 32); // MJG - crucial end-beg not qlen or end

        for (var j = beg; j < end; ++j) {
            // At the beginning of the loop: h=H[j]=H(i-1,j-1), e=E[j]=E(i,j), f=F(i,j) and h1=H(i,j-1)
            // If we only want to compute the max score, delete all lines involving direction "d".
            var e = E[j],
                h = H[j],
                d = 0;
            H[j] = h1; // set H(i,j-1) for the next row
            h += qpi[j]; // h = H(i-1,j-1) + S(i,j) // match or not score
            //  http://jsperf.com/two-ternary-versus-one-if

            if (h <= e) {
                d = 1;
                h = e;
            }
            if (h <= f) {
                d = 2;
                h = f;
            }

            // now h = H(i,j) = max{H(i-1,j-1)+S(i,j), E(i,j), F(i,j)}
            d = !is_local || h > 0 ? d : 64;
            h1 = h; // save H(i,j) to h1 for the next column
            if (h >= m) {
                mj = j;
                mj = j;
                m = h; // update the max score in this row
            }

            h -= (j === end - 1 && is_semi_local ? 0 : gapoe); // gaps don't matter after last query character in semi_local alignment
            h = !is_local || h > 0 ? h : 0;

            // E(i+1,j) = max{H(i,j)-q, E(i,j)} - r
            e -= gape;
            if (e > h) { // e = E(i+1,j)
                d |= 4; // can replace |= with += since only powers of two are ever previously set
            } else {
                e = h;
            }
            E[j] = e; // save E(i+1,j) for the next row

            // F(i,j+1) = max{H(i,j)-q, F(i,j)} - r
            f -= gape;
            if (f > h) { // f = F(i,j+1)
                d |= 32;
            } else {
                f = h;
            }
            zi[j - beg] = d; // z[i,j] keeps h for the current cell and e/f for the next cell // MJG: j-beg -- crucial
        }
        C[i] = h1; // mjg. keep last scores in each row (forms last column of scores)
        H[end] = h1, E[end] = is_local ? 0 : NEG_INF;
        if (m > max) max = m, end_i = i, end_j = mj;
    }
    //if (is_local && max === 0) return null;
    score = is_local ? max : H[H.length - 1]; // H[qlen];

    //console.log ("\H", H.length, indexOfMax(H), "\nC", C.length, indexOfMax(C));

    // backtrack to recover the alignment/cigar
    function push_cigar(ci, op, len) {
        if (ci.length === 0 || op != (ci[ci.length - 1] & 0xf))
            ci.push(len << 4 | op);
        else ci[ci.length - 1] += len << 4;
    }

    var cigar = [],
        tmp, which = 0,
        i, k, start_i = 0;
    if (is_local) {
        i = end_i;
        k = end_j;
        if (end_j != qlen - 1) // then add soft clipping
            push_cigar(cigar, 4, qlen - 1 - end_j);
    } else if (is_semi_local) { // mjg
        var qlonger = (t.length < qlen);
        var hmax = indexOfMax(H);
        var cmax = indexOfMax(C);
        i = qlonger ? t.length - 1 : cmax.index;
        var roff = (Math.max(0, qlen - w) + (qlonger ? hmax.index : w));
        var trailIndelCount = qlonger ? H.length - roff - 1 : C.length - cmax.index - 1;
        if (trailIndelCount > 0) { // add the trailing info of the longer sequence to the cigar
            push_cigar(cigar, qlonger ? 1 : 2, trailIndelCount);
        }
        //console.log ("r", roff, qlen, i, qlonger, w, trailIndelCount);
        k = (roff < qlen ? roff : qlen) - 1;
    } else {
        i = t.length - 1;
        var roff = i + w - 1;
        k = (roff < qlen ? roff : qlen) - 1; // (i,k) points to the last cell
    }

    while (i >= 0 && k >= 0) {
        tmp = z[i][k - (i > w ? i - w : 0)];
        which = tmp >> (which << 1) & 3;
        if (which === 0 && tmp >> 6) break;
        if (which === 0) which = tmp & 3;
        if (which === 0) {
            push_cigar(cigar, 0, 1);
            --i;
            --k;
        } // match
        else if (which === 1) {
            push_cigar(cigar, 2, 1);
            --i;
        } // deletion
        else {
            push_cigar(cigar, 1, 1);
            --k;
        } // insertion
    }
    if (is_local) {
        if (k >= 0) push_cigar(cigar, 4, k + 1); // add soft clipping
        start_i = i + 1;
    } else { // add the first insertion or deletion
        if (i >= 0) push_cigar(cigar, 2, i + 1);
        if (k >= 0) push_cigar(cigar, 1, k + 1);
    }
    cigar.reverse();

    return [score, start_i, cigar];
}

function indexOfMax(arr) { // mjg
    var max = -0x40000000;
    var index = arr.length;
    for (var n = arr.length; --n >= 0;) {
        if (arr[n] > max) {
            max = arr[n];
            index = n;
        }
    }
    return {
        index: index,
        max: max
    };
}

function bsa_cigar2gaps(target, query, start, cigar) {
    var oq = '',
        ot = '',
        lq = 0,
        lt = start;
    for (var k = 0; k < cigar.length; ++k) {
        var op = cigar[k] & 0xf,
            len = cigar[k] >> 4;
        if (op === 0) { // match
            oq += query.substr(lq, len);
            ot += target.substr(lt, len);
            lq += len;
            lt += len;
        } else if (op == 1) { // insertion
            oq += query.substr(lq, len);
            ot += Array(len + 1).join("-");
            lq += len;
        } else if (op == 2) { // deletion
            oq += Array(len + 1).join("-");
            ot += target.substr(lt, len);
            lt += len;
        } else if (op == 4) { // soft clip
            lq += len;
        }
    }
    return [oq, ot];
}

function bsa_cigar2indexArrays(target, query, start, cigar) {
    var oq = [],
        ot = [],
        lq = 0,
        lt = start,
        qi = 0,
        qt = 0;
    for (var k = 0; k < cigar.length; ++k) {
        var op = cigar[k] & 0xf,
            len = cigar[k] >> 4;
        if (op === 0) { // match
            //oq += query.substr(lq, len);
            //ot += target.substr(lt, len);
            lq += len;
            lt += len;
            for (var n = 0; n < len; n++) {
                oq[qi] = qt;
                ot[qt] = qi;
                qt++;
                qi++;
            }
        } else if (op == 1) { // insertion
            //oq += query.substr(lq, len);
            //ot += Array(len+1).join("-");
            lq += len;
            for (var n = 0; n < len; n++) {
                oq[qi] = -qt - 1; // neg so we know it's an inbetween match
                qi++;
            }
        } else if (op == 2) { // deletion
            //oq += Array(len+1).join("-");
            //ot += target.substr(lt, len);
            lt += len;
            for (var n = 0; n < len; n++) {
                ot[qt] = -qi - 1; // neg so we know it's an inbetween match
                qt++;
            }
        } else if (op == 4) { // soft clip
            lq += len;
            for (var n = 0; n < len; n++) {
                ot[qt] = qi;
                qt++;
            }
        }
    }
    return {
        qToTarget: oq,
        tToQuery: ot
    };
}

function bsa_cigar2str(cigar) {
    var s = [];
    for (var k = 0; k < cigar.length; ++k)
        s.push((cigar[k] >> 4).toString() + "MIDNSHP=XB".charAt(cigar[k] & 0xf));
    return s.join("");
}

function arrayMax(arr) {
    var max = arr.reduce(function(a, b) {
        return Math.max(a, b);
    });
    return max;
}

function align (query, target, myScores, isLocal, isSemiLocal, windowSize) {
    var target = target || 'ATAGCTAGCTAGCATAAGC';
    var query  = query || 'AGCTAcCGCAT';
    var isLocal = isLocal || false;
    var defaults = {match: 1, mis: -1, gapOpen: -1, gapExt: -1};
    var scores = myScores || {};
    Object.keys(scores).forEach (function (key) {
        defaults[key] = scores[key];
    });
    scores = defaults;
    //var scores = _.extend ({match: 1, mis: -1, gapOpen: -1, gapExt: -1}, scores || {});
    var matrix = scores.matrix || Blosum80Map;

    var rst;
    var table = matrix ? makeAlphabetMap (matrix.alphabetInOrder) : aminos;
    if (target === query) {
        var maxValues = matrix.scoreMatrix.map (function (row) { return arrayMax (row); });
        var score = 0;
        for (var n = 0; n < target.length; n++) {
            score += maxValues[table[target.charCodeAt(n)]];
        }
        rst = [score, 0, [target.length << 4]];  // completely equal
    } else {
        rst = bsa_align (isLocal, isSemiLocal, target, query, matrix.scoreMatrix || [scores.match,scores.mis], [scores.gapOpen,scores.gapExt], windowSize, table);
    }
    var cigarString = bsa_cigar2str(rst[2]);
    var str = 'score='+rst[0]+'; pos='+rst[1]+'; cigar='+cigarString+"\n";
    var fmt = bsa_cigar2gaps (target, query, rst[1], rst[2]);
    var indx = bsa_cigar2indexArrays (target, query, rst[1], rst[2]);
    var alignment = {res: rst, fmt: fmt, str: str, indx: indx, cigar: cigarString};
    //console.log ("ALIGNMENT", alignment);
    return alignment;
}

if (typeof module == 'object') {
    module.exports = combine;
} else {
    this.CLMSUI = this.CLMSUI || {};
    this.CLMSUI.GotohAligner = {
        align: align
    };
}

function combine() {
    return align.apply(this, arguments);
}
/*
    function main() {
      if (process.argv.length < 3) {
        return;
      }
        var ret = combine (process.argv.slice(2));
        console.log ("str", ret.str, "\nfmt", ret.fmt);
    }
    
    
    
    if (process.argv[1] == __filename) {
      main();
    }
    */
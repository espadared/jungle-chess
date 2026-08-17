/* Jungle (Dou Shou Qi) rules engine.
 *
 * Loaded by the page, by the AI web worker, and by nothing else - it has no
 * DOM dependencies on purpose.  Board is a flat 63-cell array, row 0 at the
 * top (Black's back rank), row 8 at the bottom (Red's back rank).
 *
 *   index = row * 7 + col        col a..g = 0..6, printed rank = 9 - row
 *   board[i] > 0  -> Red piece   (side 0, plays up the board)
 *   board[i] < 0  -> Black piece (side 1, plays down the board)
 *   |board[i]|    -> rank, 1 rat ... 8 elephant
 */
(function (root) {
  'use strict';

  var ROWS = 9, COLS = 7, N = 63;

  var RAT = 1, CAT = 2, DOG = 3, WOLF = 4, LEOPARD = 5, TIGER = 6, LION = 7, ELEPHANT = 8;

  var NAMES = ['', 'Rat', 'Cat', 'Dog', 'Wolf', 'Leopard', 'Tiger', 'Lion', 'Elephant'];
  var EMOJI = ['', '🐁', '🐈', '🐕', '🐺',
               '🐆', '🐅', '🦁', '🐘'];

  // --- terrain ---------------------------------------------------------
  var WATER = new Uint8Array(N);
  [22, 23, 25, 26, 29, 30, 32, 33, 36, 37, 39, 40].forEach(function (i) { WATER[i] = 1; });

  // TRAP[i] = the side that OWNS this trap (it sits in front of their den).
  var TRAP = new Int8Array(N); TRAP.fill(-1);
  [2, 4, 10].forEach(function (i) { TRAP[i] = 1; });     // Black's own traps
  [52, 58, 60].forEach(function (i) { TRAP[i] = 0; });   // Red's own traps

  var DEN = new Int8Array(N); DEN.fill(-1);
  DEN[3] = 1;    // Black's den
  DEN[59] = 0;   // Red's den

  // --- neighbours and river jumps --------------------------------------
  var NEI = [];
  var JUMP = [];
  (function buildGeometry() {
    var steps = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (var i = 0; i < N; i++) {
      var r = (i / COLS) | 0, c = i % COLS;
      var n = [], j = [];
      for (var d = 0; d < 4; d++) {
        var rr = r + steps[d][0], cc = c + steps[d][1];
        if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
        n.push(rr * COLS + cc);

        // A lion or tiger standing next to water leaps straight across it.
        if (WATER[rr * COLS + cc]) {
          var over = [], pr = rr, pc = cc;
          while (pr >= 0 && pr < ROWS && pc >= 0 && pc < COLS && WATER[pr * COLS + pc]) {
            over.push(pr * COLS + pc);
            pr += steps[d][0];
            pc += steps[d][1];
          }
          if (pr >= 0 && pr < ROWS && pc >= 0 && pc < COLS) {
            j.push({ to: pr * COLS + pc, over: over });
          }
        }
      }
      NEI.push(n);
      JUMP.push(j);
    }
  })();

  // --- zobrist hashing (two 32-bit halves) -----------------------------
  var ZH = new Int32Array(16 * N), ZL = new Int32Array(16 * N);
  var TURN_HI, TURN_LO;
  (function buildKeys() {
    // Deterministic PRNG so both players and the AI agree on every hash.
    var s = 0x2f6e2b1;
    function rnd() {
      s ^= s << 13; s |= 0;
      s ^= s >>> 17;
      s ^= s << 5; s |= 0;
      return s | 0;
    }
    for (var i = 0; i < 16 * N; i++) { ZH[i] = rnd(); ZL[i] = rnd(); }
    TURN_HI = rnd(); TURN_LO = rnd();
  })();

  function pieceKey(p) { return (p > 0 ? p - 1 : 8 + (-p) - 1) * N; }

  // --- state -----------------------------------------------------------
  var START = (function () {
    var b = new Int8Array(N);
    b[56] = TIGER;  b[62] = LION;  b[50] = CAT;  b[54] = DOG;
    b[42] = ELEPHANT; b[44] = WOLF; b[46] = LEOPARD; b[48] = RAT;
    b[0] = -LION;   b[6] = -TIGER; b[8] = -DOG;  b[12] = -CAT;
    b[14] = -RAT;   b[16] = -LEOPARD; b[18] = -WOLF; b[20] = -ELEPHANT;
    return b;
  })();

  function newState(variant) {
    var st = {
      board: new Int8Array(START),
      turn: 0,
      variant: variant || 'classic',
      half: 0,           // plies since the last capture
      winner: -1,
      draw: null,
      hi: 0, lo: 0,
      keysHi: [], keysLo: [],
      undo: []
    };
    rehash(st);
    st.keysHi.push(st.hi); st.keysLo.push(st.lo);
    return st;
  }

  function rehash(st) {
    var hi = 0, lo = 0;
    for (var i = 0; i < N; i++) {
      var p = st.board[i];
      if (p !== 0) { var k = pieceKey(p) + i; hi ^= ZH[k]; lo ^= ZL[k]; }
    }
    if (st.turn === 1) { hi ^= TURN_HI; lo ^= TURN_LO; }
    st.hi = hi | 0; st.lo = lo | 0;
  }

  function clone(st) {
    return {
      board: new Int8Array(st.board),
      turn: st.turn,
      variant: st.variant,
      half: st.half,
      winner: st.winner,
      draw: st.draw,
      hi: st.hi, lo: st.lo,
      keysHi: st.keysHi.slice(),
      keysLo: st.keysLo.slice(),
      undo: []
    };
  }

  // --- move encoding ---------------------------------------------------
  // from (6 bits) | to (6 bits) | captured piece + 8 (5 bits)
  function mkMove(from, to, cap) { return from | (to << 6) | ((cap + 8) << 12); }
  function mFrom(m) { return m & 63; }
  function mTo(m) { return (m >> 6) & 63; }
  function mCap(m) { return ((m >> 12) & 31) - 8; }

  // --- capture legality -------------------------------------------------
  function canCapture(variant, attacker, from, to, target) {
    if (target === 0) return true;
    var aSide = attacker > 0 ? 0 : 1;
    if ((target > 0 ? 0 : 1) === aSide) return false;

    // Nobody reaches across the shoreline: a rat in the river cannot touch a
    // piece on land, and no land piece can touch a rat in the river.
    if (WATER[from] !== WATER[to]) return false;

    var trap = TRAP[to];
    if (variant === 'open') {
      // Variation 1: standing on ANY trap makes you fair game for anyone.
      if (trap !== -1) return true;
    } else if (variant === 'safe') {
      // Variation 2: standing on ANY trap makes you untouchable.
      if (trap !== -1) return false;
    } else if (variant === 'home') {
      // Variation 2b: your own traps shelter you, the enemy's still strip rank.
      if (trap !== -1) return trap === aSide;
    } else {
      // Classic: only the opponent's traps strip your rank.
      if (trap === aSide) return true;
    }

    var ra = attacker > 0 ? attacker : -attacker;
    var rd = target > 0 ? target : -target;
    if (ra === RAT && rd === ELEPHANT) return true;    // the rat in the ear
    if (ra === ELEPHANT && rd === RAT) return false;
    return ra >= rd;
  }

  // --- move generation --------------------------------------------------
  function genMoves(st, out) {
    var b = st.board, side = st.turn, variant = st.variant;
    out.length = 0;
    for (var from = 0; from < N; from++) {
      var p = b[from];
      if (p === 0 || (p > 0 ? 0 : 1) !== side) continue;
      var rank = p > 0 ? p : -p;

      var nb = NEI[from];
      for (var k = 0; k < nb.length; k++) {
        var to = nb[k];
        if (DEN[to] === side) continue;                  // never step into your own den
        if (WATER[to] && rank !== RAT) continue;          // only the rat swims
        var t = b[to];
        if (t !== 0) {
          if ((t > 0 ? 0 : 1) === side) continue;
          if (!canCapture(variant, p, from, to, t)) continue;
        }
        out.push(mkMove(from, to, t));
      }

      if (rank === LION || rank === TIGER) {
        var jl = JUMP[from];
        for (var q = 0; q < jl.length; q++) {
          var over = jl[q].over, blocked = false;
          for (var w = 0; w < over.length; w++) {
            if (b[over[w]] !== 0) { blocked = true; break; }  // a rat in the way stops the leap
          }
          if (blocked) continue;
          var jto = jl[q].to;
          if (DEN[jto] === side) continue;
          var jt = b[jto];
          if (jt !== 0) {
            if ((jt > 0 ? 0 : 1) === side) continue;
            if (!canCapture(variant, p, from, jto, jt)) continue;
          }
          out.push(mkMove(from, jto, jt));
        }
      }
    }
    return out;
  }

  function movesFrom(st, from) {
    var all = genMoves(st, []), out = [];
    for (var i = 0; i < all.length; i++) if (mFrom(all[i]) === from) out.push(all[i]);
    return out;
  }

  // --- make / unmake ----------------------------------------------------
  function hasPieces(st, side) {
    for (var i = 0; i < N; i++) {
      var p = st.board[i];
      if (p !== 0 && (p > 0 ? 0 : 1) === side) return true;
    }
    return false;
  }

  function repetitions(st) {
    var n = st.keysHi.length, hi = st.hi, lo = st.lo, count = 0;
    var stop = Math.max(0, n - 1 - st.half);
    for (var i = n - 1; i >= stop; i -= 2) {
      if (st.keysHi[i] === hi && st.keysLo[i] === lo) count++;
    }
    return count;
  }

  function applyMove(st, mv) {
    var from = mFrom(mv), to = mTo(mv), cap = mCap(mv);
    var p = st.board[from];
    st.undo.push({ mv: mv, hi: st.hi, lo: st.lo, half: st.half, winner: st.winner, draw: st.draw });

    if (cap !== 0) { var ck = pieceKey(cap) + to; st.hi ^= ZH[ck]; st.lo ^= ZL[ck]; }
    var kf = pieceKey(p) + from, kt = pieceKey(p) + to;
    st.hi ^= ZH[kf] ^ ZH[kt];
    st.lo ^= ZL[kf] ^ ZL[kt];
    st.hi ^= TURN_HI; st.lo ^= TURN_LO;

    st.board[from] = 0;
    st.board[to] = p;
    st.half = cap !== 0 ? 0 : st.half + 1;
    var mover = st.turn;
    st.turn ^= 1;
    st.keysHi.push(st.hi); st.keysLo.push(st.lo);

    if (DEN[to] === (mover ^ 1)) st.winner = mover;            // walked into the den
    else if (!hasPieces(st, mover ^ 1)) st.winner = mover;      // wiped the board
    else if (repetitions(st) >= 3) st.draw = 'repetition';
    else if (st.half >= 100) st.draw = 'quiet';
    return st;
  }

  function undoMove(st) {
    var u = st.undo.pop();
    if (!u) return st;
    var from = mFrom(u.mv), to = mTo(u.mv), cap = mCap(u.mv);
    st.board[from] = st.board[to];
    st.board[to] = cap;
    st.turn ^= 1;
    st.hi = u.hi; st.lo = u.lo;
    st.half = u.half;
    st.winner = u.winner;
    st.draw = u.draw;
    st.keysHi.pop(); st.keysLo.pop();
    return st;
  }

  // --- game status ------------------------------------------------------
  // Returns null while the game is live, otherwise {winner: 0|1|-1, reason}.
  function outcome(st) {
    if (st.winner !== -1) {
      var reason = hasPieces(st, st.winner ^ 1) ? 'den' : 'captured';
      return { winner: st.winner, reason: reason };
    }
    if (st.draw) return { winner: -1, reason: st.draw };
    if (genMoves(st, []).length === 0) return { winner: st.turn ^ 1, reason: 'stuck' };
    return null;
  }

  // --- helpers for the UI ----------------------------------------------
  function coordName(i) {
    return 'abcdefg'[i % COLS] + (ROWS - ((i / COLS) | 0));
  }

  function moveText(st, mv) {
    var p = st.board[mFrom(mv)];
    var cap = mCap(mv);
    var s = EMOJI[p > 0 ? p : -p] + ' ' + coordName(mFrom(mv)) +
            (cap !== 0 ? ' x ' : '-') + coordName(mTo(mv));
    if (cap !== 0) s += ' ' + EMOJI[cap > 0 ? cap : -cap];
    return s;
  }

  function boardToArray(st) { return Array.prototype.slice.call(st.board); }

  function stateFromArray(arr, turn, variant, half) {
    var st = newState(variant);
    st.board = new Int8Array(arr);
    st.turn = turn;
    st.half = half || 0;
    st.keysHi = []; st.keysLo = [];
    rehash(st);
    st.keysHi.push(st.hi); st.keysLo.push(st.lo);
    return st;
  }

  root.Jungle = {
    ROWS: ROWS, COLS: COLS, N: N,
    RAT: RAT, CAT: CAT, DOG: DOG, WOLF: WOLF,
    LEOPARD: LEOPARD, TIGER: TIGER, LION: LION, ELEPHANT: ELEPHANT,
    NAMES: NAMES, EMOJI: EMOJI,
    WATER: WATER, TRAP: TRAP, DEN: DEN, NEI: NEI, JUMP: JUMP,
    newState: newState, clone: clone, rehash: rehash,
    mkMove: mkMove, mFrom: mFrom, mTo: mTo, mCap: mCap,
    genMoves: genMoves, movesFrom: movesFrom, canCapture: canCapture,
    applyMove: applyMove, undoMove: undoMove,
    outcome: outcome, hasPieces: hasPieces, repetitions: repetitions,
    coordName: coordName, moveText: moveText,
    boardToArray: boardToArray, stateFromArray: stateFromArray
  };
})(typeof self !== 'undefined' ? self : this);

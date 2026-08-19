/* The computer opponent.
 *
 * Runs inside a web worker so the board stays responsive while it thinks.
 * Nothing here talks to the server - all the thinking happens on the device
 * of whoever is playing, which is why the free hosting plan is enough.
 *
 * Search: negamax + alpha-beta, iterative deepening, transposition table,
 * killer/history move ordering, late move reductions and a capture-only
 * quiescence search so it does not stop counting in the middle of a trade.
 */
(function (root) {
  'use strict';

  if (typeof importScripts === 'function' && !root.Jungle) importScripts('rules.js');
  var J = root.Jungle;

  var N = 63, MATE = 100000, MATE_THRESH = 99000, MAXPLY = 64;
  var WATER = J.WATER, TRAP = J.TRAP, DEN = J.DEN;

  // rank ->        rat  cat  dog  wolf leo  tiger lion eleph
  var VAL = [0, 560, 240, 340, 440, 600, 800, 900, 1000];
  // movement class: 0 walks on land, 1 walks and leaps the river, 2 swims
  var CLS = [0, 2, 0, 0, 0, 0, 1, 1, 0];

  // How much a piece being N steps from the enemy den is worth.
  var DENB = [0, 300, 170, 100, 62, 40, 26, 17, 11, 8, 5, 4, 3, 2, 1, 1, 0, 0, 0, 0, 0];

  // --- how far every square is from each den, per movement class --------
  var DIST = [[], [], []];
  (function buildDistanceMaps() {
    for (var cls = 0; cls < 3; cls++) {
      for (var den = 0; den < 2; den++) {
        var target = den === 0 ? 59 : 3;
        var d = new Int8Array(N); d.fill(40);
        var queue = [target]; d[target] = 0;
        for (var head = 0; head < queue.length; head++) {
          var i = queue[head], nd = d[i] + 1, k, to;
          var nb = J.NEI[i];
          for (k = 0; k < nb.length; k++) {
            to = nb[k];
            if (cls !== 2 && WATER[to]) continue;   // only the rat gets wet
            if (d[to] > nd) { d[to] = nd; queue.push(to); }
          }
          if (cls === 1) {
            var jl = J.JUMP[i];
            for (k = 0; k < jl.length; k++) {
              to = jl[k].to;
              if (d[to] > nd) { d[to] = nd; queue.push(to); }
            }
          }
        }
        DIST[cls][den] = d;
      }
    }
  })();

  // --- evaluation (always from Red's point of view) ---------------------
  function evaluate(st) {
    var b = st.board, variant = st.variant, score = 0;
    var best = [40, 40], defenders = [0, 0];

    for (var i = 0; i < N; i++) {
      var p = b[i];
      if (p === 0) continue;
      var s = p > 0 ? 0 : 1;
      var r = p > 0 ? p : -p;
      var cls = CLS[r], v = VAL[r];
      var sign = s === 0 ? 1 : -1;

      score += sign * v;

      var d = DIST[cls][1 - s][i];
      if (d < best[s]) best[s] = d;
      if (DIST[cls][s][i] <= 2) defenders[s]++;
      score += sign * (20 - (d < 20 ? d : 20)) * 3;      // general forward pressure

      if (TRAP[i] !== -1) {
        var t;
        if (variant === 'safe') t = TRAP[i] === s ? 25 : 90;        // untouchable outpost
        else if (variant === 'home') t = TRAP[i] === s ? 30 : -(v >> 2);
        else if (variant === 'open') t = -((v / 3) | 0);            // every trap burns
        else t = TRAP[i] === s ? 0 : -(v >> 2);
        score += sign * t;
      }

      if (WATER[i]) score += sign * 12;                   // the rat likes the river
    }

    for (var side = 0; side < 2; side++) {
      var bd = best[side] < 20 ? best[side] : 20;
      var g = defenders[1 - side];
      var f = g === 0 ? 1.4 : g === 1 ? 0.8 : g === 2 ? 0.5 : 0.35;
      score += (side === 0 ? 1 : -1) * DENB[bd] * f;
    }

    return score | 0;
  }

  // --- transposition table ---------------------------------------------
  var TT_BITS = 20, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
  var ttHi = new Int32Array(TT_SIZE);
  var ttMove = new Int32Array(TT_SIZE);
  var ttScore = new Int32Array(TT_SIZE);
  var ttDepth = new Int8Array(TT_SIZE);
  var ttFlag = new Uint8Array(TT_SIZE);   // 0 empty, 1 exact, 2 upper, 3 lower

  var killers = new Int32Array(2 * MAXPLY);
  var history = new Int32Array(2 * N * N);

  var S = null, nodes = 0, deadline = 0, ABORT = { abort: true };
  var USE_TT = true, USE_LMR = true, USE_Q = true;   // debug switches

  function timeUp() { return Date.now() >= deadline; }

  // --- move ordering ----------------------------------------------------
  function scoreMove(mv, ttm, ply) {
    if (mv === ttm) return 1 << 28;
    var to = J.mTo(mv), cap = J.mCap(mv);
    if (DEN[to] === (S.turn ^ 1)) return (1 << 27);          // walking into the den ends it
    if (cap !== 0) {
      var victim = VAL[cap > 0 ? cap : -cap];
      var att = S.board[J.mFrom(mv)];
      return (1 << 26) + victim * 16 - VAL[att > 0 ? att : -att];
    }
    if (mv === killers[S.turn * MAXPLY + ply]) return (1 << 25);
    return history[(S.turn * N + J.mFrom(mv)) * N + to];
  }

  function pickBest(list, scores, from) {
    var bi = from;
    for (var i = from + 1; i < list.length; i++) if (scores[i] > scores[bi]) bi = i;
    if (bi !== from) {
      var m = list[bi]; list[bi] = list[from]; list[from] = m;
      var s = scores[bi]; scores[bi] = scores[from]; scores[from] = s;
    }
    return list[from];
  }

  // --- quiescence -------------------------------------------------------
  function qsearch(alpha, beta, ply) {
    if ((++nodes & 1023) === 0 && timeUp()) throw ABORT;
    if (S.winner !== -1) return -(MATE - ply);
    if (S.draw) return 0;

    // Fail-soft: report what this position is actually worth, never the alpha
    // we inherited - echoing that back reports a neighbour's score as our own.
    var best = S.turn === 0 ? evaluate(S) : -evaluate(S);
    if (best >= beta) return best;
    if (best > alpha) alpha = best;
    if (ply >= MAXPLY - 2) return best;

    var all = J.genMoves(S, []);
    var loud = [], scores = [];
    for (var i = 0; i < all.length; i++) {
      var mv = all[i];
      if (J.mCap(mv) === 0 && DEN[J.mTo(mv)] !== (S.turn ^ 1)) continue;
      loud.push(mv);
      scores.push(scoreMove(mv, 0, ply));
    }

    for (var k = 0; k < loud.length; k++) {
      var m = pickBest(loud, scores, k);
      J.applyMove(S, m);
      var sc = -qsearch(-beta, -alpha, ply + 1);
      J.undoMove(S);
      if (sc > best) best = sc;
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    return best;
  }

  // --- main search ------------------------------------------------------
  function nega(depth, alpha, beta, ply) {
    if ((++nodes & 1023) === 0 && timeUp()) throw ABORT;
    if (S.winner !== -1) return -(MATE - ply);
    if (S.draw) return 0;
    if (ply > 0 && J.repetitions(S) >= 2) return 0;       // shuffling gets you nothing
    if (depth <= 0) {
      return USE_Q ? qsearch(alpha, beta, ply)
                   : (S.turn === 0 ? evaluate(S) : -evaluate(S));
    }

    var idx = (S.lo >>> 0) & TT_MASK, ttm = 0;
    if (USE_TT && ttFlag[idx] !== 0 && ttHi[idx] === S.hi) {
      ttm = ttMove[idx];
      if (ply > 0 && ttDepth[idx] >= depth) {
        var ts = ttScore[idx];
        if (ts > MATE_THRESH) ts -= ply; else if (ts < -MATE_THRESH) ts += ply;
        var fl = ttFlag[idx];
        if (fl === 1) return ts;
        if (fl === 2 && ts <= alpha) return ts;
        if (fl === 3 && ts >= beta) return ts;
      }
    }

    var list = J.genMoves(S, []);
    if (list.length === 0) return -(MATE - ply);           // no move left = you lose

    var scores = new Array(list.length);
    for (var i = 0; i < list.length; i++) scores[i] = scoreMove(list[i], ttm, ply);

    var alphaOrig = alpha, bestMove = 0, best = -MATE * 2;

    for (var k = 0; k < list.length; k++) {
      var mv = pickBest(list, scores, k);
      var quiet = J.mCap(mv) === 0 && DEN[J.mTo(mv)] !== (S.turn ^ 1);
      var mover = S.turn;

      J.applyMove(S, mv);
      var sc;
      if (k === 0) {
        sc = -nega(depth - 1, -beta, -alpha, ply + 1);
      } else {
        // Late moves are unlikely to be best - look at them shallowly first.
        var red = (USE_LMR && quiet && depth >= 3 && k >= 4) ? (k >= 10 ? 2 : 1) : 0;
        sc = -nega(depth - 1 - red, -alpha - 1, -alpha, ply + 1);
        if (sc > alpha && (red > 0 || sc < beta)) {
          sc = -nega(depth - 1, -beta, -alpha, ply + 1);
        }
      }
      J.undoMove(S);

      if (sc > best) { best = sc; bestMove = mv; }
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) {
        if (quiet) {
          killers[mover * MAXPLY + ply] = mv;
          history[(mover * N + J.mFrom(mv)) * N + J.mTo(mv)] += depth * depth;
        }
        break;
      }
    }

    var store = best;
    if (store > MATE_THRESH) store += ply; else if (store < -MATE_THRESH) store -= ply;
    ttHi[idx] = S.hi;
    ttMove[idx] = bestMove;
    ttScore[idx] = store;
    ttDepth[idx] = depth;
    ttFlag[idx] = best <= alphaOrig ? 2 : best >= beta ? 3 : 1;
    return best;
  }

  // --- driver -----------------------------------------------------------
  // slack > 0 means "pick anything within this many points of best", which is
  // only safe when every root move was searched with a full window - so the
  // softer levels pay for exact root scores and the hard ones play the best move.
  var LEVELS = {
    easy:   { ms: 250,  maxDepth: 2,  blunder: 0.35, slack: 250 },
    normal: { ms: 800,  maxDepth: 6,  blunder: 0.08, slack: 90 },
    hard:   { ms: 2600, maxDepth: 16, blunder: 0,    slack: 0 },
    insane: { ms: 6500, maxDepth: 24, blunder: 0,    slack: 0 }
  };

  function think(payload, onInfo) {
    var level = LEVELS[payload.level] || LEVELS.hard;
    var ms = payload.ms || level.ms;
    var maxDepth = payload.maxDepth || level.maxDepth;
    USE_TT = !payload.noTT; USE_LMR = !payload.noLMR; USE_Q = !payload.noQ;
    S = J.stateFromArray(payload.board, payload.turn, payload.variant, payload.half);
    if (payload.keysHi && payload.keysHi.length) {
      S.keysHi = payload.keysHi.slice();
      S.keysLo = payload.keysLo.slice();
      S.keysHi[S.keysHi.length - 1] = S.hi;
      S.keysLo[S.keysLo.length - 1] = S.lo;
    }

    // The repetition ban binds the computer exactly as it binds the player.
    // Only the root needs filtering: deeper in the search a repeat already
    // scores as a draw, so it never builds a plan around one.
    var roots = J.legalMoves(S);
    // Shuffle so equally good moves are not always taken in board order - the
    // strong levels stay deterministic about strength, just not about ties.
    for (var sh = roots.length - 1; sh > 0; sh--) {
      var swap = (Math.random() * (sh + 1)) | 0;
      var tmp = roots[sh]; roots[sh] = roots[swap]; roots[swap] = tmp;
    }
    if (roots.length === 0) return { move: 0, score: 0, depth: 0, nodes: 0 };
    if (roots.length === 1) return { move: roots[0], score: 0, depth: 0, nodes: 0 };

    if (level.blunder > 0 && Math.random() < level.blunder) {
      return { move: roots[(Math.random() * roots.length) | 0], score: 0, depth: 0, nodes: 0 };
    }

    ttFlag.fill(0);
    killers.fill(0);
    for (var h = 0; h < history.length; h++) history[h] = (history[h] / 8) | 0;

    nodes = 0;
    deadline = Date.now() + ms;

    var bestMove = roots[0], bestScore = 0, reached = 0, rootScores = null;
    var alpha = -MATE * 2, beta = MATE * 2;

    for (var depth = 1; depth <= maxDepth; depth++) {
      var results = [];
      try {
        var list = roots.slice(), sc = new Array(list.length);
        for (var i = 0; i < list.length; i++) sc[i] = scoreMove(list[i], bestMove, 0);
        var a = alpha, localBest = -MATE * 2, localMove = 0;

        for (var k = 0; k < list.length; k++) {
          var mv = pickBest(list, sc, k);
          J.applyMove(S, mv);
          var v;
          if (k === 0 || level.slack > 0) v = -nega(depth - 1, -beta, -a, 1);
          else {
            v = -nega(depth - 1, -a - 1, -a, 1);
            if (v > a) v = -nega(depth - 1, -beta, -a, 1);
          }
          J.undoMove(S);
          results.push({ move: mv, score: v });
          if (v > localBest) { localBest = v; localMove = mv; }
          if (v > a) a = v;
        }

        bestMove = localMove;
        bestScore = localBest;
        rootScores = results;
        reached = depth;
        if (onInfo) onInfo({ depth: depth, score: bestScore, nodes: nodes });
        if (bestScore > MATE_THRESH || bestScore < -MATE_THRESH) break;  // decided
        if (timeUp()) break;
      } catch (e) {
        if (e !== ABORT) throw e;
        break;
      }
    }

    // A little spice at the softer levels so it does not replay one game.
    if (level.slack > 0 && rootScores) {
      var pool = rootScores.filter(function (r) { return r.score >= bestScore - level.slack; });
      if (pool.length > 1) bestMove = pool[(Math.random() * pool.length) | 0].move;
    }

    return { move: bestMove, score: bestScore, depth: reached, nodes: nodes, roots: rootScores };
  }

  root.JungleAI = { think: think, evaluate: evaluate, LEVELS: LEVELS, DIST: DIST, VAL: VAL };

  if (typeof importScripts === 'function') {
    root.onmessage = function (e) {
      var msg = e.data;
      if (msg.type !== 'go') return;
      var res = think(msg, function (info) {
        root.postMessage({ type: 'info', id: msg.id, depth: info.depth, score: info.score });
      });
      root.postMessage({
        type: 'move', id: msg.id, move: res.move,
        score: res.score, depth: res.depth, nodes: res.nodes
      });
    };
  }
})(typeof self !== 'undefined' ? self : this);

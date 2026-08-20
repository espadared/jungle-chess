/* Jungle - screen wiring, board drawing, and the online room plumbing.
 * The rules live in rules.js; the computer opponent lives in ai.js (a worker).
 */
(function () {
  'use strict';

  var J = window.Jungle;
  var $ = function (id) { return document.getElementById(id); };

  // ------------------------------------------------- language and markings
  var PACKS = window.JungleText.packs;
  var PIECE_SETS = window.JungleText.PIECE_SETS;
  var STUCK = window.JungleText.STUCK;

  function remember(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* private browsing */ }
  }
  function recall(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
  }

  var lang = recall('jungle-lang', (navigator.language || '').indexOf('zh') === 0 ? 'zh' : 'en');
  if (!PACKS[lang]) lang = 'en';

  // 'art' is the set drawn for this game - the only complete one, and the only
  // one that looks the same on every device.
  var STYLES = ['art', 'face', 'body', 'zh'];
  var pieceStyle = recall('jungle-pieces', 'art');
  if (STYLES.indexOf(pieceStyle) === -1) pieceStyle = 'art';

  // Look a phrase up, filling in {placeholders}.
  function T(key, vals) {
    var s = PACKS[lang][key];
    if (s === undefined) s = PACKS.en[key];
    if (s === undefined) return key;
    if (vals) {
      s = s.replace(/\{(\w+)\}/g, function (whole, name) {
        return vals[name] === undefined ? whole : vals[name];
      });
    }
    return s;
  }

  function glyph(rank) {
    return pieceStyle === 'art' ? '' : PIECE_SETS[pieceStyle][rank];
  }

  // Markup for one piece. The drawn set needs an <svg>, the others are text -
  // so every place a piece appears writes HTML rather than plain text.
  function glyphHTML(rank, style, cls) {
    style = style || pieceStyle;
    if (style === 'art') {
      return '<svg class="pc' + (cls ? ' ' + cls : '') + '" viewBox="0 0 64 64">' +
             '<use href="#pc' + rank + '"/></svg>';
    }
    return PIECE_SETS[style][rank];
  }

  var G = {
    mode: null,          // 'ai' | 'local' | 'online'
    variant: 'classic',
    level: 'hard',
    humanSide: 0,
    mySide: 0,
    flip: false,
    st: null,
    sel: -1,
    targets: [],
    blocked: [],         // squares this piece could reach but for the repetition rule
    notice: null,        // one-off explanation shown under the status line
    last: null,
    log: [],
    moves: [],           // every move of this game, for the look-back
    review: null,        // {ply, st, last} while looking back
    busy: false,
    resignedBy: null,    // side that gave up, when not playing online
    hint: null,
    worker: null,
    reqId: 0,
    online: null
  };

  // ---------------------------------------------------------------- worker
  function worker() {
    if (!G.worker) {
      G.worker = new Worker('/static/ai.js');
      G.worker.onmessage = function (e) {
        var m = e.data;
        if (m.id !== G.reqId) return;                 // a stale answer, ignore it
        if (m.type === 'info') {
          if (G.pendingKind === 'move') {
            $('subLine').textContent = T('status.depth', { n: m.depth });
          }
        } else if (m.type === 'move') {
          G.busy = false;
          if (G.pendingKind === 'move') onAIMove(m);
          else onHint(m);
        }
      };
    }
    return G.worker;
  }

  function ask(kind, level, ms) {
    G.busy = true;
    G.pendingKind = kind;
    G.reqId++;
    worker().postMessage({
      type: 'go', id: G.reqId,
      board: J.boardToArray(G.st), turn: G.st.turn,
      variant: G.st.variant, half: G.st.half,
      keysHi: G.st.keysHi, keysLo: G.st.keysLo,
      level: level, ms: ms
    });
  }

  function onAIMove(m) {
    $('subLine').textContent = '';
    if (!m.move || G.mode !== 'ai') return;
    doMove(m.move);
  }

  function onHint(m) {
    $('subLine').textContent = '';
    if (!m.move) return;
    G.hint = { from: J.mFrom(m.move), to: J.mTo(m.move) };
    render();
    setTimeout(function () { G.hint = null; render(); }, 2500);
  }

  // ---------------------------------------------------------------- board
  var cells = [];
  (function buildBoard() {
    var board = $('board');
    for (var d = 0; d < 63; d++) {
      var cell = document.createElement('div');
      cell.className = 'cell';
      cell.addEventListener('click', onTap);
      board.appendChild(cell);
      cells.push(cell);
    }
  })();

  function slotToIndex(d) { return G.flip ? 62 - d : d; }

  function render() {
    // While looking back over a finished game the board shows an old position,
    // so everything below reads from `st` rather than G.st directly.
    var st = G.review ? G.review.st : G.st;
    if (!st) return;
    var over = G.review ? null : outcomeNow();
    var sel = G.review ? -1 : G.sel;
    var targets = G.review ? [] : G.targets;
    var blocked = G.review ? [] : G.blocked;
    var last = G.review ? G.review.last : G.last;

    for (var d = 0; d < 63; d++) {
      var i = slotToIndex(d);
      var cell = cells[d];
      cell.dataset.idx = i;

      var cls = 'cell';
      if (((((i / 7) | 0) + (i % 7)) & 1) === 1) cls += ' alt';
      if (J.WATER[i]) cls += ' water';
      if (J.TRAP[i] !== -1) cls += ' trap';
      if (J.DEN[i] !== -1) cls += ' den';
      if (i === sel) cls += ' sel';
      if (last && (i === last.from || i === last.to)) cls += ' last';
      if (G.hint && i === G.hint.from) cls += ' hintfrom';
      if (G.hint && i === G.hint.to) cls += ' hintto';
      if (targets.indexOf(i) !== -1) cls += st.board[i] !== 0 ? ' take' : ' move';
      else if (blocked.indexOf(i) !== -1) cls += ' blocked';
      cell.className = cls;

      var p = st.board[i];
      var html = '';
      if (J.DEN[i] !== -1) html += '<span class="mark">🏠</span>';
      else if (J.TRAP[i] !== -1) html += '<span class="mark">⚠️</span>';
      if (p !== 0) {
        var side = p > 0 ? 0 : 1, rank = p > 0 ? p : -p;
        html += '<div class="piece r' + side + ' st-' + pieceStyle + '">' + glyphHTML(rank) +
                '<span class="rk">' + rank + '</span></div>';
      }
      cell.innerHTML = html;
    }

    $('ruleChip').textContent = T('chip.' + st.variant);
    renderCaptured(st);
    renderStatus(over);
    renderLog();
    renderOverlay(over);
    renderReviewBar();
  }

  function renderCaptured(st) {
    var alive = [{}, {}];
    for (var i = 0; i < 63; i++) {
      var p = st.board[i];
      if (p !== 0) alive[p > 0 ? 0 : 1][p > 0 ? p : -p] = 1;
    }
    var topSide = G.flip ? 0 : 1;
    function lost(side) {
      var out = '';
      for (var r = 8; r >= 1; r--) if (!alive[side][r]) out += glyphHTML(r, null, 'tiny');
      return out;
    }
    $('capturedTop').innerHTML = lost(topSide);
    $('capturedBottom').innerHTML = lost(1 - topSide);
  }

  function sideName(s) { return T(s === 0 ? 'side.red' : 'side.black'); }

  function outcomeNow() {
    if (G.mode === 'online' && G.online && G.online.resigned !== null &&
        G.online.resigned !== undefined) {
      var loser = G.online.colors[G.online.resigned];
      return { winner: loser ^ 1, reason: 'resign' };
    }
    if (G.resignedBy !== null && G.resignedBy !== undefined) {
      return { winner: G.resignedBy ^ 1, reason: 'resign' };
    }
    return J.outcome(G.st);
  }

  function renderStatus(over) {
    var line = '', sub = '';
    var turn = G.st.turn;

    if (G.review) {
      $('statusLine').textContent = T('review.title');
      // logText can contain an <svg>, so this one has to be HTML
      $('subLine').innerHTML = G.review.ply === 0 ? T('review.opening')
        : T('review.after', { move: logText(G.log[G.review.ply - 1]) });
      return;
    }

    if (over) {
      line = over.winner === -1 ? T('over.draw')
                                : T('over.wins', { side: sideName(over.winner) });
    } else if (G.mode === 'ai') {
      line = turn === G.humanSide ? T('status.yourMove', { side: sideName(G.humanSide) })
                                  : T('status.thinking');
    } else if (G.mode === 'local') {
      line = T('status.toMove', { side: sideName(turn) });
    } else if (G.mode === 'online' && G.online) {
      var o = G.online;
      if (!o.joined || !o.joined[1]) {
        line = T('status.waitFriend');
        sub = T('status.sendLink');
      } else {
        line = turn === G.mySide ? T('status.yourMove', { side: sideName(G.mySide) })
                                 : T('status.waitSide', { side: sideName(turn) });
      }
      if (o.wins) {
        sub = sub || T('status.score', { you: o.wins[o.seat], them: o.wins[o.seat ^ 1] });
      }
      var here = !!(o.online && o.online[o.seat ^ 1]);
      $('oppState').textContent = T(here ? 'game.friendOnline' : 'game.friendAway');
      $('oppState').className = 'oppstate' + (here ? ' on' : '');
    }

    if (!over && G.notice) sub = G.notice;
    if (!over && G.desync) sub = G.desync;
    $('statusLine').textContent = line;
    if (!G.busy || G.pendingKind !== 'move') $('subLine').textContent = sub;
  }

  // The log keeps the bare facts of each move, so it can be written out again
  // in whichever language and piece markings are in force right now.
  function logEntry(st, mv) {
    var p = st.board[J.mFrom(mv)];
    var cap = J.mCap(mv);
    return {
      rank: p > 0 ? p : -p,
      from: J.mFrom(mv),
      to: J.mTo(mv),
      cap: cap === 0 ? 0 : (cap > 0 ? cap : -cap)
    };
  }

  function logText(e) {
    if (!e) return '';
    var s = glyphHTML(e.rank, null, 'tiny') + ' ' + J.coordName(e.from) +
            (e.cap ? '×' : '-') + J.coordName(e.to);
    if (e.cap) s += ' ' + glyphHTML(e.cap, null, 'tiny');
    return s;
  }

  function renderLog() {
    var html = '';
    for (var i = 0; i < G.log.length; i++) {
      var here = G.review && G.review.ply === i + 1;
      html += '<span class="mv' + (here ? ' at' : '') + '">' +
              (i % 2 === 0 ? ((i / 2 | 0) + 1) + '. ' : '') + logText(G.log[i]) + '</span>';
    }
    $('moveLog').innerHTML = html;
    var mark = $('moveLog').querySelector('.mv.at');
    if (mark) mark.scrollIntoView({ block: 'nearest' });
    else $('moveLog').scrollTop = $('moveLog').scrollHeight;
  }

  function renderOverlay(over) {
    var box = $('overlay');
    if (!over) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');

    var youWon = null;
    if (over.winner !== -1) {
      if (G.mode === 'ai') youWon = over.winner === G.humanSide;
      else if (G.mode === 'online') youWon = over.winner === G.mySide;
    }
    $('overEmoji').textContent = over.winner === -1 ? '🤝' : (youWon === false ? '😿' : '🏆');
    $('overTitle').textContent = over.winner === -1 ? T('over.draw')
      : (youWon === null ? T('over.wins', { side: sideName(over.winner) })
        : T(youWon ? 'over.youWin' : 'over.youLose'));
    $('overText').textContent = T('reason.' + over.reason);

    // A draw is only ever a suggestion - either player can wave it off.
    $('resumeBtn').classList.toggle('hidden', over.winner !== -1);
    $('reviewBtn').classList.toggle('hidden', G.moves.length === 0);

    var note = $('rematchNote');
    if (G.mode === 'online' && G.online.rematch) {
      note.classList.remove('hidden');
      note.textContent = G.online.rematch[G.online.seat]
        ? T('over.waitRematch')
        : (G.online.rematch[G.online.seat ^ 1] ? T('over.wantsRematch') : '');
    } else {
      note.classList.add('hidden');
    }
  }

  // ------------------------------------------------------- looking back
  // Rebuild the position from the start rather than unwinding the live game,
  // so nothing that happens in here can disturb the real board.
  function positionAtPly(n) {
    var st = J.newState(G.variant);
    st.allowRepeat = true;              // never re-declare a draw while reviewing
    for (var i = 0; i < n && i < G.moves.length; i++) J.applyMove(st, G.moves[i]);
    return st;
  }

  function gotoPly(n) {
    n = Math.max(0, Math.min(n, G.moves.length));
    var st = positionAtPly(n);
    var mv = n > 0 ? G.moves[n - 1] : null;
    G.review = {
      ply: n, st: st,
      last: mv === null ? null : { from: J.mFrom(mv), to: J.mTo(mv) }
    };
    render();
  }

  function exitReview() {
    G.review = null;
    render();
  }

  function renderReviewBar() {
    var bar = $('reviewBar');
    bar.classList.toggle('hidden', !G.review);
    document.querySelector('.controls').classList.toggle('hidden', !!G.review);
    if (!G.review) return;
    $('revLabel').textContent = T('review.count', { n: G.review.ply, m: G.moves.length });
    $('revStart').disabled = $('revPrev').disabled = G.review.ply === 0;
    $('revEnd').disabled = $('revNext').disabled = G.review.ply === G.moves.length;
  }

  // ---------------------------------------------------------------- moving
  function myTurn() {
    if (G.review) return false;
    if (outcomeNow()) return false;
    if (G.mode === 'local') return true;
    if (G.mode === 'ai') return G.st.turn === G.humanSide && !G.busy;
    return G.st.turn === G.mySide && G.online.joined && G.online.joined[1];
  }

  function onTap(e) {
    var i = parseInt(e.currentTarget.dataset.idx, 10);
    if (!myTurn()) return;
    var st = G.st, p = st.board[i];

    if (G.targets.indexOf(i) !== -1) {
      var moves = J.movesFrom(st, G.sel);
      for (var k = 0; k < moves.length; k++) {
        if (J.mTo(moves[k]) === i) { doMove(moves[k]); return; }
      }
    }
    // Tapping a square the repetition rule has closed off should say so,
    // rather than just silently doing nothing.
    if (G.sel !== -1 && G.blocked.indexOf(i) !== -1) {
      G.notice = T('status.noRepeat', { n: J.REPEAT_LIMIT + 1 });
      render();
      return;
    }

    if (p !== 0 && (p > 0 ? 0 : 1) === st.turn) {
      G.sel = i;
      G.targets = J.movesFrom(st, i).map(J.mTo);
      G.blocked = J.rawMovesFrom(st, i).filter(function (m) {
        return J.isRepeat(st, m);
      }).map(J.mTo);
      G.notice = null;
    } else {
      G.sel = -1; G.targets = []; G.blocked = []; G.notice = null;
    }
    render();
  }

  function doMove(mv) {
    G.log.push(logEntry(G.st, mv));
    G.moves.push(mv);
    G.last = { from: J.mFrom(mv), to: J.mTo(mv) };
    J.applyMove(G.st, mv);
    G.sel = -1; G.targets = []; G.blocked = []; G.notice = null; G.hint = null;
    render();

    if (G.mode === 'online') sendMove(mv);
    if (outcomeNow()) return;
    if (G.mode === 'ai' && G.st.turn !== G.humanSide) {
      setTimeout(function () { ask('move', G.level); }, 120);
    }
  }

  function undo() {
    if (G.mode === 'online' || G.busy) return;
    var steps = G.mode === 'ai' ? 2 : 1;
    for (var s = 0; s < steps && G.st.undo.length > 0; s++) {
      J.undoMove(G.st);
      G.log.pop();
      G.moves.pop();
    }
    G.sel = -1; G.targets = []; G.last = null; G.hint = null;
    render();
  }

  // ---------------------------------------------------------------- games
  function newGame(variant) {
    G.st = J.newState(variant || G.variant);
    G.variant = G.st.variant;
    G.sel = -1; G.targets = []; G.blocked = []; G.notice = null;
    G.last = null; G.log = []; G.hint = null;
    G.moves = []; G.review = null; G.resignedBy = null;
    G.busy = false; G.desync = null;
    G.reqId++;      // any answer still in flight belongs to the old game
  }

  function show(which) {
    $('menu').classList.toggle('hidden', which !== 'menu');
    $('game').classList.toggle('hidden', which !== 'game');
  }

  function startAI() {
    G.mode = 'ai';
    G.humanSide = G.pickSide;
    G.flip = G.humanSide === 1;
    newGame(currentVariant());
    $('roomBar').classList.add('hidden');
    $('undoBtn').classList.remove('hidden');
    $('hintBtn').classList.remove('hidden');
    show('game');
    render();
    if (G.st.turn !== G.humanSide) ask('move', G.level);
  }

  function startLocal() {
    G.mode = 'local';
    G.flip = false;
    newGame(currentVariant());
    $('roomBar').classList.add('hidden');
    $('undoBtn').classList.remove('hidden');
    $('hintBtn').classList.remove('hidden');
    show('game');
    render();
  }

  function currentVariant() {
    var el = document.querySelector('input[name=variant]:checked');
    return el ? el.value : 'classic';
  }

  // ---------------------------------------------------------------- online
  function api(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json(); });
  }

  function saveSeat(o) {
    try {
      localStorage.setItem('jungle-seat', JSON.stringify(
        { room: o.room, seat: o.seat, token: o.token }));
    } catch (err) { /* private browsing, never mind */ }
  }

  function savedSeat() {
    try { return JSON.parse(localStorage.getItem('jungle-seat') || 'null'); }
    catch (err) { return null; }
  }

  function enterOnline(res) {
    G.mode = 'online';
    G.online = {
      room: res.room, seat: res.seat, token: res.token,
      version: 0, round: -1, colors: [0, 1], wins: [0, 0],
      rematch: [false, false], online: [false, false],
      joined: [false, false], resigned: null, pollId: (G.online ? G.online.pollId : 0) + 1
    };
    saveSeat(G.online);
    $('roomBar').classList.remove('hidden');
    $('roomCode').textContent = res.room;
    $('undoBtn').classList.add('hidden');
    $('hintBtn').classList.add('hidden');
    show('game');
    syncOnline(res.state);
    poll(G.online.pollId);
  }

  // The server answers with a short code so the message can be shown in
  // whichever language is in force.
  function serverError(res) {
    return T(res.code ? 'err.' + res.code : 'err.generic');
  }

  function createRoom() {
    api('/api/create', { variant: currentVariant() }).then(function (res) {
      if (res.error) { alert(serverError(res)); return; }
      enterOnline(res);
    }).catch(netFail);
  }

  function joinRoom(code) {
    code = (code || '').trim().toUpperCase();
    if (code.length !== 4) { alert(T('err.codeLength')); return; }
    var saved = savedSeat();
    var body = { room: code };
    if (saved && saved.room === code) body.token = saved.token;
    api('/api/join', body).then(function (res) {
      if (res.error) { alert(serverError(res)); return; }
      enterOnline(res);
    }).catch(netFail);
  }

  function netFail() {
    alert(T('err.network'));
  }

  function sendMove(mv) {
    var o = G.online;
    api('/api/move', {
      room: o.room, seat: o.seat, token: o.token,
      move: mv, ply: G.st.undo.length - 1
    }).then(function (res) {
      if (res.state) syncOnline(res.state);
    }).catch(function () { /* the poll loop will catch up */ });
  }

  function syncOnline(s) {
    if (!s || s.error) return;
    var o = G.online;
    o.version = s.version;
    o.wins = s.wins;
    o.rematch = s.rematch;
    o.online = s.online;
    o.joined = s.joined;
    o.resigned = s.resigned;

    if (s.round !== o.round || s.moves.length < G.st.undo.length) {
      o.round = s.round;
      o.colors = s.colors;
      G.mySide = s.colors[o.seat];
      G.flip = G.mySide === 1;
      newGame(s.variant);
    }
    o.colors = s.colors;
    G.mySide = s.colors[o.seat];

    for (var i = G.st.undo.length; i < s.moves.length; i++) {
      var mv = s.moves[i];
      var legal = J.genMoves(G.st, []);
      var ok = false;
      for (var k = 0; k < legal.length; k++) if (legal[k] === mv) { ok = true; break; }
      if (!ok) {
        G.desync = T('status.desync');
        break;
      }
      G.log.push(logEntry(G.st, mv));
      G.moves.push(mv);
      G.last = { from: J.mFrom(mv), to: J.mTo(mv) };
      J.applyMove(G.st, mv);
    }

    // Either player can wave off a draw; the other simply plays on.
    if (s.waived && !G.st.allowRepeat) J.resumeAfterDraw(G.st);

    render();
  }

  function poll(id) {
    var o = G.online;
    if (!o || o.pollId !== id || G.mode !== 'online') return;
    fetch('/api/state?room=' + o.room + '&seat=' + o.seat + '&v=' + o.version)
      .then(function (r) { return r.json(); })
      .then(function (s) {
        if (!o || o.pollId !== id) return;
        if (!s.error) syncOnline(s);
        setTimeout(function () { poll(id); }, 50);
      })
      .catch(function () { setTimeout(function () { poll(id); }, 1500); });
  }

  // ---------------------------------------------------------------- buttons
  G.pickSide = 0;

  document.querySelectorAll('#levelChoices .level').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('#levelChoices .level').forEach(function (x) {
        x.classList.remove('selected');
      });
      b.classList.add('selected');
      G.level = b.dataset.level;
      $('levelHint').textContent = T('level.' + G.level + '.hint');
    });
  });

  document.querySelectorAll('.side-pick .pill').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.side-pick .pill').forEach(function (x) {
        x.classList.remove('selected');
      });
      b.classList.add('selected');
      G.pickSide = parseInt(b.dataset.side, 10);
    });
  });

  $('startAI').addEventListener('click', startAI);
  $('startLocal').addEventListener('click', startLocal);
  $('createRoom').addEventListener('click', createRoom);
  $('joinRoom').addEventListener('click', function () { joinRoom($('joinCode').value); });
  $('joinCode').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') joinRoom($('joinCode').value);
  });

  $('back').addEventListener('click', function () {
    if (G.mode === 'online' && G.online) {
      G.online.pollId++;
      api('/api/leave', { room: G.online.room, seat: G.online.seat, token: G.online.token })
        .catch(function () {});
    }
    G.mode = null;
    G.reqId++;
    show('menu');
  });

  $('flip').addEventListener('click', function () { G.flip = !G.flip; render(); });
  $('undoBtn').addEventListener('click', undo);
  $('hintBtn').addEventListener('click', function () {
    if (G.busy || outcomeNow()) return;
    ask('hint', 'hard', 1200);
    $('subLine').textContent = T('status.hinting');
  });

  $('resignBtn').addEventListener('click', function () {
    if (outcomeNow()) return;
    if (!confirm(T('game.resignAsk'))) return;
    if (G.mode === 'online') {
      api('/api/resign', {
        room: G.online.room, seat: G.online.seat, token: G.online.token
      }).then(function (res) { if (res.state) syncOnline(res.state); }).catch(function () {});
    } else {
      G.resignedBy = G.mode === 'ai' ? G.humanSide : G.st.turn;
      G.st.winner = G.resignedBy ^ 1;
      render();
    }
  });

  $('resumeBtn').addEventListener('click', function () {
    if (G.mode === 'online') {
      api('/api/waive', {
        room: G.online.room, seat: G.online.seat, token: G.online.token
      }).then(function (res) { if (res.state) syncOnline(res.state); }).catch(function () {});
      return;
    }
    J.resumeAfterDraw(G.st);
    render();
    if (G.mode === 'ai' && G.st.turn !== G.humanSide) ask('move', G.level);
  });

  $('reviewBtn').addEventListener('click', function () { gotoPly(G.moves.length); });
  $('revExit').addEventListener('click', exitReview);
  $('revStart').addEventListener('click', function () { gotoPly(0); });
  $('revPrev').addEventListener('click', function () { gotoPly(G.review.ply - 1); });
  $('revNext').addEventListener('click', function () { gotoPly(G.review.ply + 1); });
  $('revEnd').addEventListener('click', function () { gotoPly(G.moves.length); });

  document.addEventListener('keydown', function (e) {
    if (!G.review) return;
    if (e.key === 'ArrowLeft') gotoPly(G.review.ply - 1);
    else if (e.key === 'ArrowRight') gotoPly(G.review.ply + 1);
    else if (e.key === 'Escape') exitReview();
  });

  $('againBtn').addEventListener('click', function () {
    if (G.mode === 'online') {
      var over = outcomeNow();
      api('/api/rematch', {
        room: G.online.room, seat: G.online.seat, token: G.online.token,
        winner: over && over.winner !== -1 ? over.winner : null
      }).then(function (res) { if (res.state) syncOnline(res.state); }).catch(function () {});
      return;
    }
    newGame(G.variant);
    render();
    if (G.mode === 'ai' && G.st.turn !== G.humanSide) ask('move', G.level);
  });

  $('menuBtn').addEventListener('click', function () { $('back').click(); });

  $('copyLink').addEventListener('click', function () {
    var url = location.origin + '/?room=' + G.online.room;
    var done = function () { $('copyLink').textContent = T('game.copied'); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () {
      prompt(T('game.copyPrompt'), url);
    });
    else prompt(T('game.copyPrompt'), url);
  });

  $('openRules').addEventListener('click', function () { $('rulesModal').classList.remove('hidden'); });
  $('rulesBtn').addEventListener('click', function () { $('rulesModal').classList.remove('hidden'); });
  $('ruleChip').addEventListener('click', function () { $('rulesModal').classList.remove('hidden'); });
  $('closeRules').addEventListener('click', function () { $('rulesModal').classList.add('hidden'); });
  $('rulesModal').addEventListener('click', function (e) {
    if (e.target === $('rulesModal')) $('rulesModal').classList.add('hidden');
  });

  document.querySelectorAll('input[name=variant]').forEach(function (r) {
    r.addEventListener('change', function () { G.variant = currentVariant(); });
  });

  // ------------------------------------------------- applying the settings
  function rankLine(withNames) {
    var out = [];
    for (var r = 8; r >= 1; r--) {
      out.push(glyphHTML(r, null, 'tiny') + ' ' + r +
               (withNames ? ' ' + T('piece.' + r) : ''));
    }
    return out.join(' &gt; ');
  }

  function applyLanguage() {
    document.documentElement.lang = T('doc.lang');
    document.title = T('doc.title');
    $('brandTitle').textContent = lang === 'zh' ? '斗兽棋' : 'Jungle';

    document.querySelectorAll('[data-t]').forEach(function (el) {
      el.textContent = T(el.dataset.t);
    });
    document.querySelectorAll('[data-th]').forEach(function (el) {
      el.innerHTML = T(el.dataset.th);
    });
    document.querySelectorAll('[data-tph]').forEach(function (el) {
      el.placeholder = T(el.dataset.tph);
    });
    document.querySelectorAll('[data-ttl]').forEach(function (el) {
      el.title = T(el.dataset.ttl);
    });

    $('levelHint').textContent = T('level.' + G.level + '.hint');
    applyPieceStyle();       // rank lines carry both language and markings
    if (G.st) render();
  }

  function applyPieceStyle() {
    var brand = '';
    for (var b = 8; b >= 1; b--) brand += glyphHTML(b, null, 'tiny');
    $('brandIcons').innerHTML = brand;

    $('rankLine').innerHTML =
      T('menu.ranksLead') + ' ' + rankLine(false) + ' ' + T('menu.ranksTail');
    var modalRanks = $('rankLineModal');
    if (modalRanks) modalRanks.innerHTML = rankLine(true);

    $('styleBtn').innerHTML = glyphHTML(6, null, 'tiny');    // the tiger, as a sample
    document.querySelectorAll('#styleChoices .style').forEach(function (b) {
      b.classList.toggle('selected', b.dataset.style === pieceStyle);
    });
    // Show all eight, high rank first, with a dot under the four whose picture
    // is the same in both emoji sets - it saves explaining it twice.
    document.querySelectorAll('[data-style-preview]').forEach(function (el) {
      var which = el.dataset.stylePreview;
      var html = '';
      for (var r = 8; r >= 1; r--) {
        // only the two emoji sets have animals they cannot draw properly
        var stuck = (which === 'face' || which === 'body') && STUCK.indexOf(r) !== -1;
        html += '<span class="pv-one' + (stuck ? ' stuck' : '') + '">' +
                glyphHTML(r, which, 'tiny') + '</span>';
      }
      el.innerHTML = html;
      el.className = 'style-preview pv-' + which;
    });
    if (G.st) render();
  }

  function setLanguage(next) {
    lang = PACKS[next] ? next : 'en';
    remember('jungle-lang', lang);
    applyLanguage();
  }

  function setPieceStyle(next) {
    pieceStyle = STYLES.indexOf(next) !== -1 ? next : 'art';
    remember('jungle-pieces', pieceStyle);
    applyPieceStyle();
  }

  $('langBtn').addEventListener('click', function () {
    setLanguage(lang === 'en' ? 'zh' : 'en');
  });

  document.querySelectorAll('#styleChoices .style').forEach(function (b) {
    b.addEventListener('click', function () { setPieceStyle(b.dataset.style); });
  });

  // Mid-game cycling, for when two animals still look alike on the board.
  $('styleBtn').addEventListener('click', function () {
    setPieceStyle(STYLES[(STYLES.indexOf(pieceStyle) + 1) % STYLES.length]);
  });

  // ---------------------------------------------------------------- boot
  G.st = J.newState('classic');
  applyLanguage();
  var params = new URLSearchParams(location.search);
  var invited = (params.get('room') || '').toUpperCase();
  if (invited.length === 4) {
    $('joinCode').value = invited;
    joinRoom(invited);
  }

  // ------------------------------------------------- installing on a phone
  if ('serviceWorker' in navigator) {
    // If a copy was already installed, this page was served from the old
    // stored version. When the new worker takes over, reload once so nobody
    // has to open the app twice to see an update.
    var hadWorker = !!navigator.serviceWorker.controller;
    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadWorker || reloading) return;
      reloading = true;
      location.reload();
    });
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {
        // No offline copy then - the game still works online.
      });
    });
  }

  var installPrompt = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installPrompt = e;
    $('installCard').classList.remove('hidden');
  });

  $('installBtn').addEventListener('click', function () {
    if (!installPrompt) return;
    installPrompt.prompt();
    installPrompt.userChoice.then(function () {
      installPrompt = null;
      $('installCard').classList.add('hidden');
    });
  });

  window.addEventListener('appinstalled', function () {
    $('installCard').classList.add('hidden');
  });

  // Safari on the iPhone has no install prompt, so say where the button is.
  (function () {
    var iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var installed = navigator.standalone === true ||
                    window.matchMedia('(display-mode: standalone)').matches;
    if (iOS && !installed) {
      $('installCard').classList.remove('hidden');
      $('installBtn').classList.add('hidden');
      // Swapping the key means the wording follows the language button too.
      $('installHint').dataset.th = 'install.ios';
      $('installHint').innerHTML = T('install.ios');
    }
  })();

  window.JungleUI = G;   // handy for poking at from the console
})();

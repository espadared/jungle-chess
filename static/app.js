/* Jungle - screen wiring, board drawing, and the online room plumbing.
 * The rules live in rules.js; the computer opponent lives in ai.js (a worker).
 */
(function () {
  'use strict';

  var J = window.Jungle;
  var $ = function (id) { return document.getElementById(id); };

  var VARIANT_NAME = {
    classic: 'Classic traps',
    open: 'Open traps · variation 1',
    safe: 'Safe traps · variation 2',
    home: 'Home refuge · variation 2b'
  };

  var LEVEL_HINT = {
    easy: 'Easy: barely looks ahead and makes mistakes on purpose.',
    normal: 'Normal: thinks under a second. A fair club-level game.',
    hard: 'Hard: thinks about 2.5 seconds a move and looks a long way ahead.',
    insane: 'Insane: thinks about 6 seconds a move. Expect to lose.'
  };

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
            $('subLine').textContent = 'thinking… depth ' + m.depth;
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
        html += '<div class="piece r' + side + '">' + J.EMOJI[rank] +
                '<span class="rk">' + rank + '</span></div>';
      }
      cell.innerHTML = html;
    }

    $('ruleChip').textContent = VARIANT_NAME[st.variant] || VARIANT_NAME.classic;
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
      for (var r = 8; r >= 1; r--) if (!alive[side][r]) out += J.EMOJI[r];
      return out;
    }
    $('capturedTop').textContent = lost(topSide);
    $('capturedBottom').textContent = lost(1 - topSide);
  }

  function sideName(s) { return s === 0 ? 'Red' : 'Black'; }

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
      $('statusLine').textContent = 'Looking back';
      $('subLine').textContent = G.review.ply === 0 ? 'the opening position'
        : 'after ' + G.log[G.review.ply - 1];
      return;
    }

    if (over) {
      line = over.winner === -1 ? 'Draw' : sideName(over.winner) + ' wins';
    } else if (G.mode === 'ai') {
      line = turn === G.humanSide ? 'Your move (' + sideName(G.humanSide) + ')'
                                  : 'Computer is thinking';
    } else if (G.mode === 'local') {
      line = sideName(turn) + ' to move';
    } else {
      var o = G.online;
      if (!o.joined || !o.joined[1]) {
        line = 'Waiting for your friend';
        sub = 'Send them the invite link or the room code.';
      } else {
        line = turn === G.mySide ? 'Your move (' + sideName(G.mySide) + ')'
                                 : 'Waiting for ' + sideName(turn);
      }
      if (o.wins) sub = sub || ('Games won — you ' + o.wins[o.seat] + ', them ' + o.wins[o.seat ^ 1]);
      $('oppState').textContent = (o.online && o.online[o.seat ^ 1]) ? 'friend online' : 'friend away';
      $('oppState').className = 'oppstate' + ((o.online && o.online[o.seat ^ 1]) ? ' on' : '');
    }

    if (!over && G.notice) sub = G.notice;
    if (!over && G.desync) sub = G.desync;
    $('statusLine').textContent = line;
    if (!G.busy || G.pendingKind !== 'move') $('subLine').textContent = sub;
  }

  function renderLog() {
    var html = '';
    for (var i = 0; i < G.log.length; i++) {
      var here = G.review && G.review.ply === i + 1;
      html += '<span class="mv' + (here ? ' at' : '') + '">' +
              (i % 2 === 0 ? ((i / 2 | 0) + 1) + '. ' : '') + G.log[i] + '</span>';
    }
    $('moveLog').innerHTML = html;
    var mark = $('moveLog').querySelector('.mv.at');
    if (mark) mark.scrollIntoView({ block: 'nearest' });
    else $('moveLog').scrollTop = $('moveLog').scrollHeight;
  }

  var REASONS = {
    den: 'reached the den',
    captured: 'captured every animal',
    stuck: 'the loser had no legal move left',
    resign: 'the other player resigned',
    repetition: 'the same position came up three times'
  };

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
    $('overTitle').textContent = over.winner === -1 ? 'Draw'
      : (youWon === null ? sideName(over.winner) + ' wins'
        : (youWon ? 'You win!' : 'You lose'));
    $('overText').textContent = REASONS[over.reason] || '';

    // A draw is only ever a suggestion - either player can wave it off.
    $('resumeBtn').classList.toggle('hidden', over.winner !== -1);
    $('reviewBtn').classList.toggle('hidden', G.moves.length === 0);

    var note = $('rematchNote');
    if (G.mode === 'online' && G.online.rematch) {
      note.classList.remove('hidden');
      note.textContent = G.online.rematch[G.online.seat]
        ? 'Waiting for your friend to accept the rematch…'
        : (G.online.rematch[G.online.seat ^ 1] ? 'Your friend wants a rematch!' : '');
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
    $('revLabel').textContent = 'Move ' + G.review.ply + ' of ' + G.moves.length;
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
      G.notice = 'That would repeat the same position a ' +
                 (J.REPEAT_LIMIT + 1) + 'th time — move something else.';
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
    G.log.push(J.moveText(G.st, mv));
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

  function createRoom() {
    api('/api/create', { variant: currentVariant() }).then(function (res) {
      if (res.error) { alert(res.error); return; }
      enterOnline(res);
    }).catch(netFail);
  }

  function joinRoom(code) {
    code = (code || '').trim().toUpperCase();
    if (code.length !== 4) { alert('Room codes are 4 letters.'); return; }
    var saved = savedSeat();
    var body = { room: code };
    if (saved && saved.room === code) body.token = saved.token;
    api('/api/join', body).then(function (res) {
      if (res.error) { alert(res.error); return; }
      enterOnline(res);
    }).catch(netFail);
  }

  function netFail() {
    alert('Could not reach the game server. Check your connection and try again.');
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
        G.desync = 'The two boards disagreed — reload the page to resync.';
        break;
      }
      G.log.push(J.moveText(G.st, mv));
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
      $('levelHint').textContent = LEVEL_HINT[G.level];
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
    $('subLine').textContent = 'looking for a good move…';
  });

  $('resignBtn').addEventListener('click', function () {
    if (outcomeNow()) return;
    if (!confirm('Give up this game?')) return;
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
    var done = function () { $('copyLink').textContent = 'Link copied!'; };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () {
      prompt('Copy this link:', url);
    });
    else prompt('Copy this link:', url);
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

  // ---------------------------------------------------------------- boot
  G.st = J.newState('classic');
  var params = new URLSearchParams(location.search);
  var invited = (params.get('room') || '').toUpperCase();
  if (invited.length === 4) {
    $('joinCode').value = invited;
    joinRoom(invited);
  }

  window.JungleUI = G;   // handy for poking at from the console
})();

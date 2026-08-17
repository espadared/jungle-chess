# Jungle (Animal Chess)

Free browser version of Jungle / Dou Shou Qi (斗兽棋), with a genuinely strong
computer opponent and online play against a friend by room code.

## Running it on your own machine

```bash
python3 server.py
```

Then open http://localhost:8451

No dependencies to install - it is Python standard library only.

## How the pieces fit together

| File | What it does |
|------|--------------|
| `server.py` | Serves the page and passes moves between two people in a room. Nothing else. |
| `static/rules.js` | The whole rulebook: moves, the river, jumps, traps, dens, draws. |
| `static/ai.js` | The computer opponent. Runs in a web worker **in the player's browser**. |
| `static/app.js` | Screens, board drawing, online room plumbing. |
| `static/style.css` | Look and feel. |
| `static/index.html` | Markup and the in-game rules panel. |

The AI deliberately runs on the player's device, not the server. That is what
keeps this runnable on a free hosting plan no matter how many people play, and
why "Insane" can afford to think for six seconds.

## The computer opponent

Negamax with alpha-beta pruning, plus:

- iterative deepening under a time budget
- a transposition table (1M entries, Zobrist hashed)
- killer moves, a history table and MVV-LVA capture ordering
- late move reductions
- a capture-only quiescence search, so it never stops counting mid-trade
- evaluation built on material, true walking distance to the enemy den per
  movement type (walker / river-jumper / swimmer), den defence and
  variant-aware trap scoring

Levels: Easy (blunders on purpose), Normal (~0.8s), Hard (~2.6s), Insane (~6.5s).

## The four trap rules

Traps are the three squares around each den. They are also the only rule people
genuinely disagree about, so all four common readings are selectable:

| Mode | Rule |
|------|------|
| **Classic** | An animal in the **enemy's** trap loses all rank - anything can eat it. The standard game. |
| **Open traps** | An animal on **any** trap, own or enemy, can be eaten by anything. |
| **Safe traps** | An animal on **any** trap cannot be eaten at all. Both dens end up sealed by untouchable blockers, so games run long - in self-play these lasted 2-3x a classic game. |
| **Home refuge** | Your **own** traps shelter your animals; the enemy's traps still strip rank. The long, defensive game. |

## Online play

- One player taps **Create a room** and gets a 4-letter code.
- **Copy invite link** gives a URL like `https://your-app.onrender.com/?room=ABCD`
  that drops a friend straight into the game.
- Rooms live in memory and are forgotten after three hours of silence. Colours
  swap on every rematch, and the score is kept for the session.

Moves are relayed, not refereed: both browsers run the identical rulebook and
each one checks every move it receives, so an out-of-order or impossible move
is caught and reported rather than silently accepted.

## Deploying to Render

Push this folder to GitHub, then on Render create a **Web Service** pointing at
the repo. `render.yaml` already sets it up: Python runtime, free plan,
`python server.py`. The server reads the `PORT` environment variable Render
provides.

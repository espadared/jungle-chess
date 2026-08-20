"""Jungle (Dou Shou Qi) - tiny room server.

The rules and the computer opponent both live in the browser.  This server
only does two things: hand out static files, and pass moves between the two
people sharing a room code.  That keeps it small enough to run happily on a
free hosting plan, and it means the AI never costs us any server time.

Standard library only - no pip install needed to run it locally.
"""

import json
import mimetypes
import os
import random
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

STATIC = Path(__file__).resolve().parent / "static"
PORT = int(os.environ.get("PORT", "8451"))   # Render sets PORT for us

# Letters that never look like each other when read off a phone screen.
CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"
CODE_LENGTH = 4

ROOM_TTL = 3 * 60 * 60      # forget rooms nobody has touched for three hours
OFFLINE_AFTER = 20          # seconds without a poll before we call someone away
LONG_POLL_SECONDS = 25
VARIANTS = ("classic", "open", "safe", "home")

ROOMS = {}
LOCK = threading.Lock()


# --- rooms ----------------------------------------------------------------

def new_code():
    while True:
        code = "".join(random.choice(CODE_LETTERS) for _ in range(CODE_LENGTH))
        if code not in ROOMS:
            return code


def make_room(variant):
    code = new_code()
    now = time.time()
    room = {
        "code": code,
        "variant": variant,
        "moves": [],
        "tokens": [secrets.token_urlsafe(12), secrets.token_urlsafe(12)],
        "joined": [False, False],
        "seen": [0.0, 0.0],
        "colors": [0, 1],       # colors[seat] -> 0 Red, 1 Black
        "round": 0,
        "rematch": [False, False],
        "wins": [0, 0],
        "resigned": None,       # seat that gave up, if any
        "waived": False,        # someone chose to play on past a draw
        "version": 1,
        "created": now,
        "touched": now,
    }
    ROOMS[code] = room
    return room


def bump(room):
    room["version"] += 1
    room["touched"] = time.time()


def prune():
    now = time.time()
    for code, room in list(ROOMS.items()):
        if now - room["touched"] > ROOM_TTL:
            del ROOMS[code]


def view(room, seat):
    now = time.time()
    return {
        "version": room["version"],
        "variant": room["variant"],
        "moves": room["moves"],
        "colors": room["colors"],
        "round": room["round"],
        "wins": room["wins"],
        "rematch": room["rematch"],
        "resigned": room["resigned"],
        "waived": room["waived"],
        "joined": room["joined"],
        "online": [
            room["joined"][i] and (now - room["seen"][i]) < OFFLINE_AFTER
            for i in range(2)
        ],
        "you": seat,
    }


# --- HTTP -----------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "Jungle/1.0"

    def log_message(self, fmt, *args):
        pass  # the default logger is far too chatty for a game server

    # -- writing responses --

    def write_body(self, body):
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            # Long polls get dropped whenever a phone locks. Not an error.
            self.close_connection = True

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.write_body(body)

    def send_file(self, path):
        try:
            body = path.read_bytes()
        except OSError:
            self.send_json({"error": "not found"}, 404)
            return
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript",):
            ctype += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.write_body(body)

    def body_json(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            return json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return None

    # -- routing --

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/api/state":
            self.handle_state(parse_qs(parsed.query))
        elif path == "/sw.js":
            # The service worker has to be served from the root or it is only
            # allowed to look after /static/.
            self.send_file(STATIC / "sw.js")
        elif path == "/api/health":
            self.send_json({"ok": True, "rooms": len(ROOMS)})
        elif path.startswith("/static/"):
            target = (STATIC / path[len("/static/"):]).resolve()
            if STATIC.resolve() in target.parents and target.is_file():
                self.send_file(target)
            else:
                self.send_json({"error": "not found"}, 404)
        else:
            self.send_file(STATIC / "index.html")

    def do_POST(self):
        body = self.body_json()
        if body is None:
            self.send_json({"error": "Bad request.", "code": "generic"}, 400)
            return
        routes = {
            "/api/create": self.handle_create,
            "/api/join": self.handle_join,
            "/api/move": self.handle_move,
            "/api/rematch": self.handle_rematch,
            "/api/resign": self.handle_resign,
            "/api/waive": self.handle_waive,
            "/api/leave": self.handle_leave,
        }
        handler = routes.get(urlparse(self.path).path)
        if handler is None:
            self.send_json({"error": "not found"}, 404)
            return
        with LOCK:
            handler(body)

    # -- seat checking --

    def seated(self, body):
        code = str(body.get("room", "")).strip().upper()
        room = ROOMS.get(code)
        if room is None:
            return None, None
        seat = body.get("seat")
        token = str(body.get("token") or "")
        if seat in (0, 1) and secrets.compare_digest(token, room["tokens"][seat]):
            room["seen"][seat] = time.time()
            return room, seat
        return room, None

    # -- handlers --

    def handle_create(self, body):
        prune()
        variant = str(body.get("variant", "classic"))
        if variant not in VARIANTS:
            variant = "classic"
        room = make_room(variant)
        room["joined"][0] = True
        room["seen"][0] = time.time()
        self.send_json({
            "room": room["code"], "seat": 0,
            "token": room["tokens"][0], "state": view(room, 0),
        })

    def handle_join(self, body):
        code = str(body.get("room", "")).strip().upper()
        room = ROOMS.get(code)
        if room is None:
            self.send_json({"error": "No room with that code.", "code": "roomMissing"}, 404)
            return
        if room["joined"][1]:
            # Already two people here - unless one of them is us coming back.
            token = str(body.get("token") or "")
            for seat in (0, 1):
                if secrets.compare_digest(token, room["tokens"][seat]):
                    room["seen"][seat] = time.time()
                    self.send_json({"room": code, "seat": seat,
                                    "token": room["tokens"][seat],
                                    "state": view(room, seat)})
                    return
            self.send_json({"error": "That room is full.", "code": "roomFull"}, 409)
            return
        room["joined"][1] = True
        room["seen"][1] = time.time()
        bump(room)
        self.send_json({
            "room": code, "seat": 1,
            "token": room["tokens"][1], "state": view(room, 1),
        })

    def handle_move(self, body):
        room, seat = self.seated(body)
        if room is None:
            self.send_json({"error": "No room with that code.", "code": "roomMissing"}, 404)
            return
        if seat is None:
            self.send_json({"error": "You are not seated in this game.", "code": "notSeated"}, 403)
            return
        try:
            move = int(body.get("move"))
            ply = int(body.get("ply"))
        except (TypeError, ValueError):
            self.send_json({"error": "Bad move.", "code": "generic"}, 400)
            return

        if ply != len(room["moves"]):
            # Someone double tapped, or two moves crossed in flight.
            self.send_json({"ok": True, "state": view(room, seat)})
            return
        if room["colors"][seat] != ply % 2:
            self.send_json({"error": "Not your turn.", "code": "notTurn"}, 409)
            return
        if not 0 <= move < (1 << 20):
            self.send_json({"error": "Bad move.", "code": "generic"}, 400)
            return

        room["moves"].append(move)
        bump(room)
        self.send_json({"ok": True, "state": view(room, seat)})

    def handle_rematch(self, body):
        room, seat = self.seated(body)
        if room is None or seat is None:
            self.send_json({"error": "No room with that code.", "code": "roomMissing"}, 404)
            return
        winner = body.get("winner")
        if winner in (0, 1) and not room["rematch"][0] and not room["rematch"][1]:
            room["wins"][winner] += 1
        room["rematch"][seat] = True
        if all(room["rematch"]):
            room["moves"] = []
            room["rematch"] = [False, False]
            room["resigned"] = None
            room["waived"] = False
            room["round"] += 1
            room["colors"] = [room["colors"][0] ^ 1, room["colors"][1] ^ 1]
        bump(room)
        self.send_json({"ok": True, "state": view(room, seat)})

    def handle_resign(self, body):
        room, seat = self.seated(body)
        if room is None or seat is None:
            self.send_json({"error": "No room with that code.", "code": "roomMissing"}, 404)
            return
        room["resigned"] = seat
        bump(room)
        self.send_json({"ok": True, "state": view(room, seat)})

    def handle_waive(self, body):
        """Someone would rather keep playing than accept the draw."""
        room, seat = self.seated(body)
        if room is None or seat is None:
            self.send_json({"error": "No room with that code.", "code": "roomMissing"}, 404)
            return
        room["waived"] = True
        bump(room)
        self.send_json({"ok": True, "state": view(room, seat)})

    def handle_leave(self, body):
        room, seat = self.seated(body)
        if room is not None and seat is not None:
            room["seen"][seat] = 0.0
            bump(room)
        self.send_json({"ok": True})

    def handle_state(self, query):
        code = query.get("room", [""])[0].strip().upper()
        try:
            since = int(query.get("v", ["0"])[0])
        except ValueError:
            since = 0
        seat = None
        try:
            candidate = int(query.get("seat", [""])[0])
            seat = candidate if candidate in (0, 1) else None
        except (ValueError, IndexError):
            seat = None

        deadline = time.time() + LONG_POLL_SECONDS
        while True:
            with LOCK:
                room = ROOMS.get(code)
                if room is None:
                    self.send_json({"error": "room-not-found"}, 404)
                    return
                if seat is not None:
                    room["seen"][seat] = time.time()
                    room["touched"] = time.time()
                if room["version"] > since or time.time() >= deadline:
                    self.send_json(view(room, seat))
                    return
            time.sleep(0.15)


def main():
    mimetypes.add_type("application/javascript", ".js")
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    server.daemon_threads = True
    print("Jungle running on http://0.0.0.0:%d" % PORT, flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()

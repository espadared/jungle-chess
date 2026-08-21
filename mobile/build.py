"""Assemble the web files into the folder Capacitor packages into the app.

The website and the app run the same code. Two things differ, and both are
handled by writing one small config file that the website never has:

  window.JUNGLE_API  - the room server. In the app the page is served off the
                       device, so a bare "/api/..." has no server to be
                       relative to.
  window.JUNGLE_SITE - where an invite link should point. Inside the app
                       location.origin is capacitor://localhost, which is fine
                       for loading the game and useless for sending to anyone.

The service worker is left out on purpose: the app already carries every file.

Run:  python3 mobile/build.py     (from the project root)
"""

import pathlib
import shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "static"
WWW = ROOT / "mobile" / "www"

SERVER = "https://jungle-chess-ghxu.onrender.com"

CONFIG = """/* Written by mobile/build.py - do not edit. */
window.JUNGLE_NATIVE = true;
window.JUNGLE_API = %r;
window.JUNGLE_SITE = %r;
""" % (SERVER, SERVER)

# Everything except the service worker, which only makes sense on the web.
SKIP = {"sw.js"}


def build():
    if WWW.exists():
        shutil.rmtree(WWW)
    (WWW / "static").mkdir(parents=True)

    for item in SRC.iterdir():
        if item.name in SKIP:
            continue
        target = WWW / "static" / item.name
        if item.is_dir():
            shutil.copytree(item, target)
        else:
            shutil.copy2(item, target)

    # index.html sits at the web root; everything it asks for is under /static/
    page = (SRC / "index.html").read_text()
    (WWW / "static" / "index.html").unlink()

    config_path = WWW / "static" / "config.js"
    config_path.write_text(CONFIG)

    # config.js has to run before app.js reads those two globals
    marker = '<script src="/static/i18n.js"></script>'
    if marker not in page:
        raise SystemExit("index.html changed shape - cannot place config.js")
    page = page.replace(marker, '<script src="/static/config.js"></script>\n' + marker)

    # nothing to install when you are already installed
    page = page.replace('<link rel="manifest" href="/static/manifest.json">', "")

    (WWW / "index.html").write_text(page)

    files = sorted(p.relative_to(WWW).as_posix() for p in WWW.rglob("*") if p.is_file())
    return files


if __name__ == "__main__":
    files = build()
    print("built mobile/www with %d files, pointing at %s" % (len(files), SERVER))
    for f in files:
        print("  ", f)

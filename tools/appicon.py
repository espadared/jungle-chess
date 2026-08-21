"""Render the store icon and launch screen from the game's own artwork.

Uses the tiger piece so the icon matches what people see on the board. Drawn
through QuickLook, which maps a page of N CSS pixels onto an N pixel thumbnail
one-for-one - so the page is built at exactly the size wanted.

Run:  python3 tools/appicon.py     (from the project root)
"""

import pathlib
import re
import shutil
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "mobile" / "assets"

PAGE = """<html><head><meta charset="utf-8"><style>
html,body{{margin:0;width:{size}px;height:{size}px;overflow:hidden}}
.bg{{width:{size}px;height:{size}px;
  background:radial-gradient(120% 110% at 32% 22%,#28674a 0%,#123024 55%,#0b1a14 100%);
  display:flex;align-items:center;justify-content:center}}
.pc{{width:{art}px;height:{art}px;border-radius:50%%;
  box-shadow:0 {sh}px {sh2}px rgba(0,0,0,.45)}}
</style></head><body>
{sprite}
<div class="bg"><svg class="pc" viewBox="0 0 64 64"><use href="#pc_f6"/></svg></div>
</body></html>"""


def sprite():
    page = (ROOT / "static" / "index.html").read_text()
    start = page.index("<svg width=\"0\"")
    end = page.index("</svg>", start) + len("</svg>")
    # it is hidden in the game; here it has to actually draw
    return page[start:end].replace('width="0" height="0"', 'width="0" height="0"', 1)


def render(size, art_fraction, out_path):
    """Draw the page at exactly `size`, then make sure that is what came out."""
    art = int(size * art_fraction)
    html = PAGE.format(size=size, art=art, sprite=sprite(),
                       sh=int(size * 0.01), sh2=int(size * 0.02))
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        src = tmp / "icon.html"
        src.write_text(html)
        subprocess.run(["qlmanage", "-t", "-s", str(size), "-o", str(tmp), str(src)],
                       capture_output=True, check=True)
        shot = tmp / "icon.html.png"
        if not shot.exists():
            raise SystemExit("QuickLook produced nothing for %s" % out_path.name)
        shutil.copy2(shot, out_path)

    # QuickLook caps very large thumbnails, so check rather than trust
    got = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(out_path)],
                         capture_output=True, text=True).stdout
    dims = [int(w) for w in re.findall(r"pixel(?:Width|Height): (\d+)", got)]
    if dims and (dims[0] != size or dims[1] != size):
        subprocess.run(["sips", "-z", str(size), str(size), str(out_path)],
                       capture_output=True, check=True)
        print("  (%s came out %dx%d, resized)" % (out_path.name, dims[0], dims[1]))


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    # icon: the piece nearly fills it, the way app icons usually sit
    render(1024, 0.74, OUT / "icon.png")
    # launch screen: same art, far more breathing room, square so it works
    # in both orientations
    render(2732, 0.26, OUT / "splash.png")
    # the dark launch screen is the same picture - the background already suits
    shutil.copy2(OUT / "splash.png", OUT / "splash-dark.png")
    for f in sorted(OUT.glob("*.png")):
        print("  %-18s %s" % (f.name, f.stat().st_size))

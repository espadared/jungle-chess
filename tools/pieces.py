"""Generate the Jungle piece artwork.

One definition per animal, emitted twice: flat cartoon colour, and a glossy
"toy" treatment that adds a radial gradient plus a highlight to the big shapes.
Roles (base/dark/light/accent) pick colours from each animal's palette so a
whole animal can be recoloured by changing one line.
"""

ANIMALS = {
    1: dict(name="rat", base="#a8b4c0", dark="#59636f", light="#eef3f7", accent="#f4a8b7",
            shapes=[
                ("circle", 'cx="15" cy="20" r="12"', "base"),
                ("circle", 'cx="49" cy="20" r="12"', "base"),
                ("circle", 'cx="15" cy="20" r="7"', "accent"),
                ("circle", 'cx="49" cy="20" r="7"', "accent"),
                ("ellipse", 'cx="32" cy="36" rx="17.5" ry="16"', "head"),
                ("ellipse", 'cx="32" cy="48" rx="10" ry="8.5"', "light"),
                ("EYES", "24.5 34 39.5 34 3.9", ""),
                ("ellipse", 'cx="32" cy="46" rx="3.6" ry="2.8"', "accent"),
            ]),
    2: dict(name="cat", base="#f2a03f", dark="#8a4a12", light="#fff3df", accent="#f58fa8",
            shapes=[
                ("path", 'd="M13 31 L15 8 L34 21 Z"', "base"),
                ("path", 'd="M51 31 L49 8 L30 21 Z"', "base"),
                ("path", 'd="M18 26 L19.5 15 L28 22 Z"', "accent"),
                ("path", 'd="M46 26 L44.5 15 L36 22 Z"', "accent"),
                ("ellipse", 'cx="32" cy="37" rx="20" ry="17.5"', "head"),
                ("ellipse", 'cx="32" cy="45" rx="12" ry="9"', "light"),
                ("EYES", "24 34 40 34 4.2", ""),
                ("path", 'd="M32 41.5 l3.6 3.2 -3.6 2.8 -3.6 -2.8 Z"', "accent"),
                ("rect", 'x="9" y="43" width="11" height="2" rx="1" transform="rotate(-8 14 44)"', "dark"),
                ("rect", 'x="9" y="48" width="11" height="2" rx="1" transform="rotate(6 14 49)"', "dark"),
                ("rect", 'x="44" y="43" width="11" height="2" rx="1" transform="rotate(8 50 44)"', "dark"),
                ("rect", 'x="44" y="48" width="11" height="2" rx="1" transform="rotate(-6 50 49)"', "dark"),
            ]),
    3: dict(name="dog", base="#c98a4b", dark="#7a4a1e", light="#fbeedd", accent="#3d2a1c",
            shapes=[
                ("ellipse", 'cx="11" cy="36" rx="8.5" ry="17"', "dark"),
                ("ellipse", 'cx="53" cy="36" rx="8.5" ry="17"', "dark"),
                ("ellipse", 'cx="32" cy="34" rx="18.5" ry="17"', "head"),
                ("ellipse", 'cx="32" cy="47" rx="13" ry="10.5"', "light"),
                ("EYES", "24.5 31 39.5 31 4", ""),
                ("ellipse", 'cx="32" cy="43" rx="4.6" ry="3.6"', "accent"),
                ("path", 'd="M32 47 v4"', "STROKE-accent-2"),
            ]),
    4: dict(name="wolf", base="#8496a8", dark="#4a5766", light="#e8eef4", accent="#2b3440",
            shapes=[
                ("path", 'd="M9 29 L14 3 L32 19 Z"', "base"),
                ("path", 'd="M55 29 L50 3 L32 19 Z"', "base"),
                ("path", 'd="M15 25 L17.5 12 L26 20 Z"', "dark"),
                ("path", 'd="M49 25 L46.5 12 L38 20 Z"', "dark"),
                ("path", 'd="M32 16 L52 26 L46 45 L32 58 L18 45 L12 26 Z"', "head"),
                ("path", 'd="M32 34 L44 40 L32 56 L20 40 Z"', "light"),
                ("EYES", "23.5 33 40.5 33 3.9", ""),
                ("path", 'd="M32 41 l4.2 3.6 -4.2 3.2 -4.2 -3.2 Z"', "accent"),
            ]),
    5: dict(name="leopard", base="#f0c04a", dark="#4a3410", light="#fdf1cf", accent="#e08a6a",
            shapes=[
                ("circle", 'cx="15" cy="17" r="8.5"', "base"),
                ("circle", 'cx="49" cy="17" r="8.5"', "base"),
                ("circle", 'cx="15" cy="17" r="4.4"', "dark"),
                ("circle", 'cx="49" cy="17" r="4.4"', "dark"),
                ("ellipse", 'cx="32" cy="37" rx="20" ry="18"', "head"),
                ("circle", 'cx="16" cy="30" r="3.1"', "dark"),
                ("circle", 'cx="19" cy="42" r="3.1"', "dark"),
                ("circle", 'cx="48" cy="30" r="3.1"', "dark"),
                ("circle", 'cx="45" cy="42" r="3.1"', "dark"),
                ("circle", 'cx="32" cy="22" r="3.1"', "dark"),
                ("circle", 'cx="23" cy="51" r="2.7"', "dark"),
                ("circle", 'cx="41" cy="51" r="2.7"', "dark"),
                ("ellipse", 'cx="32" cy="45" rx="11" ry="8.5"', "light"),
                ("EYES", "24 34 40 34 4.2", ""),
                ("path", 'd="M32 42 l3.6 3.2 -3.6 2.8 -3.6 -2.8 Z"', "accent"),
            ]),
    6: dict(name="tiger", base="#f4842c", dark="#2a1a0e", light="#fff1e0", accent="#e06a4a",
            shapes=[
                ("circle", 'cx="14" cy="18" r="9"', "base"),
                ("circle", 'cx="50" cy="18" r="9"', "base"),
                ("circle", 'cx="14" cy="18" r="4.6"', "dark"),
                ("circle", 'cx="50" cy="18" r="4.6"', "dark"),
                ("ellipse", 'cx="32" cy="37" rx="20.5" ry="18.5"', "head"),
                ("rect", 'x="30.4" y="19" width="3.2" height="10" rx="1.6"', "dark"),
                ("rect", 'x="21.5" y="21" width="3" height="8.5" rx="1.5" transform="rotate(-16 23 25)"', "dark"),
                ("rect", 'x="39.5" y="21" width="3" height="8.5" rx="1.5" transform="rotate(16 41 25)"', "dark"),
                ("rect", 'x="12" y="34" width="8.5" height="3" rx="1.5"', "dark"),
                ("rect", 'x="12" y="41" width="8.5" height="3" rx="1.5"', "dark"),
                ("rect", 'x="43.5" y="34" width="8.5" height="3" rx="1.5"', "dark"),
                ("rect", 'x="43.5" y="41" width="8.5" height="3" rx="1.5"', "dark"),
                ("ellipse", 'cx="32" cy="45" rx="12" ry="9"', "light"),
                ("EYES", "24 34 40 34 4.2", ""),
                ("path", 'd="M32 42 l3.8 3.2 -3.8 2.8 -3.8 -2.8 Z"', "accent"),
            ]),
    7: dict(name="lion", base="#f6c453", dark="#a4611c", light="#fff0cf", accent="#c4713a",
            shapes=[
                ("MANE", "", ""),
                ("circle", 'cx="32" cy="34" r="17.5"', "head"),
                ("ellipse", 'cx="32" cy="42" rx="11" ry="8"', "light"),
                ("EYES", "25.5 32 38.5 32 4", ""),
                ("path", 'd="M32 39 l3.6 3.2 -3.6 2.8 -3.6 -2.8 Z"', "accent"),
            ]),
    8: dict(name="elephant", base="#94a6b8", dark="#5b6b7c", light="#fdfaf2", accent="#f0a5b4",
            shapes=[
                ("ellipse", 'cx="11" cy="29" rx="12.5" ry="18"', "base"),
                ("ellipse", 'cx="53" cy="29" rx="12.5" ry="18"', "base"),
                ("ellipse", 'cx="11" cy="30" rx="6.5" ry="11"', "accent"),
                ("ellipse", 'cx="53" cy="30" rx="6.5" ry="11"', "accent"),
                ("ellipse", 'cx="32" cy="29" rx="15.5" ry="16.5"', "head"),
                ("path", 'd="M22 42 q-4 8 -0.5 12.5 q1.5 -7 5 -9.5 Z"', "light"),
                ("path", 'd="M42 42 q4 8 0.5 12.5 q-1.5 -7 -5 -9.5 Z"', "light"),
                ("TRUNK", "", ""),
                ("EYES", "24.5 26 39.5 26 3.6", ""),
            ]),
}


def lighten(hex_colour, amount=0.34):
    h = hex_colour.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    r = int(r + (255 - r) * amount)
    g = int(g + (255 - g) * amount)
    b = int(b + (255 - b) * amount)
    return "#%02x%02x%02x" % (r, g, b)


def darken(hex_colour, amount=0.18):
    h = hex_colour.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return "#%02x%02x%02x" % (int(r * (1 - amount)), int(g * (1 - amount)), int(b * (1 - amount)))


def build(rank, glossy):
    a = ANIMALS[rank]
    pid = ("g" if glossy else "f") + str(rank)
    colours = {"base": a["base"], "dark": a["dark"], "light": a["light"], "accent": a["accent"]}
    out = []
    defs = []

    if glossy:
        defs.append(
            '<radialGradient id="grad%d" cx="35%%" cy="28%%" r="78%%">'
            '<stop offset="0" stop-color="%s"/><stop offset="1" stop-color="%s"/>'
            '</radialGradient>' % (rank, lighten(a["base"], 0.42), darken(a["base"], 0.12))
        )

    head_fill = 'url(#grad%d)' % rank if glossy else a["base"]

    # cream medallion so colourful animals read on a red or dark token
    out.append('<circle cx="32" cy="32" r="32" fill="%s"/>' %
               ('url(#medal)' if glossy else '#fdf7ec'))

    for tag, attrs, role in a["shapes"]:
        if tag == "EYES":
            lx, ly, rx, ry, r = attrs.split()
            lx, ly, rx, ry, r = float(lx), float(ly), float(rx), float(ry), float(r)
            for (ex, ey) in ((lx, ly), (rx, ry)):
                out.append('<ellipse cx="%g" cy="%g" rx="%g" ry="%g" fill="#fff"/>'
                           % (ex, ey, r, r * 1.12))
                out.append('<circle cx="%g" cy="%g" r="%g" fill="#241c16"/>'
                           % (ex, ey + r * 0.16, r * 0.62))
                out.append('<circle cx="%g" cy="%g" r="%g" fill="#fff"/>'
                           % (ex + r * 0.3, ey - r * 0.34, r * 0.24))
            continue
        if tag == "MANE":
            mane = darken(a["accent"], 0.0)
            ring = 'url(#grad%d)' % rank if glossy else a["accent"]
            for i in range(12):
                import math
                ang = math.pi * 2 * i / 12
                cx = 32 + math.cos(ang) * 22
                cy = 32 + math.sin(ang) * 22
                out.append('<circle cx="%.1f" cy="%.1f" r="10" fill="%s"/>' % (cx, cy, a["accent"]))
            out.append('<circle cx="32" cy="32" r="23" fill="%s"/>' % a["accent"])
            continue
        if tag == "TRUNK":
            out.append('<path d="M32 38 C32 47 28 51 30.5 58" fill="none" stroke="%s" '
                       'stroke-width="11" stroke-linecap="round"/>' % head_fill)
            continue
        if role.startswith("STROKE-"):
            _, which, width = role.split("-")
            out.append('<path %s fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round"/>'
                       % (attrs, colours[which], width))
            continue
        fill = head_fill if role == "head" else colours.get(role, role)
        out.append('<%s %s fill="%s"/>' % (tag, attrs, fill))
        if role == "head" and glossy:
            # a soft highlight, so the head reads as rounded
            out.append('<ellipse cx="25" cy="24" rx="9" ry="6" fill="#fff" opacity=".30" '
                       'transform="rotate(-22 25 24)"/>')

    body = "\n    ".join(out)
    return defs, '  <symbol id="pc_%s" viewBox="0 0 64 64">\n    %s\n  </symbol>' % (pid, body)


def sprite():
    all_defs = ['<radialGradient id="medal" cx="38%" cy="30%" r="80%">'
                '<stop offset="0" stop-color="#fffdf7"/><stop offset="1" stop-color="#f2e6d2"/>'
                '</radialGradient>']
    syms = []
    for glossy in (False, True):
        for rank in range(1, 9):
            d, s = build(rank, glossy)
            all_defs += d
            syms.append(s)
    return ('<svg width="0" height="0" aria-hidden="true" '
            'style="position:absolute;overflow:hidden">\n  <defs>\n    '
            + "\n    ".join(all_defs) + "\n  </defs>\n" + "\n".join(syms) + "\n</svg>")


NAMES = {1: "rat 1", 2: "cat 2", 3: "dog 3", 4: "wolf 4",
         5: "leopard 5", 6: "tiger 6", 7: "lion 7", 8: "elephant 8"}


def row(prefix, side, size):
    cells = []
    for r in range(8, 0, -1):
        cells.append('<div class="tok %s %s"><svg viewBox="0 0 64 64">'
                     '<use href="#pc_%s%d"/></svg><b>%d</b></div>' % (side, size, prefix, r, r))
    return '<div class="row">' + "".join(cells) + "</div>"


html = """<html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1100px;background:#16382a;font:15px -apple-system,sans-serif;color:#eaf5ee}
.row{display:flex;gap:12px;padding:8px 18px;align-items:center}
.tok{width:74px;height:74px;border-radius:50%%;position:relative;
  display:flex;align-items:center;justify-content:center;box-shadow:0 2px 5px rgba(0,0,0,.45)}
.tok svg{width:100%%;height:100%%;border-radius:50%%}
.red{border:4px solid #e04a3c}
.blk{border:4px solid #232c36}
.sm{width:36px;height:36px;border-width:2.5px}
.tok b{position:absolute;right:-2px;bottom:-2px;background:#fff;color:#1b1b1b;
  border-radius:50%%;width:17px;height:17px;font-size:11px;display:flex;
  align-items:center;justify-content:center}
.sm b{width:12px;height:12px;font-size:8px;right:-1px;bottom:-1px}
h3{margin:14px 18px 2px;color:#f4c95d;font-size:17px}
p.n{margin:0 18px;color:#9fc0ae;font-size:13px}
</style></head><body>
%s
<h3>Option A &mdash; flat cartoon colour</h3>
<p class="n">Red side, then black side. Big eyes, bold shapes, one flat colour per area.</p>
%s
%s
<h3>Option B &mdash; glossy, shaded like a toy</h3>
<p class="n">Same drawings with a rounded gradient and a highlight, so each piece looks moulded.</p>
%s
%s
<h3>Actual size on a phone</h3>
<p class="n">Flat on top, glossy below.</p>
%s
%s
</body></html>""" % (
    sprite(),
    row("f", "red", ""), row("f", "blk", ""),
    row("g", "red", ""), row("g", "blk", ""),
    row("f", "red", "sm"), row("g", "red", "sm"),
)

import pathlib
pathlib.Path("preview.html").write_text(html)
print("wrote preview.html")

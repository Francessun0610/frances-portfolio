#!/usr/bin/env python3
"""Build the render-only font set used to export the slide decks.

Why this exists
---------------
The decks are typeset in Raleway (plus Onest and Play). Those fonts are not
installed on this machine, and the copies embedded in the .pptx are
MicroType-Express-compressed EOT, which no available tool can decompress. With
the real fonts missing, the renderer substitutes a wider face, text that fit on
one line wraps to two, and `spAutoFit` text boxes overflow downward onto the
logos beneath them.

PowerPoint references several Raleway weights as *distinct family names*
("Raleway SemiBold", "Raleway Medium", ...), which is how static font files
register on Windows. Google ships Raleway and Onest only as variable fonts, so
this script pins each required weight to a static instance and rewrites the
name table to match the family names the decks ask for.

Nothing is installed system-wide. The output directory is handed to
LibreOffice through OSFONTDIR for the duration of the export only.

    python3 scripts/process-presentations/build_render_fonts.py
"""

import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FONT_DIR = Path(__file__).resolve().parent / "fonts"
SRC = FONT_DIR / "_src"

WINDOWS = (3, 1, 0x409)
MAC = (1, 0, 0)

# PowerPoint references several Raleway weights as separate family names, and
# every run on the affected slides also carries b="1". A family with no bold
# member makes the renderer synthesise bold, which widens glyphs just enough to
# rewrap a line. So each family gets a real bold member too.
#
# (family, upright weight, bold-member weight)
RALEWAY_FAMILIES = [
    ("Raleway Light", 300, 400),
    ("Raleway", 400, 700),
    ("Raleway Medium", 500, 600),
    ("Raleway SemiBold", 600, 700),
    ("Raleway ExtraBold", 800, 900),
]

ONEST_FAMILIES = [("Onest", 400, 700)]

STATIC_PASSTHROUGH = ["Play-Regular.ttf", "Play-Bold.ttf"]

# The Walt Disney Company's corporate family, supplied by Frances. Already
# shipped as static faces with correct family names, so they are copied through
# untouched. Deliberately no synthesised bold member is added: the deck's
# embedded font list carries only InspireTWDC regular and italic, so PowerPoint
# has no bold face either and emboldens algorithmically. Adding one here would
# diverge from what PowerPoint draws.
INSPIRE_DIR = SRC / "inspire"


def set_name(font, name_id, value):
    for platform_id, encoding_id, language_id in (WINDOWS, MAC):
        font["name"].setName(value, name_id, platform_id, encoding_id, language_id)


def build_instance(source, weight, family, subfamily, weight_class):
    font = TTFont(SRC / source)
    instancer.instantiateVariableFont(font, {"wght": weight}, inplace=True, updateFontNames=False)

    italic = "Italic" in subfamily
    bold = "Bold" in subfamily

    full = family if subfamily == "Regular" else f"{family} {subfamily}"
    postscript = f"{family}-{subfamily}".replace(" ", "")

    set_name(font, 1, family)
    set_name(font, 2, subfamily)
    set_name(font, 3, f"{postscript}; render-only instance")
    set_name(font, 4, full)
    set_name(font, 6, postscript)

    # Drop the typographic family names. Without them the legacy family name
    # (id 1) is the only match, which is exactly what "Raleway SemiBold" in the
    # .pptx needs to resolve against.
    for name_id in (16, 17, 21, 22):
        font["name"].removeNames(nameID=name_id)

    os2 = font["OS/2"]
    os2.usWeightClass = weight_class
    # fsSelection: bit0 italic, bit5 bold, bit6 regular
    selection = os2.fsSelection & ~(1 | (1 << 5) | (1 << 6))
    if italic:
        selection |= 1
    if bold:
        selection |= 1 << 5
    if not italic and not bold:
        selection |= 1 << 6
    os2.fsSelection = selection

    head = font["head"]
    style = head.macStyle & ~(1 | 2)
    if bold:
        style |= 1
    if italic:
        style |= 2
    head.macStyle = style

    out = FONT_DIR / f"{postscript}.ttf"
    font.save(out)
    font.close()
    return out, full


def expand(source_upright, source_italic, families):
    """Each family gets Regular, Bold, Italic and Bold Italic members."""
    specs = []
    for family, weight, bold_weight in families:
        specs.append((source_upright, weight, family, "Regular", weight))
        specs.append((source_upright, bold_weight, family, "Bold", bold_weight))
        if source_italic:
            specs.append((source_italic, weight, family, "Italic", weight))
            specs.append((source_italic, bold_weight, family, "Bold Italic", bold_weight))
    return specs


def main():
    if not SRC.exists():
        sys.exit(f"Missing source fonts at {SRC}. See fonts/README.md.")

    FONT_DIR.mkdir(parents=True, exist_ok=True)
    for pattern in ("*.ttf", "*.otf"):
        for stale in FONT_DIR.glob(pattern):
            stale.unlink()

    specs = expand("Raleway[wght].ttf", "Raleway-Italic[wght].ttf", RALEWAY_FAMILIES)
    specs += expand("Onest[wght].ttf", None, ONEST_FAMILIES)

    built = []
    for spec in specs:
        out, full = build_instance(*spec)
        built.append((out.name, full, out.stat().st_size))

    passthrough = [SRC / name for name in STATIC_PASSTHROUGH]
    if INSPIRE_DIR.exists():
        passthrough += sorted(INSPIRE_DIR.glob("*.otf"))

    for source in passthrough:
        if not source.exists():
            print(f"  ! missing {source.name}")
            continue
        target = FONT_DIR / source.name
        target.write_bytes(source.read_bytes())
        font = TTFont(target, lazy=True)
        family = font["name"].getDebugName(1)
        font.close()
        built.append((target.name, family, target.stat().st_size))

    print(f"Built {len(built)} render fonts in {FONT_DIR.relative_to(Path.cwd())}\n")
    print(f"  {'family':<24}{'style':<14}{'weight':>7}   file")
    faces = sorted(list(FONT_DIR.glob("*.ttf")) + list(FONT_DIR.glob("*.otf")))
    for path in faces:
        font = TTFont(path, lazy=True)
        name = font["name"]
        print(
            f"  {str(name.getDebugName(1)):<24}{str(name.getDebugName(2)):<14}"
            f"{font['OS/2'].usWeightClass:>7}   {path.name}"
        )
        font.close()

    inspire = sorted(FONT_DIR.glob("Inspire*"))
    print(f"\nInspireTWDC: {len(inspire)} faces present" if inspire else "\nInspireTWDC: NOT present")


if __name__ == "__main__":
    main()

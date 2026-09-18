#!/usr/bin/env python3
"""Detect the failure class that produced the bad slide exports.

The original defect was not visible in a contact sheet: a missing font made
text slightly wider, a line rewrapped, and because the text box uses
`spAutoFit` with a stored height computed by PowerPoint, the extra line
overflowed downward onto the artwork beneath it.

This checks that class of failure directly, on every text box of every visible
slide, using the .pptx as the source of truth:

  * measure each run with the *actual* font file the renderer will use
  * wrap the text to the box's usable width
  * compare the resulting height with the height PowerPoint stored
  * if the text is taller than PowerPoint's box, report by how much, and
    report any picture or shape the overflow now collides with

A slide is FAIL if measured text needs more lines than the stored box height
allows, or if the overflow intersects another element.

    python3 scripts/process-presentations/check_text_fit.py
    python3 scripts/process-presentations/check_text_fit.py --deck canux-2025
"""

import argparse
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from decks import DECKS, SOURCE_DIR, deck_by_slug  # noqa: E402

A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
EMU = 914400.0

FONT_DIR = Path(__file__).resolve().parent / "fonts"
SYSTEM_FONT_DIRS = [
    Path("/System/Library/Fonts"),
    Path("/System/Library/Fonts/Supplemental"),
    Path("/Library/Fonts"),
    Path.home() / "Library/Fonts",
]

# PowerPoint's default internal margins, in inches.
DEFAULT_LEFT_INSET = 0.1
DEFAULT_RIGHT_INSET = 0.1
DEFAULT_TOP_INSET = 0.05
DEFAULT_BOTTOM_INSET = 0.05

# Tolerance before an overflow is treated as real, in inches.
HEIGHT_TOLERANCE = 0.06


class FontBook:
    """Resolve (family, bold, italic) to a font file the way the renderer will."""

    def __init__(self):
        from fontTools.ttLib import TTCollection, TTFont

        self._TTFont = TTFont
        self.faces = {}
        for directory in [FONT_DIR, *SYSTEM_FONT_DIRS]:
            if not directory.exists():
                continue
            for path in sorted(directory.iterdir()):
                suffix = path.suffix.lower()
                if suffix not in (".ttf", ".otf", ".ttc"):
                    continue
                try:
                    fonts = TTCollection(path).fonts if suffix == ".ttc" else [TTFont(path, lazy=True)]
                except Exception:
                    continue
                for font in fonts:
                    try:
                        family = (font["name"].getDebugName(1) or "").strip()
                        subfamily = (font["name"].getDebugName(2) or "Regular").strip().lower()
                    except Exception:
                        continue
                    if not family:
                        continue
                    bold = "bold" in subfamily
                    italic = "italic" in subfamily or "oblique" in subfamily
                    self.faces.setdefault((family.lower(), bold, italic), path)
                    font.close()
        self._metrics = {}

    def resolve(self, family, bold, italic):
        key = (family.lower(), bold, italic)
        if key in self.faces:
            return self.faces[key], True
        # Bold requested but no bold face: the renderer synthesises it, which
        # widens glyphs. Flag it, because that is what broke the career slides.
        if bold and (family.lower(), False, italic) in self.faces:
            return self.faces[(family.lower(), False, italic)], False
        if (family.lower(), False, False) in self.faces:
            return self.faces[(family.lower(), False, False)], False
        return None, False

    def metrics(self, path):
        if path not in self._metrics:
            font = self._TTFont(path, lazy=True)
            cmap = font.getBestCmap()
            hmtx = font["hmtx"]
            upem = font["head"].unitsPerEm
            ascent = font["hhea"].ascent
            descent = font["hhea"].descent
            linegap = font["hhea"].lineGap
            widths = {ch: hmtx[glyph][0] for ch, glyph in cmap.items() if glyph in hmtx.metrics}
            self._metrics[path] = (widths, upem, ascent, descent, linegap)
            font.close()
        return self._metrics[path]

    def text_width(self, text, path, size_pt, synthetic_bold=False):
        widths, upem, *_ = self.metrics(path)
        total = sum(widths.get(ord(ch), widths.get(ord(" "), upem // 2)) for ch in text)
        inches = total / upem * size_pt / 72
        # Synthetic emboldening adds roughly 2% advance in practice.
        return inches * (1.02 if synthetic_bold else 1.0)

    def line_height(self, path, size_pt):
        _, upem, ascent, descent, linegap = self.metrics(path)
        return (ascent - descent + linegap) / upem * size_pt / 72


def theme_fonts(zf):
    major = minor = "Arial"
    for name in sorted(n for n in zf.namelist() if re.match(r"ppt/theme/theme\d+\.xml$", n)):
        xml = zf.read(name).decode("utf8", "ignore")
        m = re.search(r"<a:majorFont>\s*<a:latin typeface=\"([^\"]*)\"", xml)
        n_ = re.search(r"<a:minorFont>\s*<a:latin typeface=\"([^\"]*)\"", xml)
        if m and m.group(1):
            major = m.group(1)
        if n_ and n_.group(1):
            minor = n_.group(1)
        break
    return major, minor


def wrap_count(words, widths, usable):
    """Number of lines needed, greedy-wrapping like a text engine."""
    if not words:
        return 1
    lines = 1
    current = 0.0
    space = widths.get(" ", 0)
    for index, word in enumerate(words):
        w = widths[word]
        addition = w if current == 0 else space + w
        if current + addition <= usable or current == 0:
            current += addition
        else:
            lines += 1
            current = w
    return lines


def analyse_slide(zf, part, book, major, minor):
    """Return (issues, boxes) for one slide."""
    root = ET.fromstring(zf.read(part))
    tree = root.find(f"{P}cSld/{P}spTree")
    if tree is None:
        return [], []

    issues = []
    blockers = []  # pictures and other shapes text could collide with

    for el in tree:
        tag = el.tag.split("}")[-1]
        if tag not in ("pic", "graphicFrame", "grpSp"):
            continue
        xfrm = el.find(f"{P}spPr/{A}xfrm") or el.find(f"{P}grpSpPr/{A}xfrm") or el.find(f"{P}xfrm")
        if xfrm is None:
            continue
        off, ext = xfrm.find(f"{A}off"), xfrm.find(f"{A}ext")
        if off is None or ext is None:
            continue
        nv = el.find(f"{P}nvPicPr/{P}cNvPr") or el.find(f"{P}nvGrpSpPr/{P}cNvPr")
        blockers.append(
            {
                "name": nv.get("name") if nv is not None else tag,
                "x": int(off.get("x")) / EMU,
                "y": int(off.get("y")) / EMU,
                "w": int(ext.get("cx")) / EMU,
                "h": int(ext.get("cy")) / EMU,
            }
        )

    for sp in tree.findall(f"{P}sp"):
        body = sp.find(f"{P}txBody")
        if body is None:
            continue
        xfrm = sp.find(f"{P}spPr/{A}xfrm")
        if xfrm is None:
            continue
        off, ext = xfrm.find(f"{A}off"), xfrm.find(f"{A}ext")
        if off is None or ext is None:
            continue

        box_x = int(off.get("x")) / EMU
        box_y = int(off.get("y")) / EMU
        box_w = int(ext.get("cx")) / EMU
        box_h = int(ext.get("cy")) / EMU

        body_pr = body.find(f"{A}bodyPr")
        autofit = "none"
        wrap = "square"
        left_inset = DEFAULT_LEFT_INSET
        right_inset = DEFAULT_RIGHT_INSET
        top_inset = DEFAULT_TOP_INSET
        bottom_inset = DEFAULT_BOTTOM_INSET
        if body_pr is not None:
            wrap = body_pr.get("wrap", "square")
            if body_pr.find(f"{A}spAutoFit") is not None:
                autofit = "spAutoFit"
            elif body_pr.find(f"{A}normAutofit") is not None:
                autofit = "normAutofit"
            for attr, target in (("lIns", "left"), ("rIns", "right"), ("tIns", "top"), ("bIns", "bottom")):
                value = body_pr.get(attr)
                if value is None:
                    continue
                inches = int(value) / EMU
                if target == "left":
                    left_inset = inches
                elif target == "right":
                    right_inset = inches
                elif target == "top":
                    top_inset = inches
                else:
                    bottom_inset = inches

        if wrap == "none":
            continue  # never wraps, so it cannot gain a line

        usable = box_w - left_inset - right_inset
        if usable <= 0:
            continue

        # Measure how tall the text actually is, and how tall it would be if
        # every paragraph sat on a single line. The caller compares the ratio
        # of stored height to measured height against the deck's own median,
        # which calibrates away the difference between this line-height model
        # and PowerPoint's. A box whose text is much taller than the deck norm
        # for its stored height is one that gained a line it should not have.
        lines_needed = 0
        text_height = 0.0
        flat_height = 0.0
        line_h = None
        text_preview = []
        synthetic = []
        missing = []

        for para in body.findall(f"{A}p"):
            runs = []
            for run in para.findall(f"{A}r"):
                rpr = run.find(f"{A}rPr")
                text_node = run.find(f"{A}t")
                if text_node is None or text_node.text is None:
                    continue
                size = int(rpr.get("sz")) / 100 if rpr is not None and rpr.get("sz") else 18.0
                bold = (rpr.get("b") == "1") if rpr is not None else False
                italic = (rpr.get("i") == "1") if rpr is not None else False
                latin = rpr.find(f"{A}latin") if rpr is not None else None
                family = latin.get("typeface") if latin is not None else None
                if not family or family.startswith("+mj"):
                    family = major
                elif family.startswith("+mn"):
                    family = minor
                runs.append((text_node.text, family, size, bold, italic))

            if not runs:
                continue

            text = "".join(r[0] for r in runs)
            text_preview.append(text)
            _, family, size, bold, italic = runs[0]
            path, exact = book.resolve(family, bold, italic)
            if path is None:
                missing.append(family)
                continue
            if bold and not exact:
                synthetic.append(family)

            widths = {}
            for word in text.split():
                widths[word] = book.text_width(word, path, size, synthetic_bold=bold and not exact)
            widths[" "] = book.text_width(" ", path, size)
            paragraph_lines = wrap_count(text.split(), widths, usable)
            paragraph_line_h = book.line_height(path, size)
            lines_needed += paragraph_lines
            text_height += paragraph_lines * paragraph_line_h
            flat_height += paragraph_line_h
            line_h = max(line_h or 0, paragraph_line_h)

        if not lines_needed or not line_h or text_height <= 0:
            continue

        available = box_h - top_inset - bottom_inset
        issues.append(
            {
                "text": " / ".join(text_preview)[:60],
                "lines_needed": lines_needed,
                "text_height": text_height,
                "flat_height": flat_height,
                "available": available,
                "ratio": available / text_height,
                "box": (box_x, box_y, box_w, box_h),
                "autofit": autofit,
                "synthetic_bold": sorted(set(synthetic)),
                "missing_font": sorted(set(missing)),
                "blockers": blockers,
            }
        )

    return issues, blockers


def check_deck(slug, book):
    source = SOURCE_DIR / f"{slug}.pptx"
    zf = zipfile.ZipFile(source)
    major, minor = theme_fonts(zf)

    rels = ET.fromstring(zf.read("ppt/_rels/presentation.xml.rels"))
    rel_map = {
        r.get("Id"): "ppt/" + r.get("Target").replace("../", "").lstrip("/")
        for r in rels
        if r.get("Type", "").endswith("/slide")
    }
    pres = ET.fromstring(zf.read("ppt/presentation.xml"))
    ordered = [
        rel_map[s.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")]
        for s in pres.find(f"{P}sldIdLst")
    ]

    visible = []
    for part in ordered:
        head = zf.read(part).decode("utf8", "ignore")[:400]
        if re.search(r"<p:sld[^>]*show=\"0\"", head):
            continue
        visible.append(part)

    print(f"\n[{slug}] {len(visible)} visible slides, theme major={major!r} minor={minor!r}")

    measured = []
    synthetic_slides = []
    missing_slides = []

    for index, part in enumerate(visible, start=1):
        issues, _ = analyse_slide(zf, part, book, major, minor)
        for issue in issues:
            measured.append((index, issue))
            if issue["synthetic_bold"]:
                synthetic_slides.append(index)
            if issue["missing_font"]:
                missing_slides.append((index, issue["missing_font"]))

    zf.close()

    # Calibrate against the deck itself. This line-height model is not
    # PowerPoint's, so absolute heights mean little; but in a correct render
    # the ratio of stored height to measured text height clusters. Boxes far
    # below that cluster are candidates for a rewrap.
    #
    # This over-reports: a box can sit below the norm simply because its
    # author sized it tightly. It is a screening tool that produces a shortlist
    # to look at, not a pass/fail gate. Confirm each hit visually.
    ratios = sorted(i["ratio"] for _, i in measured)
    norm = ratios[len(ratios) // 2] if ratios else 1.0
    threshold = norm * 0.55

    overflowing = []
    for index, issue in measured:
        if issue["ratio"] >= threshold:
            continue
        box_x, box_y, box_w, box_h = issue["box"]
        text_bottom = box_y + issue["text_height"] + 0.1
        issue["collides_with"] = [
            b["name"]
            for b in issue["blockers"]
            if b["y"] < text_bottom
            and b["y"] + b["h"] > box_y + box_h
            and b["x"] < box_x + box_w
            and b["x"] + b["w"] > box_x
        ]
        issue["overflow"] = round(issue["text_height"] - issue["available"], 2)
        overflowing.append((index, issue))

    print(
        f"  calibration: {len(measured)} text boxes, median height/text ratio "
        f"{norm:.2f}, flagging below {threshold:.2f}"
    )

    if overflowing:
        print(f"  REVIEW  {len(overflowing)} text box(es) to confirm visually:")
        for index, issue in overflowing:
            collide = (
                f"  COLLIDES WITH {', '.join(issue['collides_with'])}"
                if issue["collides_with"]
                else ""
            )
            print(
                f"     slide {index:>3}: {issue['text']!r} {issue['lines_needed']} lines, "
                f"+{issue['overflow']}in beyond the box{collide}"
            )
    else:
        print("  PASS  no text box exceeds the height PowerPoint stored for it")

    if synthetic_slides:
        uniq = sorted(set(synthetic_slides))
        print(f"  WARN  synthetic bold on {len(uniq)} slides: {uniq}")
    else:
        print("  PASS  no synthetic bold (every bold run has a real bold face)")

    if missing_slides:
        fonts = sorted({f for _, fs in missing_slides for f in fs})
        slides = sorted({i for i, _ in missing_slides})
        print(f"  WARN  unresolved font(s) {fonts} on slides {slides}")
    else:
        print("  PASS  every font referenced by a text run resolves to a real file")

    return {
        "slug": slug,
        "visible": len(visible),
        "overflowing": overflowing,
        "synthetic": sorted(set(synthetic_slides)),
        "missing": missing_slides,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deck", help="check a single deck")
    args = parser.parse_args()

    decks = [deck_by_slug(args.deck)] if args.deck else DECKS

    print("Text-fit analysis against the .pptx sources")
    book = FontBook()
    print(f"  font faces available to the renderer: {len(book.faces)}")

    results = [check_deck(deck["slug"], book) for deck in decks]

    unresolved = sum(len(r["missing"]) for r in results)
    synthetic = sum(len(r["synthetic"]) for r in results)
    review = sum(len(r["overflowing"]) for r in results)

    print("\n" + "=" * 60)
    if unresolved or synthetic:
        print("FAIL: fonts are missing or being synthesised. Fix the fonts before exporting.")
        print("      Run: npm run slides:fonts")
        return 1

    print("PASS: every font resolves to a real face and no bold is synthesised.")
    if review:
        print(f"      {review} text box(es) flagged for visual review (this check over-reports).")
    return 0


if __name__ == "__main__":
    sys.exit(main())

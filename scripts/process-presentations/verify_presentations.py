#!/usr/bin/env python3
"""Verify exported slides against their source decks.

Checks, per deck:

  1.  visible / hidden slide counts read from the source .pptx
  2.  exported full-slide count equals the visible source count
  3.  thumbnail count equals the full-slide count
  4.  slide numbering is contiguous and zero-padded
  5.  every manifest entry points at a file that exists
  6.  every exported image is 16:9 at the expected resolution
  7.  no exported image is blank or near-blank
  8.  no exported image is corrupt
  9.  no speaker-note text leaked into slides.json
  10. no document metadata (author, company, title) leaked into slides.json

Check 9 is the important one. It reads the deck's notes parts in memory purely
to prove that none of that text appears in the published manifest, then throws
them away.

    npm run slides:verify
"""

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from decks import DECKS, FULL_HEIGHT, FULL_WIDTH, OUTPUT_ROOT, SOURCE_DIR  # noqa: E402
from pptx_inspect import A, inspect_deck  # noqa: E402

PASS = "  PASS"
FAIL = "  FAIL"


class Results:
    def __init__(self):
        self.failures = []
        self.checks = 0

    def check(self, condition, label, detail=""):
        self.checks += 1
        if condition:
            print(f"{PASS}  {label}")
        else:
            print(f"{FAIL}  {label}{(' — ' + detail) if detail else ''}")
            self.failures.append(label)
        return condition


def notes_text(source):
    """Extract speaker-note text. Used ONLY to assert it never appears in the
    published manifest; the text is discarded when this function returns."""
    lines = []
    with zipfile.ZipFile(source) as zf:
        for name in zf.namelist():
            if not (name.startswith("ppt/notesSlides/") and name.endswith(".xml")):
                continue
            root = ET.fromstring(zf.read(name))
            for text_node in root.iter(f"{A}t"):
                if text_node.text:
                    lines.append(text_node.text.strip())
    return lines


def doc_metadata(source):
    values = []
    with zipfile.ZipFile(source) as zf:
        for name in ("docProps/core.xml", "docProps/app.xml"):
            if name not in zf.namelist():
                continue
            root = ET.fromstring(zf.read(name))
            for node in root.iter():
                if node.text and node.text.strip():
                    values.append((node.tag.split("}")[-1], node.text.strip()))
    return values


def normalise(text):
    return re.sub(r"\s+", " ", text).strip().lower()


def verify_deck(deck, results):
    slug = deck["slug"]
    source = SOURCE_DIR / deck["source"]
    slide_dir = OUTPUT_ROOT / slug
    thumb_dir = slide_dir / "thumbs"

    print(f"\n[{slug}]")

    if not source.exists():
        results.check(False, "source deck present", str(source))
        return
    if not slide_dir.exists():
        results.check(False, "export directory present", str(slide_dir))
        return

    info = inspect_deck(source)
    print(
        f"  source: {info['slide_count']} slides "
        f"({info['visible_count']} visible, {info['hidden_count']} hidden), "
        f"{info['notes_part_count']} speaker-note parts"
    )

    manifest_path = slide_dir / "slides.json"
    if not results.check(manifest_path.exists(), "slides.json exists"):
        return
    manifest = json.loads(manifest_path.read_text())

    full_files = sorted(slide_dir.glob("slide-*.webp"))
    thumb_files = sorted(thumb_dir.glob("slide-*.webp"))

    results.check(
        len(full_files) == info["visible_count"],
        f"exported slide count == visible source count ({info['visible_count']})",
        f"exported {len(full_files)}",
    )
    results.check(
        len(thumb_files) == len(full_files),
        f"thumbnail count == slide count ({len(full_files)})",
        f"thumbs {len(thumb_files)}",
    )
    results.check(
        len(manifest) == len(full_files),
        "manifest entry count == slide count",
        f"manifest {len(manifest)}",
    )
    results.check(
        len(full_files) + info["hidden_count"] == info["slide_count"],
        f"hidden slides excluded from export ({info['hidden_count']} hidden)",
    )

    expected_names = [f"slide-{i:03d}.webp" for i in range(1, len(full_files) + 1)]
    results.check(
        [f.name for f in full_files] == expected_names,
        "slide numbering is contiguous and zero-padded",
    )

    missing = [e for e in manifest if not (slide_dir.parent.parent / e["image"].lstrip("/")).exists()]
    missing_thumbs = [
        e for e in manifest if not (slide_dir.parent.parent / e["thumbnail"].lstrip("/")).exists()
    ]
    results.check(not missing, "every manifest image exists", f"{len(missing)} missing")
    results.check(not missing_thumbs, "every manifest thumbnail exists", f"{len(missing_thumbs)} missing")
    results.check(
        [e["index"] for e in manifest] == list(range(1, len(manifest) + 1)),
        "manifest indices are 1..N with no gaps",
    )

    # Image integrity.
    try:
        from PIL import Image
    except ImportError:
        print("  (Pillow not installed — skipping pixel checks)")
        return

    wrong_size, blank, corrupt, oversized = [], [], [], []
    for path in full_files:
        try:
            with Image.open(path) as im:
                if im.size != (FULL_WIDTH, FULL_HEIGHT):
                    wrong_size.append(f"{path.name}{im.size}")
                grey = im.convert("L").resize((160, 90))
                lo, hi = grey.getextrema()
                if hi - lo < 8:
                    blank.append(path.name)
        except Exception as exc:  # noqa: BLE001 - any decode failure means corrupt
            corrupt.append(f"{path.name}: {exc}")
        if path.stat().st_size > 400_000:
            oversized.append(f"{path.name} {path.stat().st_size // 1024}KB")

    results.check(not corrupt, "no corrupt slide images", "; ".join(corrupt[:3]))
    results.check(
        not wrong_size, f"all slides are {FULL_WIDTH}x{FULL_HEIGHT} (16:9)", "; ".join(wrong_size[:3])
    )
    results.check(not blank, "no blank or near-blank slides", ", ".join(blank[:5]))
    results.check(not oversized, "no slide image over 400KB", ", ".join(oversized[:3]))

    thumb_wrong = []
    for path in thumb_files:
        with Image.open(path) as im:
            if im.size != (320, 180):
                thumb_wrong.append(f"{path.name}{im.size}")
    results.check(not thumb_wrong, "all thumbnails are 320x180", "; ".join(thumb_wrong[:3]))

    # --- Privacy checks -----------------------------------------------------
    manifest_blob = normalise(json.dumps(manifest, ensure_ascii=False))

    slide_visible = {normalise(s["visibleText"]) for s in info["slides"]}
    all_visible_blob = " ".join(slide_visible)

    leaked = []
    for line in notes_text(source):
        candidate = normalise(line)
        # Only meaningful, note-only phrases. Short lines and anything that is
        # also printed on a slide would produce false positives.
        if len(candidate) < 30 or candidate in all_visible_blob:
            continue
        if candidate in manifest_blob:
            leaked.append(line[:70])
    results.check(
        not leaked,
        f"no speaker-note text in slides.json ({info['notes_part_count']} note parts in source)",
        "; ".join(leaked[:3]),
    )

    meta_leaks = []
    for tag, value in doc_metadata(source):
        candidate = normalise(value)
        if len(candidate) < 12 or candidate in all_visible_blob:
            continue
        if candidate in manifest_blob:
            meta_leaks.append(f"{tag}={value[:40]}")
    results.check(not meta_leaks, "no document metadata in slides.json", "; ".join(meta_leaks[:3]))

    published_notes = list((OUTPUT_ROOT / slug).rglob("*.xml")) + list(
        (OUTPUT_ROOT / slug).rglob("*.pptx")
    )
    results.check(not published_notes, "no source or XML parts published under public/slides")


def main():
    results = Results()
    print("Verifying exported presentations")
    for deck in DECKS:
        verify_deck(deck, results)

    print(f"\n{results.checks - len(results.failures)}/{results.checks} checks passed")
    if results.failures:
        print("\nFAILED:")
        for failure in results.failures:
            print(f"  - {failure}")
        return 1
    print("All presentation checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

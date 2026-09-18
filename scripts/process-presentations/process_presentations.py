#!/usr/bin/env python3
"""Export PowerPoint decks to web-ready slide images plus a JSON manifest.

Pipeline
--------
  1. Inspect the .pptx with the standard library (slide order, hidden slides,
     visible on-slide text).
  2. Convert .pptx -> .pdf with headless LibreOffice, with hidden slides and
     notes pages explicitly disabled.
  3. Rasterise each PDF page with PDFium (the renderer Chrome uses) at 16:9.
  4. Write optimised WebP full slides and thumbnails.
  5. Write public/slides/<slug>/slides.json.

The original slide design is preserved exactly: slides are rasterised from the
deck, never re-typeset or recreated in HTML.

Speaker notes are never read, never rendered and never written. See
pptx_inspect.py, and run verify_presentations.py to assert it.

Usage
-----
    npm run slides                 # every deck in decks.py
    npm run slides -- --deck canux-2025
    npm run slides -- --keep-pdf   # keep the intermediate PDF for inspection

Requirements
------------
    LibreOffice   (soffice)  -- see README.md for install locations
    python3 -m pip install --user -r requirements.txt
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from decks import (  # noqa: E402
    DECKS,
    FULL_HEIGHT,
    FULL_QUALITY,
    FULL_WIDTH,
    OUTPUT_ROOT,
    REPO_ROOT,
    SOURCE_DIR,
    THUMB_HEIGHT,
    THUMB_QUALITY,
    THUMB_WIDTH,
    deck_by_slug,
)
from pptx_inspect import fonts_used, inspect_deck  # noqa: E402

SYSTEM_FONT_DIRS = [
    Path("/System/Library/Fonts"),
    Path("/System/Library/Fonts/Supplemental"),
    Path("/Library/Fonts"),
    Path.home() / "Library/Fonts",
]

_family_cache = None


def available_families():
    """Font families the renderer can resolve: the render-only set plus system."""
    global _family_cache
    if _family_cache is not None:
        return _family_cache

    try:
        from fontTools.ttLib import TTCollection, TTFont
    except ImportError:
        print("    (fontTools not installed — skipping the font availability check)")
        _family_cache = set()
        return _family_cache

    families = set()
    for directory in [FONT_DIR, *SYSTEM_FONT_DIRS]:
        if not directory.exists():
            continue
        for path in directory.iterdir():
            suffix = path.suffix.lower()
            if suffix not in (".ttf", ".otf", ".ttc"):
                continue
            try:
                fonts = TTCollection(path).fonts if suffix == ".ttc" else [TTFont(path, lazy=True)]
                for font in fonts:
                    name = font["name"].getDebugName(1)
                    if name:
                        families.add(name.strip())
                    font.close()
            except Exception:
                continue

    _family_cache = families
    return families


def report_fonts(source):
    """Print the deck's fonts and flag any the renderer cannot resolve.

    A missing font is what caused the original bad export, so this is loud.
    """
    used = fonts_used(source)
    if not used:
        return []

    families = available_families()
    missing = []
    print("    fonts:")
    for typeface in sorted(used, key=lambda t: (-len(used[t]), t)):
        slides = sorted(used[typeface])
        status = "ok" if not families or typeface in families else "MISSING"
        if status == "MISSING":
            missing.append((typeface, slides))
        preview = ", ".join(str(s) for s in slides[:6]) + ("…" if len(slides) > 6 else "")
        print(f"      {status:<8} {typeface:<22} {len(slides):>3} slides  [{preview}]")

    if missing:
        print("    WARNING: the renderer will substitute the fonts marked MISSING.")
        print("             Substitution changes text width and can rewrap lines.")
    return missing

SOFFICE_CANDIDATES = [
    os.environ.get("SOFFICE"),
    str(Path.home() / "Applications/LibreOffice.app/Contents/MacOS/soffice"),
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    shutil.which("soffice"),
    shutil.which("libreoffice"),
]

# Fonts the decks are typeset in. Without them the renderer substitutes wider
# faces, text rewraps, and spAutoFit boxes overflow onto the artwork beneath.
# See build_render_fonts.py.
FONT_DIR = Path(__file__).resolve().parent / "fonts"

# OSFONTDIR is a fontconfig mechanism and the macOS build of LibreOffice does
# not read it, so the render fonts are staged inside LibreOffice's own bundle
# instead. Only LibreOffice picks them up — Font Book, and every other
# application on the machine, are untouched.
LO_FONT_SUBDIR = "Contents/Resources/fonts/truetype"
STAGED_MARKER = ".portfolio-render-fonts"

# PDF export filter. Hidden slides and notes pages are disabled explicitly
# rather than relying on LibreOffice defaults. Images stay lossless in the
# intermediate PDF so the only lossy step is the final WebP encode.
PDF_FILTER = (
    "pdf:impress_pdf_Export:"
    + json.dumps(
        {
            "ExportHiddenSlides": {"type": "boolean", "value": "false"},
            "ExportNotes": {"type": "boolean", "value": "false"},
            "ExportNotesPages": {"type": "boolean", "value": "false"},
            "ExportBookmarks": {"type": "boolean", "value": "false"},
            "UseLosslessCompression": {"type": "boolean", "value": "true"},
            "ReduceImageResolution": {"type": "boolean", "value": "false"},
            "Quality": {"type": "long", "value": "100"},
        },
        separators=(",", ":"),
    )
)


class PipelineError(RuntimeError):
    pass


def find_soffice():
    for candidate in SOFFICE_CANDIDATES:
        if candidate and Path(candidate).exists():
            return candidate
    raise PipelineError(
        "LibreOffice (soffice) was not found.\n"
        "Install it, then re-run. Checked:\n  "
        + "\n  ".join(c for c in SOFFICE_CANDIDATES if c)
        + "\nOr set SOFFICE=/path/to/soffice."
    )


def stage_render_fonts(soffice):
    """Copy the render-only fonts into LibreOffice's bundled font directory.

    Returns the list of files staged, so `--clean-fonts` can remove exactly
    what was added and leave the LibreOffice install as it was.
    """
    if not FONT_DIR.exists():
        print("    (no render fonts built — run build_render_fonts.py)")
        return []

    bundle = Path(soffice).resolve().parents[2]
    target = bundle / LO_FONT_SUBDIR
    if not target.exists():
        print(f"    ! LibreOffice font directory not found at {target}")
        return []

    staged = []
    for font in sorted(list(FONT_DIR.glob("*.ttf")) + list(FONT_DIR.glob("*.otf"))):
        destination = target / font.name
        if not destination.exists() or destination.stat().st_size != font.stat().st_size:
            shutil.copy2(font, destination)
        staged.append(destination)

    (target / STAGED_MARKER).write_text("\n".join(p.name for p in staged) + "\n")
    print(f"    staged {len(staged)} render fonts into the LibreOffice bundle")
    return staged


def clean_render_fonts(soffice):
    bundle = Path(soffice).resolve().parents[2]
    target = bundle / LO_FONT_SUBDIR
    marker = target / STAGED_MARKER
    if not marker.exists():
        print("Nothing staged.")
        return 0
    removed = 0
    for name in marker.read_text().split():
        path = target / name
        if path.exists():
            path.unlink()
            removed += 1
    marker.unlink()
    print(f"Removed {removed} staged fonts from {target}")
    return 0


def convert_to_pdf(soffice, source, workdir):
    """Run headless LibreOffice to produce a PDF next to the source."""
    profile = workdir / "lo-profile"
    cmd = [
        soffice,
        "-env:UserInstallation=file://" + str(profile),
        "--headless",
        "--norestore",
        "--nolockcheck",
        "--nodefault",
        "--nologo",
        "--convert-to",
        PDF_FILTER,
        "--outdir",
        str(workdir),
        str(source),
    ]
    env = dict(os.environ)
    if FONT_DIR.exists():
        existing = env.get("OSFONTDIR")
        env["OSFONTDIR"] = f"{FONT_DIR}:{existing}" if existing else str(FONT_DIR)

    started = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600, env=env)
    elapsed = time.time() - started

    pdf_path = workdir / (Path(source).stem + ".pdf")
    if result.returncode != 0 or not pdf_path.exists():
        raise PipelineError(
            "LibreOffice failed to convert the deck.\n"
            f"exit code: {result.returncode}\n"
            f"stdout: {result.stdout.strip()}\n"
            f"stderr: {result.stderr.strip()}"
        )
    print(f"    converted to PDF in {elapsed:.1f}s ({pdf_path.stat().st_size / 1e6:.1f} MB)")
    return pdf_path


def render_pdf(pdf_path, slide_dir, thumb_dir, expected_pages):
    """Rasterise the PDF to WebP full slides and thumbnails."""
    try:
        import pypdfium2 as pdfium
        from PIL import Image
    except ImportError as exc:
        raise PipelineError(
            "Missing Python dependency: "
            f"{exc.name}.\nInstall with:\n"
            "  python3 -m pip install --user -r scripts/process-presentations/requirements.txt"
        ) from exc

    pdf = pdfium.PdfDocument(str(pdf_path))
    page_count = len(pdf)

    if page_count != expected_pages:
        raise PipelineError(
            f"PDF page count ({page_count}) does not match the expected visible "
            f"slide count ({expected_pages}). Refusing to publish a mismatched export."
        )

    slide_dir.mkdir(parents=True, exist_ok=True)
    thumb_dir.mkdir(parents=True, exist_ok=True)

    written = []
    for page_index in range(page_count):
        page = pdf[page_index]
        # PDFium scale is relative to 72dpi; derive it from the actual page box
        # so the output lands exactly on FULL_WIDTH regardless of deck size.
        scale = FULL_WIDTH / page.get_width()
        bitmap = page.render(scale=scale)
        image = bitmap.to_pil().convert("RGB")

        if image.size != (FULL_WIDTH, FULL_HEIGHT):
            image = image.resize((FULL_WIDTH, FULL_HEIGHT), Image.LANCZOS)

        number = page_index + 1
        full_name = f"slide-{number:03d}.webp"
        full_path = slide_dir / full_name
        image.save(full_path, "WEBP", quality=FULL_QUALITY, method=6)

        thumb = image.resize((THUMB_WIDTH, THUMB_HEIGHT), Image.LANCZOS)
        thumb_path = thumb_dir / full_name
        thumb.save(thumb_path, "WEBP", quality=THUMB_QUALITY, method=6)

        written.append(
            {
                "file": full_name,
                "bytes": full_path.stat().st_size,
                "thumb_bytes": thumb_path.stat().st_size,
            }
        )

        if number % 10 == 0 or number == page_count:
            print(f"    rendered {number}/{page_count}")

        page.close()

    pdf.close()
    return written


def process_deck(deck, soffice, keep_pdf=False):
    slug = deck["slug"]
    source = SOURCE_DIR / deck["source"]

    print(f"\n[{slug}]")
    if not source.exists():
        raise PipelineError(
            f"Source deck not found: {source}\n"
            f"Place the .pptx at content/speaking/source/{deck['source']}"
        )

    info = inspect_deck(source)
    visible = [s for s in info["slides"] if not s["hidden"]]
    print(
        f"    source: {source.name} "
        f"({info['slide_count']} slides, {info['hidden_count']} hidden, "
        f"{info['visible_count']} visible, aspect {info['aspect_ratio']})"
    )
    if info["notes_part_count"]:
        print(
            f"    note: deck contains {info['notes_part_count']} speaker-note parts — "
            "these are never read or exported"
        )

    missing_fonts = report_fonts(source)

    slide_dir = OUTPUT_ROOT / slug
    thumb_dir = slide_dir / "thumbs"
    # Clear stale exports so a shrinking deck cannot leave orphaned slides behind.
    if slide_dir.exists():
        shutil.rmtree(slide_dir)

    with tempfile.TemporaryDirectory(prefix=f"slides-{slug}-") as tmp:
        workdir = Path(tmp)
        pdf_path = convert_to_pdf(soffice, source, workdir)
        written = render_pdf(pdf_path, slide_dir, thumb_dir, len(visible))
        if keep_pdf:
            cache = Path(__file__).resolve().parent / ".render-cache"
            cache.mkdir(exist_ok=True)
            shutil.copy2(pdf_path, cache / f"{slug}.pdf")
            print(f"    kept PDF at scripts/process-presentations/.render-cache/{slug}.pdf")

    manifest = []
    for position, (slide, file_info) in enumerate(zip(visible, written), start=1):
        manifest.append(
            {
                "index": position,
                "image": f"/slides/{slug}/{file_info['file']}",
                "thumbnail": f"/slides/{slug}/thumbs/{file_info['file']}",
                "width": FULL_WIDTH,
                "height": FULL_HEIGHT,
                "title": slide["title"],
                "visibleText": slide["visibleText"],
            }
        )

    manifest_path = slide_dir / "slides.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")

    total_bytes = sum(f["bytes"] for f in written)
    thumb_bytes = sum(f["thumb_bytes"] for f in written)
    print(
        f"    wrote {len(manifest)} slides -> public/slides/{slug}/ "
        f"({total_bytes / 1e6:.1f} MB full, {thumb_bytes / 1e6:.2f} MB thumbs, "
        f"avg {total_bytes / max(len(written), 1) / 1024:.0f} KB/slide)"
    )

    return {
        "slug": slug,
        "source": str(source.relative_to(REPO_ROOT)),
        "sourceSlideCount": info["slide_count"],
        "hiddenSlideCount": info["hidden_count"],
        "visibleSlideCount": info["visible_count"],
        "exportedSlideCount": len(manifest),
        "thumbnailCount": len(manifest),
        "aspectRatio": info["aspect_ratio"],
        "speakerNotePartsInSource": info["notes_part_count"],
        "speakerNotesExported": False,
        "fullBytes": total_bytes,
        "thumbBytes": thumb_bytes,
        "outputDir": f"public/slides/{slug}/",
        "missingFonts": [{"font": name, "slides": slides} for name, slides in missing_fonts],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deck", help="process a single deck by slug")
    parser.add_argument("--keep-pdf", action="store_true", help="keep the intermediate PDF")
    parser.add_argument(
        "--clean-fonts",
        action="store_true",
        help="remove the render fonts staged into the LibreOffice bundle, then exit",
    )
    args = parser.parse_args()

    try:
        soffice = find_soffice()
    except PipelineError as exc:
        print(f"\nERROR: {exc}\n", file=sys.stderr)
        return 1

    if args.clean_fonts:
        return clean_render_fonts(soffice)

    decks = [deck_by_slug(args.deck)] if args.deck else DECKS

    print(f"LibreOffice: {soffice}")
    stage_render_fonts(soffice)
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

    reports = []
    for deck in decks:
        try:
            reports.append(process_deck(deck, soffice, keep_pdf=args.keep_pdf))
        except PipelineError as exc:
            print(f"\nERROR [{deck['slug']}]: {exc}\n", file=sys.stderr)
            return 1

    report_path = Path(__file__).resolve().parent / "last-run-report.json"
    report_path.write_text(
        json.dumps({"generated": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "decks": reports}, indent=2)
        + "\n"
    )
    print(f"\nRun report: scripts/process-presentations/last-run-report.json")
    print("Next: npm run slides:verify")
    return 0


if __name__ == "__main__":
    sys.exit(main())

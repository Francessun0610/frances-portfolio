#!/usr/bin/env python3
"""Convert Frances's résumé .docx into public/Frances-Sun-Resume.pdf.

Two corrections are applied to a temporary copy of the document. The source
.docx is never modified.

1. Font mapping. The document's theme font is Aptos, which ships with recent
   Microsoft Office but is not installed on macOS. Without this step the
   converter falls back to a serif face and the PDF looks nothing like the
   Word original, so the theme fonts are remapped to Helvetica Neue.

2. Email hyperlink. The header link is authored as
   `http://francessun@gmail.com`, which browsers cannot open. Any
   `http(s)://user@host` target is rewritten to `mailto:user@host`.

Usage:
    python3 scripts/build-resume-pdf.py "/path/to/FRANCES SUN.docx"
    python3 scripts/build-resume-pdf.py            # uses DEFAULT_SOURCE
"""

import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUTPUT = REPO / "public" / "Frances-Sun-Resume.pdf"

DEFAULT_SOURCE = Path.home() / "Library/Mobile Documents/com~apple~CloudDocs/FRANCES SUN.docx"

# Theme fonts that are unavailable on macOS -> installed equivalent.
FONT_MAP = {
    "Aptos Display": "Helvetica Neue",
    "Aptos": "Helvetica Neue",
}

SOFFICE_CANDIDATES = [
    Path.home() / "Applications/LibreOffice.app/Contents/MacOS/soffice",
    Path("/Applications/LibreOffice.app/Contents/MacOS/soffice"),
]


def find_soffice():
    for candidate in SOFFICE_CANDIDATES:
        if candidate.exists():
            return str(candidate)
    found = shutil.which("soffice") or shutil.which("libreoffice")
    if found:
        return found
    raise SystemExit("LibreOffice (soffice) not found. Install it and re-run.")


def remap_fonts(xml: str) -> tuple[str, int]:
    count = 0
    for original, replacement in FONT_MAP.items():
        pattern = f'typeface="{original}"'
        count += xml.count(pattern)
        xml = xml.replace(pattern, f'typeface="{replacement}"')
        # Run-level overrides, if the document ever gains any.
        for attribute in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
            run_pattern = f'{attribute}="{original}"'
            count += xml.count(run_pattern)
            xml = xml.replace(run_pattern, f'{attribute}="{replacement}"')
    return xml, count


def fix_mailto(xml: str) -> tuple[str, list[str]]:
    fixed = []

    def replace(match):
        address = match.group(1)
        fixed.append(address)
        return f'Target="mailto:{address}"'

    # http://user@host  ->  mailto:user@host
    xml = re.sub(r'Target="https?://([^"/@\s]+@[^"/\s]+?)/?"', replace, xml)
    return xml, fixed


def prepare_docx(source: Path, workdir: Path) -> Path:
    """Write a corrected copy of the .docx. The original is left alone."""
    target = workdir / "resume-corrected.docx"
    font_changes = 0
    link_fixes = []

    with zipfile.ZipFile(source) as src, zipfile.ZipFile(
        target, "w", zipfile.ZIP_DEFLATED
    ) as out:
        for item in src.infolist():
            data = src.read(item.filename)

            if item.filename in ("word/theme/theme1.xml", "word/styles.xml", "word/document.xml"):
                xml, changed = remap_fonts(data.decode("utf-8"))
                font_changes += changed
                data = xml.encode("utf-8")

            elif item.filename == "word/_rels/document.xml.rels":
                xml, fixed = fix_mailto(data.decode("utf-8"))
                link_fixes.extend(fixed)
                data = xml.encode("utf-8")

            out.writestr(item, data)

    print(f"  remapped {font_changes} font reference(s) -> Helvetica Neue")
    if link_fixes:
        for address in link_fixes:
            print(f"  repaired email link -> mailto:{address}")
    else:
        print("  no malformed email links found")

    return target


def main():
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not source.exists():
        raise SystemExit(f"Résumé not found: {source}")

    print(f"Source: {source}")
    soffice = find_soffice()

    with tempfile.TemporaryDirectory(prefix="resume-") as tmp:
        workdir = Path(tmp)
        corrected = prepare_docx(source, workdir)

        result = subprocess.run(
            [
                soffice,
                f"-env:UserInstallation=file://{workdir}/lo",
                "--headless",
                "--norestore",
                "--nolockcheck",
                "--nodefault",
                "--nologo",
                "--convert-to",
                "pdf",
                "--outdir",
                str(workdir),
                str(corrected),
            ],
            capture_output=True,
            text=True,
            timeout=600,
        )

        produced = workdir / f"{corrected.stem}.pdf"
        if result.returncode != 0 or not produced.exists():
            raise SystemExit(f"Conversion failed:\n{result.stdout}\n{result.stderr}")

        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(produced, OUTPUT)

    size_kb = OUTPUT.stat().st_size / 1024
    print(f"\nWrote public/Frances-Sun-Resume.pdf ({size_kb:.0f} KB)")
    print("Run `npm run build` to publish it into dist/.")


if __name__ == "__main__":
    main()

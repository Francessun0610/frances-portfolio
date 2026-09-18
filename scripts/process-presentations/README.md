# Slide export pipeline

Turns Frances's PowerPoint decks into web-ready slide images and a JSON
manifest, without ever publishing speaker notes.

```
content/speaking/source/<deck>.pptx      input  (never served, never committed)
        │
        │  1. inspect      python stdlib: slide order, hidden slides, visible text
        │  2. convert      LibreOffice headless: .pptx -> .pdf
        │  3. rasterise    PDFium: PDF pages -> RGB bitmaps at 1440x810
        │  4. encode       Pillow: WebP full slides + 320x180 thumbnails
        │  5. manifest     slides.json
        ▼
public/slides/<deck>/                    output (published)
  slide-001.webp … slide-0NN.webp        1440x810, WebP q82
  thumbs/slide-001.webp … slide-0NN.webp 320x180,  WebP q65
  slides.json
```

## Commands

```bash
npm run slides:fonts                # build the render fonts (do this first)
npm run slides                      # export every deck in decks.py
npm run slides -- --deck canux-2025 # one deck
npm run slides -- --keep-pdf        # keep the intermediate PDF to inspect
npm run slides:verify               # verify exports against the sources
npm run slides:textfit              # check every text box for rewrap/overflow
npm run slides -- --clean-fonts     # unstage fonts from the LibreOffice bundle
```

## Requirements

**LibreOffice** provides the only faithful PPTX renderer here. The pipeline
looks for `soffice` in this order:

1. `$SOFFICE`
2. `~/Applications/LibreOffice.app/Contents/MacOS/soffice`
3. `/Applications/LibreOffice.app/Contents/MacOS/soffice`
4. `soffice` or `libreoffice` on `PATH`

Download: <https://www.libreoffice.org/download/download-libreoffice/>

**Python packages** — rasterisation and image encoding:

```bash
python3 -m pip install --user -r scripts/process-presentations/requirements.txt
```

`pypdfium2` wraps PDFium, the same renderer Chrome uses for PDFs, so page
output matches what a browser would show.

**The decks' fonts** are the part that is easy to get wrong, and getting it
wrong is silent. Both decks are typeset in Raleway. When Raleway is absent the
renderer substitutes a wider face, a line rewraps, and `spAutoFit` text boxes
overflow downward onto the artwork beneath — which is exactly how the first
export of these decks shipped with the ADVANTECH and Lenovo logos colliding
with the job titles above them.

Run `npm run slides:fonts` before exporting. See `fonts/README.md` for where
the fonts come from, why the embedded copies in the `.pptx` cannot be used, and
how they are staged so only LibreOffice sees them.

`process_presentations.py` prints a font report for every deck and marks any
unresolved family `MISSING`. Treat that as a failure, not a warning.

## If LibreOffice is not available

The pipeline stops and explains what is missing. It does **not** fall back to
generating stand-in slides. The viewer detects the missing manifest and renders
an explicit "slides have not been exported yet" state with the commands to run,
so a build never silently ships fake or empty slides.

## Privacy rules

These are enforced in code, not left to convention:

- `pptx_inspect.py` only ever opens `ppt/slides/slideN.xml`. It never reads
  `ppt/notesSlides/`, `ppt/comments/`, `docProps/` or revision data.
- The PDF export explicitly sets `ExportNotes=false`, `ExportNotesPages=false`
  and `ExportHiddenSlides=false` rather than trusting LibreOffice defaults.
- `verify_presentations.py` reads the notes parts *only* to assert that none of
  that text appears in the published `slides.json`, then discards them.
- `.gitignore` and `.vercelignore` both exclude `content/speaking/source/`, so
  the `.pptx` files are never committed and never uploaded to the host.

## Hidden slides

Hidden slides (`<p:sld show="0">`) are excluded. The pipeline refuses to
continue if the PDF page count does not equal the visible slide count, which
catches the case where LibreOffice ignores the flag and exports them anyway.

## Output settings

| Asset      | Size     | Format | Quality |
| ---------- | -------- | ------ | ------- |
| Full slide | 1440x810 | WebP   | 82      |
| Thumbnail  | 320x180  | WebP   | 65      |

Both are 16:9. Change them in `decks.py`.

## Adding a deck

1. Put the `.pptx` at `content/speaking/source/<slug>.pptx`.
2. Add an entry to `DECKS` in `decks.py`.
3. Add a matching talk to `src/data/site.ts` with `deck: '<slug>'`.
4. `npm run slides && npm run slides:verify`

## Files

| File                        | Purpose                                              |
| --------------------------- | ---------------------------------------------------- |
| `decks.py`                  | Deck registry and output settings                     |
| `pptx_inspect.py`           | Read-only .pptx inspection (stdlib only)              |
| `build_render_fonts.py`     | Builds the render-only font set                       |
| `process_presentations.py`  | The pipeline                                          |
| `verify_presentations.py`   | Post-export verification                              |
| `check_text_fit.py`         | Per-text-box rewrap/overflow analysis                 |
| `fonts/`                    | Render-only fonts (git-ignored, see its README)       |
| `requirements.txt`          | Python dependencies                                   |
| `last-run-report.json`      | Counts and byte sizes from the most recent run        |

## Why a text-fit check exists

Counting slides, checking file sizes and skimming a contact sheet all passed
while the career-journey slides were visibly broken. `check_text_fit.py`
measures each text box with the real font file, wraps it to the box's usable
width, and fails if it needs more lines than the height PowerPoint stored —
reporting which picture the overflow would land on. That is the specific defect
that got through, so it is now checked directly.

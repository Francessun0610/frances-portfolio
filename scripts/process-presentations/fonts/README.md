# Render-only fonts

These fonts exist so the slide exporter reproduces the decks the way PowerPoint
draws them. They are **not** website fonts and are never served to visitors.

## Why this is needed

Both decks are typeset in **Raleway**. Raleway was not installed on the build
machine, so LibreOffice substituted a wider fallback face. Text that occupied
one line in PowerPoint rewrapped to two, and because those text boxes use
`spAutoFit` with a height PowerPoint had already computed, the extra line
overflowed downward onto the logos beneath — the ADVANTECH / Lenovo / Dell /
Disney collisions on the "My career journey" slides.

The decks do embed their fonts, but as **MicroType-Express-compressed EOT**
(`ppt/fonts/*.fntdata`). No available tool can decompress that format, so the
fonts have to come from somewhere else.

Raleway, Onest and Play are published by Google under the SIL Open Font
License, so authentic copies are used here. InspireTWDC was supplied by
Frances and is placed in `_src/inspire/`.

## What is generated

PowerPoint refers to several Raleway weights as *separate family names*
("Raleway SemiBold", "Raleway Medium", …), which is how static font files
register on Windows. Google ships Raleway and Onest only as variable fonts, so
`build_render_fonts.py` pins each required weight to a static instance and
rewrites the name table to match.

Every family also gets a real **Bold** member. Each affected run carries
`b="1"`, and a family with no bold face makes the renderer synthesise bold,
which widens glyphs just enough to rewrap a line.

## Where they are installed

macOS LibreOffice ignores `OSFONTDIR` (that is a fontconfig mechanism), so
`process_presentations.py` stages these files inside LibreOffice's own bundle at
`LibreOffice.app/Contents/Resources/fonts/truetype/`. Only LibreOffice sees
them. Font Book and every other application on the machine are untouched.

To remove them again:

```bash
python3 scripts/process-presentations/process_presentations.py --clean-fonts
```

## Rebuilding

The `.ttf` files here are generated, and `_src/` holds the upstream downloads.
Both are git-ignored. To recreate them:

```bash
cd scripts/process-presentations/fonts/_src
curl -sSLO https://raw.githubusercontent.com/google/fonts/main/ofl/raleway/Raleway%5Bwght%5D.ttf
curl -sSLO https://raw.githubusercontent.com/google/fonts/main/ofl/raleway/Raleway-Italic%5Bwght%5D.ttf
curl -sSLO https://raw.githubusercontent.com/google/fonts/main/ofl/onest/Onest%5Bwght%5D.ttf
curl -sSLO https://raw.githubusercontent.com/google/fonts/main/ofl/play/Play-Regular.ttf
curl -sSLO https://raw.githubusercontent.com/google/fonts/main/ofl/play/Play-Bold.ttf
cd -
python3 scripts/process-presentations/build_render_fonts.py
```

Requires `fonttools`.

## InspireTWDC

The Walt Disney Company's corporate typeface, supplied by Frances as a
10-face family (Light, Roman, Medium, Heavy, Black and their italics).
`InspireTWDC-Roman.otf` carries family name `InspireTWDC` / style `Regular`,
which is exactly what the decks reference.

It is copied through untouched, and deliberately **without** a synthesised bold
member: the decks' `<p:embeddedFontLst>` carries only InspireTWDC regular and
italic, so PowerPoint has no bold face either and emboldens algorithmically.
Adding one here would diverge from what PowerPoint draws.

Installing it changed nothing. Every one of the 149 rendered slides is
byte-identical before and after. The reason is that InspireTWDC appears only in
`<a:lstStyle>` / `<a:defRPr>` template defaults, while every actual `<a:r>` run
overrides the font explicitly — for example the "Rate card" title declares
InspireTWDC at all nine outline levels but its single run specifies
`Raleway Light`. LibreOffice still registers the list-style font in the PDF's
font table, which is why `InspireTWDC-Black` shows up there without drawing a
glyph.

The family is kept in the render set anyway, so that if a deck is ever edited
to use it for real, it renders correctly instead of silently substituting.

Note its `fsType` is 4 (Preview & Print embedding). That is irrelevant here:
the published output is WebP images, so no font is ever embedded or served.

## Licences

SIL OFL texts for the Google fonts are in `_src/OFL*.txt`. InspireTWDC is
Disney proprietary — keep it out of version control and off any deployment.

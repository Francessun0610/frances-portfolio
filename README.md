# Frances Sun — portfolio

Portfolio for Frances Sun, Lead UX Designer. Astro + TypeScript, statically
rendered, with a small amount of vanilla JavaScript for the slide viewer.

Not deployed. Review locally first.

## Quick start

```bash
npm install
npm run dev          # http://localhost:4321
npm run build
npm run preview
```

Node 20.3+ is required (see `.nvmrc`).

## Routes

| Route                        | Page                                             |
| ---------------------------- | ------------------------------------------------ |
| `/`                          | Hero, Selected Work, Speaking, Previous Work, About |
| `/about`                     | About                                             |
| `/speaking`                  | Speaking index                                    |
| `/speaking/canux-2025`       | CanUX 2025 talk + 72-slide viewer                 |
| `/speaking/uiuc-ux-day-2026` | UX Day 2026 talk + 77-slide viewer                |
| `/speaking/ddd-europe-2026`  | DDD Europe 2026 talk + 98-slide viewer            |
| `/previous-work`             | Carbonmade archive                                |
| `/404`                       | Not found                                         |

## Content

Nearly all copy, links, project records and talk records live in
`src/data/site.ts`. Product and talk names there are confirmed — do not rename
them. The archive list lives in `src/data/previousWork.json`.

## Slide viewer

Each talk page renders `PresentationViewer.astro` from
`public/slides/<deck>/slides.json`.

- Previous / Next, keyboard (←, →, Home, End), swipe on touch, thumbnail rail,
  slide overview dialog, fullscreen
- Deep-linkable with `?slide=N`; invalid values fall back to slide 1
- The URL is kept in sync with `history.replaceState`, so paging through 70+
  slides does not bury the Back button
- Only the current slide and its two neighbours are fetched; the rest are lazy
- No autoplay, no timed transitions

See [`scripts/process-presentations/README.md`](scripts/process-presentations/README.md)
for how the slide images are produced, and for the rules that keep speaker
notes out of the published output.

> **Before re-exporting slides, run `npm run slides:fonts`.** Both decks are
> typeset in Raleway. If Raleway is missing the renderer silently substitutes a
> wider face, lines rewrap, and text boxes overflow onto the artwork beneath
> them. The export still succeeds and the slide counts still match, so nothing
> downstream catches it — `fonts/README.md` explains the whole failure.

## Scripts

```bash
npm run slides:fonts      # build the render fonts — required before exporting
npm run slides            # export decks -> public/slides/
npm run slides:verify     # verify exports against the .pptx sources
npm run slides:textfit    # check text boxes for font-substitution rewrap
npm run capture:ratecard  # re-capture the Rate Card Manager screenshot
npm run import:previous   # re-import the Previous Work archive — see below
npm run check             # astro check (TypeScript)

npm run qa:functional     # routes, links, viewer behaviour, content, performance
npm run qa:a11y           # axe-core + keyboard/focus/reduced-motion checks
npm run qa:previous       # Previous Work archive: imagery, links, 5 breakpoints
npm run qa:screenshots    # 8 viewports x every route -> qa-output/screenshots/
npm run qa:lighthouse     # Lighthouse -> qa-output/lighthouse/
```

The QA scripts start their own preview server, so run `npm run build` first.

### Previous Work archive

`/previous-work` is populated from the old Carbonmade portfolio at
`francessun.carbonmade.com`. The importer drives a real Chromium through
Playwright, because Carbonmade returns 403 to any request whose User-Agent is
not a desktop browser.

```bash
npm run import:previous            # crawl and rebuild the archive
npm run import:previous -- --headed  # same, with the browser visible
```

It writes three things:

| Path                            | Contents                                        |
| ------------------------------- | ----------------------------------------------- |
| `src/data/previousWork.json`    | Project data consumed by the site               |
| `public/images/previous-work/`  | Local WebP imagery plus `thumbs/`                |
| `content/previous-work-source/` | Audit trail: captured HTML and migration report |

Notes on how it treats the source:

- Nothing is invented. Titles, descriptions, captions, client, role and year
  all come verbatim from Carbonmade, and missing values stay empty.
- Carbonmade's CDN bakes a display size into the image path
  (`;960x540.jpeg`), which crops artwork. The importer drops that directive to
  fetch the original, then resizes to fit within 1600px preserving the exact
  aspect ratio. That took the archive from 575MB to 29MB.
- Carbonmade renders its structured fields as body text ("Role UX/UI
  designer", "For Lenovo Group", "Date 2016 April"). Those are lifted into real
  fields so they do not read as noise inside a description.
- Per-image captions become alt text.
- Images are deduplicated by content hash.
- Every image is served locally. Nothing is iframed or hotlinked, and no public
  page mentions the source platform.

One project (`/projects/7231012`) is untitled at source: empty `<title>`, no
`og:title`, no heading, and an index card reading only "VIEW PROJECT". It is
imported and kept in the data but withheld from the published grid, because a
card with no name is broken and inventing one would misrepresent the work. Give
it a `title` in `previousWork.json` to publish it.

### Regenerating imagery

```bash
python3 scripts/prepare-images.py         # speaking photos + project placeholders
python3 scripts/generate-brand-assets.py  # favicons, touch icons, OG card
```

## Things that still need Frances

- **Resume PDF** — in place at `public/Frances-Sun-Resume.pdf`, generated from
  the .docx in iCloud Drive. Regenerate it after any résumé edit:

  ```bash
  python3 scripts/build-resume-pdf.py
  npm run build
  ```

  That script corrects two things in a temporary copy, never in the source
  document: it remaps the Aptos theme font to Helvetica Neue (Aptos is not
  installed on macOS, so the converter would otherwise fall back to a serif),
  and it rewrites the header's `http://user@host` email link to `mailto:`.
- **Atlas, SIMBA and Linear screenshots** — these three cards currently use
  abstract placeholder panels, and each card says so on the page. Replace
  `public/images/projects/{atlas,simba,linear}.webp` with cleared captures at
  roughly 16:10, then drop `imageIsPlaceholder` in `src/data/site.ts`.

  A runnable Atlas prototype exists at
  `~/My Drive/Claude/Projects/ADS/atlas-iam-ads` (`ads-vite-ui`). It was left
  alone deliberately: it builds on Disney's internal `@ads/components` design
  system rather than being a public demo like the Rate Card prototype, so
  publishing captures of it is a clearance decision, not a technical one. If it
  is cleared, `scripts/capture-rate-card.mjs` is the pattern to copy.
- **Production domain** — set it in `src/config/site.mjs` and in the `Sitemap:`
  line of `public/robots.txt` before the first deploy.

## Deployment

Targeting Vercel as a static site: build `npm run build`, output `dist/`.
`content/speaking/source/` is excluded by both `.gitignore` and `.vercelignore`,
so the PowerPoint sources are never uploaded.

### One deployable project

The root Astro site is the only application here. `vercel.json` pins the
framework, build command and output directory so nothing is inferred, and
`.vercelignore` keeps `scripts/` out of the upload entirely.

That second part matters: `scripts/process-presentations/requirements.txt` is
the only file besides the root `package.json` that Vercel can read as a
deployable project, and leaving it in the upload invites it to be detected as a
separate Python app. The scripts are local build and QA tooling. They are run
by hand on a machine with PowerPoint, LibreOffice and Python, they write their
results into `public/`, and `astro build` never reads them. Excluding them was
verified to produce a byte-identical site (the only files that change between
any two builds are the sitemaps, because `lastmod` records the build time).

## Layout

```
content/speaking/source/   .pptx sources (git-ignored, never served)
public/
  images/{projects,speaking,previous-work,og}/
  slides/<deck>/           exported slides, thumbs, slides.json
scripts/
  process-presentations/   slide pipeline
  qa/                      functional, a11y, responsive and Lighthouse QA
src/
  components/  data/  layouts/  lib/  pages/  styles/
qa-output/                 QA artifacts (git-ignored)
```

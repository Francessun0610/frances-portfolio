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

## Scripts

```bash
npm run slides            # export decks -> public/slides/
npm run slides:verify     # verify exports against the .pptx sources
npm run capture:ratecard  # re-capture the Rate Card Manager screenshot
npm run import:carbonmade # see below
npm run check             # astro check (TypeScript)

npm run qa:functional     # routes, links, viewer behaviour, content, performance
npm run qa:a11y           # axe-core + keyboard/focus/reduced-motion checks
npm run qa:screenshots    # 8 viewports x every route -> qa-output/screenshots/
npm run qa:lighthouse     # Lighthouse -> qa-output/lighthouse/
```

The QA scripts start their own preview server, so run `npm run build` first.

### Carbonmade import

```bash
node scripts/import-carbonmade.mjs --source /path/to/carbonmade-export --dry-run
node scripts/import-carbonmade.mjs --source /path/to/carbonmade-export
```

It expects `site-index.json`, `pages/*.json`, `pages/*.md` and `assets/*`,
copies images into `public/images/previous-work/`, and writes
`src/data/previousWork.json`. Nothing is iframed or hotlinked from Carbonmade.

### Regenerating imagery

```bash
python3 scripts/prepare-images.py         # speaking photos + project placeholders
python3 scripts/generate-brand-assets.py  # favicons, touch icons, OG card
```

## Things that still need Frances

- **Resume PDF** — the `/Frances-Sun-Resume.pdf` route is reserved and linked
  from the header and footer, but no file exists yet. Drop it at
  `public/Frances-Sun-Resume.pdf`.
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

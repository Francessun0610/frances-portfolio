#!/usr/bin/env node
/**
 * Migrate the live Carbonmade portfolio into this site's Previous Work archive.
 *
 * Carbonmade returns 403 for project pages to anything whose User-Agent is not
 * a real desktop browser, so this drives Chromium through Playwright rather
 * than fetching HTML.
 *
 *   node scripts/migrate-carbonmade-direct.mjs
 *   node scripts/migrate-carbonmade-direct.mjs --headed   # watch it crawl
 *
 * Runs headless by default: a headed Chromium is terminated part-way through
 * in some shell environments, which aborts the crawl.
 *
 * Writes:
 *   src/data/previousWork.json                     data consumed by the site
 *   public/images/previous-work/<slug>/            downloaded imagery
 *   content/previous-work-source/                  audit trail, never published
 *     migration-report.json
 *     pages/<slug>.html                            raw captured markup
 *
 * Nothing is invented. Every field is either taken verbatim from the source or
 * left empty, and anything the crawler is unsure about is reported rather than
 * dropped.
 */

import { chromium } from 'playwright';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://francessun.carbonmade.com';

const IMAGE_DIR = path.join(ROOT, 'public', 'images', 'previous-work');
const SOURCE_DIR = path.join(ROOT, 'content', 'previous-work-source');
const DATA_FILE = path.join(ROOT, 'src', 'data', 'previousWork.json');

/** Pages that are site furniture, not portfolio projects. */
const NON_PROJECT_PATHS = new Set(['/', '/about', '/contact']);

/**
 * Titles supplied by Frances for projects the source cannot name.
 *
 * /projects/7231012 is untitled on Carbonmade: empty <title>, no og:title, and
 * a heading that is an icon-font glyph (U+E003) rather than text. Its name
 * appears only inside the artwork ("Dell Seller Offline Experience" on the
 * opening slide), which is not machine-readable, so the first import produced
 * an empty title and the project was held back from the published grid.
 */
const MANUAL_TITLES = {
  '/projects/7231012': 'Dell Works',
};

/**
 * Projects pinned to the front of the archive, in this order. Everything else
 * keeps the order Carbonmade lists it in. This is an explicit sequence, not a
 * sort: no alphabetising, no ordering by year.
 */
const PINNED_ORDER = [
  '/projects/6983864', // My selected work
  '/projects/7231012', // Dell Works
  '/projects/2881757', // MFA Thesis- 2020 Taiwanese Smart Home
];

/** Front-load the pinned projects, leaving the rest in crawl order. */
function applyOrder(projects) {
  const rank = (project) => {
    const index = PINNED_ORDER.indexOf(new URL(project.sourceUrl).pathname);
    return index === -1 ? PINNED_ORDER.length : index;
  };

  return projects
    .map((project, crawlIndex) => ({ project, crawlIndex }))
    .sort((a, b) => rank(a.project) - rank(b.project) || a.crawlIndex - b.crawlIndex)
    .map(({ project }, index) => ({ ...project, order: index + 1 }));
}

/** Chrome text that belongs to the template, never to a project description. */
const BOILERPLATE = [
  'view project',
  'next project',
  'previous project',
  'back to top',
  'powered by carbonmade',
  'made with carbonmade',
  'carbonmade',
  'frances mei-wen sun',
  'get in touch',
  'about',
  'contact',
  'home',
  'menu',
  'close',
];

/** Below this, an image is a logo, icon or spacer rather than artwork. */
const MIN_IMAGE_PIXELS = 200;

/**
 * Carbonmade stores originals at up to 8000px, which is 575MB across the
 * archive. Everything is re-encoded to WebP inside these bounds. `fit: inside`
 * with `withoutEnlargement` preserves the original aspect ratio exactly and
 * never upscales, so artwork is resized but never cropped.
 */
const FULL_MAX = 1600;
const FULL_QUALITY = 82;
const THUMB_MAX = 800;
const THUMB_QUALITY = 72;

/**
 * Carbonmade's CDN encodes a display size in the path (`;960x540.jpeg`), which
 * letterboxes or crops artwork to fit. Dropping the directive returns the
 * original upload at its true aspect ratio.
 */
function originalImageUrl(url) {
  return url.split('?')[0].replace(/;[^/]*$/, '');
}

/** Carbonmade blocks non-browser user agents outright. */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const args = process.argv.slice(2);
const HEADLESS = !args.includes('--headed');

const log = (...parts) => console.log(...parts);

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Collapse runs of whitespace and stray line breaks without rewording. */
function tidy(text) {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter((line, index, all) => !(line === '' && all[index - 1] === ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Carbonmade renders its structured project fields as ordinary text blocks
 * ("Role UX/UI designer", "For Lenovo Group", "Date 2016 April"). They read as
 * noise inside a description, so they are lifted into real fields. Nothing is
 * inferred: a block only counts as a field if it is short and starts with one
 * of the known labels, which keeps prose like "For years, I felt…" intact.
 */
const FIELD_LABELS = ['Role', 'For', 'Date', 'Type', 'URL', 'Issue'];
const FIELD_MAX_LENGTH = 90;

function extractFields(blocks) {
  const fields = {};
  const prose = [];

  for (const block of blocks) {
    const match = block.match(/^(Role|For|Date|Type|URL|Issue)\s+(\S.*)$/s);
    if (match && block.length <= FIELD_MAX_LENGTH && !block.includes('\n')) {
      const key = match[1].toLowerCase();
      if (!fields[key]) fields[key] = match[2].trim();
      continue;
    }
    prose.push(block);
  }

  return { fields, prose };
}

/**
 * Strip private-use-area characters. One project's heading is an icon-font
 * glyph (U+E003) rather than text, which must not become a title.
 */
function stripPrivateUse(text) {
  return text.replace(/[\ue000-\uf8ff]/g, '').trim();
}

function isBoilerplate(text) {
  const normalised = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalised) return true;
  return BOILERPLATE.includes(normalised);
}

async function collectIndex(page) {
  log(`\nOpening ${SITE}`);
  await page.goto(SITE, { waitUntil: 'networkidle', timeout: 90_000 });
  await autoScroll(page);

  return page.evaluate(() => {
    const seen = new Map();
    // DOM order is the portfolio's own ordering; preserve it. Cards are
    // <carbon-item> custom elements whose text reads:
    //   Title / CLIENT / VIEW PROJECT
    for (const anchor of document.querySelectorAll('a[href*="/projects/"]')) {
      const url = new URL(anchor.getAttribute('href'), location.origin);
      if (seen.has(url.pathname)) continue;

      const card = anchor.closest('carbon-item') || anchor;
      const lines = (card.innerText || '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && line.toLowerCase() !== 'view project');

      seen.set(url.pathname, {
        pathname: url.pathname,
        url: url.href,
        indexTitle: lines[0] || '',
        indexSubtitle: lines[1] || '',
      });
    }
    return [...seen.values()];
  });
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let total = 0;
      const step = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        if (total >= document.body.scrollHeight + window.innerHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 60);
    });
  });
  await page.waitForTimeout(700);
}

async function scrapeProject(page, entry) {
  await page.goto(entry.url, { waitUntil: 'networkidle', timeout: 90_000 });
  await autoScroll(page);

  const html = await page.content();

  const scraped = await page.evaluate(() => {
    const clean = (node) => (node?.innerText || '').trim();

    // Project pages carry no <h1>, and some have no heading at all.
    const ogTitle = document
      .querySelector('meta[property="og:title"]')
      ?.getAttribute('content')
      ?.trim();
    const heading = document.querySelector('h1') || document.querySelector('h2');
    const title = ogTitle || clean(heading);

    // Each <carbon-piece> pairs one <carbon-image> with its <carbon-caption>.
    // data-src holds the URL before the lazy loader swaps it into src, so
    // nothing here depends on scrolling the whole page first.
    const images = [];
    const captionTexts = new Set();
    for (const piece of document.querySelectorAll('carbon-piece')) {
      const img = piece.querySelector('carbon-image img');
      if (!img) continue;
      const src = img.getAttribute('data-src') || img.getAttribute('src');
      if (!src) continue;
      const caption = clean(piece.querySelector('carbon-caption'));
      if (caption) captionTexts.add(caption);
      images.push({
        src: new URL(src, location.href).href,
        // Carbonmade's own caption is the best description of the artwork.
        caption,
        alt: (img.getAttribute('alt') || '').trim(),
        declaredWidth: parseInt(img.getAttribute('width') || '0', 10),
        declaredHeight: parseInt(img.getAttribute('height') || '0', 10),
      });
    }

    // Text blocks in document order, skipping template chrome, the paginator
    // (which names the next project) and anything already used as a caption.
    const blocks = [];
    const skip = [
      'NAV',
      'HEADER',
      'FOOTER',
      'SCRIPT',
      'STYLE',
      'BUTTON',
      'CARBON-BRANDING',
      'CARBON-PAGINATOR',
      'CARBON-CAPTION',
    ];
    for (const node of document.querySelectorAll('p, h2, h3, h4, li, blockquote')) {
      if (skip.some((tag) => node.closest(tag))) continue;
      const text = clean(node);
      if (text && !captionTexts.has(text)) blocks.push(text);
    }

    return { title, images, blocks };
  });

  return { ...entry, html, ...scraped };
}

async function downloadImages(context, project, slug, report) {
  const dir = path.join(IMAGE_DIR, slug);
  const thumbDir = path.join(dir, 'thumbs');
  await mkdir(thumbDir, { recursive: true });

  const saved = [];
  const hashes = new Set();
  let index = 0;

  for (const image of project.images) {
    // Skip the tiny stuff: avatars, icons, tracking pixels.
    if (image.declaredWidth && image.declaredWidth < MIN_IMAGE_PIXELS) continue;

    // Ask for the original upload, not the cropped display derivative.
    const url = originalImageUrl(image.src);

    let buffer;
    try {
      const response = await context.request.get(url, { timeout: 60_000 });
      if (!response.ok()) {
        report.imageFailures.push({ slug, url, status: response.status() });
        continue;
      }
      buffer = await response.body();
    } catch (error) {
      report.imageFailures.push({ slug, url, error: String(error.message || error) });
      continue;
    }

    if (buffer.length < 2048) continue; // placeholder or spacer

    const hash = createHash('sha256').update(buffer).digest('hex');
    if (hashes.has(hash)) continue; // duplicate image on the same project
    hashes.add(hash);

    const meta = await sharp(buffer).metadata().catch(() => null);
    if (!meta?.width || !meta?.height) {
      report.imageFailures.push({ slug, url, error: 'Not a decodable image' });
      continue;
    }
    if (Math.max(meta.width, meta.height) < MIN_IMAGE_PIXELS) continue;

    index += 1;
    const filename = `${String(index).padStart(2, '0')}.webp`;

    const resize = (max) => ({
      width: max,
      height: max,
      fit: 'inside',
      withoutEnlargement: true,
    });

    const full = await sharp(buffer)
      .rotate()
      .resize(resize(FULL_MAX))
      .webp({ quality: FULL_QUALITY })
      .toBuffer({ resolveWithObject: true });

    const thumb = await sharp(buffer)
      .rotate()
      .resize(resize(THUMB_MAX))
      .webp({ quality: THUMB_QUALITY })
      .toBuffer({ resolveWithObject: true });

    await writeFile(path.join(dir, filename), full.data);
    await writeFile(path.join(thumbDir, filename), thumb.data);

    saved.push({
      file: `/images/previous-work/${slug}/${filename}`,
      thumbnail: `/images/previous-work/${slug}/thumbs/${filename}`,
      // Carbonmade's caption, used verbatim for alt text where it exists.
      caption: image.caption || '',
      alt: image.alt || '',
      // Recorded for provenance only; the site always serves the local copy.
      sourceUrl: url,
      // Dimensions of the served file, so the markup can reserve exact space.
      width: full.info.width,
      height: full.info.height,
      thumbWidth: thumb.info.width,
      thumbHeight: thumb.info.height,
      originalWidth: meta.width,
      originalHeight: meta.height,
      bytes: full.data.length,
      hash,
    });
  }

  return saved;
}

async function main() {
  await mkdir(IMAGE_DIR, { recursive: true });
  await mkdir(path.join(SOURCE_DIR, 'pages'), { recursive: true });

  const browser = await chromium.launch({ headless: HEADLESS, slowMo: HEADLESS ? 0 : 120 });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: USER_AGENT,
  });
  const page = await context.newPage();

  const report = {
    generatedAt: new Date().toISOString(),
    source: SITE,
    pagesCrawled: [],
    excluded: [],
    projects: [],
    imageFailures: [],
    warnings: [],
  };

  const entries = await collectIndex(page);
  report.pagesCrawled.push({ url: SITE, kind: 'index', projectLinksFound: entries.length });
  log(`Found ${entries.length} project links on the index.`);

  // Record the non-project pages explicitly rather than silently ignoring them.
  for (const pathname of NON_PROJECT_PATHS) {
    if (pathname === '/') continue;
    report.excluded.push({
      url: `${SITE}${pathname}`,
      reason: 'Site page (About/Contact), not a portfolio project',
    });
  }

  const usedSlugs = new Set();
  const projects = [];

  for (const [position, entry] of entries.entries()) {
    log(`\n[${position + 1}/${entries.length}] ${entry.pathname}  ${entry.indexTitle || ''}`);

    let scraped;
    try {
      scraped = await scrapeProject(page, entry);
    } catch (error) {
      report.excluded.push({
        url: entry.url,
        reason: `Failed to load: ${error.message || error}`,
      });
      continue;
    }

    report.pagesCrawled.push({ url: entry.url, kind: 'project' });

    const scrapedTitle = stripPrivateUse(tidy(scraped.title || entry.indexTitle || ''));
    // Applied before the slug is derived, so the override also names the image
    // folder and the archive route.
    const title = scrapedTitle || MANUAL_TITLES[entry.pathname] || '';

    if (!scrapedTitle && title) {
      report.warnings.push({
        url: entry.url,
        issue: `Untitled on Carbonmade; titled "${title}" from MANUAL_TITLES.`,
      });
    } else if (!title) {
      report.warnings.push({
        url: entry.url,
        issue:
          'Untitled on Carbonmade (empty <title>, no og:title, no heading, index card shows ' +
          'only "VIEW PROJECT"). Imported and kept, but held back from the published grid ' +
          'until a title is supplied.',
      });
    }

    let slug = slugify(title || entry.pathname.replace('/projects/', 'project-'));
    if (usedSlugs.has(slug)) {
      report.warnings.push({
        url: entry.url,
        issue: `Duplicate slug "${slug}"; suffixed with the Carbonmade id`,
      });
      slug = `${slug}-${entry.pathname.split('/').pop()}`;
    }
    usedSlugs.add(slug);

    await writeFile(path.join(SOURCE_DIR, 'pages', `${slug}.html`), scraped.html, 'utf8');

    // Description: the page's own prose, minus the title, template chrome and
    // the structured fields, which become their own keys.
    const usable = scraped.blocks
      .filter((block) => block !== title)
      .filter((block) => !isBoilerplate(block));
    const { fields, prose } = extractFields(usable);
    const description = tidy(prose.join('\n\n'));

    const images = await downloadImages(context, scraped, slug, report);
    log(
      `     title="${title}"  images=${images.length}  ` +
        `descriptionChars=${description.length}  fields=${Object.keys(fields).join(',') || '-'}`,
    );

    if (images.length === 0) {
      report.warnings.push({ url: entry.url, issue: 'No images downloaded' });
    }
    if (!description) {
      report.warnings.push({ url: entry.url, issue: 'No description prose on the source page' });
    }

    // The index subtitle is usually the client, but on some cards it repeats
    // the title. Prefer Carbonmade's own "For" field when they disagree.
    const indexSubtitle = tidy(entry.indexSubtitle || '');
    const client =
      fields.for || (indexSubtitle.toLowerCase() === title.toLowerCase() ? '' : indexSubtitle);

    const record = {
      slug,
      title,
      client: client || '',
      role: fields.role || '',
      year: fields.date || '',
      type: fields.type || '',
      description,
      order: position + 1,
      sourceUrl: entry.url,
      images,
    };

    projects.push(record);
    report.projects.push({
      slug,
      title,
      client: record.client,
      year: record.year,
      order: record.order,
      imageCount: images.length,
      captionedImages: images.filter((image) => image.caption).length,
      descriptionChars: description.length,
      sourceUrl: entry.url,
    });
  }

  const ordered = applyOrder(projects);
  report.projects = ordered.map((project) => {
    const entry = report.projects.find((candidate) => candidate.slug === project.slug);
    return { ...entry, order: project.order };
  });

  await writeFile(DATA_FILE, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
  await writeFile(
    path.join(SOURCE_DIR, 'migration-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );

  const totalImages = projects.reduce((sum, p) => sum + p.images.length, 0);
  log('\n' + '='.repeat(60));
  log(`Pages crawled : ${report.pagesCrawled.length}`);
  log(`Projects      : ${projects.length}`);
  log(`Images saved  : ${totalImages}`);
  log(`Warnings      : ${report.warnings.length}`);
  log(`Image failures: ${report.imageFailures.length}`);
  log(`\nData   -> ${path.relative(ROOT, DATA_FILE)}`);
  log(`Report -> ${path.relative(ROOT, path.join(SOURCE_DIR, 'migration-report.json'))}`);

  await context.close();
  await browser.close();
}

main().catch((error) => {
  console.error('\nMigration failed:', error);
  process.exit(1);
});

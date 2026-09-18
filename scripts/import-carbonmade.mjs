#!/usr/bin/env node
/**
 * Import a Carbonmade portfolio export into this site.
 *
 * Usage
 *   node scripts/import-carbonmade.mjs --source /path/to/carbonmade-export
 *   node scripts/import-carbonmade.mjs --source ./export --dry-run
 *
 * Expects an export directory shaped like:
 *
 *   site-index.json     ordering and page list
 *   pages/*.json        structured page data
 *   pages/*.md          markdown fallback for the same pages
 *   assets/*            images referenced by the pages
 *
 * What it does
 *   - preserves the order given by site-index.json where one is available
 *   - copies referenced images into public/images/previous-work/
 *   - gives copied files meaningful, slugified names
 *   - extracts a title and description per project
 *   - de-duplicates by slug and by image content hash
 *   - writes src/data/previousWork.json
 *   - records local image paths, so nothing is ever hotlinked from Carbonmade
 *     when the media exists locally
 *
 * Carbonmade exports are not perfectly consistent between accounts, so every
 * field lookup below tries a list of plausible keys and falls back to parsing
 * the markdown. Anything it cannot resolve is reported at the end rather than
 * guessed at.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT_DATA = join(REPO_ROOT, 'src', 'data', 'previousWork.json');
const OUT_IMAGES = join(REPO_ROOT, 'public', 'images', 'previous-work');
const PUBLIC_PREFIX = '/images/previous-work';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.svg']);

const TITLE_KEYS = ['title', 'name', 'heading', 'projectTitle', 'label'];
const DESCRIPTION_KEYS = [
  'description',
  'summary',
  'subtitle',
  'excerpt',
  'caption',
  'intro',
  'body',
  'text',
];
const CATEGORY_KEYS = ['category', 'categories', 'tags', 'type', 'discipline'];

function parseArgs(argv) {
  const args = { source: null, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--source' || arg === '-s') args.source = argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
}

function slugify(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function firstString(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const joined = value.filter((entry) => typeof entry === 'string').join(' · ');
      if (joined.trim()) return joined.trim();
    }
  }
  return '';
}

/** Strip markdown to a readable single paragraph. */
function markdownToText(markdown) {
  return markdown
    .replace(/^---[\s\S]*?---/, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`]/g, '')
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');
}

/** Walk any nested structure and collect strings that look like image paths. */
function collectImageReferences(value, found = []) {
  if (typeof value === 'string') {
    const candidate = value.split('?')[0];
    if (IMAGE_EXTENSIONS.has(extname(candidate).toLowerCase())) found.push(value);
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectImageReferences(entry, found));
    return found;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((entry) => collectImageReferences(entry, found));
  }
  return found;
}

async function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    console.warn(`  ! could not parse ${basename(path)}: ${error.message}`);
    return null;
  }
}

/** Resolve an image reference against the export's assets directory. */
async function resolveAsset(reference, assetIndex) {
  const cleaned = reference.split('?')[0].replace(/^\.?\//, '');
  const name = basename(cleaned).toLowerCase();
  return assetIndex.get(name) ?? null;
}

async function buildAssetIndex(sourceDir) {
  const index = new Map();
  const assetsDir = join(sourceDir, 'assets');
  if (!existsSync(assetsDir)) return index;

  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        index.set(entry.name.toLowerCase(), full);
      }
    }
  };

  await walk(assetsDir);
  return index;
}

/** Determine page order from site-index.json when it provides one. */
function orderFromIndex(siteIndex) {
  if (!siteIndex) return [];
  const candidates = [
    siteIndex.pages,
    siteIndex.projects,
    siteIndex.items,
    siteIndex.order,
    Array.isArray(siteIndex) ? siteIndex : null,
  ].filter(Boolean);

  const list = candidates[0];
  if (!Array.isArray(list)) return [];

  return list
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      return entry?.slug ?? entry?.id ?? entry?.file ?? entry?.path ?? entry?.name ?? null;
    })
    .filter(Boolean)
    .map((value) => slugify(basename(String(value), extname(String(value)))));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.source) {
    console.log(
      [
        'Import a Carbonmade export into src/data/previousWork.json.',
        '',
        '  node scripts/import-carbonmade.mjs --source /path/to/carbonmade-export',
        '  node scripts/import-carbonmade.mjs --source ./export --dry-run',
        '',
        'The export directory should contain site-index.json, pages/ and assets/.',
      ].join('\n'),
    );
    process.exit(args.help ? 0 : 1);
  }

  const sourceDir = resolve(args.source);
  if (!existsSync(sourceDir)) {
    console.error(`Source directory not found: ${sourceDir}`);
    process.exit(1);
  }

  console.log(`Carbonmade import\n  source: ${sourceDir}`);

  const siteIndex = await readJsonIfExists(join(sourceDir, 'site-index.json'));
  const desiredOrder = orderFromIndex(siteIndex);
  if (desiredOrder.length) console.log(`  order: ${desiredOrder.length} entries from site-index.json`);
  else console.log('  order: site-index.json gave no usable order — falling back to filename order');

  const pagesDir = join(sourceDir, 'pages');
  if (!existsSync(pagesDir)) {
    console.error(`No pages/ directory inside ${sourceDir}`);
    process.exit(1);
  }

  const pageFiles = (await readdir(pagesDir)).filter((name) => /\.(json|md)$/i.test(name)).sort();

  // Group .json and .md that describe the same page.
  const pages = new Map();
  for (const file of pageFiles) {
    const slug = slugify(basename(file, extname(file)));
    if (!pages.has(slug)) pages.set(slug, { slug, json: null, markdown: null });
    const entry = pages.get(slug);
    if (file.toLowerCase().endsWith('.json')) entry.json = join(pagesDir, file);
    else entry.markdown = join(pagesDir, file);
  }

  const assetIndex = await buildAssetIndex(sourceDir);
  console.log(`  assets: ${assetIndex.size} image files indexed`);

  if (!args.dryRun) await mkdir(OUT_IMAGES, { recursive: true });

  const seenSlugs = new Set();
  const hashToPublicPath = new Map();
  const results = [];
  const warnings = [];

  const ordered = [
    ...desiredOrder.map((slug) => pages.get(slug)).filter(Boolean),
    ...[...pages.values()].filter((page) => !desiredOrder.includes(page.slug)),
  ];

  for (const page of ordered) {
    if (seenSlugs.has(page.slug)) continue;
    seenSlugs.add(page.slug);

    const data = page.json ? await readJsonIfExists(page.json) : null;
    const markdown = page.markdown ? await readFile(page.markdown, 'utf8') : '';

    let title = firstString(data ?? {}, TITLE_KEYS);
    if (!title && markdown) {
      const heading = markdown.match(/^#\s+(.+)$/m);
      if (heading) title = heading[1].trim();
    }
    if (!title) title = page.slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    let description = firstString(data ?? {}, DESCRIPTION_KEYS);
    if (!description && markdown) description = markdownToText(markdown);
    description = description.replace(/\s+/g, ' ').trim();
    if (description.length > 320) description = `${description.slice(0, 317).trimEnd()}…`;

    const category = firstString(data ?? {}, CATEGORY_KEYS);

    // Images: from structured data first, then any markdown image references.
    const references = [
      ...collectImageReferences(data ?? {}),
      ...[...markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)].map((match) => match[1]),
    ];

    const images = [];
    for (const reference of references) {
      const assetPath = await resolveAsset(reference, assetIndex);
      if (!assetPath) {
        if (/^https?:\/\//i.test(reference)) {
          warnings.push(`${page.slug}: remote image not present in assets/ — ${reference}`);
        }
        continue;
      }

      const bytes = await readFile(assetPath);
      const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 10);

      if (hashToPublicPath.has(hash)) {
        const existing = hashToPublicPath.get(hash);
        if (!images.includes(existing)) images.push(existing);
        continue;
      }

      const extension = extname(assetPath).toLowerCase();
      const fileName = `${page.slug}-${slugify(basename(assetPath, extension)) || 'image'}-${hash}${extension}`;
      const publicPath = `${PUBLIC_PREFIX}/${fileName}`;

      if (!args.dryRun) await copyFile(assetPath, join(OUT_IMAGES, fileName));
      hashToPublicPath.set(hash, publicPath);
      if (!images.includes(publicPath)) images.push(publicPath);
    }

    if (!images.length) warnings.push(`${page.slug}: no local images resolved`);

    results.push({
      slug: page.slug,
      title,
      description,
      category,
      image: images[0] ?? null,
      images,
      /** Kept for reference only. The site always renders the local image. */
      sourcePage: page.json ? `pages/${basename(page.json)}` : `pages/${basename(page.markdown)}`,
    });
  }

  console.log(`\n  projects: ${results.length}`);
  console.log(`  images copied: ${hashToPublicPath.size}`);

  if (args.dryRun) {
    console.log('\n--dry-run: nothing written. Preview:\n');
    console.log(JSON.stringify(results.slice(0, 3), null, 2));
  } else {
    await writeFile(OUT_DATA, `${JSON.stringify(results, null, 2)}\n`);
    console.log(`\n  wrote src/data/previousWork.json`);
    console.log(`  wrote images into public/images/previous-work/`);
  }

  if (warnings.length) {
    console.log(`\n  ${warnings.length} warning(s):`);
    warnings.slice(0, 20).forEach((warning) => console.log(`    - ${warning}`));
    if (warnings.length > 20) console.log(`    … and ${warnings.length - 20} more`);
  }

  console.log('\nNext: npm run build, then review /previous-work.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

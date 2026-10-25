#!/usr/bin/env node
/**
 * Build the Selected Work imagery: card thumbnails and the larger sources the
 * expanded preview loads on demand.
 *
 *   npm run capture:previews              # capture the demos, then build
 *   npm run capture:previews -- linear    # rebuild one project
 *
 * The three prototypes are captured from their public demos at 1600x900 and
 * 2x density, so the preview has 3200px of real pixels to draw from. Nothing is
 * typed or submitted: each flow only opens a record to reach the screen the
 * card shows. Linear comes from the published deck slide, which is already
 * public at 3840x2160.
 *
 * Card and preview sizes are cut from the same capture, so the card is a
 * smaller copy of exactly what the preview shows.
 */

import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import sharp from 'sharp';

const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const PROJECTS = resolve(REPO_ROOT, 'public/images/projects');
const VIEWPORT = { width: 1600, height: 900 };

const CARD_WIDTHS = [960, 1920];
const PREVIEW_WIDTHS = [1600, 2400, 3200];

/** Each flow ends on the screen the card shows, and checks it got there. */
const CAPTURES = {
  'rate-card-manager': {
    url: 'https://rate-card-demo.vercel.app/portfolio.html?slide=14',
    required: ['Ad Tool', 'WPP - Streaming Video Upfront 2026-2027', 'Line Details', 'Ford Motor Company'],
    async reach(page) {
      await page.getByText('WPP - Streaming Video Upfront 2026-2027', { exact: true }).first().click();
      await page.waitForTimeout(1500);
      await page.getByText('Ford Motor Company', { exact: true }).first().click();
      await page.waitForTimeout(1500);
    },
  },
  simba: {
    url: 'https://harps-finance-prototype.vercel.app/v2a/harps.html',
    required: ['Ad Tool', 'Summary for Invoice', 'Cumulative Invoicing Information', 'Sales Line Items'],
    async reach(page) {
      await page.getByText('Northstar Automotive | Fall SUV Launch | Streaming Video', { exact: true }).first().click();
      await page.waitForTimeout(1500);
      await page.getByText('INV-2607-54064 (Default)', { exact: true }).first().click();
      await page.waitForTimeout(1500);
      // The card frames the invoice itself, at the foot of the order.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(500);
    },
  },
  atlas: {
    url: 'https://frances-iam-demo.vercel.app/v4.2/index.html',
    required: ['Ad Tool', 'Access Management', 'Users', 'Last Login'],
    async reach() {},
  },
};

async function capture(browser, slug) {
  const { url, required, reach } = CAPTURES[slug];
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(1500);
    await reach(page);

    const body = await page.evaluate(() => document.body.innerText);
    const missing = required.filter((needle) => !body.toLowerCase().includes(needle.toLowerCase()));
    if (missing.length) throw new Error(`${slug}: expected screen not reached. Missing: ${missing.join(', ')}`);
    if (body.includes('Ad Console')) throw new Error(`${slug}: capture shows outdated Ad Console branding`);

    // No hover, focus ring or caret left over from reaching the screen.
    await page.mouse.move(VIEWPORT.width - 2, VIEWPORT.height - 2);
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    await page.waitForTimeout(600);
    return await page.screenshot({ type: 'png' });
  } finally {
    await page.close();
  }
}

/**
 * The diagram from slide 15 of the Linear deck, below its headline, framed
 * at 16:9 on the slide's own navy so the whole chain of tools stays visible.
 */
async function linearSource() {
  const slide = resolve(REPO_ROOT, 'public/slides/linear/hi/slide-15.webp');
  const crop = { left: 12, top: 300, width: 3816, height: 1810 };
  const canvas = { width: 3840, height: 2160 };
  const fitted = await sharp(slide)
    .extract(crop)
    .resize({ width: 3760, height: 2080, fit: 'inside' })
    .toBuffer();
  return sharp({ create: { ...canvas, channels: 3, background: { r: 3, g: 0, b: 35 } } })
    .composite([{ input: fitted, gravity: 'centre' }])
    .png()
    .toBuffer();
}

async function write(slug, source) {
  await mkdir(resolve(PROJECTS, 'preview'), { recursive: true });
  for (const width of CARD_WIDTHS) {
    const name = width === 1920 ? `${slug}.webp` : `${slug}-${width}.webp`;
    await sharp(source).resize({ width }).webp({ quality: 86 }).toFile(resolve(PROJECTS, name));
  }
  for (const width of PREVIEW_WIDTHS) {
    const out = resolve(PROJECTS, 'preview', `${slug}-${width}.webp`);
    await mkdir(dirname(out), { recursive: true });
    await sharp(source).resize({ width }).webp({ quality: 90, smartSubsample: true }).toFile(out);
  }
  console.log(`${slug}: cards ${CARD_WIDTHS.join(', ')} · previews ${PREVIEW_WIDTHS.join(', ')}`);
}

async function main() {
  const only = process.argv.slice(2);
  const wanted = (slug) => only.length === 0 || only.includes(slug);
  const slugs = Object.keys(CAPTURES).filter(wanted);

  if (slugs.length) {
    const browser = await chromium.launch();
    try {
      for (const slug of slugs) await write(slug, await capture(browser, slug));
    } finally {
      await browser.close();
    }
  }
  if (wanted('linear')) await write('linear', await linearSource());
}

main().catch((error) => {
  console.error(`\nCapture failed: ${error.message}\n`);
  process.exit(1);
});

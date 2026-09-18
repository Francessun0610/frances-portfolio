#!/usr/bin/env node
/**
 * Capture a real screenshot of the Rate Card Manager prototype.
 *
 *   npm run capture:ratecard
 *
 * The link on the site points at the prototype's presentation entry point
 * (?section=atlas&slide=1), which opens on a title slide layered over the app.
 * A title slide is not a product screenshot, so the capture is taken from the
 * prototype's root URL instead, where the application itself renders:
 * navigation, the Rate Card Manager list, search and filtering, table density,
 * and draft/published states.
 *
 * Nothing about the UI is recreated or retouched. If the expected list view
 * cannot be reached, the script fails loudly instead of saving whatever
 * happened to be on screen.
 */

import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import sharp from 'sharp';

const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUTPUT = resolve(REPO_ROOT, 'public/images/projects/rate-card-manager.webp');

/** The application itself, without the presentation overlay. */
const CAPTURE_URL = 'https://rate-card-demo.vercel.app/';

// 1440x900 is exactly 16:10, matching the project card's aspect ratio.
const VIEWPORT = { width: 1440, height: 900 };

/** Text that must be on screen for this to count as the rate card list. */
const REQUIRED_TEXT = [
  'Rate Card Manager',
  'Rate Card ID',
  'Marketplace',
  'Published',
  'Draft',
];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });

  try {
    console.log(`Opening ${CAPTURE_URL}`);
    await page.goto(CAPTURE_URL, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(2000);

    const body = await page.evaluate(() => document.body.innerText);
    const missing = REQUIRED_TEXT.filter((needle) => !body.includes(needle));
    if (missing.length) {
      throw new Error(
        `The rate card list view was not reached. Missing on screen: ${missing.join(', ')}.\n` +
          'The prototype may have changed. Re-check the flow before publishing a capture.',
      );
    }

    // Blur any focus ring left over from dismissing the overlay.
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    await page.waitForTimeout(400);

    const shot = await page.screenshot({ type: 'png' });

    await mkdir(dirname(OUTPUT), { recursive: true });
    await sharp(shot)
      .resize({ width: 2560, withoutEnlargement: true })
      .webp({ quality: 86 })
      .toFile(OUTPUT);

    const meta = await sharp(OUTPUT).metadata();
    console.log(
      `Saved public/images/projects/rate-card-manager.webp (${meta.width}x${meta.height})`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`\nCapture failed: ${error.message}\n`);
  process.exit(1);
});

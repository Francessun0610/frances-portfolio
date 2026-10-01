#!/usr/bin/env node
/**
 * Capture a real screenshot of the Rate Card Manager prototype.
 *
 *   npm run capture:ratecard
 *
 * The public portfolio CTA opens the presentation entry
 * (portfolio.html?section=atlas&slide=1). That overlay is not a product
 * screenshot, so this capture dismisses it and shots the application itself:
 * Ad Tool header, Rate Card Manager list, filters, and table density.
 *
 * Nothing about the UI is recreated or retouched. If the expected list view
 * (with the Ad Tool brand) cannot be reached, the script fails loudly.
 */

import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import sharp from 'sharp';

const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUTPUT = resolve(REPO_ROOT, 'public/images/projects/rate-card-manager.webp');

/** Portfolio entry — same origin as the public CTA; app chrome underneath. */
const CAPTURE_URL =
  'https://rate-card-demo.vercel.app/portfolio.html?section=atlas&slide=1';

// 1440x900 is exactly 16:10, matching the project card's aspect ratio.
const VIEWPORT = { width: 1440, height: 900 };

/** Text that must be on screen for this to count as the current product UI. */
const REQUIRED_TEXT = [
  'Ad Tool',
  'Rate Card Manager',
  'Marketplace',
  'Published',
  'Draft',
];

/** Must not appear — old branding. */
const FORBIDDEN_TEXT = ['Ad Console'];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });

  try {
    console.log(`Opening ${CAPTURE_URL}`);
    await page.goto(CAPTURE_URL, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(1500);

    // Presentation overlay sits on top of the app. Escape reveals the product.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);

    // If Escape did not clear the overlay, try a known dismiss control.
    const stillOverlay = await page.evaluate(() => {
      const brand = [...document.querySelectorAll('.gnav__brand-name')]
        .filter((el) => el.offsetParent)
        .map((el) => el.textContent.trim());
      return !brand.includes('Ad Tool');
    });
    if (stillOverlay) {
      const hide = page.getByRole('button', { name: /hide/i });
      if (await hide.count()) {
        await hide.first().click();
        await page.waitForTimeout(800);
      }
    }

    const body = await page.evaluate(() => document.body.innerText);
    const missing = REQUIRED_TEXT.filter((needle) => !body.includes(needle));
    if (missing.length) {
      throw new Error(
        `The rate card list view was not reached. Missing on screen: ${missing.join(', ')}.\n` +
          'The prototype may have changed. Re-check the flow before publishing a capture.',
      );
    }
    const forbidden = FORBIDDEN_TEXT.filter((needle) => body.includes(needle));
    if (forbidden.length) {
      throw new Error(
        `Capture still shows outdated branding: ${forbidden.join(', ')}. Aborting.`,
      );
    }

    const visibleBrand = await page.evaluate(() =>
      [...document.querySelectorAll('.gnav__brand-name')]
        .filter((el) => el.offsetParent)
        .map((el) => el.textContent.trim()),
    );
    if (!visibleBrand.includes('Ad Tool')) {
      throw new Error(`Visible brand is not Ad Tool (got: ${visibleBrand.join(', ') || 'none'}).`);
    }

    // Blur any focus ring left over from dismissing the overlay.
    await page.evaluate(
      () => document.activeElement instanceof HTMLElement && document.activeElement.blur(),
    );
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
    console.log(`Visible brand: ${visibleBrand.join(', ')}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`\nCapture failed: ${error.message}\n`);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * QA for the Previous Work archive.
 *
 *   npm run qa:previous
 *
 * Checks every archive route at five widths: that imagery loads and is not
 * distorted or cropped, that nothing leaks the source platform or developer
 * instructions, and that every link in and out of the archive resolves.
 */

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { startPreview, Report } from './lib.mjs';

const WIDTHS = [1440, 1024, 768, 430, 390];

const EXPECTED_COLUMNS = {
  1440: 3,
  1024: 2,
  768: 2,
  430: 1,
  390: 1,
};

/** Terms that must never reach a visitor. */
const FORBIDDEN = [
  'carbonmade',
  'importer',
  'import script',
  'migration',
  'previousWork.json',
  'npm run',
  'node scripts',
  'src/data',
  'public/images',
  'has not been imported',
];

/**
 * Force every lazy image to load and wait for it.
 *
 * Scrolling alone is unreliable on the longer archive pages, where 40+ images
 * sit below the fold. Flipping them to eager starts the fetch immediately, so
 * a later `complete` check measures the asset rather than the scroll timing.
 */
async function settleImages(page) {
  await page.evaluate(async () => {
    const images = [...document.querySelectorAll('main img')];
    images.forEach((img) => img.setAttribute('loading', 'eager'));
    await Promise.all(
      images.map((img) =>
        img.complete
          ? null
          : new Promise((resolve) => {
              img.addEventListener('load', resolve, { once: true });
              img.addEventListener('error', resolve, { once: true });
            }),
      ),
    );
  });
  await page.waitForTimeout(300);
}

async function main() {
  const projects = JSON.parse(readFileSync('src/data/previousWork.json', 'utf8'));
  const published = projects.filter((project) => project.title.trim());

  const report = new Report('Previous Work QA');
  // lib's Report takes (condition, label); read better label-first here.
  const check = (label, condition, detail = '') => report.check(condition, label, detail);

  const preview = await startPreview();
  const browser = await chromium.launch();

  try {
    const routes = ['/previous-work', ...published.map((p) => `/previous-work/${p.slug}`)];

    // ---- routes resolve -------------------------------------------------
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    for (const route of routes) {
      const response = await page.goto(preview.base + route, { waitUntil: 'domcontentloaded' });
      check(`${route} responds 200`, response?.status() === 200, `got ${response?.status()}`);
    }

    // ---- imagery ---------------------------------------------------------
    for (const route of routes) {
      await page.goto(preview.base + route, { waitUntil: 'networkidle' });
      await settleImages(page);

      const images = await page.evaluate(() =>
        [...document.querySelectorAll('main img')].map((img) => {
          const rect = img.getBoundingClientRect();
          return {
            src: img.getAttribute('src') || '',
            currentSrc: img.currentSrc,
            complete: img.complete,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            renderedWidth: rect.width,
            renderedHeight: rect.height,
            objectFit: getComputedStyle(img).objectFit,
            hasDimensions: Boolean(img.getAttribute('width') && img.getAttribute('height')),
            alt: img.getAttribute('alt'),
          };
        }),
      );

      const broken = images.filter((i) => !i.complete || i.naturalWidth === 0);
      check(`${route}: all images load`, broken.length === 0, `${broken.length} broken`);

      const remote = images.filter((i) => /^https?:\/\//i.test(i.src));
      check(`${route}: no remote image URLs`, remote.length === 0, remote.map((i) => i.src).join(', '));

      const missingAlt = images.filter((i) => !i.alt || !i.alt.trim());
      check(`${route}: every image has alt text`, missingAlt.length === 0);

      const noDims = images.filter((i) => !i.hasDimensions);
      check(`${route}: images declare width/height`, noDims.length === 0);

      // Distortion: rendered ratio must match the file's own ratio unless the
      // image is deliberately letterboxed with object-fit: contain.
      const distorted = images.filter((i) => {
        if (i.objectFit === 'contain' || !i.renderedWidth || !i.renderedHeight) return false;
        const natural = i.naturalWidth / i.naturalHeight;
        const rendered = i.renderedWidth / i.renderedHeight;
        return Math.abs(natural - rendered) / natural > 0.02;
      });
      check(`${route}: no distorted images`, distorted.length === 0, `${distorted.length}`);
    }

    // ---- nothing leaks ----------------------------------------------------
    for (const route of routes) {
      await page.goto(preview.base + route, { waitUntil: 'domcontentloaded' });
      const text = (await page.evaluate(() => document.body.innerText)).toLowerCase();
      const hits = FORBIDDEN.filter((term) => text.includes(term.toLowerCase()));
      check(`${route}: no source or developer detail visible`, hits.length === 0, hits.join(', '));
    }

    // ---- responsive -------------------------------------------------------
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        deviceScaleFactor: 1,
        isMobile: width < 768,
        hasTouch: width < 768,
      });
      const responsive = await context.newPage();

      for (const route of ['/previous-work', `/previous-work/${published[0].slug}`]) {
        await responsive.goto(preview.base + route, { waitUntil: 'networkidle' });
        await responsive.waitForTimeout(400);

        const overflow = await responsive.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        check(`${width}px ${route}: no horizontal overflow`, overflow <= 1, `${overflow}px`);

        const wide = await responsive.evaluate((w) =>
          [...document.querySelectorAll('main *')]
            .filter((el) => el.getBoundingClientRect().right > w + 1)
            .map((el) => el.tagName + '.' + String(el.className).slice(0, 30))
            .slice(0, 3),
        width);
        check(`${width}px ${route}: nothing extends past the viewport`, wide.length === 0, wide.join(', '));
      }

      // Column count on the grid.
      await responsive.goto(preview.base + '/previous-work', { waitUntil: 'networkidle' });
      const columns = await responsive.evaluate(() => {
        const grid = document.querySelector('.archive');
        return getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
      });
      check(
        `${width}px: archive grid uses ${EXPECTED_COLUMNS[width]} column(s)`,
        columns === EXPECTED_COLUMNS[width],
        `got ${columns}`,
      );

      await context.close();
    }

    // ---- links ------------------------------------------------------------
    await page.goto(preview.base + '/', { waitUntil: 'domcontentloaded' });
    const homeLinks = await page.evaluate(() =>
      [...document.querySelectorAll('a[href="/previous-work"]')].map((a) => {
        const inHeader = Boolean(a.closest('header'));
        const inFooter = Boolean(a.closest('footer'));
        return inHeader ? 'header' : inFooter ? 'footer' : 'body';
      }),
    );
    check('homepage links to Previous Work from the header', homeLinks.includes('header'));
    check('homepage links to Previous Work from the footer', homeLinks.includes('footer'));
    check('homepage Previous Work section links through', homeLinks.includes('body'));

    await page.goto(preview.base + '/previous-work', { waitUntil: 'domcontentloaded' });
    const cardLinks = await page.evaluate(() =>
      [...document.querySelectorAll('.archive__link')].map((a) => a.getAttribute('href')),
    );
    check(
      'every linked card points at an archive route',
      cardLinks.every((href) => href?.startsWith('/previous-work/')),
    );
    for (const href of cardLinks) {
      const response = await page.request.get(preview.base + href);
      check(`card link ${href} resolves`, response.status() === 200, `${response.status()}`);
    }

    for (const project of published) {
      await page.goto(preview.base + `/previous-work/${project.slug}`, { waitUntil: 'domcontentloaded' });
      const back = await page.evaluate(
        () => [...document.querySelectorAll('a[href="/previous-work"]')].length,
      );
      check(`${project.slug}: has a Back to Previous Work link`, back > 0);

      const external = await page.evaluate(() =>
        [...document.querySelectorAll('main a')]
          .map((a) => a.getAttribute('href') || '')
          .filter((href) => /carbonmade/i.test(href)),
      );
      check(`${project.slug}: does not link back to the old site`, external.length === 0);
    }
  } finally {
    await browser.close();
    await preview.stop();
  }

  return report.finish();
}

main().then((code) => process.exit(code));

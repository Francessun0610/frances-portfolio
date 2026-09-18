#!/usr/bin/env node
/**
 * Responsive visual QA.
 *
 *   npm run build && npm run qa:screenshots
 *
 * Captures every route at the eight target viewports, plus the first, middle
 * and last slide of each talk, and asserts the layout rules that matter:
 * no horizontal overflow, a true 16:9 slide frame, controls that stay inside
 * the container, and touch targets big enough on mobile.
 *
 * Screenshots land in qa-output/screenshots/.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { chromium } from 'playwright';

import {
  DECKS,
  QA_OUTPUT,
  REPO_ROOT,
  ROUTES,
  Report,
  VIEWPORTS,
  ensureDir,
  findOverflowingElements,
  hasHorizontalOverflow,
  startPreview,
} from './lib.mjs';

const SHOTS = join(QA_OUTPUT, 'screenshots');

/**
 * Force lazy images to resolve before capturing, so a screenshot never shows an
 * empty box for an image that loads fine in a real session.
 */
async function settleImages(page) {
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
    await Promise.all(
      Array.from(document.images)
        .filter((image) => !image.complete)
        .map(
          (image) =>
            new Promise((resolve) => {
              image.addEventListener('load', resolve, { once: true });
              image.addEventListener('error', resolve, { once: true });
              setTimeout(resolve, 3000);
            }),
        ),
    );
  });
  await page.waitForTimeout(200);
}

async function deckLength(deck) {
  const manifest = JSON.parse(
    await readFile(join(REPO_ROOT, 'public', 'slides', deck, 'slides.json'), 'utf8'),
  );
  return manifest.length;
}

/** Measurements of the viewer as rendered. */
const measureViewer = () => {
  const root = document.querySelector('[data-viewer]');
  if (!root) return null;
  const frame = root.querySelector('.viewer__frame');
  const image = root.querySelector('[data-slide]');
  const bar = root.querySelector('.viewer__bar');
  const rail = root.querySelector('[data-rail]');
  const counter = root.querySelector('.viewer__counter');
  const prev = root.querySelector('[data-prev]');
  const next = root.querySelector('[data-next]');
  const fullscreen = root.querySelector('[data-fullscreen]');
  const shell = root.closest('.shell');

  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, right: r.right, width: r.width, height: r.height };
  };

  const frameBox = box(frame);
  const imageBox = box(image);

  return {
    frame: frameBox,
    image: imageBox,
    bar: box(bar),
    rail: box(rail),
    counter: box(counter),
    prev: box(prev),
    next: box(next),
    fullscreenVisible: !!fullscreen && !fullscreen.hidden,
    shell: box(shell),
    shellStyles: shell
      ? {
          paddingLeft: parseFloat(getComputedStyle(shell).paddingLeft),
          contentWidth: shell.clientWidth,
        }
      : null,
    railScrollable: rail ? rail.scrollWidth > rail.clientWidth : false,
    // Does the rendered image fit inside its frame without being cut off?
    imageFits: frameBox && imageBox
      ? imageBox.width <= frameBox.width + 1 && imageBox.height <= frameBox.height + 1
      : false,
    counterText: counter ? counter.innerText.replace(/\s+/g, ' ').trim() : null,
    barBelowFrame: frameBox && box(bar) ? box(bar).top >= frameBox.top + frameBox.height - 1 : false,
  };
};

async function main() {
  const report = new Report('Responsive visual QA');
  await ensureDir(SHOTS);

  const preview = await startPreview(4322);
  const browser = await chromium.launch();

  const lengths = {};
  for (const deck of DECKS) lengths[deck] = await deckLength(deck);

  // Route, label, and optional slide to open.
  const targets = [];
  for (const route of ROUTES) targets.push({ ...route, label: route.name });
  for (const deck of DECKS) {
    const total = lengths[deck];
    targets.push({
      path: `/speaking/${deck}?slide=${Math.ceil(total / 2)}`,
      name: deck,
      label: `${deck}-mid`,
    });
    targets.push({ path: `/speaking/${deck}?slide=${total}`, name: deck, label: `${deck}-last` });
  }

  let captured = 0;

  try {
    for (const viewport of VIEWPORTS) {
      report.section(`${viewport.name} (${viewport.band})`);
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        hasTouch: viewport.band === 'mobile' || viewport.band === 'tablet',
        isMobile: viewport.band === 'mobile',
      });
      const page = await context.newPage();

      for (const target of targets) {
        await page.goto(`${preview.base}${target.path}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(250);
        await settleImages(page);

        const overflow = await page.evaluate(hasHorizontalOverflow);
        if (overflow) {
          const offenders = await page.evaluate(findOverflowingElements);
          report.check(false, `${target.label}: no horizontal overflow`, offenders.join(' | '));
        } else {
          report.check(true, `${target.label}: no horizontal overflow`);
        }

        await page.screenshot({
          path: join(SHOTS, `${viewport.name}--${target.label}.png`),
          fullPage: true,
        });
        captured += 1;

        // Viewer-specific geometry.
        const viewer = await page.evaluate(measureViewer);
        if (!viewer) continue;

        const ratio = viewer.frame.width / viewer.frame.height;
        report.check(
          Math.abs(ratio - 16 / 9) < 0.02,
          `${target.label}: slide frame is 16:9`,
          ratio.toFixed(3),
        );
        report.check(viewer.imageFits, `${target.label}: slide image is not clipped`);
        report.check(
          viewer.frame.width <= viewer.shellStyles.contentWidth + 1,
          `${target.label}: viewer fits inside the page container`,
          `${Math.round(viewer.frame.width)} vs ${viewer.shellStyles.contentWidth}`,
        );
        report.check(
          viewer.frame.width <= 1121,
          `${target.label}: slide stays within the 1120px max width`,
          String(Math.round(viewer.frame.width)),
        );
        report.check(viewer.barBelowFrame, `${target.label}: navigation sits below the slide`);
        report.check(
          !!viewer.counterText && /\d/.test(viewer.counterText),
          `${target.label}: slide counter is visible`,
          String(viewer.counterText),
        );
        report.check(viewer.rail !== null, `${target.label}: thumbnail rail present`);
        report.check(
          viewer.railScrollable,
          `${target.label}: thumbnail rail scrolls horizontally rather than wrapping`,
        );
        report.check(viewer.fullscreenVisible, `${target.label}: fullscreen control present`);

        if (viewport.band === 'mobile') {
          report.check(
            viewer.prev.height >= 44 && viewer.next.height >= 44,
            `${target.label}: nav buttons meet the 44px touch target`,
            `${Math.round(viewer.prev.height)}px`,
          );
          report.check(
            viewer.prev.width >= 44 && viewer.next.width >= 44,
            `${target.label}: nav buttons are at least 44px wide`,
            `${Math.round(viewer.prev.width)}px / ${Math.round(viewer.next.width)}px`,
          );
        }
      }

      // Gutters should match the brief at each band.
      await page.goto(preview.base, { waitUntil: 'networkidle' });
      const padding = await page.evaluate(
        () => parseFloat(getComputedStyle(document.querySelector('.shell')).paddingLeft),
      );
      const expected = {
        desktop: [48, 64],
        laptop: [32, 64],
        tablet: [32, 40],
        mobile: [20, 24],
      }[viewport.band];
      report.check(
        padding >= expected[0] && padding <= expected[1],
        `page gutter is ${expected[0]}–${expected[1]}px for ${viewport.band}`,
        `${padding}px`,
      );

      await context.close();
    }
  } finally {
    await browser.close();
    await preview.stop();
  }

  console.log(`\n${captured} screenshots written to qa-output/screenshots/`);
  process.exit(report.finish());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

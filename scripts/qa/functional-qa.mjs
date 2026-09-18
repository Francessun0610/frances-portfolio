#!/usr/bin/env node
/**
 * Functional QA: routes, links, the slide viewer, and presentation performance.
 *
 *   npm run build && npm run qa:functional
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { chromium } from 'playwright';

import { DECKS,
  REPO_ROOT, ROUTES, Report, makeSink, startPreview, watchForProblems } from './lib.mjs';

const RATE_CARD_URL = 'https://rate-card-demo.vercel.app/?section=atlas&slide=1';

/**
 * Routes that are intentionally reserved but not yet filled in. These are
 * reported separately rather than counted as broken links, and must be cleared
 * before launch.
 */
const KNOWN_TODO_ROUTES = new Map([
  [
    '/Frances-Sun-Resume.pdf',
    'Drop the resume PDF at public/Frances-Sun-Resume.pdf. The nav route is reserved for it.',
  ],
]);

async function loadManifest(deck) {
  return JSON.parse(await readFile(join(REPO_ROOT, 'public', 'slides', deck, 'slides.json'), 'utf8'));
}

/** Read every speaker note out of the source deck so we can assert none ship. */
async function speakerNoteSamples(deck) {
  const { execFileSync } = await import('node:child_process');
  const script = `
import json, sys, zipfile, re
import xml.etree.ElementTree as ET
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
path = sys.argv[1]
lines = []
with zipfile.ZipFile(path) as zf:
    for name in zf.namelist():
        if name.startswith("ppt/notesSlides/") and name.endswith(".xml"):
            root = ET.fromstring(zf.read(name))
            for t in root.iter(A + "t"):
                if t.text and len(t.text.strip()) > 40:
                    lines.append(t.text.strip())
print(json.dumps(lines))
`;
  const source = join(REPO_ROOT, 'content', 'speaking', 'source', `${deck}.pptx`);
  try {
    const out = execFileSync('python3', ['-c', script, source], { encoding: 'utf8' });
    return JSON.parse(out);
  } catch {
    return [];
  }
}

async function checkViewer(page, base, deck, manifest, report) {
  const total = manifest.length;
  const middle = Math.ceil(total / 2);
  const url = `${base}/speaking/${deck}`;

  report.section(`viewer: ${deck} (${total} slides)`);

  const currentIndex = () => page.locator('[data-current]').innerText().then((t) => Number(t.trim()));
  const mainSrc = () => page.locator('[data-slide]').getAttribute('src');

  await page.goto(url, { waitUntil: 'networkidle' });

  report.check((await currentIndex()) === 1, 'slide 1 loads');
  report.check((await mainSrc()) === manifest[0].image, 'slide 1 image matches the manifest');

  // Next / Previous
  await page.click('[data-next]');
  report.check((await currentIndex()) === 2, 'Next advances the slide');
  report.check((await mainSrc()) === manifest[1].image, 'Next swaps the image');

  await page.click('[data-prev]');
  report.check((await currentIndex()) === 1, 'Previous goes back');

  report.check(
    await page.locator('[data-prev]').isDisabled(),
    'Previous is disabled on the first slide',
  );

  // Keyboard
  await page.locator('[data-next]').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  report.check((await currentIndex()) === 3, 'Right Arrow advances');

  await page.keyboard.press('ArrowLeft');
  report.check((await currentIndex()) === 2, 'Left Arrow goes back');

  await page.keyboard.press('End');
  report.check((await currentIndex()) === total, 'End jumps to the last slide');
  report.check(
    await page.locator('[data-next]').isDisabled(),
    'Next is disabled on the last slide',
  );

  await page.keyboard.press('Home');
  report.check((await currentIndex()) === 1, 'Home jumps to the first slide');

  // Thumbnail jump
  await page.click(`[data-thumb="${middle}"]`);
  report.check((await currentIndex()) === middle, 'thumbnail click jumps to that slide');
  report.check(
    (await page.locator(`[data-thumb="${middle}"]`).getAttribute('aria-current')) === 'true',
    'active thumbnail is marked aria-current',
  );

  // The rail follows the current slide.
  const railScroll = await page.evaluate(() => document.querySelector('[data-rail]').scrollLeft);
  report.check(railScroll > 0, 'thumbnail rail scrolled to follow the current slide');

  // URL + deep linking
  report.check(new URL(page.url()).searchParams.get('slide') === String(middle), 'URL updates with ?slide=N');

  await page.reload({ waitUntil: 'networkidle' });
  report.check((await currentIndex()) === middle, 'reload preserves ?slide=N');

  await page.goto(`${url}?slide=${total}`, { waitUntil: 'networkidle' });
  report.check((await currentIndex()) === total, `direct deep link ?slide=${total} works`);
  report.check(
    (await mainSrc()) === manifest[total - 1].image,
    'deep link loads the correct image immediately',
  );

  await page.goto(`${url}?slide=banana`, { waitUntil: 'networkidle' });
  report.check((await currentIndex()) === 1, '?slide=banana falls back to slide 1');

  await page.goto(`${url}?slide=999`, { waitUntil: 'networkidle' });
  report.check((await currentIndex()) === 1, '?slide=999 falls back to slide 1');

  await page.goto(`${url}?slide=-4`, { waitUntil: 'networkidle' });
  report.check((await currentIndex()) === 1, '?slide=-4 falls back to slide 1');

  await page.goto(`${url}?slide=2.5`, { waitUntil: 'networkidle' });
  report.check((await currentIndex()) === 1, '?slide=2.5 falls back to slide 1');

  // Counter correctness at an arbitrary point.
  await page.goto(`${url}?slide=${middle}`, { waitUntil: 'networkidle' });
  const counterText = await page.locator('.viewer__counter').innerText();
  report.check(
    counterText.replace(/\s+/g, ' ').includes(`${middle}`) && counterText.includes(String(total)),
    `slide counter reads ${middle} / ${total}`,
    counterText.replace(/\s+/g, ' '),
  );

  // Slide text tracks the current slide. Open the disclosure first — a closed
  // <details> renders nothing, so innerText would be empty either way.
  await page.locator('.slide-text > summary').click();
  const visibleText = await page.locator(`[data-text-for="${middle}"]`).innerText();
  const expected = manifest[middle - 1].visibleText.split('\n').filter(Boolean)[0] ?? '';
  report.check(
    expected === '' || visibleText.includes(expected),
    'Slide text matches the current slide',
    `expected to contain "${expected.slice(0, 40)}"`,
  );
  const otherHidden = await page.locator(`[data-text-for="1"]`).isHidden();
  report.check(otherHidden, 'other slides’ text stays hidden');

  // Fullscreen control exists and is labelled.
  const fsLabel = await page.locator('[data-fullscreen]').getAttribute('aria-label');
  report.check(fsLabel === 'Enter fullscreen', 'fullscreen button is present and labelled');
  const fsWorks = await page.evaluate(async () => {
    const root = document.querySelector('[data-viewer]');
    if (!root?.requestFullscreen) return 'unsupported';
    try {
      await root.requestFullscreen();
      const ok = document.fullscreenElement === root;
      if (ok) await document.exitFullscreen();
      return ok ? 'entered' : 'refused';
    } catch (error) {
      return `error: ${error.message}`;
    }
  });
  report.check(
    fsWorks === 'entered' || fsWorks === 'unsupported' || fsWorks === 'refused',
    `fullscreen works or degrades gracefully (${fsWorks})`,
  );

  // Overview overlay.
  await page.click('[data-overview]');
  const dialogOpen = await page.evaluate(() => !!document.querySelector('dialog.overview[open]'));
  report.check(dialogOpen, 'slide overview opens');
  const overviewCount = await page.locator('.overview__item').count();
  report.check(overviewCount === total, `overview lists all ${total} slides`, String(overviewCount));
  await page.keyboard.press('Escape');
  const dialogClosed = await page.evaluate(() => !document.querySelector('dialog.overview[open]'));
  report.check(dialogClosed, 'Escape closes the slide overview');

  // Swipe, in a touch-enabled mobile context.
  const touchContext = await page.context().browser().newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const swipe = await touchContext.newPage();
  await swipe.goto(`${url}?slide=5`, { waitUntil: 'networkidle' });
  const stage = await swipe.locator('[data-stage]').boundingBox();

  const doSwipe = async (fromX, toX) => {
    await swipe.evaluate(
      ([startX, endX, y]) => {
        const target = document.querySelector('[data-stage]');
        const make = (clientX) =>
          new Touch({ identifier: 1, target, clientX, clientY: y, pageX: clientX, pageY: y });
        target.dispatchEvent(
          new TouchEvent('touchstart', { touches: [make(startX)], bubbles: true, cancelable: true }),
        );
        target.dispatchEvent(
          new TouchEvent('touchend', {
            changedTouches: [make(endX)],
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      [fromX, toX, y],
    );
    await swipe.waitForTimeout(300);
  };

  const y = stage.y + stage.height / 2;
  await doSwipe(stage.x + stage.width - 40, stage.x + 40);
  let afterSwipe = Number((await swipe.locator('[data-current]').innerText()).trim());
  report.check(afterSwipe === 6, 'swipe left advances the slide on mobile', `got ${afterSwipe}`);

  await doSwipe(stage.x + 40, stage.x + stage.width - 40);
  afterSwipe = Number((await swipe.locator('[data-current]').innerText()).trim());
  report.check(afterSwipe === 5, 'swipe right goes back on mobile', `got ${afterSwipe}`);

  await touchContext.close();

  // No autoplay: the slide must not move on its own.
  await page.goto(`${url}?slide=4`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  report.check((await currentIndex()) === 4, 'no autoplay or auto-advance after 3.5s');
}

async function checkNoSpeakerNotes(page, base, deck, report) {
  // A line that is also printed on the slide cannot demonstrate a note leak:
  // it is on the page because it is part of the artwork. Frances repeats some
  // of her on-slide lines in her notes, so those are excluded to keep this
  // check meaningful rather than noisy.
  const manifest = await loadManifest(deck);
  const onSlide = manifest.map((slide) => slide.visibleText ?? '').join('\n');
  const notes = (await speakerNoteSamples(deck)).filter((note) => !onSlide.includes(note));

  await page.goto(`${base}/speaking/${deck}`, { waitUntil: 'networkidle' });
  const html = await page.content();

  const leaked = notes.filter((note) => html.includes(note));
  report.check(
    leaked.length === 0,
    `no speaker notes in the rendered page (${notes.length} note-only lines checked)`,
    leaked.slice(0, 2).join(' | '),
  );

  // The .pptx itself must not be reachable.
  const response = await page.request.get(`${base}/slides/${deck}/${deck}.pptx`, {
    failOnStatusCode: false,
  });
  report.check(response.status() === 404, 'source .pptx is not downloadable from the site');

  const contentResponse = await page.request.get(`${base}/content/speaking/source/${deck}.pptx`, {
    failOnStatusCode: false,
  });
  report.check(contentResponse.status() === 404, 'content/speaking/source is not served');
}

/**
 * At initial load the page must not pull every full-resolution slide.
 */
async function checkPerformance(page, base, deck, total, report) {
  report.section(`presentation performance: ${deck}`);

  const fullSlideRequests = new Set();
  const thumbRequests = new Set();
  let bytes = 0;

  const listener = (response) => {
    const url = response.url();
    if (!url.includes(`/slides/${deck}/`)) return;
    if (url.includes('/thumbs/')) thumbRequests.add(url);
    else fullSlideRequests.add(url);
  };

  page.on('response', listener);
  page.on('response', async (response) => {
    try {
      const length = Number(response.headers()['content-length'] ?? 0);
      bytes += length;
    } catch {
      /* ignore */
    }
  });

  await page.goto(`${base}/speaking/${deck}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  page.off('response', listener);

  report.check(
    fullSlideRequests.size <= 3,
    `initial load fetches at most 3 full slides (current + neighbours), not ${total}`,
    `fetched ${fullSlideRequests.size}`,
  );
  report.check(
    thumbRequests.size < total,
    'thumbnails are lazy-loaded rather than all fetched up front',
    `fetched ${thumbRequests.size} of ${total}`,
  );
  report.check(bytes < 3_000_000, 'initial page weight under 3 MB', `${(bytes / 1e6).toFixed(2)} MB`);
}

async function main() {
  const report = new Report('Functional QA');
  const preview = await startPreview(4321);
  const browser = await chromium.launch();

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const sink = makeSink();
    const page = await context.newPage();
    watchForProblems(page, sink);

    // --- Routes -----------------------------------------------------------
    report.section('routes');
    for (const route of ROUTES) {
      const response = await page.goto(`${preview.base}${route.path}`, { waitUntil: 'networkidle' });
      report.check(response?.status() === 200, `${route.path} returns 200`, String(response?.status()));
      const h1 = await page.locator('h1').count();
      report.check(h1 === 1, `${route.path} has exactly one <h1>`, `found ${h1}`);
    }

    const notFound = await page.goto(`${preview.base}/definitely-not-a-page`, {
      waitUntil: 'domcontentloaded',
    });
    report.check(notFound?.status() === 404, '/unknown returns 404');

    // That navigation was supposed to 404, so its console noise is not a defect.
    sink.consoleErrors.length = 0;
    sink.badResponses.length = 0;

    // --- Links ------------------------------------------------------------
    report.section('links');
    await page.goto(`${preview.base}/`, { waitUntil: 'networkidle' });

    const rateCardHref = await page
      .locator(`a[href="${RATE_CARD_URL}"]`)
      .first()
      .getAttribute('href');
    report.check(rateCardHref === RATE_CARD_URL, 'Rate Card demo URL is exact', String(rateCardHref));
    const rateCardTarget = await page
      .locator(`a[href="${RATE_CARD_URL}"]`)
      .first()
      .getAttribute('target');
    report.check(rateCardTarget === '_blank', 'Rate Card demo opens in a new tab');

    const linkedin = await page.locator('a[href="https://www.linkedin.com/in/sun0610/"]').count();
    report.check(linkedin > 0, 'LinkedIn link present');
    const instagram = await page.locator('a[href="https://www.instagram.com/uxauntie/"]').count();
    report.check(instagram > 0, 'Instagram link present');

    // Internal links on every page must resolve.
    const broken = [];
    const placeholders = [];
    const pendingTodos = new Set();
    for (const route of ROUTES) {
      await page.goto(`${preview.base}${route.path}`, { waitUntil: 'networkidle' });
      const hrefs = await page.$$eval('a[href]', (nodes) => nodes.map((n) => n.getAttribute('href')));
      for (const href of new Set(hrefs)) {
        if (!href) continue;
        if (href === '#' || href === '') placeholders.push(`${route.path} -> "${href}"`);
        if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('#')) continue;
        const target = href.split('#')[0];
        if (!target) continue;
        const res = await page.request.get(`${preview.base}${target}`, { failOnStatusCode: false });
        if (res.status() < 400) continue;
        if (KNOWN_TODO_ROUTES.has(target)) pendingTodos.add(target);
        else broken.push(`${route.path} -> ${href} (${res.status()})`);
      }
    }
    report.check(broken.length === 0, 'no broken internal links', broken.slice(0, 5).join('; '));
    report.check(placeholders.length === 0, 'no dead "#" placeholder links', placeholders.join('; '));

    if (pendingTodos.size) {
      console.log('\n  TODO (reserved routes, not yet filled in):');
      for (const target of pendingTodos) {
        console.log(`    - ${target}: ${KNOWN_TODO_ROUTES.get(target)}`);
      }
    }

    // --- Content ----------------------------------------------------------
    // Confirmed names and facts must appear verbatim, and must not drift.
    report.section('content');
    const pageText = {};
    for (const route of ROUTES) {
      await page.goto(`${preview.base}${route.path}`, { waitUntil: 'networkidle' });
      pageText[route.path] = await page.evaluate(() => document.body.innerText);
    }
    const homeText = pageText['/'];

    const homeMust = [
      'Frances Sun',
      'Lead UX Designer',
      '18+ years designing complex enterprise products and operational systems.',
      'Based in Austin, Texas.',
      'Rate Card Manager',
      'Atlas — Identity & Access Management',
      'SIMBA — Financial Systems 2.0',
      'Linear Advertising Workflows',
      // The homepage carries the two most recent talks; the rest live on
      // /speaking, which is checked separately.
      'When the Domain Is Fuzzy, the UI Pays the Price',
      'What Enterprise UX Taught Me About Clarity',
      'DDD Europe 2026',
      'UX Day 2026',
      'Previous Work',
      'Selected Work',
      'Speaking',
    ];
    for (const phrase of homeMust) {
      report.check(homeText.includes(phrase), `homepage contains "${phrase}"`);
    }

    report.check(
      pageText['/speaking/canux-2025'].includes('Ottawa, Canada'),
      'CanUX page states the location Ottawa, Canada',
    );
    report.check(
      pageText['/speaking/ddd-europe-2026'].includes('Antwerp, Belgium') &&
        pageText['/speaking/ddd-europe-2026'].includes(
          'When the Domain Is Fuzzy, the UI Pays the Price',
        ),
      'DDD Europe page states its title and Antwerp, Belgium',
    );

    // --- Talk ordering ------------------------------------------------------
    // Newest first, everywhere a list of talks appears.
    report.section('speaking order');
    const orderOf = async (path) => {
      await page.goto(`${preview.base}${path}`, { waitUntil: 'networkidle' });
      return page.$$eval('.talk-card a[href^="/speaking/"]', (nodes) =>
        nodes.map((node) => node.getAttribute('href').replace('/speaking/', '')),
      );
    };

    const indexOrder = await orderOf('/speaking');
    report.check(
      JSON.stringify(indexOrder) ===
        JSON.stringify(['ddd-europe-2026', 'uiuc-ux-day-2026', 'canux-2025']),
      '/speaking lists talks newest first',
      indexOrder.join(' > '),
    );

    const homeOrder = await orderOf('/');
    report.check(
      JSON.stringify(homeOrder) === JSON.stringify(['ddd-europe-2026', 'uiuc-ux-day-2026']),
      'homepage shows the two most recent talks, newest first',
      homeOrder.join(' > '),
    );
    report.check(
      homeText.includes('All speaking'),
      'homepage keeps a link through to the full speaking list',
    );

    // Talks not shown on the homepage must still be reachable and named.
    const speakingText = pageText['/speaking'];
    for (const phrase of [
      'When the Domain Is Fuzzy, the UI Pays the Price',
      'What Enterprise UX Taught Me About Clarity',
      'Infusing Enterprise Creativity with a Dose of Playfulness',
    ]) {
      report.check(speakingText.includes(phrase), `/speaking lists "${phrase}"`);
    }
    report.check(
      pageText['/speaking/uiuc-ux-day-2026'].includes('Siebel Center for Design') &&
        pageText['/speaking/uiuc-ux-day-2026'].includes('University of Illinois Urbana-Champaign'),
      'UIUC page names the Siebel Center for Design and the university',
    );

    // Titles and descriptions must be unique per page.
    const metadata = [];
    for (const route of ROUTES) {
      await page.goto(`${preview.base}${route.path}`, { waitUntil: 'domcontentloaded' });
      metadata.push(
        await page.evaluate(() => ({
          title: document.title,
          description: document.querySelector('meta[name="description"]')?.content,
          canonical: document.querySelector('link[rel="canonical"]')?.href,
          og: document.querySelector('meta[property="og:image"]')?.content,
          jsonLd: Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(
            (node) => JSON.parse(node.textContent)['@type'],
          ),
        })),
      );
    }
    report.check(
      new Set(metadata.map((m) => m.title)).size === metadata.length,
      'every page has a unique <title>',
    );
    report.check(
      new Set(metadata.map((m) => m.description)).size === metadata.length,
      'every page has a unique meta description',
    );
    report.check(
      metadata.every((m) => m.canonical && m.og),
      'every page has a canonical URL and an OG image',
    );
    report.check(
      metadata[0].title === 'Frances Sun | Lead UX Designer — Enterprise Product Design',
      'homepage title matches the brief',
      metadata[0].title,
    );
    report.check(
      metadata.every((m) => m.jsonLd.includes('Person')),
      'every page embeds the Person JSON-LD',
    );

    const sitemap = await page.request.get(`${preview.base}/sitemap-index.xml`);
    report.check(sitemap.status() === 200, 'sitemap-index.xml is served');
    const robots = await page.request.get(`${preview.base}/robots.txt`);
    report.check(robots.status() === 200, 'robots.txt is served');
    report.check((await robots.text()).includes('Sitemap:'), 'robots.txt points at the sitemap');

    // --- Viewer -----------------------------------------------------------
    for (const deck of DECKS) {
      const manifest = await loadManifest(deck);
      await checkViewer(page, preview.base, deck, manifest, report);
      await checkNoSpeakerNotes(page, preview.base, deck, report);

      const perfPage = await context.newPage();
      await checkPerformance(perfPage, preview.base, deck, manifest.length, report);
      await perfPage.close();
    }

    // --- Console health ---------------------------------------------------
    report.section('console and network');
    report.check(sink.pageErrors.length === 0, 'no uncaught JavaScript errors', sink.pageErrors.slice(0, 3).join('; '));
    report.check(
      sink.consoleErrors.length === 0,
      'no console errors',
      sink.consoleErrors.slice(0, 3).join('; '),
    );
    const realBadResponses = sink.badResponses.filter((entry) => !entry.includes('definitely-not-a-page'));
    report.check(realBadResponses.length === 0, 'no asset 404s', realBadResponses.slice(0, 5).join('; '));
    report.check(
      sink.failedRequests.length === 0,
      'no failed requests',
      sink.failedRequests.slice(0, 3).join('; '),
    );
  } finally {
    await browser.close();
    await preview.stop();
  }

  process.exit(report.finish());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

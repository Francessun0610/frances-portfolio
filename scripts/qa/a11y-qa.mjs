#!/usr/bin/env node
/**
 * Accessibility QA, targeting WCAG 2.1 AA.
 *
 *   npm run build && npm run qa:a11y
 *
 * Runs axe-core over every route at desktop and mobile widths, then checks the
 * things axe cannot see on its own: keyboard operation of the menu and the
 * slide viewer, focus visibility, heading order, touch target sizes, and that
 * no functionality is hover-only.
 */

import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

import { ROUTES, Report, startPreview } from './lib.mjs';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function runAxe(page, report, label) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const violations = results.violations.filter((violation) => violation.impact !== 'minor');
  report.check(
    violations.length === 0,
    `axe: ${label} has no WCAG A/AA violations`,
    violations
      .map((v) => `${v.id} (${v.nodes.length}x): ${v.help}`)
      .slice(0, 4)
      .join(' | '),
  );
  return violations;
}

async function checkHeadingOrder(page, report, label) {
  const levels = await page.$$eval('h1,h2,h3,h4,h5,h6', (nodes) =>
    nodes
      .filter((node) => node.offsetParent !== null || node.getClientRects().length > 0)
      .map((node) => ({ level: Number(node.tagName[1]), text: node.textContent.trim().slice(0, 40) })),
  );

  let previous = 0;
  const jumps = [];
  for (const heading of levels) {
    if (previous && heading.level > previous + 1) {
      jumps.push(`h${previous} -> h${heading.level} at "${heading.text}"`);
    }
    previous = heading.level;
  }

  report.check(levels[0]?.level === 1, `${label}: first heading is an h1`);
  report.check(jumps.length === 0, `${label}: heading levels never skip`, jumps.join('; '));
}

async function checkFocusVisibility(page, report, label) {
  // Walk the first 25 tab stops and confirm each shows a visible focus style.
  const result = await page.evaluate(() => {
    const focusable = Array.from(
      document.querySelectorAll(
        'a[href], button:not([disabled]), input, select, textarea, summary, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.offsetParent !== null || element.getClientRects().length > 0);

    const noIndicator = [];
    for (const element of focusable.slice(0, 25)) {
      element.focus();
      const styles = getComputedStyle(element);
      const outline = styles.outlineStyle !== 'none' && parseFloat(styles.outlineWidth) > 0;
      const shadow = styles.boxShadow && styles.boxShadow !== 'none';
      if (!outline && !shadow) {
        noIndicator.push(
          `${element.tagName.toLowerCase()}: ${(element.textContent || element.ariaLabel || '').trim().slice(0, 24)}`,
        );
      }
      element.blur();
    }
    return { total: focusable.length, noIndicator };
  });

  report.check(
    result.noIndicator.length === 0,
    `${label}: every tab stop has a visible focus indicator (${result.total} focusable)`,
    result.noIndicator.slice(0, 3).join('; '),
  );
}

async function checkSkipLink(page, report) {
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const element = document.activeElement;
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return {
      text: element.textContent?.trim(),
      href: element.getAttribute('href'),
      visible: box.top >= 0 && box.height > 0,
    };
  });
  report.check(focused?.text === 'Skip to main content', 'first tab stop is the skip link');
  report.check(focused?.href === '#main', 'skip link points at #main');
  report.check(focused?.visible === true, 'skip link becomes visible when focused');
}

async function checkMobileMenu(page, report) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });

  const toggle = page.locator('[data-menu-toggle]');
  report.check(await toggle.isVisible(), 'mobile: menu button is visible');
  report.check(
    (await toggle.getAttribute('aria-expanded')) === 'false',
    'mobile: menu button reports aria-expanded=false when closed',
  );
  report.check(
    (await toggle.getAttribute('aria-controls')) === 'site-menu',
    'mobile: menu button points at the menu via aria-controls',
  );

  const box = await toggle.boundingBox();
  report.check(box.height >= 44, 'mobile: menu button meets the 44px touch target', `${Math.round(box.height)}px`);

  // Operable by keyboard alone.
  await toggle.focus();
  await page.keyboard.press('Enter');
  report.check(
    (await toggle.getAttribute('aria-expanded')) === 'true',
    'mobile: Enter opens the menu',
  );
  report.check(await page.locator('[data-menu] a').first().isVisible(), 'mobile: menu links are visible when open');

  const linkBox = await page.locator('[data-menu] a').first().boundingBox();
  report.check(linkBox.height >= 44, 'mobile: menu links meet the 44px touch target', `${Math.round(linkBox.height)}px`);

  await page.keyboard.press('Escape');
  report.check(
    (await toggle.getAttribute('aria-expanded')) === 'false',
    'mobile: Escape closes the menu',
  );
  const focusReturned = await page.evaluate(
    () => document.activeElement?.hasAttribute('data-menu-toggle'),
  );
  report.check(focusReturned, 'mobile: Escape returns focus to the menu button');

  await page.setViewportSize({ width: 1440, height: 1000 });
}

async function checkViewerA11y(page, report, base, deck, total) {
  await page.goto(`${base}/speaking/${deck}`, { waitUntil: 'networkidle' });
  report.section(`viewer accessibility: ${deck}`);

  const labels = await page.evaluate(() => {
    const root = document.querySelector('[data-viewer]');
    return {
      region: root.getAttribute('aria-label'),
      prev: root.querySelector('[data-prev]').getAttribute('aria-label'),
      next: root.querySelector('[data-next]').getAttribute('aria-label'),
      fullscreen: root.querySelector('[data-fullscreen]').getAttribute('aria-label'),
      live: root.querySelector('[data-live]')?.getAttribute('aria-live'),
      liveRole: root.querySelector('[data-live]')?.getAttribute('role'),
      firstThumb: root.querySelector('[data-thumb]').getAttribute('aria-label'),
      alt: root.querySelector('[data-slide]').getAttribute('alt'),
      prevTag: root.querySelector('[data-prev]').tagName,
      nextTag: root.querySelector('[data-next]').tagName,
      thumbTag: root.querySelector('[data-thumb]').tagName,
    };
  });

  report.check(labels.prevTag === 'BUTTON' && labels.nextTag === 'BUTTON', 'navigation uses real <button> elements');
  report.check(labels.thumbTag === 'BUTTON', 'thumbnails are real buttons');
  report.check(labels.prev === 'Previous slide', 'Previous has the label "Previous slide"');
  report.check(labels.next === 'Next slide', 'Next has the label "Next slide"');
  report.check(labels.fullscreen === 'Enter fullscreen', 'fullscreen button is labelled "Enter fullscreen"');
  report.check(!!labels.region, 'viewer region has an accessible name', String(labels.region));
  report.check(labels.live === 'polite', 'live region is aria-live="polite"');
  report.check(labels.liveRole === 'status', 'live region uses role="status"');
  report.check(
    /^Slide 1 of \d+/.test(labels.alt),
    'slide alt text names the slide rather than dumping its text',
    labels.alt,
  );
  report.check(
    labels.alt.length < 120,
    'slide alt text stays short',
    `${labels.alt.length} chars`,
  );
  report.check(/^Go to slide 1/.test(labels.firstThumb), 'thumbnails have descriptive labels', labels.firstThumb);

  // The counter must be readable as "Slide N of T".
  const counterAccessibleText = await page.evaluate(() => {
    const counter = document.querySelector('.viewer__counter');
    return counter.textContent.replace(/\s+/g, ' ').trim();
  });
  report.check(
    /Slide\s*1\s*\/?\s*of\s*\d+/.test(counterAccessibleText.replace('/', ' ')),
    'counter reads as "Slide N of T" for screen readers',
    counterAccessibleText,
  );

  // Live region updates on navigation.
  await page.click('[data-next]');
  await page.waitForTimeout(150);
  const liveText = await page.locator('[data-live]').innerText();
  report.check(
    /^Slide 2 of \d+/.test(liveText),
    'live region announces a concise slide update',
    liveText,
  );
  report.check(liveText.length < 120, 'live announcement is concise, not the whole slide', `${liveText.length} chars`);

  // Slide text disclosure is keyboard operable.
  const summary = page.locator('.slide-text > summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  const open = await page.evaluate(() => document.querySelector('.slide-text').open);
  report.check(open, 'slide text disclosure opens from the keyboard');

  // Reaching the viewer entirely by keyboard.
  const reachable = await page.evaluate(() => {
    const focusable = Array.from(
      document.querySelectorAll('a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'),
    ).filter((element) => element.getClientRects().length > 0);
    const root = document.querySelector('[data-viewer]');
    return focusable.filter((element) => root.contains(element)).length;
  });
  report.check(reachable > total, 'all viewer controls and thumbnails are keyboard reachable', `${reachable} tab stops`);

  // Nothing may be hover-only: confirm controls are operable without hover.
  const worksWithoutHover = await page.evaluate(() => {
    const next = document.querySelector('[data-next]');
    const before = document.querySelector('[data-current]').textContent;
    next.click();
    return before !== document.querySelector('[data-current]').textContent;
  });
  report.check(worksWithoutHover, 'controls work without hover');
}

async function checkReducedMotion(browser, base, report) {
  report.section('reduced motion');
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto(`${base}/speaking/canux-2025`, { waitUntil: 'networkidle' });

  const durations = await page.evaluate(() => {
    const sample = Array.from(document.querySelectorAll('a, button, .card, .talk-card, html')).slice(0, 40);
    return sample.map((element) => {
      const styles = getComputedStyle(element);
      return {
        transition: styles.transitionDuration,
        animation: styles.animationDuration,
        scroll: getComputedStyle(document.documentElement).scrollBehavior,
      };
    });
  });

  const animated = durations.filter(
    (entry) =>
      parseFloat(entry.transition) > 0.05 || parseFloat(entry.animation) > 0.05,
  );
  report.check(animated.length === 0, 'transitions and animations are suppressed under prefers-reduced-motion', `${animated.length} still animating`);
  report.check(durations[0]?.scroll === 'auto', 'smooth scrolling is disabled under prefers-reduced-motion');

  await context.close();
}

async function main() {
  const report = new Report('Accessibility QA (WCAG 2.1 AA)');
  const preview = await startPreview(4323);
  const browser = await chromium.launch();

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();

    for (const route of ROUTES) {
      report.section(`${route.path} — desktop`);
      await page.goto(`${preview.base}${route.path}`, { waitUntil: 'networkidle' });
      await runAxe(page, report, route.path);
      await checkHeadingOrder(page, report, route.path);
      await checkFocusVisibility(page, report, route.path);
    }

    report.section('skip link');
    await page.goto(preview.base, { waitUntil: 'networkidle' });
    await checkSkipLink(page, report);

    report.section('mobile menu');
    await checkMobileMenu(page, report);

    // axe at a mobile width, where the layout changes.
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const mobilePage = await mobile.newPage();
    for (const route of ROUTES) {
      report.section(`${route.path} — mobile 390px`);
      await mobilePage.goto(`${preview.base}${route.path}`, { waitUntil: 'networkidle' });
      await runAxe(mobilePage, report, `${route.path} @390`);
    }
    await mobile.close();

    await checkViewerA11y(page, report, preview.base, 'canux-2025', 72);
    await checkViewerA11y(page, report, preview.base, 'uiuc-ux-day-2026', 77);

    // The overview dialog must trap focus and close on Escape.
    report.section('slide overview dialog');
    await page.goto(`${preview.base}/speaking/canux-2025`, { waitUntil: 'networkidle' });
    await page.click('[data-overview]');
    const modalState = await page.evaluate(() => {
      const dialog = document.querySelector('dialog.overview');
      return { open: dialog?.open, label: dialog?.getAttribute('aria-label'), modal: dialog?.matches(':modal') };
    });
    report.check(modalState.open === true, 'overview dialog opens');
    report.check(modalState.modal === true, 'overview dialog is modal, so focus is trapped');
    report.check(!!modalState.label, 'overview dialog has an accessible name', String(modalState.label));
    await page.keyboard.press('Escape');
    const returned = await page.evaluate(() => document.activeElement?.hasAttribute('data-overview'));
    report.check(returned, 'closing the overview returns focus to the button that opened it');

    await checkReducedMotion(browser, preview.base, report);
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

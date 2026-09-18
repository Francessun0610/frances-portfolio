#!/usr/bin/env node
/**
 * Lighthouse audit of the built site.
 *
 *   npm run build && npm run qa:lighthouse
 *
 * Runs desktop audits against a local preview server. Scores are reported
 * against the targets in the brief; nothing here alters page content to chase
 * a number.
 *
 * Reports are written to qa-output/lighthouse/.
 */

import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright';

import { QA_OUTPUT, Report, ensureDir, startPreview } from './lib.mjs';

const TARGETS = {
  performance: 90,
  accessibility: 95,
  'best-practices': 95,
  seo: 95,
};

const PAGES = [
  { path: '/', name: 'home' },
  { path: '/speaking/canux-2025', name: 'canux-2025' },
  { path: '/speaking/uiuc-ux-day-2026', name: 'uiuc-ux-day-2026' },
];

/** Lighthouse needs a real Chrome with a remote debugging port. */
async function launchChrome() {
  const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const options = {
    args: ['--remote-debugging-port=9222', '--no-first-run', '--no-default-browser-check'],
    headless: true,
  };
  if (existsSync(systemChrome)) options.executablePath = systemChrome;
  return chromium.launch(options);
}

async function main() {
  const report = new Report('Lighthouse');
  const outDir = await ensureDir(join(QA_OUTPUT, 'lighthouse'));
  const preview = await startPreview(4324);

  const { default: lighthouse } = await import('lighthouse');
  const browser = await launchChrome();

  const summary = [];

  try {
    for (const page of PAGES) {
      const result = await lighthouse(
        `${preview.base}${page.path}`,
        {
          port: 9222,
          output: ['json', 'html'],
          logLevel: 'error',
          formFactor: 'desktop',
          screenEmulation: { mobile: false, width: 1440, height: 1000, deviceScaleFactor: 1 },
          throttling: {
            rttMs: 40,
            throughputKbps: 10 * 1024,
            cpuSlowdownMultiplier: 1,
            requestLatencyMs: 0,
            downloadThroughputKbps: 0,
            uploadThroughputKbps: 0,
          },
          screenEmulationMetrics: true,
        },
      );

      const scores = Object.fromEntries(
        Object.entries(result.lhr.categories).map(([key, value]) => [
          key,
          Math.round((value.score ?? 0) * 100),
        ]),
      );

      report.section(`${page.path}`);
      for (const [category, target] of Object.entries(TARGETS)) {
        report.check(
          scores[category] >= target,
          `${category} >= ${target}`,
          `scored ${scores[category]}`,
        );
      }

      summary.push({ page: page.path, scores });

      await writeFile(join(outDir, `${page.name}.html`), result.report[1]);
      await writeFile(join(outDir, `${page.name}.json`), result.report[0]);
    }
  } finally {
    await browser.close();
    await preview.stop();
  }

  console.log('\nScores');
  console.table(
    summary.reduce((table, entry) => {
      table[entry.page] = entry.scores;
      return table;
    }, {}),
  );
  console.log(`\nReports: qa-output/lighthouse/`);

  process.exit(report.finish());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

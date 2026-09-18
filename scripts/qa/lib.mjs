/** Shared helpers for the QA scripts. */

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
export const QA_OUTPUT = resolve(REPO_ROOT, 'qa-output');

export const ROUTES = [
  { path: '/', name: 'home' },
  { path: '/about', name: 'about' },
  { path: '/speaking', name: 'speaking' },
  { path: '/speaking/canux-2025', name: 'canux-2025' },
  { path: '/speaking/uiuc-ux-day-2026', name: 'uiuc-ux-day-2026' },
  { path: '/previous-work', name: 'previous-work' },
];

/** The eight viewports named in the brief. */
export const VIEWPORTS = [
  { name: '1440x1000', width: 1440, height: 1000, band: 'desktop' },
  { name: '1280x900', width: 1280, height: 900, band: 'desktop' },
  { name: '1024x768', width: 1024, height: 768, band: 'laptop' },
  { name: '834x1112', width: 834, height: 1112, band: 'tablet' },
  { name: '768x1024', width: 768, height: 1024, band: 'tablet' },
  { name: '430x932', width: 430, height: 932, band: 'mobile' },
  { name: '390x844', width: 390, height: 844, band: 'mobile' },
  { name: '375x812', width: 375, height: 812, band: 'mobile' },
];

/** Start `astro preview` and wait for it to answer. */
export async function startPreview(port = 4321) {
  const server = spawn('npx', ['astro', 'preview', '--port', String(port)], {
    cwd: REPO_ROOT,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const base = `http://localhost:${port}`;
  const deadline = Date.now() + 40_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        return {
          base,
          stop: () => new Promise((done) => {
            server.once('exit', done);
            server.kill('SIGTERM');
            setTimeout(done, 2500);
          }),
        };
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  server.kill('SIGTERM');
  throw new Error('astro preview did not start. Run `npm run build` first.');
}

export async function ensureDir(path) {
  await mkdir(path, { recursive: true });
  return path;
}

/** Collect console errors, page errors and failed requests for one page. */
export function watchForProblems(page, sink) {
  page.on('console', (message) => {
    if (message.type() === 'error') sink.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => sink.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'failed';
    // Ignore aborts caused by navigating away mid-request.
    if (failure.includes('ERR_ABORTED')) return;
    sink.failedRequests.push(`${request.url()} — ${failure}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) sink.badResponses.push(`${response.status()} ${response.url()}`);
  });
}

export function makeSink() {
  return { consoleErrors: [], pageErrors: [], failedRequests: [], badResponses: [] };
}

export class Report {
  constructor(title) {
    this.title = title;
    this.passes = 0;
    this.failures = [];
    console.log(`\n${title}\n${'='.repeat(title.length)}`);
  }

  check(condition, label, detail = '') {
    if (condition) {
      this.passes += 1;
      console.log(`  PASS  ${label}`);
    } else {
      this.failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
      console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    }
    return condition;
  }

  section(name) {
    console.log(`\n[${name}]`);
  }

  finish() {
    const total = this.passes + this.failures.length;
    console.log(`\n${this.passes}/${total} checks passed`);
    if (this.failures.length) {
      console.log('\nFAILED:');
      this.failures.forEach((failure) => console.log(`  - ${failure}`));
      return 1;
    }
    console.log('All checks passed.');
    return 0;
  }
}

/** True when the document scrolls sideways. */
export const hasHorizontalOverflow = () =>
  document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;

/** Elements that stick out past the viewport, for diagnosing overflow. */
export const findOverflowingElements = () => {
  const limit = document.documentElement.clientWidth + 1;
  const offenders = [];
  document.querySelectorAll('body *').forEach((element) => {
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    if (box.right > limit || box.left < -1) {
      offenders.push(
        `${element.tagName.toLowerCase()}.${String(element.className || '').split(' ')[0]} ` +
          `(right ${Math.round(box.right)} / limit ${limit})`,
      );
    }
  });
  return offenders.slice(0, 8);
};

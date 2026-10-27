// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import { SITE_URL } from './src/config/site.mjs';

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  trailingSlash: 'ignore',
  // The old first route was a cover. It now opens source slide 4, which
  // already lives at /work/linear/2. Later routes stay on the same source
  // slide. Routes retired from the ending open shared understanding.
  redirects: {
    '/work/linear/1': '/work/linear/2',
    '/work/linear/44': '/work/linear/48',
    '/work/linear/45': '/work/linear/48',
    '/work/linear/46': '/work/linear/48',
    '/work/linear/47': '/work/linear/48',
    '/work/linear/49': '/work/linear/48',
  },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/404'),
      // No lastmod. The only date available at build time is "now", which
      // would tell crawlers every page changed on every deploy even when
      // nothing did. Omitting it is more honest than asserting a date the
      // content does not have.
      changefreq: 'monthly',
    }),
  ],
  build: {
    inlineStylesheets: 'auto',
  },
});

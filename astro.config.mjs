// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import { SITE_URL } from './src/config/site.mjs';

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  trailingSlash: 'ignore',
  // The old first route was a cover. It now opens source slide 4, which
  // already lives at /work/linear/2. Later routes are left alone so they
  // still open the same source slide.
  redirects: {
    '/work/linear/1': '/work/linear/2',
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

// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import { SITE_URL } from './src/config/site.mjs';

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  trailingSlash: 'ignore',
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
  vite: {
    build: {
      assetsInlineLimit: 2048,
    },
  },
});

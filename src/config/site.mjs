/**
 * Canonical origin for the site.
 *
 * Astro uses it for canonical URLs, Open Graph tags and sitemap.xml, so it
 * must be an absolute origin with no trailing slash.
 *
 * This is deliberately the production domain on every build, including
 * previews. A preview deployment still builds and serves normally; its pages
 * just declare the production URL as canonical, which is what keeps preview
 * URLs from competing with the real site in search results.
 */
export const SITE_URL = 'https://francessun.design';

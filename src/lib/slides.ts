import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export type Slide = {
  index: number;
  image: string;
  thumbnail: string;
  width: number;
  height: number;
  title: string;
  /** Visible on-slide text only. Speaker notes are never included. */
  visibleText: string;
};

const MANIFEST_ROOT = join(process.cwd(), 'public', 'slides');

/**
 * Read a deck manifest at build time.
 *
 * Returns an empty array when the deck has not been exported yet, so the site
 * still builds on a machine without LibreOffice. The viewer renders an
 * explicit "slides not exported" state in that case rather than inventing
 * placeholder slides.
 */
export function loadDeck(slug: string): Slide[] {
  const manifestPath = join(MANIFEST_ROOT, slug, 'slides.json');
  if (!existsSync(manifestPath)) {
    console.warn(
      `[slides] No manifest at public/slides/${slug}/slides.json — run "npm run slides" to export this deck.`,
    );
    return [];
  }

  const slides = JSON.parse(readFileSync(manifestPath, 'utf8')) as Slide[];

  if (import.meta.env.DEV || import.meta.env.PROD) {
    for (const slide of slides) {
      if ('notes' in slide || 'speakerNotes' in slide) {
        throw new Error(
          `[slides] Manifest for ${slug} contains a notes field. Speaker notes must never be published.`,
        );
      }
    }
  }

  return slides;
}

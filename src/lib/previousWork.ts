import raw from '../data/previousWork.json';

export type ArchiveImage = {
  file: string;
  thumbnail: string;
  /** The caption written on the source page, used verbatim. */
  caption: string;
  alt: string;
  sourceUrl: string;
  width: number;
  height: number;
  thumbWidth: number;
  thumbHeight: number;
  originalWidth: number;
  originalHeight: number;
  bytes: number;
  hash: string;
};

export type ArchiveProject = {
  slug: string;
  title: string;
  client: string;
  role: string;
  year: string;
  type: string;
  description: string;
  order: number;
  sourceUrl: string;
  images: ArchiveImage[];
};

const projects = (raw as ArchiveProject[]).slice().sort((a, b) => a.order - b.order);

/**
 * One project has no title anywhere in the source: empty <title>, no og:title,
 * no heading, and an index card that reads only "VIEW PROJECT". It is kept in
 * the data rather than deleted, but it is not published, because a card with
 * no name is broken and inventing one would misrepresent the work.
 */
export const unpublished = projects.filter((project) => !project.title.trim());

export const published = projects.filter((project) => project.title.trim());

/**
 * A project earns its own page when there is something to look at beyond the
 * card thumbnail. Single-image entries stay as non-clickable cards rather than
 * becoming a thin page that repeats what the grid already showed.
 */
export function hasDetailPage(project: ArchiveProject): boolean {
  return project.images.length > 1 || project.description.trim().length > 0;
}

export const withDetailPages = published.filter(hasDetailPage);

/** First image doubles as the card thumbnail. */
export function coverImage(project: ArchiveProject): ArchiveImage | undefined {
  return project.images[0];
}

/**
 * Alt text describes what the image actually shows. Carbonmade's own caption
 * is the most accurate source; otherwise fall back to naming the project and
 * the image's position, which is factual without inventing detail.
 */
export function imageAlt(project: ArchiveProject, image: ArchiveImage, index: number): string {
  if (image.alt.trim()) return image.alt.trim();
  if (image.caption.trim()) return `${project.title}: ${image.caption.trim()}`;
  return `${project.title}, image ${index + 1} of ${project.images.length}`;
}

/** "Lenovo Group · 2016 April" — only the parts the source actually provided. */
export function metaLine(project: ArchiveProject): string {
  return [project.client, project.year].filter((part) => part.trim()).join(' · ');
}

/** First paragraph only, for the card. The full text lives on the detail page. */
export function summary(project: ArchiveProject): string {
  const first = project.description.split('\n\n')[0]?.trim() ?? '';
  return first;
}

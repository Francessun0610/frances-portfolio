/**
 * Linear Ad Platform presentation.
 * 49 screens: original Figma slides 4–52, in that order. Slides 1–3 stay out.
 * Slide 15 and slide 23 stay in their narrative positions.
 *
 * The route number is not the counter. It stays `sourceSlide - 2`, which is
 * how these URLs were already assigned, so /work/linear/13 is still source
 * slide 15 and /work/linear/50 is still source slide 52. The removed cover
 * was /work/linear/1; that address redirects to /work/linear/2 (source slide 4).
 * The on-screen counter is the position in this 49-screen sequence.
 */

export const LINEAR_TOTAL = 49;

export type LinearKind = 'image' | 'math' | 'networks' | 'narrative' | 'closing' | 'thanks';

export type LinearScreen = {
  n: number;
  kind: LinearKind;
  title: string;
  transcript: string;
  /** Original Figma slide number, when this screen comes from the deck. */
  sourceSlide?: number;
  image?: string;
  /** 2× asset, loaded only when Inspect opens. */
  inspectImage?: string;
  inspect: boolean;
  adaptation: string;
};

const SOURCE_TITLES: Record<number, string> = {
  4: 'In 2023, US TV ad revenue reached $61.3 billion',
  5: 'In 2023, companies committed $9 billion during Upfront week to Disney',
  6: 'Why do advertisers give us all that money?',
  7: 'Disney Advertising as a shopping mall',
  8: 'What the Linear team is working on',
  9: 'Linear channels as a candy store',
  10: 'Imagine TV ads as candy',
  11: 'A store needs products on the shelves',
  12: 'Advertisers provide the candy',
  13: 'A store runs on a team and its tools',
  14: 'How the candy gets onto the shelves',
  15: 'What the candy-shelf process looks like',
  16: 'Many products, built at different times',
  23: 'Proposals overview',
  47: 'An illustrative look at advertising time',
  48: 'Promos, graphics, and audio',
  49: 'Networks referenced in this narrative',
  50: 'A shared view of our team’s work',
  51: 'Making complexity understandable',
  52: 'Thank you',
};

function sourceTitle(source: number): string {
  return SOURCE_TITLES[source] ?? `Linear Ad Platform, part ${source - 3}`;
}

function sourceTranscript(source: number, title: string): string {
  if (SOURCE_TITLES[source]) {
    return `${title}. Illustration from the Linear Ad Platform narrative.`;
  }
  return `Continuation of the Linear Ad Platform story. The on-screen title and diagram explain this step. Product screens represent team work, not a claim that Frances designed every tool.`;
}

export function linearImage(sourceSlide: number): string {
  return `/slides/linear/slide-${String(sourceSlide).padStart(2, '0')}.webp`;
}

export function linearInspectImage(sourceSlide: number): string {
  return `/slides/linear/hi/slide-${String(sourceSlide).padStart(2, '0')}.webp`;
}

export function linearScreens(): LinearScreen[] {
  const screens: LinearScreen[] = [];

  for (let source = 4; source <= 52; source++) {
    const n = source - 2;
    const title = sourceTitle(source);
    let kind: LinearKind = 'image';
    let adaptation = 'Presented from the source deck, in original order.';

    if (source === 4 || source === 5) {
      adaptation =
        'Kept the 2023 framing already on the slide. The dollar figures are not independently verified for publication.';
    }
    if (source === 47) {
      kind = 'math';
      adaptation =
        'Replaced 28 ads and 3 hours. 15 minutes of 30-second spots is 30 ads an hour. Five hours at that rate is 75 minutes of advertising. Framed as an illustration, not typical viewing.';
    }
    if (source === 49) {
      kind = 'networks';
      adaptation =
        'Removed the duplicated Entertainment list. Did not treat “40+ networks” as a current operations claim. The names are the ones written in the source, presented as a narrative snapshot.';
    }
    if (source === 50) {
      kind = 'narrative';
      adaptation =
        'Replaced the five-item Impact list and its unverified outcome claims with one statement and three supporting points.';
    }
    if (source === 51) {
      kind = 'closing';
      adaptation =
        'Replaced “Why this matter” and the outcome claims with the approved closing about communication value.';
    }
    if (source === 52) {
      kind = 'thanks';
      adaptation = 'Removed the email address from the closing slide.';
    }
    if (source === 15) {
      adaptation = 'Original slide 15, kept in its narrative position.';
    }
    if (source === 9) {
      adaptation = 'Original slide 9, kept in its narrative position. Not used as the cover.';
    }
    if (source === 23) {
      adaptation = 'Original slide 23, Proposals overview. Not skipped.';
    }

    screens.push({
      n,
      kind,
      title,
      transcript:
        kind === 'image'
          ? sourceTranscript(source, title)
          : title,
      sourceSlide: source,
      image: kind === 'image' ? linearImage(source) : undefined,
      inspectImage: kind === 'image' ? linearInspectImage(source) : undefined,
      inspect: kind === 'image',
      adaptation,
    });
  }

  return screens;
}

export function getLinearScreen(n: number): LinearScreen | undefined {
  return linearScreens().find((screen) => screen.n === n);
}

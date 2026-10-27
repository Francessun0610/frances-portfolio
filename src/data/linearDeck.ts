/**
 * Linear Ad Platform presentation.
 * 44 screens. Original Figma slides 4–45 stay in order, then the shared
 * understanding screen (source 50) and Thank you (source 52). Slides 1–3
 * stay out. Slides 46–49 and 51 are no longer in the story.
 *
 * The route number is not the counter. It stays `sourceSlide - 2`, which is
 * how these URLs were already assigned, so /work/linear/13 is still source
 * slide 15, /work/linear/43 is the candy workflow, /work/linear/48 is shared
 * understanding, and /work/linear/50 is Thank you. The removed cover was
 * /work/linear/1 and redirects to /work/linear/2. Retired routes 44–47 and
 * 49 redirect to /work/linear/48. The on-screen counter is the position in
 * this 44-screen sequence.
 */

export const LINEAR_TOTAL = 44;

/** Source slides taken out of the active sequence. Their routes redirect. */
const RETIRED_SOURCES = new Set([46, 47, 48, 49, 51]);

export type LinearKind = 'image' | 'upfront' | 'narrative' | 'thanks';

export type LinearScreen = {
  n: number;
  kind: LinearKind;
  title: string;
  transcript: string;
  /** Original Figma slide number, when this screen comes from the deck. */
  sourceSlide?: number;
  image?: string;
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
  17: 'SalesHub Overview',
  18: 'SalesHub Overview',
  19: 'SalesHub',
  20: 'Rate Card Overview',
  21: 'Rate Card Overview',
  22: 'Pricing Index',
  23: 'Proposals overview',
  24: 'Proposals Overview',
  25: 'Regular Proposal',
  26: 'Deal Management Overview',
  27: 'Deal Management Overview',
  28: 'Deal Management',
  29: 'Media Management Overview',
  30: 'Media Management Overview',
  31: 'Commercial Records',
  32: 'Copy Management Overview',
  33: 'Copy Management Overview',
  34: 'Edit Copy Instruction',
  35: 'Content Restrictor Overview',
  36: 'Content Restrictor Overview',
  37: 'Content Restrictor',
  38: 'Log Management Overview',
  39: 'Log Management Overview',
  40: 'Log Management',
  41: 'Log Scheduling Overview',
  42: 'Log Scheduling Overview',
  43: 'Log Scheduling',
  44: 'Now the ads are ready for consumption!',
  45: 'Here’s how the candy actually gets on the shelves.',
  50: 'A shared view of our team’s work',
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

/** 3840×2160 export. The 1920 file is the same frame at half size and softens on retina and in full screen. */
export function linearImage(sourceSlide: number): string {
  return `/slides/linear/hi/slide-${String(sourceSlide).padStart(2, '0')}.webp`;
}

export function linearScreens(): LinearScreen[] {
  const screens: LinearScreen[] = [];

  for (let source = 4; source <= 52; source++) {
    if (RETIRED_SOURCES.has(source)) continue;
    const n = source - 2;
    const title = sourceTitle(source);
    let kind: LinearKind = 'image';
    let adaptation = 'Presented from the source deck, in original order.';

    if (source === 4) {
      adaptation =
        'Figma frame, exported at the slide’s rendered resolution. The dollar figure is not independently verified for publication.';
    }
    if (source === 5) {
      kind = 'upfront';
      adaptation =
        'Same Figma city as the previous slide. The original bills fall continuously over Disney. The dollar figure is not independently verified for publication.';
    }
    if (source === 50) {
      kind = 'narrative';
      adaptation =
        'Shared-understanding close: one statement and three points, in the interview presentation’s layout.';
    }
    if (source === 52) {
      kind = 'thanks';
      adaptation = 'Closing slide with website, email, and LinkedIn.';
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
        source === 4
          ? 'In 2023, TV ad revenue in the United States reached $61.3 billion'
          : source === 5
            ? 'In 2023, companies committed $9 billion during Upfront week to Disney.'
            : kind === 'image'
              ? sourceTranscript(source, title)
              : title,
      sourceSlide: source,
      image: kind === 'image' ? linearImage(source) : undefined,
      adaptation,
    });
  }

  return screens;
}

export function getLinearScreen(n: number): LinearScreen | undefined {
  return linearScreens().find((screen) => screen.n === n);
}

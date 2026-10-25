/**
 * Single source of truth for site copy, navigation and project/talk records.
 *
 * Product and talk names here are confirmed by Frances. Do not rename them for
 * marketing flair, and do not add metrics or outcomes that were not supplied.
 */

import { SITE_URL } from '../config/site.mjs';

/**
 * Stable schema.org identifier for Frances.
 *
 * Every structured-data node that refers to her points at this @id instead of
 * repeating an anonymous Person object, so the whole site describes one
 * identity rather than one per page.
 */
export const PERSON_ID = `${SITE_URL}/#frances-sun`;

export const person = {
  name: 'Frances Sun',
  initials: 'FS',
  role: 'Lead UX Designer',
  /** Homepage role line only. jobTitle and the About page stay on `role`. */
  heroRole: 'Lead UX Designer · Educator · Speaker',
  statement: 'Designing experiences for consumer electronics and enterprise software.',
  /** Schema description. Matches the homepage summary; not the hero line. */
  description:
    'Frances Sun is a Lead UX Designer, educator, and speaker designing consumer and enterprise experiences, with expertise in complex workflows and interactive prototyping.',
  supporting:
    'I make complex workflows easier to use through systems thinking, interaction design, and prototyping.',
  location: 'Based in Austin, Texas.',
  relocation: 'Open to relocation for the right opportunity.',
  locality: 'Austin',
  region: 'Texas',
  country: 'United States',
} as const;

export const links = {
  linkedin: 'https://www.linkedin.com/in/sun0610/',
  instagram: 'https://www.instagram.com/uxauntie/',
  resume: '/frances-sun-resume-2026.pdf',
  rateCardDemo: 'https://rate-card-demo.vercel.app/portfolio.html?section=atlas&slide=1',
  rateCardLive: 'https://rate-card-demo.vercel.app/portfolio.html?slide=14',
} as const;

export const nav = [
  { label: 'Work', href: '/#work' },
  { label: 'Speaking', href: '/speaking' },
  { label: 'About', href: '/about' },
  { label: 'Resume', href: links.resume },
  { label: 'Previous Work', href: '/previous-work' },
] as const;

export const social = [
  { label: 'LinkedIn', href: links.linkedin },
  { label: 'Instagram', href: links.instagram },
] as const;

export type Project = {
  slug: string;
  title: string;
  description: string;
  category: string;
  /** Card image, 1920px wide. */
  image: string;
  /** The same image at 960px, for the card at its usual size. */
  imageSmall?: string;
  /** Written for screen readers; never describes a screen that does not exist. */
  imageAlt: string;
  /**
   * The expanded screenshot. The same capture as `image`, kept at full
   * resolution and only fetched when a visitor shows intent to open it.
   * `base` gains `-1600.webp`, `-2400.webp` and `-3200.webp`; see
   * scripts/capture-project-previews.mjs.
   */
  preview?: { base: string; width: number; height: number; label: string };
  /** True when `image` is an abstract stand-in rather than a product capture. */
  imageIsPlaceholder: boolean;
  /**
   * Quiet Coming Soon media surface instead of an image. Used only when a
   * case study is intentionally not public yet — not for abstract stand-ins
   * that still carry visual identity (e.g. Linear).
   */
  comingSoonMedia?: boolean;
  /**
   * What Frances personally did, and what the public representation actually
   * is. Each project words this for its own situation: the products are real
   * client work, but what can be shown publicly differs from one to the next.
   * Keep it factual and specific. If an asset is ever swapped, update the note
   * with it. The three prototypes share one authorship and data note, stated
   * once in the section introduction as `prototypeNote`, so this field is for a project whose
   * contribution is different, such as Linear.
   */
  portfolioNote?: string;
  /** Primary destination. The screenshot and the title open it too. */
  cta?: { label: string; href: string; external: boolean };
  /** Second labeled action, with the same external-link treatment as `cta`. */
  secondaryCta?: { label: string; href: string; external: boolean };
};

/**
 * Shared by the three prototypes only, and shown once in the Selected Work
 * introduction, above that row. It does not describe Linear Ad Platform.
 */
export const prototypeNote =
  'I designed these three projects end to end and built their interactive prototypes with AI assistance. All use sample data.';

export const projects: Project[] = [
  {
    slug: 'rate-card-manager',
    title: 'Rate Card Manager',
    description:
      'Manage rate cards, pricing adjustments, and publishing in one workflow.',
    category: 'Ad tech · Pricing',
    image: '/images/projects/rate-card-manager.webp',
    imageSmall: '/images/projects/rate-card-manager-960.webp',
    imageAlt:
      'Rate Card Manager in Ad Tool, showing the line items of the WPP Streaming Video Upfront 2026-2027 rate card, with the Line Details panel open for Ford Motor Company.',
    preview: {
      base: '/images/projects/preview/rate-card-manager',
      width: 3200,
      height: 1800,
      label: 'Rate card line items and line details',
    },
    imageIsPlaceholder: false,
    cta: { label: 'Slides', href: links.rateCardDemo, external: true },
    secondaryCta: { label: 'Prototype', href: links.rateCardLive, external: true },
  },
  {
    slug: 'atlas',
    title: 'Identity & Access Management',
    description:
      'Manage users, roles, and permissions across enterprise applications.',
    category: 'Identity & access',
    image: '/images/projects/atlas.webp',
    imageSmall: '/images/projects/atlas-960.webp',
    imageAlt:
      'Access Management, showing the users list with roles, status, team, and last login.',
    preview: {
      base: '/images/projects/preview/atlas',
      width: 3200,
      height: 1800,
      label: 'Users, roles, and access status',
    },
    imageIsPlaceholder: false,
    cta: {
      label: 'Prototype',
      href: 'https://frances-iam-demo.vercel.app/v4.2/index.html',
      external: true,
    },
  },
  {
    slug: 'simba',
    title: 'Financial Systems 2.0',
    description:
      'Connect revenue recognition, billing, invoicing, and review in one workspace.',
    category: 'Enterprise finance',
    image: '/images/projects/simba.webp',
    imageSmall: '/images/projects/simba-960.webp',
    imageAlt:
      'An order in Financial Systems 2.0, showing its invoice summary, cumulative invoicing information, and sales line items.',
    preview: {
      base: '/images/projects/preview/simba',
      width: 3200,
      height: 1800,
      label: 'Order invoice summary and sales line items',
    },
    imageIsPlaceholder: false,
    cta: {
      label: 'Slides',
      href: 'https://harps-finance-prototype.vercel.app/v2a/harps-intro-1.html',
      external: true,
    },
    secondaryCta: {
      label: 'Prototype',
      href: 'https://harps-finance-prototype.vercel.app/v2a/harps.html',
      external: true,
    },
  },
  {
    slug: 'linear',
    title: 'Linear Ad Platform',
    description:
      'A connected view of the teams and tools behind linear advertising.',
    category: 'Design leadership · Ad tech',
    image: '/images/projects/linear.webp',
    imageSmall: '/images/projects/linear-960.webp',
    preview: {
      base: '/images/projects/preview/linear',
      width: 3200,
      height: 1800,
      label: 'The tools behind linear advertising',
    },
    imageAlt:
      'Two-row map of the Linear Ad Platform: SalesHub, Rate Card, Proposal, Deal Management, and Media Management, continuing through Copy Management, Content Restrictor, Log Management, Log Scheduling, and Cannonball.',
    imageIsPlaceholder: false,
    portfolioNote:
      'Led the design team; directly designed Media Management.',
    cta: { label: 'Slides', href: '/work/linear/2', external: false },
  },
];

export type Talk = {
  slug: string;
  /** Deck folder under public/slides/. */
  deck: string;
  title: string;
  event: string;
  /** Extra organisation lines shown under the event name. */
  organization?: string[];
  /** Lecture series, when the event sits inside one. Shown on the detail page. */
  series?: string;
  /** Host school or hall, when it is distinct from the city. Shown on the detail page. */
  venue?: string;
  location: string;
  year: string;
  /**
   * ISO date, only when the talk's own date is actually known. Talks without
   * one order within a year by sortOrder rather than a guessed date.
   */
  date?: string;
  /** How the date is written on the detail page, when a date is known. */
  dateLabel?: string;
  /** Tie-break within a year. Lower comes first. */
  sortOrder: number;
  cardDescription: string;
  intro: string;
  /** Second paragraph on the detail page, when the intro needs one. */
  supporting?: string;
  image: string;
  imageAlt: string;
  /** Intrinsic pixel size. Defaults match the landscape speaking photos. */
  imageWidth?: number;
  imageHeight?: number;
  /**
   * Portrait posters cannot fill the 16:9 card without losing the event.
   * `contain` keeps the whole image inside the existing media frame.
   */
  imageFit?: 'cover' | 'contain';
  seoTitle: string;
  seoDescription: string;
};

export const talks: Talk[] = [
  {
    slug: 'canux-2025',
    deck: 'canux-2025',
    title: 'Infusing Enterprise Creativity with a Dose of Playfulness',
    event: 'CanUX 2025',
    location: 'Ottawa, Canada',
    year: '2025',
    sortOrder: 1,
    cardDescription:
      'Using metaphors, business context, and playfulness to make enterprise UX easier to understand.',
    intro:
      'Using metaphors, business context, and playfulness to make enterprise UX easier to understand.',
    image: '/images/speaking/canux-2025.jpg',
    imageAlt:
      'CanUX 2025 speaker card for Frances Sun, Lead Designer, Austin, Texas, for Canada’s premier experience design event in Ottawa.',
    seoTitle: 'Frances Sun at CanUX 2025 | Enterprise UX & Playfulness',
    seoDescription:
      'Frances Sun presents “Infusing Enterprise Creativity with a Dose of Playfulness” at CanUX 2025 in Ottawa, exploring creativity, metaphor, and playfulness in enterprise UX.',
  },
  {
    slug: 'uiuc-ux-day-2026',
    deck: 'uiuc-ux-day-2026',
    title: 'What Enterprise UX Taught Me About Clarity',
    event: 'UX Day 2026',
    organization: ['Siebel Center for Design', 'University of Illinois Urbana-Champaign'],
    location: 'Urbana-Champaign, Illinois',
    year: '2026',
    sortOrder: 2,
    cardDescription:
      'Practical lessons in understanding business needs and simplifying complex enterprise products.',
    intro:
      'Practical lessons in understanding business needs and simplifying complex enterprise products.',
    image: '/images/speaking/uiuc-ux-day-2026.jpg',
    imageAlt:
      'Frances Sun speaking to students in a design studio classroom at the Siebel Center for Design.',
    seoTitle: 'Frances Sun at UX Day 2026 | Enterprise UX & Clarity',
    seoDescription:
      'Frances Sun presents “What Enterprise UX Taught Me About Clarity” at UX Day 2026, sharing practical lessons from designing complex enterprise products and workflows.',
  },
  {
    slug: 'ddd-europe-2026',
    deck: 'ddd-europe-2026',
    title: 'When the Domain Is Fuzzy, the UI Pays the Price',
    event: 'DDD Europe 2026',
    location: 'Antwerp, Belgium',
    year: '2026',
    sortOrder: 1,
    cardDescription:
      'How domain understanding and shared language bring clarity to enterprise workflows.',
    intro:
      'How domain understanding and shared language bring clarity to enterprise workflows.',
    image: '/images/speaking/ddd-europe-2026.jpg',
    imageAlt:
      'DDD Europe 2026 speaker card for Frances Sun, showing the Domain Driven Design Europe logo, her portrait, and the talk title.',
    seoTitle: 'Frances Sun at DDD Europe 2026 | Enterprise UX',
    seoDescription:
      'Frances Sun presents “When the Domain Is Fuzzy, the UI Pays the Price” at DDD Europe 2026 in Antwerp, exploring domain understanding, workflow clarity, and enterprise UX.',
  },
  {
    slug: 'ccs-morning-boost-2024',
    deck: 'ccs-morning-boost-2024',
    title: 'From Industrial Designer to Storyteller',
    event: 'CCS Morning Boost 2024',
    series: 'Toyota Lecture Series',
    venue: 'College for Creative Studies',
    location: 'Detroit, Michigan',
    year: '2024',
    date: '2024-03-29',
    dateLabel: 'March 29, 2024',
    sortOrder: 1,
    cardDescription:
      'Lessons from my design career on understanding problems, collaborating with teams, and telling clearer portfolio stories.',
    intro:
      'Lessons from my design career on understanding problems, collaborating with teams, and telling clearer portfolio stories.',
    image: '/images/speaking/ccs-morning-boost-2024-cover.png',
    imageAlt:
      'CCS Morning Boost event poster for March 29, 2024, listing Frances Sun among the speakers.',
    imageWidth: 1284,
    imageHeight: 2268,
    imageFit: 'contain',
    seoTitle: 'Frances Sun at CCS Morning Boost 2024 | From Industrial Designer to Storyteller',
    seoDescription:
      'Frances Sun returned to the College for Creative Studies as an alumna for CCS Morning Boost 2024, part of the Toyota Lecture Series, sharing advice on problems, teamwork, and portfolio storytelling.',
  },
];

/**
 * Newest first. Year descending, then the talk's own date when one is
 * actually recorded, then the explicit sortOrder. Every list of talks reads
 * from this, so ordering is never a property of the markup.
 */
export const talksNewestFirst: Talk[] = [...talks].sort((a, b) => {
  if (a.year !== b.year) return Number(b.year) - Number(a.year);
  if (a.date && b.date) return b.date.localeCompare(a.date);
  return a.sortOrder - b.sortOrder;
});

export function getTalk(slug: string): Talk {
  const talk = talks.find((entry) => entry.slug === slug);
  if (!talk) throw new Error(`Unknown talk: ${slug}`);
  return talk;
}

export const about = {
  homepage:
    'I’m a Lead UX Designer with nearly two decades of experience across consumer electronics and enterprise software. I combine hands-on design, team leadership, and teaching to make complex workflows easier to use.',
} as const;

export const previousWorkIntro = {
  copy: 'Earlier UX and product design across consumer electronics, mobile apps, and enterprise software.',
  cta: 'View previous work',
  href: '/previous-work',
} as const;

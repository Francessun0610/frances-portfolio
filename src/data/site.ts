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
  heroRole: 'Lead UX Designer · UX Speaker',
  statement: 'Product design across consumer electronics and complex enterprise systems.',
  /** Schema description. Design first, then speaking. Not the hero line. */
  description:
    'Lead UX Designer with experience across consumer electronics and enterprise software, and a UX speaker on complex workflows and systems thinking.',
  supporting:
    'I turn complex products and workflows into clear, scalable experiences through systems thinking, interaction design, and hands-on prototyping.',
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
  image: string;
  /** Written for screen readers; never describes a screen that does not exist. */
  imageAlt: string;
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
   * with it.
   */
  portfolioNote?: string;
  cta?: { label: string; href: string; external: boolean };
};

export const projects: Project[] = [
  {
    slug: 'rate-card-manager',
    title: 'Rate Card Manager',
    description:
      'Enterprise pricing management that brings rate card setup, line items, premium adjustments, and publishing into one clearer workflow. I built the interactive prototype in code using Cursor as part of my design process.',
    // Non-breaking hyphen (U+2011) in "AI-assisted". At 375px the line has to
    // wrap somewhere, and a normal hyphen lets it split mid-term as
    // "AI-" / "assisted"; this moves the break to the separator instead.
    category: 'Enterprise UX · Pricing · AI\u2011assisted Prototyping',
    image: '/images/projects/rate-card-manager.webp',
    imageAlt:
      'Rate Card Manager in Ad Tool, showing the rate cards list with search, filters, and draft and published states.',
    imageIsPlaceholder: false,
    portfolioNote:
      'I designed and built this interactive portfolio prototype. All data shown is synthetic and created for demonstration purposes.',
    cta: { label: 'Live demo', href: links.rateCardDemo, external: true },
  },
  {
    slug: 'atlas',
    title: 'Atlas — Identity & Access Management',
    description:
      'A consistent administration experience for managing users, roles, companies, and application access across a complex enterprise product ecosystem.',
    category: 'Enterprise UX · Identity & Access · Design Systems',
    image: '/images/projects/atlas.webp',
    imageAlt: 'Abstract graphic of concentric rings and access points representing identity and access management.',
    imageIsPlaceholder: true,
    comingSoonMedia: true,
    portfolioNote:
      'I designed the administration experience and interaction patterns represented here. The visual shown is an abstract portfolio placeholder, not a production screenshot.',
  },
  {
    slug: 'simba',
    title: 'SIMBA — Financial Systems 2.0',
    description:
      'A next-generation financial platform designed to unify revenue recognition, billing, invoicing, and review workflows into one connected experience.',
    category: 'Enterprise UX · Financial Systems · Complex Workflows',
    image: '/images/projects/simba.webp',
    imageAlt: 'Abstract graphic of stacked ledger rules representing connected financial workflows.',
    imageIsPlaceholder: true,
    comingSoonMedia: true,
    portfolioNote:
      'I designed the workflow, navigation, and interaction concepts represented in this portfolio entry. No production financial data is shown, and the visual above is an abstract portfolio placeholder rather than a product screenshot.',
  },
  {
    slug: 'linear',
    title: 'Linear Ad Platform',
    description:
      'A connected view of the team I led and the tools behind linear advertising, from planning and inventory to trafficking and airtime.',
    category: 'TEAM LEADERSHIP · ENTERPRISE UX · ADVERTISING TECHNOLOGY',
    image: '/images/projects/linear.webp',
    imageAlt:
      'Two-row map of the Linear Ad Platform: SalesHub, Rate Card, Proposal, Deal Management, and Media Management, continuing through Copy Management, Content Restrictor, Log Management, Log Scheduling, and Cannonball.',
    imageIsPlaceholder: false,
    portfolioNote:
      'I created this visual narrative to explain our team’s work. My direct product design ownership focused on Media Management.',
    cta: { label: 'Explore the platform', href: '/work/linear/2', external: false },
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
      'Lessons from moving between consumer and enterprise UX, using business context, metaphors, and playfulness to make complex systems easier to understand.',
    intro:
      'A talk about lessons learned moving from consumer products into enterprise UX, and how understanding the business, breaking down complexity, listening for real needs, adding context, and using familiar metaphors can make complex systems easier to understand.',
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
      'A practical look at clarity in enterprise UX: understanding the business, breaking down complexity, listening for real needs, and giving design the right context.',
    intro:
      'A practical look at what clarity requires in enterprise UX: understanding the business, breaking down complexity, listening beyond surface requests, giving design the right context, and using simple stories to connect complex systems.',
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
      'How unclear domain understanding shows up in the interface, and how workflow clarity and better collaboration can lead to better enterprise UX.',
    intro:
      'When teams do not understand the domain clearly, that uncertainty eventually shows up in the interface. This talk looks at how domain understanding, workflow clarity, and better collaboration can lead to better enterprise UX.',
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
      'Returning to CCS as an alumna, I shared lessons from my own design journey to help students approach their first roles, communicate their work, and tell stronger portfolio stories.',
    intro:
      'I returned to the College for Creative Studies as an MFA alumna to share what I wish I had known as a design student. Drawing on the successes and setbacks of my career, I offered advice on understanding problems, working with product teams, and presenting design work with clarity.',
    supporting:
      'The talk connects everyday design practice with the transition into professional life: using tools to make ideas work, explaining complex processes visually, building a compelling portfolio narrative, and helping people understand who you are and what you contributed.',
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
    'I’m a Lead UX Designer focused on complex enterprise software and operational systems. Over nearly two decades, I’ve worked across consumer technology, infrastructure, advertising platforms, and enterprise software, turning complex workflows into clear, usable experiences.',
} as const;

export const previousWorkIntro = {
  copy: 'Earlier work across consumer products, mobile experiences, interaction design, and enterprise software.',
  cta: 'View previous work',
  href: '/previous-work',
} as const;

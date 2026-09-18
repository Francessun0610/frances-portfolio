/**
 * Single source of truth for site copy, navigation and project/talk records.
 *
 * Product and talk names here are confirmed by Frances. Do not rename them for
 * marketing flair, and do not add metrics or outcomes that were not supplied.
 */

export const person = {
  name: 'Frances Sun',
  initials: 'FS',
  role: 'Lead UX Designer',
  statement: '18+ years designing complex enterprise products and operational systems.',
  supporting:
    'I turn ambiguous requirements and fragmented workflows into clear, scalable product experiences through systems thinking, interaction design, and hands-on prototyping.',
  location: 'Based in Austin, Texas.',
  relocation: 'Open to relocation for the right opportunity.',
  locality: 'Austin',
  region: 'Texas',
  country: 'United States',
} as const;

export const links = {
  linkedin: 'https://www.linkedin.com/in/sun0610/',
  instagram: 'https://www.instagram.com/uxauntie/',
  resume: '/Frances-Sun-Resume.pdf',
  rateCardDemo: 'https://rate-card-demo.vercel.app/?section=atlas&slide=1',
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
      'Rate Card Manager prototype showing the All Rate Cards list with search, filters, and draft and published states.',
    imageIsPlaceholder: false,
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
  },
  {
    slug: 'linear',
    title: 'Linear Advertising Workflows',
    description:
      'Enterprise UX for linear advertising operations, simplifying dense workflows, operational tools, and cross-team handoffs used to get advertising on air.',
    category: 'Enterprise UX · Advertising Technology · Workflow Design',
    image: '/images/projects/linear.webp',
    imageAlt: 'Abstract graphic of parallel tracks converging, representing advertising operations handoffs.',
    imageIsPlaceholder: true,
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
  location: string;
  year: string;
  /**
   * ISO date, only when the talk's own date is actually known. None of the
   * three talks has one recorded, so ordering within a year falls to
   * sortOrder rather than a guessed date.
   */
  date?: string;
  /** Tie-break within a year. Lower comes first. */
  sortOrder: number;
  cardDescription: string;
  intro: string;
  image: string;
  imageAlt: string;
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
      'Lessons from moving between consumer and enterprise UX—and using business context, metaphors, and playfulness to make complex systems easier to understand.',
    intro:
      'A talk about lessons learned moving from consumer products into enterprise UX—and how understanding the business, breaking down complexity, listening for real needs, adding context, and using familiar metaphors can make complex systems easier to understand.',
    image: '/images/speaking/canux-2025.jpg',
    imageAlt:
      'CanUX 2025 speaker card for Frances Sun, Lead Designer, Austin, Texas, for Canada’s premier experience design event in Ottawa.',
    seoTitle: 'Frances Sun at CanUX 2025 | Enterprise UX & Playfulness',
    seoDescription:
      'Frances Sun presents lessons from enterprise UX on understanding complex systems, clarifying workflows, listening to users, and using playfulness and metaphor in product design.',
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
      'A practical look at what clarity really takes in enterprise UX: understanding the business, breaking down complexity, listening for real needs, and giving design the right context.',
    intro:
      'A practical look at what clarity actually requires in enterprise UX: understanding the business, breaking down complexity, listening beyond surface requests, giving design the right context, and using simple stories to connect complex systems.',
    image: '/images/speaking/uiuc-ux-day-2026.jpg',
    imageAlt:
      'Frances Sun speaking to students in a design studio classroom at the Siebel Center for Design.',
    seoTitle: 'Frances Sun at UX Day 2026 | What Enterprise UX Taught Me About Clarity',
    seoDescription:
      'Frances Sun shares practical lessons on enterprise UX, systems thinking, business context, complex workflows, and designing for clarity at UIUC UX Day 2026.',
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
      'How unclear domain understanding ends up showing in the interface, and how workflow clarity and better collaboration lead to better enterprise UX.',
    intro:
      'When teams do not understand the domain clearly, that uncertainty eventually shows up in the interface. This talk looks at how domain understanding, workflow clarity, and better collaboration can lead to better enterprise UX.',
    image: '/images/speaking/ddd-europe-2026.jpg',
    imageAlt:
      'DDD Europe 2026 speaker card for Frances Sun, showing the Domain Driven Design Europe logo, her portrait, and the talk title.',
    seoTitle:
      'Frances Sun at DDD Europe 2026 | When the Domain Is Fuzzy, the UI Pays the Price',
    seoDescription:
      'Frances Sun speaks at DDD Europe 2026 in Antwerp about domain understanding, enterprise UX, complex workflows, and how unclear domain models can lead to unclear interfaces.',
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
    'I’m a UX designer focused on complex enterprise products and operational systems. Over nearly two decades, I’ve worked across consumer technology, infrastructure, advertising platforms, and enterprise software—turning complex workflows into clear, usable experiences.',
} as const;

export const previousWorkIntro = {
  copy: 'Earlier work across consumer products, mobile experiences, interaction design, and enterprise software.',
  cta: 'View previous work',
  href: '/previous-work',
} as const;

/**
 * ============================================================================
 * SITE CONFIGURATION — RATCHET
 * ============================================================================
 *
 * Every claim on this page has to be true. RATCHET has no customers, no
 * pricing and no revenue, so the sections a SaaS template normally fills with
 * testimonials, logo walls and price tiers have been removed rather than
 * populated with invented ones. What is left is what the product actually does.
 */

export const siteConfig = {
  // Brand
  name: 'RATCHET',
  tagline: 'Your audience-growth Mind. It only moves one direction.',
  description:
    'A persistent agent that treats every post as an experiment, collects the result on its own, and learns what works for one specific audience.',

  // URLs
  url: 'https://ratchet.pages.dev',
  twitter: '@venkat5599',

  // Navigation
  nav: {
    cta: {
      text: 'Open the dashboard',
      href: 'http://localhost:3000',
    },
    signIn: {
      text: 'Source',
      href: 'https://github.com/Venkat5599/cleanbuild',
    },
  },
};

export const heroConfig = {
  // No status badge. A version pill above a headline is decoration, and this
  // is not a launch announcement.
  badge: '',
  headline: {
    line1: 'Every post is an experiment.',
    line2: 'Start',
    accent: 'recording them.',
  },
  subheadline:
    'Every post becomes a logged experiment. The result is collected days later, corrected for the things you do not control, and folded into a model of your audience that never resets.',
  cta: {
    text: 'See what it learned',
    href: 'http://localhost:3000',
  },
};

export const blurHeadlineConfig = {
  text:
    'Creators optimise by vibes and survivorship bias. Nobody logs what they tried, so last month’s lesson is gone. And the feedback that does arrive is tangled up with follower growth, the day of the week and plain luck, so the lesson people take away is usually the wrong one.',
};

export const howItWorksConfig = {
  title: 'How the loop closes',
  description:
    'Four steps, three of which happen while nobody is watching. The only human decision is whether to publish.',
  cta: {
    text: 'Read the technical write-up',
    href: 'https://github.com/Venkat5599/cleanbuild/blob/main/docs/ARCHITECTURE.md',
  },
};

export const faqConfig = {
  title: 'What this is, and what it is not',
  description: 'The limitations are listed here rather than buried, because they are real.',
  cta: {
    primary: {
      text: 'Open the dashboard',
      href: 'http://localhost:3000',
    },
    secondary: {
      text: 'Read the source',
      href: 'https://github.com/Venkat5599/cleanbuild',
    },
  },
};

export const footerConfig = {
  cta: {
    headline: 'Built for Creative Minds Jam #1',
    placeholder: 'you@example.com',
    button: 'Notify me',
  },
  copyright: `© ${new Date().getFullYear()} RATCHET. Audience Growth and Engagement track.`,
};

/**
 * ============================================================================
 * FEATURE FLAGS
 * ============================================================================
 */

export const features = {
  smoothScroll: true,
  testimonialAutoplay: false,
  parallaxHero: true,
  blurInHeadline: true,
};

/**
 * ============================================================================
 * THEME CONFIGURATION
 * ============================================================================
 *
 * Colours live in globals.css. They are the same tokens the dashboard uses, so
 * the marketing page and the product read as one thing rather than two.
 */

export const themeConfig = {
  defaultTheme: 'dark' as 'light' | 'dark' | 'system',
  enableSystemTheme: true,
};

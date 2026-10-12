// The client portal's colours (the same values as the --color-portal-*
// tokens in src/styles/globals.css) and the text/background pairs the
// portal uses. portal-palette.test.ts checks every pair reaches 4.5:1 and
// that the CSS tokens still match.

export const PORTAL_COLORS = {
  ink: "#1a2033",
  muted: "#4a5468",
  line: "#c3c9d8",
  teal: "#0b5560",
  "teal-bg": "#e3f2f3",
  purple: "#5b2e91",
  "purple-bg": "#f1eaf9",
  amber: "#8a4b00",
  "amber-bg": "#fff4e5",
  good: "#237a33",
  grey: "#5f6675",
} as const;

export type PortalColor = keyof typeof PORTAL_COLORS;

const WHITE = "#ffffff";
const NEUTRAL_BG = "#f7f8fa";
const NAVY = "#192e5b";

// [text, background] for every text colour on every background it sits on.
export const TEXT_PAIRS: [string, string][] = [
  [PORTAL_COLORS.ink, WHITE],
  [PORTAL_COLORS.ink, NEUTRAL_BG],
  [PORTAL_COLORS.muted, WHITE],
  [PORTAL_COLORS.muted, NEUTRAL_BG],
  [PORTAL_COLORS.muted, PORTAL_COLORS["teal-bg"]],
  [PORTAL_COLORS.muted, PORTAL_COLORS["purple-bg"]],
  [PORTAL_COLORS.teal, WHITE],
  [PORTAL_COLORS.teal, PORTAL_COLORS["teal-bg"]],
  [PORTAL_COLORS.purple, WHITE],
  [PORTAL_COLORS.purple, PORTAL_COLORS["purple-bg"]],
  [PORTAL_COLORS.amber, PORTAL_COLORS["amber-bg"]],
  [PORTAL_COLORS.amber, WHITE],
  [PORTAL_COLORS.good, WHITE],
  [PORTAL_COLORS.grey, WHITE],
  [WHITE, PORTAL_COLORS.teal],
  [WHITE, PORTAL_COLORS.purple],
  [WHITE, NAVY],
  [NAVY, WHITE],
];

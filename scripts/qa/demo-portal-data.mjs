// Client updates for the local demo seed (seed-demo.mjs), hand-written to
// match the seeded projects. The seed can't run the app's TypeScript
// builders without a new dependency, so these payloads are written out here
// and checked by Vitest instead (src/lib/client-updates/demo-portal-data.test.ts):
// every payload must pass the app's strict schema, and the latest Brightline
// forwarder update must equal what the builder makes from the same data.
//
// Dates are relative to today, so the history always spans past weeks.
// The Kettle & Pine forwarder draft carries DRAFT-CANARY: it must never
// reach a client (Phase 2b's leak scan looks for it).

export const DRAFT_CANARY = "DRAFT-CANARY";

const ALEX = "Alex";
const PRIYA = "Priya";
const TEAM_EMAIL = "sourcing@move.example";

function payload(kind, { route, facts, author, contactEmail = TEAM_EMAIL, milestones = [], funnel = null, comparison, recommendation = null }) {
  return {
    v: 1,
    kind,
    project: { route, facts },
    author: { firstName: author },
    contact: { firstName: author, email: contactEmail },
    milestones,
    funnel,
    comparison,
    recommendation,
  };
}

function steps(kind, counts) {
  const names = kind === "forwarder"
    ? ["contacted", "quoted", "like_for_like", "shortlisted", "recommended"]
    : ["contacted", "replied", "quoted", "shortlisted", "recommended"];
  return names.map((step, i) => ({ step, count: counts[i] }));
}

function forwarderComparison(overrides = {}) {
  return {
    kind: "forwarder",
    counts: { quoted: 0, likeForLike: 0, differentTerms: 0, expired: 0 },
    show: { cost: false, leadTime: false, fcr: false, validity: false },
    today: { costUsd: null, leadTimeDays: null, fcrPct: null },
    targetLeadTimeDays: null,
    options: [],
    emptyCost: null,
    savingsNote: null,
    fcrIssue: null,
    bestSaving: null,
    annual: null,
    ...overrides,
  };
}

function threePlComparison(overrides = {}) {
  return { kind: "three_pl", quoted: 0, show: { cost: false }, options: [], emptyCost: null, bestSaving: null, ...overrides };
}

function option(name, role, fields = {}) {
  return {
    name,
    role,
    comparability: "like_for_like",
    costUsd: null,
    savingPct: null,
    savingUsd: null,
    leadMinDays: null,
    leadMaxDays: null,
    fcrPct: null,
    validUntil: null,
    ...fields,
  };
}

// 3PL options: percent against today's rate card only.
function rateCard(name, role, location, savingPct) {
  return { name, role, location, savingPct };
}

// engagement: which seeded project the update belongs to (seed-demo.mjs
// maps it to the project's id).
export function demoClientUpdates({ isoDate }) {
  const brightlineFwd = {
    route: "Ho Chi Minh City → Los Angeles",
    facts: ["Sea freight, full container (FCL)", "Delivered duty paid (DDP)", "2 shipments a month", "12-month project"],
    author: ALEX,
  };
  const kettleFwd = {
    route: "Ningbo → Savannah",
    facts: ["Sea freight, full container (FCL)", "Delivered duty paid (DDP)", "1 shipment a month", "12-month project"],
    author: ALEX,
  };
  const ridgeway = {
    route: "Porto → Newark",
    facts: ["Sea freight, full container (FCL)", "Delivered duty paid (DDP)", "2 shipments a month", "18-month project"],
    author: PRIYA,
    contactEmail: null,
  };
  const northwind = { route: "US East Coast + Texas", facts: ["Direct-to-consumer (B2C)", "About 1,200 orders a month", "24-month contract"], author: ALEX };
  const brightline3pl = { route: "US West Coast", facts: ["Direct-to-consumer (B2C)", "About 1,800 orders a month", "24-month contract"], author: ALEX };
  const kettle3pl = { route: "US Southeast", facts: ["B2B and direct-to-consumer", "About 900 orders a month", "36-month contract"], author: ALEX };
  const solace = { route: "US nationwide (Midwest node)", facts: ["Direct-to-consumer (B2C)", "About 600 orders a month"], author: PRIYA };
  const harbor = { route: "US Northeast", facts: ["Direct-to-consumer (B2C)", "About 2,500 orders a month", "12-month contract"], author: PRIYA, contactEmail: null };

  const northwindShortlist = [
    rateCard("Harborline 3PL", "recommended", "Edison, NJ + Dallas, TX", 0.0901),
    rateCard("Lone Star Logistics Hub", "backup", "Fort Worth, TX", 0.0728),
    rateCard("Blue Ridge Commerce Fulfillment", "backup", "Roanoke, VA", 0.052),
  ];
  const kettleShortlist = [
    rateCard("Piedmont Fulfillment Co.", "recommended", "Greensboro, NC", 0.1159),
    rateCard("Carolina Commerce Hub", "backup", "Charlotte, NC", 0.1029),
    rateCard("Peachtree Logistics", "backup", "Atlanta, GA", 0.0783),
  ];
  const harborShortlist = [
    rateCard("Bay State Fulfillment", "recommended", "Worcester, MA", 0.0915),
    rateCard("Hudson Valley Logistics", "backup", "Newburgh, NY", 0.0736),
    rateCard("Nutmeg Commerce", "backup", "Hartford, CT", 0.0632),
  ];

  return [
    // ---- Northwind 3PL: stage 5, approval due in 5 days ----
    {
      engagement: "northwind3pl", daysAgo: 21, stage: 3,
      headline: "Quotes are coming in",
      summary: "We contacted twelve warehouses on the East Coast and in Texas. Five have sent rate cards so far, and we're checking each one against your order profile.",
      next_step: "Remaining rate cards", next_step_due: isoDate(-14), needs_client_action: false,
      payload: payload("three_pl", { ...northwind, funnel: steps("three_pl", [12, 7, 5, 0, 0]),
        comparison: threePlComparison({ quoted: 5, emptyCost: "too_few" }) }),
    },
    {
      engagement: "northwind3pl", daysAgo: 10, stage: 4,
      headline: "Three warehouses on your shortlist",
      summary: "Three warehouses beat your current rate card, and all three can track roast dates. We're checking references and asking each for its best rate before we recommend one.",
      next_step: "Our recommendation", next_step_due: isoDate(-2), needs_client_action: false,
      payload: payload("three_pl", { ...northwind, funnel: steps("three_pl", [12, 5, 5, 3, 0]),
        milestones: [{ label: "Rate cards in", planned: isoDate(-14), actual: isoDate(-12) }, { label: "Recommendation", planned: isoDate(-2), actual: null }],
        comparison: threePlComparison({ quoted: 5, show: { cost: true }, options: northwindShortlist.map((o) => ({ ...o, role: "backup" })), bestSaving: { name: "Harborline 3PL", pct: 0.0901 } }) }),
    },
    {
      engagement: "northwind3pl", daysAgo: 2, stage: 5,
      headline: "Our recommendation is ready: Harborline 3PL",
      summary: "Harborline's two warehouses (New Jersey and Texas) reach most of your customers in two days, and its rate card is 9% below your current one. It tracks roast dates for first-in, first-out picking. We'd like your go-ahead so we can start contract talks.",
      next_step: "Approve the recommendation, or tell us what to change", next_step_due: isoDate(5), needs_client_action: true,
      payload: payload("three_pl", { ...northwind, funnel: steps("three_pl", [12, 5, 5, 3, 1]),
        milestones: [
          { label: "Rate cards in", planned: isoDate(-14), actual: isoDate(-12) },
          { label: "Recommendation", planned: isoDate(-2), actual: isoDate(-2) },
          { label: "Your decision", planned: isoDate(5), actual: null },
          { label: "Go-live", planned: isoDate(50), actual: null },
        ],
        comparison: threePlComparison({ quoted: 5, show: { cost: true }, options: northwindShortlist, bestSaving: { name: "Harborline 3PL", pct: 0.0901 } }),
        recommendation: {
          name: "Harborline 3PL",
          reasons: ["Two warehouses: most orders arrive in 2 days", "Rate card 9% below your current one", "Tracks roast dates for first-in, first-out picking"],
          tradeOffs: ["Setup takes about 6 weeks"],
          basedOn: "You told us cost matters most.",
        } }),
    },

    // ---- Brightline forwarder: stage 5, decision due in 5 days ----
    {
      engagement: "brightlineFwd", daysAgo: 24, stage: 2,
      headline: "We've contacted twelve forwarders",
      summary: "We sent your shipment details to twelve forwarders that run Vietnam to US West Coast lanes. Quotes are due within two weeks.",
      next_step: "Quotes due", next_step_due: isoDate(-12), needs_client_action: false,
      payload: payload("forwarder", { ...brightlineFwd, funnel: steps("forwarder", [12, 0, 0, 0, 0]),
        comparison: forwarderComparison({ show: { cost: false, leadTime: false, fcr: true, validity: false }, today: { costUsd: null, leadTimeDays: null, fcrPct: "16.7%" }, emptyCost: "too_few" }) }),
    },
    {
      engagement: "brightlineFwd", daysAgo: 12, stage: 3,
      headline: "Eight quotes in, six like-for-like",
      summary: "Eight forwarders have quoted. Six quoted on the same terms as yours (sea, full container, duty paid), so they can be compared fairly. Two quoted without duties and taxes, so they're shown separately.",
      next_step: "Shortlist", next_step_due: isoDate(-5), needs_client_action: false,
      payload: payload("forwarder", { ...brightlineFwd, funnel: steps("forwarder", [12, 8, 6, 0, 0]),
        milestones: [{ label: "Quotes due", planned: isoDate(-12), actual: isoDate(-13) }],
        comparison: forwarderComparison({ counts: { quoted: 8, likeForLike: 6, differentTerms: 2, expired: 0 }, show: { cost: false, leadTime: false, fcr: true, validity: false },
          today: { costUsd: null, leadTimeDays: null, fcrPct: "16.7%" }, emptyCost: "no_shortlist" }) }),
    },
    {
      engagement: "brightlineFwd", daysAgo: 3, stage: 5,
      headline: "We recommend Pacific Bridge Logistics",
      summary: "Pacific Bridge has the lowest like-for-like price, 10% below what you pay today, with weekly sailings and its own US customs clearance. Lotus Freight and Saigon Harbor are close behind if you'd rather have a backup.",
      next_step: "Your decision", next_step_due: isoDate(5), needs_client_action: true,
      payload: payload("forwarder", { ...brightlineFwd, funnel: steps("forwarder", [12, 8, 6, 3, 1]),
        milestones: [
          { label: "Quotes due", planned: isoDate(-12), actual: isoDate(-13) },
          { label: "Shortlist", planned: isoDate(-5), actual: isoDate(-4) },
          { label: "Your decision", planned: isoDate(5), actual: null },
          { label: "First booking", planned: isoDate(20), actual: null },
        ],
        comparison: forwarderComparison({
          counts: { quoted: 8, likeForLike: 6, differentTerms: 2, expired: 0 },
          show: { cost: true, leadTime: true, fcr: true, validity: true },
          today: { costUsd: 10000, leadTimeDays: 30, fcrPct: "16.7%" },
          targetLeadTimeDays: 25,
          options: [
            option("Pacific Bridge Logistics", "recommended", { costUsd: 9000, savingPct: 0.1, savingUsd: 1000, leadMinDays: 24, leadMaxDays: 28, fcrPct: "15.0%", validUntil: isoDate(19) }),
            option("Lotus Freight", "backup", { costUsd: 9420, savingPct: 0.058, savingUsd: 580, leadMinDays: 26, leadMaxDays: 32, fcrPct: "15.7%", validUntil: isoDate(19) }),
            option("Saigon Harbor Shipping", "backup", { costUsd: 9420, savingPct: 0.058, savingUsd: 580, leadMinDays: 22, leadMaxDays: 26, fcrPct: "15.7%", validUntil: isoDate(19) }),
          ],
          bestSaving: { name: "Pacific Bridge Logistics", pct: 0.1, usd: 1000 },
        }),
        recommendation: {
          name: "Pacific Bridge Logistics",
          reasons: ["Lowest like-for-like price: 10% below today", "Weekly sailings, 24–28 days door to door", "In-house US customs clearance"],
          tradeOffs: ["Insurance is quoted separately (about $95 per container)", "Saigon Harbor is 2 days faster for $420 more"],
          basedOn: "You told us cost matters most.",
        } }),
    },

    // ---- Brightline 3PL: stage 3 ----
    {
      engagement: "brightline3pl", daysAgo: 14, stage: 2,
      headline: "Nine West Coast warehouses contacted",
      summary: "We contacted nine warehouses that handle apparel returns at your volume. Several have asked for your returns data, which we've sent.",
      next_step: "First rate cards", next_step_due: isoDate(-4), needs_client_action: false,
      payload: payload("three_pl", { ...brightline3pl, funnel: steps("three_pl", [9, 5, 1, 0, 0]),
        comparison: threePlComparison({ quoted: 1, emptyCost: "too_few" }) }),
    },
    {
      engagement: "brightline3pl", daysAgo: 4, stage: 3,
      headline: "Four rate cards in",
      summary: "Four warehouses have sent rate cards and three more are preparing them. We're checking which ones price returns the same way, so the comparison is fair.",
      next_step: "Remaining rate cards", next_step_due: isoDate(12), needs_client_action: false,
      payload: payload("three_pl", { ...brightline3pl, funnel: steps("three_pl", [9, 7, 4, 0, 0]),
        milestones: [{ label: "Rate cards due", planned: isoDate(12), actual: null }, { label: "Recommendation", planned: isoDate(25), actual: null }],
        comparison: threePlComparison({ quoted: 4, emptyCost: "too_few" }) }),
    },

    // ---- Kettle & Pine 3PL: stage 6, approved a week ago ----
    {
      engagement: "kettle3pl", daysAgo: 30, stage: 4,
      headline: "Three strong options",
      summary: "Three warehouses in the Southeast handle bulky items and retail orders well. All three are cheaper than running your own warehouse.",
      next_step: "Our recommendation", next_step_due: isoDate(-16), needs_client_action: false,
      payload: payload("three_pl", { ...kettle3pl, funnel: steps("three_pl", [5, 3, 3, 3, 0]),
        comparison: threePlComparison({ quoted: 3, show: { cost: true }, options: kettleShortlist.map((o) => ({ ...o, role: "backup" })), bestSaving: { name: "Piedmont Fulfillment Co.", pct: 0.1159 } }) }),
    },
    {
      engagement: "kettle3pl", daysAgo: 16, stage: 5,
      headline: "We recommend Piedmont Fulfillment Co.",
      summary: "Piedmont handles bulky items with care and meets your retailers' order rules, and its rate card is 12% below your current costs.",
      next_step: "Your decision", next_step_due: isoDate(-7), needs_client_action: true,
      payload: payload("three_pl", { ...kettle3pl, funnel: steps("three_pl", [5, 3, 3, 3, 1]),
        comparison: threePlComparison({ quoted: 3, show: { cost: true }, options: kettleShortlist, bestSaving: { name: "Piedmont Fulfillment Co.", pct: 0.1159 } }),
        recommendation: { name: "Piedmont Fulfillment Co.", reasons: ["Meets your retailers' order rules", "White-glove handling for bulky items"], tradeOffs: ["A peak-season surcharge applies from November"], basedOn: "You told us service quality matters most." } }),
    },
    {
      engagement: "kettle3pl", daysAgo: 6, stage: 6,
      headline: "You approved Piedmont: onboarding has started",
      summary: "Thanks for approving Piedmont. We've started the contract and the onboarding plan; your first inbound delivery is planned for mid-November.",
      next_step: "Contract signed", next_step_due: isoDate(3), needs_client_action: false,
      payload: payload("three_pl", { ...kettle3pl, funnel: steps("three_pl", [5, 3, 3, 3, 1]),
        milestones: [
          { label: "Your approval", planned: isoDate(-7), actual: isoDate(-7) },
          { label: "Contract signed", planned: isoDate(3), actual: null },
          { label: "Go-live", planned: isoDate(40), actual: null },
        ],
        comparison: threePlComparison({ quoted: 3, show: { cost: true }, options: kettleShortlist, bestSaving: { name: "Piedmont Fulfillment Co.", pct: 0.1159 } }),
        recommendation: { name: "Piedmont Fulfillment Co.", reasons: ["Meets your retailers' order rules", "White-glove handling for bulky items"], tradeOffs: ["A peak-season surcharge applies from November"], basedOn: "You told us service quality matters most." } }),
    },

    // ---- Kettle & Pine forwarder: stage 3, plus a draft ----
    {
      engagement: "kettleFwd", daysAgo: 9, stage: 2,
      headline: "Five forwarders contacted",
      summary: "We've asked five forwarders on the Ningbo to US East Coast lane for quotes.",
      next_step: "Quotes due", next_step_due: isoDate(4), needs_client_action: false,
      payload: payload("forwarder", { ...kettleFwd, funnel: steps("forwarder", [5, 0, 0, 0, 0]),
        comparison: forwarderComparison({ show: { cost: false, leadTime: false, fcr: true, validity: false }, today: { costUsd: null, leadTimeDays: null, fcrPct: "16.2%" }, emptyCost: "too_few" }) }),
    },
    {
      engagement: "kettleFwd", daysAgo: 2, stage: 3,
      headline: "Two of five quotes in",
      summary: "Two forwarders have quoted so far. One quoted on different terms (without ocean freight and duties), so it can't be compared with your current cost yet. We expect the rest this week.",
      next_step: "Remaining quotes", next_step_due: isoDate(4), needs_client_action: false,
      payload: payload("forwarder", { ...kettleFwd, funnel: steps("forwarder", [5, 2, 1, 0, 0]),
        comparison: forwarderComparison({ counts: { quoted: 2, likeForLike: 1, differentTerms: 1, expired: 0 }, show: { cost: false, leadTime: false, fcr: true, validity: false },
          today: { costUsd: null, leadTimeDays: null, fcrPct: "16.2%" }, emptyCost: "too_few" }) }),
    },
    {
      engagement: "kettleFwd", daysAgo: 0, stage: 3, isDraft: true,
      headline: `${DRAFT_CANARY} Three quotes in (not shared yet)`,
      summary: `${DRAFT_CANARY} Draft: waiting for Silk Route's quote before sharing.`,
      next_step: "Remaining quotes", next_step_due: isoDate(4), needs_client_action: false,
      payload: payload("forwarder", { ...kettleFwd, funnel: steps("forwarder", [5, 2, 1, 0, 0]),
        comparison: forwarderComparison({ counts: { quoted: 2, likeForLike: 1, differentTerms: 1, expired: 0 }, emptyCost: "too_few", show: { cost: false, leadTime: false, fcr: false, validity: false } }) }),
    },

    // ---- Solace 3PL: stage 2 ----
    {
      engagement: "solace3pl", daysAgo: 12, stage: 1,
      headline: "Getting to know your needs",
      summary: "Thanks for the kickoff call. We've written up your requirements, including temperature-controlled storage and expiry tracking.",
      next_step: "Start contacting warehouses", next_step_due: isoDate(-6), needs_client_action: false,
      payload: payload("three_pl", { ...solace, comparison: threePlComparison({ emptyCost: "no_baseline" }) }),
    },
    {
      engagement: "solace3pl", daysAgo: 5, stage: 2,
      headline: "Three warehouses contacted",
      summary: "We've contacted three warehouses that can store skincare at a controlled temperature. To compare their prices with what you pay now, we need your current warehouse's rates.",
      next_step: "Send us your current warehouse invoices", next_step_due: isoDate(3), needs_client_action: true,
      payload: payload("three_pl", { ...solace, funnel: steps("three_pl", [3, 1, 0, 0, 0]),
        comparison: threePlComparison({ emptyCost: "no_baseline" }) }),
    },

    // ---- Ridgeway forwarder: stage 4, EUR invoice ----
    {
      engagement: "ridgewayFwd", daysAgo: 18, stage: 3,
      headline: "Quotes are coming in",
      summary: "Three forwarders on the Porto to Newark lane have quoted so far.",
      next_step: "Remaining quotes", next_step_due: isoDate(-10), needs_client_action: false,
      payload: payload("forwarder", { ...ridgeway, funnel: steps("forwarder", [5, 3, 3, 0, 0]),
        comparison: forwarderComparison({ counts: { quoted: 3, likeForLike: 3, differentTerms: 0, expired: 0 }, show: { cost: false, leadTime: false, fcr: true, validity: false }, emptyCost: "no_shortlist", fcrIssue: "not_usd" }) }),
    },
    {
      engagement: "ridgewayFwd", daysAgo: 6, stage: 4,
      headline: "Comparing four like-for-like quotes",
      summary: "Four forwarders quoted on the same terms as yours, and we're negotiating with the two lowest. One quoted without duties and taxes, so it isn't compared.",
      next_step: "Our recommendation", next_step_due: isoDate(8), needs_client_action: false,
      payload: payload("forwarder", { ...ridgeway, funnel: steps("forwarder", [5, 5, 4, 0, 0]),
        milestones: [{ label: "Quotes due", planned: isoDate(-10), actual: isoDate(-9) }, { label: "Recommendation", planned: isoDate(8), actual: null }],
        comparison: forwarderComparison({ counts: { quoted: 5, likeForLike: 4, differentTerms: 1, expired: 0 }, show: { cost: false, leadTime: false, fcr: true, validity: false }, emptyCost: "no_shortlist", fcrIssue: "not_usd" }) }),
    },

    // ---- Harbor 3PL: complete two months ago ----
    {
      engagement: "harbor3pl", daysAgo: 90, stage: 5,
      headline: "We recommend Bay State Fulfillment",
      summary: "Bay State dispatches the same day for orders in by 3pm, which matters most for your subscriptions, and its rate card is 9% below your current one.",
      next_step: "Your decision", next_step_due: isoDate(-80), needs_client_action: true,
      payload: payload("three_pl", { ...harbor, funnel: steps("three_pl", [5, 3, 3, 3, 1]),
        comparison: threePlComparison({ quoted: 3, show: { cost: true }, options: harborShortlist, bestSaving: { name: "Bay State Fulfillment", pct: 0.0915 } }),
        recommendation: { name: "Bay State Fulfillment", reasons: ["Same-day dispatch for orders in by 3pm", "Rate card 9% below your current one"], tradeOffs: ["One warehouse only"], basedOn: "You told us speed matters most." } }),
    },
    {
      engagement: "harbor3pl", daysAgo: 75, stage: 6,
      headline: "Setting up with Bay State",
      summary: "You approved Bay State. The contract is signed and your stock moves in over the next two weeks.",
      next_step: "Go-live", next_step_due: isoDate(-60), needs_client_action: false,
      payload: payload("three_pl", { ...harbor, milestones: [{ label: "Your approval", planned: isoDate(-80), actual: isoDate(-75) }, { label: "Go-live", planned: isoDate(-60), actual: null }],
        comparison: threePlComparison({ quoted: 3, show: { cost: true }, options: harborShortlist, bestSaving: { name: "Bay State Fulfillment", pct: 0.0915 } }),
        recommendation: { name: "Bay State Fulfillment", reasons: ["Same-day dispatch for orders in by 3pm", "Rate card 9% below your current one"], tradeOffs: ["One warehouse only"], basedOn: "You told us speed matters most." } }),
    },
    {
      engagement: "harbor3pl", daysAgo: 60, stage: 7,
      headline: "Live with Bay State Fulfillment",
      summary: "Your orders now ship from Bay State. This project is complete; this page stays here for your records.",
      next_step: null, next_step_due: null, needs_client_action: false,
      payload: payload("three_pl", { ...harbor, milestones: [{ label: "Your approval", planned: isoDate(-80), actual: isoDate(-75) }, { label: "Go-live", planned: isoDate(-60), actual: isoDate(-60) }],
        comparison: threePlComparison({ quoted: 3, show: { cost: true }, options: harborShortlist, bestSaving: { name: "Bay State Fulfillment", pct: 0.0915 } }),
        recommendation: { name: "Bay State Fulfillment", reasons: ["Same-day dispatch for orders in by 3pm", "Rate card 9% below your current one"], tradeOffs: ["One warehouse only"], basedOn: "You told us speed matters most." } }),
    },
  ];
}

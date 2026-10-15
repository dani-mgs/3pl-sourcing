// What the live demo client contains, as the form fields an expert would
// submit. scripts/demo/live-demo.mjs runs every one through the app's own
// parsers and builders, so nothing here is stored as-is. All names are
// fictional, all emails and websites are on .example domains. Dates are
// offsets in days from the day of the (first) run.
//
// Same shape as Brightline in scripts/qa/seed-demo.mjs, with what the live
// demo needs on top: 3 shortlisted 3PLs with a recommendation, and quotes
// that expire, so every part of the app has something to show.

export const CLIENT = { name: "Brightline Apparel (Demo)", businessModel: "B2C" };

// ---- 3PL project (US West Coast) ---------------------------------------------------

export const THREE_PL_PROJECT = {
  target_geography: "US West Coast",
  contract_period_months: "24",
  benchmark_period: "Last 12 months",
  avg_monthly_orders: "1800",
  peak_monthly_orders: "3600",
  latest_month_orders: "1950",
  avg_monthly_units: "4300",
  peak_monthly_units: "8800",
  core_cost_categories: "Storage, pick & pack, receiving, returns",
  main_decision_focus: "Cost",
  key_capability_needs: "B2C apparel, high returns volume, Shopify integration",
  assumptions_data_limitations: "Order profile from the client's store export; peak month estimated.",
};

// costs: [storage, pick & pack, receiving, returns] per month (the Cost
// Comparison), rates: the rate card, or null for "not enough data to rank".
export const PROVIDERS = [
  { name: "Inland Empire Fulfillment", location: "Ontario, CA", status: "Baseline", incumbent: true,
    costs: [2600, 4860, 520, 900], rates: { receiving_rate: 32, storage_rate: 21, fulfillment_rate: 2.7, returns_rate: 3.1 },
    notes: "The client's current 3PL: the baseline every rate card is compared with." },
  { name: "Pacific Crest Fulfillment", location: "Reno, NV", status: "Shortlisted", assessment: "Move Recommended",
    costs: [2400, 4500, 480, 820], rates: { receiving_rate: 30, storage_rate: 19, fulfillment_rate: 2.5, returns_rate: 2.8 },
    strength: "Lowest total cost; next-day ground to most of the West Coast", weakness: "Returns processed in 3 days, not 2" },
  { name: "Sierra Commerce Logistics", location: "Sacramento, CA", status: "Shortlisted", assessment: "Fit",
    costs: [2350, 4700, 500, 760], rates: { receiving_rate: 31, storage_rate: 18.5, fulfillment_rate: 2.6, returns_rate: 2.6 },
    strength: "Cheapest returns handling", weakness: "Shopify connector is a paid add-on" },
  { name: "Bayshore Warehousing", location: "Hayward, CA", status: "Shortlisted", assessment: "Fit",
    costs: [2900, 4400, 450, 880], rates: { receiving_rate: 28, storage_rate: 23, fulfillment_rate: 2.4, returns_rate: 3 },
    strength: "Fastest pick and pack", weakness: "Highest storage rate" },
  { name: "Mojave Distribution", location: "Victorville, CA", status: "Clarifications", assessment: "Under Assessment",
    costs: [2200, 4950, 560, 940], rates: { receiving_rate: 34, storage_rate: 17, fulfillment_rate: 2.8, returns_rate: 3.2 } },
  { name: "Cascade Ecom Logistics", location: "Kent, WA", status: "Reviewing Quotation", assessment: "Under Assessment",
    costs: [2500, 4800, 510, 860], rates: { receiving_rate: 31, storage_rate: 20, fulfillment_rate: 2.7, returns_rate: 2.9 } },
  { name: "Harborview Logistics", location: "Oakland, CA", status: "Unfit", assessment: "Unfit",
    costs: [2700, 5100, 600, 980], rates: { receiving_rate: 35, storage_rate: 22, fulfillment_rate: 2.9, returns_rate: 3.3 },
    notes: "No apparel experience; failed the site visit." },
  { name: "Valley Ecom Partners", location: "Fresno, CA", status: "Waiting for Quotation", costs: null, rates: null },
  { name: "Coastline Fulfillment", location: "Long Beach, CA", status: "Scheduled for Discovery Call", costs: null, rates: null },
  { name: "Redline Logistics", location: "Phoenix, AZ", status: "Withdrawn / No Response", costs: null, rates: null,
    notes: "No reply after two follow-ups." },
];

export const RECOMMENDATION = {
  priority: "Cost Savings",
  top: ["Pacific Crest Fulfillment", "Sierra Commerce Logistics", "Bayshore Warehousing"],
};

// ---- Forwarder project (Ho Chi Minh City -> Los Angeles) ---------------------------

export const FORWARDER_PROJECT = {
  project_duration_months: "12",
  packing_list_available: "Yes",
  origin_country: "Vietnam", origin_city: "Ho Chi Minh City", origin_port: "Cat Lai",
  destination_country: "United States", destination_city: "Los Angeles", destination_port: "Los Angeles",
  final_delivery_address: "Ontario, CA (client's 3PL)",
  weight_kg: "9500", cbm: "58", cartons: "950", units: "22800",
  cargo_description: "Apparel: knit tops and denim, cartoned, one 40ft container",
  packaging_type: "Cartons", stackable: "Yes", dangerous_goods: "No", temperature_controlled: "No",
  shipment_mode: "Sea", shipment_type: "FCL",
  current_incoterm: "DDP", final_incoterm: "DDP", incoterms_to_compare: ["DDP"],
  final_shipment_mode: "Sea", final_shipment_type: "FCL",
  hs_code: "6109.10",
  invoice_value: "60000", invoice_currency: "USD",
  current_freight_cost_usd: "10000", current_freight_forwarder: "Current forwarder (client-booked)",
  shipments_per_month: "2",
  current_lead_time_days: "30", target_lead_time_days: "25",
  insurance_required: "Quote Both With and Without", brokerage_needed: "Yes",
};

// quote: on DDP / Sea / FCL unless it says otherwise. validDays: rate valid
// until (negative = expired). take: "Move's take" in the Market Report, which
// must pass the app's guard (no names, places, websites, contacts or status
// words); none for the forwarders that aren't taken forward.
export const FORWARDERS = [
  { name: "Pacific Bridge Logistics", hq: "Singapore", footprint: "Regional: 22 offices across Asia and the US", status: "Shortlisted", assessment: "Move Recommended", air: true, insurance: true,
    quote: { amount: 9000, lead: [24, 28], validDays: 19, quotedDaysAgo: 9, overall: "Move Recommended", decision: "Move Recommended - Awaiting Client",
      strength: "Lowest like-for-like price; weekly sailings; in-house US customs clearance", weakness: "Insurance extra (about $95 per container)" },
    take: "Lowest comparable price; weekly sailings; in-house US customs" },
  { name: "Lotus Freight", hq: "Ho Chi Minh City, Vietnam", footprint: "Mid-size: 8 offices in Vietnam, agents in the US", status: "Shortlisted", assessment: "Fit",
    quote: { amount: 9420, lead: [26, 32], validDays: 19, quotedDaysAgo: 10, overall: "Fit", strength: "Weekend delivery available (+$150)", weakness: "Longer transit range" },
    take: "Weekend delivery available for a small fee" },
  { name: "Saigon Harbor Shipping", hq: "Ho Chi Minh City, Vietnam", footprint: "Small: 2 offices", status: "Shortlisted", assessment: "Fit",
    quote: { amount: 9420, lead: [22, 26], validDays: 19, quotedDaysAgo: 8, overall: "Fit", strength: "Fastest transit (22-26 days)", weakness: "Weekday deliveries only" },
    take: "Fastest transit of all quotes; weekday deliveries only" },
  { name: "Meridian Ocean Logistics", hq: "Hong Kong", footprint: "Global: 140+ offices worldwide", status: "Vetted", assessment: "Fit", air: true, insurance: true,
    quote: { amount: 9800, lead: [25, 30], validDays: -3, quotedDaysAgo: 30, overall: "Fit" },
    take: "Good coverage at both ends; the rate has lapsed and needs re-confirming" },
  { name: "Redwood Gateway Freight", hq: "Los Angeles, CA", footprint: "Mid-size: 5 US offices, Asia agents", status: "Reviewing Quotation", assessment: "Under Assessment",
    quote: { amount: 10150, lead: [27, 33], validDays: 25, quotedDaysAgo: 6, overall: "Under Assessment" },
    take: "Strong at the destination end; above your current cost" },
  { name: "Mekong Star Logistics", hq: "Can Tho, Vietnam", footprint: "Small: single office", status: "Negotiation", assessment: "Under Assessment",
    quote: { amount: 10600, lead: [28, 35], validDays: -1, quotedDaysAgo: 25, overall: "Under Assessment" },
    take: "Highest comparable price; the rate has lapsed" },
  { name: "Busan Pacific Lines", hq: "Busan, South Korea", footprint: "Regional: 12 offices in Korea, Vietnam and the US", status: "Reviewing Quotation", assessment: "Under Assessment",
    quote: { amount: 8700, incoterm: "DDU (legacy term)", lead: [23, 29], validDays: 20, quotedDaysAgo: 11, overall: "Under Assessment", weakness: "Duties and taxes not included (DDU)" },
    take: "Quoted without duties and taxes, so not comparable as it stands" },
  { name: "Orient Link Express", hq: "Shenzhen, China", footprint: "Large: 40 offices in China and Southeast Asia", status: "Reviewing Quotation", assessment: "Under Assessment", air: true,
    quote: { amount: 8950, incoterm: "DDU (legacy term)", lead: [25, 31], validDays: 17, quotedDaysAgo: 9, overall: "Under Assessment", weakness: "Duties and taxes not included (DDU)" },
    take: "Quoted without duties and taxes; an air option is available" },
  { name: "Swift Tide Cargo", hq: "Da Nang, Vietnam", footprint: "Small: 3 offices", status: "Unfit", assessment: "Unfit",
    quote: { amount: 8300, lead: [20, 24], validDays: 15, quotedDaysAgo: 13, overall: "Unfit" }, keyNotes: "Failed the reference check: no active US customs bond." },
  { name: "Jade Lantern Shipping", hq: "Taipei, Taiwan", footprint: "Regional: 15 offices", status: "Do Not Contact", assessment: "Unfit",
    quote: { amount: 9100, lead: [24, 30], validDays: 12, quotedDaysAgo: 14, overall: "Unfit" }, keyNotes: "Surcharge dispute in 2025; not to be used." },
  { name: "Anchor Point Forwarding", hq: "Long Beach, CA", footprint: "Mid-size: 6 US offices", status: "Withdrawn / No Response",
    quote: { amount: 9950, lead: [26, 34], validDays: -6, quotedDaysAgo: 28 }, keyNotes: "Stopped replying after the first quote." },
  { name: "SkyHarbor Air & Sea", hq: "Hanoi, Vietnam", footprint: "Mid-size: 10 offices, air specialist", status: "Withdrawn / No Response", air: true,
    quote: { amount: 21500, mode: "Air", type: "Air Freight", chargeable: 11000, lead: [4, 6], validDays: 5, quotedDaysAgo: 20 }, keyNotes: "Only quoted air; withdrew when asked for sea." },
];

// ---- What the client sees ----------------------------------------------------------

export const THREE_PL_UPDATE = {
  stage: "5",
  headline: "Our recommendation is ready: Pacific Crest Fulfillment",
  summary:
    "Seven warehouses sent rate cards. Three beat your current costs and can handle your returns volume. " +
    "We recommend Pacific Crest Fulfillment, with Sierra Commerce Logistics and Bayshore Warehousing as backups.",
  nextStep: "Approve the recommendation, or tell us what to change",
  nextStepDueDays: 5,
  needsClientAction: true,
  milestones: [
    { label: "Rate cards in", plannedDays: -14, actualDays: -12 },
    { label: "Recommendation", plannedDays: -2, actualDays: -1 },
    { label: "Your decision", plannedDays: 5, actualDays: null },
  ],
  recommended: "Pacific Crest Fulfillment",
  partners: ["Pacific Crest Fulfillment", "Sierra Commerce Logistics", "Bayshore Warehousing"],
  reasons: ["Lowest total monthly cost of all rate cards", "Next-day ground delivery to most of the West Coast"],
  tradeOffs: ["Returns take 3 days instead of 2"],
  basedOn: "You told us cost matters most.",
  sections: ["funnel", "cost"],
};

export const FORWARDER_UPDATE = {
  stage: "5",
  headline: "We recommend Pacific Bridge Logistics",
  summary:
    "Twelve forwarders were contacted and six quoted on your terms. Pacific Bridge Logistics is the cheapest " +
    "like-for-like quote, with weekly sailings and in-house US customs clearance.",
  nextStep: "Your decision",
  nextStepDueDays: 5,
  needsClientAction: true,
  milestones: [
    { label: "Quotes due", plannedDays: -12, actualDays: -9 },
    { label: "Shortlist", plannedDays: -5, actualDays: -4 },
    { label: "Your decision", plannedDays: 5, actualDays: null },
  ],
  recommended: "Pacific Bridge Logistics",
  partners: ["Pacific Bridge Logistics", "Lotus Freight", "Saigon Harbor Shipping"],
  reasons: ["Lowest like-for-like price", "Weekly sailings", "In-house US customs clearance"],
  tradeOffs: ["Insurance is quoted separately"],
  basedOn: "You told us cost matters most.",
  sections: ["funnel", "cost", "leadTime", "fcr", "validity"],
  includeAnnual: true,
};

export const MARKET_REPORT = { recommended: "Pacific Bridge Logistics" };

// Requests: as a client would send them through the portal. The introduction
// is for the letter the report gives `introductionFor`.
export const REQUESTS = {
  approve: { message: "Approved. Please start onboarding after the 20th." },
  question: { message: "Could the recommended forwarder also take a second container in peak season?", wantsCall: true },
  introduction: { introductionFor: "Redwood Gateway Freight", message: "We'd like to talk to them about destination services too." },
};

// The duty estimate, linked to the forwarder project and the recommended
// forwarder's quote. Skipped with a warning if the target's HTS data hasn't
// got this code.
export const ESTIMATE = {
  htsCode: "6109.10.00.12",
  originCountry: "VN",
  mode: "Sea",
  quoteOf: "Pacific Bridge Logistics",
  label: "Knit tops, one 40ft container (Demo)",
};

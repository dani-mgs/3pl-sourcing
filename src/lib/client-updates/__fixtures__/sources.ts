// Full database rows (every column, as `select *` would return them) for the
// client-update tests. Every internal free-text column carries
// INTERNAL-CANARY plus a unique sentinel, so a field that leaks into a
// payload is caught whichever path it takes.

import type { PublishInputs } from "../publish-inputs";

export const CANARY = "INTERNAL-CANARY";
export const TODAY = "2026-10-12";

let n = 0;
export function leak(label: string): string {
  n += 1;
  return `${CANARY} ZZLEAK${label.replace(/[^A-Za-z]/g, "")}${String.fromCharCode(65 + (n % 26))}`;
}

function day(offset: number): string {
  const d = new Date(Date.UTC(2026, 9, 12 + offset));
  return d.toISOString().slice(0, 10);
}

// ---- Forwarder project ------------------------------------------------------

export function forwarderProjectRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "00000000-0000-4000-8000-000000000401",
    client_id: "00000000-0000-4000-8000-00000000c001",
    owner_id: "00000000-0000-4000-8000-0000000000a1",
    status: "Active",
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    field_sources: { origin_city: leak("fieldsource") },
    packing_list_available: "Yes",
    packing_list_reference: leak("packingref"),
    packing_list_notes: leak("packingnotes"),
    origin_country: "Vietnam",
    origin_city: "Ho Chi Minh City",
    origin_port: "Cat Lai",
    destination_country: "United States",
    destination_city: "Los Angeles",
    destination_port: "Los Angeles",
    final_delivery_address: leak("finaladdress"),
    weight_kg: 9500,
    cbm: 58,
    pallets: null,
    cartons: 950,
    cargo_description: leak("cargodescription"),
    packaging_type: "Cartons",
    units: 22800,
    stackable: "Yes",
    dangerous_goods: "No",
    temperature_controlled: "No",
    special_handling: leak("specialhandling"),
    shipment_mode: "Sea",
    shipment_type: "FCL",
    current_incoterm: "DDP",
    final_incoterm: "DDP",
    incoterms_to_compare: ["DDP"],
    final_shipment_mode: "Sea",
    final_shipment_type: "FCL",
    hs_code: "6109.10",
    invoice_value: 60000,
    invoice_currency: "USD",
    current_freight_cost_usd: 10000,
    current_freight_forwarder: leak("currentforwarder"),
    shipments_per_month: 2,
    shipments_per_year: null,
    current_lead_time_days: 30,
    target_lead_time_days: 25,
    insurance_required: "No",
    brokerage_needed: "Yes",
    project_duration_months: 12,
    clients: { name: "Fixture Apparel", business_model: "B2C" },
    ...overrides,
  };
}

type F = { name: string; status: string; assessment?: string | null; quotes: Record<string, unknown>[] };

const SEA_DDP = { shipment_mode: "Sea", shipment_type: "FCL", incoterm: "DDP" };

// 12 forwarders like the Brightline demo: 3 shortlisted, 3 more
// like-for-like, 2 on different terms (DDU), 4 out of the running (one of
// them the cheapest), plus one never contacted.
export const FORWARDERS: F[] = [
  { name: "Pacific Bridge Logistics", status: "Shortlisted", assessment: "Move Recommended", quotes: [{ ...SEA_DDP, original_amount: 9000, lead_time_min_days: 24, lead_time_max_days: 28, rate_valid_until: day(19) }] },
  { name: "Lotus Freight", status: "Shortlisted", assessment: "Fit", quotes: [{ ...SEA_DDP, original_amount: 9420, lead_time_min_days: 26, lead_time_max_days: 32, rate_valid_until: day(19) }] },
  { name: "Saigon Harbor Shipping", status: "Shortlisted", assessment: "Fit", quotes: [{ ...SEA_DDP, original_amount: 9420, lead_time_min_days: 22, lead_time_max_days: 26, rate_valid_until: day(9) }] },
  { name: "Meridian Ocean Logistics", status: "Vetted", assessment: "Fit", quotes: [{ ...SEA_DDP, original_amount: 9800, rate_valid_until: day(9) }] },
  { name: "Redwood Gateway Freight", status: "Reviewing Quotation", assessment: "Under Assessment", quotes: [{ ...SEA_DDP, original_amount: 10150, rate_valid_until: day(25) }] },
  { name: "Mekong Star Logistics", status: "Negotiation", assessment: "Under Assessment", quotes: [{ ...SEA_DDP, original_amount: 10600, rate_valid_until: day(21) }] },
  { name: "Busan Pacific Lines", status: "Reviewing Quotation", assessment: "Under Assessment", quotes: [{ ...SEA_DDP, incoterm: "DDU (legacy term)", original_amount: 8700, rate_valid_until: day(20) }] },
  { name: "Orient Link Express", status: "Reviewing Quotation", assessment: "Under Assessment", quotes: [{ ...SEA_DDP, incoterm: "DDU (legacy term)", original_amount: 8950, rate_valid_until: day(17) }] },
  { name: "Swift Tide Cargo", status: "Unfit", assessment: "Unfit", quotes: [{ ...SEA_DDP, original_amount: 8300, rate_valid_until: day(15) }] },
  { name: "Golden Lantern Shipping", status: "Do Not Contact", assessment: "Unfit", quotes: [{ ...SEA_DDP, original_amount: 9100, rate_valid_until: day(12) }] },
  { name: "Anchor Point Forwarding", status: "Withdrawn / No Response", assessment: null, quotes: [{ ...SEA_DDP, original_amount: 9950, rate_valid_until: day(-6) }] },
  { name: "SkyHarbor Air & Sea", status: "Withdrawn / No Response", assessment: null, quotes: [{ shipment_mode: "Air", shipment_type: "Air Freight", incoterm: "DDP", original_amount: 21500, rate_valid_until: day(5) }] },
  { name: "Quiet Harbor Agents", status: "Potential / Not Contacted", assessment: null, quotes: [] },
];

export function forwarderId(i: number): string {
  return `00000000-0000-4000-8000-0000000f${String(i).padStart(4, "0")}`;
}

export function forwarderRows(list: F[] = FORWARDERS): Record<string, unknown>[] {
  return list.map((f, i) => ({
    id: forwarderId(i),
    forwarder_project_id: "00000000-0000-4000-8000-000000000401",
    created_at: "2026-09-02T00:00:00Z",
    updated_at: "2026-10-02T00:00:00Z",
    company_name: f.name,
    website: `https://www.zzleakweb${i}.example`,
    headquarters: `ZZLEAKHQCity${i}`,
    footprint: leak("footprint"),
    contact_person: leak("contactperson"),
    contact_position: leak("contactposition"),
    email: `zzleakmail${i}@zzleakdomain${i}.example`,
    phone: "+1 555 0100",
    origin_coverage: leak("origincoverage"),
    destination_coverage: leak("destinationcoverage"),
    other_services: leak("otherservices"),
    air_freight: true,
    sea_freight: true,
    road_freight: false,
    fcl: true,
    lcl: true,
    courier_express: false,
    customs_brokerage: true,
    cargo_insurance: false,
    door_to_door: true,
    port_to_port: true,
    customs_import_assistance: true,
    status: f.status,
    assessment: f.assessment ?? null,
    next_action: leak("nextaction"),
    key_notes: leak("keynotes"),
  }));
}

export function quoteRows(list: F[] = FORWARDERS): Record<string, unknown>[] {
  return list.flatMap((f, i) =>
    f.quotes.map((q, j) => ({
      id: `00000000-0000-4000-8000-00000000${String(i).padStart(2, "0")}${String(j).padStart(2, "0")}`,
      forwarder_id: forwarderId(i),
      created_at: "2026-09-20T00:00:00Z",
      updated_at: "2026-09-20T00:00:00Z",
      scenario_group: leak("scenario"),
      origin: leak("quoteorigin"),
      destination: leak("quotedestination"),
      actual_weight_kg: 9500,
      chargeable_weight_kg: 9500,
      cbm: 58,
      cost_of_goods_usd: 60000,
      original_currency: "USD",
      exchange_rate_to_usd: 1,
      duties_taxes_usd: null,
      other_charges_usd: null,
      other_charges_description: leak("otherchargesdescription"),
      lead_time_min_days: null,
      lead_time_max_days: null,
      quote_completeness: "Complete / Comparable",
      quote_date: "2026-09-20",
      quote_reference: leak("quotereference"),
      key_strength: leak("keystrength"),
      key_weakness_risk: leak("keyweakness"),
      important_assumption: leak("assumption"),
      overall_assessment: "Under Assessment",
      client_decision: "Pending",
      notes: leak("quotenotes"),
      exchange_rate_source: null,
      exchange_rate_date: null,
      forwarders: { forwarder_project_id: "00000000-0000-4000-8000-000000000401" },
      ...q,
    })),
  );
}

// ---- 3PL project -------------------------------------------------------------

export function threePlProjectRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "00000000-0000-4000-8000-000000000301",
    owner_id: "00000000-0000-4000-8000-0000000000a1",
    client_id: "00000000-0000-4000-8000-00000000c001",
    date_created: "2026-09-01T00:00:00Z",
    status: "Active",
    target_geography: "US East Coast + Texas",
    benchmark_period: leak("benchmark"),
    avg_monthly_orders: 1200,
    peak_monthly_orders: 1800,
    latest_month_orders: 1100,
    avg_monthly_units: 3000,
    peak_monthly_units: 4200,
    core_cost_categories: leak("corecost"),
    main_decision_focus: leak("decisionfocus"),
    key_capability_needs: leak("capabilityneeds"),
    tech_integration_requirement: leak("techintegration"),
    special_handling_requirement: leak("specialhandling"),
    fixed_comparison_principle: leak("comparisonprinciple"),
    important_limitation: leak("limitation"),
    assumptions_data_limitations: leak("assumptions"),
    updated_at: "2026-10-01T00:00:00Z",
    summary_notes: leak("summarynotes"),
    contract_period_months: 24,
    clients: { name: "Fixture Coffee", business_model: "B2C" },
    ...overrides,
  };
}

type P = { name: string; status: string; incumbent?: boolean; costs?: Record<string, number>; currency?: string };

export const PROVIDERS: P[] = [
  { name: "Current Warehouse Co", status: "Baseline", incumbent: true, costs: { storage_cost: 20, pick_pack_cost: 3, receiving_cost: 2 } },
  { name: "Harborline Fulfillment", status: "Shortlisted", costs: { storage_cost: 17, pick_pack_cost: 2.6, receiving_cost: 1.6 } },
  { name: "Keystone 3PL", status: "Vetted", costs: { storage_cost: 18, pick_pack_cost: 2.8, receiving_cost: 1.9 } },
  { name: "Atlas Commerce Logistics", status: "Shortlisted", costs: { storage_cost: 19, pick_pack_cost: 2.9, receiving_cost: 2 } },
  { name: "Riverbend Warehousing", status: "Reviewing Quotation", costs: { storage_cost: 21, pick_pack_cost: 3.1, receiving_cost: 2 } },
  { name: "Granite State Logistics", status: "Unfit", costs: { storage_cost: 10, pick_pack_cost: 1, receiving_cost: 1 } },
  { name: "Metro Parcel Works", status: "Withdrawn / No Response" },
  { name: "Blacklist Freight Hub", status: "Do not Contact", costs: { storage_cost: 12, pick_pack_cost: 2, receiving_cost: 1 } },
  { name: "Waiting Room Logistics", status: "Waiting for Quotation" },
  { name: "Never Called Inc", status: "Potential / Not Contacted" },
];

export function providerId(i: number): string {
  return `00000000-0000-4000-8000-0000000e${String(i).padStart(4, "0")}`;
}

export function providerRows(list: P[] = PROVIDERS): Record<string, unknown>[] {
  return list.map((p, i) => ({
    id: providerId(i),
    three_pl_project_id: "00000000-0000-4000-8000-000000000301",
    company_name: p.name,
    website: `https://www.zzleak3pl${i}.example`,
    contact_person: leak("3plcontact"),
    email: `zzleak3pl${i}@zzleak3pldomain.example`,
    phone: "+1 555 0101",
    location: `Shippingtown ${i}, ST`,
    notes: leak("3plnotes"),
    status: p.status,
    created_at: "2026-09-02T00:00:00Z",
    provider_type: leak("providertype"),
    footprint_source: leak("footprintsource"),
    receiving: true,
    storage: true,
    fulfillment: true,
    dispatch: true,
    onboarding_period_months: 2,
    virtual_tour_url: `https://tour.zzleak${i}.example`,
    billing_terms: leak("billingterms"),
    other_specialization: leak("specialization"),
    b2b: false,
    b2c: true,
    is_incumbent: p.incumbent ?? false,
    storage_cost: null,
    pick_pack_cost: null,
    receiving_cost: null,
    returns_cost: null,
    system_setup_cost: null,
    inventory_on_request_cost: null,
    adhoc_bundling_kitting_cost: null,
    adhoc_labelling_cost: null,
    b2b_pick_pack_cost: null,
    ...(p.costs ?? {}),
    key_strength: leak("3plstrength"),
    key_weakness_risk: leak("3plweakness"),
    important_assumption: leak("3plassumption"),
    overall_assessment: leak("3plassessment"),
    client_decision: leak("3pldecision"),
    source_basis: leak("sourcebasis"),
    next_action: leak("3plnextaction"),
    key_notes: leak("3plkeynotes"),
    updated_at: "2026-10-02T00:00:00Z",
    returns: false,
    assessment_status: "Fit",
    currency: p.currency ?? "USD",
  }));
}

export function recommendationRow(): Record<string, unknown> {
  return {
    id: "00000000-0000-4000-8000-0000000000e9",
    three_pl_project_id: "00000000-0000-4000-8000-000000000301",
    priority: "Cost Savings",
    provider_id_1: providerId(1),
    provider_id_2: providerId(3),
    provider_id_3: providerId(2),
    generated_at: "2026-10-01T00:00:00Z",
  };
}

// ---- Form inputs ---------------------------------------------------------------

export function inputs(overrides: Partial<PublishInputs> = {}): PublishInputs {
  return {
    stage: 5,
    headline: "Your forwarder recommendation is ready",
    summary: "We compared every like-for-like quote.",
    nextStep: "Your decision",
    nextStepDue: "2026-10-17",
    needsClientAction: true,
    milestones: [
      { label: "Quotes due", planned: "2026-10-01", actual: "2026-10-03" },
      { label: "Decision", planned: "2026-10-17", actual: null },
    ],
    partnerIds: [],
    recommendedId: null,
    reasons: ["Lowest like-for-like price", "Weekly sailings"],
    tradeOffs: ["Insurance is extra"],
    basedOn: "You told us cost matters most.",
    sections: { funnel: true, cost: true, leadTime: true, fcr: true, validity: true },
    includeAnnual: false,
    contactEmail: "team@move.example",
    ...overrides,
  };
}

export const PEOPLE = { authorFirstName: "Beah", ownerFirstName: "Beah" };

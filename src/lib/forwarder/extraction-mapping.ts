import { cleanExtractedText } from "@/lib/document-extraction";
import type { ExtractedQuoteFields } from "./merge-quote-fields";
import type { ExtractedForwarderFields } from "./merge-forwarder-fields";
import type { ExtractedForwarderProjectFields } from "./merge-project-fields";
import { CAPABILITY_FIELDS } from "./forwarder-fields";
import { canonicalizeScenarioGroup, pickDate } from "./quote-extraction";
import {
  BROKERAGE_OPTIONS,
  CURRENCIES,
  INCOTERMS,
  INSURANCE_OPTIONS,
  SHIPMENT_MODES,
  SHIPMENT_TYPES,
  STACKABLE_OPTIONS,
  YES_NO,
} from "./project-fields";

// Turns each forwarder extraction tool's raw output (quote, forwarder,
// forwarder project) into form values: text through cleanExtractedText,
// option fields only when they're an allowed value. Moved out of the
// "use server" action files unchanged so it can be unit tested.

export function pickEnum<T extends string>(
  value: string | undefined,
  options: readonly T[],
): T | null {
  return value !== undefined && (options as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

// ---- Quote ------------------------------------------------------------------

export type ExtractedQuoteIntake = {
  scenario_group?: string;
  shipment_mode?: string;
  shipment_type?: string;
  origin?: string;
  destination?: string;
  incoterm?: string;
  actual_weight_kg?: number;
  chargeable_weight_kg?: number;
  cbm?: number;
  cost_of_goods_usd?: number;
  original_currency?: string;
  original_amount?: number;
  exchange_rate_to_usd?: number;
  duties_taxes_usd?: number;
  other_charges_usd?: number;
  other_charges_description?: string;
  lead_time_min_days?: number;
  lead_time_max_days?: number;
  quote_date?: string;
  rate_valid_until?: string;
  quote_reference?: string;
};

export function toExtractedQuoteFields(
  extracted: ExtractedQuoteIntake,
  existingScenarioGroups: string[],
): ExtractedQuoteFields {
  // original_currency/exchange_rate_to_usd are non-nullable columns (the
  // schema defaults them to "USD"/1 when blank), so Partial<QuoteFields>
  // types them as `| undefined`, not `| null` — undefined is what
  // mergeScalarField treats as "no info" either way.
  const originalCurrency = pickEnum(extracted.original_currency, CURRENCIES) ?? undefined;

  return {
    scenario_group: canonicalizeScenarioGroup(
      extracted.scenario_group,
      existingScenarioGroups,
    ),
    shipment_mode: pickEnum(extracted.shipment_mode, SHIPMENT_MODES),
    shipment_type: pickEnum(extracted.shipment_type, SHIPMENT_TYPES),
    origin: cleanExtractedText(extracted.origin) ?? null,
    destination: cleanExtractedText(extracted.destination) ?? null,
    incoterm: pickEnum(extracted.incoterm, INCOTERMS),

    actual_weight_kg: extracted.actual_weight_kg ?? null,
    chargeable_weight_kg: extracted.chargeable_weight_kg ?? null,
    cbm: extracted.cbm ?? null,
    cost_of_goods_usd: extracted.cost_of_goods_usd ?? null,

    original_currency: originalCurrency,
    original_amount: extracted.original_amount ?? null,
    // USD short-circuit: a USD quote's rate is definitionally 1, so any rate
    // the model attached to a USD quote is discarded outright rather than
    // shown — there is no legitimate non-1 rate for a USD-denominated quote,
    // and this removes a whole class of hallucination deterministically
    // rather than relying on the prompt alone.
    exchange_rate_to_usd:
      originalCurrency === "USD" ? undefined : extracted.exchange_rate_to_usd ?? undefined,

    duties_taxes_usd: extracted.duties_taxes_usd ?? null,
    other_charges_usd: extracted.other_charges_usd ?? null,
    other_charges_description:
      cleanExtractedText(extracted.other_charges_description) ?? null,

    lead_time_min_days: extracted.lead_time_min_days ?? null,
    lead_time_max_days: extracted.lead_time_max_days ?? null,
    quote_date: pickDate(extracted.quote_date),
    rate_valid_until: pickDate(extracted.rate_valid_until),
    quote_reference: cleanExtractedText(extracted.quote_reference) ?? null,
  };
}

// ---- Forwarder --------------------------------------------------------------

export type ExtractedForwarderIntake = {
  company_name?: string;
  website?: string;
  headquarters?: string;
  footprint?: string;
  contact_person?: string;
  contact_position?: string;
  email?: string;
  phone?: string;
  origin_coverage?: string;
  destination_coverage?: string;
  other_services?: string;
} & Partial<Record<(typeof CAPABILITY_FIELDS)[number]["name"], boolean>>;

export function toExtractedForwarderFields(
  extracted: ExtractedForwarderIntake,
): ExtractedForwarderFields {
  const fields: ExtractedForwarderFields = {
    website: cleanExtractedText(extracted.website) ?? null,
    headquarters: cleanExtractedText(extracted.headquarters) ?? null,
    footprint: cleanExtractedText(extracted.footprint) ?? null,
    contact_person: cleanExtractedText(extracted.contact_person) ?? null,
    contact_position: cleanExtractedText(extracted.contact_position) ?? null,
    email: cleanExtractedText(extracted.email) ?? null,
    phone: cleanExtractedText(extracted.phone) ?? null,
    origin_coverage: cleanExtractedText(extracted.origin_coverage) ?? null,
    destination_coverage:
      cleanExtractedText(extracted.destination_coverage) ?? null,
    other_services: cleanExtractedText(extracted.other_services) ?? null,
  };

  for (const capability of CAPABILITY_FIELDS) {
    const value = extracted[capability.name];
    if (typeof value === "boolean") {
      fields[capability.name] = value;
    }
  }

  return fields;
}

// ---- Forwarder project ------------------------------------------------------

export type ExtractedProjectIntake = {
  client_name?: string;
  business_model?: string;
  origin_country?: string;
  origin_city?: string;
  origin_port?: string;
  destination_country?: string;
  destination_city?: string;
  destination_port?: string;
  final_delivery_address?: string;
  cargo_description?: string;
  packaging_type?: string;
  units?: number;
  cartons?: number;
  pallets?: number;
  weight_kg?: number;
  cbm?: number;
  stackable?: string;
  dangerous_goods?: string;
  temperature_controlled?: string;
  special_handling?: string;
  packing_list_available?: string;
  packing_list_reference?: string;
  packing_list_notes?: string;
  current_incoterm?: string;
  shipment_mode?: string;
  shipment_type?: string;
  current_freight_cost_usd?: number;
  current_freight_forwarder?: string;
  current_lead_time_days?: number;
  shipments_per_month?: number;
  shipments_per_year?: number;
  incoterms_to_compare?: string[];
  final_incoterm?: string;
  final_shipment_mode?: string;
  final_shipment_type?: string;
  target_lead_time_days?: number;
  hs_code?: string;
  invoice_value?: number;
  invoice_currency?: string;
  insurance_required?: string;
  brokerage_needed?: string;
};

export function toForwarderProjectFields(
  extracted: ExtractedProjectIntake,
): ExtractedForwarderProjectFields {
  return {
    origin_country: cleanExtractedText(extracted.origin_country) ?? null,
    origin_city: cleanExtractedText(extracted.origin_city) ?? null,
    origin_port: cleanExtractedText(extracted.origin_port) ?? null,
    destination_country: cleanExtractedText(extracted.destination_country) ?? null,
    destination_city: cleanExtractedText(extracted.destination_city) ?? null,
    destination_port: cleanExtractedText(extracted.destination_port) ?? null,
    final_delivery_address:
      cleanExtractedText(extracted.final_delivery_address) ?? null,

    cargo_description: cleanExtractedText(extracted.cargo_description) ?? null,
    packaging_type: cleanExtractedText(extracted.packaging_type) ?? null,
    units: extracted.units ?? null,
    cartons: extracted.cartons ?? null,
    pallets: extracted.pallets ?? null,
    weight_kg: extracted.weight_kg ?? null,
    cbm: extracted.cbm ?? null,
    stackable: pickEnum(extracted.stackable, STACKABLE_OPTIONS),
    dangerous_goods: pickEnum(extracted.dangerous_goods, YES_NO),
    temperature_controlled: pickEnum(extracted.temperature_controlled, YES_NO),
    special_handling: cleanExtractedText(extracted.special_handling) ?? null,

    packing_list_available: pickEnum(extracted.packing_list_available, YES_NO),
    packing_list_reference:
      cleanExtractedText(extracted.packing_list_reference) ?? null,
    packing_list_notes: cleanExtractedText(extracted.packing_list_notes) ?? null,

    current_incoterm: pickEnum(extracted.current_incoterm, INCOTERMS),
    shipment_mode: pickEnum(extracted.shipment_mode, SHIPMENT_MODES),
    shipment_type: pickEnum(extracted.shipment_type, SHIPMENT_TYPES),
    current_freight_cost_usd: extracted.current_freight_cost_usd ?? null,
    current_freight_forwarder:
      cleanExtractedText(extracted.current_freight_forwarder) ?? null,
    current_lead_time_days: extracted.current_lead_time_days ?? null,

    shipments_per_month: extracted.shipments_per_month ?? null,
    shipments_per_year: extracted.shipments_per_year ?? null,

    incoterms_to_compare: extracted.incoterms_to_compare
      ? INCOTERMS.filter((term) => extracted.incoterms_to_compare!.includes(term))
      : undefined,
    final_incoterm: pickEnum(extracted.final_incoterm, INCOTERMS),
    final_shipment_mode: pickEnum(extracted.final_shipment_mode, SHIPMENT_MODES),
    final_shipment_type: pickEnum(extracted.final_shipment_type, SHIPMENT_TYPES),
    target_lead_time_days: extracted.target_lead_time_days ?? null,

    hs_code: cleanExtractedText(extracted.hs_code) ?? null,
    invoice_value: extracted.invoice_value ?? null,
    invoice_currency: pickEnum(extracted.invoice_currency, CURRENCIES),
    insurance_required: pickEnum(extracted.insurance_required, INSURANCE_OPTIONS),
    brokerage_needed: pickEnum(extracted.brokerage_needed, BROKERAGE_OPTIONS),
  };
}

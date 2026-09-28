import {
  BROKERAGE_OPTIONS,
  CURRENCIES,
  INCOTERMS,
  INSURANCE_OPTIONS,
  STACKABLE_OPTIONS,
  YES_NO,
} from "./project-fields";
import type { ForwarderProjectFields } from "./parse-project-form";

// Section layout for a forwarder project's fields, shared by the intake form
// and the Project Summary page so both always show the same grouping.

type FieldName = keyof ForwarderProjectFields;

export type ProjectField =
  | { kind: "text" | "textarea"; name: FieldName; label: string }
  | { kind: "integer"; name: FieldName; label: string }
  // step is the column's scale (numeric(p, s)), e.g. "0.001" for kg.
  | { kind: "decimal"; name: FieldName; label: string; step: string }
  // A money amount; currency is a fixed code or the field holding it.
  | {
      kind: "money";
      name: FieldName;
      label: string;
      currency: "USD" | { field: FieldName };
    }
  | { kind: "select"; name: FieldName; label: string; options: readonly string[] }
  | { kind: "mode"; name: FieldName; label: string }
  // A shipment type, narrowed by the mode in modeField.
  | { kind: "type"; name: FieldName; label: string; modeField: FieldName }
  | { kind: "multi"; name: FieldName; label: string; options: readonly string[] };

export type ProjectSection = {
  title: string;
  description?: string;
  fields: ProjectField[];
};

export const PROJECT_SECTIONS: ProjectSection[] = [
  {
    title: "Route",
    fields: [
      { kind: "text", name: "origin_country", label: "Origin Country" },
      { kind: "text", name: "origin_city", label: "Origin City" },
      { kind: "text", name: "origin_port", label: "Origin Port" },
      { kind: "text", name: "destination_country", label: "Destination Country" },
      { kind: "text", name: "destination_city", label: "Destination City" },
      { kind: "text", name: "destination_port", label: "Destination Port" },
      { kind: "textarea", name: "final_delivery_address", label: "Final Delivery Address" },
    ],
  },
  {
    title: "Cargo",
    fields: [
      { kind: "textarea", name: "cargo_description", label: "Cargo Description" },
      { kind: "text", name: "packaging_type", label: "Packaging Type" },
      { kind: "integer", name: "units", label: "Units" },
      { kind: "integer", name: "cartons", label: "Cartons" },
      { kind: "integer", name: "pallets", label: "Pallets" },
      { kind: "decimal", name: "weight_kg", label: "Weight (kg)", step: "0.001" },
      { kind: "decimal", name: "cbm", label: "Volume (CBM)", step: "0.000001" },
      { kind: "select", name: "stackable", label: "Stackable", options: STACKABLE_OPTIONS },
      { kind: "select", name: "dangerous_goods", label: "Dangerous Goods", options: YES_NO },
      {
        kind: "select",
        name: "temperature_controlled",
        label: "Temperature Controlled",
        options: YES_NO,
      },
      { kind: "textarea", name: "special_handling", label: "Special Handling" },
    ],
  },
  {
    title: "Packing List",
    fields: [
      {
        kind: "select",
        name: "packing_list_available",
        label: "Packing List Available",
        options: YES_NO,
      },
      { kind: "text", name: "packing_list_reference", label: "Packing List Reference" },
      { kind: "textarea", name: "packing_list_notes", label: "Packing List Notes" },
    ],
  },
  {
    title: "Current Shipping",
    description: "How the client ships today — the baseline that savings are measured against.",
    fields: [
      { kind: "select", name: "current_incoterm", label: "Current Incoterm", options: INCOTERMS },
      { kind: "mode", name: "shipment_mode", label: "Current Shipment Mode" },
      {
        kind: "type",
        name: "shipment_type",
        label: "Current Shipment Type",
        modeField: "shipment_mode",
      },
      {
        kind: "money",
        name: "current_freight_cost_usd",
        label: "Current Freight Cost (USD)",
        currency: "USD",
      },
      { kind: "text", name: "current_freight_forwarder", label: "Current Freight Forwarder" },
      {
        kind: "decimal",
        name: "current_lead_time_days",
        label: "Current Lead Time (days)",
        step: "0.1",
      },
    ],
  },
  {
    title: "Shipment Volume",
    description: "Used for annual estimates. If both are set, shipments per year is used.",
    fields: [
      {
        kind: "decimal",
        name: "shipments_per_month",
        label: "Shipments per Month",
        step: "0.01",
      },
      { kind: "decimal", name: "shipments_per_year", label: "Shipments per Year", step: "0.01" },
    ],
  },
  {
    title: "Target Terms",
    description: "The terms quotes are compared and ranked on.",
    fields: [
      {
        kind: "multi",
        name: "incoterms_to_compare",
        label: "Incoterms to Compare",
        options: INCOTERMS,
      },
      { kind: "select", name: "final_incoterm", label: "Final Incoterm", options: INCOTERMS },
      { kind: "mode", name: "final_shipment_mode", label: "Final Shipment Mode" },
      {
        kind: "type",
        name: "final_shipment_type",
        label: "Final Shipment Type",
        modeField: "final_shipment_mode",
      },
      {
        kind: "decimal",
        name: "target_lead_time_days",
        label: "Target Lead Time (days)",
        step: "0.1",
      },
    ],
  },
  {
    title: "Customs & Value",
    fields: [
      { kind: "text", name: "hs_code", label: "HS Code" },
      {
        kind: "money",
        name: "invoice_value",
        label: "Invoice Value",
        currency: { field: "invoice_currency" },
      },
      { kind: "select", name: "invoice_currency", label: "Invoice Currency", options: CURRENCIES },
      {
        kind: "select",
        name: "insurance_required",
        label: "Insurance Required",
        options: INSURANCE_OPTIONS,
      },
      {
        kind: "select",
        name: "brokerage_needed",
        label: "Brokerage Needed",
        options: BROKERAGE_OPTIONS,
      },
    ],
  },
];

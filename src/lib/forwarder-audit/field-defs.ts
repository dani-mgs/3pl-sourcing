import { CLIENT_ROLES, CONTAINER_TYPES, INCOTERMS, MODES, ROUTE_MATCHES, YES_NO, YES_NO_UNKNOWN } from "./lists";
import type { QuotationInputs, ShipmentInputs } from "./types";

// The labels, kinds and dropdowns of sections 1 and 2, in the workbook's
// order (two columns: left then right), as the editor renders them.

export type FieldDef<T> = {
  key: keyof T & string;
  label: string;
  kind: "text" | "textarea" | "number" | "date" | "select";
  options?: readonly string[];
  hint?: string;
};

export const SHIPMENT_FIELDS: FieldDef<ShipmentInputs>[] = [
  { key: "auditReference", label: "Audit reference", kind: "text" },
  { key: "auditDate", label: "Audit date", kind: "date" },
  { key: "client", label: "Client", kind: "text" },
  { key: "clientRole", label: "Client role in the sale", kind: "select", options: CLIENT_ROLES },
  { key: "incoterm", label: "Commercial Incoterm", kind: "select", options: INCOTERMS, hint: "Exactly as on the commercial invoice." },
  { key: "namedPlace", label: "Named place", kind: "text" },
  { key: "portOfLoading", label: "Port / airport of loading", kind: "text" },
  { key: "portOfDischarge", label: "Port / airport of discharge", kind: "text" },
  { key: "pickupAddress", label: "Pickup address", kind: "text" },
  { key: "deliveryAddress", label: "Delivery address", kind: "text" },
  { key: "cargoReadyDate", label: "Cargo ready date", kind: "date" },
  { key: "commodity", label: "Commodity", kind: "text" },
  { key: "hsCode", label: "HS code", kind: "text" },
  { key: "goodsValue", label: "Goods value (from CI)", kind: "number" },
  { key: "goodsValueCurrency", label: "Goods value currency", kind: "text" },
  { key: "pieces", label: "Pieces", kind: "number" },
  { key: "cartons", label: "Cartons (count)", kind: "number" },
  { key: "pallets", label: "Pallets (count; 0 if none)", kind: "number" },
  { key: "grossWeightKg", label: "Gross weight (kg)", kind: "number" },
  { key: "volumeCbm", label: "Volume as shipped (CBM)", kind: "number" },
  { key: "packageDimensions", label: "Package / pallet dimensions", kind: "textarea" },
  { key: "stackable", label: "Stackable", kind: "select", options: YES_NO_UNKNOWN },
  { key: "woodPackaging", label: "Wood packaging", kind: "select", options: YES_NO_UNKNOWN },
  { key: "specialCargo", label: "Special cargo (DG, oversize, overweight)", kind: "select", options: YES_NO },
  { key: "commercialInvoiceReceived", label: "Commercial invoice received", kind: "select", options: YES_NO },
  { key: "packingListReceived", label: "Packing list received", kind: "select", options: YES_NO },
  { key: "rateAgreementProvided", label: "Rate agreement / contract provided", kind: "select", options: YES_NO },
  { key: "quotationItemised", label: "Quotation itemised (line by line)", kind: "select", options: YES_NO },
  { key: "preferentialOrigin", label: "Preferential origin certificate (e.g. Form E)", kind: "select", options: YES_NO_UNKNOWN },
  { key: "importLicenceConfirmed", label: "Import licence / customs regime confirmed", kind: "select", options: YES_NO_UNKNOWN },
  { key: "preparedBy", label: "Prepared by", kind: "text" },
  { key: "plVolumeCoversAll", label: "PL volume covers all cargo?", kind: "select", options: YES_NO_UNKNOWN },
];

export const QUOTATION_FIELDS: FieldDef<QuotationInputs>[] = [
  { key: "forwarder", label: "Forwarder", kind: "text" },
  { key: "quotationReference", label: "Quotation reference", kind: "text" },
  { key: "quotationSource", label: "Quotation source and date", kind: "text" },
  { key: "freightValidUntil", label: "Freight valid until", kind: "date" },
  { key: "currency", label: "Quotation currency", kind: "text", hint: "A code such as USD." },
  { key: "mode", label: "Mode", kind: "select", options: MODES },
  { key: "containers", label: "Containers (quantity)", kind: "number" },
  { key: "containerType", label: "Container type", kind: "select", options: CONTAINER_TYPES },
  { key: "quotedTerm", label: "Quoted term as written", kind: "text" },
  { key: "routing", label: "Routing (direct / via)", kind: "text" },
  { key: "transitTime", label: "Transit time", kind: "text" },
  { key: "freeTimeDays", label: "Free time at destination (days)", kind: "text" },
  { key: "loadPlanConfirmed", label: "Load plan confirmed by forwarder", kind: "select", options: YES_NO },
  { key: "routeMatchesRequest", label: "Quoted route matches the request", kind: "select", options: ROUTE_MATCHES },
  { key: "airDivisor", label: "Air divisor stated (cm3/kg)", kind: "number" },
  { key: "statedTotal", label: "Forwarder's stated total", kind: "number" },
  { key: "otherCurrency1", label: "Other currency 1 (code)", kind: "text" },
  { key: "otherCurrency1Rate", label: "Rate: 1 unit = ? quote currency", kind: "number" },
  { key: "otherCurrency2", label: "Other currency 2 (code)", kind: "text" },
  { key: "otherCurrency2Rate", label: "Rate: 1 unit = ? quote currency", kind: "number" },
  { key: "originChargesValidUntil", label: "Origin charges valid until", kind: "date", hint: "Blank = Not Confirmed." },
  { key: "destinationChargesValidUntil", label: "Destination charges valid until", kind: "date", hint: "Blank = Not Confirmed." },
];

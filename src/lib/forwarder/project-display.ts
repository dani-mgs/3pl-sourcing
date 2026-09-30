import { formatCurrency } from "@/lib/currency";
import type { ProjectField } from "./project-sections";

type Row = Record<string, unknown>;

function place(city: unknown, country: unknown): string | null {
  const parts = [city, country].filter(
    (part): part is string => typeof part === "string" && part.trim() !== "",
  );
  return parts.length ? parts.join(", ") : null;
}

// "Shenzhen, China → Los Angeles, United States", or null when neither end
// is filled in.
export function routeLabel(row: Row): string | null {
  const origin = place(row.origin_city, row.origin_country);
  const destination = place(row.destination_city, row.destination_country);
  if (!origin && !destination) return null;
  return `${origin ?? "—"} → ${destination ?? "—"}`;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

// "Ho Chi Minh City → Long Beach" for page headers and breadcrumbs; falls
// back to the country when a city isn't set. routeLabel above is the longer
// "city, country" version.
export function shortRouteLabel(row: Row): string | null {
  const origin = text(row.origin_city) ?? text(row.origin_country);
  const destination = text(row.destination_city) ?? text(row.destination_country);
  if (!origin && !destination) return null;
  return `${origin ?? "—"} → ${destination ?? "—"}`;
}

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });

// Display text for one field on the Project Summary; "—" when empty.
export function formatProjectValue(field: ProjectField, row: Row): string {
  const value = row[field.name];
  if (value == null || value === "") return "—";

  switch (field.kind) {
    case "multi":
      return Array.isArray(value) && value.length ? value.join(", ") : "—";
    case "integer":
    case "decimal":
      return numberFormat.format(Number(value));
    case "money": {
      const currency =
        field.currency === "USD" ? "USD" : (row[field.currency.field] as string | null);
      return currency
        ? formatCurrency(Number(value), currency)
        : new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
    }
    default:
      return String(value);
  }
}

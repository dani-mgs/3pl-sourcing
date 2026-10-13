import { z } from "zod";
import { findIdentifying, type PartnerIdentity } from "./market-report-guard";
import { REGIONS, SIZE_BANDS, TAKE_MAX, type Region, type SizeBand } from "./market-report-schema";

// The "Publish Market Report" form: which shortlisted partner is
// recommended, and for each partner a size band, a region (both from fixed
// lists) and the optional "Move's take". Stored with the report (staff-only)
// to prefill the next one. The browser never sends figures.

export type PartnerInput = { size: SizeBand | null; region: Region | null; take: string | null };
export type ReportInputs = { recommendedId: string | null; partners: Record<string, PartnerInput> };

export const IDENTIFYING_TAKE_NOTE =
  "Write “Move’s take” as if the partner could read it. Don’t mention anything that could identify them.";

const storedSchema = z.object({
  recommendedId: z.string().nullable().catch(null),
  partners: z
    .record(
      z.string(),
      z.object({
        size: z.enum(SIZE_BANDS).nullable().catch(null),
        region: z.enum(REGIONS).nullable().catch(null),
        take: z.string().max(TAKE_MAX).nullable().catch(null),
      }),
    )
    .catch({}),
});

// Inputs saved with an earlier report, if they still read.
export function storedInputs(value: unknown): ReportInputs | null {
  const parsed = storedSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

export type ParseResult = { ok: true; data: ReportInputs } | { ok: false; error: string };

// partnerIds: every partner in the report; shortlistIds: those that may be
// recommended; identities: every forwarder in the project (for the guard).
export function parseReportForm(
  formData: FormData,
  partnerIds: string[],
  shortlistIds: string[],
  identities: PartnerIdentity[],
): ParseResult {
  const recommended = field(formData, "recommended");
  if (recommended && !shortlistIds.includes(recommended)) {
    return { ok: false, error: "Only a shortlisted partner can be recommended. Reload the page and choose again." };
  }
  const nameOf = new Map(identities.map((p) => [p.id, p.company_name]));
  const partners: Record<string, PartnerInput> = {};
  for (const id of partnerIds) {
    const size = field(formData, `size:${id}`);
    const region = field(formData, `region:${id}`);
    const take = field(formData, `take:${id}`).replace(/\s+/g, " ");
    if (size && !(SIZE_BANDS as readonly string[]).includes(size)) return { ok: false, error: "Choose a size from the list." };
    if (region && !(REGIONS as readonly string[]).includes(region)) return { ok: false, error: "Choose a region from the list." };
    if (take.length > TAKE_MAX) {
      return { ok: false, error: `Move's take for ${nameOf.get(id)} is too long (${TAKE_MAX} characters at most).` };
    }
    if (take) {
      const hit = findIdentifying(take, identities);
      if (hit) {
        return {
          ok: false,
          error:
            "internalWord" in hit
              ? `Move's take for ${nameOf.get(id)} uses an internal status word ("${hit.internalWord}"). Describe it in plain words instead.`
              : `Move's take for ${nameOf.get(id)} could identify ${hit.partnerName} ("${hit.token}"). Rewrite it without names, places, websites or contacts.`,
        };
      }
    }
    partners[id] = { size: (size || null) as SizeBand | null, region: (region || null) as Region | null, take: take || null };
  }
  return { ok: true, data: { recommendedId: recommended || null, partners } };
}

// ---- Prefill: fixed-vocabulary suggestions from internal free text -----------------
// Only the suggestion (a value from the fixed list) is used; the free text
// itself never leaves the server.

export function suggestSize(footprint: string | null): SizeBand | null {
  const first = (footprint ?? "").trim().toLowerCase();
  if (first.startsWith("small")) return "small";
  if (first.startsWith("mid")) return "mid_size";
  if (first.startsWith("large") || first.startsWith("regional")) return "large";
  if (first.startsWith("global")) return "global";
  return null;
}

const COUNTRY_REGION: Record<string, Region> = {
  vietnam: "southeast_asia",
  singapore: "southeast_asia",
  thailand: "southeast_asia",
  malaysia: "southeast_asia",
  indonesia: "southeast_asia",
  philippines: "southeast_asia",
  cambodia: "southeast_asia",
  china: "east_asia",
  "hong kong": "east_asia",
  taiwan: "east_asia",
  "south korea": "east_asia",
  korea: "east_asia",
  japan: "east_asia",
  india: "south_asia",
  bangladesh: "south_asia",
  pakistan: "south_asia",
  "sri lanka": "south_asia",
  "united states": "north_america",
  usa: "north_america",
  us: "north_america",
  canada: "north_america",
  mexico: "latin_america",
  brazil: "latin_america",
  portugal: "europe",
  spain: "europe",
  netherlands: "europe",
  germany: "europe",
  france: "europe",
  italy: "europe",
  "united kingdom": "europe",
  uk: "europe",
  uae: "middle_east",
  "united arab emirates": "middle_east",
  turkey: "middle_east",
  australia: "oceania",
  "new zealand": "oceania",
  "south africa": "africa",
};

export function suggestRegion(headquarters: string | null): Region | null {
  const parts = (headquarters ?? "").split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 0) return null;
  const last = parts.at(-1)!;
  if (COUNTRY_REGION[last]) return COUNTRY_REGION[last];
  // "Los Angeles, CA": a two-letter US state.
  if (parts.length > 1 && /^[a-z]{2}$/.test(last)) return "north_america";
  return COUNTRY_REGION[parts[0]] ?? null;
}

import { describe, expect, test } from "vitest";
import { findIdentifying, type PartnerIdentity } from "./market-report-guard";
import { parseReportForm, suggestRegion, suggestSize } from "./market-report-inputs";

// Like the demo seed: the website and email domain come from the name, the
// contact is a generic desk, except one with a real person.
function partner(id: string, name: string, hq: string, contact = "Ocean sales desk"): PartnerIdentity {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return { id, company_name: name, website: `https://www.${slug}.example`, headquarters: hq, email: `ocean@${slug}.example`, contact_person: contact };
}

const PARTNERS = [
  partner("a", "Pacific Bridge Logistics", "Singapore"),
  partner("b", "Meridian Ocean Logistics", "Hong Kong"),
  partner("c", "Mekong Star Logistics", "Can Tho, Vietnam", "Linh Tran"),
  { id: "d", company_name: "Orient Link Express", website: "orientlink-cargo.example", headquarters: "Shenzhen, China", email: "sales@olx-asia.example", contact_person: null },
];

describe("Move's take guard", () => {
  test.each([
    ["Strong on the Meridian lanes", "b", "meridian"],
    ["Great team in Shenzhen", "d", "shenzhen"],
    ["Like Pacific Bridge, weekly sailings", "a", "pacific"],
    ["Ask Linh about space", "c", "linh"],
    ["See pacificbridgelogistics.example", "a", "pacificbridgelogistics"],
    ["Booked via OLX-Asia before", "d", "olxasia"],
    ["Same people as orientlink cargo", "d", "orientlinkcargo"],
    ["Based in Hong Kong", "b", "hong kong"],
    ["Office in Can Tho", "c", "can tho"],
    ["MERIDIAN", "b", "meridian"],
  ])("refuses %j (identifies %s)", (take, id, token) => {
    expect(findIdentifying(take, PARTNERS)).toEqual({ partnerId: id, partnerName: PARTNERS.find((p) => p.id === id)!.company_name, token });
  });

  test("names any partner in the project, not only the row's own", () => {
    expect(findIdentifying("Cheaper than Mekong", PARTNERS)).toMatchObject({ partnerId: "c" });
  });

  test.each(["Unfit for this lane", "Was on our do not contact list", "Withdrawn after the first quote", "Vetted twice"])(
    "refuses internal status words: %j",
    (take) => {
      expect(findIdentifying(take, PARTNERS)).toHaveProperty("internalWord");
    },
  );

  test.each([
    "Lowest comparable price; weekly sailings",
    "Good ocean coverage and an in-house customs team",
    "Sales desk replies within a day",
    "Global logistics network, slower transit",
    "Wider transit range",
    "Can deliver on weekends",
    "Kong-sized network",
  ])("allows plain descriptions: %j", (take) => {
    expect(findIdentifying(take, PARTNERS)).toBeNull();
  });
});

describe("parseReportForm", () => {
  const ids = ["a", "b", "c", "d"];
  function form(entries: Record<string, string>) {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) f.set(k, v);
    return f;
  }

  test("fixed vocabularies and an optional take", () => {
    const result = parseReportForm(form({ recommended: "a", "size:b": "global", "region:b": "east_asia", "take:b": "  Very  large carrier contracts " }), ids, ["a"], PARTNERS);
    expect(result).toEqual({
      ok: true,
      data: {
        recommendedId: "a",
        partners: {
          a: { size: null, region: null, take: null },
          b: { size: "global", region: "east_asia", take: "Very large carrier contracts" },
          c: { size: null, region: null, take: null },
          d: { size: null, region: null, take: null },
        },
      },
    });
  });

  test.each([
    [{ recommended: "b" }, /shortlisted partner/],
    [{ "size:b": "Huge" }, /size from the list/],
    [{ "region:b": "Vietnam" }, /region from the list/],
    [{ "take:b": "x".repeat(121) }, /too long/],
    [{ "take:c": "Same owner as Meridian" }, /could identify Meridian Ocean Logistics/],
    [{ "take:c": "Unfit, sadly" }, /internal status word/],
  ])("refuses %j", (entries, error) => {
    const result = parseReportForm(form(entries), ids, ["a"], PARTNERS);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(error);
  });

  test("suggestions come only from the fixed lists", () => {
    expect(suggestSize("Regional: 22 offices across Asia and the US")).toBe("large");
    expect(suggestSize("Mid-size: 8 offices")).toBe("mid_size");
    expect(suggestSize("Global: 140+ offices worldwide")).toBe("global");
    expect(suggestSize("lots of trucks")).toBeNull();
    expect(suggestRegion("Ho Chi Minh City, Vietnam")).toBe("southeast_asia");
    expect(suggestRegion("Long Beach, CA")).toBe("north_america");
    expect(suggestRegion("Hong Kong")).toBe("east_asia");
    expect(suggestRegion("Atlantis")).toBeNull();
  });
});

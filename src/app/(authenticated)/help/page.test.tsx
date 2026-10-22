import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

// /help follows LANDED_COST_ENABLED: on, the Landed Cost section, its
// contents link and the module's "Live" badge; off, none of them, and the
// module shows "Soon".

vi.mock("next/navigation", () => ({ usePathname: () => "/help", useRouter: () => ({}) }));
const { default: HelpPage } = await import("./page");

afterEach(() => vi.unstubAllEnvs());

function render(flag: string | undefined) {
  vi.stubEnv("LANDED_COST_ENABLED", flag);
  return renderToStaticMarkup(<HelpPage />);
}

// The module card's badge: the text that follows the module name.
const badgeOf = (html: string, name: string) =>
  html.match(new RegExp(`${name}<span[^>]*>(Live|Soon)</span>`))?.[1] ?? null;

describe("/help and the Landed Cost flag", () => {
  test("on: the section, its contents link, and the module listed as Live", () => {
    const html = render("true");
    expect(html).toContain('id="landed-cost"');
    expect(html).toContain('href="#landed-cost"');
    expect(badgeOf(html, "Landed Cost Calculator")).toBe("Live");
    expect(html).toContain("MPF and HMF are charged once per origin");
    expect(html).toContain("Lock this version");
    expect(html).toContain("Estimate for planning only. Rates and fees can change. Not customs or legal advice.");
    // The section sits right after the Tariff Calculator's.
    expect(html.indexOf('id="landed-cost"')).toBeGreaterThan(html.indexOf('id="tariff"'));
    expect(html.indexOf('id="landed-cost"')).toBeLessThan(html.indexOf('id="concepts"'));
  });

  test.each([["false"], [undefined]])("off (%s): no section, no contents link, the module shows Soon", (flag) => {
    const html = render(flag);
    expect(html).not.toContain('id="landed-cost"');
    expect(html).not.toContain('href="#landed-cost"');
    expect(html).not.toContain("Lock this version");
    expect(badgeOf(html, "Landed Cost Calculator")).toBe("Soon");
    // The other modules are unchanged.
    expect(badgeOf(html, "Tariff Calculator")).toBe("Live");
  });

  test("the limits and defaults come from the code", () => {
    const html = render("true");
    expect(html).toContain("Up to 100 SKUs and 5 origins per workspace, and 20 other costs per origin.");
    expect(html).toContain("Air 6,000 cm³/kg (for courier, often 5,000: enter it for that origin); Sea 1 CBM = 1,000 kg");
    expect(html).toContain("Incoterms EXW, FCA, FAS and FOB only");
    expect(html).toContain("SKU, Description, HTS code, Quantity, FOB per unit (USD), Pcs per carton, L (cm), W (cm), H (cm), Carton kg");
  });

  test("manual rates: when to use each kind, who, the rules, conflicts, duplicates and exports; no longer 'not available yet'", () => {
    const html = render("true").replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");
    for (const words of [
      "Manual rates", "Override, on a duty layer the app applied", "Apply manually", "Add manual duty",
      "0 to 1,000%", "A reason is required. Up to 10 per SKU in an origin.",
      "Only the workspace's owner or an admin can set them", "MPF and HMF can never be overridden.",
      "A manual rate never makes a result complete", "Keep as a manual duty", "Keep my rate as an override",
      "Duplicate this origin doesn't copy manual rates", "Locked versions keep them",
    ]) expect(html).toContain(words);
    expect(html).not.toContain("manual rate overrides");
  });
});

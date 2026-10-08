import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SummaryTiles, type SummaryProject } from "./summary-tiles";

const base: SummaryProject = {
  current_freight_cost_usd: 7792.81,
  current_incoterm: "DDP",
  shipment_mode: "Sea",
  shipment_type: "FCL",
  current_freight_forwarder: "Logizeal",
  current_lead_time_days: 30,
  final_incoterm: "DDP",
  final_shipment_mode: "Sea",
  final_shipment_type: "FCL",
  invoice_value: 28000,
  invoice_currency: "USD",
};

function currentTile(over: Partial<SummaryProject>): { text: string[]; html: string } {
  const html = renderToStaticMarkup(
    <SummaryTiles
      project={{ ...base, ...over }}
      best={[]}
      hasQuotes={false}
      pipeline={{ total: 0, quoted: 0, excluded: 0 }}
    />,
  );
  // The first tile is Current: every <p> up to the second tile's label.
  const first = html.split("Best quote")[0];
  const text = [...first.matchAll(/<p[^>]*>(.*?)<\/p>/g)].map((m) => m[1]);
  return { text, html: first };
}

describe("Current tile", () => {
  test("lines run: label, big value, freight, invoice, terms, forwarder", () => {
    expect(currentTile({}).text).toEqual([
      "Current",
      "$7,792.81",
      "$7,792.81 Freight Cost",
      "$28,000.00 Commercial Invoice Value",
      "DDP · Sea · FCL",
      "Logizeal · 30 d",
    ]);
  });

  test("without an invoice value the line says Not set", () => {
    for (const invoice_value of [null, 0]) {
      expect(currentTile({ invoice_value }).text).toContain("Commercial Invoice Value: Not set");
    }
  });

  test("the invoice value uses its own currency, or no symbol without one", () => {
    expect(currentTile({ invoice_value: 50000, invoice_currency: "EUR" }).text).toContain(
      "€50,000.00 Commercial Invoice Value",
    );
    expect(currentTile({ invoice_currency: null }).text).toContain("28,000.00 Commercial Invoice Value");
  });

  test("no Freight Cost line without a current freight cost", () => {
    const { text } = currentTile({ current_freight_cost_usd: null });
    expect(text).toContain("No current freight cost");
    expect(text.some((t) => t.endsWith("Freight Cost"))).toBe(false);
    expect(text).toContain("$28,000.00 Commercial Invoice Value");
  });

  test("the two new lines wrap and carry a tooltip; the terms line still truncates", () => {
    const { html } = currentTile({});
    expect(html).toMatch(/class="break-words text-xs text-neutral-muted" title="\$7,792\.81 Freight Cost"/);
    expect(html).toMatch(
      /class="break-words text-xs text-neutral-muted" title="\$28,000\.00 Commercial Invoice Value"/,
    );
    expect(html).toMatch(/class="truncate text-xs text-neutral-muted">DDP · Sea · FCL</);
  });

  test("an empty tile is unchanged: no new lines", () => {
    const { text } = currentTile({
      current_freight_cost_usd: null,
      current_incoterm: null,
      shipment_mode: null,
      shipment_type: null,
      current_freight_forwarder: null,
      current_lead_time_days: null,
    });
    expect(text).toEqual(["Current", "Current shipping not set"]);
  });
});

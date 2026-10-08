import { describe, expect, test } from "vitest";
import {
  DEDUCTION_NOTE,
  DELIVERED_INCOTERMS,
  buildInputSnapshot,
  buildPrefill,
  compareDuties,
  customsValueAfterDeduction,
  htsLookupInput,
  inputChanges,
  invoiceIncludesFreight,
  normalizeProject,
  parseInputSnapshot,
  type HtsLookup,
  type LinkProject,
  type LinkQuote,
} from "./forwarder-link";
import { centsToNumber, toCents } from "./rational";

const TODAY = "2026-10-05";

const project: LinkProject = {
  id: "p1",
  updated_at: "2026-10-01T10:00:00Z",
  hs_code: "6402.99.31.10",
  origin_country: "Vietnam",
  invoice_value: 40000,
  invoice_currency: "EUR",
  current_incoterm: "CIF",
  current_freight_cost_usd: 2500,
  shipment_mode: "Air",
  weight_kg: 1200,
  units: 3000,
};

const quote: LinkQuote = {
  id: "q1",
  updated_at: "2026-10-02T10:00:00Z",
  forwarder_id: "f1",
  forwarder_name: "Acme Freight",
  label: "Sea FCL",
  shipment_mode: "Sea",
  cost_of_goods_usd: null,
  duties_taxes_usd: 3100,
  lead_time_min_days: 28,
  lead_time_max_days: 32,
};

const found: HtsLookup = {
  status: "found",
  digits: "6402993110",
  description: "House slippers",
  ancestorDescriptions: ["Other footwear"],
  perUnit: null,
};

const latest = { EUR: { rateToUsd: 1.08, rateDate: "2026-10-02" } };

function prefill(overrides: Partial<LinkProject> = {}, q: LinkQuote | null = quote, hts: HtsLookup = found) {
  return buildPrefill({ project: { ...project, ...overrides }, quote: q, hts, latestRates: latest, today: TODAY });
}

describe("HTS code pre-fill", () => {
  test("a 10-digit code is suggested with its official description", () => {
    expect(prefill().hts).toMatchObject({ value: "6402.99.31.10", description: "House slippers", warning: null });
  });

  test("fewer than 10 digits is warned about", () => {
    const p = prefill({}, quote, { ...found, digits: "64029931" });
    expect(p.hts.value).toBe("6402.99.31");
    expect(p.hts.warning).toMatch(/fewer than 10 digits/);
  });

  test("an 8-digit code with several lines asks for the full code", () => {
    const p = prefill({}, quote, { status: "several", digits: "64029931", description: "Other" });
    expect(p.hts.warning).toMatch(/several 10-digit lines/);
  });

  test("a code that can't be used leaves the field blank and says why", () => {
    expect(htsLookupInput("8504.40")).toMatchObject({ status: "invalid", text: "8504.40" });
    const p = prefill({}, quote, { status: "invalid", text: "8504.40", error: "Enter an 8- or 10-digit HTS code" });
    expect(p.hts.value).toBe("");
    expect(p.hts.warning).toContain('"8504.40"');
  });

  test("no HS code on the project", () => {
    expect(htsLookupInput(null)).toEqual({ status: "missing" });
    expect(htsLookupInput("  ")).toEqual({ status: "missing" });
    expect(prefill({}, quote, { status: "missing" }).hts.value).toBe("");
  });

  test("a code not in the current HTS is shown with a warning", () => {
    expect(htsLookupInput("6402.99.31.10")).toEqual({ digits: "6402993110" });
    const p = prefill({}, quote, { status: "not_found", digits: "6402993199" });
    expect(p.hts.warning).toMatch(/isn't in the current HTS/);
  });
});

describe("origin pre-fill", () => {
  test("an unambiguous name maps to its ISO code", () => {
    expect(prefill().origin).toMatchObject({ value: "VN", note: null, projectText: "Vietnam" });
  });

  test("an ambiguous name is left for the user, with the candidates named", () => {
    const o = prefill({ origin_country: "Korea" }).origin;
    expect(o.value).toBe("");
    expect(o.note).toMatch(/could be North Korea or South Korea/);
  });

  test("unrecognized and blank origins are left for the user", () => {
    expect(prefill({ origin_country: "Asia" }).origin.value).toBe("");
    expect(prefill({ origin_country: null }).origin.note).toMatch(/no origin country/);
  });
});

describe("customs value pre-fill and FX", () => {
  test("the invoice value is suggested with the latest daily rate", () => {
    const cv = prefill().customsValue;
    expect(cv.defaultBasis).toBe("invoice");
    expect(cv.options).toEqual([
      {
        key: "invoice",
        label: "Project invoice value",
        amount: "40000",
        currency: "EUR",
        rate: { rate: "1.08", source: "daily_feed", date: "2026-10-02" },
      },
    ]);
  });

  test("no daily rate: the rate is left blank for the user, never 1", () => {
    const cv = buildPrefill({ project, quote, hts: found, latestRates: {}, today: TODAY }).customsValue;
    expect(cv.options[0].rate).toEqual({ rate: "", source: "manual", date: TODAY });
  });

  test("a USD invoice needs no rate", () => {
    expect(prefill({ invoice_currency: "USD" }).customsValue.options[0].rate).toEqual({
      rate: "1",
      source: null,
      date: null,
    });
  });

  test("no invoice currency: the user chooses it", () => {
    const cv = prefill({ invoice_currency: null }).customsValue;
    expect(cv.options[0].currency).toBeNull();
    expect(cv.note).toMatch(/no currency/);
  });

  test("the quote's cost of goods is offered as an alternative basis", () => {
    const cv = prefill({}, { ...quote, cost_of_goods_usd: 41500 }).customsValue;
    expect(cv.options.map((o) => [o.key, o.amount, o.currency])).toEqual([
      ["invoice", "40000", "EUR"],
      ["quote_cost_of_goods", "41500", "USD"],
    ]);
    expect(cv.defaultBasis).toBe("invoice");
  });

  test("with no invoice value, the cost of goods is the only suggestion", () => {
    const cv = prefill({ invoice_value: null }, { ...quote, cost_of_goods_usd: 41500 }).customsValue;
    expect(cv.defaultBasis).toBe("quote_cost_of_goods");
  });

  test("nothing to suggest", () => {
    const cv = prefill({ invoice_value: null }).customsValue;
    expect(cv.options).toEqual([]);
    expect(cv.defaultBasis).toBeNull();
    expect(cv.note).toMatch(/no invoice value/);
  });

  test("conversion rounds to the cent, then the deduction is taken off", () => {
    const r = customsValueAfterDeduction("40000", "1.08", "2500");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(centsToNumber(toCents(r.beforeDeductionUsd))).toBe(43200);
    expect(centsToNumber(toCents(r.customsValueUsd))).toBe(40700);
    const krw = customsValueAfterDeduction("1000000", "0.00073811", null);
    expect(krw.ok && centsToNumber(toCents(krw.customsValueUsd))).toBe(738.11);
  });

  test("a deduction as large as the goods value is rejected", () => {
    const r = customsValueAfterDeduction("1000", "1", "1000");
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.error).toMatch(/more than the goods value/);
  });
});

describe("freight and insurance deduction prompt", () => {
  test.each(DELIVERED_INCOTERMS)("%s: offered, suggesting the CURRENT freight cost", (incoterm) => {
    expect(prefill({ current_incoterm: incoterm }).deduction).toEqual({ incoterm, suggestedUsd: "2500" });
  });

  test("the list is CIF/CFR/CPT/CIP/DAP/DPU/DDP plus legacy DDU", () => {
    expect([...DELIVERED_INCOTERMS].sort()).toEqual(
      ["CFR", "CIF", "CIP", "CPT", "DAP", "DDP", "DDU (legacy term)", "DPU"].sort(),
    );
  });

  test.each(["EXW", "FCA", "FAS", "FOB", null])("%s: not offered", (incoterm) => {
    expect(prefill({ current_incoterm: incoterm }).deduction).toBeNull();
    expect(invoiceIncludesFreight(incoterm)).toBe(false);
  });

  test("the suggestion is the project's current freight from the project page too, never the quote's", () => {
    expect(prefill({}, null).deduction).toEqual({ incoterm: "CIF", suggestedUsd: "2500" });
    // The quote's own freight plays no part.
    expect(prefill({}, { ...quote, cost_of_goods_usd: 99 }).deduction?.suggestedUsd).toBe("2500");
  });

  test("no current freight cost: offered with no suggestion", () => {
    expect(prefill({ current_freight_cost_usd: null }).deduction).toEqual({ incoterm: "CIF", suggestedUsd: null });
  });

  test("the note says what to deduct", () => {
    expect(DEDUCTION_NOTE).toBe("Deduct the freight and insurance included in the supplier's invoice price.");
  });
});

describe("mode and quantity pre-fill", () => {
  test("mode comes from the quote", () => {
    expect(prefill().mode).toEqual({ value: "Sea", from: "quote" });
  });

  test("from the project page, mode is the project's current mode", () => {
    expect(prefill({}, null).mode).toEqual({ value: "Air", from: "project" });
  });

  test("a quote without a mode doesn't fall back to the project's", () => {
    expect(prefill({}, { ...quote, shipment_mode: null }).mode).toEqual({ value: "", from: null });
  });

  test("no quantity is asked for an ad valorem rate", () => {
    expect(prefill().quantity).toBeNull();
  });

  test("a per-kg rate suggests the project weight", () => {
    const hts: HtsLookup = { ...found, perUnit: { unit: "kg", unitLabel: "kg" } };
    expect(prefill({}, quote, hts).quantity).toEqual({ unitLabel: "kg", suggested: "1200", from: "weight_kg" });
  });

  test("a per-each rate suggests the project units", () => {
    const hts: HtsLookup = { ...found, perUnit: { unit: "each", unitLabel: "units (each)" } };
    expect(prefill({}, quote, hts).quantity).toEqual({ unitLabel: "units (each)", suggested: "3000", from: "units" });
  });

  test("other units, or no project figure, are left for the user", () => {
    const pairs: HtsLookup = { ...found, perUnit: { unit: "pr.", unitLabel: "pairs" } };
    expect(prefill({}, quote, pairs).quantity).toEqual({ unitLabel: "pairs", suggested: null, from: null });
    const kg: HtsLookup = { ...found, perUnit: { unit: "kg", unitLabel: "kg" } };
    expect(prefill({ weight_kg: null }, quote, kg).quantity?.suggested).toBeNull();
  });
});

describe("snapshot and inputs changed", () => {
  const choices = { customs_value_basis: "invoice" as const, deduction_offered: true, quantity_from: null };
  const snapshot = buildInputSnapshot(project, quote, choices);

  test("the snapshot round-trips through jsonb", () => {
    expect(parseInputSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
    expect(parseInputSnapshot({ project: {} })).toBeNull();
  });

  test("a snapshot saved before quotes lost their scenario group still reads, and names a deleted quote by it", () => {
    const old = JSON.parse(
      JSON.stringify({ ...snapshot, quote: { ...quote, label: undefined, scenario_group: "DDP - FCL" } }),
    );
    const parsed = parseInputSnapshot(old);
    expect(parsed).not.toBeNull();
    expect(inputChanges(parsed!, project, "deleted")).toEqual([
      { label: "Quote", then: "DDP - FCL", now: "deleted" },
    ]);
  });

  test("a new snapshot names a deleted quote by its label", () => {
    expect(inputChanges(snapshot, project, "deleted")).toEqual([
      { label: "Quote", then: quote.label, now: "deleted" },
    ]);
  });

  test("numeric columns are read as numbers", () => {
    expect(normalizeProject({ ...project, invoice_value: "40000.00", units: null }).invoice_value).toBe(40000);
  });

  test("nothing changed", () => {
    expect(inputChanges(snapshot, { ...project, updated_at: "later" }, quote)).toEqual([]);
  });

  test("each changed input is named with then and now", () => {
    const changes = inputChanges(
      snapshot,
      { ...project, invoice_value: 42500, origin_country: "Thailand", current_freight_cost_usd: 2600 },
      { ...quote, duties_taxes_usd: 2900 },
    );
    expect(changes).toEqual([
      { label: "Origin", then: "Vietnam", now: "Thailand" },
      { label: "Invoice value", then: "€40,000.00", now: "€42,500.00" },
      { label: "Current freight cost", then: "$2,500.00", now: "$2,600.00" },
      { label: "Forwarder's quoted duties", then: "$3,100.00", now: "$2,900.00" },
    ]);
  });

  test("fields the estimate didn't use are ignored", () => {
    // Quote estimate: project mode, weight and units weren't used.
    expect(inputChanges(snapshot, { ...project, shipment_mode: "Sea", weight_kg: 1, units: 1 }, quote)).toEqual([]);
    // The current freight only counts when the deduction was offered.
    const noDeduction = buildInputSnapshot(project, quote, { ...choices, deduction_offered: false });
    expect(inputChanges(noDeduction, { ...project, current_freight_cost_usd: 1 }, quote)).toEqual([]);
  });

  test("the incoterm, HS code, quote mode and a used weight are compared", () => {
    const withWeight = buildInputSnapshot(project, quote, { ...choices, quantity_from: "weight_kg" });
    expect(
      inputChanges(
        withWeight,
        { ...project, current_incoterm: "FOB", hs_code: "6402.99.31.60", weight_kg: 1300 },
        { ...quote, shipment_mode: "Air" },
      ).map((c) => c.label),
    ).toEqual(["HS code", "Current incoterm", "Weight (kg)", "Quote mode"]);
  });

  test("project estimates compare the project's mode", () => {
    const projectOnly = buildInputSnapshot(project, null, choices);
    expect(inputChanges(projectOnly, { ...project, shipment_mode: "Sea" }, null)).toEqual([
      { label: "Shipment mode", then: "Air", now: "Sea" },
    ]);
  });

  test("a cost-of-goods basis compares the quote's cost of goods, not the invoice", () => {
    const cog = buildInputSnapshot(project, { ...quote, cost_of_goods_usd: 41500 }, {
      ...choices,
      customs_value_basis: "quote_cost_of_goods",
    });
    expect(
      inputChanges(cog, { ...project, invoice_value: 1 }, { ...quote, cost_of_goods_usd: 42000 }),
    ).toEqual([{ label: "Quote cost of goods", then: "$41,500.00", now: "$42,000.00" }]);
  });

  test("a deleted quote is reported", () => {
    expect(inputChanges(snapshot, project, "deleted")).toEqual([
      { label: "Quote", then: "Sea FCL", now: "deleted" },
    ]);
  });
});

describe("comparison with the forwarder's quoted duties", () => {
  test("no forwarder duties", () => {
    expect(compareDuties(null, 3000)).toEqual({ kind: "not_quoted" });
  });

  test("zero is a quote, not a missing one", () => {
    expect(compareDuties(0, 3000)).toMatchObject({ kind: "compared", differenceUsd: -3000, flag: true });
  });

  test("difference is forwarder minus estimate, in cents", () => {
    expect(compareDuties(3100.1, 3000.05)).toMatchObject({ differenceUsd: 100.05 });
  });

  test.each([
    // [quoted, estimate, flag]
    [3100, 3000, false], // $100 but only 3.2%
    [1150, 1000, false], // 13% of the higher figure
    [1176.47, 1000, false], // 14.99%
    [1177, 1000, true], // 15.04% and over $100
    [600, 500, true], // $100 and 16.7%
    [599.99, 500, false], // $99.99
    [100, 0, true],
    [99, 0, false],
    [850, 1000, true], // forwarder lower: 15% of 1000
    [851, 1000, false],
  ])("quoted %s vs estimate %s → flag %s", (quoted, estimate, flag) => {
    expect(compareDuties(quoted, estimate)).toMatchObject({ kind: "compared", flag });
  });
});

describe("expected entry date pre-fill", () => {
  test("the quote's longest lead time: today plus 32 for 28-32 days", () => {
    expect(prefill().entryDate).toEqual({ value: "2026-11-06", from: "quote_lead_time", leadTimeText: "28–32 days" });
  });

  test("a single lead time", () => {
    expect(prefill({}, { ...quote, lead_time_min_days: null, lead_time_max_days: 30 }).entryDate).toEqual({
      value: "2026-11-04",
      from: "quote_lead_time",
      leadTimeText: "30 days",
    });
  });

  test("a quote without a lead time, an unusable one, a project-only estimate: today", () => {
    const today = { value: TODAY, from: "today", leadTimeText: null };
    expect(prefill({}, { ...quote, lead_time_min_days: null, lead_time_max_days: null }).entryDate).toEqual(today);
    expect(prefill({}, { ...quote, lead_time_min_days: 0, lead_time_max_days: 0 }).entryDate).toEqual(today);
    expect(prefill({}, null).entryDate).toEqual(today);
  });
});

describe("lead time in the snapshot", () => {
  const leadChoices = {
    customs_value_basis: "invoice" as const,
    deduction_offered: true,
    quantity_from: null,
    entry_date_from: "quote_lead_time" as const,
  };
  const snapshot = buildInputSnapshot(project, quote, leadChoices);

  test("is kept and round-trips", () => {
    expect(parseInputSnapshot(JSON.parse(JSON.stringify(snapshot)))?.quote).toMatchObject({
      lead_time_min_days: 28,
      lead_time_max_days: 32,
    });
  });

  test("a changed lead time is reported when the entry date came from it", () => {
    expect(inputChanges(snapshot, project, { ...quote, lead_time_max_days: 40 })).toEqual([
      { label: "Quote lead time", then: "28–32 days", now: "28–40 days" },
    ]);
    expect(inputChanges(snapshot, project, { ...quote, lead_time_min_days: null, lead_time_max_days: null })).toEqual([
      { label: "Quote lead time", then: "28–32 days", now: "blank" },
    ]);
  });

  test("an unchanged lead time, or an entry date that didn't come from it, reports nothing", () => {
    expect(inputChanges(snapshot, project, quote)).toEqual([]);
    for (const from of ["today", "entered"] as const) {
      const other = buildInputSnapshot(project, quote, { ...leadChoices, entry_date_from: from });
      expect(inputChanges(other, project, { ...quote, lead_time_max_days: 99 })).toEqual([]);
    }
  });

  test("a snapshot saved before lead times were recorded never reports a change", () => {
    const old = JSON.parse(JSON.stringify(snapshot));
    delete old.quote.lead_time_min_days;
    delete old.quote.lead_time_max_days;
    delete old.choices.entry_date_from;
    const parsed = parseInputSnapshot(old)!;
    expect(parsed).not.toBeNull();
    expect(inputChanges(parsed, project, { ...quote, lead_time_max_days: 99 })).toEqual([]);
    // Even when it claims the lead time was the source but the values weren't kept.
    parsed.choices.entry_date_from = "quote_lead_time";
    expect(inputChanges(parsed, project, { ...quote, lead_time_max_days: 99 })).toEqual([]);
  });
});

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// The linked-estimate rules in the server actions: only the project's owner
// or an admin can link (RLS enforces it too, see pgTAP 12), every input must
// be confirmed, a project changed since the page loaded is refused, and the
// snapshot is read from the database, never from the form. Unlinked
// estimates take the original path. The calculation itself is stubbed.

const PROJECT = "00000000-0000-4000-8000-000000000401";
const QUOTE = "00000000-0000-4000-8000-000000000501";

const projectRow = {
  id: PROJECT,
  updated_at: "2026-10-01T10:00:00Z",
  hs_code: "6402.99.31.10",
  origin_country: "Vietnam",
  invoice_value: 10000,
  invoice_currency: "USD",
  current_incoterm: "CIF",
  current_freight_cost_usd: 800,
  shipment_mode: "Air",
  weight_kg: 1200,
  units: 3000,
  clients: { name: "Client A" },
};
const quoteRow = {
  id: QUOTE,
  updated_at: "2026-10-02T10:00:00Z",
  forwarder_id: "f1",
  scenario_group: "Sea FCL",
  shipment_mode: "Sea",
  cost_of_goods_usd: null,
  duties_taxes_usd: 3100,
  forwarders: { company_name: "Acme Freight", forwarder_project_id: PROJECT },
};
const VERSION = `${projectRow.updated_at}|${quoteRow.updated_at}`;

const inserts: Record<string, unknown>[] = [];
// Every write other than the estimate insert, by table.
const otherWrites: string[] = [];
function stubClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({
          data: table === "forwarder_projects" ? projectRow : table === "forwarder_quotes" ? quoteRow : null,
          error: null,
        }),
        update: () => {
          otherWrites.push(`update ${table}`);
          return chain;
        },
        upsert: () => {
          otherWrites.push(`upsert ${table}`);
          return chain;
        },
        delete: () => {
          otherWrites.push(`delete ${table}`);
          return chain;
        },
        insert: (row: Record<string, unknown>) => {
          if (table !== "duty_estimates") otherWrites.push(`insert ${table}`);
          inserts.push(row);
          return { select: () => ({ single: async () => ({ data: { id: "e1" }, error: null }) }) };
        },
      };
      return chain;
    },
  };
}

const canWrite = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => stubClient() }));
vi.mock("@/lib/auth/get-ownership-context", () => ({
  getOwnershipContext: async () => ({ canWrite: canWrite(), isOwner: false, isAdmin: false }),
}));
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT ${url}`);
});
vi.mock("next/navigation", () => ({ redirect }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
const buildEstimate = vi.fn();
vi.mock("@/lib/tariff/server-estimate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tariff/server-estimate")>()),
  buildEstimate,
}));

const { previewEstimate, saveEstimate } = await import("./actions");

const ESTIMATE = {
  asOfDate: "2026-10-05",
  htsCode: "6402993110",
  description: "House slippers",
  ancestorDescriptions: [],
  release: { name: "2026HTSRev20", title: null, release_start_date: null },
  rateColumn: "general",
  rateText: "6%",
  specialRateText: null,
  originCountry: "VN",
  shipmentMode: "Sea",
  customsValueOriginal: "10000",
  currency: "USD",
  exchangeRateToUsd: "1",
  exchangeRateSource: null,
  exchangeRateDate: null,
  customsValueUsd: 9200,
  deductionUsd: 800,
  quantityUsed: null,
  baseDutyUsd: 552,
  additionalDutiesUsd: 0,
  feesUsd: 47.14,
  totalUsd: 599.14,
  lines: [],
  warnings: [],
  dutyReviews: [],
};

function form(fields: Record<string, string> = {}) {
  const data = new FormData();
  const all = {
    hts_code: "6402.99.31.10",
    origin_country: "VN",
    shipment_mode: "Sea",
    customs_value: "10000",
    original_currency: "USD",
    forwarder_project_id: PROJECT,
    forwarder_quote_id: QUOTE,
    source_version: VERSION,
    freight_insurance_deduction_usd: "800",
    confirm_hts: "on",
    confirm_origin: "on",
    confirm_customs_value: "on",
    confirm_deduction: "on",
    confirm_mode: "on",
    ...fields,
  };
  for (const [key, value] of Object.entries(all)) if (value !== "") data.set(key, value);
  return data;
}

beforeEach(() => {
  inserts.length = 0;
  otherWrites.length = 0;
  canWrite.mockReturnValue(true);
  buildEstimate.mockResolvedValue({ ok: true, estimate: ESTIMATE });
});
afterEach(() => vi.clearAllMocks());

describe("linked duty estimates", () => {
  test("the owner saves a linked estimate with a snapshot read from the database", async () => {
    // A snapshot posted by the browser is ignored.
    await expect(saveEstimate(form({ input_snapshot: '{"forged":true}' }))).rejects.toThrow("REDIRECT /tariff-calculator/estimates/e1");
    expect(buildEstimate.mock.calls[0][1]).toMatchObject({ deductionUsd: "800", customsValue: "10000" });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      forwarder_project_id: PROJECT,
      forwarder_quote_id: QUOTE,
      freight_insurance_deduction_usd: 800,
      input_snapshot: {
        project: { id: PROJECT, invoice_value: 10000, current_incoterm: "CIF", current_freight_cost_usd: 800 },
        quote: { id: QUOTE, forwarder_name: "Acme Freight", duties_taxes_usd: 3100 },
        choices: { customs_value_basis: "invoice", deduction_offered: true, quantity_from: null },
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/forwarder-sourcing/${PROJECT}`);
    expect(revalidatePath).toHaveBeenCalledWith(`/forwarder-sourcing/${PROJECT}/forwarders/f1`);
  });

  test("a code chosen in HTS lookup is used for the estimate only; the project's HS code is never written", async () => {
    await expect(saveEstimate(form({ hts_code: "6402.99.31.60" }))).rejects.toThrow("REDIRECT");
    expect(buildEstimate.mock.calls[0][1]).toMatchObject({ htsDigits: "6402993160" });
    expect(otherWrites).toEqual([]);
    // The snapshot records the project as it is, with its own code.
    expect(inserts[0]).toMatchObject({ input_snapshot: { project: { hs_code: "6402.99.31.10" } } });
    expect(projectRow.hs_code).toBe("6402.99.31.10");
  });

  test("someone who can't write to the project can't save or even preview a linked estimate", async () => {
    canWrite.mockReturnValue(false);
    expect(await saveEstimate(form())).toEqual({ error: expect.stringMatching(/Only the project's owner or an admin/) });
    expect(await previewEstimate(form())).toEqual({ error: expect.stringMatching(/Only the project's owner or an admin/) });
    expect(inserts).toEqual([]);
    expect(buildEstimate).not.toHaveBeenCalled();
  });

  test("nothing is calculated until every input is confirmed", async () => {
    expect(await previewEstimate(form({ confirm_origin: "" }))).toEqual({
      error: "Confirm the country of origin before calculating.",
    });
    expect(await previewEstimate(form({ confirm_deduction: "" }))).toEqual({
      error: "Confirm the freight and insurance deduction before calculating.",
    });
    expect(await saveEstimate(form({ quantity: "1200" }))).toEqual({ error: "Confirm the quantity before calculating." });
    expect(buildEstimate).not.toHaveBeenCalled();
  });

  test("a project changed since the page loaded is refused", async () => {
    expect(await saveEstimate(form({ source_version: "2026-09-30T00:00:00Z|" + quoteRow.updated_at }))).toEqual({
      error: expect.stringMatching(/changed while you were editing/),
    });
    expect(inserts).toEqual([]);
  });

  test("no deduction when the current incoterm doesn't include freight", async () => {
    const saved = projectRow.current_incoterm;
    projectRow.current_incoterm = "FOB";
    try {
      expect(await previewEstimate(form())).toEqual({ error: expect.stringMatching(/nothing is deducted/) });
      buildEstimate.mockClear();
      await previewEstimate(form({ freight_insurance_deduction_usd: "", confirm_deduction: "" }));
      expect(buildEstimate.mock.calls[0][1]).toMatchObject({ deductionUsd: null });
    } finally {
      projectRow.current_incoterm = saved;
    }
  });
});

describe("unlinked estimates are unchanged", () => {
  test("no ownership check, no link columns, no deduction", async () => {
    const plain = form({
      forwarder_project_id: "",
      forwarder_quote_id: "",
      source_version: "",
      confirm_hts: "",
      confirm_origin: "",
      confirm_customs_value: "",
      confirm_deduction: "",
      confirm_mode: "",
    });
    canWrite.mockReturnValue(false);
    await expect(saveEstimate(plain)).rejects.toThrow("REDIRECT");
    expect(buildEstimate.mock.calls[0][1]).toMatchObject({ deductionUsd: null });
    expect(inserts[0]).not.toHaveProperty("forwarder_project_id");
    expect(inserts[0]).not.toHaveProperty("input_snapshot");
  });
});

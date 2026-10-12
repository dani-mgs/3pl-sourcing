import { describe, expect, test } from "vitest";
import { forwarderFunnel, threePlFunnel, threePlShortlist } from "./partners";

const f = (id: string, status: string, assessment: string | null = null) => ({ id, company_name: id, status, assessment });
const p = (id: string, status: string, is_incumbent = false) => ({ id, company_name: id, status, is_incumbent });

describe("funnel rules", () => {
  test("a Do Not Contact partner counts as contacted only if it sent a price", () => {
    const forwarders = [f("a", "Shortlisted"), f("b", "Do Not Contact"), f("c", "Do Not Contact"), f("d", "Potential / Not Contacted")];
    const funnel = forwarderFunnel(forwarders, new Set(["a", "c"]), new Set(["a"]), true);
    expect(funnel).toEqual([
      { step: "contacted", count: 2 },
      { step: "quoted", count: 1 },
      { step: "like_for_like", count: 1 },
      { step: "shortlisted", count: 1 },
      { step: "recommended", count: 1 },
    ]);
  });

  test("3PL: the current warehouse isn't a candidate; out-of-the-running partners count as contacted only", () => {
    const providers = [
      p("now", "Baseline", true),
      p("a", "Shortlisted"),
      p("b", "Unfit"),
      p("c", "Do not Contact"),
      p("d", "Waiting for Quotation"),
      p("e", "Contacted"),
    ];
    expect(threePlFunnel(providers, new Set(["a", "b", "now"]), 1, false)).toEqual([
      { step: "contacted", count: 4 },
      { step: "replied", count: 2 },
      { step: "quoted", count: 1 },
      { step: "shortlisted", count: 1 },
      { step: "recommended", count: 0 },
    ]);
    expect(threePlShortlist(providers, ["b", "now", "d"]).map((x) => x.id)).toEqual(["a", "d"]);
  });
});

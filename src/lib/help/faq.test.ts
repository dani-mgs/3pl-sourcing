import { describe, expect, test } from "vitest";
import { FAQ_ITEMS } from "@/app/(authenticated)/help/faq-items";
import { HUB_MODULES } from "@/lib/modules";
import { FAQ_MODULES, faqModules, faqTag, groupFaq } from "./faq";

describe("FAQ modules", () => {
  test("the modules are the live nav modules in nav order, then General", () => {
    const live = HUB_MODULES.filter((m) => m.href).map((m) => m.name);
    expect([...FAQ_MODULES]).toEqual([...live, "General"]);
  });

  test("every item has a known module, a unique id and non-empty text", () => {
    expect(FAQ_ITEMS.length).toBeGreaterThan(20);
    for (const item of FAQ_ITEMS) {
      expect(FAQ_MODULES).toContain(item.module);
      expect(item.question.trim()).not.toBe("");
      expect(item.answer).toBeTruthy();
      if (item.page !== undefined) expect(item.page.trim()).not.toBe("");
    }
    const ids = FAQ_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("the HTS lookup questions are under Tariff Calculator › HTS lookup", () => {
    const hts = FAQ_ITEMS.filter((i) => i.page === "HTS lookup");
    expect(hts.map((i) => i.id)).toEqual(
      expect.arrayContaining(["search-shoes", "find-hts-code", "use-this-code", "no-use-this-code", "may-apply-badge"]),
    );
    expect(hts.every((i) => i.module === "Tariff Calculator")).toBe(true);
  });
});

describe("grouping and filtering", () => {
  const items = [
    { id: "a", module: "Tariff Calculator" as const },
    { id: "b", module: "Forwarder Sourcing" as const },
    { id: "c", module: "General" as const },
    { id: "d", module: "Tariff Calculator" as const },
  ];

  test("All: one group per module in navigation order, items keep their order", () => {
    const groups = groupFaq(items, "all");
    expect(groups.map((g) => g.module)).toEqual(["Forwarder Sourcing", "Tariff Calculator", "General"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["a", "d"]);
  });

  test("a filter returns only that module's items", () => {
    expect(groupFaq(items, "Tariff Calculator")).toEqual([
      { module: "Tariff Calculator", items: [items[0], items[3]] },
    ]);
    expect(groupFaq(items, "3PL Sourcing")).toEqual([]);
  });

  test("with the real FAQ, each module's filter returns only its own questions, and nothing is lost", () => {
    for (const name of faqModules(FAQ_ITEMS)) {
      const groups = groupFaq(FAQ_ITEMS, name);
      expect(groups).toHaveLength(1);
      expect(groups[0].items.length).toBeGreaterThan(0);
      expect(groups[0].items.every((i) => i.module === name)).toBe(true);
    }
    const all = groupFaq(FAQ_ITEMS, "all").flatMap((g) => g.items);
    expect(all).toHaveLength(FAQ_ITEMS.length);
  });

  test("a module with no questions gets no chip or heading, so every chip leads to a question", () => {
    expect(faqModules(items)).toEqual(["Forwarder Sourcing", "Tariff Calculator", "General"]);
    const modules = faqModules(FAQ_ITEMS);
    expect(modules).not.toContain("3PL Sourcing");
    for (const name of modules) expect(groupFaq(FAQ_ITEMS, name)[0].items.length).toBeGreaterThan(0);
  });
});

describe("page tag", () => {
  test("Module › Page when a page is set, nothing otherwise", () => {
    expect(faqTag({ module: "Tariff Calculator", page: "HTS lookup" })).toBe("Tariff Calculator › HTS lookup");
    expect(faqTag({ module: "Forwarder Sourcing" })).toBeNull();
  });
});

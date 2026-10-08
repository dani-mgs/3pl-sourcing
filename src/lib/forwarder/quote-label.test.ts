import { describe, expect, test } from "vitest";
import { quoteLabel, quoteRoute, quoteTitle } from "./quote-label";

const ddp = { incoterm: "DDP", shipment_mode: "Sea", shipment_type: "FCL" };

describe("quoteLabel", () => {
  test("terms joined with a middle dot", () => {
    expect(quoteLabel(ddp)).toBe("DDP · Sea · FCL");
  });

  test("the legacy DDU wording is shortened", () => {
    expect(quoteLabel({ ...ddp, incoterm: "DDU (legacy term)" })).toBe("DDU · Sea · FCL");
  });

  test("skips what isn't set, and falls back to Quote", () => {
    expect(quoteLabel({ incoterm: "FOB", shipment_mode: null, shipment_type: "  " })).toBe("FOB");
    expect(quoteLabel({ incoterm: null, shipment_mode: null, shipment_type: null })).toBe("Quote");
  });
});

describe("quoteRoute and quoteTitle", () => {
  test("origin → destination, with a dash for a missing end, null for neither", () => {
    expect(quoteRoute({ origin: "Ho Chi Minh City", destination: "Guangzhou" })).toBe(
      "Ho Chi Minh City → Guangzhou",
    );
    expect(quoteRoute({ origin: "Ho Chi Minh City", destination: null })).toBe("Ho Chi Minh City → —");
    expect(quoteRoute({ origin: " ", destination: "" })).toBeNull();
    expect(quoteRoute({})).toBeNull();
  });

  test("title adds the route only when there is one", () => {
    expect(quoteTitle({ ...ddp, origin: "HCMC", destination: "Guangzhou" })).toBe(
      "DDP · Sea · FCL · HCMC → Guangzhou",
    );
    expect(quoteTitle(ddp)).toBe("DDP · Sea · FCL");
  });
});

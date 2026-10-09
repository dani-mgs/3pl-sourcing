import { describe, expect, test } from "vitest";
import { adminUserLabel } from "./user-label";

describe("adminUserLabel", () => {
  test("puts the email after the name", () => {
    expect(adminUserLabel("Dani", "dani@example.test", "parens")).toBe("Dani (dani@example.test)");
    expect(adminUserLabel("Dani", "dani@example.test", "dot")).toBe("Dani · dani@example.test");
  });

  test("trims the name", () => {
    expect(adminUserLabel("  Padded  ", "p@example.test", "parens")).toBe("Padded (p@example.test)");
  });

  test("shows only the email when there is no name", () => {
    for (const name of [null, undefined, "", "   "]) {
      expect(adminUserLabel(name, "x@example.test", "parens")).toBe("x@example.test");
      expect(adminUserLabel(name, "x@example.test", "dot")).toBe("x@example.test");
    }
  });

  test("two users with the same name stay distinguishable", () => {
    expect(adminUserLabel("ZZQA Admin", "zzqa-admin@example.test", "parens")).not.toBe(
      adminUserLabel("ZZQA Admin", "zzqa-target@example.test", "parens"),
    );
  });
});

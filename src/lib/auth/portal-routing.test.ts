import { describe, expect, test } from "vitest";
import { portalRoute } from "./portal-routing";

const CLIENT = { role: "client", client_id: "00000000-0000-4000-8000-00000000c001" };
const NEW_CLIENT = { ...CLIENT, must_change_password: true };

// Every staff route family, plus the API and Next's own paths a client might try.
const STAFF_PATHS = [
  "/3pl-sourcing",
  "/3pl-sourcing/new",
  "/3pl-sourcing/projects/00000000-0000-4000-8000-000000000301",
  "/forwarder-sourcing",
  "/forwarder-sourcing/00000000-0000-4000-8000-000000000401/edit",
  "/tariff-calculator",
  "/tariff-calculator/duty-data/fees",
  "/admin",
  "/client-access",
  "/help",
  "/api/cron/fx-rates",
  "/portalx",
  "/portal-admin",
];

describe("a client user", () => {
  test.each(STAFF_PATHS)("gets a 404 for %s", (path) => {
    expect(portalRoute(path, CLIENT)).toEqual({ kind: "notFound" });
  });

  test.each(["/portal", "/portal/change-password", "/portal/anything"])("reaches %s", (path) => {
    expect(portalRoute(path, CLIENT)).toEqual({ kind: "next" });
  });

  test.each(["/", "/login"])("is sent from %s to /portal", (path) => {
    expect(portalRoute(path, CLIENT)).toEqual({ kind: "redirect", to: "/portal" });
  });

  test("ignores a staff role in user_metadata (not passed here at all)", () => {
    expect(portalRoute("/admin", { ...CLIENT, tariff_editor: true })).toEqual({ kind: "notFound" });
  });
});

describe("a client user who must change their password", () => {
  test("reaches only the change-password page", () => {
    expect(portalRoute("/portal/change-password", NEW_CLIENT)).toEqual({ kind: "next" });
  });

  test.each(["/", "/login", "/portal", "/portal/anything"])("is sent from %s to change it", (path) => {
    expect(portalRoute(path, NEW_CLIENT)).toEqual({ kind: "redirect", to: "/portal/change-password" });
  });

  test.each(STAFF_PATHS)("still gets a 404 for %s", (path) => {
    expect(portalRoute(path, NEW_CLIENT)).toEqual({ kind: "notFound" });
  });

  test("only the boolean true counts as the flag", () => {
    expect(portalRoute("/portal", { ...CLIENT, must_change_password: "false" })).toEqual({ kind: "next" });
  });
});

describe("staff and accounts without a role", () => {
  test.each([{ role: "admin" }, { role: "logistics_expert" }, {}, { role: "superuser" }, null])(
    "%o gets a 404 for the portal",
    (meta) => {
      expect(portalRoute("/portal", meta)).toEqual({ kind: "notFound" });
      expect(portalRoute("/portal/change-password", meta)).toEqual({ kind: "notFound" });
    },
  );

  test.each(["/", "/admin", "/3pl-sourcing", "/client-access", "/login", "/portalx"])("are unaffected on %s", (path) => {
    expect(portalRoute(path, { role: "logistics_expert" })).toEqual({ kind: "next" });
  });
});

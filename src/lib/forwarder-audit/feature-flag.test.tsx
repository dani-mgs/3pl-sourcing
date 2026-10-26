import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { hubModules } from "@/lib/modules";
import { isForwarderAuditEnabled } from "./feature-flag";

// FORWARDER_AUDIT_ENABLED: only "true" turns Forwarder Audit on; it's read on
// the server only, and the nav links the module only when it's on.

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
const { ModuleNav } = await import("@/app/(authenticated)/module-nav");

afterEach(() => vi.unstubAllEnvs());

describe("isForwarderAuditEnabled", () => {
  test.each([
    ["true", true],
    ["TRUE", false],
    ["1", false],
    ["yes", false],
    ["", false],
    [" true", false],
  ])("%j → %s", (value, expected) => {
    vi.stubEnv("FORWARDER_AUDIT_ENABLED", value);
    expect(isForwarderAuditEnabled()).toBe(expected);
  });

  test("unset is off", () => {
    vi.stubEnv("FORWARDER_AUDIT_ENABLED", undefined);
    expect(isForwarderAuditEnabled()).toBe(false);
  });
});

describe("the module list and nav", () => {
  const audit = (landed: boolean, enabled: boolean) => hubModules(landed, enabled).find((m) => m.name === "Forwarder Audit")!;

  test("off: no link (Soon); on: links to /forwarder-audit; nothing else changes", () => {
    expect(audit(false, false).href).toBeNull();
    expect(audit(false, true).href).toBe("/forwarder-audit");
    expect(audit(true, true).description).toBe("Audit forwarder quotations.");
    const others = (enabled: boolean) => hubModules(true, enabled).filter((m) => m.name !== "Forwarder Audit");
    expect(others(true)).toEqual(others(false));
  });

  test("the nav renders a link only when on", () => {
    const off = renderToStaticMarkup(<ModuleNav modules={hubModules(false, false)} />);
    const on = renderToStaticMarkup(<ModuleNav modules={hubModules(false, true)} />);
    expect(off).not.toContain('href="/forwarder-audit"');
    expect(on).toContain('href="/forwarder-audit"');
  });
});

describe("read on the server only", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return sourceFiles(full);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
    });
  }

  test("no client component imports the flag or reads FORWARDER_AUDIT_ENABLED", () => {
    const offenders = sourceFiles(path.join(process.cwd(), "src")).filter((file) => {
      const text = readFileSync(file, "utf8");
      return /^\s*["']use client["']/.test(text) && /forwarder-audit\/feature-flag|FORWARDER_AUDIT_ENABLED/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});

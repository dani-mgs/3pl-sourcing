import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { hubModules } from "@/lib/modules";
import { isLandedCostEnabled } from "./feature-flag";

// LANDED_COST_ENABLED: only "true" turns Landed Cost on; it's read on the
// server only, and the nav links the module only when it's on.

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
const { ModuleNav } = await import("@/app/(authenticated)/module-nav");

afterEach(() => vi.unstubAllEnvs());

describe("isLandedCostEnabled", () => {
  test.each([
    ["true", true],
    ["TRUE", false],
    ["1", false],
    ["yes", false],
    ["", false],
    [" true", false],
  ])("%j → %s", (value, expected) => {
    vi.stubEnv("LANDED_COST_ENABLED", value);
    expect(isLandedCostEnabled()).toBe(expected);
  });

  test("unset is off", () => {
    vi.stubEnv("LANDED_COST_ENABLED", undefined);
    expect(isLandedCostEnabled()).toBe(false);
  });
});

describe("the module list and nav", () => {
  const landed = (enabled: boolean) => hubModules(enabled).find((m) => m.name === "Landed Cost Calculator")!;

  test("off: Landed Cost has no link (Soon); on: it links to /landed-cost; nothing else changes", () => {
    expect(landed(false).href).toBeNull();
    expect(landed(true).href).toBe("/landed-cost");
    const others = (enabled: boolean) => hubModules(enabled).filter((m) => m.name !== "Landed Cost Calculator");
    expect(others(true)).toEqual(others(false));
  });

  test("the nav renders a link only when on", () => {
    const off = renderToStaticMarkup(<ModuleNav modules={hubModules(false)} />);
    const on = renderToStaticMarkup(<ModuleNav modules={hubModules(true)} />);
    expect(off).not.toContain('href="/landed-cost"');
    expect(on).toContain('href="/landed-cost"');
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

  test("no client component imports the flag or reads LANDED_COST_ENABLED", () => {
    const offenders = sourceFiles(path.join(process.cwd(), "src")).filter((file) => {
      const text = readFileSync(file, "utf8");
      return /^\s*["']use client["']/.test(text) && /landed-cost\/feature-flag|LANDED_COST_ENABLED/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});

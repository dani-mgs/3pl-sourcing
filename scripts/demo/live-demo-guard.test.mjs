import { describe, expect, test } from "vitest";
import {
  checkSecretKey,
  confirmationMatches,
  GuardError,
  maskEmail,
  parseArgs,
  PROD_REF,
  redact,
  resolveTarget,
} from "./live-demo-guard.mjs";

// The live demo script's target checks (scripts/demo/live-demo.mjs). Keys
// here are made-up placeholders.

const KEY = "sb_secret_placeholder_for_tests_only";
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const env = (over = {}) => ({ DEMO_TARGET_URL: PROD_URL, DEMO_TARGET_SERVICE_KEY: KEY, DEMO_OWNER_EMAIL: "owner@example.test", ...over });
const LOCAL = { url: "http://127.0.0.1:54321", secretKey: KEY };
const refused = (fn, message) => expect(fn).toThrow(message ? new RegExp(message) : GuardError);

describe("parseArgs", () => {
  test("a dry run by default", () => {
    expect(parseArgs([])).toMatchObject({ command: "seed", apply: false, local: false, confirmProject: null, withPortalUser: false });
    expect(parseArgs(["remove"]).command).toBe("remove");
  });

  test("unknown arguments are refused", () => refused(() => parseArgs(["--aply"]), "Unknown argument"));

  test("--fail-after only with --local, and only at a known step", () => {
    refused(() => parseArgs(["--apply", "--fail-after=labels"]), "only for testing against the local stack");
    refused(() => parseArgs(["--local", "--fail-after=nowhere"]), "must be one of");
    expect(parseArgs(["--local", "--apply", "--fail-after=labels"]).failAfter).toBe("labels");
  });

  test("--with-portal-user isn't for removal", () => refused(() => parseArgs(["remove", "--with-portal-user"])));
});

describe("checkSecretKey", () => {
  test("a missing key", () => refused(() => checkSecretKey(""), "secret API key"));
  test("a legacy service_role JWT is refused, and says why", () =>
    refused(() => checkSecretKey("eyJhbGciOiJIUzI1NiJ9.e30.x"), "legacy service_role JWT .*revoke"));
  test("anything that isn't sb_secret_", () => refused(() => checkSecretKey("sb_publishable_abc"), "sb_secret_"));
  test("a secret key passes", () => expect(checkSecretKey(KEY)).toBe(KEY));
});

describe("resolveTarget: production", () => {
  test("the production project, dry run", () => {
    expect(resolveTarget(parseArgs([]), env(), null)).toMatchObject({ ref: PROD_REF, isLocal: false, url: PROD_URL });
  });

  test("another project is refused", () =>
    refused(() => resolveTarget(parseArgs([]), env({ DEMO_TARGET_URL: "https://abcdefghijklmnopqrst.supabase.co" }), null), "not the production project"));

  test("anything that isn't exactly https://<ref>.supabase.co is refused", () => {
    for (const url of [`http://${PROD_REF}.supabase.co`, `https://${PROD_REF}.supabase.co.evil.example`, `https://${PROD_REF}.supabase.co/rest/v1`, "http://127.0.0.1:54321", ""]) {
      refused(() => resolveTarget(parseArgs([]), env({ DEMO_TARGET_URL: url }), null));
    }
  });

  test("--apply needs --confirm-project matching the URL", () => {
    refused(() => resolveTarget(parseArgs(["--apply"]), env(), null), "confirm-project");
    refused(() => resolveTarget(parseArgs(["--apply", "--confirm-project=abcdefghijklmnopqrst"]), env(), null), "confirm-project");
    expect(resolveTarget(parseArgs(["--apply", `--confirm-project=${PROD_REF}`]), env(), null).ref).toBe(PROD_REF);
  });

  test("a legacy key is refused on production", () =>
    refused(() => resolveTarget(parseArgs([]), env({ DEMO_TARGET_SERVICE_KEY: "eyJabc.def.ghi" }), null), "legacy"));

  test("the owner's email is required", () =>
    refused(() => resolveTarget(parseArgs([]), env({ DEMO_OWNER_EMAIL: "" }), null), "DEMO_OWNER_EMAIL"));
});

describe("resolveTarget: --local", () => {
  test("only the local stack", () => {
    expect(resolveTarget(parseArgs(["--local", "--apply"]), env(), LOCAL)).toMatchObject({ isLocal: true, url: "http://127.0.0.1:54321" });
    refused(() => resolveTarget(parseArgs(["--local"]), env(), { ...LOCAL, url: "https://example.supabase.co" }), "only the local stack");
    refused(() => resolveTarget(parseArgs(["--local"]), env(), { ...LOCAL, url: "http://127.0.0.1:5432" }), "only the local stack");
    refused(() => resolveTarget(parseArgs(["--local"]), env(), null), "local Supabase status");
  });

  test("--confirm-project with --local is refused (no mixing targets)", () =>
    refused(() => resolveTarget(parseArgs(["--local", `--confirm-project=${PROD_REF}`]), env(), LOCAL)));
});

describe("output", () => {
  test("emails are masked", () => {
    expect(maskEmail("jane.doe@movelogistics.com")).toBe("j***@m***.com");
    expect(maskEmail("")).toBe("(none)");
  });

  test("secrets are redacted from messages", () => {
    expect(redact(`failed for ${KEY} and owner@example.test`, [KEY, "owner@example.test"])).toBe("failed for [redacted] and [redacted]");
  });

  test("the typed confirmation must be the ref", () => {
    expect(confirmationMatches(` ${PROD_REF}\n`, PROD_REF)).toBe(true);
    expect(confirmationMatches("yes", PROD_REF)).toBe(false);
  });
});

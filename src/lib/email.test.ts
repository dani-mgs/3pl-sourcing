import { describe, expect, test } from "vitest";
import { emailSaveError, INVALID_EMAIL_ERROR, isValidEmail, showStoredEmailHint } from "./email";

describe("isValidEmail", () => {
  test("accepts ordinary addresses", () => {
    for (const ok of ["jane@acme.com", "  ops+quotes@freight.co.uk ", "a.b@sub.example.test"]) expect(isValidEmail(ok)).toBe(true);
  });
  test("refuses what isn't one", () => {
    for (const bad of ["not-an-email", "jane@acme", "@acme.com", "jane @acme.com", "jane@", ""]) expect(isValidEmail(bad)).toBe(false);
  });
});

describe("emailSaveError", () => {
  test("a new invalid email is refused (B-10 repro)", () => {
    expect(emailSaveError("not-an-email", null)).toBe(INVALID_EMAIL_ERROR);
  });
  test("a changed one is refused too", () => {
    expect(emailSaveError("still-wrong", "not-an-email")).toBe(INVALID_EMAIL_ERROR);
    expect(emailSaveError("not-an-email", "jane@acme.com")).toBe(INVALID_EMAIL_ERROR);
  });
  test("an unchanged stored value is never blocked, even if invalid", () => {
    expect(emailSaveError("not-an-email", "not-an-email")).toBeNull();
    expect(emailSaveError(" not-an-email ", "not-an-email")).toBeNull();
  });
  test("empty and valid emails are fine", () => {
    expect(emailSaveError(null, null)).toBeNull();
    expect(emailSaveError("", "not-an-email")).toBeNull();
    expect(emailSaveError("jane@acme.com", null)).toBeNull();
  });
});

describe("showStoredEmailHint", () => {
  test("flags an invalid stored email while it's unchanged", () => {
    expect(showStoredEmailHint("not-an-email", "not-an-email")).toBe(true);
  });
  test("not once it's edited, not for valid or empty ones", () => {
    expect(showStoredEmailHint("jane@acme.com", "not-an-email")).toBe(false);
    expect(showStoredEmailHint("jane@acme.com", "jane@acme.com")).toBe(false);
    expect(showStoredEmailHint("", null)).toBe(false);
  });
});

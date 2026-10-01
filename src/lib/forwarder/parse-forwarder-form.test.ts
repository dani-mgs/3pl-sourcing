import { afterEach, describe, expect, test, vi } from "vitest";
import { parseForwarderForm } from "./parse-forwarder-form";
import { CAPABILITY_FIELDS } from "./forwarder-fields";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  data.set("company_name", "Acme Forwarding");
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

afterEach(() => vi.restoreAllMocks());
const quietErrors = () => vi.spyOn(console, "error").mockImplementation(() => {});

describe("parseForwarderForm", () => {
  test("a valid form: text trimmed, blanks null, capabilities parsed", () => {
    const result = parseForwarderForm(
      form({
        website: "  https://acme.example ",
        email: "",
        status: "Vetted",
        assessment: "Fit",
        air_freight: "true",
        sea_freight: "false",
        key_notes: "Prefers email",
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      company_name: "Acme Forwarding",
      website: "https://acme.example",
      email: null,
      status: "Vetted",
      assessment: "Fit",
      air_freight: true,
      sea_freight: false,
      key_notes: "Prefers email",
    });
  });

  test("missing capability inputs default to false (not yet confirmed)", () => {
    const result = parseForwarderForm(form({}));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const { name } of CAPABILITY_FIELDS) expect(result.data[name], name).toBe(false);
  });

  test("a blank status becomes Potential / Not Contacted", () => {
    const result = parseForwarderForm(form({ status: "" }));
    expect(result.ok && result.data.status).toBe("Potential / Not Contacted");
  });

  test.each(["", "   "])("missing company name %j is refused with its own message", (name) => {
    quietErrors();
    expect(parseForwarderForm(form({ company_name: name }))).toEqual({
      ok: false,
      error: "Company name is required.",
    });
  });

  test.each([
    ["status", "Best Ever"],
    ["assessment", "Amazing"],
  ])("an unknown %s is refused", (field, value) => {
    quietErrors();
    expect(parseForwarderForm(form({ [field]: value })).ok).toBe(false);
  });

  test("text over its length limit is refused", () => {
    quietErrors();
    expect(parseForwarderForm(form({ company_name: "x".repeat(201) })).ok).toBe(false);
    expect(parseForwarderForm(form({ phone: "1".repeat(51) })).ok).toBe(false);
    expect(parseForwarderForm(form({ key_notes: "x".repeat(2001) })).ok).toBe(false);
    expect(parseForwarderForm(form({ key_notes: "x".repeat(2000) })).ok).toBe(true);
  });
});

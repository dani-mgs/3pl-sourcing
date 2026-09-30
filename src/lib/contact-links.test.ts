import { describe, expect, test } from "vitest";
import { mailtoHref, telHref, websiteHref } from "./contact-links";

describe("websiteHref", () => {
  test("keeps http(s) URLs and adds https to a bare domain", () => {
    expect(websiteHref("https://acme.com/about")).toBe("https://acme.com/about");
    expect(websiteHref("http://acme.com")).toBe("http://acme.com/");
    expect(websiteHref(" www.acme-freight.com ")).toBe("https://www.acme-freight.com/");
  });

  test("refuses other schemes and junk", () => {
    expect(websiteHref("javascript:alert(1)")).toBeNull();
    expect(websiteHref("JavaScript:alert(1)")).toBeNull();
    expect(websiteHref("data:text/html,<script>")).toBeNull();
    expect(websiteHref("ftp://acme.com")).toBeNull();
    expect(websiteHref("not a url")).toBeNull();
    expect(websiteHref("")).toBeNull();
  });
});

describe("mailtoHref", () => {
  test("links a single plain address", () => {
    expect(mailtoHref("ops@acme.com")).toBe("mailto:ops@acme.com");
  });

  test("refuses lists, query params, and non-addresses", () => {
    expect(mailtoHref("a@acme.com, b@acme.com")).toBeNull();
    expect(mailtoHref("a@acme.com?bcc=x@evil.com")).toBeNull();
    expect(mailtoHref("ask reception")).toBeNull();
  });
});

describe("telHref", () => {
  test("strips formatting and keeps a leading +", () => {
    expect(telHref("+1 (555) 010-2030")).toBe("tel:+15550102030");
    expect(telHref("02 8123 4567")).toBe("tel:0281234567");
  });

  test("null when there aren't enough digits", () => {
    expect(telHref("ask Jo")).toBeNull();
    expect(telHref("ext 12")).toBeNull();
  });
});

import { createHash } from "node:crypto";

// A fingerprint of exactly what the client will see (the update's fields and
// payload). Preview returns it; Publish rebuilds the update from live data
// and refuses if the fingerprint changed, so nothing is published that the
// expert hasn't previewed.

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export function publishHash(content: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(content))).digest("hex");
}

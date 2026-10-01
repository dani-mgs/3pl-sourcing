import { describe, expect, test } from "vitest";

// Shared rules every "update from document" merge must keep, run against
// each merge function's own fully-filled record (tests only):
//  - a document that mentions nothing leaves the record identical;
//  - a blank or whitespace value never blanks out an existing one;
//  - restating the current values marks nothing Updated;
//  - protected fields (internal judgment, identity) are never overwritten,
//    even if the extraction result somehow carries them;
//  - a genuinely new value is applied and is the only field marked Updated.

type MergeFn<T> = (current: T, extracted: never) => { merged: T; changed: Set<string> };

export function describeMergeRules<T extends object>(
  name: string,
  merge: MergeFn<T>,
  current: T,
  options: { protectedKeys: string[]; textKeys: string[] },
) {
  const run = (extracted: Record<string, unknown>) => merge(current, extracted as never);
  const record = current as Record<string, unknown>;

  describe(`${name}: shared merge rules`, () => {
    test("a document that mentions nothing leaves the record identical", () => {
      const { merged, changed } = run({});
      expect(merged).toEqual(current);
      expect([...changed]).toEqual([]);
    });

    test("null for every field changes nothing", () => {
      const allNull = Object.fromEntries(Object.keys(record).map((k) => [k, null]));
      const { merged, changed } = run(allNull);
      expect(merged).toEqual(current);
      expect([...changed]).toEqual([]);
    });

    test("blank or whitespace text never blanks an existing value", () => {
      for (const blank of ["", "   "]) {
        const blanks = Object.fromEntries(options.textKeys.map((k) => [k, blank]));
        const { merged, changed } = run(blanks);
        expect(merged).toEqual(current);
        expect([...changed]).toEqual([]);
      }
    });

    test("restating the current values marks nothing Updated", () => {
      const { merged, changed } = run({ ...record });
      expect(merged).toEqual(current);
      expect([...changed]).toEqual([]);
    });

    test("protected fields are never overwritten or marked Updated", () => {
      const injected = Object.fromEntries(
        options.protectedKeys.map((k) => [
          k,
          typeof record[k] === "boolean" ? !record[k] : "ZZINJECTED",
        ]),
      );
      const { merged, changed } = run(injected);
      for (const key of options.protectedKeys) {
        expect((merged as Record<string, unknown>)[key], key).toEqual(record[key]);
        expect(changed.has(key), key).toBe(false);
      }
    });

    test("a new value is applied, and only that field is marked Updated", () => {
      for (const key of options.textKeys) {
        const { merged, changed } = run({ [key]: "ZZNEWVALUE" });
        expect((merged as Record<string, unknown>)[key], key).toBe("ZZNEWVALUE");
        expect([...changed], key).toEqual([key]);
      }
    });
  });
}

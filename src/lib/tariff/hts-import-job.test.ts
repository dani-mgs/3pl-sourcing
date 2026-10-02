import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { runHtsImportJob, usDateToIso, type HtsImportStore, type HtsReleaseRecord } from "./hts-import-job";
import { HTS_CHAPTERS, type HtsLineRow } from "./hts-import";

// The import against an in-memory store and a generated schedule: 260 lines
// per chapter (77 empty), about 25,500 in all, enough to pass the sanity check.

const LINES_PER_CHAPTER = 260;

function chapterRows(chapter: string, count = LINES_PER_CHAPTER) {
  if (chapter === "77") return [];
  return Array.from({ length: count }, (_, i) => ({
    htsno: `${chapter}${String(i).padStart(2, "0").slice(-2)}.${String(Math.floor(i / 100)).padStart(2, "0")}.00`,
    indent: "0",
    description: `Line ${i}`,
    units: ["kg"],
    general: "5%",
    special: "",
    other: "25%",
    footnotes: [],
  }));
}

type StoredRelease = HtsReleaseRecord & { lines: Map<string, HtsLineRow[]>; lease_until: string | null; last_error: string | null };

function memoryStore(initial: StoredRelease[] = []) {
  const releases: StoredRelease[] = initial;
  let nextId = releases.length + 1;
  const record = (r: StoredRelease): HtsReleaseRecord => ({
    id: r.id,
    name: r.name,
    status: r.status,
    next_chapter: r.next_chapter,
    chapter_counts: { ...r.chapter_counts },
    row_count: r.row_count,
    attempts: r.attempts,
  });
  const find = (id: string) => releases.find((r) => r.id === id)!;
  const store: HtsImportStore = {
    loadCurrent: async () => {
      const r = releases.find((x) => x.status === "current");
      return r ? record(r) : null;
    },
    loadImporting: async () => {
      const r = releases.find((x) => x.status === "importing");
      return r ? record(r) : null;
    },
    loadByName: async (name) => {
      const r = releases.find((x) => x.name === name);
      return r ? record(r) : null;
    },
    createImport: async (meta) => {
      const r: StoredRelease = {
        id: `r${nextId++}`,
        name: meta.name,
        status: "importing",
        next_chapter: 1,
        chapter_counts: {},
        row_count: 0,
        attempts: 0,
        lines: new Map(),
        lease_until: null,
        last_error: null,
      };
      releases.push(r);
      return record(r);
    },
    restartImport: async (id) => {
      const r = find(id);
      Object.assign(r, { status: "importing", next_chapter: 1, chapter_counts: {}, row_count: 0, attempts: 0, lines: new Map(), last_error: null });
      return record(r);
    },
    claimLease: async (id, untilIso, nowIso) => {
      const r = find(id);
      if (r.lease_until && r.lease_until >= nowIso) return false;
      r.lease_until = untilIso;
      return true;
    },
    releaseLease: async (id) => {
      find(id).lease_until = null;
    },
    replaceChapter: async (id, chapter, lines) => {
      find(id).lines.set(chapter, lines);
    },
    saveProgress: async (id, progress) => {
      Object.assign(find(id), progress, { last_error: null });
    },
    recordError: async (id, message, attempts) => {
      Object.assign(find(id), { last_error: message, attempts, lease_until: null });
    },
    markFailed: async (id, message) => {
      Object.assign(find(id), { status: "failed", last_error: message, lease_until: null, lines: new Map() });
    },
    activate: async (id, expectedRows) => {
      const r = find(id);
      const stored = [...r.lines.values()].reduce((sum, l) => sum + l.length, 0);
      if (r.next_chapter !== 100 || stored !== expectedRows) throw new Error("refused");
      for (const other of releases) {
        if (other.status === "current") Object.assign(other, { status: "superseded", lines: new Map() });
      }
      r.status = "current";
      r.lease_until = null;
    },
  };
  return { store, releases };
}

function fakeApi(releaseName: string, options: { failChapter?: string; chapterRows?: (c: string) => unknown[] } = {}) {
  const calls: string[] = [];
  const fetchJson = vi.fn(async (url: string) => {
    calls.push(url);
    if (url.endsWith("/currentRelease")) return { name: releaseName, description: "desc", title: "Revision X (2026)" };
    if (url.endsWith("/releaseList")) return [{ name: releaseName, releaseStartDate: "09/28/2026" }];
    const chapter = /from=(\d{2})00/.exec(url)![1];
    if (chapter === options.failChapter) throw new Error("timeout");
    return (options.chapterRows ?? chapterRows)(chapter);
  });
  return { fetchJson, calls };
}

// A clock that advances `stepMs` every time it's read.
function clock(stepMs = 0) {
  let t = Date.UTC(2026, 9, 2, 3, 15);
  return () => (t += stepMs);
}

const OPTIONS = { budgetMs: 120_000, leaseMs: 300_000 };
const currentRelease = (name: string, perChapter = LINES_PER_CHAPTER): StoredRelease => ({
  id: "r0",
  name,
  status: "current",
  next_chapter: 100,
  chapter_counts: Object.fromEntries(HTS_CHAPTERS.map((c) => [c, c === "77" ? 0 : perChapter])),
  row_count: perChapter * 98,
  attempts: 0,
  lines: new Map(),
  lease_until: null,
  last_error: null,
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("usDateToIso", () => {
  test("converts USITC's MM/DD/YYYY", () => {
    expect(usDateToIso("09/28/2026")).toBe("2026-09-28");
    expect(usDateToIso(null)).toBeNull();
    expect(usDateToIso("2026-09-28")).toBeNull();
  });
});

describe("runHtsImportJob", () => {
  test("does nothing when the current release is already USITC's", async () => {
    const { store } = memoryStore([currentRelease("2026HTSRev20")]);
    const api = fakeApi("2026HTSRev20");
    const result = await runHtsImportJob({ fetchJson: api.fetchJson, store, now: clock() }, OPTIONS);
    expect(result).toEqual({ ok: true, status: "up_to_date", release: "2026HTSRev20" });
    expect(api.calls.some((u) => u.includes("exportList"))).toBe(false);
  });

  test("imports a new release in one run and activates it", async () => {
    const { store, releases } = memoryStore([currentRelease("2026HTSRev19")]);
    const api = fakeApi("2026HTSRev20");
    const result = await runHtsImportJob({ fetchJson: api.fetchJson, store, now: clock() }, OPTIONS);
    expect(result).toMatchObject({ ok: true, status: "activated", release: "2026HTSRev20", rows: LINES_PER_CHAPTER * 98 });
    expect(releases.find((r) => r.name === "2026HTSRev20")!.status).toBe("current");
    expect(releases.find((r) => r.name === "2026HTSRev19")!.status).toBe("superseded");
  });

  test("resumes across runs when the time budget runs out, switching only at the end", async () => {
    const { store, releases } = memoryStore([currentRelease("2026HTSRev19")]);
    const api = fakeApi("2026HTSRev20");
    // Each clock read advances 1 s; a chapter reads it once, so ~40 per run.
    const now = clock(1_000);
    const options = { budgetMs: 40_000, leaseMs: 300_000 };

    const first = await runHtsImportJob({ fetchJson: api.fetchJson, store, now }, options);
    expect(first).toMatchObject({ ok: true, status: "in_progress", release: "2026HTSRev20" });
    expect(releases.find((r) => r.name === "2026HTSRev19")!.status).toBe("current");
    const afterFirst = first.ok && first.status === "in_progress" ? first.nextChapter : 0;
    expect(afterFirst).toBeGreaterThan(1);
    expect(afterFirst).toBeLessThan(100);

    let result = first;
    let runs = 1;
    while (result.ok && result.status === "in_progress" && runs < 10) {
      result = await runHtsImportJob({ fetchJson: api.fetchJson, store, now }, options);
      runs += 1;
    }
    expect(result).toMatchObject({ ok: true, status: "activated" });
    expect(runs).toBeGreaterThan(2);
    // Every chapter fetched exactly once across the runs.
    const exports = api.calls.filter((u) => u.includes("exportList"));
    expect(exports).toHaveLength(99);
    expect(releases.find((r) => r.name === "2026HTSRev20")!.status).toBe("current");
  });

  test("a failed chapter stops the run, records the error, and the next run retries from it", async () => {
    const { store, releases } = memoryStore([currentRelease("2026HTSRev19")]);
    const failing = fakeApi("2026HTSRev20", { failChapter: "42" });
    const result = await runHtsImportJob({ fetchJson: failing.fetchJson, store, now: clock() }, OPTIONS);
    expect(result).toEqual({ ok: false, error: "Fetching chapter 42 failed.", release: "2026HTSRev20" });
    const importing = releases.find((r) => r.name === "2026HTSRev20")!;
    expect(importing).toMatchObject({ status: "importing", next_chapter: 42, attempts: 1, last_error: "Fetching chapter 42 failed." });
    expect(releases.find((r) => r.name === "2026HTSRev19")!.status).toBe("current");

    const healthy = fakeApi("2026HTSRev20");
    const retry = await runHtsImportJob({ fetchJson: healthy.fetchJson, store, now: clock() }, OPTIONS);
    expect(retry).toMatchObject({ ok: true, status: "activated" });
    expect(healthy.calls.filter((u) => u.includes("exportList"))[0]).toContain("from=4200");
  });

  test("an import that fails the sanity check never replaces the current release", async () => {
    const { store, releases } = memoryStore([currentRelease("2026HTSRev19")]);
    // Chapter 84 comes back with 5 lines instead of 260.
    const api = fakeApi("2026HTSRev20", { chapterRows: (c) => chapterRows(c, c === "84" ? 5 : LINES_PER_CHAPTER) });
    const result = await runHtsImportJob({ fetchJson: api.fetchJson, store, now: clock() }, OPTIONS);
    expect(result).toMatchObject({ ok: false, release: "2026HTSRev20" });
    expect(!result.ok && result.error).toContain("Chapter 84");
    expect(releases.find((r) => r.name === "2026HTSRev20")!.status).toBe("failed");
    expect(releases.find((r) => r.name === "2026HTSRev19")!.status).toBe("current");
  });

  test("an empty chapter (other than 77) is an error, not an empty import", async () => {
    const { store } = memoryStore();
    const api = fakeApi("2026HTSRev20", { chapterRows: (c) => (c === "03" ? [] : chapterRows(c)) });
    const result = await runHtsImportJob({ fetchJson: api.fetchJson, store, now: clock() }, OPTIONS);
    expect(result).toEqual({ ok: false, error: "Chapter 03 came back empty.", release: "2026HTSRev20" });
  });

  test("abandons an unfinished import once USITC publishes a newer release", async () => {
    const { store, releases } = memoryStore([currentRelease("2026HTSRev18")]);
    await runHtsImportJob({ fetchJson: fakeApi("2026HTSRev19", { failChapter: "10" }).fetchJson, store, now: clock() }, OPTIONS);
    expect(releases.find((r) => r.name === "2026HTSRev19")!.status).toBe("importing");

    const result = await runHtsImportJob({ fetchJson: fakeApi("2026HTSRev20").fetchJson, store, now: clock() }, OPTIONS);
    expect(result).toMatchObject({ ok: true, status: "activated", release: "2026HTSRev20" });
    expect(releases.find((r) => r.name === "2026HTSRev19")).toMatchObject({ status: "failed" });
  });

  test("another run holding the import leaves it alone", async () => {
    const { store, releases } = memoryStore([currentRelease("2026HTSRev19")]);
    const now = clock();
    await runHtsImportJob({ fetchJson: fakeApi("2026HTSRev20", { failChapter: "50" }).fetchJson, store, now }, OPTIONS);
    // Simulate a run in progress holding the lease.
    releases.find((r) => r.name === "2026HTSRev20")!.lease_until = "2999-01-01T00:00:00.000Z";
    const result = await runHtsImportJob({ fetchJson: fakeApi("2026HTSRev20").fetchJson, store, now }, OPTIONS);
    expect(result).toEqual({ ok: true, status: "busy", release: "2026HTSRev20" });
  });

  test("restarts a release whose earlier import failed", async () => {
    const { store, releases } = memoryStore([currentRelease("2026HTSRev19")]);
    await runHtsImportJob(
      { fetchJson: fakeApi("2026HTSRev20", { chapterRows: (c) => chapterRows(c, c === "84" ? 5 : LINES_PER_CHAPTER) }).fetchJson, store, now: clock() },
      OPTIONS,
    );
    expect(releases.find((r) => r.name === "2026HTSRev20")!.status).toBe("failed");

    const result = await runHtsImportJob({ fetchJson: fakeApi("2026HTSRev20").fetchJson, store, now: clock() }, OPTIONS);
    expect(result).toMatchObject({ ok: true, status: "activated", release: "2026HTSRev20" });
  });

  test("a USITC outage changes nothing", async () => {
    const { store, releases } = memoryStore([currentRelease("2026HTSRev19")]);
    const result = await runHtsImportJob(
      { fetchJson: async () => { throw new Error("down"); }, store, now: clock() },
      OPTIONS,
    );
    expect(result).toEqual({ ok: false, error: "HTS release check failed." });
    expect(releases).toHaveLength(1);
  });
});

describe("PGRST303 retry around each Supabase call (same rules as the FX job)", () => {
  const pgrst303 = () =>
    Object.assign(new Error("JWT issued at future: token-detail-do-not-log"), { code: "PGRST303" });
  const noSleep = async () => {};

  test("retries a read that hits PGRST303, then carries on", async () => {
    const { store } = memoryStore([currentRelease("2026HTSRev20")]);
    const loadCurrent = store.loadCurrent;
    let calls = 0;
    store.loadCurrent = async () => {
      calls += 1;
      if (calls <= 2) throw pgrst303();
      return loadCurrent();
    };
    const result = await runHtsImportJob(
      { fetchJson: fakeApi("2026HTSRev20").fetchJson, store, now: clock(), sleep: noSleep },
      OPTIONS,
    );
    expect(result).toEqual({ ok: true, status: "up_to_date", release: "2026HTSRev20" });
    expect(calls).toBe(3);
    const retryLogs = vi.mocked(console.warn).mock.calls.map((c) => String(c[0])).filter((m) => m.includes("PGRST303"));
    expect(retryLogs).toEqual([
      "HTS import: loading the current release: Supabase returned PGRST303 (attempt 1 of 6); retrying in 500 ms.",
      "HTS import: loading the current release: Supabase returned PGRST303 (attempt 2 of 6); retrying in 1000 ms.",
    ]);
    // Only the label, attempt and code are logged, never the error's message.
    expect(retryLogs.join(" ")).not.toContain("token-detail-do-not-log");
  });

  test("retries a chapter write that hits PGRST303; the chapter is stored once", async () => {
    const { store, releases } = memoryStore([currentRelease("2026HTSRev19")]);
    const replace = store.replaceChapter;
    let failedOnce = false;
    store.replaceChapter = async (id, chapter, lines) => {
      if (chapter === "42" && !failedOnce) {
        failedOnce = true;
        throw pgrst303();
      }
      return replace(id, chapter, lines);
    };
    const result = await runHtsImportJob(
      { fetchJson: fakeApi("2026HTSRev20").fetchJson, store, now: clock(), sleep: noSleep },
      OPTIONS,
    );
    expect(result).toMatchObject({ ok: true, status: "activated", rows: LINES_PER_CHAPTER * 98 });
    expect(failedOnce).toBe(true);
    expect(releases.find((r) => r.name === "2026HTSRev20")!.lines.get("42")).toHaveLength(LINES_PER_CHAPTER);
  });

  test("other database errors are not retried", async () => {
    const { store } = memoryStore([currentRelease("2026HTSRev20")]);
    let calls = 0;
    store.loadCurrent = async () => {
      calls += 1;
      throw Object.assign(new Error("permission denied"), { code: "42501" });
    };
    const result = await runHtsImportJob(
      { fetchJson: fakeApi("2026HTSRev20").fetchJson, store, now: clock(), sleep: noSleep },
      OPTIONS,
    );
    expect(result).toEqual({ ok: false, error: "HTS import database step failed.", release: "2026HTSRev20" });
    expect(calls).toBe(1);
  });

  test("activates nothing when a write keeps failing with PGRST303", async () => {
    const { store, releases } = memoryStore([currentRelease("2026HTSRev19")]);
    store.replaceChapter = async () => {
      throw pgrst303();
    };
    const result = await runHtsImportJob(
      { fetchJson: fakeApi("2026HTSRev20").fetchJson, store, now: clock(), sleep: noSleep },
      OPTIONS,
    );
    expect(result).toMatchObject({ ok: false, release: "2026HTSRev20" });
    expect(releases.find((r) => r.name === "2026HTSRev19")!.status).toBe("current");
    expect(releases.find((r) => r.name === "2026HTSRev20")!.status).toBe("importing");
  });
});

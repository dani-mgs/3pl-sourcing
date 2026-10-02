import {
  EMPTY_CHAPTERS,
  HTS_API_BASE,
  buildHtsLines,
  chapter99Digest,
  chapterExportUrl,
  checkImportSanity,
  currentReleaseSchema,
  releaseListSchema,
  type ChapterCounts,
  type HtsLineRow,
} from "./hts-import";
import { retryOnPgrst303, type Sleep } from "@/lib/supabase/pgrst303-retry";

// The HTS import, run by /api/cron/hts-release. Resumable: each run imports
// chapters in order until its time budget is used, saving progress on the
// release row after every chapter, and the next run carries on. When every
// chapter is in and the counts look sane, the release is activated in one
// database transaction. A failed or partial import never replaces the current
// release. Data access is passed in so this is testable without a network or
// database.

export type HtsReleaseStatus = "importing" | "current" | "superseded" | "failed";

export type HtsReleaseRecord = {
  id: string;
  name: string;
  status: HtsReleaseStatus;
  next_chapter: number;
  chapter_counts: ChapterCounts;
  row_count: number;
  attempts: number;
};

export type ReleaseMeta = {
  name: string;
  title: string | null;
  releaseStartDate: string | null;
};

export type HtsImportStore = {
  loadCurrent: () => Promise<HtsReleaseRecord | null>;
  loadImporting: () => Promise<HtsReleaseRecord | null>;
  loadByName: (name: string) => Promise<HtsReleaseRecord | null>;
  createImport: (meta: ReleaseMeta) => Promise<HtsReleaseRecord>;
  // A failed release starts over: progress reset, its lines deleted.
  restartImport: (id: string, meta: ReleaseMeta) => Promise<HtsReleaseRecord>;
  // Takes the release for this run unless another run holds it. False if held.
  claimLease: (id: string, untilIso: string, nowIso: string) => Promise<boolean>;
  releaseLease: (id: string) => Promise<void>;
  // Deletes the chapter's lines for this release, then inserts these.
  replaceChapter: (id: string, chapter: string, lines: HtsLineRow[]) => Promise<void>;
  saveProgress: (
    id: string,
    progress: {
      next_chapter: number;
      chapter_counts: ChapterCounts;
      row_count: number;
      chapter99_digest?: string;
    },
  ) => Promise<void>;
  recordError: (id: string, message: string, attempts: number) => Promise<void>;
  // Gives up on a release: status 'failed', lines deleted.
  markFailed: (id: string, message: string) => Promise<void>;
  activate: (id: string, expectedRows: number) => Promise<void>;
};

export type HtsImportDeps = {
  fetchJson: (url: string) => Promise<unknown>;
  store: HtsImportStore;
  now?: () => number;
  sleep?: Sleep;
};

export type HtsImportOptions = {
  // Stop starting new chapters after this long, so a run ends well inside the
  // route's maxDuration even when the last chapter is slow.
  budgetMs: number;
  // How long a run holds the release (at least the route's maxDuration).
  leaseMs: number;
};

export type HtsImportResult =
  | { ok: true; status: "up_to_date"; release: string }
  | { ok: true; status: "busy"; release: string }
  | { ok: true; status: "in_progress"; release: string; nextChapter: number; imported: string[] }
  | { ok: true; status: "activated"; release: string; rows: number; imported: string[] }
  | { ok: false; error: string; release?: string };

// "09/28/2026" → "2026-09-28".
export function usDateToIso(value: string | null | undefined): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value ?? "");
  return match ? `${match[3]}-${match[1]}-${match[2]}` : null;
}

async function fetchReleaseMeta(fetchJson: HtsImportDeps["fetchJson"]): Promise<ReleaseMeta> {
  const current = currentReleaseSchema.parse(await fetchJson(`${HTS_API_BASE}/currentRelease`));
  const list = releaseListSchema.parse(await fetchJson(`${HTS_API_BASE}/releaseList`));
  const entry = list.find((r) => r.name === current.name);
  return {
    name: current.name,
    title: current.title ?? current.description ?? null,
    releaseStartDate: usDateToIso(entry?.releaseStartDate),
  };
}

export async function runHtsImportJob(
  deps: HtsImportDeps,
  options: HtsImportOptions,
): Promise<HtsImportResult> {
  const now = deps.now ?? Date.now;
  const started = now();
  const db = <T>(label: string, call: () => Promise<T>) =>
    retryOnPgrst303(`HTS import: ${label}`, call, deps.sleep);

  let meta: ReleaseMeta;
  try {
    meta = await fetchReleaseMeta(deps.fetchJson);
  } catch (error) {
    console.error("HTS import: checking the current release failed:", error);
    return { ok: false, error: "HTS release check failed." };
  }

  let release: HtsReleaseRecord | null;
  try {
    const [current, importing] = await Promise.all([
      db("loading the current release", deps.store.loadCurrent),
      db("loading an import in progress", deps.store.loadImporting),
    ]);
    release = importing;

    if (release && release.name !== meta.name) {
      // USITC moved on before this import finished; start the newer one.
      await db("abandoning a superseded import", () =>
        deps.store.markFailed(release!.id, `Superseded by ${meta.name} before the import finished.`),
      );
      console.warn(`HTS import: abandoned ${release.name}; ${meta.name} is now current at USITC.`);
      release = null;
    }

    if (!release) {
      if (current?.name === meta.name) return { ok: true, status: "up_to_date", release: meta.name };
      const existing = await db("looking up the release", () => deps.store.loadByName(meta.name));
      if (existing?.status === "failed") {
        release = await db("restarting a failed import", () =>
          deps.store.restartImport(existing.id, meta),
        );
      } else if (existing) {
        console.error(`HTS import: USITC's current release ${meta.name} is already ${existing.status} here.`);
        return { ok: false, error: "USITC's current release is older than ours.", release: meta.name };
      } else {
        release = await db("starting an import", () => deps.store.createImport(meta));
      }
    }

    const claimed = await db("claiming the import", () =>
      deps.store.claimLease(
        release!.id,
        new Date(now() + options.leaseMs).toISOString(),
        new Date(now()).toISOString(),
      ),
    );
    if (!claimed) return { ok: true, status: "busy", release: release.name };

    return await importChapters(deps, options, release, current, started, db);
  } catch (error) {
    console.error("HTS import: database step failed:", error);
    return { ok: false, error: "HTS import database step failed.", release: meta.name };
  }
}

async function importChapters(
  deps: HtsImportDeps,
  options: HtsImportOptions,
  release: HtsReleaseRecord,
  current: HtsReleaseRecord | null,
  started: number,
  db: <T>(label: string, call: () => Promise<T>) => Promise<T>,
): Promise<HtsImportResult> {
  const now = deps.now ?? Date.now;
  const counts: ChapterCounts = { ...release.chapter_counts };
  const imported: string[] = [];
  let next = release.next_chapter;

  const fail = async (message: string): Promise<HtsImportResult> => {
    console.error(`HTS import (${release.name}):`, message);
    await db("recording the error", () =>
      deps.store.recordError(release.id, message, release.attempts + 1),
    );
    return { ok: false, error: message, release: release.name };
  };

  while (next <= 99) {
    if (now() - started >= options.budgetMs) break;
    const chapter = String(next).padStart(2, "0");

    let body: unknown;
    try {
      body = await deps.fetchJson(chapterExportUrl(chapter));
    } catch (error) {
      console.error(`HTS import: fetching chapter ${chapter} failed:`, error);
      return fail(`Fetching chapter ${chapter} failed.`);
    }

    const built = buildHtsLines(chapter, body);
    if (!built.ok) return fail(built.error);
    if (built.lines.length === 0 && !EMPTY_CHAPTERS.includes(chapter)) {
      return fail(`Chapter ${chapter} came back empty.`);
    }

    await db(`storing chapter ${chapter}`, () =>
      deps.store.replaceChapter(release.id, chapter, built.lines),
    );
    counts[chapter] = built.lines.length;
    next += 1;
    await db(`saving progress after chapter ${chapter}`, () =>
      deps.store.saveProgress(release.id, {
        next_chapter: next,
        chapter_counts: counts,
        row_count: Object.values(counts).reduce((sum, n) => sum + n, 0),
        ...(chapter === "99" ? { chapter99_digest: chapter99Digest(built.lines) } : {}),
      }),
    );
    imported.push(chapter);
  }

  if (next <= 99) {
    await db("releasing the import", () => deps.store.releaseLease(release.id));
    return { ok: true, status: "in_progress", release: release.name, nextChapter: next, imported };
  }

  const sanity = checkImportSanity(counts, current?.chapter_counts ?? null);
  if (!sanity.ok) {
    console.error(`HTS import (${release.name}): failed the sanity check:`, sanity.error);
    await db("marking the import failed", () => deps.store.markFailed(release.id, sanity.error));
    return { ok: false, error: `Import failed the sanity check: ${sanity.error}`, release: release.name };
  }

  const rows = Object.values(counts).reduce((sum, n) => sum + n, 0);
  try {
    await db("activating the release", () => deps.store.activate(release.id, rows));
  } catch (error) {
    console.error(`HTS import (${release.name}): activation failed:`, error);
    await db("marking the import failed", () =>
      deps.store.markFailed(release.id, "Activation failed (stored rows didn't match)."),
    );
    return { ok: false, error: "Activation failed.", release: release.name };
  }
  console.info(`HTS import: ${release.name} is now current (${rows} lines).`);
  return { ok: true, status: "activated", release: release.name, rows, imported };
}

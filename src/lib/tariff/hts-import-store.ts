import type { SupabaseClient } from "@supabase/supabase-js";
import type { HtsImportStore, HtsReleaseRecord } from "./hts-import-job";

// The HTS import's database access, for the cron route's service-role
// client. It touches only hts_releases, hts_lines and activate_hts_release.

const RELEASE_COLUMNS = "id, name, status, next_chapter, chapter_counts, row_count, attempts";
// Rows per insert request; keeps each request well under PostgREST's limits.
const INSERT_CHUNK = 1000;

function check<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data;
}

export function createHtsImportStore(supabase: SupabaseClient): HtsImportStore {
  const releases = () => supabase.from("hts_releases");

  async function loadOne(column: string, value: string): Promise<HtsReleaseRecord | null> {
    return check(
      await releases().select(RELEASE_COLUMNS).eq(column, value).maybeSingle(),
    ) as HtsReleaseRecord | null;
  }

  async function deleteLines(id: string) {
    check(await supabase.from("hts_lines").delete().eq("release_id", id));
  }

  return {
    loadCurrent: () => loadOne("status", "current"),
    loadImporting: () => loadOne("status", "importing"),
    loadByName: (name) => loadOne("name", name),

    async createImport(meta) {
      return check(
        await releases()
          .insert({ name: meta.name, title: meta.title, release_start_date: meta.releaseStartDate })
          .select(RELEASE_COLUMNS)
          .single(),
      ) as HtsReleaseRecord;
    },

    async restartImport(id, meta) {
      await deleteLines(id);
      return check(
        await releases()
          .update({
            status: "importing",
            title: meta.title,
            release_start_date: meta.releaseStartDate,
            next_chapter: 1,
            chapter_counts: {},
            row_count: 0,
            chapter99_digest: null,
            lease_until: null,
            attempts: 0,
            last_error: null,
            started_at: new Date().toISOString(),
            completed_at: null,
          })
          .eq("id", id)
          .eq("status", "failed")
          .select(RELEASE_COLUMNS)
          .single(),
      ) as HtsReleaseRecord;
    },

    async claimLease(id, untilIso, nowIso) {
      const rows = check(
        await releases()
          .update({ lease_until: untilIso })
          .eq("id", id)
          .eq("status", "importing")
          .or(`lease_until.is.null,lease_until.lt."${nowIso}"`)
          .select("id"),
      );
      return (rows ?? []).length === 1;
    },

    async releaseLease(id) {
      check(await releases().update({ lease_until: null }).eq("id", id));
    },

    async replaceChapter(id, chapter, lines) {
      check(await supabase.from("hts_lines").delete().eq("release_id", id).eq("chapter", chapter));
      for (let i = 0; i < lines.length; i += INSERT_CHUNK) {
        const chunk = lines.slice(i, i + INSERT_CHUNK).map((line) => ({ ...line, release_id: id }));
        check(await supabase.from("hts_lines").insert(chunk));
      }
    },

    async saveProgress(id, progress) {
      check(
        await releases()
          .update({
            ...progress,
            last_error: null,
            ...(progress.next_chapter === 100 ? { completed_at: new Date().toISOString() } : {}),
          })
          .eq("id", id),
      );
    },

    async recordError(id, message, attempts) {
      check(
        await releases().update({ last_error: message, attempts, lease_until: null }).eq("id", id),
      );
    },

    async markFailed(id, message) {
      check(
        await releases()
          .update({ status: "failed", last_error: message, lease_until: null })
          .eq("id", id),
      );
      await deleteLines(id);
    },

    async activate(id, expectedRows) {
      check(
        await supabase.rpc("activate_hts_release", {
          p_release_id: id,
          p_expected_rows: expectedRows,
        }),
      );
    },
  };
}

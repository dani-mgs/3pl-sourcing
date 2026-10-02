import { createAdminClient } from "@/lib/supabase/admin-client";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runHtsImportJob } from "@/lib/tariff/hts-import-job";
import { createHtsImportStore } from "@/lib/tariff/hts-import-store";

// HTS reference data for the Tariff Calculator, run by Vercel Cron several
// times a day (schedules in vercel.json). Checks USITC's current release and,
// when it's new, imports it a batch of chapters per run until complete (see
// runHtsImportJob). Protected by CRON_SECRET instead of a user; its
// service-role use is limited to hts_releases, hts_lines and
// activate_hts_release (docs/SECURITY.md, "Service-role exception: cron
// routes").

// A run stops starting chapters after BUDGET_MS. The slowest single chapter
// it can then still be working on is bounded by the 30 s fetch timeout plus a
// few PGRST303 retry rounds (about 15.5 s each) on its delete, inserts and
// progress write, so a run ends well inside 300 s, the Hobby maximum. The
// whole schedule normally imports in one run (about 30,000 lines).
export const maxDuration = 300;
const BUDGET_MS = 120_000;
const FETCH_TIMEOUT_MS = 30_000;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runHtsImportJob(
    {
      fetchJson: async (url) => {
        const response = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`HTS API responded ${response.status}`);
        return response.json();
      },
      store: createHtsImportStore(createAdminClient()),
    },
    { budgetMs: BUDGET_MS, leaseMs: maxDuration * 1000 },
  );

  // Logged details stay server-side; the response is only seen by Vercel Cron.
  return Response.json(result, { status: result.ok ? 200 : 500 });
}

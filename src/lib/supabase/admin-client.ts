// SERVER-ONLY. Bypasses RLS. Never expose to the client. Every function
// using this must independently verify admin role first — with one
// documented exceptions: cron routes under /api/cron/ (/api/cron/fx-rates and
// /api/cron/hts-release), which have no user and verify CRON_SECRET instead
// (docs/SECURITY.md, "Service-role exception: cron routes"); and
// src/lib/tariff/estimate-store.ts, which runs save_duty_estimate() for
// saveEstimate after its user checks (docs/SECURITY.md, "Service-role
// exception: saveEstimate"). service-role-use.test.ts lists every use.
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

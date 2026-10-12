import { requireClient } from "@/lib/auth/require-client";
import { createClient } from "@/lib/supabase/server";
import { effectiveTier, TIER_LABELS } from "@/lib/client-tiers";

// Phase 1: an empty portal. The client user can read exactly one row of
// anything: their own client's plan (RLS), which is all this shows.
export default async function PortalHomePage() {
  const { firstName } = await requireClient();
  const supabase = await createClient();
  const { data: entitlement } = await supabase.from("client_entitlements").select("tier, valid_until").maybeSingle();
  const tier = effectiveTier(entitlement);

  return (
    <div className="mx-auto w-full max-w-2xl rounded-2xl border border-neutral-border bg-white p-8 shadow-sm">
      <h1 className="mb-2 font-display text-2xl font-semibold text-move-navy">
        {firstName ? `Hello, ${firstName}` : "Hello"}
      </h1>
      <p className="text-sm text-move-navy">Your portal is coming soon.</p>
      <p className="mt-2 text-sm text-neutral-muted">
        Here you&apos;ll see where each of your projects with Move stands, what happens next, and
        anything we need from you.
      </p>
      <p className="mt-6 text-xs text-neutral-muted">Your plan: {TIER_LABELS[tier]}</p>
    </div>
  );
}

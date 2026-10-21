// SERVER-ONLY. Landed Cost ships behind LANDED_COST_ENABLED: only the exact
// string "true" turns it on. Off, its pages are a 404, its Server Actions
// refuse, and the nav shows it as "Soon". Read on the server only and passed
// down as plain data: client components never read it (feature-flag.test.tsx).
// On Vercel a change takes effect after a redeploy.
export function isLandedCostEnabled(): boolean {
  return process.env.LANDED_COST_ENABLED === "true";
}

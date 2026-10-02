# Technical Debt Log

Tracks known shortcuts, deferred work, and things that need revisiting later. Not a task list — only add an entry when something is deliberately left imperfect to move faster, not for routine bugs.

## Open

### Tariff duty data: gaps left for experts (not machine-readable or not decidable)
- **Added:** 2026-10-02
- **What:** The PR 2a seed took only what the primary sources state as text. Left out, for tariff editors to add from the sources: forced-labour note 52(b) product list and Annex II Part A (9903.05.86), (d) civil aircraft list (9903.05.88), (e) pharmaceutical-use list (9903.05.89), the (j)(1)-(13)(i) country product lists (9903.05.96-.99, 9903.06.02/.04/.06/.07/.09/.10/.12/.14/.16/.18/.20) — all published only as images in FR 2026-15181; donations and informational materials (9903.05.91/.92, 9903.05.08/.09), which an HTS code can't decide; the expired in-transit windows (9903.05.85, 9903.05.02). Legal status is seeded `in_force` for every row: the forced-labour action is challenged at the CIT (argued 2026-09-30, per press reports), but no primary source was loaded, so an editor should set `in_force_under_litigation` with a court source. Section 232, China/Nicaragua 301 and Canada 338 aren't loaded (PR 2b and later), so Section 232 goods show "exempt if Section 232 applies".
- **Why deferred:** Primary-source-only rule; image tables need manual transcription and a second check.
- **Severity:** Medium (estimates name the gap; nothing is silently zero)
- **Where:** Tariff Calculator → Duty data; `supabase/migrations/20261002151203_tariff_seed_origin_duties.sql` header

### Tariff Calculator: rounding and single-line MPF are assumptions
- **Added:** 2026-10-02
- **What:** Each estimate line rounds once, half up to the cent, and the MPF minimum/maximum are applied to the one line as if it were the whole entry. CBP's exact per-line rounding in ACE wasn't confirmed against a primary source; differences should be cents, but a multi-line entry's MPF can differ a lot. Both are stated on every estimate and in /help.
- **Why deferred:** v1 estimates one line; confirming ACE rounding needs a broker or CBP reference.
- **Severity:** Low
- **Where:** `src/lib/tariff/calculate.ts`, `src/lib/tariff/caveats.ts`

### Tariff Calculator: saved estimates trust RLS for who can insert
- **Added:** 2026-10-02
- **What:** The save action recalculates on the server, but RLS lets any signed-in user insert a `duty_estimates` row directly through the API (with their own `created_by`), so a determined user could store numbers the calculator never produced. Rows are still locked afterwards and attributed to that user.
- **Why deferred:** Users are internal staff, and the same holds for quotes. **Must be closed before any client-facing use** (an export, a client report, or the Landed Cost Calculator showing estimates to clients): replace the insert policy with a security-definer function that builds the row from the server-side calculation, or insert via a server-only path.
- **Severity:** Low (internal only); High before client-facing use
- **Where:** `supabase/migrations/20261002135142_tariff_duty_estimates.sql` (insert policy)

### PGRST303 is only retried in the cron jobs
- **Added:** 2026-10-01 (HTS import cron added 2026-10-02)
- **What:** PostgREST's PGRST303 (JWT claims couldn't be validated — with Supabase's signing keys, usually brief clock skew between the server and the API) is retried with backoff only around the FX and HTS import jobs' Supabase calls (`retryOnPgrst303` in `src/lib/supabase/pgrst303-retry.ts`). Every other server-side Supabase call (pages, Server Actions, exports, admin actions) would surface it as a one-off error ("An unexpected error occurred" or an empty page) that a reload fixes.
- **Why deferred:** It's only been seen on the unattended cron run, which has no user to retry and no second chance until the next day; interactive calls have a person who can reload. Wrapping every call is a wider change than the cron fix. Not to be "fixed" by switching back to the legacy JWT keys.
- **Severity:** Low
- **Where:** server-side `createClient()` / `createAdminClient()` callers; reuse `retryOnPgrst303` if it shows up there.

### No timeout around document parsing (pdf-parse / mammoth)
- **Added:** 2026-09-30 (security audit)
- **What:** `src/lib/document-extraction.ts` parses uploaded .pdf/.docx files with pdf-parse and mammoth with no time limit; a pathological file (deeply nested or malformed PDF, zip-bomb-style DOCX) could tie up a server instance until the platform's function timeout. The only upload bound today is the 10mb Server Action body limit in `next.config.ts`.
- **Why deferred:** Uploads come only from signed-in experts, and there's no sign of problem files in real use yet; adding a timeout/abort wrapper is worth doing once we see actual usage patterns.
- **Severity:** Medium
- **Where:** `src/lib/document-extraction.ts` (the `PDFParse` and `mammoth.extractRawText` calls)

### No rate limiting on AI-extraction Server Actions
- **Added:** 2026-09-30 (security audit)
- **What:** The five document-extraction Server Actions (3PL project intake, 3PL provider, forwarder project, forwarder, quote) each make a paid Anthropic API call per invocation with no per-user rate limit, so a buggy client loop or a misused account could run up cost. docs/SECURITY.md flags side-effecting actions for rate-limiting review.
- **Why deferred:** Only authenticated internal users can reach these, and usage volume is unknown; pick a limit once real usage gives a baseline.
- **Severity:** Medium
- **Where:** `extract-actions.ts` / `extract-provider-actions.ts` under `src/app/(authenticated)/3pl-sourcing/` and `src/app/(authenticated)/forwarder-sourcing/`

### 3PL cost comparison has no tie handling
- **Added:** 2026-10-01 (found while writing /help)
- **What:** `rankByTotalCost` sorts by total cost and numbers the result 1, 2, 3…, so 3PLs with equal totals get consecutive ranks in whatever order the sort leaves them, and one of them looks cheaper than the other. Forwarder ranking already shares a rank across ties.
- **Why deferred:** Changes ranking output on existing 3PL projects and the Recommendation's top three, so it needs its own decision and tests.
- **Severity:** Low
- **Where:** `src/lib/cost-comparison.ts` (`rankByTotalCost`)

### Forwarder ranking basis — open decision
- **Added:** 2026-09-28
- **What:** Cost Rank and savings use Freight Cost only, matching the original spreadsheet. Total Comparable Logistics Cost (freight + duties & taxes + other charges) may be the fairer basis against a DDP baseline, where duties are included.
- **Status:** Still pending Dani's decision; no code change until then.
- **Owner:** Dani. Revisit before Forwarder Sourcing goes live.
- **Where:** src/lib/forwarder/cost-comparison.ts

### New Project button clipped on project lists at phone width
- **Added:** 2026-10-01 (found while checking the 390px header)
- **What:** At 390px wide, the 3PL and Forwarder Sourcing project lists keep the search box and the New Project button on one row, so the button runs off the right edge and reads "New Proje". The page doesn't scroll sideways, so the button is cut off rather than reachable. The header above it is fine.
- **Why deferred:** Found during a docs-only tidy; the fix (letting the row wrap, or stacking search under the title on small screens) is a layout change for its own commit.
- **Severity:** Low
- **Where:** `src/app/(authenticated)/3pl-sourcing/dashboard-content.tsx`, `src/app/(authenticated)/forwarder-sourcing/forwarder-project-list.tsx`

### Inconsistent timestamp column naming across tables
- **Added:** 2026-08-19 (Week 2 review/cleanup)
- **What:** projects uses "date_created" while providers and documents/provider_documents use "created_at"/"uploaded_at" — inconsistent naming convention across the schema.
- **Why deferred:** Cosmetic at the schema level, doesn't affect functionality. Renaming now would touch working tables mid-build for no functional gain.
- **Severity:** Low

## Resolved

### Migrate `src/middleware.ts` to `proxy.ts` (Next.js 16)
- **Added:** 2026-10-01
- **What:** Next.js 16 deprecates the `middleware` file convention in favor of `proxy`; `src/middleware.ts` still works but should move via `npx @next/codemod middleware-to-proxy`. It carries the security headers (CSP, X-Frame-Options, etc., from `src/lib/supabase/middleware.ts`) and the Supabase session refresh, so afterward verify both: curl a page and check the response headers are all still present, and confirm a login persists across navigation and a reload.
- **Why deferred:** The deprecated file still works in Next.js 16, and because it's security- and auth-critical it should be migrated on its own with that verification, not bundled into another change.
- **Severity:** Medium
- **Where:** `src/middleware.ts`, `src/lib/supabase/middleware.ts`
- **Resolved:** 2026-10-01 — `npx @next/codemod middleware-to-proxy` renamed `src/middleware.ts` to `src/proxy.ts` and its export to `proxy`; the matcher and `src/lib/supabase/middleware.ts` (`updateSession`: session refresh, login redirect with the `/api/cron/` exemption, security headers) are unchanged. Verified on a production build (`next start`): every response, including the /login redirect and the cron 401, carries CSP (with the Supabase URL in `connect-src`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and HSTS; signed-out `/` and `/forwarder-sourcing` 307 to /login; `/api/cron/fx-rates` with no or a wrong secret returns 401 JSON, not a redirect; a login survived client-side navigation, a direct page load, and a reload with no console errors; the build no longer prints the middleware deprecation warning.

### Node 20 → 22 upgrade
- **Added:** 2026-10-01
- **What:** The project runs on Node 20 (`.nvmrc` is `20`; the Vercel project setting must match), and `@supabase/supabase-js` warns that Node 20 support is deprecated. Upgrade both `.nvmrc` and the Vercel project's Node.js version to 22, then re-run `npm test`, `tsc`, `lint`, and `build`, and smoke-test sign-in plus a 3PL and a Forwarder Sourcing project page.
- **Why deferred:** Nothing is broken yet; it's a runtime change for the whole app and deserves its own change and verification rather than riding along with feature work.
- **Severity:** Medium
- **Where:** `.nvmrc`, Vercel project settings (Node.js Version)
- **Resolved:** 2026-10-01 — `.nvmrc` is now `22` (package.json has no `engines` field). On Node 22.23.3: `npm ci` (lockfile unchanged, no dependency upgrades), `npm test` (432), `tsc`, `lint`, `build`, and `npm run test:db` (81) all pass, the same as on Node 20.20.2. The npm `EBADENGINE` warnings (supabase-js 2.112.3 needs Node ≥22, nanoid 6 needs ^22/^24) and supabase-js's Node 20 deprecation notice are gone, with no new warnings. Smoke-tested a Node 22 build against local Supabase: sign-in, login held across page loads, a 3PL and a Forwarder Sourcing project page, security headers present, no console errors. **Still to do by hand:** set the Vercel project's Node.js Version to 22.x before the next deploy.

### Header bar spacing feels tight
- **Added:** 2026-08-19 (Week 1, shared authenticated layout)
- **What:** The header bar ("3PL Sourcing" / "Log Out") has no vertical padding and both elements sit flush against the edges with little breathing room.
- **Why deferred:** Cosmetic only, doesn't block any functionality. Fixing now would be premature polish before more pages exist to calibrate spacing against.
- **Severity:** Low
- **Resolved:** 2026-10-01 — no longer applies after the nav redesign (5c3eb08). Checked at 1440×900 against a local build: the header is a fixed 64px navy bar with 32px side padding, brand and modules vertically centered on the left, Help and the avatar on the right with room to spare.

### "New Project" button overlaps header border
- **Added:** 2026-08-19 (Week 1, shared authenticated layout)
- **What:** The "New Project" button on the dashboard page visually overlaps the header's bottom border line slightly.
- **Why deferred:** Cosmetic alignment issue, doesn't block functionality.
- **Severity:** Low
- **Resolved:** 2026-10-01 — no longer applies. Checked at 1440×900 on the 3PL project list: the header ends at 64px and New Project starts at 104px, a 40px gap with no overlap.

### Admin Server Actions don't use Zod validation
- **Added:** 2026-09-30 (split out of the resolved 3PL Zod item)
- **What:** The admin actions (`reassignOwner`, `updateUserDisplayName`, `createUser`, `deleteUser`, `updateUserRole` in `admin/actions.ts`; `updateClient`, `deleteClient` in `admin/client-actions.ts`) take typed arguments but don't validate them with a schema, which docs/SECURITY.md requires for every Server Action.
- **Why deferred:** Out of scope for the 3PL-actions Zod change (2de070b); admin-only and already role-gated.
- **Severity:** Low
- **Resolved:** 2026-10-01 — each admin action now validates its arguments with a Zod schema in `src/lib/admin/parse-admin-input.ts` (uuid ids, role/table enums, length caps on names, email, password and business model), after the existing admin-role check. Failures return a friendly message and log the raw issues server-side; valid input behaves as before.

### Forwarder exports show capabilities as Yes / No
- **Added:** 2026-10-01 (found while writing /help)
- **What:** CSV/PDF/DOCX exports write each forwarder capability as "Yes" or "No" (`forwarderColumns` in `report-data.ts`), but a false capability means "not yet confirmed", not "no" — the app itself says "Not confirmed". A client reading "No" could wrongly conclude the forwarder can't do it. Client exports should say "Not confirmed" (or leave the cell blank) instead of "No".
- **Why deferred:** Export output change, separate from the help/nav work; /help notes the meaning in the meantime.
- **Severity:** Medium
- **Where:** `src/lib/forwarder/report-data.ts` (`forwarderColumns`)
- **Resolved:** 2026-10-01 — `forwarderColumns` now writes an unconfirmed capability as "Not confirmed" instead of "No" in Client and Expert CSV/PDF/DOCX, matching the app; /help's exports section updated.

### 3PL Server Actions don't use Zod validation
- **Added:** 2026-09-28 (Forwarder Sourcing Phase 3A)
- **What:** docs/SECURITY.md requires every Server Action to validate its input with a schema library (Zod). The new forwarder Server Actions do this (src/lib/forwarder/parse-project-form.ts), but the existing 3PL Sourcing Server Actions (project intake, 3PL add/edit, recommendation, notes, admin) still hand-validate field by field, predating that rule.
- **Why deferred:** Migrating 3PL's actions is a larger, separate change (many actions, many forms) and wasn't part of this task.
- **Resolved:** 2026-09-30 (commit 2de070b) — 3PL project, provider (incl. rate details), recommendation, and notes actions now validate via Zod schemas in `src/lib/three-pl/parse-*-form.ts`, bounded to the DB column limits. Admin actions weren't part of that change.

### Missing table GRANTs on new Supabase project
- **Added:** 2026-08-19 (Week 1, feature 4)
- **What:** RLS policies were created for the projects table, but the authenticated role had no baseline GRANT (select/insert/update/delete), causing "permission denied for table" errors despite correct RLS.
- **Why deferred:** Not deferred — this was a genuine gap caused by a recent Supabase platform default change (new projects no longer auto-grant table access). Discovered during manual testing, not known in advance.
- **Severity:** High (blocked all writes to the table)
- **Resolved:** 2026-08-19 — added explicit GRANT statement in Supabase SQL Editor for the authenticated role.

### Broken row-click links using unreliable <tr> positioning
- **Added:** 2026-08-19 (Week 1, feature 4)
- **What:** Project rows used an absolutely-positioned overlay Link (position: relative on <tr>, absolute inset-0 on the Link) intended to make the whole row clickable. Because <tr> doesn't reliably establish a CSS containing block for absolutely positioned descendants, the overlay expanded to cover the entire page instead of just its row, hijacking clicks on unrelated buttons ("New Project", "Log Out") above the table.
- **Why deferred:** Not deferred — introduced unintentionally when building the dashboard, found during manual testing.
- **Severity:** High (broke navigation and logout entirely)
- **Resolved:** 2026-08-19 — replaced overlay-link pattern with per-cell Links wrapping each <td>'s content.

---

Format for each entry when added:

### [Short title]
- **Added:** YYYY-MM-DD (Week N, feature X)
- **What:** one sentence describing the shortcut/gap
- **Why deferred:** one sentence — time pressure, POC scope, waiting on a decision, etc.
- **Severity:** Low / Medium / High (High = could block a future feature or cause a real bug; Low = cosmetic or convenience only)
- **Resolved:** (fill in when fixed — date + what changed)

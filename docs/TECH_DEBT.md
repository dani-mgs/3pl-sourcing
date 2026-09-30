# Technical Debt Log

Tracks known shortcuts, deferred work, and things that need revisiting later. Not a task list — only add an entry when something is deliberately left imperfect to move faster, not for routine bugs.

## Open

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

### Admin Server Actions don't use Zod validation
- **Added:** 2026-09-30 (split out of the resolved 3PL Zod item)
- **What:** The admin actions (`reassignOwner`, `updateUserDisplayName`, `createUser`, `deleteUser`, `updateUserRole` in `admin/actions.ts`; `updateClient`, `deleteClient` in `admin/client-actions.ts`) take typed arguments but don't validate them with a schema, which docs/SECURITY.md requires for every Server Action.
- **Why deferred:** Out of scope for the 3PL-actions Zod change (2de070b); admin-only and already role-gated.
- **Severity:** Low

### Node 20 → 22 upgrade
- **Added:** 2026-10-01
- **What:** The project runs on Node 20 (`.nvmrc` is `20`; the Vercel project setting must match), and `@supabase/supabase-js` warns that Node 20 support is deprecated. Upgrade both `.nvmrc` and the Vercel project's Node.js version to 22, then re-run `npm test`, `tsc`, `lint`, and `build`, and smoke-test sign-in plus a 3PL and a Forwarder Sourcing project page.
- **Why deferred:** Nothing is broken yet; it's a runtime change for the whole app and deserves its own change and verification rather than riding along with feature work.
- **Severity:** Medium
- **Where:** `.nvmrc`, Vercel project settings (Node.js Version)

### Migrate `src/middleware.ts` to `proxy.ts` (Next.js 16)
- **Added:** 2026-10-01
- **What:** Next.js 16 deprecates the `middleware` file convention in favor of `proxy`; `src/middleware.ts` still works but should move via `npx @next/codemod middleware-to-proxy`. It carries the security headers (CSP, X-Frame-Options, etc., from `src/lib/supabase/middleware.ts`) and the Supabase session refresh, so afterward verify both: curl a page and check the response headers are all still present, and confirm a login persists across navigation and a reload.
- **Why deferred:** The deprecated file still works in Next.js 16, and because it's security- and auth-critical it should be migrated on its own with that verification, not bundled into another change.
- **Severity:** Medium
- **Where:** `src/middleware.ts`, `src/lib/supabase/middleware.ts`

### Forwarder ranking basis — open decision
- **Added:** 2026-09-28
- **What:** Cost Rank and savings use Freight Cost only, matching the original spreadsheet. Total Comparable Logistics Cost (freight + duties & taxes + other charges) may be the fairer basis against a DDP baseline, where duties are included.
- **Owner:** Dani. Revisit before Forwarder Sourcing goes live.
- **Where:** src/lib/forwarder/cost-comparison.ts

### Header bar spacing feels tight
- **Added:** 2026-08-19 (Week 1, shared authenticated layout)
- **What:** The header bar ("3PL Sourcing" / "Log Out") has no vertical padding and both elements sit flush against the edges with little breathing room.
- **Why deferred:** Cosmetic only, doesn't block any functionality. Fixing now would be premature polish before more pages exist to calibrate spacing against.
- **Severity:** Low

### "New Project" button overlaps header border
- **Added:** 2026-08-19 (Week 1, shared authenticated layout)
- **What:** The "New Project" button on the dashboard page visually overlaps the header's bottom border line slightly.
- **Why deferred:** Cosmetic alignment issue, doesn't block functionality.
- **Severity:** Low

### Inconsistent timestamp column naming across tables
- **Added:** 2026-08-19 (Week 2 review/cleanup)
- **What:** projects uses "date_created" while providers and documents/provider_documents use "created_at"/"uploaded_at" — inconsistent naming convention across the schema.
- **Why deferred:** Cosmetic at the schema level, doesn't affect functionality. Renaming now would touch working tables mid-build for no functional gain.
- **Severity:** Low

## Resolved

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

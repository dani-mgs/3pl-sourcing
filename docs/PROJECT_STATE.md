# 3PL Sourcing Platform — Project State & Handover

_Last updated: 2026-09-08 by Dani_

---

## 1. One-line project summary
Internal tool for Move Supply Chain Logistics Experts to manage 3PL sourcing engagements end-to-end: client intake, 3PL discovery/vetting, cost comparison, and recommendations — one record per client.

## 2. Tech stack
- Frontend: Next.js (App Router) + TypeScript + Tailwind CSS v4 (CSS-first @theme config, no tailwind.config.js) + shadcn/ui
- Backend/API: Next.js Server Actions (no separate API layer)
- DB: Supabase Postgres — project ref vnidvcskfsyfytdjbiji
- Auth: Supabase Auth (email/password, invite-only, no public signup). Roles (admin / logistics_expert) stored in auth.users.raw_app_meta_data.role, synced one-way into a public profiles table via trigger.
- Infra/hosting: Vercel — walkthrough was given, NOT yet confirmed deployed. Still local-dev only as of last session.
- Repo: github.com/dani-mgs/3pl-sourcing
- Package manager/runtime: npm, Node 20 via nvm (.nvmrc)
- AI: @anthropic-ai/sdk for document extraction, pdf-parse + mammoth for PDF/DOCX text extraction
- Dev tooling: Playwright MCP (Claude Code self-verifies UI changes via real browser screenshots before reporting done)

---

## 3. SESSION RESTART CHECKLIST

- cd into project root
- nvm use (Terminal 1 and Terminal 2)
- Start Docker Desktop (required for supabase db reset's local shadow DB) — must be fully started before running any supabase db command, or it fails with a socket-connection error
- Terminal 1: claude, then run /mcp and confirm "playwright" shows as connected — if missing, run claude mcp list in Terminal 2 to diagnose before relying on it for verification this session
- Tell Claude Code to read docs/PROJECT_STATE.md, docs/CHANGELOG.md, docs/TECH_DEBT.md, docs/DESIGN_SYSTEM.md before doing anything
- Terminal 2: npm run dev, confirm http://localhost:3000 loads and you can log in

Known gotchas:
- supabase db reset fails silently-ish with a socket error if Docker Desktop isn't fully started yet — wait for the whale icon to settle.
- Migration files get created and applied but NOT committed to git more often than expected — always run git status after any Supabase CLI work and confirm the new .sql file shows as committed before moving on. This has happened at least 4 times in this project.
- npx supabase login session can expire/loop on a Keychain prompt — if db push/projects list throws LegacyPlatformAuthRequiredError, just re-run npx supabase login.
- After any Tailwind/font/global-CSS structural change, run rm -rf .next before npm run dev — Turbopack's dev cache can serve stale styles otherwise.
- Playwright MCP has previously shown as "already exists in local config" while not actually appearing in a live session's /mcp list — if this happens, exiting and restarting the claude session (or re-adding with --scope project) has resolved it before.

---

## 4. CURRENT STATE — what's done

- Auth, roles (admin/logistics_expert), RLS: reads open to all authenticated users, writes (insert/update/delete) restricted to owner-or-admin across client_requirements, three_pl_providers, rate_details, recommendation. Every mutation Server Action checks .select() result is non-empty before reporting success (RLS silently returns zero rows on rejection, doesn't throw).
- Full schema refactor done: client_requirements (was projects, absorbed the old requirements_summary), three_pl_providers (was providers, 40+ fields: 15 capability booleans, 4 cost fields, is_incumbent, status/assessment), rate_details (new, 1:1 per provider, 13 USD rate line items), recommendation (was recommendations). documents/provider_documents dropped — file storage deferred.
- Top navy bar (replaced the old sidebar): wordmark to dashboard, randomized time-aware greeting, avatar dropdown (Log Out, Administration for admins).
- Dashboard: search, "My Projects"/"All Experts" tabs, per-client pipeline visualization, relative "updated" time.
- 3-step New Project wizard: Client Intake (with an "Upload a Document" choice using AI extraction to pre-fill fields, or "Start from Scratch") then Add 3PLs (full provider form, reused) then Verify Details. Auto-saves in-progress data before navigating forward.
- Project Summary page: breadcrumb, 3 stat boxes (Sourced/Quotes In/Shortlisted), filter bar (search + Status/Service/Assessment dropdowns with select-all/clear-all, active-state styling), toggleable columns, per-row ellipsis menu (View/Edit/Delete), standalone Notes section, Cost Comparison + Add 3PL actions.
- Client Info: read-only View (breadcrumb, section cards, non-interactive toggle-chips, no status badge) plus a separate /info/edit route. Delete Client button, blocked if any 3PLs exist.
- 3PL pages: unified Add/Edit form (toggle-chip capabilities, sectioned), View page (breadcrumb, section cards), Rate Details page, Delete with confirmation.
- Comparison page: Total Cost (sum of 4 cost fields), Cost Rank (independent of baseline), Savings vs Baseline/Savings %/Cost Position (only computed if a provider is flagged is_incumbent with complete cost data — shows "N/A" if no incumbent set, "Pending" if incumbent set but data incomplete). Filters (search/status/business model/all 15 capabilities) as dropdowns.
- Recommendation page: priority selector — Cost Savings ranks by Total Cost; Quality of Service and Turnaround Time show an unranked list with a disclaimer (no numeric turnaround field exists in the schema). "AI Summary" per provider is still a placeholder, not implemented.
- Administration page (admin-only): project reassignment, promote/demote user role, create/delete users (blocked if the user owns any clients), edit any user's display name.
- Design system: Move brand colors (Green #44B048, Navy #192E5B, Orange #FF5E43 accent), Plus Jakarta Sans + Inter — documented in docs/DESIGN_SYSTEM.md.
- shadcn/ui adopted as the component foundation; Playwright MCP configured for Claude Code to self-verify UI work.
- Supabase CLI + migrations fully set up — all schema changes go through supabase/migrations/, never raw SQL against the live project.

## 5. IN PROGRESS

Document-upload to AI extraction feature (pre-fills the New Project intake form from an uploaded .txt/.pdf/.docx) was just built in the last session — NOT yet tested/confirmed working. This is the actual next thing to verify.

## 6. NEXT TASK

Before doing anything, read docs/CHANGELOG.md and docs/TECH_DEBT.md to confirm current state, then verify the document-upload AI extraction feature built at the end of the last session: navigate to /dashboard/new, confirm the "Upload a Document" vs "Start from Scratch" choice screen appears, upload a small test .txt file describing a fictional client, and confirm Step 1 pre-fills correctly with only the fields actually present in the text (nothing fabricated). Report the result before any further feature work.

## 7. OPEN DECISIONS / QUESTIONS

- Extending AI extraction beyond New Project intake (e.g. pre-filling a 3PL update from a discovery call transcript) — deliberately deferred until intake extraction is proven reliable.
- CSV structured import — deferred as a separate feature from AI text extraction (different technical approach: column-mapping, not LLM extraction).
- Whether/when to actually deploy to Vercel — instructions exist, deployment itself hasn't happened yet.
- rate_details (granular per-service USD rates) isn't wired into the Comparison page's cost math yet — Comparison currently only uses the 4 summary cost fields on three_pl_providers directly, not the more granular rate_details breakdown.

## 8. KEY ARCHITECTURE DECISIONS

- 2026-08-19 — Chose Next.js + Supabase (DB/Auth/Storage) to minimize infra surface for a first-time solo dev.
- 2026-09-04 — Full schema refactor: renamed tables to match business terminology (client_requirements, three_pl_providers), merged requirements_summary in, dropped document-upload tables (deferred), added rate_details as a 1:1 companion table rather than a freeform rate-line-item table.
- 2026-09-04 — Chose is_incumbent flag (one per client, enforced via partial unique index) over a separate baseline-cost field, so the baseline is always a real, complete provider record rather than a duplicated number.
- 2026-09-05 — Roles stored in app_metadata (not user_metadata, which holds first_name) since app_metadata can't be edited by the user themselves — correct place for anything authorization-relevant.
- 2026-09-05 — Reads stay open to all authenticated Logistics Experts (matches original POC requirement); only writes are owner-or-admin restricted.
- 2026-09-06 — Adopted shadcn/ui + Playwright MCP together after repeated UI/contrast bugs from hand-written Tailwind; established the native-input-for-server-hydrated-forms rule after a real Base-UI uncontrolled-state bug.
- 2026-09-08 — AI document extraction scoped to New Project intake only (v1), transient file processing (no permanent storage), text/PDF/DOCX only (CSV deferred as a separate feature).

## 9. FILE MAP

| Area | Path |
|---|---|
| DB schema / migrations | supabase/migrations/ |
| Auth/role helpers | src/lib/auth/get-user-role.ts, src/lib/auth/get-ownership-context.ts |
| Supabase clients | src/lib/supabase/client.ts (browser), server.ts (server), admin-client.ts (service-role, server-only, bypasses RLS) |
| Shared form components | src/components/client-intake-form.tsx, provider-form.tsx, wizard-steps.tsx, toggle-chip picker, section-card wrapper, status-badge |
| Design tokens | src/styles/globals.css (@theme block), docs/DESIGN_SYSTEM.md |
| Client/project pages | src/app/(authenticated)/projects/[id]/* |
| 3PL pages | src/app/(authenticated)/projects/[id]/providers/[providerId]/* |
| New Project wizard | src/app/(authenticated)/dashboard/new/* |
| Admin | src/app/(authenticated)/admin/* |
| Tests | None automated — manual Playwright MCP verification per feature, matching the project's right-sized testing approach |

## 10. DO NOT TOUCH / FRAGILE AREAS

- The storage.objects RLS policy's regex UUID guard — fixes a real bug where casting a non-UUID path segment to uuid threw a runtime error and silently blocked unrelated policies. Don't remove the guard.
- Every insert/update/delete Server Action MUST chain .select() and check the result isn't empty before reporting success — RLS-blocked writes fail silently (zero rows, no error) otherwise. Any new mutation added without this check will have the same false-success bug found and fixed earlier.
- The one_incumbent_per_client partial unique index on three_pl_providers — drives all Comparison/Recommendation baseline math. Don't remove without redesigning that logic.
- profiles table is synced ONE-WAY from auth.users via trigger. Never write to profiles.role or profiles.first_name directly — always go through supabase.auth.admin.updateUserById() via the service-role client so the trigger stays the single source of truth.
- The toggle-chip picker's storage format was fixed to be delimiter-safe (handles preset labels containing commas, e.g. "Fulfillment (Pick, Check, Pack)") — don't revert to a naive comma-join/split.

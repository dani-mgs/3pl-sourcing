# MOVE Supply Chain Decision Hub — Project State & Handover

_Last updated: 2026-09-28 by Dani_

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

- Auth, roles (admin/logistics_expert), RLS: reads open to all authenticated users, writes (insert/update/delete) restricted to owner-or-admin across three_pl_projects, three_pl_providers, rate_details, recommendation. clients: any authenticated user can read and create; only admins can update or delete. Every mutation Server Action checks .select() result is non-empty before reporting success (RLS silently returns zero rows on rejection, doesn't throw).
- Owner-only pages: every page that edits a project or its 3PLs (Project Info edit, 3PL edit, Add 3PL, wizard Steps 1–3 for an existing project) returns 404 unless getOwnershipContext says canWrite; the blank /3pl-sourcing/new stays open. Non-owners see a shared "Owned by {name} — view only" banner (src/components/view-only-banner.tsx) on Project Summary, Project Info, 3PL View and Recommendation. Deletes that remove nothing say "This item no longer exists — refresh the page." when the row is gone, and the permission message only when it still exists (src/lib/delete-errors.ts).
- Clients/projects model (shared-client refactor, 2026-09-28): a client (company) is one shared `clients` row (name unique case-insensitively after trimming, business_model). Each 3PL sourcing engagement is a `three_pl_projects` row (was client_requirements) with client_id → clients (ON DELETE RESTRICT), owner_id, and the project's intake fields; three_pl_providers and recommendation point at it via three_pl_project_id. A client can have many projects. Client name and business model are client-level: shown on every project, editable only by admins (Project Info "Edit client" dialog, Administration → Clients).
- Schema history: three_pl_projects (was client_requirements, was projects, absorbed the old requirements_summary), three_pl_providers (was providers, 40+ fields: 15 capability booleans, 9 cost fields + currency, is_incumbent, status/assessment), rate_details (1:1 per provider, 13 rate line items in the 3PL's own currency), recommendation (was recommendations), clients (new 2026-09-28). documents/provider_documents dropped — file storage deferred.
- Top navy bar (replaced the old sidebar): wordmark to dashboard, randomized time-aware greeting, avatar dropdown (Log Out, Administration for admins).
- Dashboard (project list): search (client name via the clients join, or region), "My Projects"/"All Experts" tabs, per-project pipeline visualization, relative "updated" time; the business-model subtitle comes from the client.
- 3-step New Project wizard: Project Info (starts with "Which client?" — a searchable picker of existing clients, or "New client" with Name + Business Model; a name matching an existing client case-insensitively shows "A client named X already exists" with "Use existing client", and the server returns the same message on a 23505 race; editing an existing project can only switch it to another existing client; plus an "Upload a Document" choice using AI extraction that preselects a matching client or pre-fills "New client") then Add 3PLs (full provider form, reused) then Verify Details. Auto-saves in-progress data on every way out of Step 2.
- Project Summary page: breadcrumb, 3 stat boxes (Sourced/Quotes In/Shortlisted), filter bar (search + Status/Service/Assessment dropdowns with select-all/clear-all, active-state styling), toggleable columns, per-row ellipsis menu (View/Edit/Delete), standalone Notes section, Add 3PL action, and a Cost Comparison panel (see below).
- Project Info (was Client Info): read-only View (breadcrumb, client name + business model at the top with an admin-only "Edit client" dialog, section cards, non-interactive toggle-chips) plus a separate /info/edit route for the project's own fields. Delete Project button (deletes the three_pl_projects row, keeps the client), blocked if any 3PLs exist.
- 3PL pages: unified Add/Edit form (toggle-chip capabilities, sectioned), View page (breadcrumb, section cards, including a Rate Details card), Delete with confirmation. Rate details are edited in a Rate Details section of the same form and saved by the same Server Actions (Add 3PL, Edit 3PL, wizard Step 2) via src/lib/rate-details.ts — no empty rate_details rows are created, and clearing every rate nulls the row rather than deleting it. The standalone Rate Details page was removed 2026-09-28; old `/rates` URLs redirect to the 3PL's View page.
- Cost Comparison panel on Project Summary (replaced the standalone Comparison page, removed 2026-09-28; old `/comparison` URLs redirect to Project Summary): 3PLs ranked by Total Cost (sum of all 9 cost fields, rank 1 = lowest), excluding Unfit / Do not Contact / Withdrawn / No Response except the incumbent, which always shows as the Baseline row. The baseline is the 3PL flagged Incumbent (is_incumbent; the old current_incumbent_3pl column was dropped 2026-09-28): Savings vs Baseline (amount + %, green/red) when that 3PL has cost data; amber "Pending" note when it has none; no savings when no 3PL is flagged (N/A); ranking and savings hidden with a warning when 3PLs use different currencies. Sits right of the 3PL table (340px, sticky) from 1,480px, stacked above it below that. All math lives in src/lib/cost-comparison.ts, which Recommendation's Cost Savings ranking also uses.
- Recommendation page: priority selector — Cost Savings ranks by Total Cost; Quality of Service and Turnaround Time show an unranked list with a disclaimer (no numeric turnaround field exists in the schema). "AI Summary" per provider is still a placeholder, not implemented.
- Administration page (admin-only): project reassignment, a Clients section (every client with its project count; edit name/business model with the same duplicate check; delete only when it has zero projects, otherwise the button is disabled with the reason shown), promote/demote user role, create/delete users (blocked if the user owns any projects), edit any user's display name.
- Design system: Move brand colors (Green #44B048, Navy #192E5B, Orange #FF5E43 accent), Plus Jakarta Sans + Inter — documented in docs/DESIGN_SYSTEM.md.
- shadcn/ui adopted as the component foundation; Playwright MCP configured for Claude Code to self-verify UI work.
- Supabase CLI + migrations fully set up — all schema changes go through supabase/migrations/, never raw SQL against the live project.
- Document-upload AI extraction fully built and verified live across all four surfaces: New Project wizard Step 1 (blank-slate client intake pre-fill) and Step 2 (incumbent 3PL pre-fill), Client Info edit (merge-mode, only overwrites explicitly-stated fields), and Add 3PL (blank-slate)/Edit 3PL (merge-mode) covering the full 33-field provider set. Shared plumbing lives in src/lib/document-extraction.ts (file parsing + Anthropic tool-use call) and src/lib/merge-fields.ts (scalar merge diff). A real bug where merge-mode flagged restated-but-unchanged values as updates was fixed by passing the record's current field values into the extraction prompt so the model can distinguish "same" from "genuinely new" (merge-mode only; blank-slate flows unaffected).

## 5. IN PROGRESS

Forwarder Sourcing (Phase 2). Done: the tables (migration 20260928094641_forwarder_sourcing_tables.sql, pushed live 2026-09-28: forwarder_projects, forwarders, forwarder_quotes, with RLS) and the calculation module (src/lib/forwarder/cost-comparison.ts, verified against the original spreadsheet's formulas by a golden-fixture test). Next: the Forwarder Sourcing screens. No UI exists yet, and the hub's Forwarder Sourcing card is still "Coming Soon".

## 6. NEXT TASK

Forwarder Sourcing screens: project list, project intake, forwarders, quotes and the freight cost comparison, built on the tables and src/lib/forwarder/cost-comparison.ts. Before starting, read docs/CHANGELOG.md and docs/TECH_DEBT.md (the forwarder ranking basis is an open decision there).

## 7. OPEN DECISIONS / QUESTIONS

- Extending AI extraction beyond New Project intake (e.g. pre-filling a 3PL update from a discovery call transcript) — deliberately deferred until intake extraction is proven reliable.
- CSV structured import — deferred as a separate feature from AI text extraction (different technical approach: column-mapping, not LLM extraction).
- Whether/when to actually deploy to Vercel — instructions exist, deployment itself hasn't happened yet.
- Forwarder ranking basis: Cost Rank and savings use Freight Cost only (as in the spreadsheet); Total Comparable Logistics Cost may be fairer against a DDP baseline. Owner: Dani, revisit before Forwarder Sourcing goes live (docs/TECH_DEBT.md).
- rate_details (granular per-service rates) isn't wired into the cost comparison math yet — the Cost Comparison panel and Recommendation use the 9 summary cost fields on three_pl_providers directly, not the more granular rate_details breakdown.

## 8. KEY ARCHITECTURE DECISIONS

- 2026-08-19 — Chose Next.js + Supabase (DB/Auth/Storage) to minimize infra surface for a first-time solo dev.
- 2026-09-04 — Full schema refactor: renamed tables to match business terminology (client_requirements, three_pl_providers), merged requirements_summary in, dropped document-upload tables (deferred), added rate_details as a 1:1 companion table rather than a freeform rate-line-item table.
- 2026-09-04 — Chose is_incumbent flag (one per client, enforced via partial unique index) over a separate baseline-cost field, so the baseline is always a real, complete provider record rather than a duplicated number.
- 2026-09-05 — Roles stored in app_metadata (not user_metadata, which holds first_name) since app_metadata can't be edited by the user themselves — correct place for anything authorization-relevant.
- 2026-09-05 — Reads stay open to all authenticated Logistics Experts (matches original POC requirement); only writes are owner-or-admin restricted.
- 2026-09-06 — Adopted shadcn/ui + Playwright MCP together after repeated UI/contrast bugs from hand-written Tailwind; established the native-input-for-server-hydrated-forms rule after a real Base-UI uncontrolled-state bug.
- 2026-09-08 — AI document extraction scoped to New Project intake only (v1), transient file processing (no permanent storage), text/PDF/DOCX only (CSV deferred as a separate feature).
- 2026-09-28 — Split clients from projects: `clients` is a shared, admin-managed record (unique case-insensitive name), and each 3PL sourcing engagement is a `three_pl_projects` row pointing at it. This lets one client have several projects (and later other modules) without re-typing or drifting client names. Client name/business model are never changed by document extraction in merge mode.
- 2026-09-10 — Merge-mode extraction (Project Info edit, Edit 3PL) passes the record's current field values into the extraction prompt, not just the document text, so a restated-but-unchanged value isn't flagged as an update — the model has no other way to tell a restatement from a genuine change.

## 9. FILE MAP

| Area | Path |
|---|---|
| DB schema / migrations | supabase/migrations/ |
| Auth/role helpers | src/lib/auth/get-user-role.ts, src/lib/auth/get-ownership-context.ts |
| Supabase clients | src/lib/supabase/client.ts (browser), server.ts (server), admin-client.ts (service-role, server-only, bypasses RLS) |
| Shared form components | src/components/client-intake-form.tsx (a project's intake fields), client-picker.tsx ("Which client?"), edit-client-dialog.tsx (admin), provider-form.tsx, wizard-steps.tsx, toggle-chip picker, section-card wrapper, status-badge |
| Clients helpers (name lookup, duplicate message, join normalizer) | src/lib/clients.ts |
| View-only banner (non-owners) | src/components/view-only-banner.tsx |
| Design tokens | src/styles/globals.css (@theme block), docs/DESIGN_SYSTEM.md |
| Hub home (`/`) + top bar/module nav | src/app/(authenticated)/page.tsx, layout.tsx, module-nav.tsx; module list in src/lib/modules.ts |
| 3PL Sourcing project list (`/3pl-sourcing`) | src/app/(authenticated)/3pl-sourcing/page.tsx, dashboard-content.tsx |
| Project pages (`/3pl-sourcing/projects/[id]/...`) | src/app/(authenticated)/3pl-sourcing/projects/[id]/* (summary + Cost Comparison panel in cost-comparison-panel.tsx, info = Project Info + delete-project-*, info/edit, recommendation) |
| 3PL pages (`/3pl-sourcing/projects/[id]/providers/...`) | src/app/(authenticated)/3pl-sourcing/projects/[id]/providers/* (new, [providerId] View incl. Rate Details card, [providerId]/edit) |
| New Project wizard (`/3pl-sourcing/new/...`) | src/app/(authenticated)/3pl-sourcing/new/* |
| Shared cost math (Total Cost, rank, savings, currency check) | src/lib/cost-comparison.ts |
| Rate Details fields + save logic (shared by all 3PL save actions) | src/lib/rate-details.ts |
| Legacy URL redirects (`/dashboard/*`, `/projects/*`, `.../comparison` → Project Summary, `.../providers/[providerId]/rates` → 3PL View) | next.config.ts `redirects()` |
| Admin (`/admin`, hub-level) | src/app/(authenticated)/admin/* (client-actions.ts + delete-client-button.tsx for the Clients section) |
| Forwarder cost math (freight in USD, gates, savings, ranking) | src/lib/forwarder/cost-comparison.ts |
| Tests | `npm test` (vitest): src/lib/forwarder/cost-comparison.test.ts checks the forwarder math against a spreadsheet-computed golden fixture (src/lib/forwarder/__fixtures__/). UI is still verified manually with Playwright MCP per feature. |

## 10. DO NOT TOUCH / FRAGILE AREAS

- The storage.objects RLS policy's regex UUID guard — fixes a real bug where casting a non-UUID path segment to uuid threw a runtime error and silently blocked unrelated policies. Don't remove the guard.
- Every insert/update/delete Server Action MUST chain .select() and check the result isn't empty before reporting success — RLS-blocked writes fail silently (zero rows, no error) otherwise. Any new mutation added without this check will have the same false-success bug found and fixed earlier.
- The one_incumbent_per_client partial unique index on three_pl_providers — drives all Cost Comparison panel/Recommendation baseline math. Don't remove without redesigning that logic.
- profiles table is synced ONE-WAY from auth.users via trigger. Never write to profiles.role or profiles.first_name directly — always go through supabase.auth.admin.updateUserById() via the service-role client so the trigger stays the single source of truth.
- The toggle-chip picker's storage format was fixed to be delimiter-safe (handles preset labels containing commas, e.g. "Fulfillment (Pick, Check, Pack)") — don't revert to a naive comma-join/split.

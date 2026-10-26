# MOVE Supply Chain Decision Hub — Project State & Handover

_Last updated: 2026-10-26. Sections 1, 3 to 8 reflect `main` as of 2026-10-22 (`041d9d7`, the Landed Cost cleanup merge, `997da88`) and later fixes; section 2b describes the unmerged branch `feat/forwarder-audit`._

**Live:** 3PL Sourcing, Forwarder Sourcing, Tariff Calculator, client dashboard Phases 0–3b (portal, Market Report, requests, introductions), Landed Cost (Phases 1–5b, 3a, 3b, cleanup). **Next:** nothing planned; see section 6 for what waits on people. **Built, not yet deployed:** Forwarder Audit (branch `feat/forwarder-audit`, behind `FORWARDER_AUDIT_ENABLED`; section 2b). **Parked:** 3PL Audit (shown as "coming soon"); client dashboard Phase 4 (ideas only); Landed Cost Phase 6 (dropped).

History is in git and `docs/CHANGELOG.md`; this file is the short version. "Confirmed by Dani" = stated by the project owner, not provable from the repo.

---

## 1. The app and its modules
Internal hub for Move Supply Chain Logistics Experts: source and compare 3PLs and freight forwarders for a client, estimate US import duties, and work out landed cost per unit across origins. Clients are shared records; each module has its own projects. External client users see only a portal of published snapshots.

| Module | Status | Where |
|---|---|---|
| 3PL Sourcing | Live | `src/app/(authenticated)/3pl-sourcing/`, `src/lib/three-pl/`, `src/lib/cost-comparison.ts` |
| Forwarder Sourcing | Live | `src/app/(authenticated)/forwarder-sourcing/`, `src/lib/forwarder/` |
| Tariff Calculator | Live (duty programs still pending expert review, section 6) | `src/app/(authenticated)/tariff-calculator/`, `src/lib/tariff/`, `scripts/tariff/`, `docs/tariff-data/` |
| Client dashboard / portal | Live, Phases 0–3b | `/client-access`, `/portal`, `/market-reports`, `/client-requests` |
| Market Report (paid plan) | Live (Phase 2c) | `src/lib/client-updates/`, `src/app/(authenticated)/market-reports/` |
| Landed Cost | Live behind `LANDED_COST_ENABLED` | `src/app/(authenticated)/landed-cost/`, `src/lib/landed-cost/` |
| Forwarder Audit | Built behind `FORWARDER_AUDIT_ENABLED`; not on `main` or deployed until merged and pushed | `src/app/(authenticated)/forwarder-audit/`, `src/lib/forwarder-audit/` |
| 3PL Audit | Not built ("coming soon" in the nav) | `src/lib/modules.ts` |

**Production:** `main` through the Landed Cost cleanup (`997da88`) is deployed (confirmed by Dani, per deploy, 2026-10-22). All migrations up to `20261022134839_landed_cost_remove_compat.sql` are in the repo; the dry run before that deploy listed only that one as pending.

**Stack:** Next.js 16 (App Router; read `node_modules/next/dist/docs/` before writing Next code, per AGENTS.md) + TypeScript + Tailwind v4 + shadcn/ui; Supabase Postgres + Auth; Vercel (pushing `main` deploys production; crons in `vercel.json`); Zod; pdfkit; Vitest; pgTAP. Node 22 (`.nvmrc`).

## 2. Landed Cost
Full cost of one shipment per unit and in total (product, freight, duties, MPF, HMF, other costs) for up to 5 origins side by side. Details: `docs/FEATURES/landed-cost.md`, `/help` → Landed Cost.

**Phases done** (each in `docs/CHANGELOG.md`)
| Phase | What | Migration |
|---|---|---|
| 1 | Pure calculations: cartons, CBM, chargeable weight, freight split, fees, totals | — |
| 2a | `loadSkuDuties`: batched duties from the Tariff Calculator's data | — |
| 2b | Workspace tables (inputs only) | `20261021013030_landed_cost_workspaces`, `20261021013541_landed_cost_revoke_service_role` |
| 2c-1 | Atomic draft save, server-side calculation | `20261021020238_landed_cost_draft_functions` |
| 2c-2 | Workspace screens; the feature flag | — |
| 4 | Compare up to 5 origins (ranking, bars, drivers) | — |
| 5a | Paste from Excel; draft CSV export | — |
| 5b-1 | Locked versions (immutable; numbers never reused) | `20261021074001_landed_cost_snapshots`, `20261021075832_landed_cost_snapshot_counters` |
| 5b-2 | Locked version PDF and CSV | — |
| 3a | Manual rate overrides (core; snapshot schema version 2) | `20261021135010_landed_cost_rate_overrides` |
| 3b | Manual rates UI (editor, conflicts, exports, /help) | — |
| Cleanup | Removed the 3a deploy-window compatibility (LC426 "out of date") | `20261022134839_landed_cost_remove_compat` |

**Flag:** `LANDED_COST_ENABLED=true` turns the module on (pages, actions, nav, /help section); anything else is a 404, refused actions and "Soon" (README). On in production: set in Vercel, smoke test passed 2026-10-21 (confirmed by Dani). Locally: `LANDED_COST_ENABLED=true npm run dev`.

**Key rules**
- One MPF and one HMF per origin's entry (not per line, unlike the Tariff Calculator), split by entered value (qty × FOB). HMF is ocean only.
- No total until an origin is complete; only complete origins with the baseline's incoterm are ranked. EXW, FCA, FAS and FOB only.
- Results are recalculated on the server from the last saved draft; nothing from the browser is trusted.
- Locked versions are never recalculated: shown and exported only from what was stored (a trigger refuses every update). Stored schema version 1 rows stay valid and export byte for byte as before.
- Manual rates (owner or admin; one per duty layer; a rate or a fixed amount, with a reason) never make a result complete. MPF and HMF can't be overridden. A manual rate that no longer fits blocks that SKU's total until fixed.
- **Phase 6 (forwarder quote link): DROPPED** by decision 2026-10-22 (confirmed by Dani).

**Not built:** breakeven figure, freight quotes, delivered incoterms, .xlsx upload, non-Latin text in PDFs, copying manual rates when an origin is duplicated (TECH_DEBT).

## 2b. Forwarder Audit
Audits one freight quotation against the CI/PL, line by line; a port of the frozen v1.0 workbook (`docs/forwarder-audit/`). Details: `docs/FEATURES/forwarder-audit.md`, `/help` → Forwarder Audit.
- **Built** (Phases A to C, branch `feat/forwarder-audit`): the pure engine `src/lib/forwarder-audit/` matched cell by cell to LibreOffice recalculations (golden fixtures; `python3 scripts/forwarder-audit/golden.py` regenerates them), the table `forwarder_audits` (migration `20261026140623_forwarder_audits`, pgTAP 41), the list, editor and printable Summary, and /help.
- **Flag:** `FORWARDER_AUDIT_ENABLED=true` turns it on (pages, actions, nav, /help section); anything else is a 404, refused actions and "Soon". Locally: `FORWARDER_AUDIT_ENABLED=true npm run dev`; `npm run fa:seed-case <case-name>` loads a workbook case (Node 22).
- **Rules:** inputs only are stored; results are recalculated every time; v1.0 rules are frozen, quirks included (TECH_DEBT "Forwarder Audit: v1.0 workbook quirks"); the "20 checks" grouping is inferred. Staff-only RLS, owner-or-admin writes, no service role.
- **Not built:** .xlsx import, locked versions, editable settings, a 3PL Audit.
- **Before it's live:** Dani's click-through against the 3 real workbooks, then merge, `npx supabase db push && git push`, and set the flag in Vercel (redeploy).

## 3. Security model (details: `docs/SECURITY.md`)
- **Staff vs client:** staff roles are `admin` and `logistics_expert`; `client` is a role but never a staff role (never add it to `has_staff_role()`, `STAFF_ROLES` or `staffRole()`; `role-list-sync.test.ts`). Roles live in `app_metadata` (users can't edit it); database checks read the live role from `auth.users`, not the token.
- **Restrictive staff policy:** every internal RLS table has a restrictive `has_staff_role()` policy, so an account without a staff role sees and writes nothing (pgTAP 24 and 28). Reads are open to staff; writes are owner-or-admin.
- **Clients** read only their `client_entitlements` row directly; everything else goes through security-definer functions that force the client from `my_client_id()` (tripwire in pgTAP 32). They see published snapshots built from allow-lists, never live data.
- **Server Actions:** staff ones start with `await requireStaff()` (then the feature flag where there is one), portal ones with `await requireClient()` (`server-action-guard.test.ts`).
- **Signup is off.** New tables revoke all from `anon` unless meant to be public.
- **Service-role exceptions (four; `service-role-use.test.ts` enforces the list):**
  1. **Cron routes** `/api/cron/fx-rates` and `/api/cron/hts-release`: verify `CRON_SECRET` via `isAuthorizedCronRequest()` first; write only their own tables.
  2. **`src/lib/tariff/estimate-store.ts`:** only `save_duty_estimate()`, called by `saveEstimate` after its user checks.
  3. **`src/lib/client-users/create-client-user.ts`:** creates client users and resets their passwords (three Auth admin calls), after `requireStaff()`.
  4. **`src/lib/landed-cost/snapshot-store.ts`:** only `save_landed_cost_snapshot()`, called only by `lockWorkspaceAction` after the staff, flag, owner-or-admin and stale checks and the server calculation.
  - Separately, admin actions use the service role only behind an admin check.

## 4. How to work
**Session start**
- `nvm use` (Node 22), start Docker Desktop fully, then the local Supabase stack; `npm run dev` on :3000.
- Read this file, `CHANGELOG.md`, `TECH_DEBT.md`, `SECURITY.md`, `DESIGN_SYSTEM.md` and `AGENTS.md` first.
- Gotchas: run `git status` after Supabase CLI work (migrations have been left uncommitted); `LegacyPlatformAuthRequiredError` → `npx supabase login`; after global CSS changes, `rm -rf .next`.

**Local environment**
- Local dev uses the LOCAL Supabase stack: `.env.local` points at it, changed 2026-10-21 (confirmed by Dani). Production settings are not in `.env.local`; they live in Vercel.
- **Never read, print or load `.env` / `.env.local`**, in any way. To check a variable, check only that its name exists. If a secret's value seems needed, stop and ask.
- `npm run qa:seed`: ZZQA local logins and data (refuses any URL but the local stack; prints a new password each run). `npm run demo:seed`: six demo clients with portal users (same guard). Passwords are never committed.
- Full QA runs the app from a separate git worktree on :3100 with values from `npx supabase status -o env` (`docs/qa/regression-test-cases.md`). No screenshots or passwords in the repo.

**Checks before merging**
```sh
npm run lint
npm run typecheck                       # next typegen && tsc --noEmit
for tz in UTC America/Los_Angeles Asia/Ho_Chi_Minh Pacific/Kiritimati Pacific/Pago_Pago Australia/Lord_Howe Asia/Manila; do
  TZ=$tz npx vitest run </dev/null; done   # the canonical 7 timezones
npx supabase migration up               # apply new migrations locally (never db reset)
npm run test:db                         # pgTAP
npm run build
npm run qa:portal-scan                  # after any change to what the portal shows (local server running)
```
- On 2026-10-22, `main` at `041d9d7`: 2,225 Vitest passed + 1 skipped (176 files) in all 7 canonical timezones (UTC, America/Los_Angeles, Pacific/Kiritimati, Pacific/Pago_Pago and Asia/Manila in the cleanup run; Asia/Ho_Chi_Minh and Australia/Lord_Howe on `main`); pgTAP 1,340 across 40 files.
- pgTAP files count only their own rows, so they pass on a seeded database too.

**Database changes**
- Never raw SQL against Supabase (dashboard or one-off). Migrations only: `npx supabase migration new <name>`, SQL in the file, committed with the feature code.
- **Never `npx supabase db reset`** (the local database holds QA accounts, demo data and guide tooling); apply with `npx supabase migration up`, then `npm run test:db`.
- Change an existing function with a NEW migration (`create or replace`), never by editing an applied one.
- Backfills disable `updated_at` triggers during the backfill.

**Deploy**
1. `npx supabase db push --dry-run` and read the list.
2. Adding schema: `npx supabase db push && git push` (migration first; `&&` so code never ships without its schema).
3. Removing schema: code first (`git push`, wait for Vercel), then `db push`.

**Rollback:** Vercel → Deployments → previous production deployment → Promote to Production. Code only: undo a schema change with a new migration.

**Branches and commits:** one branch per change (`feat/…`, `fix/…`, `docs/…`, `test/…`, `chore/…`), merged into `main` with a merge commit. Conventional commits (`feat(landed-cost): …`, `fix(tariff): …`, `docs: …`), ending with the Co-Authored-By line when an AI assistant wrote them. Feature work: plan first, approval, implement, checks, docs, report.

**Always:** update `/help` in the same change as any behaviour it describes. No new dependencies without approval. Plain native inputs for server-prefilled form fields (AGENTS.md).

## 5. Open tech debt (titles only; details in [`docs/TECH_DEBT.md`](TECH_DEBT.md))
- **Landed Cost:** one scenario per workspace not a table constraint; admins can't reassign ownership; no breakeven; a new origin has no result until saved; paste only (no .xlsx); the database can't re-prove a locked version's duty amounts; manual rates not copied on duplicate; PDF Windows-1252 only; delivered incoterms not supported.
- **Tariff Calculator:** reference-validation open items (2026-10-19); expert data gaps and PR 2b items; scheduled-change warning knows only loaded rows; no past entry dates; rounding and single-line MPF are assumptions; HTS lookup path lacks chapter titles; polysilicon named before it starts; fee rollover wording for non-editors unreachable; duty reads not paged; estimates not in the Expert PDF/DOCX; saved estimates can't prove inputs.
- **Client dashboard:** remove the live demo client; no invite/reset/request emails (no SMTP); introductions are a request, not a workflow; reply guard blocks the client's own cities; requests can't be closed; a must-change-password client can read updates via the API; a paid client's whole report is in the page data; "Move's take" guard is word-based; demo seed content hand-written; portal "today" is UTC; no nudge after project changes.
- **Forwarder Audit:** v1.0 workbook quirks kept for parity (B1–B12, questions for v1.1); the Summary prints the last saved inputs (no locked versions); pgTAP 07 fails on the local database (duplicate fee rows, pre-existing).
- **Forwarder / 3PL:** forwarder ranking basis (open decision); 3PL recommendation page unreachable; 3PL comparison has no tie handling; New Project button clipped at phone width.
- **Cross-cutting:** extra Auth call per staff action; PGRST303 retried only in crons; no timeout on document parsing; no rate limit on AI extraction; email shown when no display name; inconsistent timestamp column names.

## 6. Waiting on people / parked
**Landed Cost — expert questions** (sent 2026-10-21, awaiting answers; confirmed by Dani):
- Volumetric divisors (today Air 6,000 cm³/kg, Sea 1,000, Road none).
- The MPF base.
- Formal vs informal entry under $2,500 (also Tariff item A6 below).
- One entry per shipment.
- Price basis.
- Whether EXW is dutiable as entered.
- Vietnam 10%.
- Quotes per origin.

**Tariff Calculator — expert decisions** (TECH_DEBT, "open items from the reference validation", A1–A8):
- Every loaded duty program is still pending review, so estimates leave out China 301, Section 232 and forced labour (High for real use).
- Forced labour withheld where an unloaded 232 trigger matches.
- Pharmaceuticals on the forced-labour exclusion list.
- The 178 Section 301 exclusions (expire 2026-11-09 unless extended).
- Annex III at column 1 ≥ 15%.
- Informal MPF at ≤ $2,500.
- The Annex I-C 9903.82.20–.22 reading.
- Forced labour on polysilicon.
- Also: the 9903.82.22 rate, total or added?

**Tariff — questions for Ms. Lara** (TECH_DEBT, section C):
- List 3 / 4A blanks in the workbook.
- Illustrative HTS codes (real ones needed for golden tests).
- The four-year-review "other groups" rate.
- Chassis, cranes and informal MPF missing from the workbook.
- Drones with 232 = Y.
- The three "Confirm" Section 232 rows.

**Tariff — data work:** Annex III and I-C move to Annex I-B rates on 2028-01-01. An editor must add the dated rows **by 2026-12-31** (TECH_DEBT, B).

**Decisions for Move:** forwarder ranking basis (Freight Cost vs Total Comparable Logistics Cost); client dashboard `[PRICE]` and `[INTRO FEE]` (nothing shows or charges money until set); portal branding; annual-savings visibility to clients; closed-engagement retention.

**Other:**
- **Demo client removal:** "Brightline Apparel (Demo)" is still on production. The removal steps are in TECH_DEBT ("Remove the live demo client"; the tool is only on branch `chore/demo-seed-production`, so don't delete that branch first). Removal date: from planning notes.
- **Production staff password minimum:** from planning notes. The local `supabase/config.toml` has `minimum_password_length = 6`; client users must choose 12+ characters.
- **Pre-first-real-client checklist:** from planning notes.
- **Optional:** revoke `INSERT` on `duty_estimates` from `service_role` (SECURITY.md, "not done"); delete stale test accounts and merged branches.

## 7. File map
| Area | Path |
|---|---|
| Migrations / pgTAP | `supabase/migrations/`, `supabase/tests/database/` (Landed Cost: 37–40; Forwarder Audit: 41) |
| Auth, ownership, guards | `src/lib/auth/` (`require-client.ts`), `requireStaff()` |
| Supabase clients | `src/lib/supabase/` (`admin-client.ts` = service role, server-only) |
| Clients | `src/lib/clients.ts`, `src/lib/clients-server.ts` |
| Landed Cost | `src/lib/landed-cost/` (`server-compute.ts`, `manual-rates.ts`, `snapshot-schema.ts`, `snapshot-store.ts`, `export-csv.ts`, `version-report.ts`), `src/app/(authenticated)/landed-cost/` |
| Admin, Help | `src/app/(authenticated)/admin/`, `src/app/(authenticated)/help/` |
| AI extraction | `src/lib/document-extraction.ts` |
| Client users, updates, portal | `src/lib/client-users/`, `src/lib/client-updates/`, `src/components/client-portal/`, `src/app/portal/` |
| Client requests | `src/lib/client-requests/` (wording in `text.ts`), `src/app/(authenticated)/client-requests/` |
| Forwarder Audit | `src/lib/forwarder-audit/` (`engine.ts`, `lists.ts`, `calc-semantics.ts`, `input-schema.ts`, `summary-sheet.ts`, `__fixtures__/golden/`), `src/app/(authenticated)/forwarder-audit/`, `scripts/forwarder-audit/` |
| QA | `scripts/qa/`, `docs/qa/` (`regression-test-cases.md` holds the timezone list) |

## 8. Fragile areas (don't break)
- Every insert, update or delete action chains `.select()` and checks for rows: an RLS refusal returns no rows and no error.
- Never write `profiles` directly; roles and names go through `auth.admin.updateUserById()` (`app_metadata`) and a trigger mirrors them.
- Client payloads come only from their allow-lists (`payload-schema.ts`, `market-report-schema.ts` and their allow-list tests): no notes, assessments, status words, contact details, ids or 3PL amounts. Only shortlisted partners are named; a letter never reveals its forwarder.
- While `must_change_password` is set, every client write is refused (database and app).
- The `create_*_project_with_client` field lists must match the form parsers (Vitest drift checks).
- `one_incumbent_per_client` drives 3PL baseline math; `src/lib/chip-value.ts` is delimiter-safe (labels contain commas).
- Forwarder Audit: the engine matches the workbook cell by cell (`forwarder-audit.golden.test.ts`); change a rule only with a new workbook version, regenerated fixtures, then the engine. The input schema (`input-schema.ts`) must keep accepting what the engine's `cell-map.ts` reads.
- Landed Cost: the SQL key lists in the draft and snapshot functions match the TypeScript schemas (db-sync tests); exports without manual rates are pinned by sha256 hashes (`manual-rates-exports.test.ts`); CSV cells go through the formula-injection guard.

# Handover: MOVE Supply Chain Decision Hub

For a developer or owner taking over this app who has not seen it. Everything here comes from the repo's own docs, migrations and config; where something isn't written down it says **not documented**. "Confirmed by Dani" means the project owner said it; the repo can't prove it. The short, living version of this is `docs/PROJECT_STATE.md`, and `docs/CHANGELOG.md` has the history. Read `AGENTS.md` before you touch code.

## 1. What the app is and who uses it

An internal hub for **Move Supply Chain Logistics Experts**: source and compare 3PLs and freight forwarders for a client, estimate US import duties, work out landed cost per unit across origins, and audit a forwarder's quotation. Clients are shared records; each module has its own projects.

Three kinds of user (`docs/SECURITY.md`):
- **Staff**: roles `admin` and `logistics_expert`, kept in `app_metadata` (users can't edit it). Admins also manage users in `/admin`; a separate `tariff_editor` flag lets a user maintain duty and fee data.
- **Experts**: the logistics experts are the people the modules are written for. The regression docs name Asia/Manila as "where the users are".
- **Clients**: external people at a client company, role `client`, who see only a **portal** of published snapshots (`/portal`): project updates, a Market Report (paid plan), requests and introductions. `client` is a role but never a staff role.

Sign-up is off. Not documented: how many users there are, or who the production users are.

## 2. Modules, flags and what is on

| Module | Where | Flag (exact env var) | In production |
|---|---|---|---|
| 3PL Sourcing | `src/app/(authenticated)/3pl-sourcing/`, `src/lib/three-pl/` | none | Live |
| Forwarder Sourcing | `.../forwarder-sourcing/`, `src/lib/forwarder/` | none | Live |
| Tariff Calculator | `.../tariff-calculator/`, `src/lib/tariff/`, `scripts/tariff/` | none | Live; every duty program is still pending expert review, so estimates leave out China 301, Section 232 and forced labour |
| Client portal, Market Report, requests, introductions | `/client-access`, `/portal`, `/market-reports`, `/client-requests` | none | Live (Phases 0 to 3b) |
| Landed Cost | `.../landed-cost/`, `src/lib/landed-cost/` | `LANDED_COST_ENABLED=true` | **On** (set in Vercel, smoke test passed 2026-10-21; confirmed by Dani) |
| Forwarder Audit | `.../forwarder-audit/`, `src/lib/forwarder-audit/` | `FORWARDER_AUDIT_ENABLED=true` | **Not documented.** It is merged to `main`; PROJECT_STATE (written before the merge) says the flag goes on in Vercel only after a smoke test. Check the Vercel settings and `npx supabase db push --dry-run` |
| 3PL Audit | not built | none | Shown as "Soon" in the nav (`src/lib/modules.ts`) |

A flag is on only for the exact string `true`. Off: its pages are a 404, its Server Actions refuse, the nav shows "Soon", and its `/help` section is hidden. Flags are read on the server only (a test fails if a client component reads one); on Vercel a change needs a **redeploy**. Landed Cost's Phase 6 (a forwarder quote link) was dropped by decision (2026-10-22).

One-line descriptions: Landed Cost = full cost of one shipment per unit across up to 5 origins (`docs/FEATURES/landed-cost.md`). Forwarder Audit = audit one freight quotation against the CI/PL, a port of a frozen Excel workbook (`docs/FEATURES/forwarder-audit.md`).

## 3. Architecture on one page

**Stack:** Next.js 16 (App Router; **it has breaking changes: read `node_modules/next/dist/docs/` before writing Next code**), TypeScript, Tailwind v4, shadcn/ui (Base UI), Supabase (Postgres + Auth), Vercel, Zod, pdfkit, docx, Vitest, pgTAP. Node 22 (`.nvmrc`). The AI document upload uses the Anthropic SDK (`src/lib/document-extraction.ts`).

**Folders**
- `src/app/(authenticated)/`: all staff pages and their Server Actions. `src/app/portal/`: the client portal. `src/app/api/cron/`: the cron routes. `src/app/login`, `logout`.
- `src/proxy.ts` (Next 16's `middleware`) runs `updateSession` in `src/lib/supabase/middleware.ts`: session refresh, login redirect (skipped for `/api/cron/`), security headers.
- `src/lib/`: shared logic, one folder per area (`tariff`, `landed-cost`, `forwarder-audit`, `forwarder`, `three-pl`, `client-users`, `client-updates`, `client-requests`, `auth`, `supabase`, `fx`). `src/lib/modules.ts` lists the hub's modules.
- `supabase/migrations/` (64 files) and `supabase/tests/database/` (pgTAP, numbered 01 to 41). `scripts/` (`tariff/`, `qa/`, `forwarder-audit/`). `data/tariff/` holds the duty source data.

**Where the pure engines live** (no network, no database; tested directly): the Tariff Calculator's exact-arithmetic duty engine (`src/lib/tariff/`), Landed Cost's calculations (`src/lib/landed-cost/`: cartons, CBM, freight split, fees, totals, manual rates), the 3PL and forwarder cost comparisons (`src/lib/cost-comparison.ts`, `src/lib/forwarder/`), and the Forwarder Audit engine (`src/lib/forwarder-audit/engine.ts`, `runAudit(inputs)`).

**How drafts, locking and RLS work**
- **Drafts store inputs only.** Landed Cost workspaces and Forwarder Audits keep no duty, total or status; results are recalculated from the saved inputs every time they're shown (Landed Cost on the server; Forwarder Audit by the same engine in the browser and on the server). Saves check `updated_at` so a second tab can't silently overwrite.
- **Locking.** A Landed Cost *version* freezes the last save and its server-calculated result as v1, v2, … It is immutable (a trigger refuses every update), is shown from what was stored and never recalculated, and the number is never reused. Saved duty estimates are locked the same way. Forwarder Audit has no locking.
- **RLS.** Every internal table has a restrictive policy `(select public.has_staff_role())` plus owner-or-admin write policies; `has_staff_role()` is true only for `admin` and `logistics_expert`. Clients reach data only through security-definer functions that force their own client id.
- **Fragile areas to respect** (PROJECT_STATE section 8): every insert/update/delete action chains `.select()` and checks for rows (an RLS refusal returns no rows and no error); never write `profiles` directly; client payloads come only from allow-lists; while `must_change_password` is set every client write is refused.

## 4. Environments and deploy

- **Local:** Node 22 (`nvm use`), Docker Desktop, `npx supabase start`, `npm run dev` on :3000. `.env.local` points at the **local** Supabase stack (changed 2026-10-21, confirmed by Dani). **Never point `.env.local` at production**; production values live in Vercel. Never read, print or commit `.env` or `.env.local` (AGENTS.md).
- **Production:** Vercel deploys on every push to `main`. Crons are in `vercel.json` (`/api/cron/fx-rates` twice a day, `/api/cron/hts-release` four times a day) and need `CRON_SECRET`. The Vercel project's Node version must match `.nvmrc`.
- **Variable names in the docs:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, `LANDED_COST_ENABLED`, `FORWARDER_AUDIT_ENABLED`. The full production list is **not documented**.
- **Database changes: migrations only.** `npx supabase migration new <name>`, write the SQL in it, test locally with `npx supabase migration up` then `npm run test:db`, commit it with the feature. Never raw SQL against Supabase, never edit an applied migration (use a new one), and **never `npx supabase db reset`** (the local database holds QA accounts, demo data and guide tooling). Any migration that backfills data must disable the `updated_at` triggers while it runs. Every new table revokes all from `anon`.
- **Deploy:** `npx supabase db push --dry-run` and read the list, then for added schema: `npx supabase db push && git push` (migration first; the `&&` matters, because code that expects missing columns breaks production). For removed schema: push the code first, wait for Vercel, then `db push`.
- **Rollback:** Vercel → Deployments → the previous production deployment → Promote to Production. This restores code only; undo a schema change with a *new* migration.
- **Git:** one branch per change (`feat/…`, `fix/…`, `docs/…`), merged with a merge commit; Conventional Commits. Not documented: branch protection or who may push to `main`.

## 5. Security model

Full detail is in `docs/SECURITY.md`. The essentials:
- **Staff-only RLS** on every internal table; clients and anon get nothing except the one table a client may read (`client_entitlements`) and their portal functions. New tables must be named on purpose in pgTAP 03, 24 and 28.
- **Server Actions:** staff ones start with `await requireStaff()`, portal ones with `await requireClient()` (a test enforces this); then the feature flag where there is one; inputs are parsed with Zod; errors are logged and reported in fixed words. The user comes from `auth.getUser()`, never `getSession()` or the browser.
- **The service-role key bypasses RLS and is allowed in exactly these places** (`service-role-use.test.ts` enforces the list):
  1. **Cron routes** `/api/cron/fx-rates` and `/api/cron/hts-release`: no user is present; each calls `isAuthorizedCronRequest()` (`CRON_SECRET`) first and writes only its own tables.
  2. **`src/lib/tariff/estimate-store.ts`:** only `save_duty_estimate()`, so a saved estimate holds numbers the server calculated.
  3. **`src/lib/client-users/create-client-user.ts`:** creates client users and resets their passwords (three Auth admin calls) after `requireStaff()`; the role is fixed to `client`.
  4. **`src/lib/landed-cost/snapshot-store.ts`:** only `save_landed_cost_snapshot()`, so a locked version can't hold numbers the calculator never produced.
  Admin actions also use it, but only behind an admin check. Forwarder Audit uses none.
- **Never add `client` to `has_staff_role()`, `STAFF_ROLES` or `staffRole()`**: that opens every internal table to external users (a test fails if you try).
- **Client payloads** are built from allow-lists (`payload-schema.ts`, `market-report-schema.ts`): no notes, assessments, contact details or 3PL amounts; only shortlisted partners are named.
- **Secrets:** read from environment variables only; a new variable must be documented in `.env.example`; never commit secrets.

## 6. Testing

| What | Command | Notes |
|---|---|---|
| Unit tests (Vitest) | `npm test` | Pure: no network or database. 2,340 passed on 2026-10-26 |
| The 7 timezones | `for tz in UTC America/Los_Angeles Asia/Ho_Chi_Minh Pacific/Kiritimati Pacific/Pago_Pago Australia/Lord_Howe Asia/Manila; do TZ=$tz npx vitest run </dev/null; done` | Run before merging |
| pgTAP (RLS, grants) | `npx supabase migration up` then `npm run test:db` | Local only, each file rolls back. Known failure: file 07 (below) |
| Lint, types, build | `npm run lint`, `npm run typecheck`, `npm run build` | |
| Forwarder Audit golden fixtures | `python3 scripts/forwarder-audit/golden.py` | Needs LibreOffice; recalculates the workbook and rewrites `src/lib/forwarder-audit/__fixtures__/golden/`; Vitest compares every formula cell |
| Tariff seed drift | `npm run tariff:verify` | Fetches sources, regenerates seed migrations and diffs them (needs network) |
| Local data | `npm run qa:seed`, `npm run demo:seed`, `npm run fa:seed-case <case>` | Local stack only (they refuse any other URL) |
| Client portal leak scan | `npm run qa:portal-scan` | Local app running; must end "clean" |

**Regression:** `docs/qa/regression-test-cases.md` is the reusable matrix and "How to run a regression" (local only, a separate git worktree so no `.env` is loaded, the app on :3100, Chromium at 1280 and 390 px, no screenshots or passwords in the repo, a checkpoint commit per module, stop at the first Critical bug). `docs/qa/regression-plan-2026-10-23.md` and the reports (2026-10-09, 2026-10-23) show the last runs. `docs/qa/unattended-run-settings.json` is a permissions template for an unattended run. Not documented: any CI pipeline (no workflow file is described).

## 7. Open items

**Dependency audit (not in the repo).** Dani states `npm audit` currently reports 20 vulnerabilities, 2 of them critical. **Do not run `npm audit fix --force`.** The repo has no record of this; the CHANGELOG records an earlier upgrade of `next` to 16.3.3 for two critical advisories, after which `npm audit` reported 0. Re-run `npm audit` to see the current list and fix each item deliberately.

**Technical debt** (`docs/TECH_DEBT.md`, about 60 entries; PROJECT_STATE section 5 has titles). Highlights:
- **Tariff:** every duty program is pending expert review, so estimates leave out China 301, Section 232 and forced labour (High for real use); the 178 Section 301 exclusions expire 2026-11-09 unless extended; **an editor must add the dated rows for Annex III and I-C by 2026-12-31** (rates move on 2028-01-01); rounding and single-line MPF are assumptions.
- **Client dashboard:** no email at all (no SMTP: no invites, resets or request notices); introductions are a request, not a workflow; requests can't be closed; a client who must still change their password can read updates through the API.
- **Forwarder Audit:** v1.0 workbook quirks kept for parity (B1 to B12, questions for v1.1); the Summary prints the last saved inputs; **pgTAP 07 fails on the local database** (duplicate seeded fee rows; pre-existing; not investigated).
- **Cross-cutting:** no rate limit on AI extraction; no timeout around document parsing; PGRST303 retried only in the crons; extra Auth call per staff action.
- **Landed Cost:** paste only (no .xlsx); delivered incoterms unsupported; manual rates not copied on duplicate; PDFs only Windows-1252.
- **Demo client:** "Brightline Apparel (Demo)" is still on production; the removal steps are in TECH_DEBT and use a tool that exists only on branch `chore/demo-seed-production` (don't delete that branch first). Removal date: **not documented**.

**Waiting on people** (PROJECT_STATE section 6):
- **Landed Cost expert questions** (sent 2026-10-21, unanswered): volumetric divisors, the MPF base, formal vs informal entry under $2,500, one entry per shipment, price basis, whether EXW is dutiable as entered, Vietnam 10%, quotes per origin.
- **Tariff expert decisions** A1 to A8 (TECH_DEBT, "open items from the reference validation"), plus questions for Ms. Lara (workbook blanks, real HTS codes for golden tests, three "Confirm" Section 232 rows).
- **Decisions for Move:** forwarder ranking basis (Freight Cost vs Total Comparable Logistics Cost); client dashboard `[PRICE]` and `[INTRO FEE]` (nothing shows or charges money until set); portal branding; annual-savings visibility to clients; closed-engagement retention.

**Pre-first-real-client checklist: not documented in the repo** (PROJECT_STATE says "from planning notes"). The same goes for the production **staff password minimum** (the local `supabase/config.toml` has `minimum_password_length = 6`; client users must choose 12+ characters). Items that the docs do name as undone: remove the demo client; set the production password rules; the dependency audit; the unreviewed duty programs; no SMTP. Optional clean-ups: revoke `INSERT` on `duty_estimates` from `service_role` (SECURITY.md, "not done"); delete stale test accounts and merged branches.

## 8. How to add a module

The workflow the last two modules (Landed Cost, Forwarder Audit) followed, from PROJECT_STATE and the repo:
1. **Plan first, get approval**, then implement in phases on one branch (`feat/<module>`). No new dependency without approval (CODING_STANDARDS section 7).
2. **Engine as pure TypeScript** in `src/lib/<module>/`, with unit tests. If there's a source of truth (a workbook, a rate table), test against it cell by cell.
3. **Migration** via `npx supabase migration new`: RLS on, the restrictive `has_staff_role()` policy, owner-or-admin writes, `revoke all` from `anon`, column-level update grants, no service role unless it's truly needed (a new service-role use needs an entry in SECURITY.md and `service-role-use.test.ts`). Add a pgTAP file and add the table to pgTAP 03, 24 and 28.
4. **Feature flag**: `src/lib/<module>/feature-flag.ts` (`=== "true"`, server-only) with a test that no client component reads it; gate the pages (`notFound()`), the Server Actions (after `requireStaff()`), the nav (`hubModules` in `src/lib/modules.ts`) and the `/help` section.
5. **Server Actions**: `requireStaff()` first (`server-action-guard.test.ts`), strict Zod schema, owner-or-admin check, write with `.select()` and a returned-row check, stale check on `updated_at`.
6. **UI**: native inputs for server-prefilled fields (not shadcn `Input`; AGENTS.md), the styles in `docs/DESIGN_SYSTEM.md`, no horizontal page scroll at 390 px.
7. **Checks**: lint, typecheck, Vitest in the 7 timezones, `migration up` and `test:db`, `build`.
8. **Docs in the same change**: `/help` section, `docs/FEATURES/<module>.md`, README (new env var), SECURITY.md, TECH_DEBT, a CHANGELOG entry (3 to 5 lines), PROJECT_STATE, and QA cases in `docs/qa/regression-test-cases.md`.
9. **Deploy** with `npx supabase db push && git push`, then set the flag in Vercel and redeploy after a smoke test.

## 9. Where everything is

| Doc | What it holds |
|---|---|
| `AGENTS.md` (`CLAUDE.md` imports it) | Rules for anyone changing code: Next.js 16 caveat, secrets, database flow, cron routes, the four service-role exceptions, client users and updates, form inputs, `/help` |
| `docs/PROJECT_STATE.md` | The short living state: modules, production status, how to work, debt titles, waiting-on-people, file map, fragile areas |
| `docs/CHANGELOG.md` | History, one entry per change |
| `docs/CODING_STANDARDS.md` | Naming, structure, dependencies, testing approach |
| `docs/DESIGN_SYSTEM.md` | Colours, type, components |
| `docs/SECURITY.md` | Security rules and each exception in detail |
| `docs/TECH_DEBT.md` | Every known shortcut, with severity and where to fix |
| `docs/FEATURES/` | `landed-cost.md`, `forwarder-audit.md` |
| `docs/qa/` | Regression matrix, plan, reports, unattended-run settings, a cleanup SQL file |
| `docs/forwarder-audit/` | The frozen v1.0 workbook and its three test cases |
| `docs/tariff-data/`, `data/tariff/`, `scripts/tariff/` | Tariff reference checks, source data and import scripts |
| `docs/regression-2026-09-28*`, `docs/REGRESSION_REPORT_2026-09-28*.md` | Older regression evidence |
| `README.md` | Getting started and the environment flags |
| `supabase/migrations/`, `supabase/tests/database/` | The schema's history and the permission tests |
| `/help` in the app | The user-facing how-to for staff |

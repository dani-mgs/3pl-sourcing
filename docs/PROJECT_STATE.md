# MOVE Supply Chain Decision Hub — Project State & Handover

_Last updated: 2026-10-15 by Dani (as of `main` at bd6958c, live demo client on production)_

**Live:** 3PL Sourcing, Forwarder Sourcing, Tariff Calculator, client dashboard Phases 0–3b (client portal, Market Report, client requests and introductions). **Next:** Landed Cost Calculator; client dashboard Phase 4 not planned yet (section 7). **Deferred:** 3PL Audit, Forwarder Audit.

History is in git and `docs/CHANGELOG.md`; this file is the short version.

---

## 1. One-line project summary
Internal hub for Move Supply Chain Logistics Experts: source and compare 3PLs and freight forwarders for a client, and estimate US import duties. Clients are shared records; each module has its own projects.

## 2. Tech stack
- Next.js 16 + TypeScript + Tailwind v4 + shadcn/ui; Supabase Postgres + Auth (ref vnidvcskfsyfytdjbiji)
- Vercel: pushing `main` deploys production; crons in `vercel.json`. Node 22 (`.nvmrc`). Repo: github.com/dani-mgs/3pl-sourcing

## 3. SESSION RESTART CHECKLIST
- `nvm use`, start Docker Desktop fully, start `claude` (check `/mcp` shows playwright), `npm run dev` on :3000.
- Have Claude read this file, `CHANGELOG.md`, `TECH_DEBT.md`, `SECURITY.md` and `DESIGN_SYSTEM.md` first.
- Gotchas: run `git status` after Supabase CLI work (migrations have been left uncommitted); LegacyPlatformAuthRequiredError → `npx supabase login`; after global CSS changes, `rm -rf .next`.

## 4. CURRENT STATE

**Shipped since 2026-09-29**
- **Tariff Calculator v1:**
  - Base duty, MPF and HMF.
  - Additional duties with an expert review workflow.
  - China 301 and Section 232 metals seeded pending review.
  - HTS lookup.
  - Locked saved estimates.
  - "Estimate duties" from Forwarder Sourcing.
- **Tariff Calculator:** an expected entry date. An unconfirmed duty row never displaces a confirmed, in-force one.
- **Tariff Calculator clarity:** effective rate, oldest review, a 45-day scheduled-change warning, and a Key dates list.
- **Expert checklist:** added, then removed (code reverted, tables dropped) and replaced by a handoff document.
- **Forwarder:** Project Duration (optional, 1–120 months), on the form, the summary and the exports.
- **Forwarder:** Scenario Group removed. A project's quotes with matching terms rank together; other terms show as "Different terms".
- **Forwarder:** Freight Cost Ratio replaces Annual Saving on the project summary and in client exports. Expert exports keep Annual Savings beside it.
- **Forwarder:** the Current tile adds Freight Cost and Commercial Invoice Value.
- **3PL:** Contract Period (optional, 1–120 months).
- **Also:** daily FX feed with locked quote rates; `/help` and FAQ; forwarder summary and detail redesign; security headers, a CSV formula-injection guard, Zod on 3PL and admin actions.

**Client dashboard (Phases 0–3b), how it fits together**
- **Client role:** a client user is an external Auth user with `app_metadata.role = client` and a `client_id`, created by staff on `/client-access` with a one-time password (no email). They only reach `/portal`.
- **Entitlements:** one `client_entitlements` row per client (`free` or `market_report`, optional end date; no row = free). The paid-plan check is `client_has_paid_tier()`.
- **Published snapshots:** "Share update with client" on a project page builds a payload on the server from an allow-list and publishes it to `client_updates` (Phase 2a). Clients only ever see published snapshots, never live project data; drafts stay staff-side.
- **Portal** (`/portal`, Phase 2b): each project's latest update and history, what needs the client, key figures, a timeline, and "Your questions and requests".
- **View as client** (`/client-access/[clientId]/preview`): staff see exactly the client's portal and Market Report through staff twins of the same SQL, with no buttons.
- **Market Report** (Phase 2c, paid plan): a published snapshot of every forwarder contacted for a forwarder project. The shortlist is named; the rest show as Partner D, E, … Free clients get a locked page.
- **Client requests** (Phase 3a): approve a recommendation, request changes or ask a question. **Introductions and interest** (Phase 3b): "Request introduction" on a lettered Market Report row (paid), "Unlock the Market Report" (free). All are rows in `client_requests`.
- **Staff inbox** (`/client-requests`, Requests badge in the top bar): the project owner or an admin marks a request seen and replies once (Market Report interest: an admin or the owner of any of the client's projects). Admins can withdraw a reply. Staff see which forwarder a letter is; the client never does. There are no emails: watch the badge.
- Details: `docs/SECURITY.md` ("Client users", "Client updates", "Market Report", "Client requests", "Introductions and Market Report interest"); every change is in `docs/CHANGELOG.md`.

**Migrations since the last update** (all applied to production)
- `20261012131014_client_role_foundation`: client role, `client_entitlements`, `has_staff_role()` (renamed from `has_app_role()`), client users.
- `20261012143916_client_updates`: `client_updates`, `client_update_inputs`, the payload check.
- `20261012234353_client_portal_read`: `my_portal_updates()`, the staff twin, contact names.
- `20261013015815_client_market_report`: reports, partner labels, `my_market_reports()`.
- `20261013024500_client_requests`: `client_requests`, submit, read, seen, reply, withdraw, badge; `update_key` on the portal functions.
- `20261013061248_client_introductions`: introductions and Market Report interest, shared caller and rate-cap checks, `partner_label` on the request reads.

**QA**
- **Full regression, 2026-10-09:** 188 cases, 0 Critical; report in `docs/qa/regression-report-2026-10-09.md`.
- **Fixes:** every logged bug, B-1 to B-12, is fixed. So are the three follow-ups:
  - the B-5 database guard (composite foreign keys);
  - one-transaction create for forwarder projects;
  - the provider-by-project index.
- **Reusable matrix:** `docs/qa/regression-test-cases.md`.
- **`npm run qa:seed`:** creates ZZQA test users and data. It refuses any URL but the local stack, and prints a new password each run.
- **`npm run demo:seed`:** six realistic demo clients for the client dashboard (Northwind, Brightline, Kettle & Pine, Solace, Ridgeway, Harbor), owned by two `@demo.example.test` experts, with client users, published updates, Market Reports (Brightline paid, Ridgeway free) and requests in every state. Same local-only guard and per-run password; independent of `qa:seed`. Internal-only fields hold `INTERNAL-CANARY`.
- **`npm run qa:portal-scan`:** the client portal leak scan (what it checks: `docs/qa/regression-test-cases.md`, item 5). Run it after any change to what the portal shows.
- **Production cleanup candidates:** `docs/qa/cleanup-candidates.sql`, one read-only SELECT to run in the SQL Editor; delete through the app, never SQL.

**Live demo data (production, since 2026-10-15)**
- **What exists:** "Brightline Apparel (Demo)" on the paid plan: a 3PL project (10 3PLs), a forwarder project (12 forwarders), a published update on each, a Market Report, three requests (approval, question, introduction) and the portal user `brightline-demo@demo.example.test`. It's there for the team to explore.
- **No saved duty estimate:** `duty_estimates` refuses service-role writes by design, so the estimate isn't seeded.
- **The tool** (`scripts/demo/*`, `docs/qa/live-demo.md`) is only on branch `chore/demo-seed-production`, intentionally not merged. Don't delete that branch until the data is removed.
- **Removal:** one step with `demo:remove`; see `docs/TECH_DEBT.md`, "Remove the live demo client".

**Security model** (details in `docs/SECURITY.md`)
- **Role checks** (`is_admin()`, `is_tariff_editor()`) read the live role from `auth.users`, not the session token. Changes apply on the next page load or save; no re-login is needed.
- **Display names** are admin-only, stored in `app_metadata.first_name`. `profiles` is a one-way mirror of them.
- **All data access needs an admin-assigned staff role.** Every internal RLS table has a restrictive `has_staff_role()` policy (renamed from `has_app_role()` on 2026-10-12), so an account without a staff role (no role, or a client user) sees and writes nothing.
- **Client users** (role `client`, external) can read one table, their client's `client_entitlements` row; everything else goes through functions. The client dashboard rules are in section 10.
- **Signup is off** (`[auth] enable_signup = false`; production verified off on 2026-10-09).
- **TRUNCATE is revoked** from `authenticated` and `anon`.
- **Client and project are created in one transaction**, in both modules (`create_three_pl_project_with_client`, `create_forwarder_project_with_client`). A failed save leaves no orphan client.
- **Service role is used only** by the two cron routes, the `saveEstimate` path, `create-client-user.ts` (client users) and the admin actions behind an admin check (enforced by `service-role-use.test.ts`).

## 5. HOW TO WORK
- **Deploy:**
  - **Schema changes:** migrations only (AGENTS.md), and additive where possible.
  - **Adding:** migration first, then code: `npx supabase db push && git push`.
  - **Removing:** code first (`git push`, wait for Vercel), then `db push`.
- **Rollback:** in Vercel, promote the previous production deployment. That restores code only; undo a database change with a new migration.
- **Gates before merging:**
  - Vitest in 7 timezones: UTC, America/Los_Angeles, Asia/Ho_Chi_Minh, Pacific/Kiritimati, Pacific/Pago_Pago, Australia/Lord_Howe and Asia/Manila.
  - pgTAP on a fresh database (`db reset`) AND a seeded one (`qa:seed`, then `demo:seed`).
  - `npm run lint`.
  - `npm run typecheck` (runs `next typegen` first).
- **Local QA rules:**
  - Local only.
  - Run the app from a git worktree on :3100 with keys from `npx supabase status -o env`.
  - Never read or load `.env` files.
  - No screenshots or passwords in the repo.
- **`/help`:** update it in the same change as any behaviour it describes.
- **Run the client dashboard demo locally** (Docker running):
  ```sh
  nvm use
  npx supabase db reset            # optional: a fresh local database
  npm run qa:seed                  # ZZQA users and data (prints a one-time password)
  npm run demo:seed                # demo clients, client users, updates, reports, requests (prints a one-time password)
  # app on :3100 from a worktree, with keys from `npx supabase status -o env` (see Local QA rules), then:
  npm run qa:portal-scan           # must end with "clean"
  ```
  Demo sign-ins: `brightline-ops@demo.example.test` (paid), `ridgeway-ops@` (free), `northwind-ops@` and `northwind-finance@` (two users at one client), `solace-ops@` (must change password); staff `demo-expert1@` (Alex) and `demo-expert2@` (Priya), all `@demo.example.test`, with the password `demo:seed` printed.

## 6. NEXT TASK
Landed Cost Calculator (not started; no plan yet). Client dashboard Phase 4 has no plan yet either (section 7).

## 7. OPEN ITEMS
- **Expert tasks:**
  - Grant tariff editor with the Administration buttons.
  - Review the pending duty programs.
  - Settle the 9903.82.22 rate: is the 15% a total or an added rate? (TECH_DEBT)
  - Load the remaining Section 232 programs and scheduled changes from the expert handoff doc: https://claude.ai/code/artifact/a10e50f2-3b46-44ef-9283-45a8095e5330
- **Decisions for Move:**
  - Forwarder ranking basis: Freight Cost only, or Total Comparable Logistics Cost.
  - Multi-SKU entries: the calculator estimates one line, with MPF min/max applied to that line.
- **Client dashboard, decided:**
  - SMTP skipped (2026-10-12): no invite, reset or notification emails; staff hand over one-time passwords and watch the Requests badge.
  - An approval means "proceed": it records who, when and a frozen copy, and doesn't move the stage. No contract or legal wording until Move decides otherwise; all client wording is in `src/lib/client-requests/text.ts`.
- **Client dashboard, open:**
  - `[PRICE]` (the Market Report plan) and `[INTRO FEE]` (introductions): nothing in the portal shows or charges money until Move sets them; a test keeps prices and fees out of the wording.
  - Branding of the portal: open (today it uses the Move design system).
  - Annual savings visibility to clients: open (today a forwarder update shares them only when the expert ticks "Include annual estimate").
  - Closed-engagement retention: what a client keeps seeing, and for how long, after an engagement ends: open (today nothing expires, and deleting a project deletes its updates, reports and requests, approvals included).
  - Phase 4 ideas, none planned: emails for requests and replies (needs SMTP or a provider, a new dependency), a nudge when a project changes after its last published update, closing and archiving requests, an introduction workflow once the fee is set, PDF and spreadsheet downloads of the Market Report.
- **Optional follow-ups:**
  - Revoke `INSERT` on `duty_estimates` from `service_role`, so even the key can save estimates only through `save_duty_estimate` (SECURITY.md: "not done").
  - Delete stale test accounts and merged branches.
  - Remove the live demo client once the team is done (TECH_DEBT).
- **Known limits:**
  - A deleted user's old token was valid for up to 1 hour on their own rows (report, B-1/B-2). The later role gate should close this: `has_app_role()` finds no `auth.users` row, so every RLS table refuses the token. This comes from the function's definition, not a dedicated test.
  - Others are in `docs/TECH_DEBT.md`. For the client dashboard, the ones that matter most:
    - no emails at all (invites, resets, requests, replies);
    - a client who must still change their password can read (not write) their own published updates over the API;
    - a paid client's whole report is in the page's data (by design: it's theirs, but it can be copied);
    - the "Move's take" and introduction reply guards are word-based: cautious (they block the client's own cities) but a paraphrase gets through;
    - requests can't be closed or archived, and deleting a project deletes its requests, approvals included.

## 8. KEY ARCHITECTURE DECISIONS
- 2026-09-05: authorization lives in `app_metadata`, which users can't edit. Reads are open to every role-holder; writes are owner-or-admin.
- 2026-09-28: `clients` is a shared, admin-managed record (unique case-insensitive name), and each module's projects point at it.
- 2026-10-02: tariff rates are data with sources and dates, never hardcoded. Every estimate says "Estimate — verify with your customs broker".
- 2026-10-09: database checks read live `auth.users`, not the JWT. A restrictive role policy on every table. Multi-row creates run in a single SECURITY INVOKER function, so RLS still applies.
- 2026-10-12: clients see only published snapshots built from an allow-list, never live data. Client-facing tables stay staff-only, and clients read and write only through security-definer functions that force the client from `my_client_id()`. A migration that changes a portal function's shape adds columns last, so the deployed code keeps working until the code deploy.

## 9. FILE MAP
| Area | Path |
|---|---|
| Migrations / pgTAP | `supabase/migrations/`, `supabase/tests/database/` |
| Auth and ownership helpers | `src/lib/auth/` |
| Supabase clients | `src/lib/supabase/` (`admin-client.ts` = service role, server-only) |
| Clients (lookup, duplicate check) | `src/lib/clients.ts`, `src/lib/clients-server.ts` |
| 3PL Sourcing | `src/app/(authenticated)/3pl-sourcing/`, `src/lib/three-pl/`, `src/lib/cost-comparison.ts` |
| Forwarder Sourcing | `src/app/(authenticated)/forwarder-sourcing/`, `src/lib/forwarder/` |
| Tariff Calculator | `src/app/(authenticated)/tariff-calculator/`, `src/lib/tariff/`, `scripts/tariff/`, `docs/tariff-data/` |
| Admin, Help | `src/app/(authenticated)/admin/`, `src/app/(authenticated)/help/` |
| AI extraction | `src/lib/document-extraction.ts` |
| Client users, client access | `src/app/(authenticated)/client-access/`, `src/lib/client-users/`, `src/lib/auth/require-client.ts` |
| Client updates, portal, Market Report | `src/lib/client-updates/`, `src/components/client-portal/`, `src/app/portal/`, `src/app/(authenticated)/market-reports/` |
| Client requests, staff inbox | `src/lib/client-requests/` (wording in `text.ts`), `src/app/(authenticated)/client-requests/` |
| QA | `scripts/qa/seed-qa.mjs`, `scripts/qa/seed-demo.mjs` (data in `demo-portal-data.mjs`), `scripts/qa/portal-scan.mjs`, `docs/qa/` |

## 10. DO NOT TOUCH / FRAGILE AREAS
- Every insert, update or delete action chains `.select()` and checks for rows; an RLS refusal returns no rows and no error.
- Never write `profiles` directly. Roles and names go through `supabase.auth.admin.updateUserById()` (`app_metadata`), and the trigger mirrors them.
- The restrictive `has_staff_role()` policy must be on every internal RLS table; pgTAP 24 and 28 fail if a table lacks it (`client_entitlements` is the one named exception).
- **Client dashboard rules a future session must not break** (the why is in `docs/SECURITY.md`, the checklist in `AGENTS.md`):
  - `client_updates`, `client_update_inputs`, `client_market_reports`, `market_report_partner_labels` and `client_requests` are staff-only. Clients read and write only through security-definer functions (`search_path=''`, explicit REVOKE from public and anon) that force the client from `my_client_id()`. Every such function a signed-in user can call is on the pgTAP 32 tripwire.
  - `client` is never a staff role: never add it to `has_staff_role()`, `STAFF_ROLES` or `staffRole()` (`role-list-sync.test.ts`). Staff Server Actions start with `requireStaff()`, portal ones with `requireClient()`.
  - While `must_change_password` is set, every client write is refused, in the database as well as the app.
  - A client payload is built only from its allow-list (`payload-schema.ts`, `market-report-schema.ts` and their allow-list tests): no notes, assessments, status words, contact details, ids or 3PL amounts.
  - Anonymisation: only shortlisted partners are named. A lettered partner carries only its letter, price, lead time, like-for-like flag, outcome, size band, region and "Move's take"; "Not taken forward" only the letter, outcome, size and region. Letters are never reused, and no client function ever returns the forwarder behind a letter (staff replies to introductions are checked for it).
  - Run `npm run qa:portal-scan` after any change to what the portal shows.
- The `create_*_project_with_client` field lists must match the form parsers; Vitest drift checks enforce it.
- The `one_incumbent_per_client` partial unique index drives 3PL baseline math.
- The toggle-chip value format (`src/lib/chip-value.ts`) is delimiter-safe; labels contain commas, e.g. "Fulfillment (Pick, Check, Pack)".

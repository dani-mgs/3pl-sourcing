# MOVE Supply Chain Decision Hub — Project State & Handover

_Last updated: 2026-10-10 by Dani (as of `fix/data-integrity-followups`)_

**Live:** 3PL Sourcing, Forwarder Sourcing, Tariff Calculator. **Next:** Landed Cost Calculator. **Deferred:** 3PL Audit, Forwarder Audit, client dashboard.

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

**QA**
- **Full regression, 2026-10-09:** 188 cases, 0 Critical; report in `docs/qa/regression-report-2026-10-09.md`.
- **Fixes:** every logged bug, B-1 to B-12, is fixed. So are the three follow-ups:
  - the B-5 database guard (composite foreign keys);
  - one-transaction create for forwarder projects;
  - the provider-by-project index.
- **Reusable matrix:** `docs/qa/regression-test-cases.md`.
- **`npm run qa:seed`:** creates ZZQA test users and data. It refuses any URL but the local stack, and prints a new password each run.

**Security model** (details in `docs/SECURITY.md`)
- **Role checks** (`is_admin()`, `is_tariff_editor()`) read the live role from `auth.users`, not the session token. Changes apply on the next page load or save; no re-login is needed.
- **Display names** are admin-only, stored in `app_metadata.first_name`. `profiles` is a one-way mirror of them.
- **All data access needs an admin-assigned role.** Every RLS table has a restrictive `has_app_role()` policy, so an account without a role sees and writes nothing.
- **Signup is off** (`[auth] enable_signup = false`; production verified off on 2026-10-09).
- **TRUNCATE is revoked** from `authenticated` and `anon`.
- **Client and project are created in one transaction**, in both modules (`create_three_pl_project_with_client`, `create_forwarder_project_with_client`). A failed save leaves no orphan client.
- **Service role is used only** by the two cron routes, the `saveEstimate` path and the admin actions behind an admin check (enforced by `service-role-use.test.ts`).

## 5. HOW TO WORK
- **Deploy:**
  - **Schema changes:** migrations only (AGENTS.md), and additive where possible.
  - **Adding:** migration first, then code: `npx supabase db push && git push`.
  - **Removing:** code first (`git push`, wait for Vercel), then `db push`.
- **Rollback:** in Vercel, promote the previous production deployment. That restores code only; undo a database change with a new migration.
- **Gates before merging:**
  - Vitest in 7 timezones: UTC, America/Los_Angeles, Asia/Ho_Chi_Minh, Pacific/Kiritimati, Pacific/Pago_Pago, Australia/Lord_Howe and Asia/Manila.
  - pgTAP on a fresh database (`db reset`) AND a seeded one (`qa:seed`).
  - `npm run lint`.
  - `npm run typecheck` (runs `next typegen` first).
- **Local QA rules:**
  - Local only.
  - Run the app from a git worktree on :3100 with keys from `npx supabase status -o env`.
  - Never read or load `.env` files.
  - No screenshots or passwords in the repo.
- **`/help`:** update it in the same change as any behaviour it describes.

## 6. NEXT TASK
Landed Cost Calculator (not started; no plan yet).

## 7. OPEN ITEMS
- **Expert tasks:**
  - Grant tariff editor with the Administration buttons.
  - Review the pending duty programs.
  - Settle the 9903.82.22 rate: is the 15% a total or an added rate? (TECH_DEBT)
  - Load the remaining Section 232 programs and scheduled changes from the expert handoff doc: https://claude.ai/code/artifact/a10e50f2-3b46-44ef-9283-45a8095e5330
- **Decisions for Move:**
  - Forwarder ranking basis: Freight Cost only, or Total Comparable Logistics Cost.
  - Multi-SKU entries: the calculator estimates one line, with MPF min/max applied to that line.
- **Optional follow-ups:**
  - Revoke `INSERT` on `duty_estimates` from `service_role`, so even the key can save estimates only through `save_duty_estimate` (SECURITY.md: "not done").
  - Delete stale test accounts and merged branches.
- **Known limits:**
  - A deleted user's old token was valid for up to 1 hour on their own rows (report, B-1/B-2). The later role gate should close this: `has_app_role()` finds no `auth.users` row, so every RLS table refuses the token. This comes from the function's definition, not a dedicated test.
  - Others are in `docs/TECH_DEBT.md`.

## 8. KEY ARCHITECTURE DECISIONS
- 2026-09-05: authorization lives in `app_metadata`, which users can't edit. Reads are open to every role-holder; writes are owner-or-admin.
- 2026-09-28: `clients` is a shared, admin-managed record (unique case-insensitive name), and each module's projects point at it.
- 2026-10-02: tariff rates are data with sources and dates, never hardcoded. Every estimate says "Estimate — verify with your customs broker".
- 2026-10-09: database checks read live `auth.users`, not the JWT. A restrictive role policy on every table. Multi-row creates run in a single SECURITY INVOKER function, so RLS still applies.

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
| QA | `scripts/qa/seed-qa.mjs`, `docs/qa/` |

## 10. DO NOT TOUCH / FRAGILE AREAS
- Every insert, update or delete action chains `.select()` and checks for rows; an RLS refusal returns no rows and no error.
- Never write `profiles` directly. Roles and names go through `supabase.auth.admin.updateUserById()` (`app_metadata`), and the trigger mirrors them.
- The restrictive `has_app_role()` policy must be on every RLS table; pgTAP 24 fails if a table lacks it.
- The `create_*_project_with_client` field lists must match the form parsers; Vitest drift checks enforce it.
- The `one_incumbent_per_client` partial unique index drives 3PL baseline math.
- The toggle-chip value format (`src/lib/chip-value.ts`) is delimiter-safe; labels contain commas, e.g. "Fulfillment (Pick, Check, Pack)".

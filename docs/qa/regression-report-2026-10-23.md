# Regression Report — 2026-10-23

Run of [regression-plan-2026-10-23.md](regression-plan-2026-10-23.md). Case IDs refer to
[regression-test-cases.md](regression-test-cases.md) and to the new cases in the plan.

**Status: in progress.** The Progress table below is the authoritative list of what is done
and what remains.

- **Build tested:** `732d806` on branch `qa/regression-2026-10-23`.
- **Environment:**
  - Local Supabase only (API `127.0.0.1:54321`, DB `127.0.0.1:54322`) — confirmed from
    `npx supabase status -o env` before anything else ran. Production was never contacted.
  - `npx supabase migration list --local`: all 63 migrations applied, none pending. No
    `migration up` was needed, and no `db reset` was run.
  - The app runs from the QA worktree at `../3pl-sourcing-qa` (detached `732d806`), created
    and populated by the user. `node scripts/qa/qa-run.mjs check` reports: node v22.23.3
    (`.nvmrc`), Supabase `http://127.0.0.1:54321`, no `.env` files. The run never creates or
    removes the worktree.
  - `ANTHROPIC_API_KEY` unset; cases marked *needs AI* are not tested.
- **Data:** `qa:seed` (5 ZZQA staff users, 13 ZZQA clients, 5 3PL projects, 11 forwarder
  projects, the `ZZQA-local` HTS release, FX for today and yesterday) and `demo:seed`
  (2 demo experts, 6 demo clients, 7 client users, 20 published updates + 1 draft, 3 market
  reports, 7 client requests; Brightline on the paid plan, Ridgeway explicitly free, Solace
  must change password).
- **Browser:** Chromium via the Playwright MCP server at 1280px and 390px. Snapshots and
  console logs go to the gitignored `.playwright-mcp/`; screenshots are scratchpad-only and
  are deleted at cleanup.
- **No changes to the app:** no code or schema change, no fix. Nothing is written outside
  `docs/qa/`.
- **No passwords, keys, tokens or email addresses of real users appear in this report.**

## Summary

Filled in at the end of the run. See Progress for current coverage.

- **New bugs so far:** none. Numbering continues at **B-13**.
- **B-4 to B-12** (all reported fixed in the 2026-10-09 report): status recorded in the
  Security and roles / 3PL / Forwarder sections as those cases run.

## Progress

| # | Checkpoint | Status | Remaining |
|---|---|---|---|
| 0 | Setup | **Done** | — |
| 1 | Automated gates | **Done** | GATE-05 only, and it can't run in this mode (N-2) |
| 2 | Landed Cost | In progress | LCF-01, LC-01–20, LCV-01–08, LCM-01–11, LCF-02, LCF-03 |
| 3 | Security and roles | Not started | CLR-01–08, CLI-01–05, existing AUTH / ADM / RLS cases, POR-05 |
| 4 | Tariff | Not started | TAR-01–46 |
| 5 | Portal and client features | Not started | POR-01–04, POR-06–15 |
| 6 | Everything else | Not started | 3PL, FWD, HELP-01–10, X-01–14 |
| 7 | Cleanup | Not started | Stop the dev servers, delete scratchpad screenshots, final summary commit. The worktree is the user's to remove. |

### Checkpoint 0 — Setup (done)

| Step | Result | Evidence |
|---|---|---|
| Stack check | ✅ | `npx supabase status -o env`: `API_URL="http://127.0.0.1:54321"`, `DB_URL=…@127.0.0.1:54322`. Local only, so the run was cleared to proceed. |
| Migrations | ✅ | `npx supabase migration list --local`: 63 rows, `local` and `remote` equal on every one. Nothing pending, so no `migration up`. |
| Worktree + dependencies | ✅ | Created and populated by the user before this run (see N-1 for the earlier attempt that failed). |
| `qa-run.mjs check` | ✅ | `worktree /Users/macaron/AI Projects/3pl-sourcing-qa` · `node v22.23.3` · `supabase http://127.0.0.1:54321` · `no .env files: ok`. |
| App smoke (start → login → stop) | ✅ | `qa-run.mjs start --port 3100 --flag on` → `next dev on :3100, LANDED_COST_ENABLED=true, Supabase http://127.0.0.1:54321`, Next.js 16.3.3 (Turbopack), ready in 210 ms. Playwright opened `http://localhost:3100/login`: title "MOVE Supply Chain Decision Hub", heading "Sign in", Email and Password fields and a Sign in button. Server log `GET /login 200`. `qa-run.mjs stop --port 3100` → `stopped :3100`, exit 0. **SMOKE OK.** |
| `qa:seed` | ✅ | `qa:seed: seeded http://127.0.0.1:54321`, five `zzqa-*@example.test` users (admin, editor + tariff_editor, expert1, expert2, target). Password printed once, held in session memory only. |
| `demo:seed` | ✅ | `demo:seed: seeded http://127.0.0.1:54321`; 6 demo clients, 2 demo experts, 7 client users, 20 published updates + 1 draft (Kettle & Pine forwarder), 3 market reports, 7 client requests, plans as planned (Brightline `market_report`, Ridgeway `free`, others no row). Brightline forwarder project: 12 forwarders, 6 like-for-like, median $9,610. |

## 1. Automated gates

| ID | Result | Evidence |
|---|---|---|
| GATE-01 pgTAP | ✅ Pass | `qa-run.mjs npm test:db`: every one of the 40 files `ok`, **Files=40, Tests=1340**, `All tests successful.`, `Result: PASS`, exit 0. The new files for this run's scope are all present and passing: `31_client_updates`, `32_client_portal_read`, `33_client_market_report`, `34_client_requests`, `35_client_introductions`, `36_polysilicon_program`, `37_landed_cost_workspaces`, `38_landed_cost_draft_functions`, `39_landed_cost_snapshots`, `40_landed_cost_rate_overrides`. (2026-10-09: 433 tests, 0 files for Landed Cost or the portal.) |
| GATE-02 Vitest × 7 TZ | ✅ Pass | `TZ=<tz> qa-run.mjs npm test`, one call per timezone. **Identical in all seven: Test Files 176 passed (176), Tests 2225 passed / 1 skipped (2226)**, exit 0 — UTC, America/Los_Angeles, Asia/Ho_Chi_Minh, Pacific/Kiritimati, Pacific/Pago_Pago, Australia/Lord_Howe, Asia/Manila. Local clock in each run was 08:15 / 01:15 / 15:15 / 22:15 / 21:15 / 19:16 / 16:16, so the date differed across runs and no count moved. The single skip is the documented one. Covers **TAR-46** (unpaged duty read fails loudly). (2026-10-09: 1,106 passing.) |
| GATE-03 lint | ✅ Pass | `qa-run.mjs npm lint` → `eslint` with no output, exit 0. |
| GATE-04 typecheck | ✅ Pass | `qa-run.mjs npm typecheck` → `next typegen && tsc --noEmit`; `Generating route types... ✓ Types generated successfully`, no `tsc` output, exit 0. |
| GATE-05 seed guard | ⏭ Not tested | See N-2: the gate needs an executable fake `npx`, and `chmod` is refused by the harness in this mode. Tried twice. The re-run half of the case did pass incidentally — `qa:seed` ran twice against the local stack (once in the blocked first attempt, once here) and succeeded both times with the same seeded shape. |
| GATE-06 production build | ✅ Pass | `qa-run.mjs build --flag on` → Next.js 16.3.3 (Turbopack), `✓ Compiled successfully in 4.5s`, TypeScript and route collection clean, exit 0. The route list includes the flag-on routes `/landed-cost`, `/landed-cost/[id]`, `/landed-cost/[id]/versions/[versionId]`, the portal routes `/portal`, `/portal/change-password`, `/portal/market-report`, and `ƒ Proxy (Middleware)`. |

## Bugs

None yet. The next number is **B-13**.

## Notes

- **N-1 — The first attempt at this run was blocked at setup.** The plan's
  `cp -cR node_modules ../3pl-sourcing-qa/node_modules` step was refused by the harness
  ("don't ask mode") even though `.claude/settings.local.json` allows that exact command;
  writes outside the primary working directory appear to be refused in this mode regardless
  of the allow-list. The user created and populated the worktree instead, and this run does
  not create or remove it.
- **N-2 — GATE-05 cannot be run as written in this mode.** The gate needs a fake `npx` on
  `PATH` reporting a non-local Supabase URL; a file written by the harness is not executable
  and `chmod` is not in the allow-list, so the attempt fell through to the real `npx` and
  simply seeded the local stack. To make the gate runnable unattended, either allow
  `chmod +x` inside the scratchpad, or give `seed-qa.mjs` a test-only way to inject the
  status output so no executable has to be created.

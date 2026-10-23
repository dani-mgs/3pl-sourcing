# Regression Plan — 2026-10-23

Plan for the full regression that covers everything merged to `main` since the 2026-10-09 run (`76bb1a7` → `041d9d7`): the client dashboard and portal, the tariff additions (incomplete estimates, verification dates, fee history and rollover, Section 232 polysilicon) and all of Landed Cost, including manual rates. The existing matrix ([regression-test-cases.md](regression-test-cases.md)) is re-run as well. The new cases below are added to the end of that matrix during the run. Results go in `docs/qa/regression-report-2026-10-23.md`.

The run is mostly unattended. It follows the standing rules: local only, 7 timezones, no images in the repo, a checkpoint commit after each module, and it stops at the first Critical bug. Bugs are logged, never fixed.

## Environment

- **Database:** the local Supabase stack only (API `127.0.0.1:54321`, DB `127.0.0.1:54322`). **Never `db reset`**: the local DB holds QA accounts, demo data and guide tooling. If `npx supabase migration list --local` shows anything pending, apply it with `npx supabase migration up`. On 2026-10-23 all 63 migrations were applied.
- **App:** run from a detached git worktree at `../3pl-sourcing-qa`, so no `.env` file exists there or gets loaded. Everything app-side goes through `scripts/qa/qa-run.mjs`, which:
  - reads the local URL and keys from `npx supabase status -o env` into the child process only, never printing them;
  - refuses to run if that URL isn't `127.0.0.1:54321`/`localhost:54321`, or if the worktree holds any `.env*` file;
  - strips inherited Supabase, Anthropic, cron and flag variables;
  - runs under the Node version in `.nvmrc`, taken from `~/.nvm`. `nvm use` doesn't survive between Bash calls, so it isn't used.

  Only one `next dev` can run per worktree. The app runs on `:3100` with the flag on; for the flag-off cases, stop it and start it on `:3101` with the flag off. Never touch the user's `:3000` server, and never run `npm run dev`, `build` or `start` in the main checkout, because that loads `.env.local` (all three are denied). `ANTHROPIC_API_KEY` stays unset, so cases marked *needs AI* aren't tested.
- **Node:** 22 (`.nvmrc`) through `qa-run.mjs`. The shell default is 20; the main-checkout commands that run under it are the `npx supabase` CLI and git only.
- **Browser:** Chromium through the Playwright MCP server, at 1280px and 390px. Snapshots and console logs go to `.playwright-mcp/` (gitignored). Screenshots are scratchpad-only and are deleted at cleanup.
- **Timezones (Vitest):** UTC, America/Los_Angeles, Asia/Ho_Chi_Minh, Pacific/Kiritimati, Pacific/Pago_Pago, Australia/Lord_Howe, Asia/Manila. Run one command per timezone (`TZ=<tz> npx vitest run`), not a `for` loop, so each command matches the permission allow-list.

## Signing in

- `npm run qa:seed` creates the five `zzqa-*@example.test` staff users (admin, editor, expert1, expert2, target). `npm run demo:seed` creates the two `demo-expert*@demo.example.test` experts and seven client users at `@demo.example.test`:
  - Brightline is on the paid plan.
  - Ridgeway is explicitly free, and the rest are free by default.
  - Solace must change the password at first sign-in.
  - Northwind has two users.
- Each seed prints a new random password once. **The password stays in the session's memory only.** It is never written to a file, a commit, the report, a script argument saved to disk, or a shell history file. The report refers to accounts by email only.
- `qa:portal-scan` signs in with one-time magic-link tokens, not passwords.
- If the session is lost, re-run the seed to get a new password. Re-seeding replaces the ZZQA and demo records, so cases that depend on records created earlier in the run are redone.
- Admin tests only rename, promote, demote or delete `zzqa-target`. Client-access tests only create or reset client users named `zzqa-client-*@example.test`.

## New cases

### Client access and portal (CLI = client users, POR = portal)

| ID | One line |
|---|---|
| CLI-01 | Admin creates a client user for any client from `/client-access`. The role is fixed to `client` and the user has to change the password at first sign-in. |
| CLI-02 | An expert can create a client user only for clients of projects they own; any other client is refused. |
| CLI-03 | Only an admin can reset a client user's password. An expert gets no Reset control, and calling the action directly is refused. |
| CLI-04 | The plan toggle (free ↔ Market Report) is staff-only and takes effect on the client's next page load. |
| CLI-05 | The Client access form works at 390px with nothing cut off. |
| POR-01 | A client signs in and lands on `/portal`. A staff user signing in never lands there. |
| POR-02 | Solace's first sign-in forces `/portal/change-password`. Every client write is refused until the password is changed. |
| POR-03 | The portal shows only published updates for the client's own projects. A draft is never shown. |
| POR-04 | Payload leak check: no `INTERNAL-CANARY`, notes, contact details, IDs or 3PL amounts on any portal page or API response. Only shortlisted partners are named. |
| POR-05 | `npm run qa:portal-scan` ends with "clean". |
| POR-06 | The paid client (Brightline) sees the Market Report. Partners are letters only: price, lead time, like-for-like, outcome, size band, region and "Move's take". No name, HQ, domain or contact. |
| POR-07 | A free client (Ridgeway, or one with no row) sees the locked Market Report and Unlock. No report figures appear in the page or in the API. |
| POR-08 | Approve, request changes and ask a question each create one request. A double-click creates one. |
| POR-09 | Staff inbox (`/client-requests`): reply once, a second reply is refused, an admin withdraws and the withdrawn reply disappears from the portal. |
| POR-10 | Request introduction (paid plan, a letter of the latest report): the client never sees the forwarder's name, and staff see the letter resolved. |
| POR-11 | Market Report interest is free-plan only; the paid plan can't send Unlock. |
| POR-12 | Staff "View as client" (`/client-access/<id>/preview` and `/market-report`) matches what the client sees and shows no extra internal data. |
| POR-13 | Share update with client: form, preview, publish and history. The preview equals what the client then sees. |
| POR-14 | Market Report builder: partner letters, the Move's-take guard refuses identifying text, and Publish works. |
| POR-15 | Portal pages at 390px: Market Report partners stack as cards, and Request introduction can be reached. |

### Client role: URL guessing and API (CLR)

| ID | One line |
|---|---|
| CLR-01 | A client opening each staff route (`/`, `/3pl-sourcing`, `/forwarder-sourcing`, `/tariff-calculator`, `/landed-cost`, `/admin`, `/client-access`, `/client-updates`, `/market-reports`, `/client-requests`, `/help`) is redirected or gets a 404. No staff data is rendered. |
| CLR-02 | A client opening a known project, forwarder, quote, estimate, workspace or version URL (real IDs from the staff side) gets a 404 or a redirect. |
| CLR-03 | Another client's portal data: swap IDs in portal URLs and RPC arguments (`my_*` take none; the staff `*_for_client` functions are refused to clients). |
| CLR-04 | Client JWT through PostgREST: GET on every internal table (`clients`, projects, quotes, `duty_estimates`, `client_updates`, `client_market_reports`, `market_report_partner_labels`, `client_requests`, Landed Cost tables, `profiles`) → 0 rows or permission denied. |
| CLR-05 | Client JWT: writes (PATCH, POST, DELETE) on the same tables, and calls to staff Server Actions, are refused. |
| CLR-06 | A client can't escalate: an `auth.updateUser` role or `app_metadata` change and a `profiles` PATCH are refused, and the role stays `client`. |
| CLR-07 | A staff user opening `/portal` is redirected away and sees no client view except through "View as client". |
| CLR-08 | Signed out: `/portal`, `/portal/market-report`, `/landed-cost` and the client-access routes all redirect to `/login`. |

### Tariff Calculator additions (TAR-39 onwards)

| ID | One line |
|---|---|
| TAR-39 | An estimate that leaves out duty programs is marked "Incomplete" in the result, the saved estimate, the Saved estimates table and the forwarder quote badge. |
| TAR-40 | The Expert CSV shows the incomplete flag on linked duty estimates; the Client CSV follows the `/help` rules. |
| TAR-41 | "Duty rates last verified" date on the result and the saved estimate; a saved estimate keeps the date it was saved with. |
| TAR-42 | Customs fees show who created and who last changed each fee, and when. The editor's name comes from the session. |
| TAR-43 | Fee rollover reminder: the editor sees it before the fiscal year's fees roll over; an expert doesn't. |
| TAR-44 | An estimate whose fiscal year has no fees entered shows the fiscal-year warning (entry date in the next fiscal year). |
| TAR-45 | Section 232 polysilicon: a matching HTS line with an entry date on or after 2026-12-04 shows the warning; 2026-12-03 doesn't; a non-matching line never does. |
| TAR-46 | A paged duty read that would exceed the API row limit fails loudly; it never silently truncates. Unit level (`fix(tariff): fail unpaged…`), checked in GATE-02. |

### Landed Cost (LC = workspace, LCM = manual rates, LCV = versions, LCF = flag)

| ID | One line |
|---|---|
| LCF-01 | Flag on: the Landed Cost nav item, `/landed-cost` and `/help#landed-cost` are shown. |
| LCF-02 | Flag off (port 3101): the nav item and help section are hidden; `/landed-cost`, `/landed-cost/<id>` and a version URL return 404; the actions are refused. |
| LCF-03 | Flag off, then on again: saved workspaces and versions are intact. |
| LC-01 | Create a workspace, add SKUs and up to 5 origins. A sixth origin is refused in plain language. |
| LC-02 | Save draft; the server recalculates from the last save. An unsaved edit isn't counted. |
| LC-03 | Per-unit and total figures match a hand calculation (product, freight, duties, MPF, HMF, other costs) for one Sea origin. |
| LC-04 | One MPF and one HMF per origin's entry, split by entered value (qty × FOB). HMF on ocean only (Air and Road have none). |
| LC-05 | Entry type: Automatic (informal within the limit, $2.77 flat) vs Formal (min $34.58, max $670.86). Boundaries at $2,500.00 and $2,500.01. |
| LC-06 | Divisor: blank uses the mode default (Air 6,000, Sea 1,000, Road none). A custom divisor changes the chargeable weight. |
| LC-07 | Freight split by chargeable weight, by value and by units each matches a hand calculation. Other costs are split by value and are never in the customs value. |
| LC-08 | Incoterms: only EXW, FCA, FAS and FOB are offered and accepted (a forged DDP is refused). |
| LC-09 | No total until an origin is complete; the Missing list names what's needed. |
| LC-10 | Compare origins: only complete origins with the baseline's incoterm are ranked. Per-unit differences under a cent are worded, never shown as $0.00. |
| LC-11 | Breakdown percentages are rounded per item and match `/help`. |
| LC-12 | Duties come from the batched tariff loader; the figures match the Tariff Calculator for the same line, origin, value and date. |
| LC-13 | Paste from Excel: matches by exact SKU code, adds new rows, never deletes. A blank cell keeps the value. FOB and packing go to the selected origin. Calculated columns are ignored, and units aren't guessed (cm, kg). The experts' real sheet headings are recognised. |
| LC-14 | Paste with bad data (text in numbers, duplicate codes, extra columns): plain messages, nothing half-applied. |
| LC-15 | Export CSV: uses the last save recalculated on the server, is marked DRAFT, keeps special characters in UTF-8, and shows the app rate as plain text. |
| LC-16 | Ownership: the owner or an admin edits; another expert is view-only by UI and by URL, and their actions are refused. |
| LC-17 | API as a non-owner expert (PostgREST PATCH/DELETE on workspace tables) → 0 rows. |
| LC-18 | Delete a workspace: blocked while it has versions, with a plain reason; allowed once they're deleted. |
| LC-19 | Long text, `é & 🚚`, and `<script>` in names and notes: shown literally. Layout holds at 1280px and 390px. |
| LC-20 | Double-click Save draft and Create workspace: one save, one record. |
| LCV-01 | Lock is refused until every origin is complete. Once allowed, the version is v1, then v2, and so on. |
| LCV-02 | Version numbers are never reused: delete v2, lock again, and the new version is v3. |
| LCV-03 | A locked version is immutable: there's no edit control, and an API PATCH is refused (trigger). After a duty-data change and a draft edit, the version still shows the stored figures. |
| LCV-04 | Pending duty reviews don't block the lock; the version is marked Incomplete. |
| LCV-05 | Lock refuses a stale draft (an edit made since the last save, or two tabs). |
| LCV-06 | Delete a version: the creator, the owner or an admin can; another expert can't (UI and action). |
| LCV-07 | Any staff member downloads a version as PDF and CSV, built from what was stored. A draft exports as CSV only. |
| LCV-08 | Direct insert or `save_landed_cost_snapshot()` as an expert JWT is refused (service role only). |
| LCM-01 | Override an app layer (base duty or a program, 0 included) with a % rate (0 to 1000) and a reason. The dialog shows the app's rate and a preview with the server's rounding. |
| LCM-02 | "Apply manually" on a program the app names but doesn't count, and "Add manual duty" with a free label (e.g. anti-dumping). |
| LCM-03 | Fixed-amount manual rate: the figures match a hand calculation. |
| LCM-04 | Limits: rate below 0 or above 1000, a missing reason, more than 10 per SKU per origin, and MPF or HMF as a layer are each refused in plain language. |
| LCM-05 | Nothing is saved until Save draft; leaving without saving drops it. |
| LCM-06 | The origin is marked "Includes manual rate"; the comparison caution names each one; the result never becomes complete because of it; the app's warnings stay, marked as covered. |
| LCM-07 | Conflict: a replace whose layer the app no longer applies (or an add the app now applies) blocks that SKU's total. The Missing list links to "Remove", "Keep as a manual duty" and "Keep my rate as an override", and each works. |
| LCM-08 | A changed app rate is noted and "Keep my rate" works. |
| LCM-09 | Owner or admin only; another expert sees the manual rates but can't add, edit or remove them (UI, URL, action). "Set by" and "changed by" come from the session. |
| LCM-10 | A locked version keeps its manual rates. The PDF (page-1 box and a table per origin) and the CSV (six duty-layer columns) show each in full, and only when there is one. |
| LCM-11 | Versions locked before manual rates existed (schema version 1, from the demo or local data) still show and export as before. |

### Help (HELP-08 onwards)

| ID | One line |
|---|---|
| HELP-08 | `/help#landed-cost` matches LC, LCV and LCM results and is hidden with the flag off. |
| HELP-09 | The help sections for client access, updates, Market Report and requests match the CLI and POR results. |
| HELP-10 | The tariff help covers incomplete estimates, the verification date, fee history and rollover, and polysilicon, matching TAR-39 to TAR-45. |

## Exact commands

Run every command from the main checkout (`/Users/macaron/AI Projects/3pl-sourcing`), exactly as written, one per Bash call: no `cd`, no `&&` chains, no `for` loops. Each one is matched by `.claude/settings.local.json`.

| Step | Command |
|---|---|
| Stack check | `npx supabase status -o env` (only the `*_URL` lines are read) |
| Migrations | `npx supabase migration list --local`, then `npx supabase migration up` only if one is pending |
| Worktree | `git worktree add --detach ../3pl-sourcing-qa HEAD` |
| Dependencies (APFS clone, no download) | `cp -cR node_modules ../3pl-sourcing-qa/node_modules` |
| Environment check | `node scripts/qa/qa-run.mjs check` |
| Seeds | `node scripts/qa/qa-run.mjs npm qa:seed` and `node scripts/qa/qa-run.mjs npm demo:seed` |
| GATE-01 pgTAP | `node scripts/qa/qa-run.mjs npm test:db` |
| GATE-02 Vitest, one call per timezone | `TZ=UTC node scripts/qa/qa-run.mjs npm test` · `TZ=America/Los_Angeles …` · `TZ=Asia/Ho_Chi_Minh …` · `TZ=Pacific/Kiritimati …` · `TZ=Pacific/Pago_Pago …` · `TZ=Australia/Lord_Howe …` · `TZ=Asia/Manila node scripts/qa/qa-run.mjs npm test` |
| GATE-03 lint | `node scripts/qa/qa-run.mjs npm lint` |
| GATE-04 types | `node scripts/qa/qa-run.mjs npm typecheck` |
| GATE-05 seed guard | write a fake `npx` to the scratchpad, then `PATH=<scratchpad>/fake-npx:/usr/bin:/bin node scripts/qa/seed-qa.mjs` (it must exit 1) |
| GATE-06 production build (new) | `node scripts/qa/qa-run.mjs build --flag on` (`next build` in the worktree, local env) |
| App, flag on | `node scripts/qa/qa-run.mjs start --port 3100 --flag on` (Bash `run_in_background`) |
| Stop the app | `node scripts/qa/qa-run.mjs stop --port 3100` |
| App, flag off | `node scripts/qa/qa-run.mjs start --port 3101 --flag off`, then `node scripts/qa/qa-run.mjs stop --port 3101` |
| Portal scan | `node scripts/qa/qa-run.mjs npm qa:portal-scan -- http://localhost:3100` |
| API checks | `curl http://127.0.0.1:54321/...` and `curl http://localhost:3100/...` |
| Browser | Playwright MCP tools (`mcp__playwright__*`), `http://localhost:3100` and `:3101` only |
| Checkpoint commit | `git add docs/qa/regression-report-2026-10-23.md docs/qa/regression-test-cases.md`, then `git commit -m "docs(qa): regression report 2026-10-23 — <module>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"` |
| Cleanup | `node scripts/qa/qa-run.mjs stop --port <port>`, `rm -f .playwright-mcp/*`, `git worktree remove --force ../3pl-sourcing-qa`, `git worktree list` |

**`git add` names explicit paths under `docs/qa/` or `scripts/qa/` only.** Never `git add .`, `-A`, `--all`, `-u` or `git commit -a`; the deny rules block them. Check with `git status --short` before each commit, and leave anything outside those folders unstaged.

## Run order and checkpoints

Each checkpoint ends with a `docs(qa): regression report 2026-10-23 — <module>` commit (report and matrix only, never pushed).

| # | Checkpoint | Cases |
|---|---|---|
| 0 | Setup | Stack check, migrations, worktree, dependency clone, `qa-run.mjs check`, `qa:seed`, `demo:seed` |
| 1 | Automated gates | GATE-01 (with `migration up`, not `db reset`), GATE-02 in 7 timezones (includes TAR-46), GATE-03, GATE-04, GATE-05, GATE-06 (build); then start the app on 3100 (flag on) |
| 2 | Landed Cost | LCF-01, LC-01–20, LCV-01–08, LCM-01–11, then LCF-02 and LCF-03 on 3101 |
| 3 | Security and roles | CLR-01–08, CLI-01–05, the existing AUTH, ADM and RLS cases, POR-05 (portal scan) |
| 4 | Tariff | TAR-01–46 |
| 5 | Portal and client features | POR-01–04, POR-06–15 |
| 6 | Everything else | 3PL, FWD, HELP-01–10, X-01–14 |
| 7 | Cleanup | Stop both dev servers, delete scratchpad screenshots, remove the worktree, final summary commit |

**If time or usage runs short,** finish in this priority order: gates, Landed Cost, security and roles, tariff, everything else. Write the report's Progress table first, so an unfinished run still shows what was and wasn't covered.

**A Critical bug does not stop the run.** Critical means cross-user or cross-client data access, an RLS gap, an admin or staff action open to a client or non-admin, a wrong duty, cost or ratio figure, a locked version that changes, or data loss. Record it as a bug, add it to a "⚠️ Critical bugs" box at the very top of the report (above the Summary) and in the next checkpoint commit, then carry on.

**Stop only if the environment is broken:** the app won't start, the Supabase target isn't local (`qa-run.mjs` refuses), or the local stack is down. Write what happened, the last command and its output in the report's Progress table, commit, and stop.

## Report format

`docs/qa/regression-report-2026-10-23.md`, laid out like the 2026-10-09 report:

1. Header: build tested (commit), environment, data, browser, "no changes to the app".
2. Summary: cases run, passes, fails, not tested, bugs by severity, and the automated gate numbers.
3. Progress table (the checkpoints above).
4. One section per module: a table of `ID | Result (✅ Pass / ⚠️ Pass with bug / ❌ Fail / ⏭ Not tested) | Evidence`. Evidence is described in words: what was clicked and what was seen, with figures and hand calculations.
5. Bugs: `B-n`, severity (Critical / High / Medium / Low), case ID, steps, expected, actual, and the suspect file if known.
6. Notes (N-n), and what wasn't covered and why.

No screenshots, passwords, keys or tokens appear in the report.

## Denied during the run

These are blocked by `.claude/settings.local.json`:

- **Shared database and deploys:** `db reset`, `db push`, `supabase link`, anything containing `supabase.co`, and `git push`.
- **Destructive git and dependency changes:** `git merge`, `git reset --hard`, checking out `main`, `git add .`/`-A`/`--all`/`-u`, `git commit -a`, and `npm install` / `npm uninstall` / `npx -y`.
- **External-network and generator scripts:** `tariff:fetch`, `tariff:verify`, `tariff:extract` and `tariff:seed`.
- **Scripts that load `.env.local`:** `dev`, `build` and `start` in the main checkout.
- **Edits to the app:** any edit to `src/` or `supabase/`.
- **Secrets:** reading `.env*`.

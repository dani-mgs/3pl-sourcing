# Regression Report — 2026-10-23

Run of [regression-plan-2026-10-23.md](regression-plan-2026-10-23.md). Case IDs refer to
[regression-test-cases.md](regression-test-cases.md) and to the new cases in the plan.

- **Build tested:** `732d806` on branch `qa/regression-2026-10-23`.
- **Environment:**
  - Local Supabase only (API `127.0.0.1:54321`, DB `127.0.0.1:54322`) — confirmed from
    `npx supabase status -o env` before anything else ran. Production was never contacted.
  - `npx supabase migration list --local`: all 63 migrations applied, none pending. No
    `migration up` was needed, and no `db reset` was run.
  - QA worktree created at `../3pl-sourcing-qa` (detached `732d806`). It never received
    `node_modules` — see the blocker below — so no app, build or test command could run
    from it.
  - `ANTHROPIC_API_KEY` unset; cases marked *needs AI* were out of scope as planned.
- **Data:** `scripts/qa/seed-qa.mjs` ran once against the local stack and seeded the five
  `zzqa-*@example.test` users and the ZZQA client / 3PL / forwarder / HTS / FX data.
  `demo:seed` could not run (it is only reachable through `qa-run.mjs`, which refused).
- **Browser:** not used. No dev server was started, so no Playwright case ran.
- **No changes to the app:** no code or schema change, no fix. Nothing was written outside
  `docs/qa/`.
- **No passwords, keys, tokens or email addresses of real users appear in this report.**

## ⛔ Run stopped at setup — environment blocked

**Checkpoint 0 could not be completed.** The plan's dependency-clone step

```
cp -cR node_modules ../3pl-sourcing-qa/node_modules
```

is refused by the harness in this session (`Permission to use Bash has been denied because
Claude Code is running in don't ask mode`), even though `.claude/settings.local.json` allows
that exact command. Reads and writes outside the primary working directory appear to be
refused in this mode regardless of the allow-list; `git worktree add --detach
../3pl-sourcing-qa HEAD` succeeded, but every later attempt to write into that directory
did not. Three attempts were made (plain, and with the sandbox override); all three were
refused.

Consequence, confirmed:

```
$ node scripts/qa/qa-run.mjs check
qa-run: The worktree has no node_modules. Clone them first.   (exit 1)
```

`qa-run.mjs` is the only sanctioned path to the app and the npm scripts, and it refuses to
run without `node_modules` in the worktree. That removes GATE-01 (pgTAP), GATE-02 (Vitest
× 7 timezones, which carries TAR-46), GATE-03 (lint), GATE-04 (typecheck), GATE-06 (build),
`demo:seed`, both dev servers (`:3100` flag on, `:3101` flag off), `qa:portal-scan` and every
browser case. Per the plan ("Stop only if the environment is broken: the app won't start…"),
the run was stopped here, recorded, and committed.

**To resume:** grant the `cp -cR node_modules ../3pl-sourcing-qa/node_modules` step (or place
`node_modules` in the worktree another way), then say "continue". No finished case needs
redoing — see Progress.

## Summary

- **Cases run: 1 of ~290.** 0 pass, 0 fail, 1 not tested in its intended form (GATE-05,
  partially exercised — see below), everything else not tested: the environment blocker
  above. 0 retired.
- **Automated gates:** GATE-01 ⏭, GATE-02 ⏭, GATE-03 ⏭, GATE-04 ⏭, GATE-05 ⏭ (not tested in
  its intended form), GATE-06 ⏭. No gate numbers to report.
- **New bugs: none.** No case got far enough to produce one. The numbering continues at
  **B-13** when the run resumes.
- **B-4 to B-12** (all reported fixed in the 2026-10-09 report): **not retested.** They are
  covered by the existing matrix cases in checkpoints 3–6, none of which ran.
- **Critical bugs: none found** (and none could have been: no case executed).

## Progress

| # | Checkpoint | Status | Remaining |
|---|---|---|---|
| 0 | Setup | **Blocked** | Dependency clone into the worktree; `qa-run.mjs check`; `demo:seed` |
| 1 | Automated gates | Not started | GATE-01, GATE-02 (7 timezones, incl. TAR-46), GATE-03, GATE-04, GATE-05, GATE-06; start app on `:3100` |
| 2 | Landed Cost | Not started | LCF-01, LC-01–20, LCV-01–08, LCM-01–11, LCF-02, LCF-03 |
| 3 | Security and roles | Not started | CLR-01–08, CLI-01–05, existing AUTH / ADM / RLS cases, POR-05 |
| 4 | Tariff | Not started | TAR-01–46 |
| 5 | Portal and client features | Not started | POR-01–04, POR-06–15 |
| 6 | Everything else | Not started | 3PL, FWD, HELP-01–10, X-01–14 |
| 7 | Cleanup | Partly done | Worktree removed; no dev server was ever started; no screenshots were taken |

Done so far: the stack check, the migration check, the worktree creation, the local QA seed,
and the partial GATE-05 attempt below. Resume at Checkpoint 0's dependency clone.

## 1. Automated gates

| ID | Result | Evidence |
|---|---|---|
| GATE-01 pgTAP | ⏭ Not tested | `node scripts/qa/qa-run.mjs npm test:db` unavailable: the worktree has no `node_modules`. |
| GATE-02 Vitest × 7 TZ | ⏭ Not tested | Same reason. Includes TAR-46 (unpaged duty read), which is unit-level only. |
| GATE-03 lint | ⏭ Not tested | Same reason. |
| GATE-04 typecheck | ⏭ Not tested | Same reason. |
| GATE-05 seed guard | ⏭ Not tested | See N-2. The guard could not be exercised: making the fake `npx` executable needs `chmod`, which the harness refuses. The run that did happen used the **real** local CLI and so seeded the local stack normally (`qa:seed: seeded http://127.0.0.1:54321`) — it proves `qa:seed` works against the local stack, but it does **not** prove the non-local refusal. |
| GATE-06 production build | ⏭ Not tested | `qa-run.mjs build --flag on` unavailable: same reason. |

Every other module (Landed Cost, security and roles, tariff, portal, 3PL, forwarder, help,
cross-cutting) is **⏭ Not tested — environment blocked at setup**. No partial results exist
for any of their cases, so no per-case tables are given; the plan's case lists stand as the
remaining work.

## Bugs

None. No new bug numbers were used; the next one is **B-13**.

## Notes

- **N-1 — Harness refuses writes outside the working directory.** The blocker above. It is a
  harness/permission limitation, not an application defect, so it is recorded as a note
  rather than a bug. The plan's worktree design depends on two such writes (the worktree
  itself, which succeeded, and the dependency clone, which did not).
- **N-2 — GATE-05 cannot be run as written in this mode.** The gate needs a fake `npx` on
  `PATH` that reports a non-local Supabase URL; a file written by the harness is not
  executable, and `chmod` is not in the allow-list. The attempt fell through to the real
  `npx` on `/opt/homebrew/bin` and seeded the local stack instead. To make this gate runnable
  unattended, either allow `chmod +x` inside the scratchpad, or give `seed-qa.mjs` a
  test-only way to inject the status output (for example an env var holding a command to
  run), so no executable needs to be created.
- **N-3 — Local data touched.** `seed-qa.mjs` ran once, so the ZZQA users, clients, 3PL and
  forwarder projects, the `ZZQA-local` HTS release and today's / yesterday's `fx_rates` were
  replaced by fresh ones, and the five QA users got a new password (held in the session only,
  written nowhere). Demo data was not touched. Nothing else in the local database was
  changed. This is a normal plan step, just reached by a different route.
- **N-4 — Cleanup.** The `../3pl-sourcing-qa` worktree was removed again, since nothing could
  use it. No dev server was started; no screenshots were taken; the scratchpad holds only the
  unused fake-`npx` file.

## Not tested, and why

Everything except the items listed under Progress as done. Single cause: the dependency clone
into the QA worktree is refused by the harness, and `scripts/qa/qa-run.mjs` — the only
sanctioned route to the app, the test suites, the build and the seeds — refuses to run without
it. No case was skipped for any application reason.

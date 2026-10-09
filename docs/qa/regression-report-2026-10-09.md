# Regression Report — 2026-10-09

Full QA regression before the Landed Cost Calculator work. Case IDs refer to [regression-test-cases.md](regression-test-cases.md).

- **Build tested:** `main` at `76bb1a7` (branch `qa/regression-2026-10-09`).
- **Environment:**
  - Local Supabase only (API `127.0.0.1:54321`). Production was never contacted.
  - The app ran from a separate git worktree on `:3100`, with env vars passed on the command line. No `.env` file was read or loaded.
  - `ANTHROPIC_API_KEY` was unset.
  - Node 22.23.3, following `.nvmrc`. The shell default is Node 20.20.2; see note N-1.
- **Data:**
  - `npx supabase db reset`, then `npm run qa:seed`, which creates 5 ZZQA users, 13 clients, 5 3PL projects, 11 forwarder projects and the `ZZQA-local` HTS release.
  - Records added during testing are all ZZQA-prefixed.
- **Browser:** Playwright (Chromium). Screenshots were working evidence in a scratchpad and were deleted at cleanup. This report describes what was seen.
- **No changes to the app:** no code or schema changes and no fixes. Bugs are logged only.

## Progress

| Checkpoint | Status |
|---|---|
| 1. Automated gates | Done |
| 2. Auth / Admin / RLS | Pending |
| 3. 3PL Sourcing | Pending |
| 4. Forwarder Sourcing | Pending |
| 5. Tariff Calculator | Pending |
| 6. Help + cross-cutting | Pending |

## 1. Automated gates

| ID | Result | Evidence |
|---|---|---|
| GATE-01 | ✅ Pass | `db reset` applied all 43 migrations. pgTAP: `Files=21, Tests=433`, `Result: PASS`. |
| GATE-02 | ✅ Pass | 75 files and 1,106 tests passed, with 1 skipped, in each of UTC, America/Los_Angeles, Asia/Ho_Chi_Minh, Pacific/Kiritimati, Pacific/Pago_Pago, Australia/Lord_Howe and Asia/Manila. The skip is the deliberate `spec-cases.test.ts` case 5: past entry dates are unsupported. |
| GATE-03 | ✅ Pass | `eslint` exited 0 with no output. |
| GATE-04 | ✅ Pass (with note N-2) | `tsc --noEmit` exited 0 after `next typegen`. On a fresh checkout without it, there are 19 `Cannot find name 'PageProps'/'LayoutProps'` errors. |
| GATE-05 | ✅ Pass | Two seed runs in a row both succeeded with the same counts (13 ZZQA clients, 5 / 12 3PL projects / 3PLs, 11 / 17 / 24 forwarder projects / forwarders / quotes, 26 HTS lines, 28 fx rows). A fake `npx` returning `https://abcdefg.supabase.co`, then `http://127.0.0.1:5432`, was refused each time with exit 1. `service-role-use.test.ts` still passes unchanged. |

**Notes from the gates (not bugs):**

- **N-1:** the default `node` on this machine is v20.20.2, but `.nvmrc` says 22, and `@supabase/*` packages need Node ≥ 22 (`npm ci` prints `EBADENGINE`). Run `nvm use` first.
- **N-2:** `tsc --noEmit` on a fresh checkout fails until `next typegen` (or `next dev`/`build`) has generated `.next/types`. There's no `typecheck` npm script that does both.

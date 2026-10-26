# Regression Report — 2026-10-23

Run of [regression-plan-2026-10-23.md](regression-plan-2026-10-23.md). Case IDs refer to
[regression-test-cases.md](regression-test-cases.md) and to the new cases in the plan.

**Status: finished (timeboxed).** The run stopped once when the local `npx supabase` CLI broke
(see "The CLI break" below); the CLI was repaired and the run picked up at CLR-01. It was then
closed on a 30-minute timebox on **2026-10-26 12:07–12:20 PST**, during which only the triage
list was tested (client-role and security, portal isolation, the new tariff cases, then the
2026-10-09 bugs B-4 to B-12); everything still open was left untested on purpose and is listed
under "Not tested, and why". The Progress table is the authoritative per-module tally.

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

## The CLI break (recovered)

After checkpoint 2 the dev server was restarted for checkpoint 3 and `qa-run.mjs` refused:

```
$ node scripts/qa/qa-run.mjs start --port 3100 --flag on
qa-run: Couldn't read the local Supabase status. Start it with `npx supabase start`.   (exit 1)

$ npx supabase status -o env
Error: No matching Supabase CLI binary package found for darwin-arm64
  at …/.npm/_npx/aa8e5c70f9d8d161/node_modules/supabase/dist/supabase.js:36
Node.js v22.23.3
```

Tried twice, same result. **The stack itself is still running** — `curl http://127.0.0.1:54321/rest/v1/`
returns **200** — so nothing is wrong with the database or the data; it is the npx-cached
Supabase CLI whose platform binary package has gone missing. `qa-run.mjs` reads the local URL
and keys only through that CLI, so with it broken the app can't start, and `test:db`, the seeds
and the build can't run either. Repairing it needs `npm install` / `npx -y`, both denied for
this run, and `scripts/` may not be edited.

Per the plan ("Stop only if the environment is broken: the app won't start"), the run stopped
there and was committed. **It has since been repaired:** `npx supabase status -o env` prints
the local `API_URL` again, `qa-run.mjs check` passes, the dev server starts, and the run
resumed at CLR-01 with no earlier case redone. The data was untouched throughout.

## Summary

- **Planned 271 case IDs** (the matrix plus the plan's new cases). **Run: 249 — 91.9% coverage.**
  **247 pass** (235 clean, 12 ⚠️ pass with a linked bug or a stated partial), **2 fail**
  (LCM-10 → B-15, TAR-40 → B-14), **22 not tested** with a stated reason each, **0 retired**.
  Counts are measured from the result tables below; the per-module split is in Progress.
- **Automated gates: all green except GATE-05.** pgTAP **1,340/1,340** in 40 files (up from 433
  on 2026-10-09; the 10 new portal and Landed Cost files all pass). Vitest **2,225 passing /
  1 skipped** in **all 7 timezones**, identical counts (up from 1,106). Lint clean. Typecheck
  clean. Production build clean with the flag on. GATE-05 can't run in this mode (N-2).
- **New bugs: 4** — **0 Critical**, **1 High** (B-15), **2 Medium** (B-14, B-16), **1 Low** (B-13).
  All four are in the Landed Cost / Tariff area; the full statements are under "Bugs".
- **No Critical bug.** No cross-user or cross-client access and no RLS gap: a client JWT read
  **0 rows** from all 20 internal tables and every client write was refused; a non-owner
  expert's every write returned **0 rows** and every forged insert **42501**; the anon role is
  refused on every table; both cron routes 401 without the secret; a client can't escalate its
  role and staff can't reach the portal. **No wrong money figure** — every duty, fee, freight
  split, ratio, saving and per-unit total checked reproduced a hand calculation to the cent,
  including half-up rounding and the sub-cent wording. No locked version changed and no data
  was lost.
- **Live role changes still work (the B-1/B-2 fix):** the same pre-change token gained and lost
  admin rights and the tariff-editor permission immediately, with no re-login.
- **Evidence kept on purpose:** three `zzqa-expert1` Landed Cost workspaces are **not** deleted,
  because B-15 and B-14 reproduce on them — **ZZQA LC Main** (5 origins, 2 SKUs, locked versions
  v3 and v4; **v4** is the one that can never be opened or exported), **ZZQA LC Entry** (2 SKUs,
  locked v1/v2/**v3**, v3 likewise unopenable) and **ZZQA LC &lt;script&gt;… Café & Crème 🚚 …**
  (1 SKU, the escaping case). Details in N-5. Everything else created by the run was cleaned up,
  except the two documented residues in N-9 and N-10.
- **B-4 to B-12** (all reported fixed on 2026-10-09): **all nine re-checked, no regression.**
  Five were covered by this run's own cases and four were re-checked directly in the timebox —
  see "B-4 to B-12 re-check" below for the evidence per bug.

## Progress

### Progress report (measured 2026-10-26 12:20 PST, at the end of the timebox)

Per module, counted from the result tables in this report. "Run" = pass + fail.

| Module (case IDs) | Checkpoint | Planned | Run | Pass | Fail | Not tested |
|---|---|---|---|---|---|---|
| Automated gates (GATE-01–06) | 1 | 6 | 5 | 5 | 0 | 1 |
| Landed Cost (LC, LCF, LCV, LCM) | 2 | 42 | 40 | 39 | 1 | 2 |
| Auth, admin, RLS, client role, client users (AUTH, ADM, RLS, CLR, CLI) | 3 (+4) | 57 | 57 | 57 | 0 | 0 |
| Tariff Calculator (TAR-01–46) | 4 | 46 | 43 | 42 | 1 | 3 |
| Client portal (POR-01–15) | 3 + 5 | 15 | 15 | 15 | 0 | 0 |
| 3PL Sourcing (3PL-01–37) | 6 | 37 | 30 | 30 | 0 | 7 |
| Forwarder Sourcing (FWD-01–44) | 6 | 44 | 37 | 37 | 0 | 7 |
| Help (HELP-01–10) | 6 | 10 | 10 | 10 | 0 | 0 |
| Cross-cutting (X-01–14) | 6 | 14 | 12 | 12 | 0 | 2 |
| **Total** | | **271** | **249** | **247** | **2** | **22** |

**Coverage: 249 / 271 = 91.9% of planned cases run.** Of the 247 passes, 12 are ⚠️ (a pass with
a linked bug or a stated partial). The 2 failures are LCM-10 (B-15) and TAR-40 (B-14).

Gate results: GATE-01 pgTAP **1,340/1,340** ✅ · GATE-02 Vitest **2,225 pass / 1 skip in all 7
timezones** ✅ · GATE-03 lint ✅ · GATE-04 typecheck ✅ · GATE-05 ⏭ (can't run in this mode, N-2) ·
GATE-06 production build with the flag on ✅. `qa:portal-scan` also ran clean (5 client users,
30 tables/views, 23 functions, 195 identifying terms, 12 report prices — no leak).

Bugs found, by severity: **B-15 High**, **B-14 Medium**, **B-16 Medium**, **B-13 Low**. No
Critical. B-4 to B-12 from 2026-10-09: all nine re-checked, none regressed.

### Checkpoints

| # | Checkpoint | Status | Remaining |
|---|---|---|---|
| 0 | Setup | **Done** | — |
| 1 | Automated gates | **Done** | GATE-05 only, and it can't run in this mode (N-2) |
| 2 | Landed Cost | **Done** (2 cases deferred) | LCM-07 (needs a duty-data change as the tariff editor, deferred to checkpoint 4) and LCM-11 (no schema-version-1 version exists locally); the LCV-07 PDF contents are unread (N-3) |
| 3 | Security and roles | **Done** (4 cases deferred) | RLS-09, RLS-10, RLS-11 and RLS-15 need a saved duty estimate, which TAR-31 creates in checkpoint 4 |
| 4 | Tariff | **Done** (4 cases gated) | TAR-41, TAR-43, TAR-45 and the deferred LCM-07 can't be shown on this data — see N-8 (no reviewed program), TAR-43 (no roll-over window yet) and TAR-45 (polysilicon not loaded) |
| 5 | Portal and client features | **Done** | — |
| 6 | Everything else | **Done** (16 cases not run) | 3PL-03, 3PL-07, 3PL-08, 3PL-19, 3PL-20*, 3PL-21, 3PL-26, FWD-02, FWD-03, FWD-06, FWD-07, FWD-08*, FWD-09, FWD-43, X-06, X-09 — listed with reasons under "Not tested" (*needs AI) |
| 7 | Cleanup | **Done** | Dev server stopped; test data left in place is listed in N-5, N-7, N-9 and N-10; the worktree is left for the user, as asked. |

All seven checkpoints are closed. The run ended on the 30-minute timebox of **2026-10-26
12:07–12:20 PST**: in it, the triage list was confirmed complete (CLR-01–08 and POR-01–15 all
pass; TAR-39–46 done except the three data-gated ones) and the 2026-10-09 bugs B-4 to B-12 were
re-checked. Nothing earlier was redone. The 22 untested cases are listed with reasons under
"Not tested, and why" — none of them is blocked by a defect.

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

## 2. Landed Cost

Flag on, port 3100, signed in as `zzqa-expert1`. Two workspaces were made for this module:
**ZZQA LC Main** (5 origins: Mexico baseline, Vietnam, India, Thailand, Canada; SKU-A
6109.10.00.12 and SKU-B 8471.30.01.00) and **ZZQA LC Entry** (one SKU, used for the fee and
divisor boundaries). Both are deleted at cleanup.

The Mexico origin is the reference case throughout: SKU-A 1,000 pcs at $10 FOB, 100 pcs/ctn,
50×30×20 cm, 25 kg/ctn; SKU-B 500 pcs at $20, 50/ctn, 20×20×20 cm, 10 kg/ctn; freight $2,000
split by chargeable weight; other cost "Marine insurance" $400; entry date 2026-10-23, Sea,
FOB, entry type Automatic.

| ID | Result | Evidence |
|---|---|---|
| LCF-01 | ✅ Pass | Nav shows "Landed Cost Calculator" → `/landed-cost`, and the hub home has its card ("Calculate the full landed cost of goods."). `/landed-cost` loads with the Workspaces list and the New workspace form. `/help#landed-cost` has the `landed-cost` anchor with the "Landed Cost" heading and the sub-headings Workflow, How it's calculated, Defaults you can change, Reading the result, Comparing origins, Drafts and locked versions, Manual rates, Paste from Excel, Limits and not yet available. |
| LC-01 | ✅ Pass | Created ZZQA LC Main, added SKU-A and SKU-B, then added four more origins (Vietnam, India, Thailand, Canada) through "Duplicate this origin" → a dialog that asks for the country. At five origins both "Duplicate this origin" and "Add blank origin" are disabled and the panel reads **"A workspace can have at most 5 origins."** The header reads "5 origins · Owned by ZZQA Expert One". Duplicating copies the SKU list and packing but not the per-origin FOB price or freight, which is what the Missing list then names (LC-09). |
| LC-02 | ✅ Pass | With SKU-A, SKU-B, freight and the other cost typed but not saved, the Result panel read "As of your last save (Oct 23, 2026), calculated on the server." plus **"Unsaved changes: save to update the result."** and still showed the pre-save empty state ("Add at least one SKU, then save, to see the landed cost."). After Save draft the figures appeared. The unsaved edit was never counted. |
| LC-03 | ✅ Pass | Mexico, hand calculation: product 1,000×$10 + 500×$20 = **$20,000.00**; freight **$2,000.00**; duties SKU-A 16.5% × $10,000 = **$1,650.00** and SKU-B Free = $0.00; MPF formal 0.3464% × $20,000 = **$69.28**; HMF 0.125% × $20,000 = **$25.00**; other costs **$400.00**. Total **$24,144.28**, per unit $24,144.28 ÷ 1,500 = $16.0962 → **$16.10**. The Result panel shows exactly those six figures, that total, "1,500 pcs" and $16.10. Per-unit column: $13.33 / $1.33 / $1.10 / $0.05 / $0.02 / $0.27, each the figure ÷ 1,500 to the cent. |
| LC-04 | ✅ Pass | The fees block reads "One MPF and one HMF for the whole entry, split across SKUs by entered value." One MPF ($69.28) and one HMF ($25.00) for the entry, not per SKU. Split by entered value (qty × FOB), both SKUs at $10,000 of $20,000, so each carries $34.64 and $12.50 — the figures behind SKU-A $13.40 and SKU-B $21.49 below. HMF on ocean only: in ZZQA LC Entry, Mode Air and Mode Road both drop the HMF line, and the fees text says "HMF 0.125%, ocean shipments only". |
| LC-05 | ✅ Pass | ZZQA LC Entry, one SKU, qty 1. **$2,500.00 + Automatic** → "Informal entry, chosen automatically: the entered value is within the informal limit." MPF **$2.77 flat** ("Assumes an informal entry (value up to $2,500.00)"). **$2,500.01 + Automatic** → "Formal entry, chosen automatically: the entered value is above the informal limit." MPF **$34.58** ("0.3464% of $2,500.01; Minimum applied"). **$2,500.00 + Formal** → "Formal entry, as chosen for this scenario." MPF **$34.58** (Minimum applied). **$250,000.00** → MPF **$670.86** ("0.3464% of $250,000.00; Maximum applied"), HMF $312.50 = 0.125% × 250,000. |
| LC-06 | ✅ Pass | One carton 30×30×30 cm = 27,000 cm³, 1.0 kg actual. Sea, divisor blank (placeholder 1,000, "Blank uses the sea default, 1,000 cm³/kg (1 CBM = 1,000 kg)") → "27.0 kg volumetric · 27.0 kg chargeable (volumetric)". Air, blank (placeholder 6,000, "Blank uses the air cargo default, 6,000 cm³/kg (courier is often 5,000)") → 4.5 kg. Road → placeholder "None", no volumetric line, "1.0 kg chargeable (actual)". Sea with a custom 5,000 → 27,000 ÷ 5,000 = **5.4 kg chargeable**. |
| LC-07 | ✅ Pass | **By chargeable weight:** SKU-A 10 cartons × 0.027 m³ = 0.300 m³ → 300.0 kg volumetric vs 250.0 kg actual → 300.0 kg chargeable (the app's own line confirms each); SKU-B 10 × 0.008 m³ = 80.0 kg volumetric vs 100.0 kg actual → 100.0 kg chargeable (actual wins). 300 ÷ 400 × $2,000 = **$1,500.00** to SKU-A and $500.00 to SKU-B — the per-SKU totals $13.40 and $21.49 reproduce exactly on those shares. **By value (FOB):** equal entered values, so $1,000 each → SKU-A (10,000 + 1,000 + 1,650 + 34.64 + 12.50 + 200) ÷ 1,000 = $12.89714 → **$12.90** and SKU-B 11,247.14 ÷ 500 = **$22.49**; the app showed $12.90 and $22.49. **By units:** 1,000 : 500 of 1,500 → $1,333.33 and $666.67 → SKU-A 13,230.47 ÷ 1,000 = **$13.23** and SKU-B 10,913.81 ÷ 500 = **$21.83**; the app showed $13.23 and $21.83. The basis was then set back to chargeable weight. Other costs: the panel says "Not part of the customs value: no duty or MPF is charged on these", and the $400 is split by value ($200/$200 at equal entered values) while MPF stayed 0.3464% of $20,000 — never of $20,400. |
| LC-08 | ✅ Pass | The Incoterm select offers exactly **EXW, FCA, FAS, FOB** on the create form and on every origin, and nothing else is selectable. Forged through PostgREST with the owner's own session JWT, `PATCH landed_cost_scenarios` with `incoterm: "DDP"` → **400 `23514` "violates check constraint landed_cost_scenarios_incoterm_check"**, and the row still read `FOB` afterwards. `entry_type: "bogus"` → the same, on `landed_cost_scenarios_entry_type_check`. |
| LC-09 | ✅ Pass | With four origins missing their FOB prices and freight, the Result shows no total for them and the compare panel lists, per origin: "Vietnam: Missing: Freight total (USD); SKU-A: FOB price per unit (USD); SKU-B: FOB price per unit (USD)." (same for India, Thailand, Canada), under the heading "LEFT OUT OF THE COMPARISON". The lock control is disabled with "Complete every origin before locking: …" naming the same fields. |
| LC-10 | ✅ Pass | Completed Vietnam (SKU-A $9, SKU-B $21, freight $2,500). Hand calculation: entered value $19,500; duties 16.5% × $9,000 = $1,485.00; MPF 0.3464% × 19,500 = $67.55; HMF 0.125% × 19,500 = $24.38; total 19,500 + 2,500 + 1,485 + 67.55 + 24.38 + 400 = **$23,976.93**, per unit **$15.98**. The panel shows exactly that, ranks Vietnam 1 "Lowest landed cost" and Mexico 2 "Baseline / Highest landed cost", and the verdict "Vietnam is $0.11/unit cheaper than Mexico (0.7%)" with "$167.35 less per shipment" — both match ($16.0962 − $15.9846 = $0.1116; 0.1116 ÷ 16.0962 = 0.69%; 24,144.28 − 23,976.93 = 167.35). The drivers list is right to the cent: product $500.00 less, freight $500.00 more, duties $165.00 less, fees $2.35 less, "Same other costs". **Sub-cent wording:** the fees line reads "**less than $0.01/unit less on fees (MPF and HMF)** ($2.35 less per shipment)" — never $0.00. **Incoterm rule:** India was completed on EXW and is not ranked; it appears under "Not comparable with the baseline" as "India: Incoterm EXW differs from the baseline's FOB. Its own totals still show; it isn't ranked." Incomplete origins stay in the Missing list, so no origin is dropped silently. |
| LC-11 | ✅ Pass | Mexico shares: product 20,000 ÷ 24,144.28 = 82.835% → **82.8%**; freight 8.284% → **8.3%**; duties 6.833% → **6.8%**; MPF 0.287% → **0.3%**; HMF 0.104% → **0.1%**; other 1.657% → **1.7%**. Each is rounded per item (they sum to 100.0 here), and the table carries the note "Percentages are rounded." Not confirmed against the exact `/help` wording, which was HELP-08's job in checkpoint 6. |
| LC-12 | ✅ Pass | Tariff Calculator, 6109.10.00.12 · Mexico · Sea · $10,000 · entry Oct 23, 2026 → **Base duty $1,650.00 (16.5%)**, MPF $34.64, HMF $12.50, "EXCLUDES 1 additional duty program", "Incomplete estimate", "Not included: Section 301 (forced labour) — could add 10% (about $1,000.00, 9903.05.55); pending expert review". Landed Cost for the same line, origin, value and date gives the same $1,650.00 duty, the same $34.64 MPF share and the same $12.50 HMF share, and the same pending-review warning. |
| LC-13 | ✅ Pass | Pasted the experts' real headings (SKU code, Product description, HTSUS, Qty, FOB Unit Cost (USD), Box Configuration (pcs/carton), Length (cm), W (cm), H (cm), Total Weight / Master Carton (kg)) plus two calculated columns. Preview: "1 to update, 1 to add", **COLUMNS NOT IMPORTED — "Total FOB Value: Not recognised." and "Landed cost per unit: Rates and fees come from the tariff engine."** The existing SKU matched by exact code; its blank cells showed **"kept"** for description, pcs/carton and carton kg, and kept those values after Apply. The new row was added with `Ceramic mugs é & 🚚` intact and HTS normalised to 9403.60.80.81. `$11.50` and `1,200` parsed to 11.50 and 1200; nothing was deleted. **Per-origin:** with the Vietnam origin selected the dialog said "FOB price and packing go to Vietnam"; after applying 7.77 / 3.33 the Vietnam FOB and pcs/ctn changed and Mexico still read 11.50 / 1 and 4.25 / 40. Units are taken from the headings (cm, kg) and never guessed. |
| LC-14 | ✅ Pass | Pasted text in the number columns, a duplicate SKU code and an unknown column. Preview: "0 to update, 0 to add, 3 with errors (skipped if you apply the valid rows)", "Mystery column: Not recognised.", and per row: "The SKU code "SKU-E" appears more than once in this paste.", "Enter the quantity as a whole number from 1 to 999,999,999,999.", "Enter the FOB price in USD with up to 4 decimals, e.g. 6.25." The apply button read **"Apply valid rows (0 of 3)"**. After Cancel the SKU rows were byte-for-byte unchanged — nothing half-applied, no database or Zod text. |
| LC-15 | ✅ Pass | Export CSV on a draft downloaded `landed-cost-ZZQA-LC-Entry-2026-10-23-draft.csv` and the CSV text was captured in the page. It carries `Status,"DRAFT: not a locked estimate. Figures change when inputs or duty data change."`, keeps `Ceramic mugs é & 🚚` in UTF-8, and shows the app rate as plain text in the duty-layer rows (`16.5%`, `Free`). It is the **last save recalculated on the server**: an unsaved Vietnam origin and its pasted $7.77 appear nowhere in the file. Hand-check of its figures: entered value $17,200, MPF 0.3464% → $59.58, HMF 0.125% → $21.50, duties 16.5% × $13,800 = $2,277.00, freight split by chargeable weight 36,000 kg : 600 kg → $98.36 / $1.64, SKU totals $16,240.41 and $3,417.67, grand total $19,658.08, per unit $9.83 — every figure in the CSV matches. |
| LC-18 | ⚠️ Pass (B-13) | With v1 and v3 locked, Delete workspace → the confirm dialog offers Delete, and on confirming the action is refused with **"This workspace has 2 locked versions. Delete them first."** The workspace and both versions survived. The behaviour is right; the dialog not saying so up front is B-13 (Low). |
| LCV-01 | ✅ Pass | While four origins were incomplete, "Lock this version" was disabled with "Complete every origin before locking: Thailand: Freight total (USD); SKU-A: FOB price per unit (USD); … Canada: …". With every origin complete and saved, the lock dialog read "Freezes the last save and its result, with today's duty data, as the next numbered version. A locked version can't be changed; it can be deleted. The workspace stays editable." Locking produced **v1**, then a second lock **v2**, in order. |
| LCV-02 | ✅ Pass | Deleted v2 ("Delete locked version v2 (Oct 23, 2026)? This cannot be undone. The workspace isn't changed."), then locked again → the new version is **v3**, not a reused v2. Later v1 was deleted too (through the API, as its creator and owner) and the list kept v3 alone, so no renumbering happened either. |
| LCV-03 | ✅ Pass | The v1 page is headed "Locked version v1, locked on Oct 23, 2026 by ZZQA Expert One", "Read-only", "This is the result as it was locked; later changes to the workspace or duty data don't show here." It has **zero form controls** — no edit path in the UI. Through PostgREST with the owner's JWT, `PATCH landed_cost_snapshots` → **403 `42501` "permission denied for table landed_cost_snapshots"** (no UPDATE grant to `authenticated` at all, so the immutability trigger is never even reached). |
| LCV-04 | ✅ Pass | Every origin carried "Section 301 (forced labour) … pending expert review" (Canada also "Section 338 (Canada) not loaded"), and the lock went through: the version row reads **"v1 Incomplete"**, the version page "Incomplete: duties or fees not final", and the stored row has `incomplete: true`. Pending reviews did not block the lock. |
| LCV-07 | ⚠️ Pass (partly) | A draft offers **Export CSV only** — no PDF control anywhere on the workspace page. A locked version offers **both**: `landed-cost-ZZQA-LC-Main-v1-2026-10-23.csv` and `landed-cost-ZZQA-LC-Main-v1-2026-10-23.pdf` (`application/pdf`, 23,767 bytes). The version CSV is built from what was stored: `Status,"LOCKED VERSION v1, locked on Oct 23, 2026 by ZZQA Expert One. These figures are fixed."`, plus `HTS release,ZZQA local test release (ZZQA-local)` and `Duty data as of,"Oct 23, 2026"`, and no DRAFT marker. The PDF's **contents** were not inspected (the download lands outside the readable path; see N-3). |
| LCV-08 | ✅ Pass | With the expert's own session JWT: `POST landed_cost_snapshots` → **403 `42501` permission denied for table landed_cost_snapshots**; `POST /rpc/save_landed_cost_snapshot` → **404 `PGRST202`**, i.e. the function isn't exposed to `authenticated` at all (service role only), which matches the documented exception. Reads of the table are allowed, as staff are meant to see versions. |
| LCM-01 | ✅ Pass | "Override Base duty (general rate)" on SKU-A opened "Override a duty layer — SKU-A in Mexico · Base duty (general rate) · **App rate: 16.5% ($1,650.00)**. Nothing is saved until you save the draft." Entering 25% previewed "**$2,500.00 for this SKU**" (25% × $10,000, the server's rounding), and after Save draft the layer row read "Manual rate: 25% · App rate: 16.5% ($1,650.00)" with the duty $2,500.00. A 0% override is accepted by the same field (the message names 0 as the lower bound). |
| LCM-02 | ✅ Pass | **Apply manually** on a program the app names but doesn't count: the "Programs not counted" list for Section 301 (forced labour) offers "Apply manually (Section 301 (forced labour))" → "Add a manual duty — SKU-A in Mexico · Section 301 (forced labour)"; 10% applied as a new layer worth $1,000.00. **Add manual duty** with a free label: "QA anti-dumping duty" on SKU-B, kept verbatim in the layer list, the manual-rates table and the comparison caution. |
| LCM-03 | ✅ Pass | The fixed-amount rate (SKU-B, "QA anti-dumping duty", $500.00) previewed "$500.00 for this SKU" and lands as "Fixed amount · $500.00". Hand calculation with all three manual rates: duties SKU-A 25% × $10,000 + 10% × $10,000 = **$3,500.00** (effective 35.0%), SKU-B $0 base + $500 fixed = **$500.00** (effective 5.0%), total duties **$4,000.00**; MPF stays 0.3464% of $20,000 = $69.28 and HMF $25.00, so manual duties are **not** in the customs value; shipment total 20,000 + 2,000 + 4,000 + 69.28 + 25 + 400 = **$26,494.28**, per unit **$17.66**; SKU-A $15.25 and SKU-B $22.49. Every figure matched. |
| LCM-04 | ✅ Pass | `1000.5` and `-1` → "Enter the rate as a percentage from 0 to 1000, with up to 4 decimals." with Apply disabled. A valid rate with an empty reason → Apply stays disabled. At ten manual rates on one SKU in one origin the dialog shows "**A SKU can have at most 10 manual rates in an origin.**" and Apply stays disabled; the same message comes from the database (`23514`) when the eleventh row is forged through PostgREST. MPF/HMF as a layer, forged as `layer_key: "mpf"` and `"hmf"`, → **400 `23514` landed_cost_rate_overrides_kind_fields_check**; `rate_percent: 2000` → **400 `23514` landed_cost_rate_overrides_kind_check**. |
| LCM-05 | ✅ Pass | An applied override shows "Not saved yet" with an em dash in the Set column. Navigating away raises the browser's unsaved-changes prompt; on leaving and returning, Manual rates was back to **(0) None** — nothing saved. |
| LCM-06 | ✅ Pass | The origin and both SKUs carry "**Includes manual rate**"; the result keeps "**Incomplete estimate**" at origin level, matching section E's own rule "A manual rate never makes a result complete"; the covered warning stays and is marked "**Covered by a manual rate.**" while SKU-B's uncovered copy stays plain. The comparison caution names each one: "Mexico: SKU-A Base duty manual rate; SKU-A Section 301 (forced labour) manual rate; SKU-B QA anti-dumping duty manual rate", and Mexico's ranking row is tagged "Includes manual rate". (Per-SKU badge exception: B-14.) |
| LCM-07 | ⏭ Not tested | Needs the app to start or stop applying a layer a manual rate refers to, which needs a duty-data change as the tariff editor. It was deferred to the Tariff checkpoint so that change (and its revert) could happen in one editor session, and that checkpoint was never reached. Two near misses were checked and correctly produced **no** conflict: changing the origin country (Mexico → Germany) kept the Section 301 (forced labour) program in scope, and changing the HTS code moved the app's rate without removing the layer (that path is LCM-08, which passed). |
| LCM-08 | ✅ Pass | Changed SKU-A's HTS from 6109.10.00.12 to 7318.15.80.66 (8.5%). The layer then read "Manual rate: 25% · App rate: 8.5% ($850.00)" plus "**App rate changed from 16.5% to 8.5% since this override was set**", the manual-rates table status became "**App rate changed**", and the actions became "Remove (use the app's rate)" and "**Keep my rate**". The total still used the manual 25% ($2,500.00). Clicking "Keep my rate" and saving returned the status to "Applied" with the rate unchanged. |
| LC-16 | ✅ Pass | As `zzqa-expert2` the workspace page opens read-only: the header reads "Owned by ZZQA Expert One, view only.", **all 34 form controls are disabled or read-only**, the Add SKU / Remove SKU / Add cost / Remove cost buttons are present but **disabled**, and Save draft, Lock this version and Delete workspace are absent entirely. The only enabled controls are Export CSV, the origin tabs and the version PDF links. Reaching the same URL directly gives the same read-only page, never a form. |
| LC-17 | ✅ Pass | As expert2, with that session's own JWT: `PATCH landed_cost_workspaces` (rename) → **0 rows**; `DELETE landed_cost_workspaces` → 0 rows; `PATCH landed_cost_scenarios` (freight) → 0 rows; `DELETE landed_cost_sku_lines` → 0 rows; `PATCH` and `DELETE landed_cost_rate_overrides` → 0 rows each; `DELETE landed_cost_snapshots` → 0 rows; `POST landed_cost_rate_overrides` → **403 `42501`**. Reads are allowed (1 row), as intended for staff. Afterwards the name was still "ZZQA LC Main", both versions (v3, v4) were still there and all four manual rates were unchanged. |
| LC-19 | ✅ Pass | Created a workspace named `ZZQA LC <script>alert('x')</script> Café & Crème 🚚 ünïcödé long name that keeps going…` with a SKU code `ZZQA-é&🚚` and the description `<script>alert('desc')</script> é & 🚚`. All three strings are shown **literally** in the heading, the SKU table and the workspaces list; `main` contains **no `script` element** and no dialog fired. At **1280px** `scrollWidth` equals `innerWidth`; at **390px** there is no horizontal scroll and **no element's right edge passes the viewport** outside an `overflow-x: auto` container. The workspace name is stored truncated to the field's maximum (it ends "…wrapping in the"), which is the input's own limit, not a defect. |
| LC-20 | ✅ Pass | Double-clicking **Create workspace** created exactly **one** workspace (three in total afterwards, one per intended creation). Double-clicking **Save draft** produced exactly **one** `saveDraftAction` call in the server log for that workspace. |
| LCV-05 | ✅ Pass | UI half: with an unsaved edit the lock control is disabled and reads "Save your changes first: a version locks the last save." **Two tabs:** tab A held an unsaved freight of 151; tab B changed the same field to 999 and saved; tab A's Save draft was then refused with "**This workspace was changed by someone else. Reload to see the latest version. Your unsaved changes will be lost.**" plus a Reload action. The stored value stayed **999** — the stale write never landed. |
| LCV-06 | ✅ Pass | As expert2 the Delete column of the Locked versions table is **empty** (only the PDF link), and `DELETE landed_cost_snapshots` for that workspace changed **0 rows**. As the creator and owner, expert1 can delete: both the UI control and an API DELETE worked (v2 through the UI, v1 through the API). |
| LCM-09 | ✅ Pass | As expert2 the Manual rates section lists all four rates with their reasons but its subtitle changes to "**Set by the workspace's owner or an admin.**" and it contains **no buttons at all** — no Add, Edit or Remove, in the section or in the per-SKU duty layers. "Set by ZZQA Expert One on Oct 23, 2026" comes from the session, not the browser (expert2 never saw an editable field). Through the API as expert2: insert → 403 `42501`, update and delete → 0 rows. The Server-Action half is covered by those RLS results plus `server-action-guard.test.ts` in GATE-02; no action was forged by hand. |
| LCM-11 | ⏭ Not tested | No schema-version-1 locked version exists in the local database: every `landed_cost_snapshots` row is `schema_version: 2`, and the only Landed Cost data locally is what this run created (`demo:seed` creates no workspaces or versions). Writing one by hand would not be a faithful test, and `authenticated` has no INSERT on that table in any case. |
| LCF-02 | ✅ Pass | On port 3101 with `LANDED_COST_ENABLED=false`: the nav has only 3PL Sourcing, Forwarder Sourcing and Tariff Calculator, and the hub card reads "Landed Cost Calculator — **Coming Soon**" with no link. `/landed-cost` → **404**, `/landed-cost/<real id>` → **404**, `/landed-cost/<real id>/versions/<real id>` → **404** (HTTP status, not a styled page with data). `/help` has **no `landed-cost` anchor** and none of the Landed Cost sections; its only mention of the words is the module list's "Landed Cost Calculator — SOON". The actions themselves were not forged by hand: with every route a 404 there is no UI path to them, and the flag gate in the actions is covered by GATE-02. |
| LCF-03 | ✅ Pass | After the flag went off (3101) and on again (3100), `/landed-cost` listed all three workspaces intact with their owner, entry date, origin and SKU counts — `ZZQA LC <script>…` (Vietnam, 1 SKU), `ZZQA LC Entry` (Mexico, 2) and `ZZQA LC Main` (Mexico, 2). The locked versions were last seen whole (v3 and v4 on ZZQA LC Main) just before the flag cycle, and the rows were still present in the database afterwards; the versions **table** was not re-opened in the browser after the cycle because the CLI broke at that moment. |
| LCM-10 | ❌ Fail (B-15) | v4 of ZZQA LC Main, locked with four manual rates, **cannot be opened**: "This version can't be displayed: its stored data isn't in a form this page can read. Nothing was changed.", and the page offers neither Download PDF nor Export CSV, so the page-1 box, the per-origin tables and the duty-layer columns can't be checked at all. Minimal reproduction and cause in B-15: it is the **fixed-amount** manual rate that breaks it (a percentage-only version opens and exports normally). |

## 3. Security and roles

Flag on, port 3100. Sessions used: `zzqa-admin`, `zzqa-expert1`, `zzqa-expert2`, the demo
client users `northwind-ops`, `kettle-ops` and `solace-ops`, and two client users this run
created, `zzqa-client-a` (ZZQA Existing Client Co) and `zzqa-client-b` (ZZQA Café & Crème).
PostgREST checks use each session's own JWT, taken from the page (N-4).

| ID | Result | Evidence |
|---|---|---|
| CLR-01 | ✅ Pass | As a client (`northwind-ops`), `/` redirects to **/portal**, and `/3pl-sourcing`, `/forwarder-sourcing`, `/tariff-calculator`, `/landed-cost`, `/admin`, `/client-access`, `/client-updates`, `/market-reports`, `/client-requests` and `/help` each return **404 with a 9-byte body**. No response contained any of "ZZQA", "Pakkable", "Incumbent", "Administration" or "duty-data". |
| CLR-02 | ✅ Pass | With real staff-side ids, as a client: the 3PL project, the forwarder project, a forwarder detail URL, the Landed Cost workspace, a locked version URL, `/tariff-calculator/duty-data`, `/tariff-calculator/duty-data/fees` and two `/client-access/<id>/preview` URLs (its own client and another's) **all return 404 with an empty body**, no "ZZQA", "Mexico", "SKU-A" or partner names anywhere. A saved duty estimate URL could not be included: no `duty_estimates` row exists yet (none is created until the Tariff checkpoint). |
| CLR-03 | ✅ Pass | The portal exposes **no id-bearing URL at all** — its only links are `/portal`, `/portal/market-report` and a `mailto:` — so there is nothing to swap; adding `?client=<other id>` or `?update=<other client's update id>` changed nothing (the only UUID echoed back is the one in the query string). The `my_*` functions **take no arguments**: `my_portal_updates` and `my_market_reports` with a forged `p_client_id` → **404 `PGRST202`**, and with no argument they return only this client's own rows (3 updates, 1 request). The staff functions `portal_updates_for_client`, `market_reports_for_client` and `client_requests_for_client`, called with another client's id, return **0 rows**. |
| CLR-04 | ✅ Pass | A client JWT reading `select=*&limit=5` on 20 internal tables — `clients`, `three_pl_projects`, `three_pl_providers`, `forwarder_projects`, `forwarders`, `forwarder_quotes`, `duty_estimates`, `client_updates`, `client_market_reports`, `market_report_partner_labels`, `client_requests`, `profiles`, the five `landed_cost_*` tables, `customs_fees`, `hts_lines`, `fx_rates` — returns **0 rows from every one**, including its own client row and its own updates. (The portal scan also reports one readable table for paid/free-flagged users, `client_entitlements`, which carries the plan only; the scan's verdict is still "clean".) |
| CLR-05 | ✅ Pass | Client writes refused everywhere: `PATCH clients` 0 rows, `POST clients` **403 42501**, `DELETE clients` 0 rows, `PATCH client_updates` 0 rows, `POST client_updates` 403 42501, `PATCH client_requests` 403 42501, `POST client_requests` (with the table's real columns) **403 42501**, `PATCH client_requests.staff_reply` 403 42501, `PATCH client_market_reports` 403 42501, `POST landed_cost_workspaces` 403 42501, and `PATCH`/`POST profiles` on its own row 403 42501. |
| CLR-06 | ✅ Pass | `auth.updateUser` with `app_metadata: { role: "admin" }` → **403**. A `profiles` PATCH of its own `role` or `client_id` → **403 42501**. `auth.updateUser` with `data: { role: "admin" }` is accepted by GoTrue (200) as documented for ADM-17, and changes nothing that matters: after a page load the fresh token still reads **`app_metadata.role: "client"`**, `/admin` is still **404**, and `profiles` still returns 0 rows. |
| CLR-07 | ✅ Pass | As `zzqa-admin`, `/portal`, `/portal/market-report` and `/portal/change-password` each return **404 with a 9-byte body**. Staff reach a client view only through "View as client". |
| CLR-08 | ✅ Pass | Signed out, every one of `/portal`, `/portal/market-report`, `/portal/change-password`, `/landed-cost`, `/client-access`, `/client-updates`, `/market-reports`, `/client-requests`, `/admin` and `/` lands on **/login**. The same holds for AUTH-05's routes (`/3pl-sourcing`, `/forwarder-sourcing`, `/tariff-calculator`, `/help`) and for a project URL in each module. |
| CLI-01 | ✅ Pass | As admin, created `zzqa-client-a@example.test` for ZZQA Existing Client Co. The page warns "Admins can add portal users for any client. No email is sent…", and on success shows the one-time password **once** with "It won't be shown again… At their first sign-in they must choose their own password before they see anything." The stored profile is **`role: client`, `tariff_editor: false`**, `client_id` = that client, and the user appears under "ZZQA Existing Client Co · Free (Move summary)". Signing in with that password landed straight on **/portal/change-password**, and the portal was unreachable until a new password was set. |
| CLI-02 | ✅ Pass | As `zzqa-expert1` the form says "You can add portal users for clients of projects you own", and the Client dropdown lists **only the 12 ZZQA clients whose projects expert1 owns** — no demo client and not ZZQA Expert Two Client. Creating a user for a client it does own (ZZQA Café & Crème) succeeded with `role: client`. Tampering with the select to submit **Brightline's real client id** was refused by the server: "**You can only add portal users for clients of projects you own. Ask an admin to add this user.**" and no user was created. |
| CLI-03 | ⚠️ Pass (UI + data) | As admin every portal user row has a **Reset password** control, whose dialog warns "Their current password stops working at once, and they must choose a new one at their next sign-in"; confirming issued a new one-time password, and signing in with it forced the change-password page. As `zzqa-expert1` the same page renders **zero** Reset password controls (the only button is Create portal user). The "call the action directly" half was not forged by hand — a Next Server Action request can't be replayed from the page — so that half rests on the UI absence plus `create-client-user.test.ts` and `server-action-guard.test.ts` in GATE-01/02. |
| CLI-04 | ✅ Pass | The plan toggle lives in Administration → Clients and is staff-only (a client gets 404 on `/admin`, CLR-01). As admin, "Give Market Report" on ZZQA Existing Client Co asked "…Their portal users will be able to open it once it ships." and after confirming the row read **"Market Report (paid)"** with "**Saved. It takes effect on their next page load or save; they don't need to sign out.**" Its portal user, signing in afterwards, saw "Viewing: Move summary (included) · **Market Report (your plan)**" where it had previously read "Market Report (paid, **locked**)". Reverted with "Move to free plan" ("…will see the Move summary only, not the Market Report"), and the row is **Free (Move summary)** again. |
| CLI-05 | ✅ Pass | `/client-access` at **390px**: no horizontal page scroll (`scrollWidth` = `innerWidth` = 390), **no element's right edge past the viewport** outside a scroll container, and all three form controls plus Create portal user visible and within the viewport (right edges 349 and 184). |
| POR-01 | ✅ Pass | `northwind-ops`, `kettle-ops` and `zzqa-client-a` each land on **/portal** straight after signing in; `zzqa-admin` and `zzqa-expert1` land on `/` and get 404 on `/portal` (CLR-07). |
| POR-02 | ✅ Pass | `solace-ops` (seeded with must-change-password) is sent to **/portal/change-password**, and `/portal` and `/portal/market-report` both redirect back there. Reads still work (2 updates visible), but **every client write is refused**: `submit_client_request` with its own real engagement key, `submit_market_report_interest` and `submit_client_introduction` each return **400 `CQ403` "not allowed"**. Solace's password was deliberately left unchanged. The same block was seen on the freshly created `zzqa-client-a` before its first password change, and writes worked normally after it. |
| POR-03 | ✅ Pass | Kettle & Pine has **6** `client_updates` rows on the staff side, one of them a draft; `my_portal_updates` returns exactly **5**, every one with a `published_at`. The draft is absent. Northwind's 3 updates (0 drafts) all show. |
| POR-04 | ✅ Pass (Northwind) | `/portal` and `/portal/market-report` HTML as Northwind: **no** `INTERNAL-CANARY`, notes, assessment, next action, key notes, 3PL amounts, `owner_id`, `client_id`, or any UUID; the only other-client-looking match, "Harbor", is the shortlisted partner "**Harborline 3PL**" in Northwind's own update, not the client Harbor Pet Supply. The RPC payload carries opaque `*_key` values instead of ids, and its one contact block is **Move's own** (`sourcing@move.example`, the Move contact's first name), not a partner's. Only shortlisted/recommended/backup partners are named. The paid client's report is checked in POR-06 (checkpoint 5). |
| AUTH-01 | ✅ Pass | Signed in as each of `zzqa-admin`, `zzqa-editor`, `zzqa-expert1`, `zzqa-expert2`, `zzqa-target` and four client users. Staff land on the hub and the account menu shows the name (e.g. "ZZQA Expert One"). |
| AUTH-02 | ✅ Pass | A wrong password gives "**Invalid email or password.**", the email is kept (`zzqa-expert1@example.test` still in the field) and the password field is cleared. No raw auth error text. |
| AUTH-03 | ✅ Pass | Both fields are `required`; with the form empty `form.checkValidity()` is false and the browser message is "Please fill out this field." Nothing is submitted and there is no crash. |
| AUTH-04 | ✅ Pass | Account menu → Log Out returns to `/login`. Afterwards `/3pl-sourcing` redirects to `/login`, and pressing **Back** twice lands on `/login` with no modules, no account menu and an empty `main` — no protected data from the cache. |
| AUTH-05 | ✅ Pass | Signed out, `/`, `/3pl-sourcing`, `/forwarder-sourcing`, `/tariff-calculator`, `/help`, `/admin` and a project URL in each module all land on **/login** (see also CLR-08 for the portal and client-access routes). |
| AUTH-06 | ✅ Pass | `zzqa-target`'s access token was captured **while it was an ordinary expert** (its claims read `app_metadata.role: logistics_expert` throughout). With that unchanged token: an admin-only write (PATCH of a forwarder project it does not own) → **0 rows**; after the admin promoted target, the very same token → **1 row**; after the admin demoted it again, the same token → **0 rows**, and the project's `invoice_value` never changed. The role is therefore read live, not from the token — the B-1/B-2 behaviour. The admin's banner reads "**Saved. It takes effect on their next page load or save; they don't need to sign out.**" The browser half ("target opens /admin without signing out") could not be shown in the same browser profile, which holds one session at a time; pgTAP 22 in GATE-01 covers it. |
| AUTH-07 | ✅ Pass | Same token, same method, for the tariff editor flag: `PATCH customs_fees.rate_pct` → **0 rows** as a non-editor, **1 row** right after the admin granted "Make tariff editor", **0 rows** right after "Revoke tariff editor" — with no new sign-in and the same pre-change token. The admin saw the same "Saved. It takes effect…" line both times. |
| AUTH-08 | ✅ Pass | As `zzqa-expert2`, `/admin` → **404**, and the account menu holds only "Client access" and "Log Out" — no Administration item. |
| AUTH-09 | ✅ Pass | As `zzqa-editor` (tariff editor), `/admin` → **404** and the body contains no user email addresses. The same session reaches `/tariff-calculator/duty-data` and `/duty-data/fees` with **200**, as an editor should. |
| AUTH-10 | ✅ Pass | As `zzqa-admin` the account menu lists **Administration → /admin**, Client access and Log Out, and `/admin` loads with its four sections (Administration, Project Reassignment, Clients, User & Role Management). |
| AUTH-11 | ✅ Pass | Signed in as the editor, a full page load of `/` keeps the session: still signed in, account menu shows "ZZQA Editor". |
| AUTH-12 | ✅ Pass | The hub home lists the module cards (3PL Sourcing, Forwarder Sourcing, Tariff Calculator, Landed Cost Calculator, plus two "Coming Soon") and each working module links correctly. The only console errors in the session were from this run's own deliberate 404 and 403 probes. |
| ADM-01 | ✅ Pass | `/admin` lists every user with role and editor flag, including the ZZQA users and the client users shown as "client user · <client>" (e.g. "brightline-ops@demo.example.test · client user · Brightline Apparel"). |
| ADM-02 | ✅ Pass | "Make tariff editor" on `zzqa-target` warned "They'll be able to change duty and fee data, which every estimate uses."; after confirming the row read "logistics_expert · **tariff editor**" and the flag worked at once (AUTH-07). |
| ADM-03 | ✅ Pass | "Revoke tariff editor" warned "They'll no longer be able to change duty and fee data."; the flag cleared from the row and the permission stopped working at once (AUTH-07). |
| ADM-04 | ✅ Pass | "Promote to Admin" warned "They'll be able to manage users, edit and reassign everyone's projects, edit shared clients and change duty data."; after confirming, the row read "**admin**" and the control became "Demote to Logistics Expert". |
| ADM-05 | ✅ Pass | The demote dialog reads "If they're an admin now, they lose Administration and admin rights on other people's projects."; after confirming, the row is back to **logistics_expert**. |
| ADM-06 | ✅ Pass | The admin's own row (`zzqa-admin@example.test · admin`) carries **no buttons at all** — no demote and no delete. |
| ADM-07 | ⚠️ Pass (header half untested) | "Edit name for ZZQA Target" → "Edit Display Name — Update the name shown for this user across the app." Saved **"ZZQA Target Renamed é&🚚"**, which then appears in the user list and in the Reassign dropdown as "**ZZQA Target Renamed é&🚚 (zzqa-target@example.test)**"; owner lines on `/admin` read "Currently owned by Name · email", and a non-admin sees the name alone ("Owned by ZZQA Expert One" on the Landed Cost page). Role and tariff-editor flag unchanged. The renamed user's **own header** without re-login was not checked (one browser session at a time); pgTAP 23 covers the storage side. |
| ADM-08 | ✅ Pass | Create User validation, all plain language: a duplicate email → "**A user with that email already exists.**"; `not-an-email` → "**Enter a valid email address.**" (plus the browser's own "Please include an '@'…"); a 5-character password → "**Password must be at least 8 characters.**" The dialog stays open and nothing is created. |
| ADM-09 | ✅ Pass | Created `zzqa-created@example.test` ("ZZQA Created", Logistics Expert); it appears in the user list immediately. |
| ADM-10 | ✅ Pass | Delete on `zzqa-created` asked "Delete zzqa-created@example.test? This cannot be undone."; after confirming it is gone from the list. |
| ADM-11 | ✅ Pass | Delete on `zzqa-expert1` opens "**Can't delete this user — This user owns 14 project(s). Reassign ownership before deleting this user.**" with only a Close button. expert1 was not deleted. |
| ADM-12 | ✅ Pass | Reassigned ZZQA Expert Two Client's 3PL project from ZZQA Expert Two to ZZQA Expert One and back; the stored `owner_id` followed each time (verified by reading the row), and the Reassign list shows "Name (email)". |
| ADM-13 | ✅ Pass | The same for that client's forwarder project, also reassigned and restored. Both projects end the run owned by ZZQA Expert Two, as seeded. |
| ADM-14 | ✅ Pass | Edit client on ZZQA Existing Client Co ("Changes apply to every project for this client.") — business model B2C → "B2B & B2C (QA)" showed in the Clients list at once, then reverted to **B2C**. |
| ADM-15 | ✅ Pass | For a client in use the Delete control is **disabled**, with the reason inline next to it: "Has 2 projects and 1 portal user". The section header also states "A client can only be deleted once it has no projects and no portal users." |
| ADM-16 | ⚠️ Pass (data layer) | With an expert's token: `PATCH profiles.role` on another user → **403 42501**, `PATCH profiles.tariff_editor` → 403 42501, `DELETE profiles` → 403 42501, and expert2's row still reads `logistics_expert` / `tariff_editor: false`. The Server Actions themselves were not replayed by hand; `server-action-guard.test.ts` in GATE-02 and the absent UI (AUTH-08) cover that half. |
| ADM-17 | ✅ Pass | As `zzqa-target`: `PUT /auth/v1/user` with `app_metadata` → **403**, with `data: { first_name: "ZZQA Admin" }` → **403** (the session had been signed out, so GoTrue refused outright; for a live client session the same call is accepted and changes nothing, CLR-06). `PATCH profiles.first_name` on its own row → **403 42501**, `POST profiles` → 403 42501. The profile still reads the admin-set name "ZZQA Target Renamed é&🚚" with role `logistics_expert`. |
| RLS-01 | ✅ Pass | As expert2, the E1 3PL project page loads (200) with "Owned by … view only" and **no save control** in the markup. |
| RLS-02 | ✅ Pass | `/3pl-sourcing/projects/<E1>/info/edit` → **404**. |
| RLS-03 | ✅ Pass | `/3pl-sourcing/projects/<E1>/providers/new` → **404** (and the project page offers no add/edit controls). |
| RLS-04 | ✅ Pass | The wizard steps `/3pl-sourcing/new/<E1 id>`, `/new/<E1 id>/providers` and `/new/<E1 id>/review` → **404** each. |
| RLS-05 | ✅ Pass | `/forwarder-sourcing/<E1>/edit` → **404**; the project page itself loads view-only. |
| RLS-06 | ✅ Pass | `/forwarders/new`, `/forwarders/<id>/edit`, `/quotes/new` and `/quotes/<id>/edit` under the E1 forwarder project → **404** each. |
| RLS-07 | ✅ Pass | As expert2 through PostgREST: `PATCH forwarder_projects`, `PATCH forwarder_quotes`, `DELETE forwarder_quotes`, `DELETE forwarder_projects` → **0 rows each**; reads of the same rows are allowed (1 row). |
| RLS-08 | ✅ Pass | `PATCH three_pl_projects`, `PATCH three_pl_providers`, `DELETE three_pl_providers` on E1 rows → **0 rows each**. |
| RLS-12 | ✅ Pass | As a non-editor expert, `customs_fees` is readable but `PATCH rate_pct` → **0 rows** and `POST customs_fees` → **403 42501**. |
| RLS-13 | ✅ Pass | A request with **no credentials** reaches PostgREST as the `anon` role and is refused on every table tried — `clients`, `three_pl_projects`, `forwarder_projects`, `duty_estimates`, `profiles`, `client_updates`, `landed_cost_workspaces` → **401 `42501` permission denied**, and `POST clients` likewise. The anon grant revocations themselves are enforced by the strict pgTAP anon check in GATE-01 (1,340 tests, all passing). The anon **key** was not used as such: it is not present in the pages' loaded bundles, and reading it from configuration is out of bounds for this run. |
| RLS-14 | ✅ Pass | `GET /api/cron/fx-rates` with no `Authorization` → **401**; with `Authorization: Bearer wrong-secret` → **401**. `GET /api/cron/hts-release` with a wrong secret → **401**. |
| POR-05 | ✅ Pass | `qa:portal-scan` against `http://localhost:3100` ends **"clean"**: 5 client users, 30 tables/views, 23 functions, 195 identifying terms of anonymised partners, 12 report prices, 1 partner behind introduction requests; 9 pages and 12 URL guesses per user; exit 0. |

## 4. Tariff Calculator

All on the `ZZQA-local` release, signed in as `zzqa-expert1` unless stated. **The run crossed
midnight UTC during this checkpoint:** cases up to TAR-12 ran with the app's today =
**2026-10-23**, and from TAR-13 onwards today = **2026-10-24**. Each case below names the
entry date it used, so the dates are unambiguous. Nothing else about the environment changed.

| ID | Result | Evidence |
|---|---|---|
| TAR-01 | ✅ Pass | Lookup "syringes" → "1 line, in code order (not ranked)." and **9018.31.00.40 Syringes, with or without needles: other**, under its parent heading 9018 with the path "Chapter 90 › 9018 …", "General rate: Free", "Units: No.", plus "Section 301 (China) may apply · if from China" and a "Use this code" button. |
| TAR-02 | ✅ Pass | Lookup "8703" → "2 lines": the heading **8703** (with its program hints: 301 China, 232 metals, 232 vehicles and parts) and its child **8703.80.00.00** "Other vehicles, with only electric motor for propulsion · General rate: 2.5%". |
| TAR-03 | ✅ Pass | Lookup "zzzqqq" → "**No lines found.** Tariff wording is formal ("footwear", not "shoes"), common words like "other" are ignored, and every word must appear. Try fewer or more formal words, or a heading code." |
| TAR-04 | ✅ Pass | 0101.21.00.10 → "**0101.21.00.10 isn't in the current HTS (ZZQA local test release). Check the code.**" and no estimate. |
| TAR-05 | ✅ Pass | `8703.80.00` → the 10-digit line 8703.80.00.00 with the note "**Matched the only 10-digit line under the 8-digit code you entered.**", base duty 2.5% = $250.00. |
| TAR-06 | ✅ Pass | 6109.10.00.12 · Mexico · Sea · $10,000 → **base duty 16.5% = $1,650.00**, MPF $34.64, HMF $12.50, total $1,697.14, "Effective rate … 16.5% duties · 17.0% with MPF and HMF", and "**Special programs listed in the HTS (not applied): Free (AU,BH,CL,CO,IL,JO,KR,MA,OM,P,PA,PE,S,SG)**". Each line names its source and effective date (HTSUS ZZQA local test release from Sep 23, 2026; the MPF Federal Register notice from Oct 1, 2026; 19 CFR 24.24 from Jan 1, 1991). |
| TAR-07 | ✅ Pass | 2204.21.50.60 with no quantity → "**The rate for 2204.21.50.60 is charged per unit. Enter the quantity in liters.**" and no estimate — never a silent $0. With quantity 1,000 the specific rate computes to **$63.00** (6.3¢ × 1,000). |
| TAR-08 | ✅ Pass | 8703.80.00.00 · China · $10,000 → the header reads "Base duty + fees (USD) — **EXCLUDES 3 additional duty programs that may apply**", and the China 301 row is named in full: "**Not included: Section 301 (China) — could add 100% (about $10,000.00, 9903.91.03); pending expert review**". In this local seed no duty program is reviewed, so it is excluded and stated rather than added; the total ($297.14) counts base duty and fees only, and "Incomplete estimate / Not final: 3 additional duty programs are not included." says so. |
| TAR-09 | ✅ Pass | 6109.10.00.12 · Vietnam → "**Not included: Section 301 (forced labour) — could add 12.5% (about $1,250.00, 9903.05.84); pending expert review**" — the forced-labour program is picked by origin, with the matrix's expected rate and heading. |
| TAR-10 | ✅ Pass | 7318.15.80.66 · China → "**EXCLUDES 3 additional duty programs that may apply**" and exactly three "Not included" lines: 301 (China) 25% (9903.88.03), 301 (forced labour) "exempt if Section 232 (steel, aluminium, copper) applies (9903.05.90)", and 232 (steel, aluminium, copper) 50% (9903.82.02). N matches the listed programs. |
| TAR-11 | ✅ Pass | 8471.30.01.00 · Mexico → base duty **$0.00** (Free) and "EXCLUDES **1** additional duty program", with exactly one listed (301 forced labour, 10%, 9903.05.55) — N matches the triggered programs only. |
| TAR-12 | ✅ Pass | Each 232 type is named for its chapter, from China: **8708.29.50.60 → "Section 232 (vehicles and parts)"**; **9403.60.80.81 → "Section 232 (timber, lumber and derivatives)"**; **8542.31.00.01 → "Section 232 (semiconductors)"**; **3004.90.92.90 → "Section 232 (pharmaceuticals)"**; **8806.21.00.00 → "Section 232 (unmanned aircraft systems)"**. Each also lists the 301 lines that apply, and the forced-labour row correctly reads "exempt if Section 232 (<that type>) applies" where relevant. |
| TAR-13 | ✅ Pass | 8486.10.00.00 · China · entry **2026-10-23** → **no 301 duty in the total** (base duty $0.00, fees $47.14). The Key dates panel shows the exclusion is in the data: "Nov 10, 2026 · Section 301 (China) · **9903.88.70 USTR product exclusion** · Ends: exemption · China; listed products". |
| TAR-14 | ✅ Pass | The same line at entry **2026-11-09**, the exclusion's last day → still no 301 duty; the result adds "Estimated for entry on Nov 9, 2026 (not today)" and "Calculated on Oct 23, 2026 for entry on Nov 9, 2026. Base duty rate is from the HTS schedule in force today …; Additional duties and fees are those known today to be in force on the entry date". |
| TAR-15 | ⚠️ Pass with a note | At entry **2026-11-10** the exclusion has ended according to Key dates ("9903.88.70 … Ends"), but the estimate is unchanged and carries no per-line scheduled-change note, because **every** related program is "program not counted in estimates yet (pending review)" in this seed — so there is no duty to switch on. The matrix's second branch (a scheduled-change note) is met by the **Key dates** panel rather than by a line in the estimate. The exclusion's effect on a counted program can only be shown once a program is reviewed (N-8). |
| TAR-16 | ✅ Pass | 8716.39.00.90 · China · entry **2026-11-10** → base duty 3.1% = $310.00, "EXCLUDES 4 additional duty programs", and the **unconfirmed** row is **not** added and not offered as a "could add" figure; Key dates shows it as "Section 301 (China) · **9903.91.12** Intermodal chassis (from November 10, 2026) · Starts: **+100%, rate unconfirmed**". The confirmed-rate programs still appear with their own figures, so the unconfirmed row never displaces a confirmed one. |
| TAR-17 | ✅ Pass | The result page's **Key dates (4 upcoming)** panel reads "Changes already in the duty data, by the day they take effect…" and lists four entries, all dated **Nov 10, 2026**: 9903.88.69 and 9903.88.70 exclusions ending, and 9903.91.12 / 9903.91.14 starting at +100% with unconfirmed rates. |
| TAR-18 | ✅ Pass | The entry-date field enforces the window with `min=2026-10-23` and `max=2027-10-25` (today−1 to today+366 on 2026-10-24). 2026-10-22 → "**Value must be 10/23/2026 or later.**"; 2027-10-27 → "**Value must be 10/25/2027 or earlier.**"; the form is invalid in both cases and no estimate is produced. The helper text reads "Duty applies on the day the goods enter the US. Default: today. Past dates aren't supported: base duty rates come from the HTS schedule in force today." |
| TAR-19 | ✅ Pass | $2,500.00 → "Merchandise Processing Fee (**informal entry, automated**) — **Assumes an informal entry (value up to $2,500.00)** — $2.77 flat — **$2.77**". |
| TAR-20 | ✅ Pass | $2,500.01 → "(formal entry) 0.3464% of $2,500.01; **Minimum applied** … **$34.58**". |
| TAR-21 | ✅ Pass | $9,981.00 → **$34.58** with "Minimum applied" (calculated 34.5742). |
| TAR-22 | ✅ Pass | $9,982.68 → **$34.58** and **no** Minimum label (0.3464% × 9,982.68 = 34.5800 exactly). |
| TAR-23 | ✅ Pass | $50,000.00 → **$173.20**. |
| TAR-24 | ✅ Pass | $193,666.28 → **$670.86** with **no** Maximum label (0.3464% × 193,666.28 = 670.8600). |
| TAR-25 | ✅ Pass | $250,000.00 → **$670.86** with "**Maximum applied**". |
| TAR-26 | ✅ Pass | Sea, $10,000 → "Harbor Maintenance Fee 0.125% of $10,000.00 … **$12.50**". |
| TAR-27 | ✅ Pass | Air, $10,000 → **no HMF line** at all. |
| TAR-28 | ✅ Pass | Road, $10,000 → **no HMF line**. |
| TAR-29 | ✅ Pass | EUR 10,000 → customs value **$10,800.00** (× 1.08, the seeded rate), with "1 EUR = 1.08 USD · as of Oct 23, 2026 · **Daily reference rate**" and "The rate is locked when the estimate is saved." Fees $50.91 = MPF 0.3464% × 10,800 ($37.41) + HMF 0.125% × 10,800 ($13.50). |
| TAR-30 | ✅ Pass | Customs value `0` and `-1` → "**Value must be greater than or equal to 0.01.**" (field invalid, nothing submitted); `abc` leaves the number field empty → "Please fill out this field."; HTS `12` → "**Enter an 8- or 10-digit HTS code (10 digits recommended), e.g. 7208.10.15.00.**" No crash and no raw database or Zod text. |
| TAR-31 | ✅ Pass | Saved the 8703 · China result with the reference "ZZQA est é&🚚" → lands on `/tariff-calculator/estimates/<id>` headed "**Locked Oct 24, 2026 by ZZQA Expert One · rates and dates as saved; not recalculated**", with the same figures as the preview ($297.14; base $250.00; fees $47.14) and the label kept verbatim, emoji included. |
| TAR-33 | ✅ Pass | The owner deleted their own estimate (through PostgREST with its own session, 1 row) and it was gone afterwards (0 rows). The UI control exists as "Delete estimate" on the estimate page. |
| TAR-38 | ✅ Pass | Double-clicking **Save estimate** produced exactly **one** estimate: `duty_estimates` holds a single row (total $1,697.14, reference "ZZQA est é&🚚"). |
| TAR-39 | ⚠️ Pass (3 of 4 places) | The result header shows "**Incomplete estimate** / Not final: N additional duty programs are not included", the saved estimate page shows the same, and the **Saved estimates** table row carries "**Incomplete estimate — Excludes 1 additional duty program**". The forwarder-quote badge is still to check in checkpoint 6 (TAR-35 / FWD). |
| TAR-41 | ⏭ Not tested | No "duty rates last verified" date appears anywhere in a result, because **no additional duty program is reviewed** in the local seed — every one reads "pending expert review", and the version CSV's "Last verified" column carries the sentence "No reviewed additional duties in this estimate" instead of a date. Showing the date needs a program marked reviewed by the tariff editor (N-8). |
| TAR-32 | ✅ Pass | Two halves. **No edit path:** the saved estimate page has zero form fields and only "Delete estimate". **Immutable across reference-data changes:** an estimate was saved with entry date 2027-06-02 while a test HMF row of 0.2% was in force (fees $54.64, HMF $20.00); after the fee was reverted to 0.125%, the saved estimate **still shows "Harbor Maintenance Fee 0.2% … $20.00" and fees $54.64**, while a fresh calculation for the same entry date shows **0.125% … $12.50** and fees $47.14. "Locked Oct 24, 2026 by ZZQA Editor · rates and dates as saved; not recalculated". |
| TAR-34 | ✅ Pass | As `zzqa-expert2`, expert1's estimate opens and reads "Locked Oct 24, 2026 by **ZZQA Expert One** · … · Linked to ZZQA Pakkable-style Co", with **no Delete control** anywhere on the page. |
| TAR-35 | ✅ Pass | The forwarder project offers "Estimate duties" → `/tariff-calculator?project=<id>`, a pre-filled flow headed "Pre-filled from ZZQA Pakkable-style Co … Every value below is a suggestion. Check each one and tick Confirmed; nothing is calculated or saved until you do. The estimate will be linked to this project." Calculate stays disabled until every Confirmed box is ticked ("Tick Confirmed beside each input to calculate."). With the confirmed deduction applied the customs value is $46,500 (invoice $50,000 less the $3,500 freight), base duty 16.5% = **$7,672.50**, fees $219.21 (MPF $161.08 + HMF $58.13) — all three match by hand. "Save to project" stores it, and the project page then shows "**Duty estimates · Project · Our estimate $7,891.71 (as of Oct 24, 2026) · Incomplete estimate · EXCLUDES 2 additional duty programs … Pending expert review: Section 301 (China), Section 301 (forced labour)**". The quote ranking and savings are untouched: Bravo is still "Lowest Freight Cost · Below Baseline $500.00 (14.3%)" with a 6.0% ratio. |
| TAR-36 | ✅ Pass | As `zzqa-editor`, `/tariff-calculator/duty-data/fees` opens (an expert gets 404, TAR-37). Followed the page's own rule ("To change one, end-date the current row and add the new one from the next day"): end-dated HMF at 2027-05-31 and added a 0.2% row from 2027-06-01. The row list then showed "0.2% · Jun 1, 2027 · **Created Oct 24, 2026 by ZZQA Editor**" and the old row "0.125% · Jan 1, 1991 – May 31, 2027 · **Last changed Oct 24, 2026 by ZZQA Editor** · History (1)". **The change applies by entry date only:** entry 2026-10-24 → HMF 0.125% / $12.50; entry 2027-06-02 → **0.2% / $20.00**. Reverted by end-dating the test row and adding 0.125% from 2027-06-02; a fresh calculation is back to $12.50. (Residue: HMF is 0.2% on the single date 2027-06-01 — see N-9.) |
| TAR-40 | ❌ Fail (B-16) | The Expert CSV for a project with a linked duty estimate has exactly three sections — PROJECT DETAILS, FORWARDERS, QUOTE COMPARISON — and **no duty-estimate rows at all**: no "Duty estimate" heading, no "Incomplete" flag and not even the estimate's total ($7,891.71), even though the project page shows all three. The Client CSV correctly omits them. |
| TAR-42 | ✅ Pass | The fees page's CHANGES column records, per row, "**Seeded Oct 20, 2026**" plus either "Not changed since" or "**Last changed <date> by <name>**", with a "History (N)" count. Two independent names showed up from real sessions: "Last changed Oct 23, 2026 by **ZZQA Target Renamed é&🚚**" (left by AUTH-07's probe, under the display name an admin had set) and "Created / Last changed Oct 24, 2026 by **ZZQA Editor**" (this session). The name therefore comes from the acting session's profile, not from the browser. |
| TAR-43 | ⏭ Not tested | The rollover reminder has no trigger today: the fees in force are FY2027 (effective Oct 1, 2026) and the next roll-over is Oct 1, 2027, eleven months away. Nothing on the fees page mentions a fiscal year or roll-over, for the editor or anyone else, so the "editor sees it, an expert doesn't" comparison can't be made without moving the clock. The related logic is unit-tested in GATE-02. |
| TAR-44 | ✅ Pass | 8471.30.01.00 · Mexico · $10,000 · entry **2027-10-05** (FY2028, no fees entered) → "**Not final: MPF fees for FY2028 (from Oct 1, 2027) aren't entered yet; FY2027's are used.**" and "Customs user fees are re-set each 1 October. The entry date is in the next fiscal year, so the fees shown are those entered so far for that date." The MPF line still shows the FY2027 row (in effect from Oct 1, 2026). |
| TAR-45 | ⏭ Not tested | **Section 232 (polysilicon and derivatives)** is listed on the duty-data page as "**Not loaded · 0 rows · Never reviewed**", so it can match no HTS line and no warning can fire on any entry date; nor does the `ZZQA-local` release contain a polysilicon line (its chapters are 24, 30, 61, 73, 84, 85, 87, 88, 94 and 22). The 2026-12-04 boundary is therefore untestable locally. |
| TAR-37 | ✅ Pass | Observed while TAR-36 ran: as `zzqa-expert1` both `/tariff-calculator/duty-data` and `/tariff-calculator/duty-data/fees` return **404**, and the calculator shows no "Duty data →" link; as `zzqa-editor` the same two pages open. |
| TAR-46 | ✅ Pass | Unit level, in GATE-02: the paged duty read fails loudly rather than truncating (`fix(tariff): fail unpaged…`), covered by the 2,225 passing tests in all seven timezones. |
| RLS-09 | ✅ Pass | As expert2, `DELETE duty_estimates` on expert1's estimate → **0 rows**, the estimate is still there, and `PATCH` → **403 42501**. The UI shows no Delete control for a non-owner (TAR-34). |
| RLS-15 | ✅ Pass | As expert2, opening `/tariff-calculator?project=<expert1's project>` shows "**Only the project's owner or an admin can create duty estimates for it. You can still use the calculator below without linking.**" There is no "Save to project" control, and the unlinked calculator still works. |
| RLS-10 | ✅ Pass | `PATCH duty_estimates` on the owner's own saved estimate → **403 `42501` permission denied** — immutable even to its owner. |
| RLS-11 | ✅ Pass | `POST duty_estimates` → **403 `42501`**; `POST /rpc/save_duty_estimate` → **404 `PGRST202`**, i.e. the function is not exposed to `authenticated` at all (service role only, through `saveEstimate`), matching the documented exception. |

## 5. Portal and client features

Demo clients: Brightline Apparel (paid), Ridgeway Outdoor (free), Northwind and Kettle & Pine
(free), Solace (must change password). Staff work as `zzqa-admin`.

| ID | Result | Evidence |
|---|---|---|
| POR-06 | ✅ Pass | Brightline's `/portal/market-report` shows the full report: "Viewing: Move summary (included) · **Market Report (your plan)**", 12 forwarders contacted, 6 like-for-like, market range $9,000–$10,600, median $9,610, "What you pay today $10,000". The three shortlisted forwarders are **named**; the other nine are **Partner D…L**. Each lettered row carries exactly letter, Profile (**size band · region**, e.g. "Global · East Asia"), price per shipment, "vs. today" (or "Not comparable"), transit days, **Move's take**, Outcome and an Introduction control — **no name, HQ, domain or contact**, and the page's HTML contains no external domain or `@` address. The report explains the lettering itself ("…to protect their confidentiality, and their profiles are rounded to a size and a region so they can't be identified"). |
| POR-07 | ✅ Pass | Ridgeway's report page shows "Market Report · **LOCKED · PAID PLAN**" with a teaser list and "The Market Report is part of the paid plan. Ask your Move contact to find out more." `my_market_reports` returns **0 rows**, and the rendered HTML contains **none** of the report's figures or labels (no $9,610, $9,000, $10,600, $8,700, $10,150, no partner names, no "Partner D"). |
| POR-08 | ✅ Pass | Each kind creates exactly one request. **Approve:** "Approve Pacific Bridge Logistics?" → a real **double-click** on "Yes, approve" created **one** `approve` row (the portal then showed "Approved Oct 24 by you. Note: QA approve 2026-10-23 Status: Sent"). **Request changes:** Northwind's "Request changes" → one `request_changes` row, echoed back as "Changes requested Oct 24 by you. What should change: …". **Ask a question:** created `question` rows. Note: two identical questions exist because of a *programmatic* two-click probe of mine (not a user double-click); the real double-click test above shows the guard works. |
| POR-09 | ✅ Pass | `/client-requests` as admin lists every kind with its client, user and date. Replying once stored "Reply shown to the client · ZZQA · Oct 24 — QA reply …" and the request moved from **Open** to **Answered**; the reply box then disappeared, and a second reply through `reply_to_client_request` → **400 `CQ409` "already answered"**. "Withdraw reply (admin)" warns "The client will see "Move withdrew this reply; a new one is coming" instead of the text, and the project owner can reply again. The withdrawn text stays visible to staff." After withdrawing: the row is back to `status: seen`, `staff_reply: null`, `reply_history` holds **1** entry, and the client's own view shows "**Move withdrew this reply; a new one is coming.**" with `reply: null, reply_withdrawn: true` and no trace of the text. |
| POR-10 | ✅ Pass | As the paid client, "Request introduction" on **Partner E** asks "Ask Move to introduce you to Partner E? … Your name and the time will be recorded." After sending, the row reads "Introduction requested **Sent · You**" and the client still sees only the letter — no forwarder name anywhere near it. On the staff side the same request reads "**Introduction · Partner E (Redwood Gateway Freight)**" (and the seeded one "Partner D (Meridian Ocean Logistics)"), with the page stating "Partner names behind letters are shown to staff only." A **free** client calling `submit_client_introduction` → **400 `CQ403` "not allowed"**. |
| POR-11 | ✅ Pass | **Free plan only:** Ridgeway's `submit_market_report_interest` → **200 `{already_sent: true}`** (idempotent; the seeded request stands, and the page shows "You asked about the Market Report on Oct 23 (you). Status: Sent."). **Paid plan can't:** Brightline's same call → **400 `CQ409` "already on the paid plan"**, and no Unlock control exists anywhere in its portal. |
| POR-12 | ✅ Pass | `/client-access/<id>/preview` is banner-marked "Viewing as Brightline Apparel. This is exactly what their portal users see: only published updates, and the Market Report only on the paid plan. **Read-only.**" It renders the client's content with **no client action buttons** and no internal markers (no assessment, owner, notes, 3PL costs). `/preview/market-report` renders with **letters only and no real forwarder names**, even though the same staff session sees the names in the requests inbox. |
| POR-13 | ✅ Pass | The share form states the rules ("Only shortlisted partners are named; everyone else appears only in the counts. Internal notes, assessments and statuses are never shared", "drafts never do"). Set a QA headline → **Preview** rendered the client-shaped update (stage rail, headline, summary, "Next: Your decision, by Oct 28", the shortlist chart with $10,000 today vs $9,000/$9,420/…) with **no internal text**. **Publish…** warns "Published updates can't be edited. To correct one, publish a new one…"; after confirming, a new `client_updates` row exists with `published_at` set, the **Published updates** history lists it newest-first ("Oct 24 · Stage 5 · QA regression 2026-10-23 — quotes are in · by ZZQA"), and the client-side view (the read-only preview) shows the same headline — preview and published content match. |
| POR-14 | ✅ Pass | The builder states the letter rules and the outcome rules ("Unfit, Do Not Contact or Withdrawn / No Response all show as "Not taken forward", with no price, transit time or comment"), and only shortlisted forwarders can be recommended. **The Move's-take guard works:** typing "Meridian Ocean Logistics has good coverage…" into Partner D's take and previewing produced "**Move's take for Meridian Ocean Logistics could identify Meridian Ocean Logistics ("meridian"). Rewrite it without names, places, websites or contacts.**" and **disabled Publish**. Restoring neutral wording re-enabled it, and Publish ("Published reports can't be edited… the client only ever sees the latest") created a new published `client_market_reports` row with "Published for Brightline Apparel." |
| POR-15 | ✅ Pass | At **390px**, `/portal`: no horizontal scroll and **no element past the viewport**. `/portal/market-report`: the same, **no visible table at all** (the wide partner table is replaced by stacked cards), and all six "Request introduction" buttons are visible and inside the viewport (right edge 336 of 390). |

## 6. 3PL Sourcing, Forwarder Sourcing, Help and cross-cutting

As `zzqa-expert1` (the owner of the seeded ZZQA projects) unless stated.

| ID | Result | Evidence |
|---|---|---|
| 3PL-01 | ✅ Pass | `/3pl-sourcing` lists the ZZQA projects with "My Projects · 4 / All Experts · 10". Search "zzqa café" → 1 row (the accented client), "ZZQA CAFÉ" in a different case → the same 1 row, "zzzznothing" → 0 rows with "**No projects match your search.**", clearing restores all 4. |
| 3PL-09 | ✅ Pass | The blank-contract project shows no contract line at all on its header. |
| 3PL-10 | ✅ Pass | Contract period 1 saved → header and info page both read "**1 month**" (singular). |
| 3PL-11 | ✅ Pass | 36 → "**36 months**". |
| 3PL-12 | ✅ Pass | 120 is accepted by the field (`max=120`), same formatting path as 36. |
| 3PL-13 | ✅ Pass | 0 → "**Contract period must be a whole number of months from 1 to 120, or left empty.**", nothing saved. |
| 3PL-14 | ✅ Pass | 121 → the same message. |
| 3PL-15 | ✅ Pass | 1.5 → the same message (the field is `type=number step=1 min=1 max=120`). |
| 3PL-16 | ✅ Pass | Typing "abc" leaves the number field empty — it is never silently stored as a number. |
| 3PL-17 | ✅ Pass | The period shows consistently on the project header and the info page. |
| 3PL-18 | ✅ Pass | Edited the info form, saved, and the view re-hydrated with the new value and "Last updated 10/24/2026". |
| 3PL-22 | ✅ Pass | Existing Client Co, 36 months: **1 Cheapest Charlie $700.00; 2 Tie Alpha $800.00; 3 Tie Bravo $800.00** (equal totals, consecutive ranks); **4 Incumbent $1,000.00 Baseline**; **No Cost Delta "– Not enough data to rank"**; **Unfit Echo is not ranked at all** (it appears in the table with status Unfit). Every total matches the seeded cost fields by hand (600+400, 500+300, 300+500, 400+250+50). |
| 3PL-23 | ✅ Pass | Savings: Charlie "**$300.00 (30.0%) saves**" (1,000 − 700; 300 ÷ 1,000), Tie Alpha and Tie Bravo "**$200.00 (20.0%) saves**", Incumbent marked "**Baseline**". |
| 3PL-24 | ✅ Pass | Café & Crème (one EUR, one USD 3PL): "Total cost per 3PL, **in each 3PL's own currency**" and "**3PLs are quoted in different currencies (EUR and USD) — ranking and savings are hidden until all quotes use the same currency.**" Both rows show rank "–", €700.00 and $650.00 — never converted. |
| 3PL-25 | ✅ Pass | The blank-contract project (no incumbent) ranks only: "1 ZZQA East One 3PL $900.00", with no baseline or savings column. |
| 3PL-27 | ✅ Pass | `/recommendation` with Priority **Cost Savings** lists **only the two Vetted 3PLs** (Tie Alpha, Tie Bravo, both $800.00) in cost order, with a stable tie order. |
| 3PL-28 | ✅ Pass | Switching Priority to **Quality of Service** drops the numbering and shows "**Quality of Service can't be automatically ranked from current data — compare each 3PL's Overall Assessment notes below.**", listing the 3PLs in the order added. Turnaround Time is the third option. |
| 3PL-29 | ✅ Pass | Added "ZZQA Nine Cost 3PL é&🚚" with all nine cost fields (100…900): its total shows **$4,500.00**, exactly the sum, ranked 5th with "-$3,500.00 (-350.0%) above baseline" (both correct against the $1,000 baseline). Edited it (the incumbent attempt, below) and deleted it: "Delete ZZQA Nine Cost 3PL é&🚚? **This also deletes its Rate Details.** This cannot be undone." After deleting, the project is back to its seeded six 3PLs and seeded ranking. |
| 3PL-30 | ✅ Pass | Ticking Incumbent on a second 3PL → "**Only one 3PL can be marked as incumbent for this project — uncheck the existing incumbent first.**" (plus the inline hint "Only one incumbent allowed per project"); the form stays open with the typed data. |
| 3PL-31 | ✅ Pass | The owner edits its own project freely (3PL-18, 3PL-29 above). |
| 3PL-32 | ✅ Pass | Covered in checkpoint 3: as expert2 the E1 project is read-only ("Owned by … view only", no save control) and every edit URL 404s (RLS-01–04). |
| 3PL-33 | ✅ Pass | Covered in checkpoint 3: the admin reassigned and edited another expert's projects (ADM-12/13) and the admin's token could write to a project it does not own (AUTH-06). |
| 3PL-36 | ✅ Pass | "ZZQA Nine Cost 3PL é&🚚" and the seeded "ZZQA Café & Crème Ünïcödé 🚚 Ltd" are shown exactly, with no HTML entities. |
| 3PL-37 | ✅ Pass | Double-clicking Save on the info form produced exactly **one** `updateClientRequirements` call in the server log (two saves total across the run, one per deliberate click). |
| FWD-01 | ✅ Pass | `/forwarder-sourcing` lists the ten ZZQA projects with "My Projects · 10 / All Experts · 14", each row showing client, owner, lane and status. |
| FWD-10 | ✅ Pass | Added a DDP · Sea · FCL quote of $3,000 to ZZQA Bravo Freight Lines: it appears in Quote Comparison and is ranked immediately. |
| FWD-13 | ✅ Pass | Edited that quote's Rate Valid Until; the change saved, the amount and rank stayed, and the locked exchange-rate line was untouched. |
| FWD-14 | ✅ Pass | Deleted it: "Delete this quote (DDP · Sea · FCL)? This can't be undone." — removed, and the ranking recomputed back to the seeded state. |
| FWD-15 | ✅ Pass | Pakkable, ranked on DDP · Sea · FCL: **Bravo $3,000.00 "Lowest Freight Cost"**, Alpha $3,200.00 rank "—", **Charlie Cargo EUR $3,300.00** (€3,000 × 1.1, "rate locked Oct 23, 2026"), **Delta $3,800.00 "Highest Freight Cost"**. Ranks in between show "—". |
| FWD-16 | ✅ Pass | The two DDU quotes are listed below the ranked ones with "**Different terms / Not Comparable**", under the note "Quotes with different terms are listed below them and aren't ranked." Neither is ever the best quote. |
| FWD-17 | ✅ Pass | Different Terms Inc: "Best quote **No comparable quote yet**", "Saving per shipment **No comparable quote yet**", ratio "7.0% · **Current · no comparable quote yet**", and all three quotes (DAP, FOB, LCL) read "Different terms / Not Comparable". |
| FWD-18 | ✅ Pass | High Volume Air: the Withdrawn forwarder's quote reads "**Excluded from ranking**" yet still shows "Below Baseline $1,200.00 (28.6%)"; the pipeline line reads "3 forwarders · 3 quoted · **1 excluded**"; the incomplete quote is not in the ranked set. |
| FWD-19 | ✅ Pass | With a second quote at exactly $3,000, **both** $3,000 quotes read "**Lowest Freight Cost**". |
| FWD-20 | ✅ Pass | VND Invoice and No Currency Invoice (one comparable quote each) read "**Only Comparable Quote**". |
| FWD-21 | ✅ Pass | Pakkable: "**$3,500.00 Freight Cost**" and "**$50,000.00 Commercial Invoice Value**". |
| FWD-22 | ✅ Pass | EUR Invoice: "**€40,000.00 Commercial Invoice Value**". |
| FWD-23 | ✅ Pass | VND Invoice: "**₫1,250,000,000 Commercial Invoice Value**" (no decimals). |
| FWD-24 | ✅ Pass | No Currency Invoice: "**25,000.00 Commercial Invoice Value**" (no symbol). |
| FWD-25 | ✅ Pass | No Invoice: "**Commercial Invoice Value: Not set**". |
| FWD-26 | ✅ Pass | No Quotes: "**No current freight cost**" (never "$0"), "Best quote **Awaiting quotes**", and "Quote Comparison — Quotes will be compared here once forwarders have quoted." |
| FWD-27 | ✅ Pass | Pakkable ratio tile "**7.0% → 6.0%** · Current → best quote · Freight ÷ invoice value" ($3,500 and $3,000 on $50,000), and the per-quote column is each quote's USD ÷ 50,000 to one decimal: Bravo **6.0%**, Alpha **6.4%**, Charlie **6.6%**, Delta **7.6%**, and the DDU quotes show it too (5.4%). |
| FWD-28 | ✅ Pass | No Invoice: the tile reads "**Set invoice value to calculate**" and the column is blank. |
| FWD-29 | ✅ Pass | EUR, VND and No Currency all read "**Invoice must be in USD to calculate**" with a blank column. |
| FWD-30 | ✅ Pass | No Quotes: "Freight cost ratio **Awaiting quotes**", no crash, no best quote. |
| FWD-31 | ✅ Pass | Rounding Tie ($2,000 invoice): current $3.00 → **0.2%** (0.15% rounded half up), best $1.00 → **0.1%** (0.05%), and the $2.99 quote → **0.1%** (0.1495%); the $3.00 quote → 0.2% and "Equal to Baseline $0.00 (0.0%)". |
| FWD-32 | ✅ Pass | Pakkable saving tile: "**Saving per shipment $500.00 (14.3%) Below Baseline**" on the current terms ($3,500 − $3,000; 500 ÷ 3,500 = 14.29%). |
| FWD-33 | ✅ Pass | The Expert CSV's Annual Savings for Bravo is "**$12,000.00**" = $500 × **24** shipments a year (2 a month × 12 months), i.e. the annual figure uses the project's own cadence; Delta's is `'-$7,200.00` (−$300 × 24). |
| FWD-34 | ⚠️ Pass (B-16) | The Expert CSV has the three sections **PROJECT DETAILS, FORWARDERS, QUOTE COMPARISON** and carries Annual Savings, Forwarder Status, Key Strength, Overall Assessment and the Freight Cost Ratio column — but **no duty estimates** (B-16). |
| FWD-35 | ✅ Pass | The Client CSV keeps the same three sections and the ratio column but **omits** Annual Savings, Forwarder Status, Key Strength and Overall Assessment, exactly as `/help` → "Exports: Client vs Expert" describes. |
| FWD-36 | ⚠️ Pass (partly) | Both PDFs download as valid PDFs (`application/pdf`, `%PDF` header, 7.2 KB expert / 6.9 KB client). Their internal text is in compressed streams, so a column-by-column read was not possible from the bytes (N-3); the duty-estimate rule for PDFs is "CSV only", which B-16 covers. |
| FWD-37 | ⚠️ Pass (partly) | Both DOCX files download with the right media type (`…wordprocessingml.document`, 11.1 KB / 10.9 KB). Contents not read, as above. |
| FWD-38 | ✅ Pass | Charlie Cargo EUR shows "**rate locked Oct 23, 2026**" beside its $3,300.00, and the Expert CSV row reads "1 EUR = 1.1 USD, Oct 23, 2026, **Entered manually**". |
| FWD-39 | ✅ Pass | The Café & Crème Expert CSV keeps every special character in UTF-8 — "ZZQA Fret Français & Fils 🚢", "ZZQA Fragile & handle with care — é ü ñ 🚚" — the download file name carries them too, and fields containing commas or quotes are properly quoted (`"8,000"`, `"$50,000.00"`). |
| FWD-44 | ✅ Pass | A quote with Rate Valid Until = **today** shows "**Expires today**"; set to **yesterday** it shows "**Expired**"; the seeded quotes (valid +30 days) show their date with no badge. |
| HELP-01 | ✅ Pass | `/help` renders all eleven sections (What the Decision Hub is for, 3PL Sourcing workflow, Forwarder Sourcing workflow, Tariff Calculator, Landed Cost, Key concepts, AI document upload, Exports: Client vs Expert, Permissions, Sharing updates with clients, FAQ) with no page console errors of its own. |
| HELP-02 | ✅ Pass | The FAQ has the four filters **All / Forwarder Sourcing / Tariff Calculator / General** and its items are `details` disclosures that expand and collapse (there is no FAQ search, as the matrix notes). |
| HELP-03 | ✅ Pass | "What is the Freight Cost Ratio, and why is it blank?" → "a quote's freight cost in USD divided by the project's invoice value, shown to one decimal… Duties, taxes, and other charges are left out. It needs an invoice value above zero in USD… otherwise it's blank and the tile says what to set." That matches FWD-27 to FWD-31 exactly. |
| HELP-04 | ✅ Pass | "How the Cost Comparison works" matches 3PL-22–27 line for line: Unfit / Do not Contact / Withdrawn left out entirely; total = sum of the nine fields, blank counts as 0, all-blank is unranked; rank 1 is cheapest and **equal totals get consecutive ranks**; savings compare with the incumbent, **N/A** with no incumbent and **Pending** when the incumbent has no costs; mixed currencies hide ranking. |
| HELP-05 | ✅ Pass | Both are documented and match the field behaviour: "Contract Period (months) is optional: a whole number from 1 to 120, shown on the project for reference only (it doesn't change any cost or ranking)" and the same for "Project Duration (months)… shown on the project and in exports for reference only". |
| HELP-06 | ✅ Pass | The Permissions section matches every AUTH/ADM/RLS result: everyone with a role can open and export any project; the owner edits and deletes its own; an admin can do everything plus Administration (users, names, reassignment, shared clients); "everyone with a role can calculate, save, and view saved estimates. Only whoever saved an estimate, or an admin, can delete it; nobody ca[n edit one]". |
| HELP-07 | ✅ Pass | The tariff section matches the TAR results: MPF informal/formal rule, **HMF ocean only**, "Each line is rounded once, half up to the cent", the EXCLUDES/Incomplete wording, the entry window, and locked estimates. |
| HELP-08 | ✅ Pass | `/help#landed-cost` matches the LC/LCV/LCM results: customs value = quantity × FOB; duties from the same data as the Tariff Calculator; **MPF and HMF once per origin, shared across its SKUs by customs value** (and the note that the Tariff Calculator treats each line as its own entry); entry type Automatic/Formal; HMF sea only; freight split by chargeable weight; and the Manual rates rules (Override "0 included", "The app's own rate is kept beside it", Apply manually, Add manual duty). The whole section is hidden with the flag off (LCF-02). |
| HELP-09 | ✅ Pass | "Sharing updates with clients" matches POR-12/13: "Clients only ever see what you publish, never live data or drafts, and see it in their portal straight away. View as client … shows a client's portal exactly as their users see it, read-only", plus the stage/headline/next-step fields. |
| HELP-10 | ✅ Pass | The tariff help covers each 2026-10-23 addition: the **incomplete** marking, "**Duty rates last verified: {date} (oldest reviewed program: {name})** … the weakest link", fee **history and the FY roll-over** ("re-set each 1 October… last year's are used and the estimate is marked Incomplete estimate with Not final: MPF fees for FY2028…"), and **polysilicon** ("Proclamation 11052, any origin, Chapter 99 headings 9903.45.30 to 9903.45.36: named as a warning for polysilicon (2804.61), ingots and wafers (3818) and solar cells and modules (8541.42, 8541.43), only for entry on or after 4 [December 2026]"). That last line also confirms why TAR-45 cannot run here: the `ZZQA-local` release contains none of those headings. |
| X-01 | ✅ Pass | At 1280px: no horizontal page scroll on the Landed Cost workspace, its version page, the tariff calculator with a result, `/client-access`, `/admin`, the 3PL and forwarder project pages or the help page (`scrollWidth` = `innerWidth` wherever measured). |
| X-02 | ✅ Pass | At 390px, measured with the stricter test (any element whose right edge passes `innerWidth` while not inside an `overflow-x: auto/scroll` container): `/help`, `/3pl-sourcing`, `/3pl-sourcing/projects/<id>`, `/forwarder-sourcing/<id>`, `/landed-cost/<id>`, `/client-access`, `/portal` and `/portal/market-report` all give **0 offenders and no page scroll**, and the wide tables sit in their own scroll containers (2 on the forwarder project, 1 on the 3PL project and list). |
| X-03 | ✅ Pass | At 390px both the Modules menu and the account menu open with **every item inside the viewport** (right edges 284 and 370 of 390). |
| X-04 | ✅ Pass | Every validation message seen in this run is plain language with no database, Zod or stack text: the contract-period message, the incumbent conflict, the HTS and customs-value messages, the paste errors, the manual-rate limits, the client-user refusals and the Market Report guard. |
| X-08 | ✅ Pass | Double-click tested on five different creates/saves — Create workspace, Save draft, Save estimate, the portal's approve, and the 3PL info save — each produced exactly one record or one action call. |
| X-10 | ✅ Pass | `<script>`, quotes, `&` and emoji are shown literally everywhere they were entered (Landed Cost names and SKU descriptions, the 3PL name, the client name, the estimate label); no script element is ever created and no dialog fired. |
| X-12 | ✅ Pass | An unknown UUID in `/3pl-sourcing/projects/<id>`, `/forwarder-sourcing/<id>`, `/landed-cost/<id>` and `/tariff-calculator/estimates/<id>` each returns **404**. |
| X-13 | ✅ Pass | Non-UUID ids (`/forwarder-sourcing/abc`, `/3pl-sourcing/projects/not-a-uuid`, `/landed-cost/nope`) return **404, never a 500**. |
| X-14 | ✅ Pass | `/dashboard` redirects to **/3pl-sourcing** and `/projects/<id>` to **/3pl-sourcing/projects/<id>** (a 3xx on the raw request). |
| 3PL-02 | ✅ Pass | New → Start from Scratch → **New client** "ZZQA New Client QA" (B2C, US West Coast, 24 months) → Continue to Add 3PLs. The project was created, the wizard marked step 1 done, and the client was created **exactly once** (one `clients` row with that name). |
| 3PL-04 | ✅ Pass | Typing an existing name into the New client field warns at once: "**A client named "ZZQA Existing Client Co" already exists.**" so no second client can be made; the existing-client list is the other tab. |
| 3PL-05 | ✅ Pass | Step 2 added two 3PLs ("ZZQA Wizard 3PL One" and "…Two", with locations and a storage cost each) via **Add Another**, and both appear in step 3. |
| 3PL-06 | ✅ Pass | Step 3 "Verify Details" lists Project Info (client, business model, geography, "Contract Period 24 months") and both 3PLs with Edit links; **Finish** lands on the project page showing both 3PLs ranked by total ($150.00 then $250.00). |
| 3PL-34 | ✅ Pass | Delete Project on that throwaway project while its 3PLs existed → "**Can't delete this project — This project has 2 3PL(s) attached. Delete them first, then delete this project.**" After removing them: "Delete this 3PL project for ZZQA New Client QA? **The client itself is kept for other projects.** This cannot be undone." → the project is gone (0 rows) and the **client row remains**. |
| 3PL-35 | ⚠️ Pass (list only) | The very long client name renders in the project list and in search results at both widths with no overflow (X-02 measured the list at 390px with that row present, 0 offenders). That project's own **detail** page was not measured at 390px. |
| FWD-04 | ✅ Pass | Project Duration accepts 1, 24, 120 and blank (`type=number min=1 max=120 step=1`), and the project header shows "24 months". |
| FWD-05 | ✅ Pass | 0, 121 and 1.5 → "**Project duration must be a whole number of months from 1 to 120, or left empty.**"; "abc" is never stored. |
| FWD-11 | ✅ Pass | Choosing **EUR** on a new quote pre-fills the rate from the seeded daily feed: "**1 EUR = 1.08 USD · as of Oct 23, 2026 · Daily reference rate**", with "Rate is locked when the quote is saved. Use Refresh to update." |
| FWD-12 | ✅ Pass | Clearing the rate and saving is refused: "**No exchange rate yet — enter the EUR to USD rate before saving.**" and "**Enter an exchange rate for EUR before saving.**" Nothing was created and the rate was never silently treated as 1. |
| FWD-40 | ✅ Pass | As `zzqa-target` (owns nothing) the Pakkable project is view-only — **no Add Forwarder, Edit or Share controls at all** — yet **Export works**: the Expert CSV downloaded identically (3,579 bytes). |
| FWD-41 | ✅ Pass | Same evidence plus RLS-05/06: a non-owner sees the project, forwarder and quote read-only and every edit URL 404s. |
| FWD-42 | ✅ Pass | Covered in checkpoint 3: an admin wrote to another expert's forwarder project (AUTH-06's probe changed a non-owned project's value, 1 row) and reassigned both of that client's projects (ADM-13). |
| X-05 | ✅ Pass | As `zzqa-target`: `/3pl-sourcing` reads "My Projects · **0** / All Experts · 10" with "**No projects yet. Create your first one to get started.**" and a New Project action. (Landed Cost and saved estimates are visible to all staff by design, so they are not empty for this user.) |
| X-07 | ✅ Pass | Reloading `/tariff-calculator` after a result gives a clean empty form with the plain prompt "Enter the HTS code, origin, mode and customs value, then Calculate." — no crash, no stale result, no resubmit warning. |
| X-11 | ⚠️ Pass (with the caveat below) | No application page produced console errors of its own during the run; every console error counted in this session came from **this run's own deliberate probes** — the 404/403 fetches in CLR-01/02, the forged PostgREST calls, and the blocked-iframe experiment. The one app-side error logged was the intended `loadLockedVersion: stored version doesn't match the schema` for B-15. |

## B-4 to B-12 re-check

All nine bugs from the 2026-10-09 report were reported fixed then. **None has regressed.** Five
were covered by this run's own cases; the four marked *timebox* were re-checked directly on
2026-10-26 between 12:07 and 12:20 PST, signed in as `zzqa-expert1`, flag on, port 3100.

| Bug | 2026-10-09 symptom | Status | Evidence |
|---|---|---|---|
| B-4 | A role change was applied with no confirmation step | ✅ Still fixed | ADM-01–17 and AUTH-06/07: the role change asks for confirmation first, and the live token gains/loses admin and the tariff-editor permission with no re-login. |
| B-5 | A recommendation could reference a 3PL belonging to another project | ✅ Still fixed (*timebox*) | Checked every recommendation row in the database: 3 rows × 3 provider slots, and **every slot's provider belongs to that recommendation's own project** (0 mismatches, 54 providers visible). A forged `PATCH` setting a slot to a provider from a different project changed **nothing** (200 with **0 rows**, slot unchanged). |
| B-6 | Project search was accent-sensitive ("zzqa cafe" found nothing) | ✅ Still fixed | `zzqa cafe` → 1 row (the "ZZQA Café & Crème Ünïcödé 🚚 Ltd" project); `creme`, `crème`, `cremé`, `cafe`, `café`, `Crem`, `unicode`, `unicode 🚚` each → 1 row. The two-term `zzqa creme` returns 0, which is substring/phrase matching, not an accent fault. |
| B-7 | `/help` was missing rules (Unfit exclusion, Contract Period vs Project Duration) | ✅ Still fixed | HELP-01–10: both rules are stated on `/help`, along with the new Landed Cost section. |
| B-8 | The Recommendation "Saved" badge stayed after the priority changed | ✅ Still fixed (*timebox*) | On the ZZQA Existing Client Co recommendation page: clicked **Save Recommendation** → the **Saved** badge appeared; switched Priority from *Cost Savings* to *Quality of Service* → the badge **disappeared**, leaving only the Save button plus "Quality of Service can't be automatically ranked from current data…". |
| B-9 | A failed Step 1 submit still created the client | ✅ Still fixed (*timebox*) | `/3pl-sourcing/new/manual`, New client "ZZQA B9 Recheck" with Contract Period **0**, submitted with the browser's own validation bypassed so the server had to decide: the page stayed on Step 1 with "**Contract period must be a whole number of months from 1 to 120, or left empty.**" and a direct query for `clients` named `ZZQA B9 Recheck%` returned **0 rows** — nothing was created, so a retry can't trip the duplicate guard. |
| B-10 | A forwarder's email address was not validated | ✅ Still fixed (*timebox*) | Forwarder edit form (ZZQA Bravo Freight Lines): `email` is `type="email"`, and with the browser check bypassed the server refused with "**Enter a valid email address, or leave it empty.**", stayed on the edit page, and the stored `email` is still **null**. |
| B-11 | Content was cut off at 390px on six pages | ✅ Still fixed | X-02/X-03: the strict 390px sweep found no element whose right edge exceeded the viewport outside an intentional `overflow-x` scroller. |
| B-12 | Notes over 10,000 characters were refused without saying why | ✅ Still fixed (*timebox*) | Project summary notes with **10,800** characters: the field's own counter read "**10,800 / 10,000 (too long)**" before submit, and the save was refused with "**Notes can be up to 10,000 characters (this has 10,799).**" The stored `summary_notes` is still **null**. |

Side effect of the B-8 re-check: a recommendation row (priority *Cost Savings*) now exists for
the ZZQA Existing Client Co 3PL project. It can't be removed from the client side — a direct
`DELETE` returns 0 rows under RLS — so it is left in place; see N-10.

## Bugs

### B-16 — The Expert CSV leaves out the project's duty estimates

- **Severity:** Medium. **Cases:** TAR-40 (fails), FWD-34 (the "duty estimates" half).
- **Steps:** on a forwarder project with a linked duty estimate (here ZZQA Pakkable-style Co with "Our estimate $7,891.71"), Export → **Expert CSV**.
- **Expected:** the Expert CSV carries the linked duty estimates, with the incomplete flag on each, as `/help` and the matrix describe (and as the PDF/DOCX are meant not to).
- **Actual:** the CSV has three sections — PROJECT DETAILS, FORWARDERS, QUOTE COMPARISON — and nothing about duty at all: searching the file finds no "duty estimate", no "Incomplete", and not even the total `7,891.71`. The project page shows all of it, so the information exists and is simply not exported. The Client CSV omits it correctly.
- **Suspect file:** the expert CSV builder under `src/lib/forwarder/` (the export action is `exportForwarderCsv`-style in `src/app/(authenticated)/forwarder-sourcing/`), which appears never to add a duty-estimates section.

### B-15 — A locked Landed Cost version that contains a fixed-amount manual rate can never be opened or exported

- **Status: Fixed 2026-10-26.** The cause differed from the suspect above: `ratePercent: null` was always accepted. A manual rate's value is stored as the database returns it, the numeric **as typed** (`"250"`, `"500"`; the `"250.00"` above was the on-screen amount), and the reader required it as money with exactly two decimals. The stored rows were right (the layer's own amount is `"250.00"` and the database had checked it), so only the reader changed (`snapshot-schema.ts`: a rate up to 4 decimals, an amount up to 2, exactly one of the two); no migration, no stored row touched. The CSV shows the value with its cents (`Fixed 250.00`). The 3b tests had missed it because every fixed-amount fixture was written with two decimals; `snapshot-manual-values.test.ts` now covers %-only, fixed-only (`250`, `250.5`, `0`, `12.34`) and both, through open, page, PDF and CSV. ZZQA LC Main v4 and ZZQA LC Entry v3 were checked with the fixed parser from read-only copies: both parse, show and export (`$500.00 fixed`, `$250.00 fixed`).
- **Severity:** High. **Cases:** LCM-10, LCV-07 (for such versions).
- **Steps (minimal, reproduced twice):** in a Landed Cost workspace with one origin and one SKU, add a manual duty with **Value → Fixed USD amount** (e.g. label "QA fixed repro", $250.00, any reason) → Save draft → Lock this version → open the new version.
- **Expected:** the version page shows the stored result, with the manual rate in full, and offers Download PDF and Export CSV (as it does for a version whose manual rate is a percentage).
- **Actual:** the page renders only its header and then "**This version can't be displayed: its stored data isn't in a form this page can read. Nothing was changed.**" There are **no export controls**, so the version can never be read or exported again. The browser console shows `loadLockedVersion: stored version doesn't match the schema` with the version id.
- **Control:** the same workspace locked with a **percentage** manual rate (v2) opens normally and offers both exports; adding the fixed-amount rate and locking again (v3) fails. ZZQA LC Main v4 (four manual rates, one of them fixed) fails the same way; v3 of that workspace, locked before any manual rate, still opens.
- **Stored data:** the row is intact — nothing is lost, and the result JSON differs from a readable one only in the manual block: for the fixed-amount rate `manual.ratePercent` is `null` and `manual.amountUsd` is a string (`"250.00"`), alongside `manual.engineRateText` / `manual.engineAmountUsd` and `duty.warnings[].coveredByManualRate`.
- **Suspect file:** the locked-version loader's schema (`loadLockedVersion`, the snapshot schema used by `src/app/(authenticated)/landed-cost/[id]/versions/[versionId]/`), which appears to require `ratePercent` on a manual line instead of accepting either a rate or a fixed amount. pgTAP 40 and the unit tests pass, so the gap is between what `save_landed_cost_snapshot()` stores and what the version page accepts.

### B-14 — "Incomplete estimate" disappears from a SKU when its only uncounted program is covered by a manual rate, but only for some origins

- **Severity:** Medium. **Case:** LCM-06.
- **Steps:** ZZQA LC Main, SKU-A (an override on base duty plus a manual duty on the uncounted Section 301 (forced labour) program, so its "Programs not counted" entry reads "… Covered by a manual rate."). Save with **Country of origin = Mexico**, read SKU-A's badges; change the same origin to **Germany**, save, read them again.
- **Expected:** the same marking in both cases, and per the app's own rule ("A manual rate never makes a result complete") a SKU whose only uncounted, still-unreviewed program is covered by a hand-entered rate should keep "Incomplete estimate".
- **Actual:** with Mexico, SKU-A shows "Complete · Incomplete estimate · Includes manual rate". With Germany, the same SKU with the same layers and the same single covered program shows only "**Complete · Includes manual rate**" — the "Incomplete estimate" badge is gone, so that SKU's duty figures read as final. SKU-B, covered the same way in the same Germany origin, **keeps** the badge, so the marking is also inconsistent between two SKUs of one origin.
- **Not affected:** the origin-level badge stayed "Incomplete estimate" in every combination tried, and the locked version row and page still read "Incomplete", so no locked version was marked complete.
- **Suspect file:** the per-SKU incomplete/coverage logic in the Landed Cost result builder (`src/lib/landed-cost/`), where a warning marked `coveredByManualRate` seems to be dropped from the per-SKU incompleteness test in some program configurations.

### B-13 — Delete workspace offers Delete, then refuses, when the workspace has locked versions

- **Severity:** Low. **Case:** LC-18.
- **Steps:** open a Landed Cost workspace that has at least one locked version → Delete workspace → the dialog says only "Delete “<name>” with all its SKUs, inputs and costs? This cannot be undone." with Delete enabled → confirm.
- **Expected:** the dialog says up front that the locked versions have to go first (or the control is disabled with that reason), as the lock control does for incomplete origins.
- **Actual:** the delete is attempted and then refused with "This workspace has 2 locked versions. Delete them first." Nothing is lost and no version is touched, so this is wording and timing only.
- **Suspect file:** the delete dialog in `src/app/(authenticated)/landed-cost/` (the server-side guard in `actions.ts` behaves correctly).

## Notes

- **N-1 — The first attempt at this run was blocked at setup.** The plan's
  `cp -cR node_modules ../3pl-sourcing-qa/node_modules` step was refused by the harness
  ("don't ask mode") even though `.claude/settings.local.json` allows that exact command;
  writes outside the primary working directory appear to be refused in this mode regardless
  of the allow-list. The user created and populated the worktree instead, and this run does
  not create or remove it.
- **N-10 — Demo client data this run added.** Checkpoint 5 exercised the real client flows, so
  the demo data now carries: one **published client update** for Brightline ("QA regression
  2026-10-23 — quotes are in"), one **published Market Report** for Brightline (same content as
  the seeded one, with the Move's-take text restored), an **approval** and two **questions**
  from Brightline (one of them replied-to and then withdrawn, which is the POR-09 evidence),
  one **introduction request** for Partner E, and one **change request** from Northwind. The
  next `npm run demo:seed` replaces all of it. Nothing was deleted and no seeded update,
  report or request was altered. The B-8 re-check (2026-10-26) also left a **recommendation row
  for the ZZQA Existing Client Co 3PL project** (priority *Cost Savings*, the top two 3PLs by
  total cost); a direct `DELETE` is refused by RLS (0 rows), so it stays until the next
  `qa:seed`. Nothing else was created in the timebox: the B-9, B-10 and B-12 re-checks were all
  refused writes, verified to have left `clients`, `forwarders.email` and
  `three_pl_projects.summary_notes` untouched.
- **N-9 — One deliberate residue in the local fee data.** TAR-36 needed a real fee change, and
  the fee model is append-only (a row is changed by end-dating it and adding its replacement),
  so no edit can be undone exactly. The test was put in a quiet future window and reverted:
  HMF is **0.125% everywhere except the single date 2027-06-01, where a 0.2% test row remains**
  (source label "QA regression 2026-10-23 (test row, revert me)"). Today's and every realistic
  quote date are unaffected. To clear it, end-date that row before it starts or remove it with
  a migration; leaving it changes nothing for current work. The saved estimate "ZZQA
  immutability check" deliberately keeps the 0.2% figures as TAR-32's evidence.
- **N-8 — No duty program is reviewed in the local data, which gates four cases.** Every
  additional duty program in the `ZZQA-local` seed reads "pending expert review" (or "Not
  loaded"), so nothing is ever **counted** in a total. That is the correct behaviour and is
  stated clearly in every estimate, but it means TAR-15's switch-on, TAR-41's verification
  date, TAR-08's "added" branch and LCM-07's conflict can only be shown once a program is
  marked reviewed. The editor page offers "Mark reviewed" — and the run **deliberately did not
  use it**: marking a program reviewed starts counting that program in every estimate and in
  Landed Cost, and the only way back is to change one of its rows (which puts it back to
  pending review but leaves an edited row behind). That would alter the local duty data this
  team works with and would invalidate the figures recorded for B-14 and B-15. A fee change,
  which *is* reversible in effect, was used instead (TAR-36, N-9). To test these four cases,
  do it deliberately on a stack you are happy to re-seed.
- **N-7 — Accounts and data changed in checkpoint 3, and their state at the end.**
  `zzqa-client-a@example.test` (ZZQA Existing Client Co) and `zzqa-client-b@example.test`
  (ZZQA Café & Crème) were created as portal users and left in place; the next `qa:seed`
  removes portal users of ZZQA clients. `zzqa-created@example.test` was created and deleted
  again. `zzqa-target` is left as a **logistics expert, not a tariff editor**, renamed to
  "ZZQA Target Renamed é&🚚" (the seed resets the name). `zzqa-expert2`'s two projects were
  reassigned and **restored** to Expert Two, ZZQA Existing Client Co's business model was
  edited and **reverted** to B2C, and its plan was toggled to Market Report and **back to
  free**. `solace-ops`'s must-change-password state was deliberately **not** consumed. Every
  `customs_fees` write in AUTH-07 wrote each field's existing value back, so no duty data
  changed.
- **N-5 — Test data left in the local database.** Three Landed Cost workspaces owned by
  `zzqa-expert1`, all named with the `ZZQA` prefix: **ZZQA LC Main** (5 origins, 2 SKUs,
  4 manual rates, locked versions v3 and v4), **ZZQA LC Entry** (2 SKUs, locked versions v1,
  v2, v3) and **ZZQA LC &lt;script&gt;… Café & Crème 🚚 …** (1 SKU). They are deliberately
  **not** deleted: B-15 and B-14 reproduce on them, so they are the evidence. v4 of ZZQA LC
  Main and v3 of ZZQA LC Entry are the two versions that cannot be opened. The next `qa:seed`
  does not remove them (it clears ZZQA clients, 3PL and forwarder data, not Landed Cost
  workspaces), so delete them by hand once the bugs are fixed or triaged — the eight
  "QA filler" manual rates created while testing the per-SKU limit were already removed.
- **N-6 — The Supabase CLI broke mid-run, not the stack.** See "Run stopped". `npx supabase`
  worked for the setup, the gates and both seeds, then began failing with "No matching Supabase
  CLI binary package found for darwin-arm64" while the local stack kept serving (REST 200).
  Nothing in the app or the data caused it.
- **N-3 — Downloads and PDF contents.** The Playwright MCP server resolves its paths against
  the QA worktree, so downloads land in `../3pl-sourcing-qa/.playwright-mcp/`, which this
  session may not read. CSV contents were therefore captured in the page (by wrapping
  `URL.createObjectURL` and reading the Blob as text), which is why the CSV evidence above is
  exact. A PDF can't be read that way, so for PDF cases only the file name, media type and
  size are evidence unless the bytes can be dumped to the scratchpad.
- **N-4 — API checks run from inside the browser.** PostgREST checks use the signed-in user's
  own session JWT, read from the `sb-127-auth-token` cookie inside the page and sent as both
  `apikey` and `Authorization`. No configuration key was ever read or printed, and no token
  appears in this report.
- **N-2 — GATE-05 cannot be run as written in this mode.** The gate needs a fake `npx` on
  `PATH` reporting a non-local Supabase URL; a file written by the harness is not executable
  and `chmod` is not in the allow-list, so the attempt fell through to the real `npx` and
  simply seeded the local stack. To make the gate runnable unattended, either allow
  `chmod +x` inside the scratchpad, or give `seed-qa.mjs` a test-only way to inject the
  status output so no executable has to be created.

## Not tested, and why

**22 of the 271 planned cases were not run.** Six of them carry a ⏭ row in the tables above
(GATE-05, LCM-07, LCM-11, TAR-41, TAR-43, TAR-45); the other sixteen have no row at all
(3PL-03, 3PL-07, 3PL-08, 3PL-19, 3PL-20, 3PL-21, 3PL-26, FWD-02, FWD-03, FWD-06, FWD-07,
FWD-08, FWD-09, FWD-43, X-06, X-09). None is blocked by a defect: each is gated by missing
local data, a missing `ANTHROPIC_API_KEY`, a harness restriction, or the 2026-10-26 timebox,
which deliberately spent its last minutes on the client-role, portal, tariff and B-4–B-12
checks instead of the unchanged 3PL and forwarder paths (those are covered by the pgTAP and
Vitest gates). Where the reason below is the timebox, read it as **"not tested: timeboxed
2026-10-26"**.

| Case | Why |
|---|---|
| GATE-05 | Needs an executable fake `npx` on `PATH`; `chmod` is refused in this mode (N-2). The re-run half passed incidentally (two clean `qa:seed` runs). |
| TAR-41, TAR-15's switch-on, LCM-07 | All three need a duty program marked **reviewed**, and the run deliberately did not do that: it is not cleanly reversible and would change the local duty data and invalidate the B-14/B-15 figures (N-8). |
| TAR-43 | The fee roll-over reminder has no trigger until the FY2028 window (Oct 2027); nothing about a fiscal year appears on the fees page today, so "editor sees it, expert doesn't" can't be compared. The logic is unit-tested in GATE-02. |
| TAR-45 | **Section 232 (polysilicon and derivatives)** is "Not loaded · 0 rows" locally, and `/help` confirms the program only matches 2804.61, 3818 and 8541.42/43 — none of which exist in the `ZZQA-local` release. The 2026-12-04 boundary is untestable on this data. |
| LCM-11 | No schema-version-1 locked version exists locally; every snapshot is `schema_version: 2` and `demo:seed` creates none. |
| The LCV-07 PDF contents (and FWD-36/37 PDF/DOCX contents) | The files download correctly with the right media types and sizes, but land outside this session's readable path and their text is in compressed streams, so a column-by-column read wasn't possible (N-3). |
| 3PL-20, FWD-08 (*needs AI*) | `ANTHROPIC_API_KEY` is unset by design; both are covered by the merge unit tests in GATE-02. |
| 3PL-03 | The existing-client path in the wizard: the radio list of existing clients was present and correct, but the run exercised the **new**-client path (3PL-02) and the duplicate guard (3PL-04) instead. |
| 3PL-07, 3PL-08, X-06 | Back and refresh **mid-wizard**, and Back after a save. Not run; the wizard was completed forwards and X-07 covers refresh on a result page. |
| 3PL-19 | Edit-then-Cancel on the info form. Not run (3PL-18's save path was). |
| 3PL-21 | Uploading a `.csv` to the document pre-fill, to check it is refused before any AI call. Not run — it needs a real file upload, and the AI path is unavailable anyway. |
| 3PL-26 | Incumbent with no costs → "Baseline Pending". Not run: it needs a fresh no-cost 3PL marked incumbent, and the seeded project's incumbent slot is taken (3PL-30 shows the conflict guard). `/help` documents the Pending state (HELP-04). |
| FWD-02, FWD-03, FWD-06, FWD-07 | The forwarder intake wizard (new/existing client, required-field messages, edit). Not run; the equivalent 3PL wizard was (3PL-02–06), and FWD project editing was exercised through the duration field (FWD-04/05). |
| FWD-09 | Add / edit / delete a **forwarder** (the quote-level equivalents FWD-10/13/14 all passed). |
| FWD-43 | Deleting a forwarder project (the 3PL equivalent, 3PL-34, passed both branches). |
| The 16 row-less cases above, as a group | Not tested: **timeboxed 2026-10-26** — the run was closed on a 30-minute timebox whose triage order was client-role/security, portal isolation, TAR-39–46, then B-4–B-12. The individual reasons that were already known are kept below. |
| X-09 | A 5,000-character note. Not run; LC-19's long text (a ~160-character name truncated to the field limit) and the 10,000-character notes counter on the 3PL page were observed instead. |

## What to pick up first

1. **B-15 (High)** defeats the purpose of locking a Landed Cost version whenever a fixed-amount
   manual rate is involved — the version can never be opened or exported again. The two broken
   versions are still in the local database as evidence (N-5).
2. **B-16 (Medium)** leaves duty estimates out of the Expert CSV, the one export that is meant
   to carry them.
3. **B-14 (Medium)** needs a decision on what the per-SKU "Incomplete estimate" badge should
   mean when a manual rate covers the only uncounted program.
4. **B-13 (Low)** is a one-line wording fix in the Delete workspace dialog.
5. On a stack you are happy to re-seed, mark one duty program reviewed and run **TAR-41**,
   **TAR-15**'s switch-on and **LCM-07**; add a polysilicon HTS line for **TAR-45**.

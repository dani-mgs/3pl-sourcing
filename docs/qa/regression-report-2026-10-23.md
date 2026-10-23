# Regression Report — 2026-10-23

Run of [regression-plan-2026-10-23.md](regression-plan-2026-10-23.md). Case IDs refer to
[regression-test-cases.md](regression-test-cases.md) and to the new cases in the plan.

**Status: in progress, resumed.** The run stopped once when the local `npx supabase` CLI broke
(see "The CLI break" below); the CLI was repaired and the run picked up at CLR-01. The Progress
table is the authoritative list of what is done and what remains.

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

- **Cases run: 42 of ~290.** **37 pass** (31 clean, 6 with a linked bug or a stated partial),
  **1 fail** (LCM-10, bug B-15), **4 not tested** for a stated reason (GATE-05, LCM-07, LCM-11
  and the LCV-07 PDF contents), and the rest — all of checkpoints 3–6 — not reached. **0 cases
  retired.**
- **Automated gates: all green except GATE-05.** pgTAP **1,340/1,340** in 40 files. Vitest
  **2,225 passing / 1 skipped** in **all 7 timezones**, identical counts. Lint clean. Typecheck
  clean. Production build clean with the flag on. GATE-05 (the seed's non-local guard) can't be
  run in this mode — see N-2.
- **New bugs: 3** — 0 Critical, **1 High**, **1 Medium**, **1 Low**.
- **No Critical bug:** no cross-user or cross-client access and no RLS gap (every non-owner
  write returned 0 rows, every forged insert 42501), no wrong duty, cost or ratio figure —
  every money figure checked matched a hand calculation to the cent, including half-up
  rounding — no locked version changed, and no data lost.
- **B-4 to B-12** (all reported fixed in the 2026-10-09 report): **not retested** — they belong
  to the AUTH, ADM, RLS, 3PL and forwarder cases in checkpoints 3–6, which were not reached.
- **New bugs: 3** — **B-15 (High)** a locked Landed Cost version holding a fixed-amount
  manual rate can never be opened or exported; **B-14 (Medium)** a SKU's "Incomplete estimate"
  badge disappears when a manual rate covers its only uncounted program, inconsistently by
  origin; **B-13 (Low)** the Delete workspace dialog offers Delete before the locked-versions
  guard refuses. No Critical bug so far: no cross-user or cross-client access, no RLS gap, no
  wrong money figure (every figure checked matched a hand calculation), and no locked version
  changed.
- **B-4 to B-12** (all reported fixed in the 2026-10-09 report): status recorded in the
  Security and roles / 3PL / Forwarder sections as those cases run.

## Progress

| # | Checkpoint | Status | Remaining |
|---|---|---|---|
| 0 | Setup | **Done** | — |
| 1 | Automated gates | **Done** | GATE-05 only, and it can't run in this mode (N-2) |
| 2 | Landed Cost | **Done** (2 cases deferred) | LCM-07 (needs a duty-data change as the tariff editor, deferred to checkpoint 4) and LCM-11 (no schema-version-1 version exists locally); the LCV-07 PDF contents are unread (N-3) |
| 3 | Security and roles | **Done** (4 cases deferred) | RLS-09, RLS-10, RLS-11 and RLS-15 need a saved duty estimate, which TAR-31 creates in checkpoint 4 |
| 4 | Tariff | Not started | TAR-01–46, the deferred LCM-07, and RLS-09/10/11/15 |
| 5 | Portal and client features | Not started | POR-06–15 (POR-01–05 are done) |
| 6 | Everything else | Not started | 3PL-01–37, FWD-01–44, HELP-01–10, X-01–14 |
| 7 | Cleanup | Not started | Stop the dev server, final summary commit. Test data left in place is listed in N-5; the worktree is left for the user, as asked. |

The first remaining case is **TAR-01** (checkpoint 4). Nothing in checkpoints 0–3 needs
redoing.

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

## Bugs

### B-15 — A locked Landed Cost version that contains a fixed-amount manual rate can never be opened or exported

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

| Scope | Why |
|---|---|
| All of checkpoints 3–6: CLR-01–08, CLI-01–05, the existing AUTH, ADM and RLS cases, POR-01–15, TAR-01–46, 3PL-01–37, FWD-01–44, HELP-01–10, X-01–14 | The local Supabase CLI broke, so the app can no longer be started (see "Run stopped"). Nothing was skipped for an application reason. |
| GATE-05 | Needs an executable fake `npx`; `chmod` is refused in this mode (N-2). |
| LCM-07 | Needs a duty-data change as the tariff editor; deferred to checkpoint 4, which was never reached. |
| LCM-11 | No schema-version-1 locked version exists locally (N-5 lists what does). |
| The LCV-07 PDF contents | The version PDF downloads correctly (`application/pdf`, 23,767 bytes) but lands outside the readable path, so its page-1 box and per-origin tables were not read (N-3). |
| Cases marked *needs AI* (3PL-20, FWD-08) | `ANTHROPIC_API_KEY` is unset by design; both are covered by unit tests in GATE-02. |

## What the next run should pick up first

1. **B-15** blocks the point of locking a version, so it is the one to fix before anything else
   in Landed Cost ships; the two broken versions are still in the local database as evidence.
2. **B-14** then needs a decision on what the per-SKU "Incomplete estimate" badge is meant to
   mean when a manual rate covers the only uncounted program.
3. Resume the run at **CLR-01**, then take the deferred **LCM-07** during checkpoint 4's editor
   session.

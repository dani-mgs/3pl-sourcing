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
| 2 | Landed Cost | In progress | Done: LCF-01, LC-01–15, LC-18, LCV-01–05, LCV-07, LCV-08. Remaining: LC-16, LC-17, LC-19, LC-20, LCV-06, the LCV-05 two-tab half, the LCV-07 PDF contents, LCM-01–11, LCF-02, LCF-03 |
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
| LC-11 | ✅ Pass | Mexico shares: product 20,000 ÷ 24,144.28 = 82.835% → **82.8%**; freight 8.284% → **8.3%**; duties 6.833% → **6.8%**; MPF 0.287% → **0.3%**; HMF 0.104% → **0.1%**; other 1.657% → **1.7%**. Each is rounded per item (they sum to 100.0 here), and the table carries the note "Percentages are rounded." Still to confirm against the exact `/help` wording in HELP-08. |

| LC-12 | ✅ Pass | Tariff Calculator, 6109.10.00.12 · Mexico · Sea · $10,000 · entry Oct 23, 2026 → **Base duty $1,650.00 (16.5%)**, MPF $34.64, HMF $12.50, "EXCLUDES 1 additional duty program", "Incomplete estimate", "Not included: Section 301 (forced labour) — could add 10% (about $1,000.00, 9903.05.55); pending expert review". Landed Cost for the same line, origin, value and date gives the same $1,650.00 duty, the same $34.64 MPF share and the same $12.50 HMF share, and the same pending-review warning. |
| LC-13 | ✅ Pass | Pasted the experts' real headings (SKU code, Product description, HTSUS, Qty, FOB Unit Cost (USD), Box Configuration (pcs/carton), Length (cm), W (cm), H (cm), Total Weight / Master Carton (kg)) plus two calculated columns. Preview: "1 to update, 1 to add", **COLUMNS NOT IMPORTED — "Total FOB Value: Not recognised." and "Landed cost per unit: Rates and fees come from the tariff engine."** The existing SKU matched by exact code; its blank cells showed **"kept"** for description, pcs/carton and carton kg, and kept those values after Apply. The new row was added with `Ceramic mugs é & 🚚` intact and HTS normalised to 9403.60.80.81. `$11.50` and `1,200` parsed to 11.50 and 1200; nothing was deleted. **Per-origin:** with the Vietnam origin selected the dialog said "FOB price and packing go to Vietnam"; after applying 7.77 / 3.33 the Vietnam FOB and pcs/ctn changed and Mexico still read 11.50 / 1 and 4.25 / 40. Units are taken from the headings (cm, kg) and never guessed. |
| LC-14 | ✅ Pass | Pasted text in the number columns, a duplicate SKU code and an unknown column. Preview: "0 to update, 0 to add, 3 with errors (skipped if you apply the valid rows)", "Mystery column: Not recognised.", and per row: "The SKU code "SKU-E" appears more than once in this paste.", "Enter the quantity as a whole number from 1 to 999,999,999,999.", "Enter the FOB price in USD with up to 4 decimals, e.g. 6.25." The apply button read **"Apply valid rows (0 of 3)"**. After Cancel the SKU rows were byte-for-byte unchanged — nothing half-applied, no database or Zod text. |
| LC-15 | ✅ Pass | Export CSV on a draft downloaded `landed-cost-ZZQA-LC-Entry-2026-10-23-draft.csv` and the CSV text was captured in the page. It carries `Status,"DRAFT: not a locked estimate. Figures change when inputs or duty data change."`, keeps `Ceramic mugs é & 🚚` in UTF-8, and shows the app rate as plain text in the duty-layer rows (`16.5%`, `Free`). It is the **last save recalculated on the server**: an unsaved Vietnam origin and its pasted $7.77 appear nowhere in the file. Hand-check of its figures: entered value $17,200, MPF 0.3464% → $59.58, HMF 0.125% → $21.50, duties 16.5% × $13,800 = $2,277.00, freight split by chargeable weight 36,000 kg : 600 kg → $98.36 / $1.64, SKU totals $16,240.41 and $3,417.67, grand total $19,658.08, per unit $9.83 — every figure in the CSV matches. |
| LC-18 | ⚠️ Pass (B-13) | With v1 and v3 locked, Delete workspace → the confirm dialog offers Delete, and on confirming the action is refused with **"This workspace has 2 locked versions. Delete them first."** The workspace and both versions survived. The behaviour is right; the dialog not saying so up front is B-13 (Low). |
| LCV-01 | ✅ Pass | While four origins were incomplete, "Lock this version" was disabled with "Complete every origin before locking: Thailand: Freight total (USD); SKU-A: FOB price per unit (USD); … Canada: …". With every origin complete and saved, the lock dialog read "Freezes the last save and its result, with today's duty data, as the next numbered version. A locked version can't be changed; it can be deleted. The workspace stays editable." Locking produced **v1**, then a second lock **v2**, in order. |
| LCV-02 | ✅ Pass | Deleted v2 ("Delete locked version v2 (Oct 23, 2026)? This cannot be undone. The workspace isn't changed."), then locked again → the new version is **v3**, not a reused v2. Later v1 was deleted too (through the API, as its creator and owner) and the list kept v3 alone, so no renumbering happened either. |
| LCV-03 | ✅ Pass | The v1 page is headed "Locked version v1, locked on Oct 23, 2026 by ZZQA Expert One", "Read-only", "This is the result as it was locked; later changes to the workspace or duty data don't show here." It has **zero form controls** — no edit path in the UI. Through PostgREST with the owner's JWT, `PATCH landed_cost_snapshots` → **403 `42501` "permission denied for table landed_cost_snapshots"** (no UPDATE grant to `authenticated` at all, so the immutability trigger is never even reached). |
| LCV-04 | ✅ Pass | Every origin carried "Section 301 (forced labour) … pending expert review" (Canada also "Section 338 (Canada) not loaded"), and the lock went through: the version row reads **"v1 Incomplete"**, the version page "Incomplete: duties or fees not final", and the stored row has `incomplete: true`. Pending reviews did not block the lock. |
| LCV-05 | ⚠️ Pass (UI half) | With an unsaved edit the lock control is disabled and reads **"Save your changes first: a version locks the last save."** The two-tab / stale-`expectedUpdatedAt` half is still to do. |
| LCV-07 | ⚠️ Pass (partly) | A draft offers **Export CSV only** — no PDF control anywhere on the workspace page. A locked version offers **both**: `landed-cost-ZZQA-LC-Main-v1-2026-10-23.csv` and `landed-cost-ZZQA-LC-Main-v1-2026-10-23.pdf` (`application/pdf`, 23,767 bytes). The version CSV is built from what was stored: `Status,"LOCKED VERSION v1, locked on Oct 23, 2026 by ZZQA Expert One. These figures are fixed."`, plus `HTS release,ZZQA local test release (ZZQA-local)` and `Duty data as of,"Oct 23, 2026"`, and no DRAFT marker. The PDF's **contents** are not yet inspected (the download lands outside the readable path; see N-3). |
| LCV-08 | ✅ Pass | With the expert's own session JWT: `POST landed_cost_snapshots` → **403 `42501` permission denied for table landed_cost_snapshots**; `POST /rpc/save_landed_cost_snapshot` → **404 `PGRST202`**, i.e. the function isn't exposed to `authenticated` at all (service role only), which matches the documented exception. Reads of the table are allowed, as staff are meant to see versions. |

## Bugs

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

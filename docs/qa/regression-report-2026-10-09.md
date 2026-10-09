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
| 2. Auth / Admin / RLS | Done |
| 3. 3PL Sourcing | Done |
| 4. Forwarder Sourcing | Done |
| 5. Tariff Calculator | Done |
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

## 2. Auth, Administration and RLS

| ID | Result | Evidence |
|---|---|---|
| AUTH-01 | ✅ Pass | expert1 signs in and lands on `/`. The top bar shows "ZZQA Expert One". |
| AUTH-02 | ✅ Pass | "Invalid email or password." The email is kept and the password cleared. |
| AUTH-03 | ✅ Pass | The browser's "Please fill out this field." shows on both inputs. Nothing is submitted. |
| AUTH-04 | ✅ Pass | Log Out is the only item in the expert's account menu. Signing out clears the session; later runs signed in fresh each time. |
| AUTH-05 | ✅ Pass | Signed out, `/`, `/3pl-sourcing`, `/forwarder-sourcing`, `/tariff-calculator`, `/help`, `/admin`, a project URL and `/tariff-calculator/duty-data` all return 307 → `/login`. |
| AUTH-06 | ⚠️ Pass with bug B-2 | Target was signed in, then the admin clicked **Promote to Admin**. On the next page load, target got `/admin` (200) and the edit form for expert2's forwarder project. Saving that form failed with "You don't have permission to make this change." After signing out and in, the same save worked. Nothing tells either user that a re-login is needed. |
| AUTH-07 | ⚠️ Pass with bugs B-1, B-2 | **Grant:** after **Make tariff editor**, target's existing session opened Duty data (200) straight away, but writes would still fail until re-login (same split as AUTH-06). **Revoke:** a token issued before the revoke still updated `customs_fees` through the API (200, 1 row) — see B-1. |
| AUTH-08 | ✅ Pass | expert1 → `/admin` returns 404. The account menu shows only "Log Out". |
| AUTH-09 | ✅ Pass | editor → `/admin` returns 404. The menu shows only "Log Out". |
| AUTH-10 | ✅ Pass | The admin's menu shows "Administration" and "Log Out", and `/admin` returns 200. |
| AUTH-11 | ✅ Pass | A reload keeps the session. |
| AUTH-12 | ✅ Pass | The hub shows 6 cards. 3PL Sourcing, Forwarder Sourcing and Tariff Calculator are live; Landed Cost, 3PL Audit and Forwarder Audit say "Coming Soon". |
| ADM-01 | ✅ Pass | The page has three sections: Project Reassignment (16 projects), Clients (13) and User & Role Management (5 users with role and the "tariff editor" flag). |
| ADM-02 | ✅ Pass (B-4) | **Make tariff editor** on target → the row immediately shows "· tariff editor" and "Revoke tariff editor". There's no confirmation step. |
| ADM-03 | ✅ Pass | **Revoke tariff editor** → the flag clears. |
| ADM-04 | ✅ Pass (B-4) | **Promote to Admin** → the row shows "· admin" and "Demote to Logistics Expert". One click, no confirmation. |
| ADM-05 | ✅ Pass | **Demote to Logistics Expert** → the row is back to logistics_expert. |
| ADM-06 | ✅ Pass | The admin's own row has no role, editor or delete buttons. |
| ADM-07 | ✅ Pass | The Edit name dialog pre-fills the current name. An empty name gives "Name is required." Saving `ZZQA Target Renamed é&🚚 <b>x</b>` shows exactly that text, with the `<b>` escaped, in the user list and in every Reassign dropdown. |
| ADM-08 | ✅ Pass | "Enter a valid email address." / "Password must be at least 8 characters." / "A user with that email already exists." |
| ADM-09 | ✅ Pass | "User Created — zzqa-created@example.test was created successfully." The user is listed. |
| ADM-10 | ✅ Pass | "Delete zzqa-created@example.test? This cannot be undone." After confirming, the user is gone after a reload. |
| ADM-11 | ✅ Pass | Delete on expert1 opens "Can't delete this user — This user owns 14 project(s). Reassign ownership before deleting this user." The count is right (4 3PL + 10 forwarder). Nothing was deleted. |
| ADM-12 | ✅ Pass | The E2 3PL project was reassigned to expert1. expert1 then had edit controls; expert2 saw "view only" with no controls and got 404 on `/info/edit`. Reassigning it back restored expert2's edit controls. |
| ADM-13 | ✅ Pass | The same for the E2 forwarder project: expert1 could edit, and expert2 saw "view only" and got 404 on `/edit`. Reassigned back afterwards. |
| ADM-14 | ✅ Pass | Business model → "B2C & D2C ✓" saved and shown, then reverted. Renaming to "zzqa no quotes inc" gives "A client named "ZZQA No Quotes Inc" already exists." (case-insensitive). An empty name gives "Client name is required." |
| ADM-15 | ✅ Pass | Clients with projects show "Has 2 projects", and their Delete button is disabled. |
| ADM-16 | ✅ Pass | As expert1, I posted the real server-action IDs (from the dev manifest) for `updateUserRole`, `updateTariffEditor`, `deleteUser` and `reassignOwner`. Each returned "You don't have permission to make this change." and nothing changed. |
| RLS-01 | ✅ Pass | expert2 opening expert1's 3PL project, Info, a 3PL and the Recommendation page gets 200 with "view only". Notes are disabled. The Recommendation page has no Save button: its priority selector stays enabled for re-ordering, and RLS refuses a direct insert (403). |
| RLS-02 | ✅ Pass | `/info/edit` → 404 |
| RLS-03 | ✅ Pass | `/providers/<id>/edit` and `/providers/new` → 404 |
| RLS-04 | ✅ Pass | `/3pl-sourcing/new/<id>`, `/providers` and `/review` → 404. This was Failure #4 on 2026-09-28; it's fixed. |
| RLS-05 | ✅ Pass | `/forwarder-sourcing/<id>/edit` → 404 |
| RLS-06 | ✅ Pass | `forwarders/new`, `forwarders/<id>/edit`, `quotes/new` and `quotes/<id>/edit` → 404. The project and forwarder pages are 200 "view only". |
| RLS-07 | ✅ Pass | API as expert2 against expert1's data: PATCH project, PATCH quote, DELETE quote and PATCH `owner_id` to self each changed 0 rows. INSERT forwarder → 403 RLS. Re-reading the rows with the service role confirmed nothing changed. |
| RLS-08 | ✅ Pass | PATCH a 3PL project or DELETE its 3PLs → 0 rows. INSERT a 3PL → 403. The owner can't hand their own project to someone else either (403 on `owner_id`). |
| RLS-10 / 11 | ✅ Pass | `duty_estimates` INSERT → "permission denied". `rpc('save_duty_estimate')` → "permission denied for function". The UI parts of RLS-09/10 are tested in the Tariff checkpoint. |
| RLS-12 | ✅ Pass | As expert1: PATCH `customs_fees` and `additional_duties` → 0 rows; INSERT `hts_lines` and `fx_rates` → permission denied. A profile role change, for self or others → permission denied. Clients: PATCH/DELETE → 0 rows. |
| RLS-13 | ✅ Pass | Anon SELECT on 15 tables (clients, forwarder_*, three_pl_*, rate_details, recommendation, duty_estimates, profiles, fx_rates, hts_lines, customs_fees, additional_duties, tariff_data_history) → 401 "permission denied". Anon INSERT into clients → 401. |
| RLS-14 | ✅ Pass | `/api/cron/fx-rates` and `/api/cron/hts-release` → 401, with no header and with a wrong Bearer token. |
| RLS-15 | ✅ Pass (UI part) | expert2 opening the calculator linked to expert1's Pakkable quote sees "Only the project's owner or an admin can create duty estimates for it. You can still use the calculator below without linking." |

Two more observations from the API probes:
- A user can write `role: "admin"` into their own `user_metadata`. This is harmless: roles are only ever read from `app_metadata` (`get-user-role.ts`, `get-tariff-permissions.ts`, `is_admin()`), and `user_metadata` is used only for `first_name`.
- Every signed-in user can read every saved duty estimate (`USING (true)`). That matches `/help`: "everyone signed in can … view saved estimates".

## 3. 3PL Sourcing

| ID | Result | Evidence |
|---|---|---|
| 3PL-01 | ⚠️ Pass with bug B-6 | My Projects · 4, All Experts · 5, correct. "zzqa CAFÉ" finds the Café client, and the search is case-insensitive. **"zzqa cafe" finds nothing**, so the search is accent-sensitive (B-6). No match shows "No projects match your search." The pipeline text shows the top two statuses, by design (`3pl-sourcing/page.tsx`). |
| 3PL-02 | ⚠️ Pass with bug B-9 | New client "ZZQA New Client QA é&🚚" plus Step 1. The first submit had Contract Period 0 and failed validation, **but it still created the client**. Every retry then said "A client named … already exists." I had to switch to Existing client to continue (B-9). |
| 3PL-03 | ✅ Pass | The Existing client list shows all 13 ZZQA clients. Choosing one links the project; no duplicate is created. |
| 3PL-04 | ✅ Pass | Typing "zzqa existing client co" as a new client → "A client named "ZZQA Existing Client Co" already exists." (case-insensitive). The typed Step 1 fields were kept. |
| 3PL-05 | ✅ Pass | Step 2: added "ZZQA Wizard Incumbent 3PL" (Incumbent, storage $500, pick & pack $250.55, storage rate 12.5). **Add Another** cleared the form for the next one; "ZZQA Wizard Second 3PL" ($400) was added. |
| 3PL-06 | ✅ Pass | Verify Details lists the client, business model, geography and both 3PLs. **Finish** → the project page. Cost Comparison: Second $400 is rank 1 and saves "$350.55 (46.7%)"; the Incumbent $750.55 is Baseline. Both figures are right. |
| 3PL-07 | ✅ Pass | Back to Add 3PLs → Back to Project Info keeps the client and Target Geography. Browser Back returns to Step 2 without errors. Step 2 shows an empty "add another" form; the added 3PLs are listed on Verify. |
| 3PL-08 | ✅ Pass | Refreshing on Step 2 reloads cleanly. Saved 3PLs are kept. |
| 3PL-09 | ✅ Pass | Blank → saved as NULL. The header omits the period; Info shows "Contract Period —"; the edit field pre-fills empty. |
| 3PL-10 | ✅ Pass | 1 → header "Contract period · 1 month", Info "1 month", pre-fill "1". |
| 3PL-11 | ✅ Pass | 36 → "36 months" in the header and on Info. |
| 3PL-12 | ✅ Pass | 120 → "120 months". |
| 3PL-13 | ✅ Pass | 0 → the browser says "Value must be greater than or equal to 1." With browser validation bypassed, the server says "Contract period must be a whole number of months from 1 to 120, or left empty." The other typed fields are kept. |
| 3PL-14 | ✅ Pass | 121 → the browser's "…less than or equal to 120." Bypassed → the same server message. |
| 3PL-15 | ✅ Pass | 1.5 → the browser's "Please enter a valid value. The two nearest valid values are 1 and 2." Bypassed, −5 and 1e1 get the server message. |
| 3PL-16 | ✅ Pass | The field is `type=number` (`step=1`, `inputmode=numeric`). Letters, "12 months" and full-width digits can't reach the form data: the input re-renders as a number field and the browser blanks the value, so it posts empty. The server parser also refuses anything that isn't digits only (`parse-project-form.ts` `/^\d+$/`). Note: a browser that lets you type letters into a number field would save the period as blank without a message. Not reproducible in Chromium. |
| 3PL-17 | ✅ Pass | The seeded 36-month project shows "Contract period · 36 months" in the header and "36 months" on Info. The Verify Details step has no Contract Period line (minor; not logged). |
| 3PL-18 | ✅ Pass | Info edits save and redirect to `/info`. Re-opening Edit pre-fills the new values (native inputs re-hydrate). |
| 3PL-19 | ✅ Pass (note) | There's no Cancel button. "← Back to Project Info" discards changes: the value typed was not saved. |
| 3PL-20 | ⏭ Not tested | Needs AI extraction (no API key). Covered by `merge-client-intake.test.ts` and `merge-provider-fields.test.ts`. |
| 3PL-21 | ✅ Pass | `accept=".txt,.pdf,.docx"`. A .csv → "Unsupported file type. Please upload a .txt, .pdf, or .docx file." A .txt with no key → "Document extraction isn't configured right now." Both offer "Continue with a blank form". |
| 3PL-22 | ⚠️ Pass with bug B-7 | Charlie $700 is rank 1; Tie Alpha and Tie Bravo $800 are ranks 2 and 3 (consecutive, as `/help` says); Incumbent $1,000 is Baseline (rank 4); No Cost Delta says "Not enough data to rank". **Unfit Echo ($100) is left out of the Cost Comparison entirely.** The code excludes Unfit, Do not Contact and Withdrawn (`cost-comparison-panel.tsx:9`), but `/help` doesn't say so (B-7). |
| 3PL-23 | ✅ Pass | "$300.00 (30.0%) saves" and "$200.00 (20.0%) saves" against $1,000. |
| 3PL-24 | ✅ Pass | Café & Crème: "3PLs are quoted in different currencies (EUR and USD) — ranking and savings are hidden until all quotes use the same currency." €700.00 and $650.00 are shown unconverted and unranked. |
| 3PL-25 | ✅ Pass | No incumbent: "Ranked by total cost, lowest first", with no savings line. |
| 3PL-26 | ✅ Pass | Incumbent with no costs: "The incumbent 3PL has no cost data yet — savings will appear once its costs are entered." The incumbent shows "Not enough data to rank · Baseline". |
| 3PL-27 | ⚠️ Pass with bug B-8 | Only the Vetted Tie Alpha and Tie Bravo are listed ($800 each, input order). Save → "Saved". **After changing the priority, "Saved" stays visible before you save again** (B-8). |
| 3PL-28 | ✅ Pass | Turnaround Time: "Turnaround Time can't be automatically ranked from current data." The 3PLs are unnumbered, in the order added. The saved priority survives a reload. |
| 3PL-29 | ✅ Pass | Added "ZZQA Nine Costs 3PL — Ñandú & Co 🚚" with the 9 costs 1.10–9.10 and the 13 rate details 1–13. The view shows Total Cost $45.90 (right) and every rate. Rank 1, saves "$954.10 (95.4%)". Editing storage to 100 gives $144.80 and "$855.20 (85.5%)". Deleting it asks "…This also deletes its Rate Details…" and removes it. **Deleting Tie Alpha, which is in the saved Recommendation, now works**; the Recommendation then lists only Tie Bravo. Failure #1 from 2026-09-28 is fixed. The row ⋯ menu (View / Edit / Delete) also deletes (Failure #3 fixed). |
| 3PL-30 | ✅ Pass | Ticking Incumbent on a new 3PL → "Only one 3PL can be marked as incumbent for this project — uncheck the existing incumbent first." The name, all 9 costs and all rate details are kept. |
| 3PL-31 | ✅ Pass | The owner (expert1) edits info, 3PLs, notes and the recommendation. |
| 3PL-32 | ✅ Pass | See RLS-01 to RLS-04. |
| 3PL-33 | ✅ Pass | The admin on expert2's project sees no view-only banner. Edited Target Geography → saved → reverted. |
| 3PL-34 | ⚠️ Pass with bug B-7 | **Delete Project** while 3PLs exist → "Can't delete this project — This project has 1 3PL(s) attached. Delete them first…". This rule isn't in `/help` (B-7). After deleting the 3PLs: "Delete this 3PL project for ZZQA New Client QA é&🚚? The client itself is kept…" → back to `/3pl-sourcing`; the project URL is 404; the client still exists. |
| 3PL-35 | ➡️ See X-01/X-02 | Layout is checked in the cross-cutting checkpoint. |
| 3PL-36 | ✅ Pass | Notes `<script>alert(1)</script> "quotes" & ampersand — é ü ñ 📦` plus a second line were saved and re-loaded byte for byte. Nothing ran. The 3PL name with "— Ñandú & 🚚" displays correctly. |
| 3PL-37 | ✅ Pass | Double-clicking **Add 3PL** created exactly one row (DB check). |

## 4. Forwarder Sourcing

| ID | Result | Evidence |
|---|---|---|
| FWD-01 | ⚠️ Pass with bug B-6 | My Projects · 10, All Experts · 11. Search by client ("ZZQA VND") and by route ("hamburg") works. **"creme" doesn't find "Crème"**, the same accent issue (`forwarder-project-list.tsx:36`). |
| FWD-02 | ✅ Pass (shared code) | Existing-client selection uses the same `resolveClientId` and picker as 3PL-03. Not separately repeated. |
| FWD-03 | ✅ Pass | New client "ZZQA Fwd New Client". The first submit had Duration 0 (browser check bypassed) → "Project duration must be a whole number of months from 1 to 120, or left empty." Origin City was kept. The retry with 24 created the project, with **one** client. Unlike 3PL (B-9), this action validates before inserting the client (`forwarder-sourcing/actions.ts:49-57`). |
| FWD-04 | ✅ Pass | 1 → "Duration 1 month"; 120 → "120 months"; 24 → "24 months"; blank → no Duration row. |
| FWD-05 | ✅ Pass | Browser: 0 "Value must be greater than or equal to 1.", 121 "…less than or equal to 120.", 1.5 "Please enter a valid value…". Server (bypassed): 0, 121, −3 and 1e1 each give the duration message; nothing saved. |
| FWD-06 | ✅ Pass (note) | A negative weight with the browser's `min=0` bypassed → "Some fields have values that aren't allowed. Check the form and try again." That's plain language but doesn't name the field. In normal use the browser's min check catches it first. |
| FWD-07 | ✅ Pass | The edit saved current and final terms, freight $3,000, invoice $40,000 USD, weight and 12 shipments a year, and redirected to the project. |
| FWD-08 | ⏭ Not tested | Needs AI extraction. Covered by `merge-project-fields.test.ts`, `merge-forwarder-fields.test.ts` and `merge-quote-fields.test.ts`. |
| FWD-09 | ⚠️ Pass with bug B-10 | Added "ZZQA Temp Fwd & Sons 🚢". **Email "not-an-email" was accepted and shown in the profile** (B-10). Editing the status to Shortlisted worked. Delete → "Delete ZZQA Temp Fwd & Sons 🚢? This also deletes all of its quotes." → gone. |
| FWD-10 | ✅ Pass | A USD DDP·Sea·FCL $3,100 quote saved and was ranked. |
| FWD-11 | ✅ Pass | Choosing EUR pre-fills 1.08 with "1 EUR = 1.08 USD · as of Oct 9, 2026 · Daily reference rate" and "Rate is locked when the quote is saved." Saved as `daily_feed`, 2026-10-09. €2,800 → $3,024.00 with "rate locked Oct 9, 2026". |
| FWD-12 | ✅ Pass | EUR with the rate cleared: the browser blocks the submit. Bypassed → "No exchange rate yet — enter the EUR to USD rate before saving." Nothing saved. |
| FWD-13 | ✅ Pass | The edit pre-fills 3100; changed to 2,900 → now Lowest and "Below Baseline $100.00 (3.3%)". Editing the EUR quote's notes kept rate 1.08, `daily_feed` and 2026-10-09 (DB check). |
| FWD-14 | ✅ Pass | Quote ⋯ menu (Edit / Estimate duties for this quote / Delete) → "Delete this quote (DDP · Sea · FCL)? This can't be undone." → removed. |
| FWD-15 | ✅ Pass | Pakkable: Bravo $3,000 is "Lowest Freight Cost (best quote)"; Ocean Alpha $3,200 and Charlie €3,000 × 1.1 = $3,300 show "—"; Delta $3,800 is "Highest Freight Cost". |
| FWD-16 | ✅ Pass | The 2 DDU quotes are listed below, greyed, with rank "Different terms" and vs Baseline "Not Comparable". They're never the Best quote. Exports call them "Not Comparable", as `/help` says. |
| FWD-17 | ✅ Pass | Different Terms: Best quote and Saving say "No comparable quote yet". All 3 quotes (FOB, DAP, DDP·LCL) are "Different terms". |
| FWD-18 | ✅ Pass | High Volume Air: the incomplete Jet Cargo quote has rank and vs Baseline "Not Comparable". The Withdrawn forwarder's quote is "Excluded from ranking" but still shows "Below Baseline $1,200.00 (28.6%)". Pipeline reads "3 quoted · 1 excluded". |
| FWD-19 | ✅ Pass | Two DDP quotes at $3,024.00 were both "Lowest Freight Cost (best quote)". After one edit, the two $3,024 quotes were both "Highest Freight Cost". |
| FWD-20 | ✅ Pass | VND and No Currency have one ranked quote each → "Only Comparable Quote". |
| FWD-21 | ✅ Pass | "$3,500.00 Freight Cost" / "$50,000.00 Commercial Invoice Value" / "DDP · Sea · FCL". |
| FWD-22 | ✅ Pass | "€40,000.00 Commercial Invoice Value". The profile says "Invoice value €40,000.00 (EUR)". |
| FWD-23 | ✅ Pass | "₫1,250,000,000 Commercial Invoice Value" (no decimals). |
| FWD-24 | ✅ Pass | "25,000.00 Commercial Invoice Value", with no symbol. |
| FWD-25 | ✅ Pass | "Commercial Invoice Value: Not set". |
| FWD-26 | ✅ Pass | No Quotes: "No current freight cost". There's no "$0". |
| FWD-27 | ✅ Pass | Tile "7.0% → 6.0%, Current → best quote, Freight ÷ invoice value". Column: 6.0 / 6.4 / 6.6 / 7.6% and DDU 5.4 / 5.8%, all equal to USD ÷ 50,000 to one decimal. Air: 3.5% → 3.3% (3,900 / 120,000 = 3.25%, rounded half-up). |
| FWD-28 | ✅ Pass | "Set invoice value to calculate"; the column shows "—". |
| FWD-29 | ✅ Pass | EUR, VND and No Currency → "Invoice must be in USD to calculate"; the column shows "—". |
| FWD-30 | ✅ Pass | No Quotes: Best quote, Saving and Ratio say "Awaiting quotes"; Quote Comparison says "Quotes will be compared here once forwarders have quoted." Different Terms shows "7.0% · Current · no comparable quote yet". |
| FWD-31 | ✅ Pass | Rounding Tie: tile "0.2% → 0.1%". Column: $1 → 0.1%, $2.99 → 0.1%, $3 → 0.2%. Saving "$2.00 (66.7%)"; $2.99 "$0.01 (0.3%)"; $3 "Equal to Baseline $0.00 (0.0%)". |
| FWD-32 | ✅ Pass | "SAVING PER SHIPMENT $500.00 (14.3%) Below Baseline". |
| FWD-33 | ✅ Pass | Sky Express page: "$156,000.00 / yr on 520 shipments" (= $300 × 520; shipments per year wins). "#1 of 2 quotes". Cost per kg uses chargeable weight 480: $3,900 → $8.13 / kg. Pakkable Expert CSV Annual Savings: $12,000 / $7,200 / $4,800 / −$7,200 (= 24 a year, from 2 a month × 12). |
| FWD-34 | ✅ Pass | The Expert CSV has a UTF-8 BOM and 3 sections. The project section adds Project Status. Forwarders add Contact Person / Position / Email / Phone / Status / Assessment / Next Action / Key Notes. Quotes add Annual Savings, Forwarder Status, Key Strength, Key Weakness / Risk, Important Assumption, Overall Assessment, Client Decision, Notes and Legacy Scenario Group ("DDP option" / "DDU option" from the seed). Freight Cost Ratio is included. **No duty estimates section was present, because none existed yet;** see TAR-35. |
| FWD-35 | ✅ Pass | The Client CSV leaves out exactly the columns `/help` lists. Air: the Withdrawn forwarder is absent from both Forwarders and Quote Comparison. The Expert CSV includes it as "Excluded from ranking". |
| FWD-36 | ✅ Pass | Client and Expert PDFs (4 pages) open and extract cleanly: Project Summary, Forwarders Considered, Quote Comparison. Same values as the CSV, including Exchange Rate "1 EUR = 1.1 USD", Rate Date and Rate Source "Entered manually". Freight Cost Ratio is in both; Annual Savings and Forwarder Status only in the Expert version. |
| FWD-37 | ✅ Pass | Client and Expert DOCX, the same as the PDFs. |
| FWD-38 | ✅ Pass | Charlie row: "1 EUR = 1.1 USD", "Oct 9, 2026", "Entered manually". |
| FWD-39 | ✅ Pass (note) | Café exports: an RFC-4180 parse gives consistent column counts per section (43 / 26 / 21). "ZZQA Café & Crème Ünïcödé 🚚 Ltd", "Fret Français & Fils 🚢" and "Fragile & handle with care — é ü ñ 🚚" are intact, and the long text is quoted correctly. The file name keeps the accents and emoji. Note: negative amounts are written as `'-$7,200.00`. That's the documented formula-injection guard in `export-csv.ts:4-14`; how Excel and Sheets show it wasn't checked (no spreadsheet app locally). |
| FWD-40 | ✅ Pass | expert2 exported Pakkable's Expert CSV. |
| FWD-41 | ✅ Pass | expert2 on Pakkable: "view only"; Export only; every ⋯ menu shows just "View". See also RLS-05 / RLS-06. |
| FWD-42 | ✅ Pass | The admin (target, after re-login, AUTH-06) saved an edit to expert2's forwarder project. |
| FWD-43 | ✅ Pass | Delete Project while a forwarder exists → "Can't delete this project — This project has 1 forwarder(s) attached…". After deleting the forwarder: "Delete this forwarder project for ZZQA Fwd New Client? The client itself is kept…" → back to the list; the URL is 404. |
| FWD-44 | ✅ Pass | Valid-until set to today → "Expires today"; yesterday → "Expired". Both quotes stay ranked; `/help` doesn't exclude expired quotes. |

## 5. Tariff Calculator

All runs used the local `ZZQA-local` release. At the start every duty program was "Pending review", so no additional duty was counted. For TAR-08 and TAR-13 to TAR-17 the tariff editor marked **Section 301 (China)** as reviewed. TAR-32 then edited one China row, which put the program back to pending. This is local reference data only, and it isn't reset by `qa:seed` (re-run `db reset` for a clean state).

| ID | Result | Evidence |
|---|---|---|
| TAR-01 | ✅ Pass | Lookup "syringes" → "1 line, in code order (not ranked)", with heading 9018 → 9018.31.00.40 and links to Browse heading and CBP rulings. Choosing it fills in "9018.31.00.40". |
| TAR-02 | ✅ Pass | "8703" → 2 lines (the heading and its child). |
| TAR-03 | ✅ Pass | "zzzqqq" → "No lines found. Tariff wording is formal ("footwear", not "shoes")…". |
| TAR-04 | ✅ Pass | 0101.21.00.10 → "0101.21.00.10 isn't in the current HTS (ZZQA local test release). Check the code." |
| TAR-05 | ✅ Pass | 87038000 → "HTS 8703.80.00.00 · AS ENTERED … Matched the only 10-digit line under the 8-digit code you entered." |
| TAR-06 | ✅ Pass | 6109.10.00.12, MX, $10,000, Sea → base 16.5% = $1,650.00; fees $47.14; total $1,697.14; "Special programs listed in the HTS (not applied)". |
| TAR-07 | ✅ Pass | 2204.21.50.60 (6.3¢/liter) without a quantity → "The rate for 2204.21.50.60 is charged per unit. Enter the quantity in liters." With 1,000 L → base $63.00. The EU forced-labour minimum-total row shows "could add 9.37%" (10% minimum − 0.63% base). |
| TAR-08 | ✅ Pass | 8703.80.00.00, CN, $10,000. Pending review: "EXCLUDES 3… Not included: Section 301 (China) — could add 100% (9903.91.03); pending expert review", total $297.14. Reviewed: a "+100% $10,000.00" line; total **$10,297.14** = $250 + $10,000 + $47.14; "EXCLUDES 2". |
| TAR-09 | ✅ Pass | 6109, VN → "Section 301 (forced labour) — could add 12.5% (9903.05.84); pending expert review". MX → 10% (9903.05.55). The conditional USMCA exemption (9903.05.94, `assume_condition=false`) is correctly not applied automatically. |
| TAR-10 | ✅ Pass | 7318.15.80.66, CN → "EXCLUDES 3 additional duty programs": 301 China 25% (9903.88.03), forced labour (exempt if 232 applies), 232 metals 50% (9903.82.02). N matches the "Not included" lines. |
| TAR-11 | ✅ Pass | 8471.30.01.00, MX → "EXCLUDES 1" (forced labour, MX), the only triggered program. |
| TAR-12 | ✅ Pass | CN origin: 8708 → "Section 232 (vehicles and parts)"; 9403 → "Section 232 (timber, lumber and derivatives)"; 8542 → "Section 232 (semiconductors)"; 3004 → "Section 232 (pharmaceuticals)"; 8806 → "Section 232 (unmanned aircraft systems)". Each shows "Not included", with no amount where the program isn't loaded. |
| TAR-13 | ✅ Pass | 8486.10.00.00, CN, today (reviewed): 301 List 2 +25% counted (total $2,547.14). The exclusion 9903.88.70 is article-specific, so it's listed as "may be exempt if the article is: … Verify before relying on it", and "A rate change for Section 301 (China) is scheduled for Nov 10, 2026: 9903.88.70 USTR product exclusion ends." |
| TAR-14 | ✅ Pass | The same on 2026-11-09: the exclusion notes and the scheduled-change notice still show. |
| TAR-15 | ✅ Pass | On 2026-11-10: the exclusion notes are gone, and +25% stays. |
| TAR-16 | ✅ Pass | 8716.39.00.90, CN, 2026-11-10: the confirmed List 3 **+25% stays counted** ($2,500). The unconfirmed row is shown only as "Could be +100% (9903.91.12) instead, not yet confirmed: intermodal chassis… unless the suspension is extended". The total is $2,857.14, not $10,357.14. |
| TAR-17 | ✅ Pass | The same line today: "A rate change for Section 301 (China) is scheduled for Nov 10, 2026: 9903.91.12 Intermodal chassis (from November 10, 2026): +100%, rate unconfirmed." Key dates says "(4 upcoming)". |
| TAR-18 | ✅ Pass | The date input has min 2026-10-08 and max 2027-10-10. Bypassed: 2026-10-07 → "…can't be earlier than Oct 8, 2026 (yesterday, UTC). Past entry dates aren't supported…"; 2027-10-11 → "…can't be later than Oct 10, 2027 (366 days from today, UTC)." 2027-10-10 is accepted. |
| TAR-19 | ✅ Pass | $2,500.00 → MPF (informal) $2.77, "Assumes an informal entry (value up to $2,500.00)"; HMF $3.13. |
| TAR-20 | ✅ Pass | $2,500.01 → "0.3464% of $2,500.01; Minimum applied" $34.58. |
| TAR-21 | ✅ Pass | $9,981.00 → $34.58, "Minimum applied" (calculated $34.57). |
| TAR-22 | ✅ Pass | $9,982.68 → $34.58 with no "Minimum applied" label. |
| TAR-23 | ✅ Pass | $50,000 → MPF $173.20; HMF $62.50. |
| TAR-24 | ✅ Pass | $193,666.28 → $670.86 with no label. |
| TAR-25 | ✅ Pass | $193,700 and $250,000 → $670.86 "Maximum applied". |
| TAR-26 | ✅ Pass | Sea $10,000 → HMF $12.50. Half-up rounding checked: $9,981 → $12.48; $193,700 → $242.13. |
| TAR-27 | ✅ Pass | Air $10,000 → MPF $34.64 only, no HMF line. |
| TAR-28 | ✅ Pass | Road $10,000 → the same as Air. |
| TAR-29 | ✅ Pass | EUR 10,000 → "1 EUR = 1.08 USD · as of Oct 9, 2026 · Daily reference rate"; "€10,000.00 → $10,800.00"; MPF $37.41, HMF $13.50; Frankfurter attribution shown. |
| TAR-30 | ✅ Pass | HTS "12" → "Enter an 8- or 10-digit HTS code (10 digits recommended), e.g. 7208.10.15.00."; "abcd.ef" → "Enter the HTS code as digits…"; value 0 or −1 → "Enter the customs value as a positive amount, e.g. 10000.00."; no origin → the browser's "Please select an item in the list." |
| TAR-31 | ✅ Pass | Saved "ZZQA est é&🚚 <i>x</i>" (shown literally) → `/tariff-calculator/estimates/<id>` "Locked Oct 9, 2026 by ZZQA Expert One · rates and dates as saved; not recalculated", with the same $10,297.14 and the review stamp "Section 301 (China): last reviewed Oct 9, 2026 by ZZQA Editor". |
| TAR-32 | ✅ Pass | No edit control; the only button is Delete estimate. The editor then edited the 9903.91.03 note → "Saved. The program is pending review until someone reviews it again." A new calculation for the same line gives **$297.14**, while the saved estimate still shows **$10,297.14**. The owner's PATCH on `duty_estimates` → "permission denied". |
| TAR-33 | ✅ Pass | "Delete this saved estimate? This cannot be undone." → back to the calculator; the estimate URL is now 404. |
| TAR-34 | ✅ Pass | expert2 can open expert1's estimate and sees it in "Saved estimates", with no buttons. An API DELETE by expert2 → 0 rows (RLS-09). |
| TAR-35 | ✅ Pass | Bravo quote ⋯ → "Estimate duties for this quote" → "Pre-filled from ZZQA Pakkable-style Co · ZZQA Bravo Freight Lines · DDP · Sea · FCL… tick Confirmed; nothing is calculated or saved until you do". It pre-fills value $50,000, origin CN, Sea, deduction $3,500 (the freight in the supplier's DDP invoice — by design, `forwarder-link.ts:276`) and entry 2026-11-06 (today + 28-day lead time). Result $47,881.71 = 2.5% × $46,500 + 100% × $46,500 + $219.21 fees. "Save to quote" → "Linked to …". The project page shows "Our estimate $47,881.71 … for entry Nov 6, 2026". Bravo is still $3,000 "Lowest Freight Cost", and the Saving and Ratio tiles are unchanged. The Expert CSV gets Duty Estimate columns plus a NOTES line "Duty estimates are informational: they don't affect rank or savings…"; the Client CSV has none. |
| TAR-36 | ✅ Pass | Editor: Duty data → Section 301 (China) → **Mark reviewed** → "Reviewed — Last reviewed Oct 9, 2026 by ZZQA Editor". The row note edit is described in TAR-32. The fees page lists HMF, formal and informal MPF with End-date buttons and "Add a fee row". The fees weren't changed, to keep the MPF results stable. |
| TAR-37 | ✅ Pass (matrix corrected) | Experts get **404** on `/tariff-calculator/duty-data` and see no "Duty data →" link. That's by design (`duty-data/page.tsx:19`), and `/help` says duty data is maintained by "Tariff editors and admins". The matrix expected a view-only page; it's corrected in this branch. |
| TAR-38 | ✅ Pass | Double-clicking **Save estimate** created one row (DB check). |

Other: two `customs_fees` history rows from 07:43 and 07:46 UTC are from the RLS probes (a no-op `notes` update by the editor, and the stale-token write in B-1). No fee values changed.

<!-- MODULE-SECTIONS-END -->

## Bugs, ranked by severity

No Critical bugs so far.

### High

#### B-1. A revoked tariff editor or demoted admin keeps database write access for up to an hour

**Steps to reproduce**
1. Sign in as `zzqa-target` while they are a tariff editor. Keep the session's access token (any API client, or the browser's `sb-` cookie).
2. As admin, click **Revoke tariff editor** on target. The same applies to **Demote to Logistics Expert**.
3. Using target's old token, PATCH `customs_fees` through PostgREST. (For a demoted admin: PATCH any other user's project.)

**Expected:** refused once the permission is removed.

**Actual:** `200`, 1 row updated. The JWT still carries `app_metadata.tariff_editor` (or `role: admin`) until it expires. That's 3600 s here, and Supabase's default. `is_tariff_editor()` and `is_admin()` read the JWT, not `auth.users`.

The app's own pages and server actions are safe: they re-check through `getUser()`, which is fresh. So the exposure is direct API use with a token the person already had.

**Suspected files:**
- `src/app/(authenticated)/admin/actions.ts` (`updateUserRole`, `updateTariffEditor`): neither signs the user out or invalidates their sessions.
- `is_admin()` / `is_tariff_editor()`: `supabase/migrations/20261002151158_tariff_editor_permission.sql`. `is_admin_user()`, which reads `auth.users`, already exists.

**Why High, not Critical:** it needs a session the person legitimately had, lasts at most one token lifetime, and fits the known "role change needs re-login" behaviour.

### Medium

#### B-2. Role and editor changes show up in the UI at once, but database permission only follows after re-login, and nobody is told

**Steps to reproduce**
1. Sign in as target (logistics expert).
2. As admin, **Promote to Admin** target.
3. In target's session, open `/admin`: it loads. Then open expert2's forwarder project, Edit, change Origin City and Save.

**Expected:** either the new rights work at once, or the user is told to sign in again.

**Actual:** the admin pages and the edit form open, but Save fails with "You don't have permission to make this change." After signing out and in, it works. The same split happens for **Make tariff editor**: Duty data opens immediately, but writes are refused until re-login. Neither the admin's buttons nor the affected user see any "sign in again" message.

**Suspected files:**
- `src/lib/auth/get-user-role.ts` and `src/lib/auth/get-tariff-permissions.ts`: fresh `getUser()`, while RLS uses the JWT.
- `src/app/(authenticated)/admin/role-action-button.tsx` and `tariff-editor-button.tsx`: no hint.

#### B-3. Any user can change their own display name, and so look like another user

**Steps to reproduce:** signed in as target, call `supabase.auth.updateUser({ data: { first_name: "ZZQA Admin" } })` from the browser console or any client using the public anon key.

**Expected:** only an admin can rename users (the Edit name dialog is admin-only).

**Actual:** it succeeds. The `handle_new_or_updated_user` trigger copies `first_name` into `profiles`. After that, two users are named "ZZQA Admin":
- in every **Reassign** dropdown on `/admin` (the admin can't tell them apart);
- in "Owned by … — view only";
- as estimate authors.

**Suspected files:** the profile sync trigger, which trusts `raw_user_meta_data ->> 'first_name'` (`supabase/migrations/20261002151158_tariff_editor_permission.sql`). The display name should live in `app_metadata` or `profiles`, written only by the admin action.

#### B-9. A failed Step 1 submit still creates the new client, and every retry is then blocked as a duplicate

**Steps to reproduce**
1. 3PL Sourcing → New Project → Start from Scratch → **New client** "ZZQA Orphan Test".
2. Enter Contract Period `0` (or any value the server rejects), with the browser check bypassed or any other server-side error. Click **Continue to Add 3PLs**.
3. Fix the value and submit again.

**Expected:** nothing is saved until the whole form is valid. The retry succeeds.

**Actual:**
- Step 2 shows "Contract period must be…", but the client row was already inserted.
- Step 3 fails with "A client named "ZZQA Orphan Test" already exists."
- The user has to work out that they need to switch to **Existing client**.
- If they give up, an orphan client with 0 projects is left behind. Only an admin can delete it.

**Suspected file:** `src/app/(authenticated)/3pl-sourcing/new/actions.ts:22` calls `resolveClientId()`, which inserts the client, *before* `parseProjectForm()` (line 27). The Forwarder action does it in the right order: parse first (`forwarder-sourcing/actions.ts:49`), then `resolveClientId` (line 54). Forwarder isn't affected (FWD-03).

### Low

#### B-4. Promote to Admin, Demote and Make or Revoke tariff editor apply on one click, with no confirmation

**Steps:** `/admin` → **Promote to Admin** on any user.

**Expected:** a confirmation like Delete has ("…? This cannot be undone.").

**Actual:** the change applies immediately. A misclick grants full admin.

**Suspected files:** `src/app/(authenticated)/admin/role-action-button.tsx`, `tariff-editor-button.tsx`.

#### B-5. A recommendation can reference a 3PL from a different project

**Steps:** as expert1, insert or update `recommendation` for your own project with `provider_id_1` = a 3PL from expert2's project (PostgREST, or a crafted `saveRecommendation` form post).

**Expected:** refused. The top three should belong to the project.

**Actual:** `201`, saved. The UI only offers the project's own Vetted 3PLs, so normal use is unaffected.

**Suspected files:** `src/app/(authenticated)/3pl-sourcing/projects/[id]/recommendation/actions.ts` and `src/lib/three-pl/parse-recommendation-form.ts` (no ownership check on the provider IDs). There's also no constraint in the `recommendation` table.

#### B-6. Project search is accent-sensitive

**Steps:** 3PL Sourcing → search "zzqa cafe".

**Expected:** finds "ZZQA Café & Crème Ünïcödé 🚚 Ltd", since users type without accents.

**Actual:** "No projects match your search." Only "café" matches.

**Also in Forwarder Sourcing:** "creme" doesn't find "Crème".

**Suspected files:** `src/app/(authenticated)/3pl-sourcing/dashboard-content.tsx:33` and `src/app/(authenticated)/forwarder-sourcing/forwarder-project-list.tsx:36` (plain `toLowerCase().includes`, no accent folding).

#### B-7. `/help` is missing two 3PL rules the app enforces

**Steps:** open `/help` → "How the Cost Comparison works" and the Permissions section.

**Expected:** every rule the app enforces is in `/help` (AGENTS.md).

**Actual:** two rules aren't mentioned:
- 3PLs with status **Unfit**, **Do not Contact** or **Withdrawn / No Response** are left out of the Cost Comparison entirely. A seeded Unfit 3PL at $100 doesn't appear.
- A 3PL project **can't be deleted while it has 3PLs**. `/help` states this rule only for forwarder projects.

**Suspected files:** `src/app/(authenticated)/help/workflow-sections.tsx`; rule sources `3pl-sourcing/projects/[id]/cost-comparison-panel.tsx:9` and the delete-project dialog.

#### B-8. The Recommendation "Saved" badge stays after the priority changes

**Steps:** Recommendation → Save Recommendation ("Saved" appears) → change Priority to Turnaround Time.

**Expected:** "Saved" disappears, or shows unsaved changes, until you save again.

**Actual:** "Saved" stays next to the button although the new priority isn't saved. A reload before saving would show the old priority.

**Suspected file:** `src/app/(authenticated)/3pl-sourcing/projects/[id]/recommendation/recommendation-form.tsx:121-127`.

#### B-10. Forwarder email isn't validated

**Steps:** Add Forwarder → Email "not-an-email" → save.

**Expected:** "Enter a valid email address." The 3PL form at least uses `type=email`, so the browser checks it there.

**Actual:** it's saved and shown under Forwarder Profile → Contact → Email.

**Suspected files:** `src/lib/forwarder/parse-forwarder-form.ts:36` (`email: text(320)`) and the forwarder form input (`type=text`). `parse-provider-form.ts:56` is also plain text, so only the browser check protects the 3PL form.

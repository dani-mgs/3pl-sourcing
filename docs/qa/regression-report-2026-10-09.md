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

## Summary

- **Ran 188 cases:** 185 pass (170 clean, 15 with a linked bug or note), 0 fail outright, 2 not tested (3PL-20 and FWD-08, AI extraction) and 1 deferred (3PL-35, covered by X-01/X-02). "Fail" means the feature doesn't work at all. Every bug below is attached to a case that otherwise works.
- **Fixed after this run:** B-1 and B-2, on branch `fix/role-checks-live` (see "Fix: B-1 and B-2"), B-3, on branch `fix/admin-only-display-names` (see "Fix: B-3"), and B-9, on branch `fix/3pl-intake-client-creation` (see "Fix: B-9"). The rest are open.
- **Bugs: 0 Critical, 1 High, 4 Medium, 7 Low.** No user could read or change another user's data, and no RLS gap or wrong duty, cost or ratio figure was found. Every money figure checked matched a hand calculation, including half-up rounding.
- **Fixed since 2026-09-28:**
  - Failure #1: deleting a 3PL named in a Recommendation.
  - Failure #3: the row-menu Delete.
  - Failure #4: non-owners reaching the 3PL wizard and edit forms.
- **Automated gates:** pgTAP 433/433. Vitest 1,106 passing in all 7 timezones. Lint clean. Typecheck clean after `next typegen`.

## Progress

| Checkpoint | Status |
|---|---|
| 1. Automated gates | Done |
| 2. Auth / Admin / RLS | Done |
| 3. 3PL Sourcing | Done |
| 4. Forwarder Sourcing | Done |
| 5. Tariff Calculator | Done |
| 6. Help + cross-cutting | Done |

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
| AUTH-06 | ⚠️ Pass with bug B-2 | Target was signed in, then the admin clicked **Promote to Admin**. On the next page load, target got `/admin` (200) and the edit form for expert2's forwarder project. Saving that form failed with "You don't have permission to make this change." After signing out and in, the same save worked. Nothing tells either user that a re-login is needed. **Fixed (B-1/B-2):** the matrix row now expects the change to apply without re-login. |
| AUTH-07 | ⚠️ Pass with bugs B-1, B-2 | **Grant:** after **Make tariff editor**, target's existing session opened Duty data (200) straight away, but writes would still fail until re-login (same split as AUTH-06). **Revoke:** a token issued before the revoke still updated `customs_fees` through the API (200, 1 row) — see B-1. **Fixed (B-1/B-2):** the matrix row now expects the change to apply without re-login. |
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
| ADM-07 | ✅ Pass | The Edit name dialog pre-fills the current name. An empty name gives "Name is required." Saving `ZZQA Target Renamed é&🚚 <b>x</b>` shows exactly that text, with the `<b>` escaped, in the user list and in every Reassign dropdown. **B-3 fix:** see ADM-17 for the self-rename case, and "Fix: B-3". |
| ADM-08 | ✅ Pass | "Enter a valid email address." / "Password must be at least 8 characters." / "A user with that email already exists." |
| ADM-09 | ✅ Pass | "User Created — zzqa-created@example.test was created successfully." The user is listed. |
| ADM-10 | ✅ Pass | "Delete zzqa-created@example.test? This cannot be undone." After confirming, the user is gone after a reload. |
| ADM-11 | ✅ Pass | Delete on expert1 opens "Can't delete this user — This user owns 14 project(s). Reassign ownership before deleting this user." The count is right (4 3PL + 10 forwarder). Nothing was deleted. |
| ADM-12 | ✅ Pass | The E2 3PL project was reassigned to expert1. expert1 then had edit controls; expert2 saw "view only" with no controls and got 404 on `/info/edit`. Reassigning it back restored expert2's edit controls. |
| ADM-13 | ✅ Pass | The same for the E2 forwarder project: expert1 could edit, and expert2 saw "view only" and got 404 on `/edit`. Reassigned back afterwards. |
| ADM-14 | ✅ Pass | Business model → "B2C & D2C ✓" saved and shown, then reverted. Renaming to "zzqa no quotes inc" gives "A client named "ZZQA No Quotes Inc" already exists." (case-insensitive). An empty name gives "Client name is required." |
| ADM-15 | ✅ Pass | Clients with projects show "Has 2 projects", and their Delete button is disabled. |
| ADM-16 | ✅ Pass | As expert1, I posted the real server-action IDs (from the dev manifest) for `updateUserRole`, `updateTariffEditor`, `deleteUser` and `reassignOwner`. Each returned "You don't have permission to make this change." and nothing changed. |
| ADM-17 | ✅ Pass (added with the B-3 fix) | Before the fix this was B-3. After it: the `user_metadata` rename is accepted by GoTrue but changes nothing, the `app_metadata` attempts get 403, and PostgREST gets 42501. Details in "Fix: B-3". |
| RLS-01 | ✅ Pass | expert2 opening expert1's 3PL project, Info, a 3PL and the Recommendation page gets 200 with "view only". Notes are disabled. The Recommendation page has no Save button: its priority selector stays enabled for re-ordering, and RLS refuses a direct insert (403). |
| RLS-02 | ✅ Pass | `/info/edit` → 404 |
| RLS-03 | ✅ Pass | `/providers/<id>/edit` and `/providers/new` → 404 |
| RLS-04 | ✅ Pass | `/3pl-sourcing/new/<id>`, `/providers` and `/review` → 404. This was Failure #4 on 2026-09-28; it's fixed. |
| RLS-05 | ✅ Pass | `/forwarder-sourcing/<id>/edit` → 404 |
| RLS-06 | ✅ Pass | `forwarders/new`, `forwarders/<id>/edit`, `quotes/new` and `quotes/<id>/edit` → 404. The project and forwarder pages are 200 "view only". |
| RLS-07 | ✅ Pass | API as expert2 against expert1's data: PATCH project, PATCH quote, DELETE quote and PATCH `owner_id` to self each changed 0 rows. INSERT forwarder → 403 RLS. Re-reading the rows with the service role confirmed nothing changed. |
| RLS-08 | ✅ Pass | PATCH a 3PL project or DELETE its 3PLs → 0 rows. INSERT a 3PL → 403. The owner can't hand their own project to someone else either (403 on `owner_id`). |
| RLS-09 | ✅ Pass | An API DELETE by expert2 on expert1's saved estimate → 0 rows; the estimate is still there. In the UI expert2 gets no Delete button (TAR-34). |
| RLS-10 | ✅ Pass | The owner's PATCH on their own `duty_estimates` row → "permission denied for table duty_estimates" (repeated in TAR-32). |
| RLS-11 | ✅ Pass | `duty_estimates` INSERT → "permission denied"; `rpc('save_duty_estimate')` → "permission denied for function". |
| RLS-12 | ✅ Pass | As expert1: PATCH `customs_fees` and `additional_duties` → 0 rows; INSERT `hts_lines` and `fx_rates` → permission denied. A profile role change, for self or others → permission denied. Clients: PATCH/DELETE → 0 rows. |
| RLS-13 | ✅ Pass | Anon SELECT on 15 tables (clients, forwarder_*, three_pl_*, rate_details, recommendation, duty_estimates, profiles, fx_rates, hts_lines, customs_fees, additional_duties, tariff_data_history) → 401 "permission denied". Anon INSERT into clients → 401. |
| RLS-14 | ✅ Pass | `/api/cron/fx-rates` and `/api/cron/hts-release` → 401, with no header and with a wrong Bearer token. |
| RLS-15 | ✅ Pass (UI part) | expert2 opening the calculator linked to expert1's Pakkable quote sees "Only the project's owner or an admin can create duty estimates for it. You can still use the calculator below without linking." |

Two more observations from the API probes:
- A user can write `role: "admin"` into their own `user_metadata`. This is harmless: roles are only ever read from `app_metadata` (`get-user-role.ts`, `get-tariff-permissions.ts`, `is_admin()`), and `user_metadata` is used only for `first_name`. *(Since the B-3 fix, `user_metadata` isn't used at all, and a Vitest guard bans it in `src/`.)*
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

## 6. Help and cross-cutting

| ID | Result | Evidence |
|---|---|---|
| HELP-01 | ✅ Pass | `/help` returns 200 with 28 sections (workflows, Cost Comparison, Recommendation, Tariff Calculator in 9 parts, Forwarder key concepts, AI upload, exchange rates, exports, permissions, FAQ). No console errors. |
| HELP-02 | ✅ Pass | The FAQ filters (All / Forwarder Sourcing / Tariff Calculator / General) switch the list. The 36 questions (11 forwarder, 25 tariff) expand, e.g. "Why does the Tariff Calculator ask for a quantity?". There's no FAQ search box, so the matrix case is browse-only. |
| HELP-03 | ✅ Pass | "Freight cost ratio … a quote's freight cost in USD divided by the project's invoice value, to one decimal; the tile shows current → best quote. Freight only … blank unless the invoice value is above zero and in USD. Quotes with different terms show it too." Matches FWD-27 to FWD-31. |
| HELP-04 | ⚠️ Pass with bug B-7 | The forwarder ranking text (current vs final terms, Different terms, Excluded, Lowest/Highest ties to the cent, Only Comparable Quote) matches FWD-15 to FWD-20. The 3PL Cost Comparison text matches 3PL-22 to 3PL-27, except that the Unfit / Do not Contact / Withdrawn exclusion is missing (B-7). |
| HELP-05 | ⚠️ Pass with bug B-7 | **Neither Contract Period (3PL) nor Project Duration (Forwarder) is mentioned anywhere** in `/help` or its source, including the 1–120 whole-month rule (B-7). |
| HELP-06 | ⚠️ Pass with bug B-7 | The Permissions text matches: owner / admin / view only, estimates deletable by their saver or an admin, nobody can change one, linked estimates only by the owner or an admin, tariff editors. It doesn't say that role or editor changes need a sign-out and sign-in (B-2 / B-7). **Fixed with B-2:** Permissions now says role and editor changes apply on the next page load or save, with no sign-out. |
| HELP-07 | ✅ Pass | MPF ("between its minimum and maximum… Values up to the informal-entry limit pay the flat informal fee"), HMF ("ocean shipments only") and the entry window ("from yesterday (UTC) to 366 days ahead … for a quote, today plus the quote's longest lead time") match TAR-18 to TAR-28 and TAR-35. |
| X-01 | ✅ Pass | 24 routes at 1280px (hub, both modules' lists / new / project / info / edit / 3PL / forwarder / quote pages, calculator, saved estimate, help, admin): nothing reaches past the viewport. |
| X-02 | ⚠️ Pass with bug B-11 | The page never scrolls sideways at 390px, **because `body` has `overflow-x: clip`**, which hides overflow instead. A second pass looking for elements past the viewport edge found content cut off on 6 pages (B-11). Wide tables (Quote Comparison, project lists) scroll inside their own container, as intended. |
| X-03 | ✅ Pass | At 390px the top bar collapses to "Modules ▾", a Help icon and the account avatar. The Modules menu (6 items with SOON tags) and the account menu ("Log Out") open fully inside the viewport. |
| X-04 | ⚠️ Pass (notes) | Every field-specific message is plain language (see 3PL-13, FWD-05, FWD-12, TAR-18, TAR-30, ADM-08). Two server-side fallbacks are generic, "Some fields have values that aren't allowed. Check the form and try again.": a negative weight with the browser check bypassed (FWD-06), and notes over 10,000 characters (B-12). No raw database or Zod text appeared anywhere. |
| X-05 | ✅ Pass | Target (owns nothing): "My Projects · 0 — No projects yet. Create your first one to get started." and "No forwarder projects yet. Create your first one to get started." Other plain empty states: "No duty estimates yet.", "Quotes will be compared here once forwarders have quoted.", "No quotes yet. Add one once this forwarder has quoted." |
| X-06 | ✅ Pass | Saving Info edit → `/info`; browser Back → the edit form showing the **saved** value. No resubmit prompt. |
| X-07 | ✅ Pass | Refreshing after a calculation gives no "resubmit form" dialog. The calculator reloads blank. |
| X-08 | ✅ Pass | Double-clicks on Add 3PL (3PL-37), Save estimate (TAR-38) and Add Forwarder each created exactly one row. |
| X-09 | ⚠️ Pass with bug B-12 | 3PL notes of 5,000 characters saved and reloaded at full length with no overflow. 10,005 characters → the generic message, and nothing saved (B-12). Long client and 3PL names wrap in headers and breadcrumbs at 390px. |
| X-10 | ✅ Pass | `<script>alert(1)</script>` in notes, `<b>x</b>` in a user name and `<i>x</i>` in an estimate label all display literally. No script ran and no dialog fired. |
| X-11 | ✅ Pass | No console errors on any of the 46 page loads in X-01/X-02. The only errors seen during the run were the browser's own 404 resource messages on deliberate 404 pages. |
| X-12 | ✅ Pass | Unknown UUIDs for a 3PL project, its Info, a forwarder project, a forwarder and an estimate → 404 "This page could not be found." inside the app shell. |
| X-13 | ✅ Pass | `/forwarder-sourcing/abc`, `/3pl-sourcing/projects/abc`, `/tariff-calculator/estimates/abc` and `/tariff-calculator/duty-data/not_a_program` → 404, never a 500. |
| X-14 | ✅ Pass | `/dashboard` → `/3pl-sourcing`; `/dashboard/new` → `/3pl-sourcing/new`; `/projects/<id>` → `/3pl-sourcing/projects/<id>/info`. |

## Not tested, and why

- **Document AI extraction** (3PL-20, FWD-08, and the upload-merge "never blanks a stored value" rule). There was no `ANTHROPIC_API_KEY`, by agreement. The merge rules are covered by `merge-client-intake.test.ts`, `merge-provider-fields.test.ts`, `merge-project-fields.test.ts`, `merge-forwarder-fields.test.ts` and `merge-quote-fields.test.ts` (all passing in GATE-02). The UI path was checked only up to "Document extraction isn't configured right now." (3PL-21).
- **Live USITC HTS import and the Frankfurter FX feed.** Both are external. I used a seeded `ZZQA-local` release and seeded `fx_rates` instead. Only the cron routes' auth rejection was tested (RLS-14).
- **How Excel and Google Sheets show the `'-$7,200.00` formula-guard cells** (FWD-39). No spreadsheet app was available locally.
- **Browsers other than Chromium, and real phones.** "390px" means Chromium emulation. Firefox and Safari number inputs accept letters, so the 3PL-16 behaviour there (letters silently becoming blank) is unverified.
- **Production-only behaviour:** Vercel cron schedules, deploys and rollback, and auth emails (confirmation and password reset).
- **Fee edits** (end-date and add a fee row). The fees page was viewed as editor but no fee row was changed, to keep the MPF boundary results comparable to the seeded fees.

<!-- MODULE-SECTIONS-END -->

## Bugs, ranked by severity

No Critical bugs so far.

### High

#### B-1. A revoked tariff editor or demoted admin keeps database write access for up to an hour

**Status: ✅ Fixed** on `fix/role-checks-live` (migration `20261009114024_role_checks_read_current_role`, pgTAP 22). See "Fix: B-1 and B-2".

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

**Status: ✅ Fixed** with B-1: the database now follows the current role, so no re-login is needed. Administration and Help say so.

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

**Status: ✅ Fixed** on `fix/admin-only-display-names` (migration `20261009121503_display_name_admin_only`, pgTAP 23). See "Fix: B-3".

**Steps to reproduce:** signed in as target, call `supabase.auth.updateUser({ data: { first_name: "ZZQA Admin" } })` from the browser console or any client using the public anon key.

**Expected:** only an admin can rename users (the Edit name dialog is admin-only).

**Actual:** it succeeds. The `handle_new_or_updated_user` trigger copies `first_name` into `profiles`. After that, two users are named "ZZQA Admin":
- in every **Reassign** dropdown on `/admin` (the admin can't tell them apart);
- in "Owned by … — view only";
- as estimate authors.

**Suspected files:** the profile sync trigger, which trusts `raw_user_meta_data ->> 'first_name'` (`supabase/migrations/20261002151158_tariff_editor_permission.sql`). The display name should live in `app_metadata` or `profiles`, written only by the admin action.

#### B-9. A failed Step 1 submit still creates the new client, and every retry is then blocked as a duplicate

**Status: ✅ Fixed** on `fix/3pl-intake-client-creation` (migration `20261009134233_three_pl_project_with_client`, pgTAP 25). See "Fix: B-9".

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

#### B-11. At 390px wide, buttons and inputs are cut off at the right edge

**Steps:** set the browser to 390 × 844 and open each page below.

**Expected:** everything fits, or wraps, inside the screen.

**Actual:** `body` has `overflow-x: clip`, so the page doesn't scroll, but these elements reach past the viewport and are cut off:

| Page | Element | Right edge |
|---|---|---|
| `/3pl-sourcing` | **New Project** button | 423px |
| `/forwarder-sourcing` | **New Project** button | 423px |
| 3PL wizard Step 1 (`/3pl-sourcing/new/manual`) | **Continue to Add 3PLs →** (reads "Continue to Ad…") | 468px |
| 3PL view | **Delete 3PL** | 400px |
| 3PL edit | Phone number input | 410px, runs past its card |
| `/admin` | Every **Reassign** button | 445px |

The cut-off buttons still respond where they're visible, but the labels are lost, and on a narrower phone they'd disappear.

**Suspected files:** the header/action rows in `src/app/(authenticated)/3pl-sourcing/dashboard-content.tsx`, `forwarder-sourcing/forwarder-project-list.tsx`, `3pl-sourcing/new/client-intake-form.tsx`, the 3PL provider view/edit pages, and `admin/reassign-owner-form.tsx` (flex rows without wrapping). `overflow-x: clip` on `body` (global CSS) hides the symptom from scroll-width checks.

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

#### B-7. `/help` is missing several rules the app enforces

**Steps:** read `/help` (and its FAQ) against what the app does.

**Expected:** every rule the app enforces is described (AGENTS.md: "When behavior described there changes, update /help in the same change").

**Actual:** five rules are missing:
1. 3PLs with status **Unfit**, **Do not Contact** or **Withdrawn / No Response** are left out of the 3PL Cost Comparison entirely (3PL-22).
2. A 3PL project **can't be deleted while it has 3PLs** (3PL-34). `/help` states this only for forwarder projects.
3. **Contract Period** (3PL, optional, whole months 1–120) isn't mentioned anywhere (HELP-05). It was added in `76bb1a7`.
4. **Project Duration** (Forwarder, optional, whole months 1–120) isn't mentioned (HELP-05).
5. A role or tariff-editor change **only takes full effect after signing out and in again** (B-2). This isn't mentioned in Permissions. **Resolved with B-2:** no re-login is needed any more, and Permissions says so. Items 1–4 are still open.

**Suspected files:** `src/app/(authenticated)/help/workflow-sections.tsx` and `concept-sections.tsx`. The rule sources are `3pl-sourcing/projects/[id]/cost-comparison-panel.tsx:9`, `src/lib/three-pl/contract-period.ts` and `src/lib/forwarder/parse-project-form.ts:56`.

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

#### B-12. Notes over 10,000 characters are refused without saying why

**Steps:** a 3PL project page → paste 10,005 characters into Notes → **Save Notes**.

**Expected:** "Notes can be up to 10,000 characters." Better still, a `maxLength` or counter on the field.

**Actual:** "Some fields have values that aren't allowed. Check the form and try again." Nothing is saved, and the textarea has no limit or counter.

**Suspected files:** `src/lib/three-pl/parse-project-form.ts` (`SUMMARY_NOTES_MAX = 10000`, generic error) and the notes textarea on the project page.

## Fix: B-1 and B-2

**Root cause:** `is_admin()` and `is_tariff_editor()` read the role from the session token (`auth.jwt() -> 'app_metadata'`), which is only rebuilt when a user signs in or the token refreshes. The app's pages read the current role through `getUser()`, so the two could disagree for up to an hour. No policy read the token directly, and `save_duty_estimate` already used `is_admin_user()`, which reads `auth.users`.

**Fix:** migration `20261009114024_role_checks_read_current_role` replaces both functions. They now read `auth.users.raw_app_meta_data` for `auth.uid()`, never `raw_user_meta_data`. They are `security definer`, stable and `search_path=''`, executable by `authenticated` and `service_role`, and revoked from `anon`. Every policy that calls them picks this up unchanged. Administration now shows "Saved. It takes effect on their next page load or save; they don't need to sign out." Help (Permissions) and docs/SECURITY.md say the same.

**Proof:** pgTAP 22 has 28 tests. Each one reuses the same old token while the role is changed in `auth.users`:
- A revoked editor and a demoted admin are refused at once.
- A promoted admin and a newly granted editor can write at once.
- Claims in the token, and `role` / `tariff_editor` in `user_metadata`, count for nothing.
- `authenticated` can't update `profiles.role` / `tariff_editor` or touch `auth.users`.
- A token for a deleted user is neither admin nor editor.

Against the old functions, 22 of the 28 fail, including every B-1 and B-2 repro.

**Performance:** `EXPLAIN ANALYZE` in a rolled-back transaction with 5,000 forwarder projects. Each figure is the median of 7 runs.

| Query | Before | After |
|---|---|---|
| Expert lists all 5,000 projects (read) | 0.29 ms | 0.30 ms |
| Expert tries to update 5,000 projects they don't own (0 rows) | 4.8 ms | 18.9 ms |
| Admin updates 5,000 projects they don't own | 58.9 ms | 93.5 ms |
| Owner updates their own 5,000 projects | 55.1 ms | 60.1 ms |
| Editor updates all ~18,900 `additional_duty_scope` rows (3 runs) | 740 ms | 757 ms |

- **Reads don't change:** no SELECT policy calls either function.
- **Writes:** the cost is about 3 µs per row a write checks. The app saves one row at a time, so the `(select is_admin())` policy rewrite isn't needed.
- **Editor updates:** `is_tariff_editor()` is evaluated once per query, and the history triggers dominate.

### Known limits

- **A deleted user's old token still passes ownership checks.** Policies like `owner_id = auth.uid()` take the user id from the token, so a deleted user's token still passes them on rows they owned, until it expires (up to an hour). Admin and editor rights end at once. Not fixed here.
- **✅ Resolved on `fix/signup-hardening` (TRUNCATE revoked; see "Hardening: role gate, signup and TRUNCATE").** **Found while fixing: `authenticated` has TRUNCATE on 9 tables.** Supabase's default grants leave `authenticated` with TRUNCATE on `clients`, `forwarder_projects`, `forwarder_quotes`, `forwarders`, `profiles`, `rate_details`, `recommendation`, `three_pl_projects` and `three_pl_providers`. It also keeps unused INSERT/DELETE on `profiles`, which RLS refuses. RLS doesn't apply to TRUNCATE. It isn't reachable today: PostgREST has no TRUNCATE, `authenticated` can't log in directly, and no RPC runs dynamic SQL. It is still worth revoking in a follow-up migration, as was done for `fx_rates`.

## Fix: B-3

**Root cause:** the display name was `raw_user_meta_data.first_name`. Any signed-in user can rewrite that about themselves with `auth.updateUser`, and the `profiles` sync trigger copied it from there. There was no self-rename UI; the hole was the auth API.

**Fix:** migration `20261009121503_display_name_admin_only` moves the name to `app_metadata.first_name`, like `role` and `tariff_editor`.
- **Who can write it:** only the service role, used by the admin rename and Create user actions after an admin check.
- **The trigger** now reads the name from `app_metadata` only, with `search_path=''`. `profiles.first_name` stays as its copy, so none of the ten places that read it changed.
- **The header** reads the name from `app_metadata`.
- **The seed script** writes it there.
- **Guard:** a Vitest test fails if code under `src/` mentions `user_metadata`.
- **Admin-only lists** show the email next to the name: Reassign shows "Name (email)", and Project Reassignment shows "Currently owned by Name · email". On phones the Reassign select is capped at 10rem so the longer labels don't widen the row; the open list shows them in full.
- **Help:** Administration now reads "manage users and their names".
- **Unchanged:** `user_metadata.first_name` is left in place, and nothing reads it.

**Proof**
- **pgTAP 23 (14 tests):**
  - A `user_metadata` rename, which is what `auth.updateUser` writes, and clearing that name, change nothing.
  - Writes to `profiles` (your own row, others', a new row) fail with 42501.
  - An admin rename changes the name and keeps role and tariff editor.
  - A role change or an email change keeps the name.
  - A name supplied only at signup is ignored.
  - Against the old trigger, 8 of the 14 fail, including the B-3 repro.
- **Real local auth API:**
  - `auth.updateUser({ data: { first_name: "ZZE2E Admin" } })` is accepted by GoTrue, but the profile and `getUser().app_metadata` keep the real name.
  - `auth.updateUser` with `app_metadata` → "Updating app_metadata requires admin privileges". A raw `PUT /auth/v1/user` with `app_metadata` → 403.
  - PostgREST PATCH and POST on `profiles` → 42501.
  - The admin `updateUserById({ app_metadata: { first_name } })` stored the new name and kept `role: logistics_expert` and `tariff_editor: true`. The user's own `getUser()` showed it without signing in again.
- **Browser (:3100):**
  - Reassign options read "ZZQA Admin (zzqa-admin@example.test)" and so on.
  - Owner lines on `/admin` read "Currently owned by ZZQA Expert One · zzqa-expert1@example.test".
  - Target was an editor and was renamed through Edit name. Their row then read "ZZQA Target Renamed · zzqa-target@example.test · logistics_expert · tariff editor", and target's header read "ZZQA Target Renamed" without signing in again.
  - A non-admin still sees "Owned by ZZQA Expert One — view only".
  - Create user with First Name "ZZQA Created" listed the user with that name.
  - At 390px the Reassign button ends at 308px; it was 445px in this run (B-11). The other B-11 items are still open.

**Upgrade test (existing names preserved).**

*Method:*
1. Reset to the previous migration.
2. Seed with the old code, which writes names to `user_metadata`.
3. Add five edge-case users.
4. Snapshot.
5. Run `npx supabase migration up`, then snapshot again.

*Result:* the profile name, role and editor flag are identical for all 10 users. The rest of `app_metadata`, all of `user_metadata`, and `auth.users.updated_at` are identical too. Afterwards, 0 profiles differ from `app_metadata.first_name`.

| User | Profile name, before | Profile name, after | `app_metadata.first_name`, after | Role / editor |
|---|---|---|---|---|
| zzqa-admin | ZZQA Admin | ZZQA Admin | ZZQA Admin | admin / no |
| zzqa-editor | ZZQA Editor | ZZQA Editor | ZZQA Editor | expert / yes |
| zzqa-expert1 | ZZQA Expert One | ZZQA Expert One | ZZQA Expert One | expert / no |
| zzqa-expert2 | ZZQA Expert Two | ZZQA Expert Two | ZZQA Expert Two | expert / no |
| zzqa-target | ZZQA Target | ZZQA Target | ZZQA Target | expert / no |
| zzupg-blank | "" (blank) | "" (blank) | "" (blank) | expert / no |
| zzupg-none | null | null | not set | expert / no |
| zzupg-other | Other | Other | Other | expert / yes |
| zzupg-padded | "  Padded Name  " | "  Padded Name  " | "  Padded Name  " | expert / no |
| zzupg-unicode | Zoë Trần 🚚 &lt;b&gt;x&lt;/b&gt; | Zoë Trần 🚚 &lt;b&gt;x&lt;/b&gt; | Zoë Trần 🚚 &lt;b&gt;x&lt;/b&gt; | expert / no |

### Known limits

- **A name someone chose for themselves is kept.** The backfill preserves current names exactly, including one a user may already have set for themselves through the old hole. With emails now shown in admin lists, it's worth one look through User & Role Management after deploy.
- **Deploy window:** between `db push` and the code deploy, the old admin rename writes `user_metadata`, which the trigger now ignores. A rename made in that window would appear to do nothing. `npx supabase db push && git push` keeps the window to minutes.

### Found while fixing

- **Low: local `config.toml` doesn't match production (signup enabled locally); production verified off on 2026-10-09.** **✅ Resolved on `fix/signup-hardening`:** `[auth] enable_signup = false` locally (see "Hardening: role gate, signup and TRUNCATE").
  - **Locally:** `supabase/config.toml` has `enable_signup = true` (`[auth]` and `[auth.email]`) with `enable_confirmations = false`. Anyone with the anon key could create an account and get a session at once; a probe confirmed this, and the probe user was deleted.
  - **The docs:** `docs/PROJECT_STATE.md` and `docs/CHANGELOG.md` say invite-only, no public signup.
  - **Production:** the owner checked the dashboard on 2026-10-09: "Allow new users to sign up" is off, and there are no unknown accounts. Production was never exposed.
  - **Suggested follow-up:** set `enable_signup = false` locally so local matches production. Not changed in this task.

## Hardening: role gate, signup and TRUNCATE

Done on `fix/signup-hardening` after the B-1/B-2/B-3 fixes. It resolves the two "Found while fixing" items above, and adds defence in depth.

**What changed** (migration `20261009124712_require_assigned_role`):
- **Role gate:** `has_app_role()` reads `app_metadata.role` live from `auth.users` and accepts only `admin` and `logistics_expert`. Every one of the 21 RLS tables has a RESTRICTIVE `for all` policy `using/with check ((select public.has_app_role()))`. An account without a role reads 0 rows and can't insert.
- **Service-role paths:** `save_duty_estimate` and `saveEstimate` refuse an account without a role.
- **HTS search:** `search_hts_lines` checks the role itself and runs as owner (see Performance).
- **Profiles:** a missing role now shows as `none`, not `logistics_expert`. Administration shows "no role" with **Make Logistics Expert**, and the hub shows "Your account doesn't have a role yet. Ask an admin."
- **Backfill:** every existing user without a valid role got `logistics_expert`.
- **Grants:** TRUNCATE is revoked from `authenticated` and `anon` on the 9 tables, along with the unused INSERT/DELETE on `profiles`.
- **Signup:** `config.toml` has `[auth] enable_signup = false`. `[auth.email] enable_signup` stays `true`, because the CLI uses that key to switch the whole email provider; with it `false`, sign-in failed with "Email logins are disabled".

**What brand-new users got before:** the database never assigned a role. A user without one was only *displayed* as `logistics_expert` (the `profiles` mirror's fallback) and treated as one by `getUserRole()`. No policy checked the role, so such an account had full expert read and write access. Admin Create user always set a role explicitly (required and validated against `USER_ROLES`); it still does.

**Proof**
- **pgTAP 24 (32 tests):**
  - The helpers' security settings and grants.
  - Every RLS table has the restrictive policy as a subselect.
  - With no role (missing, only in `user_metadata`, or `"superuser"`): 0 rows across all 21 tables, the views and the HTS search; no client or project inserts; no fee writes even with the editor flag set.
  - No TRUNCATE for anyone signed in, on any public table.
  - Experts, admins and editors are unaffected.
  - The mirror shows `none`, and `save_duty_estimate` refuses an account without a role.
  - Without the migration, the file fails at its first check.
- **Real local API:**
  - Anon `signUp` → `signup_disabled`, while admin `createUser` and email sign-in work.
  - expert1 sees 13 clients, 5 3PL projects, 11 forwarder projects, 24 quotes, 12 duty programs and 26 HTS lines. An account without a role sees 0 of each, gets 0 HTS search results, and gets 42501 creating a client.
  - After the admin assigns `logistics_expert`, the same token sees everything.
- **Browser:**
  - An account without a role sees the hub notice and empty project lists, and gets 404 on `/admin`. Admin shows it as "· no role" with Make Logistics Expert.
  - One click, and after a reload the notice is gone and 5 projects show.
  - expert1 is unchanged.
  - Create user still works with signup off, and gives the new user `logistics_expert`.

**Upgrade test:** seeded, then 4 users added without a valid role, then `npx supabase migration up`.

| User | Role before (app / profile) | Role after (app / profile) | Editor flag |
|---|---|---|---|
| zzqa-admin | admin / admin | admin / admin | no |
| zzqa-editor | logistics_expert / logistics_expert | unchanged | yes |
| zzqa-expert1, expert2, target | logistics_expert / logistics_expert | unchanged | no |
| zzupg-norole (no role key) | — / logistics_expert | logistics_expert / logistics_expert | no |
| zzupg-badrole (`"superuser"`) | superuser / superuser | logistics_expert / logistics_expert | no |
| zzupg-userrole (`"admin"` in user_metadata only) | — / logistics_expert | logistics_expert / logistics_expert | no |
| zzupg-nullrole (`role: null`, editor) | — / logistics_expert | logistics_expert / logistics_expert | yes (kept) |

Names and `auth.users.updated_at` are unchanged for all 9. The migration's `raise notice` reports the count: "gave 2 existing user(s) without a valid role the logistics_expert role" (from a rolled-back rerun of the backfill block with 2 such users).

**Performance:** `EXPLAIN ANALYZE` in a rolled-back transaction as an expert. Medians of 9 runs.

| Query | Before | After |
|---|---|---|
| Forwarder project list (5,000, with client) | 1.57 ms | 1.70 ms |
| Quotes for one project (1,000 through 50 forwarders) | 0.15 ms | 0.22 ms |
| Duty scope read (~18,900 rows) | 1.10 ms | 1.24 ms |
| HTS search "footwear rubber" (20,000 lines), invoker version | 3.6 ms | **1,700 ms** |
| HTS search, final (definer and role check) | 3.6 ms | 3.8 ms |
| 3PL list with a correlated provider count (2,000 × 3) | 243 ms | 263–306 ms |

- **The role check runs once per query.** Every plan shows it as an `InitPlan` with `loops=1`, even inside the correlated subquery, e.g. `Filter: ((InitPlan 1).col1 AND (client_id = …))`. For a user without a role: `actual rows=0`, `Rows Removed by Filter: 5000`.
- **HTS search:** the invoker version slowed down because `@@` isn't leakproof. Under a real RLS condition Postgres won't use it as an index condition, so the GIN index was skipped. The other queries only use leakproof operators.
- **3PL list:** that synthetic query is slow before and after because `three_pl_providers` has no plain index on `three_pl_project_id`, so each count scans all 6,000 providers. The role check adds a cheap `AND` to each of those 12 million row checks. The 3PL page loads providers in one query, not this one. An index on `three_pl_providers(three_pl_project_id)` is a separate, optional follow-up.

**Known limits**
- **A user without a role still sees the New Project button** and the forms, and saving fails with the generic permission error. In production no such user can exist: signup is off, admins set a role, and the backfill covers older accounts. The hub notice tells them why.
- **The allowed roles are listed in two places:** `has_app_role()` / `has_app_role_user()` in SQL, and `USER_ROLES` / `assignedRole()` in TypeScript. A Vitest check fails if they differ.

## Fix: B-9

**Root cause:** `saveClientIntake` (3PL New Project, Step 1) called `resolveClientId()` first. For "New client" that **inserts** the client. Only after that did it run `parseProjectForm()` and insert the project, so a submit that failed validation left the client behind, and every retry was refused as a duplicate. The forwarder action parses first. Both actions still had a smaller gap: the client and the project were two separate requests, so a project insert that failed for any other reason left the client behind too.

**Fix**
- **Order:** the 3PL action now checks sign-in, then parses the whole form, then checks the client fields *without saving*. `resolveClientId` is split: `checkNewClient` (name required, duplicate lookup) and the insert, which the forwarder flow still uses exactly as before.
- **One transaction:** a new client and its project are created by one function, `create_three_pl_project_with_client`. If the project fails, the client is rolled back with it.
  - **Security:** `security invoker` (RLS applies as for the two separate inserts, including the role gate), `search_path=''`, executable by `authenticated` only.
  - **Inputs:** `p_project` keys are allow-listed to the 16 form fields (22023 otherwise); `owner_id`, `status` and `client_id` are set inside.
  - **Why not create-then-clean-up:** only admins may delete clients, so a cleanup would need the service role or a new delete permission.
- **Existing client, and edits:** the plain insert or update, now after validation.
- **Duplicate names:** a name that already exists shows the same message, with the **Use existing client** button. Clients are never reused silently: they're shared across experts and modules, and without a `created_by` column there's no way to tell an orphan from someone's real client. If the name is taken between the check and the save, the function's 23505 gives the same answer.
- **Drift guard:** a Vitest check keeps the function's allow-list and its insert columns equal to `THREE_PL_PROJECT_FIELDS` from the form parser.

**Proof**
- **Vitest, the action (12 tests):**
  - A submit that fails validation creates nothing: no RPC and no insert, for contract period 0, a negative count, a decimal, or a blank name.
  - Success makes one RPC call carrying exactly the 16 fields, and never `owner_id` or `client_id`.
  - A draft redirects to the list. A retry after a failure works and creates the client once.
  - A taken name returns the message plus `existingClient`, with no RPC call; a 23505 from the function gives the same.
  - Any other error gives "An unexpected error occurred." and no redirect.
  - The existing-client and edit paths are unchanged.
  - Against the old action, 6 of the 12 fail, including the B-9 repro.
- **Vitest, the drift guard:** 2 tests.
- **pgTAP 25 (16 tests):**
  - The function's security settings and grants.
  - Client and project are created together: the name trimmed, owned by the caller, status Active.
  - A project that fails a check constraint (23514) or has a value of the wrong type (22P02) leaves **no client**, and the retry creates it once.
  - A taken name (any case or spacing) → 23505.
  - `owner_id`, `client_id` or `status` in `p_project` → 22023. A blank name or a non-object is refused too.
  - An account without a role is refused (42501), and no refused call left a client.
- **Browser (:3100, the original repro):**
  - New client "ZZQA Orphan Test" with Contract Period `0`, browser check bypassed: "Contract period must be a whole number of months from 1 to 120, or left empty." Fixing it to 36 and submitting again went straight to Add 3PLs. The database then had one "ZZQA Orphan Test" client with one project.
  - A second failed submit ("ZZQA Second Orphan", 121) left 0 clients.
  - A new client named "  zzqa existing client co " showed 'A client named "ZZQA Existing Client Co" already exists.' with **Use existing client**. One click switched the picker and kept the other fields, and Continue went to Add 3PLs. The database still has one such client, with the new project attached.

### Follow-ups

- **Forwarder: the same smaller gap (not changed).** `saveForwarderProject` validates first, so B-9 doesn't happen there. But its client insert and project insert are still two requests: if the project insert fails after the client was created (a database error, or a constraint the parser doesn't cover), the client is left behind. The same one-transaction pattern would close it; the forwarder form has about 3× the fields, so its function would need the same drift guard.
- **Orphan clients already in production from B-9:** an admin can delete them in Administration → Clients. Deleting a client that's in use is blocked, so that's safe.


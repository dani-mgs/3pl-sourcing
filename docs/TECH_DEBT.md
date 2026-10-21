# Technical Debt Log

Tracks known shortcuts, deferred work, and things that need revisiting later. Not a task list — only add an entry when something is deliberately left imperfect to move faster, not for routine bugs.

## Open

### Remove the live demo client
- **Added:** 2026-10-15
- **What:** "Brightline Apparel (Demo)" is on production: a 3PL and a forwarder project, published updates, a Market Report, requests and the portal user `brightline-demo@demo.example.test`. Testers can't delete it by hand, because published updates, reports and requests are immutable.
- **Why deferred:** The team is still getting familiar with the app on it.
- **Severity:** Low
- **Where:** Branch `chore/demo-seed-production` (`scripts/demo/*`, `docs/qa/live-demo.md`). To remove it:
  1. `git checkout chore/demo-seed-production`, then `nvm use`.
  2. `export DEMO_TARGET_URL=https://vnidvcskfsyfytdjbiji.supabase.co`, `export DEMO_OWNER_EMAIL=<staff email>`, then `read -rs DEMO_TARGET_SERVICE_KEY && export DEMO_TARGET_SERVICE_KEY` (a NEW `sb_secret_` key; legacy `eyJ` keys are refused).
  3. `npm run demo:remove`: a dry run. Read it; it lists anything testers added that the seed didn't create.
  4. `npm run demo:remove -- --apply --confirm-project=vnidvcskfsyfytdjbiji`, and type the ref at the prompt.
  5. `unset DEMO_TARGET_SERVICE_KEY`, then delete the key in Supabase (Project Settings → API Keys).

### 3PL recommendation page unreachable
- **Added:** 2026-10-13 (found while building the how-to guides)
- **What:** `/3pl-sourcing/projects/[id]/recommendation` exists but nothing links to it (link lost in 89807f2, 2026-09-08). /help says "no button yet". The saved recommendation's top three feed the shortlist logic (`share-page.tsx`, `threePlShortlistOf`) and the "Based on" prefill, so staff cannot set it from the UI.
- **Why deferred:** Found during a read-only investigation; the fix is a small UI change for its own commit.
- **Severity:** Medium (staff can't set what the client update's shortlist and "Based on" start from without typing the address)
- **Where:** Smallest fix: a Recommendation button in the 3PL project page header (`src/app/(authenticated)/3pl-sourcing/projects/[id]/page.tsx`) under the same `canWrite` condition as Share and Add 3PL, plus a /help update (`help/workflow-sections.tsx`) and a render test. No migration needed.

### No invite or password-reset emails for client users (no custom SMTP)
- **Added:** 2026-10-12 (client dashboard Phase 1)
- **What:** Production has no custom SMTP, so client users get no invite or password-reset emails. Staff create them with a one-time password shown once, which they pass on themselves; admins issue a new one-time password when a client loses theirs. There's no "forgot password" link, and email-change confirmations can't be delivered either.
- **Why deferred:** Decision on 2026-10-12 to skip SMTP for now. Supabase's default sender is rate-limited and only meant for team addresses.
- **Severity:** Medium (a manual step for every client user; the one-time password is seen by staff, which is why first sign-in forces a change and client writes are refused until then: docs/SECURITY.md)
- **Where:** `src/lib/client-users/create-client-user.ts`, `/client-access`; the fix is custom SMTP in Supabase Auth, then invite and reset emails instead of one-time passwords.

### No email when a client sends a request or Move replies
- **Added:** 2026-10-13 (client dashboard Phase 3a, for Phase 4)
- **What:** Staff only notice new client requests through the Requests badge, and clients only see Move's reply when they next open the portal. Nothing is emailed.
- **Why deferred:** No custom SMTP (decision 2026-10-12) and no email provider; Phase 4 in the plan.
- **Severity:** Medium (a request can sit unseen if nobody looks at the badge)
- **Where:** `client_requests`; the fix needs SMTP or an email provider (a new dependency, ask first), then a notification on insert and on reply.

### Introductions are a request, not a workflow; no price or fee anywhere
- **Added:** 2026-10-13 (client dashboard Phase 3b)
- **What:** "Request introduction" and "Unlock the Market Report" only create a request in the inbox. Staff make the introduction (and any plan change) by email and say so in a reply; nothing records whether an introduction happened, and no price or introduction fee is shown or charged (`[PRICE]` and `[INTRO FEE]` are still open). After Move answers, the database lets the client ask for the same letter again, but the portal shows "Introduction requested · Answered" and no button.
- **Why deferred:** Prices and fees are Move's to decide; enough for the first paid clients.
- **Severity:** Low
- **Where:** `submit_client_introduction()`, `submit_market_report_interest()` (`20261013061248_client_introductions.sql`), `src/lib/client-requests/text.ts`.

### The introduction reply guard also blocks the client's own cities
- **Added:** 2026-10-13 (client dashboard Phase 3b)
- **What:** A reply to an introduction is refused if it mentions the HQ city of any lettered partner, even when that city is also on the client's own route (a reply to Brightline mentioning "Los Angeles" is refused because Partner E is based there). Staff have to rephrase. The opposite gap: the guard matches words, so a paraphrase that avoids those exact words (a nickname, a misspelling) gets through; only the full-name check is in the database.
- **Why deferred:** Refusing too much is the safe side; the same rule as "Move's take".
- **Severity:** Low
- **Where:** `src/lib/client-requests/introduction-reply-guard.ts`, `reply_to_client_request()`.

### Client requests can't be closed, archived or followed up
- **Added:** 2026-10-13 (client dashboard Phase 3a)
- **What:** A request is sent, seen or answered, and stays in the inbox and the portal for good. There's one reply per request (an admin can withdraw it so the owner can reply again); a follow-up needs a new question. Deleting a project deletes its requests, approvals included.
- **Why deferred:** Enough for the first clients; closing, archiving, threads and keeping approvals after a project is deleted need their own design.
- **Severity:** Low
- **Where:** `client_requests` (`20261013024500_client_requests.sql`), `/client-requests`.

### A client who must still change their password can read their updates through the API
- **Added:** 2026-10-13 (client dashboard Phase 2b)
- **What:** While `must_change_password` is set, the proxy keeps the client on `/portal/change-password`, but `my_portal_updates()` and `my_market_reports()` don't check the flag, so the account can read its own client's published updates (and, on the paid plan, its latest Market Report) over the API with the one-time password.
- **Why deferred:** Read-only, and only that client's own published updates, which the staff member who knows the one-time password can already see. Client writes (approvals, requests) are refused while the flag is set (Phase 3a).
- **Severity:** Low
- **Where:** `my_portal_updates()` in `20261012234353_client_portal_read.sql`; `my_market_reports()` in `20261013015815_client_market_report.sql`.

### A paid client's whole report is in the page's data
- **Added:** 2026-10-13 (client dashboard Phase 2c)
- **What:** The Market Report's partner table switches between "All" and "Like-for-like only" in the browser, so every row of the client's own latest report is in the page's RSC data.
- **Why deferred:** It's that paid client's own report, already shown on the page; nothing else is sent. `qa:portal-scan` reads the RSC payload too.
- **Severity:** Low
- **Where:** `src/components/client-portal/report-partner-table.tsx`.

### "Move's take" guard is word-based and cautious
- **Added:** 2026-10-13 (client dashboard Phase 2c)
- **What:** The guard refuses any word of any forwarder name in the project (except a short list of generic words), so ordinary words that happen to be in a name ("Star", "Point", "Bridge") are refused too. It can't catch a description that identifies a partner without using its name, city, domain or contact ("the one that bought its rival last year").
- **Why deferred:** Refusing too much is the safe side; the error tells the expert which forwarder matched, and the form tells them to write as if the partner could read it.
- **Severity:** Low
- **Where:** `src/lib/client-updates/market-report-guard.ts`.

### Demo seed Market Reports are hand-written
- **Added:** 2026-10-13 (client dashboard Phase 2c)
- **What:** Like the demo updates, `demoMarketReports()` in `scripts/qa/demo-portal-data.mjs` is written out by hand, and the seed stores its letters directly instead of through `assign_partner_labels()`.
- **Why deferred:** No new dependencies. `demo-market-reports.test.ts` checks the schema, the letters, the guard on every take, and that the Brightline rows equal the builder's output; the seed fails if a forwarder's name or HQ drifted.
- **Severity:** Low
- **Where:** `scripts/qa/demo-portal-data.mjs`, `seedMarketReports()` in `scripts/qa/seed-demo.mjs`.

### Portal "today" is UTC
- **Added:** 2026-10-13 (client dashboard Phase 2a)
- **What:** Client updates use the server's UTC date as "today": an expired quote is decided on the UTC date at publish, and the portal's validity countdown, "today" line and expired labels use it too. In Manila (UTC+8), between 00:00 and 08:00 local time that date is still yesterday's, so a countdown can read one day more than local time would and a quote expiring that day still shows as valid. Date-only values (due dates, milestones, validity dates) are never shifted; timestamps ("Updated Oct 9") show in the viewer's own timezone.
- **Why deferred:** Accepted by Dani on 2026-10-12. Matches the staff pages, which already use the server's UTC date for rate expiry.
- **Severity:** Low
- **Where:** `src/lib/client-updates/dates.ts` (`utcToday`), `portal-text.ts` (`validityText`, `displayComparability`). Fix: a fixed business timezone (or the client's), passed in as "today".

### Demo seed client updates are hand-written
- **Added:** 2026-10-13 (client dashboard Phase 2a)
- **What:** `scripts/qa/demo-portal-data.mjs` writes the demo payloads out by hand, because the seed (plain Node) can't run the TypeScript builders without a new dependency. A change to the builders isn't reflected there automatically.
- **Why deferred:** No new dependencies. Vitest (`demo-portal-data.test.ts`) checks every payload against the strict schema and that the latest Brightline forwarder update equals the builder's output for the same data, so drift fails a test.
- **Severity:** Low
- **Where:** `scripts/qa/demo-portal-data.mjs`.

### No nudge when a project changes after its last published update
- **Added:** 2026-10-13 (client dashboard Phase 2a, planned for Phase 4)
- **What:** Clients see the figures as they were when an update was published. If quotes or rates change afterwards, nothing tells the expert the shared update is out of date.
- **Why deferred:** Plan section 15: "Last updated" on every client page for now; a staff-side nudge is Phase 4.
- **Severity:** Low
- **Where:** `/…/share` pages.

### Staff Server Actions make one extra Auth call for the role check
- **Added:** 2026-10-12 (client dashboard Phase 1)
- **What:** `requireStaff()` calls `auth.getUser()` (a round trip to Supabase Auth) before each staff Server Action, and most actions call `getUser()` again for their own logic.
- **Why deferred:** Correctness first: the role must be read live. Passing the user from the guard into each action would save the second call, but touches all 37 actions.
- **Severity:** Low
- **Where:** `src/lib/auth/require-staff.ts`


### Fee rollover reminder: non-editor wording is unreachable
- **What:** The fee rollover reminder's non-editor wording ("Ask a tariff editor to add them.") is built and tested but unreachable, because the Fees page and Duty data overview are closed to staff who cannot edit tariff data. If other staff should see the reminder, add a notice on the Tariff Calculator page.
- **Where:** `src/components/tariff/fee-rollover-notice.tsx`, `src/app/(authenticated)/tariff-calculator/duty-data/`

### HTS lookup names the polysilicon program before it starts
- **What:** The HTS lookup's "may apply" badges name Section 232 (polysilicon and derivatives) on 2804.61, 3818, 8541.42 and 8541.43 before 2026-12-04, because the lookup functions match programs by HTS prefix and have no entry date (`duty_programs.trigger_from` isn't read there). Estimates are unaffected: they name it only for entry on or after its start date.
- **Where:** `search_hts_lines()` (latest in `supabase/migrations/20261012131014_client_role_foundation.sql`), `src/lib/tariff/server-hts-lookup.ts`

### Email shown when a user has no display name
- **What:** Program history and the Saved estimates "By" column fall back to the user's email when there is no display name; consider a consistent "Staff" fallback, as on Duty data → Fees.
- **Where:** `src/lib/tariff/server-duty-admin.ts` (`names`), `src/lib/tariff/estimate-authors.ts` (`loadAuthorNames`)

### Tariff Calculator: scheduled-change warning knows only loaded rows; fees not covered
- **Added:** 2026-10-08
- **What:** The 45-day warning and the Key dates list come from dated `additional_duties` rows already in the database, so a change that hasn't been loaded isn't shown (nothing is shown when none is loaded). `customs_fees` rows (MPF/HMF, re-set each 1 October) are left out; the fiscal-year caveat covers them. On a saved estimate the warning is read live when the page opens ("known today"), so it can differ from what it would have said when saved.
- **Why deferred:** Needs a source of announced-but-unloaded changes, and a decision on storing the warning with the estimate (which would touch `save_duty_estimate`).
- **Severity:** Low
- **Where:** `src/lib/tariff/scheduled-changes.ts`, `key-dates.ts`

### Tariff Calculator: past entry dates not supported; base HTS rate is the current schedule only
- **Added:** 2026-10-07
- **What:** The expected entry date can be yesterday (UTC) at the earliest. Base HTS rates come from the current release only (earlier schedules aren't kept), and there is no history of Section 122 / IEEPA or other past additional duties, so an estimate can't be made for an entry that has already happened. For a later date the base rate is still today's schedule (the result says so). (Fees after 1 October: resolved, see below.)
- **Why deferred:** Needs keeping every HTS release and the dated history of past duties, with sources.
- **Severity:** Low (refused or caveated on the estimate; nothing is silently wrong)
- **Where:** `src/lib/tariff/entry-date.ts`, `save_duty_estimate()`
- **Reference validation (2026-10-19):** past-entry-date cases (e.g. before 2026-07-24 or 2026-04-06) can't run through `buildEstimate`; test them on `evaluateAdditionalDuties()` directly, with the rows and date passed in.

### Tariff duty data: gaps left for experts (not machine-readable or not decidable)
- **Added:** 2026-10-02
- **What:** The PR 2a seed took only what the primary sources state as text. Left out, for tariff editors to add from the sources: forced-labour note 52(b) product list and Annex II Part A (9903.05.86), (d) civil aircraft list (9903.05.88), (e) pharmaceutical-use list (9903.05.89), the (j)(1)-(13)(i) country product lists (9903.05.96-.99, 9903.06.02/.04/.06/.07/.09/.10/.12/.14/.16/.18/.20) — all published only as images in FR 2026-15181; donations and informational materials (9903.05.91/.92, 9903.05.08/.09), which an HTS code can't decide; the expired in-transit windows (9903.05.85, 9903.05.02). Legal status is seeded `in_force` for every row: the forced-labour action is challenged at the CIT (argued 2026-09-30, per press reports), but no primary source was loaded, so an editor should set `in_force_under_litigation` with a court source. Section 232 on vehicles, timber, semiconductors, pharmaceuticals, drones and polysilicon (from 2026-12-04), Nicaragua 301 and Canada 338 aren't loaded, so goods they may cover show "exempt if Section 232 applies" or a warning.
- **Why deferred:** Primary-source-only rule; image tables need manual transcription and a second check.
- **Severity:** Medium (estimates name the gap; nothing is silently zero)
- **Where:** Tariff Calculator → Duty data; `supabase/migrations/20261002151203_tariff_seed_origin_duties.sql` header
- **Reference validation (2026-10-19):** the reference workbook letters 9903.05.86 (b), .87 (c) and .89 (e) the same as our seed. The unloaded Section 232 programs are, in full: vehicles, parts, medium/heavy trucks, buses, timber, upholstered furniture, cabinets, semiconductors, pharmaceuticals and drones, including the scheduled 2027-01-01 wood and 2027-02-09 drone-component increases (Large).

### Tariff duty data: PR 2b open items for experts
- **Added:** 2026-10-03
- **What:** From `docs/tariff-data/2b-crosscheck.md`, seeded pending review and not resolved by guesswork: (1) 9903.82.22 — whether its 15% for the EU, Japan, Korea, Switzerland, Taiwan, UK, Argentina, Ecuador, El Salvador, Guatemala and Liechtenstein (note 16(c)(xi) derivatives) is a total or an added rate (seeded `unconfirmed`: the confirmed 9903.82.09 +25% is charged and the 15% is named on the line as "could be +15% instead, not yet confirmed"). (2) Russian aluminium 9903.85.67/.68: the heading text points to U.S. note 19 lists, CBP's June 2026 list and Proclamation 11021 clause (8) to the note 16 aluminium lists (seeded per the heading text). (3) 15 Russian lines are on both a note 19 aluminium list (200%) and a note 16 steel/copper list; the calculator applies the higher and names the other. (4) CBP's lists for motorcycle and equipment parts (9903.82.13, .23-.26) include 23 chapter 86 lines that note 16(g)/(k) don't (seeded per the note; caveats only). (5) Filing order between China 301 and forced-labour 301 (CBP says only "Section 301 first"). (6) 9903.91.12/.14 (chassis, cranes) take effect 2026-11-10 unless the suspension is extended (`unconfirmed`: named on the line, the confirmed +25% stays charged); the 9903.91.05 increase due 2027-06-23 has no stated rate (not loaded). (7) Legal status is `in_force` for every row. (8) Section 232 rows start 2026-06-08 (the lists as adjusted then); earlier entry dates aren't covered. (9) The timber 232 trigger (chapters 44, 9401, 9403) is broad, so forced-labour 301 on any 9403 furniture of China shows "exempt if Section 232 timber applies" until timber is loaded.
- **Why deferred:** Each needs an expert reading of the source or a decision; the seed reports them rather than picking an answer.
- **Severity:** Medium (each is named on the estimate; nothing is silently zero, and ties take the higher rate)
- **Where:** `docs/tariff-data/2b-crosscheck.md` ("Open items"); Tariff Calculator → Duty data
- **Reference validation (2026-10-19):** on (8), the reference workbook starts Annex I-A, I-B, III and the 85% US-melted rate on 2026-04-06; no effect while past entry dates are refused (Low). On (9), see A2 in "open items from the reference validation" below, which widens it to every unloaded Section 232 trigger.

### Tariff Calculator: open items from the reference validation (2026-10-19)
- **Added:** 2026-10-20
- **What:** Open items from comparing our seeded data and engine with the logistics team's reference workbook (china-us-tariff-stack.xlsx, Ms. Lara; kept outside the repo, not copied). Items already logged elsewhere are extended there instead: forced-labour lists 52(b)/(d)/(e) and the unloaded Section 232 programs ("gaps left for experts"), Section 232 start dates ("PR 2b open items" (8)), past entry dates ("past entry dates not supported").
- **Why deferred:** Each needs an expert decision, data entry from primary sources, or an answer from the workbook's author.
- **Severity:** Medium unless noted per item
- **Where:** Tariff Calculator → Duty data; `src/lib/tariff/additional-duties.ts`, `calculate.ts`
- **A. Expert decisions:**
  1. Every loaded duty program is still pending review, so estimates omit China 301, Section 232 and forced labour until it's done. (High for real use)
  2. Forced labour is withheld wherever an unloaded Section 232 program's broad trigger matches (chapters 29/30, 44, 9401/9403, 87, 8541/8542): charge it and flag, or withhold until those programs are loaded?
  3. Pharmaceuticals are in our forced-labour exclusion list (9903.05.90), but the workbook's scope doesn't list them: keep or remove?
  4. The 178 Section 301 product exclusions (expire 2026-11-09 unless extended) are named, never applied: add a confirmed "excluded article" tick?
  5. Annex III item with column 1 at 15% or more: we treat it as a Section 232 good (forced labour exempt); the workbook would charge forced labour. Which is right?
  6. Informal MPF at $2,500 or less: $2.77 (ours) vs the formal minimum $34.58 (workbook). Which applies to our users' entries?
  7. Annex I-C headings 9903.82.20–.22: we read .20/.21 as USMCA U.S.-content headings, the workbook as I-C at 25%. Same 25% for China; which reading is right?
  8. Forced labour on polysilicon goods: exempt under 9903.05.90 or charged? (The workbook marks it "Confirm"; we charge it.)
- **B. Data work (not code defects):**
  - Annex III and I-C move to Annex I-B rates on 2028-01-01: an editor should add the dated rows by about the end of 2026, since entry dates reach 366 days ahead. (Small; due by 2026-12-31)
  - Unloaded Section 232 programs, forced-labour lists 52(b)/(d)/(e) and Section 232 start dates: see the extended entries above.
- **C. Questions for Ms. Lara / workbook issues:**
  - The List 3 rate and the List 3 / List 4A effective-from dates are blank in the workbook (our data: 25%, 2019-05-10 and 2020-02-14).
  - Example rows use "illustrative" HTS codes; real 10-digit lines are needed for golden test cases.
  - Four-year-review "other groups" has no single rate (ours: 25%, 50% or 100% by heading).
  - Chassis and ship-to-shore cranes (from 2026-11-10) and informal MPF aren't in the workbook.
  - To keep forced labour on drones the workbook needs 232 = N, because its formula zeroes forced labour whenever 232 = Y.
  - The three "Confirm" rows on its Section 232 tab: buses, pharmaceuticals, polysilicon.
- **Test setup:**
  - The local HTS is a 26-line QA release, so solar, Annex III and "column 1 at 15% or more" scenarios can't run until the real release is imported locally.
  - Past entry dates can't run through `buildEstimate`; test the duty rules function directly (see "past entry dates not supported").
  - Golden-fixture test for the 9 matching reference cases is parked; see claude project doc tariff-validation-vs-reference-2026-10-19.

### HTS lookup paths start at "Chapter NN" without the chapter title
- **Added:** 2026-10-05
- **What:** The USITC export has no chapter titles, so HTS lookup paths read "Chapter 64 › 6402 …". Add titles only if they're generated from an official source (e.g. a USITC endpoint or the published HTS), never hand-typed.
- **Why deferred:** No official machine-readable source wired up yet; hand-typed titles would be unverified data.
- **Severity:** Low
- **Where:** `src/lib/tariff/hts-lookup.ts` (`buildPath`), `src/lib/tariff/hts-import.ts`

### Duty estimates aren't in the Expert PDF/DOCX
- **Added:** 2026-10-05
- **What:** Linked duty estimates (Tariff PR 3) are exported only in the Expert CSV (Forwarder Quoted Duties, Duty Estimate, As Of, Labels). The Expert PDF and DOCX quote tables don't have them: the tables are already wide and the labels need their own layout.
- **Why deferred:** Layout work in both renderers; the CSV covers the expert need for now.
- **Severity:** Low
- **Where:** `src/lib/forwarder/report-data.ts` (`dutyEstimateColumns`, `buildForwarderReport`), `render-report-pdf.ts`, `render-report-docx.ts`

### Tariff Calculator: rounding and single-line MPF are assumptions
- **Added:** 2026-10-02
- **What:** Each estimate line rounds once, half up to the cent, and the MPF minimum/maximum are applied to the one line as if it were the whole entry. CBP's exact per-line rounding in ACE wasn't confirmed against a primary source; differences should be cents, but a multi-line entry's MPF can differ a lot. Both are stated on every estimate and in /help. Updated 2026-10-21: Landed Cost uses entry-level fees (one MPF and one HMF on the sum of a scenario's entered values, split by value, `src/lib/landed-cost/entry-fees.ts`); the Tariff Calculator still computes MPF per line, by design, since it estimates one line. Both use the same `mpfFor` / `hmfFor` (`src/lib/tariff/customs-fees.ts`).
- **Why deferred:** v1 estimates one line; confirming ACE rounding needs a broker or CBP reference.
- **Severity:** Low
- **Where:** `src/lib/tariff/calculate.ts`, `src/lib/tariff/customs-fees.ts`, `src/lib/tariff/caveats.ts`

### Landed Cost: at least one scenario per workspace isn't a table constraint
- **Added:** 2026-10-21
- **What:** The database caps a workspace at 5 scenarios but can't require at least 1: the workspace row exists before its first scenario. Updated 2026-10-21 (Phase 2c-1): the app writes only through `create_landed_cost_workspace()` (the workspace and its first scenario in one transaction) and `save_landed_cost_draft()` (refuses a draft with no scenario), so the app can't leave a workspace without one. A direct `delete` on `landed_cost_scenarios` through the API by the owner or an admin still can; the calculation then shows no scenarios.
- **Why deferred:** Closing it needs a deferred constraint trigger on scenario deletes that ignores deletes cascading from the workspace; nothing in the app deletes scenarios directly.
- **Severity:** Low
- **Where:** `supabase/migrations/20261021013030_landed_cost_workspaces.sql`, `supabase/migrations/20261021020238_landed_cost_draft_functions.sql`

### Landed Cost: admins can't reassign workspace ownership
- **Added:** 2026-10-21
- **What:** A workspace's `owner_id` is set on insert and can't be updated by anyone (column grants), and its foreign key to `auth.users` is NO ACTION, as for projects and duty estimates. So admins can't reassign workspace ownership, and a departing user's workspaces must be deleted first before their account can be deleted.
- **Why deferred:** Not needed yet. Consider an admin reassign action later (a narrow function or admin-only update, with its own pgTAP case).
- **Severity:** Low
- **Where:** `supabase/migrations/20261021013030_landed_cost_workspaces.sql`

### Duty reads not paged: additional duties and Chapter 99 changes
- **Added:** 2026-10-21 (guard added the same day)
- **What:** `buildEstimate` (through `loadAdditionalDutyData`) and `loadSkuDuties` read `additional_duties` (about 125 rows) and the Chapter 99 changes since the earliest review in one request each, without paging. A read that returns as many rows as the API limit (`API_ROW_LIMIT`, 1,000, PostgREST's `max_rows`) now fails instead of using possibly cut-off data: the Tariff Calculator shows its generic error, a saved estimate's scheduled changes show none, and the batch returns `load_failed`. Below the limit nothing changes. The batch's other multi-row reads (HTS lines, scope lines) are paged and fail past 20 pages. Other screens that read these tables (Key dates, Duty data overview) aren't guarded.
- **Why deferred:** Paging them isn't needed while both tables are far below the limit; the guard turns a silent wrong answer into a visible error if they grow. If the hosted project's `max_rows` is ever changed, update `API_ROW_LIMIT`.
- **Severity:** Low
- **Where:** `src/lib/tariff/server-duty-data.ts` (`belowRowLimit`), `src/lib/landed-cost/server-duty-reads.ts`

### Landed Cost: delivered incoterms not supported yet
- **Added:** 2026-10-21
- **What:** Landed Cost Phase 1 accepts only EXW, FCA, FAS and FOB, where qty × unit price is the entered value. CFR, CIF, CPT, CIP, DAP, DPU, DDP and DDU include international freight (and, for CIF/CIP, insurance) in the price, which must come out of the customs value first; `computeScenarioTotals` refuses them with an error naming the incoterm.
- **Why deferred:** The deduction needs its own inputs and confirmation, as in linked estimates. Reuse `customsValueAfterDeduction` (`src/lib/tariff/forwarder-link.ts`) rather than writing a second rule.
- **Severity:** Medium
- **Where:** `src/lib/landed-cost/scenario-totals.ts` (`SUPPORTED_INCOTERMS`)

### Saved estimates can't prove the inputs were honest, or the duty amounts
- **Added:** 2026-10-06
- **What:** Direct inserts are revoked, so every saved estimate came from `saveEstimate`. A user can still choose any inputs (a low customs value, a different HTS code or origin); the estimate correctly calculates what they asked, with the inputs recorded in its snapshot when linked. `save_duty_estimate` re-checks the HTS line, rate, column, exchange rate, date, customs value and line totals, but not the duty amounts themselves (the rate parser and additional-duty rules live in TypeScript). A leaked service-role key or a bug in `saveEstimate` would be the way around it. Before client-facing use of estimates, show the inputs next to the numbers (the estimate page already does).
- **Why deferred:** Inherent to a calculator; recomputing duties in SQL would duplicate the engine and drift.
- **Severity:** Low
- **Where:** `src/lib/tariff/estimate-store.ts`, `supabase/migrations/20261006145721_save_duty_estimate_function.sql`, docs/SECURITY.md ("What this does not prevent")

### Service-role paths other than estimate saving use only the cron-length PGRST303 retry
- **Added:** 2026-10-06
- **What:** The service-role key (sb_secret_) intermittently answers PGRST303 (clock skew). The FX and HTS crons retry it for about 15 s (`retryOnPgrst303` defaults); the estimate save retries for about 3 s because a user is waiting (3 attempts, `ESTIMATE_RETRY_DELAYS_MS`). The /admin actions (`createAdminClient` in `admin/actions.ts` and `admin/page.tsx`) don't retry at all, so an unlucky admin action can fail with a generic error until it's retried by hand.
- **Why deferred:** Rare, and the admin actions are low-volume and easy to repeat.
- **Severity:** Low
- **Where:** `src/lib/supabase/pgrst303-retry.ts`, `src/lib/tariff/estimate-store.ts`, `src/app/(authenticated)/admin/actions.ts`

### PGRST303 is only retried in the cron jobs
- **Added:** 2026-10-01 (HTS import cron added 2026-10-02)
- **What:** PostgREST's PGRST303 (JWT claims couldn't be validated — with Supabase's signing keys, usually brief clock skew between the server and the API) is retried with backoff only around the FX and HTS import jobs' Supabase calls (`retryOnPgrst303` in `src/lib/supabase/pgrst303-retry.ts`). Every other server-side Supabase call (pages, Server Actions, exports, admin actions) would surface it as a one-off error ("An unexpected error occurred" or an empty page) that a reload fixes.
- **Why deferred:** It's only been seen on the unattended cron run, which has no user to retry and no second chance until the next day; interactive calls have a person who can reload. Wrapping every call is a wider change than the cron fix. Not to be "fixed" by switching back to the legacy JWT keys.
- **Severity:** Low
- **Where:** server-side `createClient()` / `createAdminClient()` callers; reuse `retryOnPgrst303` if it shows up there.

### No timeout around document parsing (pdf-parse / mammoth)
- **Added:** 2026-09-30 (security audit)
- **What:** `src/lib/document-extraction.ts` parses uploaded .pdf/.docx files with pdf-parse and mammoth with no time limit; a pathological file (deeply nested or malformed PDF, zip-bomb-style DOCX) could tie up a server instance until the platform's function timeout. The only upload bound today is the 10mb Server Action body limit in `next.config.ts`.
- **Why deferred:** Uploads come only from signed-in experts, and there's no sign of problem files in real use yet; adding a timeout/abort wrapper is worth doing once we see actual usage patterns.
- **Severity:** Medium
- **Where:** `src/lib/document-extraction.ts` (the `PDFParse` and `mammoth.extractRawText` calls)

### No rate limiting on AI-extraction Server Actions
- **Added:** 2026-09-30 (security audit)
- **What:** The five document-extraction Server Actions (3PL project intake, 3PL provider, forwarder project, forwarder, quote) each make a paid Anthropic API call per invocation with no per-user rate limit, so a buggy client loop or a misused account could run up cost. docs/SECURITY.md flags side-effecting actions for rate-limiting review.
- **Why deferred:** Only staff can reach these (since 2026-10-12, `requireStaff()` runs before any extraction; before that any signed-in account could, role or not), and usage volume is unknown; pick a limit once real usage gives a baseline.
- **Severity:** Medium
- **Where:** `extract-actions.ts` / `extract-provider-actions.ts` under `src/app/(authenticated)/3pl-sourcing/` and `src/app/(authenticated)/forwarder-sourcing/`

### 3PL cost comparison has no tie handling
- **Added:** 2026-10-01 (found while writing /help)
- **What:** `rankByTotalCost` sorts by total cost and numbers the result 1, 2, 3…, so 3PLs with equal totals get consecutive ranks in whatever order the sort leaves them, and one of them looks cheaper than the other. Forwarder ranking already shares a rank across ties.
- **Why deferred:** Changes ranking output on existing 3PL projects and the Recommendation's top three, so it needs its own decision and tests.
- **Severity:** Low
- **Where:** `src/lib/cost-comparison.ts` (`rankByTotalCost`)

### Forwarder ranking basis — open decision
- **Added:** 2026-09-28
- **What:** Cost Rank and savings use Freight Cost only, matching the original spreadsheet. Total Comparable Logistics Cost (freight + duties & taxes + other charges) may be the fairer basis against a DDP baseline, where duties are included.
- **Status:** Still pending Dani's decision; no code change until then.
- **Owner:** Dani. Revisit before Forwarder Sourcing goes live.
- **Where:** src/lib/forwarder/cost-comparison.ts

### New Project button clipped on project lists at phone width
- **Added:** 2026-10-01 (found while checking the 390px header)
- **What:** At 390px wide, the 3PL and Forwarder Sourcing project lists keep the search box and the New Project button on one row, so the button runs off the right edge and reads "New Proje". The page doesn't scroll sideways, so the button is cut off rather than reachable. The header above it is fine.
- **Why deferred:** Found during a docs-only tidy; the fix (letting the row wrap, or stacking search under the title on small screens) is a layout change for its own commit.
- **Severity:** Low
- **Where:** `src/app/(authenticated)/3pl-sourcing/dashboard-content.tsx`, `src/app/(authenticated)/forwarder-sourcing/forwarder-project-list.tsx`

### Inconsistent timestamp column naming across tables
- **Added:** 2026-08-19 (Week 2 review/cleanup)
- **What:** projects uses "date_created" while providers and documents/provider_documents use "created_at"/"uploaded_at" — inconsistent naming convention across the schema.
- **Why deferred:** Cosmetic at the schema level, doesn't affect functionality. Renaming now would touch working tables mid-build for no functional gain.
- **Severity:** Low

## Resolved

### Landed Cost: col::text reads not yet verified against a real API
- **Added:** 2026-10-21
- **What:** col::text reads not yet verified against a real API; verify in 2c-2 manual test before 2c-2 is deployed. `loadWorkspace` reads numeric columns as `col::text` (`src/lib/landed-cost/workspace-schema.ts`), tested only with the Supabase stub.
- **Severity:** Medium (a wrong key or format would fail every workspace load as invalid data)
- **Where:** `src/lib/landed-cost/workspace-schema.ts`, `src/lib/landed-cost/server-workspace.ts`
- **Resolved:** 2026-10-21. Verified in the Phase 2c-2 signed-in manual test against the real API: all 13 steps passed, and values such as FOB 1.2345 and carton kg 12.345 read back exactly after a browser reload.

### Landed Cost (Phase 2c): ask for the duty quantity only where the rate needs it
- **Added:** 2026-10-21
- **What:** `loadSkuDuties` returns `needs_quantity` (with the unit, e.g. kg or dozen) when a SKU's rate is per unit or compound and the request has no quantity in that unit. The UI must ask for the quantity in the rate's own unit (for kg, the goods' net weight) only for those SKUs, and must never fill it from the carton gross weight or count pieces as dozens.
- **Why deferred:** Phase 2a is the server library only; the workspace UI is Phase 2c. Updated 2026-10-21 (Phase 2c-1): `computeWorkspaceResult` reports such a SKU as `inputs_missing` with `duty_quantity` and the unit; asking for it is the 2c-2 page.
- **Severity:** Medium (a wrong quantity gives a wrong duty)
- **Where:** `src/lib/landed-cost/sku-duty.ts` (`quantityFor`), the Phase 2c SKU form
- **Resolved:** 2026-10-21 (Phase 2c-2). The workspace page shows the duty quantity input only for a SKU whose last result asked for it (or that has one saved), labelled in the rate's unit ("Net weight (kg)"), never filled from the carton weight (`sku-table.tsx`, `result-view.ts` `dutyQuantityLabel`).

### Landed Cost (Phase 2c): a saved draft's entry date can fall out of range
- **Added:** 2026-10-21
- **What:** Entry dates follow the estimate rule (yesterday to 366 days ahead, UTC). A draft saved with an entry date that has since passed gets `invalid_entry_date` from `loadSkuDuties` for the whole call, so the UI needs an "update the entry date" prompt instead of a generic error.
- **Why deferred:** No drafts or UI yet (Phase 2c). Updated 2026-10-21 (Phase 2c-1): drafts can be saved with any real date, and `computeWorkspaceResult` returns `entry_date_out_of_range` with the bounds before loading anything; the prompt is the 2c-2 page.
- **Severity:** Low
- **Where:** `src/lib/landed-cost/duty-request.ts` (`parseDutyRequest`), the Phase 2c workspace page
- **Resolved:** 2026-10-21 (Phase 2c-2). The result panel shows "Update the entry date" with the allowed range and a button that focuses the date field; the draft saves with any real date (`result-panel.tsx`).

### Landed Cost (Phase 2c): a scenario item for every SKU line isn't enforced
- **Added:** 2026-10-21
- **What:** `landed_cost_scenario_items` holds a scenario's inputs per SKU line, but nothing requires a row for every SKU line in every scenario, and every input in a row may still be empty. Phase 2c must report "inputs missing" for each SKU line whose item is absent or incomplete, and never skip the line, so a scenario's total is never silently missing a SKU.
- **Why deferred:** Drafts are saved before they're complete; the check belongs to the calculation (Phase 2c).
- **Severity:** Medium (a skipped line understates the landed cost)
- **Where:** `src/lib/landed-cost/server-workspace.ts` (`Scenario.items`), the Phase 2c calculation
- **Resolved:** 2026-10-21 (Phase 2c-1). `prepareScenario` (`src/lib/landed-cost/scenario-inputs.ts`) walks every SKU line for every scenario; a line with no item row is `inputs_missing` with every item field listed, and a scenario shows totals only when every line is complete (`server-compute.test.ts`).

### Customs fees used silently after 1 October
- **Added:** 2026-10-07 (part of "past entry dates not supported")
- **What:** Fee rows have no end date, so after the next 1 October the FY2027 MPF fees would still be used silently; the result only added a fiscal-year caveat.
- **Resolved:** 2026-10-16. Duty data → Fees and the overview remind tariff editors from 45 days before 1 October until the new MPF rows are entered, and an estimate whose entry date falls in a fiscal year without them is marked Incomplete with the reason (`src/lib/tariff/fee-rollover.ts`). No migration, no job.
- **Where:** `src/lib/tariff/fee-rollover.ts`, `server-estimate.ts`

### Phase 3: client approvals and requests must be refused while `must_change_password` is set
- **Added:** 2026-10-12 (client dashboard Phase 1, for Phase 3)
- **What:** Whoever creates a client user, or resets its password, sees the one-time password. Until the client has chosen their own password, an approval or request made "as the client" could really be that staff member. Phase 3 (client_requests, approvals) must refuse every client write while `app_metadata.must_change_password` is true. Enforce it in the database (the insert policy or function reads the flag live from `auth.users`), test it with pgTAP, and check it in the Server Action too.
- **Resolved:** 2026-10-13 (Phase 3a). `submit_client_request()` refuses while the flag is set (pgTAP 34), as do the Server Action and the proxy.
- **Severity:** High (if missed, a staff member could approve as a client)
- **Where:** docs/SECURITY.md, "Client users (external)"; future `client_requests` migration.

### Migrate `src/middleware.ts` to `proxy.ts` (Next.js 16)
- **Added:** 2026-10-01
- **What:** Next.js 16 deprecates the `middleware` file convention in favor of `proxy`; `src/middleware.ts` still works but should move via `npx @next/codemod middleware-to-proxy`. It carries the security headers (CSP, X-Frame-Options, etc., from `src/lib/supabase/middleware.ts`) and the Supabase session refresh, so afterward verify both: curl a page and check the response headers are all still present, and confirm a login persists across navigation and a reload.
- **Why deferred:** The deprecated file still works in Next.js 16, and because it's security- and auth-critical it should be migrated on its own with that verification, not bundled into another change.
- **Severity:** Medium
- **Where:** `src/middleware.ts`, `src/lib/supabase/middleware.ts`
- **Resolved:** 2026-10-01 — `npx @next/codemod middleware-to-proxy` renamed `src/middleware.ts` to `src/proxy.ts` and its export to `proxy`; the matcher and `src/lib/supabase/middleware.ts` (`updateSession`: session refresh, login redirect with the `/api/cron/` exemption, security headers) are unchanged. Verified on a production build (`next start`): every response, including the /login redirect and the cron 401, carries CSP (with the Supabase URL in `connect-src`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and HSTS; signed-out `/` and `/forwarder-sourcing` 307 to /login; `/api/cron/fx-rates` with no or a wrong secret returns 401 JSON, not a redirect; a login survived client-side navigation, a direct page load, and a reload with no console errors; the build no longer prints the middleware deprecation warning.

### Node 20 → 22 upgrade
- **Added:** 2026-10-01
- **What:** The project runs on Node 20 (`.nvmrc` is `20`; the Vercel project setting must match), and `@supabase/supabase-js` warns that Node 20 support is deprecated. Upgrade both `.nvmrc` and the Vercel project's Node.js version to 22, then re-run `npm test`, `tsc`, `lint`, and `build`, and smoke-test sign-in plus a 3PL and a Forwarder Sourcing project page.
- **Why deferred:** Nothing is broken yet; it's a runtime change for the whole app and deserves its own change and verification rather than riding along with feature work.
- **Severity:** Medium
- **Where:** `.nvmrc`, Vercel project settings (Node.js Version)
- **Resolved:** 2026-10-01 — `.nvmrc` is now `22` (package.json has no `engines` field). On Node 22.23.3: `npm ci` (lockfile unchanged, no dependency upgrades), `npm test` (432), `tsc`, `lint`, `build`, and `npm run test:db` (81) all pass, the same as on Node 20.20.2. The npm `EBADENGINE` warnings (supabase-js 2.112.3 needs Node ≥22, nanoid 6 needs ^22/^24) and supabase-js's Node 20 deprecation notice are gone, with no new warnings. Smoke-tested a Node 22 build against local Supabase: sign-in, login held across page loads, a 3PL and a Forwarder Sourcing project page, security headers present, no console errors. **Still to do by hand:** set the Vercel project's Node.js Version to 22.x before the next deploy.

### Header bar spacing feels tight
- **Added:** 2026-08-19 (Week 1, shared authenticated layout)
- **What:** The header bar ("3PL Sourcing" / "Log Out") has no vertical padding and both elements sit flush against the edges with little breathing room.
- **Why deferred:** Cosmetic only, doesn't block any functionality. Fixing now would be premature polish before more pages exist to calibrate spacing against.
- **Severity:** Low
- **Resolved:** 2026-10-01 — no longer applies after the nav redesign (5c3eb08). Checked at 1440×900 against a local build: the header is a fixed 64px navy bar with 32px side padding, brand and modules vertically centered on the left, Help and the avatar on the right with room to spare.

### "New Project" button overlaps header border
- **Added:** 2026-08-19 (Week 1, shared authenticated layout)
- **What:** The "New Project" button on the dashboard page visually overlaps the header's bottom border line slightly.
- **Why deferred:** Cosmetic alignment issue, doesn't block functionality.
- **Severity:** Low
- **Resolved:** 2026-10-01 — no longer applies. Checked at 1440×900 on the 3PL project list: the header ends at 64px and New Project starts at 104px, a 40px gap with no overlap.

### Admin Server Actions don't use Zod validation
- **Added:** 2026-09-30 (split out of the resolved 3PL Zod item)
- **What:** The admin actions (`reassignOwner`, `updateUserDisplayName`, `createUser`, `deleteUser`, `updateUserRole` in `admin/actions.ts`; `updateClient`, `deleteClient` in `admin/client-actions.ts`) take typed arguments but don't validate them with a schema, which docs/SECURITY.md requires for every Server Action.
- **Why deferred:** Out of scope for the 3PL-actions Zod change (2de070b); admin-only and already role-gated.
- **Severity:** Low
- **Resolved:** 2026-10-01 — each admin action now validates its arguments with a Zod schema in `src/lib/admin/parse-admin-input.ts` (uuid ids, role/table enums, length caps on names, email, password and business model), after the existing admin-role check. Failures return a friendly message and log the raw issues server-side; valid input behaves as before.

### Forwarder exports show capabilities as Yes / No
- **Added:** 2026-10-01 (found while writing /help)
- **What:** CSV/PDF/DOCX exports write each forwarder capability as "Yes" or "No" (`forwarderColumns` in `report-data.ts`), but a false capability means "not yet confirmed", not "no" — the app itself says "Not confirmed". A client reading "No" could wrongly conclude the forwarder can't do it. Client exports should say "Not confirmed" (or leave the cell blank) instead of "No".
- **Why deferred:** Export output change, separate from the help/nav work; /help notes the meaning in the meantime.
- **Severity:** Medium
- **Where:** `src/lib/forwarder/report-data.ts` (`forwarderColumns`)
- **Resolved:** 2026-10-01 — `forwarderColumns` now writes an unconfirmed capability as "Not confirmed" instead of "No" in Client and Expert CSV/PDF/DOCX, matching the app; /help's exports section updated.

### 3PL Server Actions don't use Zod validation
- **Added:** 2026-09-28 (Forwarder Sourcing Phase 3A)
- **What:** docs/SECURITY.md requires every Server Action to validate its input with a schema library (Zod). The new forwarder Server Actions do this (src/lib/forwarder/parse-project-form.ts), but the existing 3PL Sourcing Server Actions (project intake, 3PL add/edit, recommendation, notes, admin) still hand-validate field by field, predating that rule.
- **Why deferred:** Migrating 3PL's actions is a larger, separate change (many actions, many forms) and wasn't part of this task.
- **Resolved:** 2026-09-30 (commit 2de070b) — 3PL project, provider (incl. rate details), recommendation, and notes actions now validate via Zod schemas in `src/lib/three-pl/parse-*-form.ts`, bounded to the DB column limits. Admin actions weren't part of that change.

### Missing table GRANTs on new Supabase project
- **Added:** 2026-08-19 (Week 1, feature 4)
- **What:** RLS policies were created for the projects table, but the authenticated role had no baseline GRANT (select/insert/update/delete), causing "permission denied for table" errors despite correct RLS.
- **Why deferred:** Not deferred — this was a genuine gap caused by a recent Supabase platform default change (new projects no longer auto-grant table access). Discovered during manual testing, not known in advance.
- **Severity:** High (blocked all writes to the table)
- **Resolved:** 2026-08-19 — added explicit GRANT statement in Supabase SQL Editor for the authenticated role.

### Broken row-click links using unreliable <tr> positioning
- **Added:** 2026-08-19 (Week 1, feature 4)
- **What:** Project rows used an absolutely-positioned overlay Link (position: relative on <tr>, absolute inset-0 on the Link) intended to make the whole row clickable. Because <tr> doesn't reliably establish a CSS containing block for absolutely positioned descendants, the overlay expanded to cover the entire page instead of just its row, hijacking clicks on unrelated buttons ("New Project", "Log Out") above the table.
- **Why deferred:** Not deferred — introduced unintentionally when building the dashboard, found during manual testing.
- **Severity:** High (broke navigation and logout entirely)
- **Resolved:** 2026-08-19 — replaced overlay-link pattern with per-cell Links wrapping each <td>'s content.

---

Format for each entry when added:

### [Short title]
- **Added:** YYYY-MM-DD (Week N, feature X)
- **What:** one sentence describing the shortcut/gap
- **Why deferred:** one sentence — time pressure, POC scope, waiting on a decision, etc.
- **Severity:** Low / Medium / High (High = could block a future feature or cause a real bug; Low = cosmetic or convenience only)
- **Resolved:** (fill in when fixed — date + what changed)

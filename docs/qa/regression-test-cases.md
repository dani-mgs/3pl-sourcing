# Regression Test Cases

A reusable test-case matrix for a full regression of the hub (3PL Sourcing, Forwarder Sourcing, Tariff Calculator, Administration, Help). Each run's results go in a separate report, `docs/qa/regression-report-YYYY-MM-DD.md`, which refers to these IDs.

## How to run a regression

**Environment (local only, never production).**

1. Use Node 22 (`.nvmrc`).
2. Run `npx supabase start`, then `npx supabase db reset`, then `npm run qa:seed`. The seed prints a new random password for the test users. Keep it in your terminal and never commit it.
3. Run the app from a separate git worktree, so no `.env` file is loaded. Pass the local values from `npx supabase status -o env` on the command line:

   ```sh
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<local ANON_KEY> \
   SUPABASE_SERVICE_ROLE_KEY=<local SERVICE_ROLE_KEY> \
   CRON_SECRET=<any local value> \
   npx next dev -p 3100
   ```

   `ANTHROPIC_API_KEY` stays unset, so document AI extraction isn't available (see the cases marked *needs AI*).
4. Browser: Chromium (Playwright), at 1280px and 390px wide.

**Timezones for the automated suite.** Run the full Vitest suite once in each of these seven timezones, and reuse the same list in every regression:

| Timezone | Why |
|---|---|
| UTC | Reference |
| America/Los_Angeles | US West, DST |
| Asia/Ho_Chi_Minh | UTC+7, no DST |
| Pacific/Kiritimati | UTC+14, the earliest date on Earth |
| Pacific/Pago_Pago | UTC−11, the latest |
| Australia/Lord_Howe | 30-minute DST shift |
| Asia/Manila | UTC+8, where the users are |

```sh
for tz in UTC America/Los_Angeles Asia/Ho_Chi_Minh Pacific/Kiritimati Pacific/Pago_Pago Australia/Lord_Howe Asia/Manila; do TZ=$tz npx vitest run; done
```

**Test users** (created by `npm run qa:seed`, one shared random password per run):

| Account | Role | Used for |
|---|---|---|
| `zzqa-admin@example.test` | admin | Administration, reassigning owners, admin overrides |
| `zzqa-editor@example.test` | logistics_expert + tariff editor | Duty and fee data editing |
| `zzqa-expert1@example.test` | logistics_expert | Owner of most seeded projects |
| `zzqa-expert2@example.test` | logistics_expert | Second expert: read-only access and RLS-by-URL checks |
| `zzqa-target@example.test` | logistics_expert | The only account the admin tests rename, promote, demote or delete |

**Seeded data.** All names start with `ZZQA`. Every seed run deletes and re-creates them. Below, *E1* means owned by expert 1 and *E2* means owned by expert 2.

- **3PL projects**
  - **Existing Client Co, 36 months (E1):** Incumbent $1,000; Tie Alpha $800; Tie Bravo $800; Cheapest Charlie $700; No Cost Delta; Unfit Echo $100.
  - **Existing Client Co, blank contract period (E1)**
  - **Café & Crème Ünïcödé 🚚 Ltd, 1 month (E1):** one EUR 3PL and one USD 3PL.
  - **Very Long Client Name…, 120 months (E1):** long text throughout.
  - **Expert Two Client, 12 months (E2)**
- **Forwarder projects.** Unless stated, all are E1, with final terms DDP · Sea · FCL and a $50,000 USD invoice.

  | Project | Setup |
  |---|---|
  | Pakkable-style | 4 DDP quotes (one in EUR), 2 DDU; current freight cost $3,500 |
  | EUR Invoice | Invoice €40,000 |
  | VND Invoice | Invoice ₫1,250,000,000 |
  | No Currency Invoice | Invoice 25,000, no currency |
  | No Invoice | Invoice blank |
  | No Quotes | One forwarder, no quotes, no current freight cost |
  | Different Terms | Every quote is FOB, DAP or LCL |
  | High Volume Air | Air Freight, 520 shipments a year; one incomplete quote; one Withdrawn forwarder |
  | Rounding Tie | $2,000 invoice; current freight $3; quotes $3, $1 and $2.99 |
  | Café & Crème | Special characters and long text |
  | Expert Two Client | Owned by E2 |

- **Tariff.** HTS release `ZZQA-local` with these lines:

  | Line | General rate | Note |
  |---|---|---|
  | 8471.30.01.00 | Free | |
  | 6109.10.00.12 | 16.5% | Special programs |
  | 7318.15.80.66 | 8.5% | Ch. 73, metals |
  | 8703.80.00.00 | 2.5% | EV; China 301 at 100% |
  | 8708.29.50.60 | 2.5% | Ch. 87, vehicles |
  | 9018.31.00.40 | Free | Syringes; China 301 at 100% |
  | 8716.39.00.90 | 3.1% | China 301 **unconfirmed** from 2026-11-10 |
  | 8486.10.00.00 | Free | China 301 exclusion until 2026-11-09 |
  | 8542.31.00.01 | Free | Semiconductors |
  | 3004.90.92.90 | Free | Pharmaceuticals |
  | 9403.60.80.81 | Free | Timber |
  | 8806.21.00.00 | Free | Drones |
  | 2204.21.50.60 | 6.3¢/liter | Specific rate |

  The seed also adds `fx_rates` for today and yesterday.

**Case IDs** are stable. Add new cases at the end of a module. Retire a case by marking it *Retired*, never by renumbering.

## 1. Automated gates

| ID | Module | Scenario | Test data | Steps | Expected result |
|---|---|---|---|---|---|
| GATE-01 | Database | pgTAP after reset | Migrations only | `npx supabase db reset`, then `npm run test:db` | Every file is `ok`; `Result: PASS` |
| GATE-02 | Unit tests | Vitest in the 7 timezones | — | The loop above | Every run passes; the same count in every timezone; skips are only the documented ones |
| GATE-03 | Lint | ESLint | — | `npm run lint` | Exit 0, no errors |
| GATE-04 | Types | TypeScript | — | `npx next typegen && npx tsc --noEmit` | Exit 0 (a fresh checkout needs `next typegen` first for the `PageProps`/`LayoutProps` globals) |
| GATE-05 | Seed | Seed guard and re-run | Local stack | Run `npm run qa:seed` twice; then run it with a non-local `API_URL` (a fake `npx` first on PATH) | Both runs succeed with the same row counts; the non-local URL is refused with exit 1 |

## 2. Auth and roles

| ID | Module | Scenario | Test data | Steps | Expected result |
|---|---|---|---|---|---|
| AUTH-01 | Auth | Sign in | expert1 | Open `/login`, enter the email and password, submit | Lands on the hub home; the account menu shows the name |
| AUTH-02 | Auth | Wrong password | expert1 | Submit a wrong password | Plain-language error ("Invalid email or password."), email kept, password cleared |
| AUTH-03 | Auth | Empty fields | — | Submit an empty form | The browser's required-field message or a plain-language error; no crash |
| AUTH-04 | Auth | Sign out | expert1 | Account menu → Log Out | Back to `/login`; the Back button doesn't show protected data |
| AUTH-05 | Auth | Signed-out redirects | signed out | Open `/`, `/3pl-sourcing`, `/forwarder-sourcing`, `/tariff-calculator`, `/help`, `/admin`, and a project URL | Each one redirects to `/login` |
| AUTH-06 | Auth | Role change applies without re-login | admin, target | Target is signed in elsewhere. Admin promotes target to admin; target opens `/admin` and saves an edit to expert2's forwarder project **without signing out**. Then admin demotes target, and target (same session, and via the API with the old token) tries the same save | Promoted: `/admin` opens and the save works at once. Demoted: the next save is refused, in the app and through the API with the old token. Admin sees "Saved. It takes effect on their next page load or save; they don't need to sign out." (Changed 2026-10-09, B-1/B-2 fix; pgTAP 22) |
| AUTH-07 | Auth | Tariff editor change applies without re-login | admin, target | Admin makes target a tariff editor; target, still signed in, edits a fee or duty row. Admin revokes; target (same session, and via the API with the old token) tries again | Granted: the edit saves at once. Revoked: refused at once, including a PATCH to `customs_fees` with the old token (0 rows). Same "Saved…" line for the admin. (Changed 2026-10-09, B-1/B-2 fix; pgTAP 22) |
| AUTH-08 | Auth | Admin-only page blocked for expert | expert1 | Open `/admin` | 404 (not a 403 with data); no Administration item in the account menu |
| AUTH-09 | Auth | Admin-only page blocked for tariff editor | editor | Open `/admin` | 404 |
| AUTH-10 | Auth | Admin sees Administration | admin | Account menu | Administration link; `/admin` loads |
| AUTH-11 | Auth | Session persists across refresh | expert1 | Sign in, refresh | Still signed in |
| AUTH-12 | Auth | Hub home | expert1 | Open `/` | Module cards; the working modules link correctly; no console errors |

## 3. Administration (User & Role Management)

Only `zzqa-target` is renamed, promoted, demoted or deleted.

| ID | Module | Scenario | Test data | Steps | Expected result |
|---|---|---|---|---|---|
| ADM-01 | Admin | User list | admin | Open `/admin` | Lists all users with role and editor flag; the ZZQA users are visible |
| ADM-02 | Admin | Make tariff editor | admin, target | Click **Make tariff editor** on target | Success; the flag shows; profile `tariff_editor=true` |
| ADM-03 | Admin | Revoke tariff editor | admin, target | Revoke on target | The flag clears |
| ADM-04 | Admin | Promote to Admin | admin, target | Click **Promote to Admin** on target (confirm if asked) | Target shows as admin |
| ADM-05 | Admin | Demote admin | admin, target | Demote target back to expert | Target shows as logistics expert |
| ADM-06 | Admin | Admin can't demote or delete themselves | admin | Look for demote/delete on your own row | Not offered, or refused with a plain-language message |
| ADM-07 | Admin | Rename user | admin, target | Edit name → "ZZQA Target Renamed é&🚚" | Saved; shown everywhere the name appears |
| ADM-08 | Admin | Create user, validation | admin | Create with an invalid email, a short password, or a duplicate email | Plain-language errors; duplicate → "A user with that email already exists." |
| ADM-09 | Admin | Create user | admin | Create `zzqa-created@example.test` | Created; listed |
| ADM-10 | Admin | Delete user | admin | Delete `zzqa-created` (or target) with no owned projects | Removed from the list |
| ADM-11 | Admin | Delete user who owns projects | admin, expert1 | Look at Delete on expert1 (don't confirm) | Blocked or warned in plain language (no orphaned projects); **don't** delete expert1 |
| ADM-12 | Admin | Reassign 3PL project owner | admin | Reassign the E2 3PL project to expert1, then back | The owner changes; the new owner can edit; the old owner becomes view-only |
| ADM-13 | Admin | Reassign forwarder project owner | admin | The same for the E2 forwarder project | As ADM-12 |
| ADM-14 | Admin | Edit shared client | admin | Edit the ZZQA Existing Client Co business model, then revert | Saved; shown in both modules |
| ADM-15 | Admin | Delete client in use | admin | Delete ZZQA Existing Client Co | Blocked with a plain-language reason (it has projects) |
| ADM-16 | Admin | Admin server action as non-admin | expert1 | Call `updateUserRole`/`updateTariffEditor` from an expert session | Refused ("You don't have permission…"); no change |

## 4. RLS and access by URL

| ID | Module | Scenario | Test data | Steps | Expected result |
|---|---|---|---|---|---|
| RLS-01 | 3PL | Read others' project | expert2 → E1 3PL project | Open the URL | Allowed (everyone can read); "Owned by … — view only"; no edit, add or delete controls |
| RLS-02 | 3PL | Edit others' project info by URL | expert2 | Open `/3pl-sourcing/projects/<E1>/info/edit` | 404 or view-only; no working form |
| RLS-03 | 3PL | Edit or add others' 3PL by URL | expert2 | Open `/providers/<id>/edit` and `/providers/new` on the E1 project | 404 or view-only; a save is refused |
| RLS-04 | 3PL | Wizard steps on others' project | expert2 | Open `/3pl-sourcing/new/<E1 id>`, `/providers`, `/review` | 404 or view-only; no saves |
| RLS-05 | Forwarder | Edit others' project by URL | expert2 | Open `/forwarder-sourcing/<E1>/edit` | 404 or view-only |
| RLS-06 | Forwarder | Others' forwarder or quote edit by URL | expert2 | Open `/forwarders/<id>/edit`, `/forwarders/new`, `/quotes/new`, `/quotes/<id>/edit` | 404 or view-only; saves refused |
| RLS-07 | Forwarder | Write via the API as non-owner | expert2 JWT | PostgREST PATCH/DELETE on an E1 `forwarder_projects`/`forwarder_quotes` row | 0 rows changed |
| RLS-08 | 3PL | Write via the API as non-owner | expert2 JWT | PostgREST PATCH on an E1 `three_pl_projects` row | 0 rows changed |
| RLS-09 | Tariff | Delete others' estimate | expert2 | Delete an estimate saved by expert1 (UI or API) | Refused; the estimate stays |
| RLS-10 | Tariff | Change a saved estimate | owner JWT | PostgREST PATCH on `duty_estimates` | Refused (immutable) |
| RLS-11 | Tariff | Insert an estimate directly | expert1 JWT | PostgREST INSERT into `duty_estimates`, or RPC `save_duty_estimate` | Refused (only the service role through `saveEstimate`) |
| RLS-12 | Tariff | Duty data write as non-editor | expert1 JWT | PATCH `customs_fees` | Refused |
| RLS-13 | All | Anon access | anon key | GET `clients`, `forwarder_projects`, `three_pl_projects`, `duty_estimates`, `profiles` | No rows or permission denied |
| RLS-14 | Cron | Cron routes without a secret | — | GET `/api/cron/fx-rates` and `/api/cron/hts-release` with no or a wrong `Authorization` | 401; nothing written |
| RLS-15 | Tariff | Linked estimate on others' forwarder project | expert2 | Save an estimate linked to an E1 forwarder project or quote | Refused in plain language |

## 5. 3PL Sourcing

| ID | Module | Scenario | Test data | Steps | Expected result |
|---|---|---|---|---|---|
| 3PL-01 | List | Project list and search | expert1 | Open `/3pl-sourcing`; search "zzqa café" in a different case | Matches are found; an empty search shows a plain empty message; My Projects / All counts are right |
| 3PL-02 | New | New client, from scratch | expert1 | New → Start from Scratch → new client "ZZQA New Client QA" → Step 1 → Continue | The project is created; the client is created once |
| 3PL-03 | New | Existing client | expert1 | New → choose ZZQA Existing Client Co | No duplicate client; the project is linked to it |
| 3PL-04 | New | Duplicate client name typed | expert1 | Type "ZZQA Existing Client Co" as a new client | Offers the existing one or a plain duplicate message; no second client |
| 3PL-05 | Wizard | Step 2 Add 3PLs | new project | Add two 3PLs, Continue | Saved; shown in Step 3 |
| 3PL-06 | Wizard | Step 3 Verify Details | new project | Review → finish | Lands on the project page; all fields shown |
| 3PL-07 | Wizard | Back mid-flow | new project | Step 2 → browser Back → Step 1 | Step 1 data kept (a known earlier issue: unsaved Step 2 input is lost) |
| 3PL-08 | Wizard | Refresh mid-flow | new project | Refresh on Step 2 | No crash; saved data kept |
| 3PL-09 | Contract | Blank | Step 1 / edit | Leave Contract Period empty, save | Saved as blank; the header and details show no period, or "Not set" |
| 3PL-10 | Contract | 1 | edit | Enter 1 | Shows "1 month" |
| 3PL-11 | Contract | 36 | edit | Enter 36 | "36 months" |
| 3PL-12 | Contract | 120 | edit | Enter 120 | "120 months" |
| 3PL-13 | Contract | 0 | edit | Enter 0 | "Contract period must be a whole number of months from 1 to 120, or left empty."; nothing saved, other input kept |
| 3PL-14 | Contract | 121 | edit | Enter 121 | The same message |
| 3PL-15 | Contract | 1.5 | edit | Enter 1.5 | The same message (or the browser's step message) |
| 3PL-16 | Contract | Text | edit | Type "abc" or paste "12 months" | Refused with a plain message; never saved as 12 silently unless documented |
| 3PL-17 | Contract | Shown in header and details | 36-month project | Open the project, Info, header | The period is shown consistently |
| 3PL-18 | Info | Edit project info | E1 project | Edit info, change 3 fields, save | Saved; `updated` time refreshed; the form re-hydrates the new values |
| 3PL-19 | Info | Edit and cancel | E1 project | Change fields, Cancel | Nothing saved |
| 3PL-20 | Upload | Document merge doesn't blank stored values | *needs AI* | Upload a document on edit | **Not testable locally**: see `merge-client-intake.test.ts`, `merge-provider-fields.test.ts` |
| 3PL-21 | Upload | Wrong file type | — | Upload a `.csv` | Refused with a friendly message, before any AI call |
| 3PL-22 | Ranking | Cost Comparison ranks by total | Existing Client Co 36m | Open the project | Charlie $700 rank 1; Tie Alpha and Tie Bravo $800 ranks 2 and 3 (consecutive); Incumbent $1,000; Unfit Echo $100 ranked or excluded as `/help` says; No Cost Delta unranked |
| 3PL-23 | Ranking | Savings vs incumbent | the same | Read the savings | Each saving = $1,000 − total; % = saving ÷ $1,000; incumbent marked Baseline |
| 3PL-24 | Ranking | Mixed currencies | Café & Crème | Open | Nothing ranked; "Currency Mismatch"; costs never converted |
| 3PL-25 | Ranking | No incumbent | blank-contract project | Open | Baseline N/A; ranks only |
| 3PL-26 | Ranking | Incumbent with no costs → Pending | new project | Tick Incumbent on a 3PL with no costs | Baseline Pending (amber note) |
| 3PL-27 | Recommendation | Vetted only, Cost Savings order | Existing Client Co | Open Recommendation | Only Tie Alpha and Tie Bravo (Vetted); ordered by total; tie order stable; saving keeps the top three |
| 3PL-28 | Recommendation | Other priorities | the same | Quality of Service / Turnaround | Listed in the order added, with the disclaimer |
| 3PL-29 | 3PL | Add, edit, delete 3PL | E1 project | Add a 3PL with 9 costs + Rate Details; edit; delete | Total = sum of the 9; rate details saved; delete works, including for a 3PL named in a Recommendation |
| 3PL-30 | 3PL | Incumbent conflict | Existing Client Co | Tick Incumbent on a second 3PL | Plain conflict message; typed data kept |
| 3PL-31 | Ownership | Owner edits | expert1 | Edit an E1 project | Allowed |
| 3PL-32 | Ownership | Other expert read-only | expert2 on E1 | Open the project and a 3PL | "Owned by … — view only"; no controls; Notes disabled |
| 3PL-33 | Ownership | Admin edits any project | admin on E2 | Edit info and a 3PL | Allowed |
| 3PL-34 | Delete | Delete project | E1 throwaway project | Delete | Deleted; the client is kept |
| 3PL-35 | Long text | Very long names and text | Long-name project | Open the list, project and 3PL at 1280px and 390px | Wraps or truncates; no horizontal overflow |
| 3PL-36 | Special chars | Accents, &, emoji | Café & Crème | Open; edit and save the notes with `é & 🚚` | Saved and shown exactly; no HTML entities shown |
| 3PL-37 | Double submit | Double-click Save | edit info | Double-click Save | One save; no duplicate rows or errors |

## 6. Forwarder Sourcing

| ID | Module | Scenario | Test data | Steps | Expected result |
|---|---|---|---|---|---|
| FWD-01 | List | Project list | expert1 | Open `/forwarder-sourcing` | ZZQA projects listed; search and filters work; empty state when nothing matches |
| FWD-02 | Intake | New project, existing client | expert1 | New → from scratch → ZZQA Existing Client Co → fill route, cargo, terms → save | Created; client reused |
| FWD-03 | Intake | New project, new client | expert1 | The same with "ZZQA Fwd New Client" | Client created once |
| FWD-04 | Duration | Project Duration valid | edit | 1, 24, 120, blank | Saved and shown ("24 months"); blank shows nothing or "Not set" |
| FWD-05 | Duration | Project Duration invalid | edit | 0, 121, 1.5, "abc" | Plain-language error; nothing saved; input kept |
| FWD-06 | Intake | Required and invalid fields | new | Submit with missing required fields or a negative weight | Plain messages per field; input kept |
| FWD-07 | Intake | Edit project | Pakkable | Edit 3 fields, save | Saved; re-hydrated |
| FWD-08 | Upload | Upload intake | *needs AI* | — | **Not testable locally**: see `merge-project-fields.test.ts`, `merge-forwarder-fields.test.ts`, `merge-quote-fields.test.ts` |
| FWD-09 | Forwarder | Add, edit, delete forwarder | Pakkable | Add "ZZQA Temp Fwd", edit status, delete | Each step works; delete asks for confirmation |
| FWD-10 | Quote | Add quote (USD) | Temp forwarder | Add a DDP · Sea · FCL $3,100 quote | Saved; appears in Quote Comparison and is ranked |
| FWD-11 | Quote | Add quote (EUR, daily rate) | Temp forwarder | Currency EUR | The rate pre-fills from the daily feed (seeded) with source and date; saving locks it |
| FWD-12 | Quote | EUR with no rate | — | Clear the rate, save | Refused: "can't be saved" without a rate; never 1 |
| FWD-13 | Quote | Edit quote | a Pakkable quote | Change the amount, save | Saved; rank updates; the rate stays locked |
| FWD-14 | Quote | Delete quote | Temp quote | Delete | Removed; ranks recompute |
| FWD-15 | Ranking | Same terms ranked | Pakkable | Open Quote Comparison | 4 DDP quotes ranked: Bravo $3,000 Lowest; Alpha $3,200; Charlie €3,000×1.1 = $3,300; Delta $3,800 Highest; ranks in between "—" |
| FWD-16 | Ranking | Different terms greyed | Pakkable | the same | 2 DDU quotes below, greyed, rank "Different terms"; never Best quote |
| FWD-17 | Ranking | All quotes on different terms | Different Terms | Open | No ranked quotes; Best quote shows an empty state; all greyed "Different terms" |
| FWD-18 | Ranking | Incomplete quote and excluded forwarder | High Volume Air | Open | Incomplete quote is Not Comparable/unranked; Withdrawn forwarder's quote "Excluded from ranking", still shows vs Baseline |
| FWD-19 | Ranking | Tie for cheapest | Temp | Two DDP quotes at the same amount | Both "Lowest Freight Cost" |
| FWD-20 | Ranking | Only one ranked | EUR Invoice → delete one quote (or VND) | Open | "Only Comparable Quote" |
| FWD-21 | Current | USD invoice | Pakkable | Current tile | "$3,500.00 Freight Cost" and "$50,000.00 Commercial Invoice Value" |
| FWD-22 | Current | EUR invoice | EUR Invoice | Current tile | "€40,000.00 Commercial Invoice Value" |
| FWD-23 | Current | VND invoice | VND Invoice | Current tile | "₫1,250,000,000 Commercial Invoice Value" (no decimals or as `formatCurrency` gives) |
| FWD-24 | Current | No currency | No Currency Invoice | Current tile | "25,000.00 Commercial Invoice Value" (no symbol) |
| FWD-25 | Current | Blank invoice | No Invoice | Current tile | "Commercial Invoice Value: Not set" |
| FWD-26 | Current | No freight cost | No Quotes | Current tile | No freight line, or an empty state; no "$0" |
| FWD-27 | Ratio | Tile and column (USD) | Pakkable | Freight Cost Ratio tile and column | Tile "7.0% → 6.0%" (current $3,500 / best $3,000 on $50,000); each quote's column = its USD ÷ 50,000 to 1 decimal; DDU quotes show it too |
| FWD-28 | Ratio | Blank invoice | No Invoice | Tile and column | "Set invoice value to calculate"; column blank |
| FWD-29 | Ratio | Non-USD invoice | EUR, VND, No Currency | Tile and column | "Invoice must be in USD to calculate"; column blank |
| FWD-30 | Ratio | No quotes | No Quotes | Tile | No best quote; no crash; a plain state |
| FWD-31 | Ratio | Rounding half-up | Rounding Tie | Tile and column | Current $3/$2,000 = 0.15% → "0.2%"; $1 → "0.1%"; $2.99 → "0.1%" |
| FWD-32 | Saving | Saving tile | Pakkable | Saving tile | Uses the current terms (DDP·Sea·FCL) and $3,500: best $3,000 → saving $500 (14.3%) per shipment; annual uses 24/yr if shown |
| FWD-33 | Saving | Annual figures | High Volume Air | Forwarder page / expert export | Annual = quote × 520 (shipments per year wins over per month) |
| FWD-34 | Export | Expert CSV | Pakkable | Export → Expert → CSV | 3 sections; includes Annual Savings, Forwarder Status, Key Strength, the Freight Cost Ratio column, duty estimates |
| FWD-35 | Export | Client CSV | Pakkable | Export → Client → CSV | Leaves out the expert-only columns listed in `/help`; excluded forwarders absent |
| FWD-36 | Export | PDF expert and client | Pakkable | Both PDFs | Open; the same columns as the CSV rules (duty estimates CSV only); no overflowing table |
| FWD-37 | Export | DOCX expert and client | Pakkable | Both DOCX | Open; columns as `/help` |
| FWD-38 | Export | Non-USD quote in export | Pakkable | Expert CSV | Charlie shows Exchange Rate 1.1, Rate Date, Rate Source "Entered manually" |
| FWD-39 | Export | Special characters | Café & Crème | CSV / PDF / DOCX | Accents, `&` and emoji kept (CSV in UTF-8); CSV quoting correct for commas/quotes |
| FWD-40 | Export | Non-owner can export | expert2 on Pakkable | Export | Allowed (everyone can export) |
| FWD-41 | Ownership | Other expert read-only | expert2 on Pakkable | Open the project, forwarder, quote | View only; no controls |
| FWD-42 | Ownership | Admin edits | admin on E2 project | Edit a quote | Allowed |
| FWD-43 | Delete | Delete project | throwaway | Delete via the overflow menu | Deleted (with forwarders and quotes) or blocked with a plain reason |
| FWD-44 | Lead time | Rate validity badge | Pakkable quotes (valid +30 d) | Edit one to valid-until today / yesterday | "Expires today" / "Expired" |

## 7. Tariff Calculator

All on the `ZZQA-local` release. Today = run date (UTC).

| ID | Module | Scenario | Test data | Steps | Expected result |
|---|---|---|---|---|---|
| TAR-01 | Lookup | HTS keyword search | "syringes" | HTS lookup | Finds 9018.31.00.40 with its parent heading |
| TAR-02 | Lookup | HTS code search | "8703" | Lookup | Shows the heading and its child |
| TAR-03 | Lookup | No results | "zzzqqq" | Lookup | Plain empty state |
| TAR-04 | Lookup | Code not in release | 0101.21.00.10 | Calculate | "… isn't in the current HTS (ZZQA local test release). Check the code." |
| TAR-05 | Lookup | 8-digit code | 8703.80.00 | Calculate | Matches the only 10-digit line, with a note |
| TAR-06 | Base duty | Ad valorem | 6109.10.00.12, origin MX, $10,000, Sea | Calculate | Base duty 16.5% = $1,650.00; special programs listed "not applied" |
| TAR-07 | Base duty | Specific rate | 2204.21.50.60 | Calculate | Plain message that the specific rate can't be computed, or quantity is required; never a silent $0 |
| TAR-08 | Additional | China 301 (in force) | 8703.80.00.00, CN, $10,000 | Calculate | 301 at 100% (9903.91.03) added; the total states the programs excluded |
| TAR-09 | Additional | Forced labour program by origin | 6109.10.00.12, VN | Calculate | 9903.05.84 12.5% applied, or listed as excluded/not loaded per program status |
| TAR-10 | Program gating | "EXCLUDES N programs" | 7318.15.80.66, CN | Calculate | Total reads "… — EXCLUDES N additional duty programs that may apply", N = the number of listed not-loaded programs (232 metals etc.) |
| TAR-11 | Program gating | No programs triggered | 8471.30.01.00, MX | Calculate | No EXCLUDES text, or N matches the triggered programs only |
| TAR-12 | Program gating | Each 232 type | 8708 (vehicles), 9403 (timber), 8542 (semis), 3004 (pharma), 8806 (drones), CN | Calculate each | The matching 232 program is named for each |
| TAR-13 | Entry date | Today | 8486.10.00.00, CN, entry today | Calculate | China 301 exclusion (9903.88.70) applies → no 301 duty |
| TAR-14 | Entry date | Last day of exclusion | the same, entry 2026-11-09 | Calculate | Exclusion still applies |
| TAR-15 | Entry date | Day after exclusion | the same, entry 2026-11-10 | Calculate | Exclusion ended; the 301 duty (if in scope) applies, or a scheduled-change note |
| TAR-16 | Entry date | Unconfirmed row doesn't displace confirmed | 8716.39.00.90, CN, entry 2026-11-10 | Calculate | The unconfirmed 9903.91.12 row is shown as a warning/condition and not added to the total; any confirmed row still applies |
| TAR-17 | Entry date | Scheduled change panel | 8716.39.00.90, CN, entry today | Calculate | Key dates / "changes shortly after the entry date" mention 2026-11-10 |
| TAR-18 | Entry date | Out of window | entry yesterday−1, and today+367 | Calculate | Plain error (window is today−1 to today+366) |
| TAR-19 | MPF | Informal | $2,500.00, Sea | Calculate | MPF $2.77 flat, "Assumes an informal entry" |
| TAR-20 | MPF | Just above informal | $2,500.01 | Calculate | Formal MPF $34.58 "Minimum applied" |
| TAR-21 | MPF | Below min | $9,981.00 | Calculate | $34.58 "Minimum applied" (calculated $34.57) |
| TAR-22 | MPF | At min | $9,982.68 | Calculate | $34.58, no Minimum label |
| TAR-23 | MPF | In range | $50,000.00 | Calculate | $173.20 |
| TAR-24 | MPF | At max | $193,666.28 | Calculate | $670.86, no Maximum label |
| TAR-25 | MPF | Above max | $250,000.00 | Calculate | $670.86 "Maximum applied" |
| TAR-26 | HMF | Sea | $10,000, Sea | Calculate | HMF 0.125% = $12.50 |
| TAR-27 | HMF | Air | $10,000, Air | Calculate | No HMF line |
| TAR-28 | HMF | Road | $10,000, Road | Calculate | No HMF line |
| TAR-29 | Currency | Non-USD customs value | EUR 10,000, daily rate | Calculate | Converted at the seeded rate 1.08 → $10,800.00; source "Daily reference rate" and date |
| TAR-30 | Validation | Invalid inputs | value 0, −1, "abc", HTS "12" | Calculate | Plain-language messages; no crash |
| TAR-31 | Save | Save estimate | TAR-08 result, expert1 | Save with label "ZZQA est é&🚚" | Saved; opens `/tariff-calculator/estimates/<id>` with the same figures |
| TAR-32 | Save | Locked and immutable | saved estimate | Look for edit; reload after changing fees as editor | No edit control; figures unchanged after reference data changes |
| TAR-33 | Save | Delete own estimate | expert1 | Delete | Deleted |
| TAR-34 | Save | Others can view, not delete | expert2 | Open expert1's estimate | Viewable; no Delete |
| TAR-35 | Save | Linked to forwarder quote | expert1, Pakkable quote | Calculate from or link to the quote; save | Shown beside the quote; doesn't change rank or savings |
| TAR-36 | Duty data | Editor can edit fees | editor | `/tariff-calculator/duty-data/fees` → edit, then revert | Saved with history; the change appears in new estimates only |
| TAR-37 | Duty data | Expert can't edit | expert1 | Open `/tariff-calculator/duty-data` and `/fees` | 404 (editor- and admin-only pages); no "Duty data →" link on the calculator |
| TAR-38 | Double submit | Double-click Save estimate | expert1 | Double-click | One estimate saved |

## 8. Help and FAQ

| ID | Module | Scenario | Test data | Steps | Expected result |
|---|---|---|---|---|---|
| HELP-01 | Help | Page loads | expert1 | Open `/help` | All sections render; no console errors |
| HELP-02 | Help | FAQ browse | — | Switch the FAQ filters (All / Forwarder Sourcing / Tariff Calculator / General) and expand items | The list changes per filter; items expand and collapse (there's no FAQ search) |
| HELP-03 | Help | Freight Cost Ratio entry | — | Read it | Matches FWD-27–31 (freight only, 1 decimal, blank unless invoice > 0 and USD, current → best) |
| HELP-04 | Help | Ranking and savings rules | — | Read them | Match FWD-15–20, FWD-32 and 3PL-22–27 |
| HELP-05 | Help | Contract Period / Project Duration | — | Read them | Present and matching 3PL-09–16 / FWD-04–05, or noted as missing |
| HELP-06 | Help | Permissions | — | Read them | Match AUTH/ADM/RLS results |
| HELP-07 | Help | Tariff section | — | Read it | Matches TAR results (MPF, HMF, entry window, EXCLUDES, locked estimates) |

## 9. Cross-cutting

| ID | Module | Scenario | Test data | Steps | Expected result |
|---|---|---|---|---|---|
| X-01 | Layout | 1280px, every main page | expert1 | Visit each route at 1280px | No horizontal page scroll (`scrollWidth ≤ innerWidth`) |
| X-02 | Layout | 390px, every main page | expert1 | The same at 390px. `body` has `overflow-x: clip`, so also look for elements whose right edge is past `innerWidth` and that aren't inside an `overflow-x: auto/scroll` container | No horizontal scroll **and** nothing cut off at the right edge; wide tables scroll inside their own container |
| X-03 | Layout | Top bar and menus at 390px | — | Open the nav and account menu | Usable; nothing cut off |
| X-04 | Validation | Plain-language messages | forms | Trigger errors on each form | No raw database, Zod or stack text |
| X-05 | Empty states | Lists with no data | target (owns nothing) | My Projects in each module | A plain empty state with a next step |
| X-06 | Back/refresh | Back after save | any edit form | Save → Back | No resubmit; no stale-data warning |
| X-07 | Refresh | Refresh on a result page | tariff result | Refresh | No crash; form state is plain |
| X-08 | Double submit | Create forms | 3PL/forwarder/quote create | Double-click Create | One record |
| X-09 | Long text | 5,000-char notes | any notes field | Paste and save | Saved, or refused with a length message; layout intact |
| X-10 | Special chars | `<script>`, quotes, `&`, emoji in names | quote notes, client name | Save and view | Shown literally (escaped); no script execution |
| X-11 | Console | No errors | every route | Watch the console | No errors apart from expected 404s |
| X-12 | 404 | Unknown IDs | random UUID in each detail route | Open | Friendly 404 |
| X-13 | Invalid IDs | Non-UUID in a route | `/forwarder-sourcing/abc` | Open | 404, not a 500 |
| X-14 | Old URLs | Legacy redirects | `/dashboard`, `/projects/<id>` | Open | 308 to the right page |

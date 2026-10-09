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

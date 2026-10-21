<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


## Secrets
Never read, cat, source, print, or load .env or .env.local files, in any way, for any reason. To check whether a variable is configured, check only whether its NAME exists (e.g. grep for the variable name and print only the name, never the value). If a task seems to require a secret's value, stop and ask the user instead.

## Database Changes
Never run raw SQL directly against Supabase (dashboard or one-off commands).
Always follow this flow:
1. Create a migration file: `npx supabase migration new <descriptive_name>`
2. Write the SQL inside that generated file
3. Test locally: `npx supabase db reset`
4. Commit the migration file to git in the same commit/PR as the related feature code
5. Deploy with the migration first, chained: `npx supabase db push && git push`

The `&&` matters: if the migration fails, `git push` must not run. Pushing deploys the code to Vercel, and code that expects columns or tables the live DB doesn't have breaks production (and its security policies won't apply). Fix the migration, push it to the database, and only then push the code. After committing a migration, always remind the user to deploy with `npx supabase db push && git push`.

Rollback: if a deploy breaks production, go to Vercel → Deployments → the previous production deployment → Promote to Production. That restores the previous code only; migrations already applied stay in the database, so a schema change is undone with a new migration, never by editing the live database.

Every migration that creates a table must revoke all privileges from anon unless the table is meant to be public. The strict pgTAP anon check enforces this.

Any migration that backfills or moves existing data must disable updated_at triggers for the affected tables during the backfill (ALTER TABLE ... DISABLE TRIGGER ...; re-enable after), so existing rows keep their real last-updated times.

## Cron Routes
Routes under `/api/cron/` skip the login redirect in the proxy (`src/proxy.ts`, which runs `updateSession` in `src/lib/supabase/middleware.ts`), so **any route under that prefix must verify `CRON_SECRET` itself** by calling `isAuthorizedCronRequest()` (`src/lib/cron-auth.ts`) before doing anything else. They're the only place the service-role client may be used without an admin check (see docs/SECURITY.md, "Service-role exception: cron routes"). There are two: `/api/cron/fx-rates` (writes `fx_rates`) and `/api/cron/hts-release` (writes `hts_releases`/`hts_lines` and calls `activate_hts_release()`); keep each to those tables. Schedules live in `vercel.json`. Reference `CRON_SECRET` by name only; never read its value.

## Service-role exception: saving estimates
One more place may use the service-role client without an admin check: `src/lib/tariff/estimate-store.ts`, called only by `saveEstimate` after its user checks, and only to run `save_duty_estimate()` (executable by `service_role` only). Don't use the service-role client anywhere else, and don't add other calls to that file (`src/lib/supabase/service-role-use.test.ts` enforces the list). See docs/SECURITY.md, "Service-role exception: saveEstimate".

## Service-role exception: client users
The third approved exception: `src/lib/client-users/create-client-user.ts`, called only by the `/client-access` Server Actions after `requireStaff()`. It creates client users (role fixed to `client`, admins for any client, logistics experts only for clients of projects they own) and lets admins reset a client user's password, with exactly three Auth admin calls: `createUser`, `getUserById`, `updateUserById`. Don't add other calls to that file or widen what it writes; `create-client-user.test.ts` and `service-role-use.test.ts` enforce it. See docs/SECURITY.md, "Service-role exception: client users".

## Service-role exception: locking Landed Cost versions
The fourth and last approved exception: `src/lib/landed-cost/snapshot-store.ts`, called only by `lockWorkspaceAction` in `src/app/(authenticated)/landed-cost/actions.ts` after `requireStaff()`, the flag, the owner-or-admin check, the stale check and the server-side calculation, and only to run `save_landed_cost_snapshot()` (executable by `service_role` only; it re-checks the version against the saved workspace and its sums). The user id passed comes from the session, never the browser. Don't add other calls to that file or other callers (`service-role-use.test.ts` enforces both). Locked versions are immutable (a trigger refuses every update) and are shown only from what was stored, never recalculated. See docs/SECURITY.md, "Service-role exception: locking Landed Cost versions".

## Client users
`client` is a role but never a staff role. Never add it to `has_staff_role()`, `STAFF_ROLES` or `staffRole()`: that opens every internal table to external users (`role-list-sync.test.ts` fails if you try). Every staff Server Action starts with `await requireStaff()` and every portal one with `await requireClient()` (`server-action-guard.test.ts`). A new table a client may read must be named on purpose in pgTAP 24 and 28. Clients read client updates only through `my_portal_updates()` (and staff "View as client" through `portal_updates_for_client()`), and Market Reports only through `my_market_reports()` / `market_reports_for_client()`, which check the paid plan themselves; and requests only through `submit_client_request()`, `submit_client_introduction()` (paid plan, a letter of the latest report) and `submit_market_report_interest()` (free plan) / `my_client_requests()`, which returns no introductions off the paid plan (staff: `client_requests_for_client()` and the reply / seen / withdraw functions); never return a forwarder's name for a letter to a client, and keep the reply guard on introduction replies; keep `client_updates`, `client_market_reports`, `market_report_partner_labels` and `client_requests` staff-only, refuse every client write while `must_change_password` is set, and add any new security-definer function a signed-in user can call to the tripwire in pgTAP 32. Run `npm run qa:portal-scan` against a local dev server after changing what the portal shows. See docs/SECURITY.md, "Client users (external)" and "Client updates".

## Client updates
What a client sees about a project comes only from `client_updates.payload`, built on the server by `src/lib/client-updates/build-*-payload.ts` from an allow-list. Never copy an internal column into it (notes, assessment, next action, key notes, sources, status words, contact details, ids, 3PL amounts). A new payload key must be added to the strict schema (`payload-schema.ts`), to the path lists in `payload-allow-list.test.ts`, and for a top-level key to `client_update_payload_ok()` in a migration. Only shortlisted partners are named. The Market Report follows the same rules with its own schema (`market-report-schema.ts`), allow-list test (`market-report-allow-list.test.ts`) and `market_report_payload_ok()`: an anonymised partner carries only its letter, price, lead time, like-for-like flag, outcome, size band, region and "Move's take", and "Not taken forward" only the letter, outcome, size and region. See docs/SECURITY.md, "Client updates" and "Market Report".

## Form Input Conventions
Always use plain native `<input>`/`<textarea>` elements for any form field holding actual data that gets pre-filled from server data (`defaultValue` driven by a server fetch). Do not use shadcn's `Input` component for these — it's built on Base UI primitives that manage their own internal uncontrolled state and will not pick up updated `defaultValue` after a server-driven revalidation (e.g. after a Server Action + `revalidatePath`), causing stale-looking data and a console warning. shadcn's `Input`/`Select`/`Checkbox` are fine for presentational or purely client-driven inputs (e.g. filter controls, search boxes) where the value isn't being re-hydrated from a server fetch after mount.
## Help Page
`/help` (`src/app/(authenticated)/help/`) states the app's rules in plain language (ranking, savings, requirement fit, uploads, exports, permissions). When behavior described there changes, update `/help` in the same change.

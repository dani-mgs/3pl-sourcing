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
4. Apply to the live project: `npx supabase db push`
5. Commit the migration file to git in the same commit/PR as the related feature code

After committing a migration, always remind the user to run `npx supabase db push` before (or alongside) `git push`. Code that expects a schema the live DB doesn't have will break, and security policies won't apply.

Every migration that creates a table must revoke all privileges from anon unless the table is meant to be public. The strict pgTAP anon check enforces this.

Any migration that backfills or moves existing data must disable updated_at triggers for the affected tables during the backfill (ALTER TABLE ... DISABLE TRIGGER ...; re-enable after), so existing rows keep their real last-updated times.

## Cron Routes
Routes under `/api/cron/` skip the login redirect in the proxy (`src/proxy.ts`, which runs `updateSession` in `src/lib/supabase/middleware.ts`), so **any route under that prefix must verify `CRON_SECRET` itself** by calling `isAuthorizedCronRequest()` (`src/lib/cron-auth.ts`) before doing anything else. They're the only place the service-role client may be used without an admin check (see docs/SECURITY.md, "Service-role exception: cron routes"). There are two: `/api/cron/fx-rates` (writes `fx_rates`) and `/api/cron/hts-release` (writes `hts_releases`/`hts_lines` and calls `activate_hts_release()`); keep each to those tables. Schedules live in `vercel.json`. Reference `CRON_SECRET` by name only; never read its value.

## Form Input Conventions
Always use plain native `<input>`/`<textarea>` elements for any form field holding actual data that gets pre-filled from server data (`defaultValue` driven by a server fetch). Do not use shadcn's `Input` component for these — it's built on Base UI primitives that manage their own internal uncontrolled state and will not pick up updated `defaultValue` after a server-driven revalidation (e.g. after a Server Action + `revalidatePath`), causing stale-looking data and a console warning. shadcn's `Input`/`Select`/`Checkbox` are fine for presentational or purely client-driven inputs (e.g. filter controls, search boxes) where the value isn't being re-hydrated from a server fetch after mount.
## Help Page
`/help` (`src/app/(authenticated)/help/`) states the app's rules in plain language (ranking, savings, requirement fit, uploads, exports, permissions). When behavior described there changes, update `/help` in the same change.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


## Database Changes
Never run raw SQL directly against Supabase (dashboard or one-off commands).
Always follow this flow:
1. Create a migration file: `npx supabase migration new <descriptive_name>`
2. Write the SQL inside that generated file
3. Test locally: `npx supabase db reset`
4. Apply to the live project: `npx supabase db push`
5. Commit the migration file to git in the same commit/PR as the related feature code

## Form Input Conventions
Always use plain native `<input>`/`<textarea>` elements for any form field holding actual data that gets pre-filled from server data (`defaultValue` driven by a server fetch). Do not use shadcn's `Input` component for these — it's built on Base UI primitives that manage their own internal uncontrolled state and will not pick up updated `defaultValue` after a server-driven revalidation (e.g. after a Server Action + `revalidatePath`), causing stale-looking data and a console warning. shadcn's `Input`/`Select`/`Checkbox` are fine for presentational or purely client-driven inputs (e.g. filter controls, search boxes) where the value isn't being re-hydrated from a server fetch after mount.
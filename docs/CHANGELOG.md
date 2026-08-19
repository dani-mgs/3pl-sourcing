# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Initial Next.js + TypeScript project setup using the App Router.
- Baseline folder structure: `src/app`, `src/components`, `src/lib`, `src/styles`, `public`, `docs`.
- Project documentation scaffolding (`README.md`, `docs/CHANGELOG.md`, `docs/FEATURES/`).
- Supabase client setup: browser client (`src/lib/supabase/client.ts`) and server client (`src/lib/supabase/server.ts`) using `@supabase/ssr`.
- Middleware (`src/middleware.ts`) that refreshes the Supabase auth session on each request.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` added to `.env.example`.
- Login page (`src/app/login/page.tsx`) with an email/password form; no signup, as this app is invite-only.
- Server Action (`src/app/login/actions.ts`) that signs in via Supabase and redirects to `/dashboard` on success.
- Middleware now redirects unauthenticated requests to `/login`, leaving `/login` itself public.
- Tailwind CSS added for form styling.
- Projects dashboard (`src/app/dashboard/page.tsx`) listing client, project, status, and creation date for each project, linking through to `/projects/[id]`.
- New Project form (`src/app/dashboard/new/page.tsx`) and Server Action (`src/app/dashboard/new/actions.ts`) that inserts a row into `projects`, setting `owner_id` from the authenticated user.
- Confirmed existing auth middleware already covers `/dashboard` and `/dashboard/new` with no changes needed.
- Logout capability: Server Action (`src/app/logout/actions.ts`) that signs out via Supabase and redirects to `/login`.
- "Log Out" button added to the dashboard header, wired to the logout Server Action.
- Project details page (`src/app/(authenticated)/projects/[id]/page.tsx`) fetching a single project by id, showing client/project name, a status badge, and creation date, plus placeholder cards for the upcoming Client Requirements, 3PL List, Comparison, and Recommendation steps. Calls `notFound()` when no matching project exists. Uses the shared `(authenticated)` layout, so project rows on the dashboard now land here instead of 404ing.

### Changed

- Applied the design system (`docs/DESIGN_SYSTEM.md`) across the login page, dashboard, new-project form, and logout button: Space Grotesk/Inter fonts wired up in the root layout via `next/font/google`, and colors, spacing, shape, and shadows brought in line with the documented tokens.
- Dashboard empty state now reads "No projects yet. Create your first one to get started." per the empty-state convention.
- Status pipeline (signature dotted element) intentionally deferred — no 3PL detail page exists yet to host it.
- Moved `src/app/dashboard/` into a `(authenticated)` route group (`src/app/(authenticated)/dashboard/`, with `new/` alongside it) so `/dashboard` and `/dashboard/new` URLs are unchanged.
- Added `src/app/(authenticated)/layout.tsx`, a shared Server Component header ("3PL Sourcing" + Log Out) rendered once above all authenticated pages instead of being duplicated per-page.
- Removed the now-redundant header row and Log Out button from the dashboard page; it keeps only its page-specific title and New Project button.
- Confirmed `src/middleware.ts` still protects `/dashboard` and `/dashboard/new`, since route groups don't change URL pathnames.

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
- Client Requirements page (`src/app/(authenticated)/projects/[id]/requirements/page.tsx`) listing that project's `documents` rows grouped under RFI / Kickoff Meeting Transcript / Other Documents, with a fresh 60-second signed download URL generated per page load (never stored) and a "No documents uploaded yet" fallback per group; also includes a stub "RFI Template" section.
- Upload form (`upload-form.tsx`, Client Component) and Server Action (`src/app/(authenticated)/projects/[id]/requirements/actions.ts`) that uploads the chosen file to the `3pl-sourcing-documents` bucket under `${projectId}/${uuid}-${fileName}`, inserts the matching `documents` row, and revalidates the page so the new document appears immediately.
- The "Client Requirements" card on the project details page is now a working link to `/projects/[id]/requirements`; the other three placeholder cards are unchanged.
- Owner-only document delete: the requirements page now compares the current user's id to the project's `owner_id` and only renders a "Delete" control for the owner, opening a confirmation dialog (`delete-document-button.tsx`) before calling the new `deleteDocument` Server Action, which removes the storage object and `documents` row and relies entirely on RLS to reject non-owner deletes rather than duplicating the ownership check in application code.
- Requirements Summary form (`src/app/(authenticated)/projects/[id]/requirements/summary/page.tsx`), a Client Component form pre-filled from any existing `requirements_summary` row, covering Location, Storage Requirements, Order Volume, SKU Count, B2B or B2C, Special Handling Requirements, Target Cost, Required Turnaround Time, and Other Notes. The `saveRequirementsSummary` Server Action (`summary/actions.ts`) upserts the row by `project_id`, sets `updated_at`, and shows an inline "Saved" confirmation without redirecting. Linked from the Client Requirements page as "Requirements Summary", grouped with Step 1's document upload.
- 3PL List page (`src/app/(authenticated)/projects/[id]/providers/page.tsx`) listing that project's `providers` rows in a table (company, contact, location, status), with each status rendered as a pill using the exact per-status colors from `docs/DESIGN_SYSTEM.md`, per-cell Links for row navigation to `/projects/[id]/providers/[providerId]` (detail page not built yet — expect a 404 for now), an "Add Provider" button, and a design-system empty state.
- Add Provider form (`providers/new/page.tsx` + `new-provider-form.tsx`) and Server Action (`providers/new/actions.ts`) that inserts a row into `providers` with the project's id and the 7 exact status options, redirecting back to the 3PL list on success.
- The "3PL List" card on the project details page is now a working link to `/projects/[id]/providers`; Comparison and Recommendation are unchanged.
- Individual 3PL Details page (`src/app/(authenticated)/projects/[id]/providers/[providerId]/page.tsx`), replacing the 404 provider rows previously linked to: shows company name, status pill, and an info card (website, contact, email, phone, location, notes), plus that provider's `provider_documents` grouped under Discovery Call Transcript / Notes / Documents / Quotation / Revised Quotation, each with a fresh 60-second signed download URL. Upload form and `uploadProviderDocument` Server Action (`[providerId]/actions.ts`) store files under `providers/${providerId}/${uuid}-${fileName}` in the `3pl-sourcing-documents` bucket and revalidate the page on success.
- Extracted the provider status pill into a shared `status-badge.tsx` component, used by both the 3PL list and detail pages, to avoid the two copies drifting out of sync.

### Changed

- Applied the design system (`docs/DESIGN_SYSTEM.md`) across the login page, dashboard, new-project form, and logout button: Space Grotesk/Inter fonts wired up in the root layout via `next/font/google`, and colors, spacing, shape, and shadows brought in line with the documented tokens.
- Dashboard empty state now reads "No projects yet. Create your first one to get started." per the empty-state convention.
- Status pipeline (signature dotted element) intentionally deferred — no 3PL detail page exists yet to host it.
- Moved `src/app/dashboard/` into a `(authenticated)` route group (`src/app/(authenticated)/dashboard/`, with `new/` alongside it) so `/dashboard` and `/dashboard/new` URLs are unchanged.
- Added `src/app/(authenticated)/layout.tsx`, a shared Server Component header ("3PL Sourcing" + Log Out) rendered once above all authenticated pages instead of being duplicated per-page.
- Removed the now-redundant header row and Log Out button from the dashboard page; it keeps only its page-specific title and New Project button.
- Confirmed `src/middleware.ts` still protects `/dashboard` and `/dashboard/new`, since route groups don't change URL pathnames.
- Reapplied `docs/DESIGN_SYSTEM.md` across every page (login, shared header, dashboard, project details, client requirements + upload, requirements summary, 3PL list + add-provider, individual 3PL details) to match the Move brand subset: swapped Space Grotesk for Plus Jakarta Sans in the root layout, renamed every color token in `globals.css` (`ink-navy`→`move-navy`, `route-indigo`→`move-green`, `mist`→`neutral-bg`, `fog`→`neutral-border`, `slate`→`neutral-muted`, `danger-rose`→`danger`, etc.) and updated all usages, restyled the shared authenticated header to a solid Move Navy bar with white text and an outlined white Log Out button, and updated all 7 status pipeline badge colors. Token/color/font swap only — no layout, spacing, or behavior changes.
- Applied the new "Spacing & Layout Rhythm" section from `docs/DESIGN_SYSTEM.md` across all 9 authenticated pages: the header bar is now a fixed `h-16` with `px-8` and true vertical centering; every page container went from `px-4 py-8` to `px-8 py-10`; every page-title row now has `mb-8` before content starts; the dashboard and 3PL list tables now use `px-4 py-3` cells instead of `px-4 py-2`. Card padding audited and already met the `p-6` minimum everywhere, so no card changes were needed. Login's outer wrapper was left as-is since it isn't the `px-4 py-8` container pattern the rule targets.

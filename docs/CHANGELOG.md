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

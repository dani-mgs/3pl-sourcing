## Strict Security & AppSec Mandates

### Server Actions Security (Critical)

- **Always Validate Inputs:** Every single Server Action (`"use server"`) must parse and validate incoming data using a strict schema library (e.g., Zod) as its first line of defense.
- **Backend Authentication Verification:** Never pass the User ID or Session state from the client UI as a parameter to a Server Action. Always initialize the Supabase client inside the action via `@supabase/ssr` cookies and fetch the user using `await supabase.auth.getUser()`. Never substitute `getSession()` for this check — `getSession()` reads a locally-stored JWT without revalidating it against the Supabase Auth server, so it can trust a stale or tampered session. `getUser()` is mandatory anywhere authorization decisions are made.
- **Authorization Beyond RLS:** RLS protects direct database reads/writes, but it is not a substitute for explicit authorization checks inside a Server Action. Any action that performs a non-DB side effect (calling a third-party API, sending an email, triggering a webhook, writing to external storage) must independently verify the authenticated user is allowed to perform that specific operation before executing it.
- **Fail Securely:** Catch database exceptions internally (`console.error`). Return a structured, generic object to the client UI (e.g., `{ success: false, error: "An unexpected error occurred." }`). Never reveal raw system, Postgres, or internal schema errors to the client. This applies equally to Zod validation failures — return the same generic error shape, not raw field-level constraint or schema details.
- **Rate Limiting Review:** Server Actions are reachable as unauthenticated-adjacent POST endpoints under the hood. Any action that mutates state, sends external requests, or triggers a side effect must be flagged for rate-limiting review before shipping.

### Supabase Database & Isolation

- **Day-One Row Level Security (RLS):** Every table creation or alteration schema must include explicit SQL commands enabling RLS (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`).
- **Policy Enforcement:** Define explicit Postgres policies (`FOR SELECT`, `FOR INSERT`, `FOR UPDATE`) bound to authenticated users via `auth.uid()`. Assume public access is denied by default.
- **Policy Verification (Required):** A policy is not considered complete on creation alone. Every new or modified RLS policy must be tested by attempting the same operation as a non-owner authenticated user before merge, to catch logic errors (e.g., conditions that unintentionally match on `NULL`, or overly permissive `USING`/`WITH CHECK` clauses).
- **No Hardcoded Tokens:** All interactions must pass through the typed Supabase Client context. Never expose or hardcode the Service Role key anywhere in the client code bundle.

### Service-role exception: cron routes

- The service-role client (`src/lib/supabase/admin-client.ts`) bypasses RLS and is otherwise only used after an explicit admin-role check. The exception is **cron routes under `/api/cron/`**, which run with no user. There are two:
  - `/api/cron/fx-rates` — upserts `fx_rates` only.
  - `/api/cron/hts-release` — imports the USITC HTS for the Tariff Calculator. Touches only `hts_releases`, `hts_lines`, and the `activate_hts_release()` function (executable by `service_role` only; refuses to activate a partial import). Its database access is confined to `src/lib/tariff/hts-import-store.ts`.
- Each cron route must call `isAuthorizedCronRequest()` (`src/lib/cron-auth.ts`) before anything else: it requires `Authorization: Bearer <CRON_SECRET>`, compares in constant time, and fails closed when `CRON_SECRET` isn't set. Vercel Cron sends this header automatically.
- The proxy's login redirect (`src/proxy.ts`, Next.js 16's replacement for `middleware.ts`) skips exactly the `/api/cron/` prefix (`CRON_ROUTE_PREFIX` in `src/lib/supabase/middleware.ts`) and nothing else; security headers still apply.
- Keep each cron route's service-role use to the tables it maintains (listed above). Treat the external data it fetches as untrusted: validate it (Zod) before writing. The HTS import validates every exported row, strips markup from descriptions, and rejects a chapter whole if any row is malformed.

### Secrets Management

- All keys (`NEXT_PUBLIC_SUPABASE_URL`, etc.) must be read exclusively from environment variables.
- If a new environment dependency is introduced, document it instantly inside `.env.example` with fallback placeholder variables.

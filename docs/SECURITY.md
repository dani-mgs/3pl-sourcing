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

### Tariff editor permission

- `app_metadata.tariff_editor = true` (set only by admins through `updateTariffEditor` in /admin, via the service role after an admin check; users can't edit app_metadata) lets a user maintain duty and fee data. SQL `is_tariff_editor()` (editor or admin) gates writes to `customs_fees`, `additional_duties`, `additional_duty_scope` and `duty_program_reviews`, and nothing else. The duty-data server actions check the same permission (`getTariffPermissions`, using `getUser`) before writing.
- Rates in `additional_duties` can't be edited in place (trigger; a row can't become conditional or unconditional in place either); every change to duties, scope and fees is written to `tariff_data_history` by a security-definer trigger that nobody can write to directly. Whether a row's condition is assumed (`assume_condition`) is editable by tariff editors like other details and, like any change, puts the program back to pending review. `additional_duty_scope_counts` is a `security_invoker` view (signed-in read, anon revoked).

### Duty estimates linked to forwarder projects
- `duty_estimates` rows are locked (no update privilege plus a trigger). Any signed-in user can save an unlinked estimate as themselves. A row linked to a forwarder project (`forwarder_project_id`, optionally `forwarder_quote_id`) can only be inserted by that project's owner or an admin (insert policy), and a trigger refuses a quote from another project. The save and preview actions check the same (`getOwnershipContext`), re-read the project and quote, refuse if they changed since the page loaded, require every input to be confirmed, and build the input snapshot from the database, never the form. Linked rows cascade-delete with their project or quote (a delete, which the lock allows).
- Linked estimates reach the Expert CSV only; client exports never carry them (`export-leak.test.ts`).

### Secrets Management

- All keys (`NEXT_PUBLIC_SUPABASE_URL`, etc.) must be read exclusively from environment variables.
- If a new environment dependency is introduced, document it instantly inside `.env.example` with fallback placeholder variables.

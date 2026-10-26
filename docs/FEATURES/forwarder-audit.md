# Forwarder Audit

**What it does:** audits one freight quotation against the commercial invoice, packing list and any rate agreement: line totals, charging bases, agreed rates, cargo basis, duplicates, unexplained charges, requested-service coverage, who normally pays under the Incoterm, and validity dates. It gives a status, a firm figure, and up to 30 ranked findings. Behind `FORWARDER_AUDIT_ENABLED` (README). User guide: `/help#forwarder-audit` (shown only while the flag is on).

**How it works**
- `/forwarder-audit` lists audits (status recalculated); `/forwarder-audit/[id]` is the form: sections 1–4 (shipment, quotation, requested services, up to 50 charge lines) and section 5 (results), which updates as you type. `/forwarder-audit/[id]/summary` is the printable Summary, rendered on the server from the **last saved** inputs (an unsaved edit isn't in it).
- Only the inputs are stored (one JSON object per audit). Status, totals and findings are recalculated by the same engine every time they're shown, in the browser as you type and on the server for the list and the Summary. Nothing calculated is saved, so there is nothing to go stale.
- Any staff member reads an audit; only its owner or an admin edits or deletes it. Save checks `updated_at` inside the update: a second tab saving the same audit is refused as stale.

**Rules: workbook v1.0, frozen**
- The engine (`src/lib/forwarder-audit/`, pure TypeScript) is a port of `docs/forwarder-audit/Forwarder_Audit_Template_v1.0.xlsx` (sheets Audit, Summary, Lists and the hidden Checks). The workbook is the source of truth: the app gives the same answers, including behaviour that looks like a bug, which is listed in TECH_DEBT as v1.1 questions. A rule change means a new workbook version, new fixtures, then the engine.
- Settings are the workbook's: air divisor 6,000, validity warning 7 days, weight/CBM review threshold 0%, rounding tolerance 0.01. They are fixed in the app (read-only), in `lists.ts`.
- Calculation follows LibreOffice (the workbook was saved by it): ROUND half away from zero, compensated sums, approximate equality, case-insensitive and wildcard criteria, TRIM, the workbook's TEXT formats, a blank cell read directly as 0 (`calc-semantics.ts`, `text-format.ts`).
- The workbook says it runs "20 checks" but never names them. The grouping used in our notes (documents, no usable price, freight validity, origin/destination validity, transit, free time, containers, load plan, route, special cargo, packing-list volume, cargo basis, exchange rates, stated total, estimates, wood packaging, coverage, Incoterm payer, charged but not requested, line checks) is **inferred**; the engine has 250 finding rows (29 shipment, 21 service, 4 per line x 50) that no document numbers.

**Tests**
- Golden tests: `scripts/forwarder-audit/golden.py` recalculates the workbook in LibreOffice (headless) for the blank template, the 3 real cases in `docs/forwarder-audit/cases/` and 17 generated cases (`scripts/forwarder-audit/cases/*.json`: FCL, LCL, air, currency, agreed rates, duplicates, validity, rounding, every status, 50 lines, the kept quirks) and writes every formula cell's result to `src/lib/forwarder-audit/__fixtures__/golden/`. `forwarder-audit.golden.test.ts` compares the engine with each cell (about 4,700 per case): numbers to the last bit, text exactly, errors as the same error.
- To regenerate after changing a case: `python3 scripts/forwarder-audit/golden.py` (needs LibreOffice installed; it runs inside `soffice` as a macro, so LibreOffice's own Python is never launched). Review the fixture diff in git. No npm dependency.
- Also: helper unit tests, the input schema, the actions (stubbed database), the flag (and that no client component reads it), the editor's first render for the real cases, /help with the flag on and off, and pgTAP 41 (plus 03, 24 and 28).
- To compare the app with a workbook by hand: `npm run fa:seed-case <case-name> [--owner <email>]` (local Supabase only; Node 22) inserts a golden case as an audit.

**Data and security**
- Table `forwarder_audits` (migration `20261026140623`): `inputs` (JSON object, 200,000 bytes at most), `template_version` ('1.0'), owner (default `auth.uid()`, never updatable), timestamps. Restrictive staff policy; any staff member reads; owner or admin updates (the `inputs` column only) and deletes; clients and anon get nothing. No service role, no security definer function. See SECURITY.md.
- Server Actions (`requireStaff()`, then the flag, then the strict Zod schema `input-schema.ts`, then owner-or-admin, then the write with `.select()` and a returned-row check). The flag is read on the server only; off, the pages are a 404, the actions refuse and the nav shows "Soon".

**Known limits:** 50 charge lines, 30 findings shown (15 questions on the Summary), no .xlsx import, no locked versions (the Summary is always the last save), no delete-confirmation beyond the browser's dialog, dropdown values only from the workbook's lists.

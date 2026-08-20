# Technical Debt Log

Tracks known shortcuts, deferred work, and things that need revisiting later. Not a task list — only add an entry when something is deliberately left imperfect to move faster, not for routine bugs.

## Open

### Header bar spacing feels tight
- **Added:** 2026-08-19 (Week 1, shared authenticated layout)
- **What:** The header bar ("3PL Sourcing" / "Log Out") has no vertical padding and both elements sit flush against the edges with little breathing room.
- **Why deferred:** Cosmetic only, doesn't block any functionality. Fixing now would be premature polish before more pages exist to calibrate spacing against.
- **Severity:** Low

### "New Project" button overlaps header border
- **Added:** 2026-08-19 (Week 1, shared authenticated layout)
- **What:** The "New Project" button on the dashboard page visually overlaps the header's bottom border line slightly.
- **Why deferred:** Cosmetic alignment issue, doesn't block functionality.
- **Severity:** Low

### Inconsistent timestamp column naming across tables
- **Added:** 2026-08-19 (Week 2 review/cleanup)
- **What:** projects uses "date_created" while providers and documents/provider_documents use "created_at"/"uploaded_at" — inconsistent naming convention across the schema.
- **Why deferred:** Cosmetic at the schema level, doesn't affect functionality. Renaming now would touch working tables mid-build for no functional gain.
- **Severity:** Low

## Resolved

### Missing table GRANTs on new Supabase project
- **Added:** 2026-08-19 (Week 1, feature 4)
- **What:** RLS policies were created for the projects table, but the authenticated role had no baseline GRANT (select/insert/update/delete), causing "permission denied for table" errors despite correct RLS.
- **Why deferred:** Not deferred — this was a genuine gap caused by a recent Supabase platform default change (new projects no longer auto-grant table access). Discovered during manual testing, not known in advance.
- **Severity:** High (blocked all writes to the table)
- **Resolved:** 2026-08-19 — added explicit GRANT statement in Supabase SQL Editor for the authenticated role.

### Broken row-click links using unreliable <tr> positioning
- **Added:** 2026-08-19 (Week 1, feature 4)
- **What:** Project rows used an absolutely-positioned overlay Link (position: relative on <tr>, absolute inset-0 on the Link) intended to make the whole row clickable. Because <tr> doesn't reliably establish a CSS containing block for absolutely positioned descendants, the overlay expanded to cover the entire page instead of just its row, hijacking clicks on unrelated buttons ("New Project", "Log Out") above the table.
- **Why deferred:** Not deferred — introduced unintentionally when building the dashboard, found during manual testing.
- **Severity:** High (broke navigation and logout entirely)
- **Resolved:** 2026-08-19 — replaced overlay-link pattern with per-cell Links wrapping each <td>'s content.

---

Format for each entry when added:

### [Short title]
- **Added:** YYYY-MM-DD (Week N, feature X)
- **What:** one sentence describing the shortcut/gap
- **Why deferred:** one sentence — time pressure, POC scope, waiting on a decision, etc.
- **Severity:** Low / Medium / High (High = could block a future feature or cause a real bug; Low = cosmetic or convenience only)
- **Resolved:** (fill in when fixed — date + what changed)

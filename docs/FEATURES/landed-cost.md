# Landed Cost

**What it does:** the full cost of one shipment per unit and in total (product, freight, duties, MPF, HMF, other costs), for up to 5 origins compared side by side. Results are recalculated on the server from the last saved draft. Behind `LANDED_COST_ENABLED` (README). User guide: `/help#landed-cost` (shown only while the flag is on).

**Rules**
- One MPF and one HMF per origin's entry, split by entered value (qty × FOB). HMF is ocean only.
- Entry type: Automatic (informal within the limit) or Formal.
- Divisor: blank uses the mode default (Air 6,000 cm³/kg, Sea 1,000, Road none).
- Freight splits by chargeable weight, value or units; other costs by value, never in the customs value.
- No total until an origin is complete. Only complete origins with the baseline's incoterm are ranked.
- EXW, FCA, FAS and FOB only.

**Paste and export**
- Paste from Excel matches rows to SKUs by code (exact), adds new ones and never deletes. A blank cell keeps the value. FOB price and packing go to the selected origin. Calculated columns are never imported, and units are never guessed (L, W, H in cm; carton weight in kg).
- Export CSV uses the last save, recalculated on the server, and is marked DRAFT.

**Locked versions**
- Lock the last save once every origin is complete: it becomes v1, v2, … (a number is never reused, even after a delete) with its result as calculated that day. A version never changes and is shown from what was stored; later duty data or edits don't affect it. Pending duty reviews don't block it; the version is marked Incomplete.
- The creator, the workspace's owner or an admin can delete a version. Delete a workspace's versions before the workspace.
- Any staff member can download a version as PDF or CSV, built from what was stored. Drafts export as CSV only.

**Manual rates**
- One per duty layer of a SKU in an origin: replace a layer the app applied (the base duty or a program, 0 included) or add one it didn't (a program it named, or a free label such as anti-dumping). A rate (% of the entered value, 0 to 1000) or a fixed amount, with a reason; at most 10 per SKU per origin; never MPF or HMF. Owner or admin; any staff member sees them. Who set and changed one, and when, come from the session.
- Applied after the app's duties: the origin is marked "Includes manual rate", and the comparison's caution names each one. It never makes a result complete; the app's warnings stay (marked as covered). A replace whose layer the app no longer applies, or an add the app now applies itself, blocks that SKU's total; a changed app rate is noted.
- Set in the result panel's duty layers ("Override" on an app layer, "Apply manually" on a program the app doesn't count, "Add manual duty") or edited in each origin's "Manual rates" section; a dialog shows the app's own rate, a preview with the server's rounding, and saving's own checks. Nothing is saved until Save draft. Conflicts link from the Missing list to their fix ("Remove", "Keep as a manual duty", "Keep my rate as an override"); a changed app rate offers "Keep my rate".
- Locked versions (schema version 2) keep them; the PDF (a page-1 box and a table per origin) and the CSV (six columns on the duty layers) show each in full, and only when there is one, so other exports are unchanged. Versions locked before still show and export as before.

**Not built yet:** a breakeven figure, freight quotes, delivered incoterms, .xlsx upload, non-Latin text in PDFs.

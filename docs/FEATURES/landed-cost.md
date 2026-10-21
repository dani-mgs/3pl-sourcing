# Landed Cost

**What it does:** the full cost of one shipment per unit and in total (product, freight, duties, MPF, HMF, other costs), for up to 5 origins compared side by side. Results are recalculated on the server from the last saved draft. Behind `LANDED_COST_ENABLED` (README).

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

**Not built yet:** a breakeven figure, freight quotes, delivered incoterms, duty overrides, snapshots, .xlsx upload.

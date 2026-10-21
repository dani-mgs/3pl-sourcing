# Landed Cost

**What it does:** the full cost of one shipment from one origin, per unit and in total: product (FOB), freight, duties, MPF, HMF and other costs. Inputs are saved as a draft; the result is recalculated on the server from the last save. Behind `LANDED_COST_ENABLED` (README).

**Rules**
- One entry per scenario: one MPF and one HMF on the summed entered values (qty × FOB), split by value. HMF is ocean only.
- Entry type: Automatic (informal within the limit, formal above) or Formal.
- Divisor: blank uses the mode default (Air 6,000 cm³/kg, Sea 1,000, Road none).
- Freight splits by chargeable weight, value or units; other costs by value, never in the customs value.
- No total until every SKU is complete; the panel lists what's missing.
- EXW, FCA, FAS and FOB only.

**Not built yet:** comparing origins, freight quotes, delivered incoterms, duty overrides, locked snapshots, exports.

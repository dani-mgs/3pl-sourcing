// Fixed wording shown with every estimate, live or saved. Kept in one place
// so the calculator, the saved estimate page and /help say the same thing.

export const ESTIMATE_DISCLAIMER = "Estimate — verify with your customs broker.";

export const ESTIMATE_DISCLAIMER_DETAIL =
  "This is not a customs ruling. HTS classification is the importer's responsibility: the estimate uses the code you entered and doesn't check that it's the right one for your goods.";

// What the estimate leaves out or assumes, in the order shown.
export const ESTIMATE_CAVEATS: readonly string[] = [
  "Additional duties are included only for programs a tariff editor has reviewed. Any other program that may apply (not loaded yet, or pending expert review) is named under the total and listed as a warning.",
  "Facts the calculator can't check (where the metal was melted or smelted, U.S. metal content, metal under 15% of the weight, a USMCA or CAFTA-DR claim, an end use, a particular article within a subheading, a USTR product exclusion) are noted on the duty line. When such a fact could lower the duty, the higher duty is applied and the lower one is named.",
  "Section 232 duties on vehicles and parts, trucks, timber and furniture, semiconductors, pharmaceuticals and drones, and Canada's Section 338 duties, aren't calculated; they're named as warnings when they may apply.",
  "Antidumping and countervailing duties (AD/CVD), quotas and tariff-rate quotas aren't included.",
  "Free trade agreement and preference programs (USMCA, GSP, AGOA and others) aren't applied, even if your goods qualify. The HTS special-rate column is shown for information only.",
  "The customs value should be the transaction value: the price paid for the goods, excluding international freight, insurance and US duties. If your price is CIF, CFR, DAP or DDP, deduct those costs first.",
  "MPF is calculated as if this line were the whole entry. On a multi-line entry, the MPF minimum and maximum apply to the entry as a whole.",
  "HMF applies to ocean shipments only.",
  "For per-unit rates, the quantity must be in the rate's unit. HTS weights are net weights, not the shipment's gross weight.",
  "Non-USD values use the exchange rate shown. CBP converts at its own certified rate for the date of export, which may differ.",
  "Not covered: de minimis, duty drawback, Chapter 98 provisions (such as US goods returned), excise taxes, and other agencies' fees.",
];

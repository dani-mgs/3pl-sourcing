// Carries an extracted "existing/incumbent 3PL" from the New Project intake
// upload (Step 1) into the Add 3PLs quick-add form (Step 2). Step 1 and Step 2
// are separate routes connected by a Server Action redirect, so plain React
// state (how Step 1's own fields are pre-filled) can't survive the navigation.
// sessionStorage keeps this the same kind of purely client-side, never-persisted
// hand-off — just one that survives a page navigation within the same tab.
export const EXISTING_PROVIDER_STORAGE_KEY = "3pl-intake-existing-provider";

export type ExtractedExistingProvider = {
  company_name: string | null;
  location: string | null;
  storage_cost: number | null;
  pick_pack_cost: number | null;
  receiving_cost: number | null;
  returns_cost: number | null;
};

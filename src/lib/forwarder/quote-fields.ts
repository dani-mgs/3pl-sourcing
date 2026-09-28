// Option lists for forwarder quotes, matching the check constraints in
// supabase/migrations/20260928094641_forwarder_sourcing_tables.sql exactly;
// keep them in step if a constraint changes.

// Same allowed values as forwarders.assessment (forwarders_assessment_check),
// reused directly rather than duplicated since the two constraints match.
export { FORWARDER_ASSESSMENT_OPTIONS as OVERALL_ASSESSMENT_OPTIONS } from "./forwarder-fields";

export const QUOTE_COMPLETENESS_OPTIONS = [
  "Complete / Comparable",
  "Comparable with Adjustment",
  "Incomplete / Needs Clarification",
] as const;
export type QuoteCompleteness = (typeof QUOTE_COMPLETENESS_OPTIONS)[number];

export const CLIENT_DECISION_OPTIONS = [
  "Pending",
  "Client Approved",
  "Move Recommended - Awaiting Client",
  "Selected",
  "Not Selected",
  "On Hold",
] as const;
export type ClientDecision = (typeof CLIENT_DECISION_OPTIONS)[number];

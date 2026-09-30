// Option lists for 3PL providers and recommendations. Copied from the check
// constraints in supabase/migrations/20260904113007_refactor_client_requirements_schema.sql
// (original providers_status_check), 20260905161012_expand_status_add_assessment_and_notes.sql
// (14-value status expansion + assessment_status), and remote_schema.sql's
// recommendations_priority_check; keep in step if a constraint changes.

export const STATUS_OPTIONS = [
  "Potential / Not Contacted",
  "Baseline",
  "Contacted",
  "Client Requirements Sent",
  "Scheduled for Discovery Call",
  "Waiting for Quotation",
  "Reviewing Quotation",
  "Clarifications",
  "Negotiation",
  "Shortlisted",
  "Vetted",
  "Unfit",
  "Do not Contact",
  "Withdrawn / No Response",
  "Completed / Closed",
] as const;

export const ASSESSMENT_OPTIONS = [
  "Under Assessment",
  "Move Recommended",
  "Fit",
  "Unfit",
  "Awarded/Approved",
] as const;

export const RECOMMENDATION_PRIORITY_OPTIONS = [
  "Cost Savings",
  "Quality of Service",
  "Turnaround Time",
] as const;

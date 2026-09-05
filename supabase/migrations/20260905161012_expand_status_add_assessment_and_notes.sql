-- Drop the old 7-value status constraint before remapping rows, so the
-- remap below isn't blocked by the old constraint, and re-add it after
-- the remap so the new constraint never sees an old, unmapped value.
-- Named "providers_status_check" (not "three_pl_providers_status_check")
-- because the table was originally created as "providers" and later
-- renamed — Postgres doesn't rename constraints along with the table.
alter table three_pl_providers drop constraint if exists providers_status_check;
alter table three_pl_providers drop constraint if exists three_pl_providers_status_check;

-- Map existing rows' old status values to their closest new equivalent
update three_pl_providers set status = 'Potential / Not Contacted' where status = 'Potential';
update three_pl_providers set status = 'Scheduled for Discovery Call' where status = 'Discovery Call';
update three_pl_providers set status = 'Reviewing Quotation' where status = 'Quotation Received';
update three_pl_providers set status = 'Unfit' where status = 'Rejected';

-- Replace the old 7-value status constraint with the new 14-value set
alter table three_pl_providers add constraint three_pl_providers_status_check
  check (status in (
    'Potential / Not Contacted', 'Baseline', 'Contacted', 'Client Requirements Sent',
    'Scheduled for Discovery Call', 'Waiting for Quotation', 'Reviewing Quotation',
    'Clarifications', 'Negotiation', 'Shortlisted', 'Vetted', 'Unfit',
    'Do not Contact', 'Withdrawn / No Response', 'Completed / Closed'
  ));

-- Replace the free-text overall_assessment with a constrained set
alter table three_pl_providers add column assessment_status text
  check (assessment_status in (
    'Under Assessment', 'Move Recommended', 'Fit', 'Unfit', 'Awarded/Approved'
  ));

-- Project-level free-text notes, one per client engagement
alter table client_requirements add column summary_notes text;

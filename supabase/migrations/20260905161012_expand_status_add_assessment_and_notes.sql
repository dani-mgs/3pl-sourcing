-- Drop the old 7-value status constraint, replace with the new 14-value set
alter table three_pl_providers drop constraint if exists three_pl_providers_status_check;
alter table three_pl_providers add constraint three_pl_providers_status_check
  check (status in (
    'Potential / Not Contacted', 'Baseline', 'Contacted', 'Client Requirements Sent',
    'Scheduled for Discovery Call', 'Waiting for Quotation', 'Reviewing Quotation',
    'Clarifications', 'Negotiation', 'Shortlisted', 'Vetted', 'Unfit',
    'Do not Contact', 'Withdrawn / No Response', 'Completed / Closed'
  ));

-- Map existing rows' old status values to their closest new equivalent
update three_pl_providers set status = 'Potential / Not Contacted' where status = 'Potential';
update three_pl_providers set status = 'Scheduled for Discovery Call' where status = 'Discovery Call';
update three_pl_providers set status = 'Reviewing Quotation' where status = 'Quotation Received';
update three_pl_providers set status = 'Unfit' where status = 'Rejected';

-- Replace the free-text overall_assessment with a constrained set
alter table three_pl_providers add column assessment_status text
  check (assessment_status in (
    'Under Assessment', 'Move Recommended', 'Fit', 'Unfit', 'Awarded/Approved'
  ));

-- Project-level free-text notes, one per client engagement
alter table client_requirements add column summary_notes text;

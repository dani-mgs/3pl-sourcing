-- Step 2 of 2: duty estimates can no longer be inserted by signed-in users.
--
-- Step 1 (20261006145721_save_duty_estimate_function) added
-- save_duty_estimate(), which only the service role can execute and which the
-- app's saveEstimate now uses. This closes the direct route: INSERT is revoked
-- from the API roles and the insert policy is dropped, so a signed-in user
-- can't store numbers the calculator never produced.
--
-- SELECT and DELETE are unchanged (everyone signed in reads; the owner or an
-- admin deletes), and there is still no UPDATE privilege and the lock trigger.
-- save_duty_estimate() is untouched: it is security definer and inserts as the
-- table's owner, so it needs no privilege from the caller.
--
-- To undo: add a NEW migration that re-grants INSERT and recreates the policy
-- (see docs/SECURITY.md); never edit this one.

drop policy "Users can save their own duty estimates" on duty_estimates;

revoke insert on table duty_estimates from public, anon, authenticated;

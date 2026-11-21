-- =====================================================================
-- MEAT ME AT CHADA - scheduled task (arrival grace period)
-- Run after supabase/sql/01_schema.sql. Kept separate so that a problem enabling
-- pg_cron cannot undo the schema.
--
-- If the first line fails, enable it in the dashboard instead:
--   Database > Extensions > search "pg_cron" > enable, then run the rest.
-- =====================================================================

create extension if not exists pg_cron with schema pg_catalog;

-- Every minute: hold tables whose reservation time has arrived and
-- release approved reservations that passed the grace period (no-shows).
select cron.schedule(
  'release-late-reservations',
  '* * * * *',
  $$ select public.release_late_reservations(); $$
);

-- To check that it runs:   select * from cron.job_run_details order by start_time desc limit 5;
-- To stop it:              select cron.unschedule('release-late-reservations');

-- =====================================================================
-- MEAT ME AT CHADA - staff account safety and activity records
-- Run after supabase/sql/01_schema.sql (any time). Safe to run again.
--
-- 1) Nobody can change their own role or deactivate their own account,
--    so the system can never be left without a working owner or manager.
-- 2) Changes to an account's role or status are written to activity_logs.
--
-- Creating accounts and resetting passwords is done by the Edge Function
-- "manage-staff" (supabase/functions/manage-staff), because only the server
-- may create logins. It writes its own activity log entries.
-- =====================================================================

create or replace function public.guard_own_account()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null
     and old.user_id = auth.uid()
     and (new.role is distinct from old.role or new.status is distinct from old.status) then
    raise exception 'You cannot change your own role or deactivate your own account';
  end if;
  return new;
end $$;

drop trigger if exists users_guard_own on public.users;
create trigger users_guard_own
  before update on public.users
  for each row execute function public.guard_own_account();

create or replace function public.log_user_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role or new.status is distinct from old.status then
    insert into public.activity_logs (user_id, action, record_type, record_id, details)
    values (auth.uid(), 'update_account', 'users', null,
            jsonb_build_object('username', new.username,
                               'role', new.role,   'previous_role', old.role,
                               'status', new.status, 'previous_status', old.status));
  end if;
  return null;
end $$;

drop trigger if exists users_log on public.users;
create trigger users_log
  after update on public.users
  for each row execute function public.log_user_change();

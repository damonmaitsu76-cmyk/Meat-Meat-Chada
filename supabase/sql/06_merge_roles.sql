-- =====================================================================
-- MEAT ME AT CHADA - one administrator role (owner + manager merged)
-- Run after supabase/sql/01_schema.sql ... supabase/sql/05_accounts.sql. Safe to run again.
--
-- Before: staff / manager / owner.   After: staff / admin.
--   * Existing manager and owner accounts become admin.
--   * An admin can do everything the manager and the owner could do,
--     including creating and managing every account.
--
-- The older functions (log_import, get_report, ...) still say
-- array['manager', 'owner'] inside. assert_role below reads those words as
-- 'admin', so none of them had to be rewritten.
-- =====================================================================

-- 1) users.role: staff or admin ----------------------------------------
-- (the constraint goes first, because it does not allow 'admin' yet)
alter table public.users drop constraint if exists users_role_check;
update public.users set role = 'admin' where role in ('manager', 'owner');
alter table public.users
  add constraint users_role_check check (role in ('staff', 'admin'));
-- Each changed account gets an "update_account" line in activity_logs
-- (role changed from owner to admin). That is the correct record.

-- 2) assert_role: old role names count as admin ------------------------
create or replace function public.assert_role(p_roles text[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_role  text   := public.current_user_role();
  v_allow text[] := array_replace(array_replace(p_roles, 'manager', 'admin'), 'owner', 'admin');
begin
  if v_role is null or not (v_role = any (v_allow)) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end $$;

-- 3) Row Level Security: the policies that named manager / owner -------
drop policy if exists users_select_admin on public.users;
create policy users_select_admin on public.users
  for select to authenticated using ((select public.current_user_role()) = 'admin');

drop policy if exists users_write_admin on public.users;
create policy users_write_admin on public.users
  for all to authenticated
  using      ((select public.current_user_role()) = 'admin')
  with check ((select public.current_user_role()) = 'admin');

drop policy if exists rt_write_admin on public.restaurant_tables;
create policy rt_write_admin on public.restaurant_tables
  for all to authenticated
  using      ((select public.current_user_role()) = 'admin')
  with check ((select public.current_user_role()) = 'admin');

drop policy if exists mi_write_admin on public.menu_items;
create policy mi_write_admin on public.menu_items
  for all to authenticated
  using      ((select public.current_user_role()) = 'admin')
  with check ((select public.current_user_role()) = 'admin');

drop policy if exists settings_update_admin on public.settings;
create policy settings_update_admin on public.settings
  for update to authenticated
  using      ((select public.current_user_role()) = 'admin')
  with check ((select public.current_user_role()) = 'admin');

drop policy if exists al_select_admin on public.activity_logs;
create policy al_select_admin on public.activity_logs
  for select to authenticated using ((select public.current_user_role()) = 'admin');

-- Check:  select username, role, status from public.users order by username;

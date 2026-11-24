-- =====================================================================
-- MEAT ME AT CHADA - big orders, and tables that free themselves
-- Run after supabase/sql/01_schema.sql ... 12_state_machine_fixes.sql. Safe to run again.
-- Run it BEFORE (or together with) the matching front end.
--
-- It also repairs one thing from 12: if the table request function that takes the client
-- token is missing, the QR menu says "Could not find the function public.submit_refill_request
-- (p_client_token, ...) in the schema cache". Running this file creates that function.
-- (Still run 12 first if you never did: it fixes other things this file does not.)
--
--   1) Big orders. One table request used to hold at most 30 different dishes, and
--      anything over that showed "Choose at least one dish", which was the wrong
--      message. Now:
--        * up to 100 different dishes in one request;
--        * an empty request and a too-big request each get their own message;
--        * the "too many open requests" guard counts only requests staff have not
--          looked at yet (status "sent"). Before, a table whose requests were
--          accepted but not yet served was blocked from ordering more.
--   2) get_table_requests also returns each dish's item_id, so "Order again" on the
--      QR menu can put an earlier request back into the tray.
--   3) Tables free themselves. A seated party's table is freed (the session ends and
--      the table goes back to available) when ALL of these are true:
--        * the party has been seated longer than the time slot;
--        * it has sent at least one request since it sat down;
--        * every one of those requests is served;
--        * nothing new was requested, or served, for auto_release_minutes
--          (a new setting, default 20; 0 turns the feature off).
--      Why not "free the table when the first request is served"? Every party's first
--      request is served a few minutes after they sit down, long before they leave, so
--      that would free tables in the middle of the meal. Waiting for the time slot and
--      for the orders to go quiet is the closest sign that guests have left.
--      A party that never ordered is left alone: staff still press "End session".
--      A request nobody has served yet also keeps the table taken.
-- =====================================================================


-- =====================================================================
-- 1) BIG ORDERS
-- =====================================================================

-- The front end sends a client token with every request (added in 12). These three
-- statements repeat that part of 12, so a database that missed it still ends up with a
-- working function. On a database that already has 12 they change nothing.
alter table public.refill_requests add column if not exists client_token uuid;
create unique index if not exists refill_requests_client_token_uq
  on public.refill_requests (table_id, client_token) where client_token is not null;
drop function if exists public.submit_refill_request(uuid, text, jsonb);

create or replace function public.submit_refill_request(
  p_qr_token uuid, p_note text, p_items jsonb, p_client_token uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_table      public.restaurant_tables;
  v_request_id bigint;
  v_number     text;
  v_status     text;
  v_bad        integer;
  v_lines      integer;
begin
  select * into v_table from public.restaurant_tables
  where qr_token = p_qr_token and is_active;
  if not found then
    raise exception 'Invalid table QR code';
  end if;

  -- a retry comes first, so it is answered even if the table has open requests now
  if p_client_token is not null then
    select request_number, status into v_number, v_status
    from public.refill_requests
    where table_id = v_table.table_id and client_token = p_client_token;
    if found then
      return jsonb_build_object('request_number', v_number, 'status', v_status);
    end if;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Choose at least one dish';
  end if;
  v_lines := jsonb_array_length(p_items);
  if v_lines = 0 then
    raise exception 'Choose at least one dish';
  end if;
  if v_lines > 100 then
    raise exception 'One request holds up to 100 different dishes. Send the rest as a second request.';
  end if;

  -- spam guard: at most 5 requests that staff have not looked at yet
  if (select count(*) from public.refill_requests
      where table_id = v_table.table_id and status = 'sent') >= 5 then
    raise exception 'Staff have not answered your last few requests yet. Please wait a moment, then send this one.';
  end if;

  select count(*) into v_bad
  from (
    select (e ->> 'item_id')::bigint as item_id, (e ->> 'quantity')::integer as qty
    from jsonb_array_elements(p_items) e
  ) x
  left join public.menu_items m on m.item_id = x.item_id
  where m.item_id is null or not m.is_available
     or x.qty is null or x.qty < 1 or x.qty > 20;
  if v_bad > 0 then
    raise exception 'One or more dishes are unavailable or invalid';
  end if;

  v_number := 'R-' || lpad(nextval('public.request_number_seq')::text, 4, '0');

  begin
    insert into public.refill_requests (request_number, table_id, note, client_token)
    values (v_number, v_table.table_id, left(nullif(trim(p_note), ''), 300), p_client_token)
    returning request_id into v_request_id;
  exception when unique_violation then
    -- two copies of the same tray arrived at the same moment: the other one won
    if p_client_token is null then raise; end if;
    select request_number, status into v_number, v_status
    from public.refill_requests
    where table_id = v_table.table_id and client_token = p_client_token;
    return jsonb_build_object('request_number', v_number, 'status', v_status);
  end;

  insert into public.request_items (request_id, item_id, item_name, quantity)
  select v_request_id, m.item_id, m.item_name, least(sum(x.qty), 20)::integer
  from (
    select (e ->> 'item_id')::bigint as item_id, (e ->> 'quantity')::integer as qty
    from jsonb_array_elements(p_items) e
  ) x
  join public.menu_items m on m.item_id = x.item_id
  group by m.item_id, m.item_name;

  return jsonb_build_object('request_number', v_number, 'status', 'sent');
end $$;

-- Guests are not logged in, so the function must be open to the anon role.
revoke execute on function public.submit_refill_request(uuid, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.submit_refill_request(uuid, text, jsonb, uuid) to anon, authenticated;


-- =====================================================================
-- 2) ORDER AGAIN: the request status list now carries each dish's item_id
-- =====================================================================

create or replace function public.get_table_requests(p_qr_token uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_table_id bigint;
begin
  select table_id into v_table_id from public.restaurant_tables
  where qr_token = p_qr_token and is_active;
  if not found then
    raise exception 'Invalid table QR code';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'request_number', r.request_number,
             'status', r.status,
             'note', r.note,
             'created_at', r.created_at,
             'items', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'item_id', i.item_id, 'item_name', i.item_name, 'quantity', i.quantity)
                      order by i.item_name)
               from public.request_items i where i.request_id = r.request_id
             ), '[]'::jsonb))
           order by r.created_at desc)
    from public.refill_requests r
    where r.table_id = v_table_id
      and r.created_at > now() - interval '3 hours'
  ), '[]'::jsonb);
end $$;


-- =====================================================================
-- 3) TABLES FREE THEMSELVES
-- =====================================================================

insert into public.settings (setting_key, setting_value) values
  ('auto_release_minutes', '20')
on conflict (setting_key) do nothing;

create or replace function public.auto_release_minutes()
returns integer
language sql stable security definer set search_path = public
as $$ select coalesce(nullif(public.get_setting('auto_release_minutes'), '')::integer, 20) $$;

create or replace function public.release_finished_tables()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  s       record;
  v_count integer := 0;
  v_now   timestamptz := now();
  v_slot  integer := public.slot_minutes();
  v_quiet integer := public.auto_release_minutes();
begin
  if v_quiet <= 0 then
    return 0; -- switched off in Settings: staff end sessions by hand
  end if;

  -- same lock as seating and approving, so a release cannot overlap them
  perform pg_advisory_xact_lock(hashtext('chada_reservations'));

  -- Requests belong to a table, not to a session, so "since they sat down" means
  -- created at or after the session's seated_at.
  for s in
    select ds.session_id, ds.table_id, ds.guest_name, t.table_number
    from public.dining_sessions ds
    join public.restaurant_tables t on t.table_id = ds.table_id
    where ds.status = 'seated'
      -- seated longer than the time slot
      and ds.seated_at + make_interval(mins => v_slot) <= v_now
      -- ordered at least once since sitting down
      and exists (select 1 from public.refill_requests r
                  where r.table_id = ds.table_id and r.created_at >= ds.seated_at)
      -- and nothing is still open
      and not exists (select 1 from public.refill_requests r
                      where r.table_id = ds.table_id and r.created_at >= ds.seated_at
                        and r.status <> 'served')
      -- and the last request was served long enough ago
      and (select max(r.served_at) from public.refill_requests r
           where r.table_id = ds.table_id and r.created_at >= ds.seated_at)
          + make_interval(mins => v_quiet) <= v_now
    for update of ds
  loop
    update public.dining_sessions
       set status = 'finished', ended_at = v_now
     where session_id = s.session_id;
    update public.restaurant_tables set status = 'available'
     where table_id = s.table_id and status = 'dining';
    insert into public.activity_logs (user_id, action, record_type, record_id, details)
    values (null, 'auto_end', 'dining_session', s.session_id,
            jsonb_build_object('table_number', s.table_number,
                               'guest_name', s.guest_name,
                               'quiet_minutes', v_quiet));
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

-- Only the scheduled task runs these.
revoke execute on function public.auto_release_minutes() from public, anon, authenticated;
revoke execute on function public.release_finished_tables() from public, anon, authenticated;

-- Every minute, next to the late-reservation task from 02_cron.sql.
-- (Running this file again replaces the job of the same name.)
select cron.schedule(
  'release-finished-tables',
  '* * * * *',
  $$ select public.release_finished_tables(); $$
);

-- Make the API see the new and changed functions straight away.
notify pgrst, 'reload schema';

-- To check that it runs:   select * from cron.job_run_details order by start_time desc limit 5;
-- To stop it:              select cron.unschedule('release-finished-tables');
-- To see what it did:      select * from public.activity_logs where action = 'auto_end' order by created_at desc;

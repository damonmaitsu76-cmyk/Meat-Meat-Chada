-- =====================================================================
-- MEAT ME AT CHADA - hardening
-- Run after supabase/sql/01_schema.sql ... 13_bulk_orders_and_auto_release.sql.
-- Safe to run again.
-- Deploy the matching front end right after running it: the reservation lookup and
-- cancel functions now take the last 4 digits of the guest's phone number.
--
--   1) A table can send at most one new request every 20 seconds.
--   2) Staff can reject a table request (new status "cancelled"). Rejected requests are
--      left out of the reports and never count as an open order for the automatic
--      table release.
--   3) Pending online reservations are capped (setting max_pending_reservations, 40;
--      0 = no cap), so a flood cannot bury real requests.
--   4) Looking up or cancelling a reservation needs the reservation ID and the last 4
--      digits of the phone number it was booked with.
--   5) The phone number of a reservation is masked after contact_retention_days (60)
--      days. The column cannot be empty, so the value becomes '(removed)'.
--   6) get_table_requests no longer returns the notes of the table's requests.
-- =====================================================================


-- 1) COOLDOWN PER TABLE ---------------------------------------------------

create or replace function public.guard_refill_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.refill_requests r
             where r.table_id = new.table_id
               and r.created_at > now() - interval '20 seconds') then
    raise exception 'Please wait a few seconds before sending another request.';
  end if;
  return new;
end $$;

drop trigger if exists refill_requests_guard on public.refill_requests;
create trigger refill_requests_guard
  before insert on public.refill_requests
  for each row execute function public.guard_refill_insert();

revoke execute on function public.guard_refill_insert() from public, anon, authenticated;


-- 2) STAFF CAN REJECT A TABLE REQUEST -------------------------------------

-- The old status rule has an automatic name; find it by what it checks.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.refill_requests'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.refill_requests drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.refill_requests
  add constraint refill_requests_status_check
  check (status in ('sent', 'accepted', 'ready', 'served', 'cancelled'));

create or replace function public.cancel_refill_request(p_request_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r        public.refill_requests;
  v_number integer;
begin
  perform public.assert_role(array['staff', 'manager', 'owner']);

  select * into r from public.refill_requests where request_id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status not in ('sent', 'accepted', 'ready') then
    raise exception 'Only open requests can be rejected (current status: %)', r.status;
  end if;

  update public.refill_requests
     set status = 'cancelled', handled_by = auth.uid()
   where request_id = r.request_id;

  select table_number into v_number from public.restaurant_tables where table_id = r.table_id;
  perform public.log_activity('reject', 'refill_request', r.request_id,
    jsonb_build_object('request_number', r.request_number, 'table_number', v_number));
end $$;

revoke execute on function public.cancel_refill_request(bigint) from public, anon, authenticated;
grant execute on function public.cancel_refill_request(bigint) to authenticated;

-- A rejected request must not come back to life if two staff tap at the same moment.
create or replace function public.advance_refill_request(p_request_id bigint, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r       public.refill_requests;
  v_order constant text[] := array['sent', 'accepted', 'ready', 'served'];
begin
  perform public.assert_role(array['staff', 'manager', 'owner']);
  if p_status not in ('accepted', 'ready', 'served') then
    raise exception 'Invalid status';
  end if;

  select * into r from public.refill_requests where request_id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status = 'cancelled' then raise exception 'This request was rejected'; end if;
  if array_position(v_order, p_status) <= array_position(v_order, r.status) then
    raise exception 'Request is already %', r.status;
  end if;

  update public.refill_requests
     set status      = p_status,
         accepted_at = case when p_status in ('accepted', 'ready', 'served')
                            then coalesce(accepted_at, now()) else accepted_at end,
         ready_at    = case when p_status in ('ready', 'served')
                            then coalesce(ready_at, now()) else ready_at end,
         served_at   = case when p_status = 'served' then now() else served_at end,
         handled_by  = auth.uid()
   where request_id = r.request_id;
end $$;

revoke execute on function public.advance_refill_request(bigint, text) from public, anon, authenticated;
grant execute on function public.advance_refill_request(bigint, text) to authenticated;

-- Automatic table release (13): a rejected request is neither an order nor an open order.
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

  for s in
    select ds.session_id, ds.table_id, ds.guest_name, t.table_number
    from public.dining_sessions ds
    join public.restaurant_tables t on t.table_id = ds.table_id
    where ds.status = 'seated'
      -- seated longer than the time slot
      and ds.seated_at + make_interval(mins => v_slot) <= v_now
      -- ordered at least once since sitting down (a rejected request does not count)
      and exists (select 1 from public.refill_requests r
                  where r.table_id = ds.table_id and r.created_at >= ds.seated_at
                    and r.status <> 'cancelled')
      -- and nothing is still open
      and not exists (select 1 from public.refill_requests r
                      where r.table_id = ds.table_id and r.created_at >= ds.seated_at
                        and r.status not in ('served', 'cancelled'))
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

revoke execute on function public.release_finished_tables() from public, anon, authenticated;

-- Reports (04): rejected requests are not counted.
create or replace function public.get_report(p_from date, p_to date)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_res   jsonb;
  v_sess  jsonb;
  v_req   jsonb;
  v_daily jsonb;
begin
  perform public.assert_role(array['manager', 'owner']);

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Choose a valid date range';
  end if;
  if p_to - p_from > 366 then
    raise exception 'Choose a range of one year or less';
  end if;

  select jsonb_build_object(
           'total',     count(*),
           'pending',   count(*) filter (where status = 'pending'),
           'approved',  count(*) filter (where status = 'approved'),
           'arrived',   count(*) filter (where status = 'arrived'),
           'no_show',   count(*) filter (where status = 'auto_cancelled'),
           'declined',  count(*) filter (where status = 'declined'),
           'cancelled', count(*) filter (where status = 'cancelled'))
    into v_res
    from public.reservations
   where reservation_date between p_from and p_to;

  select jsonb_build_object(
           'parties',            count(*),
           'guests',             coalesce(sum(party_size), 0),
           'walk_in_guests',     coalesce(sum(party_size) filter (where source = 'walk_in'), 0),
           'reservation_guests', coalesce(sum(party_size) filter (where source = 'reservation'), 0))
    into v_sess
    from public.dining_sessions
   where (seated_at at time zone 'Asia/Manila')::date between p_from and p_to;

  select jsonb_build_object(
           'total',  count(*) filter (where status <> 'cancelled'),
           'served', count(*) filter (where status = 'served'),
           'avg_serve_minutes',
             round(((avg(extract(epoch from (served_at - created_at)))
                     filter (where status = 'served' and served_at is not null)) / 60)::numeric, 1))
    into v_req
    from public.refill_requests
   where (created_at at time zone 'Asia/Manila')::date between p_from and p_to;

  -- one row per day of the range, including days with nothing in them
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'day',          d.day,
             'reservations', coalesce(r.total, 0),
             'arrived',      coalesce(r.arrived, 0),
             'no_shows',     coalesce(r.no_shows, 0),
             'guests',       coalesce(s.guests, 0),
             'requests',     coalesce(q.total, 0))
           order by d.day), '[]'::jsonb)
    into v_daily
    from generate_series(0, p_to - p_from) as g(n)
   cross join lateral (select p_from + g.n as day) d
    left join (
      select reservation_date as day,
             count(*) as total,
             count(*) filter (where status = 'arrived') as arrived,
             count(*) filter (where status = 'auto_cancelled') as no_shows
        from public.reservations
       where reservation_date between p_from and p_to
       group by reservation_date
    ) r on r.day = d.day
    left join (
      select (seated_at at time zone 'Asia/Manila')::date as day, sum(party_size) as guests
        from public.dining_sessions
       where (seated_at at time zone 'Asia/Manila')::date between p_from and p_to
       group by 1
    ) s on s.day = d.day
    left join (
      select (created_at at time zone 'Asia/Manila')::date as day, count(*) as total
        from public.refill_requests
       where (created_at at time zone 'Asia/Manila')::date between p_from and p_to
         and status <> 'cancelled'
       group by 1
    ) q on q.day = d.day;

  return jsonb_build_object(
    'reservations', v_res,
    'sessions',     v_sess,
    'requests',     v_req,
    'daily',        v_daily);
end $$;

revoke execute on function public.get_report(date, date) from public, anon, authenticated;
grant execute on function public.get_report(date, date) to authenticated;


-- 3) CAP ON PENDING ONLINE RESERVATIONS -----------------------------------

insert into public.settings (setting_key, setting_value) values
  ('max_pending_reservations', '40')
on conflict (setting_key) do nothing;

create or replace function public.guard_reservation_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_cap integer := coalesce(nullif(public.get_setting('max_pending_reservations'), '')::integer, 40);
begin
  if v_cap > 0
     and (select count(*) from public.reservations where status = 'pending') >= v_cap then
    raise exception 'Online reservations are full for the moment. Please message the restaurant directly.';
  end if;
  return new;
end $$;

drop trigger if exists reservations_guard on public.reservations;
create trigger reservations_guard
  before insert on public.reservations
  for each row execute function public.guard_reservation_insert();

revoke execute on function public.guard_reservation_insert() from public, anon, authenticated;


-- 4) LOOK UP OR CANCEL A RESERVATION: ID + LAST 4 DIGITS OF THE PHONE -------

-- The one-argument versions go away, so the ID alone no longer opens anything.
drop function if exists public.get_reservation(text);
drop function if exists public.cancel_reservation(text);

create or replace function public.get_reservation(p_code text, p_phone_last4 text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'reservation_code', reservation_code,
    'customer_name',    customer_name,
    'guest_count',      guest_count,
    'reservation_date', reservation_date,
    'reservation_time', reservation_time,
    'status',           status,
    'decline_reason',   decline_reason)
  from public.reservations
  where reservation_code = upper(trim(p_code))
    and trim(p_phone_last4) ~ '^[0-9]{4}$'
    and right(contact_number, 4) = trim(p_phone_last4)
$$;

-- Same message for a wrong ID, a wrong phone and a reservation that is already closed.
create or replace function public.cancel_reservation(p_code text, p_phone_last4 text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_id    bigint;
  v_table bigint;
begin
  update public.reservations
     set status = 'cancelled'
   where reservation_code = upper(trim(p_code))
     and trim(coalesce(p_phone_last4, '')) ~ '^[0-9]{4}$'
     and right(contact_number, 4) = trim(p_phone_last4)
     and status in ('pending', 'approved')
  returning reservation_id, table_id into v_id, v_table;

  if v_id is null then
    raise exception 'Reservation not found or can no longer be cancelled';
  end if;

  -- free the table if it was being held for this guest
  update public.restaurant_tables set status = 'available'
   where table_id = v_table and status = 'reserved';

  return jsonb_build_object('status', 'cancelled');
end $$;

revoke execute on function public.get_reservation(text, text) from public, anon, authenticated;
revoke execute on function public.cancel_reservation(text, text) from public, anon, authenticated;
grant execute on function public.get_reservation(text, text) to anon, authenticated;
grant execute on function public.cancel_reservation(text, text) to anon, authenticated;


-- 5) MASK OLD PHONE NUMBERS -----------------------------------------------

insert into public.settings (setting_key, setting_value) values
  ('contact_retention_days', '60')
on conflict (setting_key) do nothing;

-- Masking a number is housekeeping, not a change to the reservation, so it must not move
-- updated_at (the dashboard lists no-shows released in the last 2 hours by updated_at).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  if new.contact_number = '(removed)' and old.contact_number <> '(removed)'
     and (to_jsonb(new) - 'contact_number' - 'updated_at')
         = (to_jsonb(old) - 'contact_number' - 'updated_at') then
    return new;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.purge_old_contacts()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_days  integer := coalesce(nullif(public.get_setting('contact_retention_days'), '')::integer, 60);
  v_count integer;
begin
  if v_days <= 0 then
    return 0; -- switched off
  end if;

  update public.reservations
     set contact_number = '(removed)'
   where contact_number <> '(removed)'
     and reservation_date < public.local_now()::date - v_days;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.purge_old_contacts() from public, anon, authenticated;

-- Every day at 3:15 AM Philippine time (19:15 UTC). Running this file again replaces the job.
select cron.schedule(
  'purge-old-contacts',
  '15 19 * * *',
  $$ select public.purge_old_contacts(); $$
);


-- 6) NOTES STAY WITH THE STAFF ----------------------------------------------

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

revoke execute on function public.get_table_requests(uuid) from public, anon, authenticated;
grant execute on function public.get_table_requests(uuid) to anon, authenticated;


-- Make the API see the new and changed functions straight away.
notify pgrst, 'reload schema';

-- To check the daily job:  select * from cron.job where jobname = 'purge-old-contacts';
-- To see what a run did:   select * from cron.job_run_details order by start_time desc limit 5;

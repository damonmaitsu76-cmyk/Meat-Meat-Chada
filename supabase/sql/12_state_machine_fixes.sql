-- =====================================================================
-- MEAT ME AT CHADA - state machine fixes
-- Run after supabase/sql/01_schema.sql ... 11_phone_validation.sql. Safe to run again.
-- Run it BEFORE you deploy the matching front end (see README).
--
-- Each section fixes one issue from docs/STATE_MACHINES.md:
--   1) Pending reservations never expire: they pile up on the dashboard and use up
--      a guest's 3-pending limit. The every-minute task now declines them once the
--      time they asked for (plus the grace period) has passed.
--   2) A guest who arrives cannot be seated at another table: confirm_arrival now
--      checks that the other table is free and big enough, so staff can use it.
--   3) Table status and seating rules: a table with seated guests cannot be marked
--      available or reserved, a held table cannot be freed by hand, only one seated
--      session per table, and a table with guests or bookings cannot be removed.
--   4) Retries create duplicates: submitting the same reservation or table request
--      twice returns the first one.
--   5) The last active manager account cannot be demoted or deactivated, even by two
--      managers acting at the same moment.
-- =====================================================================


-- =====================================================================
-- 1) PENDING RESERVATIONS EXPIRE
-- Same rule approve_reservation already uses: after the reserved time plus the
-- grace period nobody can approve it any more, so the request is closed here.
-- The customer sees it as declined, with the message below.
-- =====================================================================

create or replace function public.release_late_reservations()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  r       record;
  v_count integer := 0;
  v_now   timestamp := public.local_now();
  v_grace integer := public.grace_minutes();
begin
  -- 1) When an approved reservation's time arrives, mark its table 'reserved'.
  update public.restaurant_tables t
     set status = 'reserved'
    from public.reservations r2
   where r2.table_id = t.table_id
     and r2.status = 'approved'
     and (r2.reservation_date + r2.reservation_time) <= v_now
     and t.status = 'available';

  -- 2) Release guests who did not arrive within the grace period (counted as no-shows).
  for r in
    select reservation_id, reservation_code, table_id
    from public.reservations
    where status = 'approved'
      and (reservation_date + reservation_time) + make_interval(mins => v_grace) <= v_now
    for update
  loop
    update public.reservations set status = 'auto_cancelled' where reservation_id = r.reservation_id;
    update public.restaurant_tables set status = 'available'
     where table_id = r.table_id and status = 'reserved';
    insert into public.activity_logs (user_id, action, record_type, record_id, details)
    values (null, 'auto_cancel', 'reservation', r.reservation_id,
            jsonb_build_object('reservation_code', r.reservation_code,
                               'reason', 'arrival grace period passed'));
    v_count := v_count + 1;
  end loop;

  -- 3) Requests nobody answered before the guest's time: close them.
  --    (A later approve_reservation would refuse them anyway.)
  for r in
    select reservation_id, reservation_code
    from public.reservations
    where status = 'pending'
      and (reservation_date + reservation_time) + make_interval(mins => v_grace) <= v_now
    for update
  loop
    update public.reservations
       set status = 'declined',
           decline_reason = 'Sorry, we could not confirm this booking in time. Please book again.'
     where reservation_id = r.reservation_id;
    insert into public.activity_logs (user_id, action, record_type, record_id, details)
    values (null, 'decline', 'reservation', r.reservation_id,
            jsonb_build_object('reservation_code', r.reservation_code,
                               'reason', 'No staff reply before the reservation time'));
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;


-- =====================================================================
-- 2) SEAT AN ARRIVING GUEST AT ANOTHER TABLE
-- Before: the other table was not checked at all, and no screen could ask for one.
-- After:  the other table must have no seated guests, seat the party, and have no
--         booking or session overlapping the next time slot. The Reservations
--         screen now has an "Other table" button that uses this.
-- =====================================================================

create or replace function public.confirm_arrival(p_code text, p_table_id bigint default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  r        public.reservations;
  v_table  public.restaurant_tables;
  v_target bigint;
begin
  perform public.assert_role(array['staff', 'manager', 'owner']);
  perform pg_advisory_xact_lock(hashtext('chada_reservations'));

  select * into r from public.reservations
  where reservation_code = upper(trim(p_code)) for update;
  if not found then raise exception 'Reservation ID not found'; end if;
  if r.status <> 'approved' then
    raise exception 'This reservation is not approved (current status: %)', r.status;
  end if;
  if r.reservation_date <> public.local_now()::date then
    raise exception 'This reservation is not for today';
  end if;

  v_target := coalesce(p_table_id, r.table_id);
  select * into v_table from public.restaurant_tables where table_id = v_target and is_active;
  if not found then raise exception 'Table not found'; end if;
  if v_table.status = 'dining'
     or exists (select 1 from public.dining_sessions s
                where s.table_id = v_target and s.status = 'seated') then
    raise exception 'Table % is still occupied. Seat the guests at another table, or end that session first.',
      v_table.table_number;
  end if;

  if v_target <> r.table_id then
    if v_table.capacity < r.guest_count then
      raise exception 'Table % seats %, but this party is %.',
        v_table.table_number, v_table.capacity, r.guest_count;
    end if;
    if not exists (select 1 from public.tables_free_at(public.local_now(), r.reservation_id) t
                   where t.table_id = v_target) then
      raise exception 'Table % is booked or in use around this time. Choose another table.',
        v_table.table_number;
    end if;
  end if;

  insert into public.dining_sessions
    (table_id, reservation_id, guest_name, party_size, source, recorded_by)
  values (v_target, r.reservation_id, r.customer_name, r.guest_count, 'reservation', auth.uid());

  update public.restaurant_tables set status = 'dining' where table_id = v_target;
  if v_target <> r.table_id then
    update public.restaurant_tables set status = 'available'
     where table_id = r.table_id and status = 'reserved';
  end if;

  update public.reservations set status = 'arrived', table_id = v_target
   where reservation_id = r.reservation_id;

  perform public.log_activity('arrive', 'reservation', r.reservation_id,
    jsonb_build_object('reservation_code', r.reservation_code, 'table_number', v_table.table_number));

  return jsonb_build_object('table_number', v_table.table_number);
end $$;


-- =====================================================================
-- 3) TABLE STATUS AND SEATING RULES
-- =====================================================================

-- 3a) At most one seated session per table. If an older mistake left two, the
--     newest stays seated and the older ones are finished so the index can be built.
update public.dining_sessions s
   set status = 'finished', ended_at = coalesce(s.ended_at, now())
 where s.status = 'seated'
   and exists (select 1 from public.dining_sessions n
               where n.table_id = s.table_id and n.status = 'seated'
                 and (n.seated_at, n.session_id) > (s.seated_at, s.session_id));

create unique index if not exists dining_sessions_one_seated_per_table
  on public.dining_sessions (table_id) where status = 'seated';

-- 3b) Manual status changes from the floor view.
--     * 'dining' is only ever set by seating guests, never by hand.
--     * A table with seated guests cannot be changed (End session does that).
--     * A table held for an approved booking whose time has come cannot be freed by hand:
--       the every-minute task would hold it again, so cancel the booking instead.
create or replace function public.set_table_status(p_table_id bigint, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_table public.restaurant_tables;
  v_hold  text;
begin
  perform public.assert_role(array['staff', 'manager', 'owner']);
  perform pg_advisory_xact_lock(hashtext('chada_reservations'));

  if p_status = 'dining' then
    raise exception 'A table becomes dining only when guests are seated';
  end if;
  if p_status not in ('available', 'reserved') then
    raise exception 'Invalid table status';
  end if;

  select * into v_table from public.restaurant_tables where table_id = p_table_id;
  if not found then raise exception 'Table not found'; end if;

  if exists (select 1 from public.dining_sessions s
             where s.table_id = p_table_id and s.status = 'seated') then
    raise exception 'Guests are seated at Table %. End the session first.', v_table.table_number;
  end if;

  if p_status = 'available' then
    select r.reservation_code into v_hold
    from public.reservations r
    where r.table_id = p_table_id
      and r.status = 'approved'
      and (r.reservation_date + r.reservation_time) <= public.local_now()
    order by r.reservation_date, r.reservation_time
    limit 1;
    if v_hold is not null then
      raise exception 'Table % is held for %. Cancel that reservation to free the table.',
        v_table.table_number, v_hold;
    end if;
  end if;

  update public.restaurant_tables set status = p_status where table_id = p_table_id;
end $$;

-- 3c) Removing a table or making it smaller is checked here, in the database, with
--     fresh data. (The Tables screen only checks what it loaded earlier.)
--     It takes the same lock as seating and approving, so the two cannot overlap.
--     Two sessions touching the same table at the same instant can deadlock; the
--     database stops one of them with an error and the action can be repeated.
create or replace function public.guard_table_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_codes text;
begin
  if old.is_active and not new.is_active then
    perform pg_advisory_xact_lock(hashtext('chada_reservations'));
    if exists (select 1 from public.dining_sessions s
               where s.table_id = old.table_id and s.status = 'seated') then
      raise exception 'Table % has guests seated. End the session on the dashboard first.', old.table_number;
    end if;
    select string_agg(r.reservation_code, ', ' order by r.reservation_code) into v_codes
    from public.reservations r
    where r.table_id = old.table_id and r.status = 'approved';
    if v_codes is not null then
      raise exception 'Table % still has approved bookings (%). Remove it once they are done.',
        old.table_number, v_codes;
    end if;
  end if;

  if new.capacity < old.capacity
     and exists (select 1 from public.reservations r
                 where r.table_id = old.table_id and r.status = 'approved'
                   and r.guest_count > new.capacity) then
    raise exception 'Table % has an approved booking for more than % guests. Cancel or move it first.',
      old.table_number, new.capacity;
  end if;

  return new;
end $$;

drop trigger if exists restaurant_tables_guard on public.restaurant_tables;
create trigger restaurant_tables_guard
  before update on public.restaurant_tables
  for each row execute function public.guard_table_change();

revoke execute on function public.guard_table_change() from public, anon, authenticated;


-- =====================================================================
-- 4) RETRIES DO NOT CREATE DUPLICATES
-- =====================================================================

-- 4a) Reservation form: the same name, number, party, date and time that is still
--     pending is the same request. The lock makes two taps at once wait for each other.
--     (Also keeps the 3-pending limit exact.)
create or replace function public.submit_reservation(
  p_name text, p_contact text, p_guests integer, p_date date, p_time time
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_code text;
  v_max  integer;
begin
  p_name    := trim(p_name);
  p_contact := regexp_replace(trim(coalesce(p_contact, '')), '[\s().-]', '', 'g');

  if coalesce(p_name, '') = '' or length(p_name) > 80 then
    raise exception 'Please enter your name';
  end if;
  if p_contact !~ '^(\+63|63|0)9[0-9]{9}$' then
    raise exception 'Please enter a valid Philippine mobile number, like 0917 123 4567';
  end if;
  p_contact := '0' || right(p_contact, 10);

  select max(capacity) into v_max from public.restaurant_tables where is_active;
  if p_guests is null or p_guests < 1 or p_guests > coalesce(v_max, 0) then
    raise exception 'That party size is larger than our biggest table';
  end if;

  if p_date is null or p_date > public.local_now()::date + 60 then
    raise exception 'Please choose a date within the next 60 days';
  end if;

  perform pg_advisory_xact_lock(hashtext('chada_submit:' || p_contact));

  select reservation_code into v_code
  from public.reservations
  where contact_number = p_contact and status = 'pending'
    and reservation_date = p_date and reservation_time = p_time
    and guest_count = p_guests and customer_name = p_name
  limit 1;
  if v_code is not null then
    return jsonb_build_object('reservation_code', v_code, 'status', 'pending');
  end if;

  if not exists (
    select 1 from public.get_open_slots(p_date, p_guests) s
    where s.slot_time = p_time and s.is_open
  ) then
    raise exception 'That time slot is no longer available';
  end if;

  if (select count(*) from public.reservations
      where contact_number = p_contact and status = 'pending') >= 3 then
    raise exception 'You already have pending reservation requests';
  end if;

  loop
    v_code := public.gen_reservation_code();
    begin
      insert into public.reservations
        (reservation_code, customer_name, contact_number, guest_count,
         reservation_date, reservation_time)
      values (v_code, p_name, p_contact, p_guests, p_date, p_time);
      exit;
    exception when unique_violation then
      null; -- extremely rare code clash: try another code
    end;
  end loop;

  return jsonb_build_object('reservation_code', v_code, 'status', 'pending');
end $$;

-- 4b) Table requests: the QR menu sends a random token for each tray. Sending the
--     same token again (a lost reply, a second tap) returns the request that exists.
--     Old front ends that send no token keep working (the token is optional).
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
begin
  select * into v_table from public.restaurant_tables
  where qr_token = p_qr_token and is_active;
  if not found then
    raise exception 'Invalid table QR code';
  end if;

  -- a retry comes first, so it is answered even if the table has 5 open requests now
  if p_client_token is not null then
    select request_number, status into v_number, v_status
    from public.refill_requests
    where table_id = v_table.table_id and client_token = p_client_token;
    if found then
      return jsonb_build_object('request_number', v_number, 'status', v_status);
    end if;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'Choose at least one dish';
  end if;

  -- simple spam guard: at most 5 open requests per table
  if (select count(*) from public.refill_requests
      where table_id = v_table.table_id and status in ('sent', 'accepted')) >= 5 then
    raise exception 'This table already has several open requests. Please wait for the staff.';
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

-- A dropped function loses its grants, so give them again (same as 01_schema.sql, section 10).
revoke execute on function public.submit_refill_request(uuid, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.submit_refill_request(uuid, text, jsonb, uuid) to anon, authenticated;


-- =====================================================================
-- 5) THE LAST ACTIVE MANAGER STAYS
-- 05_accounts.sql stops you changing your own role. It cannot stop two managers
-- demoting each other at the same moment and leaving nobody in charge. The lock makes
-- the second change wait, see the first one, and fail.
-- =====================================================================

create or replace function public.guard_last_admin()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.role = 'admin' and old.status = 'active'
     and (new.role is distinct from 'admin' or new.status is distinct from 'active') then
    perform pg_advisory_xact_lock(hashtext('chada_admins'));
    if not exists (select 1 from public.users u
                   where u.role = 'admin' and u.status = 'active' and u.user_id <> old.user_id) then
      raise exception 'There must always be at least one active manager account.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists users_guard_last_admin on public.users;
create trigger users_guard_last_admin
  before update on public.users
  for each row execute function public.guard_last_admin();

revoke execute on function public.guard_last_admin() from public, anon, authenticated;

-- Check:  select indexname from pg_indexes where indexname in
--           ('dining_sessions_one_seated_per_table', 'refill_requests_client_token_uq');
--         select tgname from pg_trigger where tgname in ('restaurant_tables_guard', 'users_guard_last_admin');

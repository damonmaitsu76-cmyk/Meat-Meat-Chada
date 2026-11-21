-- =====================================================================
-- MEAT ME AT CHADA - database schema (Supabase / PostgreSQL)
--
-- Run the files in supabase/sql in filename order, 01 to 08.
--
-- Design rules:
--   * Customers are NOT logged in. They never touch tables directly;
--     they only call the public functions in section 6 (security definer).
--   * Staff / manager / owner log in with Supabase Auth. They READ tables
--     directly (protected by RLS) but WRITE through the functions in
--     section 7, so every rule (conflict check, status order, activity
--     log) is enforced in one place.
--   * Manager / owner can edit menu_items, restaurant_tables, settings and
--     staff accounts directly (RLS allows it).
--   * Times are stored as local Philippine time for reservations
--     (reservation_date + reservation_time) and timestamptz for events.
-- =====================================================================


-- =====================================================================
-- 1. TABLES  (the nine tables from Table 1 of the paper)
-- =====================================================================

-- users: profile of each staff / manager / owner. Passwords are handled by
-- Supabase Auth (auth.users), so there is no password_hash column here.
create table public.users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  username   text not null unique,
  role       text not null check (role in ('staff', 'manager', 'owner')),
  status     text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

create table public.restaurant_tables (
  table_id     bigint generated always as identity primary key,
  table_number integer not null unique check (table_number > 0),
  capacity     integer not null check (capacity > 0),
  qr_token     uuid not null unique default gen_random_uuid(),
  status       text not null default 'available'
               check (status in ('available', 'reserved', 'dining')),
  is_active    boolean not null default true
);

create table public.menu_items (
  item_id      bigint generated always as identity primary key,
  item_name    text not null check (length(trim(item_name)) > 0),
  category     text not null check (category in ('meats', 'sides', 'drinks')),
  is_available boolean not null default true
);
-- Same name + category = duplicate (case-insensitive). The CSV import relies on this.
create unique index menu_items_name_category_uq
  on public.menu_items (lower(item_name), category);

create table public.reservations (
  reservation_id   bigint generated always as identity primary key,
  reservation_code text not null unique,           -- the "reservation ID" shown to customers
  customer_name    text not null check (length(trim(customer_name)) > 0),
  contact_number   text not null check (length(trim(contact_number)) > 0),
  guest_count      integer not null check (guest_count > 0),
  reservation_date date not null,
  reservation_time time not null,
  table_id         bigint references public.restaurant_tables (table_id),  -- empty until approved
  status           text not null default 'pending'
                   check (status in ('pending', 'approved', 'declined',
                                     'cancelled', 'arrived', 'auto_cancelled')),
  decided_by       uuid references public.users (user_id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.dining_sessions (
  session_id     bigint generated always as identity primary key,
  table_id       bigint not null references public.restaurant_tables (table_id),
  reservation_id bigint unique references public.reservations (reservation_id), -- empty for walk-ins
  guest_name     text not null,
  party_size     integer not null check (party_size > 0),
  source         text not null check (source in ('reservation', 'walk_in')),
  seated_at      timestamptz not null default now(),
  ended_at       timestamptz,
  status         text not null default 'seated' check (status in ('seated', 'finished')),
  recorded_by    uuid references public.users (user_id)
);

create sequence public.request_number_seq;

create table public.refill_requests (
  request_id     bigint generated always as identity primary key,
  request_number text not null unique,
  table_id       bigint not null references public.restaurant_tables (table_id),
  note           text check (note is null or length(note) <= 300),
  status         text not null default 'sent'
                 check (status in ('sent', 'accepted', 'ready', 'served')),
  created_at     timestamptz not null default now(),
  accepted_at    timestamptz,
  ready_at       timestamptz,
  served_at      timestamptz,
  handled_by     uuid references public.users (user_id)
);

-- item_name is a snapshot, so old requests still read correctly if a dish is deleted later.
create table public.request_items (
  request_item_id bigint generated always as identity primary key,
  request_id      bigint not null references public.refill_requests (request_id) on delete cascade,
  item_id         bigint references public.menu_items (item_id) on delete set null,
  item_name       text not null,
  quantity        integer not null check (quantity between 1 and 20)
);

create table public.settings (
  setting_key   text primary key,
  setting_value text not null
);

-- user_id is empty when the system itself acts (grace-period release).
create table public.activity_logs (
  log_id      bigint generated always as identity primary key,
  user_id     uuid references public.users (user_id) on delete set null,
  action      text not null,
  record_type text not null,
  record_id   bigint,
  details     jsonb,
  created_at  timestamptz not null default now()
);

create index reservations_date_status_idx on public.reservations (reservation_date, status);
create index reservations_table_idx       on public.reservations (table_id);
create index dining_sessions_table_idx    on public.dining_sessions (table_id, status);
create index refill_requests_table_idx    on public.refill_requests (table_id, created_at);
create index refill_requests_status_idx   on public.refill_requests (status);
create index request_items_request_idx    on public.request_items (request_id);
create index activity_logs_created_idx    on public.activity_logs (created_at);


-- =====================================================================
-- 2. HELPER FUNCTIONS
-- =====================================================================

-- Current Philippine local time (no time zone attached).
create or replace function public.local_now()
returns timestamp
language sql stable
as $$ select now() at time zone 'Asia/Manila' $$;

-- Role of the logged-in user; null if not logged in or deactivated.
create or replace function public.current_user_role()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.users where user_id = auth.uid() and status = 'active'
$$;

-- Stops the function unless the caller has one of the given roles.
create or replace function public.assert_role(p_roles text[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_role text := public.current_user_role();
begin
  if v_role is null or not (v_role = any (p_roles)) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end $$;

create or replace function public.get_setting(p_key text)
returns text
language sql stable security definer set search_path = public
as $$ select setting_value from public.settings where setting_key = p_key $$;

create or replace function public.slot_minutes()
returns integer
language sql stable security definer set search_path = public
as $$ select coalesce(nullif(public.get_setting('slot_length_minutes'), '')::integer, 90) $$;

create or replace function public.grace_minutes()
returns integer
language sql stable security definer set search_path = public
as $$ select coalesce(nullif(public.get_setting('arrival_grace_minutes'), '')::integer, 15) $$;

create or replace function public.log_activity(
  p_action text, p_record_type text, p_record_id bigint, p_details jsonb default null
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.activity_logs (user_id, action, record_type, record_id, details)
  values (auth.uid(), p_action, p_record_type, p_record_id, p_details);
end $$;

-- Reservation ID such as CH-7K4M2X (no 0/O/1/I so it is easy to read out loud).
create or replace function public.gen_reservation_code()
returns text
language plpgsql
as $$
declare
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code  text := '';
  i     integer;
begin
  for i in 1..6 loop
    code := code || substr(chars, 1 + floor(random() * length(chars))::integer, 1);
  end loop;
  return 'CH-' || code;
end $$;


-- =====================================================================
-- 3. TRIGGERS
-- =====================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger reservations_updated_at
  before update on public.reservations
  for each row execute function public.set_updated_at();

-- Logs manager edits and deletions of menu items and tables into activity_logs.
-- Day-to-day changes (a dish availability toggle, a table status change) are skipped
-- so the log stays readable. Imports are logged with log_import() instead.
create or replace function public.log_row_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_row jsonb;
  v_id  bigint;
begin
  if tg_op = 'DELETE' then v_row := to_jsonb(old); else v_row := to_jsonb(new); end if;

  if tg_op = 'UPDATE' then
    if tg_table_name = 'menu_items'
       and (to_jsonb(old) - 'is_available') = (to_jsonb(new) - 'is_available') then
      return null;
    end if;
    if tg_table_name = 'restaurant_tables'
       and (to_jsonb(old) - 'status') = (to_jsonb(new) - 'status') then
      return null;
    end if;
  end if;

  v_id := (v_row ->> case tg_table_name when 'menu_items' then 'item_id' else 'table_id' end)::bigint;

  insert into public.activity_logs (user_id, action, record_type, record_id, details)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id, v_row);
  return null;
end $$;

create trigger menu_items_log
  after update or delete on public.menu_items
  for each row execute function public.log_row_change();

create trigger restaurant_tables_log
  after update or delete on public.restaurant_tables
  for each row execute function public.log_row_change();


-- =====================================================================
-- 4. ROW LEVEL SECURITY
-- No policy for anon = anonymous visitors cannot read or write any table.
-- (select ...) around the helper makes Postgres evaluate it once per query.
-- =====================================================================

alter table public.users             enable row level security;
alter table public.restaurant_tables enable row level security;
alter table public.menu_items        enable row level security;
alter table public.reservations      enable row level security;
alter table public.dining_sessions   enable row level security;
alter table public.refill_requests   enable row level security;
alter table public.request_items     enable row level security;
alter table public.settings          enable row level security;
alter table public.activity_logs     enable row level security;

-- users: everyone sees their own row; manager/owner see all.
-- Owner manages anyone; manager manages staff accounts only.
create policy users_select_self on public.users
  for select to authenticated using (user_id = auth.uid());
create policy users_select_admin on public.users
  for select to authenticated using ((select public.current_user_role()) in ('manager', 'owner'));
create policy users_write_admin on public.users
  for all to authenticated
  using (
    (select public.current_user_role()) = 'owner'
    or ((select public.current_user_role()) = 'manager' and role = 'staff')
  )
  with check (
    (select public.current_user_role()) = 'owner'
    or ((select public.current_user_role()) = 'manager' and role = 'staff')
  );

-- restaurant_tables and menu_items: any active staff reads; manager/owner write.
create policy rt_select_staff on public.restaurant_tables
  for select to authenticated using ((select public.current_user_role()) is not null);
create policy rt_write_admin on public.restaurant_tables
  for all to authenticated
  using ((select public.current_user_role()) in ('manager', 'owner'))
  with check ((select public.current_user_role()) in ('manager', 'owner'));

create policy mi_select_staff on public.menu_items
  for select to authenticated using ((select public.current_user_role()) is not null);
create policy mi_write_admin on public.menu_items
  for all to authenticated
  using ((select public.current_user_role()) in ('manager', 'owner'))
  with check ((select public.current_user_role()) in ('manager', 'owner'));

-- settings: staff read, manager/owner update.
create policy settings_select_staff on public.settings
  for select to authenticated using ((select public.current_user_role()) is not null);
create policy settings_update_admin on public.settings
  for update to authenticated
  using ((select public.current_user_role()) in ('manager', 'owner'))
  with check ((select public.current_user_role()) in ('manager', 'owner'));

-- Operational tables: staff read only. All writes go through the functions below.
create policy res_select_staff on public.reservations
  for select to authenticated using ((select public.current_user_role()) is not null);
create policy ds_select_staff on public.dining_sessions
  for select to authenticated using ((select public.current_user_role()) is not null);
create policy rr_select_staff on public.refill_requests
  for select to authenticated using ((select public.current_user_role()) is not null);
create policy ri_select_staff on public.request_items
  for select to authenticated using ((select public.current_user_role()) is not null);

-- activity log: manager/owner read only.
create policy al_select_admin on public.activity_logs
  for select to authenticated using ((select public.current_user_role()) in ('manager', 'owner'));


-- =====================================================================
-- 5. SLOT LOGIC (shared by the customer form and staff approval)
-- =====================================================================

-- Tables that are free for a whole time slot starting at p_start (local time).
-- A table is free when it has no APPROVED reservation and no SEATED session
-- overlapping [p_start, p_start + slot length).
create or replace function public.tables_free_at(
  p_start timestamp, p_exclude_reservation bigint default null
)
returns setof public.restaurant_tables
language sql stable security definer set search_path = public
as $$
  select t.*
  from public.restaurant_tables t
  where t.is_active
    and not exists (
      select 1 from public.reservations r
      where r.table_id = t.table_id
        and r.status = 'approved'
        and r.reservation_id is distinct from p_exclude_reservation
        and (r.reservation_date + r.reservation_time) < p_start + make_interval(mins => public.slot_minutes())
        and (r.reservation_date + r.reservation_time) + make_interval(mins => public.slot_minutes()) > p_start
    )
    and not exists (
      select 1 from public.dining_sessions s
      where s.table_id = t.table_id
        and s.status = 'seated'
        and (s.seated_at at time zone 'Asia/Manila') < p_start + make_interval(mins => public.slot_minutes())
        and (s.seated_at at time zone 'Asia/Manila') + make_interval(mins => public.slot_minutes()) > p_start
    )
$$;


-- =====================================================================
-- 6. PUBLIC FUNCTIONS - called by customers (no login)
-- =====================================================================

-- QR menu: table number + all dishes with availability.
create or replace function public.get_menu(p_qr_token uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_table public.restaurant_tables;
begin
  select * into v_table from public.restaurant_tables
  where qr_token = p_qr_token and is_active;
  if not found then
    raise exception 'Invalid table QR code';
  end if;

  return jsonb_build_object(
    'table_number', v_table.table_number,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'item_id', item_id, 'item_name', item_name,
               'category', category, 'is_available', is_available)
             order by item_name)
      from public.menu_items
    ), '[]'::jsonb)
  );
end $$;

-- Send a refill request.  p_items = [{"item_id": 1, "quantity": 2}, ...]
create or replace function public.submit_refill_request(
  p_qr_token uuid, p_note text, p_items jsonb
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_table      public.restaurant_tables;
  v_request_id bigint;
  v_number     text;
  v_bad        integer;
begin
  select * into v_table from public.restaurant_tables
  where qr_token = p_qr_token and is_active;
  if not found then
    raise exception 'Invalid table QR code';
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

  insert into public.refill_requests (request_number, table_id, note)
  values (v_number, v_table.table_id, left(nullif(trim(p_note), ''), 300))
  returning request_id into v_request_id;

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

-- Request status screen: this table's requests from the last 3 hours.
-- (Customers cannot use Realtime because they have no table access, so the
--  page should call this every few seconds.)
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
               select jsonb_agg(jsonb_build_object('item_name', i.item_name, 'quantity', i.quantity))
               from public.request_items i where i.request_id = r.request_id
             ), '[]'::jsonb))
           order by r.created_at desc)
    from public.refill_requests r
    where r.table_id = v_table_id
      and r.created_at > now() - interval '3 hours'
  ), '[]'::jsonb);
end $$;

-- Reservation form: every slot of the day with is_open = false when fully booked or past.
create or replace function public.get_open_slots(p_date date, p_guests integer)
returns table (slot_time time, is_open boolean)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_open  time;
  v_close time;
  v_len   integer := public.slot_minutes();
begin
  if p_guests is null or p_guests < 1 then
    raise exception 'Invalid number of guests';
  end if;
  v_open  := coalesce(nullif(public.get_setting('opening_time'), '')::time, '11:00');
  v_close := coalesce(nullif(public.get_setting('closing_time'), '')::time, '23:00');

  return query
  select g::time,
         (g > public.local_now()
          and exists (select 1 from public.tables_free_at(g) t where t.capacity >= p_guests))
  from generate_series(
         p_date + v_open,
         p_date + v_close - make_interval(mins => v_len),
         interval '30 minutes') as g;
end $$;

-- Submit a reservation request (status starts as 'pending').
-- The reservation_code is created now so the customer's browser can check the status,
-- but the page should only SHOW it as "your reservation ID" once status = 'approved'.
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
  p_contact := trim(p_contact);

  if coalesce(p_name, '') = '' or length(p_name) > 80 then
    raise exception 'Please enter your name';
  end if;
  if coalesce(p_contact, '') = '' or length(p_contact) > 40 then
    raise exception 'Please enter a contact number';
  end if;

  select max(capacity) into v_max from public.restaurant_tables where is_active;
  if p_guests is null or p_guests < 1 or p_guests > coalesce(v_max, 0) then
    raise exception 'That party size is larger than our biggest table';
  end if;

  if p_date is null or p_date > public.local_now()::date + 60 then
    raise exception 'Please choose a date within the next 60 days';
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

-- Look up a reservation by its ID.
create or replace function public.get_reservation(p_code text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'reservation_code', reservation_code,
    'customer_name',    customer_name,
    'guest_count',      guest_count,
    'reservation_date', reservation_date,
    'reservation_time', reservation_time,
    'status',           status)
  from public.reservations
  where reservation_code = upper(trim(p_code))
$$;

-- Customer cancels their own reservation (only while pending or approved).
create or replace function public.cancel_reservation(p_code text)
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


-- =====================================================================
-- 7. STAFF FUNCTIONS - called by logged-in staff / manager / owner
-- =====================================================================

create or replace function public.approve_reservation(
  p_reservation_id bigint, p_table_id bigint default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  r       public.reservations;
  v_start timestamp;
  v_table public.restaurant_tables;
begin
  perform public.assert_role(array['staff', 'manager', 'owner']);
  -- one approval at a time, so two requests can never take the same table
  perform pg_advisory_xact_lock(hashtext('chada_reservations'));

  select * into r from public.reservations where reservation_id = p_reservation_id for update;
  if not found then raise exception 'Reservation not found'; end if;
  if r.status <> 'pending' then
    raise exception 'Only pending reservations can be approved (current status: %)', r.status;
  end if;

  v_start := r.reservation_date + r.reservation_time;
  if v_start + make_interval(mins => public.grace_minutes()) <= public.local_now() then
    raise exception 'This reservation time has already passed';
  end if;

  if p_table_id is null then
    -- suggest the smallest free table that fits the party
    select t.* into v_table
    from public.tables_free_at(v_start, r.reservation_id) t
    where t.capacity >= r.guest_count
    order by t.capacity, t.table_number
    limit 1;
  else
    select t.* into v_table
    from public.tables_free_at(v_start, r.reservation_id) t
    where t.table_id = p_table_id and t.capacity >= r.guest_count;
  end if;
  if not found then
    raise exception 'No free table fits this reservation at that time';
  end if;

  update public.reservations
     set status = 'approved', table_id = v_table.table_id, decided_by = auth.uid()
   where reservation_id = r.reservation_id;

  perform public.log_activity('approve', 'reservation', r.reservation_id,
    jsonb_build_object('reservation_code', r.reservation_code, 'table_number', v_table.table_number));

  return jsonb_build_object('reservation_code', r.reservation_code,
                            'table_number', v_table.table_number);
end $$;

create or replace function public.decline_reservation(
  p_reservation_id bigint, p_reason text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r public.reservations;
begin
  perform public.assert_role(array['staff', 'manager', 'owner']);

  select * into r from public.reservations where reservation_id = p_reservation_id for update;
  if not found then raise exception 'Reservation not found'; end if;
  if r.status <> 'pending' then
    raise exception 'Only pending reservations can be declined (current status: %)', r.status;
  end if;

  update public.reservations
     set status = 'declined', decided_by = auth.uid()
   where reservation_id = r.reservation_id;

  perform public.log_activity('decline', 'reservation', r.reservation_id,
    jsonb_build_object('reservation_code', r.reservation_code, 'reason', nullif(trim(p_reason), '')));
end $$;

-- Guest arrives: staff enter the reservation ID. Optionally seat them at another table.
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
  if v_table.status = 'dining' then
    raise exception 'Table % is still occupied', v_table.table_number;
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

create or replace function public.record_walkin(
  p_name text, p_party_size integer, p_table_id bigint
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_table   public.restaurant_tables;
  v_session bigint;
begin
  perform public.assert_role(array['staff', 'manager', 'owner']);
  perform pg_advisory_xact_lock(hashtext('chada_reservations'));

  if coalesce(trim(p_name), '') = '' then raise exception 'Please enter the guest name'; end if;
  if p_party_size is null or p_party_size < 1 then raise exception 'Invalid party size'; end if;

  select * into v_table from public.restaurant_tables where table_id = p_table_id and is_active;
  if not found then raise exception 'Table not found'; end if;
  if v_table.status <> 'available' then
    raise exception 'Table % is not available (status: %)', v_table.table_number, v_table.status;
  end if;

  insert into public.dining_sessions (table_id, guest_name, party_size, source, recorded_by)
  values (p_table_id, trim(p_name), p_party_size, 'walk_in', auth.uid())
  returning session_id into v_session;

  update public.restaurant_tables set status = 'dining' where table_id = p_table_id;

  return jsonb_build_object('session_id', v_session, 'table_number', v_table.table_number);
end $$;

-- Guests finished: close the session and free the table.
create or replace function public.end_session(p_session_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_table bigint;
begin
  perform public.assert_role(array['staff', 'manager', 'owner']);

  update public.dining_sessions
     set status = 'finished', ended_at = now()
   where session_id = p_session_id and status = 'seated'
  returning table_id into v_table;
  if v_table is null then
    raise exception 'Session not found or already finished';
  end if;

  update public.restaurant_tables set status = 'available' where table_id = v_table;
end $$;

-- Manual status override from the floor view.
create or replace function public.set_table_status(p_table_id bigint, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_role(array['staff', 'manager', 'owner']);
  if p_status not in ('available', 'reserved', 'dining') then
    raise exception 'Invalid table status';
  end if;
  update public.restaurant_tables set status = p_status where table_id = p_table_id;
  if not found then raise exception 'Table not found'; end if;
end $$;

-- Staff toggle dish availability (manager/owner can also edit the row directly).
create or replace function public.set_dish_availability(p_item_id bigint, p_available boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_role(array['staff', 'manager', 'owner']);
  update public.menu_items set is_available = p_available where item_id = p_item_id;
  if not found then raise exception 'Dish not found'; end if;
end $$;

-- Move a refill request forward: accepted -> ready -> served.
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

-- The CSV import screen calls this once after an upload.
create or replace function public.log_import(
  p_record_type text, p_imported integer, p_skipped integer, p_failed integer
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_role(array['manager', 'owner']);
  perform public.log_activity('import', p_record_type, null,
    jsonb_build_object('imported', p_imported, 'skipped', p_skipped, 'failed', p_failed));
end $$;


-- =====================================================================
-- 8. SCHEDULED TASK FUNCTION (arrival grace period)
-- Scheduled every minute in supabase/sql/02_cron.sql. Nobody else can call it.
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

  return v_count;
end $$;


-- =====================================================================
-- 9. REALTIME  (staff screens update without refreshing)
-- =====================================================================

do $$
declare
  t text;
begin
  foreach t in array array['refill_requests', 'reservations', 'dining_sessions',
                           'restaurant_tables', 'menu_items'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null; -- already added
    end;
  end loop;
end $$;


-- =====================================================================
-- 10. PERMISSIONS
-- =====================================================================

revoke all on all tables in schema public from anon;

-- Newer Supabase projects do not give the logged-in role access to new tables
-- automatically, so grant exactly what is needed. Row Level Security (section 4)
-- still decides which rows each role may see or change.
grant usage on schema public to anon, authenticated;
revoke all on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.users, public.restaurant_tables, public.menu_items
  to authenticated;
grant update on public.settings to authenticated;

-- start from nothing, then grant only what each side needs
revoke execute on all functions in schema public from public, anon, authenticated;

-- customers (no login). Logged-in users are allowed too, which helps when testing.
grant execute on function
  public.get_menu(uuid),
  public.submit_refill_request(uuid, text, jsonb),
  public.get_table_requests(uuid),
  public.get_open_slots(date, integer),
  public.submit_reservation(text, text, integer, date, time),
  public.get_reservation(text),
  public.cancel_reservation(text)
to anon, authenticated;

-- logged-in users (each function checks the role again inside)
grant execute on function
  public.current_user_role(),
  public.approve_reservation(bigint, bigint),
  public.decline_reservation(bigint, text),
  public.confirm_arrival(text, bigint),
  public.record_walkin(text, integer, bigint),
  public.end_session(bigint),
  public.set_table_status(bigint, text),
  public.set_dish_availability(bigint, boolean),
  public.advance_refill_request(bigint, text),
  public.log_import(text, integer, integer, integer)
to authenticated;

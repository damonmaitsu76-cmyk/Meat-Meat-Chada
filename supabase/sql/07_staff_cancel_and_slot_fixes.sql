-- Staff cancellation and table availability fixes.

create or replace function public.staff_cancel_reservation(
  p_reservation_id bigint, p_reason text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r public.reservations;
begin
  perform public.assert_role(array['staff', 'manager', 'owner']);

  select * into r
  from public.reservations
  where reservation_id = p_reservation_id
  for update;
  if not found then raise exception 'Reservation not found'; end if;
  if r.status <> 'approved' then
    raise exception 'Reservation cannot be cancelled by staff (current status: %)', r.status;
  end if;

  update public.reservations set status = 'cancelled'
   where reservation_id = r.reservation_id;

  update public.restaurant_tables set status = 'available'
   where table_id = r.table_id and status = 'reserved';

  perform public.log_activity('staff_cancel', 'reservation', r.reservation_id,
    jsonb_build_object(
      'reservation_code', r.reservation_code,
      'reason', nullif(trim(p_reason), '')
    ));
end $$;

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
        -- Keep an overstaying party blocking the table, with a 30-minute buffer from now.
        and greatest(
          (s.seated_at at time zone 'Asia/Manila') + make_interval(mins => public.slot_minutes()),
          public.local_now() + interval '30 minutes'
        ) > p_start
    )
$$;

create or replace function public.record_walkin(
  p_name text, p_party_size integer, p_table_id bigint
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_table   public.restaurant_tables;
  v_session bigint;
  v_booking_time text;
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

  if not exists (
    select 1 from public.tables_free_at(public.local_now()) t
    where t.table_id = p_table_id
  ) then
    select to_char(r.reservation_time, 'HH12:MI AM') into v_booking_time
    from public.reservations r
    where r.table_id = p_table_id
      and r.status = 'approved'
      and (r.reservation_date + r.reservation_time) < public.local_now() + make_interval(mins => public.slot_minutes())
      and (r.reservation_date + r.reservation_time) + make_interval(mins => public.slot_minutes()) > public.local_now()
    order by r.reservation_date, r.reservation_time
    limit 1;

    raise exception 'Table % is booked for % today. Choose another table.',
      v_table.table_number, coalesce(v_booking_time, 'an active session');
  end if;

  insert into public.dining_sessions (table_id, guest_name, party_size, source, recorded_by)
  values (p_table_id, trim(p_name), p_party_size, 'walk_in', auth.uid())
  returning session_id into v_session;

  update public.restaurant_tables set status = 'dining' where table_id = p_table_id;

  return jsonb_build_object('session_id', v_session, 'table_number', v_table.table_number);
end $$;

revoke execute on function public.staff_cancel_reservation(bigint, text) from public, anon, authenticated;
grant execute on function public.staff_cancel_reservation(bigint, text) to authenticated;

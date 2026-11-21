-- =====================================================================
-- MEAT ME AT CHADA - decline reason shown to customers
-- Run after 01_schema.sql (any time). Safe to run again.
--
-- Staff can type a reason when they decline a reservation. It is now saved on
-- the reservation and returned by get_reservation, so the customer's status
-- page can show it. (Before, the reason only went to activity_logs.)
-- =====================================================================

alter table public.reservations add column if not exists decline_reason text;

create or replace function public.decline_reservation(
  p_reservation_id bigint, p_reason text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r        public.reservations;
  v_reason text := left(nullif(trim(p_reason), ''), 200);
begin
  perform public.assert_role(array['staff', 'manager', 'owner']);

  select * into r from public.reservations where reservation_id = p_reservation_id for update;
  if not found then raise exception 'Reservation not found'; end if;
  if r.status <> 'pending' then
    raise exception 'Only pending reservations can be declined (current status: %)', r.status;
  end if;

  update public.reservations
     set status = 'declined', decided_by = auth.uid(), decline_reason = v_reason
   where reservation_id = r.reservation_id;

  perform public.log_activity('decline', 'reservation', r.reservation_id,
    jsonb_build_object('reservation_code', r.reservation_code, 'reason', v_reason));
end $$;

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
    'status',           status,
    'decline_reason',   decline_reason)
  from public.reservations
  where reservation_code = upper(trim(p_code))
$$;
-- "create or replace" keeps the existing execute permissions of both functions.

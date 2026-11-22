-- =====================================================================
-- MEAT ME AT CHADA - strict contact number on reservations
-- Run after supabase/sql/01_schema.sql ... 10_samgyup_menu.sql. Safe to run again.
--
-- Before: submit_reservation accepted any text up to 40 characters as the
--         contact number.
-- After:  only a Philippine mobile number is accepted, written as
--         09XXXXXXXXX, +639XXXXXXXXX or 639XXXXXXXXX, with optional spaces,
--         dashes, dots or brackets. It is saved as 09XXXXXXXXX, so the
--         "3 pending requests per number" limit sees one number, not
--         several spellings of it.
--   * The browser checks the same rule in src/lib/phone.js.
--   * Reservations that are already saved are not changed.
-- =====================================================================

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

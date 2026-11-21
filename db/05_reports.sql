-- =====================================================================
-- MEAT ME AT CHADA - report totals (Reports and Insights screen)
-- Run after 01_schema.sql (any time). Safe to run again.
--
-- One function returns every number the Reports screen shows, already added up,
-- so the browser never has to download thousands of rows. Only the manager and
-- the owner can call it (the paper says staff cannot generate reports).
--
-- Definitions:
--   reservations   counted by their reservation date, by their status today
--   no-show        a reservation released after the grace period (auto_cancelled)
--   guests served  party sizes of every dining session seated in the period
--   refill wait    time from "sent" to "served", for served requests only
-- Days are Philippine local days (the restaurant runs on Manila time).
-- =====================================================================

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
           'total',  count(*),
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
       group by 1
    ) q on q.day = d.day;

  return jsonb_build_object(
    'reservations', v_res,
    'sessions',     v_sess,
    'requests',     v_req,
    'daily',        v_daily);
end $$;

-- logged-in users only (the function checks the role again inside)
revoke execute on function public.get_report(date, date) from public, anon, authenticated;
grant execute on function public.get_report(date, date) to authenticated;

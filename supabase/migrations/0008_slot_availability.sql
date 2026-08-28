-- 0008_slot_availability.sql
-- Live remaining capacity for the tourist: returns how many seats are already
-- taken for a given activity + date + time, WITHOUT exposing booking details.
-- security definer so anonymous tourists can read the aggregate (bookings RLS
-- otherwise hides all rows). Run in the Supabase SQL editor.

create or replace function public.slot_booked_seats(p_activity uuid, p_date text, p_time text)
returns int
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(number_of_people), 0)::int
  from bookings
  where activity_id = p_activity
    and scheduled_date = (p_date)::date
    and scheduled_time = (p_time)::time
    and booking_status in ('pending', 'pending_approval', 'confirmed', 'completed');
$$;

-- New functions already grant EXECUTE to PUBLIC (anon + authenticated) by
-- default, so no extra grant is needed. It only returns an aggregate count.

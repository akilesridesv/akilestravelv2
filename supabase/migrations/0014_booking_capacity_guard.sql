-- Additive checkout safety. STAGING FIRST; not executed against production.
-- Preserve existing booking/payment interfaces. No retroactive record changes.
begin;
create index if not exists bookings_departure_capacity_idx
  on public.bookings(activity_id,scheduled_date,scheduled_time);

create or replace function public.enforce_booking_capacity() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  a public.activities;
  slot_capacity integer;
  slot_status text;
  seats bigint;
begin
  if new.booking_status::text not in ('pending','pending_approval','confirmed','completed') then return new; end if;
  if new.number_of_people is null or new.number_of_people<1 or new.scheduled_date is null or new.scheduled_time is null then
    raise sqlstate 'PT400' using message='Invalid booking party or departure';
  end if;
  -- Existing occupied seats may be released or administratively confirmed
  -- without reapplying a past registration cutoff; increased/new seats cannot.
  if tg_op='UPDATE' then
    if old.booking_status::text in ('pending','pending_approval','confirmed','completed')
      and new.activity_id=old.activity_id and new.scheduled_date=old.scheduled_date
      and new.scheduled_time=old.scheduled_time and new.number_of_people<=old.number_of_people
    then return new; end if;
  end if;
  -- Serializes capacity-consuming writes for this activity. The following
  -- aggregate is a separate statement and sees prior commits at READ COMMITTED.
  if current_setting('transaction_isolation')<>'read committed' then
    raise sqlstate 'PT409' using message='Unsupported booking transaction isolation';
  end if;
  select * into a from public.activities where id=new.activity_id for update;
  if not found or not a.is_active or a.publication_status::text<>'published' then
    raise sqlstate 'PT409' using message='Experience is not bookable';
  end if;
  if a.provider_profile_id is not null and not exists(
    select 1 from public.provider_profiles p where p.id=a.provider_profile_id and p.verification_status::text='approved'
  ) then raise sqlstate 'PT409' using message='Provider is not bookable'; end if;
  if new.number_of_people<a.min_capacity or new.number_of_people>a.max_capacity then
    raise sqlstate 'PT409' using message='Party outside activity capacity';
  end if;
  if ((new.scheduled_date + new.scheduled_time) at time zone 'America/El_Salvador')
      < clock_timestamp()+make_interval(hours=>a.registration_deadline_hours) then
    raise sqlstate 'PT409' using message='Departure registration closed';
  end if;
  select d.capacity,d.status into slot_capacity,slot_status from public.date_slots d
    where d.activity_id=a.id and d.slot_date=new.scheduled_date and d.start_time=new.scheduled_time;
  if found then
    if slot_status<>'open' then raise sqlstate 'PT409' using message='Departure blocked'; end if;
  else
    select min(s.capacity) into slot_capacity from public.recurring_schedules s
      where s.activity_id=a.id and s.is_active and s.day_of_week=extract(dow from new.scheduled_date)::int
        and s.start_time=new.scheduled_time;
  end if;
  if slot_capacity is null then raise sqlstate 'PT409' using message='No scheduled departure'; end if;
  -- Legacy bookings do not record a tier ID and do not atomically maintain
  -- tier quantities. Finite tier stock cannot safely be promised yet.
  if exists(select 1 from public.ticket_tiers t where t.activity_id=a.id and t.quantity_available>0) then
    raise sqlstate 'PT409' using message='Finite ticket inventory requires assisted booking';
  end if;
  select coalesce(sum(b.number_of_people),0) into seats from public.bookings b
    where b.activity_id=a.id and b.scheduled_date=new.scheduled_date and b.scheduled_time=new.scheduled_time
      and b.id is distinct from new.id and b.booking_status::text in ('pending','pending_approval','confirmed','completed');
  if seats+new.number_of_people>least(slot_capacity,a.max_capacity) then
    raise sqlstate 'PT409' using message='Departure capacity exceeded';
  end if;
  return new;
end $$;
revoke all on function public.enforce_booking_capacity() from public,anon,authenticated;
create or replace trigger bookings_capacity_guard before insert or update on public.bookings
  for each row execute function public.enforce_booking_capacity();
commit;

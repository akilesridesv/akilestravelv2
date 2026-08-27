-- ===========================================================================
-- Akiles Travel v2 — initial schema (provider side)
-- Run in the Supabase SQL editor (or `supabase db push`).
-- Mirrors src/types/domain.ts. RLS: a provider manages only their own rows;
-- the public can read published + approved experiences.
-- ===========================================================================

-- Extensions -----------------------------------------------------------------
create extension if not exists "pgcrypto";

-- Enums ----------------------------------------------------------------------
do $$ begin
  create type listing_type as enum ('experience', 'event');
exception when duplicate_object then null; end $$;

do $$ begin
  create type publication_status as enum ('draft', 'pending_review', 'published', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type verification_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking_mode as enum ('instant', 'request');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking_status as enum (
    'pending', 'pending_approval', 'confirmed', 'completed',
    'cancelled', 'rejected', 'expired', 'payment_failed'
  );
exception when duplicate_object then null; end $$;

-- Helper: updated_at trigger -------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- profiles -------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  created_at timestamptz not null default now()
);

-- provider_profiles ----------------------------------------------------------
create table if not exists provider_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null default 'Mi negocio',
  bio text,
  verification_status verification_status not null default 'pending',
  booking_mode booking_mode not null default 'instant',
  created_at timestamptz not null default now(),
  unique (user_id)
);

-- activities (experiences) ---------------------------------------------------
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  provider_profile_id uuid references provider_profiles(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  listing_type listing_type not null default 'experience',
  title text not null,
  description text not null default '',
  highlights text[] not null default '{}',
  whats_included text[] not null default '{}',
  whats_not_included text[] not null default '{}',
  what_to_bring text[] not null default '{}',
  price_per_person numeric not null default 0,
  currency text not null default 'USD',
  min_capacity int not null default 1,
  max_capacity int not null default 10,
  duration_hours numeric not null default 2,
  languages text[] not null default array['Español'],
  category text,
  city text,
  area text,
  location_address text,
  location_lat double precision,
  location_lng double precision,
  image_urls text[] not null default '{}',
  featured_image text,
  publication_status publication_status not null default 'pending_review',
  is_active boolean not null default false,
  registration_deadline_hours int not null default 12,
  event_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists activities_created_by_idx on activities(created_by);
create index if not exists activities_public_idx on activities(publication_status, is_active);
create index if not exists activities_city_idx on activities(city);
drop trigger if exists activities_updated_at on activities;
create trigger activities_updated_at before update on activities
  for each row execute function set_updated_at();

-- recurring_schedules (weekly template) --------------------------------------
create table if not exists recurring_schedules (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time,
  capacity int not null default 10,
  is_active boolean not null default true,
  tier_ids uuid[] not null default '{}'
);
create index if not exists recurring_schedules_activity_idx on recurring_schedules(activity_id);

-- date_slots (concrete per-date availability, Airbnb calendar) ----------------
create table if not exists date_slots (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  slot_date date not null,
  start_time time not null,
  end_time time,
  capacity int not null default 10,
  status text not null default 'open',
  tier_ids uuid[] not null default '{}',
  unique (activity_id, slot_date, start_time)
);
create index if not exists date_slots_activity_date_idx on date_slots(activity_id, slot_date);

-- ticket_tiers ---------------------------------------------------------------
create table if not exists ticket_tiers (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  tier_name text not null default '',
  description text,
  price numeric not null default 0,
  quantity_available int not null default 0,
  quantity_sold int not null default 0
);
create index if not exists ticket_tiers_activity_idx on ticket_tiers(activity_id);

-- bookings -------------------------------------------------------------------
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  contact_name text not null,
  contact_email text not null,
  number_of_people int not null default 1,
  scheduled_date date,
  scheduled_time time,
  booking_status booking_status not null default 'pending_approval',
  confirmation_code text not null,
  subtotal_paid numeric not null default 0,
  service_fee_paid numeric not null default 0,
  total_paid numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists bookings_activity_idx on bookings(activity_id);
create index if not exists bookings_user_idx on bookings(user_id);

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table profiles            enable row level security;
alter table provider_profiles   enable row level security;
alter table activities          enable row level security;
alter table recurring_schedules enable row level security;
alter table date_slots          enable row level security;
alter table ticket_tiers        enable row level security;
alter table bookings            enable row level security;

-- profiles: a user sees/edits only their own row
create policy "own profile read"   on profiles for select using (auth.uid() = id);
create policy "own profile write"  on profiles for insert with check (auth.uid() = id);
create policy "own profile update" on profiles for update using (auth.uid() = id);

-- provider_profiles: owner manages; note verification_status must be changed by
-- an admin process (kept simple here — tighten before production).
create policy "own provider read"   on provider_profiles for select using (auth.uid() = user_id);
create policy "own provider write"   on provider_profiles for insert with check (auth.uid() = user_id);
create policy "own provider update"  on provider_profiles for update using (auth.uid() = user_id);
create policy "public provider read" on provider_profiles for select using (verification_status = 'approved');

-- activities: creator has full control; public reads published + active +
-- approved provider.
create policy "activities owner all" on activities for all
  using (auth.uid() = created_by) with check (auth.uid() = created_by);
create policy "activities public read" on activities for select using (
  is_active = true
  and publication_status = 'published'
  and (
    provider_profile_id is null
    or exists (
      select 1 from provider_profiles p
      where p.id = activities.provider_profile_id and p.verification_status = 'approved'
    )
  )
);

-- child tables inherit visibility from their activity ------------------------
create or replace function owns_activity(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from activities x where x.id = a and x.created_by = auth.uid());
$$;

create or replace function activity_is_public(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from activities x
    where x.id = a and x.is_active = true and x.publication_status = 'published'
  );
$$;

create policy "schedules owner all" on recurring_schedules for all
  using (owns_activity(activity_id)) with check (owns_activity(activity_id));
create policy "schedules public read" on recurring_schedules for select
  using (activity_is_public(activity_id));

create policy "dateslots owner all" on date_slots for all
  using (owns_activity(activity_id)) with check (owns_activity(activity_id));
create policy "dateslots public read" on date_slots for select
  using (activity_is_public(activity_id));

create policy "tiers owner all" on ticket_tiers for all
  using (owns_activity(activity_id)) with check (owns_activity(activity_id));
create policy "tiers public read" on ticket_tiers for select
  using (activity_is_public(activity_id));

-- bookings: the customer sees their own; the activity owner sees/updates
-- bookings for their activities.
create policy "bookings own read"   on bookings for select using (auth.uid() = user_id);
create policy "bookings own insert" on bookings for insert with check (auth.uid() = user_id or user_id is null);
create policy "bookings provider read"   on bookings for select using (owns_activity(activity_id));
create policy "bookings provider update" on bookings for update using (owns_activity(activity_id));

-- ===========================================================================
-- Auth trigger: create a profile row when a user signs up
-- ===========================================================================
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ===========================================================================
-- Storage bucket for experience images (public read)
-- ===========================================================================
insert into storage.buckets (id, name, public)
values ('experience-images', 'experience-images', true)
on conflict (id) do nothing;

create policy "experience images public read" on storage.objects for select
  using (bucket_id = 'experience-images');
create policy "experience images owner write" on storage.objects for insert
  with check (bucket_id = 'experience-images' and owner = auth.uid());
create policy "experience images owner delete" on storage.objects for delete
  using (bucket_id = 'experience-images' and owner = auth.uid());

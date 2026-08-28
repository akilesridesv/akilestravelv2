-- 0003_provider_profile.sql
-- Enrich provider_profiles with public profile info, contact channels, media,
-- social links and per-provider preferences. All columns are nullable / have
-- defaults so existing rows keep working. Run this in the Supabase SQL editor.

alter table provider_profiles
  add column if not exists tagline       text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists whatsapp      text,
  add column if not exists city          text,
  add column if not exists languages     text[]  not null default array['Español'],
  add column if not exists logo_url      text,
  add column if not exists cover_url     text,
  add column if not exists social        jsonb   not null default '{}'::jsonb,
  add column if not exists preferences   jsonb   not null default '{
    "notify_new_booking": true,
    "notify_cancellation": true,
    "notify_daily_summary": false,
    "notify_channel": "email",
    "auto_approve_bookings": true,
    "language": "es"
  }'::jsonb;

-- Public profile read already exists (verification_status = 'approved'); the new
-- columns are covered by the existing table-level select policy. No RLS change
-- needed: owners manage their own row via the existing "own provider update".

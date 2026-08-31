-- 0010_booking_checkout.sql
-- Extended checkout: adults/children split, promo code and per-passenger details.
-- Nullable / defaulted so existing rows keep working. Run in the Supabase SQL editor.

alter table bookings
  add column if not exists adults     int not null default 1,
  add column if not exists children   int not null default 0,
  add column if not exists promo_code text,
  add column if not exists passengers jsonb not null default '[]'::jsonb;

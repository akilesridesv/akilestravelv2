-- 0005_activity_country.sql
-- Country for an experience's location (shown with city/zone to the tourist).
-- Nullable; existing rows keep working. Run in the Supabase SQL editor.

alter table activities
  add column if not exists country text;

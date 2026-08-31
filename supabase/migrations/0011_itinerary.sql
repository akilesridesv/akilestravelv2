-- 0011_itinerary.sql
-- "Qué haremos" — a step-by-step itinerary the provider builds and tourists see
-- as a horizontal timeline. Each stop: { id, title, subtitle, time_range, detail,
-- image_url }. Stored inline as jsonb (like image_urls). Nullable/defaulted so
-- existing rows keep working. Run in the Supabase SQL editor.

alter table activities
  add column if not exists itinerary jsonb not null default '[]'::jsonb;

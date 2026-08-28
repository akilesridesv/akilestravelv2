-- 0004_cancellation_policy.sql
-- Free-text cancellation terms shown to tourists on the experience detail page.
-- Nullable; existing rows keep working. Run in the Supabase SQL editor.

alter table activities
  add column if not exists cancellation_policy text;

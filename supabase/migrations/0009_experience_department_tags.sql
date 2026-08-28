-- 0009_experience_department_tags.sql
-- Structured location (department) + free-form tags for better concierge search.
-- Nullable / defaulted so existing rows keep working. Run in the Supabase SQL editor.

alter table activities
  add column if not exists department text,
  add column if not exists tags text[] not null default '{}';

-- ===========================================================================
-- Akiles Travel v2 — copilot chat history
-- Stores the provider's conversation with the AI copilot so it persists across
-- sessions. Run after 0001_init.sql.
-- ===========================================================================

create table if not exists copilot_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  blocks jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index if not exists copilot_messages_user_idx on copilot_messages(user_id, created_at);

alter table copilot_messages enable row level security;

create policy "own messages read"   on copilot_messages for select using (auth.uid() = user_id);
create policy "own messages insert" on copilot_messages for insert with check (auth.uid() = user_id);
create policy "own messages delete" on copilot_messages for delete using (auth.uid() = user_id);

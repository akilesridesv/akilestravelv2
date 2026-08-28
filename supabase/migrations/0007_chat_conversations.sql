-- 0007_chat_conversations.sql
-- Multiple, per-user chat threads for the provider copilot (like separate
-- conversations), instead of one shared window. Run in the Supabase SQL editor.

create table if not exists chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nuevo chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table chat_conversations enable row level security;

-- Each user only sees/manages their own conversations.
create policy "own conversations" on chat_conversations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Link messages to a conversation (older messages keep conversation_id null).
alter table copilot_messages
  add column if not exists conversation_id uuid references chat_conversations(id) on delete cascade;

create index if not exists copilot_messages_conversation_idx
  on copilot_messages(conversation_id, created_at);

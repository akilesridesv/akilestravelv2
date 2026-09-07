-- Additive only. No changes to existing provider chats, bookings or Gemini Vault.
alter table public.activities add column if not exists recommendation_metadata jsonb not null default '{}'::jsonb;
comment on column public.activities.recommendation_metadata is 'Manually reviewed recommendation metadata. Empty means unknown; never auto-infer production values.';

create table public.concierge_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  token_hash text not null unique,
  state jsonb not null default '{}'::jsonb,
  version int not null default 0,
  lease_id uuid,
  lease_until timestamptz,
  last_turn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);
create table public.concierge_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.concierge_sessions(id) on delete cascade,
  request_id uuid not null,
  role text not null check (role in ('user','assistant')),
  content text not null check (length(content) <= 20000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(session_id, request_id, role)
);
create index concierge_messages_session_idx on public.concierge_messages(session_id, created_at);
alter table public.concierge_sessions enable row level security;
alter table public.concierge_messages enable row level security;
-- All access goes through token/owner-checked RPCs. No anonymous shared row policy.
revoke all on public.concierge_sessions, public.concierge_messages from anon, authenticated;

create function public.concierge_load(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.concierge_sessions; history jsonb;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid session token'; end if;
  insert into public.concierge_sessions(token_hash,user_id)
    values(encode(digest(p_token,'sha256'),'hex'),auth.uid()) on conflict(token_hash) do nothing;
  select * into s from public.concierge_sessions where token_hash=encode(digest(p_token,'sha256'),'hex');
  if s.user_id is distinct from auth.uid() or s.expires_at < now() then raise exception 'Session inaccessible'; end if;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at, case when m.role='user' then 0 else 1 end),'[]'::jsonb) into history
  from (select role,content,metadata,created_at from public.concierge_messages where session_id=s.id order by created_at desc limit 40) m;
  return jsonb_build_object('id',s.id,'userId',s.user_id,'state',s.state,'version',s.version,'messages',history);
end $$;

create function public.concierge_claim(p_token text,p_request uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.concierge_sessions; cached jsonb;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' or p_request is null then raise exception 'Invalid request'; end if;
  select * into s from public.concierge_sessions where token_hash=encode(digest(p_token,'sha256'),'hex') for update;
  if not found or s.user_id is distinct from auth.uid() or s.expires_at < now() then raise exception 'Session inaccessible'; end if;
  select metadata into cached from public.concierge_messages where session_id=s.id and request_id=p_request and role='assistant';
  if found then return jsonb_build_object('cached',cached); end if;
  if s.lease_until > now() then raise exception 'Turn already processing'; end if;
  if s.last_turn_at > now() - interval '1 second' then raise exception 'Please wait before another turn'; end if;
  if s.version >= 1000 then raise exception 'Session turn limit reached'; end if;
  update public.concierge_sessions set lease_id=p_request, lease_until=now()+interval '120 seconds',last_turn_at=now() where id=s.id;
  return jsonb_build_object('id',s.id,'userId',s.user_id,'state',s.state,'version',s.version);
end $$;

create function public.concierge_finish(p_token text,p_request uuid,p_version int,p_state jsonb,p_message text,p_response jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s public.concierge_sessions;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' or p_request is null then raise exception 'Invalid request'; end if;
  select * into s from public.concierge_sessions where token_hash=encode(digest(p_token,'sha256'),'hex') for update;
  if not found or s.user_id is distinct from auth.uid() or s.expires_at < now() then raise exception 'Session inaccessible'; end if;
  if exists(select 1 from public.concierge_messages where session_id=s.id and request_id=p_request and role='assistant') then return; end if;
  if s.lease_id is distinct from p_request or s.version<>p_version or s.lease_until<now() then raise exception 'Stale turn'; end if;
  if length(p_message)>2000 or length(p_state::text)>30000 or length(p_response::text)>60000 or
     p_state->>'conversationId' is distinct from s.id::text then raise exception 'Invalid turn'; end if;
  insert into public.concierge_messages(session_id,request_id,role,content,metadata) values
    (s.id,p_request,'user',p_message,'{}'::jsonb),
    (s.id,p_request,'assistant',p_response->>'text',p_response);
  update public.concierge_sessions set state=p_state,version=version+1,lease_id=null,lease_until=null,updated_at=now() where id=s.id;
end $$;

revoke all on function public.concierge_load(text) from public;
revoke all on function public.concierge_claim(text,uuid) from public;
revoke all on function public.concierge_finish(text,uuid,int,jsonb,text,jsonb) from public;
grant execute on function public.concierge_load(text) to anon,authenticated;
grant execute on function public.concierge_claim(text,uuid) to anon,authenticated;
grant execute on function public.concierge_finish(text,uuid,int,jsonb,text,jsonb) to anon,authenticated;

-- Read-only enrichment checklist: run this query and manually review these records.
-- select id,title,category,tags,recommendation_metadata from public.activities
-- where publication_status='published' and is_active and recommendation_metadata='{}'::jsonb;

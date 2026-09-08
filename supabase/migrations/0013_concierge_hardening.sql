-- Follow-up to immutable 0012. Apply in one transaction; safe to repeat.
-- No production execution by the review agent. Server-only RPC boundary.
begin;
revoke all on function public.concierge_load(text) from public,anon,authenticated,service_role;
revoke all on function public.concierge_claim(text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.concierge_finish(text,uuid,int,jsonb,text,jsonb) from public,anon,authenticated,service_role;
alter function public.concierge_load(text) set search_path='';
alter function public.concierge_claim(text,uuid) set search_path='';
alter function public.concierge_finish(text,uuid,int,jsonb,text,jsonb) set search_path='';

alter table public.concierge_sessions add column if not exists lease_nonce uuid;
alter table public.concierge_sessions add column if not exists request_hash text;
alter table public.concierge_messages add column if not exists request_hash text;
create index if not exists concierge_sessions_expiry_idx on public.concierge_sessions(expires_at);
create index if not exists concierge_sessions_user_idx on public.concierge_sessions(user_id);

create table if not exists public.concierge_runtime (
  id boolean primary key default true check(id), enabled boolean not null default false
);
insert into public.concierge_runtime(id,enabled) values(true,false) on conflict(id) do nothing;
create table if not exists public.concierge_rate_limits (
  bucket text primary key check(bucket ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null, hits integer not null check(hits>0)
);
alter table public.concierge_runtime enable row level security;
alter table public.concierge_rate_limits enable row level security;
revoke all on public.concierge_runtime,public.concierge_rate_limits from public,anon,authenticated;
revoke all on public.concierge_sessions,public.concierge_messages from public,anon,authenticated;

-- Quota applies across tokens (server supplies HMAC of trusted client IP).
-- In Vercel use its overwritten forwarding header, never a body-supplied IP.
create or replace function public.concierge_gate_v2(p_bucket text) returns void
language plpgsql security definer set search_path='' as $$
declare count_now integer;
begin
  if not coalesce((select enabled from public.concierge_runtime where id=true),false) then raise sqlstate 'PT503' using message='Concierge disabled'; end if;
  if p_bucket is null or p_bucket !~ '^[a-f0-9]{64}$' then raise sqlstate 'PT400' using message='Invalid quota scope'; end if;
  insert into public.concierge_rate_limits(bucket,window_start,hits) values(p_bucket,clock_timestamp(),1)
  on conflict(bucket) do update set
    hits=case when concierge_rate_limits.window_start < clock_timestamp()-interval '1 minute' then 1 else concierge_rate_limits.hits+1 end,
    window_start=case when concierge_rate_limits.window_start < clock_timestamp()-interval '1 minute' then clock_timestamp() else concierge_rate_limits.window_start end
  returning hits into count_now;
  if count_now>30 then raise sqlstate 'PT429' using message='Rate limit exceeded'; end if;
end $$;

create or replace function public.concierge_load_v2(p_hash text,p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.concierge_sessions; history jsonb;
begin
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise sqlstate 'PT400' using message='Invalid session'; end if;
  insert into public.concierge_sessions(token_hash,user_id) values(p_hash,p_user) on conflict(token_hash) do nothing;
  select * into s from public.concierge_sessions where token_hash=p_hash;
  if s.user_id is distinct from p_user or s.expires_at<clock_timestamp() then raise sqlstate 'PT403' using message='Session inaccessible'; end if;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at,case when m.role='user' then 0 else 1 end,m.id),'[]'::jsonb) into history
    from (select id,role,content,metadata,created_at from public.concierge_messages where session_id=s.id order by created_at desc,case when role='assistant' then 0 else 1 end,id desc limit 40) m;
  return jsonb_build_object('id',s.id,'userId',s.user_id,'state',s.state,'version',s.version,'messages',history);
end $$;

create or replace function public.concierge_claim_v2(p_hash text,p_user uuid,p_request uuid,p_message_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.concierge_sessions; m public.concierge_messages; nonce uuid;
begin
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_request is null or p_message_hash is null or p_message_hash !~ '^[a-f0-9]{64}$' then raise sqlstate 'PT400' using message='Invalid turn'; end if;
  select * into s from public.concierge_sessions where token_hash=p_hash for update;
  if not found or s.user_id is distinct from p_user or s.expires_at<clock_timestamp() then raise sqlstate 'PT403' using message='Session inaccessible'; end if;
  select * into m from public.concierge_messages where session_id=s.id and request_id=p_request and role='assistant';
  if found then
    if m.request_hash is distinct from p_message_hash then raise sqlstate 'PT409' using message='Request ID reused with different message'; end if;
    return jsonb_build_object('cached',m.metadata);
  end if;
  if s.lease_until>clock_timestamp() then raise sqlstate 'PT409' using message='Turn already processing'; end if;
  if s.version>=1000 then raise sqlstate 'PT429' using message='Session limit reached'; end if;
  if s.lease_id=p_request and s.request_hash is distinct from p_message_hash then raise sqlstate 'PT409' using message='Request ID reused'; end if;
  nonce:=gen_random_uuid();
  update public.concierge_sessions set lease_id=p_request,lease_nonce=nonce,request_hash=p_message_hash,lease_until=clock_timestamp()+interval '90 seconds',last_turn_at=clock_timestamp() where id=s.id;
  return jsonb_build_object('id',s.id,'userId',s.user_id,'state',s.state,'version',s.version,'nonce',nonce);
end $$;

create or replace function public.concierge_finish_v2(p_hash text,p_user uuid,p_request uuid,p_nonce uuid,p_version int,p_message_hash text,p_state jsonb,p_message text,p_response jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare s public.concierge_sessions; m public.concierge_messages;
begin
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_request is null or p_nonce is null or p_version is null or p_message_hash is null or p_message_hash !~ '^[a-f0-9]{64}$' then raise sqlstate 'PT400' using message='Invalid turn'; end if;
  if p_message is null or length(p_message) not between 1 and 2000 or p_state is null or jsonb_typeof(p_state)<>'object' or octet_length(p_state::text)>30000 or
     p_response is null or jsonb_typeof(p_response)<>'object' or octet_length(p_response::text)>60000 or p_response->>'text' is null then raise sqlstate 'PT400' using message='Invalid payload'; end if;
  select * into s from public.concierge_sessions where token_hash=p_hash for update;
  if not found or s.user_id is distinct from p_user or s.expires_at<clock_timestamp() then raise sqlstate 'PT403' using message='Session inaccessible'; end if;
  select * into m from public.concierge_messages where session_id=s.id and request_id=p_request and role='assistant';
  if found then
    if m.request_hash is distinct from p_message_hash then raise sqlstate 'PT409' using message='Request ID reused'; end if;
    return;
  end if;
  if s.lease_id is distinct from p_request or s.lease_nonce is distinct from p_nonce or s.request_hash is distinct from p_message_hash or s.version<>p_version or s.lease_until is null or s.lease_until<clock_timestamp() then raise sqlstate 'PT409' using message='Stale turn'; end if;
  if p_state->>'conversationId' is distinct from s.id::text or p_state->>'userId' is distinct from p_user::text then raise sqlstate 'PT400' using message='Invalid identity'; end if;
  insert into public.concierge_messages(session_id,request_id,request_hash,role,content,metadata) values
    (s.id,p_request,p_message_hash,'user',p_message,'{}'::jsonb),
    (s.id,p_request,p_message_hash,'assistant',p_response->>'text',p_response);
  update public.concierge_sessions set state=p_state,version=version+1,lease_id=null,lease_nonce=null,lease_until=null,updated_at=clock_timestamp() where id=s.id;
end $$;

revoke all on function public.concierge_gate_v2(text),public.concierge_load_v2(text,uuid),public.concierge_claim_v2(text,uuid,uuid,text),public.concierge_finish_v2(text,uuid,uuid,uuid,int,text,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.concierge_gate_v2(text),public.concierge_load_v2(text,uuid),public.concierge_claim_v2(text,uuid,uuid,text),public.concierge_finish_v2(text,uuid,uuid,uuid,int,text,jsonb,text,jsonb) to service_role;
commit;

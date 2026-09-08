-- STAGING ONLY kbdrinaqoalldrjstxkg. Ephemeral fixtures, ALL rolled back.
-- SQL role tests complement, and do not replace, real JWT/HTTP tests.
begin;
do $guard$ begin
  if not exists(select 1 from public.concierge_runtime where not enabled) then
    raise exception 'Run only before staging activation';
  end if;
end $guard$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('30000000-0000-4000-8000-000000000001','scope-one@example.invalid','{}'),
 ('30000000-0000-4000-8000-000000000002','scope-two@example.invalid','{}');

set local role anon;
do $test$ begin
  begin
    perform public.concierge_load_v2(repeat('a',64),null);
    raise exception 'FAIL: anon called session RPC';
  exception when insufficient_privilege then null; end;
  begin
    perform count(*) from public.concierge_sessions;
    raise exception 'FAIL: anon read sessions';
  exception when insufficient_privilege then null; end;
end $test$;
reset role;
set local role authenticated;
do $test$ begin
  begin
    perform public.concierge_load_v2(repeat('a',64),null);
    raise exception 'FAIL: authenticated called session RPC';
  exception when insufficient_privilege then null; end;
  begin
    perform count(*) from public.concierge_messages;
    raise exception 'FAIL: authenticated read messages';
  exception when insufficient_privilege then null; end;
end $test$;
reset role;
update public.concierge_runtime set enabled=true where id=true;
set local role service_role;
do $test$
declare
  guest jsonb; other_guest jsonb; claimed jsonb; replay jsonb;
  request_id uuid:=gen_random_uuid();
  owner_one uuid:='30000000-0000-4000-8000-000000000001';
  owner_two uuid:='30000000-0000-4000-8000-000000000002';
  i integer;
begin
  guest:=public.concierge_load_v2(repeat('a',64),null);
  other_guest:=public.concierge_load_v2(repeat('b',64),null);
  if guest->>'id'=other_guest->>'id' then raise exception 'FAIL: guest scope collision'; end if;
  perform public.concierge_load_v2(repeat('c',64),owner_one);
  begin
    perform public.concierge_load_v2(repeat('c',64),owner_two);
    raise exception 'FAIL: crossed authenticated owners';
  exception when sqlstate 'PT403' then null; end;
  begin
    perform public.concierge_load_v2(repeat('a',64),owner_one);
    raise exception 'FAIL: crossed guest/auth scope';
  exception when sqlstate 'PT403' then null; end;
  claimed:=public.concierge_claim_v2(repeat('a',64),null,request_id,repeat('d',64));
  begin
    perform public.concierge_finish_v2(repeat('a',64),null,request_id,gen_random_uuid(),0,repeat('d',64),jsonb_build_object('conversationId',guest->>'id'),'Prueba','{"text":"Prueba","recommendations":[]}');
    raise exception 'FAIL: invalid nonce accepted';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.concierge_finish_v2(repeat('a',64),null,request_id,(claimed->>'nonce')::uuid,null,repeat('d',64),jsonb_build_object('conversationId',guest->>'id'),'Prueba','{"text":"Prueba","recommendations":[]}');
    raise exception 'FAIL: null version accepted';
  exception when sqlstate 'PT400' then null; end;
  perform public.concierge_finish_v2(repeat('a',64),null,request_id,(claimed->>'nonce')::uuid,0,repeat('d',64),jsonb_build_object('conversationId',guest->>'id'),'Prueba','{"text":"Prueba","recommendations":[]}');
  replay:=public.concierge_claim_v2(repeat('a',64),null,request_id,repeat('d',64));
  if replay->'cached' is null then raise exception 'FAIL: replay not cached'; end if;
  begin
    perform public.concierge_claim_v2(repeat('a',64),null,request_id,repeat('e',64));
    raise exception 'FAIL: changed message replay accepted';
  exception when sqlstate 'PT409' then null; end;
  guest:=public.concierge_load_v2(repeat('a',64),null);
  if jsonb_array_length(guest->'messages')<>2 or (guest->>'version')::int<>1 then
    raise exception 'FAIL: persistence or idempotency';
  end if;
  for i in 1..30 loop perform public.concierge_gate_v2(repeat('f',64)); end loop;
  begin
    perform public.concierge_gate_v2(repeat('f',64));
    raise exception 'FAIL: rate limit did not apply';
  exception when sqlstate 'PT429' then null; end;
end $test$;
reset role;
select 'PASS: SQL roles, ownership, nonce, idempotency and quota' as result;
rollback;

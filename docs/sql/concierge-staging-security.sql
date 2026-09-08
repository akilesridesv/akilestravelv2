-- READ ONLY: run as migration owner ONLY AFTER confirming the staging project.
select current_database(),current_user;
select table_name,column_name,data_type from information_schema.columns
where table_schema='public' and
 (table_name in ('concierge_sessions','concierge_messages','concierge_runtime','concierge_rate_limits')
  or (table_name='activities' and column_name='recommendation_metadata'))
order by table_name,ordinal_position;
select tablename,rowsecurity from pg_tables
where schemaname='public' and tablename like 'concierge_%';
select indexname,indexdef from pg_indexes where schemaname='public'
and (tablename like 'concierge_%' or indexname='bookings_departure_capacity_idx') order by indexname;
select p.proname,p.prosecdef,p.proconfig,p.proacl from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and (p.proname like 'concierge_%' or p.proname='enforce_booking_capacity');
select p.oid::regprocedure as routine, r.role,
  has_function_privilege(r.role,p.oid,'EXECUTE') as can_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
cross join (values ('anon'),('authenticated'),('service_role')) r(role)
where n.nspname='public' and p.proname like 'concierge_%'
order by p.oid::regprocedure::text,r.role;
-- v1 false for all three; v2 false for anon/authenticated, true for service_role.
select enabled from public.concierge_runtime where id=true;
select tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename like 'concierge_%'; -- no shared client policies
select tgname,pg_get_triggerdef(oid) from pg_trigger
where tgrelid='public.bookings'::regclass and not tgisinternal;
-- Raw tokens are not columns; stored hashes must be 64 hex characters.
select count(*) as invalid_hashes from public.concierge_sessions where token_hash !~ '^[a-f0-9]{64}$';
-- Negative live guest/auth tests require separate sessions/JWTs; this owner
-- inspection cannot establish that those HTTP tests passed.

-- READ ONLY. Schema definitions only: no business rows, auth users, Vault
-- contents, migration bodies or llm_generate source are exported.
with relations as (
  select c.oid,c.relname,c.relrowsecurity,c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r'
), app_functions as (
  select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in
    ('activity_is_public','handle_new_user','is_admin','owns_activity','set_updated_at','slot_booked_seats')
)
select jsonb_build_object(
  'tables',(select jsonb_agg(jsonb_build_object('name',r.relname,'rls',r.relrowsecurity,'forceRls',r.relforcerowsecurity,
    'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) order by a.attnum)
      from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=r.oid and a.attnum>0 and not a.attisdropped)) order by r.relname) from relations r),
  'enums',(select jsonb_agg(x) from (select t.typname as name,jsonb_agg(e.enumlabel order by e.enumsortorder) as labels from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid where n.nspname='public' group by t.typname) x),
  'constraints',(select jsonb_agg(jsonb_build_object('table',r.relname,'name',c.conname,'kind',c.contype,'definition',pg_get_constraintdef(c.oid)) order by c.conname) from pg_constraint c join relations r on r.oid=c.conrelid),
  'indexes',(select jsonb_agg(pg_get_indexdef(i.indexrelid)) from pg_index i join relations r on r.oid=i.indrelid where not exists(select 1 from pg_constraint c where c.conindid=i.indexrelid)),
  'functions',(select jsonb_agg(pg_get_functiondef(f.oid) order by f.proname) from app_functions f),
  'policies',(select jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'permissive',permissive,'roles',roles,'command',cmd,'using',qual,'check',with_check) order by tablename,policyname) from pg_policies where schemaname='public'),
  'triggers',(select jsonb_agg(pg_get_triggerdef(t.oid) order by t.tgname) from pg_trigger t where not t.tgisinternal and (t.tgrelid in(select oid from relations) or (t.tgrelid='auth.users'::regclass and t.tgfoid in(select oid from app_functions)))),
  'grants',(select jsonb_agg(jsonb_build_object('table',table_name,'role',grantee,'privilege',privilege_type) order by table_name,grantee,privilege_type) from information_schema.table_privileges where table_schema='public' and grantee in('anon','authenticated','service_role')),
  'functionGrants',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'role',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type)) from pg_proc p join app_functions f on f.oid=p.oid cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 or pg_get_userbyid(a.grantee) in('anon','authenticated','service_role'))
) as schema_snapshot;

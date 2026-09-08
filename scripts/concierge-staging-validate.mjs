// Validates the reviewed snapshot + concierge deployment on LOCAL PostgreSQL.
// This is an operator preflight, not a claim about real Supabase or Gemini.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const db = new PGlite({ extensions:{pgcrypto} });
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions; create extension pgcrypto with schema extensions;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as 'select null::uuid';
    create function auth.jwt() returns jsonb language sql stable as 'select ''{}''::jsonb';
    grant usage on schema auth to anon,authenticated,service_role;`);
  const baseline = await readFile(new URL('.staging/catalog-schema.sql',root),'utf8');
  await db.exec(baseline);
  assert.equal((await db.query("select count(*)::int as n from pg_tables where schemaname='public'")).rows[0].n,18);
  assert.equal((await db.query("select count(*)::int as n from pg_policies where schemaname='public'")).rows[0].n,58);
  await assert.rejects(db.exec(baseline),/Fresh empty staging required/);
  await db.exec('rollback;');
  await db.exec(await readFile(new URL('.staging/concierge-deployment-unit.sql',root),'utf8'));
  await db.exec(await readFile(new URL('supabase/migrations/0014_booking_capacity_guard.sql',root),'utf8'));
  assert.equal((await db.query("select count(*)::int as n from pg_tables where schemaname='public'")).rows[0].n,22);
  assert.equal((await db.query("select enabled from public.concierge_runtime")).rows[0].enabled,false);
  await db.exec(await readFile(new URL('.staging/catalog-seed.sql',root),'utf8'));
  await db.exec('set role anon;');
  assert.equal((await db.query('select count(*)::int as n from public.activities')).rows[0].n,2);
  assert.equal((await db.query('select count(*)::int as n from public.recurring_schedules')).rows[0].n,5);
  const metadata=(await db.query('select recommendation_metadata from public.activities')).rows;
  assert(metadata.every(r=>Object.keys(r.recommendation_metadata).sort().join(',')==='desired_feelings,indoor_outdoor,interests,social_style'));
  await db.exec('reset role;');
  for (const role of ['anon','authenticated']) {
    const unsafe = await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' and
        (not c.relrowsecurity or has_table_privilege($1,c.oid,'TRUNCATE') or has_table_privilege($1,c.oid,'TRIGGER'))`,[role]);
    assert.equal(unsafe.rows.length,0);
    assert.equal((await db.query("select has_function_privilege($1,'public.concierge_load_v2(text,uuid)','EXECUTE') as allowed",[role])).rows[0].allowed,false);
    await db.exec(`set role ${role};`);
    assert.equal((await db.query('select count(*)::int as n from public.bookings')).rows[0].n,0);
    await db.exec('reset role;');
  }
  await db.exec(await readFile(new URL('docs/sql/concierge-staging-negative-tests.sql',root),'utf8'));
  assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n,2);
  assert.equal((await db.query('select count(*)::int as n from public.concierge_sessions')).rows[0].n,0);
  assert.equal((await db.query('select enabled from public.concierge_runtime')).rows[0].enabled,false);
  const count=(await db.query("select count(*)::int as n from pg_tables where schemaname='public' and rowsecurity")).rows[0].n;
  console.log(JSON.stringify({localPostgreSQL:true,tables:22,rlsTables:count,sourcePolicies:58,publicActivities:2,publicSchedules:5,approvedMetadataOnly:true,conciergeEnabled:false,destructiveRerunBlocked:true,remoteWrites:false}));
} finally { await db.close(); }

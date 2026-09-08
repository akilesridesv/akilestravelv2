// LOCAL artifact generator. Input is the manually reviewed, schema-only export
// from docs/sql/concierge-schema-snapshot.sql. No database/network connection.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const raw = await readFile(new URL('.staging/schema-snapshot.json', root), 'utf8');
const snapshot = JSON.parse(raw.replace(/^\uFEFF/, ''));
const ident = value => '"' + String(value).replaceAll('"', '""') + '"';
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
const table = name => `public.${ident(name)}`;
assert.equal(snapshot.tables.length, 18, 'Review changed source schema before regenerating');
assert.equal(snapshot.functions.length, 6);
assert(snapshot.tables.every(t => t.rls && t.columns.every(c => !c.identity && !c.generated && !c.default?.includes('nextval('))));
assert(!/vault\.|llm_generate|AIza[\w-]{20}/.test(JSON.stringify(snapshot)), 'Secret/gateway source is excluded');
const sql = [
  '-- STAGING ONLY: kbdrinaqoalldrjstxkg. Reviewed schema-only copy; no production records.',
  `-- Source snapshot SHA256: ${createHash('sha256').update(raw).digest('hex')}`,
  'begin;',
  `do $guard$ begin
    if exists(select 1 from pg_tables where schemaname='public') or exists(select 1 from auth.users) then
      raise exception 'Fresh empty staging required; refusing an existing database';
    end if;
  end $guard$;`,
  'set local search_path=public,extensions;',
  'create extension if not exists pgcrypto with schema extensions;',
];
for (const e of snapshot.enums) sql.push(`create type ${table(e.name)} as enum (${e.labels.map(literal).join(',')});`);
for (const t of snapshot.tables) {
  sql.push(`create table ${table(t.name)} (\n${t.columns.map(c => `  ${ident(c.name)} ${c.type}${c.default == null ? '' : ` default ${c.default}`}${c.notNull ? ' not null' : ''}`).join(',\n')}\n);`);
  sql.push(`alter table ${table(t.name)} enable row level security;`);
  if (t.forceRls) sql.push(`alter table ${table(t.name)} force row level security;`);
  // No implicit table grants, even if the project creation defaults exposed them.
  sql.push(`revoke all on ${table(t.name)} from public,anon,authenticated,service_role;`);
}
for (const fk of [false,true]) for (const c of snapshot.constraints.filter(c => (c.kind === 'f') === fk))
  sql.push(`alter table ${table(c.table)} add constraint ${ident(c.name)} ${c.definition};`);
sql.push(...snapshot.indexes.map(s => `${s};`), ...snapshot.functions.map(s => `${s.trim()};`));
for (const p of snapshot.policies) {
  assert(['ALL','SELECT','INSERT','UPDATE','DELETE'].includes(p.command));
  assert(['PERMISSIVE','RESTRICTIVE'].includes(p.permissive));
  sql.push(`create policy ${ident(p.name)} on ${table(p.table)} as ${p.permissive} for ${p.command} to ${p.roles.map(r => r === 'public' ? 'public' : ident(r)).join(',')}${p.using ? ` using (${p.using})` : ''}${p.check ? ` with check (${p.check})` : ''};`);
}
sql.push(...snapshot.triggers.map(s => `${s};`));
for (const t of snapshot.tables) {
  for (const role of ['anon','authenticated','service_role']) {
    // RLS does not protect TRUNCATE. Do not reproduce legacy broad default grants.
    const grants = [...new Set(snapshot.grants.filter(g => g.table === t.name && g.role === role && ['SELECT','INSERT','UPDATE','DELETE'].includes(g.privilege)).map(g => g.privilege))];
    if (grants.length) sql.push(`grant ${grants.join(',')} on ${table(t.name)} to ${ident(role)};`);
  }
}
for (const signature of [...new Set(snapshot.functionGrants.map(g => g.signature))]) {
  assert(/^[a-z_]+\([a-z, ]*\)$/.test(signature));
  sql.push(`revoke all on function public.${signature} from public,anon,authenticated,service_role;`);
  if (!/^(handle_new_user|set_updated_at)\(/.test(signature))
    sql.push(`grant execute on function public.${signature} to anon,authenticated,service_role;`);
}
sql.push('grant usage on schema public to anon,authenticated,service_role;', 'commit;');
await writeFile(new URL('.staging/catalog-schema.sql', root), sql.join('\n\n') + '\n');
console.log(JSON.stringify({ tables:snapshot.tables.length, policies:snapshot.policies.length, functions:snapshot.functions.length, output:'.staging/catalog-schema.sql', remoteWrites:false }));

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFile } from "node:fs/promises";
export const migration = (name: string) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
export async function localDatabase() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema extensions; create extension pgcrypto with schema extensions;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create table public.activities(id uuid primary key);
    grant usage on schema public to anon,authenticated,service_role;`);
  await db.exec(`begin; ${await migration("0012_concierge.sql")} commit;`);
  await db.exec(await migration("0013_concierge_hardening.sql"));
  return db;
}

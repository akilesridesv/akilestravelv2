// Builds a LOCAL artifact only. Never connects to any database.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const first = await readFile(new URL('supabase/migrations/0012_concierge.sql',root),'utf8');
const next = await readFile(new URL('supabase/migrations/0013_concierge_hardening.sql',root),'utf8');
if (!/^begin;$/mi.test(next) || !/^commit;\s*$/mi.test(next)) throw new Error('Unexpected migration transaction envelope');
const body = next.replace(/^begin;\s*$/mi,'').replace(/^commit;\s*$/mi,'');
if (/^\s*(begin|commit|rollback);/mi.test(first+body)) throw new Error('Nested transaction command; inspect manually');
const output = new URL('.staging/concierge-deployment-unit.sql',root);
await mkdir(new URL('.staging/',root),{recursive:true});
await writeFile(output,`-- STAGING ONLY. Fresh 0012 installation required. No automatic execution.\nbegin;\n${first}\n${body}\ncommit;\n`);
console.log(`Local deployment unit prepared: ${fileURLToPath(output)}`);

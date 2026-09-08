# Akiles Concierge — activation checklist

Operator runbook; these production steps were **not executed**. Current branch: `akiles-concierge`; flag **false**. Complete in staging first, then repeat on a deliberately selected production project after resolving the [review's deployment decisions](concierge-review.md).

## A. Database migration

1. Back up the database; confirm target project identity. Use a separate staging project with the existing application schema, without copying production customers/bookings. Inspect installed objects read-only:

   ```sql
   select current_database(), current_user,
     to_regclass('public.concierge_sessions') as sessions,
     to_regprocedure('public.concierge_gate_v2(text)') as hardened_gate;
   select column_name from information_schema.columns
     where table_schema='public' and table_name='activities'
       and column_name='recommendation_metadata';
   ```

2. Confirm activities, auth.users, schedules, slots, ticket tiers, provider profiles, pgcrypto, `slot_booked_seats` and Vault-backed `llm_generate` exist. **Do not rerun 0006:** its Vault placeholder update can overwrite the working Gemini key.
3. If 0012 is absent, apply exactly once in a transaction. From repo root, with an operator-provided `DATABASE_URL` in the environment (never committed):

   ```powershell
   psql -X "$env:DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/0012_concierge.sql
   if ($LASTEXITCODE -ne 0) { throw '0012 failed; stop and inspect' }
   ```

   SQL editor alternative: execute `BEGIN;` + entire 0012 + `COMMIT;` as one operation. If already installed, inspect/compare its schema and skip 0012. Unexpected partial objects require investigation, not blind reapplication. Do not replay all migrations over production.
4. Apply 0013, which includes its own transaction and is rerunnable:

   ```powershell
   psql -X "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0013_concierge_hardening.sql
   if ($LASTEXITCODE -ne 0) { throw '0013 failed; keep disabled' }
   ```

5. Verify as migration owner:

   ```sql
   select enabled from public.concierge_runtime where id=true; -- false initially
   select proname,proconfig from pg_proc where proname like 'concierge_%';
   select
     has_function_privilege('anon','public.concierge_load_v2(text,uuid)','EXECUTE') as anon_v2,
     has_function_privilege('authenticated','public.concierge_finish(text,uuid,int,jsonb,text,jsonb)','EXECUTE') as old_writer,
     has_function_privilege('service_role','public.concierge_load_v2(text,uuid)','EXECUTE') as server_v2;
   -- expected false, false, true; all concierge search_paths empty
   select tablename,rowsecurity from pg_tables
     where schemaname='public' and tablename like 'concierge_%'; -- all true
   ```

6. Leave runtime disabled until deployment is configured. Review [both activities' metadata worksheets](concierge-metadata-review.md) with providers. They are not update payloads; omit unknown fields. Empty metadata works but romance/family/intensity requests can correctly return no match.

## B. Environment variables

| Variable | Scope/value |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Existing public browser settings; staging points to staging. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Node overrides for same project, optional fallback to VITE public equivalents. Catalog/model use anon under RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | Required, server only, protected session RPCs. Never prefix VITE, put in frontend defines/logs/source/screenshots. |
| `VITE_CONCIERGE_ENABLED` | Keep false during installation. True enables built UI AND Node API; change requires rebuild/redeploy. |
| `CONCIERGE_AI_ENABLED` | True for real Gemini staging smoke; false for deterministic fallback. Not the feature kill switch. |
| `CONCIERGE_DEBUG` | False normally in production. True on Vercel logs safe summaries only. Full trace also requires local development mode. |

Gemini key remains in Supabase Vault `gemini_api_key`. Do not populate `VITE_AI_API_KEY` for this concierge. Test fixtures use synthetic keys and isolated PostgreSQL, never live credentials.

## C. Local / Vercel deployment

1. Run `npm ci`, `npm run check`, `npm run build` on Node 24 (reviewed runtime). Restart existing Vite after the security upgrade.
2. Deploy **Preview** from this branch/reviewed version, staging env only, feature flag false. Vercel preset Vite, repository root, build `npm run build`, output `dist`; `/api/concierge.ts` is the Node function. Pin a compatible Node runtime in project settings. Keep production unchanged.
3. Verify `vercel.json` excludes `/api/*` from SPA rewrite. Function maxDuration is 120s; confirm plan/runtime supports it. Browser timeout/lease are 90s; shared tools deadline is 65s plus bounded save. Frontend build does not prove function packaging.
4. POST `/api/concierge` while disabled: JSON 503, never index.html. Verify `/`, `/panel`, existing search/chat/auth.
5. Only when ready on **staging**, set `VITE_CONCIERGE_ENABLED=true`, redeploy, then set staging runtime:

   ```sql
   update public.concierge_runtime set enabled=true where id=true;
   ```

   Neither action was performed in this review. For local UI smoke, explicitly opt in via ignored `.env.local` pointing to staging, with debug true, and restart `npm run dev -- --host 127.0.0.1`. Never expose the development trace server publicly.
6. After smoke tests/manual decisions pass, select the reviewed version for production. Repeat target/env verification, migrate with flag off, deploy, and enable both gates intentionally. No main merge or production deploy is included in this task.

## D. Smoke tests and acceptance evidence

- Two independent guest browsers: “Tour de café para 2 personas”; only active published IDs. Reload; “¿Qué incluye?” preserves context/group.
- Accounts A/B: separate history; A's token with B's JWT returns 403. Guest history does not auto-merge on login.
- Same ID/message twice: same response, one message pair. Changed message with same ID: 409. Simultaneous turns: one claim wins; retry safely.
- “Tour de playa”, “algo en Guatemala”, “inventa un tour”: no unrelated/external matches for the two audited records.
- Unknown price/inclusions using staging fixtures only: explicitly unknown, never zero/free. Budget cannot pass an unknown price.
- Availability: verify date, time, activity max, slot capacity, aggregate booked seats and applicable tier inventory. Exercise full/blocked/no schedule and tool failure; unknown cannot mean available. Do not pay/reserve to test concierge itself.
- Reject/“too intense”, change budget/date: state persists, rejected ID excluded. Compare real pair vs real+nonexistent: clarify the unknown reference.
- “Book it”: only existing `/e/<id>` route; no booking/payment written. Independently test legacy checkout's final capacity validation before claiming booking readiness.
- Real Gemini in staging: valid extraction/ranking, supported `responseJsonSchema`, measured latency and invalid-output fallback. Mock tests are insufficient evidence for model quality/latency.
- Local debug: expand “Traza del turno (desarrollo)” for message, intent, before/after state, changes, tools, candidates, scores, rank IDs and verification. Preview/production response must contain no debug object even with summary logs enabled.
- 31 requests/minute from one IP across tokens: 429 after quota. Vercel must supply its overwritten x-forwarded-for. Other proxy deployments need a trusted-address configuration. This does not meter the direct legacy `llm_generate` RPC.
- Test immediate disable below with an already-open built client; subsequent API requests fail closed. Record staging evidence before production go/no-go.

## E. Rollback / disable without database rollback

**Immediate feature kill switch**, independent of rebuild:

```sql
update public.concierge_runtime set enabled=false where id=true;
```

Every new request checks runtime before loading state/model. Already-running requests may finish; it does not cancel an in-flight upstream request.

Then set `VITE_CONCIERGE_ENABLED=false` in the affected Vercel environment and redeploy. This hides the new UI, restores the old tourist flow, and blocks Node access. `CONCIERGE_AI_ENABLED=false` only enables deterministic fallback, not shutdown.

Leave both migrations/session data intact. No DROP/down migration/metadata removal/Vault change needed. If reverting application deployment, use a version with the concierge flag off. Re-enabling requires both gates and regression smoke tests.

Manual go/no-go: shared legacy Gemini access/quota policy; checkout failure/concurrency behavior; real Vercel/Gemini staging evidence; provider-reviewed metadata; retention policy; acceptance/remediation of moderate router advisories.

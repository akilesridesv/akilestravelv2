# Akiles Concierge — staging readiness checkpoint

Status: **NO-GO for production; staging database installed, end-to-end validation pending.** This checkpoint is not a completed staging assessment. Updated 2026-09-08.

| Area | Verified status |
| --- | --- |
| Staging URL | Supabase verified: `https://kbdrinaqoalldrjstxkg.supabase.co`, project `akiles-travel-staging`, us-east-1. The existing branch Preview at `https://akilestravelv2-git-akiles-concierge-akiles2.vercel.app` was inspected at old commit `f0cb390`; its environment isolation remains unverified. |
| Migrations | Applied and verified remotely: reviewed schema-only baseline (18 tables, 58 policies), 0012 + 0013 as one transaction, then 0014. Staging now has 22 tables with RLS. V1 execution is denied to anon/authenticated/service_role; V2 execution is service_role only; search paths and required indexes verified. Runtime remains disabled. Real JWT/HTTP and multi-connection tests pending. |
| Metadata | Both user-approved subsets are in the local seed plan. Seed passed local PostgreSQL validation, but remote insertion was interrupted before a successful execution result; verify catalog counts before retrying. Unsupported fields remain absent. |
| Real Gemini | Protected staging gateway installed using Vault secret `gemini_api_key`, `gemini-3.5-flash-lite`, and `service_role` only. The final local-trace reached all 12 cases with HTTP 200 and no model errors. |
| Conversational quality | Real-call rubric scores pending. No average or grounding score claimed. |
| Latency | Local handler with real staging services: p50 **2.02 s**, p95 **4.22 s** across 12 cases. This is not Vercel Preview latency. |
| Availability | Public source snapshot contains 2 activities, 5 recurring schedules, 0 date overrides and 0 tiers. Unknown/malformed aggregate responses fail closed locally. Real staging tool/cutoff/concurrent booking validation pending. |
| Booking | Database capacity guard installed and verified enabled in staging. Checkout code rechecks trusted data before submission; local guard tests pass. No real reservation or payment created. Finite ticket stock requires assisted handling until atomically tracked by the booking schema. |
| Legacy gateway | Call-site audit, replacement endpoint design, transition and rollback are in `concierge-legacy-gateway-plan.md`. No grants revoked or gateway migration executed. Public arbitrary Gemini RPC remains an unresolved risk. |
| Remaining risks | Staging catalog, runtime, Vault gateway and real Gemini smoke are complete. Preview remains old/unconfirmed; conversational rubric scoring, Preview latency, real JWT/HTTP and multi-connection checkout tests remain pending. |
| Recommendation | **NO-GO** until isolated staging and its acceptance tests are complete. Production activation still requires explicit approval even after passing. |

## Latest local validation

`npm run check` passed: TypeScript, ESLint, **103 tests**, zero failures and zero skipped tests. This covers deterministic behavior, model-output validation, HTTP handling with mocked remote catalog/model boundaries, local PostgreSQL security/session fixtures, checkout and staging-target guards.

`node scripts/concierge-staging-validate.mjs` additionally passed the actual schema-only baseline, all three migrations, the two-record seed with exactly approved metadata, and the rollback-only SQL ownership/nonce/idempotency/quota tests. It confirms that fixtures roll back and runtime stays disabled. These local SQL tests are not represented as remote HTTP/JWT tests.

## Provisioning and current blocker

`Akiles` (`zaepbbffdgkhvhoxvggb`) was already paused on **14 May 2025**. The user authorized pausing `Akiles Ride` (`ctkdmirporzyyscrvkrq`), freeing a slot, and then created `akiles-travel-staging` (`kbdrinaqoalldrjstxkg`). Initial inventory confirmed zero public tables and zero Auth users before installation. The baseline imports structure only, excludes llm_generate/Vault source and all business rows, and does not reproduce legacy TRUNCATE/TRIGGER/REFERENCES grants. No production Auth identities, bank data or bookings were exported. Catalog fixtures use new synthetic owners without passwords or login credentials.

After successful remote migration/security verification, the dashboard reported `Failed to fetch (api.supabase.com)` and redirected from staging to Organizations with `You do not have access to this project`. Refreshing restored organization listing, including staging, but opening staging still redirected with the access error. Do not infer that a pending seed query ran; check counts when access returns. No alternate credentials or permission bypass was attempted.

The ignored `.env.staging.local` contains the verified ref and URL, and the operator has filled all three staging credentials. The approved catalog seed is applied: 2 activities, 5 recurring schedules, 0 date overrides and 0 tiers. Runtime is enabled only in staging. Vault contains `gemini_api_key`; `public.llm_generate(jsonb)` is installed with `service_role` execution only and points to `gemini-3.5-flash-lite`. The server model adapter now uses the service-role transport for this protected gateway while catalog reads remain on anon/RLS. Do not read/print the completed file in tool output. Preview remains unconfirmed.

Production environment variables, data and gateway grants were not changed. Current work remains on the local `akiles-concierge` branch, without a main merge or production activation.

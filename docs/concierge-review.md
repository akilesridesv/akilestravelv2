# Review of f0cb390 — activation readiness

Reviewed 2026-09-07 on `akiles-concierge`: API adapter, server/client concierge modules, chat wrapper/home integration, 0012, tests, Vite and Vercel configuration. Fixes are in the working tree. No production migration, deployment, activation or merge was performed.

## CRITICAL

No critical issue established in this commit. This is a code/local integration review, not a penetration test of deployed Supabase.

## HIGH

| Finding | Consequence | Fix and evidence |
| --- | --- | --- |
| 0012 exposed `concierge_finish` to anon/authenticated, accepting caller-authored state and assistant metadata. | Callers could forge their own cached cards/answers, bypassing catalog verification. Token protection alone did not establish a trusted writer. | 0013 retires old RPCs; v2 executes only as service_role. Node validates user identity and response/state schemas. Catalog/model still use separate anon transport. SQL ACL and HTTP tests. |
| Feature flag only gated UI; fresh tokens bypassed per-session throttling. | Direct API calls still consumed tools/model while disabled. | Server flag check, disabled-by-default DB runtime flag, atomic 30 requests/minute per HMAC of trusted client IP across tokens. SQL quota and HTTP disabled-route tests. |
| Request ID unbound to message, no lease nonce, null-sensitive version check. | Reused IDs could replay a different message; expired workers could commit during a replacement lease. | Message hash, fresh nonce, explicit nonnull owner/version/lease/hash checks, atomic message pair. SQL competing claims, stale nonce, null version and replay tests. |
| Missing price coerced to zero; incomplete ticket inventory and capacity checks. | False free price, budget fit or availability. | Nullable money; unknown price fails budgets; party-size-aware tier price; allowed tiers and whole-party inventory; `min(slot capacity, activity max) - booked`; dated tier budgets fail closed. Catalog adapter tests. |
| Pre-existing Vite 5 dependency had a high Windows filesystem-deny bypass advisory. | Vulnerable development server could disclose denied files. | Compatible Vite 6.4.3 update and lockfile; no framework replacement. Audit now has no high/critical advisory. |

These high findings are fixed in this working tree. **0013 is part of the fix; 0012 alone must not be activated.** Deploying new application code without 0013 fails closed.

## MEDIUM

- Fixed malformed JSON returning 503, void RPC success parsed as JSON, and stacked Gemini retries. Invalid JSON returns 400; empty success accepted; at most two model attempts with one network request each. Shared 65-second tool deadline leaves a separate bounded safe-save budget.
- Fixed lost availability intent after clarification, stale experience focus and unknown comparison references silently replaced by prior IDs. Multi-turn and comparison evaluations cover them.
- Fixed invalid party sizes retaining old values, ignored negative interests, and missing grounded price/schedule/capacity answers.
- Added structured trace guarded by debug AND development. Production receives no detailed trace; summary logs omit message text, profiles, tokens and prompts.
- Remaining: two moderate npm audit entries (`react-router`, `react-router-dom`) need Router 7 for the upstream fix. This SPA does not use SSR hydration; concierge links are constrained to `/e/<id>`. Other application navigation inputs still need review with a broader router upgrade.
- Historical responses/cards remain snapshots. Reload and idempotent replay do not revalidate old prices/seats. New questions and checkout must recheck; prior availability text is never a reservation.
- Generic budgets default to USD per person unless stated as a group total. Dated tier budgets are deliberately excluded until a single applicable price is verified. Conservative unknown metadata can reduce recall.

## LOW

- Production frontend bundle retains a large-chunk warning; measure staging/mobile performance separately.
- npm warned it could not remove an old esbuild executable held by a Windows process. New build succeeds; restart the old dev process before smoke testing. No recursive cleanup was performed.
- Existing ESLint rules are narrow; passing lint is not a comprehensive security static-analysis result.
- Guest history uses a 256-bit browser bearer token in localStorage. XSS/browser compromise can expose that guest history. No automatic guest-to-account merge.

## Pre-existing deployment decisions

These are outside the new session boundary and are not resolved by enabling the concierge:

1. **High cost/abuse rollout risk:** `0006_llm_proxy.sql` grants arbitrary-payload `llm_generate` to anon/authenticated. Vault protects the key, but direct calls bypass the new API quota. Its “never anon” comment contradicts actual grants. Decide how to restrict/meter this shared gateway without breaking the old tourist chat/provider copilot before public activation. No legacy grants were changed by this review.
2. `0008_slot_availability.sql` exposes only aggregate seats, not customer rows, but uses `search_path=public`. Confirm only trusted migration roles have CREATE there. All concierge SECURITY DEFINER functions now use empty search_path; no new booking/customer grants were added.
3. Existing `BookingSheet.tsx` treats aggregate lookup failure as zero booked. Concierge fails closed, but that does not prove checkout/payment concurrency safety. Booking intent only opens a route and never creates a reservation. Validate checkout independently before claiming end-to-end booking readiness.
4. Verify deployed schema/RLS matches migrations, model availability and structured-output support. Only public catalog GETs ran against production; no live Gemini call, secret inspection, real booking or Vercel deployment.

## 0012 line-by-line disposition

0012 is unchanged from f0cb390. This table covers its executable sections in order.

| Section | Review |
| --- | --- |
| Metadata ALTER/COMMENT | Additive JSONB column, `{}` default; no subjective backfill, update/delete or booking change. |
| Session table | UUID PK, unique hash, nullable auth.users FK/cascade, 30-day absolute expiry. No raw token stored. Server schemas validate JSON; v2 also validates identity/size. |
| Message table | Session FK/cascade; unique `(session_id,request_id,role)`; constrained roles/content; session/time index. |
| RLS/table revokes | RLS with no shared guest policy. 0013 additionally revokes PUBLIC table privileges. Browser cannot read these tables directly. |
| `concierge_load` | Owner/token checks useful, but histories could be caller-authored. Retired; v2 gets server-validated owner/hash and deterministic history ordering. |
| `concierge_claim` | Row lock useful; lacked message binding and per-lease nonce. Retired; v2 adds both and explicit HTTP error codes. |
| `concierge_finish` | Null comparisons and client-written state unsafe. Retired; v2 checks nonnull version, owner, hash, nonce, expiry, payload sizes and state identity before atomic commit. |
| SECURITY DEFINER paths | `public,extensions` insufficiently defensive. All seven concierge functions now have empty search_path; v2 fully qualifies application objects. Old functions remain unreachable. |
| Final grants | Original anon/authenticated grants removed by 0013, including old service_role execution. Only four new v2 functions granted to service_role. |
| Enrichment query comment | Read-only example; no metadata UPDATE was executed. |

0012 has no internal transaction and is **not rerunnable** (`CREATE TABLE` fails). Apply once **inside a transaction with stop-on-error**, never statement-by-statement. A failed/repeated transactional run rolls back without partial corruption; tested locally. 0013 includes BEGIN/COMMIT, guarded additive columns/indexes/tables and CREATE OR REPLACE. Repeated execution was tested and preserves the runtime flag.

0013 adds user_id/expiry indexes and private runtime/quota tables. No rows dropped, no bookings changed, no Vault changes, no new public customer access. Account deletion cascades only to its own concierge history. Expired histories and old quota buckets remain until an operator chooses retention/cleanup policy.

## Evidence and status

- Final gate on 2026-09-07, Node 24.13.1: **97 tests passed, 0 failed, 0 skipped** (including 51 evaluation scenarios and 3 integration parent tests). Both TypeScript checks and configured ESLint passed.
- Production frontend build succeeded on Vite 6.4.3. Warnings: two removable PURE-comment annotations in Zod and one large-chunk warning (main JS 623.04 kB, gzip 181.11 kB). Initial sandbox build could not traverse a Windows parent directory; the authorized build outside that boundary succeeded.
- Final npm audit: **0 critical, 0 high, 2 moderate** package entries, both React Router related. Audit exits nonzero for those advisories; it is not a clean dependency audit.
- `git diff --check` passed; existing Windows LF/CRLF conversion notices remain. Built `dist` scan found no service-key variable name, test service key, private session RPC name or development trace label. The built feature flag was false; this scan is not proof of every future environment configuration.
- `npm run check`: typecheck, configured lint, unit/evaluation/local SQL/HTTP integration tests.
- `npm run build`: frontend production build; Vercel packaging still requires Preview validation.
- `migration.test.ts`: actual PostgreSQL engine (PGlite), local roles/auth schema; not deployed PostgREST.
- `http.integration.test.ts`: actual localhost HTTP listener/Node adapter, real SQL persistence, mocked public catalog/auth; synthetic secrets.
- `tools.integration.test.ts`: actual catalog/model adapters, mocked upstream; no claim of real Gemini quality/latency.

See [evaluation](concierge-evaluation.md), [activation checklist](concierge-activation-checklist.md), [metadata](concierge-metadata-review.md), [actual graph](concierge-graph.md).

Ready for **controlled staging validation**. Public activation remains conditional on the gateway/checkout decisions, staging evidence and reviewed metadata. Feature flag remains false.

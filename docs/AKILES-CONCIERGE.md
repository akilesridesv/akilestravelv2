# Akiles Concierge

Akiles Concierge is the stateful tourist advisor. Its brain is split into explicit nodes: session load, intent/profile extraction, information quality, catalog search, deterministic filtering, scoring, optional Gemini ranking, verification, and grounded voice.

## Activation

1. Run `supabase/migrations/0012_concierge.sql` in the target Supabase project's SQL editor. The migration is additive. It adds `activities.recommendation_metadata`, `concierge_sessions`, `concierge_messages`, and three token-checked RPCs.
2. Keep the Gemini key in Supabase Vault under `gemini_api_key`; the existing `public.llm_generate` RPC remains the only model gateway.
3. On Vercel set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `CONCIERGE_AI_ENABLED=true`, and `VITE_CONCIERGE_ENABLED=true`. The server may use the public anon key because all catalog access is RLS-scoped and the session RPCs are security-definer functions with token and auth ownership checks.
4. Set `CONCIERGE_DEBUG=true` only while diagnosing a deployment. Logs contain IDs, stages, scores and tool names, never prompt text, tokens or secrets.

Until `VITE_CONCIERGE_ENABLED=true` is set, the existing tourist chat and search remain active. If the migration or server is unavailable, the new chat fails closed and does not recommend an experience.

## Recommendation metadata

`recommendation_metadata` is intentionally empty by default. Empty values mean unknown; the scorer does not infer romance, family eligibility, transport, physical intensity, or adventure level from a title. Run the checklist query at the bottom of the migration to identify published records that need manual review.

## Security and grounding

The browser stores only a random conversation token. Supabase stores its SHA-256 hash. Each turn has a request ID and a short lease, so retries are idempotent and concurrent turns cannot overwrite state. Catalog tools only read published, active records and re-read chosen records immediately before response generation. The response cards are built from the verified records; Gemini returns IDs only and an ID outside the candidate set is discarded.

Availability is never inferred. A date request checks published schedules, date overrides, registration deadlines and the aggregate booked-seat RPC. Tool failure produces an unknown/handoff response.

## Current limitations

The existing checkout remains the source of truth for payment and final booking. `createBookingIntent` only opens its route after a current availability check. Guest sessions are intentionally scoped to the browser token; signing in later starts the authenticated scope rather than merging histories automatically. Metadata enrichment is a manual editorial task until a reviewed admin workflow is added.

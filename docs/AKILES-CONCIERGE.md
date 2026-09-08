# Akiles Concierge

Akiles Concierge is the stateful tourist advisor. Its brain is split into explicit nodes: session load, intent/profile extraction, information quality, catalog search, deterministic filtering, scoring, optional Gemini ranking, verification, and grounded voice.

## Activation

1. Follow [the activation checklist](concierge-activation-checklist.md). Apply 0012 once in a transaction and then its additive security follow-up `0013_concierge_hardening.sql`. **0012 alone must not be activated.**
2. Keep the Gemini key in Supabase Vault under `gemini_api_key`; the existing `public.llm_generate` RPC remains the only model gateway.
3. Node requires `SUPABASE_SERVICE_ROLE_KEY` exclusively for protected session RPCs. Catalog/model use a separate public anon transport. Never expose the service key through VITE variables. Keep `VITE_CONCIERGE_ENABLED=false` until staging validation; the database runtime flag also defaults to false.
4. `CONCIERGE_DEBUG=true` logs only safe summaries on Vercel. Full structured state trace additionally requires development mode, and is never returned in production.

Until `VITE_CONCIERGE_ENABLED=true` is set, the existing tourist chat and search remain active. If the migration or server is unavailable, the new chat fails closed and does not recommend an experience.

## Recommendation metadata

`recommendation_metadata` is intentionally empty by default. Empty values mean unknown; the scorer does not infer romance, family eligibility, transport, physical intensity, or adventure level from a title. Run the checklist query at the bottom of the migration to identify published records that need manual review.

## Security and grounding

The browser stores a random conversation token. Node hashes it before sending it to Supabase. Server-validated ownership, message-bound request IDs, version checks and fresh lease nonces protect history and retries. Catalog tools only read published active records and re-read chosen records before response generation. Cards use verified records; Gemini ranks IDs only and non-candidate IDs are discarded. Spanish voice templates, not free-form LLM text, generate factual answers.

Availability is never inferred. A date request checks published schedules, date overrides, registration deadlines and the aggregate booked-seat RPC. Tool failure produces an unknown/handoff response.

## Current limitations

The existing checkout remains separate. `createBookingIntent` only opens its route; when a date is known it requires a current availability check, otherwise checkout must collect/verify the date. It never creates or charges a reservation. Guest sessions are scoped to the browser token; signing in starts a separate authenticated scope. Historical responses are snapshots. Metadata enrichment is manual.

See [review and remaining deployment decisions](concierge-review.md), [published metadata gaps](concierge-metadata-review.md), [actual graph](concierge-graph.md), and [evaluation coverage](concierge-evaluation.md). Current status is controlled staging readiness, not production activation approval.

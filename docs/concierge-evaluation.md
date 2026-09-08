# Executable concierge evaluations

Run from repository root:

```powershell
npm run check
npm run build
```

`tests/concierge/evaluation-dataset.ts` defines **51 scenarios** with turns, fixture variant and named expected behavioral assertions. `evaluation.test.ts` executes every assertion; no response snapshot/exact-sentence requirement. Synthetic café, museum and ATV records are isolated test data, never production recommendations or metadata enrichment.

Final run on 2026-09-07: **97 tests passed, 0 failed, 0 skipped**, including 3 parent integration tests counted by the Node test runner. Typecheck/lint and production frontend build passed. Build/dependency warnings and remaining live-staging checks are recorded in [the review](concierge-review.md).

| IDs | Count | Coverage |
| --- | ---: | --- |
| D01–D16 | 16 | Couple, family, solo, friends, affordable/too-low/group budgets, relaxed, adventure, nature, culture, romance, spontaneous, vague, Saturday, afternoon. |
| G01–G09 | 9 | No beach match, Guatemala/Honduras, explicit fabrication/prompt injection, unknown price/availability/inclusions, unknown-price budget. |
| M01–M10 | 10 | Changed interests, rejected option, too intense, revised budget/date, contextual inclusions, availability-party clarification, accepting/refusing relaxation, negated interest. |
| S01–S04 | 4 | Specific inclusions, capacity, price, schedule. |
| C01–C02 | 2 | Existing pair; existing versus nonexistent. |
| A01–A04 | 4 | Available, full, no schedule, tool failure. |
| B01–B04 | 4 | Booking path, invalid group, booking without date, unavailable date. |
| H01–H02 | 2 | Corporate/large group and accessibility handoff. |

Global invariants: at most three recommendations; every ID is in the synthetic active/published catalog; rejected IDs do not immediately recur; nonexistent named activity is not inserted into answer. Scenario assertions verify appropriate state changes, tool invocation, grounded unknown handling, no-match constraints and route behavior. The original nine required product examples and additional guard tests remain in `agent.test.ts`.

## Integration and boundary tests

- `migration.test.ts`: PostgreSQL/PGlite executes unchanged 0012 transactionally, then 0013 twice. Tests safe rerun, empty search_path, client ACL denial, service access, guest/user isolation, hashes, concurrent claims, stale lease nonce, null version, message-bound idempotency, message ordering, expiration, turn cap, FK/indexes, quota and runtime kill.
- `http.integration.test.ts`: real ephemeral localhost Node HTTP server and API adapter; real SQL persistence behind mocked PostgREST/auth/catalog. Tests disabled/misconfigured handler, malformed requests, invalid JWT, valid owner binding, persisted follow-up, retry conflict, development-only trace and immediate DB disable.
- `tools.integration.test.ts`: actual catalog/model HTTP adapters with safe mocked responses. Tests unknown prices, party/tier inventory, activity/slot capacity, no schedules, aggregate failure, date-price ambiguity, malformed/schema-invalid Gemini output, exact retry limit and `responseJsonSchema` payload.
- `contracts.test.ts`, `profile.test.ts`, `agent.test.ts`: schema limits, deterministic inference, profile feedback, information quality, catalog-ID whitelist and fresh-record changes before response.

No live Gemini calls, production writes or payments occur. PGlite validates PostgreSQL behavior but does not replace live Supabase/PostgREST permissions or real Vercel/Gemini smoke tests. The synthetic evaluation metadata is richer than the current production catalog; successful romantic/family tests do not mean those qualities are currently confirmed for production activities.

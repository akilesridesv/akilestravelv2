# Shared Gemini gateway — impact and cutover plan

Design only. **No gateway migration, grant revocation or production endpoint change executed.** Preserving current production traffic requires migrating every caller, not only Akiles Concierge.

## A/B. Actual call sites and clients

`src/ai/llm.ts:generate()` directly invokes `supabase.rpc('llm_generate',{payload})`. All seven browser consumers below use that shared function; the new server model calls the same RPC independently.

| Call site | User/entry point | Current behavior | Proposed trusted endpoint |
| --- | --- | --- | --- |
| `src/ai/concierge.ts:runConciergeTurn` | Anonymous tourist, `TouristHome.tsx` | Browser sends query + entire catalog/system instructions | `/api/ai/discovery`: bounded query only; server loads public catalog and owns prompt/schema. |
| `src/ai/shelves.ts:generateShelves` | Anonymous home/cartelera | Browser sends catalog for shelf titles | `/api/ai/shelves`: server catalog, bounded output; shared cache/quota. |
| `src/ai/touristConcierge.ts:runTouristTurn` | Old `ConciergeChat.tsx`, TouristAccount | Six-step browser tool loop: recommendations, account actions | `/api/ai/tourist-turn`: bounded message/session; auth required for private account tools; server validates tool names/args and ownership. |
| `src/ai/llm.ts:runCopilotTurn` | Provider `CopilotSurface.tsx` | Browser business snapshot/prompt/tool schemas and local mutations | `/api/ai/provider-turn`: JWT + provider ownership, server context/tools, max six steps; preserve existing UI response shape. |
| `src/ai/extractExperience.ts` (Gemini extraction helper) | Provider draft/copilot | Structured extraction from provider text | `/api/ai/extract-experience`: provider JWT, bounded source text; server-owned output schema. |
| `src/ai/writeDescription.ts:writeDescription` | `ExperienceDraftEditor.tsx` | Draft-to-description generation | `/api/ai/write-description`: JWT + owned draft ID/validated unsaved fields; server prompt and length limits. |
| `src/ai/adminAgent.ts:runAdminTurn` | `AdminChat.tsx`, admin dashboard | Admin tool loop from browser | `/api/ai/admin-turn`: server checks trusted admin membership; never accept body.role as authorization. |
| `server/concierge/model.ts:GeminiModel.run` | New `/api/concierge` | Current anon transport to RPC, validated extraction/rank | Keep orchestrator; use dedicated server-only model transport after cutover. Catalog transport stays anon/RLS. |

Legacy comments mention a copilot Edge Function, but the active shared function calls SQL RPC. `supabase/functions` is not evidence that these browser callers already use a trusted endpoint. Non-Gemini fallback in extractExperience and browser VITE_AI_API_KEY settings need separate removal/restriction during adapter migration; this concierge does not use those keys.

## C. Minimal safe replacement architecture

Browser → small use-case-specific body → same-origin Node endpoint → validate auth/quota/input → server-owned prompt/context/tools → privileged model-only RPC transport → schema-validated response.

Do not introduce an `/api/llm` endpoint accepting arbitrary `payload`, systemInstruction, tools or output schemas. That would merely relocate the vulnerability. Public discovery/shelves need per-IP and global model-budget limits; provider/account/admin routes need trusted JWT/role/ownership checks plus per-user quotas. Set timeouts, token budgets, idempotency and fixed loop limits server-side. Tool results affecting authorization/private records must be fetched/verified by server, not trusted because the browser returned them.

Use the existing Vault + `llm_generate` implementation initially. The smallest **final permissions migration**, after all callers are migrated, is:

```sql
begin;
revoke execute on function public.llm_generate(jsonb) from public,anon,authenticated;
grant execute on function public.llm_generate(jsonb) to service_role;
commit;
```

This SQL is deliberately in documentation, not an auto-applied migration. Before executing it, confirm gateway search_path/schema CREATE permissions and vendor model configuration. Do not replay 0006: its placeholder Vault update can overwrite the key. Harden the function's search_path in a separate reviewed replacement with schema-qualified extension/Vault references; do not merely set an empty path on its old unqualified body.

## D. Deployment path with compatibility window

1. Build/test the typed endpoints and adapters in staging. Leave current production RPC grants unchanged.
2. Move new concierge model transport to server-only credentials, leaving catalog anon. Verify discovery, provider actions, admin actions and old tourist chat against staging with public RPC grants revoked.
3. Deploy trusted endpoints first, then clients pointing to them. Keep the previous RPC temporarily during a **bounded** compatibility window; this window retains the existing abuse risk and needs monitoring/budget caps.
4. Observe requests by use case, force a client-version refresh for stale tabs, verify none of the eight paths uses direct public RPC, then revoke public grants in staging and run the full regression suite.
5. Production cutover only after a separate approval. Deploy compatible server + clients, handle stale tabs, then apply final grant changes and test all roles.

Strict zero interruption for indefinitely cached old browser code and immediate elimination of its public RPC are incompatible. A stale tab must reload or receive a controlled “update required” response; do not promise both indefinitely. No new downtime for refreshed supported clients is the acceptance target.

## E. Rollback

Prefer rollback to the prior **trusted-endpoint-compatible** server/client release and keep public RPC grants revoked. The concierge runtime switch can disable just the new concierge independently.

If an emergency truly requires restoring old direct browser clients, restoring anon/authenticated EXECUTE reopens the same abuse risk and requires explicit operator approval, a time limit and monitoring. Do not silently execute this rollback. Never move Vault secrets or a service key into the browser to recover functionality.

Status: all callers mapped, replacement/cutover impact understood at code level; gateway implementation/cutover has not been executed. This remains a production go/no-go item until all role-specific staging tests pass.

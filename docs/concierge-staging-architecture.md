# Staging architecture and provisioning status

## Selected architecture before any database changes

Reuse branch `akiles-concierge` (the requested feature branch already exists; no main merge or unnecessary branch rename).

```mermaid
flowchart LR
  B[akiles-concierge branch] --> V[Vercel Preview, branch-scoped environment]
  V --> A[/api/concierge]
  A --> S[Dedicated Supabase staging project]
  S --> G[Real Gemini gateway, staging Vault key]
  V --> C[Existing checkout against staging only]
  P[Production deployment, concierge flag false] --> D[Production Supabase unchanged]
```

No staging project/config was found in the repository; no local Vercel linkage, Supabase/psql/Vercel CLI or configured management/DB credentials were discovered. Connected tools do not include Supabase/Vercel management. Dashboard access is available. `Akiles` (`zaepbbffdgkhvhoxvggb`) was already paused on 14 May 2025 and could not free a new slot. The user subsequently explicitly authorized pausing `Akiles Ride` (`ctkdmirporzyyscrvkrq`); Supabase accepted the pause and displayed `PAUSING PROJECT`. The new-project form now allows creation, confirming that the quota blocker has cleared.

The user created `akiles-travel-staging`, organization `Akiles`, ref `kbdrinaqoalldrjstxkg`, in `us-east-1`. Dashboard identity and initial empty inventory (zero public tables and zero Auth users) were verified before writes. A reviewed schema-only baseline has now been installed, followed by 0012 + 0013 atomically and then 0014. Remote checks confirm 22 RLS tables, service-only V2 RPCs, retired V1 grants, required indexes and disabled runtime. The baseline explicitly removes implicit grants and grants only application CRUD privileges, so it does not depend on the original new-project exposure checkbox.

An existing Vercel Preview is available at `https://akilestravelv2-git-akiles-concierge-akiles2.vercel.app`, but the inspected deployment is commit `f0cb390`, predating the local hardening and checkout fixes. Its database isolation is unverified. This is not yet a validated staging deployment; do not run concierge or booking tests there until both server and browser environment targets have been checked. Remote schema migration is complete; metadata insertion remains unconfirmed after a dashboard access failure. No Vercel environment changes have been performed. See `concierge-staging-readiness.md` for evidence and current blockers.

Prefer a dedicated project so Auth, DB, Storage and Vault are isolated. If the account already has a Supabase preview branch with equivalent isolation, inspect and reuse it. New Supabase branches are data-less by default; do not enable production data copying. See [Supabase branching](https://supabase.com/docs/guides/deployment/branching). Branch-scoped Preview variables override other Preview values; see [Vercel environment variables](https://vercel.com/docs/environment-variables).

## Isolation rules

- Production ref `rstkmkrsaicifdbfavxl` is denylisted for all staging writes and smoke tools. A public catalog GET snapshot is permitted; no production sessions/bookings/model calls.
- Preview must override **both** browser `VITE_SUPABASE_*` and server `SUPABASE_*` values; setting only server variables could leave checkout pointed at production.
- Seed only reviewed public facts for the two activities and necessary public schedules/tiers. No production auth users, customer bookings, messages, private provider contacts/bank details, payment credentials or Vault keys copied. Recreate test owners/accounts inside staging and remap owner/provider FKs; keep an explicit activity-ID mapping if IDs change.
- Copy public image references only after verifying accessibility; never expose a private storage bucket to fix a preview image.
- Use a staging Gemini key/project with a budget. It is entered into staging Vault by the operator or an authorized secure configuration mechanism; never printed in logs or committed.
- New project/branch costs or plan upgrades require a concrete operator choice if encountered; no subscription purchased by this task.

## Database deployment unit

First inspect live staging schema/history; repository migrations may omit existing deployed features (admin/account/fees/payment columns used by application code). A schema-only export from a trusted migration source is safer than assuming 0001–0011 reproduce all deployed functionality. Audit for secret literals/Vault writes before importing. No production customer data.

For a fresh staging concierge install, concatenate **0012 then 0013 as one transaction**. Remove only the outer `begin;`/`commit;` from the 0013 file while bundling; do not nest COMMIT and accidentally end the outer transaction early. Use the prepared deployment-unit generator; it emits local SQL only. Existing 0012 installations need schema inspection and only 0013 applied; never blindly rerun 0012.

After this unit, apply `0014_booking_capacity_guard.sql` to staging for checkout testing. It is additive/rerunnable and changes no existing bookings or payment implementation. It rejects capacity-consuming writes without a valid published departure, over capacity, past cutoff or finite tier stock without atomic tier tracking. Releasing seats and confirming already-held seats remains possible. Two real concurrent PostgreSQL connections must validate the locking behavior in staging; PGlite's local queue is not that proof.

Run `docs/sql/concierge-staging-security.sql` as the staging migration owner and separate anon/authenticated clients. Execute the negative ownership/idempotency/quota checks in the test plan. Enable runtime only after target/env identity is verified.

## Exact Preview variables (branch-specific)

| Variable | Preview value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://kbdrinaqoalldrjstxkg.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Staging public anon key |
| `SUPABASE_URL` | Same staging URL |
| `SUPABASE_ANON_KEY` | Same staging anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Staging server secret, never VITE-prefixed |
| `CONCIERGE_AI_ENABLED` | `true` |
| `CONCIERGE_DEBUG` | `true` (safe summaries/timings on Preview) |
| `VITE_CONCIERGE_ENABLED` | `true` only on this Preview after migrations |
| `VITE_AI_ENABLED` | Preserve legacy AI Preview setting for compatibility testing |

Production `VITE_CONCIERGE_ENABLED=false` stays unchanged. The new service key is necessary for hardened session RPCs. Current model transport still uses anon until the gateway cutover plan is implemented. Private credentials must never enter VITE variables, source, traces or frontend bundles.

## Trace/latency capture

Detailed state trace remains local-development-only. Run the isolated local Node handler against real staging using the provided smoke runner to capture structured decisions; separately exercise the deployed Preview endpoint. Label these as separate runs; local-handler timings are not Vercel latency. Preview logs include stage timings but no private raw messages/profile, and JSON exposes no debug payload.

Measure session load, claim, intent/profile, catalog, filtering, scoring, rank, verification, voice and save. A skipped stage is absent, not zero. Filtering/verification durations include their availability I/O. intentProfileMs includes parsing/merge preparation around the model call; it is not vendor-only network time. Local templates are the voice layer. Real p50/p95 and qualitative scores stay unmeasured until the staging run exists; never substitute mock timings.

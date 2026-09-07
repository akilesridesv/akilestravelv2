import { test } from "node:test";
import assert from "node:assert/strict";
import { newState, ProfileSchema } from "../../src/concierge/contracts";
import { ExtractionSchema, RankingSchema } from "../../server/concierge/schemas";
test("state defaults and hard limits", () => {
  const s = newState(crypto.randomUUID());
  assert.equal(s.turnCount, 0);
  assert.deepEqual(s.recommendedExperienceIds, []);
  assert.equal(ProfileSchema.safeParse({ date: "2026-02-31" }).success, false);
  assert.equal(ProfileSchema.safeParse({ adults: -2 }).success, false);
  assert.equal(ProfileSchema.safeParse({ adventureLevel: 9 }).success, false);
});
test("LLM schemas reject unstructured control flow", () => {
  assert.equal(ExtractionSchema.safeParse({ intent: "delete_everything" }).success, false);
  assert.equal(RankingSchema.safeParse({ ranked: [{ experienceId: "invented", reasonCodes: [] }] }).success, false);
});

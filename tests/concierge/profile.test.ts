import { test } from "node:test";
import assert from "node:assert/strict";
import { newState } from "../../src/concierge/contracts";
import { deterministicExtraction, updateProfile } from "../../server/concierge/profile";
import { askSmartQuestion, checkInformationQuality } from "../../server/concierge/clarification";
test("Spanish group, nature, adventure and Saturday", () => {
  const out = deterministicExtraction("Somos 2 y queremos naturaleza y aventura el sábado.", new Date("2026-09-07T15:00:00Z"));
  assert.equal(out.profile.adults, 2);
  assert.deepEqual(out.profile.interests, ["naturaleza", "aventura"]);
  assert.equal(out.profile.date, "2026-09-12");
});
test("romantic and calm feelings inferred without inventing catalog metadata", () => {
  const out = deterministicExtraction("Quiero algo romántico y tranquilo con mi novia.");
  assert.equal(out.profile.groupType, "couple");
  assert.equal(out.profile.adults, 2);
  assert.ok(out.profile.desiredFeelings?.includes("romance"));
  assert.equal(out.profile.pace, "relaxed");
});
test("feedback preserves state and rejects the current recommendation", () => {
  const s = newState(crypto.randomUUID()); const id = crypto.randomUUID();
  s.travelerProfile = { adults: 2, date: "2026-09-12", interests: ["naturaleza"] }; s.recommendedExperienceIds = [id];
  updateProfile(s, deterministicExtraction("That option is too intense."), "That option is too intense.");
  assert.equal(s.travelerProfile.date, "2026-09-12");
  assert.equal(s.travelerProfile.adventureLevel, 2); assert.deepEqual(s.rejectedExperienceIds, [id]);
});
test("one question; never asks the same known information", () => {
  const s = newState(crypto.randomUUID()); s.intent = "availability";
  assert.equal(checkInformationQuality(s, "none"), "date");
  assert.ok(askSmartQuestion(s, "date")); assert.equal(askSmartQuestion(s, "date"), null);
  s.travelerProfile = { date: "2026-09-12", adults: 2 };
  assert.equal(checkInformationQuality(s, "date"), null);
});

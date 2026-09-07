import { test } from "node:test";
import assert from "node:assert/strict";
import { newState } from "../../src/concierge/contracts";
import { runConciergeTurn, verifyIds } from "../../server/concierge/orchestrator";
import { RANK_PROMPT } from "../../server/concierge/prompts";
import { eligibleSlots } from "../../server/concierge/catalog";
import { experience, fixtureTools, noModel } from "./fixtures";
import { hardExclusions } from "../../server/concierge/scoring";

test("1 group nature adventure Saturday: only catalog IDs and availability checked", async () => {
  const e = experience({ tags: ["naturaleza", "aventura"] }); const { tools, calls } = fixtureTools([e]);
  const out = await runConciergeTurn(newState(crypto.randomUUID()), "Somos 2 y queremos naturaleza y aventura el sábado.", tools, noModel);
  assert.equal(out.state.travelerProfile.adults, 2);
  assert.deepEqual(out.response.recommendations.map((r) => r.id), [e.id]);
  assert.ok(calls.includes(`availability:${e.id}`));
});
test("2 romantic calm uses recorded metadata; unknown metadata does not become romantic", async () => {
  const known = experience(); const unknown = experience({ recommendation_metadata: {} });
  const { tools } = fixtureTools([known, unknown]);
  const out = await runConciergeTurn(newState(crypto.randomUUID()), "Quiero algo romántico y tranquilo con mi novia.", tools, noModel);
  assert.equal(out.state.travelerProfile.groupType, "couple"); assert.deepEqual(out.response.recommendations.map((r) => r.id), [known.id]);
});
test("3 Guatemala: no external suggestion; asks to relax location", async () => {
  const { tools } = fixtureTools([experience()]);
  const out = await runConciergeTurn(newState(crypto.randomUUID()), "Recomiéndame algo en Guatemala.", tools, noModel);
  assert.deepEqual(out.response.recommendations, []); assert.match(out.response.text, /catálogo de Akiles/);
  assert.equal(out.state.pendingRelaxation, "locationPreferences");
});
test("4 explicit request to invent is refused", async () => {
  const { tools, calls } = fixtureTools([experience()]);
  const out = await runConciergeTurn(newState(crypto.randomUUID()), "Inventa algo aunque no esté en Akiles.", tools, noModel);
  assert.deepEqual(out.response.recommendations, []); assert.match(out.response.text, /no inventarla/); assert.equal(calls.length, 0);
});
test("5 persisted feedback excludes previous result and searches again", async () => {
  const first = experience({ recommendation_metadata: { interests: ["naturaleza"], adventure_level: 4, physical_intensity: 4 } });
  const mild = experience(); const { tools, calls } = fixtureTools([first, mild]);
  const state = newState(crypto.randomUUID()); state.travelerProfile = { adults: 2, interests: ["naturaleza"] }; state.recommendedExperienceIds = [first.id];
  const out = await runConciergeTurn(JSON.parse(JSON.stringify(state)), "That option is too intense.", tools, noModel);
  assert.equal(out.state.travelerProfile.adults, 2); assert.ok(out.state.rejectedExperienceIds.includes(first.id));
  assert.deepEqual(out.response.recommendations.map((r) => r.id), [mild.id]); assert.ok(calls.includes("search"));
});
test("6 Tepecoyo includes is direct grounded Q&A with DB fetch", async () => {
  const e = experience(); const { tools, calls } = fixtureTools([e]);
  const out = await runConciergeTurn(newState(crypto.randomUUID()), "¿Qué incluye Tepecoyo?", tools, noModel);
  assert.equal(out.state.intent, "specific_experience"); assert.ok(calls.includes(`details:${e.id}`));
  assert.match(out.response.text, /Degustación de café/); assert.equal(out.trace.some((n) => n.node === "AI_RANK"), false);
});
test("7 availability tomorrow must call availability tool; unknown cannot claim available", async () => {
  const e = experience(); const state = newState(crypto.randomUUID()); state.travelerProfile.adults = 2; state.recommendedExperienceIds = [e.id];
  const { tools, calls } = fixtureTools([e], "unknown");
  const out = await runConciergeTurn(state, "¿Está disponible mañana?", tools, noModel);
  assert.ok(calls.includes(`availability:${e.id}`)); assert.match(out.response.text, /No pude verificar/); assert.equal(out.response.handoff, true);
});
test("8 budget: no false alternative, explicit consent required to relax", async () => {
  const { tools } = fixtureTools([experience()]);
  const out = await runConciergeTurn(newState(crypto.randomUUID()), "Quiero cafe hasta $10", tools, noModel);
  assert.equal(out.state.pendingRelaxation, "budgetMax"); assert.deepEqual(out.response.recommendations, []);
  const refused = await runConciergeTurn(out.state, "No", tools, noModel);
  assert.equal(refused.state.travelerProfile.budgetMax, 10);
  const accepted = await runConciergeTurn(out.state, "Sí", tools, noModel);
  assert.equal(accepted.state.travelerProfile.budgetMax, undefined); assert.equal(accepted.response.recommendations.length, 1);
});
test("9 model's valid-UUID but non-candidate ID is rejected", async () => {
  const a = experience(); const b = experience(); const invalid = crypto.randomUUID(); const { tools } = fixtureTools([a, b]);
  const model = { run: async <T>(prompt: string, _input: unknown, schema: import("zod").z.ZodType<T>) => prompt === RANK_PROMPT ? schema.parse({ ranked: [{ experienceId: invalid, reasonCodes: ["interests"] }] }) : null };
  const out = await runConciergeTurn(newState(crypto.randomUUID()), "Tour de café", tools, model);
  assert.ok(out.response.recommendations.every((r) => [a.id, b.id].includes(r.id)));
  assert.ok(!out.response.text.includes(invalid));
});
test("withdrawn or newly over-budget record is rejected immediately before response", async () => {
  const e = experience(); const { tools } = fixtureTools([e]);
  tools.getExperienceDetails = async () => ({ ...e, price_per_person: 1000 });
  const out = await runConciergeTurn(newState(crypto.randomUUID()), "Cafe hasta $40", tools, noModel);
  assert.deepEqual(out.response.recommendations, []);
  assert.deepEqual(verifyIds([e.id], [e.id], [{ ...e, is_active: false }]), []);
});
test("no beach recommendations from cafe/scooter and no metadata invented", async () => {
  const { tools } = fixtureTools([experience(), experience({ title: "Scooter por la plaza", tags: ["scooter"], category: "Ciudad", recommendation_metadata: {} })]);
  const out = await runConciergeTurn(newState(crypto.randomUUID()), "Tour de playa", tools, noModel);
  assert.deepEqual(out.response.recommendations, []);
});
test("date overrides, booking window, timezone and time preference", () => {
  const e = experience({ recurring_schedules: [{ day_of_week: 6, start_time: "14:00", capacity: 8, is_active: true }], date_slots: [{ slot_date: "2026-09-12", start_time: "14:00", capacity: 8, status: "blocked" }] });
  assert.deepEqual(eligibleSlots(e, "2026-09-12", new Date("2026-09-07T12:00:00Z")), []);
  e.date_slots = [];
  assert.equal(eligibleSlots(e, "2026-09-12", new Date("2026-09-07T12:00:00Z"), "afternoon").length, 1);
  assert.equal(eligibleSlots(e, "2026-09-12", new Date("2026-09-07T12:00:00Z"), "morning").length, 0);
  assert.equal(eligibleSlots(e, "2026-09-12", new Date("2026-09-12T19:30:00Z")).length, 0);
});
test("physical/children/transport restrictions are deterministic and fail closed when unknown", () => {
  const e = experience({ recommendation_metadata: {} });
  assert.ok(hardExclusions(e, { children: 1 }).includes("child_eligibility_unknown"));
  assert.ok(hardExclusions(e, { physicalIntensity: 2 }).includes("physical_unknown_or_excessive"));
  assert.ok(hardExclusions(e, { transportNeeded: true }).includes("transport_unknown"));
});
test("compare only fetched records; booking opens existing checkout and never charges", async () => {
  const a = experience(); const b = experience({ title: "Café de altura", price_per_person: 50 }); const { tools, calls } = fixtureTools([a, b]);
  const s = newState(crypto.randomUUID()); s.recommendedExperienceIds = [a.id, b.id];
  const compared = await runConciergeTurn(s, "Compara la primera y la segunda", tools, noModel);
  assert.equal(compared.response.recommendations.length, 2);
  s.recommendedExperienceIds = [a.id];
  const booked = await runConciergeTurn(s, "Book it", tools, noModel);
  assert.equal(booked.response.bookingPath, `/e/${a.id}`); assert.match(booked.response.text, /no se ha creado ni cobrado/);
  assert.ok(calls.includes(`bookingIntent:${a.id}`));
});
test("human handoff and refinement stop limits", async () => {
  const { tools } = fixtureTools([]); const s = newState(crypto.randomUUID());
  const out = await runConciergeTurn(s, "Somos 40 de una empresa", tools, noModel); assert.equal(out.response.handoff, true);
  s.recommendationLoopCount = 5;
  const stopped = await runConciergeTurn(s, "Otra opción", tools, noModel); assert.equal(stopped.response.handoff, true);
});

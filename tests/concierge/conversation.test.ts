import { test } from "node:test";
import assert from "node:assert/strict";
import { newState } from "../../src/concierge/contracts";
import { runConciergeTurn } from "../../server/concierge/orchestrator";
import { experience, fixtureTools, noModel } from "./fixtures";

const scooters = () => experience({ title: "Scooters por San Salvador", tags: ["aventura", "scooter", "urbano"], category: "Aventura", recommendation_metadata: { interests: ["aventura", "scooter", "urbano"], desired_feelings: ["desconexion"] } });

test("adrenaline couple request is acknowledged without presenting scooters as adrenaline", async () => {
  const { tools } = fixtureTools([scooters(), experience()]);
  const out = await runConciergeTurn(newState(crypto.randomUUID()), "Quiero un tour para hacer con mi pareja y tener adrenalina", tools, noModel);
  assert.equal(out.state.travelerProfile.groupType, "couple");
  assert.equal(out.state.travelerProfile.adults, 2);
  assert.ok(out.state.travelerProfile.desiredFeelings?.includes("emocion"));
  assert.equal(out.state.travelerProfile.adventureLevel, undefined);
  assert.match(out.response.text, /adrenalina.*pareja/);
  assert.equal((out.response.text.match(/¿/g) ?? []).length, 1);
  assert.doesNotMatch(out.response.text, /requisitos|Scooters/);
  assert.equal(out.response.recommendations.length, 0);
  assert.equal(out.state.pendingRelaxation, "desiredFeelings");
});

test("natural consent explores the same activity, preserving couple and budget", async () => {
  const scooter = scooters(); const { tools } = fixtureTools([scooter, experience()]);
  const start = newState(crypto.randomUUID()); start.travelerProfile = { budgetMax: 40 };
  const first = await runConciergeTurn(start, "Quiero un tour con mi pareja y tener adrenalina", tools, noModel);
  const next = await runConciergeTurn(first.state, "Sí, ¿qué tienes?", tools, noModel);
  assert.equal(next.state.travelerProfile.adults, 2);
  assert.equal(next.state.travelerProfile.budgetMax, 40);
  assert.equal(next.state.travelerProfile.desiredFeelings, undefined);
  assert.deepEqual(next.response.recommendations.map((e) => e.id), [scooter.id]);
  assert.match(next.response.text, /pareja/);
  assert.doesNotMatch(next.response.text, /adrenalina|romántic|bajo esfuerzo/);
  assert.match(next.response.recommendations[0].reason, /aventura/);
});

test("qualified consent keeps constraint; refusal does not repeat the same question", async () => {
  const { tools } = fixtureTools([scooters()]);
  const first = await runConciergeTurn(newState(crypto.randomUUID()), "Quiero adrenalina", tools, noModel);
  for (const reply of ["No", "Sí, pero quiero adrenalina", "Sí, solo si tiene adrenalina"]) {
    const next = await runConciergeTurn(first.state, reply, tools, noModel);
    assert.ok(next.state.travelerProfile.desiredFeelings?.includes("emocion"));
    assert.equal(next.response.recommendations.length, 0);
    assert.notEqual(next.response.text, first.response.text);
  }
});

test("greeting and thanks do not discard discovery state or run another search", async () => {
  const { tools, calls } = fixtureTools([scooters()]);
  const state = newState(crypto.randomUUID()); state.travelerProfile = { groupType: "couple", adults: 2, interests: ["aventura"] };
  state.recommendedExperienceIds = [crypto.randomUUID()];
  const hello = await runConciergeTurn(state, "Hola", tools, noModel);
  const thanks = await runConciergeTurn(hello.state, "Gracias", tools, noModel);
  assert.deepEqual(thanks.state.travelerProfile, state.travelerProfile);
  assert.deepEqual(thanks.state.recommendedExperienceIds, state.recommendedExperienceIds);
  assert.equal(calls.length, 0);
  assert.match(hello.response.text, /pareja/);
  assert.doesNotMatch(thanks.response.text, /¿/);
});

test("no-match explains the actual budget and only that constraint can be relaxed", async () => {
  const { tools } = fixtureTools([experience()]);
  const first = await runConciergeTurn(newState(crypto.randomUUID()), "Café con mi pareja hasta $20", tools, noModel);
  assert.match(first.response.text, /20 USD por persona/);
  const next = await runConciergeTurn(first.state, "Claro, muéstrame", tools, noModel);
  assert.equal(next.state.travelerProfile.budgetMax, undefined);
  assert.equal(next.state.travelerProfile.adults, 2);
  assert.deepEqual(next.state.travelerProfile.interests, ["cafe"]);
});

test("yes to the recommendation's question retrieves inclusions instead of restarting discovery", async () => {
  const e = experience(); const { tools, calls } = fixtureTools([e]);
  const first = await runConciergeTurn(newState(crypto.randomUUID()), "Quiero un tour de café", tools, noModel);
  const next = await runConciergeTurn(first.state, "Sí, cuéntame", tools, noModel);
  assert.equal(next.state.intent, "specific_experience");
  assert.match(next.response.text, /Degustación de café/);
  assert.ok(calls.includes(`details:${e.id}`));
  assert.ok(!next.trace.some((n) => n.node === "AI_RANK"));
});

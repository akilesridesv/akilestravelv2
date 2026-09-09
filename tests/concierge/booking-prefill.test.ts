import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingLink, conversationalDate, conversationalTime, readBookingPrefill } from "../../src/concierge/booking";
import { ResponseSchema, newState } from "../../src/concierge/contracts";
import { availabilityVoice } from "../../server/concierge/voice";
import { runConciergeTurn } from "../../server/concierge/orchestrator";
import { experience, fixtureTools, noModel } from "./fixtures";

test("availability uses Spanish calendar dates and 12-hour times without timezone shifting", () => {
  assert.equal(conversationalDate("2026-09-12"), "sábado 12 de septiembre 2026");
  assert.equal(conversationalTime("16:00"), "4 pm");
  assert.equal(conversationalTime("16:30:00"), "4:30 pm");
  assert.equal(conversationalTime("00:00"), "12 am");
  assert.equal(conversationalTime("12:00"), "12 pm");
  assert.throws(() => conversationalDate("2026-02-30"));
});

test("verified availability returns a safe booking link carrying date, time and group split", () => {
  const e = experience();
  const reply = availabilityVoice(e, { status: "available", date: "2026-09-12", times: ["16:00"] }, { adults: 2, children: 1 });
  ResponseSchema.parse(reply);
  assert.match(reply.text, /sábado 12 de septiembre 2026 a las 4 pm/);
  assert.match(reply.text, /3 personas/);
  const url = new URL(reply.bookingPath!, "https://example.test");
  assert.equal(url.pathname, `/e/${e.id}`);
  assert.deepEqual(readBookingPrefill(url.searchParams), { open: true, date: "2026-09-12", time: "16:00", people: 3, children: 1 });
});

test("multiple available departures leave the time choice to the traveler", () => {
  const reply = availabilityVoice(experience(), { status: "available", date: "2026-09-12", times: ["09:00", "16:30"] }, { adults: 2 });
  assert.match(reply.text, /9 am o 4:30 pm/);
  assert.equal(new URL(reply.bookingPath!, "https://example.test").searchParams.has("time"), false);
});

test("unknown and unavailable departures never produce a reserve CTA", () => {
  for (const status of ["unknown", "unavailable"] as const) {
    const reply = availabilityVoice(experience(), { status, date: "2026-09-12", times: [] }, { adults: 2 });
    assert.equal(reply.bookingPath, undefined);
    assert.doesNotMatch(reply.text, /tiene cupos/);
  }
});

test("untrusted URL values cannot preload invalid dates, times or party sizes", () => {
  const prefill = readBookingPrefill(new URLSearchParams("date=2026-02-30&time=25:00&people=-2&children=9"));
  assert.equal(prefill.open, false);
  assert.equal(prefill.date, undefined); assert.equal(prefill.time, undefined); assert.equal(prefill.people, undefined);
  assert.equal(readBookingPrefill(new URLSearchParams("people=2&children=5")).children, undefined);
  assert.throws(() => bookingLink("https://evil.test", {}));
  assert.equal(ResponseSchema.safeParse({ text: "", recommendations: [], bookingPath: "/e/00000000-0000-4000-8000-000000000001?redirect=https://evil.test" }).success, false);
});

test("availability route gives a booking CTA without creating a reservation", async () => {
  const e = experience(); const { tools, calls } = fixtureTools([e]);
  const state = newState(crypto.randomUUID()); state.recommendedExperienceIds = [e.id]; state.travelerProfile = { adults: 4 };
  const out = await runConciergeTurn(state, "¿Está disponible el 2026-09-12?", tools, noModel);
  const params = new URL(out.response.bookingPath!, "https://example.test").searchParams;
  assert.equal(params.get("date"), "2026-09-12"); assert.equal(params.get("people"), "4"); assert.equal(params.get("time"), "14:00");
  assert.ok(calls.includes(`availability:${e.id}`));
  assert.ok(!calls.some((c) => c.startsWith("bookingIntent:")));
});

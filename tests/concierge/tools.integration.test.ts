import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { ExperienceSchema, priceOf, SupabaseCatalog } from "../../server/concierge/catalog";
import { GeminiModel } from "../../server/concierge/model";
import { SupabaseToolsTransport } from "../../server/concierge/transport";
import { hardExclusions } from "../../server/concierge/scoring";
import { experience } from "./fixtures";

test("catalog HTTP adapter and Gemini structured-output boundary",async(t)=>{
  const actualFetch=globalThis.fetch;
  const db=new SupabaseToolsTransport("https://supabase.test","anon-test-key");
  const catalog=new SupabaseCatalog(db);
  const date="2099-09-12"; let booked=0; let fail=false; let modelText="invalid"; let modelCalls=0;
  let e=experience({date_slots:[{slot_date:date,start_time:"14:00",capacity:8,status:"open"}]});
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input)); assert.equal(url.hostname,"supabase.test");
    assert.equal(new Headers(init?.headers).get("apikey"),"anon-test-key");
    if(url.pathname.endsWith("activities")) return Response.json([e]);
    if(url.pathname.endsWith("slot_booked_seats")) return fail?Response.json({}, {status:500}):Response.json(booked);
    assert.ok(url.pathname.endsWith("llm_generate")); modelCalls++;
    const payload=JSON.parse(String(init?.body)).payload;
    assert.equal(payload.generationConfig.responseMimeType,"application/json");
    assert.ok(payload.generationConfig.responseJsonSchema); assert.equal(payload.generationConfig.responseSchema,undefined);
    return Response.json({candidates:[{content:{parts:[{text:modelText}]}}]});
  };
  t.after(()=>{globalThis.fetch=actualFetch;});
  await t.test("unknown price stays unknown and cannot pass a budget filter",async()=>{
    const unknown=ExperienceSchema.parse({...e,price_per_person:null}); assert.equal(priceOf(unknown).amount,null);
    assert.ok(hardExclusions(unknown,{budgetMax:40}).length>0);
    assert.equal(priceOf({...e,ticket_tiers:[{price:null,quantity_available:0,quantity_sold:0}]}).amount,null);
  });
  await t.test("real availability tool subtracts booked seats and rejects invalid party sizes",async()=>{
    assert.equal((await catalog.checkAvailability(e.id,date,2)).status,"available");
    booked=7; assert.equal((await catalog.checkAvailability(e.id,date,2)).status,"unavailable");
    e.date_slots[0].capacity=100;
    assert.equal((await catalog.checkAvailability(e.id,date,2)).status,"unavailable");
    e.date_slots[0].capacity=8;
    assert.equal((await catalog.checkAvailability(e.id,date,0)).status,"unknown");
    assert.equal((await catalog.checkAvailability(e.id,date,9)).status,"unavailable");
    assert.equal(await catalog.createBookingIntent({experienceId:e.id,partySize:0}),null);
    assert.equal(await catalog.createBookingIntent({experienceId:e.id,date,partySize:2}),null);
  });
  await t.test("missing schedules never claim availability and aggregate failures return unknown",async()=>{
    assert.equal((await catalog.checkAvailability(e.id,"2099-09-13",2)).status,"unavailable");
    fail=true; assert.equal((await catalog.checkAvailability(e.id,date,2)).status,"unknown"); fail=false; booked=0;
  });
  await t.test("tier restrictions and inventory apply to entire party; date-price combination fails closed",async()=>{
    const tier=crypto.randomUUID(); const other=crypto.randomUUID();
    e={...e,ticket_tiers:[{id:tier,price:35,quantity_available:2,quantity_sold:1}],date_slots:[{slot_date:date,start_time:"14:00",capacity:8,status:"open",tier_ids:[tier]}]};
    assert.equal((await catalog.checkAvailability(e.id,date,2)).status,"unavailable");
    e.ticket_tiers[0].quantity_available=0;
    assert.equal((await catalog.checkAvailability(e.id,date,2)).status,"available");
    e.date_slots[0].tier_ids=[other];
    assert.equal((await catalog.checkAvailability(e.id,date,2)).status,"unavailable");
    assert.ok(hardExclusions(e,{date,budgetMax:40}).includes("date_price_unverified"));
  });
  await t.test("a cheap ticket with insufficient inventory cannot satisfy the group budget",()=>{
    const tiered={...e,ticket_tiers:[{price:10,quantity_available:1,quantity_sold:0},{price:50,quantity_available:8,quantity_sold:0}]};
    assert.equal(priceOf(tiered,2).amount,50);
    assert.ok(hardExclusions(tiered,{adults:2,budgetMax:20,budgetBasis:"person"}).includes("budgetMax"));
    assert.ok(hardExclusions({...tiered,ticket_tiers:tiered.ticket_tiers.slice(0,1)},{adults:2}).includes("tickets_insufficient"));
  });
  await t.test("malformed model result retries exactly once then deterministic fallback is available",async()=>{
    const model=new GeminiModel(db,true); const schema=z.object({intent:z.literal("discover")});
    assert.equal(await model.run("Test",{},schema),null); assert.equal(modelCalls,2);
    modelText=JSON.stringify({intent:"fabricated-route"}); modelCalls=0;
    assert.equal(await model.run("Test",{},schema),null); assert.equal(modelCalls,2);
    modelText=JSON.stringify({intent:"discover"}); modelCalls=0;
    assert.deepEqual(await model.run("Test",{},schema),{intent:"discover"}); assert.equal(modelCalls,1);
  });
});

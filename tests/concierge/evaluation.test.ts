import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluationDataset } from "./evaluation-dataset";
import { newState } from "../../src/concierge/contracts";
import { runConciergeTurn } from "../../server/concierge/orchestrator";
import { experience, fixtureTools, noModel } from "./fixtures";

for (const scenario of evaluationDataset) test(`EVAL ${scenario.id} ${scenario.group}: ${scenario.turns.join(" → ")}`, async () => {
  const coffee = experience({ id:"00000000-0000-4000-8000-000000000001", recommendation_metadata: { interests:["cafe","naturaleza"],desired_feelings:["romance","calma","desconexion"],best_for:["couple","family"],pace:"relaxed",children_allowed:true,adventure_level:1,physical_intensity:1 } });
  const culture = experience({ id:"00000000-0000-4000-8000-000000000002", title:"Museo local",tags:["cultura"],category:"Cultura",recommendation_metadata:{interests:["cultura"]} });
  const atv = experience({ id:"00000000-0000-4000-8000-000000000003",title:"Ruta en ATV",tags:["aventura","atv"],category:"ATV",recommendation_metadata:{interests:["aventura","atv"],adventure_level:4,physical_intensity:4} });
  if(scenario.fixture==="unknown_price") coffee.price_per_person=null;
  if(scenario.fixture==="unknown_inclusions") coffee.whats_included=[];
  if(scenario.fixture==="unpublished") coffee.is_active=false;
  const catalog=[coffee,culture,atv];
  const status=scenario.fixture==="unknown_availability"?"unknown": ["full","no_schedule"].includes(scenario.fixture??"")?"unavailable":"available";
  const {tools,calls}=fixtureTools(catalog,status);
  tools.createBookingIntent=async ({experienceId})=> {calls.push("booking");return status==="available"?`/e/${experienceId}`:null;};
  let state=newState(crypto.randomUUID()); let out: Awaited<ReturnType<typeof runConciergeTurn>> | undefined;
  for(const message of scenario.turns) {
    out=await runConciergeTurn(state,message,tools,noModel); state=JSON.parse(JSON.stringify(out.state));
    assert.ok(out.response.recommendations.length<=3);
    assert.ok(out.response.recommendations.every(r=>catalog.some(e=>e.id===r.id&&e.is_active&&e.publication_status==="published")));
    assert.ok(out.response.recommendations.every(r=>!state.rejectedExperienceIds.includes(r.id)));
    assert.ok(!out.response.text.includes("Tour Fantasma"));
  }
  assert.ok(out); const {response}=out; const p=state.travelerProfile;
  for(const check of scenario.expected) {
    switch(check) {
      case "results":assert.ok(response.recommendations.length>0);break;
      case "empty":assert.equal(response.recommendations.length,0);break;
      case "couple":case "solo":case "family":case "friends":assert.equal(p.groupType,check);break;
      case "party1":case "party2":case "party4":assert.equal(p.adults,Number(check.slice(-1)));break;
      case "budget40":case "budget50":assert.equal(p.budgetMax,Number(check.slice(-2)));break;
      case "group_budget":assert.equal(p.budgetBasis,"group");break;
      case "calm":assert.ok(p.desiredFeelings?.includes("calma"));break;
      case "romance":assert.ok(p.desiredFeelings?.includes("romance"));break;
      case "escape":assert.ok(p.desiredFeelings?.includes("desconexion"));break;
      case "one_question":assert.equal((response.text.match(/¿/g)??[]).length,1);break;
      case "ask_date":assert.ok(state.missingInformation.includes("date"));break;
      case "date":assert.match(p.date??"",/^\d{4}-\d{2}-\d{2}$/);break;
      case "date_changed":assert.equal(p.date,"2026-12-13");break;
      case "checked_availability":assert.ok(calls.some(c=>c.startsWith("availability:")));break;
      case "available":assert.match(response.text,/tiene cupos/);break;
      case "unavailable":assert.match(response.text,/No encontré cupos/);break;
      case "unknown_availability":assert.ok(response.handoff);assert.doesNotMatch(response.text,/tiene cupos/);break;
      case "catalog_only":assert.match(response.text,/catálogo de Akiles/);break;
      case "refuse_invention":assert.match(response.text,/no inventarla/);break;
      case "no_catalog_call":assert.equal(calls.length,0);break;
      case "unknown_price":assert.equal(response.recommendations[0]?.price,null);assert.match(response.text,/no tiene un precio/);break;
      case "no_zero_price":assert.ok(response.recommendations.every(r=>r.price!==0));break;
      case "unknown_inclusions":assert.match(response.text,/no especifica/);break;
      case "relax_budget":assert.equal(state.pendingRelaxation,"budgetMax");break;
      case "budget_relaxed":assert.equal(p.budgetMax,undefined);break;
      case "budget_kept":assert.equal(p.budgetMax,10);break;
      case "culture_only":assert.deepEqual(p.interests,["cultura"]);assert.ok(response.recommendations.every(r=>r.id===culture.id));break;
      case "no_coffee":assert.ok(!response.recommendations.some(r=>r.id===coffee.id));break;
      case "rejected_excluded":assert.ok(state.rejectedExperienceIds.length>0);break;
      case "less_intense":assert.ok((p.adventureLevel??5)<=2);break;
      case "includes":assert.ok(response.text.includes(coffee.whats_included[0]));break;
      case "details_fetch":assert.ok(calls.some(c=>c.startsWith("details:")));break;
      case "capacity":assert.match(response.text,/de 1 a 8 personas/);break;
      case "price":assert.match(response.text,/35 USD/);break;
      case "schedule":assert.match(response.text,/horarios recurrentes/);break;
      case "no_availability_claim":assert.doesNotMatch(response.text,/tiene cupos/);break;
      case "compare2":assert.equal(response.recommendations.length,2);assert.equal(state.intent,"compare");break;
      case "availability_intent":assert.equal(state.intent,"availability");break;
      case "booking_intent":assert.equal(response.bookingPath,`/e/${coffee.id}`);break;
      case "no_booking":assert.equal(response.bookingPath,undefined);break;
      case "not_charged":assert.match(response.text,/no se ha creado ni cobrado/);break;
      case "handoff":assert.ok(response.handoff);break;
      case "child_eligibility":assert.ok(response.recommendations.every(r=>r.id===coffee.id));break;
      default:assert.fail(`Unknown assertion ${check}`);
    }
  }
});

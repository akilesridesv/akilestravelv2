import { test } from "node:test";
import assert from "node:assert/strict";
import { detailsVoice } from "../../server/concierge/voice";
import { experience } from "./fixtures";
test("commercial answers use structured prices/tiers even when marketing copy is outdated",()=>{
  const e=experience({description:"Costo $999 y grupos de 100 personas",price_per_person:35,max_capacity:10});
  for(const topic of ["details","price"] as const) {
    const out=detailsVoice(e,topic); assert.ok(!out.text.includes("999")); assert.equal(out.recommendations[0].price,35);
  }
  const tiered={...e,ticket_tiers:[{price:45,quantity_available:0,quantity_sold:0}]};
  assert.equal(detailsVoice(tiered,"price").recommendations[0].price,45);
  assert.match(detailsVoice(tiered,"price").text,/45 USD/);
});

import {test} from "node:test";
import assert from "node:assert/strict";
import {stagingTarget,PRODUCTION_REF} from "../../scripts/staging-target";
test("staging tools reject production, mismatched URLs and missing confirmation",()=>{
  const valid={STAGING_CONFIRMED_PROJECT_REF:"abcdefghijklmnopqrst",STAGING_SUPABASE_URL:"https://abcdefghijklmnopqrst.supabase.co",STAGING_SUPABASE_ANON_KEY:"test-public",STAGING_SUPABASE_SERVICE_ROLE_KEY:"test-private"};
  assert.equal(stagingTarget(valid).ref,"abcdefghijklmnopqrst");
  assert.throws(()=>stagingTarget({...valid,STAGING_CONFIRMED_PROJECT_REF:PRODUCTION_REF,STAGING_SUPABASE_URL:`https://${PRODUCTION_REF}.supabase.co`}));
  assert.throws(()=>stagingTarget({...valid,STAGING_SUPABASE_URL:`https://${PRODUCTION_REF}.supabase.co`}));
  assert.throws(()=>stagingTarget({...valid,STAGING_CONFIRMED_PROJECT_REF:undefined}));
  assert.throws(()=>stagingTarget({...valid,STAGING_SUPABASE_ANON_KEY:"test-private"}));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { nodeHandler } from "../../api/concierge";
import { type ServerConfig } from "../../server/concierge/handler";
import { localDatabase } from "./postgres-fixture";
import { experience } from "./fixtures";

test("local HTTP API + real session SQL + mocked public Supabase catalog", async (t) => {
  const db = await localDatabase();
  const owner = randomUUID();
  await db.query("insert into auth.users values($1)",[owner]);
  await db.exec("update public.concierge_runtime set enabled=true");
  const realFetch = globalThis.fetch;
  const e = experience(); const calls: { path:string; key:string; body:Record<string,unknown> }[] = [];
  const rpcArgs: Record<string,string[]> = {
    concierge_gate_v2:["p_bucket"], concierge_load_v2:["p_hash","p_user"],
    concierge_claim_v2:["p_hash","p_user","p_request","p_message_hash"],
    concierge_finish_v2:["p_hash","p_user","p_request","p_nonce","p_version","p_message_hash","p_state","p_message","p_response"],
  };
  globalThis.fetch = async (input,init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if(url.hostname !== "supabase.test") return realFetch(input,init);
    const headers = new Headers(init?.headers); const key = headers.get("apikey") ?? "";
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string,unknown> : {};
    calls.push({path:url.pathname,key,body});
    if(url.pathname === "/auth/v1/user") return headers.get("authorization") === "Bearer valid-test-auth" ? Response.json({id:owner}) : Response.json({}, {status:401});
    if(url.pathname === "/rest/v1/activities") { assert.equal(key,"anon-test-key"); return Response.json([e]); }
    const rpc = url.pathname.split("/").pop()!; const args = rpcArgs[rpc];
    assert.ok(args,`Unexpected tool ${rpc}`); assert.equal(key,"server-test-key");
    try {
      const result = await db.query<{value:unknown}>(`select public.${rpc}(${args.map((_,i)=>`$${i+1}`).join(",")}) value`,args.map(a=>body[a]));
      return rpc.endsWith("finish_v2") || rpc.endsWith("gate_v2") ? new Response(null,{status:204}) : Response.json(result.rows[0].value);
    } catch(error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      return Response.json({code},{status:code.startsWith("PT") ? Number(code.slice(2)) : 500});
    }
  };
  const config:ServerConfig = {url:"https://supabase.test",key:"anon-test-key",serviceKey:"server-test-key",enabled:true,aiEnabled:false,debug:false,development:false,clientAddress:"127.0.0.1"};
  const server = createServer((req,res)=>{ void nodeHandler(req,res,config).catch(()=>{res.statusCode=500;res.end();}); });
  server.listen(0,"127.0.0.1"); await once(server,"listening");
  const address=server.address(); assert.ok(address && typeof address === "object");
  const url=`http://127.0.0.1:${address.port}/api/concierge`;
  const token = "a".repeat(64); const requestId = randomUUID();
  const post = (body:unknown,auth?:string) => realFetch(url,{method:"POST",headers:{"Content-Type":"application/json",...(auth?{Authorization:auth}:{})},body:JSON.stringify(body)});
  t.after(async ()=>{globalThis.fetch=realFetch;server.close();server.closeAllConnections();await db.close();});

  await t.test("flag off and missing server key fail closed before any remote calls",async()=>{
    config.enabled=false; assert.equal((await post({action:"load",token})).status,503); assert.equal(calls.length,0);
    config.enabled=true; config.serviceKey=""; assert.equal((await post({action:"load",token})).status,503); assert.equal(calls.length,0);
    config.serviceKey="server-test-key";
  });
  await t.test("method, malformed JSON, body size and invalid JWT are rejected",async()=>{
    assert.equal((await realFetch(url)).status,405);
    assert.equal((await realFetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:"{"})).status,400);
    assert.equal((await post({action:"load",token,padding:"x".repeat(6000)})).status,413);
    assert.equal((await post({action:"load",token},"Bearer invalid")).status,401);
  });
  await t.test("request returns only DB IDs and persists exactly one message pair",async()=>{
    const res=await post({action:"turn",token,requestId,message:"Tour de café para 2 personas"});
    assert.equal(res.status,200); assert.equal(res.headers.get("cache-control"),"no-store");
    const out=await res.json(); assert.equal(out.debug,undefined);
    assert.deepEqual(out.response.recommendations.map((r:{id:string})=>r.id),[e.id]);
    assert.equal((await db.query("select id from public.concierge_messages")).rows.length,2);
    assert.ok(calls.filter(c=>c.path.includes("concierge_")).every(c=>c.key==="server-test-key" && !JSON.stringify(c.body).includes(token)));
    assert.ok(!JSON.stringify(out).includes("server-test-key"));
  });
  await t.test("replay is stable; changed message with reused ID is a conflict",async()=>{
    const before=calls.filter(c=>c.path.endsWith("activities")).length;
    const replay=await post({action:"turn",token,requestId,message:"Tour de café para 2 personas"}); assert.equal(replay.status,200);
    assert.equal(calls.filter(c=>c.path.endsWith("activities")).length,before);
    assert.equal((await post({action:"turn",token,requestId,message:"Different message"})).status,409);
    assert.equal((await db.query("select id from public.concierge_messages")).rows.length,2);
  });
  await t.test("reload and follow-up preserve traveler profile and exact experience focus",async()=>{
    const loaded=await (await post({action:"load",token})).json(); assert.equal(loaded.messages.length,2);
    const res=await post({action:"turn",token,requestId:randomUUID(),message:"¿Qué incluye?"}); assert.equal(res.status,200);
    const out=await res.json(); assert.match(out.response.text,/Degustación de café/);
    const row=(await db.query<{state:{travelerProfile:{adults:number};turnCount:number}}>("select state from public.concierge_sessions where id=$1",[loaded.conversationId])).rows[0];
    assert.equal(row.state.travelerProfile.adults,2); assert.equal(row.state.turnCount,2);
  });
  await t.test("authenticated user validated by auth endpoint cannot enter guest session",async()=>{
    assert.equal((await post({action:"load",token},"Bearer valid-test-auth")).status,403);
    assert.equal((await post({action:"load",token:"b".repeat(64)},"Bearer valid-test-auth")).status,200);
    const ids=calls.filter(c=>c.path.endsWith("concierge_load_v2")).map(c=>c.body.p_user);
    assert.ok(ids.includes(owner)); assert.ok(ids.includes(null));
  });
  await t.test("trace is structured and returned only in development with debug enabled",async()=>{
    config.debug=true; config.development=true;
    const debug=await (await post({action:"turn",token:"c".repeat(64),requestId:randomUUID(),message:"Tour de café"})).json();
    assert.equal(debug.debug.persistence,"saved"); assert.ok(debug.debug.stateBefore); assert.ok(debug.debug.stateAfter);
    assert.ok(debug.debug.nodes.some((n:{node:string})=>n.node==="VERIFY_RESULTS"));
    assert.deepEqual(debug.debug.finalRecommendationIds,[e.id]);
    config.development=false;
    const prod=await (await post({action:"turn",token:"d".repeat(64),requestId:randomUUID(),message:"Tour de café"})).json();
    assert.equal(prod.debug,undefined); config.debug=false;
  });
  await t.test("database kill switch stops an already deployed handler",async()=>{
    await db.exec("update public.concierge_runtime set enabled=false");
    assert.equal((await post({action:"load",token})).status,503);
  });
});

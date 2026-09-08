import { test } from "node:test";
import assert from "node:assert/strict";
import { localDatabase, migration } from "./postgres-fixture";
import { createHash, randomUUID } from "node:crypto";

test("PostgreSQL migration, ACLs, ownership, concurrency and idempotency", async (t) => {
  const db = await localDatabase();
  t.after(() => db.close());
  const hash = (s: string) => createHash("sha256").update(s).digest("hex");
  const tokenHash = hash("local-only-session"); const messageHash = hash("Tour de cafe");
  const owner = randomUUID(); const other = randomUUID(); const request = randomUUID();
  const load = async (h = tokenHash, user: string | null = null) =>
    (await db.query<{ value: { id: string; state: unknown; version: number; messages: { role: string }[] } }>("select public.concierge_load_v2($1,$2) value", [h,user])).rows[0].value;
  const claim = async (h = tokenHash, user: string | null = null, r = request, m = messageHash) =>
    (await db.query<{ value: { id: string; nonce: string; version: number; cached?: unknown } }>("select public.concierge_claim_v2($1,$2,$3,$4) value", [h,user,r,m])).rows[0].value;
  const guest = await load();
  const finish = (nonce: string, version: number | null, h = tokenHash, user: string | null = null, r = request, m = messageHash) =>
    db.query("select public.concierge_finish_v2($1,$2,$3,$4,$5,$6,$7,$8,$9)", [h,user,r,nonce,version,m,{conversationId:guest.id},"Tour de cafe",{text:"Respuesta verificada"}]);
  const rejects = (fn: () => Promise<unknown>, code: string) => assert.rejects(fn, (e: unknown) => typeof e === "object" && e !== null && "code" in e && e.code === code);

  await t.test("0013 repeats safely; runtime stays disabled by default", async () => {
    await db.exec(await migration("0013_concierge_hardening.sql"));
    assert.equal((await db.query<{enabled:boolean}>("select enabled from public.concierge_runtime")).rows[0].enabled,false);
    await rejects(() => db.query("select public.concierge_gate_v2($1)",[hash("ip")]),"PT503");
  });
  await t.test("0012 rerun inside a transaction fails cleanly without losing records", async () => {
    const sql = await migration("0012_concierge.sql");
    await rejects(() => db.exec(`begin; ${sql} commit;`), "42P07");
    await db.exec("rollback");
    assert.equal((await load()).id,guest.id);
  });
  await t.test("all SECURITY DEFINER functions have empty search_path and client RPC access is denied", async () => {
    const rows = (await db.query<{proname:string;proconfig:string[]}>("select proname,proconfig from pg_proc where proname like 'concierge_%' and prosecdef")).rows;
    assert.equal(rows.length,7); assert.ok(rows.every(r => r.proconfig.includes('search_path=""')));
    for (const role of ["anon","authenticated"]) {
      await db.exec(`set role ${role}`);
      try {
        await rejects(() => load(),"42501");
        await rejects(() => db.query("select public.concierge_load($1)",[tokenHash]),"42501");
        await rejects(() => db.query("select * from public.concierge_messages"),"42501");
        await rejects(() => db.query("select * from public.concierge_sessions"),"42501");
        await rejects(() => db.query("select public.concierge_gate_v2($1)",[hash("ip")]),"42501");
      } finally { await db.exec("reset role"); }
    }
    await db.exec("set role service_role");
    try { assert.equal((await load()).id,guest.id); await rejects(() => db.query("select public.concierge_load($1)",[tokenHash]),"42501"); }
    finally { await db.exec("reset role"); }
  });
  await t.test("guest and authenticated scopes cannot cross and raw tokens are absent", async () => {
    await db.query("insert into auth.users values($1),($2)",[owner,other]);
    const owned = await load(hash("owned"),owner);
    assert.notEqual(owned.id,guest.id);
    await rejects(() => load(hash("owned"),other),"PT403");
    await rejects(() => load(hash("owned"),null),"PT403");
    await rejects(() => load(tokenHash,owner),"PT403");
    assert.notEqual((await load(hash("other-guest"))).id,guest.id);
    const stored = (await db.query<{token_hash:string}>("select token_hash from public.concierge_sessions")).rows;
    assert.ok(stored.every(r => /^[a-f0-9]{64}$/.test(r.token_hash)));
    await rejects(() => load("raw invalid token"),"PT400");
  });
  await t.test("parallel claims serialize; null version and wrong nonce cannot save", async () => {
    const results = await Promise.allSettled([claim(),claim()]);
    assert.equal(results.filter(r => r.status === "fulfilled").length,1);
    const won = results.find(r => r.status === "fulfilled")!;
    assert.equal(won.status,"fulfilled");
    if (won.status !== "fulfilled") throw Error("claim missing");
    await rejects(() => finish(won.value.nonce,null),"PT400");
    await rejects(() => finish(randomUUID(),0),"PT409");
    await db.exec("update public.concierge_sessions set lease_until=clock_timestamp()-interval '1 second'");
    const takeover = await claim();
    assert.notEqual(takeover.nonce,won.value.nonce);
    await rejects(() => finish(won.value.nonce,0),"PT409");
    await finish(takeover.nonce,0);
    await finish(takeover.nonce,0); // network retry cannot duplicate the two messages
  });
  await t.test("same request ID replays only the same message; ordered history and version persist", async () => {
    assert.deepEqual((await claim()).cached,{text:"Respuesta verificada"});
    await rejects(() => claim(tokenHash,null,request,hash("different message")),"PT409");
    const persisted = await load();
    assert.equal(persisted.version,1);
    assert.deepEqual(persisted.messages.map(m => m.role),["user","assistant"]);
    assert.deepEqual(persisted.state,{conversationId:guest.id});
  });
  await t.test("session expiration, turn cap, foreign key cleanup and supporting indexes", async () => {
    await db.query("update public.concierge_sessions set expires_at=clock_timestamp()-interval '1 second' where token_hash=$1",[hash("other-guest")]);
    await rejects(() => load(hash("other-guest")),"PT403");
    await db.query("update public.concierge_sessions set version=1000 where token_hash=$1",[hash("owned")]);
    await rejects(() => claim(hash("owned"),owner,randomUUID()),"PT429");
    await db.query("delete from auth.users where id=$1",[owner]);
    assert.equal((await db.query("select id from public.concierge_sessions where user_id=$1",[owner])).rows.length,0);
    const indexes = (await db.query<{indexname:string}>("select indexname from pg_indexes where tablename like 'concierge_%'")).rows.map(r=>r.indexname);
    assert.ok(indexes.includes("concierge_sessions_user_idx")); assert.ok(indexes.includes("concierge_sessions_expiry_idx"));
  });
  await t.test("quota spans tokens and immediate database kill switch blocks access", async () => {
    await db.exec("update public.concierge_runtime set enabled=true");
    await db.exec(await migration("0013_concierge_hardening.sql"));
    for(let i=0;i<30;i++) await db.query("select public.concierge_gate_v2($1)",[hash("ip")]);
    await rejects(() => db.query("select public.concierge_gate_v2($1)",[hash("ip")]),"PT429");
    await db.exec("update public.concierge_rate_limits set window_start=clock_timestamp()-interval '2 minutes'");
    await db.query("select public.concierge_gate_v2($1)",[hash("ip")]);
    await db.exec("update public.concierge_runtime set enabled=false");
    await rejects(() => db.query("select public.concierge_gate_v2($1)",[hash("new-ip")]),"PT503");
  });
});

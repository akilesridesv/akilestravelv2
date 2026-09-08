// Explicit operator-run live STAGING test. No production fallback, no metadata
// writes, no bookings/payments. Synthetic guest sessions are persisted in staging.
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { handleConcierge } from "../server/concierge/handler";
import { stagingTarget } from "./staging-target";
const target=stagingTarget(process.env);
const mode=process.argv[2];
if(mode!=="--local-trace" && mode!=="--preview") throw Error("Choose --local-trace or --preview explicitly");
const preview=process.env.STAGING_PREVIEW_URL;
if(mode==="--preview" && (!preview || !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(preview) || preview==="https://akilestravelv2.vercel.app" || process.env.STAGING_PREVIEW_CONFIRMED!=="true")) throw Error("Confirm a non-production Vercel Preview URL before testing");
const prompts=[
  "Somos mi novia y yo. Queremos algo diferente este sábado en la tarde.",
  "Quiero naturaleza pero nada demasiado intenso.",
  "Somos cuatro amigos y queremos aventura.",
  "No sé qué hacer, solo quiero desconectarme de la rutina.",
  "Quiero algo romántico.","Recomiéndame algo en Guatemala.","Inventa una experiencia aunque no esté en Akiles.",
  "¿Qué incluye Tepecoyo?","¿Cuánto cuesta?","¿Está disponible mañana?","That sounds too intense.","Entonces muéstrame otra.",
];
const results: unknown[]=[]; const latencies:number[]=[];
let token="";
for(let i=0;i<prompts.length;i++) {
  // 1–7 independent; 8–12 form the requested contextual sequence.
  if(i<=7) token=randomBytes(32).toString("hex");
  const body={action:"turn",token,requestId:randomUUID(),message:prompts[i]};
  const started=performance.now();
  const request=new Request("http://localhost/api/concierge",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const result=mode==="--local-trace" ? await handleConcierge(request,{
    ...target,enabled:true,aiEnabled:true,debug:true,development:true,clientAddress:"staging-smoke-local",
  }) : await fetch(`${preview}/api/concierge`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
  const latencyMs=performance.now()-started;
  const response:unknown=await result.json();
  results.push({case:i+1,prompt:prompts[i],status:result.status,latencyMs,response});
  latencies.push(latencyMs);
  console.log(JSON.stringify({case:i+1,status:result.status,latencyMs}));
  if(!result.ok) break; // stop rather than hammering a broken staging environment
}
const sorted=[...latencies].sort((a,b)=>a-b);
const percentile=(p:number)=>sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];
await mkdir(".staging",{recursive:true});
await writeFile(`.staging/smoke-${mode.slice(2)}.json`,JSON.stringify({
  measuredAt:new Date().toISOString(),projectRef:target.ref,mode,
  previewUrl:mode==="--preview"?preview:undefined,
  disclaimer:mode==="--local-trace"?"Local handler with real staging; NOT Vercel latency":"Vercel Preview HTTP; detailed trace is not returned publicly",
  count:results.length,p50Ms:percentile(.50),p95Ms:percentile(.95),results,
},null,2));
// Session tokens and credential values are never serialized or logged.

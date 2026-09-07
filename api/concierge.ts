import type { IncomingMessage, ServerResponse } from "node:http";
import { handleConcierge, type ServerConfig } from "../server/concierge/handler";

export async function nodeHandler(req: IncomingMessage & { body?: unknown }, res: ServerResponse, config: ServerConfig) {
  let body: string;
  if (req.body !== undefined) body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  else {
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      if (size > 5000) { res.statusCode = 413; res.end(); return; }
      chunks.push(Buffer.from(chunk));
    }
    body = Buffer.concat(chunks).toString("utf8");
  }
  if (body.length > 5000) { res.statusCode = 413; res.end(); return; }
  const headers = new Headers();
  for (const name of ["authorization", "content-type"]) {
    const value = req.headers[name]; if (typeof value === "string") headers.set(name, value);
  }
  const request = new Request("http://localhost/api/concierge", { method: req.method ?? "POST", headers, body: req.method === "POST" ? body : undefined });
  const result = await handleConcierge(request, config);
  res.statusCode = result.status;
  result.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(await result.text());
}
export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  return nodeHandler(req, res, {
    url: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
    key: process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "",
    aiEnabled: process.env.CONCIERGE_AI_ENABLED !== "false",
    debug: process.env.CONCIERGE_DEBUG === "true",
  });
}

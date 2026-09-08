export class ToolError extends Error {
  constructor(public code: string, public status = 503) { super(code); }
}
export class SupabaseToolsTransport {
  constructor(private url: string, private key: string, private authorization?: string, private deadline = Date.now() + 65000) {}
  async request(path: string, body?: unknown, scoped = false, attempts = 2): Promise<unknown> {
    // One retry at most, bounded per request. Never include response bodies in logs.
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const remaining = this.deadline - Date.now();
        if (remaining <= 0) throw new ToolError("turn_deadline");
        const res = await fetch(`${this.url}/rest/v1/${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: { apikey: this.key, Authorization: scoped && this.authorization ? this.authorization : `Bearer ${this.key}`, "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(Math.min(5000, remaining)),
        });
        if (!res.ok) {
          if (res.status >= 500 && attempt + 1 < attempts) continue;
          throw new ToolError(`supabase_${res.status}`, res.status);
        }
        const text = await res.text();
        return text ? JSON.parse(text) : null;
      } catch (error) {
        if (error instanceof ToolError || attempt + 1 === attempts) throw error;
      }
    }
    throw new ToolError("tool_failed");
  }
  rpc(name: string, body: unknown, scoped = false, attempts = 2) { return this.request(`rpc/${name}`, body, scoped, attempts); }
}

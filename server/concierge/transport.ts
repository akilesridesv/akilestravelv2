export class ToolError extends Error {
  constructor(public code: string) { super(code); }
}
export class SupabaseToolsTransport {
  constructor(private url: string, private key: string, private authorization?: string) {}
  async request(path: string, body?: unknown, scoped = false): Promise<unknown> {
    // One retry at most, bounded per request. Never include response bodies in logs.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${this.url}/rest/v1/${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: { apikey: this.key, Authorization: scoped && this.authorization ? this.authorization : `Bearer ${this.key}`, "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          if (res.status >= 500 && attempt === 0) continue;
          throw new ToolError(`supabase_${res.status}`);
        }
        return await res.json();
      } catch (error) {
        if (error instanceof ToolError || attempt === 1) throw error;
      }
    }
    throw new ToolError("tool_failed");
  }
  rpc(name: string, body: unknown, scoped = false) { return this.request(`rpc/${name}`, body, scoped); }
}

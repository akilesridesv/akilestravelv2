import { z } from "zod";
import { SupabaseToolsTransport } from "./transport";
export interface StructuredModel {
  run<T>(prompt: string, input: unknown, schema: z.ZodType<T>): Promise<T | null>;
}
function geminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(geminiSchema);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "$schema" || key === "additionalProperties" || key === "propertyNames") continue;
    out[key] = geminiSchema(child);
  }
  return out;
}
export class GeminiModel implements StructuredModel {
  constructor(private db: SupabaseToolsTransport, private enabled: boolean, private log: (code: string) => void = () => {}) {}
  async run<T>(prompt: string, input: unknown, schema: z.ZodType<T>): Promise<T | null> {
    if (!this.enabled) return null;
    // Retry invalid structure once; tool transport separately bounds network retries.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const jsonSchema = geminiSchema(z.toJSONSchema(schema));
        const raw = await this.db.rpc("llm_generate", { payload: {
          systemInstruction: { parts: [{ text: prompt }] },
          contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1500, responseMimeType: "application/json", responseJsonSchema: jsonSchema },
        } }, false, 1);
        const packet = z.object({ candidates: z.array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }) })) }).parse(raw);
        const result = schema.safeParse(JSON.parse(packet.candidates[0]?.content.parts.map((p) => p.text ?? "").join("") ?? ""));
        if (result.success) return result.data;
        this.log("invalid_model_schema");
      } catch { this.log("model_unavailable_or_invalid"); }
    }
    return null;
  }
}

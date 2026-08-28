import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { TOOL_SPECS, runTool, readBusinessContext } from "@/ai/tools";

// ---------------------------------------------------------------------------
// Client-side agentic loop for the provider copilot, backed by Gemini through
// the `copilot` Edge Function (the API key stays server-side). The model can
// call the SAME tools the UI uses (src/ai/tools.ts); we execute them locally
// against the Zustand store and feed the results back until it answers.
// ---------------------------------------------------------------------------

/** On only when Supabase is configured AND the build opts in.
 *  Tolerant of casing/whitespace (accepts "true", "True", "1", "yes"). */
export const isLLMEnabled =
  isSupabaseConfigured &&
  ["true", "1", "yes"].includes(String(import.meta.env.VITE_AI_ENABLED ?? "").trim().toLowerCase());

export interface LLMTurn {
  text: string;
  changes: string[];
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

// Gemini's function schema doesn't accept JSON-Schema's `additionalProperties`.
function stripSchema(node: any): any {
  if (Array.isArray(node)) return node.map(stripSchema);
  if (node && typeof node === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "additionalProperties") continue;
      out[k] = stripSchema(v);
    }
    return out;
  }
  return node;
}

function geminiTools() {
  return [
    {
      functionDeclarations: TOOL_SPECS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: stripSchema(t.input_schema),
      })),
    },
  ];
}

function systemPrompt(): string {
  const ctx = readBusinessContext();
  return [
    "Eres el copiloto de negocio de Akiles Travel, para un proveedor de experiencias turísticas en El Salvador.",
    "Ayudas a gestionar y vender experiencias: perfil, precios, disponibilidad, reservas y preferencias.",
    "Puedes LEER el estado y EJECUTAR cambios llamando a las herramientas disponibles. Úsalas en vez de solo describir.",
    "Reglas:",
    "- Responde en español, cálido y accionable.",
    "- FORMATO (importante): NO escribas párrafos largos. Empieza con UNA frase de contexto; luego usa una lista con viñetas “- ” o numerada “1. ”. Usa **negritas** solo para etiquetas clave (2–4 palabras). Máximo ~5 puntos. Deja una línea en blanco entre secciones.",
    "- Cuando el proveedor pida un cambio, aplícalo con la herramienta correspondiente y confirma en una frase qué hiciste.",
    "- Si necesitas un id (experiencia/reserva), primero llama get_business_snapshot o list_experiences.",
    "- No inventes datos ni confirmes acciones que no ejecutaste. Si falta información, pregunta.",
    "",
    "Contexto actual del negocio (JSON):",
    JSON.stringify(ctx),
  ].join("\n");
}

export async function runCopilotTurn(userText: string, history: ChatTurn[]): Promise<LLMTurn> {
  if (!supabase) throw new Error("Supabase no configurado");

  const contents: any[] = history.slice(-10).map((h) => ({
    role: h.role === "assistant" ? "model" : "user",
    parts: [{ text: h.text }],
  }));
  contents.push({ role: "user", parts: [{ text: userText }] });

  const tools = geminiTools();
  const system = systemPrompt();
  const changes: string[] = [];

  for (let step = 0; step < 6; step++) {
    // Calls the SQL function public.llm_generate (Postgres → Gemini), which keeps
    // the API key in Vault server-side. See supabase/migrations/0006_llm_proxy.sql.
    const { data, error } = await supabase.rpc("llm_generate", {
      payload: { systemInstruction: { parts: [{ text: system }] }, contents, tools },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error.message ?? "Error del modelo");

    const cand = data?.candidates?.[0];
    const parts: any[] = cand?.content?.parts ?? [];
    const calls = parts.filter((p) => p.functionCall);

    if (calls.length) {
      contents.push({ role: "model", parts });
      const responseParts: any[] = [];
      for (const c of calls) {
        const res = await runTool(c.functionCall.name, c.functionCall.args ?? {});
        if (res.changes?.length) changes.push(...res.changes);
        responseParts.push({
          functionResponse: { name: c.functionCall.name, response: res },
        });
      }
      contents.push({ role: "user", parts: responseParts });
      continue;
    }

    const text = parts
      .filter((p) => typeof p.text === "string")
      .map((p) => p.text)
      .join("")
      .trim();
    return { text: text || "Listo.", changes };
  }

  return { text: "No pude completar la solicitud en varios pasos. ¿Puedes reformularla?", changes };
}

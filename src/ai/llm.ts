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

/**
 * Call the Gemini proxy (public.llm_generate). The Postgres→Gemini call is
 * synchronous, so the first request after an idle worker can be slow/cold and
 * time out — we retry once on a timeout to mask that. Returns Gemini's JSON.
 */
export async function generate(
  payload: unknown,
  opts?: { retryOnTimeout?: boolean }
): Promise<any> {
  if (!supabase) throw new Error("Supabase no configurado");
  const attempt = () => supabase!.rpc("llm_generate", { payload });
  let { data, error } = await attempt();
  const retry = opts?.retryOnTimeout ?? true;
  if (retry && error && /tim(e|ed)\s?out|timeout/i.test(error.message ?? "")) {
    ({ data, error } = await attempt());
  }
  if (error) throw error;
  if (data?.error) throw new Error(data.error.message ?? "Error del modelo");
  return data;
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
    "- DUMP DE WHATSAPP: si el proveedor describe o pega la info de una experiencia de forma desordenada (como la mandaría por WhatsApp), extrae y ORDENA todos los datos que puedas (título, precio, duración, cupos, ubicación/punto de encuentro, idiomas, etiquetas, qué incluye/no incluye, qué llevar, itinerario 'qué haremos', horarios) y aplícalos con update_experience.",
    "- GUÍA PASO A PASO: después de aplicar lo que entendiste, dile en una frase qué llenaste y luego pídele SOLO lo que falta, de a un dato o dos a la vez y en orden de importancia (precio → ubicación → horarios → fotos → incluye → itinerario). Acompáñalo hasta terminar; no lo abrumes pidiendo todo junto.",
    "- EXPERIENCIA ACTIVA (contexto): si en el contexto viene 'active_experience', ESA es la experiencia cuya tarjeta el proveedor tiene abierta. Cualquier cambio que pida SIN nombrar otra experiencia aplícalo a ESA (usa su id en update_experience). NO saltes a otra por tu cuenta.",
    "- CAMBIAR DE OBJETIVO: si el proveedor nombra otra experiencia, edita esa. Si dice 'otra' o 'otra experiencia' SIN nombrarla, y hay más de una, PREGÚNTALE cuál (lístalas por título); no adivines. Si dice que quiere CREAR una nueva, ayúdalo a crearla (no edites una existente).",
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
    // Calls public.llm_generate (Postgres → Gemini) with the key in Vault; retries
    // once on a cold-start timeout. See supabase/migrations/0006_llm_proxy.sql.
    const data = await generate({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      tools,
    });

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

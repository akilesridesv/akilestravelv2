import { supabase } from "@/lib/supabase";
import type { PublicExperience } from "@/data/repo";
import { bookableDepartures, bookableDates } from "@/lib/availability";
import { displayPrice } from "@/lib/experience";

// ---------------------------------------------------------------------------
// Tourist concierge: turns a free-form request ("café para 3 personas el 29 de
// agosto") into a warm reply + an ordered list of matching experiences. Runs on
// the SAME Gemini proxy (public.llm_generate) with structured JSON output. The
// whole (small) catalog is sent in the prompt so the model can reason + filter.
// ---------------------------------------------------------------------------

export interface ConciergeResult {
  reply: string;
  matchIds: string[];
  people: number | null;
  date: string | null;
}

function catalog(list: PublicExperience[]) {
  return list.map((e) => ({
    id: e.id,
    title: e.title,
    category: e.category ?? null,
    city: e.city ?? null,
    area: e.area ?? null,
    country: e.country ?? null,
    price_per_person: displayPrice(e).amount,
    min_people: e.min_capacity,
    max_people: e.max_capacity,
    duration_hours: e.duration_hours,
    languages: e.languages,
    description: (e.description ?? "").slice(0, 200),
    highlights: (e.highlights ?? []).slice(0, 5),
    available_dates: bookableDates(bookableDepartures(e)).slice(0, 25),
  }));
}

export async function runConciergeTurn(
  query: string,
  list: PublicExperience[]
): Promise<ConciergeResult> {
  if (!supabase) throw new Error("Supabase no configurado");

  const today = new Date().toISOString().slice(0, 10);
  const system = [
    "Eres el concierge de viajes de Akiles Travel — experiencias curadas en El Salvador.",
    `Hoy es ${today} (zona horaria El Salvador).`,
    "El turista describe lo que busca (tipo de experiencia, número de personas, fecha, presupuesto, zona). Recomienda SOLO experiencias del CATÁLOGO.",
    "Devuelve EXCLUSIVAMENTE un JSON con esta forma: { reply, matches, people, date }.",
    "- reply: texto corto, cálido y útil, en español (2–4 frases). Si hay coincidencias, descríbelas brevemente e invita a reservar. Si NO hay coincidencia exacta, dilo con amabilidad y ofrece las experiencias más parecidas que SÍ estén disponibles (idealmente en la fecha pedida). Puedes usar **negritas** y viñetas.",
    "- matches: array de ids del catálogo, ordenados por relevancia (máx 6). SOLO ids que existan en el catálogo. Si el turista pide una fecha, prioriza experiencias que la tengan en available_dates; si ninguna la tiene, incluye alternativas disponibles y acláralo en reply.",
    "- people: entero con el número de personas si lo menciona; si no, null.",
    "- date: fecha YYYY-MM-DD si menciona una (asume el próximo año en curso si no da año); si no, null.",
    "Nunca inventes experiencias, ids, precios ni fechas.",
    "",
    "CATÁLOGO (JSON):",
    JSON.stringify(catalog(list)),
  ].join("\n");

  const { data, error } = await supabase.rpc("llm_generate", {
    payload: {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: query }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            reply: { type: "string" },
            matches: { type: "array", items: { type: "string" } },
            people: { type: "integer" },
            date: { type: "string" },
          },
          required: ["reply", "matches"],
        },
      },
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error.message ?? "Error del modelo");

  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
  let parsed: any = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { reply: text, matches: [] };
  }

  const valid = new Set(list.map((e) => e.id));
  return {
    reply: typeof parsed.reply === "string" ? parsed.reply : "",
    matchIds: Array.isArray(parsed.matches) ? parsed.matches.filter((id: string) => valid.has(id)) : [],
    people: typeof parsed.people === "number" ? parsed.people : null,
    date: typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
  };
}

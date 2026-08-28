import type { PublicExperience } from "@/data/repo";
import { generate } from "@/ai/llm";
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
    tags: e.tags ?? [],
    country: e.country ?? null,
    department: e.department ?? null,
    city: e.city ?? null,
    area: e.area ?? null,
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
  const today = new Date().toISOString().slice(0, 10);
  const system = [
    "Eres el concierge de viajes de Akiles Travel — experiencias curadas en El Salvador.",
    `Hoy es ${today} (zona horaria El Salvador).`,
    "El turista describe lo que busca (tipo/actividad, número de personas, fecha, presupuesto y UBICACIÓN: país, departamento, ciudad o zona como 'El Tunco'). Recomienda SOLO experiencias del CATÁLOGO.",
    "Para el match usa: el título y la descripción, los TAGS, la categoría, y la UBICACIÓN (country/department/city/area). Ej.: 'clases de surf en El Tunco' → prioriza experiencias con tag o texto de surf y ubicadas en El Tunco / La Libertad.",
    "Sé FLEXIBLE con el lenguaje y tolera errores de escritura: 'ciudas'→'ciudad', 'aventra'→'aventura', 'surf' aunque venga mal escrito, acentos faltantes, etc.",
    "Interpreta fechas relativas respecto a hoy: 'hoy' = la fecha de hoy, 'mañana' = el día siguiente, 'este fin de semana' = el próximo sábado/domingo.",
    "Si NO hay disponibilidad en la fecha pedida, dilo con amabilidad y sugiere las FECHAS CERCANAS que sí están disponibles (mira available_dates), por ejemplo: 'Para hoy no hay disponibilidad, pero este sábado 30 puedes...'. Menciona esas fechas concretas.",
    "Actúa como un CONCIERGE experto y servicial: busca exhaustivamente por actividad, tags, ubicación y fecha; interpreta la intención aunque el pedido sea vago ('¿qué hago mañana en El Tunco?') o muy específico ('tour en lancha en El Tunco para 4'). Si no hay match exacto, ofrece SIEMPRE lo más parecido disponible y añade UNA pregunta breve para afinar (ej. '¿prefieres algo de aventura o más relax?', '¿te sirve otra fecha o zona cercana?'). Tu meta es facilitarle al turista lo que busca.",
    "SIEMPRE responde de forma útil. Nunca dejes 'matches' vacío si el catálogo tiene experiencias.",
    "Devuelve EXCLUSIVAMENTE un JSON con esta forma: { reply, matches, people, date }.",
    "- reply: texto corto, cálido y útil, en español (2–4 frases). Si hay coincidencias, descríbelas brevemente e invita a reservar. Si NO hay coincidencia exacta, dilo con amabilidad y SIEMPRE ofrece las experiencias más parecidas que estén disponibles (por actividad, zona o fecha). NUNCA te quedes sin responder ni devuelvas matches vacío si hay algo en el catálogo. Puedes usar **negritas** y viñetas.",
    "- matches: array de ids del catálogo, ordenados por relevancia (máx 6). SOLO ids que existan. Prioriza los que coincidan en ubicación y actividad; si el turista pide una fecha, prioriza los que la tengan en available_dates. Si no hay match exacto, incluye igualmente las alternativas más cercanas (no lo dejes vacío).",
    "- people: entero con el número de personas si lo menciona; si no, null.",
    "- date: fecha YYYY-MM-DD si menciona una (asume el próximo año en curso si no da año); si no, null.",
    "Nunca inventes experiencias, ids, precios ni fechas.",
    "",
    "CATÁLOGO (JSON):",
    JSON.stringify(catalog(list)),
  ].join("\n");

  // Fail fast (no retry): a slow/cold call falls back to the instant client-side
  // filter in TouristHome instead of making the tourist wait through a retry.
  const data = await generate(
    {
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
    { retryOnTimeout: false }
  );

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

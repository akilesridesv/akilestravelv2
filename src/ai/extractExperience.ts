import type { ExperienceDraft, ItineraryStop, RecurringSchedule } from "@/types/domain";
import { uid } from "@/lib/utils";
import { addHours, DAY_ABBR, parseDaysFromText, parseMoney, parseTimeToken } from "@/ai/nlp";
import { generate, isLLMEnabled } from "@/ai/llm";

// ---------------------------------------------------------------------------
// Natural language → structured ExperienceDraft.
//
// Two paths:
//  1. AI path (preferred): if VITE_AI_ENDPOINT is set, POST the prompt to a
//     backend proxy that returns structured JSON. A browser must NEVER hold a
//     raw model key, so the real LLM call lives behind a proxy (a Supabase
//     edge function later). Structured-output only — the model fills fields.
//  2. Heuristic path (always available): a Spanish parser so the app works with
//     zero setup and the "sell in minutes" flow is demoable today.
// ---------------------------------------------------------------------------

export interface ExtractionResult {
  draft: ExperienceDraft;
  summary: string;
  assumptions: string[];
  /** Important fields the agent still needs from the provider (guided flow). */
  missing: string[];
}

function genStopId(): string {
  return (crypto as any)?.randomUUID?.() ?? `stop_${Math.random().toString(36).slice(2, 10)}`;
}

// Sequence markers that signal an itinerary ("primero…, luego…, terminamos…").
const SEQ_SPLIT =
  /\b(?:primero|al inicio|para (?:empezar|comenzar|iniciar)|empezamos|comenzamos|iniciamos|luego|despu[eé]s|de ah[ií]|seguido|m[aá]s tarde|por [uú]ltimo|al final|finalmente|terminamos|finalizamos)\b/gi;

function segToStop(seg: string): ItineraryStop | null {
  const s = seg.trim();
  const tm = s.match(/\ba\s+las?\s+(\d{1,2}(?::\d{2})?)\s*(a\.?m\.?|p\.?m\.?)?/i);
  const time = tm ? tm[1] + (tm[2] ? " " + tm[2].replace(/\./g, "") : "") : undefined;
  let rest = s
    .replace(SEQ_SPLIT, " ")
    .replace(/\ba\s+las?\s+\d{1,2}(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)?/gi, " ")
    .replace(
      /\b(vamos|nos vamos|iremos|pasamos|pasaremos|visitamos|visitaremos|paramos|hacemos|haremos|llegamos|llegaremos|seguimos|continuamos|terminamos|finalizamos|estaremos|conoceremos|conocemos|recorremos|recorreremos)\b/gi,
      " "
    );
  // Keep only the first sentence (drop trailing clauses like "Máximo 8 personas").
  rest = rest.split(/\.(?:\s|$)/)[0].replace(/\s+/g, " ").trim();
  // Strip a leading preposition + article so "en el mirador" → "mirador".
  rest = rest
    .replace(
      /^(?:a\s+las?|a\s+los|al|a|en\s+el|en\s+la|en\s+los|en\s+las|en|hacia\s+el|hacia\s+la|hacia|hasta\s+el|hasta\s+la|hasta|por\s+el|por\s+la|por|de\s+la|de\s+los|de\s+las|del|el|la|los|las)\s+/i,
      ""
    )
    .trim();
  rest = rest.replace(/\s+(?:y|e)\s*$/i, "").replace(/^[,.;\s]+|[,.;\s]+$/g, "");
  if (rest.length < 2) return null;
  return { id: genStopId(), title: rest.charAt(0).toUpperCase() + rest.slice(1), time_range: time };
}

/** Best-effort itinerary from a described route (needs ≥2 sequence markers). */
function parseItinerary(text: string): ItineraryStop[] {
  const markers = [...text.matchAll(SEQ_SPLIT)];
  if (markers.length < 2) return [];
  const bounds = markers.map((m) => m.index ?? 0);
  const stops: ItineraryStop[] = [];
  for (let i = 0; i < bounds.length; i++) {
    const seg = text.slice(bounds[i], i + 1 < bounds.length ? bounds[i + 1] : text.length);
    const stop = segToStop(seg);
    if (stop) stops.push(stop);
  }
  return stops.slice(0, 10);
}

/** Key fields still empty/default that the provider should complete before publishing. */
function computeMissing(d: ExperienceDraft): string[] {
  const m: string[] = [];
  if (!d.price_per_person && !(d.tiers ?? []).length) m.push("precio por persona");
  if (!(d.description ?? "").trim()) m.push("descripción");
  if (!(d.location_address ?? "").trim() && !(d.city ?? "").trim()) m.push("punto de encuentro o ubicación");
  if (!(d.schedules ?? []).length) m.push("días y horarios de salida");
  if (!(d.image_urls ?? []).length) m.push("fotos de la experiencia");
  if (!(d.whats_included ?? []).length) m.push("qué incluye");
  return m;
}

function emptyDraft(): ExperienceDraft {
  return {
    listing_type: "experience",
    title: "",
    description: "",
    highlights: [],
    whats_included: [],
    whats_not_included: [],
    what_to_bring: [],
    price_per_person: 0,
    currency: "USD",
    min_capacity: 1,
    max_capacity: 10,
    duration_hours: 2,
    languages: ["Español"],
    tags: [],
    country: "El Salvador",
    image_urls: [],
    registration_deadline_hours: 12,
    schedules: [],
    tiers: [],
    itinerary: [],
    _sources: {},
  };
}

export function heuristicExtract(input: string): ExtractionResult {
  const text = input.trim();
  const low = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const draft = emptyDraft();
  const assumptions: string[] = [];

  // --- price ---
  const price = parseMoney(text);
  if (price != null) {
    draft.price_per_person = price;
    draft._sources.price_per_person = "extracted";
  } else {
    assumptions.push("No detecté el precio — lo dejé en $0 para que lo completes.");
  }

  // --- duration ---
  const durH = low.match(/(\d+(?:[.,]\d+)?)\s*(?:horas?|hrs?|h)\b/);
  const durMin = low.match(/(\d+)\s*(?:minutos?|mins?)\b/);
  if (durH) {
    draft.duration_hours = parseFloat(durH[1].replace(",", "."));
    draft._sources.duration_hours = "extracted";
  } else if (durMin) {
    draft.duration_hours = Math.round((parseInt(durMin[1], 10) / 60) * 10) / 10;
    draft._sources.duration_hours = "extracted";
  } else {
    assumptions.push("Asumí una duración de 2 horas.");
  }

  // --- capacity ---
  const maxM = low.match(/(?:maximo|max|hasta|cupo)\s*(?:de\s*)?(\d+)/);
  const minM = low.match(/(?:minimo|min|desde)\s*(?:de\s*)?(\d+)/);
  if (maxM) {
    draft.max_capacity = parseInt(maxM[1], 10);
    draft._sources.max_capacity = "extracted";
  } else {
    assumptions.push("Asumí un cupo máximo de 10 personas.");
  }
  if (minM) draft.min_capacity = parseInt(minM[1], 10);

  // --- days + time ---
  const days = parseDaysFromText(text);
  const startTime = parseTimeToken(text);
  if (days.length) {
    const start = startTime ?? "09:00";
    if (!startTime) assumptions.push("No detecté la hora — usé 9:00 am.");
    draft.schedules = days.map<RecurringSchedule>((dow) => ({
      id: uid("sch"),
      day_of_week: dow,
      start_time: start,
      end_time: addHours(start, draft.duration_hours),
      capacity: draft.max_capacity,
      is_active: true,
    }));
    draft._sources.schedules = "extracted";
  } else {
    assumptions.push("No detecté días de salida — agrégalos en el calendario.");
  }

  // --- location ---
  const locM = text.match(/\ben\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+){0,2})/);
  if (locM) {
    draft.city = locM[1].trim();
    draft._sources.city = "extracted";
  }

  // --- title + description ---
  const firstClause = text.split(/[,.]/)[0].trim();
  draft.title = firstClause.length >= 3 ? capitalize(firstClause) : "Nueva experiencia";
  draft._sources.title = "extracted";
  draft.description = text;
  draft._sources.description = "extracted";

  // --- what to bring ("que lleven zapatos y bloqueador") ---
  const bringM = text.match(/que\s+(?:lleven|lleve|traigan|traer|llevar)\s+([^.;]+)/i);
  if (bringM) {
    const items = bringM[1]
      .split(/,|\sy\s|\se\s/)
      .map((x) => x.trim())
      .filter((x) => x.length > 1)
      .map(capitalize);
    if (items.length) {
      draft.what_to_bring = items;
      draft._sources.what_to_bring = "extracted";
    }
  }

  // --- itinerary ("qué haremos") from a described route ---
  const itin = parseItinerary(text);
  if (itin.length) {
    draft.itinerary = itin;
    draft._sources.itinerary = "extracted";
  }

  return { draft, summary: buildSummary(draft), assumptions, missing: computeMissing(draft) };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildSummary(d: ExperienceDraft): string {
  const parts: string[] = [`Entendí “${d.title}”`];
  if (d.price_per_person) parts.push(`a $${d.price_per_person} por persona`);
  if (d.duration_hours) parts.push(`de ${d.duration_hours}h`);
  if (d.city) parts.push(`en ${d.city}`);
  if (d.schedules.length)
    parts.push(
      `salidas ${d.schedules.map((s) => DAY_ABBR[s.day_of_week]).join(", ")} a las ${d.schedules[0].start_time}`
    );
  return parts.join(" · ");
}

const ARR = { type: "array", items: { type: "string" } } as const;

/**
 * LLM path: parse a free-form / WhatsApp-style dump into a structured draft.
 * The model fills only the fields it can find; everything else stays empty and
 * is surfaced to the provider as "lo que falta". Falls back to the heuristic.
 */
async function llmExtract(input: string): Promise<ExtractionResult | null> {
  const system = [
    "Eres el asistente de un proveedor de experiencias turísticas en El Salvador (Akiles Travel).",
    "El proveedor te describe una experiencia como la mandaría por WhatsApp: texto informal, desordenado, a veces incompleto.",
    "Tu tarea: EXTRAER y ORDENAR los datos en un JSON estructurado. Llena SOLO los campos que aparezcan en el texto; deja vacío ('' o []) lo que no se mencione. NO inventes datos.",
    "Interpreta con flexibilidad y tolera errores de escritura y acentos.",
    "Para el itinerario ('qué haremos'): si el texto menciona paradas/pasos ('primero…, luego…, después…'), conviértelos en una lista ordenada de {title, subtitle, time_range, detail}.",
    "Para 'description': NO copies el texto crudo del proveedor. Redáctalo como una descripción atractiva y ordenada (2-3 frases), integrando el itinerario y sus horas cuando existan.",
    "Precio en USD (solo el número). Duración en horas (número). Cupos como enteros.",
    "Idiomas y etiquetas como listas. 'punto de encuentro' (location_address) puede ser una dirección o link de mapa.",
    "Devuelve EXCLUSIVAMENTE el JSON pedido.",
  ].join("\n");

  const data = await generate(
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: input }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            price_per_person: { type: "number" },
            duration_hours: { type: "number" },
            min_capacity: { type: "integer" },
            max_capacity: { type: "integer" },
            country: { type: "string" },
            department: { type: "string" },
            city: { type: "string" },
            area: { type: "string" },
            location_address: { type: "string" },
            tags: ARR,
            languages: ARR,
            highlights: ARR,
            whats_included: ARR,
            whats_not_included: ARR,
            what_to_bring: ARR,
            cancellation_policy: { type: "string" },
            itinerary: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  subtitle: { type: "string" },
                  time_range: { type: "string" },
                  detail: { type: "string" },
                },
                required: ["title"],
              },
            },
          },
        },
      },
    },
    { retryOnTimeout: false }
  );

  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
  let p: any;
  try {
    p = JSON.parse(text);
  } catch {
    return null;
  }
  if (!p || typeof p !== "object") return null;

  // Start from the heuristic parse (reliable for price/duration/days/description)
  // and overlay the model's richer fields (incluye, itinerario, highlights, tags…).
  const draft = heuristicExtract(input).draft;
  const mark = (k: string) => ((draft._sources as any)[k] = "extracted");
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const arr = (v: unknown) =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];

  if (str(p.title)) { draft.title = str(p.title); mark("title"); }
  if (str(p.description)) { draft.description = str(p.description); mark("description"); }
  if (typeof p.price_per_person === "number" && p.price_per_person > 0) {
    draft.price_per_person = p.price_per_person; mark("price_per_person");
  }
  if (typeof p.duration_hours === "number" && p.duration_hours > 0) {
    draft.duration_hours = p.duration_hours; mark("duration_hours");
  }
  if (Number.isFinite(p.min_capacity) && p.min_capacity > 0) draft.min_capacity = Math.round(p.min_capacity);
  if (Number.isFinite(p.max_capacity) && p.max_capacity > 0) { draft.max_capacity = Math.round(p.max_capacity); mark("max_capacity"); }
  if (str(p.country)) { draft.country = str(p.country); mark("country"); }
  if (str(p.department)) { draft.department = str(p.department); mark("department"); }
  if (str(p.city)) { draft.city = str(p.city); mark("city"); }
  if (str(p.area)) { draft.area = str(p.area); mark("area"); }
  if (str(p.location_address)) { draft.location_address = str(p.location_address); mark("location_address"); }
  if (str(p.cancellation_policy)) { draft.cancellation_policy = str(p.cancellation_policy); mark("cancellation_policy"); }
  if (arr(p.tags).length) { draft.tags = arr(p.tags); mark("tags"); }
  if (arr(p.languages).length) { draft.languages = arr(p.languages); mark("languages"); }
  if (arr(p.highlights).length) { draft.highlights = arr(p.highlights); mark("highlights"); }
  if (arr(p.whats_included).length) { draft.whats_included = arr(p.whats_included); mark("whats_included"); }
  if (arr(p.whats_not_included).length) { draft.whats_not_included = arr(p.whats_not_included); mark("whats_not_included"); }
  if (arr(p.what_to_bring).length) { draft.what_to_bring = arr(p.what_to_bring); mark("what_to_bring"); }
  if (Array.isArray(p.itinerary) && p.itinerary.length) {
    draft.itinerary = (p.itinerary as any[])
      .filter((s: any) => str(s?.title))
      .map((s: any): ItineraryStop => ({
        id: genStopId(),
        title: str(s.title),
        subtitle: str(s.subtitle) || undefined,
        time_range: str(s.time_range) || undefined,
        detail: str(s.detail) || undefined,
      }));
    if (draft.itinerary.length) mark("itinerary");
  }

  if (!draft.title) draft.title = "Nueva experiencia";

  return { draft, summary: buildSummary(draft), assumptions: [], missing: computeMissing(draft) };
}

export async function extractExperience(input: string): Promise<ExtractionResult> {
  if (isLLMEnabled) {
    try {
      const r = await llmExtract(input);
      if (r?.draft) return r;
    } catch (e) {
      console.error("extractExperience LLM error", e);
      /* fall through to heuristic */
    }
  }
  return heuristicExtract(input);
}

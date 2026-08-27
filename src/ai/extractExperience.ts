import type { ExperienceDraft, RecurringSchedule } from "@/types/domain";
import { uid } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Natural language → structured ExperienceDraft.
//
// Two paths:
//  1. AI path (preferred): if VITE_AI_ENDPOINT is set, POST the prompt to a
//     backend proxy that returns structured JSON. A browser must NEVER hold a
//     raw model key, so the real LLM call lives behind a proxy (a Supabase
//     edge function later). Structured-output only — the model fills fields,
//     it does not render UI.
//  2. Heuristic path (always available): a Spanish parser so the app works with
//     zero setup and the "sell in minutes" flow is demoable today.
// ---------------------------------------------------------------------------

const DAY_MAP: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  "miércoles": 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  "sábado": 6,
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Parse a clock token like "9am", "9:30 am", "14:00", "2 pm" → "HH:MM". */
function parseTime(raw: string): string | null {
  const m = raw
    .toLowerCase()
    .match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const mer = m[3]?.replace(/\./g, "");
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function addHours(time: string, hours: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m + Math.round(hours * 60)) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export interface ExtractionResult {
  draft: ExperienceDraft;
  /** short, human explanation of what was understood, for the copilot to show */
  summary: string;
  /** fields we could not infer and filled with a default */
  assumptions: string[];
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
    image_urls: [],
    registration_deadline_hours: 12,
    schedules: [],
    tiers: [],
    _sources: {},
  };
}

export function heuristicExtract(input: string): ExtractionResult {
  const text = input.trim();
  const low = stripAccents(text.toLowerCase());
  const draft = emptyDraft();
  const assumptions: string[] = [];

  // --- price: "$35", "35 dólares", "35 por persona" ---
  const priceMatch =
    low.match(/\$\s*(\d+(?:[.,]\d+)?)/) ||
    low.match(/(\d+(?:[.,]\d+)?)\s*(?:usd|dolares|dólares|por persona|c\/u|cada persona)/);
  if (priceMatch) {
    draft.price_per_person = parseFloat(priceMatch[1].replace(",", "."));
    draft._sources.price_per_person = "extracted";
  } else {
    assumptions.push("No detecté el precio — lo dejé en $0 para que lo completes.");
  }

  // --- duration: "3 horas", "2h", "90 minutos" ---
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

  // --- capacity: "máximo 8", "hasta 8 personas", "mínimo 2" ---
  const maxM = low.match(/(?:maximo|max|hasta|cupo)\s*(?:de\s*)?(\d+)/);
  const minM = low.match(/(?:minimo|min|desde)\s*(?:de\s*)?(\d+)/);
  if (maxM) {
    draft.max_capacity = parseInt(maxM[1], 10);
    draft._sources.max_capacity = "extracted";
  } else {
    assumptions.push("Asumí un cupo máximo de 10 personas.");
  }
  if (minM) {
    draft.min_capacity = parseInt(minM[1], 10);
    draft._sources.min_capacity = "extracted";
  }

  // --- days of week ---
  const days: number[] = [];
  for (const [name, dow] of Object.entries(DAY_MAP)) {
    if (new RegExp(`\\b${stripAccents(name)}s?\\b`).test(low) && !days.includes(dow)) {
      days.push(dow);
    }
  }
  if (/todos los dias|diario|diaria|todos los días/.test(low)) {
    for (let d = 0; d < 7; d++) if (!days.includes(d)) days.push(d);
  }

  // --- start time ---
  // Require am/pm (so "3 horas" is not read as a time) or a 24h HH:MM clock.
  const meridiem = text.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.))/i);
  const h24 = text.match(/\b(?:a\s+las\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/);
  const startTime = meridiem
    ? parseTime(meridiem[1])
    : h24
    ? parseTime(`${h24[1]}:${h24[2]}`)
    : null;

  if (days.length) {
    const start = startTime ?? "09:00";
    if (!startTime) assumptions.push("No detecté la hora — usé 9:00 am.");
    draft.schedules = days
      .sort((a, b) => a - b)
      .map<RecurringSchedule>((dow) => ({
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

  // --- location: "en Ataco", "en El Tunco" ---
  const locM = text.match(/\ben\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+){0,2})/);
  if (locM) {
    draft.city = locM[1].trim();
    draft._sources.city = "extracted";
  }

  // --- title: first clause before a comma, cleaned ---
  const firstClause = text.split(/[,.]/)[0].trim();
  draft.title = firstClause.length >= 3 ? capitalize(firstClause) : "Nueva experiencia";
  draft._sources.title = "extracted";

  // --- description: use the whole prompt as a seed the provider can refine ---
  draft.description = text;
  draft._sources.description = "extracted";

  const summary = buildSummary(draft);
  return { draft, summary, assumptions };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildSummary(d: ExperienceDraft): string {
  const parts: string[] = [];
  parts.push(`Entendí “${d.title}”`);
  if (d.price_per_person) parts.push(`a $${d.price_per_person} por persona`);
  if (d.duration_hours) parts.push(`de ${d.duration_hours}h`);
  if (d.city) parts.push(`en ${d.city}`);
  if (d.schedules.length) {
    const dn = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
    parts.push(`salidas ${d.schedules.map((s) => dn[s.day_of_week]).join(", ")} a las ${d.schedules[0].start_time}`);
  }
  return parts.join(" · ");
}

/** Public entry point — tries the AI proxy, falls back to the heuristic parser. */
export async function extractExperience(input: string): Promise<ExtractionResult> {
  const endpoint = import.meta.env.VITE_AI_ENDPOINT as string | undefined;
  if (endpoint) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "extract_experience", input }),
      });
      if (res.ok) {
        const data = (await res.json()) as ExtractionResult;
        if (data?.draft) return data;
      }
    } catch {
      // fall through to heuristic
    }
  }
  return heuristicExtract(input);
}

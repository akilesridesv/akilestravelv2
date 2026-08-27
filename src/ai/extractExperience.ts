import type { ExperienceDraft, RecurringSchedule } from "@/types/domain";
import { uid } from "@/lib/utils";
import { addHours, DAY_ABBR, parseDaysFromText, parseMoney, parseTimeToken } from "@/ai/nlp";

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

  return { draft, summary: buildSummary(draft), assumptions };
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
      /* fall through to heuristic */
    }
  }
  return heuristicExtract(input);
}

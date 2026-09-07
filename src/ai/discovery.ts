import type { PublicExperience } from "@/data/repo";
import { levenshtein, normalize } from "@/lib/fuzzy";
import { displayPrice } from "@/lib/experience";

// ---------------------------------------------------------------------------
// Tourist concierge search. Parses a free-form Spanish query into filters
// (max price, group size) + fuzzy text match over the experience. Heuristic
// today; the same signature can be backed by the LLM proxy later.
// ---------------------------------------------------------------------------

export interface ParsedQuery {
  maxPrice?: number;
  people?: number;
  text: string; // remaining free text for fuzzy match
}

// Activity identity must not use edit distance: playa/plaza and café/calle
// look alike as strings but describe unrelated experiences.
const EXPERIENCE_TYPES = [
  { id: "beach", terms: ["playa", "playas", "beach", "costa", "costero"], related: ["surf", "snorkel", "diving"] },
  { id: "surf", terms: ["surf", "surfing", "surfear"], related: ["beach"] },
  { id: "snorkel", terms: ["snorkel", "snorkeling", "esnorquel"], related: ["diving", "beach"] },
  { id: "diving", terms: ["buceo", "bucear", "diving"], related: ["snorkel"] },
  { id: "coffee", terms: ["cafe", "cafee", "coffee", "cafetal", "cafetero", "cafetera", "barismo"], related: [] },
  { id: "hiking", terms: ["senderismo", "hiking", "trekking", "sendero", "caminata"], related: ["volcano"] },
  { id: "volcano", terms: ["volcan", "volcanes"], related: ["hiking"] },
  { id: "scooter", terms: ["scooter", "scooters", "monopatin"], related: ["cycling"] },
  { id: "cycling", terms: ["bicicleta", "bicicletas", "ciclismo", "bici"], related: ["scooter"] },
  { id: "food", terms: ["gastronomia", "gastronomico", "comida", "cocina", "pupusas"], related: [] },
];

function words(text: string): string[] {
  return normalize(text).match(/[a-z0-9]+/g) ?? [];
}

function typesIn(text: string) {
  const tokens = new Set(words(text));
  return EXPERIENCE_TYPES.filter((type) => type.terms.some((term) => tokens.has(term)));
}

function experienceTypes(e: PublicExperience) {
  // Identity comes from title/category/tags, not an incidental mention in
  // directions, provider name or description (e.g. "cerca de la playa").
  return typesIn(`${e.title} ${e.category ?? ""} ${(e.tags ?? []).join(" ")}`);
}

export function hasExperienceIntent(query: string): boolean {
  return typesIn(query).length > 0;
}

export function similarExperiences(list: PublicExperience[], query: string): PublicExperience[] {
  const requested = typesIn(query);
  if (!requested.length) return [];
  const { maxPrice, people } = parseQuery(query);
  return list.filter((e) => {
    if (maxPrice != null && displayPrice(e).amount > maxPrice) return false;
    if (people != null && (e.max_capacity < people || (e.min_capacity ?? 1) > people)) return false;
    const actual = experienceTypes(e).map((type) => type.id);
    return requested.every((type) => actual.includes(type.id) || type.related.some((id) => actual.includes(id)));
  });
}

export function parseQuery(query: string): ParsedQuery {
  const low = normalize(query);
  const priceM =
    low.match(/(?:menos de|hasta|bajo|max(?:imo)?|por menos de|<)\s*\$?\s*(\d+)/) ||
    low.match(/\$\s*(\d+)/);
  const maxPrice = priceM ? parseInt(priceM[1], 10) : undefined;
  const pplM = low.match(/(\d+)\s*(?:personas?|gente|pax|adultos?|amigos?)/);
  const people = pplM ? parseInt(pplM[1], 10) : undefined;

  const text = low
    .replace(/(?:menos de|hasta|bajo|max(?:imo)?|por menos de)\s*\$?\s*\d+/g, "")
    .replace(/\$\s*\d+/g, "")
    .replace(/\d+\s*(?:personas?|gente|pax|adultos?|amigos?)/g, "")
    .replace(/\b(quiero|busco|algo|una|un|para|el|la|de|en|con|tour|tours|experiencia|experiencias)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { maxPrice, people, text };
}

export function searchExperiences(list: PublicExperience[], query: string): PublicExperience[] {
  const q = query.trim();
  if (!q) return list;
  const { maxPrice, people, text } = parseQuery(q);
  const requested = typesIn(text);

  return list.filter((e) => {
    if (maxPrice != null && displayPrice(e).amount > maxPrice) return false;
    if (people != null && e.max_capacity < people) return false;
    if (!text) return true;
    const actual = experienceTypes(e).map((type) => type.id);
    if (!requested.every((type) => actual.includes(type.id))) return false;
    const hay = `${e.title} ${e.city ?? ""} ${e.area ?? ""} ${e.department ?? ""} ${e.country ?? ""} ${
      e.category ?? ""
    } ${(e.tags ?? []).join(" ")} ${e.description} ${(e.highlights ?? []).join(" ")} ${
      e.provider?.business_name ?? ""
    }`;
    const target = words(hay);
    return words(text).every((word) =>
      requested.some((type) => type.terms.includes(word)) ||
      target.some((candidate) => candidate === word ||
        (word.length >= 5 && candidate.length >= 5 && levenshtein(word, candidate) <= 1)));
  });
}

/** Distinct cities among the experiences, most frequent first. */
export function citiesOf(list: PublicExperience[]): string[] {
  const count = new Map<string, number>();
  for (const e of list) if (e.city) count.set(e.city, (count.get(e.city) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

/** Distinct categories among the experiences. */
export function categoriesOf(list: PublicExperience[]): string[] {
  return [...new Set(list.map((e) => e.category).filter(Boolean) as string[])];
}

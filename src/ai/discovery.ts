import type { PublicExperience } from "@/data/repo";
import { fuzzyMatch, normalize } from "@/lib/fuzzy";
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
    .replace(/\b(quiero|busco|algo|una|un|para|el|la|de|en|con)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { maxPrice, people, text };
}

export function searchExperiences(list: PublicExperience[], query: string): PublicExperience[] {
  const q = query.trim();
  if (!q) return list;
  const { maxPrice, people, text } = parseQuery(q);

  return list.filter((e) => {
    if (maxPrice != null && displayPrice(e).amount > maxPrice) return false;
    if (people != null && e.max_capacity < people) return false;
    if (!text) return true;
    const hay = `${e.title} ${e.city ?? ""} ${e.area ?? ""} ${e.category ?? ""} ${e.description} ${(
      e.highlights ?? []
    ).join(" ")} ${e.provider?.business_name ?? ""}`;
    return fuzzyMatch(text, hay);
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

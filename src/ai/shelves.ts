import type { PublicExperience } from "@/data/repo";
import { generate } from "@/ai/llm";
import { displayPrice } from "@/lib/experience";

// ---------------------------------------------------------------------------
// "Cartelera" shelves for the tourist home — Netflix-style themed rows. Titles
// are hooks generated from the actual catalog ("Por si te gustó el tour en
// scooter", "Aventuras al aire libre", "Sabores de café en los pueblos"…).
// The LLM writes the titles + groupings; a heuristic keeps it working offline.
// ---------------------------------------------------------------------------

export interface Shelf {
  title: string;
  ids: string[];
}

const MIN_SHELF = 1;

function catalog(list: PublicExperience[]) {
  return list.map((e) => ({
    id: e.id,
    title: e.title,
    category: e.category ?? null,
    tags: (e.tags ?? []).slice(0, 6),
    city: e.city ?? null,
    department: e.department ?? null,
    price: displayPrice(e).amount,
    summary: (e.description ?? "").slice(0, 120),
  }));
}

/** Group experiences into a handful of themed shelves, no LLM required. */
export function heuristicShelves(list: PublicExperience[]): Shelf[] {
  if (!list.length) return [];
  const shelves: Shelf[] = [];
  const add = (title: string, items: PublicExperience[]) => {
    const ids = items.map((e) => e.id);
    if (ids.length < MIN_SHELF) return;
    // Skip a shelf whose exact id-set is already covered by an earlier one.
    const key = [...ids].sort().join(",");
    if (shelves.some((s) => [...s.ids].sort().join(",") === key)) return;
    shelves.push({ title, ids });
  };

  add("Vive momentos que no vas a olvidar", list.slice(0, 12));

  // By category (catchy hook per known category, else the raw label).
  const byCat = new Map<string, PublicExperience[]>();
  for (const e of list) if (e.category) byCat.set(e.category, [...(byCat.get(e.category) ?? []), e]);
  for (const [cat, items] of byCat) add(categoryHook(cat), items);

  // "Por si te gustó …" — anchored on the first experience, grouped with others
  // that share its category or a tag.
  const anchor = list[0];
  const anchorTags = new Set([...(anchor.tags ?? []), anchor.category].filter(Boolean) as string[]);
  const similar = list.filter(
    (e) =>
      e.id === anchor.id ||
      e.category === anchor.category ||
      (e.tags ?? []).some((t) => anchorTags.has(t))
  );
  if (similar.length > 1) add(`Por si te gustó ${shortTitle(anchor.title)}`, similar);

  // By location.
  const byCity = new Map<string, PublicExperience[]>();
  for (const e of list) {
    const place = e.city || e.department;
    if (place) byCity.set(place, [...(byCity.get(place) ?? []), e]);
  }
  for (const [place, items] of byCity) add(`Escápate a ${place}`, items);

  // By budget.
  const budget = list.filter((e) => displayPrice(e).amount > 0 && displayPrice(e).amount <= 40);
  add("Planes por menos de $40", budget);

  return shelves.slice(0, 6);
}

/** A friendlier marquee title for a known category. */
function categoryHook(cat: string): string {
  const c = cat.toLowerCase();
  if (/caf[eé]|finca/.test(c)) return "Sabores de café que enamoran";
  if (/playa|surf/.test(c)) return "Siente el mar y las olas";
  if (/aventura|adrenalina/.test(c)) return "Siente la adrenalina";
  if (/volc[aá]n|sender/.test(c)) return "Conquista volcanes y senderos";
  if (/cultura|hist/.test(c)) return "Enamórate de nuestra cultura";
  if (/pueblo/.test(c)) return "Piérdete en los pueblos mágicos";
  if (/gastro|comida/.test(c)) return "Déjate llevar por el sabor";
  if (/city|ciudad/.test(c)) return "Vive la ciudad como local";
  if (/relax|bienestar/.test(c)) return "Respira, desconéctate y relájate";
  if (/acu[aá]tico/.test(c)) return "Diviértete sobre el agua";
  if (/noct|noche/.test(c)) return "Vive la magia de la noche";
  if (/foto|paisaje/.test(c)) return "Paisajes que te quitan el aliento";
  if (/familia/.test(c)) return "Momentos para toda la familia";
  if (/arte|artesan/.test(c)) return "Descubre el arte de nuestra gente";
  if (/vip|privad/.test(c)) return "Consiéntete con una experiencia privada";
  return cat;
}

function shortTitle(t: string): string {
  const clean = t.replace(/\s+/g, " ").trim();
  return clean.length > 34 ? clean.slice(0, 32).trimEnd() + "…" : clean;
}

/** Ask the LLM to curate the cartelera; falls back to the heuristic on any issue. */
export async function generateShelves(list: PublicExperience[]): Promise<Shelf[]> {
  const fallback = heuristicShelves(list);
  if (!list.length) return fallback;

  const system = [
    "Eres el curador de la vitrina de descubrimiento de Akiles Travel — experiencias turísticas en El Salvador.",
    "Organiza el catálogo en FILAS temáticas, cada una con un TÍTULO que EVOQUE EMOCIONES: cómo se quiere sentir el turista o qué va a vivir/descubrir. Escribe en segunda persona, cálido e inspirador.",
    "NO uses palabras de marketing genéricas ni 'cartelera', 'catálogo', 'destacados', 'top'. Habla de sensaciones y experiencias. Ejemplos de tono:",
    "- 'Siente la adrenalina al aire libre'",
    "- 'Reconéctate con la naturaleza'",
    "- 'Sabores de café que enamoran'",
    "- 'Piérdete en la magia de nuestros pueblos'",
    "- 'Atardeceres frente al mar en La Libertad'",
    "- 'Si amaste rodar por la ciudad'",
    "Reglas:",
    "- Devuelve entre 2 y 6 filas (menos si hay pocas experiencias).",
    "- Cada fila: { title, ids } donde ids es un subconjunto del catálogo (mínimo 1).",
    "- Una experiencia PUEDE aparecer en varias filas. Entre todas las filas, incluye TODAS las experiencias.",
    "- La primera fila puede ser un mensaje emocional que invite a explorar (ej. 'Vive momentos que no vas a olvidar').",
    "- Usa SOLO ids que existan en el catálogo. No inventes experiencias ni ids.",
    "- Títulos cortos (máx ~7 palabras), sin comillas.",
    "Devuelve EXCLUSIVAMENTE un JSON: { shelves: [{ title, ids }] }.",
    "",
    "CATÁLOGO (JSON):",
    JSON.stringify(catalog(list)),
  ].join("\n");

  try {
    const data = await generate(
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: "Arma la cartelera." }] }],
        generationConfig: {
          temperature: 0.6,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              shelves: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    ids: { type: "array", items: { type: "string" } },
                  },
                  required: ["title", "ids"],
                },
              },
            },
            required: ["shelves"],
          },
        },
      },
      { retryOnTimeout: false }
    );

    const text: string =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
    const parsed = JSON.parse(text);
    const valid = new Set(list.map((e) => e.id));
    const shelves: Shelf[] = (Array.isArray(parsed?.shelves) ? parsed.shelves : [])
      .map((s: any) => ({
        title: typeof s?.title === "string" ? s.title.replace(/^["']|["']$/g, "").trim() : "",
        ids: Array.isArray(s?.ids) ? s.ids.filter((id: string) => valid.has(id)) : [],
      }))
      .filter((s: Shelf) => s.title && s.ids.length >= MIN_SHELF)
      .slice(0, 6);

    return shelves.length ? shelves : fallback;
  } catch {
    return fallback;
  }
}

import type { ExperienceDraft } from "@/types/domain";
import { generate, isLLMEnabled } from "@/ai/llm";

// ---------------------------------------------------------------------------
// Turn the structured draft fields into a warm, well-written tourist-facing
// description. Used by the "Redactar / Regenerar con IA" button so the provider
// never has to publish the raw, unordered text they dumped in the chat.
// ---------------------------------------------------------------------------

/** The facts we let the model use — only what the provider actually gave us. */
function facts(d: ExperienceDraft) {
  return {
    titulo: d.title,
    ubicacion: [d.area, d.city, d.department, d.country].filter(Boolean).join(", ") || undefined,
    duracion_horas: d.duration_hours || undefined,
    precio_por_persona: d.price_per_person || undefined,
    cupo: d.max_capacity ? `${d.min_capacity} a ${d.max_capacity} personas` : undefined,
    idiomas: (d.languages ?? []).length ? d.languages : undefined,
    etiquetas: (d.tags ?? []).length ? d.tags : undefined,
    highlights: (d.highlights ?? []).length ? d.highlights : undefined,
    incluye: (d.whats_included ?? []).length ? d.whats_included : undefined,
    no_incluye: (d.whats_not_included ?? []).length ? d.whats_not_included : undefined,
    que_llevar: (d.what_to_bring ?? []).length ? d.what_to_bring : undefined,
    itinerario: (d.itinerary ?? []).length
      ? d.itinerary.map((s) => ({
          hora: s.time_range || undefined,
          parada: s.title,
          detalle: s.detail || undefined,
        }))
      : undefined,
    // A hint of the provider's own words, so the model keeps their intent.
    notas_del_proveedor: (d.description ?? "").slice(0, 600) || undefined,
  };
}

/** No-LLM fallback: a tidy structured paragraph built straight from the fields. */
function fallbackDescription(d: ExperienceDraft): string {
  const loc = [d.area, d.city].filter(Boolean).join(", ") || d.department || "";
  const out: string[] = [];
  out.push(
    `${d.title}${loc ? ` en ${loc}` : ""}. Una experiencia de ${d.duration_hours || 2} ${
      (d.duration_hours || 2) === 1 ? "hora" : "horas"
    }${d.max_capacity ? ` para grupos de hasta ${d.max_capacity} personas` : ""}.`
  );
  if ((d.highlights ?? []).length) out.push(`Lo que vivirás: ${d.highlights.join("; ")}.`);
  if ((d.itinerary ?? []).length) {
    const steps = d.itinerary
      .map((s) => `${s.time_range ? `${s.time_range} — ` : ""}${s.title}${s.detail ? `: ${s.detail}` : ""}`)
      .join(" · ");
    out.push(`Recorrido: ${steps}.`);
  }
  if ((d.whats_included ?? []).length) out.push(`Incluye ${d.whats_included.join(", ")}.`);
  return out.join("\n\n");
}

export async function writeDescription(d: ExperienceDraft): Promise<string> {
  if (!isLLMEnabled) return fallbackDescription(d);

  const system = [
    "Eres redactor de experiencias turísticas para Akiles Travel (El Salvador).",
    "Con los DATOS de la experiencia (JSON), redacta una descripción atractiva, cálida y bien estructurada para el turista, en español.",
    "Reglas:",
    "- 2 a 3 párrafos cortos y fluidos. SIN viñetas, SIN títulos, SIN markdown.",
    "- Usa SOLO los datos provistos; no inventes lugares, precios ni servicios.",
    "- Integra el ITINERARIO en orden y menciona las HORAS cuando existan (ej. “A las 9:00 arrancamos en…, luego…, y cerramos en…”).",
    "- Menciona de forma natural qué incluye y los detalles clave. Cierra con una invitación breve a reservar.",
    "- Tono humano y vendedor, sin exageraciones ni datos falsos.",
    "Devuelve SOLO el texto de la descripción, sin comillas.",
  ].join("\n");

  try {
    const data = await generate(
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(facts(d)) }] }],
        generationConfig: { temperature: 0.75 },
      },
      { retryOnTimeout: false }
    );
    const text: string =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("").trim() ?? "";
    return text || fallbackDescription(d);
  } catch {
    return fallbackDescription(d);
  }
}

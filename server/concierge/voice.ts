import type { ConciergeResponse } from "../../src/concierge/contracts";
import type { CatalogExperience, Availability } from "./catalog";
import { priceOf } from "./catalog";
import type { Score, Dimension } from "./scoring";

const REASONS: Record<Dimension, string> = {
  interests: "se relaciona con los intereses que mencionaste", feelings: "su ficha coincide con el ambiente que buscas",
  adventure: "su nivel de aventura encaja con tu preferencia", group: "su ficha la recomienda para tu tipo de grupo",
  pace: "tiene el ritmo que prefieres", budget: "su precio base encaja con tu presupuesto", location: "está en una de las zonas que prefieres",
};
export function response(text: string, handoff = false): ConciergeResponse { return { text, recommendations: [], handoff }; }
export function card(e: CatalogExperience, score?: Score): ConciergeResponse["recommendations"][number] {
  const price = priceOf(e);
  const reason = (score?.supportedReasons ?? []).slice(0, 2).map((key) => REASONS[key]).join(" y ");
  return { id: e.id, title: e.title, reason: reason || "Puedes consultar los detalles de esta experiencia de Akiles.",
    price: price.amount, currency: price.currency, priceFrom: price.from,
    location: [e.city, e.department, e.country].filter(Boolean).join(", "),
    image: e.featured_image ?? undefined, path: `/e/${e.id}` };
}
export function recommendationsVoice(list: CatalogExperience[], scores: Score[]): ConciergeResponse {
  const cards = list.slice(0, 3).map((e) => card(e, scores.find((s) => s.experienceId === e.id)));
  if (!cards.length) return response("No tengo una experiencia verificada para recomendarte con esas preferencias.");
  const first = cards[0];
  return { text: `Empezaría por ${first.title}: ${first.reason}.${cards.length > 1 ? ` Como alternativa, puedes revisar ${cards[1].title}.` : ""} ¿Quieres ver qué incluye o consultar una fecha?`, recommendations: cards, handoff: false };
}
export function detailsVoice(e: CatalogExperience, topic: "details" | "includes" | "policies" | "price" | "capacity" | "schedule") {
  const price = priceOf(e);
  let text: string;
  if (topic === "includes") text = e.whats_included.length ? `${e.title} incluye, según su ficha:\n${e.whats_included.map((s) => `• ${s}`).join("\n")}` : `La ficha de ${e.title} no especifica las inclusiones. El equipo debe confirmarlas.`;
  else if (topic === "policies") text = e.cancellation_policy ? `Política registrada para ${e.title}:\n${e.cancellation_policy}` : `No hay una política registrada para ${e.title}. Confírmala con el equipo antes de reservar.`;
  else if (topic === "price") text = price.amount == null ? `La ficha de ${e.title} no tiene un precio confirmado. Consulta al equipo antes de reservar.` : `${e.title}: ${price.from ? "desde " : ""}${price.amount} ${price.currency} por persona como precio base. El total y los cargos se revisan en la pantalla de reserva.`;
  else if (topic === "capacity") text = `${e.title} registra grupos de ${e.min_capacity} a ${e.max_capacity} personas. Esto no confirma cupos libres para una fecha.`;
  else if (topic === "schedule") {
    const times = [...new Set(e.recurring_schedules.filter((s) => s.is_active).map((s) => s.start_time.slice(0,5)))];
    text = times.length ? `La ficha de ${e.title} registra horarios recurrentes a las ${times.join(", ")}. Necesito fecha y tamaño del grupo para verificar una salida concreta.` : `La ficha de ${e.title} no registra horarios recurrentes. Podemos consultar una fecha concreta.`;
  }
  // Marketing descriptions can retain stale prices/capacities. Commercial
  // answers come only from current structured fields and ticket tiers.
  else text = `${e.title}\n${e.tags.length ? `Tipo de experiencia: ${e.tags.join(", ")}.\n` : ""}${[e.city, e.department, e.country].filter(Boolean).join(", ")}\nGrupo registrado: ${e.min_capacity} a ${e.max_capacity} personas. ${price.amount == null ? "Precio por confirmar." : `Precio base actualizado: ${price.from ? "desde " : ""}${price.amount} ${price.currency} por persona.`} Podemos consultar qué incluye o verificar una fecha.`;
  return { ...response(text), recommendations: [card(e)] };
}
export function availabilityVoice(e: CatalogExperience, availability: Availability): ConciergeResponse {
  if (availability.status === "unknown") return response(`No pude verificar los cupos de ${e.title}. No puedo confirmar disponibilidad; puedes revisarla en la ficha o con el equipo.`, true);
  if (availability.status === "unavailable") return response(`No encontré cupos que cumplan la solicitud para ${e.title} el ${availability.date}. ¿Quieres probar otra fecha?`);
  return { ...response(`Al consultar ahora, ${e.title} tiene cupos para el grupo el ${availability.date} a las ${availability.times.join(", ")}. La reserva debe confirmarse en la pantalla de compra.`), recommendations: [card(e)] };
}

import type { ConciergeState, TravelerProfile } from "../../src/concierge/contracts.js";
import { interestLabels, normalize } from "./vocabulary.js";
import { response } from "./voice.js";

export function travelerGoal(p: TravelerProfile): string {
  const together = p.groupType === "couple" ? " para compartir en pareja" : p.groupType === "friends" ? " con amigos" : "";
  if (p.desiredFeelings?.includes("emocion")) return `Buscas sentir adrenalina${together}.`;
  if (p.desiredFeelings?.includes("romance")) return `Buscas un plan romántico${p.desiredFeelings.includes("calma") ? " y tranquilo" : ""}.`;
  if (p.desiredFeelings?.includes("desconexion")) return `La idea es salir de la rutina${together}.`;
  if (p.desiredFeelings?.includes("calma")) return `Buscas pasar un rato tranquilo${together}.`;
  const interests = interestLabels(p.interests);
  return interests.length ? `Buscas un plan de ${interests.slice(0, 2).join(" o ")}${together}.` : together ? `Buscas algo${together}.` : "";
}

export function noMatchVoice(state: ConciergeState, excluded: Record<string, string[]>) {
  state.recommendationLoopCount = Math.min(5, state.recommendationLoopCount + 1);
  state.recommendedExperienceIds = [];
  const previousQuestion = state.lastQuestion;
  state.pendingRelaxation = undefined;
  if (state.recommendationLoopCount >= 5) return response("No hemos dado con un plan que te convenza. El equipo de Akiles puede ayudarte a revisar opciones para tu caso.", true);
  const reasons = Object.values(excluded);
  if (reasons.some((r) => r.includes("availability_unknown"))) return response("No pude consultar los cupos en este momento. Puedes revisarlos con el equipo antes de decidir una fecha.", true);
  const p = state.travelerProfile;
  const goal = travelerGoal(p);
  let explanation = "No encontré una opción que encaje con ese plan en el catálogo de Akiles.";
  let question = "¿Qué es lo más importante para ti en este plan?";
  const options = ["budgetMax", "date", "locationPreferences", "interests", "desiredFeelings"] as const;
  // Offer one change only when the exclusion evidence supports that direction.
  const key = options.find((k) => reasons.some((r) => r.length > 0 && r.every((reason) => reason === (k === "desiredFeelings" ? "feelings_unknown" : k))));
  if (key === "budgetMax") {
    explanation = `El presupuesto de ${p.budgetMax} USD${p.budgetBasis === "group" ? " para el grupo" : " por persona"} deja fuera las opciones que encontré para ese plan.`;
    question = "¿Tienes margen para subirlo un poco?";
  } else if (key === "date") {
    explanation = `No encontré una salida que cumpla lo que buscas el ${p.date}${p.timePreference === "afternoon" ? " por la tarde" : p.timePreference === "morning" ? " por la mañana" : ""}.`;
    question = "¿Te gustaría que busque sin fijar esa fecha?";
  } else if (key === "locationPreferences") {
    explanation = `No encontré ese plan en ${p.locationPreferences?.join(" o ")} dentro del catálogo de Akiles.`;
    question = "¿Te serviría que busque en otra zona?";
  } else if (key === "interests") {
    question = "¿Te gustaría explorar otro tipo de actividad?";
  } else if (key === "desiredFeelings") {
    explanation = p.desiredFeelings?.includes("emocion")
      ? "Por ahora no tengo una opción que pueda recomendarte con ese enfoque."
      : "No tengo suficiente información para recomendarte una experiencia con ese ambiente.";
    question = p.desiredFeelings?.includes("emocion")
      ? `¿Te gustaría explorar algo diferente${p.groupType === "couple" ? " juntos" : ""}, aunque no sea de adrenalina?`
      : "¿Quieres que busque por el tipo de actividad, sin exigir ese ambiente?";
  } else if (reasons.some((r) => r.includes("adventure_unknown_or_excessive") || r.includes("physical_unknown_or_excessive"))) {
    explanation = "No puedo confirmar que las opciones cumplan el nivel de esfuerzo o aventura que necesitas.";
    // Do not invite removal of a potentially safety-related limit.
    question = "¿Quieres consultar ese punto con el equipo antes de elegir?";
    return response([goal, explanation, question].filter(Boolean).join(" "), true);
  }
  state.pendingRelaxation = key;
  if (previousQuestion === question) {
    state.lastQuestion = undefined;
    state.pendingRelaxation = undefined;
    return response(`${goal ? `${goal} ` : ""}Mantengo lo que me pediste. Con esos criterios no tengo una opción para recomendarte ahora; si quieres cambiar algo, dime qué te gustaría priorizar.`);
  }
  state.lastQuestion = question;
  return response([goal, explanation, question].filter(Boolean).join(" "));
}

export function smallTalk(message: string, state: ConciergeState): string | null {
  const text = normalize(message.trim()).replace(/[!¡¿?.]+/g, "").trim();
  if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey)$/.test(text)) {
    return state.travelerProfile.interests?.length || state.travelerProfile.desiredFeelings?.length
      ? `¡Hola! ${travelerGoal(state.travelerProfile)} ¿Seguimos con ese plan?`
      : "¡Hola! ¿Qué te gustaría hacer o cómo te gustaría pasar el día?";
  }
  if (/^(gracias|muchas gracias|perfecto|genial|thanks)( por (todo|la ayuda))?$/.test(text)) return "¡Con gusto! Aquí estoy si quieres seguir afinando el plan.";
  return null;
}

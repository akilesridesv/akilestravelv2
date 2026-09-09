import type { ConciergeState } from "../../src/concierge/contracts.js";
import type { Extraction } from "./schemas.js";
export const QUESTIONS = {
  style: "¿Te atrae más naturaleza y aventura, o un plan tranquilo con comida o café?",
  date: "¿Para qué fecha te gustaría hacerlo?",
  party: "¿Cuántas personas irían, contando adultos y niños?",
  experience: "¿De cuál experiencia hablamos? Puedes decirme su nombre o elegir una de las tarjetas.",
  budget_basis: "¿Ese presupuesto es por persona o para todo el grupo?",
};
export function checkInformationQuality(state: ConciergeState, proposal: Extraction["question"]): keyof typeof QUESTIONS | null {
  const p = state.travelerProfile;
  if (state.intent === "availability" && !p.date) return "date";
  if ((state.intent === "availability" || !!p.date) && !p.adults) return "party";
  if (p.timePreference && !p.date) return "date";
  if (p.budgetBasis === "group" && !p.adults) return "party";
  if (state.intent === "discover" && !p.interests?.length && !p.desiredFeelings?.length && !p.locationPreferences?.length) return "style";
  if (proposal === "budget_basis" && p.budgetMax != null && !p.budgetBasis) return "budget_basis";
  return null;
}
export function askSmartQuestion(state: ConciergeState, question: keyof typeof QUESTIONS): string | null {
  const text = QUESTIONS[question];
  if (state.clarificationCount >= 3 || state.lastQuestion === text) return null;
  state.stage = "understanding";
  state.missingInformation = [question];
  state.lastQuestion = text;
  state.clarificationCount++;
  return text;
}

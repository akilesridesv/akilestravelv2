import type { ConciergeState, TravelerProfile } from "../../src/concierge/contracts";
import { ProfileSchema } from "../../src/concierge/contracts";
import { ExtractionSchema, type Extraction } from "./schemas";
import type { StructuredModel } from "./model";
import { PROFILE_PROMPT } from "./prompts";
import { contains, INTERESTS, normalize } from "./vocabulary";
import { localDate } from "./catalog";

function nextDate(text: string, now: Date) {
  const today = localDate(now);
  const iso = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (iso) return ProfileSchema.shape.date.safeParse(iso).success ? iso : undefined;
  if (/manana|tomorrow/.test(text)) return new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  if (/\bhoy\b|\btoday\b/.test(text)) return today;
  const days = ["domingo|sunday", "lunes|monday", "martes|tuesday", "miercoles|wednesday", "jueves|thursday", "viernes|friday", "sabado|saturday|fin de semana"];
  const index = days.findIndex((d) => new RegExp(d).test(text));
  if (index < 0) return undefined;
  const base = new Date(`${today}T12:00:00Z`);
  const offset = (index - base.getUTCDay() + 7) % 7;
  return new Date(base.getTime() + offset * 86400000).toISOString().slice(0, 10);
}
export function classifyIntent(text: string): Extraction["intent"] {
  const q = normalize(text);
  if (/compara|compare|diferencia|versus/.test(q)) return "compare";
  if (/disponib|available|availability|hay cupo/.test(q)) return "availability";
  if (/reservar|reserva esa|book it|quiero es[at]|i want this/.test(q)) return "booking";
  if (/incluye|incluido|include|politica|policy|cuesta|price|precio|que es/.test(q)) return "specific_experience";
  if (/inventa|invent|fuera de akiles|cancel|reembolso|refund|pago|payment/.test(q)) return "general_question";
  return "discover";
}
export function deterministicExtraction(text: string, now = new Date()): Extraction {
  const q = normalize(text);
  const p: TravelerProfile = {};
  const people = q.match(/(?:somos|we are)\s+(\d+)/)?.[1] ?? q.match(/(\d+)\s*(?:personas|people|adultos|adults)/)?.[1];
  if (people && Number(people) > 0 && Number(people) <= 500) p.adults = Number(people);
  const children = q.match(/(\d+)\s*(?:ninos|children|kids)/)?.[1];
  if (children && Number(children) <= 500) p.children = Number(children);
  if (/novia|novio|girlfriend|boyfriend|pareja|couple/.test(q)) { p.groupType = "couple"; p.adults ??= 2; }
  if (/amigos|friends/.test(q)) p.groupType = "friends";
  if (/familia|family/.test(q)) p.groupType = "family";
  if (/corporativ|corporate|empresa/.test(q)) p.groupType = "corporate";
  const date = nextDate(q, now); if (date) p.date = date;
  if (/por la tarde|afternoon/.test(q)) p.timePreference = "afternoon";
  if (/por la manana|morning/.test(q)) p.timePreference = "morning";
  if (/por la noche|evening/.test(q)) p.timePreference = "evening";
  const interests = Object.entries(INTERESTS).filter(([, terms]) => terms.some((term) => contains(q, term) && !contains(q, `sin ${term}`) && !contains(q, `no ${term}`))).map(([id]) => id);
  if (interests.length) p.interests = interests;
  const feelings: string[] = [];
  if (/romantic|romance/.test(q)) feelings.push("romance");
  if (/tranquil|relax|peaceful|calma/.test(q)) { feelings.push("calma"); p.pace = "relaxed"; }
  if (/diferente|different|rutina|routine|desconect/.test(q)) feelings.push("desconexion");
  if (/conect|connection|novia|girlfriend/.test(q)) feelings.push("conexion");
  if (feelings.length) p.desiredFeelings = feelings;
  if (/no.*extrem|not too extreme|moderad/.test(q)) p.adventureLevel = 3;
  if (/too intense|demasiado intens|muy intens|muy extrem/.test(q)) { p.adventureLevel = 2; p.physicalIntensity = 2; p.avoid = ["high intensity"]; }
  const budget = q.match(/(?:hasta|menos de|maximo|under|budget|presupuesto)\s*\$?\s*(\d+)/)?.[1] ?? q.match(/\$\s*(\d+)/)?.[1];
  if (budget) { p.budgetMax = Number(budget); p.currency = "USD"; p.budgetBasis = /total|grupo|todos|group/.test(q) ? "group" : "person"; }
  for (const loc of ["Guatemala", "Honduras", "El Salvador", "San Salvador", "Santa Ana", "El Tunco", "La Libertad", "Tepecoyo", "Ataco"]) {
    if (contains(q, loc) && /\ben\b|\bin\b|cerca/.test(q)) p.locationPreferences = [loc];
  }
  const refs: string[] = [];
  const named = text.match(/(?:incluye|incluido en|cuesta|politica de|precio de)\s+(.+?)[?¿.!]*$/i)?.[1];
  if (named) refs.push(named.replace(/[?¿.!]+$/, "").trim());
  for (const ordinal of ["primera", "segunda", "tercera"]) if (contains(q, ordinal)) refs.push(ordinal);
  return { intent: classifyIntent(q), profile: p, references: refs.slice(0, 3),
    feedback: /too intense|demasiado intens|muy intens|muy extrem/.test(q) ? "too_intense" : /no me gusta|otra opcion|don't like/.test(q) ? "reject" : "none",
    questionTopic: /incluy|include/.test(q) ? "includes" : /politica|policy/.test(q) ? "policies" : /cuesta|price|precio/.test(q) ? "price" : "details", question: "none" };
}
export async function extractProfile(message: string, state: ConciergeState, model: StructuredModel, now = new Date()): Promise<Extraction> {
  const safe = deterministicExtraction(message, now);
  const inferred = await model.run(PROFILE_PROMPT, { today: localDate(now), previous: state.travelerProfile, lastQuestion: state.lastQuestion, message }, ExtractionSchema);
  if (!inferred) return safe;
  return { ...inferred, intent: safe.intent !== "discover" ? safe.intent : inferred.intent,
    profile: { ...inferred.profile, ...safe.profile },
    feedback: safe.feedback !== "none" ? safe.feedback : inferred.feedback,
    references: safe.references.length ? safe.references : inferred.references };
}
export function updateProfile(state: ConciergeState, extracted: Extraction, message: string) {
  const previous = state.travelerProfile;
  state.intent = extracted.intent;
  state.travelerProfile = ProfileSchema.parse({ ...previous, ...extracted.profile });
  // Relax only the pending constraint after explicit consent; never on timeout.
  if (state.pendingRelaxation && /^(si|yes|ok|de acuerdo|flexible)[,.!\s]*$/i.test(normalize(message.trim()))) {
    delete state.travelerProfile[state.pendingRelaxation];
    state.pendingRelaxation = undefined;
  }
  if (extracted.feedback !== "none") {
    if (extracted.feedback === "too_intense") state.travelerProfile.adventureLevel = Math.max(1, Math.min(2, (previous.adventureLevel ?? 3) - 1));
    state.rejectedExperienceIds = [...new Set([...state.rejectedExperienceIds, ...state.recommendedExperienceIds.slice(0, 1)])].slice(-100);
    state.recommendationLoopCount = Math.min(5, state.recommendationLoopCount + 1);
  }
}
export function handoffReason(message: string, p: TravelerProfile) {
  if (p.groupType === "corporate" || (p.adults ?? 0) + (p.children ?? 0) > 20) return "custom_group";
  if (/silla de ruedas|wheelchair|accesib|embaraz|pregnan|discapaci|refund|reembolso|cancel|payment|pago|seguridad|safety/.test(normalize(message))) return "special_support";
  if (p.constraints?.length) return "unsupported_constraint";
  return undefined;
}

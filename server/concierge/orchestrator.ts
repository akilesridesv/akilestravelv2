import { StateSchema, type ConciergeState, type ConciergeResponse } from "../../src/concierge/contracts.js";
import { type CatalogTools, type CatalogExperience, partySize } from "./catalog.js";
import { hardExclusions, hardFilter, scoreCandidate } from "./scoring.js";
import { extractProfile, handoffReason, updateProfile } from "./profile.js";
import { askSmartQuestion, checkInformationQuality } from "./clarification.js";
import { type StructuredModel } from "./model.js";
import { RankingSchema, type Extraction } from "./schemas.js";
import { RANK_PROMPT } from "./prompts.js";
import { contains, normalize } from "./vocabulary.js";
import { availabilityVoice, card, detailsVoice, recommendationsVoice, response } from "./voice.js";
import { noMatchVoice, smallTalk } from "./conversation.js";

export type Trace = { node: string; data?: Record<string, unknown> }[];
export function verifyIds(ids: string[], candidateIds: string[], records: CatalogExperience[]): CatalogExperience[] {
  const allowed = new Set(candidateIds);
  return [...new Set(ids)].filter((id) => allowed.has(id)).map((id) => records.find((e) => e.id === id)).filter((e): e is CatalogExperience => !!e && hardExclusions(e, {}).length === 0).slice(0, 3);
}
function resolveReferences(extraction: Extraction, state: ConciergeState, list: CatalogExperience[], message: string) {
  const ids: string[] = [];
  for (const ref of extraction.references) {
    const ordinal = ["primera", "segunda", "tercera"].indexOf(normalize(ref));
    if (ordinal >= 0 && state.recommendedExperienceIds[ordinal]) ids.push(state.recommendedExperienceIds[ordinal]);
    else {
      const found = list.filter((e) => normalize(e.title).includes(normalize(ref)) || e.id === ref);
      if (!found.length) return [];
      ids.push(...found.map((e) => e.id));
    }
  }
  if (!ids.length) ids.push(...list.filter((e) => contains(message, e.title)).map((e) => e.id));
  if (!ids.length && !extraction.references.length) ids.push(...(state.mentionedExperienceIds.length ? state.mentionedExperienceIds : state.recommendedExperienceIds));
  return [...new Set(ids)].filter((id) => list.some((e) => e.id === id));
}
export async function runConciergeTurn(input: ConciergeState, message: string, tools: CatalogTools, model: StructuredModel) {
  const state = StateSchema.parse(structuredClone(input));
  const trace: Trace = [{ node: "LOAD_SESSION" }];
  const timings: Record<string, number> = {};
  const measure = async <T>(name: string, action: () => Promise<T>): Promise<T> => {
    const started = performance.now();
    try { return await action(); } finally { timings[name] = (timings[name] ?? 0) + performance.now() - started; }
  };
  const finish = (voice: () => ConciergeResponse) => {
    const voiceStarted = performance.now();
    const result = voice();
    timings.voiceMs = performance.now() - voiceStarted;
    trace.push({ node: "END_TURN", data: { missingInformation: state.missingInformation, finalRecommendationIds: result.recommendations.map((r) => r.id), handoff: result.handoff } });
    return { state: StateSchema.parse(state), response: result, trace, timings };
  };
  state.turnCount = Math.min(1000, state.turnCount + 1);
  const greeting = smallTalk(message, state);
  if (greeting) return finish(() => response(greeting));
  if (state.turnCount >= 1000 || state.recommendationLoopCount >= 5) return finish(() => response("Llegamos al límite de esta búsqueda. Puedes iniciar una nueva conversación o pedir ayuda al equipo.", true));
  if (/inventa|invent something|make.*up|aunque no este/.test(normalize(message))) return finish(() => response("Solo puedo recomendar experiencias reales del catálogo de Akiles Travel. Puedo ayudarte a encontrar una que encaje contigo, pero no inventarla."));
  const extracted = await measure("intentProfileMs", () => extractProfile(message, state, model));
  trace.push({ node: "CLASSIFY_INTENT", data: { intent: extracted.intent } });
  updateProfile(state, extracted, message);
  trace.push({ node: "EXTRACT_PROFILE", data: { changedFields: Object.keys(extracted.profile), changes: extracted.profile } });
  if (handoffReason(message, state.travelerProfile)) return finish(() => response("Este caso necesita revisión del equipo de Akiles para confirmar condiciones y opciones. No he realizado cambios ni reservas.", true));
  trace.push({ node: "CHECK_INFORMATION_QUALITY" });
  const missing = state.intent === "discover" ? checkInformationQuality(state, extracted.question) : null;
  if (missing) {
    const question = askSmartQuestion(state, missing);
    trace.push({ node: "ASK_SMART_QUESTION" });
    return finish(() => response(question ?? "Necesito ese dato para continuar con seguridad. El equipo puede ayudarte si prefieres resolverlo con una persona.", !question));
  }
  state.missingInformation = [];
  if (state.intent === "general_question") return finish(() => response("Puedo ayudarte a descubrir, comparar y consultar experiencias del catálogo de Akiles, o abrir su pantalla de reserva. ¿Qué te gustaría hacer?"));
  trace.push({ node: "SEARCH_CATALOG" });
  state.stage = "searching";
  const catalog = await measure("catalogMs", () => tools.searchExperiences(state.travelerProfile));

  if (state.intent !== "discover") {
    const ids = resolveReferences(extracted, state, catalog, message);
    const needed = state.intent === "compare" ? 2 : 1;
    if (ids.length !== needed) {
      const question = askSmartQuestion(state, "experience");
      return finish(() => response(question ?? "No pude identificar de forma única las experiencias. Indica sus nombres exactos o consulta al equipo.", !question));
    }
    const rows = (await measure("verificationMs", () => Promise.all(ids.map((id) => tools.getExperienceDetails(id))))).filter((e): e is CatalogExperience => !!e);
    const verified = verifyIds(ids, catalog.map((e) => e.id), rows);
    trace.push({ node: "VERIFY_RESULTS", data: { ids, verified: verified.map((e) => e.id) } });
    if (verified.length !== needed) return finish(() => response("Esa experiencia ya no está disponible para consulta en el catálogo publicado."));
    state.mentionedExperienceIds = ids;
    const e = verified[0];
    if (state.intent === "specific_experience") return finish(() => detailsVoice(e, extracted.questionTopic));
    if (state.intent === "compare") {
      state.stage = "comparing";
      const scores = verified.map((v) => scoreCandidate(v, state.travelerProfile));
      const cards = verified.map((v) => card(v, scores.find((s) => s.experienceId === v.id)));
      const best = [...scores].sort((a, b) => b.totalScore - a.totalScore)[0];
      const preferred = scores[0].totalScore !== scores[1].totalScore ? cards.find((c) => c.id === best.experienceId) : undefined;
      return finish(() => ({ ...response(`${cards.map((c) => `${c.title}: ${c.price == null ? "precio por confirmar" : `${c.priceFrom ? "desde " : ""}${c.price} ${c.currency} de precio base por persona`}${c.location ? `; ${c.location}` : ""}.`).join("\n")}\n${preferred ? `Por tus preferencias, empezaría por ${preferred.title}: ${preferred.reason}.` : "Con los datos actuales no tengo suficiente evidencia para preferir una. ¿Qué te importa más del plan?"}`), recommendations: cards }));
    }
    const p = state.travelerProfile;
    const neededInfo = checkInformationQuality(state, extracted.question);
    if (neededInfo) {
      const question = askSmartQuestion(state, neededInfo);
      trace.push({ node: "ASK_SMART_QUESTION" });
      return finish(() => response(question ?? "Necesito ese dato para continuar. Puedes consultar al equipo.", !question));
    }
    state.stage = state.intent === "booking" ? "booking" : "availability";
    if (state.intent === "availability") {
      const av = await measure("availabilityMs", () => tools.checkAvailability(e.id, p.date, partySize(p), p.timePreference));
      trace.push({ node: "CHECK_AVAILABILITY", data: { status: av.status } });
      return finish(() => availabilityVoice(e, av));
    }
    if (hardExclusions(e, p).length) return finish(() => response("No puedo avanzar con esa experiencia porque no pude verificar que cumpla tus requisitos. Revisa los detalles con el equipo.", true));
    const path = await measure("bookingIntentMs", () => tools.createBookingIntent({ experienceId: e.id, date: p.date, partySize: partySize(p), timePreference: p.timePreference }));
    return finish(() => path ? { ...response(`Puedes continuar con ${e.title} en la pantalla de reserva. Todavía no se ha creado ni cobrado una reserva.`), recommendations: [card(e)], bookingPath: path } : response("No pude preparar la reserva con esos datos. Revisa otra fecha o consulta al equipo.", true));
  }

  const { valid, excluded } = await measure("filterMs", () => hardFilter(catalog, state, tools));
  state.candidateExperienceIds = valid.slice(0, 100).map((e) => e.id);
  trace.push({ node: "HARD_FILTER", data: { candidateCount: valid.length, candidateIds: valid.map((e) => e.id), excluded } });
  if (!valid.length) return finish(() => noMatchVoice(state, excluded));
  const scoringStarted = performance.now();
  const scores = valid.map((e) => scoreCandidate(e, state.travelerProfile)).sort((a, b) => b.totalScore - a.totalScore);
  timings.scoringMs = performance.now() - scoringStarted;
  const top = scores.slice(0, 5);
  trace.push({ node: "SCORE_CANDIDATES", data: { scores: top } });
  const ranking = top.length > 1 ? await measure("rankingMs", () => model.run(RANK_PROMPT, { profile: state.travelerProfile, candidates: top.map((s) => ({ ...s, metadata: valid.find((e) => e.id === s.experienceId)?.recommendation_metadata })) }, RankingSchema)) : null;
  const candidateIds = top.map((s) => s.experienceId);
  const rankedIds = ranking?.ranked.map((r) => r.experienceId).filter((id) => candidateIds.includes(id)) ?? [];
  const chosen = rankedIds.length ? rankedIds.slice(0, 3) : candidateIds.slice(0, 2);
  trace.push({ node: "AI_RANK", data: { rankingIds: ranking?.ranked.map((r) => r.experienceId) ?? [], rejectedIds: ranking?.ranked.filter((r) => !candidateIds.includes(r.experienceId)).map((r) => r.experienceId) ?? [] } });
  // Re-read records AND re-apply business/availability rules immediately before voice.
  const verificationStarted = performance.now();
  const fresh = (await Promise.all(chosen.map((id) => tools.getExperienceDetails(id)))).filter((e): e is CatalogExperience => !!e);
  const rechecked = await hardFilter(fresh, state, tools);
  const verified = verifyIds(chosen, candidateIds, rechecked.valid);
  timings.verificationMs = performance.now() - verificationStarted;
  state.recommendedExperienceIds = verified.map((e) => e.id);
  state.mentionedExperienceIds = [];
  state.candidateExperienceIds = candidateIds;
  state.recommendationConfidence = scores[0]?.totalScore;
  state.stage = "recommending";
  state.lastQuestion = verified.length ? (state.travelerProfile.date ? "¿Te cuento qué incluye?" : "¿Quieres conocer qué incluye?") : undefined;
  state.missingInformation = verified.length ? ["includes_confirmation"] : [];
  state.pendingRelaxation = undefined;
  trace.push({ node: "VERIFY_RESULTS", data: { chosenIds: chosen, verifiedIds: state.recommendedExperienceIds, verified: chosen.length === verified.length } });
  trace.push({ node: "GENERATE_RESPONSE" });
  return finish(() => recommendationsVoice(verified, verified.map((e) => scoreCandidate(e, state.travelerProfile)), state.travelerProfile));
}

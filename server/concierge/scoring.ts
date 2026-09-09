import type { ConciergeState, TravelerProfile } from "../../src/concierge/contracts.js";
import { isRecommendable, partySize, priceOf, type CatalogExperience, type CatalogTools } from "./catalog.js";
import { contains, interestMatch, normalize } from "./vocabulary.js";
export const WEIGHTS = { interests: 0.3, feelings: 0.2, adventure: 0.1, group: 0.1, pace: 0.1, budget: 0.1, location: 0.1 };
export type Dimension = keyof typeof WEIGHTS;
export type Score = { experienceId: string; totalScore: number; dimensions: Partial<Record<Dimension, number>>; supportedReasons: Dimension[] };
export function identity(e: CatalogExperience) {
  return [e.title, e.category, ...e.tags, ...(e.recommendation_metadata.interests ?? [])].join(" ");
}
export function hardExclusions(e: CatalogExperience, p: TravelerProfile): string[] {
  const reasons: string[] = [];
  const m = e.recommendation_metadata;
  if (!isRecommendable(e)) reasons.push("unpublished");
  const size = partySize(p);
  if (size != null && (size < e.min_capacity || size > e.max_capacity)) reasons.push("capacity");
  if ((p.children ?? 0) > 0 && (m.children_allowed !== true || (m.min_age ?? 0) > 0)) reasons.push("child_eligibility_unknown");
  const price = priceOf(e, size);
  const total = price.amount == null ? null : price.amount * (p.budgetBasis === "group" ? size ?? 1 : 1);
  if (total == null && (p.budgetMax != null || p.budgetMin != null)) reasons.push("price_unknown");
  if (p.date && e.ticket_tiers.length && (p.budgetMax != null || p.budgetMin != null)) reasons.push("date_price_unverified");
  if (p.currency && p.currency !== e.currency) reasons.push("currency");
  if (p.budgetMax != null && total != null && total > p.budgetMax) reasons.push("budgetMax");
  if (p.budgetMin != null && total != null && total < p.budgetMin) reasons.push("budgetMin");
  if (e.ticket_tiers.length && e.ticket_tiers.every((t) => t.quantity_available > 0 && t.quantity_sold >= t.quantity_available)) reasons.push("tickets_sold_out");
  else if (size != null && e.ticket_tiers.length && !e.ticket_tiers.some((t) => !t.quantity_available || t.quantity_available - t.quantity_sold >= size)) reasons.push("tickets_insufficient");
  if (p.locationPreferences?.length && !p.locationPreferences.some((loc) => contains([e.country, e.department, e.city, e.area].join(" "), loc))) reasons.push("locationPreferences");
  if (p.interests?.length && !p.interests.some((i) => interestMatch(i, identity(e)))) reasons.push("interests");
  if (p.avoid?.some((avoid) => contains(identity(e), avoid))) reasons.push("avoid");
  if (p.physicalIntensity != null && (m.physical_intensity == null || m.physical_intensity > p.physicalIntensity)) reasons.push("physical_unknown_or_excessive");
  if (p.adventureLevel != null && (m.adventure_level == null || m.adventure_level > p.adventureLevel)) reasons.push("adventure_unknown_or_excessive");
  if (p.transportNeeded && m.transport_included !== true) reasons.push("transport_unknown");
  if (p.constraints?.length) reasons.push("unsupported_constraint");
  // Feeling-only requests require explicit metadata; do not guess that a cafe is romantic.
  if (!p.interests?.length && p.desiredFeelings?.length && !p.desiredFeelings.some((f) => (m.desired_feelings ?? []).some((mf) => normalize(mf) === normalize(f)))) reasons.push("feelings_unknown");
  return reasons;
}
export async function hardFilter(list: CatalogExperience[], state: ConciergeState, tools: CatalogTools) {
  const valid: CatalogExperience[] = [];
  const excluded: Record<string, string[]> = {};
  for (const e of list) {
    const reasons = hardExclusions(e, state.travelerProfile);
    if (state.rejectedExperienceIds.includes(e.id)) reasons.push("rejected");
    if (!reasons.length && state.travelerProfile.date) {
      const availability = await tools.checkAvailability(e.id, state.travelerProfile.date, partySize(state.travelerProfile), state.travelerProfile.timePreference);
      if (availability.status !== "available") reasons.push(availability.status === "unknown" ? "availability_unknown" : "date");
    }
    if (reasons.length) excluded[e.id] = reasons; else valid.push(e);
  }
  return { valid, excluded };
}
export function scoreCandidate(e: CatalogExperience, p: TravelerProfile): Score {
  const m = e.recommendation_metadata;
  const dimensions: Score["dimensions"] = {};
  if (p.interests?.length) dimensions.interests = p.interests.filter((i) => interestMatch(i, identity(e))).length / p.interests.length;
  if (p.desiredFeelings?.length && m.desired_feelings) dimensions.feelings = p.desiredFeelings.filter((f) => m.desired_feelings?.some((v) => normalize(v) === normalize(f))).length / p.desiredFeelings.length;
  if (p.adventureLevel != null && m.adventure_level != null) dimensions.adventure = 1 - Math.abs(p.adventureLevel - m.adventure_level) / 4;
  if (p.groupType && m.best_for) dimensions.group = m.best_for.includes(p.groupType) ? 1 : 0;
  if (p.pace && m.pace) dimensions.pace = p.pace === m.pace ? 1 : 0;
  if (p.budgetMax != null && priceOf(e).amount != null) dimensions.budget = hardExclusions(e, p).some((r) => ["budgetMax","date_price_unverified"].includes(r)) ? 0 : 1;
  if (p.locationPreferences?.length) dimensions.location = hardExclusions(e, p).includes("locationPreferences") ? 0 : 1;
  let weighted = 0; let total = 0;
  for (const key of Object.keys(dimensions) as Dimension[]) { total += WEIGHTS[key]; weighted += WEIGHTS[key] * (dimensions[key] ?? 0); }
  return { experienceId: e.id, totalScore: total ? weighted / total : 0, dimensions,
    supportedReasons: (Object.keys(dimensions) as Dimension[]).filter((key) => (dimensions[key] ?? 0) > 0) };
}

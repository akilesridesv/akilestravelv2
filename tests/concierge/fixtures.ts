import { type CatalogExperience, type CatalogTools, type Availability, priceOf } from "../../server/concierge/catalog";
import type { StructuredModel } from "../../server/concierge/model";
export const noModel: StructuredModel = { run: async () => null };
export function experience(overrides: Partial<CatalogExperience> = {}): CatalogExperience {
  return {
    id: crypto.randomUUID(), title: "Café en Tepecoyo", description: "Recorrido por un cafetal y degustación.", category: "Café", tags: ["cafe", "naturaleza"],
    country: "El Salvador", department: "La Libertad", city: "Tepecoyo", area: null, price_per_person: 35, currency: "USD",
    min_capacity: 1, max_capacity: 8, is_active: true, publication_status: "published", registration_deadline_hours: 2,
    featured_image: null, whats_included: ["Degustación de café"], cancellation_policy: "Consultar 24 horas antes.",
    provider_profile_id: null, provider_profiles: null, recurring_schedules: [], date_slots: [], ticket_tiers: [],
    recommendation_metadata: { interests: ["cafe", "naturaleza"], desired_feelings: ["romance", "calma", "conexion"], best_for: ["couple"], pace: "relaxed", adventure_level: 1, physical_intensity: 1 }, ...overrides,
  };
}
export function fixtureTools(catalog: CatalogExperience[], availability: Availability["status"] = "available") {
  const calls: string[] = [];
  const tools: CatalogTools = {
    searchExperiences: async () => { calls.push("search"); return catalog; },
    getExperienceDetails: async (id) => { calls.push(`details:${id}`); return catalog.find((e) => e.id === id) ?? null; },
    getExperiencePrice: async (id) => { const e = catalog.find((e) => e.id === id); return e ? priceOf(e) : null; },
    getExperiencePolicies: async (id) => catalog.find((e) => e.id === id)?.cancellation_policy ?? null,
    checkAvailability: async (id, date) => { calls.push(`availability:${id}`); return { status: availability, date, times: availability === "available" ? ["14:00"] : [] }; },
    createBookingIntent: async ({ experienceId }) => { calls.push(`bookingIntent:${experienceId}`); return `/e/${experienceId}`; },
  };
  return { tools, calls };
}

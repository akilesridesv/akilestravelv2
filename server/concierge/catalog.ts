import { z } from "zod";
import type { TravelerProfile } from "../../src/concierge/contracts";
import { MetadataSchema } from "./schemas";
import { SupabaseToolsTransport, ToolError } from "./transport";

const ScheduleSchema = z.object({ day_of_week: z.number(), start_time: z.string(), capacity: z.number(), is_active: z.boolean() });
const SlotSchema = z.object({ slot_date: z.string(), start_time: z.string(), capacity: z.number(), status: z.string() });
const TierSchema = z.object({ price: z.coerce.number().nonnegative(), quantity_available: z.number(), quantity_sold: z.number() });
export const ExperienceSchema = z.object({
  id: z.string().uuid(), title: z.string(), description: z.string(), category: z.string().nullable(),
  tags: z.array(z.string()).nullable().transform((v) => v ?? []),
  country: z.string().nullable(), department: z.string().nullable(), city: z.string().nullable(), area: z.string().nullable(),
  price_per_person: z.coerce.number().nonnegative(), currency: z.string(),
  min_capacity: z.number(), max_capacity: z.number(), is_active: z.boolean(), publication_status: z.string(),
  registration_deadline_hours: z.number(), featured_image: z.string().nullable(),
  whats_included: z.array(z.string()), cancellation_policy: z.string().nullable(),
  provider_profile_id: z.string().uuid().nullable(),
  provider_profiles: z.object({ verification_status: z.string(), booking_mode: z.string() }).nullable(),
  recommendation_metadata: z.unknown().transform((v) => MetadataSchema.safeParse(v ?? {}).success ? MetadataSchema.parse(v ?? {}) : {}),
  recurring_schedules: z.array(ScheduleSchema), date_slots: z.array(SlotSchema), ticket_tiers: z.array(TierSchema),
});
export type CatalogExperience = z.infer<typeof ExperienceSchema>;
export type Availability = { status: "available" | "unavailable" | "unknown"; date?: string; times: string[]; checkedAt?: string };
export interface CatalogTools {
  searchExperiences(filters: TravelerProfile): Promise<CatalogExperience[]>;
  getExperienceDetails(id: string): Promise<CatalogExperience | null>;
  getExperiencePrice(id: string): Promise<ReturnType<typeof priceOf> | null>;
  getExperiencePolicies(id: string): Promise<string | null>;
  checkAvailability(id: string, date?: string, partySize?: number, time?: TravelerProfile["timePreference"]): Promise<Availability>;
  createBookingIntent(input: { experienceId: string; date?: string; partySize?: number }): Promise<string | null>;
}
export function isRecommendable(e: CatalogExperience) {
  return e.is_active && e.publication_status === "published" &&
    (!e.provider_profile_id || e.provider_profiles?.verification_status === "approved");
}
export function priceOf(e: CatalogExperience) {
  const prices = e.ticket_tiers.filter((t) => !t.quantity_available || t.quantity_sold < t.quantity_available).map((t) => t.price);
  return { amount: prices.length ? Math.min(...prices) : e.price_per_person, from: prices.length > 0, currency: e.currency };
}
export function partySize(p: TravelerProfile) { return p.adults == null ? undefined : p.adults + (p.children ?? 0); }
export function localDate(now = new Date()) { return new Date(now.getTime() - 6 * 3600000).toISOString().slice(0, 10); }
export function eligibleSlots(e: CatalogExperience, date: string, now = new Date(), time?: TravelerProfile["timePreference"]) {
  const explicit = new Map(e.date_slots.filter((s) => s.slot_date === date).map((s) => [s.start_time.slice(0, 5), s]));
  const slots = [...explicit.values()].filter((s) => s.status === "open");
  const day = new Date(`${date}T12:00:00-06:00`).getUTCDay();
  for (const s of e.recurring_schedules) {
    if (s.is_active && s.day_of_week === day && !explicit.has(s.start_time.slice(0, 5))) slots.push({ ...s, slot_date: date, status: "open" });
  }
  return slots.filter((s) => {
    const hour = Number(s.start_time.slice(0, 2));
    const matchesTime = !time || (time === "morning" ? hour < 12 : time === "afternoon" ? hour >= 12 && hour < 18 : hour >= 18);
    return matchesTime && new Date(`${date}T${s.start_time.slice(0, 5)}:00-06:00`).getTime() - now.getTime() >= e.registration_deadline_hours * 3600000;
  });
}
const SELECT = "id,title,description,category,tags,country,department,city,area,price_per_person,currency,min_capacity,max_capacity,is_active,publication_status,registration_deadline_hours,featured_image,whats_included,cancellation_policy,provider_profile_id,recommendation_metadata,provider_profiles(verification_status,booking_mode),recurring_schedules(day_of_week,start_time,capacity,is_active),date_slots(slot_date,start_time,capacity,status),ticket_tiers(price,quantity_available,quantity_sold)";
export class SupabaseCatalog implements CatalogTools {
  constructor(private db: SupabaseToolsTransport, private log: (tool: string) => void = () => {}) {}
  async searchExperiences(_filters: TravelerProfile) {
    this.log("searchExperiences");
    const result: CatalogExperience[] = [];
    // Paginate instead of silently accepting PostgREST's default 1,000-row cap.
    for (let offset = 0; offset < 5000; offset += 200) {
      const query = new URLSearchParams({ select: SELECT, publication_status: "eq.published", is_active: "eq.true", order: "id", limit: "200", offset: String(offset) });
      const rows = z.array(ExperienceSchema).parse(await this.db.request(`activities?${query}`));
      result.push(...rows.filter(isRecommendable));
      if (rows.length < 200) return result;
    }
    throw new ToolError("catalog_limit");
  }
  async getExperienceDetails(id: string) {
    this.log("getExperienceDetails");
    z.string().uuid().parse(id);
    const q = new URLSearchParams({ select: SELECT, id: `eq.${id}`, is_active: "eq.true", publication_status: "eq.published" });
    const rows = z.array(ExperienceSchema).parse(await this.db.request(`activities?${q}`));
    return rows.find(isRecommendable) ?? null;
  }
  async getExperiencePrice(id: string) { const e = await this.getExperienceDetails(id); return e ? priceOf(e) : null; }
  async getExperiencePolicies(id: string) { return (await this.getExperienceDetails(id))?.cancellation_policy ?? null; }
  async checkAvailability(id: string, date?: string, size?: number, time?: TravelerProfile["timePreference"]): Promise<Availability> {
    this.log("checkAvailability");
    if (!date || !size) return { status: "unknown", date, times: [] };
    const e = await this.getExperienceDetails(id);
    if (!e || size < e.min_capacity || size > e.max_capacity) return { status: "unavailable", date, times: [] };
    try {
      const slots = eligibleSlots(e, date, new Date(), time);
      const times: string[] = [];
      for (const s of slots) {
        const booked = z.number().int().nonnegative().parse(await this.db.rpc("slot_booked_seats", { p_activity: id, p_date: date, p_time: s.start_time }));
        if (s.capacity - booked >= size) times.push(s.start_time.slice(0, 5));
      }
      return { status: times.length ? "available" : "unavailable", date, times, checkedAt: new Date().toISOString() };
    } catch { return { status: "unknown", date, times: [] }; }
  }
  async createBookingIntent(input: { experienceId: string; date?: string; partySize?: number }) {
    this.log("createBookingIntent");
    const e = await this.getExperienceDetails(input.experienceId);
    if (!e) return null;
    if (input.date && (await this.checkAvailability(e.id, input.date, input.partySize)).status !== "available") return null;
    const q = new URLSearchParams();
    if (input.date) q.set("date", input.date);
    if (input.partySize) q.set("people", String(input.partySize));
    // Navigation intent only: existing checkout performs final validation/payment.
    return `/e/${e.id}${q.size ? `?${q}` : ""}`;
  }
}

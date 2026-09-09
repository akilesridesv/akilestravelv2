import { z } from "zod";
import { ProfileSchema, type TravelerProfile } from "../../src/concierge/contracts.js";
import { MetadataSchema } from "./schemas.js";
import { SupabaseToolsTransport, ToolError } from "./transport.js";

const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const moneySchema = z.union([z.number().nonnegative(), z.string().regex(/^\d+(?:\.\d+)?$/).transform(Number).pipe(z.number().nonnegative())]).nullable();
const ScheduleSchema = z.object({ day_of_week: z.number().int().min(0).max(6), start_time: timeSchema, capacity: z.number().int().nonnegative(), is_active: z.boolean(), tier_ids: z.array(z.string().uuid()).optional() });
const SlotSchema = z.object({ slot_date: z.string(), start_time: timeSchema, capacity: z.number().int().nonnegative(), status: z.string(), tier_ids: z.array(z.string().uuid()).optional() });
const TierSchema = z.object({ id: z.string().uuid().optional(), price: moneySchema, quantity_available: z.number().int().nonnegative(), quantity_sold: z.number().int().nonnegative() });
export const ExperienceSchema = z.object({
  id: z.string().uuid(), title: z.string(), description: z.string(), category: z.string().nullable(),
  tags: z.array(z.string()).nullable().transform((v) => v ?? []),
  country: z.string().nullable(), department: z.string().nullable(), city: z.string().nullable(), area: z.string().nullable(),
  price_per_person: moneySchema, currency: z.string(),
  min_capacity: z.number().int().positive(), max_capacity: z.number().int().positive(), is_active: z.boolean(), publication_status: z.string(),
  registration_deadline_hours: z.number().nonnegative(), featured_image: z.string().nullable(),
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
  createBookingIntent(input: { experienceId: string; date?: string; partySize?: number; timePreference?: TravelerProfile["timePreference"] }): Promise<string | null>;
}
export function isRecommendable(e: CatalogExperience) {
  return e.is_active && e.publication_status === "published" && e.min_capacity <= e.max_capacity &&
    (!e.provider_profile_id || e.provider_profiles?.verification_status === "approved");
}
export function priceOf(e: CatalogExperience, size = 1) {
  const prices = e.ticket_tiers.filter((t) => !t.quantity_available || t.quantity_available - t.quantity_sold >= size).map((t) => t.price).filter((p): p is number => p != null);
  return { amount: e.ticket_tiers.length ? prices.length ? Math.min(...prices) : null : e.price_per_person, from: prices.length > 0, currency: e.currency };
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
const SELECT = "id,title,description,category,tags,country,department,city,area,price_per_person,currency,min_capacity,max_capacity,is_active,publication_status,registration_deadline_hours,featured_image,whats_included,cancellation_policy,provider_profile_id,recommendation_metadata,provider_profiles(verification_status,booking_mode),recurring_schedules(day_of_week,start_time,capacity,is_active,tier_ids),date_slots(slot_date,start_time,capacity,status,tier_ids),ticket_tiers(id,price,quantity_available,quantity_sold)";
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
    if (!date || !ProfileSchema.shape.date.safeParse(date).success || !size || !Number.isInteger(size) || size < 1) return { status: "unknown", date, times: [] };
    const e = await this.getExperienceDetails(id);
    if (!e || size < e.min_capacity || size > e.max_capacity) return { status: "unavailable", date, times: [] };
    try {
      const slots = eligibleSlots(e, date, new Date(), time);
      const times: string[] = [];
      for (const s of slots) {
        if (e.ticket_tiers.length) {
          const tiers = e.ticket_tiers.filter((t) => !s.tier_ids?.length || (t.id && s.tier_ids.includes(t.id)));
          if (!tiers.some((t) => !t.quantity_available || t.quantity_available - t.quantity_sold >= size)) continue;
        }
        const booked = z.number().int().nonnegative().parse(await this.db.rpc("slot_booked_seats", { p_activity: id, p_date: date, p_time: s.start_time }));
        if (Math.min(s.capacity, e.max_capacity) - booked >= size) times.push(s.start_time.slice(0, 5));
      }
      return { status: times.length ? "available" : "unavailable", date, times, checkedAt: new Date().toISOString() };
    } catch { return { status: "unknown", date, times: [] }; }
  }
  async createBookingIntent(input: { experienceId: string; date?: string; partySize?: number; timePreference?: TravelerProfile["timePreference"] }) {
    this.log("createBookingIntent");
    const e = await this.getExperienceDetails(input.experienceId);
    if (!e) return null;
    if (input.partySize != null && (!Number.isInteger(input.partySize) || input.partySize < e.min_capacity || input.partySize > e.max_capacity)) return null;
    if (input.date && (await this.checkAvailability(e.id, input.date, input.partySize, input.timePreference)).status !== "available") return null;
    const q = new URLSearchParams();
    if (input.date) q.set("date", input.date);
    if (input.partySize) q.set("people", String(input.partySize));
    // Navigation intent only: existing checkout performs final validation/payment.
    return `/e/${e.id}${q.size ? `?${q}` : ""}`;
  }
}

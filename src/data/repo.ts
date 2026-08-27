import { supabase } from "@/lib/supabase";
import type {
  Booking,
  DateSlot,
  Experience,
  ProviderProfile,
  RecurringSchedule,
  TicketTier,
} from "@/types/domain";

// Data access against Supabase. Only called when the client is configured.
function sb() {
  if (!supabase) throw new Error("Supabase not configured");
  return supabase;
}

// --- provider profile -------------------------------------------------------

function mapProvider(r: any): ProviderProfile {
  return {
    id: r.id,
    user_id: r.user_id,
    business_name: r.business_name,
    bio: r.bio ?? undefined,
    verification_status: r.verification_status,
    booking_mode: r.booking_mode,
    created_at: r.created_at,
  };
}

export async function ensureProviderProfile(userId: string, name?: string): Promise<ProviderProfile> {
  const c = sb();
  const { data: existing } = await c
    .from("provider_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return mapProvider(existing);
  const { data, error } = await c
    .from("provider_profiles")
    .insert({ user_id: userId, business_name: name || "Mi negocio" })
    .select()
    .single();
  if (error) throw error;
  return mapProvider(data);
}

// --- experiences ------------------------------------------------------------

function assemble(a: any, sch: any[], tiers: any[], ds: any[]): Experience {
  return {
    id: a.id,
    provider_profile_id: a.provider_profile_id ?? "",
    listing_type: a.listing_type,
    title: a.title,
    description: a.description ?? "",
    highlights: a.highlights ?? [],
    whats_included: a.whats_included ?? [],
    whats_not_included: a.whats_not_included ?? [],
    what_to_bring: a.what_to_bring ?? [],
    price_per_person: Number(a.price_per_person) || 0,
    currency: "USD",
    min_capacity: a.min_capacity ?? 1,
    max_capacity: a.max_capacity ?? 10,
    duration_hours: Number(a.duration_hours) || 2,
    languages: a.languages ?? ["Español"],
    category: a.category ?? undefined,
    city: a.city ?? undefined,
    area: a.area ?? undefined,
    location_address: a.location_address ?? undefined,
    location_lat: a.location_lat ?? undefined,
    location_lng: a.location_lng ?? undefined,
    image_urls: a.image_urls ?? [],
    featured_image: a.featured_image ?? undefined,
    publication_status: a.publication_status,
    is_active: a.is_active,
    registration_deadline_hours: a.registration_deadline_hours ?? 12,
    event_date: a.event_date ?? undefined,
    schedules: sch
      .filter((s) => s.activity_id === a.id)
      .map<RecurringSchedule>((s) => ({
        id: s.id,
        day_of_week: s.day_of_week,
        start_time: (s.start_time ?? "09:00").slice(0, 5),
        end_time: s.end_time ? s.end_time.slice(0, 5) : undefined,
        capacity: s.capacity,
        is_active: s.is_active,
        tier_ids: s.tier_ids ?? [],
      })),
    date_slots: ds
      .filter((s) => s.activity_id === a.id)
      .map<DateSlot>((s) => ({
        id: s.id,
        slot_date: s.slot_date,
        start_time: (s.start_time ?? "09:00").slice(0, 5),
        end_time: s.end_time ? s.end_time.slice(0, 5) : undefined,
        capacity: s.capacity,
        status: s.status,
        tier_ids: s.tier_ids ?? [],
      })),
    tiers: tiers
      .filter((t) => t.activity_id === a.id)
      .map<TicketTier>((t) => ({
        id: t.id,
        tier_name: t.tier_name,
        description: t.description ?? undefined,
        price: Number(t.price) || 0,
        quantity_available: t.quantity_available ?? 0,
        quantity_sold: t.quantity_sold ?? 0,
      })),
    created_at: a.created_at,
    updated_at: a.updated_at,
  };
}

export async function loadExperiences(userId: string): Promise<Experience[]> {
  const c = sb();
  const { data: acts, error } = await c
    .from("activities")
    .select("*")
    .eq("created_by", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!acts?.length) return [];
  const ids = acts.map((a) => a.id);
  const [sch, tiers, ds] = await Promise.all([
    c.from("recurring_schedules").select("*").in("activity_id", ids),
    c.from("ticket_tiers").select("*").in("activity_id", ids),
    c.from("date_slots").select("*").in("activity_id", ids),
  ]);
  return acts.map((a) => assemble(a, sch.data ?? [], tiers.data ?? [], ds.data ?? []));
}

export async function saveExperience(exp: Experience, providerId?: string): Promise<void> {
  const c = sb();
  const row = {
    id: exp.id,
    provider_profile_id: providerId ?? exp.provider_profile_id ?? null,
    listing_type: exp.listing_type,
    title: exp.title,
    description: exp.description,
    highlights: exp.highlights,
    whats_included: exp.whats_included,
    whats_not_included: exp.whats_not_included,
    what_to_bring: exp.what_to_bring,
    price_per_person: exp.price_per_person,
    currency: exp.currency,
    min_capacity: exp.min_capacity,
    max_capacity: exp.max_capacity,
    duration_hours: exp.duration_hours,
    languages: exp.languages,
    category: exp.category ?? null,
    city: exp.city ?? null,
    area: exp.area ?? null,
    location_address: exp.location_address ?? null,
    location_lat: exp.location_lat ?? null,
    location_lng: exp.location_lng ?? null,
    image_urls: exp.image_urls,
    featured_image: exp.featured_image ?? null,
    publication_status: exp.publication_status,
    is_active: exp.is_active,
    registration_deadline_hours: exp.registration_deadline_hours,
    event_date: exp.event_date ?? null,
  };
  const up = await c.from("activities").upsert(row);
  if (up.error) throw up.error;

  await Promise.all([
    c.from("recurring_schedules").delete().eq("activity_id", exp.id),
    c.from("ticket_tiers").delete().eq("activity_id", exp.id),
    c.from("date_slots").delete().eq("activity_id", exp.id),
  ]);

  const jobs: PromiseLike<{ error: any }>[] = [];
  if (exp.schedules.length)
    jobs.push(
      c.from("recurring_schedules").insert(
        exp.schedules.map((s) => ({
          id: s.id,
          activity_id: exp.id,
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time ?? null,
          capacity: s.capacity,
          is_active: s.is_active,
          tier_ids: s.tier_ids ?? [],
        }))
      )
    );
  if (exp.tiers.length)
    jobs.push(
      c.from("ticket_tiers").insert(
        exp.tiers.map((t) => ({
          id: t.id,
          activity_id: exp.id,
          tier_name: t.tier_name,
          description: t.description ?? null,
          price: t.price,
          quantity_available: t.quantity_available,
          quantity_sold: t.quantity_sold,
        }))
      )
    );
  if ((exp.date_slots ?? []).length)
    jobs.push(
      c.from("date_slots").insert(
        exp.date_slots!.map((s) => ({
          id: s.id,
          activity_id: exp.id,
          slot_date: s.slot_date,
          start_time: s.start_time,
          end_time: s.end_time ?? null,
          capacity: s.capacity,
          status: s.status,
          tier_ids: s.tier_ids ?? [],
        }))
      )
    );
  const results = await Promise.all(jobs);
  for (const r of results) if (r.error) throw r.error;
}

export async function deleteExperience(id: string): Promise<void> {
  const { error } = await sb().from("activities").delete().eq("id", id);
  if (error) throw error;
}

// --- bookings ---------------------------------------------------------------

function mapBooking(r: any): Booking {
  return {
    id: r.id,
    activity_id: r.activity_id,
    experience_title: r.activities?.title ?? "",
    contact_name: r.contact_name,
    contact_email: r.contact_email,
    number_of_people: r.number_of_people,
    scheduled_date: r.scheduled_date ?? "",
    scheduled_time: r.scheduled_time ? r.scheduled_time.slice(0, 5) : "",
    booking_status: r.booking_status,
    confirmation_code: r.confirmation_code,
    subtotal_paid: Number(r.subtotal_paid) || 0,
    service_fee_paid: Number(r.service_fee_paid) || 0,
    total_paid: Number(r.total_paid) || 0,
    created_at: r.created_at,
  };
}

export async function loadBookings(): Promise<Booking[]> {
  const { data, error } = await sb()
    .from("bookings")
    .select("*, activities(title)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapBooking);
}

export async function updateBookingStatus(id: string, status: Booking["booking_status"]): Promise<void> {
  const { error } = await sb().from("bookings").update({ booking_status: status }).eq("id", id);
  if (error) throw error;
}

// --- copilot chat history ---------------------------------------------------

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  blocks: unknown[];
}

export async function loadMessages(userId: string): Promise<StoredMessage[]> {
  const { data, error } = await sb()
    .from("copilot_messages")
    .select("id, role, blocks")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, role: r.role, blocks: r.blocks ?? [] }));
}

export async function saveMessage(
  m: StoredMessage & { user_id: string; created_at?: string }
): Promise<void> {
  const { error } = await sb().from("copilot_messages").insert({
    id: m.id,
    user_id: m.user_id,
    role: m.role,
    blocks: m.blocks,
    ...(m.created_at ? { created_at: m.created_at } : {}),
  });
  if (error) throw error;
}


import { supabase } from "@/lib/supabase";
import type {
  AppNotification,
  Booking,
  BookingMessage,
  ConciergeRequest,
  DateSlot,
  Experience,
  ProviderProfile,
  RecurringSchedule,
  TicketTier,
  TouristProfile,
} from "@/types/domain";
import { withProviderDefaults } from "@/types/domain";
import { uid } from "@/lib/utils";

// Data access against Supabase. Only called when the client is configured.
function sb() {
  if (!supabase) throw new Error("Supabase not configured");
  return supabase;
}

// --- provider profile -------------------------------------------------------

function mapProvider(r: any): ProviderProfile {
  return withProviderDefaults({
    id: r.id,
    user_id: r.user_id,
    business_name: r.business_name,
    tagline: r.tagline ?? undefined,
    bio: r.bio ?? undefined,
    contact_email: r.contact_email ?? undefined,
    contact_phone: r.contact_phone ?? undefined,
    whatsapp: r.whatsapp ?? undefined,
    city: r.city ?? undefined,
    languages: r.languages ?? undefined,
    logo_url: r.logo_url ?? undefined,
    cover_url: r.cover_url ?? undefined,
    social: r.social ?? undefined,
    preferences: r.preferences ?? undefined,
    verification_status: r.verification_status,
    booking_mode: r.booking_mode,
    created_at: r.created_at,
  });
}

export async function saveProvider(p: ProviderProfile): Promise<void> {
  const { error } = await sb()
    .from("provider_profiles")
    .update({
      business_name: p.business_name,
      tagline: p.tagline ?? null,
      bio: p.bio ?? null,
      contact_email: p.contact_email ?? null,
      contact_phone: p.contact_phone ?? null,
      whatsapp: p.whatsapp ?? null,
      city: p.city ?? null,
      languages: p.languages,
      logo_url: p.logo_url ?? null,
      cover_url: p.cover_url ?? null,
      social: p.social,
      preferences: p.preferences,
      booking_mode: p.booking_mode,
    })
    .eq("id", p.id);
  if (error) throw error;
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
    tags: a.tags ?? [],
    country: a.country ?? undefined,
    department: a.department ?? undefined,
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
    cancellation_policy: a.cancellation_policy ?? undefined,
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
    itinerary: Array.isArray(a.itinerary) ? a.itinerary : [],
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
    tags: exp.tags ?? [],
    country: exp.country ?? null,
    department: exp.department ?? null,
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
    cancellation_policy: exp.cancellation_policy ?? null,
    event_date: exp.event_date ?? null,
    itinerary: exp.itinerary ?? [],
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

// --- public (tourist) reads -------------------------------------------------

export interface PublicExperience extends Experience {
  provider?: ProviderProfile;
}

async function loadChildren(ids: string[]) {
  const c = sb();
  const [sch, tiers, ds] = await Promise.all([
    c.from("recurring_schedules").select("*").in("activity_id", ids),
    c.from("ticket_tiers").select("*").in("activity_id", ids),
    c.from("date_slots").select("*").in("activity_id", ids),
  ]);
  return { sch: sch.data ?? [], tiers: tiers.data ?? [], ds: ds.data ?? [] };
}

/** All published + active experiences from approved providers (RLS-enforced). */
export async function loadPublishedExperiences(): Promise<PublicExperience[]> {
  const c = sb();
  const { data: acts, error } = await c
    .from("activities")
    .select("*")
    .eq("is_active", true)
    .eq("publication_status", "published")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!acts?.length) return [];

  const ids = acts.map((a) => a.id);
  const provIds = [...new Set(acts.map((a) => a.provider_profile_id).filter(Boolean))];
  const [{ sch, tiers, ds }, provs] = await Promise.all([
    loadChildren(ids),
    provIds.length
      ? c.from("provider_profiles").select("*").in("id", provIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const provMap = new Map((provs.data ?? []).map((r: any) => [r.id, mapProvider(r)]));
  return acts.map((a) => ({
    ...assemble(a, sch, tiers, ds),
    provider: a.provider_profile_id ? provMap.get(a.provider_profile_id) : undefined,
  }));
}

/** A single published experience with its provider, for the detail page. */
export async function loadPublishedExperience(id: string): Promise<PublicExperience | null> {
  const c = sb();
  const { data: a, error } = await c
    .from("activities")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .eq("publication_status", "published")
    .maybeSingle();
  if (error) throw error;
  if (!a) return null;

  const { sch, tiers, ds } = await loadChildren([a.id]);
  let provider: ProviderProfile | undefined;
  if (a.provider_profile_id) {
    const { data: p } = await c
      .from("provider_profiles")
      .select("*")
      .eq("id", a.provider_profile_id)
      .maybeSingle();
    if (p) provider = mapProvider(p);
  }
  return { ...assemble(a, sch, tiers, ds), provider };
}

/** A provider's public profile plus their published experiences (/p/:id). */
export async function loadProviderPublicById(
  providerId: string
): Promise<{ provider: ProviderProfile; experiences: PublicExperience[] } | null> {
  const c = sb();
  const { data: p } = await c
    .from("provider_profiles")
    .select("*")
    .eq("id", providerId)
    .maybeSingle();
  if (!p) return null;
  const provider = mapProvider(p);

  const { data: acts } = await c
    .from("activities")
    .select("*")
    .eq("provider_profile_id", providerId)
    .eq("is_active", true)
    .eq("publication_status", "published")
    .order("created_at", { ascending: false });
  const list = acts ?? [];
  if (!list.length) return { provider, experiences: [] };

  const { sch, tiers, ds } = await loadChildren(list.map((a) => a.id));
  const experiences = list.map((a) => ({ ...assemble(a, sch, tiers, ds), provider }));
  return { provider, experiences };
}

export interface Passenger {
  name: string;
  email?: string;
  phone?: string;
  kind: "adult" | "child";
}

export interface NewBooking {
  activity_id: string;
  user_id?: string | null; // set when a logged-in tourist books (links to their account)
  contact_name: string;
  contact_email: string;
  number_of_people: number;
  adults: number;
  children: number;
  passengers: Passenger[];
  promo_code?: string;
  scheduled_date: string;
  scheduled_time: string;
  subtotal: number;
  service_fee: number;
  total: number;
  status: Booking["booking_status"];
  confirmation_code: string;
}

/** Seats already taken for an activity on a given date + time (live). */
export async function loadSlotBooked(
  activityId: string,
  date: string,
  time: string
): Promise<number> {
  const { data, error } = await sb().rpc("slot_booked_seats", {
    p_activity: activityId,
    p_date: date,
    p_time: time,
  });
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}

/** Create a booking. When a tourist is logged in, user_id links it to their
 *  account (RLS allows auth.uid() = user_id); otherwise it's an anon booking. */
export async function createBooking(b: NewBooking): Promise<void> {
  // No .select() back: anon cannot read bookings under RLS, and we already hold
  // the confirmation code client-side.
  const { error } = await sb().from("bookings").insert({
    activity_id: b.activity_id,
    user_id: b.user_id ?? null,
    contact_name: b.contact_name,
    contact_email: b.contact_email,
    number_of_people: b.number_of_people,
    adults: b.adults,
    children: b.children,
    passengers: b.passengers,
    promo_code: b.promo_code ?? null,
    scheduled_date: b.scheduled_date,
    scheduled_time: b.scheduled_time,
    booking_status: b.status,
    confirmation_code: b.confirmation_code,
    subtotal_paid: b.subtotal,
    service_fee_paid: b.service_fee,
    total_paid: b.total,
  });
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
    adults: r.adults ?? undefined,
    children: r.children ?? undefined,
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

// --- copilot chat: conversations + messages ---------------------------------

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  blocks: unknown[];
}

function mapConversation(r: any): Conversation {
  return { id: r.id, title: r.title, created_at: r.created_at, updated_at: r.updated_at };
}

export async function loadConversations(userId: string): Promise<Conversation[]> {
  const { data, error } = await sb()
    .from("chat_conversations")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapConversation);
}

export async function createConversation(userId: string, title = "Nuevo chat"): Promise<Conversation> {
  const { data, error } = await sb()
    .from("chat_conversations")
    .insert({ user_id: userId, title })
    .select()
    .single();
  if (error) throw error;
  return mapConversation(data);
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const { error } = await sb()
    .from("chat_conversations")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function touchConversation(id: string): Promise<void> {
  await sb().from("chat_conversations").update({ updated_at: new Date().toISOString() }).eq("id", id);
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await sb().from("chat_conversations").delete().eq("id", id);
  if (error) throw error;
}

export async function loadMessages(conversationId: string): Promise<StoredMessage[]> {
  const { data, error } = await sb()
    .from("copilot_messages")
    .select("id, role, blocks")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, role: r.role, blocks: r.blocks ?? [] }));
}

export async function saveMessage(
  m: StoredMessage & { user_id: string; conversation_id: string; created_at?: string }
): Promise<void> {
  const { error } = await sb().from("copilot_messages").insert({
    id: m.id,
    user_id: m.user_id,
    conversation_id: m.conversation_id,
    role: m.role,
    blocks: m.blocks,
    ...(m.created_at ? { created_at: m.created_at } : {}),
  });
  if (error) throw error;
}

// --- tourist account: profile, favorites, requests, notifications, chat -----

/** Does this user have a provider profile? Used to pick tourist vs provider. */
export async function loadProviderProfile(userId: string): Promise<ProviderProfile | null> {
  const { data } = await sb()
    .from("provider_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data ? mapProvider(data) : null;
}

function mapTouristProfile(r: any): TouristProfile {
  return {
    id: r.id,
    name: r.name ?? "",
    email: r.email ?? "",
    phone: r.phone ?? undefined,
    avatar_url: r.avatar_url ?? undefined,
    language: r.language ?? "es",
    interests: r.interests ?? [],
    created_at: r.created_at,
  };
}

/** Load (or create) the tourist's personal profile row. */
export async function ensureTouristProfile(
  userId: string,
  name: string,
  email: string
): Promise<TouristProfile> {
  const c = sb();
  const { data: existing } = await c.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (existing) return mapTouristProfile(existing);
  const { data, error } = await c
    .from("profiles")
    .insert({ id: userId, name, email })
    .select()
    .single();
  if (error) throw error;
  return mapTouristProfile(data);
}

export async function saveTouristProfile(p: TouristProfile): Promise<void> {
  const { error } = await sb()
    .from("profiles")
    .update({
      name: p.name,
      phone: p.phone ?? null,
      avatar_url: p.avatar_url ?? null,
      language: p.language,
      interests: p.interests,
    })
    .eq("id", p.id);
  if (error) throw error;
}

/** Bookings the current tourist owns (RLS returns only their own rows). */
export async function loadMyBookings(): Promise<Booking[]> {
  const { data, error } = await sb()
    .from("bookings")
    .select("*, activities(title)")
    .not("user_id", "is", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapBooking);
}

/** Cancel one of the tourist's own bookings (RLS: auth.uid() = user_id). */
export async function cancelMyBooking(id: string): Promise<void> {
  const { error } = await sb().from("bookings").update({ booking_status: "cancelled" }).eq("id", id);
  if (error) throw error;
}

/** Move one of the tourist's own bookings to a new date/time. */
export async function rescheduleMyBooking(id: string, date: string, time: string): Promise<void> {
  const { error } = await sb()
    .from("bookings")
    .update({ scheduled_date: date, scheduled_time: time })
    .eq("id", id);
  if (error) throw error;
}

// favorites --------------------------------------------------------------
export async function loadFavorites(): Promise<string[]> {
  const { data, error } = await sb().from("favorites").select("activity_id");
  if (error) throw error;
  return (data ?? []).map((r: any) => r.activity_id);
}

export async function addFavorite(userId: string, activityId: string): Promise<void> {
  const { error } = await sb()
    .from("favorites")
    .upsert({ user_id: userId, activity_id: activityId }, { onConflict: "user_id,activity_id" });
  if (error) throw error;
}

export async function removeFavorite(userId: string, activityId: string): Promise<void> {
  const { error } = await sb()
    .from("favorites")
    .delete()
    .eq("user_id", userId)
    .eq("activity_id", activityId);
  if (error) throw error;
}

// concierge requests -----------------------------------------------------
function mapRequest(r: any): ConciergeRequest {
  return {
    id: r.id,
    user_id: r.user_id,
    kind: r.kind,
    title: r.title,
    details: r.details ?? "",
    contact_email: r.contact_email ?? undefined,
    contact_phone: r.contact_phone ?? undefined,
    people: r.people ?? undefined,
    date_from: r.date_from ?? undefined,
    date_to: r.date_to ?? undefined,
    budget: r.budget != null ? Number(r.budget) : undefined,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at ?? undefined,
  };
}

export async function createConciergeRequest(
  input: Omit<ConciergeRequest, "id" | "user_id" | "status" | "created_at" | "updated_at"> & {
    user_id: string;
  }
): Promise<ConciergeRequest> {
  const { data, error } = await sb()
    .from("concierge_requests")
    .insert({
      user_id: input.user_id,
      kind: input.kind,
      title: input.title,
      details: input.details,
      contact_email: input.contact_email ?? null,
      contact_phone: input.contact_phone ?? null,
      people: input.people ?? null,
      date_from: input.date_from ?? null,
      date_to: input.date_to ?? null,
      budget: input.budget ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return mapRequest(data);
}

export async function loadConciergeRequests(): Promise<ConciergeRequest[]> {
  const { data, error } = await sb()
    .from("concierge_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRequest);
}

// notifications ----------------------------------------------------------
function mapNotification(r: any): AppNotification {
  return {
    id: r.id,
    user_id: r.user_id,
    kind: r.kind,
    title: r.title,
    body: r.body ?? undefined,
    link: r.link ?? undefined,
    read_at: r.read_at ?? null,
    created_at: r.created_at,
  };
}

export async function loadNotifications(): Promise<AppNotification[]> {
  const { data, error } = await sb()
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map(mapNotification);
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await sb()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// per-booking chat -------------------------------------------------------
function mapBookingMessage(r: any): BookingMessage {
  return {
    id: r.id,
    booking_id: r.booking_id,
    sender_user_id: r.sender_user_id,
    sender_role: r.sender_role,
    body: r.body ?? "",
    created_at: r.created_at,
    read_at: r.read_at ?? null,
    attachment_url: r.attachment_url ?? undefined,
    attachment_name: r.attachment_name ?? undefined,
    attachment_type: r.attachment_type ?? undefined,
    attachment_size: r.attachment_size != null ? Number(r.attachment_size) : undefined,
  };
}

export interface ChatAttachment {
  url: string;
  name: string;
  type: string;
  size: number;
}

/** Upload a chat file to Storage (random path scoped to the booking). */
export async function uploadChatAttachment(bookingId: string, file: File): Promise<ChatAttachment> {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${bookingId}/${uid("att")}.${ext}`;
  const { error } = await sb()
    .storage.from("chat-attachments")
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw error;
  const url = sb().storage.from("chat-attachments").getPublicUrl(path).data.publicUrl;
  return { url, name: file.name, type: file.type || "application/octet-stream", size: file.size };
}

export async function loadBookingMessages(bookingId: string): Promise<BookingMessage[]> {
  const { data, error } = await sb()
    .from("booking_messages")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapBookingMessage);
}

export async function sendBookingMessage(
  bookingId: string,
  senderUserId: string,
  role: "tourist" | "provider",
  body: string,
  attachment?: ChatAttachment
): Promise<BookingMessage> {
  const { data, error } = await sb()
    .from("booking_messages")
    .insert({
      booking_id: bookingId,
      sender_user_id: senderUserId,
      sender_role: role,
      body,
      attachment_url: attachment?.url ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_type: attachment?.type ?? null,
      attachment_size: attachment?.size ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return mapBookingMessage(data);
}


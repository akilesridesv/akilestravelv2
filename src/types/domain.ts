// ---------------------------------------------------------------------------
// Akiles Travel — domain model
// Mirrors the v1 schema (activities, provider_profiles, slots, tiers, bookings)
// kept normalized and portable so it can move to Supabase/Postgres unchanged.
// ---------------------------------------------------------------------------

export type ListingType = "experience" | "event";

export type PublicationStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "rejected";

export type VerificationStatus = "pending" | "approved" | "rejected";

export type BookingMode = "instant" | "request";

export type BookingStatus =
  | "pending"
  | "pending_approval"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "rejected"
  | "expired"
  | "payment_failed";

export interface ProviderSocial {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  website?: string;
}

export type NotifyChannel = "email" | "whatsapp" | "both" | "none";

export interface ProviderPreferences {
  notify_new_booking: boolean; // alert me when a tourist books
  notify_cancellation: boolean; // alert me on cancellations
  notify_daily_summary: boolean; // daily digest of the day's departures
  notify_channel: NotifyChannel; // where alerts are delivered
  auto_approve_bookings: boolean; // instant vs. request-to-book (mirrors booking_mode)
  language: "es" | "en"; // provider UI / assistant language
}

export const DEFAULT_PREFERENCES: ProviderPreferences = {
  notify_new_booking: true,
  notify_cancellation: true,
  notify_daily_summary: false,
  notify_channel: "email",
  auto_approve_bookings: true,
  language: "es",
};

export interface ProviderProfile {
  id: string;
  user_id: string;
  business_name: string;
  tagline?: string; // short one-liner ("Café de altura en Ataco")
  bio?: string; // who they are / what they do
  contact_email?: string; // email shown to tourists
  contact_phone?: string; // phone shown to tourists
  whatsapp?: string; // WhatsApp number for bookings/questions
  city?: string; // base city / zone of operation
  languages: string[]; // languages the provider speaks
  logo_url?: string; // avatar / business logo image ref
  cover_url?: string; // profile cover image ref
  social: ProviderSocial;
  preferences: ProviderPreferences;
  verification_status: VerificationStatus;
  booking_mode: BookingMode;
  created_at: string;
  // Per-provider fee overrides (null/undefined => global default). Set by admin.
  tourist_fee_type?: "percent" | "fixed" | null;
  tourist_fee_value?: number | null;
  commission_type?: "percent" | "fixed" | null;
  commission_value?: number | null;
}

/** Fill in defaults so older/remote records without the new fields never break. */
export function withProviderDefaults(p: Partial<ProviderProfile> & { id: string; user_id: string; business_name: string; verification_status: VerificationStatus; booking_mode: BookingMode; created_at: string }): ProviderProfile {
  return {
    ...p,
    languages: p.languages ?? ["Español"],
    social: p.social ?? {},
    preferences: { ...DEFAULT_PREFERENCES, ...(p.preferences ?? {}) },
  };
}

export interface RecurringSchedule {
  id: string;
  day_of_week: number; // 0-6, Sunday=0
  start_time: string; // "09:00"
  end_time?: string; // "12:00"
  capacity: number;
  is_active: boolean;
  // Tiers available for this specific departure. Empty/undefined = all tiers of
  // the experience apply. Lets pricing/options vary per horario.
  tier_ids?: string[];
}

export interface AvailabilitySlot {
  id: string;
  activity_id: string;
  slot_date: string; // ISO date "2026-09-01"
  start_time: string;
  end_time?: string;
  total_capacity: number;
  booked_capacity: number;
  status: "abierta" | "bloqueada" | "cancelada";
  origin: "recurrente" | "manual";
}

// A concrete calendar date the provider enabled/blocked from the date calendar
// (Airbnb-style), layered on top of the weekly recurring pattern.
export interface DateSlot {
  id: string;
  slot_date: string; // "2026-09-05"
  start_time: string; // "09:00"
  end_time?: string;
  capacity: number;
  status: "open" | "blocked";
  // Tiers available on this date. Empty/undefined = all tiers of the experience.
  tier_ids?: string[];
}

export interface TicketTier {
  id: string;
  tier_name: string; // "Entrada regular", "Entrada VIP"
  description?: string; // short legend of what it additionally includes
  price: number;
  quantity_available: number; // 0 = uses the departure's total capacity
  quantity_sold: number;
}

/** One stop in the "Qué haremos" itinerary shown to tourists as a timeline. */
export interface ItineraryStop {
  id: string;
  title: string; // "Parque Bicentenario"
  subtitle?: string; // "Primera parada"
  time_range?: string; // "9:00 - 9:30"
  detail?: string; // short description of what happens here
  image_url?: string; // image ref for the stop
}

export interface Experience {
  id: string;
  provider_profile_id: string;
  listing_type: ListingType;
  title: string;
  description: string;
  highlights: string[];
  whats_included: string[];
  whats_not_included: string[];
  what_to_bring: string[];
  price_per_person: number;
  currency: "USD";
  min_capacity: number;
  max_capacity: number;
  duration_hours: number;
  languages: string[];
  category?: string;
  tags: string[]; // free-form labels ("aventura", "relax", "al aire libre") for search
  // location
  country?: string;
  department?: string;
  city?: string;
  area?: string;
  location_address?: string;
  location_lat?: number;
  location_lng?: number;
  // media
  image_urls: string[];
  featured_image?: string;
  // lifecycle
  publication_status: PublicationStatus;
  is_active: boolean;
  registration_deadline_hours: number;
  cancellation_policy?: string; // free-text cancellation terms shown to tourists
  event_date?: string; // only for listing_type === "event"
  schedules: RecurringSchedule[];
  date_slots?: DateSlot[]; // concrete per-date availability (date calendar)
  tiers: TicketTier[];
  itinerary: ItineraryStop[]; // "Qué haremos" — the activity's step-by-step plan
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  activity_id: string;
  experience_title: string;
  contact_name: string;
  contact_email: string;
  number_of_people: number;
  adults?: number;
  children?: number;
  scheduled_date: string;
  scheduled_time: string;
  booking_status: BookingStatus;
  confirmation_code: string;
  subtotal_paid: number;
  service_fee_paid: number;
  total_paid: number;
  platform_commission?: number; // retained from the provider
  provider_payout?: number; // net paid to the provider
  payout_id?: string | null; // set once included in a provider payout
  user_id?: string | null; // the tourist account, when booked signed in
  activity_id_ref?: string; // (reserved)
  created_at: string;
}

// A partial draft produced by the AI extraction before the provider confirms it.
export type ExperienceDraft = Omit<
  Experience,
  "id" | "provider_profile_id" | "publication_status" | "is_active" | "created_at" | "updated_at"
> & {
  // per-field provenance: was this value extracted from the prompt, or a default we filled in?
  _sources: Partial<Record<keyof Experience, "extracted" | "default">>;
};

// ---------------------------------------------------------------------------
// Tourist side — account, requests, notifications, per-booking chat.
// ---------------------------------------------------------------------------

/** Which surface an authenticated user belongs to (a user with a provider
 *  profile is a provider; everyone else is a tourist). */
export type UserRole = "tourist" | "provider";

/** The tourist's personal account profile (public.profiles + tourist fields). */
export interface TouristProfile {
  id: string; // = auth user id
  name: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  language: string; // "es" | "en" …
  interests: string[]; // categories/tags that feed the concierge
  created_at?: string;
}

export type ConciergeRequestKind =
  | "experiencia"
  | "vehiculo"
  | "guia"
  | "conductor"
  | "alojamiento"
  | "otro";

export type ConciergeRequestStatus = "nueva" | "en_proceso" | "resuelta" | "cerrada";

/** A special request the tourist sends to Akiles Travel (concierge real). */
export interface ConciergeRequest {
  id: string;
  user_id: string;
  kind: ConciergeRequestKind;
  title: string;
  details: string;
  contact_email?: string;
  contact_phone?: string;
  people?: number;
  date_from?: string;
  date_to?: string;
  budget?: number;
  status: ConciergeRequestStatus;
  created_at: string;
  updated_at?: string;
}

/** A per-user notification (booking updates, reminders, request replies…). */
export interface AppNotification {
  id: string;
  user_id: string;
  kind: string; // info | booking | request | reminder
  title: string;
  body?: string;
  link?: string;
  read_at?: string | null;
  created_at: string;
}

/** A message in the per-booking chat between the tourist and the provider. */
export interface BookingMessage {
  id: string;
  booking_id: string;
  sender_user_id: string;
  sender_role: "tourist" | "provider";
  body: string;
  created_at: string;
  read_at?: string | null;
  // Optional file attachment (image or document) stored in Supabase Storage.
  attachment_url?: string;
  attachment_name?: string;
  attachment_type?: string;
  attachment_size?: number;
}

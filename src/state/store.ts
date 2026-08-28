import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Booking,
  Experience,
  ExperienceDraft,
  ProviderProfile,
} from "@/types/domain";
import { DEFAULT_PREFERENCES, withProviderDefaults } from "@/types/domain";
import { uid } from "@/lib/utils";
import { isSupabaseConfigured } from "@/lib/supabase";
import * as repo from "@/data/repo";

const remote = isSupabaseConfigured;

export interface LocalUser {
  id: string;
  email: string;
  name: string;
}

interface AppState {
  // auth
  user: LocalUser | null;
  provider: ProviderProfile | null;
  authReady: boolean; // false while restoring a Supabase session
  // domain
  experiences: Experience[];
  bookings: Booking[];

  // auth actions (local mock; Supabase Auth wires in via setSession)
  signIn: (email: string, name?: string) => void;
  signOut: () => void;
  setSession: (
    user: LocalUser,
    provider: ProviderProfile,
    experiences: Experience[],
    bookings: Booking[]
  ) => void;
  setAuthReady: () => void;

  // provider actions
  updateProvider: (patch: Partial<ProviderProfile>) => void;
  publishDraft: (draft: ExperienceDraft) => Experience;
  updateExperience: (id: string, patch: Partial<Experience>) => void;
  removeExperience: (id: string) => void;

  // booking actions
  addBooking: (b: Booking) => void;
  setBookingStatus: (id: string, status: Booking["booking_status"]) => void;
}

function makeProvider(user: LocalUser): ProviderProfile {
  return {
    id: uid("prov"),
    user_id: user.id,
    business_name: user.name ? `${user.name}` : "Mi negocio",
    contact_email: user.email,
    languages: ["Español"],
    social: {},
    preferences: { ...DEFAULT_PREFERENCES },
    verification_status: "pending",
    booking_mode: "instant",
    created_at: new Date().toISOString(),
  };
}

// A couple of demo bookings so the Bookings panel isn't empty on first run.
function seedBookings(): Booking[] {
  const now = Date.now();
  return [
    {
      id: uid("bk"),
      activity_id: "seed",
      experience_title: "Tour de café en Ataco",
      contact_name: "Juan Pérez",
      contact_email: "juan@example.com",
      number_of_people: 2,
      scheduled_date: new Date(now + 3 * 864e5).toISOString().slice(0, 10),
      scheduled_time: "09:00",
      booking_status: "pending_approval",
      confirmation_code: "AKT-7F3K",
      subtotal_paid: 70,
      service_fee_paid: 3.5,
      total_paid: 73.5,
      created_at: new Date(now - 2 * 36e5).toISOString(),
    },
    {
      id: uid("bk"),
      activity_id: "seed",
      experience_title: "Tour de café en Ataco",
      contact_name: "María López",
      contact_email: "maria@example.com",
      number_of_people: 4,
      scheduled_date: new Date(now + 6 * 864e5).toISOString().slice(0, 10),
      scheduled_time: "09:00",
      booking_status: "confirmed",
      confirmation_code: "AKT-2M9P",
      subtotal_paid: 140,
      service_fee_paid: 7,
      total_paid: 147,
      created_at: new Date(now - 26 * 36e5).toISOString(),
    },
  ];
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      provider: null,
      authReady: !remote, // local mode is ready immediately
      experiences: [],
      bookings: [],

      signIn: (email, name) => {
        const existing = get().user;
        const user: LocalUser =
          existing && existing.email === email
            ? existing
            : { id: uid("usr"), email, name: name || email.split("@")[0] };
        const provider = get().provider ?? makeProvider(user);
        const bookings = get().bookings.length ? get().bookings : seedBookings();
        set({ user, provider, bookings, authReady: true });
      },

      signOut: () => set({ user: null, provider: null, experiences: [], bookings: [] }),

      setSession: (user, provider, experiences, bookings) =>
        set({ user, provider, experiences, bookings, authReady: true }),

      setAuthReady: () => set({ authReady: true }),

      updateProvider: (patch) => {
        const cur = get().provider;
        if (!cur) return;
        const next: ProviderProfile = {
          ...cur,
          ...patch,
          social: patch.social ? { ...cur.social, ...patch.social } : cur.social,
          preferences: patch.preferences
            ? { ...cur.preferences, ...patch.preferences }
            : cur.preferences,
        };
        // Keep booking_mode and the friendly auto-approve toggle consistent.
        if (patch.preferences?.auto_approve_bookings !== undefined) {
          next.booking_mode = patch.preferences.auto_approve_bookings ? "instant" : "request";
        } else if (patch.booking_mode) {
          next.preferences = {
            ...next.preferences,
            auto_approve_bookings: patch.booking_mode === "instant",
          };
        }
        set({ provider: next });
        if (remote) void repo.saveProvider(next).catch(console.error);
      },

      publishDraft: (draft) => {
        const provider = get().provider;
        const now = new Date().toISOString();
        const { _sources, ...rest } = draft;
        const exp: Experience = {
          ...rest,
          id: uid("exp"),
          provider_profile_id: provider?.id ?? "local",
          publication_status: "pending_review",
          is_active: false,
          created_at: now,
          updated_at: now,
        };
        set({ experiences: [exp, ...get().experiences] });
        if (remote) void repo.saveExperience(exp, provider?.id).catch(console.error);
        return exp;
      },

      updateExperience: (id, patch) => {
        const next = get().experiences.map((e) =>
          e.id === id ? { ...e, ...patch, updated_at: new Date().toISOString() } : e
        );
        set({ experiences: next });
        if (remote) {
          const updated = next.find((e) => e.id === id);
          if (updated) void repo.saveExperience(updated, get().provider?.id).catch(console.error);
        }
      },

      removeExperience: (id) => {
        set({ experiences: get().experiences.filter((e) => e.id !== id) });
        if (remote) void repo.deleteExperience(id).catch(console.error);
      },

      addBooking: (b) => set({ bookings: [b, ...get().bookings] }),

      setBookingStatus: (id, status) => {
        set({
          bookings: get().bookings.map((b) =>
            b.id === id ? { ...b, booking_status: status } : b
          ),
        });
        if (remote) void repo.updateBookingStatus(id, status).catch(console.error);
      },
    }),
    {
      name: "akiles-travel-v2",
      // Older persisted providers predate languages/social/preferences — backfill
      // defaults on rehydrate so the profile & preferences UI never reads undefined.
      onRehydrateStorage: () => (state) => {
        if (state?.provider) state.provider = withProviderDefaults(state.provider as any);
      },
    }
  )
);

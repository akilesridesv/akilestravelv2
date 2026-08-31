// ---------------------------------------------------------------------------
// Agent tool registry — the LLM-ready contract layer.
//
// Every provider capability is exposed as a typed "tool": a name, a JSON Schema
// describing its inputs, and a `run` handler that mutates the SAME app store the
// UI uses and returns a STRUCTURED result (ok + message + changes + data).
//
//   • Today: the heuristic parsers in the copilot call runTool(...) to apply
//     changes, so chat and manual UI are one code path.
//   • Tomorrow: an LLM proxy is handed TOOL_SPECS (read/edit/add/delete) plus
//     readBusinessContext() and calls the exact same tools — no rewrite needed.
//
// This is the single place new features register so the assistant can operate
// them. Keep inputs/outputs JSON-serializable (the LLM reads and writes JSON).
// ---------------------------------------------------------------------------

import { useApp } from "@/state/store";
import type {
  Experience,
  ProviderPreferences,
  ProviderProfile,
  ProviderSocial,
} from "@/types/domain";

export interface ToolResult {
  ok: boolean;
  /** Human-readable summary (safe to show in chat or read back to the LLM). */
  message: string;
  /** Field-level changes that were applied, if any. */
  changes?: string[];
  /** Structured payload the model can read (e.g. the updated record). */
  data?: unknown;
}

export interface AgentTool {
  name: string;
  description: string;
  /** JSON Schema for the tool input — handed verbatim to the LLM. */
  input_schema: Record<string, unknown>;
  run: (input: any) => ToolResult | Promise<ToolResult>;
}

// ---- Read model: the snapshot the assistant reasons over ------------------

export interface BusinessContext {
  provider: (Partial<ProviderProfile> & { member_since?: string }) | null;
  stats: {
    experiences_total: number;
    experiences_published: number;
    bookings_total: number;
    bookings_pending: number;
  };
  experiences: {
    id: string;
    title: string;
    city?: string;
    price_per_person: number;
    status: Experience["publication_status"];
    departures: number;
  }[];
}

/** JSON snapshot of the whole business — what an LLM reads before deciding. */
export function readBusinessContext(): BusinessContext {
  const s = useApp.getState();
  const p = s.provider;
  return {
    provider: p
      ? {
          id: p.id,
          business_name: p.business_name,
          tagline: p.tagline,
          bio: p.bio,
          contact_email: p.contact_email,
          contact_phone: p.contact_phone,
          whatsapp: p.whatsapp,
          city: p.city,
          languages: p.languages,
          social: p.social,
          preferences: p.preferences,
          verification_status: p.verification_status,
          booking_mode: p.booking_mode,
          member_since: p.created_at,
        }
      : null,
    stats: {
      experiences_total: s.experiences.length,
      experiences_published: s.experiences.filter((e) => e.publication_status === "published")
        .length,
      bookings_total: s.bookings.length,
      bookings_pending: s.bookings.filter((b) => b.booking_status === "pending_approval").length,
    },
    experiences: s.experiences.map((e) => ({
      id: e.id,
      title: e.title,
      city: e.city,
      price_per_person: e.price_per_person,
      status: e.publication_status,
      departures: e.schedules.length + (e.date_slots?.length ?? 0),
    })),
  };
}

// ---- Change-diffing helpers ------------------------------------------------

const PROFILE_LABELS: Partial<Record<keyof ProviderProfile, string>> = {
  business_name: "nombre del negocio",
  tagline: "eslogan",
  bio: "descripción",
  contact_email: "correo de contacto",
  contact_phone: "teléfono",
  whatsapp: "WhatsApp",
  city: "ciudad",
  languages: "idiomas",
  logo_url: "logo",
  cover_url: "portada",
};

const SOCIAL_LABELS: Record<keyof ProviderSocial, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  website: "sitio web",
};

const PREF_LABELS: Record<keyof ProviderPreferences, string> = {
  notify_new_booking: "aviso de reservas nuevas",
  notify_cancellation: "aviso de cancelaciones",
  notify_daily_summary: "resumen diario",
  notify_channel: "canal de avisos",
  auto_approve_bookings: "aprobar reservas automáticamente",
  language: "idioma",
};

function onOff(v: boolean): string {
  return v ? "activado" : "desactivado";
}

// ---- Tools -----------------------------------------------------------------

export const TOOLS: AgentTool[] = [
  {
    name: "get_business_snapshot",
    description:
      "Read the provider's full business context: profile, preferences, stats and the list of experiences. Call this first to know current state before editing.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    run: () => {
      const ctx = readBusinessContext();
      return { ok: true, message: "Contexto del negocio.", data: ctx };
    },
  },

  {
    name: "get_profile",
    description: "Read the provider profile (who they are, contact info, social links).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    run: () => {
      const p = useApp.getState().provider;
      if (!p) return { ok: false, message: "No hay perfil de proveedor." };
      return { ok: true, message: "Perfil del proveedor.", data: p };
    },
  },

  {
    name: "update_profile",
    description:
      "Edit fields of the provider profile shown to tourists. Only include the fields you want to change. Returns the list of applied changes.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        business_name: { type: "string", description: "Business / company name" },
        tagline: { type: "string", description: "Short one-liner shown under the name" },
        bio: { type: "string", description: "Longer description: who they are and what they do" },
        contact_email: { type: "string", description: "Public contact email" },
        contact_phone: { type: "string", description: "Public phone number" },
        whatsapp: { type: "string", description: "WhatsApp number" },
        city: { type: "string", description: "Base city / zone" },
        languages: { type: "array", items: { type: "string" }, description: "Languages spoken" },
        logo_url: { type: "string", description: "Image ref for the logo/avatar" },
        cover_url: { type: "string", description: "Image ref for the cover photo" },
        social: {
          type: "object",
          additionalProperties: false,
          properties: {
            instagram: { type: "string" },
            facebook: { type: "string" },
            tiktok: { type: "string" },
            website: { type: "string" },
          },
        },
      },
    },
    run: (input: Partial<ProviderProfile>) => applyProfilePatch(input),
  },

  {
    name: "update_preferences",
    description:
      "Change the provider's preferences: booking approval mode, notifications and language. Only include what changes.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        auto_approve_bookings: {
          type: "boolean",
          description: "true = instant booking, false = require approval (request-to-book)",
        },
        notify_new_booking: { type: "boolean" },
        notify_cancellation: { type: "boolean" },
        notify_daily_summary: { type: "boolean" },
        notify_channel: { type: "string", enum: ["email", "whatsapp", "both", "none"] },
        language: { type: "string", enum: ["es", "en"] },
      },
    },
    run: (input: Partial<ProviderPreferences>) => applyPreferencePatch(input),
  },

  {
    name: "list_experiences",
    description: "List the provider's experiences with id, title, price and status.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    run: () => {
      const list = readBusinessContext().experiences;
      return { ok: true, message: `${list.length} experiencia(s).`, data: list };
    },
  },

  {
    name: "update_experience",
    description:
      "Edit fields of one of the provider's experiences. Call get_business_snapshot or list_experiences first to get its id. Only include the fields you want to change.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: { type: "string", description: "Experience id" },
        title: { type: "string" },
        description: { type: "string" },
        price_per_person: { type: "number" },
        duration_hours: { type: "number" },
        country: { type: "string" },
        city: { type: "string" },
        area: { type: "string" },
        min_capacity: { type: "integer" },
        max_capacity: { type: "integer" },
        meeting_point: {
          type: "string",
          description: "Address, coordinates or Google Maps link (stored as location_address)",
        },
        cancellation_policy: { type: "string" },
        registration_deadline_hours: { type: "integer" },
        highlights: { type: "array", items: { type: "string" } },
        whats_included: { type: "array", items: { type: "string" } },
        whats_not_included: { type: "array", items: { type: "string" } },
        what_to_bring: { type: "array", items: { type: "string" } },
        itinerary: {
          type: "array",
          description:
            "\"Qué haremos\": ordered stops of the activity, shown to tourists as a timeline.",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Stop name, e.g. Parque Bicentenario" },
              subtitle: { type: "string", description: "e.g. Primera parada" },
              time_range: { type: "string", description: "e.g. 9:00 - 9:30" },
              detail: { type: "string", description: "What happens at this stop" },
            },
            required: ["title"],
          },
        },
      },
    },
    run: (input: any) => applyExperiencePatch(input),
  },

  {
    name: "set_booking_status",
    description:
      "Approve (confirmed) or reject (rejected) a booking. Identify it by booking_id or by the customer's contact_name.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["status"],
      properties: {
        booking_id: { type: "string" },
        contact_name: { type: "string", description: "Customer name to match" },
        status: { type: "string", enum: ["confirmed", "rejected"] },
      },
    },
    run: (input: { booking_id?: string; contact_name?: string; status: "confirmed" | "rejected" }) => {
      const s = useApp.getState();
      let b = input.booking_id ? s.bookings.find((x) => x.id === input.booking_id) : undefined;
      if (!b && input.contact_name) {
        const q = input.contact_name.toLowerCase();
        b = s.bookings.find((x) => x.contact_name.toLowerCase().includes(q));
      }
      if (!b) return { ok: false, message: "No encontré esa reserva." };
      s.setBookingStatus(b.id, input.status);
      return {
        ok: true,
        message: `Reserva de ${b.contact_name} ${input.status === "confirmed" ? "aprobada" : "rechazada"}.`,
        data: { id: b.id, status: input.status },
      };
    },
  },
];

const EXP_LABELS: Partial<Record<keyof Experience, string>> = {
  title: "título",
  description: "descripción",
  price_per_person: "precio",
  duration_hours: "duración",
  country: "país",
  city: "ciudad",
  area: "zona",
  min_capacity: "cupo mínimo",
  max_capacity: "cupo máximo",
  location_address: "punto de encuentro",
  cancellation_policy: "política de cancelación",
  registration_deadline_hours: "anticipación",
  highlights: "highlights",
  whats_included: "incluye",
  whats_not_included: "no incluye",
  what_to_bring: "qué llevar",
  itinerary: "qué haremos",
};

function genStopId(): string {
  return (crypto as any)?.randomUUID?.() ?? `stop_${Math.random().toString(36).slice(2, 10)}`;
}

export function applyExperiencePatch(input: any): ToolResult {
  const s = useApp.getState();
  const exp =
    s.experiences.find((e) => e.id === input.id) ??
    (s.experiences.length === 1 ? s.experiences[0] : undefined);
  if (!exp) return { ok: false, message: "No encontré esa experiencia." };

  // meeting_point is the friendly alias for location_address.
  const src: Record<string, unknown> = { ...input };
  if (src.meeting_point !== undefined) src.location_address = src.meeting_point;

  // Itinerary stops arrive without ids from the LLM — assign stable ones.
  if (Array.isArray(src.itinerary)) {
    src.itinerary = (src.itinerary as any[]).map((st) => ({
      id: st?.id || genStopId(),
      title: String(st?.title ?? "").trim(),
      subtitle: st?.subtitle,
      time_range: st?.time_range,
      detail: st?.detail,
      image_url: st?.image_url,
    }));
  }

  const patch: Partial<Experience> = {};
  const changes: string[] = [];
  for (const key of Object.keys(EXP_LABELS) as (keyof Experience)[]) {
    const v = (src as any)[key];
    if (v === undefined) continue;
    if (JSON.stringify(v) === JSON.stringify((exp as any)[key])) continue;
    (patch as any)[key] = v;
    const shown = Array.isArray(v) ? `${v.length} ítem(s)` : v;
    changes.push(`${EXP_LABELS[key]} → ${shown}`);
  }
  if (!changes.length) return { ok: true, message: "Sin cambios en la experiencia.", changes: [] };
  s.updateExperience(exp.id, patch);
  return {
    ok: true,
    message: `Actualicé “${exp.title}”: ${changes.join(", ")}.`,
    changes,
    data: { id: exp.id },
  };
}

/** LLM-facing specs (name + description + JSON Schema), no handlers. */
export const TOOL_SPECS = TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.input_schema,
}));

/** Single dispatch entry point — parsers today, LLM proxy tomorrow. */
export async function runTool(name: string, input: unknown): Promise<ToolResult> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { ok: false, message: `Herramienta desconocida: ${name}` };
  try {
    return await tool.run(input);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error al ejecutar la herramienta." };
  }
}

// ---- Apply handlers (shared by chat parsers and the LLM path) --------------

export function applyProfilePatch(input: Partial<ProviderProfile>): ToolResult {
  const s = useApp.getState();
  const cur = s.provider;
  if (!cur) return { ok: false, message: "No hay perfil de proveedor." };

  const patch: Partial<ProviderProfile> = {};
  const changes: string[] = [];

  for (const key of Object.keys(PROFILE_LABELS) as (keyof ProviderProfile)[]) {
    const v = (input as any)[key];
    if (v === undefined) continue;
    if (key === "languages") {
      const arr = (v as string[]).map((x) => x.trim()).filter(Boolean);
      if (JSON.stringify(arr) !== JSON.stringify(cur.languages)) {
        (patch as any).languages = arr;
        changes.push(`${PROFILE_LABELS.languages} → ${arr.join(", ") || "—"}`);
      }
      continue;
    }
    const nv = typeof v === "string" ? v.trim() : v;
    if (nv !== (cur as any)[key]) {
      (patch as any)[key] = nv;
      changes.push(`${PROFILE_LABELS[key]} → ${nv || "—"}`);
    }
  }

  if (input.social) {
    const nextSocial: ProviderSocial = { ...cur.social };
    for (const key of Object.keys(SOCIAL_LABELS) as (keyof ProviderSocial)[]) {
      const v = input.social[key];
      if (v === undefined) continue;
      const nv = v.trim();
      if (nv !== (cur.social[key] ?? "")) {
        nextSocial[key] = nv || undefined;
        changes.push(`${SOCIAL_LABELS[key]} → ${nv || "—"}`);
      }
    }
    patch.social = nextSocial;
  }

  if (!changes.length) return { ok: true, message: "Sin cambios en el perfil.", changes: [] };
  s.updateProvider(patch);
  return {
    ok: true,
    message: `Perfil actualizado: ${changes.join(", ")}.`,
    changes,
    data: useApp.getState().provider,
  };
}

export function applyPreferencePatch(input: Partial<ProviderPreferences>): ToolResult {
  const s = useApp.getState();
  const cur = s.provider;
  if (!cur) return { ok: false, message: "No hay perfil de proveedor." };

  const patch: Partial<ProviderPreferences> = {};
  const changes: string[] = [];
  for (const key of Object.keys(PREF_LABELS) as (keyof ProviderPreferences)[]) {
    const v = (input as any)[key];
    if (v === undefined) continue;
    if (v !== (cur.preferences as any)[key]) {
      (patch as any)[key] = v;
      const label = PREF_LABELS[key];
      changes.push(typeof v === "boolean" ? `${label}: ${onOff(v)}` : `${label} → ${v}`);
    }
  }

  if (!changes.length) return { ok: true, message: "Sin cambios en las preferencias.", changes: [] };
  // updateProvider merges onto current preferences, so a partial is safe here.
  s.updateProvider({ preferences: patch as ProviderPreferences });
  return {
    ok: true,
    message: `Preferencias actualizadas: ${changes.join(", ")}.`,
    changes,
    data: useApp.getState().provider?.preferences,
  };
}

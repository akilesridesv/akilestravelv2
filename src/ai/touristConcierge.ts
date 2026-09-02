import { supabase } from "@/lib/supabase";
import { generate } from "@/ai/llm";
import * as repo from "@/data/repo";
import type { PublicExperience } from "@/data/repo";
import type { Booking, ConciergeRequestKind } from "@/types/domain";
import { useApp } from "@/state/store";
import { searchExperiences } from "@/ai/discovery";
import { displayPrice, bookingLink } from "@/lib/experience";
import { fuzzyMatch } from "@/lib/fuzzy";
import { isFavorite, toggleFavorite } from "@/lib/favorites";

// ---------------------------------------------------------------------------
// Agentic tourist concierge. Mirrors the provider copilot: Gemini (via the
// llm_generate proxy) can call the SAME actions the account UI offers —
// recommend, start a booking, list/cancel bookings, save favorites, update
// interests, and file a special request with Akiles. Tools run client-side.
// ---------------------------------------------------------------------------

/** Per-turn context the tools read (set by the chat before each turn). */
interface TouristContext {
  catalog: PublicExperience[];
  userId: string | null;
}
let CTX: TouristContext = { catalog: [], userId: null };
export function setTouristContext(c: TouristContext) {
  CTX = c;
}

interface ToolResult {
  ok: boolean;
  message: string;
  data?: any;
}

interface ToolSpec {
  name: string;
  description: string;
  parameters: any;
}

const TOOLS: ToolSpec[] = [
  {
    name: "recommend_experiences",
    description:
      "Busca y recomienda experiencias del catálogo según lo que pide el turista (actividad, zona, presupuesto, personas). Úsala para sugerir opciones concretas.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Lo que busca en lenguaje natural, p. ej. 'surf en El Tunco'" },
        max: { type: "integer", description: "Máximo de resultados (por defecto 4)" },
      },
      required: ["query"],
    },
  },
  {
    name: "start_booking",
    description:
      "Abre la reserva de una experiencia con fecha/personas prellenadas. NO completa la reserva (el turista confirma en la pantalla). Úsala cuando el turista quiera reservar algo del catálogo.",
    parameters: {
      type: "object",
      properties: {
        experience: { type: "string", description: "Id o nombre de la experiencia" },
        date: { type: "string", description: "Fecha YYYY-MM-DD (opcional)" },
        people: { type: "integer", description: "Número de personas (opcional)" },
      },
      required: ["experience"],
    },
  },
  {
    name: "list_my_bookings",
    description: "Lista las reservas del turista (próximas e historial) con su estado y código.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "cancel_booking",
    description:
      "Cancela una reserva del turista. CONFIRMA con el turista antes de llamarla. Identifica la reserva por código de confirmación o por el nombre de la experiencia.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "Código de confirmación, p. ej. AKT-ABC123" },
        experience: { type: "string", description: "Nombre de la experiencia (si no hay código)" },
      },
    },
  },
  {
    name: "save_favorite",
    description: "Guarda (o quita) una experiencia de los favoritos del turista.",
    parameters: {
      type: "object",
      properties: {
        experience: { type: "string", description: "Id o nombre de la experiencia" },
        on: { type: "boolean", description: "true para guardar, false para quitar (por defecto true)" },
      },
      required: ["experience"],
    },
  },
  {
    name: "update_interests",
    description:
      "Actualiza los intereses del turista (categorías como playa, café, aventura, cultura) para mejorar las recomendaciones.",
    parameters: {
      type: "object",
      properties: {
        interests: { type: "array", items: { type: "string" }, description: "Lista de intereses" },
      },
      required: ["interests"],
    },
  },
  {
    name: "create_request",
    description:
      "Crea una SOLICITUD a Akiles Travel para algo que no existe como experiencia en la plataforma: alquiler de vehículo, guía, conductor/transporte, alojamiento o una experiencia a medida. Reúne los detalles útiles (fechas, zona, personas, presupuesto).",
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["experiencia", "vehiculo", "guia", "conductor", "alojamiento", "otro"],
        },
        title: { type: "string", description: "Resumen corto de lo que necesita" },
        details: { type: "string", description: "Detalles: fechas, zona, personas, presupuesto, requerimientos" },
        people: { type: "integer" },
        date_from: { type: "string", description: "YYYY-MM-DD" },
        date_to: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["kind", "title"],
    },
  },
];

function resolveExperience(q: string): PublicExperience | undefined {
  if (!q) return undefined;
  const byId = CTX.catalog.find((e) => e.id === q);
  if (byId) return byId;
  const exact = CTX.catalog.find((e) => e.title.toLowerCase() === q.toLowerCase());
  if (exact) return exact;
  return CTX.catalog.find((e) => fuzzyMatch(q, e.title));
}

async function runTool(name: string, args: any): Promise<ToolResult> {
  switch (name) {
    case "recommend_experiences": {
      const found = searchExperiences(CTX.catalog, String(args.query ?? "")).slice(0, args.max ?? 4);
      if (!found.length) return { ok: true, message: "Sin coincidencias en el catálogo.", data: { ids: [] } };
      return {
        ok: true,
        message: found
          .map((e) => `${e.title} — ${e.city ?? e.department ?? "El Salvador"} · $${displayPrice(e).amount}`)
          .join("; "),
        data: { ids: found.map((e) => e.id) },
      };
    }
    case "start_booking": {
      const e = resolveExperience(String(args.experience ?? ""));
      if (!e) return { ok: false, message: "No encontré esa experiencia en el catálogo." };
      const p = new URLSearchParams();
      if (args.people) p.set("people", String(args.people));
      if (args.date) p.set("date", String(args.date));
      const qs = p.toString();
      return {
        ok: true,
        message: `Listo para reservar “${e.title}”.`,
        data: { bookingPath: `/e/${e.id}${qs ? `?${qs}` : ""}`, title: e.title, link: bookingLink(e.id) },
      };
    }
    case "list_my_bookings": {
      const bookings = await repo.loadMyBookings().catch(() => [] as Booking[]);
      if (!bookings.length) return { ok: true, message: "No tienes reservas todavía." };
      return {
        ok: true,
        message: bookings
          .map(
            (b) =>
              `${b.experience_title} · ${b.scheduled_date} ${b.scheduled_time} · ${b.booking_status} · ${b.confirmation_code}`
          )
          .join("; "),
        data: { bookings: bookings.map((b) => ({ id: b.id, code: b.confirmation_code, title: b.experience_title, status: b.booking_status })) },
      };
    }
    case "cancel_booking": {
      const bookings = await repo.loadMyBookings().catch(() => [] as Booking[]);
      const active = bookings.filter((b) =>
        ["pending_approval", "pending", "confirmed"].includes(b.booking_status)
      );
      const code = String(args.code ?? "").trim().toUpperCase();
      let target = code ? active.find((b) => b.confirmation_code.toUpperCase() === code) : undefined;
      if (!target && args.experience)
        target = active.find((b) => fuzzyMatch(String(args.experience), b.experience_title));
      if (!target)
        return {
          ok: false,
          message:
            active.length > 1
              ? "¿Cuál reserva? Dime el código o el nombre de la experiencia."
              : "No encontré una reserva activa para cancelar.",
        };
      await repo.cancelMyBooking(target.id);
      return { ok: true, message: `Cancelé tu reserva de “${target.experience_title}”. El proveedor fue notificado.`, data: { id: target.id } };
    }
    case "save_favorite": {
      const e = resolveExperience(String(args.experience ?? ""));
      if (!e) return { ok: false, message: "No encontré esa experiencia." };
      const on = args.on !== false;
      const currently = isFavorite(e.id);
      if (on !== currently) toggleFavorite(e.id);
      if (CTX.userId) {
        if (on) await repo.addFavorite(CTX.userId, e.id).catch(() => {});
        else await repo.removeFavorite(CTX.userId, e.id).catch(() => {});
      }
      return { ok: true, message: on ? `Guardé “${e.title}” en tus favoritos.` : `Quité “${e.title}” de favoritos.` };
    }
    case "update_interests": {
      const interests = Array.isArray(args.interests) ? args.interests.map(String) : [];
      const s = useApp.getState();
      if (!s.touristProfile) return { ok: false, message: "No pude actualizar tus intereses." };
      const next = { ...s.touristProfile, interests };
      await repo.saveTouristProfile(next).catch(() => {});
      s.setTouristProfile({ interests });
      return { ok: true, message: `Actualicé tus intereses: ${interests.join(", ") || "—"}.` };
    }
    case "create_request": {
      if (!CTX.userId) return { ok: false, message: "Inicia sesión para enviar una solicitud." };
      const s = useApp.getState();
      const req = await repo.createConciergeRequest({
        user_id: CTX.userId,
        kind: (args.kind ?? "otro") as ConciergeRequestKind,
        title: String(args.title ?? "").trim() || "Solicitud",
        details: String(args.details ?? "").trim(),
        contact_email: s.touristProfile?.email,
        contact_phone: s.touristProfile?.phone,
        people: args.people ? parseInt(String(args.people), 10) : undefined,
        date_from: args.date_from || undefined,
        date_to: args.date_to || undefined,
      });
      return { ok: true, message: `Envié tu solicitud a Akiles Travel: “${req.title}”. Te contactaremos pronto.`, data: { requestId: req.id } };
    }
    default:
      return { ok: false, message: `Herramienta desconocida: ${name}` };
  }
}

function stripSchema(node: any): any {
  if (Array.isArray(node)) return node.map(stripSchema);
  if (node && typeof node === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "additionalProperties") continue;
      out[k] = stripSchema(v);
    }
    return out;
  }
  return node;
}

function systemPrompt(): string {
  const s = useApp.getState();
  const today = new Date().toISOString().slice(0, 10);
  const p = s.touristProfile;
  return [
    "Eres el concierge de viajes de Akiles Travel para un TURISTA en El Salvador. Cálido, breve y accionable.",
    `Hoy es ${today} (zona horaria El Salvador).`,
    p ? `Turista: ${p.name}. Intereses: ${(p.interests ?? []).join(", ") || "sin definir"}.` : "",
    "Puedes EJECUTAR acciones con las herramientas; úsalas en vez de solo describir.",
    "Reglas:",
    "- Responde en español. Frases cortas; usa viñetas si listas varias opciones.",
    "- Para sugerir experiencias del catálogo usa recommend_experiences.",
    "- Para reservar usa start_booking: abre la reserva prellenada. NUNCA digas que la reserva quedó hecha; el turista la confirma en pantalla.",
    "- Para ver reservas usa list_my_bookings. Para cancelar, PRIMERO confirma con el turista y luego llama cancel_booking.",
    "- Guarda favoritos con save_favorite y actualiza intereses con update_interests cuando el turista exprese gustos.",
    "- Si pide algo que NO existe como experiencia (alquilar vehículo, guía, conductor, alojamiento o algo a medida), reúne los detalles y usa create_request para enviarlo a Akiles Travel. Dile que el equipo lo contactará.",
    "- No inventes experiencias, precios, fechas ni códigos. Si falta info, pregunta una cosa a la vez.",
  ]
    .filter(Boolean)
    .join("\n");
}

export interface TouristTurn {
  text: string;
  /** Experience ids to render as cards (from recommend_experiences). */
  matches: string[];
  /** A prefilled booking path (/e/:id?...) when the agent started a booking. */
  bookingPath?: string;
  /** Whether any state-changing action ran (cancel/favorite/request/interests). */
  changed: boolean;
}

export interface TouristChatTurn {
  role: "user" | "assistant";
  text: string;
}

export async function runTouristTurn(
  userText: string,
  history: TouristChatTurn[]
): Promise<TouristTurn> {
  if (!supabase) throw new Error("Supabase no configurado");
  const contents: any[] = history.slice(-10).map((h) => ({
    role: h.role === "assistant" ? "model" : "user",
    parts: [{ text: h.text }],
  }));
  contents.push({ role: "user", parts: [{ text: userText }] });

  const tools = [
    {
      functionDeclarations: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: stripSchema(t.parameters),
      })),
    },
  ];
  const system = systemPrompt();

  const matches: string[] = [];
  let bookingPath: string | undefined;
  let changed = false;

  for (let step = 0; step < 6; step++) {
    const data = await generate({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      tools,
    });
    const cand = data?.candidates?.[0];
    const parts: any[] = cand?.content?.parts ?? [];
    const calls = parts.filter((p) => p.functionCall);

    if (calls.length) {
      contents.push({ role: "model", parts });
      const responseParts: any[] = [];
      for (const c of calls) {
        const res = await runTool(c.functionCall.name, c.functionCall.args ?? {});
        if (res.data?.ids) matches.push(...res.data.ids);
        if (res.data?.bookingPath) bookingPath = res.data.bookingPath;
        if (["cancel_booking", "save_favorite", "update_interests", "create_request"].includes(c.functionCall.name) && res.ok)
          changed = true;
        responseParts.push({ functionResponse: { name: c.functionCall.name, response: res } });
      }
      contents.push({ role: "user", parts: responseParts });
      continue;
    }

    const text = parts
      .filter((p) => typeof p.text === "string")
      .map((p) => p.text)
      .join("")
      .trim();
    return { text: text || "Listo.", matches: [...new Set(matches)], bookingPath, changed };
  }
  return {
    text: "No pude completar la solicitud en varios pasos. ¿Puedes reformularla?",
    matches: [...new Set(matches)],
    bookingPath,
    changed,
  };
}

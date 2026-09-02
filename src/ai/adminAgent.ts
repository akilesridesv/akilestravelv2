import { supabase } from "@/lib/supabase";
import { generate } from "@/ai/llm";
import * as repo from "@/data/repo";
import type { AdminExperience } from "@/data/repo";
import type { Booking, ConciergeRequest, ProviderProfile, TouristProfile } from "@/types/domain";
import { resolveFees, feeLabel, type FeeType } from "@/lib/fees";
import { fuzzyMatch } from "@/lib/fuzzy";
import { formatUSD } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Admin agent: operates the whole platform by natural language. Gemini calls
// the SAME admin actions the dashboard exposes (verify, fees, publish, cancel,
// requests, billing, settings) plus reads KPIs. Runs client-side under the
// admin's RLS. Destructive actions must be confirmed by the admin first.
// ---------------------------------------------------------------------------

interface Ctx {
  providers: ProviderProfile[];
  tourists: TouristProfile[];
  bookings: Booking[];
  experiences: AdminExperience[];
  requests: ConciergeRequest[];
  settings: repo.PlatformSettings;
  feeDefaults: Awaited<ReturnType<typeof repo.loadFeeDefaults>>;
}
let CTX: Ctx | null = null;

async function loadCtx(): Promise<Ctx> {
  const [providers, tourists, bookings, experiences, requests, settings, feeDefaults] = await Promise.all([
    repo.adminLoadProviders(),
    repo.adminLoadTourists(),
    repo.adminLoadBookings(),
    repo.adminLoadExperiences(),
    repo.adminLoadRequests(),
    repo.loadPlatformSettings(),
    repo.loadFeeDefaults(),
  ]);
  CTX = { providers, tourists, bookings, experiences, requests, settings, feeDefaults };
  return CTX;
}

interface ToolResult {
  ok: boolean;
  message: string;
}

const REV = ["confirmed", "completed"];

function findProvider(q: string): ProviderProfile | undefined {
  if (!CTX) return undefined;
  return (
    CTX.providers.find((p) => p.id === q) ||
    CTX.providers.find((p) => p.business_name.toLowerCase() === q.toLowerCase()) ||
    CTX.providers.find((p) => fuzzyMatch(q, p.business_name))
  );
}
function findExperience(q: string): AdminExperience | undefined {
  if (!CTX) return undefined;
  return (
    CTX.experiences.find((e) => e.id === q) ||
    CTX.experiences.find((e) => e.title.toLowerCase() === q.toLowerCase()) ||
    CTX.experiences.find((e) => fuzzyMatch(q, e.title))
  );
}

const TOOLS = [
  { name: "get_kpis", description: "Métricas de negocio: turistas, proveedores, reservas, GMV, ingresos de plataforma, ticket promedio, LTV, costos y utilidad.", parameters: { type: "object", properties: {} } },
  { name: "list_providers", description: "Lista los proveedores con su estado de verificación y tarifas.", parameters: { type: "object", properties: {} } },
  {
    name: "verify_provider",
    description: "Cambia el estado de verificación de un proveedor.",
    parameters: {
      type: "object",
      properties: {
        provider: { type: "string", description: "Nombre o id del proveedor" },
        status: { type: "string", enum: ["approved", "pending", "rejected"] },
      },
      required: ["provider", "status"],
    },
  },
  {
    name: "set_provider_fees",
    description: "Configura las tarifas de un proveedor: cargo al turista y/o comisión al proveedor (% o monto fijo).",
    parameters: {
      type: "object",
      properties: {
        provider: { type: "string" },
        tourist_fee_type: { type: "string", enum: ["percent", "fixed"] },
        tourist_fee_value: { type: "number" },
        commission_type: { type: "string", enum: ["percent", "fixed"] },
        commission_value: { type: "number" },
      },
      required: ["provider"],
    },
  },
  {
    name: "list_experiences",
    description: "Lista experiencias (opcional: de un proveedor) con su estado de publicación.",
    parameters: { type: "object", properties: { provider: { type: "string" } } },
  },
  {
    name: "set_experience_status",
    description: "Publica, despublica o rechaza una experiencia.",
    parameters: {
      type: "object",
      properties: {
        experience: { type: "string", description: "Nombre o id de la experiencia" },
        status: { type: "string", enum: ["published", "unpublished", "rejected"] },
      },
      required: ["experience", "status"],
    },
  },
  {
    name: "list_bookings",
    description: "Lista reservas recientes; opcional filtrar por texto (cliente/experiencia/código) o estado.",
    parameters: { type: "object", properties: { query: { type: "string" }, status: { type: "string" } } },
  },
  {
    name: "cancel_booking",
    description: "Cancela una reserva. CONFIRMA con el admin antes de llamarla. Identifica por código o por cliente+experiencia.",
    parameters: { type: "object", properties: { code: { type: "string" }, query: { type: "string" } } },
  },
  {
    name: "list_requests",
    description: "Lista las solicitudes (concierge) de los turistas; opcional por estado.",
    parameters: { type: "object", properties: { status: { type: "string" } } },
  },
  {
    name: "set_request_status",
    description: "Cambia el estado de una solicitud.",
    parameters: {
      type: "object",
      properties: {
        request: { type: "string", description: "Título o id de la solicitud" },
        status: { type: "string", enum: ["nueva", "en_proceso", "resuelta", "cerrada"] },
      },
      required: ["request", "status"],
    },
  },
  {
    name: "billing_summary",
    description: "Resumen de facturación por proveedor: retenido (comisión de Akiles) y neto pendiente de pagar.",
    parameters: { type: "object", properties: { provider: { type: "string" } } },
  },
  {
    name: "set_platform_settings",
    description: "Ajusta las tarifas por defecto globales y/o el costo mensual de la plataforma.",
    parameters: {
      type: "object",
      properties: {
        tourist_fee_type: { type: "string", enum: ["percent", "fixed"] },
        tourist_fee_value: { type: "number" },
        commission_type: { type: "string", enum: ["percent", "fixed"] },
        commission_value: { type: "number" },
        monthly_cost: { type: "number" },
      },
    },
  },
];

async function runTool(name: string, args: any): Promise<ToolResult> {
  if (!CTX) await loadCtx();
  const ctx = CTX!;
  switch (name) {
    case "get_kpis": {
      const rev = ctx.bookings.filter((b) => REV.includes(b.booking_status));
      const gmv = rev.reduce((s, b) => s + b.total_paid, 0);
      const income = rev.reduce((s, b) => s + b.service_fee_paid + (b.platform_commission ?? 0), 0);
      const ticket = rev.length ? gmv / rev.length : 0;
      const ltv = ctx.tourists.length ? income / ctx.tourists.length : 0;
      const profit = income - ctx.settings.monthly_cost;
      return {
        ok: true,
        message: `Turistas ${ctx.tourists.length} · Proveedores ${ctx.providers.length} · Reservas con ingreso ${rev.length} · GMV ${formatUSD(gmv)} · Ingresos plataforma ${formatUSD(income)} · Ticket promedio ${formatUSD(ticket)} · LTV ${formatUSD(ltv)} · Costos ${formatUSD(ctx.settings.monthly_cost)} · Utilidad ${formatUSD(profit)}.`,
      };
    }
    case "list_providers":
      return {
        ok: true,
        message: ctx.providers
          .map((p) => {
            const f = resolveFees(p, ctx.feeDefaults);
            return `${p.business_name} [${p.verification_status}] · turista ${feeLabel(f.tourist.type, f.tourist.value)} · comisión ${feeLabel(f.commission.type, f.commission.value)}`;
          })
          .join("; "),
      };
    case "verify_provider": {
      const p = findProvider(String(args.provider ?? ""));
      if (!p) return { ok: false, message: "No encontré ese proveedor." };
      await repo.adminSetProviderVerification(p.id, String(args.status));
      return { ok: true, message: `${p.business_name}: verificación → ${args.status}.` };
    }
    case "set_provider_fees": {
      const p = findProvider(String(args.provider ?? ""));
      if (!p) return { ok: false, message: "No encontré ese proveedor." };
      const patch: any = {};
      if (args.tourist_fee_type) patch.tourist_fee_type = args.tourist_fee_type;
      if (args.tourist_fee_value != null) patch.tourist_fee_value = args.tourist_fee_value;
      if (args.commission_type) patch.commission_type = args.commission_type;
      if (args.commission_value != null) patch.commission_value = args.commission_value;
      if (!Object.keys(patch).length) return { ok: false, message: "Indica al menos una tarifa a cambiar." };
      await repo.adminSetProviderFees(p.id, patch);
      return { ok: true, message: `Tarifas de ${p.business_name} actualizadas.` };
    }
    case "list_experiences": {
      let list = ctx.experiences;
      if (args.provider) {
        const p = findProvider(String(args.provider));
        if (p) list = list.filter((e) => e.provider_profile_id === p.id);
      }
      return {
        ok: true,
        message: list
          .slice(0, 30)
          .map((e) => `${e.title} [${e.publication_status}${e.is_active ? "·activa" : ""}] ${formatUSD(e.price_per_person)}`)
          .join("; "),
      };
    }
    case "set_experience_status": {
      const e = findExperience(String(args.experience ?? ""));
      if (!e) return { ok: false, message: "No encontré esa experiencia." };
      const s = String(args.status);
      const patch =
        s === "published"
          ? { publication_status: "published", is_active: true }
          : s === "rejected"
          ? { publication_status: "rejected", is_active: false }
          : { publication_status: "draft", is_active: false };
      await repo.adminSetExperienceStatus(e.id, patch);
      return { ok: true, message: `“${e.title}” → ${s}.` };
    }
    case "list_bookings": {
      let list = ctx.bookings;
      if (args.status) list = list.filter((b) => b.booking_status === args.status);
      if (args.query) {
        const q = String(args.query).toLowerCase();
        list = list.filter((b) =>
          `${b.contact_name} ${b.experience_title} ${b.confirmation_code}`.toLowerCase().includes(q)
        );
      }
      return {
        ok: true,
        message:
          list
            .slice(0, 20)
            .map((b) => `${b.confirmation_code} · ${b.contact_name} · ${b.experience_title} · ${b.scheduled_date} · ${b.booking_status} · ${formatUSD(b.total_paid)}`)
            .join("; ") || "Sin reservas.",
      };
    }
    case "cancel_booking": {
      const code = String(args.code ?? "").trim().toUpperCase();
      let b = code ? ctx.bookings.find((x) => x.confirmation_code.toUpperCase() === code) : undefined;
      if (!b && args.query) {
        const q = String(args.query).toLowerCase();
        b = ctx.bookings.find(
          (x) =>
            ["pending_approval", "pending", "confirmed"].includes(x.booking_status) &&
            `${x.contact_name} ${x.experience_title}`.toLowerCase().includes(q)
        );
      }
      if (!b) return { ok: false, message: "No encontré esa reserva." };
      await repo.updateBookingStatus(b.id, "cancelled");
      return { ok: true, message: `Cancelé la reserva ${b.confirmation_code} de ${b.contact_name}.` };
    }
    case "list_requests": {
      let list = ctx.requests;
      if (args.status) list = list.filter((r) => r.status === args.status);
      return {
        ok: true,
        message:
          list
            .slice(0, 20)
            .map((r) => `${r.title} [${r.kind}·${r.status}] ${r.contact_email ?? ""}`)
            .join("; ") || "Sin solicitudes.",
      };
    }
    case "set_request_status": {
      const q = String(args.request ?? "");
      const r = ctx.requests.find((x) => x.id === q) || ctx.requests.find((x) => fuzzyMatch(q, x.title));
      if (!r) return { ok: false, message: "No encontré esa solicitud." };
      await repo.adminSetRequestStatus(r.id, String(args.status));
      return { ok: true, message: `Solicitud “${r.title}” → ${args.status}.` };
    }
    case "billing_summary": {
      const rows = ctx.providers
        .filter((p) => !args.provider || findProvider(String(args.provider))?.id === p.id)
        .map((p) => {
          const own = ctx.bookings.filter((b) => b.activity_id_ref === p.id && REV.includes(b.booking_status));
          const retained = own.reduce((s, b) => s + (b.platform_commission ?? 0), 0);
          const toPay = own.filter((b) => !b.payout_id).reduce((s, b) => s + (b.provider_payout ?? b.subtotal_paid), 0);
          return `${p.business_name}: retenido ${formatUSD(retained)}, a pagar ${formatUSD(toPay)}`;
        });
      return { ok: true, message: rows.join("; ") || "Sin datos." };
    }
    case "set_platform_settings": {
      const fd = { ...ctx.feeDefaults };
      if (args.tourist_fee_type) fd.tourist_fee_type = args.tourist_fee_type as FeeType;
      if (args.tourist_fee_value != null) fd.tourist_fee_value = args.tourist_fee_value;
      if (args.commission_type) fd.commission_type = args.commission_type as FeeType;
      if (args.commission_value != null) fd.commission_value = args.commission_value;
      await repo.saveFeeDefaults(fd);
      if (args.monthly_cost != null)
        await repo.savePlatformSettings({ monthly_cost: args.monthly_cost, currency: ctx.settings.currency });
      return { ok: true, message: "Ajustes de plataforma actualizados." };
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
  const today = new Date().toISOString().slice(0, 10);
  return [
    "Eres el asistente de administración de Akiles Travel — el mando central de la plataforma.",
    `Hoy es ${today} (zona horaria El Salvador).`,
    "Puedes CONSULTAR métricas y EJECUTAR cambios en toda la plataforma con las herramientas. Úsalas en vez de solo describir.",
    "Reglas:",
    "- Responde en español, claro y ejecutivo. Usa viñetas para listas.",
    "- Para preguntas de negocio/crecimiento usa get_kpis y billing_summary; explica brevemente qué significan si ayuda a decidir.",
    "- ACCIONES DESTRUCTIVAS o sensibles (cancelar una reserva, rechazar/despublicar, cambiar tarifas o ajustes de plataforma): confirma con el admin en una frase ANTES de ejecutarlas. Si el admin ya confirmó, ejecútalas.",
    "- Al ejecutar, confirma en una frase qué hiciste. No inventes datos, ids ni resultados.",
    "- Para pagos a proveedores, resume con billing_summary pero NO registres el pago aquí: dirígelo al módulo de Facturación (requiere datos bancarios y comprobante).",
    "- Si algo es ambiguo (varios proveedores/experiencias), pregunta cuál.",
  ].join("\n");
}

export interface AdminChatTurn {
  role: "user" | "assistant";
  text: string;
}

export async function runAdminTurn(userText: string, history: AdminChatTurn[]): Promise<{ text: string; changed: boolean }> {
  if (!supabase) throw new Error("Supabase no configurado");
  await loadCtx();

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
  let changed = false;

  for (let step = 0; step < 6; step++) {
    const data = await generate({ systemInstruction: { parts: [{ text: system }] }, contents, tools });
    const cand = data?.candidates?.[0];
    const parts: any[] = cand?.content?.parts ?? [];
    const calls = parts.filter((p) => p.functionCall);
    if (calls.length) {
      contents.push({ role: "model", parts });
      const responseParts: any[] = [];
      for (const c of calls) {
        const res = await runTool(c.functionCall.name, c.functionCall.args ?? {});
        const mutating = !["get_kpis", "list_providers", "list_experiences", "list_bookings", "list_requests", "billing_summary"].includes(
          c.functionCall.name
        );
        if (mutating && res.ok) changed = true;
        responseParts.push({ functionResponse: { name: c.functionCall.name, response: res } });
      }
      contents.push({ role: "user", parts: responseParts });
      continue;
    }
    const text = parts.filter((p) => typeof p.text === "string").map((p) => p.text).join("").trim();
    return { text: text || "Listo.", changed };
  }
  return { text: "No pude completar la solicitud en varios pasos. ¿Puedes reformularla?", changed };
}

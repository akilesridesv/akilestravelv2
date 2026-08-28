import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { extractExperience } from "@/ai/extractExperience";
import { classifyIntent } from "@/ai/intent";
import {
  parseBookingAction,
  parseCalendarCommand,
  parseDateSlotCommand,
  parseExperienceEdits,
  parseDeadlineHours,
  parseTierCommand,
  formatDeadline,
  resolveExperience,
} from "@/ai/edits";
import { bookingLink } from "@/lib/experience";
import { isSupabaseConfigured } from "@/lib/supabase";
import { notify } from "@/state/toast";
import { useDraftImages } from "@/state/draftImages";
import { processImageFile, ImageError } from "@/lib/imageProcess";
import { putImage, putImageRemote } from "@/lib/imageStore";
import * as repo from "@/data/repo";
import type { ExperienceDraft } from "@/types/domain";
import { parseProfileCommand, parsePreferenceCommand } from "@/ai/profileEdits";
import { applyProfilePatch, applyPreferencePatch } from "@/ai/tools";
import { isLLMEnabled, runCopilotTurn, type ChatTurn } from "@/ai/llm";
import { ExperienceDraftEditor } from "@/components/provider/ExperienceDraftEditor";
import { BookingsPanel, RevenuePanel, ExperiencesPanel } from "@/components/provider/panels";
import { ProfilePanel, PreferencesPanel } from "@/components/provider/ProfilePanel";
import { Markdown } from "@/components/ui/Markdown";
import { useApp } from "@/state/store";
import { experienceToDraft } from "@/lib/experience";
import { uid, cn } from "@/lib/utils";
import {
  ArrowUp,
  Sparkles,
  ImagePlus,
  Loader2,
  MessageSquare,
  Plus,
  Trash2,
  PanelLeft,
} from "lucide-react";

// Monotonic client timestamps so a user message and its reply keep their order
// even when saved within the same millisecond.
let _lastMs = 0;
function monoIso(): string {
  let ms = Date.now();
  if (ms <= _lastMs) ms = _lastMs + 1;
  _lastMs = ms;
  return new Date(ms).toISOString();
}

// ---- Structured block registry (the model selects a type; UI renders it) ----
type Block =
  | { type: "text"; text: string }
  | { type: "assumptions"; items: string[] }
  | {
      type: "experience_draft";
      draft: ExperienceDraft;
      mode?: "create" | "edit";
      experienceId?: string;
    }
  | { type: "bookings" }
  | { type: "revenue" }
  | { type: "experiences" }
  | { type: "profile" }
  | { type: "preferences" }
  | { type: "actions"; label?: string; items: string[] };

interface Message {
  id: string;
  role: "user" | "assistant";
  blocks: Block[];
}

const SUGGESTIONS = [
  "¿Cómo empiezo a recibir reservas?",
  "Tour de café en Ataco, 3 horas, $35 por persona, sábados 9am, máximo 8",
  "abre los sábados a las 10am cupo 8",
  "¿Qué reservas tengo esta semana?",
];

export function CopilotSurface({
  onNavigate,
  context,
}: {
  onNavigate?: (tab: string) => void;
  /** The panel open on the right — biases how ambiguous messages are read. */
  context?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversations, setConversations] = useState<repo.Conversation[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const convIdRef = useRef<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingImgs, setUploadingImgs] = useState(false);
  const addDraftImages = useDraftImages((s) => s.add);

  async function handleComposerImages(files: FileList | null) {
    if (!files?.length) return;
    setUploadingImgs(true);
    const refs: string[] = [];
    try {
      for (const file of Array.from(files)) {
        try {
          const { blob } = await processImageFile(file);
          refs.push(isSupabaseConfigured ? await putImageRemote(blob) : await putImage(blob));
        } catch (e) {
          notify(e instanceof ImageError ? e.message : "No se pudo subir la imagen.", "warning");
        }
      }
      if (refs.length) {
        addDraftImages(refs);
        notify(
          `${refs.length} imagen${refs.length === 1 ? "" : "es"} lista${
            refs.length === 1 ? "" : "s"
          } — se agrega${refs.length === 1 ? "" : "n"} a la experiencia que estés creando o editando.`
        );
      }
    } finally {
      setUploadingImgs(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Shared application state — the copilot reads and writes the same store the
  // direct panels use, so a chat edit and a manual edit are the same action.
  const experiences = useApp((s) => s.experiences);
  const bookings = useApp((s) => s.bookings);
  const updateExperience = useApp((s) => s.updateExperience);
  const setBookingStatus = useApp((s) => s.setBookingStatus);
  const user = useApp((s) => s.user);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const convEnabled = isSupabaseConfigured && !!user;
  useEffect(() => {
    convIdRef.current = convId;
  }, [convId]);

  // Load this user's conversations; create one if they have none.
  useEffect(() => {
    if (!convEnabled || !user) return;
    let alive = true;
    (async () => {
      try {
        let convs = await repo.loadConversations(user.id);
        if (!convs.length) convs = [await repo.createConversation(user.id)];
        if (!alive) return;
        setConversations(convs);
        setConvId((cur) => cur ?? convs[0].id);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.id, convEnabled]);

  // Load the messages of the active conversation.
  useEffect(() => {
    if (!convEnabled || !convId) return;
    let alive = true;
    repo
      .loadMessages(convId)
      .then((rows) => {
        if (alive)
          setMessages(rows.map((r) => ({ id: r.id, role: r.role, blocks: r.blocks as Block[] })));
      })
      .catch(console.error);
    return () => {
      alive = false;
    };
  }, [convId, convEnabled]);

  function push(role: Message["role"], blocks: Block[]) {
    const msg: Message = { id: uid("msg"), role, blocks };
    setMessages((m) => [...m, msg]);
    const cid = convIdRef.current;
    if (convEnabled && user && cid) {
      void repo
        .saveMessage({
          id: msg.id,
          user_id: user.id,
          conversation_id: cid,
          role,
          blocks: blocks as unknown[],
          created_at: monoIso(),
        })
        .catch(console.error);
    }
  }

  async function newChat() {
    if (!convEnabled || !user) return;
    try {
      const c = await repo.createConversation(user.id);
      setConversations((cs) => [c, ...cs]);
      setConvId(c.id);
      setMessages([]);
      setHistoryOpen(false);
    } catch (e) {
      console.error(e);
    }
  }

  function switchChat(id: string) {
    setConvId(id);
    setHistoryOpen(false);
  }

  async function deleteChat(id: string) {
    if (!convEnabled || !user) return;
    try {
      await repo.deleteConversation(id);
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);
      if (convId === id) {
        if (remaining.length) setConvId(remaining[0].id);
        else {
          const c = await repo.createConversation(user.id);
          setConversations([c]);
          setConvId(c.id);
          setMessages([]);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleSend(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    const firstInConv = messages.length === 0;
    setInput("");
    push("user", [{ type: "text", text: value }]);
    const cid = convIdRef.current;
    if (convEnabled && cid) {
      if (firstInConv) {
        const title = value.length > 48 ? value.slice(0, 48) + "…" : value;
        void repo.renameConversation(cid, title).catch(console.error);
        setConversations((cs) => cs.map((c) => (c.id === cid ? { ...c, title } : c)));
      } else {
        void repo.touchConversation(cid).catch(console.error);
      }
    }
    setBusy(true);

    try {
      // The LLM (Gemini) handles: (a) anything the rule-based classifier doesn't
      // recognize on its own, and (b) QUESTIONS that the command-heuristic would
      // otherwise misread as an action (e.g. "¿qué experiencias debería subir?").
      const baseIntent = classifyIntent(value);
      const isQuestion =
        /\?/.test(value) ||
        /^\s*(qu[eé]|cu[aá]l(es)?|c[oó]mo|por\s?qu[eé]|cu[aá]ndo|d[oó]nde|qui[eé]n|cu[aá]nto|deber[ií]a|recomi[eé]nda|me conviene|conviene|vale la pena|puedo|podr[ií]a|es mejor|necesito saber|expl[ií]ca)\b/i.test(
          value.trim()
        );
      const actionIntents = new Set<string>([
        "create_experience",
        "edit_experience",
        "manage_calendar",
        "manage_tiers",
        "set_deadline",
        "share_experience",
      ]);
      const preferLLM =
        isLLMEnabled && (baseIntent === "unknown" || (isQuestion && actionIntents.has(baseIntent)));
      if (preferLLM) {
        try {
          const history: ChatTurn[] = messages.flatMap((m) => {
            const tb = m.blocks.find((b) => b.type === "text") as
              | { type: "text"; text: string }
              | undefined;
            return tb ? [{ role: m.role, text: tb.text }] : [];
          });
          const res = await runCopilotTurn(value, history);
          push("assistant", [{ type: "text", text: res.text }]);
          if (res.changes.length)
            notify(
              res.changes.length === 1 ? res.changes[0] : `${res.changes.length} cambios aplicados`
            );
          return;
        } catch (e) {
          console.error("LLM error", e);
          // fall through to the heuristic routing below
        }
      }

      const intent = classifyIntent(value, context);
      switch (intent) {
        case "create_experience": {
          const { draft, summary, assumptions } = await extractExperience(value);
          const blocks: Block[] = [{ type: "text", text: summary }];
          if (assumptions.length) blocks.push({ type: "assumptions", items: assumptions });
          blocks.push({ type: "experience_draft", draft });
          blocks.push({
            type: "actions",
            label: "Publícala y luego abre reservas. Toca un ejemplo:",
            items: [
              "abre los sábados a las 10am cupo 8",
              "habilita el 5, 8 y 12 de septiembre",
              "agrega un tier VIP a $60 que incluye una bebida",
            ],
          });
          push("assistant", blocks);
          break;
        }
        case "edit_experience": {
          const exp = resolveExperience(value, experiences);
          if (!exp) {
            push("assistant", [
              { type: "text", text: "Aún no tienes experiencias que editar. Crea una describiéndola." },
            ]);
            break;
          }
          const { patch, changes } = parseExperienceEdits(value, exp);
          if (changes.length) {
            updateExperience(exp.id, patch);
            notify(`Actualicé “${exp.title}”.`);
            push("assistant", [
              { type: "text", text: `Actualicé “${exp.title}”: ${changes.join(", ")}.` },
              { type: "experiences" },
            ]);
          } else {
            push("assistant", [
              { type: "text", text: `Abrí “${exp.title}” para que la edites 👇` },
              { type: "experience_draft", draft: experienceToDraft(exp), mode: "edit", experienceId: exp.id },
            ]);
          }
          break;
        }
        case "manage_calendar": {
          const exp = resolveExperience(value, experiences);
          if (!exp) {
            push("assistant", [
              { type: "text", text: "Primero crea una experiencia; luego puedo abrir o bloquear sus salidas." },
            ]);
            break;
          }
          // Concrete-date command (Airbnb calendar) takes priority when present.
          const dateRes = parseDateSlotCommand(value, exp);
          if (dateRes) {
            updateExperience(exp.id, { date_slots: dateRes.date_slots });
            notify(`${dateRes.change} en “${exp.title}”.`);
            push("assistant", [
              { type: "text", text: `En “${exp.title}”, ${dateRes.change}.` },
              { type: "actions", label: "¿Algo más?", items: ["cambia la hora de esas fechas a 2pm", "cupo 12 en esas fechas", "¿qué reservas tengo?"] },
            ]);
            onNavigate?.("calendar");
            break;
          }
          const { schedules, changes } = parseCalendarCommand(value, exp);
          if (!changes.length) {
            push("assistant", [
              {
                type: "text",
                text: 'No capté el cambio. Prueba: “abre los sábados con cupo 10”, “bloquea los lunes” o “cambia la hora a 10am”.',
              },
            ]);
            break;
          }
          updateExperience(exp.id, { schedules });
          notify(`Horarios actualizados en “${exp.title}”.`);
          push("assistant", [
            { type: "text", text: `Listo en “${exp.title}”: ${changes.join(" · ")}.` },
          ]);
          onNavigate?.("calendar");
          break;
        }
        case "manage_tiers": {
          const exp = resolveExperience(value, experiences);
          if (!exp) {
            push("assistant", [
              { type: "text", text: "Primero crea una experiencia para gestionar sus tiers." },
            ]);
            break;
          }
          const res = parseTierCommand(value, exp);
          if (!res) {
            push("assistant", [
              {
                type: "text",
                text: 'No capté el tier. Ej. “agrega un tier VIP a $60 que incluye bebida” o “quita el tier snack”.',
              },
            ]);
            break;
          }
          updateExperience(exp.id, { tiers: res.tiers });
          notify(`${res.change} en “${exp.title}”.`);
          const count = res.tiers.length;
          push("assistant", [
            {
              type: "text",
              text: `En “${exp.title}”, ${res.change}. Ahora tiene ${count} tier${count === 1 ? "" : "s"}.`,
            },
          ]);
          break;
        }
        case "share_experience": {
          const exp = resolveExperience(value, experiences);
          if (!exp) {
            push("assistant", [
              { type: "text", text: "¿Cuál experiencia quieres compartir? Aún no tienes ninguna creada." },
            ]);
            break;
          }
          push("assistant", [
            {
              type: "text",
              text: `Comparte este enlace para reservar “${exp.title}”:\n${bookingLink(exp.id)}`,
            },
          ]);
          break;
        }
        case "set_deadline": {
          const exp = resolveExperience(value, experiences);
          if (!exp) {
            push("assistant", [
              { type: "text", text: "Primero crea una experiencia para configurar su anticipación." },
            ]);
            break;
          }
          const hours = parseDeadlineHours(value);
          if (hours == null) {
            push("assistant", [
              { type: "text", text: 'No capté el tiempo. Ej. “reserva con 3 días de anticipación” o “2 horas antes”.' },
            ]);
            break;
          }
          updateExperience(exp.id, { registration_deadline_hours: hours });
          notify(`Anticipación mínima: ${formatDeadline(hours)}.`);
          push("assistant", [
            {
              type: "text",
              text: `Anticipación mínima de “${exp.title}” → ${formatDeadline(hours)} antes del inicio.`,
            },
          ]);
          break;
        }
        case "booking_action": {
          const act = parseBookingAction(value, bookings);
          if (!act) {
            push("assistant", [
              { type: "text", text: "¿Cuál reserva? Dime el nombre, por ejemplo “aprueba la de Juan”." },
            ]);
            break;
          }
          setBookingStatus(act.booking.id, act.action === "approve" ? "confirmed" : "rejected");
          notify(
            act.action === "approve"
              ? `Aprobaste la reserva de ${act.booking.contact_name}.`
              : `Rechazaste la reserva de ${act.booking.contact_name}.`
          );
          push("assistant", [
            {
              type: "text",
              text:
                act.action === "approve"
                  ? `Aprobé y cobré la reserva de ${act.booking.contact_name} (${act.booking.number_of_people} pers).`
                  : `Rechacé la reserva de ${act.booking.contact_name}.`,
            },
            { type: "bookings" },
          ]);
          break;
        }
        case "view_profile":
          push("assistant", [
            { type: "text", text: "Así se ve tu perfil. Toca “Editar perfil” o dime el cambio (ej. “mi WhatsApp es 7777-8888”)." },
            { type: "profile" },
          ]);
          onNavigate?.("profile");
          break;
        case "edit_profile": {
          const patch = parseProfileCommand(value);
          if (patch) {
            const res = applyProfilePatch(patch);
            notify(res.message, res.ok ? "success" : "warning");
            push("assistant", [
              { type: "text", text: res.ok && res.changes?.length ? res.message : "Abrí tu perfil para editarlo 👇" },
              { type: "profile" },
            ]);
          } else {
            push("assistant", [
              { type: "text", text: "Abrí tu perfil para que lo edites. También puedes decirme, por ejemplo, “mi correo de contacto es hola@negocio.com” o “el nombre de mi negocio es Café Ataco”." },
              { type: "profile" },
            ]);
          }
          onNavigate?.("profile");
          break;
        }
        case "set_preferences": {
          const patch = parsePreferenceCommand(value);
          if (patch) {
            const res = applyPreferencePatch(patch);
            notify(res.message, res.ok ? "success" : "warning");
            push("assistant", [
              { type: "text", text: res.ok && res.changes?.length ? res.message : "Aquí están tus preferencias 👇" },
              { type: "preferences" },
            ]);
          } else {
            push("assistant", [
              { type: "text", text: "Estas son tus preferencias. Puedes cambiarlas aquí o decirme, por ejemplo, “activa aprobar reservas automáticamente” o “mándame los avisos por WhatsApp”." },
              { type: "preferences" },
            ]);
          }
          onNavigate?.("profile");
          break;
        }
        case "view_bookings":
          push("assistant", [
            { type: "text", text: "Estas son tus reservas. Puedes aprobar o rechazar las pendientes aquí mismo." },
            { type: "bookings" },
          ]);
          break;
        case "view_revenue":
          push("assistant", [
            { type: "text", text: "Así va tu negocio:" },
            { type: "revenue" },
          ]);
          break;
        case "view_experiences":
          push("assistant", [
            { type: "text", text: "Tus experiencias:" },
            { type: "experiences" },
          ]);
          break;
        case "guide":
          if (!experiences.length) {
            push("assistant", [
              {
                type: "text",
                text: "¡Vamos a poner tu negocio a vender! Primero creamos tu primera experiencia — descríbemela en una frase, o toca un ejemplo:",
              },
              {
                type: "actions",
                items: [
                  "Tour de café en Ataco, 3 horas, $35 por persona, sábados 9am, máximo 8",
                  "Clase de surf en El Tunco, 2 horas, $25, domingos 7am, máximo 6",
                ],
              },
            ]);
          } else {
            push("assistant", [
              {
                type: "text",
                text: "Para recibir reservas hay que abrir cuándo, con qué cupo y opciones. Toca una acción o escríbeme con tus palabras — yo lo aplico:",
              },
              {
                type: "actions",
                label: "1) Abrir disponibilidad",
                items: ["abre los sábados a las 10am cupo 8", "habilita el 5, 8 y 12 de septiembre"],
              },
              {
                type: "actions",
                label: "2) Precios y opciones",
                items: ["agrega un tier VIP a $60 que incluye una bebida", "sube el precio a $40"],
              },
              {
                type: "actions",
                label: "3) Reglas y reservas",
                items: ["reserva con 2 días de anticipación", "¿qué reservas tengo?"],
              },
            ]);
          }
          break;
        case "help":
          push("assistant", [
            {
              type: "text",
              text: "Soy tu copiloto. Dime en tus palabras lo que quieras y lo aplico. Por ejemplo:",
            },
            {
              type: "actions",
              items: [
                "abre los sábados a las 10am cupo 8",
                "habilita el 5 y 6 de octubre",
                "sube el precio del tour de café a $40",
                "agrega un tier VIP a $60",
                "¿qué reservas tengo?",
              ],
            },
          ]);
          break;
        default:
          push("assistant", [
            {
              type: "text",
              text:
                "No estoy seguro de qué necesitas — pero puedo hacerlo por ti. Toca una opción o descríbeme una experiencia para publicarla:",
            },
            {
              type: "actions",
              items: [
                "abre los sábados a las 10am cupo 8",
                "habilita el 5 y 6 de octubre",
                "¿cómo abro reservas?",
                "¿qué reservas tengo?",
              ],
            },
          ]);
      }
    } finally {
      setBusy(false);
    }
  }

  const empty = messages.length === 0;

  const placeholder =
    ({
      experiences: "Crea o edita una experiencia…",
      calendar: "Ej. “abre los sábados con cupo 10”…",
      bookings: "Ej. “aprueba la de Juan”…",
      revenue: "Pregunta por tus ingresos…",
      profile: "Ej. “mi WhatsApp es 7777-8888”…",
    } as Record<string, string>)[context ?? ""] ?? "Escribe a tu copiloto…";

  const currentTitle = conversations.find((c) => c.id === convId)?.title || "Chat";

  return (
    <div className="relative flex h-full">
      {/* Mobile backdrop when the history drawer is open */}
      {convEnabled && historyOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setHistoryOpen(false)}
        />
      )}

      {/* Collapsible chat-history sidebar (drawer on mobile, column on desktop) */}
      {convEnabled && (
        <aside
          className={cn(
            "z-40 flex min-h-0 shrink-0 flex-col bg-secondary/40 transition-all duration-200",
            "fixed inset-y-0 left-0 w-64 border-r border-border shadow-xl md:static md:z-auto md:shadow-none",
            historyOpen
              ? "translate-x-0 md:w-64"
              : "-translate-x-full md:w-0 md:translate-x-0 md:overflow-hidden md:border-0"
          )}
        >
          <div className="flex items-center justify-between px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium">
              <MessageSquare className="h-4 w-4 text-muted-foreground" /> Chats
            </span>
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              aria-label="Cerrar historial"
              className="rounded-lg p-1 text-muted-foreground transition hover:bg-accent md:hidden"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          </div>
          <div className="px-2">
            <button
              type="button"
              onClick={newChat}
              className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm transition hover:bg-accent"
            >
              <Plus className="h-4 w-4" /> Nuevo chat
            </button>
          </div>
          <div className="mt-1 flex-1 overflow-y-auto px-2 pb-2">
            {conversations.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "group flex items-center gap-1 rounded-lg",
                  c.id === convId ? "bg-accent" : "hover:bg-accent/60"
                )}
              >
                <button
                  type="button"
                  onClick={() => switchChat(c.id)}
                  className="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm"
                >
                  {c.title || "Nuevo chat"}
                </button>
                {conversations.length > 1 && (
                  <button
                    type="button"
                    onClick={() => deleteChat(c.id)}
                    aria-label="Eliminar chat"
                    className="shrink-0 pr-2 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* Chat column */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Top bar: history toggle + current chat + new */}
        {convEnabled && (
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background/80 px-3 py-2 backdrop-blur sm:px-4">
            <button
              type="button"
              onClick={() => setHistoryOpen((o) => !o)}
              aria-label="Historial de chats"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent"
            >
              <PanelLeft className="h-5 w-5" />
            </button>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{currentTitle}</span>
            <button
              type="button"
              onClick={newChat}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs transition hover:bg-accent"
            >
              <Plus className="h-3.5 w-3.5" /> Nuevo
            </button>
          </div>
        )}

        {/* Message stream */}
        <div ref={scrollRef} className="no-scrollbar flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {empty ? (
          <Welcome onPick={handleSend} />
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {messages.map((m) => (
              <MessageView key={m.id} message={m} onAction={handleSend} />
            ))}
            {busy && <ThinkingRow />}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-background/80 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] backdrop-blur sm:px-6">
        <form
          className="mx-auto flex max-w-2xl items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(input);
          }}
        >
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploadingImgs}
            aria-label="Agregar imágenes"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:bg-accent disabled:opacity-60"
          >
            {uploadingImgs ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleComposerImages(e.target.files)}
          />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(input);
              }
            }}
            rows={1}
            placeholder={placeholder}
            className="max-h-40 min-h-[48px] flex-1 resize-none rounded-2xl border border-input bg-card px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" size="icon" disabled={!input.trim() || busy} aria-label="Enviar">
            <ArrowUp className="h-5 w-5" />
          </Button>
        </form>
      </div>
      </div>
    </div>
  );
}

function Welcome({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center py-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-ink">
        <Sparkles className="h-7 w-7" />
      </div>
      <h2 className="font-display text-2xl sm:text-3xl">¿Qué quieres hacer hoy?</h2>
      <p className="mt-2 max-w-md text-muted-foreground">
        Háblale a tu negocio. Describe una experiencia y la publico en segundos, o pregúntame por tus
        reservas e ingresos.
      </p>
      <div className="mt-6 grid w-full gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm transition hover:bg-accent"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageView({
  message,
  onAction,
}: {
  message: Message;
  onAction: (text: string) => void;
}) {
  const isUser = message.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div className={isUser ? "max-w-[85%]" : "w-full"}>
        {message.blocks.map((b, i) => (
          <div key={i} className={i > 0 ? "mt-2" : ""}>
            <BlockView block={b} isUser={isUser} onAction={onAction} />
          </div>
        ))}
      </div>
    </div>
  );
}

function BlockView({
  block,
  isUser,
  onAction,
}: {
  block: Block;
  isUser: boolean;
  onAction: (text: string) => void;
}) {
  switch (block.type) {
    case "text":
      return isUser ? (
        <div className="rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm text-background">
          {block.text}
        </div>
      ) : (
        <div className="text-[15px] leading-relaxed text-foreground">
          <Markdown text={block.text} />
        </div>
      );
    case "assumptions":
      return (
        <Card className="border-amber-200 bg-amber-50 p-3">
          <p className="mb-1 text-xs font-medium text-amber-800">Revisá estos supuestos:</p>
          <ul className="list-inside list-disc space-y-0.5 text-sm text-amber-900">
            {block.items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        </Card>
      );
    case "experience_draft":
      return (
        <ExperienceDraftEditor
          initial={block.draft}
          mode={block.mode}
          experienceId={block.experienceId}
          onDone={() => {}}
        />
      );
    case "bookings":
      return <BookingsPanel />;
    case "revenue":
      return <RevenuePanel />;
    case "experiences":
      return <ExperiencesPanel />;
    case "profile":
      return <ProfilePanel />;
    case "preferences":
      return <PreferencesPanel />;
    case "actions":
      return (
        <div>
          {block.label && <p className="mb-1.5 text-sm text-muted-foreground">{block.label}</p>}
          <div className="grid gap-1.5">
            {block.items.map((it, i) => (
              <button
                key={i}
                onClick={() => onAction(it)}
                className="rounded-xl border border-border bg-card px-3 py-2 text-left text-sm transition hover:bg-accent"
              >
                {it}
              </button>
            ))}
          </div>
        </div>
      );
  }
}

function ThinkingRow() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
      Preparando…
    </div>
  );
}

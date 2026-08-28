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
import { ExperienceDraftEditor } from "@/components/provider/ExperienceDraftEditor";
import { BookingsPanel, RevenuePanel, ExperiencesPanel } from "@/components/provider/panels";
import { useApp } from "@/state/store";
import { experienceToDraft } from "@/lib/experience";
import { uid } from "@/lib/utils";
import { ArrowUp, Sparkles, ImagePlus, Loader2 } from "lucide-react";

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

  // Load persisted chat history for this provider (Supabase).
  useEffect(() => {
    if (!isSupabaseConfigured || !user) return;
    let alive = true;
    repo
      .loadMessages(user.id)
      .then((rows) => {
        if (alive && rows.length)
          setMessages(rows.map((r) => ({ id: r.id, role: r.role, blocks: r.blocks as Block[] })));
      })
      .catch(console.error);
    return () => {
      alive = false;
    };
  }, [user?.id]);

  function push(role: Message["role"], blocks: Block[]) {
    const msg: Message = { id: uid("msg"), role, blocks };
    setMessages((m) => [...m, msg]);
    if (isSupabaseConfigured && user) {
      void repo
        .saveMessage({
          id: msg.id,
          user_id: user.id,
          role,
          blocks: blocks as unknown[],
          created_at: monoIso(),
        })
        .catch(console.error);
    }
  }

  async function handleSend(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    setInput("");
    push("user", [{ type: "text", text: value }]);
    setBusy(true);

    const intent = classifyIntent(value, context);
    try {
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
    } as Record<string, string>)[context ?? ""] ?? "Escribe a tu copiloto…";

  return (
    <div className="flex h-full flex-col">
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
      return (
        <div
          className={
            isUser
              ? "rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm text-background"
              : "text-[15px] leading-relaxed text-foreground"
          }
        >
          {block.text}
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

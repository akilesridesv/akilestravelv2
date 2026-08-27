import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { extractExperience } from "@/ai/extractExperience";
import { classifyIntent } from "@/ai/intent";
import type { ExperienceDraft } from "@/types/domain";
import { ExperienceDraftEditor } from "@/components/provider/ExperienceDraftEditor";
import { BookingsPanel, RevenuePanel, ExperiencesPanel } from "@/components/provider/panels";
import { uid } from "@/lib/utils";
import { ArrowUp, Sparkles } from "lucide-react";

// ---- Structured block registry (the model selects a type; UI renders it) ----
type Block =
  | { type: "text"; text: string }
  | { type: "assumptions"; items: string[] }
  | { type: "experience_draft"; draft: ExperienceDraft }
  | { type: "bookings" }
  | { type: "revenue" }
  | { type: "experiences" };

interface Message {
  id: string;
  role: "user" | "assistant";
  blocks: Block[];
}

const SUGGESTIONS = [
  "Tour de café en Ataco, 3 horas, $35 por persona, martes y jueves 9am, máximo 8",
  "¿Qué reservas tengo esta semana?",
  "¿Cómo va mi mes?",
];

export function CopilotSurface({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  function push(role: Message["role"], blocks: Block[]) {
    setMessages((m) => [...m, { id: uid("msg"), role, blocks }]);
  }

  async function handleSend(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    setInput("");
    push("user", [{ type: "text", text: value }]);
    setBusy(true);

    const intent = classifyIntent(value);
    try {
      switch (intent) {
        case "create_experience": {
          const { draft, summary, assumptions } = await extractExperience(value);
          const blocks: Block[] = [{ type: "text", text: summary }];
          if (assumptions.length) blocks.push({ type: "assumptions", items: assumptions });
          blocks.push({ type: "experience_draft", draft });
          push("assistant", blocks);
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
        case "manage_calendar":
          push("assistant", [
            {
              type: "text",
              text: "El calendario en lenguaje natural (“abre todos los sábados cupo 10”, “bloquea del 15 al 20”) llega en la Fase 2. Por ahora, abre la pestaña Calendario para ver tus salidas.",
            },
          ]);
          onNavigate?.("calendar");
          break;
        case "help":
          push("assistant", [
            {
              type: "text",
              text:
                "Soy tu copiloto de negocio. Puedo: crear una experiencia si me la describes en una frase, mostrarte tus reservas, tus ingresos y tus experiencias. Escríbeme como le hablarías a un asistente.",
            },
          ]);
          break;
        default:
          push("assistant", [
            {
              type: "text",
              text:
                "No estoy seguro de qué necesitas. Prueba describiéndome una experiencia para publicarla, o pregúntame por tus reservas o ingresos.",
            },
          ]);
      }
    } finally {
      setBusy(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex h-full flex-col">
      {/* Message stream */}
      <div ref={scrollRef} className="no-scrollbar flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {empty ? (
          <Welcome onPick={handleSend} />
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {messages.map((m) => (
              <MessageView key={m.id} message={m} />
            ))}
            {busy && <ThinkingRow />}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="safe-b border-t border-border bg-background/80 px-4 py-3 backdrop-blur sm:px-6">
        <form
          className="mx-auto flex max-w-2xl items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(input);
          }}
        >
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
            placeholder="Describe una experiencia o pregunta por tu negocio…"
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

function MessageView({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div className={isUser ? "max-w-[85%]" : "w-full"}>
        {message.blocks.map((b, i) => (
          <div key={i} className={i > 0 ? "mt-2" : ""}>
            <BlockView block={b} isUser={isUser} />
          </div>
        ))}
      </div>
    </div>
  );
}

function BlockView({ block, isUser }: { block: Block; isUser: boolean }) {
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
      return <ExperienceDraftEditor initial={block.draft} onPublished={() => {}} />;
    case "bookings":
      return <BookingsPanel />;
    case "revenue":
      return <RevenuePanel />;
    case "experiences":
      return <ExperiencesPanel />;
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

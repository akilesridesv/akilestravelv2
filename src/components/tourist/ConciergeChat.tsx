import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePublishedExperiences } from "@/hooks/usePublicData";
import { useApp } from "@/state/store";
import {
  runTouristTurn,
  setTouristContext,
  type TouristChatTurn,
} from "@/ai/touristConcierge";
import { ExperienceImage } from "@/components/provider/ExperienceImage";
import { displayPrice } from "@/lib/experience";
import { formatUSD, cn } from "@/lib/utils";
import { notify } from "@/state/toast";
import { Sparkles, Send, Loader2, MapPin, ArrowRight } from "lucide-react";

interface Msg {
  role: "user" | "assistant";
  text: string;
  matches?: string[];
  bookingPath?: string;
}

const SUGGESTIONS = [
  "Recomiéndame algo de aventura este fin de semana",
  "Muéstrame mis próximas reservas",
  "Quiero un tour de café cerca de San Salvador",
  "Necesito alquilar un vehículo 3 días",
];

/** Agentic tourist concierge chat: recommends, starts bookings, manages
 *  reservations and files requests with Akiles — all by conversation. */
export function ConciergeChat({ onChanged }: { onChanged?: () => void }) {
  const navigate = useNavigate();
  const { data } = usePublishedExperiences();
  const catalog = useMemo(() => data ?? [], [data]);
  const userId = useApp((s) => s.user?.id ?? null);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(catalog.map((e) => [e.id, e])), [catalog]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    const history: TouristChatTurn[] = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      setTouristContext({ catalog, userId });
      const turn = await runTouristTurn(q, history);
      setMessages((m) => [
        ...m,
        { role: "assistant", text: turn.text, matches: turn.matches, bookingPath: turn.bookingPath },
      ]);
      if (turn.changed) onChanged?.();
    } catch {
      notify("El concierge no está disponible ahora. Intenta de nuevo.", "warning");
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Ups, no pude procesar eso ahora. ¿Lo intentamos de nuevo?" },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[64vh] max-h-[640px] flex-col rounded-2xl border border-border bg-card">
      {/* Messages */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && !busy && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-ink">
              <Sparkles className="h-6 w-6" />
            </span>
            <div>
              <p className="font-display text-lg">Tu concierge de viajes</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Pídeme ideas, reserva, gestiona tus viajes o cuéntame qué necesitas — si no está en la
                plataforma, lo gestionamos con Akiles.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] space-y-2", m.role === "user" ? "" : "w-full")}>
              <div
                className={cn(
                  "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  m.role === "user"
                    ? "ml-auto w-fit bg-ink text-background"
                    : "border border-border bg-background"
                )}
              >
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
              </div>

              {/* Recommended experience cards */}
              {m.matches && m.matches.length > 0 && (
                <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
                  {m.matches
                    .map((id) => byId.get(id))
                    .filter(Boolean)
                    .map((e) => (
                      <Link
                        key={e!.id}
                        to={`/e/${e!.id}`}
                        className="group w-40 shrink-0 overflow-hidden rounded-xl border border-border bg-card transition hover:shadow-sm"
                      >
                        <ExperienceImage
                          imageRef={e!.featured_image}
                          alt={e!.title}
                          className="aspect-[4/3] w-full transition group-hover:scale-[1.03]"
                        />
                        <div className="p-2">
                          <p className="line-clamp-2 text-xs font-medium leading-tight">{e!.title}</p>
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <MapPin className="h-3 w-3" /> {e!.city ?? e!.department ?? "El Salvador"}
                          </p>
                          <p className="mt-0.5 text-xs font-semibold text-teal">
                            {formatUSD(displayPrice(e!).amount)}
                          </p>
                        </div>
                      </Link>
                    ))}
                </div>
              )}

              {/* Prefilled booking CTA */}
              {m.bookingPath && (
                <button
                  onClick={() => navigate(m.bookingPath!)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-ink transition hover:opacity-90"
                >
                  Reservar ahora <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3.5 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Pensando…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="flex items-center gap-2 border-t border-border p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Escríbele a tu concierge…"
          className="h-11 flex-1 rounded-full border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={() => send(input)}
          disabled={busy || !input.trim()}
          aria-label="Enviar"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-ink transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

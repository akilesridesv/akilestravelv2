import { useEffect, useRef, useState } from "react";
import type { Booking, BookingMessage } from "@/types/domain";
import * as repo from "@/data/repo";
import { useApp } from "@/state/store";
import { isSupabaseConfigured } from "@/lib/supabase";
import { notify } from "@/state/toast";
import { cn } from "@/lib/utils";
import { Send, MessageCircle, Loader2 } from "lucide-react";

/**
 * Per-booking chat between the tourist and the provider. Messages persist in
 * public.booking_messages (RLS: only the booking's tourist + the owning
 * provider can read/write). A WhatsApp shortcut is offered as a direct channel.
 */
export function BookingChat({
  booking,
  role = "tourist",
}: {
  booking: Booking;
  /** Whose side is sending. Tourist also gets a WhatsApp shortcut to the provider. */
  role?: "tourist" | "provider";
}) {
  const user = useApp((s) => s.user);
  const [messages, setMessages] = useState<BookingMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let alive = true;
    const load = () =>
      repo
        .loadBookingMessages(booking.id)
        .then((m) => alive && setMessages(m))
        .catch(() => {})
        .finally(() => alive && setLoading(false));
    load();
    // Light polling so the other party's reply shows up without a manual refresh.
    const t = setInterval(load, 8000);
    // Tourist gets a WhatsApp shortcut to the provider.
    if (role === "tourist") {
      repo
        .loadPublishedExperience(booking.activity_id)
        .then((e) => alive && setWhatsapp(e?.provider?.whatsapp || e?.provider?.contact_phone || null))
        .catch(() => {});
    }
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [booking.id, booking.activity_id, role]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send() {
    const body = text.trim();
    if (!body || !user || sending) return;
    setSending(true);
    try {
      const msg = await repo.sendBookingMessage(booking.id, user.id, role, body);
      setMessages((m) => [...m, msg]);
      setText("");
    } catch {
      notify("No pude enviar el mensaje. Intenta de nuevo.", "warning");
    } finally {
      setSending(false);
    }
  }

  if (!isSupabaseConfigured) {
    return <p className="text-sm text-muted-foreground">El chat está disponible con la cuenta en línea.</p>;
  }

  return (
    <div className="flex h-[60vh] max-h-[520px] flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto rounded-2xl border border-border bg-secondary/30 p-3">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <MessageCircle className="h-6 w-6 text-primary" />
            <p>
              {role === "tourist"
                ? "Escríbele al proveedor sobre tu reserva: punto de encuentro, dudas o cambios."
                : "Escríbele al cliente sobre su reserva."}
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.sender_role === role;
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                    mine ? "bg-ink text-background" : "border border-border bg-card"
                  )}
                >
                  {!mine && (
                    <p className="mb-0.5 text-[11px] font-medium text-teal">
                      {m.sender_role === "provider" ? "Proveedor" : "Cliente"}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Escribe un mensaje…"
          className="h-11 flex-1 rounded-full border border-input bg-card px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          aria-label="Enviar"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-ink transition hover:opacity-90 disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>

      {whatsapp && (
        <a
          href={`https://wa.me/${whatsapp.replace(/[^\d]/g, "")}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <MessageCircle className="h-3.5 w-3.5" /> O contáctalo por WhatsApp
        </a>
      )}
    </div>
  );
}

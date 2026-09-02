import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as repo from "@/data/repo";
import type { PublicExperience } from "@/data/repo";
import type { SupportMessage, SupportMeta } from "@/types/domain";
import { usePublishedExperiences } from "@/hooks/usePublicData";
import { ExperienceImage } from "@/components/provider/ExperienceImage";
import { isSupabaseConfigured } from "@/lib/supabase";
import { displayPrice } from "@/lib/experience";
import { formatUSD, cn } from "@/lib/utils";
import { notify } from "@/state/toast";
import { Send, Loader2, MessageCircle, Ticket, Contact, MapPin, Phone, Plus, X } from "lucide-react";

/**
 * Support chat. Admin (Akiles agent) talks with a user (tourist/provider) or
 * with a tourist about a specific concierge request. In agent mode the admin
 * can also send an experience card or an external contact (trusted provider /
 * guide off-platform).
 */
export function SupportChat({
  kind,
  refId,
  role,
  agentTools = role === "admin",
  emptyHint,
}: {
  kind: "user" | "request";
  refId: string;
  role: "admin" | "tourist" | "provider";
  agentTools?: boolean;
  emptyHint?: string;
}) {
  const { data } = usePublishedExperiences();
  const catalog = useMemo(() => data ?? [], [data]);
  const byId = useMemo(() => new Map(catalog.map((e) => [e.id, e])), [catalog]);

  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState<null | "experience" | "contact">(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !refId) return;
    let alive = true;
    const load = () =>
      repo.loadSupportMessages(kind, refId).then((m) => alive && setMessages(m)).catch(() => {});
    load();
    const t = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [kind, refId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send(body: string, meta?: SupportMeta) {
    const b = body.trim();
    if ((!b && !meta) || busy) return;
    setBusy(true);
    try {
      const msg = await repo.sendSupportMessage(kind, refId, role, b, meta);
      setMessages((m) => [...m, msg]);
      setText("");
      setTool(null);
    } catch {
      notify("No pude enviar el mensaje.", "warning");
    } finally {
      setBusy(false);
    }
  }

  if (!isSupabaseConfigured) {
    return <p className="text-sm text-muted-foreground">El soporte está disponible con la cuenta en línea.</p>;
  }

  return (
    <div className="flex h-[60vh] max-h-[560px] flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto rounded-2xl border border-border bg-secondary/30 p-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <MessageCircle className="h-6 w-6 text-primary" />
            <p>{emptyHint ?? "Escribe para iniciar la conversación."}</p>
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.sender_role === role;
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] space-y-2 rounded-2xl px-3 py-2 text-sm",
                    mine ? "bg-ink text-background" : "border border-border bg-card"
                  )}
                >
                  {!mine && (
                    <p className="text-[11px] font-medium text-teal">
                      {m.sender_role === "admin" ? "Akiles Travel" : m.sender_role === "provider" ? "Proveedor" : "Turista"}
                    </p>
                  )}
                  {m.meta?.type === "experience" && (
                    <ExperienceMetaCard exp={byId.get(m.meta.experience_id)} id={m.meta.experience_id} />
                  )}
                  {m.meta?.type === "contact" && <ContactMetaCard meta={m.meta} mine={mine} />}
                  {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {/* Agent tools */}
      {agentTools && tool === "experience" && (
        <ExperiencePicker catalog={catalog} onPick={(id) => send("", { type: "experience", experience_id: id })} onClose={() => setTool(null)} />
      )}
      {agentTools && tool === "contact" && (
        <ContactComposer onSend={(meta) => send("", meta)} onClose={() => setTool(null)} />
      )}

      <div className="mt-3 flex items-center gap-2">
        {agentTools && (
          <>
            <button
              onClick={() => setTool(tool === "experience" ? null : "experience")}
              title="Enviar una experiencia"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:bg-accent"
            >
              <Ticket className="h-4 w-4" />
            </button>
            <button
              onClick={() => setTool(tool === "contact" ? null : "contact")}
              title="Enviar un contacto"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:bg-accent"
            >
              <Contact className="h-4 w-4" />
            </button>
          </>
        )}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
          placeholder="Escribe un mensaje…"
          className="h-11 flex-1 rounded-full border border-input bg-card px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={() => send(text)}
          disabled={busy || !text.trim()}
          aria-label="Enviar"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-ink transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function ExperienceMetaCard({ exp, id }: { exp?: PublicExperience; id: string }) {
  return (
    <Link
      to={`/e/${id}`}
      target="_blank"
      className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 p-1.5"
    >
      <div className="h-12 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
        {exp && <ExperienceImage imageRef={exp.featured_image} alt={exp.title} className="h-full w-full" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-xs font-semibold text-foreground">{exp?.title ?? "Experiencia"}</p>
        <p className="text-[11px] text-teal">
          {exp ? `${exp.city ?? exp.department ?? "El Salvador"} · ${formatUSD(displayPrice(exp).amount)}` : "Abrir"}
        </p>
      </div>
    </Link>
  );
}

function ContactMetaCard({ meta, mine }: { meta: Extract<SupportMeta, { type: "contact" }>; mine: boolean }) {
  return (
    <div className={cn("rounded-lg border p-2", mine ? "border-background/25" : "border-border bg-background/60")}>
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <Contact className="h-3.5 w-3.5" /> {meta.name}
      </p>
      {meta.phone && (
        <a
          href={`https://wa.me/${meta.phone.replace(/[^\d]/g, "")}`}
          target="_blank"
          rel="noreferrer"
          className={cn("mt-0.5 inline-flex items-center gap-1 text-[11px]", mine ? "text-background/90" : "text-teal")}
        >
          <Phone className="h-3 w-3" /> {meta.phone}
        </a>
      )}
      {meta.note && <p className={cn("mt-0.5 text-[11px]", mine ? "text-background/80" : "text-muted-foreground")}>{meta.note}</p>}
    </div>
  );
}

function ExperiencePicker({
  catalog,
  onPick,
  onClose,
}: {
  catalog: PublicExperience[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const providers = useMemo(
    () => [...new Set(catalog.map((e) => e.provider?.business_name).filter(Boolean) as string[])],
    [catalog]
  );
  const [prov, setProv] = useState("");
  const results = catalog.filter(
    (e) =>
      (!prov || e.provider?.business_name === prov) &&
      (!q || `${e.title} ${e.city ?? ""} ${e.department ?? ""}`.toLowerCase().includes(q.toLowerCase()))
  );
  return (
    <div className="mt-3 rounded-2xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">Enviar una experiencia</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mb-2 flex gap-2">
        <select
          value={prov}
          onChange={(e) => setProv(e.target.value)}
          className="h-9 rounded-xl border border-input bg-card px-2 text-sm"
        >
          <option value="">Todos los proveedores</option>
          {providers.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar experiencia…"
          className="h-9 flex-1 rounded-xl border border-input bg-card px-3 text-sm"
        />
      </div>
      <div className="grid max-h-44 gap-1.5 overflow-y-auto">
        {results.slice(0, 20).map((e) => (
          <button
            key={e.id}
            onClick={() => onPick(e.id)}
            className="flex items-center gap-2 rounded-xl border border-border p-2 text-left text-sm transition hover:bg-accent"
          >
            <div className="h-9 w-12 shrink-0 overflow-hidden rounded bg-muted">
              <ExperienceImage imageRef={e.featured_image} alt={e.title} className="h-full w-full" />
            </div>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{e.title}</span>
              <span className="text-[11px] text-muted-foreground">
                {e.provider?.business_name ?? ""} · {formatUSD(displayPrice(e).amount)}
              </span>
            </span>
            <Plus className="h-4 w-4 shrink-0 text-teal" />
          </button>
        ))}
        {results.length === 0 && <p className="p-2 text-sm text-muted-foreground">Sin resultados.</p>}
      </div>
    </div>
  );
}

function ContactComposer({
  onSend,
  onClose,
}: {
  onSend: (meta: SupportMeta) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="mt-3 rounded-2xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">Enviar un contacto (proveedor/guía externo)</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className="h-9 rounded-xl border border-input bg-card px-3 text-sm" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp / teléfono" className="h-9 rounded-xl border border-input bg-card px-3 text-sm" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional): guía de turismo, transporte…" className="h-9 rounded-xl border border-input bg-card px-3 text-sm" />
        <button
          disabled={!name.trim()}
          onClick={() => onSend({ type: "contact", name: name.trim(), phone: phone.trim() || undefined, note: note.trim() || undefined })}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-ink disabled:opacity-50"
        >
          <MapPin className="h-4 w-4" /> Enviar contacto
        </button>
      </div>
    </div>
  );
}

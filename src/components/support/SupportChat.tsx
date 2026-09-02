import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import {
  Send,
  Loader2,
  MessageCircle,
  Ticket,
  Contact,
  MapPin,
  Phone,
  Plus,
  X,
  Image as ImageIcon,
  FileText,
  Download,
  Link2,
} from "lucide-react";

const DOC_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.csv,application/pdf,application/msword," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_BYTES = 15 * 1024 * 1024;

function fmtSize(n?: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const URL_RE = /(https?:\/\/[^\s]+)/g;
function Linkified({ text, mine }: { text: string; mine: boolean }) {
  const parts = text.split(URL_RE);
  return (
    <p className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        URL_RE.test(p) ? (
          <a
            key={i}
            href={p}
            target="_blank"
            rel="noreferrer"
            className={cn("underline underline-offset-2", mine ? "text-background" : "text-teal")}
          >
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </p>
  );
}

interface Pending {
  text?: string;
  meta?: SupportMeta;
  preview: ReactNode;
}

/**
 * Support chat. Admin (Akiles agent) ↔ a user (tourist/provider) or ↔ a tourist
 * about a concierge request. A "+" menu attaches an experience, a contact,
 * photos, documents or a link — each requires a confirmation before sending.
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
  const [uploading, setUploading] = useState(false);
  const [menu, setMenu] = useState(false);
  const [tool, setTool] = useState<null | "experience" | "contact" | "link">(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

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
  }, [messages.length, pending]);

  async function sendNow(body: string, meta?: SupportMeta) {
    if ((!body && !meta) || busy) return;
    setBusy(true);
    try {
      const msg = await repo.sendSupportMessage(kind, refId, role, body, meta);
      setMessages((m) => [...m, msg]);
      setText("");
      setPending(null);
      setTool(null);
      setMenu(false);
    } catch {
      notify("No pude enviar el mensaje.", "warning");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>, image: boolean) {
    const file = e.target.files?.[0];
    e.target.value = "";
    setMenu(false);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      notify("El archivo supera el límite de 15 MB.", "warning");
      return;
    }
    setUploading(true);
    try {
      const att = await repo.uploadSupportAttachment(refId, file);
      const meta: SupportMeta = {
        type: "file",
        url: att.url,
        name: att.name,
        mime: att.type,
        size: att.size,
        image: image || att.type.startsWith("image/"),
      };
      setPending({
        meta,
        preview:
          meta.image ? (
            <img src={meta.url} alt={meta.name} className="max-h-32 rounded-lg" />
          ) : (
            <FileChip name={meta.name} size={meta.size} />
          ),
      });
    } catch {
      notify("No pude subir el archivo.", "warning");
    } finally {
      setUploading(false);
    }
  }

  if (!isSupabaseConfigured) {
    return <p className="text-sm text-muted-foreground">El soporte está disponible con la cuenta en línea.</p>;
  }

  const menuItems: { key: typeof tool | "photo" | "doc"; label: string; icon: React.ElementType; run: () => void }[] = [
    { key: "experience", label: "Experiencia", icon: Ticket, run: () => { setTool("experience"); setMenu(false); } },
    { key: "contact", label: "Contacto", icon: Contact, run: () => { setTool("contact"); setMenu(false); } },
    { key: "photo", label: "Foto / imagen", icon: ImageIcon, run: () => photoRef.current?.click() },
    { key: "doc", label: "Documento", icon: FileText, run: () => docRef.current?.click() },
    { key: "link", label: "Enlace", icon: Link2, run: () => { setTool("link"); setMenu(false); } },
  ];

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
                  {m.meta?.type === "file" &&
                    (m.meta.image ? (
                      <a href={m.meta.url} target="_blank" rel="noreferrer">
                        <img src={m.meta.url} alt={m.meta.name} className="max-h-48 rounded-lg" />
                      </a>
                    ) : (
                      <a href={m.meta.url} target="_blank" rel="noreferrer" download={m.meta.name}>
                        <FileChip name={m.meta.name} size={m.meta.size} mine={mine} />
                      </a>
                    ))}
                  {m.body && <Linkified text={m.body} mine={mine} />}
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e, true)} />
      <input ref={docRef} type="file" accept={DOC_ACCEPT} className="hidden" onChange={(e) => onFile(e, false)} />

      {/* Tool composers */}
      {agentTools && tool === "experience" && (
        <ExperiencePicker
          catalog={catalog}
          onPick={(e) =>
            setPending({
              meta: { type: "experience", experience_id: e.id },
              preview: <ExperienceMetaCard exp={e} id={e.id} />,
            })
          }
          onClose={() => setTool(null)}
        />
      )}
      {agentTools && tool === "contact" && (
        <ContactComposer
          onReady={(meta) => setPending({ meta, preview: <ContactMetaCard meta={meta} mine={false} /> })}
          onClose={() => setTool(null)}
        />
      )}
      {tool === "link" && (
        <LinkComposer
          onReady={(url) => setPending({ text: url, preview: <span className="text-teal underline">{url}</span> })}
          onClose={() => setTool(null)}
        />
      )}

      {/* Confirmation before sending an attachment / experience / contact / link */}
      {pending && (
        <div className="mt-3 rounded-2xl border border-primary/40 bg-primary/5 p-3">
          <p className="mb-2 text-xs font-medium">¿Enviar esto?</p>
          <div className="mb-3">{pending.preview}</div>
          <div className="flex gap-2">
            <button
              onClick={() => sendNow(pending.text ?? "", pending.meta)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar
            </button>
            <button
              onClick={() => setPending(null)}
              className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Composer */}
      <div className="relative mt-3 flex items-center gap-2">
        <button
          onClick={() => setMenu((v) => !v)}
          disabled={uploading}
          aria-label="Adjuntar"
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition",
            menu ? "border-ink bg-ink text-background" : "border-border text-muted-foreground hover:bg-accent"
          )}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
            <div className="absolute bottom-full left-0 z-30 mb-2 w-52 rounded-2xl border border-border bg-card p-1.5 shadow-xl">
              {menuItems
                .filter((it) => agentTools || it.key === "photo" || it.key === "doc" || it.key === "link")
                .map((it) => (
                  <button
                    key={it.key}
                    onClick={it.run}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-accent"
                  >
                    <it.icon className="h-4 w-4 shrink-0 text-muted-foreground" /> {it.label}
                  </button>
                ))}
            </div>
          </>
        )}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendNow(text);
            }
          }}
          placeholder="Escribe un mensaje…"
          className="h-11 flex-1 rounded-full border border-input bg-card px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={() => sendNow(text)}
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

function FileChip({ name, size, mine }: { name: string; size?: number; mine?: boolean }) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-2",
        mine ? "border-background/25" : "border-border bg-secondary/40"
      )}
    >
      <FileText className={cn("h-5 w-5 shrink-0", mine ? "" : "text-teal")} />
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">{name}</span>
        <span className={cn("text-[10px]", mine ? "text-background/70" : "text-muted-foreground")}>{fmtSize(size)}</span>
      </span>
      <Download className="h-4 w-4 shrink-0 opacity-70" />
    </span>
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
  onPick: (e: PublicExperience) => void;
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
        <p className="text-sm font-medium">Buscar experiencia</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mb-2 flex gap-2">
        <select value={prov} onChange={(e) => setProv(e.target.value)} className="h-9 rounded-xl border border-input bg-card px-2 text-sm">
          <option value="">Todos los proveedores</option>
          {providers.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="h-9 flex-1 rounded-xl border border-input bg-card px-3 text-sm" />
      </div>
      <div className="grid max-h-44 gap-1.5 overflow-y-auto">
        {results.slice(0, 20).map((e) => (
          <button
            key={e.id}
            onClick={() => onPick(e)}
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
  onReady,
  onClose,
}: {
  onReady: (meta: Extract<SupportMeta, { type: "contact" }>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="mt-3 rounded-2xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">Contacto (proveedor/guía externo)</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className="h-9 rounded-xl border border-input bg-card px-3 text-sm" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp / teléfono" className="h-9 rounded-xl border border-input bg-card px-3 text-sm" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" className="h-9 rounded-xl border border-input bg-card px-3 text-sm" />
        <button
          disabled={!name.trim()}
          onClick={() => {
            onReady({ type: "contact", name: name.trim(), phone: phone.trim() || undefined, note: note.trim() || undefined });
            onClose();
          }}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-ink px-4 text-sm font-medium text-background disabled:opacity-50"
        >
          <MapPin className="h-4 w-4" /> Preparar contacto
        </button>
      </div>
    </div>
  );
}

function LinkComposer({ onReady, onClose }: { onReady: (url: string) => void; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const clean = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);
  return (
    <div className="mt-3 rounded-2xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">Enviar un enlace</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="h-9 flex-1 rounded-xl border border-input bg-card px-3 text-sm" />
        <button
          disabled={!url.trim()}
          onClick={() => {
            onReady(clean(url.trim()));
            onClose();
          }}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-medium text-background disabled:opacity-50"
        >
          Preparar
        </button>
      </div>
    </div>
  );
}

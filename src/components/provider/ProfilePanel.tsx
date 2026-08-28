import { useRef, useState } from "react";
import { useApp } from "@/state/store";
import { Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { ExperienceImage } from "@/components/provider/ExperienceImage";
import { useImageSrc } from "@/hooks/useImageSrc";
import { processImageFile, ImageError } from "@/lib/imageProcess";
import { putImage, putImageRemote, deleteImage } from "@/lib/imageStore";
import { isSupabaseConfigured } from "@/lib/supabase";
import { applyProfilePatch, applyPreferencePatch } from "@/ai/tools";
import { displayPrice } from "@/lib/experience";
import { notify } from "@/state/toast";
import { formatUSD, monthName, cn } from "@/lib/utils";
import type { NotifyChannel, ProviderProfile, ProviderSocial } from "@/types/domain";
import {
  Pencil,
  Check,
  X,
  Mail,
  Phone,
  MessageCircle,
  MapPin,
  Globe,
  Instagram,
  Facebook,
  Music2,
  BadgeCheck,
  Clock3,
  Loader2,
  ImagePlus,
  Camera,
  Bell,
  Languages,
  ShieldCheck,
  User,
} from "lucide-react";

// ===========================================================================
// Public-facing provider profile (view) + inline editor + preferences.
// Everything here is also editable by the copilot via the update_profile /
// update_preferences tools — same store, same result.
// ===========================================================================

export function ProfilePanel() {
  const provider = useApp((s) => s.provider);
  const experiences = useApp((s) => s.experiences);
  const [editing, setEditing] = useState(false);

  if (!provider)
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
        <User className="mx-auto mb-2 h-8 w-8" />
        Inicia sesión para ver tu perfil.
      </div>
    );

  if (editing)
    return <ProfileEditor provider={provider} onClose={() => setEditing(false)} />;

  const since = (() => {
    const d = new Date(provider.created_at);
    return isNaN(d.getTime()) ? "" : `${monthName(d.getMonth())} ${d.getFullYear()}`;
  })();
  const published = experiences.filter((e) => e.publication_status === "published").length;
  const social = provider.social ?? {};

  return (
    <div className="grid gap-4">
      {/* Cover + identity */}
      <Card className="overflow-hidden">
        <Cover imageRef={provider.cover_url} />
        <div className="px-4 pb-4">
          <div className="-mt-9 flex items-end gap-3">
            <Avatar imageRef={provider.logo_url} name={provider.business_name} />
            <div className="mb-1 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="min-w-0 truncate font-display text-xl">{provider.business_name}</h2>
                {provider.verification_status === "approved" ? (
                  <Badge tone="success">
                    <BadgeCheck className="h-3 w-3" /> Verificado
                  </Badge>
                ) : (
                  <Badge tone="warning">
                    <Clock3 className="h-3 w-3" /> En verificación
                  </Badge>
                )}
              </div>
              {provider.tagline && (
                <p className="truncate text-sm text-muted-foreground">{provider.tagline}</p>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {provider.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {provider.city}
              </span>
            )}
            {since && <span>Miembro desde {since}</span>}
          </div>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> Editar perfil
          </Button>
        </div>
      </Card>

      {/* Bio */}
      {provider.bio && (
        <Card className="p-4">
          <h3 className="mb-1 text-sm font-medium">Sobre nosotros</h3>
          <p className="whitespace-pre-line text-sm text-muted-foreground">{provider.bio}</p>
        </Card>
      )}

      {/* Contact + languages */}
      <Card className="grid gap-2 p-4">
        <h3 className="text-sm font-medium">Contacto</h3>
        <ContactRow icon={<Mail className="h-4 w-4" />} value={provider.contact_email} empty="Sin correo" />
        <ContactRow icon={<Phone className="h-4 w-4" />} value={provider.contact_phone} empty="Sin teléfono" />
        <ContactRow
          icon={<MessageCircle className="h-4 w-4" />}
          value={provider.whatsapp}
          empty="Sin WhatsApp"
        />
        {(social.instagram || social.facebook || social.tiktok || social.website) && (
          <div className="mt-1 flex flex-wrap gap-2 border-t border-border pt-2">
            {social.instagram && <SocialChip icon={<Instagram className="h-3.5 w-3.5" />} text={social.instagram} />}
            {social.facebook && <SocialChip icon={<Facebook className="h-3.5 w-3.5" />} text={social.facebook} />}
            {social.tiktok && <SocialChip icon={<Music2 className="h-3.5 w-3.5" />} text={social.tiktok} />}
            {social.website && <SocialChip icon={<Globe className="h-3.5 w-3.5" />} text={social.website} />}
          </div>
        )}
        {provider.languages?.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
            <Languages className="h-3.5 w-3.5 text-muted-foreground" />
            {provider.languages.map((l) => (
              <span key={l} className="rounded-full bg-accent px-2 py-0.5 text-xs">
                {l}
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Experiencias</p>
          <p className="mt-1 font-display text-2xl">{experiences.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Publicadas</p>
          <p className="mt-1 font-display text-2xl">{published}</p>
        </Card>
      </div>

      {/* Experiences listed on the profile */}
      <Card className="p-4">
        <h3 className="mb-2 text-sm font-medium">Experiencias en el perfil</h3>
        {experiences.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no tienes experiencias. Crea una desde el chat o el panel de Experiencias.
          </p>
        ) : (
          <div className="grid gap-2">
            {experiences.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-xl border border-border p-2">
                <ExperienceImage
                  imageRef={e.featured_image}
                  alt={e.title}
                  className="h-12 w-12 shrink-0 rounded-lg"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.city || "Sin ubicación"} · {formatUSD(displayPrice(e).amount)}
                  </p>
                </div>
                <PubBadge status={e.publication_status} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <PreferencesPanel />
    </div>
  );
}

// ---- View helpers ----------------------------------------------------------

function Cover({ imageRef }: { imageRef?: string }) {
  const src = useImageSrc(imageRef);
  return (
    <div className="h-24 w-full bg-gradient-to-br from-primary/30 via-primary/10 to-accent">
      {src && <img src={src} alt="Portada" className="h-full w-full object-cover" />}
    </div>
  );
}

function Avatar({ imageRef, name }: { imageRef?: string; name: string }) {
  const src = useImageSrc(imageRef);
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-card bg-primary font-display text-2xl text-ink">
      {src ? <img src={src} alt={name} className="h-full w-full object-cover" /> : name.charAt(0).toUpperCase()}
    </div>
  );
}

function ContactRow({ icon, value, empty }: { icon: React.ReactNode; value?: string; empty: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      {value ? <span>{value}</span> : <span className="text-muted-foreground/60">{empty}</span>}
    </div>
  );
}

function SocialChip({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs">
      {icon} {text}
    </span>
  );
}

function PubBadge({ status }: { status: ProviderProfile["verification_status"] | string }) {
  const map: Record<string, { tone: any; label: string }> = {
    draft: { tone: "neutral", label: "Borrador" },
    pending_review: { tone: "warning", label: "En revisión" },
    published: { tone: "success", label: "Publicada" },
    rejected: { tone: "danger", label: "Rechazada" },
  };
  const v = map[status] ?? { tone: "neutral", label: status };
  return <Badge tone={v.tone}>{v.label}</Badge>;
}

// ===========================================================================
// Profile editor
// ===========================================================================

function ProfileEditor({ provider, onClose }: { provider: ProviderProfile; onClose: () => void }) {
  const [d, setD] = useState<ProviderProfile>(provider);
  const social = d.social ?? {};
  const set = <K extends keyof ProviderProfile>(k: K, v: ProviderProfile[K]) =>
    setD((p) => ({ ...p, [k]: v }));
  const setSocial = (k: keyof ProviderSocial, v: string) =>
    setD((p) => ({ ...p, social: { ...(p.social ?? {}), [k]: v || undefined } }));

  function save() {
    const res = applyProfilePatch({
      business_name: d.business_name,
      tagline: d.tagline,
      bio: d.bio,
      contact_email: d.contact_email,
      contact_phone: d.contact_phone,
      whatsapp: d.whatsapp,
      city: d.city,
      languages: d.languages,
      logo_url: d.logo_url,
      cover_url: d.cover_url,
      social: d.social,
    });
    notify(
      res.ok ? (res.changes?.length ? res.message : "Sin cambios que guardar.") : res.message,
      res.ok ? "success" : "warning"
    );
    onClose();
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <User className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Editar perfil</span>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="ml-auto rounded-full p-1 text-muted-foreground hover:bg-accent"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 p-4">
        {/* Images */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Logo del negocio</Label>
            <SingleImage
              value={d.logo_url}
              onChange={(ref) => set("logo_url", ref)}
              rounded
              hint="Cuadrado, se ve como avatar"
            />
          </div>
          <div>
            <Label>Portada</Label>
            <SingleImage
              value={d.cover_url}
              onChange={(ref) => set("cover_url", ref)}
              hint="Banner del perfil"
            />
          </div>
        </div>

        <div>
          <Label>Nombre del negocio</Label>
          <Input value={d.business_name} onChange={(e) => set("business_name", e.target.value)} />
        </div>
        <div>
          <Label>Eslogan</Label>
          <Input
            value={d.tagline ?? ""}
            placeholder="Ej. Café de altura y naturaleza en Ataco"
            onChange={(e) => set("tagline", e.target.value)}
          />
        </div>
        <div>
          <Label>Sobre nosotros</Label>
          <Textarea
            rows={4}
            value={d.bio ?? ""}
            placeholder="Quiénes son, qué hacen, qué los hace especiales…"
            onChange={(e) => set("bio", e.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="inline-flex items-center gap-1">
              <Mail className="h-3 w-3" /> Correo de contacto
            </Label>
            <Input
              type="email"
              value={d.contact_email ?? ""}
              onChange={(e) => set("contact_email", e.target.value)}
            />
          </div>
          <div>
            <Label className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Ciudad / zona
            </Label>
            <Input value={d.city ?? ""} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div>
            <Label className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3" /> Teléfono
            </Label>
            <Input value={d.contact_phone ?? ""} onChange={(e) => set("contact_phone", e.target.value)} />
          </div>
          <div>
            <Label className="inline-flex items-center gap-1">
              <MessageCircle className="h-3 w-3" /> WhatsApp
            </Label>
            <Input value={d.whatsapp ?? ""} onChange={(e) => set("whatsapp", e.target.value)} />
          </div>
        </div>

        <div>
          <Label className="inline-flex items-center gap-1">
            <Languages className="h-3 w-3" /> Idiomas (separados por coma)
          </Label>
          <Input
            value={(d.languages ?? []).join(", ")}
            placeholder="Español, Inglés"
            onChange={(e) =>
              set(
                "languages",
                e.target.value
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean)
              )
            }
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="inline-flex items-center gap-1">
              <Instagram className="h-3 w-3" /> Instagram
            </Label>
            <Input value={social.instagram ?? ""} onChange={(e) => setSocial("instagram", e.target.value)} />
          </div>
          <div>
            <Label className="inline-flex items-center gap-1">
              <Facebook className="h-3 w-3" /> Facebook
            </Label>
            <Input value={social.facebook ?? ""} onChange={(e) => setSocial("facebook", e.target.value)} />
          </div>
          <div>
            <Label className="inline-flex items-center gap-1">
              <Music2 className="h-3 w-3" /> TikTok
            </Label>
            <Input value={social.tiktok ?? ""} onChange={(e) => setSocial("tiktok", e.target.value)} />
          </div>
          <div>
            <Label className="inline-flex items-center gap-1">
              <Globe className="h-3 w-3" /> Sitio web
            </Label>
            <Input value={social.website ?? ""} onChange={(e) => setSocial("website", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border p-4">
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={save} disabled={!d.business_name.trim()}>
          <Check className="h-4 w-4" /> Guardar
        </Button>
      </div>
    </Card>
  );
}

function SingleImage({
  value,
  onChange,
  rounded,
  hint,
}: {
  value?: string;
  onChange: (ref: string | undefined) => void;
  rounded?: boolean;
  hint?: string;
}) {
  const src = useImageSrc(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { blob } = await processImageFile(file);
      const ref = isSupabaseConfigured ? await putImageRemote(blob) : await putImage(blob);
      if (value) void deleteImage(value);
      onChange(ref);
    } catch (e) {
      notify(e instanceof ImageError ? e.message : "No se pudo subir la imagen.", "warning");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="mt-1">
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden border border-border bg-muted",
          rounded ? "h-24 w-24 rounded-2xl" : "h-24 w-full rounded-xl"
        )}
      >
        {src ? (
          <img src={src} alt="Imagen" className="h-full w-full object-cover" />
        ) : (
          <Camera className="h-6 w-6 text-muted-foreground" />
        )}
        {value && (
          <button
            type="button"
            onClick={() => {
              void deleteImage(value);
              onChange(undefined);
            }}
            aria-label="Quitar imagen"
            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition hover:bg-accent disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
        {value ? "Cambiar" : "Subir"}
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files)} />
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ===========================================================================
// Preferences (also rendered standalone as a chat block)
// ===========================================================================

export function PreferencesPanel() {
  const provider = useApp((s) => s.provider);
  if (!provider) return null;
  const p = provider.preferences;

  function toggle(key: keyof typeof p, value: boolean) {
    const res = applyPreferencePatch({ [key]: value } as any);
    if (res.changes?.length) notify(res.message);
  }
  function setChannel(v: NotifyChannel) {
    const res = applyPreferencePatch({ notify_channel: v });
    if (res.changes?.length) notify(res.message);
  }
  function setLanguage(v: "es" | "en") {
    const res = applyPreferencePatch({ language: v });
    if (res.changes?.length) notify(res.message);
  }

  return (
    <Card className="grid gap-1 p-4">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-medium">
        <Bell className="h-4 w-4 text-primary" /> Preferencias
      </h3>

      <ToggleRow
        icon={<ShieldCheck className="h-4 w-4" />}
        title="Aprobar reservas automáticamente"
        desc={
          p.auto_approve_bookings
            ? "Reserva instantánea: el turista reserva y se confirma al momento."
            : "Solicitud de reserva: cada reserva espera tu aprobación."
        }
        checked={p.auto_approve_bookings}
        onChange={(v) => toggle("auto_approve_bookings", v)}
      />
      <ToggleRow
        icon={<Bell className="h-4 w-4" />}
        title="Aviso de reservas nuevas"
        desc="Te notificamos cuando entre una reserva."
        checked={p.notify_new_booking}
        onChange={(v) => toggle("notify_new_booking", v)}
      />
      <ToggleRow
        icon={<Bell className="h-4 w-4" />}
        title="Aviso de cancelaciones"
        desc="Te avisamos si un turista cancela."
        checked={p.notify_cancellation}
        onChange={(v) => toggle("notify_cancellation", v)}
      />
      <ToggleRow
        icon={<Clock3 className="h-4 w-4" />}
        title="Resumen diario"
        desc="Un resumen con las salidas y reservas del día."
        checked={p.notify_daily_summary}
        onChange={(v) => toggle("notify_daily_summary", v)}
      />

      <div className="mt-2 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Canal de avisos</span>
          <select
            value={p.notify_channel}
            onChange={(e) => setChannel(e.target.value as NotifyChannel)}
            className="h-9 w-full rounded-xl border border-input bg-card px-3 text-sm"
          >
            <option value="email">Correo</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="both">Ambos</option>
            <option value="none">Ninguno</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Idioma del asistente</span>
          <select
            value={p.language}
            onChange={(e) => setLanguage(e.target.value as "es" | "en")}
            className="h-9 w-full rounded-xl border border-input bg-card px-3 text-sm"
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>
    </Card>
  );
}

function ToggleRow({
  icon,
  title,
  desc,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border py-2.5 last:border-0">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition",
          checked ? "bg-primary" : "bg-muted"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-all",
            checked ? "left-[22px]" : "left-0.5"
          )}
        />
      </button>
    </div>
  );
}

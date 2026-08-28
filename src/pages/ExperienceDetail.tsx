import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { usePublishedExperience } from "@/hooks/usePublicData";
import type { PublicExperience } from "@/data/repo";
import { ExperienceImage } from "@/components/provider/ExperienceImage";
import { BookingSheet } from "@/components/tourist/BookingSheet";
import { TouristHeader, BackLink } from "@/components/tourist/TouristChrome";
import { Button } from "@/components/ui/button";
import { useImageSrc } from "@/hooks/useImageSrc";
import { bookableDepartures, bookableDates } from "@/lib/availability";
import { displayPrice } from "@/lib/experience";
import { formatUSD, parseISODate, dayName, monthName, cn } from "@/lib/utils";
import {
  MapPin,
  Clock,
  Users,
  Languages,
  BadgeCheck,
  Check,
  X,
  Backpack,
  Sparkles,
  CalendarDays,
  Timer,
  ChevronLeft,
  ChevronRight,
  Star,
} from "lucide-react";

function fmtDate(iso: string): string {
  const d = parseISODate(iso);
  const dn = dayName(d.getDay()).slice(0, 3);
  return `${dn.charAt(0).toUpperCase()}${dn.slice(1)} ${d.getDate()} ${monthName(d.getMonth()).slice(0, 3)}`;
}
function deadlineText(h: number): string {
  if (!h) return "Reserva hasta el mismo día";
  if (h % 24 === 0) return `Reserva con ${h / 24} día${h / 24 === 1 ? "" : "s"} de anticipación`;
  return `Reserva con ${h}h de anticipación`;
}

export default function ExperienceDetail() {
  const { id } = useParams();
  const { data: exp, loading } = usePublishedExperience(id);
  const [sheet, setSheet] = useState<{ open: boolean; date?: string }>({ open: false });

  if (loading)
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );

  if (!exp)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-ink">
          <Sparkles className="h-6 w-6" />
        </div>
        <p className="font-display text-xl">Experiencia no disponible</p>
        <Link to="/">
          <Button variant="outline">Explorar experiencias</Button>
        </Link>
      </div>
    );

  const price = displayPrice(exp);
  const deps = bookableDepartures(exp);
  const dates = bookableDates(deps).slice(0, 10);
  const verified = exp.provider?.verification_status === "approved";

  return (
    <div className="min-h-dvh bg-background pb-28">
      <TouristHeader />

      <main className="mx-auto max-w-5xl px-5 py-6 sm:px-8">
        <BackLink className="mb-4" />

        <Gallery images={exp.image_urls} featured={exp.featured_image} title={exp.title} />

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
          {/* Left: all the details */}
          <div>
            <h1 className="font-display text-3xl tracking-tight sm:text-4xl">{exp.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {(exp.city || exp.area) && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" /> {[exp.area, exp.city].filter(Boolean).join(", ")}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> {exp.duration_hours}h
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4" /> {exp.min_capacity}–{exp.max_capacity} personas
              </span>
              {exp.languages?.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Languages className="h-4 w-4" /> {exp.languages.join(", ")}
                </span>
              )}
            </div>

            {/* Provider */}
            {exp.provider && <ProviderStrip provider={exp.provider} verified={verified} />}

            {exp.description && (
              <p className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">
                {exp.description}
              </p>
            )}

            <ListSection icon={<Sparkles className="h-4 w-4 text-primary" />} title="Lo que vivirás" items={exp.highlights} />
            <ListSection icon={<Check className="h-4 w-4 text-emerald-600" />} title="Incluye" items={exp.whats_included} />
            <ListSection icon={<X className="h-4 w-4 text-muted-foreground" />} title="No incluye" items={exp.whats_not_included} muted />
            <ListSection icon={<Backpack className="h-4 w-4 text-primary" />} title="Qué llevar" items={exp.what_to_bring} />

            {/* Meeting point + map */}
            <MeetingPoint exp={exp} />

            {/* Reviews (placeholder until the review system ships) */}
            <Reviews />

            {/* Policy — trust */}
            <section className="mt-8 grid gap-2 rounded-2xl border border-border p-4 sm:grid-cols-2">
              <Trust icon={<Timer className="h-4 w-4" />} text={deadlineText(exp.registration_deadline_hours)} />
              <Trust icon={<BadgeCheck className="h-4 w-4" />} text={verified ? "Proveedor verificado por Akiles" : "En proceso de verificación"} />
              <Trust icon={<Users className="h-4 w-4" />} text={`Grupos de ${exp.min_capacity} a ${exp.max_capacity} personas`} />
              <Trust icon={<Clock className="h-4 w-4" />} text={`Duración ${exp.duration_hours} horas`} />
            </section>
          </div>

          {/* Right: booking card (sticky on desktop) */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-3xl border border-border p-5 shadow-sm">
              <div className="flex items-baseline gap-1">
                {price.from && <span className="text-sm text-muted-foreground">desde</span>}
                <span className="font-display text-3xl">{formatUSD(price.amount)}</span>
                <span className="text-sm text-muted-foreground">/ persona</span>
              </div>

              {dates.length > 0 ? (
                <>
                  <p className="mt-4 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    Próxima fecha: <span className="font-medium text-foreground">{fmtDate(dates[0])}</span>
                  </p>
                  <Button size="lg" className="mt-4 w-full" onClick={() => setSheet({ open: true })}>
                    Ver fechas y reservar
                  </Button>
                </>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  Sin fechas disponibles por ahora. Vuelve pronto.
                </p>
              )}
            </div>
          </aside>
        </div>
      </main>

      {/* Sticky mobile reserve bar */}
      <div className="safe-b fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg leading-none">
              {price.from ? "desde " : ""}
              {formatUSD(price.amount)}
            </p>
            <p className="text-xs text-muted-foreground">por persona</p>
          </div>
          <Button size="lg" disabled={dates.length === 0} onClick={() => setSheet({ open: true })}>
            Reservar
          </Button>
        </div>
      </div>

      <BookingSheet
        experience={exp}
        open={sheet.open}
        onClose={() => setSheet({ open: false })}
        initialDate={sheet.date}
      />
    </div>
  );
}

function Gallery({ images, featured, title }: { images: string[]; featured?: string; title: string }) {
  const all = images?.length ? images : featured ? [featured] : [];
  const [i, setI] = useState(0);
  const main = all[i] ?? featured;

  return (
    <div>
      <div className="relative overflow-hidden rounded-3xl bg-muted">
        <ExperienceImage imageRef={main} alt={title} className="aspect-[16/10] w-full sm:aspect-[16/9]" />
        {all.length > 1 && (
          <>
            <GalleryNav side="left" onClick={() => setI((p) => (p - 1 + all.length) % all.length)} />
            <GalleryNav side="right" onClick={() => setI((p) => (p + 1) % all.length)} />
            <span className="absolute bottom-3 right-3 rounded-full bg-black/50 px-2.5 py-0.5 text-xs text-white">
              {i + 1} / {all.length}
            </span>
          </>
        )}
      </div>
      {all.length > 1 && (
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
          {all.map((ref, idx) => (
            <button
              key={ref}
              onClick={() => setI(idx)}
              className={cn(
                "shrink-0 overflow-hidden rounded-xl border-2 transition",
                idx === i ? "border-ink" : "border-transparent opacity-70 hover:opacity-100"
              )}
            >
              <ExperienceImage imageRef={ref} alt="" className="h-16 w-20" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GalleryNav({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={onClick}
      aria-label={side === "left" ? "Anterior" : "Siguiente"}
      className={cn(
        "absolute top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 shadow backdrop-blur transition hover:bg-background",
        side === "left" ? "left-3" : "right-3"
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

function ProviderStrip({
  provider,
  verified,
}: {
  provider: NonNullable<import("@/data/repo").PublicExperience["provider"]>;
  verified: boolean;
}) {
  const logo = useImageSrc(provider.logo_url);
  return (
    <Link
      to={`/p/${provider.id}`}
      className="mt-5 flex items-center gap-3 rounded-2xl border border-border p-3 transition hover:bg-accent"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary font-display text-lg text-ink">
        {logo ? (
          <img src={logo} alt={provider.business_name} className="h-full w-full object-cover" />
        ) : (
          provider.business_name.charAt(0).toUpperCase()
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium">{provider.business_name}</span>
          {verified && <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />}
        </div>
        {provider.tagline && (
          <p className="truncate text-xs text-muted-foreground">{provider.tagline}</p>
        )}
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function ListSection({
  icon,
  title,
  items,
  muted,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  muted?: boolean;
}) {
  if (!items?.length) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-2 font-display text-xl">{title}</h2>
      <ul className="grid gap-1.5">
        {items.map((it, idx) => (
          <li key={idx} className={cn("flex items-start gap-2 text-[15px]", muted && "text-muted-foreground")}>
            <span className="mt-0.5">{icon}</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Trust({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-primary">{icon}</span>
      <span className="text-muted-foreground">{text}</span>
    </div>
  );
}

function isLink(s?: string): boolean {
  return !!s && /^(https?:\/\/|www\.)/i.test(s.trim());
}
function ensureHttp(u: string): string {
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

/** Pull lat,lng out of a full Maps URL (@lat,lng / q= / !3d!4d) or bare coords. */
function parseLatLng(input?: string): { lat: number; lng: number } | null {
  if (!input) return null;
  const s = decodeURIComponent(input.trim());
  const patterns = [
    /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
    /[?&](?:q|query|ll|center|destination|daddr)=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/i,
    /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,
    /^\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

function MeetingPoint({ exp }: { exp: PublicExperience }) {
  const mp = exp.location_address?.trim();
  const coords = parseLatLng(mp);
  const link = isLink(mp) ? ensureHttp(mp!) : undefined;
  const written = mp && !link && !coords ? mp : "";

  const cityLabel = [exp.area, exp.city].filter(Boolean).join(", ");
  const label =
    written || cityLabel || (coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : "");

  // Exact pin when we have coordinates; otherwise search by the written address
  // or the city. Short goo.gl links can't be pinned in-frame — the button opens
  // the exact spot instead.
  const embedSrc = coords
    ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}&z=16&output=embed`
    : `https://www.google.com/maps?q=${encodeURIComponent(
        written || cityLabel || "El Salvador"
      )}&output=embed`;
  const openHref =
    link ??
    (coords
      ? `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          written || cityLabel || "El Salvador"
        )}`);

  return (
    <section className="mt-8">
      <h2 className="mb-2 font-display text-xl">Punto de encuentro</h2>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <MapPin className="h-4 w-4 text-primary" />
        {label || "El proveedor compartirá el punto exacto al confirmar."}
      </p>

      <div className="mt-3 overflow-hidden rounded-2xl border border-border">
        <iframe
          title="Mapa del punto de encuentro"
          src={embedSrc}
          className="h-56 w-full"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>

      <a
        href={openHref}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm transition hover:bg-accent"
      >
        <MapPin className="h-4 w-4 text-primary" /> {link ? "Abrir ubicación" : "Ver en Google Maps"}
      </a>
    </section>
  );
}

function Reviews() {
  return (
    <section className="mt-8">
      <h2 className="mb-2 font-display text-xl">Reseñas</h2>
      <div className="flex items-center gap-3 rounded-2xl border border-border p-4">
        <div className="flex">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} className="h-4 w-4 text-muted-foreground/35" />
          ))}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">Aún sin reseñas</p>
          <p className="text-xs text-muted-foreground">
            Las reseñas verificadas aparecerán después de las primeras reservas.
          </p>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-ink">
          Nuevo
        </span>
      </div>
    </section>
  );
}

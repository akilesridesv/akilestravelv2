import { useParams, Link } from "react-router-dom";
import { useProviderPublic } from "@/hooks/usePublicData";
import { ExperienceCard } from "@/components/tourist/ExperienceCard";
import { TouristHeader, TouristFooter } from "@/components/tourist/TouristChrome";
import { Button } from "@/components/ui/button";
import { useImageSrc } from "@/hooks/useImageSrc";
import {
  BadgeCheck,
  MapPin,
  Mail,
  Phone,
  MessageCircle,
  Globe,
  Instagram,
  Facebook,
  Music2,
  Languages,
  Sparkles,
  ChevronLeft,
} from "lucide-react";

export default function ProviderPublic() {
  const { id } = useParams();
  const { data, loading } = useProviderPublic(id);

  if (loading)
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );

  if (!data)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-ink">
          <Sparkles className="h-6 w-6" />
        </div>
        <p className="font-display text-xl">Proveedor no disponible</p>
        <Link to="/">
          <Button variant="outline">Explorar experiencias</Button>
        </Link>
      </div>
    );

  const { provider, experiences } = data;
  const verified = provider.verification_status === "approved";
  const social = provider.social ?? {};

  return (
    <div className="min-h-dvh bg-background">
      <TouristHeader />
      <Cover imageRef={provider.cover_url} />

      <main className="mx-auto max-w-5xl px-5 sm:px-8">
        <Link
          to="/"
          className="mt-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Explorar
        </Link>

        <div className="-mt-2 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Logo imageRef={provider.logo_url} name={provider.business_name} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl tracking-tight sm:text-3xl">{provider.business_name}</h1>
              {verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-ink">
                  <BadgeCheck className="h-3.5 w-3.5 text-primary" /> Verificado
                </span>
              )}
            </div>
            {provider.tagline && <p className="mt-1 text-muted-foreground">{provider.tagline}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {provider.city && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {provider.city}
                </span>
              )}
              {provider.languages?.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Languages className="h-3.5 w-3.5" /> {provider.languages.join(", ")}
                </span>
              )}
            </div>
          </div>
        </div>

        {provider.bio && (
          <p className="mt-5 max-w-2xl whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">
            {provider.bio}
          </p>
        )}

        {/* Contact & social */}
        <div className="mt-5 flex flex-wrap gap-2">
          {provider.whatsapp && (
            <Chip href={`https://wa.me/${provider.whatsapp.replace(/[^\d]/g, "")}`} icon={<MessageCircle className="h-4 w-4" />}>
              WhatsApp
            </Chip>
          )}
          {provider.contact_email && (
            <Chip href={`mailto:${provider.contact_email}`} icon={<Mail className="h-4 w-4" />}>
              Correo
            </Chip>
          )}
          {provider.contact_phone && (
            <Chip href={`tel:${provider.contact_phone}`} icon={<Phone className="h-4 w-4" />}>
              {provider.contact_phone}
            </Chip>
          )}
          {social.instagram && <Chip icon={<Instagram className="h-4 w-4" />}>{social.instagram}</Chip>}
          {social.facebook && <Chip icon={<Facebook className="h-4 w-4" />}>{social.facebook}</Chip>}
          {social.tiktok && <Chip icon={<Music2 className="h-4 w-4" />}>{social.tiktok}</Chip>}
          {social.website && (
            <Chip href={ensureHttp(social.website)} icon={<Globe className="h-4 w-4" />}>
              Sitio web
            </Chip>
          )}
        </div>

        {/* Experiences */}
        <section className="mt-10">
          <h2 className="mb-4 font-display text-xl">
            Experiencias ({experiences.length})
          </h2>
          {experiences.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Este proveedor aún no tiene experiencias publicadas.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3">
              {experiences.map((e) => (
                <ExperienceCard key={e.id} e={e} />
              ))}
            </div>
          )}
        </section>
      </main>

      <TouristFooter />
    </div>
  );
}

function ensureHttp(url: string): string {
  return /^https?:\/\//.test(url) ? url : `https://${url}`;
}

function Cover({ imageRef }: { imageRef?: string }) {
  const src = useImageSrc(imageRef);
  return (
    <div className="h-40 w-full bg-gradient-to-br from-primary/30 via-primary/10 to-accent sm:h-56">
      {src && <img src={src} alt="Portada" className="h-full w-full object-cover" />}
    </div>
  );
}

function Logo({ imageRef, name }: { imageRef?: string; name: string }) {
  const src = useImageSrc(imageRef);
  return (
    <div className="-mt-12 flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border-4 border-background bg-primary font-display text-4xl text-ink">
      {src ? <img src={src} alt={name} className="h-full w-full object-cover" /> : name.charAt(0).toUpperCase()}
    </div>
  );
}

function Chip({
  href,
  icon,
  children,
}: {
  href?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const cls =
    "inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm transition hover:bg-accent";
  if (href)
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {icon} {children}
      </a>
    );
  return (
    <span className={cls}>
      {icon} {children}
    </span>
  );
}

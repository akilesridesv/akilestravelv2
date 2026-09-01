import { Link } from "react-router-dom";
import type { PublicExperience } from "@/data/repo";
import type { Shelf } from "@/ai/shelves";
import { ExperienceImage } from "@/components/provider/ExperienceImage";
import { VerifiedTag } from "@/components/tourist/TouristChrome";
import { displayPrice } from "@/lib/experience";
import { formatUSD, cn } from "@/lib/utils";
import { MapPin, Clock, ChevronRight } from "lucide-react";

/**
 * Netflix-style "cartelera": a billboard hero + themed horizontal rails.
 * Shelf titles are AI-generated from the catalog (see src/ai/shelves.ts).
 */
export function Cartelera({
  list,
  shelves,
  params = "",
}: {
  list: PublicExperience[];
  shelves: Shelf[];
  params?: string;
}) {
  const byId = new Map(list.map((e) => [e.id, e]));
  const hero = list[0];

  return (
    <div className="pb-4">
      {hero && <Billboard e={hero} params={params} />}
      <div className="mt-8 flex flex-col gap-9">
        {shelves.map((shelf, i) => {
          const items = shelf.ids.map((id) => byId.get(id)).filter(Boolean) as PublicExperience[];
          if (!items.length) return null;
          return <ShelfRail key={`${shelf.title}-${i}`} title={shelf.title} items={items} params={params} />;
        })}
      </div>
    </div>
  );
}

/** Cinematic top banner featuring one experience. */
function Billboard({ e, params }: { e: PublicExperience; params: string }) {
  const price = displayPrice(e);
  const verified = e.provider?.verification_status === "approved";
  const place = [e.city, e.department].filter(Boolean).join(", ");
  return (
    <Link
      to={`/e/${e.id}${params}`}
      className="group relative block overflow-hidden rounded-3xl bg-muted"
    >
      <ExperienceImage
        imageRef={e.featured_image}
        alt={e.title}
        className="aspect-[16/10] w-full transition-transform duration-700 ease-out group-hover:scale-[1.03] sm:aspect-[21/9]"
      />
      {/* Legibility scrim — darker at the bottom-left where the copy sits. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-8">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {e.category && (
            <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-ink">
              {e.category}
            </span>
          )}
          {verified && <VerifiedTag />}
        </div>
        <h2 className="max-w-2xl font-display text-2xl leading-tight tracking-tight drop-shadow sm:text-4xl">
          {e.title}
        </h2>
        {e.description && (
          <p className="mt-2 line-clamp-2 max-w-xl text-sm text-white/85 max-sm:hidden">
            {e.description.length > 160 ? e.description.slice(0, 158).trimEnd() + "…" : e.description}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-ink transition group-hover:opacity-90">
            Ver experiencia <ChevronRight className="h-4 w-4" />
          </span>
          <span className="text-sm text-white/90">
            {price.from ? "desde " : ""}
            <b className="font-display text-base">{formatUSD(price.amount)}</b> / persona
          </span>
          {place && (
            <span className="inline-flex items-center gap-1 text-sm text-white/80">
              <MapPin className="h-3.5 w-3.5" /> {place}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/** One themed row: title + horizontally scrollable poster cards. */
function ShelfRail({
  title,
  items,
  params,
}: {
  title: string;
  items: PublicExperience[];
  params: string;
}) {
  return (
    <section>
      <h2 className="mb-3 font-display text-xl tracking-tight sm:text-2xl">{title}</h2>
      <div className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0">
        {items.map((e) => (
          <PosterCard key={e.id} e={e} params={params} />
        ))}
      </div>
    </section>
  );
}

/** Landscape "poster" card for the rails (distinct from the portrait grid card). */
function PosterCard({ e, params }: { e: PublicExperience; params: string }) {
  const price = displayPrice(e);
  const verified = e.provider?.verification_status === "approved";
  return (
    <Link
      to={`/e/${e.id}${params}`}
      className="group w-64 shrink-0 snap-start sm:w-72"
    >
      <div className="relative overflow-hidden rounded-2xl bg-muted">
        <ExperienceImage
          imageRef={e.featured_image}
          alt={e.title}
          className="aspect-[16/10] w-full transition-transform duration-500 ease-out group-hover:scale-[1.06]"
        />
        {verified && <VerifiedTag className="absolute left-2.5 top-2.5" />}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3 text-white">
          <h3 className="line-clamp-2 font-display text-base leading-tight drop-shadow">{e.title}</h3>
          <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-xs font-medium backdrop-blur">
            {price.from ? "desde " : ""}
            {formatUSD(price.amount)}
          </span>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 px-0.5 text-sm text-muted-foreground">
        {e.city && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> {e.city}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" /> {e.duration_hours}h
        </span>
      </div>
    </Link>
  );
}

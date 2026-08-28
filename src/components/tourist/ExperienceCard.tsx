import { Link } from "react-router-dom";
import type { PublicExperience } from "@/data/repo";
import { ExperienceImage } from "@/components/provider/ExperienceImage";
import { VerifiedTag } from "@/components/tourist/TouristChrome";
import { displayPrice } from "@/lib/experience";
import { formatUSD } from "@/lib/utils";
import { MapPin, Clock } from "lucide-react";

/** Apple-minimal experience card: photo-first, quiet type, clear price. */
export function ExperienceCard({ e, params = "" }: { e: PublicExperience; params?: string }) {
  const price = displayPrice(e);
  const verified = e.provider?.verification_status === "approved";

  return (
    <Link to={`/e/${e.id}${params}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-muted">
        <ExperienceImage
          imageRef={e.featured_image}
          alt={e.title}
          className="h-full w-full transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
        {verified && <VerifiedTag className="absolute left-3 top-3" />}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/45 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2 text-white">
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium backdrop-blur">
            {price.from ? "desde " : ""}
            {formatUSD(price.amount)}
          </span>
        </div>
      </div>
      <div className="mt-3 px-0.5">
        <h3 className="line-clamp-1 font-display text-lg leading-tight tracking-tight">{e.title}</h3>
        <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
          {e.city && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {e.city}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {e.duration_hours}h
          </span>
        </div>
      </div>
    </Link>
  );
}

import { useParams, Link } from "react-router-dom";
import { useApp } from "@/state/store";
import { ExperienceImage } from "@/components/provider/ExperienceImage";
import { Button } from "@/components/ui/button";
import { Card, Badge } from "@/components/ui/card";
import { displayPrice } from "@/lib/experience";
import { formatUSD, dayName } from "@/lib/utils";
import { MapPin, Clock, Users, CalendarDays, Ticket, Sparkles } from "lucide-react";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/**
 * Public booking view reached from a shared link (/e/:id). Read-only preview of
 * the experience with a "Reservar" CTA. (Local store today; real data once the
 * tourist side is wired.)
 */
export default function PublicExperience() {
  const { id } = useParams();
  const exp = useApp((s) => s.experiences.find((e) => e.id === id));

  if (!exp)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-ink">
          <Sparkles className="h-6 w-6" />
        </div>
        <p className="font-display text-xl">Experiencia no disponible</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Este enlace no está disponible en este dispositivo todavía.
        </p>
        <Link to="/">
          <Button variant="outline">Ir a Akiles Travel</Button>
        </Link>
      </div>
    );

  const price = displayPrice(exp);
  const days = [...new Set(exp.schedules.map((s) => s.day_of_week))].sort(
    (a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)
  );

  return (
    <div className="min-h-dvh bg-background pb-24">
      <header className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-display text-ink">
            A
          </div>
          <span className="font-display text-lg">Akiles Travel</span>
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-4">
        <ExperienceImage
          imageRef={exp.featured_image}
          alt={exp.title}
          className="h-56 w-full rounded-2xl sm:h-72"
        />

        <div className="mt-4 flex items-start justify-between gap-3">
          <h1 className="font-display text-2xl sm:text-3xl">{exp.title}</h1>
          <div className="shrink-0 text-right leading-tight">
            {price.from && <span className="block text-xs text-muted-foreground">desde</span>}
            <span className="font-display text-2xl">{formatUSD(price.amount)}</span>
            <span className="block text-xs text-muted-foreground">por persona</span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {exp.city && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-4 w-4" /> {exp.city}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Clock className="h-4 w-4" /> {exp.duration_hours}h
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-4 w-4" /> hasta {exp.max_capacity}
          </span>
          {days.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-4 w-4" />
              {days.map((d) => dayName(d).slice(0, 3)).join(", ")}
            </span>
          )}
        </div>

        {exp.description && (
          <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed">{exp.description}</p>
        )}

        {exp.tiers.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 inline-flex items-center gap-2 font-display text-lg">
              <Ticket className="h-4 w-4 text-primary" /> Opciones
            </h2>
            <div className="grid gap-2">
              {exp.tiers.map((t) => (
                <Card key={t.id} className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium">{t.tier_name || "Opción"}</p>
                    {t.description && (
                      <p className="mt-0.5 text-sm text-muted-foreground">{t.description}</p>
                    )}
                  </div>
                  <span className="shrink-0 font-display text-lg">{formatUSD(t.price)}</span>
                </Card>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Sticky booking bar */}
      <div className="safe-b fixed inset-x-0 bottom-0 border-t border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg leading-none">
              {price.from ? "desde " : ""}
              {formatUSD(price.amount)}
            </p>
            <p className="text-xs text-muted-foreground">por persona</p>
          </div>
          <Button
            size="lg"
            onClick={() =>
              alert("La reserva del lado turista llega pronto. ¡Gracias por tu interés!")
            }
          >
            Reservar
          </Button>
        </div>
      </div>
    </div>
  );
}

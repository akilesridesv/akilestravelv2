import * as React from "react";
import { useApp } from "@/state/store";
import { Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatUSD, dayName } from "@/lib/utils";
import type { Booking, PublicationStatus } from "@/types/domain";
import {
  CalendarDays,
  Check,
  X,
  Clock,
  Users,
  MapPin,
  Inbox,
  TrendingUp,
} from "lucide-react";

function statusBadge(s: PublicationStatus) {
  const map = {
    draft: { tone: "neutral" as const, label: "Borrador" },
    pending_review: { tone: "warning" as const, label: "En revisión" },
    published: { tone: "success" as const, label: "Publicada" },
    rejected: { tone: "danger" as const, label: "Rechazada" },
  };
  const v = map[s];
  return <Badge tone={v.tone}>{v.label}</Badge>;
}

function EmptyState({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      <div className="mb-3 text-muted-foreground">{icon}</div>
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

// --------------------------------------------------------------------------

export function ExperiencesPanel() {
  const experiences = useApp((s) => s.experiences);

  if (!experiences.length)
    return (
      <EmptyState
        icon={<Inbox className="h-8 w-8" />}
        title="Aún no tienes experiencias"
        hint="Describe tu experiencia en el copiloto y créala en segundos: “Tour de café en Ataco, 3h, $35, martes y jueves 9am, máx 8”."
      />
    );

  return (
    <div className="grid gap-3">
      {experiences.map((e) => (
        <Card key={e.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate font-display text-lg">{e.title}</h3>
                {statusBadge(e.publication_status)}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {e.city || "Sin ubicación"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {e.duration_hours}h
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> hasta {e.max_capacity}
                </span>
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {e.schedules.length
                    ? e.schedules.map((s) => dayName(s.day_of_week).slice(0, 3)).join(", ")
                    : "sin salidas"}
                </span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-display text-xl">{formatUSD(e.price_per_person)}</p>
              <p className="text-xs text-muted-foreground">por persona</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------

export function BookingsPanel({ compact = false }: { compact?: boolean }) {
  const bookings = useApp((s) => s.bookings);
  const setStatus = useApp((s) => s.setBookingStatus);

  if (!bookings.length)
    return (
      <EmptyState
        icon={<CalendarDays className="h-8 w-8" />}
        title="Sin reservas todavía"
        hint="Cuando un turista reserve una de tus experiencias, aparecerá aquí para que la gestiones."
      />
    );

  const order: Booking["booking_status"][] = ["pending_approval", "confirmed", "completed"];
  const sorted = [...bookings].sort(
    (a, b) => order.indexOf(a.booking_status) - order.indexOf(b.booking_status)
  );

  return (
    <div className="grid gap-3">
      {sorted.map((b) => (
        <Card key={b.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate font-medium">{b.contact_name}</h3>
                <BookingBadge status={b.booking_status} />
              </div>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{b.experience_title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {b.number_of_people} pers · {b.scheduled_date} {b.scheduled_time} · {formatUSD(b.total_paid)}
              </p>
            </div>
          </div>
          {!compact && b.booking_status === "pending_approval" && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => setStatus(b.id, "confirmed")}>
                <Check className="h-4 w-4" /> Aprobar y cobrar {formatUSD(b.total_paid)}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setStatus(b.id, "rejected")}>
                <X className="h-4 w-4" /> Rechazar
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function BookingBadge({ status }: { status: Booking["booking_status"] }) {
  const map: Record<string, { tone: any; label: string }> = {
    pending_approval: { tone: "warning", label: "Por aprobar" },
    confirmed: { tone: "success", label: "Confirmada" },
    completed: { tone: "brand", label: "Completada" },
    rejected: { tone: "danger", label: "Rechazada" },
    cancelled: { tone: "neutral", label: "Cancelada" },
    expired: { tone: "neutral", label: "Expirada" },
    pending: { tone: "warning", label: "Pendiente" },
    payment_failed: { tone: "danger", label: "Pago fallido" },
  };
  const v = map[status] ?? { tone: "neutral", label: status };
  return <Badge tone={v.tone}>{v.label}</Badge>;
}

// --------------------------------------------------------------------------

export function RevenuePanel() {
  const bookings = useApp((s) => s.bookings);
  const earning = bookings.filter((b) => ["confirmed", "completed"].includes(b.booking_status));
  const gross = earning.reduce((sum, b) => sum + b.subtotal_paid, 0);
  const commission = gross * 0.1; // platform commission (default 10%)
  const net = gross - commission;
  const pending = bookings.filter((b) => b.booking_status === "pending_approval").length;

  const stat = (label: string, value: string, hint?: string) => (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stat("Ventas brutas", formatUSD(gross), `${earning.length} reservas`)}
        {stat("Tu neto", formatUSD(net), "después de comisión 10%")}
        {stat("Por aprobar", String(pending), pending ? "requieren tu acción" : "todo al día")}
      </div>
      <Card className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
        <TrendingUp className="h-4 w-4 text-primary" />
        Pregúntale al copiloto “¿cómo va mi mes?” o “¿qué experiencia vende más?” para más detalle.
      </Card>
    </div>
  );
}

// --------------------------------------------------------------------------

export function CalendarPanel() {
  const experiences = useApp((s) => s.experiences);
  const withSchedules = experiences.filter((e) => e.schedules.length);

  if (!withSchedules.length)
    return (
      <EmptyState
        icon={<CalendarDays className="h-8 w-8" />}
        title="Sin salidas configuradas"
        hint="Crea una experiencia con días de salida, o dile al copiloto “abre todos los sábados con cupo 10”."
      />
    );

  return (
    <div className="grid gap-3">
      {withSchedules.map((e) => (
        <Card key={e.id} className="p-4">
          <h3 className="font-medium">{e.title}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
              const s = e.schedules.find((x) => x.day_of_week === dow);
              return (
                <div
                  key={dow}
                  className={
                    "rounded-xl px-3 py-2 text-center text-sm " +
                    (s ? "bg-primary/15 text-ink" : "bg-muted text-muted-foreground/50")
                  }
                >
                  <div className="capitalize">{dayName(dow).slice(0, 3)}</div>
                  <div className="text-xs">{s ? s.start_time : "—"}</div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}

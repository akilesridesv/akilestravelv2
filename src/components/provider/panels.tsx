import * as React from "react";
import { useState } from "react";
import { useApp } from "@/state/store";
import { Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExperienceDraftEditor } from "@/components/provider/ExperienceDraftEditor";
import { ExperienceImage } from "@/components/provider/ExperienceImage";
import { deleteImages } from "@/lib/imageStore";
import { blankDraft, experienceToDraft } from "@/lib/experience";
import { formatUSD, dayName, uid } from "@/lib/utils";
import { addHours } from "@/ai/nlp";
import type { Booking, Experience, PublicationStatus, RecurringSchedule } from "@/types/domain";
import {
  CalendarDays,
  Check,
  X,
  Clock,
  Users,
  MapPin,
  Inbox,
  TrendingUp,
  Pencil,
  Trash2,
  Plus,
} from "lucide-react";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun

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
  const removeExperience = useApp((s) => s.removeExperience);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (creating)
    return (
      <ExperienceDraftEditor
        initial={blankDraft()}
        mode="create"
        onCancel={() => setCreating(false)}
        onDone={() => setCreating(false)}
      />
    );

  if (!experiences.length)
    return (
      <div className="grid gap-3">
        <EmptyState
          icon={<Inbox className="h-8 w-8" />}
          title="Aún no tienes experiencias"
          hint="Descríbela en el copiloto (“Tour de café en Ataco, 3h, $35, martes y jueves 9am”), o créala a mano."
        />
        <Button variant="outline" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Nueva experiencia a mano
        </Button>
      </div>
    );

  return (
    <div className="grid gap-3">
      <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setCreating(true)}>
        <Plus className="h-4 w-4" /> Nueva experiencia
      </Button>

      {experiences.map((e) =>
        editingId === e.id ? (
          <ExperienceDraftEditor
            key={e.id}
            initial={experienceToDraft(e)}
            mode="edit"
            experienceId={e.id}
            onCancel={() => setEditingId(null)}
            onDone={() => setEditingId(null)}
          />
        ) : (
          <Card key={e.id} className="p-4">
            <div className="flex items-start gap-3">
              <ExperienceImage
                imageRef={e.featured_image}
                alt={e.title}
                className="h-16 w-16 shrink-0 rounded-xl"
              />
              <div className="min-w-0 flex-1">
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
            <div className="mt-3 flex gap-2 border-t border-border pt-3">
              <Button size="sm" variant="outline" onClick={() => setEditingId(e.id)}>
                <Pencil className="h-4 w-4" /> Editar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => {
                  if (confirm(`¿Eliminar “${e.title}”?`)) {
                    void deleteImages(e.image_urls);
                    removeExperience(e.id);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" /> Eliminar
              </Button>
            </div>
          </Card>
        )
      )}
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
  const updateExperience = useApp((s) => s.updateExperience);

  if (!experiences.length)
    return (
      <EmptyState
        icon={<CalendarDays className="h-8 w-8" />}
        title="Sin experiencias"
        hint="Crea una experiencia primero; aquí gestionas sus días de salida. Puedes tocar los días o decirle al copiloto “abre los sábados cupo 10”."
      />
    );

  function toggleDay(e: Experience, dow: number) {
    const has = e.schedules.some((s) => s.day_of_week === dow);
    let schedules: RecurringSchedule[];
    if (has) {
      schedules = e.schedules.filter((s) => s.day_of_week !== dow);
    } else {
      const start = e.schedules[0]?.start_time ?? "09:00";
      schedules = [
        ...e.schedules,
        {
          id: uid("sch"),
          day_of_week: dow,
          start_time: start,
          end_time: addHours(start, e.duration_hours),
          capacity: e.schedules[0]?.capacity ?? e.max_capacity,
          is_active: true,
        },
      ].sort((a, b) => a.day_of_week - b.day_of_week);
    }
    updateExperience(e.id, { schedules });
  }

  function setTime(e: Experience, time: string) {
    if (!time) return;
    updateExperience(e.id, {
      schedules: e.schedules.map((s) => ({
        ...s,
        start_time: time,
        end_time: addHours(time, e.duration_hours),
      })),
    });
  }

  function setCapacity(e: Experience, cap: number) {
    updateExperience(e.id, {
      schedules: e.schedules.map((s) => ({ ...s, capacity: cap })),
    });
  }

  return (
    <div className="grid gap-3">
      {experiences.map((e) => {
        const first = e.schedules[0];
        return (
          <Card key={e.id} className="p-4">
            <h3 className="font-medium">{e.title}</h3>
            <p className="mb-2 text-xs text-muted-foreground">Toca un día para abrir o cerrar salidas</p>
            <div className="flex flex-wrap gap-2">
              {DAY_ORDER.map((dow) => {
                const active = e.schedules.some((s) => s.day_of_week === dow);
                return (
                  <button
                    key={dow}
                    type="button"
                    onClick={() => toggleDay(e, dow)}
                    className={
                      "min-w-[52px] rounded-xl px-3 py-2 text-center text-sm transition " +
                      (active
                        ? "bg-primary/20 text-ink ring-1 ring-primary"
                        : "bg-muted text-muted-foreground/60 hover:bg-accent")
                    }
                  >
                    <div className="capitalize">{dayName(dow).slice(0, 3)}</div>
                    <div className="text-xs">{active ? first?.start_time ?? "09:00" : "—"}</div>
                  </button>
                );
              })}
            </div>

            {e.schedules.length > 0 && (
              <div className="mt-3 flex flex-wrap items-end gap-4 border-t border-border pt-3">
                <label className="text-sm">
                  <span className="mb-1 block text-xs text-muted-foreground">Hora de inicio</span>
                  <Input
                    type="time"
                    className="h-9 w-32"
                    value={first?.start_time ?? "09:00"}
                    onChange={(ev) => setTime(e, ev.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs text-muted-foreground">Cupo por salida</span>
                  <Input
                    type="number"
                    className="h-9 w-24"
                    value={first?.capacity ?? e.max_capacity}
                    onChange={(ev) => setCapacity(e, parseInt(ev.target.value) || 1)}
                  />
                </label>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

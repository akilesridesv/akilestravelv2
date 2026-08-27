import * as React from "react";
import { useState } from "react";
import { useApp } from "@/state/store";
import { Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExperienceDraftEditor } from "@/components/provider/ExperienceDraftEditor";
import { ExperienceImage } from "@/components/provider/ExperienceImage";
import { ScheduleEditor } from "@/components/provider/ScheduleEditor";
import { WeekAgenda } from "@/components/provider/WeekAgenda";
import { ViewToggle, type PanelView } from "@/components/provider/ViewToggle";
import { Modal } from "@/components/ui/modal";
import { deleteImages } from "@/lib/imageStore";
import { blankDraft, experienceToDraft } from "@/lib/experience";
import { formatUSD, dayName, uid, cn } from "@/lib/utils";
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
  ChevronRight,
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
  const [view, setView] = useState<PanelView>("list");

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
      <div className="grid grid-cols-1 gap-3">
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
    <div className="grid grid-cols-1 gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Nueva
        </Button>
        <ViewToggle value={view} onChange={setView} />
      </div>

      {view === "calendar" ? (
        <WeekAgenda experiences={experiences} />
      ) : (
        experiences.map((e) =>
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
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 flex-1 truncate font-display text-lg">{e.title}</h3>
                  <div className="shrink-0 text-right leading-tight">
                    <span className="font-display text-lg">{formatUSD(e.price_per_person)}</span>
                    <span className="block text-[10px] text-muted-foreground">por persona</span>
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {statusBadge(e.publication_status)}
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
        )
      )}
    </div>
  );
}

// --------------------------------------------------------------------------

export function BookingsPanel({ compact = false }: { compact?: boolean }) {
  const bookings = useApp((s) => s.bookings);
  const setStatus = useApp((s) => s.setBookingStatus);
  const [modalId, setModalId] = useState<string | null>(null);

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
  const active = bookings.find((b) => b.id === modalId) ?? null;

  return (
    <div className="grid grid-cols-1 gap-3">
      {sorted.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => setModalId(b.id)}
          className="flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition hover:bg-accent"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-medium">{b.contact_name}</h3>
              <BookingBadge status={b.booking_status} />
            </div>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{b.experience_title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {b.number_of_people} pers · {b.scheduled_date} {b.scheduled_time} · {formatUSD(b.total_paid)}
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </button>
      ))}

      <Modal
        open={!!active}
        onClose={() => setModalId(null)}
        title={active ? `Reserva de ${active.contact_name}` : ""}
      >
        {active && (
          <BookingDetail
            booking={active}
            readOnly={compact}
            onApprove={() => {
              setStatus(active.id, "confirmed");
              setModalId(null);
            }}
            onReject={() => {
              setStatus(active.id, "rejected");
              setModalId(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function BookingDetail({
  booking: b,
  readOnly,
  onApprove,
  onReject,
}: {
  booking: Booking;
  readOnly?: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <BookingBadge status={b.booking_status} />
        <span className="text-sm text-muted-foreground">Código {b.confirmation_code}</span>
      </div>
      <div>
        {row("Experiencia", b.experience_title)}
        {row("Correo", b.contact_email)}
        {row("Personas", b.number_of_people)}
        {row("Fecha", `${b.scheduled_date} · ${b.scheduled_time}`)}
        {row("Subtotal", formatUSD(b.subtotal_paid))}
        {row("Service fee", formatUSD(b.service_fee_paid))}
        {row("Total", formatUSD(b.total_paid))}
      </div>
      {!readOnly && b.booking_status === "pending_approval" && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="sm:flex-1" onClick={onApprove}>
            <Check className="h-4 w-4" /> Aprobar y cobrar {formatUSD(b.total_paid)}
          </Button>
          <Button variant="outline" onClick={onReject}>
            <X className="h-4 w-4" /> Rechazar
          </Button>
        </div>
      )}
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
    <div className="grid grid-cols-1 gap-3">
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
  const [view, setView] = useState<PanelView>("list");
  const [modalId, setModalId] = useState<string | null>(null);

  if (!experiences.length)
    return (
      <EmptyState
        icon={<CalendarDays className="h-8 w-8" />}
        title="Sin experiencias"
        hint="Crea una experiencia primero; aquí gestionas sus horarios de salida (varios por día). También por chat: “abre los sábados a las 2pm cupo 10”."
      />
    );

  const modalExp = experiences.find((e) => e.id === modalId) ?? null;

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="flex items-center justify-end">
        <ViewToggle value={view} onChange={setView} />
      </div>

      {view === "calendar" ? (
        <WeekAgenda experiences={experiences} />
      ) : (
        // List view: tap a viñeta to open its horarios in a modal (view / modify).
        experiences.map((e) => {
          const days = [...new Set(e.schedules.map((s) => s.day_of_week))]
            .sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))
            .map((d) => dayName(d).slice(0, 3))
            .join(", ");
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => setModalId(e.id)}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition hover:bg-accent"
            >
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-medium">{e.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {e.schedules.length} salida{e.schedules.length === 1 ? "" : "s"}
                  {e.schedules.length ? ` · ${days}` : " · sin salidas"}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </button>
          );
        })
      )}

      <Modal open={!!modalExp} onClose={() => setModalId(null)} title={modalExp?.title ?? ""}>
        {modalExp && (
          <ScheduleEditor
            value={modalExp.schedules}
            onChange={(sch) => updateExperience(modalExp.id, { schedules: sch })}
            tiers={modalExp.tiers}
            durationHours={modalExp.duration_hours}
            defaultCapacity={modalExp.max_capacity}
          />
        )}
      </Modal>
    </div>
  );
}

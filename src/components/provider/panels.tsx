import * as React from "react";
import { useState } from "react";
import { useApp } from "@/state/store";
import { Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ExperienceDraftEditor } from "@/components/provider/ExperienceDraftEditor";
import { ExperienceImage } from "@/components/provider/ExperienceImage";
import { ScheduleEditor } from "@/components/provider/ScheduleEditor";
import { TierManager } from "@/components/provider/TierManager";
import { TodayAgenda, DatedAgenda } from "@/components/provider/WeekAgenda";
import { DateCalendar } from "@/components/provider/DateCalendar";
import { shareTicket, shareTicketPdf, type TicketData } from "@/components/tourist/Ticket";
import { Modal } from "@/components/ui/modal";
import { SearchBar } from "@/components/ui/SearchBar";
import { Pagination } from "@/components/ui/Pagination";
import { deleteImages } from "@/lib/imageStore";
import { blankDraft, experienceToDraft, displayPrice, bookingLink } from "@/lib/experience";
import { fuzzyMatch } from "@/lib/fuzzy";
import { notify } from "@/state/toast";
import {
  formatUSD,
  dayName,
  uid,
  cn,
  todayISO,
  isoDate,
  addDaysISO,
  parseISODate,
  monthName,
} from "@/lib/utils";
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
  ChevronLeft,
  ChevronRight,
  Share2,
  FileDown,
  Ticket,
  Check as CheckIcon,
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
  const [showCalendar, setShowCalendar] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const PAGE = 6;

  if (showCalendar)
    return (
      <div className="grid grid-cols-1 gap-3">
        <button
          type="button"
          onClick={() => setShowCalendar(false)}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Volver a experiencias
        </button>
        <CalendarPanel />
      </div>
    );

  async function share(e: Experience) {
    const url = bookingLink(e.id);
    try {
      if (navigator.share) {
        await navigator.share({ title: e.title, text: `Reserva "${e.title}" en Akiles Travel`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopiedId(e.id);
        setTimeout(() => setCopiedId((c) => (c === e.id ? null : c)), 2000);
      }
    } catch {
      /* user cancelled share */
    }
  }

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

  const filtered = query
    ? experiences.filter((e) => fuzzyMatch(query, `${e.title} ${e.city ?? ""}`))
    : experiences;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageSafe = Math.min(page, pageCount - 1);
  const items = filtered.slice(pageSafe * PAGE, pageSafe * PAGE + PAGE);

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Nueva
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowCalendar(true)}>
          <CalendarDays className="h-4 w-4" /> Calendario
        </Button>
        {experiences.length > 4 && (
          <div className="min-w-[180px] flex-1">
            <SearchBar
              value={query}
              onChange={(v) => {
                setQuery(v);
                setPage(0);
              }}
              placeholder="Buscar experiencia…"
            />
          </div>
        )}
      </div>

      {items.map((e) =>
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
                    {displayPrice(e).from && (
                      <span className="block text-[10px] text-muted-foreground">desde</span>
                    )}
                    <span className="font-display text-lg">{formatUSD(displayPrice(e).amount)}</span>
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
                      ? [...new Set(e.schedules.map((s) => s.day_of_week))]
                          .sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))
                          .map((d) => dayName(d).slice(0, 3))
                          .join(", ")
                      : "sin salidas"}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
              <Button size="sm" variant="outline" onClick={() => setEditingId(e.id)}>
                <Pencil className="h-4 w-4" /> Editar
              </Button>
              <Button size="sm" variant="outline" onClick={() => share(e)}>
                {copiedId === e.id ? (
                  <>
                    <CheckIcon className="h-4 w-4" /> ¡Copiado!
                  </>
                ) : (
                  <>
                    <Share2 className="h-4 w-4" /> Compartir
                  </>
                )}
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

      {filtered.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Sin resultados para “{query}”.
        </p>
      )}
      <Pagination page={pageSafe} pageCount={pageCount} onPage={setPage} />
    </div>
  );
}

// --------------------------------------------------------------------------

export function BookingsPanel({ compact = false }: { compact?: boolean }) {
  const bookings = useApp((s) => s.bookings);
  const setStatus = useApp((s) => s.setBookingStatus);
  const [modalId, setModalId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [statusF, setStatusF] = useState<string>("");
  const [expF, setExpF] = useState<string>("");
  const [view, setView] = useState<"list" | "calendar">("list");
  const PAGE = 8;

  const order: Booking["booking_status"][] = ["pending_approval", "confirmed", "completed"];
  const expTitles = [...new Set(bookings.map((b) => b.experience_title))].filter(Boolean);
  const filtered = bookings
    .filter((b) => (statusF ? b.booking_status === statusF : true))
    .filter((b) => (expF ? b.experience_title === expF : true))
    .filter((b) => (query ? fuzzyMatch(query, `${b.contact_name} ${b.experience_title}`) : true))
    .sort((a, b) => order.indexOf(a.booking_status) - order.indexOf(b.booking_status));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageSafe = Math.min(page, pageCount - 1);
  const items = filtered.slice(pageSafe * PAGE, pageSafe * PAGE + PAGE);
  const active = bookings.find((b) => b.id === modalId) ?? null;

  const resetPage = () => setPage(0);

  // Group the (filtered) reservations by date for the calendar/agenda view.
  const byDate = new Map<string, Booking[]>();
  for (const b of [...filtered].sort((a, b) =>
    (a.scheduled_time || "").localeCompare(b.scheduled_time || "")
  )) {
    const k = b.scheduled_date || "Sin fecha";
    (byDate.get(k) ?? byDate.set(k, []).get(k)!).push(b);
  }
  const dateKeys = [...byDate.keys()].sort();

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          {bookings.length > 0 ? (
            <div className="min-w-0 flex-1">
              <SearchBar
                value={query}
                onChange={(v) => {
                  setQuery(v);
                  resetPage();
                }}
                placeholder="Buscar cliente o experiencia…"
              />
            </div>
          ) : (
            <div className="min-w-0 flex-1" />
          )}
          <div className="inline-flex shrink-0 rounded-full border border-border p-0.5">
            {(["list", "calendar"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm transition",
                  view === v ? "bg-ink text-background" : "text-muted-foreground hover:bg-accent"
                )}
              >
                {v === "list" ? "Lista" : "Calendario"}
              </button>
            ))}
          </div>
        </div>
        {bookings.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <select
              value={statusF}
              onChange={(e) => {
                setStatusF(e.target.value);
                resetPage();
              }}
              className="h-9 rounded-xl border border-input bg-card px-3 text-sm"
            >
              <option value="">Todos los estados</option>
              <option value="pending_approval">Por aprobar</option>
              <option value="confirmed">Confirmadas</option>
              <option value="completed">Completadas</option>
              <option value="rejected">Rechazadas</option>
              <option value="cancelled">Canceladas</option>
            </select>
            {expTitles.length > 1 && (
              <select
                value={expF}
                onChange={(e) => {
                  setExpF(e.target.value);
                  resetPage();
                }}
                className="h-9 max-w-[55%] rounded-xl border border-input bg-card px-3 text-sm"
              >
                <option value="">Todas las experiencias</option>
                {expTitles.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {bookings.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-8 w-8" />}
          title="Sin reservas todavía"
          hint="Cuando un turista reserve una de tus experiencias, aparecerá aquí para que le des seguimiento. Los cupos y horarios se gestionan en Experiencias."
        />
      ) : view === "calendar" ? (
        filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Sin reservas con estos filtros.
          </p>
        ) : (
          dateKeys.map((k) => {
            const dayBookings = byDate.get(k)!;
            const people = dayBookings.reduce((n, b) => n + (b.number_of_people || 0), 0);
            return (
              <div key={k} className="rounded-2xl border border-border bg-card p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium capitalize">{fmtAgendaDate(k)}</p>
                  <span className="text-xs text-muted-foreground">
                    {dayBookings.length} reserva{dayBookings.length === 1 ? "" : "s"} · {people} pers
                  </span>
                </div>
                <div className="grid gap-2">
                  {dayBookings.map((b) => (
                    <BookingRow key={b.id} b={b} onOpen={() => setModalId(b.id)} />
                  ))}
                </div>
              </div>
            );
          })
        )
      ) : (
        <>
          {items.map((b) => (
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
                  {b.number_of_people} pers · {b.scheduled_date} {b.scheduled_time} ·{" "}
                  {formatUSD(b.total_paid)}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </button>
          ))}

          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin reservas con estos filtros.
            </p>
          )}
          <Pagination page={pageSafe} pageCount={pageCount} onPage={setPage} />
        </>
      )}

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
              notify(`Reserva de ${active.contact_name} aprobada.`);
              setModalId(null);
            }}
            onReject={() => {
              setStatus(active.id, "rejected");
              notify(`Reserva de ${active.contact_name} rechazada.`, "warning");
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
  const ticketData: TicketData = {
    code: b.confirmation_code,
    confirmed: b.booking_status === "confirmed",
    title: b.experience_title,
    date: b.scheduled_date,
    time: b.scheduled_time,
    peopleLabel: `${b.number_of_people} persona${b.number_of_people === 1 ? "" : "s"}`,
    holderName: b.contact_name,
    total: b.total_paid,
  };
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
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => shareTicket(ticketData)}
        >
          <Share2 className="h-4 w-4" /> Compartir
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => shareTicketPdf(ticketData)}
        >
          <FileDown className="h-4 w-4" /> PDF
        </Button>
      </div>
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

/** Human date header for the reservations agenda ("Vie 4 de septiembre"). */
function fmtAgendaDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = parseISODate(iso);
  const dn = dayName(d.getDay()).slice(0, 3);
  return `${dn} ${d.getDate()} de ${monthName(d.getMonth())}`;
}

/** One reservation row in the agenda: time · client · people, opens the detail. */
function BookingRow({ b, onOpen }: { b: Booking; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-2 text-left transition hover:bg-muted"
    >
      <span className="shrink-0 font-display text-sm tabular-nums">{b.scheduled_time || "—"}</span>
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="font-medium">{b.contact_name}</span>
        <span className="text-muted-foreground"> · {b.experience_title}</span>
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">{b.number_of_people} pers</span>
      <BookingBadge status={b.booking_status} />
    </button>
  );
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

type CalRange = "today" | "week" | "month" | "custom";

const RANGE_TABS: { k: CalRange; label: string }[] = [
  { k: "today", label: "Hoy" },
  { k: "week", label: "Semana" },
  { k: "month", label: "Mes" },
  { k: "custom", label: "Rango" },
];

/** Monday (ISO) of the week containing `iso`. */
function mondayOf(iso: string): string {
  const d = parseISODate(iso);
  const back = (d.getDay() + 6) % 7; // Monday-first
  d.setDate(d.getDate() - back);
  return isoDate(d);
}

function datesBetween(from: string, to: string, cap = 60): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to && out.length < cap) {
    out.push(cur);
    cur = addDaysISO(cur, 1);
  }
  return out;
}

export function CalendarPanel() {
  const experiences = useApp((s) => s.experiences);
  const updateExperience = useApp((s) => s.updateExperience);
  const [range, setRange] = useState<CalRange>("week");
  const [filterId, setFilterId] = useState<string>(""); // "" = all
  const [modalId, setModalId] = useState<string | null>(null);
  const [dayIso, setDayIso] = useState<string | null>(null); // date-slot editor day
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayISO()));
  const [from, setFrom] = useState(() => todayISO());
  const [to, setTo] = useState(() => addDaysISO(todayISO(), 14));

  if (!experiences.length)
    return (
      <EmptyState
        icon={<CalendarDays className="h-8 w-8" />}
        title="Sin experiencias"
        hint="Crea una experiencia primero; aquí gestionas sus horarios y fechas. También por chat: “abre los sábados 2pm cupo 10”, “habilita el 5, 8 y 12 de septiembre”."
      />
    );

  const modalExp = experiences.find((e) => e.id === modalId) ?? null;
  const selectedExp = filterId ? experiences.find((e) => e.id === filterId) ?? null : null;
  const shown = selectedExp ? [selectedExp] : experiences;

  const weekEnd = addDaysISO(weekStart, 6);
  const ws = parseISODate(weekStart);
  const we = parseISODate(weekEnd);
  const weekLabel = `${ws.getDate()} ${monthName(ws.getMonth()).slice(0, 3)} – ${we.getDate()} ${monthName(
    we.getMonth()
  ).slice(0, 3)}`;

  return (
    <div className="grid grid-cols-1 gap-3">
      {/* Controls: experience selector + range toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select
          value={filterId}
          onChange={(e) => setFilterId(e.target.value)}
          className="h-9 max-w-[60%] rounded-xl border border-input bg-card px-3 text-sm"
        >
          <option value="">Todas las experiencias</option>
          {experiences.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
        <div className="inline-flex rounded-full border border-border p-0.5">
          {RANGE_TABS.map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setRange(t.k)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm transition",
                range === t.k ? "bg-ink text-background" : "text-muted-foreground hover:bg-accent"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {range === "today" && (
        <DatedAgenda
          experiences={shown}
          dates={[todayISO()]}
          onSelect={setModalId}
          onDayEdit={selectedExp ? setDayIso : undefined}
        />
      )}

      {range === "week" && (
        <>
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Semana anterior"
              onClick={() => setWeekStart(addDaysISO(weekStart, -7))}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-accent"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setWeekStart(mondayOf(todayISO()))}
              className="font-medium capitalize hover:underline"
            >
              {weekLabel}
            </button>
            <button
              type="button"
              aria-label="Semana siguiente"
              onClick={() => setWeekStart(addDaysISO(weekStart, 7))}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-accent"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <DatedAgenda
            experiences={shown}
            dates={datesBetween(weekStart, weekEnd, 7)}
            onSelect={setModalId}
            onDayEdit={selectedExp ? setDayIso : undefined}
          />
        </>
      )}

      {range === "custom" && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Desde</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 rounded-xl border border-input bg-card px-3 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Hasta</span>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 rounded-xl border border-input bg-card px-3 text-sm"
              />
            </label>
          </div>
          <DatedAgenda
            experiences={shown}
            dates={datesBetween(from < to ? from : to, from < to ? to : from)}
            onSelect={setModalId}
            onDayEdit={selectedExp ? setDayIso : undefined}
          />
        </>
      )}

      {range === "month" &&
        (selectedExp ? (
          <DateCalendar
            experience={selectedExp}
            onChange={(ds) => updateExperience(selectedExp.id, { date_slots: ds })}
            onDayOpen={setDayIso}
            onTiers={(tiers) => updateExperience(selectedExp.id, { tiers })}
          />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-10 text-center">
            <CalendarDays className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Elige una experiencia</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Selecciona una experiencia arriba para agregar o quitar fechas por día (arrastrando).
            </p>
          </div>
        ))}

      <Modal open={!!modalExp} onClose={() => setModalId(null)} title={modalExp?.title ?? ""}>
        {modalExp && (
          <div className="grid gap-5">
            {/* Cupos */}
            <div>
              <Label className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" /> Cupo (mín – máx)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={modalExp.min_capacity}
                  onChange={(e) =>
                    updateExperience(modalExp.id, { min_capacity: parseInt(e.target.value) || 1 })
                  }
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="number"
                  value={modalExp.max_capacity}
                  onChange={(e) =>
                    updateExperience(modalExp.id, { max_capacity: parseInt(e.target.value) || 1 })
                  }
                />
              </div>
            </div>

            {/* Horarios */}
            <div>
              <Label className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> Horarios de salida
              </Label>
              <ScheduleEditor
                value={modalExp.schedules}
                onChange={(sch) => updateExperience(modalExp.id, { schedules: sch })}
                tiers={modalExp.tiers}
                durationHours={modalExp.duration_hours}
                defaultCapacity={modalExp.max_capacity}
              />
            </div>

            {/* Tiers */}
            <div>
              <Label className="inline-flex items-center gap-1">
                <Ticket className="h-3 w-3" /> Tiers (entrada regular, VIP…)
              </Label>
              <TierManager
                value={modalExp.tiers}
                onChange={(tiers) => updateExperience(modalExp.id, { tiers })}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Date-specific departures for one day (habilitar / editar / borrar) */}
      {selectedExp && dayIso && (
        <DaySlots
          exp={selectedExp}
          iso={dayIso}
          onClose={() => setDayIso(null)}
          onChange={(ds) => updateExperience(selectedExp.id, { date_slots: ds })}
          onTiers={(tiers) => updateExperience(selectedExp.id, { tiers })}
          onSchedules={(sch) => updateExperience(selectedExp.id, { schedules: sch })}
        />
      )}
    </div>
  );
}

/** Add / edit / delete date-specific departures (date_slots) + tiers, in one window. */
function DaySlots({
  exp,
  iso,
  onClose,
  onChange,
  onTiers,
  onSchedules,
}: {
  exp: Experience;
  iso: string;
  onClose: () => void;
  onChange: (slots: import("@/types/domain").DateSlot[]) => void;
  onTiers: (tiers: Experience["tiers"]) => void;
  onSchedules: (schedules: Experience["schedules"]) => void;
}) {
  const all = exp.date_slots ?? [];
  const others = all.filter((s) => s.slot_date !== iso);
  const daySlots = all.filter((s) => s.slot_date === iso);
  const dow = parseISODate(iso).getDay();
  const recurring = exp.schedules.filter((s) => s.day_of_week === dow);
  const d = parseISODate(iso);
  const title = `${dayName(d.getDay())} ${d.getDate()} de ${monthName(d.getMonth())}`;

  const commit = (next: import("@/types/domain").DateSlot[]) => onChange([...others, ...next]);
  const patchSched = (id: string, p: Partial<Experience["schedules"][number]>) =>
    onSchedules(exp.schedules.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const delSched = (id: string) => onSchedules(exp.schedules.filter((s) => s.id !== id));
  const add = () =>
    commit([
      ...daySlots,
      {
        id: uid("ds"),
        slot_date: iso,
        start_time: "09:00",
        end_time: addHours("09:00", exp.duration_hours || 2),
        capacity: exp.max_capacity || 10,
        status: "open",
      },
    ]);
  const patch = (id: string, p: Partial<import("@/types/domain").DateSlot>) =>
    commit(daySlots.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const remove = (id: string) => commit(daySlots.filter((s) => s.id !== id));

  return (
    <Modal open onClose={onClose} title={`Salidas · ${title}`}>
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          Salidas y cupos de <b className="text-foreground">{exp.title}</b> para este día. Ajusta la
          hora y el cupo, o bórralas.
        </p>

        {/* Recurring departures on this weekday — editable (apply every week) */}
        {recurring.length > 0 && (
          <div className="grid gap-2">
            {recurring.map((s) => (
              <div key={s.id} className="rounded-xl border border-border p-2.5">
                <div className="mb-1.5">
                  <span className="rounded-full bg-teal/15 px-2 py-0.5 text-[10px] font-medium text-teal">
                    Recurrente · todas las semanas
                  </span>
                </div>
                <div className="flex items-end gap-2">
                  <div>
                    <Label className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Hora
                    </Label>
                    <Input
                      type="time"
                      value={s.start_time}
                      onChange={(e) =>
                        patchSched(s.id, {
                          start_time: e.target.value,
                          end_time: addHours(e.target.value, exp.duration_hours || 2),
                        })
                      }
                    />
                  </div>
                  <div className="w-24">
                    <Label className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" /> Cupo
                    </Label>
                    <Input
                      type="number"
                      value={s.capacity}
                      onChange={(e) => patchSched(s.id, { capacity: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => delSched(s.id)}
                    aria-label="Borrar salida recurrente"
                    className="mb-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Date-specific departures (only this date) */}
        {daySlots.map((s) => (
          <div key={s.id} className="rounded-xl border border-border p-2.5">
            <div className="mb-1.5">
              <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-medium text-ink">
                Solo esta fecha
              </span>
            </div>
            <div className="flex items-end gap-2">
              <div>
                <Label className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Hora
                </Label>
                <Input
                  type="time"
                  value={s.start_time}
                  onChange={(e) =>
                    patch(s.id, {
                      start_time: e.target.value,
                      end_time: addHours(e.target.value, exp.duration_hours || 2),
                    })
                  }
                />
              </div>
              <div className="w-24">
                <Label className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" /> Cupo
                </Label>
                <Input
                  type="number"
                  value={s.capacity}
                  onChange={(e) => patch(s.id, { capacity: parseInt(e.target.value) || 1 })}
                />
              </div>
              <button
                type="button"
                onClick={() => remove(s.id)}
                aria-label="Borrar salida"
                className="mb-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}

        {recurring.length === 0 && daySlots.length === 0 && (
          <p className="text-sm text-muted-foreground">Este día no tiene salidas habilitadas.</p>
        )}

        <Button variant="outline" onClick={add}>
          <Plus className="h-4 w-4" /> Habilitar salida solo en esta fecha
        </Button>

        {/* Tiers — same window (aplican a toda la experiencia) */}
        <div className="border-t border-border pt-4">
          <Label className="inline-flex items-center gap-1">
            <Ticket className="h-3 w-3" /> Tiers (entrada regular, VIP…)
          </Label>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Los tiers aplican a toda la experiencia, no solo a esta fecha.
          </p>
          <TierManager value={exp.tiers} onChange={onTiers} />
        </div>
      </div>
    </Modal>
  );
}

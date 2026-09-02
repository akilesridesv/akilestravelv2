import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "@/state/store";
import * as repo from "@/data/repo";
import { isSupabaseConfigured } from "@/lib/supabase";
import { authSignOut } from "@/lib/auth";
import { usePublishedExperiences } from "@/hooks/usePublicData";
import { useFavorites } from "@/hooks/useFavorites";
import type { Booking, ConciergeRequest, AppNotification, ConciergeRequestKind } from "@/types/domain";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ExperienceCard } from "@/components/tourist/ExperienceCard";
import { Ticket, shareTicket, shareTicketPdf, type TicketData } from "@/components/tourist/Ticket";
import { BookingChat } from "@/components/tourist/BookingChat";
import { ConciergeChat } from "@/components/tourist/ConciergeChat";
import { isLLMEnabled } from "@/ai/llm";
import { EXPERIENCE_CATEGORIES } from "@/lib/categories";
import { notify } from "@/state/toast";
import { todayISO, parseISODate, dayName, monthName, cn } from "@/lib/utils";
import {
  Home,
  Ticket as TicketIcon,
  Heart,
  Sparkles,
  Inbox,
  UserRound,
  LifeBuoy,
  LogOut,
  Bell,
  Plus,
  Send,
  MessageCircle,
  Ban,
  ChevronRight,
  Loader2,
  Check,
} from "lucide-react";

type SectionKey =
  | "inicio"
  | "viajes"
  | "guardados"
  | "concierge"
  | "solicitudes"
  | "perfil"
  | "ayuda";

const NAV: { key: SectionKey; label: string; icon: React.ElementType }[] = [
  { key: "inicio", label: "Inicio", icon: Home },
  { key: "viajes", label: "Mis viajes", icon: TicketIcon },
  { key: "guardados", label: "Guardados", icon: Heart },
  { key: "concierge", label: "Concierge", icon: Sparkles },
  { key: "solicitudes", label: "Solicitudes", icon: Inbox },
  { key: "perfil", label: "Perfil", icon: UserRound },
  { key: "ayuda", label: "Ayuda", icon: LifeBuoy },
];

function fmtDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = parseISODate(iso);
  const dn = dayName(d.getDay());
  return `${dn.charAt(0).toUpperCase()}${dn.slice(1)} ${d.getDate()} de ${monthName(d.getMonth())}`;
}

const isUpcoming = (b: Booking) =>
  ["pending_approval", "pending", "confirmed"].includes(b.booking_status) &&
  (!b.scheduled_date || b.scheduled_date >= todayISO());

export default function TouristAccount() {
  const navigate = useNavigate();
  const authReady = useApp((s) => s.authReady);
  const user = useApp((s) => s.user);
  const role = useApp((s) => s.role);
  const profile = useApp((s) => s.touristProfile);
  const storeBookings = useApp((s) => s.bookings);

  const [section, setSection] = useState<SectionKey>("inicio");
  const [bookings, setBookings] = useState<Booking[]>(storeBookings);
  const [requests, setRequests] = useState<ConciergeRequest[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);

  // Gate: only signed-in tourists. Providers/anon are redirected.
  useEffect(() => {
    if (!authReady) return;
    if (!user || role !== "tourist") navigate("/auth?role=tourist", { replace: true });
  }, [authReady, user, role, navigate]);

  // Load account data.
  useEffect(() => {
    if (!isSupabaseConfigured || !user || role !== "tourist") return;
    let alive = true;
    repo.loadMyBookings().then((b) => alive && setBookings(b)).catch(() => {});
    repo.loadConciergeRequests().then((r) => alive && setRequests(r)).catch(() => {});
    repo.loadNotifications().then((n) => alive && setNotifications(n)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [user, role]);

  const upcoming = useMemo(() => bookings.filter(isUpcoming), [bookings]);
  const past = useMemo(() => bookings.filter((b) => !isUpcoming(b)), [bookings]);
  const unread = notifications.filter((n) => !n.read_at).length;

  if (!authReady || !user || role !== "tourist") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const firstName = (profile?.name || user.name || "viajero").split(" ")[0];

  return (
    <div className="min-h-dvh bg-secondary/30">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 sm:px-8">
          <Link to="/" className="flex items-center gap-1.5">
            <Logo className="h-6" />
            <span className="font-display text-base font-semibold lowercase tracking-tight text-muted-foreground">
              travel
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSection("inicio")}
              className="relative rounded-full p-2 text-muted-foreground transition hover:bg-accent"
              aria-label="Notificaciones"
            >
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute right-1 top-1 flex h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
              )}
            </button>
            <button
              onClick={() => authSignOut().then(() => navigate("/"))}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium transition hover:bg-accent"
            >
              <LogOut className="h-4 w-4" /> Salir
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl gap-6 px-5 py-6 sm:px-8 lg:grid lg:grid-cols-[220px_1fr]">
        {/* Sidebar (desktop) / segmented tabs (mobile) */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="no-scrollbar -mx-5 mb-4 flex gap-1.5 overflow-x-auto px-5 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
            {NAV.map((n) => {
              const on = section === n.key;
              return (
                <button
                  key={n.key}
                  onClick={() => setSection(n.key)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition lg:w-full",
                    on ? "bg-ink text-background" : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  <n.icon className="h-4 w-4" /> {n.label}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0">
          {section === "inicio" && (
            <Inicio
              firstName={firstName}
              upcoming={upcoming}
              notifications={notifications}
              onGo={setSection}
              onOpenBooking={(b) => {
                setActiveBooking(b);
              }}
            />
          )}
          {section === "viajes" && (
            <Viajes upcoming={upcoming} past={past} onCancel={handleCancel} onChanged={reloadBookings} />
          )}
          {section === "guardados" && <Guardados />}
          {section === "concierge" && <Concierge onCreated={reloadRequests} />}
          {section === "solicitudes" && (
            <Solicitudes requests={requests} onCreated={reloadRequests} />
          )}
          {section === "perfil" && <Perfil />}
          {section === "ayuda" && <Ayuda />}
        </main>
      </div>

      {activeBooking && (
        <BookingDetailModal
          booking={activeBooking}
          onClose={() => setActiveBooking(null)}
          onCancel={handleCancel}
        />
      )}
    </div>
  );

  function reloadBookings() {
    repo.loadMyBookings().then(setBookings).catch(() => {});
  }
  function reloadRequests() {
    repo.loadConciergeRequests().then(setRequests).catch(() => {});
  }
  async function handleCancel(b: Booking) {
    try {
      await repo.cancelMyBooking(b.id);
      notify("Reserva cancelada. El proveedor fue notificado.");
      setActiveBooking(null);
      reloadBookings();
    } catch {
      notify("No pude cancelar la reserva. Intenta de nuevo.", "warning");
    }
  }
}

// The detail modal is controlled by module-level state inside the component via
// a closure; we lift it here with a hook-like pattern using a ref-free state.
// (Declared after export default keeps the component tidy; use a wrapper.)

// ---- Sections --------------------------------------------------------------

function bookingToTicket(b: Booking): TicketData {
  return {
    code: b.confirmation_code,
    confirmed: b.booking_status === "confirmed",
    title: b.experience_title,
    date: b.scheduled_date,
    time: b.scheduled_time,
    peopleLabel: `${b.number_of_people} persona${b.number_of_people === 1 ? "" : "s"}`,
    holderName: b.contact_name,
    total: b.total_paid,
  };
}

function StatusPill({ status }: { status: Booking["booking_status"] }) {
  const map: Record<string, { label: string; cls: string }> = {
    confirmed: { label: "Confirmada", cls: "bg-emerald-100 text-emerald-800" },
    pending_approval: { label: "Por confirmar", cls: "bg-amber-100 text-amber-800" },
    pending: { label: "Pendiente", cls: "bg-amber-100 text-amber-800" },
    completed: { label: "Completada", cls: "bg-secondary text-muted-foreground" },
    cancelled: { label: "Cancelada", cls: "bg-destructive/10 text-destructive" },
    rejected: { label: "Rechazada", cls: "bg-destructive/10 text-destructive" },
  };
  const s = map[status] ?? { label: status, cls: "bg-secondary text-muted-foreground" };
  return <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", s.cls)}>{s.label}</span>;
}

function Inicio({
  firstName,
  upcoming,
  notifications,
  onGo,
  onOpenBooking,
}: {
  firstName: string;
  upcoming: Booking[];
  notifications: AppNotification[];
  onGo: (s: SectionKey) => void;
  onOpenBooking: (b: Booking) => void;
}) {
  const next = upcoming[0];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight">Hola, {firstName} 👋</h1>
        <p className="mt-1 text-muted-foreground">Este es el centro de tus viajes en El Salvador.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Próximos viajes" value={upcoming.length} onClick={() => onGo("viajes")} />
        <StatCard label="Notificaciones" value={notifications.filter((n) => !n.read_at).length} />
        <button
          onClick={() => onGo("concierge")}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition hover:bg-accent"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-ink">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium">Pregúntale al concierge</p>
            <p className="text-xs text-muted-foreground">Ideas, reservas y solicitudes</p>
          </div>
        </button>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl">Tu próximo viaje</h2>
          {upcoming.length > 0 && (
            <button onClick={() => onGo("viajes")} className="text-sm text-muted-foreground hover:text-foreground">
              Ver todos
            </button>
          )}
        </div>
        {next ? (
          <button
            onClick={() => onOpenBooking(next)}
            className="flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left transition hover:shadow-sm"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-ink">
              <TicketIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{next.experience_title}</p>
              <p className="text-sm text-muted-foreground">
                {fmtDate(next.scheduled_date)} · {next.scheduled_time}
              </p>
            </div>
            <StatusPill status={next.booking_status} />
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </button>
        ) : (
          <EmptyState
            icon={<TicketIcon className="h-6 w-6" />}
            title="Aún no tienes viajes"
            body="Explora experiencias y reserva tu primera aventura."
            cta={<Link to="/" className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-background">Explorar experiencias</Link>}
          />
        )}
      </section>

      {notifications.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-xl">Notificaciones</h2>
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {notifications.slice(0, 5).map((n) => (
              <div key={n.id} className="flex items-start gap-3 p-3">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-border" : "bg-primary")} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  const Comp: any = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "rounded-2xl border border-border bg-card p-4 text-left",
        onClick && "transition hover:bg-accent"
      )}
    >
      <p className="font-display text-3xl">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </Comp>
  );
}

function Viajes({
  upcoming,
  past,
  onCancel,
  onChanged,
}: {
  upcoming: Booking[];
  past: Booking[];
  onCancel: (b: Booking) => void;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<{ b: Booking; tab: "ticket" | "chat" } | null>(null);
  const [tab, setTab] = useState<"proximos" | "historial" | "chat">("proximos");
  const all = useMemo(() => [...upcoming, ...past], [upcoming, past]);

  const tabs: { key: typeof tab; label: string; icon: React.ElementType; count: number }[] = [
    { key: "proximos", label: "Próximos", icon: TicketIcon, count: upcoming.length },
    { key: "historial", label: "Historial", icon: Home, count: past.length },
    { key: "chat", label: "Mensajes", icon: MessageCircle, count: all.length },
  ];

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl tracking-tight">Mis viajes</h1>

      <div className="flex gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition",
              tab === t.key ? "bg-ink text-background" : "border border-border text-muted-foreground hover:bg-accent"
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
            {t.count > 0 && (
              <span className={cn("rounded-full px-1.5 text-xs", tab === t.key ? "bg-background/20" : "bg-secondary")}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "proximos" &&
        (upcoming.length ? (
          <div className="grid gap-3">
            {upcoming.map((b) => (
              <BookingRow key={b.id} b={b} onOpen={() => setOpen({ b, tab: "ticket" })} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<TicketIcon className="h-6 w-6" />}
            title="No tienes viajes próximos"
            body="Explora experiencias y reserva tu próxima aventura."
            cta={<Link to="/" className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-background">Explorar</Link>}
          />
        ))}

      {tab === "historial" &&
        (past.length ? (
          <div className="grid gap-3">
            {past.map((b) => (
              <BookingRow key={b.id} b={b} onOpen={() => setOpen({ b, tab: "ticket" })} muted />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Home className="h-6 w-6" />}
            title="Aún sin historial"
            body="Tus experiencias pasadas aparecerán aquí para que las recuerdes o repitas."
          />
        ))}

      {tab === "chat" &&
        (all.length ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Conversa con el proveedor sobre cualquiera de tus reservas.
            </p>
            {all.map((b) => (
              <button
                key={b.id}
                onClick={() => setOpen({ b, tab: "chat" })}
                className="flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left transition hover:shadow-sm"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal/15 text-teal">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{b.experience_title}</p>
                  <p className="text-sm text-muted-foreground">
                    {fmtDate(b.scheduled_date)} · {b.scheduled_time}
                  </p>
                </div>
                <StatusPill status={b.booking_status} />
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<MessageCircle className="h-6 w-6" />}
            title="Sin conversaciones"
            body="Cuando reserves, aquí podrás chatear con el proveedor sobre tu experiencia."
          />
        ))}

      {open && (
        <BookingDetailModal
          booking={open.b}
          initialTab={open.tab}
          onClose={() => setOpen(null)}
          onCancel={(b) => {
            onCancel(b);
            setOpen(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function BookingRow({ b, onOpen, muted }: { b: Booking; onOpen: () => void; muted?: boolean }) {
  return (
    <button
      onClick={onOpen}
      className={cn(
        "flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left transition hover:shadow-sm",
        muted && "opacity-80"
      )}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-ink">
        <TicketIcon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{b.experience_title}</p>
        <p className="text-sm text-muted-foreground">
          {fmtDate(b.scheduled_date)} · {b.scheduled_time} · {b.number_of_people} pers.
        </p>
        <p className="mt-1 inline-flex items-center gap-1 text-xs text-teal">
          <MessageCircle className="h-3.5 w-3.5" /> Ticket y chat con el proveedor
        </p>
      </div>
      <StatusPill status={b.booking_status} />
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </button>
  );
}

function BookingDetailModal({
  booking: b,
  onClose,
  onCancel,
  initialTab = "ticket",
}: {
  booking: Booking;
  onClose: () => void;
  onCancel: (b: Booking) => void;
  initialTab?: "ticket" | "chat";
}) {
  const [tab, setTab] = useState<"ticket" | "chat">(initialTab);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancellable = ["pending_approval", "pending", "confirmed"].includes(b.booking_status);

  // Enrich the ticket with the experience's cover photo, meeting point and
  // provider contacts so it matches the full Voyage-style design.
  const [exp, setExp] = useState<import("@/data/repo").PublicExperience | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    repo
      .loadPublishedExperience(b.activity_id)
      .then((e) => alive && setExp(e))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [b.activity_id]);

  const t: TicketData = {
    ...bookingToTicket(b),
    coverImage: exp?.featured_image,
    meetingPoint: exp?.location_address,
    whatsapp: exp?.provider?.whatsapp,
    contactEmail: exp?.provider?.contact_email,
  };
  return (
    <Modal open onClose={onClose} title={b.experience_title}>
      <div className="mb-4 flex gap-1.5">
        <TabBtn active={tab === "ticket"} onClick={() => setTab("ticket")}>
          <TicketIcon className="h-4 w-4" /> Ticket
        </TabBtn>
        <TabBtn active={tab === "chat"} onClick={() => setTab("chat")}>
          <MessageCircle className="h-4 w-4" /> Chat con el proveedor
        </TabBtn>
      </div>

      {tab === "ticket" ? (
        <div className="space-y-4">
          <Ticket data={t} />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="flex-1" onClick={() => shareTicket(t)}>
              Compartir
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => shareTicketPdf(t)}>
              PDF
            </Button>
          </div>
          {cancellable &&
            (confirmCancel ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm font-medium">¿Cancelar esta reserva?</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Se notificará al proveedor. Aplica la política de cancelación de la experiencia.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => onCancel(b)}>
                    <Ban className="h-4 w-4" /> Sí, cancelar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(false)}>
                    No
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmCancel(true)}
                className="inline-flex items-center gap-1.5 text-sm text-destructive hover:underline"
              >
                <Ban className="h-4 w-4" /> Cancelar reserva
              </button>
            ))}
        </div>
      ) : (
        <BookingChat booking={b} />
      )}
    </Modal>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition",
        active ? "bg-ink text-background" : "border border-border text-muted-foreground hover:bg-accent"
      )}
    >
      {children}
    </button>
  );
}

function Guardados() {
  const { data } = usePublishedExperiences();
  const favIds = useFavorites();
  const list = (data ?? []).filter((e) => favIds.includes(e.id));
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl tracking-tight">Guardados</h1>
      {list.length ? (
        <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3">
          {list.map((e) => (
            <ExperienceCard key={e.id} e={e} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Heart className="h-6 w-6" />}
          title="Sin experiencias guardadas"
          body="Toca el corazón en cualquier experiencia para guardarla aquí."
          cta={<Link to="/" className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-background">Explorar</Link>}
        />
      )}
    </div>
  );
}

const REQUEST_KINDS: { value: ConciergeRequestKind; label: string }[] = [
  { value: "experiencia", label: "Experiencia a medida" },
  { value: "vehiculo", label: "Alquiler de vehículo" },
  { value: "guia", label: "Guía turístico" },
  { value: "conductor", label: "Conductor / transporte" },
  { value: "alojamiento", label: "Alojamiento" },
  { value: "otro", label: "Otro" },
];

function Concierge({ onCreated }: { onCreated: () => void }) {
  const [reqOpen, setReqOpen] = useState(false);
  const [seed, setSeed] = useState("");
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Concierge</h1>
          <p className="mt-1 text-muted-foreground">
            Pídeme ideas, reserva o gestiona tus viajes. Si algo no está en la plataforma, lo gestionamos
            como una solicitud a Akiles Travel.
          </p>
        </div>
        <Button variant="outline" className="shrink-0" onClick={() => { setSeed(""); setReqOpen(true); }}>
          <Plus className="h-4 w-4" /> Solicitud
        </Button>
      </div>

      {isLLMEnabled ? (
        <ConciergeChat onChanged={onCreated} />
      ) : (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" /> ¿Qué te gustaría hacer o necesitas?
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              "Quiero alquilar un vehículo para 3 días",
              "Necesito un guía que hable inglés en Ruta de las Flores",
              "Busco un tour privado de surf en El Tunco",
              "Necesito conductor del aeropuerto a La Libertad",
            ].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSeed(s);
                  setReqOpen(true);
                }}
                className="rounded-xl border border-border px-3 py-2 text-left text-sm transition hover:bg-accent"
              >
                {s}
              </button>
            ))}
          </div>
          <Button className="mt-3" onClick={() => { setSeed(""); setReqOpen(true); }}>
            <Plus className="h-4 w-4" /> Nueva solicitud a Akiles
          </Button>
        </div>
      )}

      {reqOpen && (
        <RequestModal
          seedTitle={seed}
          onClose={() => setReqOpen(false)}
          onCreated={() => {
            setReqOpen(false);
            onCreated();
          }}
        />
      )}
    </div>
  );
}

function Solicitudes({
  requests,
  onCreated,
}: {
  requests: ConciergeRequest[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const statusLabel: Record<string, string> = {
    nueva: "Nueva",
    en_proceso: "En proceso",
    resuelta: "Resuelta",
    cerrada: "Cerrada",
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl tracking-tight">Mis solicitudes</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Nueva
        </Button>
      </div>

      {requests.length ? (
        <div className="grid gap-3">
          {requests.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{r.title}</p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {REQUEST_KINDS.find((k) => k.value === r.kind)?.label ?? r.kind}
                  </p>
                </div>
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
                  {statusLabel[r.status] ?? r.status}
                </span>
              </div>
              {r.details && <p className="mt-2 text-sm text-foreground/80">{r.details}</p>}
              <p className="mt-2 text-xs text-muted-foreground">{fmtDate(r.created_at.slice(0, 10))}</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Inbox className="h-6 w-6" />}
          title="Sin solicitudes todavía"
          body="¿Necesitas algo que no está en la plataforma? Envíanos una solicitud y te ayudamos."
          cta={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nueva solicitud</Button>}
        />
      )}

      {open && (
        <RequestModal
          seedTitle=""
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            onCreated();
          }}
        />
      )}
    </div>
  );
}

function RequestModal({
  seedTitle,
  onClose,
  onCreated,
}: {
  seedTitle: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const user = useApp((s) => s.user);
  const profile = useApp((s) => s.touristProfile);
  const [kind, setKind] = useState<ConciergeRequestKind>("experiencia");
  const [title, setTitle] = useState(seedTitle);
  const [details, setDetails] = useState("");
  const [people, setPeople] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim() || !user) return;
    setBusy(true);
    try {
      await repo.createConciergeRequest({
        user_id: user.id,
        kind,
        title: title.trim(),
        details: details.trim(),
        contact_email: profile?.email,
        contact_phone: profile?.phone,
        people: people ? parseInt(people, 10) : undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      notify("¡Solicitud enviada a Akiles Travel! Te contactaremos pronto.");
      onCreated();
    } catch {
      notify("No pude enviar la solicitud. Intenta de nuevo.", "warning");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Solicitud a Akiles Travel">
      <div className="space-y-3">
        <div>
          <Label>Tipo</Label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ConciergeRequestKind)}
            className="h-9 w-full rounded-xl border border-input bg-card px-2 text-sm"
          >
            {REQUEST_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>¿Qué necesitas?</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Alquilar un 4x4 para 3 días" />
        </div>
        <div>
          <Label>Detalles</Label>
          <Textarea
            rows={3}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Fechas, zona, número de personas, presupuesto, requerimientos especiales…"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="min-w-0">
            <Label>Personas</Label>
            <Input type="number" value={people} onChange={(e) => setPeople(e.target.value)} />
          </div>
          <div className="min-w-0">
            <Label>Desde</Label>
            <Input type="date" className="px-3" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="min-w-0">
            <Label>Hasta</Label>
            <Input type="date" className="px-3" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        <Button className="w-full" disabled={busy || !title.trim()} onClick={submit}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar solicitud
        </Button>
      </div>
    </Modal>
  );
}

function Perfil() {
  const profile = useApp((s) => s.touristProfile);
  const setTouristProfile = useApp((s) => s.setTouristProfile);
  const [name, setName] = useState(profile?.name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [language, setLanguage] = useState(profile?.language ?? "es");
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [busy, setBusy] = useState(false);

  function toggleInterest(c: string) {
    setInterests((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  async function save() {
    if (!profile) return;
    setBusy(true);
    const next = { ...profile, name: name.trim(), phone: phone.trim(), language, interests };
    try {
      await repo.saveTouristProfile(next);
      setTouristProfile(next);
      notify("Perfil actualizado.");
    } catch {
      notify("No pude guardar. Intenta de nuevo.", "warning");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl tracking-tight">Perfil</h1>

      <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Correo</Label>
            <Input value={profile?.email ?? ""} disabled className="opacity-70" />
          </div>
          <div>
            <Label>Teléfono / WhatsApp</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+503 ..." />
          </div>
          <div>
            <Label>Idioma</Label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="h-9 w-full rounded-xl border border-input bg-card px-2 text-sm"
            >
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <div>
          <p className="font-medium">Tus intereses</p>
          <p className="text-sm text-muted-foreground">
            Ayudan al concierge a recomendarte mejor.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {EXPERIENCE_CATEGORIES.map((c) => {
            const on = interests.includes(c);
            return (
              <button
                key={c}
                onClick={() => toggleInterest(c)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm transition",
                  on ? "bg-primary/20 text-ink ring-1 ring-primary" : "border border-border text-muted-foreground hover:bg-accent"
                )}
              >
                {on && <Check className="mr-1 inline h-3 w-3" />}
                {c}
              </button>
            );
          })}
        </div>
      </div>

      <Button disabled={busy} onClick={save}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar cambios
      </Button>
    </div>
  );
}

function Ayuda() {
  const faqs = [
    { q: "¿Cómo reservo una experiencia?", a: "Explora el catálogo, abre una experiencia y toca “Reservar”. Verás tu ticket aquí en Mis viajes." },
    { q: "¿Puedo cancelar?", a: "Sí, desde Mis viajes → abre la reserva → Cancelar. Aplica la política de cancelación de cada experiencia." },
    { q: "¿Y si no encuentro lo que busco?", a: "Usa el Concierge para enviar una solicitud a Akiles Travel (vehículo, guía, conductor, o una experiencia a medida) y te ayudamos." },
  ];
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl tracking-tight">Ayuda</h1>
      <div className="divide-y divide-border rounded-2xl border border-border bg-card">
        {faqs.map((f) => (
          <div key={f.q} className="p-4">
            <p className="font-medium">{f.q}</p>
            <p className="mt-1 text-sm text-muted-foreground">{f.a}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="font-medium">¿Necesitas hablar con nosotros?</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Escríbenos y el equipo de Akiles Travel te ayudará.
        </p>
        <a
          href="https://wa.me/50300000000"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-medium text-background"
        >
          <MessageCircle className="h-4 w-4" /> Contactar soporte
        </a>
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-ink">{icon}</div>
      <p className="font-display text-xl">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
      {cta && <div className="mt-5">{cta}</div>}
    </div>
  );
}

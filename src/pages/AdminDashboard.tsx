import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useApp } from "@/state/store";
import { isSupabaseConfigured } from "@/lib/supabase";
import { authSignOut } from "@/lib/auth";
import * as repo from "@/data/repo";
import type { Booking, ConciergeRequest, ProviderProfile, TouristProfile } from "@/types/domain";
import { resolveFees, type FeeDefaults, type FeeType } from "@/lib/fees";
import { EL_SALVADOR_BANKS, type BankAccountType } from "@/lib/banks";
import { SupportChat } from "@/components/support/SupportChat";
import type { Passenger } from "@/data/repo";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { notify } from "@/state/toast";
import { formatUSD, cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Store,
  CalendarCheck,
  Inbox,
  Wallet,
  Settings,
  LogOut,
  Loader2,
  Check,
  BadgeCheck,
  Info,
  TrendingUp,
  MessageCircle,
} from "lucide-react";

type Section = "resumen" | "turistas" | "proveedores" | "reservas" | "solicitudes" | "facturacion" | "ajustes";

const NAV: { key: Section; label: string; icon: React.ElementType }[] = [
  { key: "resumen", label: "Resumen", icon: LayoutDashboard },
  { key: "turistas", label: "Turistas", icon: Users },
  { key: "proveedores", label: "Proveedores", icon: Store },
  { key: "reservas", label: "Reservas", icon: CalendarCheck },
  { key: "solicitudes", label: "Solicitudes", icon: Inbox },
  { key: "facturacion", label: "Facturación", icon: Wallet },
  { key: "ajustes", label: "Ajustes", icon: Settings },
];

const REVENUE_STATUSES = ["confirmed", "completed"];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const authReady = useApp((s) => s.authReady);
  const user = useApp((s) => s.user);
  const isAdmin = useApp((s) => s.isAdmin);

  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [section, setSection] = useState<Section>("resumen");

  const [providers, setProviders] = useState<ProviderProfile[]>([]);
  const [tourists, setTourists] = useState<TouristProfile[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [requests, setRequests] = useState<ConciergeRequest[]>([]);
  const [payouts, setPayouts] = useState<repo.Payout[]>([]);
  const [feeDefaults, setFeeDefaults] = useState<FeeDefaults | null>(null);
  const [settings, setSettings] = useState<repo.PlatformSettings>({ monthly_cost: 0, currency: "USD" });

  // Gate: confirm admin via RPC (store flag as a hint).
  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    let alive = true;
    repo
      .isAdminUser()
      .then((ok) => {
        if (!alive) return;
        setAllowed(ok);
        setReady(true);
        if (!ok) navigate("/", { replace: true });
      })
      .catch(() => alive && (setReady(true), navigate("/", { replace: true })));
    return () => {
      alive = false;
    };
  }, [authReady, user, navigate]);

  const reload = () => {
    if (!isSupabaseConfigured) return;
    repo.adminLoadProviders().then(setProviders).catch(() => {});
    repo.adminLoadTourists().then(setTourists).catch(() => {});
    repo.adminLoadBookings().then(setBookings).catch(() => {});
    repo.adminLoadRequests().then(setRequests).catch(() => {});
    repo.adminLoadPayouts().then(setPayouts).catch(() => {});
    repo.loadFeeDefaults().then(setFeeDefaults).catch(() => {});
    repo.loadPlatformSettings().then(setSettings).catch(() => {});
  };
  useEffect(() => {
    if (allowed) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const providerById = useMemo(() => new Map(providers.map((p) => [p.id, p])), [providers]);

  if (!ready || !allowed) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-secondary/30">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 sm:px-8">
          <div className="flex items-center gap-2">
            <Logo className="h-6" />
            <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-background">Admin</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
              Ver sitio
            </Link>
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
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="no-scrollbar -mx-5 mb-4 flex gap-1.5 overflow-x-auto px-5 lg:mx-0 lg:flex-col lg:gap-1 lg:px-0">
            {NAV.map((n) => (
              <button
                key={n.key}
                onClick={() => setSection(n.key)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition lg:w-full",
                  section === n.key ? "bg-ink text-background" : "text-muted-foreground hover:bg-accent"
                )}
              >
                <n.icon className="h-4 w-4" /> {n.label}
              </button>
            ))}
          </div>
        </aside>

        <main className="min-w-0">
          {section === "resumen" && (
            <Resumen
              providers={providers}
              tourists={tourists}
              bookings={bookings}
              settings={settings}
            />
          )}
          {section === "turistas" && <Turistas tourists={tourists} bookings={bookings} />}
          {section === "proveedores" && (
            <Proveedores
              providers={providers}
              bookings={bookings}
              feeDefaults={feeDefaults}
              onChanged={reload}
            />
          )}
          {section === "reservas" && (
            <Reservas bookings={bookings} providerById={providerById} onChanged={reload} />
          )}
          {section === "solicitudes" && <Solicitudes requests={requests} onChanged={reload} />}
          {section === "facturacion" && (
            <Facturacion providers={providers} bookings={bookings} payouts={payouts} onChanged={reload} />
          )}
          {section === "ajustes" && (
            <Ajustes feeDefaults={feeDefaults} settings={settings} onChanged={reload} />
          )}
        </main>
      </div>
    </div>
  );
}

// ---- Resumen (KPIs + BI) ---------------------------------------------------

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function Resumen({
  providers,
  tourists,
  bookings,
  settings,
}: {
  providers: ProviderProfile[];
  tourists: TouristProfile[];
  bookings: Booking[];
  settings: repo.PlatformSettings;
}) {
  const revenueBookings = bookings.filter((b) => REVENUE_STATUSES.includes(b.booking_status));
  const gmv = revenueBookings.reduce((s, b) => s + b.total_paid, 0);
  const platformRevenue = revenueBookings.reduce(
    (s, b) => s + b.service_fee_paid + (b.platform_commission ?? 0),
    0
  );
  const touristCount = tourists.length;
  const providerCount = providers.length;
  const avgTicket = revenueBookings.length ? gmv / revenueBookings.length : 0;
  const ltv = touristCount ? platformRevenue / touristCount : 0;
  const profit = platformRevenue - settings.monthly_cost;

  // Signup growth: last 30d vs previous 30d (tourists + providers).
  const created = [
    ...tourists.map((t) => t.created_at?.slice(0, 10) ?? ""),
    ...providers.map((p) => p.created_at?.slice(0, 10) ?? ""),
  ].filter(Boolean);
  const d30 = daysAgoISO(30);
  const d60 = daysAgoISO(60);
  const last30 = created.filter((c) => c >= d30).length;
  const prev30 = created.filter((c) => c >= d60 && c < d30).length;
  const growth = prev30 ? (last30 - prev30) / prev30 : last30 > 0 ? 1 : 0;
  const projNextSignups = Math.round(last30 * (1 + growth));

  // Revenue in the last 30d for a simple projection.
  const rev30 = revenueBookings
    .filter((b) => (b.created_at?.slice(0, 10) ?? "") >= d30)
    .reduce((s, b) => s + b.service_fee_paid + (b.platform_commission ?? 0), 0);
  const projRev = rev30 * (1 + growth);

  const kpis: { label: string; value: string; hint: string }[] = [
    { label: "Turistas", value: String(touristCount), hint: "Cuentas de turista registradas. Base de demanda de la plataforma." },
    { label: "Proveedores", value: String(providerCount), hint: "Negocios dados de alta. Base de oferta de experiencias." },
    { label: "Reservas (con ingreso)", value: String(revenueBookings.length), hint: "Reservas confirmadas o completadas — las que generan ingreso." },
    { label: "Monto facturado (GMV)", value: formatUSD(gmv), hint: "Volumen bruto transaccionado (lo que pagan los turistas). Mide el tamaño del negocio." },
    { label: "Ingresos plataforma", value: formatUSD(platformRevenue), hint: "Lo que gana Akiles: cargo al turista + comisión al proveedor. Es tu ingreso real." },
    { label: "Ticket promedio", value: formatUSD(avgTicket), hint: "GMV ÷ reservas. Cuánto gasta en promedio un turista por reserva." },
    { label: "LTV por turista", value: formatUSD(ltv), hint: "Ingreso de plataforma ÷ turistas. Valor promedio que aporta cada turista (proxy simple)." },
    { label: "Costos mensuales", value: formatUSD(settings.monthly_cost), hint: "Costos fijos de operar la plataforma (configúralo en Ajustes)." },
    { label: "Utilidad estimada", value: formatUSD(profit), hint: "Ingresos de plataforma − costos. Positiva = el negocio es rentable a este ritmo." },
    { label: "Altas últimos 30 días", value: String(last30), hint: "Nuevos turistas + proveedores en 30 días. Mide el ritmo de crecimiento." },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight">Resumen</h1>
        <p className="mt-1 text-muted-foreground">
          Salud y crecimiento de Akiles Travel. Cada tarjeta explica qué mide.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="group relative rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            </div>
            <p className="mt-1 font-display text-2xl leading-tight">{k.value}</p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{k.hint}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-1 inline-flex items-center gap-2 font-display text-lg">
          <TrendingUp className="h-5 w-5 text-teal" /> Proyección (próximos 30 días)
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Estimación simple según la tasa de crecimiento reciente ({Math.round(growth * 100)}% vs. los 30
          días previos). Es una guía, no una garantía.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-secondary/50 p-4">
            <p className="text-xs text-muted-foreground">Altas proyectadas</p>
            <p className="font-display text-2xl">{projNextSignups}</p>
            <p className="text-[11px] text-muted-foreground">Nuevos usuarios si el ritmo se mantiene.</p>
          </div>
          <div className="rounded-xl bg-secondary/50 p-4">
            <p className="text-xs text-muted-foreground">Ingresos proyectados</p>
            <p className="font-display text-2xl">{formatUSD(projRev)}</p>
            <p className="text-[11px] text-muted-foreground">
              Ingreso de plataforma estimado (base: {formatUSD(rev30)} en los últimos 30 días).
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

// ---- Turistas --------------------------------------------------------------

function Turistas({ tourists, bookings }: { tourists: TouristProfile[]; bookings: Booking[] }) {
  const [open, setOpen] = useState<TouristProfile | null>(null);
  const [tab, setTab] = useState<"info" | "chat">("info");
  const bookingsOf = (uid: string) => bookings.filter((b) => b.user_id === uid);
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl tracking-tight">Turistas</h1>
      <div className="grid gap-2">
        {tourists.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
          >
            <button
              onClick={() => {
                setTab("info");
                setOpen(t);
              }}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{t.name || "Sin nombre"}</p>
                <p className="truncate text-sm text-muted-foreground">{t.email}</p>
              </div>
            </button>
            <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-xs">
              {bookingsOf(t.id).length}
            </span>
            <button
              onClick={() => {
                setTab("chat");
                setOpen(t);
              }}
              title="Chat de soporte"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-teal transition hover:bg-accent"
            >
              <MessageCircle className="h-4 w-4" />
            </button>
          </div>
        ))}
        {tourists.length === 0 && <Empty text="Aún no hay turistas registrados." />}
      </div>

      {open && (
        <Modal open onClose={() => setOpen(null)} title={open.name || open.email}>
          <div className="mb-3 flex gap-1.5">
            <MiniTab active={tab === "info"} onClick={() => setTab("info")}>Info y reservas</MiniTab>
            <MiniTab active={tab === "chat"} onClick={() => setTab("chat")}>
              <MessageCircle className="h-3.5 w-3.5" /> Chat de soporte
            </MiniTab>
          </div>
          {tab === "info" ? (
            <div className="space-y-3 text-sm">
              <Field k="Correo" v={open.email} />
              {open.phone && <Field k="Teléfono" v={open.phone} />}
              {open.interests?.length > 0 && <Field k="Intereses" v={open.interests.join(", ")} />}
              <div>
                <p className="mb-1 font-medium">Reservas</p>
                <div className="grid gap-2">
                  {bookingsOf(open.id).map((b) => (
                    <div key={b.id} className="rounded-xl border border-border p-2.5">
                      <p className="font-medium">{b.experience_title}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.scheduled_date} {b.scheduled_time} · {b.booking_status} · {formatUSD(b.total_paid)}
                      </p>
                    </div>
                  ))}
                  {bookingsOf(open.id).length === 0 && <p className="text-muted-foreground">Sin reservas.</p>}
                </div>
              </div>
            </div>
          ) : (
            <SupportChat kind="user" refId={open.id} role="admin" emptyHint="Escríbele al turista para darle soporte." />
          )}
        </Modal>
      )}
    </div>
  );
}

// ---- Proveedores -----------------------------------------------------------

function Proveedores({
  providers,
  bookings,
  feeDefaults,
  onChanged,
}: {
  providers: ProviderProfile[];
  bookings: Booking[];
  feeDefaults: FeeDefaults | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<ProviderProfile | null>(null);
  const [tab, setTab] = useState<"gestion" | "chat">("gestion");
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl tracking-tight">Proveedores</h1>
      <div className="grid gap-2">
        {providers.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
          >
            <button
              onClick={() => {
                setTab("gestion");
                setOpen(p);
              }}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{p.business_name}</p>
                <p className="truncate text-sm text-muted-foreground">{p.contact_email || p.city || "—"}</p>
              </div>
            </button>
            <VerifPill status={p.verification_status} />
            <button
              onClick={() => {
                setTab("chat");
                setOpen(p);
              }}
              title="Chat con proveedor"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-teal transition hover:bg-accent"
            >
              <MessageCircle className="h-4 w-4" />
            </button>
          </div>
        ))}
        {providers.length === 0 && <Empty text="Aún no hay proveedores." />}
      </div>

      {open && (
        <ProviderModal
          provider={open}
          initialTab={tab}
          bookings={bookings.filter((b) => b.activity_id_ref === open.id)}
          feeDefaults={feeDefaults}
          onClose={() => setOpen(null)}
          onChanged={() => {
            onChanged();
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}

function ProviderModal({
  provider,
  initialTab = "gestion",
  bookings,
  feeDefaults,
  onClose,
  onChanged,
}: {
  provider: ProviderProfile;
  initialTab?: "gestion" | "chat";
  bookings: Booking[];
  feeDefaults: FeeDefaults | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const eff = resolveFees(provider, feeDefaults ?? undefined);
  const [tab, setTab] = useState<"gestion" | "chat">(initialTab);
  const [tType, setTType] = useState<FeeType>(eff.tourist.type);
  const [tVal, setTVal] = useState(String(eff.tourist.value));
  const [cType, setCType] = useState<FeeType>(eff.commission.type);
  const [cVal, setCVal] = useState(String(eff.commission.value));
  const [busy, setBusy] = useState(false);

  const usesDefault =
    provider.tourist_fee_value == null && provider.commission_value == null;

  async function saveFees() {
    setBusy(true);
    try {
      await repo.adminSetProviderFees(provider.id, {
        tourist_fee_type: tType,
        tourist_fee_value: parseFloat(tVal) || 0,
        commission_type: cType,
        commission_value: parseFloat(cVal) || 0,
      });
      notify("Tarifas del proveedor actualizadas.");
      onChanged();
    } catch {
      notify("No pude guardar las tarifas.", "warning");
    } finally {
      setBusy(false);
    }
  }

  async function setVerification(status: string) {
    setBusy(true);
    try {
      await repo.adminSetProviderVerification(provider.id, status);
      notify(`Proveedor: ${status}.`);
      onChanged();
    } catch {
      notify("No pude actualizar la verificación.", "warning");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={provider.business_name}>
      <div className="mb-3 flex gap-1.5">
        <MiniTab active={tab === "gestion"} onClick={() => setTab("gestion")}>Gestión</MiniTab>
        <MiniTab active={tab === "chat"} onClick={() => setTab("chat")}>
          <MessageCircle className="h-3.5 w-3.5" /> Chat con proveedor
        </MiniTab>
      </div>
      {tab === "chat" ? (
        <SupportChat
          kind="user"
          refId={provider.user_id}
          role="admin"
          emptyHint="Escríbele al proveedor para resolver dudas o consultas."
        />
      ) : (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <VerifPill status={provider.verification_status} />
          <div className="ml-auto flex gap-2">
            {provider.verification_status !== "approved" && (
              <Button size="sm" disabled={busy} onClick={() => setVerification("approved")}>
                <BadgeCheck className="h-4 w-4" /> Aprobar
              </Button>
            )}
            {provider.verification_status !== "rejected" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setVerification("rejected")}>
                Rechazar
              </Button>
            )}
          </div>
        </div>

        {/* Fees */}
        <div className="rounded-2xl border border-border p-4">
          <p className="font-medium">Tarifas de este proveedor</p>
          <p className="mb-3 text-xs text-muted-foreground">
            {usesDefault ? "Usando el default global. " : "Configuración propia. "}
            Cargo al turista = se suma al precio en el checkout. Comisión = se retiene del proveedor.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FeeInput label="Cargo al turista" type={tType} value={tVal} onType={setTType} onValue={setTVal} />
            <FeeInput label="Comisión al proveedor" type={cType} value={cVal} onType={setCType} onValue={setCVal} />
          </div>
          <div className="mt-3 rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground">
            Ejemplo con experiencia de $100: el turista paga{" "}
            <b className="text-foreground">
              {formatUSD(100 + (tType === "percent" ? (parseFloat(tVal) || 0) : parseFloat(tVal) || 0))}
            </b>{" "}
            y al proveedor se le pagan{" "}
            <b className="text-foreground">
              {formatUSD(100 - (cType === "percent" ? (parseFloat(cVal) || 0) : parseFloat(cVal) || 0))}
            </b>
            .
          </div>
          <Button className="mt-3" disabled={busy} onClick={saveFees}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar tarifas
          </Button>
        </div>

        <div>
          <p className="mb-1 text-sm font-medium">Reservas ({bookings.length})</p>
          <div className="grid max-h-52 gap-2 overflow-y-auto">
            {bookings.slice(0, 30).map((b) => (
              <div key={b.id} className="rounded-xl border border-border p-2.5 text-sm">
                <p className="font-medium">{b.experience_title}</p>
                <p className="text-xs text-muted-foreground">
                  {b.scheduled_date} · {b.booking_status} · paga {formatUSD(b.total_paid)} · neto{" "}
                  {formatUSD(b.provider_payout ?? b.subtotal_paid)}
                </p>
              </div>
            ))}
            {bookings.length === 0 && <p className="text-sm text-muted-foreground">Sin reservas.</p>}
          </div>
        </div>
      </div>
      )}
    </Modal>
  );
}

function FeeInput({
  label,
  type,
  value,
  onType,
  onValue,
}: {
  label: string;
  type: FeeType;
  value: string;
  onType: (t: FeeType) => void;
  onValue: (v: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-2">
        <select
          value={type}
          onChange={(e) => onType(e.target.value as FeeType)}
          className="h-11 rounded-xl border border-input bg-card px-2 text-sm"
        >
          <option value="percent">%</option>
          <option value="fixed">$ fijo</option>
        </select>
        <Input type="number" inputMode="decimal" value={value} onChange={(e) => onValue(e.target.value)} />
      </div>
    </div>
  );
}

// ---- Reservas --------------------------------------------------------------

function Reservas({
  bookings,
  providerById,
  onChanged,
}: {
  bookings: Booking[];
  providerById: Map<string, ProviderProfile>;
  onChanged: () => void;
}) {
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Booking | null>(null);
  const filtered = bookings.filter(
    (b) =>
      !q ||
      b.experience_title.toLowerCase().includes(q.toLowerCase()) ||
      b.contact_name.toLowerCase().includes(q.toLowerCase()) ||
      b.confirmation_code.toLowerCase().includes(q.toLowerCase())
  );

  async function cancel(b: Booking) {
    try {
      await repo.updateBookingStatus(b.id, "cancelled");
      notify("Reserva cancelada.");
      onChanged();
    } catch {
      notify("No pude cancelar.", "warning");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl tracking-tight">Reservas</h1>
      <Input placeholder="Buscar por experiencia, cliente o código…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="grid gap-2">
        {filtered.slice(0, 100).map((b) => (
          <div key={b.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{b.experience_title}</p>
                <p className="text-xs text-muted-foreground">
                  {b.contact_name} · {b.scheduled_date} {b.scheduled_time} · {b.confirmation_code}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {providerById.get(b.activity_id_ref ?? "")?.business_name ?? "—"} · paga{" "}
                  {formatUSD(b.total_paid)} · comisión {formatUSD(b.platform_commission ?? 0)} · neto{" "}
                  {formatUSD(b.provider_payout ?? b.subtotal_paid)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <StatusPill status={b.booking_status} />
                <div className="flex gap-2">
                  <button onClick={() => setEdit(b)} className="text-xs text-teal hover:underline">
                    Editar
                  </button>
                  {["pending_approval", "pending", "confirmed"].includes(b.booking_status) && (
                    <button onClick={() => cancel(b)} className="text-xs text-destructive hover:underline">
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <Empty text="Sin reservas." />}
      </div>

      {edit && (
        <BookingEditModal
          booking={edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function BookingEditModal({
  booking,
  onClose,
  onSaved,
}: {
  booking: Booking;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(booking.contact_name);
  const [email, setEmail] = useState(booking.contact_email);
  const [pax, setPax] = useState<{ name: string; kind?: "adult" | "child"; email?: string; phone?: string }[]>(
    booking.passengers && booking.passengers.length
      ? booking.passengers
      : [{ name: booking.contact_name, kind: "adult", phone: "" }]
  );
  const [busy, setBusy] = useState(false);

  function setPaxField(i: number, field: "name" | "phone", value: string) {
    setPax((prev) => prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)));
  }

  async function save() {
    setBusy(true);
    try {
      await repo.adminUpdateBooking(booking.id, {
        contact_name: name.trim(),
        contact_email: email.trim(),
        passengers: pax.map((p) => ({ ...p, name: p.name.trim() })) as Passenger[],
      });
      notify("Reserva actualizada.");
      onSaved();
    } catch {
      notify("No pude actualizar la reserva.", "warning");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Editar reserva">
      <div className="space-y-4">
        <div className="rounded-xl bg-secondary/40 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">{booking.experience_title}</p>
          <p>
            {booking.scheduled_date} {booking.scheduled_time} · {booking.confirmation_code} ·{" "}
            {booking.booking_status} · {formatUSD(booking.total_paid)}
          </p>
          <p className="mt-1">Solo datos del cliente; el precio y el proveedor no cambian.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Nombre del titular</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Correo del titular</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Asistentes</Label>
          <div className="grid gap-2">
            {pax.map((p, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={p.name}
                  onChange={(e) => setPaxField(i, "name", e.target.value)}
                  placeholder={`Asistente ${i + 1}${i === 0 ? " (titular)" : ""}`}
                />
                {i === 0 && (
                  <Input
                    value={p.phone ?? ""}
                    onChange={(e) => setPaxField(i, "phone", e.target.value)}
                    placeholder="Teléfono"
                    className="max-w-[40%]"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <Button className="w-full" disabled={busy} onClick={save}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar cambios
        </Button>
      </div>
    </Modal>
  );
}

// ---- Solicitudes -----------------------------------------------------------

const REQ_STATUSES = ["nueva", "en_proceso", "resuelta", "cerrada"];

function Solicitudes({ requests, onChanged }: { requests: ConciergeRequest[]; onChanged: () => void }) {
  const [open, setOpen] = useState<ConciergeRequest | null>(null);
  async function setStatus(id: string, status: string) {
    try {
      await repo.adminSetRequestStatus(id, status);
      notify("Solicitud actualizada.");
      onChanged();
    } catch {
      notify("No pude actualizar.", "warning");
    }
  }
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl tracking-tight">Solicitudes</h1>
      <div className="grid gap-2">
        {requests.map((r) => (
          <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{r.title}</p>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{r.kind}</p>
                {r.details && <p className="mt-1 text-sm text-foreground/80">{r.details}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.contact_email ?? ""} {r.people ? `· ${r.people} pers.` : ""}{" "}
                  {r.date_from ? `· ${r.date_from}${r.date_to ? ` → ${r.date_to}` : ""}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <select
                  value={r.status}
                  onChange={(e) => setStatus(r.id, e.target.value)}
                  className="h-9 rounded-xl border border-input bg-card px-2 text-sm"
                >
                  {REQ_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button onClick={() => setOpen(r)} className="inline-flex items-center gap-1 text-xs text-teal hover:underline">
                  <MessageCircle className="h-3.5 w-3.5" /> Abrir y chatear
                </button>
              </div>
            </div>
          </div>
        ))}
        {requests.length === 0 && <Empty text="Sin solicitudes." />}
      </div>

      {open && (
        <Modal open onClose={() => setOpen(null)} title={open.title}>
          <div className="mb-3 space-y-1 rounded-xl bg-secondary/40 p-3 text-xs text-muted-foreground">
            <p className="text-sm font-medium text-foreground">{open.title}</p>
            <p className="uppercase tracking-wide">{open.kind}</p>
            {open.details && <p className="text-foreground/80">{open.details}</p>}
            <p>
              {open.contact_email ?? ""} {open.people ? `· ${open.people} pers.` : ""}{" "}
              {open.date_from ? `· ${open.date_from}${open.date_to ? ` → ${open.date_to}` : ""}` : ""}
            </p>
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            Chatea con el turista como Akiles Travel. Puedes enviarle una experiencia (búscala por
            proveedor) o el contacto de un proveedor/guía externo de confianza.
          </p>
          <SupportChat
            kind="request"
            refId={open.id}
            role="admin"
            emptyHint="Escríbele al turista para ayudarle con esta solicitud."
          />
        </Modal>
      )}
    </div>
  );
}

// ---- Facturación -----------------------------------------------------------

function Facturacion({
  providers,
  bookings,
  payouts,
  onChanged,
}: {
  providers: ProviderProfile[];
  bookings: Booking[];
  payouts: repo.Payout[];
  onChanged: () => void;
}) {
  const rows = providers.map((p) => {
    const own = bookings.filter(
      (b) => b.activity_id_ref === p.id && REVENUE_STATUSES.includes(b.booking_status)
    );
    const unpaid = own.filter((b) => !b.payout_id);
    const retained = own.reduce((s, b) => s + (b.platform_commission ?? 0), 0);
    const toPay = unpaid.reduce((s, b) => s + (b.provider_payout ?? b.subtotal_paid), 0);
    return { p, own, unpaid, retained, toPay };
  });

  const [payProvider, setPayProvider] = useState<{ p: ProviderProfile; unpaid: Booking[] } | null>(null);

  async function revert(po: repo.Payout) {
    try {
      await repo.adminRevertPayout(po);
      notify("Pago revertido. Las reservas volvieron a pendientes.");
      onChanged();
    } catch {
      notify("No pude revertir el pago.", "warning");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl tracking-tight">Facturación</h1>
      <p className="text-sm text-muted-foreground">
        Por proveedor: <b>retenido</b> = comisión que gana Akiles · <b>a pagar</b> = neto pendiente de
        transferir al proveedor. Al registrar un pago eliges las reservas a cubrir y guardas los datos del
        depósito.
      </p>
      <div className="grid gap-2">
        {rows.map(({ p, unpaid, retained, toPay }) => (
          <div key={p.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{p.business_name}</p>
                <p className="text-xs text-muted-foreground">
                  Retenido {formatUSD(retained)} · A pagar {formatUSD(toPay)} · {unpaid.length} reservas
                  pendientes
                </p>
              </div>
              <Button size="sm" disabled={!unpaid.length} onClick={() => setPayProvider({ p, unpaid })}>
                <Wallet className="h-4 w-4" /> Registrar pago
              </Button>
            </div>
          </div>
        ))}
        {rows.length === 0 && <Empty text="Sin proveedores." />}
      </div>

      {payouts.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-lg">Pagos registrados</h2>
          <div className="grid gap-2">
            {payouts.map((po) => {
              const reverted = po.status === "reverted";
              return (
                <div key={po.id} className="rounded-xl border border-border bg-card p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {providers.find((p) => p.id === po.provider_profile_id)?.business_name ?? "Proveedor"}{" "}
                        · {po.created_at.slice(0, 10)}
                        {reverted && <span className="ml-2 text-destructive">(revertido)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {po.booking_ids.length} reserva(s)
                        {po.bank_name ? ` · ${po.bank_name}` : ""}
                        {po.account_number ? ` · cta ${po.account_number}` : ""}
                        {po.transfer_ref ? ` · ref ${po.transfer_ref}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className={cn("font-medium", reverted && "line-through text-muted-foreground")}>
                        {formatUSD(po.amount)}
                      </span>
                      {!reverted && (
                        <button onClick={() => revert(po)} className="text-xs text-destructive hover:underline">
                          Revertir
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {payProvider && (
        <PayoutModal
          provider={payProvider.p}
          unpaid={payProvider.unpaid}
          onClose={() => setPayProvider(null)}
          onDone={() => {
            setPayProvider(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function PayoutModal({
  provider,
  unpaid,
  onClose,
  onDone,
}: {
  provider: ProviderProfile;
  unpaid: Booking[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(unpaid.map((b) => b.id)));
  const ba = provider.bank_account;
  const [bank, setBank] = useState(ba?.bank ?? "");
  const [account, setAccount] = useState(ba?.account_number ?? "");
  const [accountType, setAccountType] = useState<BankAccountType>(ba?.account_type ?? "ahorro");
  const [holder, setHolder] = useState(ba?.holder_name ?? provider.business_name);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);

  const payoutOf = (b: Booking) => b.provider_payout ?? b.subtotal_paid;
  const selectedSum = unpaid.filter((b) => selected.has(b.id)).reduce((s, b) => s + payoutOf(b), 0);
  const [amount, setAmount] = useState(String(selectedSum.toFixed(2)));
  // Keep the amount in sync with the selection unless the admin edited it away.
  useEffect(() => {
    setAmount(selectedSum.toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function submit() {
    const ids = [...selected];
    if (!ids.length || !bank || !account.trim()) {
      notify("Selecciona reservas y completa banco y número de cuenta.", "warning");
      return;
    }
    setBusy(true);
    try {
      const bankData = {
        bank,
        account_number: account.trim(),
        account_type: accountType,
        holder_name: holder.trim() || provider.business_name,
      };
      await repo.adminSetProviderBank(provider.id, bankData);
      await repo.adminCreatePayout({
        provider_profile_id: provider.id,
        amount: parseFloat(amount) || selectedSum,
        booking_ids: ids,
        bank_name: bankData.bank,
        account_number: bankData.account_number,
        account_type: bankData.account_type,
        holder_name: bankData.holder_name,
        transfer_ref: ref.trim() || undefined,
      });
      notify(`Pago registrado: ${formatUSD(parseFloat(amount) || selectedSum)}.`);
      onDone();
    } catch {
      notify("No pude registrar el pago.", "warning");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Pagar a ${provider.business_name}`}>
      <div className="space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-medium">Reservas a pagar</p>
            <button
              onClick={() =>
                setSelected((s) => (s.size === unpaid.length ? new Set() : new Set(unpaid.map((b) => b.id))))
              }
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {selected.size === unpaid.length ? "Quitar todas" : "Seleccionar todas"}
            </button>
          </div>
          <div className="grid max-h-44 gap-1.5 overflow-y-auto">
            {unpaid.map((b) => (
              <label
                key={b.id}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-border p-2.5 text-sm"
              >
                <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} className="h-4 w-4" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{b.experience_title}</span>
                  <span className="text-xs text-muted-foreground">
                    {b.scheduled_date} · {b.confirmation_code}
                  </span>
                </span>
                <span className="shrink-0 font-medium">{formatUSD(payoutOf(b))}</span>
              </label>
            ))}
            {unpaid.length === 0 && <p className="text-sm text-muted-foreground">Sin reservas pendientes.</p>}
          </div>
        </div>

        {/* Bank / deposit details */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Banco</Label>
            <select
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              className="h-11 w-full rounded-xl border border-input bg-card px-2 text-sm"
            >
              <option value="">Selecciona banco…</option>
              {EL_SALVADOR_BANKS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Número de cuenta</Label>
            <Input value={account} onChange={(e) => setAccount(e.target.value)} />
          </div>
          <div>
            <Label>Tipo de cuenta</Label>
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value as BankAccountType)}
              className="h-11 w-full rounded-xl border border-input bg-card px-2 text-sm"
            >
              <option value="ahorro">Ahorro</option>
              <option value="corriente">Corriente</option>
            </select>
          </div>
          <div>
            <Label>Titular (persona o negocio)</Label>
            <Input value={holder} onChange={(e) => setHolder(e.target.value)} />
          </div>
          <div>
            <Label>N° / referencia de transferencia (opcional)</Label>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Monto a depositar</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Autorellenado con la suma de las reservas seleccionadas ({formatUSD(selectedSum)}). Puedes ajustarlo.
            </p>
          </div>
        </div>

        <Button className="w-full" disabled={busy || !selected.size} onClick={submit}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />} Registrar pago de{" "}
          {formatUSD(parseFloat(amount) || selectedSum)}
        </Button>
      </div>
    </Modal>
  );
}

// ---- Ajustes ---------------------------------------------------------------

function Ajustes({
  feeDefaults,
  settings,
  onChanged,
}: {
  feeDefaults: FeeDefaults | null;
  settings: repo.PlatformSettings;
  onChanged: () => void;
}) {
  const [tType, setTType] = useState<FeeType>(feeDefaults?.tourist_fee_type ?? "percent");
  const [tVal, setTVal] = useState(String(feeDefaults?.tourist_fee_value ?? 10));
  const [cType, setCType] = useState<FeeType>(feeDefaults?.commission_type ?? "percent");
  const [cVal, setCVal] = useState(String(feeDefaults?.commission_value ?? 10));
  const [cost, setCost] = useState(String(settings.monthly_cost));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await repo.saveFeeDefaults({
        tourist_fee_type: tType,
        tourist_fee_value: parseFloat(tVal) || 0,
        commission_type: cType,
        commission_value: parseFloat(cVal) || 0,
      });
      await repo.savePlatformSettings({ monthly_cost: parseFloat(cost) || 0, currency: settings.currency });
      notify("Ajustes guardados.");
      onChanged();
    } catch {
      notify("No pude guardar los ajustes.", "warning");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl tracking-tight">Ajustes</h1>

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="font-medium">Tarifas por defecto (global)</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Se aplican a proveedores sin configuración propia. Puedes sobreescribir por proveedor en su ficha.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <FeeInput label="Cargo al turista" type={tType} value={tVal} onType={setTType} onValue={setTVal} />
          <FeeInput label="Comisión al proveedor" type={cType} value={cVal} onType={setCType} onValue={setCVal} />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="font-medium">Costos mensuales</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Costo fijo de operar la plataforma. Se usa para calcular la utilidad en el Resumen.
        </p>
        <div className="max-w-xs">
          <Label>Costo mensual (USD)</Label>
          <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
      </div>

      <Button disabled={busy} onClick={save}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar ajustes
      </Button>
    </div>
  );
}

// ---- shared bits -----------------------------------------------------------

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}

function MiniTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}

function VerifPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: "bg-emerald-100 text-emerald-800",
    pending: "bg-amber-100 text-amber-800",
    rejected: "bg-destructive/10 text-destructive",
  };
  const label: Record<string, string> = { approved: "Verificado", pending: "Pendiente", rejected: "Rechazado" };
  return (
    <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium", map[status] ?? "bg-secondary")}>
      {label[status] ?? status}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmed: "bg-emerald-100 text-emerald-800",
    pending_approval: "bg-amber-100 text-amber-800",
    pending: "bg-amber-100 text-amber-800",
    completed: "bg-secondary text-muted-foreground",
    cancelled: "bg-destructive/10 text-destructive",
    rejected: "bg-destructive/10 text-destructive",
  };
  return <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", map[status] ?? "bg-secondary")}>{status}</span>;
}

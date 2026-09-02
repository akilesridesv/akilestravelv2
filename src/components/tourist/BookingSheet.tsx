import { useEffect, useMemo, useState } from "react";
import type { PublicExperience } from "@/data/repo";
import type { Booking, TicketTier } from "@/types/domain";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { bookableDepartures, bookableDates, departuresOn, type Departure } from "@/lib/availability";
import { BookingCalendar } from "@/components/tourist/BookingCalendar";
import { Ticket } from "@/components/tourist/Ticket";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useApp } from "@/state/store";
import * as repo from "@/data/repo";
import type { Passenger } from "@/data/repo";
import { notify } from "@/state/toast";
import { formatUSD, parseISODate, dayName, monthName, uid, cn } from "@/lib/utils";
import { resolveFees, computeFees, FALLBACK_FEE_DEFAULTS, type FeeDefaults } from "@/lib/fees";
import { shareExperience } from "@/lib/share";
import { addHours } from "@/ai/nlp";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Users,
  Clock,
  Calendar as CalendarIcon,
  MessageCircle,
  Mail,
  Loader2,
  ShieldCheck,
  Baby,
  User,
  Ticket as TicketIcon,
  Tag,
  MapPin,
  Share2,
} from "lucide-react";

const round2 = (n: number) => Math.round(n * 100) / 100;

// Demo promo codes (no real payment in this version).
const PROMOS: Record<string, { kind: "pct" | "flat"; value: number; label: string }> = {
  AKILES10: { kind: "pct", value: 0.1, label: "10% de descuento" },
  BIENVENIDO: { kind: "flat", value: 5, label: "$5 de descuento" },
};

// Unique registration code that always mixes letters AND numbers (e.g. AKT-QWK728).
function genCode(): string {
  const L = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const N = "23456789";
  const pick = (set: string, n: number) =>
    Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join("");
  return `AKT-${pick(L, 3)}${pick(N, 3)}`;
}

function dateChip(iso: string): string {
  const d = parseISODate(iso);
  const dn = dayName(d.getDay()).slice(0, 3);
  return `${dn.charAt(0).toUpperCase()}${dn.slice(1)} ${d.getDate()} ${monthName(d.getMonth()).slice(0, 3)}`;
}

function fullDate(iso: string): string {
  const d = parseISODate(iso);
  const dn = dayName(d.getDay());
  return `${dn.charAt(0).toUpperCase()}${dn.slice(1)} ${d.getDate()} de ${monthName(d.getMonth())}`;
}

type Step = "date" | "time" | "people" | "details" | "review" | "done";
const ORDER: Step[] = ["date", "time", "people", "details", "review"];

export function BookingSheet({
  experience,
  open,
  onClose,
  initialDate,
  initialTime,
  initialPeople,
}: {
  experience: PublicExperience;
  open: boolean;
  onClose: () => void;
  initialDate?: string;
  initialTime?: string;
  initialPeople?: number;
}) {
  const addBooking = useApp((s) => s.addBooking);
  // Link the booking to the tourist's account when they're signed in.
  const touristUserId = useApp((s) => (s.role === "tourist" ? s.user?.id : undefined));
  const touristProfile = useApp((s) => s.touristProfile);
  const [feeDefaults, setFeeDefaults] = useState<FeeDefaults>(FALLBACK_FEE_DEFAULTS);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    repo.loadFeeDefaults().then((d) => alive && setFeeDefaults(d)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const deps = useMemo(() => bookableDepartures(experience), [experience]);
  const dates = useMemo(() => bookableDates(deps), [deps]);

  const [step, setStep] = useState<Step>("date");
  const [date, setDate] = useState(initialDate && dates.includes(initialDate) ? initialDate : dates[0] ?? "");
  const times = departuresOn(deps, date);
  const [time, setTime] = useState(
    initialTime && times.some((t) => t.time === initialTime) ? initialTime : times[0]?.time ?? ""
  );
  const dep: Departure | undefined = times.find((t) => t.time === time) ?? times[0];

  // Tiers offered on this departure (empty tier_ids = all tiers of the experience)
  const offeredTiers: TicketTier[] =
    experience.tiers.length && dep
      ? dep.tier_ids.length
        ? experience.tiers.filter((t) => dep.tier_ids.includes(t.id))
        : experience.tiers
      : [];
  const [tierId, setTierId] = useState<string | null>(offeredTiers[0]?.id ?? null);
  const tier = offeredTiers.find((t) => t.id === tierId) ?? null;

  // Live remaining capacity = configured capacity − seats already booked.
  const [booked, setBooked] = useState<number | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured || !date || !time) {
      setBooked(0);
      return;
    }
    let alive = true;
    setBooked(null); // loading
    repo
      .loadSlotBooked(experience.id, date, time)
      .then((n) => alive && setBooked(n))
      .catch(() => alive && setBooked(0));
    return () => {
      alive = false;
    };
  }, [experience.id, date, time]);

  const capacity = Math.min(dep?.capacity ?? experience.max_capacity, experience.max_capacity);
  const remaining = booked == null ? capacity : Math.max(0, capacity - booked);
  const minPeople = Math.max(1, experience.min_capacity || 1);
  const soldOut = booked != null && remaining <= 0;
  const belowMin = !soldOut && booked != null && remaining < minPeople;
  const canBook = !soldOut && !belowMin;
  const maxPeople = Math.max(minPeople, Math.min(remaining, experience.max_capacity));
  const floorPeople = Math.min(minPeople, maxPeople);

  // People split into adults / children. At least one adult; total respects min/max.
  const seed = initialPeople && initialPeople > 0 ? initialPeople : minPeople;
  const [adults, setAdults] = useState(Math.max(1, seed));
  const [children, setChildren] = useState(0);
  const people = adults + children;
  useEffect(() => {
    // Clamp the total into [floor, max] if capacity changed under us.
    if (people > maxPeople) {
      const over = people - maxPeople;
      setChildren((c) => Math.max(0, c - over));
      setAdults((a) => Math.max(1, a - Math.max(0, over - children)));
    } else if (people < floorPeople) {
      setAdults((a) => a + (floorPeople - people));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorPeople, maxPeople]);

  // Per-passenger details. Index 0 is the main contact (name + email + phone).
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  useEffect(() => {
    setPassengers((prev) => {
      const next: Passenger[] = [];
      for (let i = 0; i < adults; i++)
        next.push(prev[i]?.kind === "adult" ? prev[i] : { name: prev[i]?.name ?? "", kind: "adult" });
      for (let i = 0; i < children; i++) {
        const src = prev[adults + i];
        next.push(src?.kind === "child" ? src : { name: src?.name ?? "", kind: "child" });
      }
      // carry email/phone onto the first slot, prefilling from the tourist's
      // account when signed in and the field is still empty.
      if (next[0]) {
        next[0] = {
          ...next[0],
          name: next[0].name || touristProfile?.name || "",
          email: prev[0]?.email ?? touristProfile?.email ?? "",
          phone: prev[0]?.phone ?? touristProfile?.phone ?? "",
        };
      }
      return next;
    });
  }, [adults, children]);

  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<{ code: string; discount: number; label: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [code, setCode] = useState("");
  const [finalStatus, setFinalStatus] = useState<Booking["booking_status"]>("pending_approval");

  const unit = tier ? tier.price : experience.price_per_person;
  const subtotal = round2(unit * people);
  const discount = promo ? Math.min(promo.discount, subtotal) : 0;
  // Tourist service fee comes from the provider's config (or the global
  // default). It's ADDED on top of the price at checkout.
  const resolvedFees = useMemo(() => resolveFees(experience.provider, feeDefaults), [
    experience.provider,
    feeDefaults,
  ]);
  const breakdown = useMemo(
    () => computeFees(round2(subtotal - discount), resolvedFees),
    [subtotal, discount, resolvedFees]
  );
  const fee = breakdown.touristFee;
  const total = breakdown.total;
  const instant = experience.provider?.booking_mode === "instant";

  // Persist the in-progress selection per experience so a reload/navigation
  // keeps it; a share link (initial* props) always wins over the saved config.
  const CFG_KEY = `akiles:bookingcfg:${experience.id}`;
  useEffect(() => {
    if (initialDate || initialTime || initialPeople) return;
    try {
      const raw = sessionStorage.getItem(CFG_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.date && dates.includes(s.date)) setDate(s.date);
      if (typeof s.adults === "number") setAdults(Math.max(1, s.adults));
      if (typeof s.children === "number") setChildren(Math.max(0, s.children));
    } catch {
      /* ignore corrupt storage */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(CFG_KEY, JSON.stringify({ date, time, adults, children }));
    } catch {
      /* storage disabled */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, time, adults, children]);

  const contact = passengers[0];
  const contactValid =
    !!contact?.name.trim() && !!contact?.email?.trim() && !!contact?.phone?.trim();
  const allNamed = passengers.length > 0 && passengers.every((p) => p.name.trim().length > 0);

  function pickDate(d: string) {
    setDate(d);
    const first = departuresOn(deps, d)[0];
    setTime(first?.time ?? "");
  }

  function applyPromo() {
    const key = promoInput.trim().toUpperCase();
    if (!key) return;
    const found = PROMOS[key];
    if (!found) {
      setPromo(null);
      notify("Ese código promocional no es válido.", "warning");
      return;
    }
    const discount = found.kind === "pct" ? round2(subtotal * found.value) : found.value;
    setPromo({ code: key, discount, label: found.label });
    notify(`Código aplicado: ${found.label}.`, "success");
  }

  function setPax(i: number, patch: Partial<Passenger>) {
    setPassengers((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  async function confirm() {
    if (!contactValid || !allNamed || !date || !time) return;
    setSubmitting(true);
    const status: Booking["booking_status"] = instant ? "confirmed" : "pending_approval";
    const cc = genCode();
    const booking: Booking = {
      id: uid("bk"),
      activity_id: experience.id,
      experience_title: experience.title,
      contact_name: contact!.name.trim(),
      contact_email: contact!.email!.trim(),
      number_of_people: people,
      adults,
      children,
      scheduled_date: date,
      scheduled_time: time,
      booking_status: status,
      confirmation_code: cc,
      subtotal_paid: subtotal,
      service_fee_paid: fee,
      total_paid: total,
      created_at: new Date().toISOString(),
    };
    try {
      if (isSupabaseConfigured) {
        await repo.createBooking({
          activity_id: experience.id,
          user_id: touristUserId,
          contact_name: booking.contact_name,
          contact_email: booking.contact_email,
          number_of_people: people,
          adults,
          children,
          passengers: passengers.map((p) => ({ ...p, name: p.name.trim() })),
          promo_code: promo?.code,
          scheduled_date: date,
          scheduled_time: time,
          subtotal: breakdown.base,
          service_fee: fee,
          total,
          platform_commission: breakdown.commission,
          provider_payout: breakdown.payout,
          status,
          confirmation_code: cc,
        });
      } else {
        addBooking(booking);
      }
      setCode(cc);
      setFinalStatus(status);
      setStep("done");
      try {
        sessionStorage.removeItem(CFG_KEY);
      } catch {
        /* ignore */
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : "No se pudo completar la reserva.", "warning");
    } finally {
      setSubmitting(false);
    }
  }

  const stepIndex = ORDER.indexOf(step);
  const goBack = () => {
    if (stepIndex > 0) setStep(ORDER[stepIndex - 1]);
  };

  const title =
    step === "done"
      ? "¡Tu ticket!"
      : step === "date"
      ? "Elige la fecha"
      : step === "time"
      ? "Elige el horario"
      : step === "people"
      ? "¿Cuántos van?"
      : step === "details"
      ? "Datos de los viajeros"
      : "Confirma tu reserva";

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {dates.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          Esta experiencia no tiene fechas disponibles por ahora.
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-4">
          {/* Progress */}
          {step !== "done" && <Stepper index={stepIndex} />}

          {/* Back link (steps after the first) */}
          {step !== "done" && stepIndex > 0 && (
            <button
              onClick={goBack}
              className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" /> Volver
            </button>
          )}

          {/* ---------------- DATE ---------------- */}
          {step === "date" && (
            <>
              <div className="rounded-2xl border border-border p-3">
                <BookingCalendar available={dates} selected={date} onSelect={pickDate} />
              </div>
              {date && (
                <p className="text-center text-sm">
                  <span className="text-muted-foreground">Fecha seleccionada: </span>
                  <span className="font-medium">{fullDate(date)}</span>
                </p>
              )}
              <Button size="lg" className="w-full" disabled={!date} onClick={() => setStep("time")}>
                Continuar <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}

          {/* ---------------- TIME + TIER ---------------- */}
          {step === "time" && (
            <>
              <div className="rounded-2xl bg-secondary/60 p-3 text-sm">
                <p className="inline-flex items-center gap-1.5 font-medium">
                  <CalendarIcon className="h-3.5 w-3.5 text-teal" /> {fullDate(date)}
                </p>
              </div>

              <div>
                <Label className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Horario
                </Label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {times.map((t) => (
                    <button
                      key={t.time}
                      onClick={() => setTime(t.time)}
                      className={cn(
                        "rounded-xl border px-4 py-2 text-sm transition",
                        t.time === time ? "border-ink bg-ink text-background" : "border-border hover:bg-accent"
                      )}
                    >
                      {t.time}
                    </button>
                  ))}
                </div>
              </div>

              {offeredTiers.length > 0 && (
                <div>
                  <Label>Opción</Label>
                  <div className="mt-1.5 grid gap-2">
                    {offeredTiers.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setTierId(t.id)}
                        className={cn(
                          "flex items-start justify-between gap-3 rounded-2xl border p-3 text-left transition",
                          t.id === tierId ? "border-primary ring-2 ring-primary/40" : "border-border hover:bg-accent"
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{t.tier_name || "Opción"}</span>
                          {t.description && (
                            <span className="mt-0.5 block text-xs text-muted-foreground">{t.description}</span>
                          )}
                        </span>
                        <span className="shrink-0 font-display">{formatUSD(t.price)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Button size="lg" className="w-full" disabled={!time} onClick={() => setStep("people")}>
                Continuar <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}

          {/* ---------------- PEOPLE ---------------- */}
          {step === "people" && (
            <>
              <div className="rounded-2xl bg-secondary/60 p-3 text-sm">
                <p className="inline-flex items-center gap-1.5 font-medium">
                  <CalendarIcon className="h-3.5 w-3.5 text-teal" /> {dateChip(date)} · {time}
                </p>
              </div>

              <Counter
                icon={<User className="h-4 w-4" />}
                label="Adultos"
                sub="13 años o más"
                value={adults}
                onDec={() => setAdults((a) => Math.max(1, a - 1))}
                onInc={() => setAdults((a) => (people < maxPeople ? a + 1 : a))}
                canDec={adults > 1 && people > floorPeople}
                canInc={people < maxPeople && canBook}
              />
              <Counter
                icon={<Baby className="h-4 w-4" />}
                label="Niños"
                sub="Menores de 13 años"
                value={children}
                onDec={() => setChildren((c) => Math.max(0, c - 1))}
                onInc={() => setChildren((c) => (people < maxPeople ? c + 1 : c))}
                canDec={children > 0 && people > floorPeople}
                canInc={people < maxPeople && canBook}
              />

              <div className="space-y-0.5 text-xs">
                {booked == null ? (
                  <p className="text-muted-foreground">Verificando cupos…</p>
                ) : soldOut ? (
                  <p className="font-medium text-destructive">Agotado para esta fecha.</p>
                ) : belowMin ? (
                  <p className="font-medium text-amber-700">
                    Solo queda{remaining === 1 ? "" : "n"} {remaining} cupo{remaining === 1 ? "" : "s"} y se requieren
                    mínimo {minPeople}.
                  </p>
                ) : remaining <= 5 ? (
                  <p className="font-medium text-ink">
                    🔥 ¡Solo quedan {remaining} cupo{remaining === 1 ? "" : "s"} para esta fecha!
                  </p>
                ) : (
                  <p className="text-muted-foreground">{remaining} cupos disponibles.</p>
                )}
                {minPeople > 1 && canBook && <p className="text-muted-foreground">Mínimo {minPeople} personas.</p>}
              </div>

              {/* Price preview */}
              <div className="rounded-2xl bg-secondary/60 p-4 text-sm">
                <Row label={`${formatUSD(unit)} × ${people}`} value={formatUSD(subtotal)} />
                <Row label={`Cargo por servicio (${breakdown.touristFeeLabel})`} value={formatUSD(fee)} />
                <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                  <span className="font-medium">Total estimado</span>
                  <span className="font-display text-lg">{formatUSD(total)}</span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  El cargo por servicio cubre los gastos administrativos de la plataforma y la emisión de
                  tu ticket. El precio de la experiencia lo define el proveedor.
                </p>
              </div>

              <Button size="lg" className="w-full" disabled={!canBook} onClick={() => setStep("details")}>
                Continuar <ChevronRight className="h-4 w-4" />
              </Button>
              <button
                type="button"
                onClick={() => shareExperience(experience.id, experience.title, { date, time, people })}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
              >
                <Share2 className="h-4 w-4" /> Compartir con esta configuración
              </button>
            </>
          )}

          {/* ---------------- DETAILS ---------------- */}
          {step === "details" && (
            <>
              <p className="text-sm text-muted-foreground">
                Necesitamos el nombre de cada viajero. Los datos de contacto son del titular de la reserva.
              </p>
              <div className="grid gap-3">
                {passengers.map((p, i) => (
                  <div key={i} className="rounded-2xl border border-border p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      {p.kind === "adult" ? <User className="h-3.5 w-3.5" /> : <Baby className="h-3.5 w-3.5" />}
                      {i === 0 ? "Titular de la reserva" : p.kind === "adult" ? `Adulto ${i + 1}` : "Niño"}
                    </div>
                    <div className="grid gap-2">
                      <Input
                        value={p.name}
                        onChange={(e) => setPax(i, { name: e.target.value })}
                        placeholder="Nombre completo"
                      />
                      {i === 0 && (
                        <>
                          <Input
                            type="email"
                            value={p.email ?? ""}
                            onChange={(e) => setPax(i, { email: e.target.value })}
                            placeholder="Correo"
                          />
                          <Input
                            type="tel"
                            value={p.phone ?? ""}
                            onChange={(e) => setPax(i, { phone: e.target.value })}
                            placeholder="Teléfono / WhatsApp"
                          />
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <Button
                size="lg"
                className="w-full"
                disabled={!contactValid || !allNamed}
                onClick={() => setStep("review")}
              >
                Continuar <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}

          {/* ---------------- REVIEW ---------------- */}
          {step === "review" && (
            <>
              <div className="overflow-hidden rounded-2xl border border-border">
                {experience.featured_image && (
                  <img src={experience.featured_image} alt="" className="h-28 w-full object-cover" />
                )}
                <div className="p-4">
                  <p className="font-display text-base">{experience.title}</p>
                  <div className="mt-2 grid gap-1 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarIcon className="h-3.5 w-3.5 text-teal" /> {fullDate(date)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-teal" /> {time}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-teal" /> {adults} adulto{adults === 1 ? "" : "s"}
                      {children > 0 ? ` · ${children} niño${children === 1 ? "" : "s"}` : ""}
                    </span>
                    {tier && (
                      <span className="inline-flex items-center gap-1.5">
                        <TicketIcon className="h-3.5 w-3.5 text-teal" /> {tier.tier_name}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Promo code */}
              <div>
                <Label className="inline-flex items-center gap-1">
                  <Tag className="h-3 w-3" /> Código promocional
                </Label>
                <div className="mt-1.5 flex gap-2">
                  <Input
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value)}
                    placeholder="Ej. AKILES10"
                    className="uppercase"
                  />
                  <Button variant="outline" onClick={applyPromo} disabled={!promoInput.trim()}>
                    Aplicar
                  </Button>
                </div>
                {promo && (
                  <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-teal">
                    <Check className="h-3.5 w-3.5" /> {promo.label} aplicado.
                  </p>
                )}
              </div>

              {/* Price breakdown */}
              <div className="rounded-2xl bg-secondary/60 p-4 text-sm">
                <Row label={`${formatUSD(unit)} × ${people}`} value={formatUSD(subtotal)} />
                {discount > 0 && <Row label={`Descuento (${promo?.code})`} value={`− ${formatUSD(discount)}`} />}
                <Row label={`Cargo por servicio (${breakdown.touristFeeLabel})`} value={formatUSD(fee)} />
                <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                  <span className="font-medium">Total a pagar</span>
                  <span className="font-display text-lg">{formatUSD(total)}</span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  El precio de la experiencia ({formatUSD(round2(subtotal - discount))}) lo define el
                  proveedor. El <b>cargo por servicio</b> ({breakdown.touristFeeLabel}) cubre los gastos
                  administrativos de la plataforma y la emisión del ticket.
                </p>
              </div>

              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                {instant
                  ? "Reserva instantánea: se confirma al momento."
                  : "El proveedor confirmará tu solicitud. No se cobra en esta versión."}
              </p>

              <Button size="lg" className="w-full" onClick={confirm} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Confirmando…
                  </>
                ) : instant ? (
                  <>Confirmar y reservar · {formatUSD(total)}</>
                ) : (
                  <>Enviar solicitud · {formatUSD(total)}</>
                )}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                Al continuar aceptas ser contactado por el proveedor. No se realiza ningún cargo en esta versión.
              </p>
            </>
          )}

          {/* ---------------- DONE / TICKET ---------------- */}
          {step === "done" && (
            <div className="flex min-w-0 flex-col gap-4">
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-ink">
                  <Check className="h-6 w-6" />
                </div>
                <p className="mt-2 font-display text-lg">
                  {finalStatus === "confirmed" ? "¡Reserva confirmada!" : "¡Solicitud enviada!"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {finalStatus === "confirmed"
                    ? "Presenta este ticket el día de tu experiencia."
                    : "El proveedor confirmará muy pronto. Guarda tu ticket."}
                </p>
              </div>

              <Ticket
                data={{
                  code,
                  confirmed: finalStatus === "confirmed",
                  title: experience.title,
                  coverImage: experience.featured_image,
                  date,
                  time,
                  endTime: dep?.end_time || addHours(time, experience.duration_hours),
                  peopleLabel: `${adults} adulto${adults === 1 ? "" : "s"}${
                    children > 0 ? ` · ${children} niño${children === 1 ? "" : "s"}` : ""
                  }`,
                  holderName: contact?.name.trim() || undefined,
                  meetingPoint: experience.location_address || undefined,
                  tierName: tier?.tier_name,
                  total,
                  whatsapp: experience.provider?.whatsapp,
                  contactEmail: experience.provider?.contact_email,
                }}
              />

              <Button variant="outline" className="w-full" onClick={onClose}>
                Listo
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------ subcomponents ------------------------------ */

function Stepper({ index }: { index: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {ORDER.map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 flex-1 rounded-full transition-colors",
            i <= index ? "bg-primary" : "bg-border"
          )}
        />
      ))}
    </div>
  );
}

function Counter({
  icon,
  label,
  sub,
  value,
  onDec,
  onInc,
  canDec,
  canInc,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  value: number;
  onDec: () => void;
  onInc: () => void;
  canDec: boolean;
  canInc: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border p-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-teal">{icon}</span>
        <span>
          <span className="block text-sm font-medium">{label}</span>
          <span className="block text-xs text-muted-foreground">{sub}</span>
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onDec}
          disabled={!canDec}
          aria-label={`Menos ${label}`}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border transition disabled:opacity-40"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-6 text-center font-display text-lg">{value}</span>
        <button
          onClick={onInc}
          disabled={!canInc}
          aria-label={`Más ${label}`}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border transition disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-muted-foreground">
      <span>{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

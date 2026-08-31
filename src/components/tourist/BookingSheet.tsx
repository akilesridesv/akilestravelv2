import { useEffect, useMemo, useState } from "react";
import type { PublicExperience } from "@/data/repo";
import type { Booking, TicketTier } from "@/types/domain";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { bookableDepartures, bookableDates, departuresOn, type Departure } from "@/lib/availability";
import { BookingCalendar } from "@/components/tourist/BookingCalendar";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useApp } from "@/state/store";
import * as repo from "@/data/repo";
import type { Passenger } from "@/data/repo";
import { notify } from "@/state/toast";
import { formatUSD, parseISODate, dayName, monthName, uid, cn } from "@/lib/utils";
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
} from "lucide-react";

const round2 = (n: number) => Math.round(n * 100) / 100;
const SERVICE_FEE = 0.1;

// Demo promo codes (no real payment in this version).
const PROMOS: Record<string, { kind: "pct" | "flat"; value: number; label: string }> = {
  AKILES10: { kind: "pct", value: 0.1, label: "10% de descuento" },
  BIENVENIDO: { kind: "flat", value: 5, label: "$5 de descuento" },
};

function genCode(): string {
  const s = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let r = "";
  for (let i = 0; i < 6; i++) r += s[Math.floor(Math.random() * s.length)];
  return `AKT-${r}`;
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
      // carry email/phone onto the first slot
      if (next[0]) {
        next[0] = { ...next[0], email: prev[0]?.email ?? "", phone: prev[0]?.phone ?? "" };
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
  const fee = round2((subtotal - discount) * SERVICE_FEE);
  const total = round2(subtotal - discount + fee);
  const instant = experience.provider?.booking_mode === "instant";

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
          contact_name: booking.contact_name,
          contact_email: booking.contact_email,
          number_of_people: people,
          adults,
          children,
          passengers: passengers.map((p) => ({ ...p, name: p.name.trim() })),
          promo_code: promo?.code,
          scheduled_date: date,
          scheduled_time: time,
          subtotal,
          service_fee: fee,
          total,
          status,
          confirmation_code: cc,
        });
      } else {
        addBooking(booking);
      }
      setCode(cc);
      setFinalStatus(status);
      setStep("done");
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
                <Row label="Tarifa de servicio (10%)" value={formatUSD(round2(subtotal * SERVICE_FEE))} />
                <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                  <span className="font-medium">Total estimado</span>
                  <span className="font-display text-lg">{formatUSD(round2(subtotal + subtotal * SERVICE_FEE))}</span>
                </div>
              </div>

              <Button size="lg" className="w-full" disabled={!canBook} onClick={() => setStep("details")}>
                Continuar <ChevronRight className="h-4 w-4" />
              </Button>
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
                <Row label="Tarifa de servicio (10%)" value={formatUSD(fee)} />
                <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                  <span className="font-medium">Total</span>
                  <span className="font-display text-lg">{formatUSD(total)}</span>
                </div>
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
            <Ticket
              code={code}
              status={finalStatus}
              experience={experience}
              date={date}
              time={time}
              adults={adults}
              children={children}
              tierName={tier?.tier_name}
              total={total}
              contactName={contact?.name.trim() || ""}
              onClose={onClose}
            />
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

// Deterministic decorative barcode derived from the confirmation code.
function Barcode({ code }: { code: string }) {
  let seed = 0;
  for (let i = 0; i < code.length; i++) seed = (seed * 31 + code.charCodeAt(i)) >>> 0;
  const bars: { w: number; on: boolean }[] = [];
  for (let i = 0; i < 48; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    bars.push({ w: 1 + ((seed >> 3) % 3), on: (seed >> 6) % 3 !== 0 });
  }
  return (
    <div className="flex h-14 items-stretch gap-[2px]" aria-hidden>
      {bars.map((b, i) => (
        <span
          key={i}
          style={{ width: `${b.w * 2}px` }}
          className={b.on ? "bg-ink" : "bg-transparent"}
        />
      ))}
    </div>
  );
}

function Ticket({
  code,
  status,
  experience,
  date,
  time,
  adults,
  children,
  tierName,
  total,
  contactName,
  onClose,
}: {
  code: string;
  status: Booking["booking_status"];
  experience: PublicExperience;
  date: string;
  time: string;
  adults: number;
  children: number;
  tierName?: string;
  total: number;
  contactName: string;
  onClose: () => void;
}) {
  const confirmed = status === "confirmed";
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-ink">
          <Check className="h-6 w-6" />
        </div>
        <p className="mt-2 font-display text-lg">
          {confirmed ? "¡Reserva confirmada!" : "¡Solicitud enviada!"}
        </p>
        <p className="text-sm text-muted-foreground">
          {confirmed
            ? "Presenta este ticket el día de tu experiencia."
            : "El proveedor confirmará muy pronto. Guarda tu ticket."}
        </p>
      </div>

      {/* Ticket card */}
      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        {/* Header band */}
        <div className="flex items-center justify-between bg-ink px-5 py-3 text-background">
          <span className="inline-flex items-center gap-1.5 font-display text-sm">
            <TicketIcon className="h-4 w-4 text-primary" /> Akiles Travel
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
              confirmed ? "bg-primary text-ink" : "bg-background/15 text-background"
            )}
          >
            {confirmed ? "Confirmado" : "Pendiente"}
          </span>
        </div>

        <div className="p-5">
          <p className="font-display text-base leading-tight">{experience.title}</p>
          {tierName && <p className="mt-0.5 text-xs text-muted-foreground">{tierName}</p>}

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Field label="Fecha" value={fullDate(date)} />
            <Field label="Hora" value={time} />
            <Field label="Titular" value={contactName || "—"} />
            <Field
              label="Personas"
              value={`${adults} adulto${adults === 1 ? "" : "s"}${
                children > 0 ? ` · ${children} niño${children === 1 ? "" : "s"}` : ""
              }`}
            />
            {experience.location_address && (
              <MeetingField value={experience.location_address} />
            )}
            <Field label="Total" value={formatUSD(total)} />
          </div>
        </div>

        {/* Perforated divider */}
        <div className="relative flex items-center">
          <span className="absolute -left-3 h-6 w-6 rounded-full bg-background" />
          <span className="absolute -right-3 h-6 w-6 rounded-full bg-background" />
          <div className="mx-5 flex-1 border-t-2 border-dashed border-border" />
        </div>

        {/* Barcode + code */}
        <div className="flex flex-col items-center gap-2 p-5">
          <Barcode code={code} />
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Número de registro</p>
            <p className="font-display text-xl tracking-[0.2em]">{code}</p>
          </div>
        </div>
      </div>

      {(experience.provider?.whatsapp || experience.provider?.contact_email) && (
        <div className="flex flex-wrap justify-center gap-2">
          {experience.provider?.whatsapp && (
            <a
              href={`https://wa.me/${experience.provider.whatsapp.replace(/[^\d]/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm transition hover:bg-accent"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          )}
          {experience.provider?.contact_email && (
            <a
              href={`mailto:${experience.provider.contact_email}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm transition hover:bg-accent"
            >
              <Mail className="h-4 w-4" /> Correo
            </a>
          )}
        </div>
      )}

      <Button className="w-full" onClick={onClose}>
        Listo
      </Button>
    </div>
  );
}

function MeetingField({ value }: { value: string }) {
  const isUrl = /^https?:\/\//i.test(value.trim());
  return (
    <div className="col-span-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Punto de encuentro</p>
      {isUrl ? (
        <a
          href={value.trim()}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-teal underline-offset-2 hover:underline"
        >
          <MapPin className="h-3.5 w-3.5" /> Ver ubicación en el mapa
        </a>
      ) : (
        <p className="font-medium">{value}</p>
      )}
    </div>
  );
}

function Field({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
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

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
import { notify } from "@/state/toast";
import { formatUSD, parseISODate, dayName, monthName, uid, cn } from "@/lib/utils";
import {
  Check,
  ChevronLeft,
  Minus,
  Plus,
  Users,
  Clock,
  MessageCircle,
  Mail,
  Loader2,
  ShieldCheck,
} from "lucide-react";

const round2 = (n: number) => Math.round(n * 100) / 100;
const SERVICE_FEE = 0.1;

function genCode(): string {
  const s = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let r = "";
  for (let i = 0; i < 4; i++) r += s[Math.floor(Math.random() * s.length)];
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

  const [step, setStep] = useState<"select" | "contact" | "done">("select");
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

  // Respect the experience's configured group size: default to the minimum,
  // and never let the tourist pick below it (or above the departure capacity).
  const minPeople = Math.max(1, experience.min_capacity || 1);
  const maxPeople = Math.max(1, Math.min(dep?.capacity ?? experience.max_capacity, experience.max_capacity));
  const floorPeople = Math.min(minPeople, maxPeople);
  const [people, setPeople] = useState(initialPeople && initialPeople > 0 ? initialPeople : minPeople);
  useEffect(() => {
    setPeople((p) => Math.min(Math.max(p, floorPeople), maxPeople));
  }, [floorPeople, maxPeople]);
  // The concierge asked for more than this departure can seat.
  const overCap = initialPeople != null && initialPeople > maxPeople;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [code, setCode] = useState("");
  const [finalStatus, setFinalStatus] = useState<Booking["booking_status"]>("pending_approval");

  const unit = tier ? tier.price : experience.price_per_person;
  const subtotal = round2(unit * people);
  const fee = round2(subtotal * SERVICE_FEE);
  const total = round2(subtotal + fee);
  const instant = experience.provider?.booking_mode === "instant";

  function pickDate(d: string) {
    setDate(d);
    const first = departuresOn(deps, d)[0];
    setTime(first?.time ?? "");
    setPeople(minPeople);
  }

  async function confirm() {
    if (!name.trim() || !email.trim() || !date || !time) return;
    setSubmitting(true);
    const status: Booking["booking_status"] = instant ? "confirmed" : "pending_approval";
    const cc = genCode();
    const booking: Booking = {
      id: uid("bk"),
      activity_id: experience.id,
      experience_title: experience.title,
      contact_name: name.trim(),
      contact_email: email.trim(),
      number_of_people: people,
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

  const title =
    step === "done" ? "¡Reserva lista!" : step === "contact" ? "Tus datos" : "Reservar";

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {dates.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          Esta experiencia no tiene fechas disponibles por ahora.
        </div>
      ) : step === "select" ? (
        <div className="flex min-w-0 flex-col gap-4">
          {/* Dates — minimalist month calendar (no horizontal scroll) */}
          <div>
            <Label>Fecha</Label>
            <div className="mt-1 rounded-2xl border border-border p-3">
              <BookingCalendar available={dates} selected={date} onSelect={pickDate} />
            </div>
            {date && (
              <p className="mt-2 text-center text-sm">
                <span className="text-muted-foreground">Fecha seleccionada: </span>
                <span className="font-medium">{fullDate(date)}</span>
              </p>
            )}
          </div>

          {/* Times */}
          <div>
            <Label className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> Hora
            </Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {times.map((t) => (
                <button
                  key={t.time}
                  onClick={() => {
                    setTime(t.time);
                    setPeople(minPeople);
                  }}
                  className={cn(
                    "rounded-xl border px-3 py-1.5 text-sm transition",
                    t.time === time ? "border-ink bg-ink text-background" : "border-border hover:bg-accent"
                  )}
                >
                  {t.time}
                </button>
              ))}
            </div>
          </div>

          {/* Tiers */}
          {offeredTiers.length > 0 && (
            <div>
              <Label>Opción</Label>
              <div className="mt-1 grid gap-2">
                {offeredTiers.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTierId(t.id)}
                    className={cn(
                      "flex items-start justify-between gap-3 rounded-2xl border p-3 text-left transition",
                      t.id === tierId ? "border-ink ring-1 ring-ink" : "border-border hover:bg-accent"
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

          {/* People — respects the experience's min/max group size */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" /> Personas
              </Label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPeople((p) => Math.max(floorPeople, p - 1))}
                  disabled={people <= floorPeople}
                  aria-label="Menos"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border disabled:opacity-40"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-6 text-center font-display text-lg">{people}</span>
                <button
                  onClick={() => setPeople((p) => Math.min(maxPeople, p + 1))}
                  disabled={people >= maxPeople}
                  aria-label="Más"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-1.5 space-y-0.5 text-xs">
              {overCap ? (
                <p className="font-medium text-amber-700">
                  Para esta fecha hay cupo para {maxPeople} {maxPeople === 1 ? "persona" : "personas"}
                  {initialPeople ? ` (pediste ${initialPeople})` : ""}.
                </p>
              ) : maxPeople <= 6 ? (
                <p className="font-medium text-ink">
                  🔥 ¡Solo quedan {maxPeople} cupos para esta fecha!
                </p>
              ) : (
                <p className="text-muted-foreground">{maxPeople} cupos disponibles.</p>
              )}
              {minPeople > 1 && (
                <p className="text-muted-foreground">Mínimo {minPeople} personas.</p>
              )}
            </div>
          </div>

          {/* Price breakdown */}
          <div className="rounded-2xl bg-secondary/60 p-4 text-sm">
            <Row label={`${formatUSD(unit)} × ${people}`} value={formatUSD(subtotal)} />
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
              : "El proveedor confirmará tu solicitud. No se cobra hasta que la acepte."}
          </p>

          <Button size="lg" className="w-full" disabled={!date || !time} onClick={() => setStep("contact")}>
            Continuar · {formatUSD(total)}
          </Button>
        </div>
      ) : step === "contact" ? (
        <div className="flex min-w-0 flex-col gap-4">
          <button
            onClick={() => setStep("select")}
            className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> Volver
          </button>

          <div className="rounded-2xl bg-secondary/60 p-3 text-sm">
            <p className="font-medium">{experience.title}</p>
            <p className="text-muted-foreground">
              {dateChip(date)} · {time} · {people} pers · {formatUSD(total)}
            </p>
          </div>

          <div>
            <Label>Nombre completo</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" />
          </div>
          <div>
            <Label>Correo</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tucorreo@ejemplo.com"
            />
          </div>

          <Button size="lg" className="w-full" onClick={confirm} disabled={!name.trim() || !email.trim() || submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Confirmando…
              </>
            ) : instant ? (
              <>Confirmar y reservar · {formatUSD(total)}</>
            ) : (
              <>Enviar solicitud</>
            )}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Al continuar aceptas ser contactado por el proveedor. No se realiza ningún cargo en esta versión.
          </p>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-4 py-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-ink">
            <Check className="h-7 w-7" />
          </div>
          <div>
            <p className="font-display text-xl">
              {finalStatus === "confirmed" ? "¡Reserva confirmada!" : "¡Solicitud enviada!"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {finalStatus === "confirmed"
                ? "Tu lugar está reservado. Te enviamos los detalles a tu correo."
                : "El proveedor revisará tu solicitud y te confirmará muy pronto."}
            </p>
          </div>
          <div className="rounded-2xl border border-border p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Código de reserva</p>
            <p className="font-display text-2xl tracking-wide">{code}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {experience.title} · {dateChip(date)} · {time} · {people} pers
            </p>
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
                  <MessageCircle className="h-4 w-4" /> Escribir por WhatsApp
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

          <Button variant="outline" className="w-full" onClick={onClose}>
            Listo
          </Button>
        </div>
      )}
    </Modal>
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

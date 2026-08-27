import type { Booking, Experience, RecurringSchedule } from "@/types/domain";
import { uid } from "@/lib/utils";
import { addHours, DAY_ABBR, parseDaysFromText, parseMoney, parseTimeToken, stripAccents } from "@/ai/nlp";

// --------------------------------------------------------------------------
// Resolve which experience / booking a chat command refers to.
// --------------------------------------------------------------------------

export function resolveExperience(text: string, exps: Experience[]): Experience | null {
  if (exps.length === 0) return null;
  if (exps.length === 1) return exps[0];
  const low = stripAccents(text.toLowerCase());
  let best: Experience | null = null;
  let score = 0;
  for (const e of exps) {
    const words = stripAccents(e.title.toLowerCase())
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const s = words.filter((w) => low.includes(w)).length;
    if (s > score) {
      score = s;
      best = e;
    }
  }
  return score > 0 ? best : exps[0]; // fallback: most recent
}

// --------------------------------------------------------------------------
// Experience field edits: "sube el precio a $40", "cupo máximo 12", "renombra a X"
// --------------------------------------------------------------------------

export interface ExperienceEdit {
  patch: Partial<Experience>;
  changes: string[];
}

export function parseExperienceEdits(text: string, exp: Experience): ExperienceEdit {
  const low = stripAccents(text.toLowerCase());
  const patch: Partial<Experience> = {};
  const changes: string[] = [];

  // price
  const price = parseMoney(text);
  if (price != null && /(precio|costo|vale|cobra|\$)/.test(low) && price !== exp.price_per_person) {
    patch.price_per_person = price;
    changes.push(`precio → $${price}`);
  }

  // duration
  const dur = low.match(/(\d+(?:[.,]\d+)?)\s*(?:horas?|hrs?|h)\b/);
  if (dur && /(duracion|dura|hora)/.test(low)) {
    const h = parseFloat(dur[1].replace(",", "."));
    if (h !== exp.duration_hours) {
      patch.duration_hours = h;
      changes.push(`duración → ${h}h`);
    }
  }

  // max capacity
  const maxM = low.match(/(?:cupo|maximo|max|hasta|capacidad)\s*(?:de\s*)?(\d+)/);
  if (maxM) {
    const n = parseInt(maxM[1], 10);
    if (n !== exp.max_capacity) {
      patch.max_capacity = n;
      changes.push(`cupo máximo → ${n}`);
    }
  }

  // rename
  const rn = text.match(/(?:renombra(?:r)?|cambia(?:r)? el nombre|nombra(?:r)?|titulo)\s*(?:a|como|:)?\s*["“]?([^"”,.]{3,60})/i);
  if (rn) {
    const title = rn[1].trim();
    patch.title = title;
    changes.push(`nombre → “${title}”`);
  }

  return { patch, changes };
}

// --------------------------------------------------------------------------
// Calendar commands: operate on the weekly schedule (recurring_schedules).
// "abre todos los sábados cupo 10", "bloquea los lunes", "cambia la hora a 10am"
// --------------------------------------------------------------------------

export interface CalendarEdit {
  schedules: RecurringSchedule[];
  changes: string[];
}

export function parseCalendarCommand(text: string, exp: Experience): CalendarEdit {
  const low = stripAccents(text.toLowerCase());
  let schedules = exp.schedules.map((s) => ({ ...s }));
  const changes: string[] = [];

  const days = parseDaysFromText(text);
  const time = parseTimeToken(text);
  const capM = low.match(/(?:cupo|capacidad)\s*(?:de\s*|para\s*)?(\d+)/);
  const cap = capM ? parseInt(capM[1], 10) : null;

  const isClose = /(bloquea|bloquear|cierra|cerrar|quita|quitar|elimina|eliminar|desactiva|cancela|no\s+(?:abras|abra))/.test(low);
  const isOpen = /(abre|abrir|agrega|agregar|anade|anadir|activa|activar|pon|poner|disponible|habilita)/.test(low);

  const defaultStart = schedules[0]?.start_time ?? time ?? "09:00";

  if (days.length && isClose) {
    schedules = schedules.filter((s) => !days.includes(s.day_of_week));
    changes.push(`cerré ${days.map((d) => DAY_ABBR[d]).join(", ")}`);
  } else if (days.length) {
    // open / add these days (default action when days are named)
    for (const dow of days) {
      if (!schedules.some((s) => s.day_of_week === dow)) {
        const start = time ?? defaultStart;
        schedules.push({
          id: uid("sch"),
          day_of_week: dow,
          start_time: start,
          end_time: addHours(start, exp.duration_hours),
          capacity: cap ?? exp.max_capacity,
          is_active: true,
        });
      }
    }
    changes.push(`abrí ${days.map((d) => DAY_ABBR[d]).join(", ")}`);
  }

  // time change applies to targeted days, or all if no day specified
  if (time) {
    schedules = schedules.map((s) =>
      !days.length || days.includes(s.day_of_week)
        ? { ...s, start_time: time, end_time: addHours(time, exp.duration_hours) }
        : s
    );
    if (!changes.some((c) => c.startsWith("abrí"))) changes.push(`hora → ${time}`);
  }

  // capacity change
  if (cap != null) {
    schedules = schedules.map((s) =>
      !days.length || days.includes(s.day_of_week) ? { ...s, capacity: cap } : s
    );
    changes.push(`cupo → ${cap}`);
  }

  schedules.sort((a, b) => a.day_of_week - b.day_of_week);
  return { schedules, changes };
}

// --------------------------------------------------------------------------
// Booking actions: "aprueba la de Juan", "rechaza la reserva de María"
// --------------------------------------------------------------------------

export interface BookingAction {
  booking: Booking;
  action: "approve" | "reject";
}

export function parseBookingAction(text: string, bookings: Booking[]): BookingAction | null {
  const low = stripAccents(text.toLowerCase());
  const approve = /(aprueba|aprobar|acepta|aceptar|confirma|confirmar)/.test(low);
  const reject = /(rechaza|rechazar|niega|negar|declina|no\s+aprueb)/.test(low);
  if (!approve && !reject) return null;

  const pending = bookings.filter((b) => b.booking_status === "pending_approval");
  const pool = pending.length ? pending : bookings;

  // match by first name mentioned
  let match =
    pool.find((b) => low.includes(stripAccents(b.contact_name.toLowerCase().split(" ")[0]))) ?? null;
  // if only one pending and no name, act on it
  if (!match && pending.length === 1) match = pending[0];
  if (!match) return null;

  return { booking: match, action: reject ? "reject" : "approve" };
}

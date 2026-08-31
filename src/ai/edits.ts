import type { Booking, DateSlot, Experience, RecurringSchedule, TicketTier } from "@/types/domain";
import { uid, monthName } from "@/lib/utils";
import { addHours, DAY_ABBR, parseDaysFromText, parseMoney, parseTimeToken, stripAccents } from "@/ai/nlp";
import { normalize, levenshtein } from "@/lib/fuzzy";

// --------------------------------------------------------------------------
// Resolve which experience / booking a chat command refers to.
// --------------------------------------------------------------------------

export function resolveExperience(text: string, exps: Experience[]): Experience | null {
  if (exps.length === 0) return null;
  if (exps.length === 1) return exps[0];
  const low = normalize(text);

  // 1. Word overlap: how many meaningful title words appear in the command.
  let best: Experience | null = null;
  let overlap = 0;
  for (const e of exps) {
    const words = normalize(e.title)
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const s = words.filter((w) => low.includes(w)).length;
    if (s > overlap) {
      overlap = s;
      best = e;
    }
  }
  if (overlap > 0) return best;

  // 2. Fuzzy fallback: closest title word to any command word (typo tolerance).
  const cmdWords = low.split(/\s+/).filter((w) => w.length > 2);
  let fuzzyBest: Experience | null = null;
  let fuzzyScore = Infinity;
  for (const e of exps) {
    for (const tw of normalize(e.title).split(/\s+/).filter((w) => w.length > 2)) {
      for (const cw of cmdWords) {
        const d = levenshtein(cw, tw);
        if (d < fuzzyScore) {
          fuzzyScore = d;
          fuzzyBest = e;
        }
      }
    }
  }
  if (fuzzyBest && fuzzyScore <= 2) return fuzzyBest;

  return exps[0]; // fallback: most recent
}

/**
 * Like resolveExperience, but returns null when the command does NOT clearly name
 * an experience (no "most recent" fallback). Lets callers fall back to the active
 * experience or ask which one, instead of silently editing the wrong one.
 */
export function resolveExperienceStrict(text: string, exps: Experience[]): Experience | null {
  if (exps.length === 0) return null;
  if (exps.length === 1) return exps[0];
  const low = normalize(text);

  let best: Experience | null = null;
  let overlap = 0;
  for (const e of exps) {
    const words = normalize(e.title)
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const s = words.filter((w) => low.includes(w)).length;
    if (s > overlap) {
      overlap = s;
      best = e;
    }
  }
  if (overlap > 0) return best;

  const cmdWords = low.split(/\s+/).filter((w) => w.length > 2);
  let fuzzyBest: Experience | null = null;
  let fuzzyScore = Infinity;
  for (const e of exps) {
    for (const tw of normalize(e.title).split(/\s+/).filter((w) => w.length > 2)) {
      for (const cw of cmdWords) {
        const dd = levenshtein(cw, tw);
        if (dd < fuzzyScore) {
          fuzzyScore = dd;
          fuzzyBest = e;
        }
      }
    }
  }
  if (fuzzyBest && fuzzyScore <= 1) return fuzzyBest;

  return null; // no clear match — caller decides (active experience or ask)
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
  const isTimeChange = /(cambia|mueve|mover|corre)/.test(low) && time != null && !isOpen;

  const defaultStart = schedules[0]?.start_time ?? time ?? "09:00";

  if (days.length && isClose) {
    schedules = schedules.filter((s) => !days.includes(s.day_of_week));
    changes.push(`cerré ${days.map((d) => DAY_ABBR[d]).join(", ")}`);
  } else if (days.length && isTimeChange) {
    // change the time of existing departures on those days
    schedules = schedules.map((s) =>
      days.includes(s.day_of_week)
        ? { ...s, start_time: time!, end_time: addHours(time!, exp.duration_hours) }
        : s
    );
    changes.push(`hora de ${days.map((d) => DAY_ABBR[d]).join(", ")} → ${time}`);
  } else if (days.length) {
    // open / add departures — supports MULTIPLE horarios per day
    const targetTime = time ?? defaultStart;
    for (const dow of days) {
      const exists = schedules.some((s) => s.day_of_week === dow && s.start_time === targetTime);
      if (!exists) {
        schedules.push({
          id: uid("sch"),
          day_of_week: dow,
          start_time: targetTime,
          end_time: addHours(targetTime, exp.duration_hours),
          capacity: cap ?? exp.max_capacity,
          is_active: true,
          tier_ids: [],
        });
      }
    }
    changes.push(`abrí ${days.map((d) => DAY_ABBR[d]).join(", ")}${time ? ` a las ${time}` : ""}`);
  } else if (time) {
    // no day named: change the time of all departures
    schedules = schedules.map((s) => ({
      ...s,
      start_time: time,
      end_time: addHours(time, exp.duration_hours),
    }));
    changes.push(`hora → ${time}`);
  }

  // capacity change (targeted days or all). Skip if we just created rows with it.
  if (cap != null && !changes.some((c) => c.startsWith("abrí"))) {
    schedules = schedules.map((s) =>
      !days.length || days.includes(s.day_of_week) ? { ...s, capacity: cap } : s
    );
    changes.push(`cupo → ${cap}`);
  }

  schedules.sort((a, b) => a.day_of_week - b.day_of_week);
  return { schedules, changes };
}

// --------------------------------------------------------------------------
// Concrete dates by chat (Airbnb-style calendar):
// "habilita el 5, 8 y 12 de septiembre", "bloquea del 10 al 20 de septiembre"
// --------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};

export interface DateSlotEdit {
  date_slots: DateSlot[];
  change: string;
}

export function parseDateSlotCommand(text: string, exp: Experience): DateSlotEdit | null {
  const low = stripAccents(text.toLowerCase());

  let month = -1;
  for (const [name, idx] of Object.entries(MONTHS)) {
    if (low.includes(name)) {
      month = idx;
      break;
    }
  }
  const rangeM = low.match(/del?\s+(\d{1,2})\s+(?:al|a|hasta)\s+(\d{1,2})/);
  if (month < 0 && !rangeM) return null; // not a concrete-date command

  let days: number[] = [];
  if (rangeM) {
    const a = parseInt(rangeM[1], 10);
    const b = parseInt(rangeM[2], 10);
    for (let d = Math.min(a, b); d <= Math.max(a, b); d++) days.push(d);
  } else {
    // numbers in the clause before "de <month>", minus time / capacity noise
    const monthName2 = Object.keys(MONTHS).find((n) => low.includes(n))!;
    const cut = low.indexOf("de " + monthName2);
    let clause = cut >= 0 ? low.slice(0, cut) : low.slice(0, low.indexOf(monthName2));
    clause = clause.replace(/\d{1,2}(?::\d{2})?\s*(?:am|pm)/g, "").replace(/(?:cupo|capacidad)\s*\d+/g, "");
    const nums = clause.match(/\b(\d{1,2})\b/g) ?? [];
    days = [...new Set(nums.map(Number).filter((n) => n >= 1 && n <= 31))];
  }
  if (!days.length) return null;

  if (month < 0) month = new Date().getMonth();
  const now = new Date();
  const year = month < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear();

  const isRemove = /(quita|quitar|elimina|eliminar|borra|borrar|bloquea|bloquear|cierra|cerrar|deshabilita|remueve|remover)/.test(low);
  const time = parseTimeToken(text) ?? exp.schedules[0]?.start_time ?? "09:00";
  const capM = low.match(/(?:cupo|capacidad)\s*(\d+)/);
  const capacity = capM ? parseInt(capM[1], 10) : exp.max_capacity || 10;

  const dateStrs = days.map(
    (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
  );
  let next = (exp.date_slots ?? []).map((s) => ({ ...s }));
  if (isRemove) {
    next = next.filter((s) => !dateStrs.includes(s.slot_date));
  } else {
    for (const ds of dateStrs) {
      const existing = next.find((s) => s.slot_date === ds);
      const end = addHours(time, exp.duration_hours);
      if (existing) {
        existing.start_time = time;
        existing.end_time = end;
        existing.capacity = capacity;
        existing.status = "open";
      } else {
        next.push({ id: uid("ds"), slot_date: ds, start_time: time, end_time: end, capacity, status: "open" });
      }
    }
  }
  return {
    date_slots: next,
    change: `${isRemove ? "quité" : "habilité"} ${days.length} fecha${days.length === 1 ? "" : "s"} de ${monthName(month)}`,
  };
}

// --------------------------------------------------------------------------
// Tiers by chat: "agrega un tier VIP a $60 que incluye bebida", "quita el tier snack"
// --------------------------------------------------------------------------

export interface TierEdit {
  tiers: TicketTier[];
  change: string;
}

export function parseTierCommand(text: string, exp: Experience): TierEdit | null {
  const low = stripAccents(text.toLowerCase());
  const isRemove = /(quita|quitar|elimina|eliminar|borra|borrar|remueve|remover)/.test(low);

  if (isRemove) {
    const target = exp.tiers.find((t) =>
      low.includes(stripAccents(t.tier_name.toLowerCase()))
    );
    if (!target) return null;
    return {
      tiers: exp.tiers.filter((t) => t.id !== target.id),
      change: `quité el tier “${target.tier_name}”`,
    };
  }

  // add
  const price = parseMoney(text);
  const nameM = text.match(
    /(?:tier|entrada|opci[oó]n)\s+(?:de\s+|llamad[oa]\s+)?["“]?([A-Za-zÁÉÍÓÚÑáéíóúñ0-9 ]{2,30}?)["”]?\s*(?:a\s*\$|\$|por\s|que\s|con\s|de\s*\$|,|$)/i
  );
  const name = nameM ? nameM[1].trim() : "";
  if (!name) return null;
  const descM = text.match(/(?:que incluye|incluye|con)\s+(.+)$/i);
  const description = descM
    ? descM[1]
        // drop a trailing experience reference like "… en el tour de café"
        .replace(/\s+(?:en|del|de la|para (?:el|la))\s+(?:tour|experiencia|paseo|clase|taller|excursi[oó]n)\b.*$/i, "")
        .trim()
    : "";

  const tier: TicketTier = {
    id: uid("tier"),
    tier_name: name,
    description,
    price: price ?? 0,
    quantity_available: 0,
    quantity_sold: 0,
  };
  return {
    tiers: [...exp.tiers, tier],
    change: `agregué el tier “${name}”${price != null ? ` a $${price}` : ""}`,
  };
}

// --------------------------------------------------------------------------
// Minimum advance booking: "reserva con 3 días de anticipación", "2 horas antes"
// --------------------------------------------------------------------------

export function parseDeadlineHours(text: string): number | null {
  const low = stripAccents(text.toLowerCase());
  const m = low.match(/(\d+)\s*(dias?|d|horas?|h)\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return m[2].startsWith("d") ? n * 24 : n;
}

export function formatDeadline(hours: number): string {
  return hours % 24 === 0 && hours >= 24
    ? `${hours / 24} día${hours / 24 === 1 ? "" : "s"}`
    : `${hours} hora${hours === 1 ? "" : "s"}`;
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

  // match by first name mentioned (accent-insensitive)
  let match =
    pool.find((b) => low.includes(normalize(b.contact_name.split(" ")[0]))) ?? null;
  // fuzzy fallback: closest first name to any command word (José/Jose, typos)
  if (!match) {
    const words = low.split(/\s+/).filter((w) => w.length > 2);
    let bestScore = Infinity;
    for (const b of pool) {
      const first = normalize(b.contact_name.split(" ")[0]);
      for (const w of words) {
        const d = levenshtein(w, first);
        if (d < bestScore) {
          bestScore = d;
          match = b;
        }
      }
    }
    if (bestScore > 2) match = null;
  }
  // if only one pending and no name, act on it
  if (!match && pending.length === 1) match = pending[0];
  if (!match) return null;

  return { booking: match, action: reject ? "reject" : "approve" };
}

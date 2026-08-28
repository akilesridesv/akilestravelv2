import type { DateSlot, Experience } from "@/types/domain";
import { addHours } from "@/ai/nlp";
import { todayISO, nowTimeSV, parseISODate, addDaysISO } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Turn a provider's weekly schedules + concrete date_slots into the list of
// bookable departures a tourist can actually pick — all in El Salvador time
// (GMT-6) and respecting the minimum advance-booking window. Explicit date_slots
// override the recurring pattern for their date+time (open adds, blocked removes).
// Shared by both sides so what the provider configures is exactly what sells.
// ---------------------------------------------------------------------------

export interface Departure {
  date: string; // ISO "2026-09-05"
  time: string; // "09:00"
  end_time?: string;
  capacity: number;
  tier_ids: string[]; // empty = all tiers of the experience apply
  source: "recurring" | "date";
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = parseISODate(fromISO).getTime();
  const b = parseISODate(toISO).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Hours from "now" (El Salvador) until a departure on date at time. */
export function hoursUntil(date: string, time: string): number {
  const dayDiff = daysBetween(todayISO(), date);
  const depMin = dayDiff * 1440 + toMinutes(time);
  const nowMin = toMinutes(nowTimeSV());
  return (depMin - nowMin) / 60;
}

/**
 * All bookable departures within the next `days` days (default 60), sorted by
 * date then time. A departure is bookable when it is far enough ahead to satisfy
 * `registration_deadline_hours`.
 */
export function bookableDepartures(
  exp: Pick<Experience, "schedules" | "date_slots" | "duration_hours" | "registration_deadline_hours">,
  opts?: { days?: number }
): Departure[] {
  const days = opts?.days ?? 60;
  const today = todayISO();
  const horizon = addDaysISO(today, days);
  const deadline = exp.registration_deadline_hours ?? 0;
  const out: Departure[] = [];

  // Index date_slots by date+time so recurring can defer to explicit overrides.
  const slotKey = (d: string, t: string) => `${d}T${t}`;
  const explicit = new Map<string, DateSlot>();
  for (const ds of exp.date_slots ?? []) explicit.set(slotKey(ds.slot_date, ds.start_time), ds);

  // 1) Explicit open date_slots.
  for (const ds of exp.date_slots ?? []) {
    if (ds.status !== "open") continue;
    if (ds.slot_date < today || ds.slot_date > horizon) continue;
    if (hoursUntil(ds.slot_date, ds.start_time) < deadline) continue;
    out.push({
      date: ds.slot_date,
      time: ds.start_time,
      end_time: ds.end_time ?? addHours(ds.start_time, exp.duration_hours),
      capacity: ds.capacity,
      tier_ids: ds.tier_ids ?? [],
      source: "date",
    });
  }

  // 2) Recurring schedules expanded over the window (skipping dates a date_slot
  //    already handles — open added above, blocked intentionally removed).
  const active = (exp.schedules ?? []).filter((s) => s.is_active);
  if (active.length) {
    for (let offset = 0; offset <= days; offset++) {
      const date = addDaysISO(today, offset);
      const dow = parseISODate(date).getDay();
      for (const s of active) {
        if (s.day_of_week !== dow) continue;
        if (explicit.has(slotKey(date, s.start_time))) continue;
        if (hoursUntil(date, s.start_time) < deadline) continue;
        out.push({
          date,
          time: s.start_time,
          end_time: s.end_time ?? addHours(s.start_time, exp.duration_hours),
          capacity: s.capacity,
          tier_ids: s.tier_ids ?? [],
          source: "recurring",
        });
      }
    }
  }

  out.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  return out;
}

/** Unique sorted list of dates that have at least one departure. */
export function bookableDates(deps: Departure[]): string[] {
  return [...new Set(deps.map((d) => d.date))].sort();
}

/** Departures on a specific date. */
export function departuresOn(deps: Departure[], date: string): Departure[] {
  return deps.filter((d) => d.date === date);
}

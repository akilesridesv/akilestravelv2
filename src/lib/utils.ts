import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUSD(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

// UUIDs so ids are valid Postgres/Supabase primary keys. The prefix arg is kept
// for call-site readability but no longer used.
export function uid(_prefix = "id"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const DAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function dayName(dow: number): string {
  return DAYS_ES[dow] ?? "";
}

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function monthName(m: number): string {
  return MONTHS_ES[m] ?? "";
}

/** Local YYYY-MM-DD (no UTC shift). Used for building calendar grids. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// The whole system operates on El Salvador time (UTC-6, no DST) so bookings and
// future payments never drift by a timezone, regardless of the viewer's device.
export const APP_TIMEZONE = "America/El_Salvador";

/** Today's date (YYYY-MM-DD) in El Salvador time, independent of device TZ. */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(new Date());
}

/** Current time HH:MM in El Salvador time. */
export function nowTimeSV(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

/** {year, monthIndex} of "today" in El Salvador, for initializing calendars. */
export function todayPartsSV(): { y: number; m: number; d: number } {
  const [y, m, d] = todayISO().split("-").map(Number);
  return { y, m: m - 1, d };
}

/** Parse YYYY-MM-DD as a LOCAL date (midnight local), avoiding UTC drift. */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysISO(s: string, days: number): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}
